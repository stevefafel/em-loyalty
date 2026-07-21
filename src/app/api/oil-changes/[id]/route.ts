import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { POINTS_PER_OIL_CHANGE } from "@/lib/constants";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const entry = await prisma.oilChangeCount.findUnique({ where: { id } });
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pointsDelta = entry.count * POINTS_PER_OIL_CHANGE;
  const dateLabel = entry.date.toISOString().slice(0, 10);

  await prisma.$transaction([
    prisma.oilChangeCount.delete({ where: { id } }),

    ...(pointsDelta !== 0
      ? [
          prisma.loyaltyLedger.create({
            data: {
              shop_id: entry.shop_id,
              points_delta: -pointsDelta,
              type: "debit",
              description: `Oil changes on ${dateLabel} removed (-${entry.count})`,
            },
          }),
          prisma.shop.update({
            where: { id: entry.shop_id },
            data: {
              loyalty_points_balance: { decrement: pointsDelta },
              updated_at: new Date(),
            },
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ ok: true });
}
