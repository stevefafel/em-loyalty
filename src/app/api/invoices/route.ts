import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = req.nextUrl.searchParams.get("shop_id");

  const where: Record<string, string> = {};
  if (session.role === "user" && session.shopId) {
    where.shop_id = session.shopId;
  } else if (shopId) {
    where.shop_id = shopId;
  }

  const data = await prisma.invoice.findMany({
    where,
    include: { user: { select: { name: true } }, shop: { select: { name: true } } },
    orderBy: { created_at: "desc" },
  });

  // Map to match existing frontend expectations (users.name -> user.name)
  const mapped = data.map((inv) => ({
    ...inv,
    amount: Number(inv.amount),
    users: { name: inv.user.name },
    shops: { name: inv.shop.name },
  }));

  return NextResponse.json({ data: mapped });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { shopId, amount, isInitial, filePath } = body;

  if (!shopId || !amount || !filePath) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  if (isInitial && amount < 2500) {
    return NextResponse.json(
      { error: "Initial invoice must be at least $2,500" },
      { status: 400 }
    );
  }

  const invoice = await prisma.invoice.create({
    data: {
      shop_id: shopId,
      user_id: session.userId,
      file_path: filePath,
      amount,
      is_initial: isInitial || false,
      status: "pending",
    },
  });

  // If initial invoice, update shop status to pending
  if (isInitial) {
    await prisma.shop.update({
      where: { id: shopId },
      data: { program_status: "pending", updated_at: new Date() },
    });
  }

  return NextResponse.json({ data: invoice });
}
