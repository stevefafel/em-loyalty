import { prisma } from "@/lib/prisma";
import { computePegasusBonusMonths, PEGASUS_MONTHLY_BONUS } from "@/lib/pegasus";

const monthLabel = (m: Date) =>
  m.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * Bring a shop's Pegasus bonuses in line with its oil-change data: credit
 * 10 points for each newly qualifying month, claw back months that no longer
 * qualify after a data correction. Idempotent — safe to call on every
 * oil-change write (and cheap when nothing changed).
 */
export async function reconcilePegasusAwards(shopId: string, now = new Date()) {
  const [entries, existing] = await Promise.all([
    prisma.oilChangeCount.findMany({
      where: { shop_id: shopId },
      select: { date: true, count: true },
    }),
    prisma.pegasusAward.findMany({ where: { shop_id: shopId } }),
  ]);

  const due = computePegasusBonusMonths(entries, now);
  const dueKeys = new Set(due.map((m) => m.getTime()));
  const existingKeys = new Set(existing.map((a) => a.month.getTime()));

  const toAdd = due.filter((m) => !existingKeys.has(m.getTime()));
  const toRemove = existing.filter((a) => !dueKeys.has(a.month.getTime()));
  if (toAdd.length === 0 && toRemove.length === 0) {
    return { credited: 0, reversed: 0 };
  }

  const netDelta = (toAdd.length - toRemove.length) * PEGASUS_MONTHLY_BONUS;

  await prisma.$transaction([
    ...toAdd.map((m) =>
      prisma.pegasusAward.create({ data: { shop_id: shopId, month: m } })
    ),
    ...toAdd.map((m) =>
      prisma.loyaltyLedger.create({
        data: {
          shop_id: shopId,
          points_delta: PEGASUS_MONTHLY_BONUS,
          type: "credit",
          description: `Pegasus bonus: ${monthLabel(m)}`,
        },
      })
    ),
    ...toRemove.map((a) =>
      prisma.pegasusAward.delete({ where: { id: a.id } })
    ),
    ...toRemove.map((a) =>
      prisma.loyaltyLedger.create({
        data: {
          shop_id: shopId,
          points_delta: -PEGASUS_MONTHLY_BONUS,
          type: "debit",
          description: `Pegasus bonus reversed: ${monthLabel(a.month)}`,
        },
      })
    ),
    ...(netDelta !== 0
      ? [
          prisma.shop.update({
            where: { id: shopId },
            data: {
              loyalty_points_balance: { increment: netDelta },
              updated_at: new Date(),
            },
          }),
        ]
      : []),
  ]);

  return { credited: toAdd.length, reversed: toRemove.length };
}
