"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Eye, Send, Lock, CheckCircle } from "lucide-react";
import type { SupportConversation, SupportMessage } from "@/types/database";

const BODY_MAX = 5000;

/** A row from GET /api/support — the conversation plus list-only extras. */
interface ConversationRow extends SupportConversation {
  shop?: { name: string } | null;
  last_message_at: string | null;
  unread: boolean;
}

/** GET /api/support/[id] — the conversation with its full history. */
interface ConversationDetail extends SupportConversation {
  shop?: { name: string } | null;
  messages: SupportMessage[];
}

const statusColors: Record<string, string> = {
  open: "border-green-500 text-green-700 bg-green-50",
  closed: "border-gray-400 text-gray-600 bg-gray-50",
};

/** API errors are either a string or zod fieldErrors ({ field: [messages] }). */
function formatApiError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const messages = Object.values(error).flat().filter(Boolean);
    if (messages.length > 0) return messages.join(" ");
  }
  return "Something went wrong. Please try again.";
}

/**
 * "Awaiting an admin response" expressed over what the list endpoint returns
 * (KTD4). The list already computes `unread` for the calling side with the same
 * rule isAwaitingAdminResponse applies — newest message from the other side,
 * newer than this side's read marker — so an open row that is unread here is
 * exactly a row the /api/support/awaiting badge counts. Deliberately not a
 * second, differently-worded condition.
 */
function isAwaiting(c: ConversationRow): boolean {
  return c.status === "open" && c.unread;
}

