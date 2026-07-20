import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userFullName } from "@/lib/utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const data = await prisma.invoice.findUnique({
    where: { id },
    include: {
      user: { select: { first_name: true, last_name: true } },
      shop: { select: { name: true } },
      extraction: {
        include: {
          line_items: { orderBy: { sort_order: "asc" } },
        },
      },
    },
  });

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Preserve the existing response shape (user.name) for frontend consumers.
  return NextResponse.json({
    data: { ...data, user: { name: userFullName(data.user) } },
  });
}
