import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userFullName } from "@/lib/utils";
import { supportConversationCreateSchema } from "@/lib/validators/support";

/**
 * List support conversations for the caller's scope, most recent activity
 * first, with per-conversation unread state for the calling side.
 *
 * Conversations belong to the shop, not to the opener (KTD10), so every user
 * attached to a shop sees all of that shop's threads. Shop users are pinned to
 * session.shopId — a client-supplied ?shop_id= is ignored for them — while an
 * admin may narrow to one shop with ?shop_id= and otherwise sees every shop.
 * Same authorization shape as /api/notifications.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId =
    session.role === "user"
      ? session.shopId
      : req.nextUrl.searchParams.get("shop_id");

  // A shop user with no active shop has nothing to see; an admin with no
  // shop_id filter deliberately falls through to every shop.
  if (session.role === "user" && !shopId) {
    return NextResponse.json({ data: [], unread: 0 });
  }

  const rows = await prisma.supportConversation.findMany({
    where: shopId ? { shop_id: shopId } : {},
    include: {
      shop: { select: { name: true } },
      // Only the newest message is needed to derive unread state.
      messages: {
        orderBy: { created_at: "desc" },
        take: 1,
        select: { created_at: true, author_role: true },
      },
    },
    orderBy: { updated_at: "desc" },
  });

  const data = rows.map(({ messages, ...conversation }) => {
    const latest = messages[0] ?? null;
    const readAt =
      session.role === "admin"
        ? conversation.admin_read_at
        : conversation.shop_read_at;
    // Unread only counts the other side's messages: your own reply should not
    // light up your own queue.
    const unread =
      !!latest &&
      latest.author_role !== session.role &&
      (!readAt || latest.created_at > readAt);

    return {
      ...conversation,
      last_message_at: latest?.created_at ?? null,
      unread,
    };
  });

  return NextResponse.json({
    data,
    unread: data.reduce((n, c) => n + (c.unread ? 1 : 0), 0),
  });
}

/**
 * Shop user: open a conversation with a subject and a first message. The
 * conversation and its opening message are written in one transaction so a
 * subject can never exist without the question that prompted it.
 *
 * The shop comes from the session only — a client-supplied shop id is never
 * honoured (R13).
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = session.shopId;
  if (session.role !== "user" || !shopId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = supportConversationCreateSchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const author = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { first_name: true, last_name: true },
  });
  if (!author) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { subject, body } = parsed.data;
  // The schema has no @updatedAt, so updated_at is maintained here — the
  // queue's ordering depends on it. Shared with the message timestamp so the
  // thread's last-activity time and its newest message agree.
  const now = new Date();

  const conversation = await prisma.$transaction(async (tx) => {
    const created = await tx.supportConversation.create({
      data: {
        shop_id: shopId,
        opened_by_user_id: session.userId,
        subject,
        status: "open",
        updated_at: now,
      },
    });

    await tx.supportMessage.create({
      data: {
        conversation_id: created.id,
        author_user_id: session.userId,
        author_role: "user",
        author_name: userFullName(author),
        body,
        created_at: now,
      },
    });

    return created;
  });

  return NextResponse.json({ data: conversation }, { status: 201 });
}
