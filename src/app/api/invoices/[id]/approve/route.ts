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

  // 1. Get the invoice
  const invoice = await prisma.invoice.findUnique({ where: { id } });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (invoice.status === "approved") {
    return NextResponse.json(
      { error: "Invoice already approved" },
      { status: 400 }
    );
  }

  // 2. Calculate points
  const pointsDelta = calculatePoints(Number(invoice.amount));

  // 3. Run all updates in a transaction
  await prisma.$transaction([
    // Update invoice status
    prisma.invoice.update({
      where: { id },
      data: { status: "approved", updated_at: new Date() },
    }),

    // Insert ledger entry
    prisma.loyaltyLedger.create({
      data: {
        shop_id: invoice.shop_id,
        invoice_id: id,
        points_delta: pointsDelta,
        type: "credit",
        description: invoice.is_initial
          ? "Initial qualifying invoice approved"
          : `Invoice #${id.slice(0, 8)} approved`,
      },
    }),

    // Update shop points balance (and status if initial)
    prisma.shop.update({
      where: { id: invoice.shop_id },
      data: {
        loyalty_points_balance: { increment: pointsDelta },
        updated_at: new Date(),
        ...(invoice.is_initial ? { program_status: "approved" } : {}),
      },
    }),
  ]);

  return NextResponse.json({
    data: {
      invoiceId: id,
      pointsAwarded: pointsDelta,
      shopApproved: invoice.is_initial,
    },
  });
}
