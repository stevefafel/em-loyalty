"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import { useShop } from "@/context/shop-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { LifeBuoy, Mail, MessageSquarePlus, Send, Lock } from "lucide-react";
import { toast } from "sonner";
import type { SupportConversation, SupportMessage } from "@/types/database";

const SUBJECT_MAX = 120;
const BODY_MAX = 5000;
const SUPPORT_EMAIL = "pgpsupport@steer.io";

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

export default function SupportPage() {
  const { isAdmin } = useAuth();
  // Deliberately no useEnrollmentGuard here (KTD7): support has to stay
  // reachable at every program status — a shop with a rejected invoice is
  // exactly the shop that needs to ask why.
  const { activeShop } = useShop();

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<ConversationDetail | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  // New-conversation composer.
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Inline reply composer.
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState("");

  const fetchConversations = useCallback(async () => {
    const res = await fetch("/api/support");
    if (res.ok) {
      const { data } = await res.json();
      setConversations(data || []);
    }
    setIsLoading(false);
  }, []);

  // Re-scope when the header's shop switcher changes the active shop: the list
  // is session-scoped server-side, so a stale selection would no longer belong
  // to the shop being viewed. Reset during render rather than in an effect,
  // matching ShopProvider's own prop re-sync.
  const shopId = activeShop?.id ?? null;
  const [prevShopId, setPrevShopId] = useState(shopId);
  if (prevShopId !== shopId) {
    setPrevShopId(shopId);
    setSelectedId(null);
    setThread(null);
    setComposing(false);
  }

  useEffect(() => {
    fetchConversations();
  }, [shopId, fetchConversations]);

  const openThread = useCallback(
    async (id: string) => {
      setComposing(false);
      setSelectedId(id);
      setThread(null);
      setReply("");
      setReplyError("");
      setThreadLoading(true);

      const res = await fetch(`/api/support/${id}`);
      if (res.ok) {
        const { data } = await res.json();
        setThread(data);
        // Opening stamps the read marker server-side; re-fetch so the list's
        // unread markers agree with the database.
        fetchConversations();
      } else {
        toast.error("Could not open that conversation.");
        setSelectedId(null);
      }
      setThreadLoading(false);
    },
    [fetchConversations]
  );

  const startNew = () => {
    setComposing(true);
    setSelectedId(null);
    setThread(null);
    setSubject("");
    setBody("");
    setCreateError("");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setCreating(true);

    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body }),
    });
    const data = await res.json().catch(() => null);
    setCreating(false);

    if (!res.ok) {
      setCreateError(formatApiError(data?.error));
      return;
    }

    toast.success("Question sent", {
      description: "The Premium Growth team will reply here.",
    });
    setSubject("");
    setBody("");
    setComposing(false);
    await fetchConversations();
    if (data?.data?.id) openThread(data.data.id);
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thread) return;
    setReplyError("");
    setReplying(true);

    const res = await fetch(`/api/support/${thread.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply }),
    });
    const data = await res.json().catch(() => null);
    setReplying(false);

    if (!res.ok) {
      setReplyError(formatApiError(data?.error));
      return;
    }

    // Re-fetch rather than appending optimistically, matching the admin pages.
    setReply("");
    await openThread(thread.id);
  };

  const unreadCount = conversations.filter((c) => c.unread).length;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-exxon-charcoal">Support</h1>
      <p className="text-muted-foreground">
        Ask the Premium Growth team a question and follow the answer here. Every
        reply also shows up in your notification bell.
      </p>

      {/* Urgent contact route (R4) */}
      <Card className="border-exxon-blue/20 bg-gradient-to-r from-blue-50 to-white">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-exxon-blue/10">
              <Mail className="h-5 w-5 text-exxon-blue" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-exxon-charcoal">
                Something urgent?
              </p>
              <p className="text-sm text-muted-foreground break-words">
                Email{" "}
                <span className="font-medium text-exxon-charcoal">
                  {SUPPORT_EMAIL}
                </span>{" "}
                for anything that can&apos;t wait for a reply in the portal.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        {/* Conversation list */}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LifeBuoy className="h-4 w-4 text-exxon-red" />
              Your questions
              {unreadCount > 0 && (
                <Badge className="bg-exxon-red text-white">{unreadCount}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Everyone at your shop can see these threads.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isAdmin && (
              <Button
                onClick={startNew}
                className="w-full bg-exxon-red text-white hover:bg-exxon-red-dark"
              >
                <MessageSquarePlus className="mr-1 h-4 w-4" />
                Ask a question
              </Button>
            )}

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : conversations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No questions yet. Start one above and we&apos;ll reply here.
              </p>
            ) : (
              <ul className="space-y-2">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => openThread(c.id)}
                      aria-current={selectedId === c.id ? "true" : undefined}
                      className={cn(
                        "w-full rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-exxon-blue",
                        selectedId === c.id
                          ? "border-exxon-red bg-red-50"
                          : "border-gray-200 hover:bg-gray-50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={cn(
                            "min-w-0 break-words text-sm text-exxon-charcoal",
                            c.unread ? "font-semibold" : "font-medium"
                          )}
                        >
                          {c.subject}
                        </span>
                        {c.unread && (
                          <span
                            className="mt-1 h-2 w-2 shrink-0 rounded-full bg-exxon-red"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={statusColors[c.status]}
                        >
                          {c.status === "closed" ? "Closed" : "Open"}
                        </Badge>
                        {c.unread && (
                          <Badge className="bg-exxon-red text-white">
                            New reply
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(
                            c.last_message_at || c.updated_at
                          ).toLocaleString()}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* New question form, thread view, or empty state */}
        <Card className="min-w-0">
          {composing ? (
            <>
              <CardHeader>
                <CardTitle className="text-base">Ask a question</CardTitle>
                <CardDescription>
                  Give it a short subject and tell us what you need.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      value={subject}
                      maxLength={SUBJECT_MAX}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g. Why was my invoice rejected?"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      {subject.length}/{SUBJECT_MAX}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      value={body}
                      maxLength={BODY_MAX}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Tell us what happened and what you need."
                      rows={6}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      {body.length}/{BODY_MAX}
                    </p>
                  </div>

                  {createError && (
                    <p className="text-sm text-red-500">{createError}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      disabled={creating}
                      className="bg-exxon-red text-white hover:bg-exxon-red-dark"
                    >
                      <Send className="mr-1 h-4 w-4" />
                      {creating ? "Sending..." : "Send question"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setComposing(false)}
                      disabled={creating}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </>
          ) : threadLoading ? (
            <CardContent className="pt-6">
              <p className="text-muted-foreground">Loading conversation...</p>
            </CardContent>
          ) : thread ? (
            <>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="min-w-0 break-words text-base">
                    {thread.subject}
                  </CardTitle>
                  <Badge
                    variant="outline"
                    className={statusColors[thread.status]}
                  >
                    {thread.status === "closed" ? "Closed" : "Open"}
                  </Badge>
                </div>
                <CardDescription>
                  Opened {new Date(thread.created_at).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                        <span className="text-sm font-semibold text-exxon-charcoal break-words">
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
                      This conversation is closed. Start a new question if you
                      still need help.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleReply} className="space-y-2">
                    <Label htmlFor="reply">Reply</Label>
                    <Textarea
                      id="reply"
                      value={reply}
                      maxLength={BODY_MAX}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Add to this conversation..."
                      rows={4}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      {reply.length}/{BODY_MAX}
                    </p>
                    {replyError && (
                      <p className="text-sm text-red-500">{replyError}</p>
                    )}
                    <Button
                      type="submit"
                      disabled={replying}
                      className="bg-exxon-red text-white hover:bg-exxon-red-dark"
                    >
                      <Send className="mr-1 h-4 w-4" />
                      {replying ? "Sending..." : "Send reply"}
                    </Button>
                  </form>
                )}
              </CardContent>
            </>
          ) : (
            <CardContent className="pt-6">
              <p className="text-muted-foreground">
                Select a question to read the conversation
                {!isAdmin && <>, or ask a new one</>}.
              </p>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
