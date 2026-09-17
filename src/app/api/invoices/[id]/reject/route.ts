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

  if (invoice.status !== "pending") {
    return NextResponse.json(
      { error: "Only pending invoices can be rejected" },
      { status: 400 }
    );
  }

  // Conditional on still being pending: an approval that commits between the
  // read above and this write must not be overwritten. Rejecting an approved
  // invoice would leave its extraction locked (approved_run_id set) with no
  // route able to approve, edit, re-extract or unapprove it again.
  const updated = await prisma.invoice.updateMany({
    where: { id, status: "pending" },
    data: { status: "rejected", updated_at: new Date() },
  });

  if (updated.count === 0) {
    return NextResponse.json(
      { error: "Invoice is no longer pending. Refresh and try again." },
      { status: 409 }
    );
  }

  return NextResponse.json({
    data: { invoiceId: id, status: "rejected" },
  });
}
