import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * Resolve a thread. R8: only an admin closes a conversation — a shop asks and
 * an admin decides — so this is admin-only, and closing is terminal for
 * messages (R9, enforced in the messages route).
 *
 * Closing an already-closed thread is a 400, matching the already-approved
 * guard on invoice approval: a terminal transition is not idempotent here, it
 * is a mistake worth surfacing.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const conversation = await prisma.supportConversation.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (conversation.status === "closed") {
    return NextResponse.json(
      { error: "Conversation already closed" },
      { status: 400 }
    );
  }

  // The schema has no @updatedAt; closing is activity, so it bumps the queue
  // ordering the same way a reply does.
  const updated = await prisma.supportConversation.update({
    where: { id },
    data: { status: "closed", updated_at: new Date() },
  });

  return NextResponse.json({ data: updated });
}
