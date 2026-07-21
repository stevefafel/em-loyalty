import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { shopCreateSchema } from "@/lib/validators/shop";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await prisma.shop.findMany({
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const parsed = shopCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const data = await prisma.shop.create({ data: parsed.data });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err: unknown) {
    // Unique constraint violation on a cross-reference ID
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      const target = (err as { meta?: { target?: string[] } }).meta?.target;
      const field = Array.isArray(target) ? target[0] : "value";
      return NextResponse.json(
        { error: `That ${field} is already linked to another shop.` },
        { status: 409 }
      );
    }
    throw err;
  }
}
