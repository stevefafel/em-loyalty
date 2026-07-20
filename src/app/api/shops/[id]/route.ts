import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { shopUpdateSchema } from "@/lib/validators/shop";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const data = await prisma.shop.findUnique({ where: { id } });

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data });
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

  const parsed = shopUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  // Only apply fields the client actually sent.
  const { sent_welcome_packet, ...fields } = parsed.data;
  const updateData: Record<string, unknown> = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined)
  );

  // Timestamp is set server-side so clients only toggle a boolean.
  if (sent_welcome_packet !== undefined) {
    updateData.sent_welcome_packet_at = sent_welcome_packet ? new Date() : null;
  }

  try {
    const data = await prisma.shop.update({
      where: { id },
      data: {
        ...updateData,
        updated_at: new Date(),
      },
    });
    return NextResponse.json({ data });
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
