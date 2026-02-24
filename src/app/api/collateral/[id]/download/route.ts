import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !session.shopId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Log the download event
  await prisma.collateralLog.create({
    data: {
      user_id: session.userId,
      shop_id: session.shopId,
      collateral_id: id,
    },
  });

  return NextResponse.json({ data: { logged: true } });
}
