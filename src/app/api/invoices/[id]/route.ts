import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userFullName } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/server";
import { STORAGE_BUCKETS } from "@/lib/constants";

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

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Preserve the existing response shape (user.name) for frontend consumers.
  return NextResponse.json({
    data: { ...data, user: { name: userFullName(data.user) } },
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
