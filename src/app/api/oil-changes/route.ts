import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = req.nextUrl.searchParams.get("shop_id");

  const where: { shop_id?: string } = {};
  if (session.role === "user" && session.shopId) {
    where.shop_id = session.shopId;
  } else if (shopId) {
    where.shop_id = shopId;
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

  const entry = await prisma.oilChangeCount.upsert({
    where: { shop_id_date: { shop_id: shopId, date: dateOnly } },
    create: { shop_id: shopId, date: dateOnly, count: countNum },
    update: { count: countNum, updated_at: new Date() },
  });

  return NextResponse.json({ data: entry });
}
