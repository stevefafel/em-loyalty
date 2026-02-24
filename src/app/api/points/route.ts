import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId =
    req.nextUrl.searchParams.get("shop_id") || session.shopId;

  if (!shopId) {
    return NextResponse.json({ error: "Shop ID required" }, { status: 400 });
  }

  const data = await prisma.loyaltyLedger.findMany({
    where: { shop_id: shopId },
    orderBy: { created_at: "desc" },
  });

  return NextResponse.json({ data });
}
