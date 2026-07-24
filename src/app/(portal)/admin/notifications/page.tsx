"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, Send, X } from "lucide-react";

const ALL_SHOPS = "__all__";
const BODY_MAX = 1000;
const TITLE_MAX = 120;

export default function AdminNotificationsPage() {
  const { isAdmin } = useAuth();
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [target, setTarget] = useState<string>(ALL_SHOPS);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const fetchShops = useCallback(async () => {
    const res = await fetch("/api/shops");
    if (!res.ok) return;
    const { data } = await res.json();
    setShops(data || []);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchShops();
  }, [isAdmin, fetchShops]);

  const formatApiError = (err: unknown): string => {
    if (typeof err === "string") return err;
    if (err && typeof err === "object") {
      const messages = Object.values(err).flat().filter(Boolean);
      if (messages.length > 0) return messages.join(" ");
    }
    return "Could not send the alert. Please try again.";
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice(null);
    setSending(true);

    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body,
        shop_id: target === ALL_SHOPS ? null : target,
      }),
    });
    const data = await res.json().catch(() => null);
    setSending(false);

    if (!res.ok) {
      setError(formatApiError(data?.error));
      return;
    }

    const where =
      target === ALL_SHOPS
        ? `all ${data?.count ?? ""} shops`.trim()
        : shops.find((s) => s.id === target)?.name || "the shop";
    setNotice(`Alert sent to ${where}.`);
    setTitle("");
    setBody("");
    setTarget(ALL_SHOPS);
  };

  if (!isAdmin) return <p>Unauthorized</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-exxon-charcoal">Send Alerts</h1>

      {notice && (
        <div
          role="status"
          className="flex items-start justify-between gap-2 rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          <p>{notice}</p>
          <button
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            className="shrink-0 opacity-60 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-exxon-red" />
            Post a notification
          </CardTitle>
          <CardDescription>
            Send an in-app alert to a single shop or broadcast to every shop. It
            appears in the recipient&apos;s notification bell.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSend} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="target">Send to</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger id="target">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SHOPS}>All shops</SelectItem>
                  {shops.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                maxLength={TITLE_MAX}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. New rewards added this month"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="body">Message</Label>
              <Textarea
                id="body"
                value={body}
                maxLength={BODY_MAX}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What do you want to tell them?"
                rows={4}
                required
              />
              <p className="text-xs text-muted-foreground">
                {body.length}/{BODY_MAX}
              </p>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <Button
              type="submit"
              disabled={sending}
              className="bg-exxon-red text-white hover:bg-exxon-red-dark"
            >
              <Send className="mr-1 h-4 w-4" />
              {sending ? "Sending..." : "Send alert"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
