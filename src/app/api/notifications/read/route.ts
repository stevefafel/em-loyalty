import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * Mark all of a shop's unread notifications as read (called when the user opens
 * the bell). Shop users are scoped to their active shop; admins may pass
 * { shop_id } in the body.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const shopId =
    session.role === "user" ? session.shopId : body?.shop_id ?? null;

  if (!shopId) {
    return NextResponse.json({ error: "Missing shop_id" }, { status: 400 });
  }

  await prisma.notification.updateMany({
    where: { shop_id: shopId, read_at: null },
    data: { read_at: new Date() },
  });

  return NextResponse.json({ ok: true });
}
