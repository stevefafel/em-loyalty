import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userFullName } from "@/lib/utils";
import { MIN_INITIAL_INVOICE } from "@/lib/constants";
import { canAccessShop, shopFilterFor } from "@/lib/shop-scope";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = req.nextUrl.searchParams.get("shop_id");

  // A null filter means the caller owns no shop and may see nothing. The old
  // guard tested `session.shopId` for truthiness and fell through to the
  // client-supplied shop_id when it was null, so a user belonging to no shops
  // could read any shop's invoices — or all of them.
  const where = shopFilterFor(session, shopId);
  if (!where) {
    return NextResponse.json({ data: [] });
  }

  const data = await prisma.invoice.findMany({
    where,
    include: {
      user: { select: { first_name: true, last_name: true } },
      shop: { select: { name: true } },
      extraction: { select: { status: true } },
    },
    orderBy: { created_at: "desc" },
  });

  // Map to match existing frontend expectations (users.name -> user.name)
  const mapped = data.map((inv) => ({
    ...inv,
    amount: Number(inv.amount),
    users: { name: userFullName(inv.user) },
    shops: { name: inv.shop.name },
    extraction_status: inv.extraction?.status || null,
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

  // The shop comes from the request body, so it must be checked against the
  // caller before anything is written. Without this a shop user could file an
  // invoice into any shop and — with is_initial — knock that shop's
  // program_status back to "pending", which useEnrollmentGuard turns into a
  // redirect out of the portal for every one of its users.
  if (!canAccessShop(session, shopId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (isInitial && amount < MIN_INITIAL_INVOICE) {
    return NextResponse.json(
      {
        error: `Initial invoice must be at least $${MIN_INITIAL_INVOICE.toLocaleString()}`,
      },
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
