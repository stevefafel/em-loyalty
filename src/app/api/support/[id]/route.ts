import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * Read one support thread with its full message history, oldest-first, and
 * clear the calling side's unread state for it.
 *
 * Scope follows the same rule as the list route: a shop user reaches only their
 * own shop's threads, an admin reaches every one (R13). A shop user asking for
 * another shop's thread gets 404, not 403 — the response must not confirm that
 * the conversation exists.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Taken before the read, not after: a stamp written from an later clock read
  // would acknowledge messages that landed while this query was in flight and
  // were never returned to the caller, silently clearing an unread signal
  // nobody saw. Anything arriving after this instant stays strictly newer than
  // the stamp and remains unread.
  const now = new Date();

  const conversation = await prisma.supportConversation.findUnique({
    where: { id },
    include: {
      shop: { select: { name: true } },
      messages: { orderBy: { created_at: "asc" } },
    },
  });

  if (
    !conversation ||
    (session.role === "user" && conversation.shop_id !== session.shopId)
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // KTD6: read stamps live on the conversation, one per side, and are set when
  // that side opens *this* thread. Only the caller's side moves; updated_at is
  // deliberately untouched so reading never reorders the queue.
  const readStamp =
    session.role === "admin" ? { admin_read_at: now } : { shop_read_at: now };

  await prisma.supportConversation.update({
    where: { id },
    data: readStamp,
  });

  // Return the stamp we just wrote so the client's unread state agrees with the
  // database without a second round trip.
  return NextResponse.json({ data: { ...conversation, ...readStamp } });
}