export default function AdminSupportPage() {
  const { isAdmin } = useAuth();

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Thread dialog state.
  const [threadTarget, setThreadTarget] = useState<ConversationRow | null>(null);
  const [thread, setThread] = useState<ConversationDetail | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const [threadError, setThreadError] = useState("");
  const [closing, setClosing] = useState(false);

  const fetchConversations = useCallback(async () => {
    const res = await fetch("/api/support");
    if (res.ok) {
      const { data } = await res.json();
      setConversations(data || []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchConversations();
  }, [isAdmin, fetchConversations]);

  const loadThread = useCallback(
    async (id: string) => {
      setThreadLoading(true);
      const res = await fetch(`/api/support/${id}`);
      if (res.ok) {
        const { data } = await res.json();
        setThread(data);
        // Opening stamps the admin read marker server-side; re-fetch so the
        // inbox's awaiting markers agree with the database (and with the badge).
        fetchConversations();
      } else {
        setThreadError("Could not open that conversation.");
      }
      setThreadLoading(false);
    },
    [fetchConversations]
  );

  const openThread = (c: ConversationRow) => {
    setThreadTarget(c);
    setThread(null);
    setReply("");
    setThreadError("");
    loadThread(c.id);
  };

  const closeDialog = () => {
    setThreadTarget(null);
    setThread(null);
    setReply("");
    setThreadError("");
    setReplying(false);
    setClosing(false);
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thread) return;
    setThreadError("");
    setReplying(true);

    const res = await fetch(`/api/support/${thread.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply }),
    });
    const data = await res.json().catch(() => null);
    setReplying(false);

    if (!res.ok) {
      setThreadError(formatApiError(data?.error));
      return;
    }

    // Re-fetch rather than appending optimistically, matching the admin pages.
    setReply("");
    await loadThread(thread.id);
  };

  const handleClose = async () => {
    if (!thread) return;
    setThreadError("");
    setClosing(true);

    const res = await fetch(`/api/support/${thread.id}/close`, {
      method: "POST",
    });
    const data = await res.json().catch(() => null);
    setClosing(false);

    if (!res.ok) {
      setThreadError(formatApiError(data?.error));
      return;
    }

    await loadThread(thread.id);
  };

  if (!isAdmin) return <p>Unauthorized</p>;

  // Conversations awaiting an admin response come first; the list endpoint
  // already orders by last activity, so the rest keep that order.
  const openConversations = conversations
    .filter((c) => c.status === "open")
    .sort((a, b) => Number(isAwaiting(b)) - Number(isAwaiting(a)));
  const closedConversations = conversations.filter((c) => c.status === "closed");
  const awaitingCount = openConversations.filter(isAwaiting).length;

  const renderRows = (rows: ConversationRow[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Shop</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Last activity</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="max-w-[12rem] break-words whitespace-normal">
              {c.shop?.name || "—"}
            </TableCell>
            <TableCell
              className={cn(
                "max-w-sm break-words whitespace-normal",
                isAwaiting(c) ? "font-semibold" : ""
              )}
            >
              {c.subject}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {new Date(c.last_message_at || c.updated_at).toLocaleString()}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-1">
                <Badge variant="outline" className={statusColors[c.status]}>
                  {c.status === "closed" ? "Closed" : "Open"}
                </Badge>
                {isAwaiting(c) && (
                  <Badge className="bg-exxon-red text-white hover:bg-exxon-red">
                    Awaiting reply
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell>
              <Button
                size="sm"
                variant="outline"
                className="text-exxon-blue hover:bg-blue-50 hover:text-exxon-blue"
                onClick={() => openThread(c)}
              >
                <Eye className="mr-1 h-4 w-4" />
                Open
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-exxon-charcoal">Support</h1>
      <p className="text-muted-foreground">
        Questions from every shop in one queue. Replying alerts the shop in their
        notification bell; close a conversation once it is resolved.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Open ({openConversations.length})</CardTitle>
          <CardDescription>
            {awaitingCount > 0
              ? `${awaitingCount} awaiting an admin response, listed first.`
              : "Nothing is waiting on a reply right now."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : openConversations.length === 0 ? (
            <p className="text-muted-foreground">No open conversations.</p>
          ) : (
            renderRows(openConversations)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Closed ({closedConversations.length})</CardTitle>
          <CardDescription>Resolved conversations, most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : closedConversations.length === 0 ? (
            <p className="text-muted-foreground">No closed conversations yet.</p>
          ) : (
            renderRows(closedConversations)
          )}
        </CardContent>
      </Card>

      {/* Thread dialog (KTD8): triage stays on one cross-shop list, so the
          conversation opens in place rather than at its own route. */}
      <Dialog
        open={!!threadTarget}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="flex h-[85vh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="break-words pr-6">
              {threadTarget?.subject}
            </DialogTitle>
            <DialogDescription className="break-words">
              {threadTarget?.shop?.name || "Unknown shop"}
              {threadTarget && (
                <>
                  {" "}
                  &middot; Opened{" "}
                  {new Date(threadTarget.created_at).toLocaleString()}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {threadLoading && !thread ? (
              <p className="text-muted-foreground">Loading conversation...</p>
            ) : !thread ? (
              <p className="text-muted-foreground">
                Could not load this conversation.
              </p>
            ) : (
              <>
                <ul className="space-y-3">
                  {thread.messages.map((m) => (
                    <li
                      key={m.id}
                      className={cn(
                        "rounded-md border p-3",
                        m.author_role === "admin"
                          ? "border-exxon-blue/20 bg-blue-50"
                          : "border-gray-200 bg-white"
                      )}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                        <span className="break-words text-sm font-semibold text-exxon-charcoal">
                          {m.author_name}
                          {m.author_role === "admin" && (
                            <span className="ml-1 font-normal text-exxon-blue">
                              (Premium Growth team)
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(m.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-exxon-charcoal/90">
                        {m.body}
                      </p>
                    </li>
                  ))}
                </ul>

                {thread.status === "closed" ? (
                  <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-muted-foreground">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      This conversation is closed. The shop can start a new
                      question if they still need help.
                    </p>
                  </div>
                ) : (
                  <form
                    id="admin-support-reply"
                    onSubmit={handleReply}
                    className="space-y-2"
                  >
                    <Label htmlFor="admin-reply">Reply</Label>
                    <Textarea
                      id="admin-reply"
                      value={reply}
                      maxLength={BODY_MAX}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Answer the shop..."
                      rows={4}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      {reply.length}/{BODY_MAX}
                    </p>
                  </form>
                )}
              </>
            )}

            {threadError && (
              <p className="text-sm text-red-500">{threadError}</p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={closeDialog}
              disabled={replying || closing}
            >
              Done
            </Button>
            {thread?.status === "open" && (
              <>
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={replying || closing}
                >
                  <CheckCircle className="mr-1 h-4 w-4" />
                  {closing ? "Closing..." : "Close conversation"}
                </Button>
                <Button
                  type="submit"
                  form="admin-support-reply"
                  disabled={replying || closing}
                  className="bg-exxon-red text-white hover:bg-exxon-red-dark"
                >
                  <Send className="mr-1 h-4 w-4" />
                  {replying ? "Sending..." : "Send reply"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
