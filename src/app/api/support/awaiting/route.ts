import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  awaitingAdminResponseQuery,
  isAwaitingAdminResponse,
} from "@/lib/support";

/**
 * How many conversations are waiting on the admins (R11) — the number behind
 * the admin sidebar badge.
 *
 * Derived on read from conversation state, never from stored rows: no admin
 * notifications exist (KTD3). The definition lives in isAwaitingAdminResponse
 * so this badge and the shops-needing-attention list cannot disagree (KTD4).
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversations = await prisma.supportConversation.findMany(
    awaitingAdminResponseQuery
  );

  return NextResponse.json({
    data: { count: conversations.filter(isAwaitingAdminResponse).length },
  });
}
