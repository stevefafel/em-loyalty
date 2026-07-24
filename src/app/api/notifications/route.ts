import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { notificationCreateSchema } from "@/lib/validators/notification";

/**
 * List in-app notifications for a shop, newest first, plus the unread count.
 * Shop users are scoped to their active shop (session.shopId); admins may pass
 * ?shop_id=. Mirrors the authorization pattern used by /api/invoices.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId =
    session.role === "user"
      ? session.shopId
      : req.nextUrl.searchParams.get("shop_id");

  if (!shopId) {
    return NextResponse.json({ data: [], unread: 0 });
  }

  const data = await prisma.notification.findMany({
    where: { shop_id: shopId },
    orderBy: { created_at: "desc" },
  });

  const unread = data.reduce((n, notif) => n + (notif.read_at ? 0 : 1), 0);

  return NextResponse.json({ data, unread });
}

/**
 * Admin: post a manual alert. With a shop_id it targets one shop; without one
 * it broadcasts to every shop (one row per shop). Manual alerts use the
 * "admin_message" type to distinguish them from event-generated ones.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = notificationCreateSchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { title, body, shop_id } = parsed.data;
  const type = "admin_message";

  if (shop_id) {
    const shop = await prisma.shop.findUnique({
      where: { id: shop_id },
      select: { id: true },
    });
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }
    await prisma.notification.create({ data: { shop_id, type, title, body } });
    return NextResponse.json({ ok: true, count: 1 }, { status: 201 });
  }

  const shops = await prisma.shop.findMany({ select: { id: true } });
  if (shops.length > 0) {
    await prisma.notification.createMany({
      data: shops.map((s) => ({ shop_id: s.id, type, title, body })),
    });
  }
  return NextResponse.json({ ok: true, count: shops.length }, { status: 201 });
}
