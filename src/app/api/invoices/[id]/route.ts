import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userFullName } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/server";
import { STORAGE_BUCKETS } from "@/lib/constants";
import { invoiceOverrideSchema } from "@/lib/validators/invoice";
import { canAccessShop } from "@/lib/shop-scope";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const data = await prisma.invoice.findUnique({
    where: { id },
    include: {
      user: { select: { first_name: true, last_name: true } },
      shop: { select: { name: true } },
      extraction: {
        include: {
          line_items: { orderBy: { sort_order: "asc" } },
        },
      },
    },
  });

  // Another shop's invoice is 404, never 403: the response must not confirm
  // that an id exists. Same rule the support routes use.
  if (!data || !canAccessShop(session, data.shop_id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Preserve the existing response shape (user.name) for frontend consumers.
  return NextResponse.json({
    data: { ...data, user: { name: userFullName(data.user) } },
  });
}

/**
 * Admin manual override of AI-extracted values and the authoritative invoice
 * amount during review. Only provided keys are written. The extraction row is
 * created (status "completed") if it doesn't exist yet, so an admin can fill in
 * values even when extraction never ran or failed.
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

  await prisma.$transaction(async (tx) => {
    if (amount !== undefined) {
      await tx.invoice.update({
        where: { id },
        data: { amount, updated_at: new Date() },
      });
    }

    if (Object.keys(extractionData).length > 0) {
      await tx.invoiceExtraction.upsert({
        where: { invoice_id: id },
        update: { ...extractionData, updated_at: new Date() },
        create: { invoice_id: id, status: "completed", ...extractionData },
      });
    }
  });

  const data = await prisma.invoice.findUnique({
    where: { id },
    include: {
      user: { select: { first_name: true, last_name: true } },
      shop: { select: { name: true } },
      extraction: {
        include: { line_items: { orderBy: { sort_order: "asc" } } },
      },
    },
  });

  return NextResponse.json({
    data: data ? { ...data, user: { name: userFullName(data.user) } } : null,
  });
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
