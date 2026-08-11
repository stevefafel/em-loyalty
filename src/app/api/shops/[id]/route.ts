import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { shopUpdateSchema } from "@/lib/validators/shop";
import { createAdminClient } from "@/lib/supabase/server";
import { STORAGE_BUCKETS } from "@/lib/constants";
import { canAccessShop } from "@/lib/shop-scope";

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

  // Another shop's record — its address, points balance and program status —
  // is 404, not 403, so the response never confirms the id exists.
  if (!data || !canAccessShop(session, data.id)) {
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const shop = await prisma.shop.findUnique({
    where: { id },
    select: { id: true, invoices: { select: { file_path: true } } },
  });

  if (!shop) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Related rows (user_shops, invoices, ledger, etc.) cascade at the DB level.
  await prisma.shop.delete({ where: { id } });

  // Best-effort cleanup of uploaded invoice files; the DB rows are already
  // gone, so a storage failure shouldn't fail the request.
  const filePaths = shop.invoices.map((i) => i.file_path).filter(Boolean);
  if (filePaths.length > 0) {
    try {
      const supabase = createAdminClient();
      await supabase.storage.from(STORAGE_BUCKETS.INVOICES).remove(filePaths);
    } catch (err) {
      console.error("Failed to remove invoice files for deleted shop", id, err);
    }
  }

  return NextResponse.json({ success: true });
}
