import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SHOP_APPROVED_NOTIFICATION } from "@/lib/notifications";
import { invoiceApproveSchema } from "@/lib/validators/invoice";
import { approvalDecision, type ExtractionForApproval } from "@/lib/invoice-checks";

/**
 * Thrown inside the approval transaction to roll it back and answer 409.
 * Rolling back matters: the first statement already set approved_run_id.
 */
class ApprovalConflict extends Error {
  constructor(readonly body: { error: string; code: string; reasons?: string[] }) {
    super(body.error);
  }
}

const isTransactionTimeout = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2028";

/**
 * Approves an invoice against the exact extraction run the admin reviewed
 * (KTD6). Body: `{ runId, confirmReviewed? }`. A flagged, failed or unchecked
 * run needs `confirmReviewed: true`, which is recorded against that run.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // A tab opened before the review gate shipped posts no body. Refuse rather
  // than approve a run nobody can say they reviewed.
  const parsed = invoiceApproveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Reload to review this invoice", code: "reload" },
      { status: 409 }
    );
  }
  const { runId, confirmReviewed } = parsed.data;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { extraction: { select: { id: true } } },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (invoice.status === "approved") {
    return NextResponse.json(
      { error: "Invoice already approved", code: "already_approved" },
      { status: 409 }
    );
  }

  if (!invoice.extraction) {
    return NextResponse.json(
      { error: "This invoice has no extraction. Run extraction first.", code: "no_extraction" },
      { status: 409 }
    );
  }

  let confirmationRecorded = false;

  try {
    // Only `tx` inside, and no network calls: the pooler holds a connection
    // for the life of this callback.
    await prisma.$transaction(async (tx) => {
      const now = new Date();

      // 1. Lock the reviewed run. Setting approved_run_id takes the row lock,
      //    so a concurrent claim or edit waits and then misses (or we miss).
      const locked = await tx.invoiceExtraction.updateMany({
        where: {
          invoice_id: id,
          run_id: runId,
          status: { not: "processing" },
          approved_run_id: null,
        },
        data: { approved_run_id: runId },
      });
      if (locked.count === 0) {
        throw new ApprovalConflict({
          error:
            "This invoice changed, is still extracting, or was already approved. Refetch it and review again.",
          code: "stale",
        });
      }

      // 2. Gate on the stored state of the locked row. Never recompute flags.
      const row = await tx.invoiceExtraction.findUnique({
        where: { invoice_id: id },
        select: { status: true, checks_version: true, review_flags: true },
      });
      const decision = approvalDecision(
        row ? (row as unknown as ExtractionForApproval) : null
      );
      if (!decision.approvable) {
        throw new ApprovalConflict({
          error: "This invoice can't be approved yet. Refetch it and review again.",
          code: "stale",
          reasons: decision.reasons,
        });
      }
      if (decision.confirmationRequired && confirmReviewed !== true) {
        throw new ApprovalConflict({
          error: "Confirm you reviewed the original document before approving this invoice.",
          code: "confirmation_required",
          reasons: decision.reasons,
        });
      }

      // 3. Record the confirmation against the run it was given for.
      if (decision.confirmationRequired) {
        await tx.invoiceExtraction.update({
          where: { invoice_id: id },
          data: {
            confirmed_run_id: runId,
            confirmed_at: now,
            confirmed_by: session.userId,
          },
        });
        confirmationRecorded = true;
      }

      // 4. Approve, unless someone else already did. Approving straight from
      //    rejected is still allowed.
      const approved = await tx.invoice.updateMany({
        where: { id, status: { not: "approved" } },
        data: { status: "approved", updated_at: now },
      });
      if (approved.count === 0) {
        throw new ApprovalConflict({ error: "Invoice already approved", code: "already_approved" });
      }

      // 5. Invoices no longer earn points — approval only drives enrollment.
      if (invoice.is_initial) {
        await tx.shop.update({
          where: { id: invoice.shop_id },
          data: { program_status: "approved", updated_at: now },
        });
        // Congratulate the shop on acceptance into the program.
        await tx.notification.create({
          data: { shop_id: invoice.shop_id, ...SHOP_APPROVED_NOTIFICATION },
        });
      }
    });
  } catch (err) {
    if (err instanceof ApprovalConflict) {
      return NextResponse.json(err.body, { status: 409 });
    }
    if (isTransactionTimeout(err)) {
      return NextResponse.json(
        { error: "The database is busy. Try approving again." },
        { status: 503 }
      );
    }
    throw err;
  }

  return NextResponse.json({
    data: {
      invoiceId: id,
      pointsAwarded: 0,
      shopApproved: invoice.is_initial,
      confirmationRecorded,
    },
  });
}
