import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PEGASUS_THRESHOLD } from "@/lib/pegasus";
import {
  ATTENTION_POINTS_THRESHOLD,
  ATTENTION_STREAK_MONTHS,
} from "@/lib/constants";

/**
 * Shops needing admin attention:
 *  - points balance above ATTENTION_POINTS_THRESHOLD, or
 *  - PEGASUS_THRESHOLD+ oil changes in each of the previous
 *    ATTENTION_STREAK_MONTHS full calendar months (current month excluded).
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // Oldest first: e.g. on July 15 → April, May, June
  const monthStarts = Array.from({ length: ATTENTION_STREAK_MONTHS }, (_, i) =>
    new Date(
      Date.UTC(
        now.getFullYear(),
        now.getMonth() - (ATTENTION_STREAK_MONTHS - i),
        1
      )
    )
  );
  const currentMonthStart = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), 1)
  );

  const [shops, oilChanges] = await Promise.all([
    prisma.shop.findMany({
      select: {
        id: true,
        name: true,
        program_status: true,
        loyalty_points_balance: true,
      },
    }),
    prisma.oilChangeCount.findMany({
      where: { date: { gte: monthStarts[0], lt: currentMonthStart } },
      select: { shop_id: true, date: true, count: true },
    }),
  ]);

  const monthKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  const totals = new Map<string, number>();
  for (const entry of oilChanges) {
    const key = `${entry.shop_id}|${monthKey(entry.date)}`;
    totals.set(key, (totals.get(key) ?? 0) + entry.count);
  }

  const data = shops
    .map((shop) => {
      const monthlyCounts = monthStarts.map(
        (m) => totals.get(`${shop.id}|${monthKey(m)}`) ?? 0
      );
      const reasons: string[] = [];
      if (shop.loyalty_points_balance > ATTENTION_POINTS_THRESHOLD) {
        reasons.push("high_balance");
      }
      if (monthlyCounts.every((c) => c >= PEGASUS_THRESHOLD)) {
        reasons.push("oil_change_streak");
      }
      return { ...shop, monthlyCounts, reasons };
    })
    .filter((shop) => shop.reasons.length > 0)
    .sort((a, b) => b.loyalty_points_balance - a.loyalty_points_balance);

  return NextResponse.json({
    data: {
      months: monthStarts.map((m) =>
        m.toLocaleDateString("en-US", {
          month: "short",
          timeZone: "UTC",
          ...(m.getUTCFullYear() !== now.getFullYear()
            ? { year: "numeric" }
            : {}),
        })
      ),
      shops: data,
    },
  });
}
