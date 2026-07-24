import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

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
