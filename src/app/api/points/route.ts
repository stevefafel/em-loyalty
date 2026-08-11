import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { shopFilterFor } from "@/lib/shop-scope";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The query param used to be the first operand of a `||`, so it outranked
  // the session for every role — any authenticated caller could read any
  // shop's ledger by naming it. The session now decides, and the param only
  // narrows an admin.
  const where = shopFilterFor(session, req.nextUrl.searchParams.get("shop_id"));
  if (!where) {
    return NextResponse.json({ data: [] });
  }
  if (!where.shop_id) {
    // The ledger is per-shop; an unfiltered read is not a meaningful response.
    return NextResponse.json({ error: "Shop ID required" }, { status: 400 });
  }

  const data = await prisma.loyaltyLedger.findMany({
    where,
    orderBy: { created_at: "desc" },
  });

  return NextResponse.json({ data });
}
