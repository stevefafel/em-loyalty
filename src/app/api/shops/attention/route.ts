import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PEGASUS_THRESHOLD } from "@/lib/pegasus";
import {
  ATTENTION_POINTS_THRESHOLD,
  ATTENTION_STREAK_MONTHS,
} from "@/lib/constants";
import {
  awaitingAdminResponseQuery,
  shopIdsAwaitingAdminResponse,
} from "@/lib/support";

/**
 * Shops needing admin attention:
 *  - awaiting program approval (initial invoice uploaded, status "pending"), or
 *  - points balance above ATTENTION_POINTS_THRESHOLD, or
 *  - PEGASUS_THRESHOLD+ oil changes in each of the previous
 *    ATTENTION_STREAK_MONTHS full calendar months (current month excluded), or
 *  - approved into the program but never sent a welcome packet, or
 *  - an open support conversation waiting on an admin reply (R11).
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

  const [shops, oilChanges, conversations] = await Promise.all([
    prisma.shop.findMany({
      select: {
        id: true,
        name: true,
        program_status: true,
        loyalty_points_balance: true,
        sent_welcome_packet_at: true,
      },
    }),
    prisma.oilChangeCount.findMany({
      where: { date: { gte: monthStarts[0], lt: currentMonthStart } },
      select: { shop_id: true, date: true, count: true },
    }),
    // Isolated: support is the newest and least critical reason here. Sharing
    // a Promise.all rejection with the shop and oil-change queries would let a
    // support failure blank the whole attention list, taking program approvals
    // — which run on a 24-business-hour clock — down with it.
    prisma.supportConversation
      .findMany(awaitingAdminResponseQuery)
      .catch(() => []),
  ]);

  // One shop with two waiting threads earns the reason once, not twice.
  const awaitingSupport = shopIdsAwaitingAdminResponse(conversations);

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
      if (shop.program_status === "pending") {
        reasons.push("awaiting_approval");
      }
      if (shop.loyalty_points_balance > ATTENTION_POINTS_THRESHOLD) {
        reasons.push("high_balance");
      }
      if (monthlyCounts.every((c) => c >= PEGASUS_THRESHOLD)) {
        reasons.push("oil_change_streak");
      }
      if (shop.program_status === "approved" && !shop.sent_welcome_packet_at) {
        reasons.push("no_welcome_packet");
      }
      if (awaitingSupport.has(shop.id)) {
        reasons.push("open_support_request");
      }
      return { ...shop, monthlyCounts, reasons };
    })
    .filter((shop) => shop.reasons.length > 0)
    .sort((a, b) => {
      // Shops awaiting program approval are on a 24-business-hour clock — float
      // them to the top, then order the rest by points balance.
      const aAwait = a.reasons.includes("awaiting_approval") ? 1 : 0;
      const bAwait = b.reasons.includes("awaiting_approval") ? 1 : 0;
      if (aAwait !== bAwait) return bAwait - aAwait;
      return b.loyalty_points_balance - a.loyalty_points_balance;
    });

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
