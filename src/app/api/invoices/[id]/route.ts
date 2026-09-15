import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userFullName } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/server";
import { STORAGE_BUCKETS } from "@/lib/constants";
import { invoiceOverrideSchema } from "@/lib/validators/invoice";
import { canAccessShop } from "@/lib/shop-scope";
import {
  approvalDecision,
  recomputeValueFlags,
  type ExtractionForApproval,
  type ReviewFlag,
} from "@/lib/invoice-checks";

const USER_AND_SHOP = {
  user: { select: { first_name: true, last_name: true } },
  shop: { select: { name: true } },
} as const satisfies Prisma.InvoiceInclude;

const ADMIN_DETAIL = {
  ...USER_AND_SHOP,
  extraction: {
    include: { line_items: { orderBy: { sort_order: "asc" } } },
  },
} as const satisfies Prisma.InvoiceInclude;

type ShopInvoice = Prisma.InvoiceGetPayload<{ include: typeof USER_AND_SHOP }>;
type AdminInvoice = Prisma.InvoiceGetPayload<{ include: typeof ADMIN_DETAIL }>;

/**
 * What a shop user sees (KTD8): an explicit allowlist with no extraction data
 * at all. Even the extracted total would tell an attacker whether an
 * injection worked. New invoice columns stay hidden until added here.
 */
function shopView(inv: ShopInvoice) {
  return {
    id: inv.id,
    shop_id: inv.shop_id,
    user_id: inv.user_id,
    file_path: inv.file_path,
    amount: inv.amount,
    status: inv.status,
    is_initial: inv.is_initial,
    created_at: inv.created_at,
    updated_at: inv.updated_at,
    user: { name: userFullName(inv.user) },
    shop: { name: inv.shop.name },
  };
}

/**
 * The admin review view: the full extraction (warnings, confirmation fields,
 * line items) plus the server's approval decision, which the review screen
 * renders and never re-derives.
 */
function adminView(inv: AdminInvoice) {
  const ex = inv.extraction;
  return {
    ...inv,
    user: { name: userFullName(inv.user) },
    approval: approvalDecision(
      ex
        ? ({
            status: ex.status,
            checks_version: ex.checks_version,
            review_flags: ex.review_flags,
          } as unknown as ExtractionForApproval)
        : null
    ),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (session.role === "admin") {
    const data = await prisma.invoice.findUnique({ where: { id }, include: ADMIN_DETAIL });
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: adminView(data) });
  }

  // A shop user's query never loads the extraction.
  const data = await prisma.invoice.findUnique({ where: { id }, include: USER_AND_SHOP });

  // Another shop's invoice is 404, never 403: the response must not confirm
  // that an id exists. Same rule the support routes use.
  if (!data || !canAccessShop(session, data.shop_id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: shopView(data) });
}

/** Thrown inside the PATCH transaction to roll it back and answer 409. */
class EditConflict extends Error {
  constructor(readonly body: { error: string; code: string }) {
    super(body.error);
  }
}

const STALE_EDIT = {
  error: "This invoice is extracting or changed since you opened it. Reload and try again.",
  code: "stale",
};
const APPROVED_EDIT = {
  error: "Approved invoices can't be edited. Unapprove it first.",
  code: "approved",
};

const isTransactionTimeout = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2028";

