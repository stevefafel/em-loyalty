import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { POINTS_PER_OIL_CHANGE } from "@/lib/constants";
import { reconcilePegasusAwards } from "@/lib/pegasus-awards";
import { shopFilterFor } from "@/lib/shop-scope";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Same fail-open guard the invoices list carried: testing session.shopId for
  // truthiness let a user with no shop fall through to the client-supplied
  // shop_id — and the reconcile below is a write, so that fallthrough handed an
  // attacker a write trigger on any shop they named.
  const where = shopFilterFor(session, req.nextUrl.searchParams.get("shop_id"));
  if (!where) {
    return NextResponse.json({ data: [] });
  }

  // Viewing a single shop's data is also a reconcile point, so a bonus that
  // became due at a month rollover (with no data writes since) still lands.
  if (where.shop_id) {
    try {
      await reconcilePegasusAwards(where.shop_id);
    } catch (err) {
      console.error("Pegasus reconcile failed for shop", where.shop_id, err);
    }
  }

  const data = await prisma.oilChangeCount.findMany({
    where,
    orderBy: { date: "desc" },
  });

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { shopId, date, count } = body;

  if (!shopId || !date || count === undefined || count === null) {
    return NextResponse.json(
      { error: "Missing required fields: shopId, date, count" },
      { status: 400 }
    );
  }

  const countNum = Number(count);
  if (!Number.isInteger(countNum) || countNum < 0) {
    return NextResponse.json(
      { error: "Count must be a non-negative integer" },
      { status: 400 }
    );
  }

  const dateOnly = new Date(`${date}T00:00:00Z`);
  if (isNaN(dateOnly.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  // Upserts overwrite a day's count, so points adjust by the difference
  // between the new count and whatever was already recorded for that day.
  const existing = await prisma.oilChangeCount.findUnique({
    where: { shop_id_date: { shop_id: shopId, date: dateOnly } },
    select: { count: true },
  });
  const countDelta = countNum - (existing?.count ?? 0);
  const pointsDelta = countDelta * POINTS_PER_OIL_CHANGE;

  const [entry] = await prisma.$transaction([
    prisma.oilChangeCount.upsert({
      where: { shop_id_date: { shop_id: shopId, date: dateOnly } },
      create: { shop_id: shopId, date: dateOnly, count: countNum },
      update: { count: countNum, updated_at: new Date() },
    }),

    ...(pointsDelta !== 0
      ? [
          prisma.loyaltyLedger.create({
            data: {
              shop_id: shopId,
              points_delta: pointsDelta,
              type: pointsDelta > 0 ? "credit" : "debit",
              description: `Oil changes on ${date} (${
                countDelta > 0 ? "+" : ""
              }${countDelta})`,
            },
          }),
          prisma.shop.update({
            where: { id: shopId },
            data: {
              loyalty_points_balance: { increment: pointsDelta },
              updated_at: new Date(),
            },
          }),
        ]
      : []),
  ]);

  // The count change may start, extend, or break a Pegasus streak. The write
  // above already committed, so a reconcile failure shouldn't fail the
  // request — the next write or view of this shop's data will heal it.
  try {
    await reconcilePegasusAwards(shopId);
  } catch (err) {
    console.error("Pegasus reconcile failed for shop", shopId, err);
  }

  return NextResponse.json({ data: entry });
}
