import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

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

  if (invoice.status !== "rejected") {
    return NextResponse.json(
      { error: "Only rejected invoices can be moved back to pending" },
      { status: 400 }
    );
  }

  await prisma.invoice.update({
    where: { id },
    data: { status: "pending", updated_at: new Date() },
  });

  return NextResponse.json({
    data: { invoiceId: id, status: "pending" },
  });
}
