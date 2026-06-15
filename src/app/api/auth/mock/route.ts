import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mockLoginSchema } from "@/lib/validators/auth";
import { authMode } from "@/lib/auth/config";
import { sealSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

/** Mock login is local-dev only. Inert in keycloak mode (any non-local env). */
function mockDisabledResponse() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(req: NextRequest) {
  if (authMode !== "mock") return mockDisabledResponse();

  const body = await req.json();
  const parsed = mockLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const shopId = parsed.data.shopId || null;
  const sealed = await sealSession({ userId: user.id, role: user.role, shopId });

  const response = NextResponse.json({
    data: { user, session: { userId: user.id, role: user.role, shopId } },
  });
  response.cookies.set(SESSION_COOKIE, sealed, sessionCookieOptions());
  return response;
}

export async function DELETE() {
  if (authMode !== "mock") return mockDisabledResponse();
  const response = NextResponse.json({ data: null });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