/** A stored Decimal (or a number from the request) as dollars, or null. */
function dollars(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Admin manual override of AI-extracted values and the authoritative invoice
 * amount during review. Only provided keys are written. The extraction row is
 * created (status "completed", checks_version null) if it doesn't exist yet, so
 * an admin can fill in values even when extraction never ran or failed.
 *
 * Approved invoices can't be edited (409). Every other edit starts a new run
 * (KTD9): it rotates run_id, recomputes the value warnings and voids any
 * confirmation, so a review opened before the edit can no longer approve.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = invoiceOverrideSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // R13: approved values are final until the invoice is unapproved.
  if (invoice.status === "approved") {
    return NextResponse.json(APPROVED_EDIT, { status: 409 });
  }

  const { amount, extraction } = parsed.data;

  // Build the extraction patch from only the keys the admin actually sent.
  const ex = extraction ?? {};
  const extractionData: Record<string, unknown> = {};
  if ("vendor_name" in ex) extractionData.vendor_name = ex.vendor_name;
  if ("invoice_number" in ex) extractionData.invoice_number = ex.invoice_number;
  if ("invoice_date" in ex) {
    // Store date-only at UTC midnight so it round-trips without a tz shift.
    extractionData.invoice_date = ex.invoice_date
      ? new Date(`${ex.invoice_date}T00:00:00.000Z`)
      : null;
  }
  if ("subtotal" in ex) extractionData.subtotal = ex.subtotal;
  if ("tax_amount" in ex) extractionData.tax_amount = ex.tax_amount;
  if ("total_amount" in ex) extractionData.total_amount = ex.total_amount;
  const editsExtraction = Object.keys(extractionData).length > 0;

  if (amount !== undefined || editsExtraction) {
    try {
      await prisma.$transaction(async (tx) => {
        const now = new Date();
        const typedAmount = amount ?? dollars(invoice.amount);
        const stored = await tx.invoiceExtraction.findUnique({
          where: { invoice_id: id },
          include: { line_items: { select: { amount: true } } },
        });

        // Extraction row first, then the invoice: the approve route's lock order.
        if (stored) {
          if (stored.status === "processing") throw new EditConflict(STALE_EDIT);

          // KTD9: any edit, amount-only included, starts a new run so an open
          // review goes stale and any confirmation is void. Value warnings
          // are recomputed from the edited values and stored line items; the
          // stored scan, model and labelled-total warnings are kept, since the
          // document text isn't stored.
          const pick = (key: "total_amount" | "subtotal" | "tax_amount") =>
            dollars(key in extractionData ? extractionData[key] : stored[key]);
          const flagsReadable = Array.isArray(stored.review_flags);
          const reviewFlags = recomputeValueFlags(
            flagsReadable ? (stored.review_flags as unknown as ReviewFlag[]) : [],
            {
              aiTotal: pick("total_amount"),
              aiSubtotal: pick("subtotal"),
              aiTax: pick("tax_amount"),
              lineItemAmounts: stored.line_items.map((li) => dollars(li.amount)),
              typedAmount,
            }
          );

          // Conditioned on the run these flags were computed from, so a claim
          // or completed re-run in between makes this miss instead of
          // overwriting the newer run's warnings.
          const updated = await tx.invoiceExtraction.updateMany({
            where: {
              invoice_id: id,
              run_id: stored.run_id,
              approved_run_id: null,
              status: { not: "processing" },
            },
            data: {
              ...extractionData,
              run_id: randomUUID(),
              review_flags: reviewFlags as unknown as Prisma.InputJsonValue,
              // Unreadable stored flags can't be kept, so the run no longer
              // counts as checked.
              ...(flagsReadable ? {} : { checks_version: null }),
              confirmed_run_id: null,
              confirmed_at: null,
              confirmed_by: null,
              updated_at: now,
            },
          });
          if (updated.count === 0) throw new EditConflict(STALE_EDIT);
        } else if (editsExtraction) {
          // No run yet: the admin fills the values in by hand. checks_version
          // stays null, so approving it needs a confirmation. Skip-duplicates
          // insert: a count of 0 means a claim created the row first, and
          // nothing throws a unique violation inside the transaction.
          const reviewFlags = recomputeValueFlags([], {
            aiTotal: dollars(extractionData.total_amount),
            aiSubtotal: dollars(extractionData.subtotal),
            aiTax: dollars(extractionData.tax_amount),
            lineItemAmounts: [],
            typedAmount,
          });
          const created = await tx.invoiceExtraction.createMany({
            data: {
              ...extractionData,
              invoice_id: id,
              status: "completed",
              run_id: randomUUID(),
              review_flags: reviewFlags as unknown as Prisma.InputJsonValue,
            },
            skipDuplicates: true,
          });
          if (created.count === 0) throw new EditConflict(STALE_EDIT);
        }

        if (amount !== undefined) {
          const updated = await tx.invoice.updateMany({
            where: { id, status: { not: "approved" } },
            data: { amount, updated_at: now },
          });
          if (updated.count === 0) throw new EditConflict(APPROVED_EDIT);
        }
      });
    } catch (err) {
      if (err instanceof EditConflict) {
        return NextResponse.json(err.body, { status: 409 });
      }
      if (isTransactionTimeout(err)) {
        return NextResponse.json(
          { error: "The database is busy. Try saving again." },
          { status: 503 }
        );
      }
      throw err;
    }
  }

  const data = await prisma.invoice.findUnique({ where: { id }, include: ADMIN_DETAIL });

  return NextResponse.json({ data: data ? adminView(data) : null });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({ where: { id } });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Invoices no longer earn points, but legacy approvals credited them.
  // Reverse the net amount actually recorded in the ledger for this invoice
  // (zero for invoices approved after the program change).
  const credited = await prisma.loyaltyLedger.aggregate({
    where: { invoice_id: id },
    _sum: { points_delta: true },
  });
  const pointsReverted = credited._sum.points_delta ?? 0;

  await prisma.$transaction(async (tx) => {
    // The ledger keeps the original credit entry (invoice_id nulls out on
    // delete) plus this debit as the audit trail.
    if (pointsReverted !== 0) {
      await tx.loyaltyLedger.create({
        data: {
          shop_id: invoice.shop_id,
          points_delta: -pointsReverted,
          type: pointsReverted > 0 ? "debit" : "credit",
          description: `Invoice #${id.slice(0, 8)} deleted (approval reversed)`,
        },
      });
      await tx.shop.update({
        where: { id: invoice.shop_id },
        data: {
          loyalty_points_balance: { decrement: pointsReverted },
          updated_at: new Date(),
        },
      });
    }

    // Extraction + line items cascade; ledger entries keep their history.
    await tx.invoice.delete({ where: { id } });

    // Enrollment is driven by the initial invoice, so deleting one recomputes
    // the shop's program status from whatever initial invoices remain.
    if (invoice.is_initial) {
      const remaining = await tx.invoice.findMany({
        where: { shop_id: invoice.shop_id, is_initial: true },
        select: { status: true },
      });
      const nextStatus = remaining.some((i) => i.status === "approved")
        ? "approved"
        : remaining.some((i) => i.status === "pending")
          ? "pending"
          : "new";
      await tx.shop.update({
        where: { id: invoice.shop_id },
        data: { program_status: nextStatus, updated_at: new Date() },
      });
    }
  });

  // Best-effort file cleanup — the DB row is already gone, so a storage
  // failure shouldn't fail the request.
  if (invoice.file_path) {
    try {
      const supabase = createAdminClient();
      await supabase.storage
        .from(STORAGE_BUCKETS.INVOICES)
        .remove([invoice.file_path]);
    } catch (err) {
      console.error("Failed to remove file for deleted invoice", id, err);
    }
  }

  return NextResponse.json({ data: { invoiceId: id, pointsReverted } });
}
