import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/server";
import { extractInvoiceData, InvoiceExtractionError } from "@/lib/ai/extract-invoice";
import { invoiceExtractionResponseSchema } from "@/lib/validators/invoice-extraction";
import { STORAGE_BUCKETS } from "@/lib/constants";
import { canAccessShop } from "@/lib/shop-scope";
import { isValidInvoiceFilePath } from "@/lib/invoice-file-path";
import { scanPdf } from "@/lib/invoice-text-scan";
import {
  CHECKS_VERSION,
  computeReviewFlags,
  detectFileType,
  type InvoiceFileType,
  type PdfScanResult,
} from "@/lib/invoice-checks";

// Room for the PDF scan to run alongside the AI call (KTD7).
export const maxDuration = 60;

/**
 * A processing row older than this (by the database clock) belongs to a run
 * that can no longer be alive, so it may be reclaimed (KTD7).
 */
const STALE_AFTER_SECONDS = 2 * maxDuration;

const MIME_BY_TYPE: Record<InvoiceFileType, "application/pdf" | "image/png" | "image/jpeg"> = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
};

/**
 * Error codes stored in `error_message` for a failed run. Never provider or
 * document text (KTD11): the admin UI shows these, and they reach logs.
 */
type FailureCode =
  | InvoiceExtractionError["code"]
  | "invalid_file_path"
  | "download_failed"
  | "unsupported_type"
  | "extraction_failed";

/** Thrown inside the success transaction when a newer claim owns the row. */
class RunSuperseded extends Error {
  constructor() {
    super("Extraction run superseded");
    this.name = "RunSuperseded";
  }
}

const notFound = () => NextResponse.json({ error: "Invoice not found" }, { status: 404 });
const alreadyRunning = () =>
  NextResponse.json({ error: "Extraction already running" }, { status: 409 });
const superseded = () =>
  NextResponse.json(
    { error: "A newer extraction run replaced this one; its result was discarded" },
    { status: 409 }
  );

/** A printed YYYY-MM-DD date, or null for anything else (never an Invalid Date). */
function parseInvoiceDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

