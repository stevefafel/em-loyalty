import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userFullName } from "@/lib/utils";
import { supportReplyNotification } from "@/lib/notifications";
import { supportMessageCreateSchema } from "@/lib/validators/support";

/**
 * Raised inside the write transaction when the conversation was closed between
 * the pre-flight guard and the write, so the message rolls back with it.
 */
class ConversationClosedError extends Error {}

/**
 * Append a reply to a thread. Either side may reply; the author is always taken
 * from the session — role included — and the display name is snapshotted at
 * write time (KTD2), so a client-supplied author is ignored entirely.
 *
 * The message, the conversation's updated_at bump and the admin-reply alert go
 * in one transaction: a reply must never leave the queue ordering stale, and an
 * alert must never exist without the message it announces.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const parsed = supportMessageCreateSchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const conversation = await prisma.supportConversation.findUnique({
    where: { id },
    select: { id: true, shop_id: true, subject: true, status: true },
  });

  // Same scope rule as GET: another shop's thread is 404, never 403 (R13).
  if (
    !conversation ||
    (session.role === "user" && conversation.shop_id !== session.shopId)
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // R9/KTD5: closed is terminal — neither side may append, mirroring the
  // already-approved guard on invoice approval. Hiding the composer once a
  // thread is closed is a courtesy; this check is what actually enforces it.
  if (conversation.status === "closed") {
    return NextResponse.json(
      { error: "Conversation is closed" },
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

  const { body } = parsed.data;
  // Shared by the message and the conversation bump so the thread's
  // last-activity time and its newest message agree.
  const now = new Date();

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.supportMessage.create({
      data: {
        conversation_id: conversation.id,
        author_user_id: session.userId,
        author_role: session.role,
        author_name: userFullName(author),
        body,
        created_at: now,
      },
    });

    // The schema has no @updatedAt, so the queue's ordering is maintained here.
    // Scoped to status "open" so the terminal guard is enforced by the write
    // itself: a close committing after the pre-flight check above matches zero
    // rows here and rolls the message back, rather than stranding a reply on a
    // closed thread that neither side can see a way to answer.
    const { count } = await tx.supportConversation.updateMany({
      where: { id: conversation.id, status: "open" },
      data: { updated_at: now },
    });
    if (count === 0) {
      throw new ConversationClosedError();
    }

    // R10: an admin reply alerts the shop through the existing bell. A shop
    // reply writes nothing — admin-side alerting is derived, not stored (KTD3).
    if (session.role === "admin") {
      await tx.notification.create({
        data: {
          shop_id: conversation.shop_id,
          ...supportReplyNotification(conversation.subject),
        },
      });
    }

    return created;
  }).catch((err) => {
    if (err instanceof ConversationClosedError) return null;
    throw err;
  });

  // The thread closed underneath this reply; report it exactly as the
  // pre-flight guard would have.
  if (!message) {
    return NextResponse.json(
      { error: "Conversation is closed" },
      { status: 400 }
    );
  }

  return NextResponse.json({ data: message }, { status: 201 });
}
