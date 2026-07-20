import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userCreateSchema } from "@/lib/validators/user";

const userInclude = {
  user_shops: {
    include: { shop: { select: { id: true, name: true } } },
  },
} as const;

type UserWithShops = {
  user_shops: { shop: { id: string; name: string } }[];
} & Record<string, unknown>;

/** Flatten the user_shops join into a plain shops array for the client. */
function toClientUser({ user_shops, ...user }: UserWithShops) {
  return { ...user, shops: user_shops.map((us) => us.shop) };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await prisma.user.findMany({
    include: userInclude,
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });

  return NextResponse.json({ data: data.map(toClientUser) });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = userCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { shop_ids, ...fields } = parsed.data;

  try {
    const data = await prisma.user.create({
      data: {
        ...fields,
        ...(shop_ids?.length
          ? { user_shops: { create: shop_ids.map((shop_id) => ({ shop_id })) } }
          : {}),
      },
      include: userInclude,
    });
    return NextResponse.json({ data: toClientUser(data) }, { status: 201 });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "A user with that email already exists." },
        { status: 409 }
      );
    }
    throw err;
  }
}