/**
 * Runs one extraction: claim the row with a fresh run token, check the file,
 * call the model and the PDF scan on the same bytes, and store the result only
 * if the token is still current (KTD7).
 *
 * Shop users may start the first run on their own pending invoice (or reclaim
 * a stale one), and only ever get `{ status }` back (KTD8). Admins may re-run
 * any pending, not-yet-approved invoice. Nobody re-runs approved or rejected
 * invoices.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const isAdmin = session.role === "admin";

  // Scope before any mutation. Another shop's invoice is 404, never 403: the id
  // stays unconfirmed.
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { extraction: { select: { id: true, status: true, approved_run_id: true } } },
  });
  if (!invoice || !canAccessShop(session, invoice.shop_id)) return notFound();

  const existing = invoice.extraction;

  // Role limits (KTD7). The claim below re-checks all of this in the database.
  if (isAdmin) {
    if (invoice.status !== "pending") {
      return NextResponse.json(
        { error: "Only a pending invoice can be extracted" },
        { status: 409 }
      );
    }
    if (existing?.approved_run_id) {
      return NextResponse.json({ error: "Invoice is already approved" }, { status: 409 });
    }
  } else if (invoice.status !== "pending" || (existing && existing.status !== "processing")) {
    // A shop may start the first run, or retry one that died, never re-roll a result.
    return notFound();
  }

  // --- Claim (KTD7) ---------------------------------------------------------
  // A fresh token for this run. Every later write for the run is conditioned on
  // it, so a newer claim makes this run's result land nowhere.
  const token = randomUUID();
  const extractionId = existing?.id ?? randomUUID();

  if (!existing) {
    // Insert-or-nothing: a count of 0 means another request created the row
    // first. No unique-violation to catch.
    const { count } = await prisma.invoiceExtraction.createMany({
      data: [{ id: extractionId, invoice_id: id, status: "processing", run_id: token }],
      skipDuplicates: true,
    });
    if (count === 0) return alreadyRunning();
  } else {
    // One conditional write, measured by the database clock. Voids the previous
    // run's checks marker and confirmation. Its values, line items and
    // review_flags stay until this run succeeds (the success write replaces
    // them together), so a run that fails still shows the prior warnings beside
    // the prior values; a non-completed row needs confirmation regardless.
    // Shop callers (allowRerun false) can only take over a stale processing row.
    const allowRerun = isAdmin;
    const claimed = await prisma.$executeRaw`
      UPDATE invoice_extractions
         SET run_id = ${token}::uuid,
             status = 'processing',
             checks_version = NULL,
             content_sha256 = NULL,
             confirmed_run_id = NULL,
             confirmed_at = NULL,
             confirmed_by = NULL,
             error_message = NULL,
             updated_at = now()
       WHERE id = ${extractionId}::uuid
         AND approved_run_id IS NULL
         AND (
               (status = 'processing'
                AND updated_at < now() - make_interval(secs => ${STALE_AFTER_SECONDS}::double precision))
            OR (${allowRerun}::boolean AND status <> 'processing')
             )
         AND EXISTS (
               SELECT 1 FROM invoices
                WHERE invoices.id = invoice_extractions.invoice_id
                  AND invoices.status = 'pending'
             )`;
    if (claimed === 0) return alreadyRunning();
  }

  const respond = async (status: "completed" | "failed") => {
    if (!isAdmin) return NextResponse.json({ data: { status } });
    const full = await prisma.invoiceExtraction.findUnique({
      where: { id: extractionId },
      include: { line_items: { orderBy: { sort_order: "asc" } } },
    });
    return NextResponse.json({ data: full });
  };

  /** Stores a failure under this run's token; false when a newer run owns the row. */
  const recordFailure = async (code: FailureCode): Promise<boolean> => {
    const { count } = await prisma.invoiceExtraction.updateMany({
      where: { id: extractionId, run_id: token, status: "processing" },
      data: { status: "failed", error_message: code, updated_at: new Date() },
    });
    return count > 0;
  };

  const fail = async (code: FailureCode) => {
    // Only the code is logged: never document text, provider output or raw_response.
    console.error("Invoice extraction failed", { invoiceId: id, code });
    return (await recordFailure(code)) ? respond("failed") : superseded();
  };

  // The typed amount for the review flags is read again now that the claim
  // holds: an amount edit that committed after the first read would otherwise
  // leave this run's amount_mismatch computed from a stale amount. From here
  // on, PATCH refuses to change the amount while the run is processing.
  const current = await prisma.invoice.findUnique({
    where: { id },
    select: { amount: true },
  });
  if (!current) return fail("extraction_failed");
  const typedAmount = Number(current.amount);

  // --- File (KTD10) ---------------------------------------------------------
  if (!isValidInvoiceFilePath(invoice.shop_id, invoice.file_path)) {
    return fail("invalid_file_path");
  }

  let bytes: Uint8Array;
  try {
    const supabase = createAdminClient();
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(STORAGE_BUCKETS.INVOICES)
      .download(invoice.file_path);
    if (downloadError || !fileData) return fail("download_failed");
    bytes = new Uint8Array(await fileData.arrayBuffer());
  } catch {
    return fail("download_failed");
  }

  // One set of bytes: the type comes from the signature, never the name, and
  // the hash, the scan and the model all see these exact bytes (KTD7). The
  // scan gets a plain Uint8Array (pdf.js rejects a Node Buffer and would report
  // a parse error); the model gets a Buffer view over the same memory.
  const fileType = detectFileType(bytes);
  if (!fileType) return fail("unsupported_type");
  const contentSha256 = createHash("sha256").update(bytes).digest("hex");
  const modelBuffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // --- Checks (KTD3, KTD4) --------------------------------------------------
  // The scan runs while the AI call is in flight. A scan that throws counts as
  // "not scanned", never clean.
  const scanning: Promise<PdfScanResult | null> =
    fileType === "pdf"
      ? scanPdf(bytes).catch((): PdfScanResult => ({ status: "not_scanned", reason: "parse_error" }))
      : Promise.resolve(null);

  let raw: unknown;
  let scan: PdfScanResult | null;
  try {
    [raw, scan] = await Promise.all([
      extractInvoiceData(modelBuffer, MIME_BY_TYPE[fileType]),
      scanning,
    ]);
  } catch (error) {
    return fail(error instanceof InvoiceExtractionError ? error.code : "extraction_failed");
  }

  const parsed = invoiceExtractionResponseSchema.safeParse(raw);
  if (!parsed.success) return fail("invalid_response");
  const result = parsed.data;

  const reviewFlags = computeReviewFlags({
    aiTotal: result.total_amount,
    aiSubtotal: result.subtotal,
    aiTax: result.tax_amount,
    lineItemAmounts: result.line_items.map((item) => item.amount),
    typedAmount,
    fileType,
    scan,
    modelReport: result.instructions_detected,
  });

  // --- Persist (KTD7) -------------------------------------------------------
  // One interactive transaction behind the token condition. Only `tx` inside,
  // and nothing that touches the network.
  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.invoiceExtraction.updateMany({
        where: { id: extractionId, run_id: token, status: "processing" },
        data: {
          status: "completed",
          error_message: null,
          vendor_name: result.vendor_name,
          invoice_number: result.invoice_number,
          invoice_date: parseInvoiceDate(result.invoice_date),
          subtotal: result.subtotal,
          tax_amount: result.tax_amount,
          total_amount: result.total_amount,
          currency: result.currency || "USD",
          raw_response: result as unknown as Prisma.InputJsonValue,
          checks_version: CHECKS_VERSION,
          review_flags: reviewFlags as unknown as Prisma.InputJsonValue,
          content_sha256: contentSha256,
          updated_at: new Date(),
        },
      });
      // A newer claim took over: roll back and discard this run's result.
      if (count === 0) throw new RunSuperseded();

      await tx.invoiceLineItem.deleteMany({ where: { extraction_id: extractionId } });
      if (result.line_items.length > 0) {
        await tx.invoiceLineItem.createMany({
          data: result.line_items.map((item, index) => ({
            extraction_id: extractionId,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            amount: item.amount,
            sort_order: index,
          })),
        });
      }
    });
  } catch (error) {
    if (error instanceof RunSuperseded) return superseded();
    return fail("extraction_failed");
  }

  return respond("completed");
}
