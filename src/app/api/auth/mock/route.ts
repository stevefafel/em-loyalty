import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mockLoginSchema } from "@/lib/validators/auth";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = mockLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.message },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const session = {
    userId: user.id,
    role: user.role,
    shopId: parsed.data.shopId || null,
  };

  const response = NextResponse.json({ data: { user, session } });
  response.cookies.set("mock-session", JSON.stringify(session), {
    path: "/",
    httpOnly: false,
    maxAge: 60 * 60 * 24,
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ data: null });
  response.cookies.delete("mock-session");
  return response;
}
