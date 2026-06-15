import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, sealSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { evaluateShopSwitch } from "./switch";

/**
 * Switch the caller's active shop.
 *
 * Required because the session cookie is now httpOnly — the client can no
 * longer write shopId via document.cookie. Validates userShop membership
 * (so a user cannot select a shop they don't belong to), then re-seals the
 * session with the new shopId. Requires application/json content type, which
 * blocks simple cross-site form POSTs (CSRF mitigation atop sameSite=lax).
 */
export async function POST(req: NextRequest) {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json" },
      { status: 415 },
    );
  }

  const session = await getSession();
  const body = (await req.json().catch(() => ({}))) as { shopId?: unknown };
  const shopId = body.shopId;

  let isMember = false;
  if (session && typeof shopId === "string" && shopId.length > 0) {
    const membership = await prisma.userShop.findUnique({
      where: { user_id_shop_id: { user_id: session.userId, shop_id: shopId } },
    });
    isMember = membership !== null;
  }

  const result = evaluateShopSwitch({
    authenticated: session !== null,
    shopId,
    isMember,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const sealed = await sealSession({
    userId: session!.userId,
    role: session!.role,
    shopId: shopId as string,
    idToken: session!.idToken,
  });

  const response = NextResponse.json({ data: { shopId } });
  response.cookies.set(SESSION_COOKIE, sealed, sessionCookieOptions());
  return response;
}
