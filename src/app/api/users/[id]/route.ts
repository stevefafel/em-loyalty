import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userUpdateSchema } from "@/lib/validators/user";

const userInclude = {
  user_shops: {
    include: { shop: { select: { id: true, name: true } } },
  },
} as const;

type UserWithShops = {
  user_shops: { shop: { id: string; name: string } }[];
} & Record<string, unknown>;

function toClientUser({ user_shops, ...user }: UserWithShops) {
  return { ...user, shops: user_shops.map((us) => us.shop) };
}

function prismaErrorCode(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null && "code" in err) {
    return (err as { code?: string }).code;
  }
  return undefined;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const parsed = userUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  // Only apply fields the client actually sent.
  const { shop_ids, ...fields } = parsed.data;
  const updateData = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined)
  );

  try {
    const data = await prisma.$transaction(async (tx) => {
      if (shop_ids !== undefined) {
        await tx.userShop.deleteMany({ where: { user_id: id } });
        await tx.userShop.createMany({
          data: shop_ids.map((shop_id) => ({ user_id: id, shop_id })),
        });
      }
      return tx.user.update({
        where: { id },
        data: updateData,
        include: userInclude,
      });
    });
    return NextResponse.json({ data: toClientUser(data) });
  } catch (err: unknown) {
    if (prismaErrorCode(err) === "P2002") {
      return NextResponse.json(
        { error: "A user with that email already exists." },
        { status: 409 }
      );
    }
    if (prismaErrorCode(err) === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (id === session.userId) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 400 }
    );
  }

  try {
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ data: null });
  } catch (err: unknown) {
    if (prismaErrorCode(err) === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}
