// "Awaiting an admin response" is the single definition behind every admin-side
// support alert: the sidebar badge and the shops-needing-attention list both
// call the predicate below rather than re-deriving it (KTD4). Two independent
// queries would drift and the two surfaces would silently disagree.
//
// Nothing here is stored. Shop-to-admin alerting is derived from conversation
// state on read — no notification rows are written for admins (KTD3).

interface AwaitingMessage {
  created_at: Date;
  author_role: string;
}

interface AwaitingConversation {
  status: string;
  admin_read_at: Date | null;
  /** Newest first — only the first entry is consulted. */
  messages: AwaitingMessage[];
}

/**
 * Prisma `where`/`select` for the rows the predicate reads, kept beside it so
 * the query narrowing and the definition can never move apart. Callers spread
 * this into `supportConversation.findMany`.
 */
export const awaitingAdminResponseQuery = {
  // Closed threads can never be awaiting, so they are trimmed in SQL; the
  // predicate still checks status, and remains the authority.
  where: { status: "open" },
  select: {
    shop_id: true,
    status: true,
    admin_read_at: true,
    messages: {
      orderBy: { created_at: "desc" },
      take: 1,
      select: { created_at: true, author_role: true },
    },
  },
} as const;

/**
 * Is this conversation waiting on the admins? True when it is open, its newest
 * message came from the shop side, and no admin has read the thread since that
 * message landed.
 */
export function isAwaitingAdminResponse(
  conversation: AwaitingConversation
): boolean {
  if (conversation.status !== "open") return false;

  const latest = conversation.messages[0];
  if (!latest || latest.author_role !== "user") return false;

  const readAt = conversation.admin_read_at;
  return !readAt || latest.created_at > readAt;
}

/**
 * The distinct shops with at least one conversation awaiting an admin response.
 * A shop with two waiting threads appears once — the attention list reports a
 * shop, not a thread count.
 */
export function shopIdsAwaitingAdminResponse(
  conversations: (AwaitingConversation & { shop_id: string })[]
): Set<string> {
  return new Set(
    conversations.filter(isAwaitingAdminResponse).map((c) => c.shop_id)
  );
}
