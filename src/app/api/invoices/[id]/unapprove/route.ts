import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { calculatePoints } from "@/lib/utils";

export async function POST(
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
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (invoice.status !== "approved") {
    return NextResponse.json(
      { error: "Only approved invoices can be unapproved" },
      { status: 400 }
    );
  }

  const pointsDelta = calculatePoints(Number(invoice.amount));

  await prisma.$transaction([
    // Revert invoice status to pending
    prisma.invoice.update({
      where: { id },
      data: { status: "pending", updated_at: new Date() },
    }),

    // Add debit ledger entry to reverse the credit
    prisma.loyaltyLedger.create({
      data: {
        shop_id: invoice.shop_id,
        invoice_id: id,
        points_delta: -pointsDelta,
        type: "debit",
        description: `Invoice #${id.slice(0, 8)} approval reversed`,
      },
    }),

    // Deduct points from shop balance
    prisma.shop.update({
      where: { id: invoice.shop_id },
      data: {
        loyalty_points_balance: { decrement: pointsDelta },
        updated_at: new Date(),
        ...(invoice.is_initial ? { program_status: "pending" } : {}),
      },
    }),
  ]);

  return NextResponse.json({
    data: {
      invoiceId: id,
      pointsReverted: pointsDelta,
      shopReverted: invoice.is_initial,
    },
  });
}
