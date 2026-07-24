import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SHOP_APPROVED_NOTIFICATION } from "@/lib/notifications";

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

  // Invoices no longer earn points — approval only drives enrollment.
  await prisma.$transaction([
    prisma.invoice.update({
      where: { id },
      data: { status: "approved", updated_at: new Date() },
    }),

    ...(invoice.is_initial
      ? [
          prisma.shop.update({
            where: { id: invoice.shop_id },
            data: { program_status: "approved", updated_at: new Date() },
          }),
          // Congratulate the shop on acceptance into the program.
          prisma.notification.create({
            data: {
              shop_id: invoice.shop_id,
              ...SHOP_APPROVED_NOTIFICATION,
            },
          }),
        ]
      : []),
  ]);

  return NextResponse.json({
    data: {
      invoiceId: id,
      pointsAwarded: 0,
      shopApproved: invoice.is_initial,
    },
  });
}
