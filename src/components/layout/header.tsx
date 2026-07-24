"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import { useShop } from "@/context/shop-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShopSwitcher } from "./shop-switcher";
import { userFullName } from "@/lib/utils";
import { LogOut, CalendarDays, Bell } from "lucide-react";
import type { Notification as AppNotification } from "@/types/database";

function NotificationBell({ shopId }: { shopId: string | null }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!shopId) {
      setItems([]);
      setUnread(0);
      return;
    }
    const res = await fetch(`/api/notifications?shop_id=${shopId}`);
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.data || []);
    setUnread(data.unread || 0);
  }, [shopId]);

  useEffect(() => {
    load();
  }, [load]);

  // Opening the bell marks everything read.
  const handleOpenChange = async (open: boolean) => {
    if (!open || unread === 0 || !shopId) return;
    setUnread(0);
    setItems((prev) =>
      prev.map((n) =>
        n.read_at ? n : { ...n, read_at: new Date().toISOString() }
      )
    );
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shop_id: shopId }),
    }).catch(() => {});
  };

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative text-exxon-gray hover:text-exxon-charcoal"
          aria-label={`Notifications, ${unread} unread`}
        >
          <Bell className="h-4.5 w-4.5" />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-exxon-red text-[10px] font-bold text-white"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            You&apos;re all caught up.
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {items.map((n) => (
              <div
                key={n.id}
                className={`border-b px-3 py-2 text-sm last:border-b-0 ${
                  n.read_at ? "" : "bg-exxon-red/5"
                }`}
              >
                <p className="font-semibold text-exxon-charcoal">{n.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header() {
  const { user, isAdmin, logout } = useAuth();
  const { activeShop } = useShop();

  const handleLogout = async () => {
    // logout() performs a full-page navigation to the server logout route,
    // which clears the session and redirects — no client-side push needed.
    await logout();
  };

  const statusColor =
    activeShop?.program_status === "approved"
      ? "border-green-500 text-green-700 bg-green-50"
      : activeShop?.program_status === "pending"
      ? "border-yellow-500 text-yellow-700 bg-yellow-50"
      : activeShop?.program_status === "rejected"
      ? "border-red-500 text-red-700 bg-red-50"
      : "border-gray-400 text-gray-600 bg-gray-50";

  const joinDate = activeShop?.created_at
    ? new Date(activeShop.created_at).toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
      })
    : null;

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-3">
        {activeShop && (
          <>
            <h2 className="text-base font-semibold text-exxon-charcoal">
              {activeShop.name}
            </h2>
            <Badge variant="outline" className={statusColor}>
              {activeShop.program_status}
            </Badge>
            {joinDate && (
              <div className="flex items-center gap-1 text-sm text-exxon-gray ml-2">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>Member since {joinDate}</span>
              </div>
            )}
          </>
        )}
        {isAdmin && !activeShop && (
          <h2 className="text-base font-semibold text-exxon-charcoal">
            Admin Access
          </h2>
        )}
      </div>

      <div className="flex items-center gap-3">
        <NotificationBell shopId={activeShop?.id ?? null} />
        <ShopSwitcher />
        <Badge
          className={
            isAdmin
              ? "bg-exxon-red text-white"
              : "bg-exxon-blue text-white"
          }
        >
          {isAdmin ? "Admin" : "Shop User"}
        </Badge>
        <span className="text-sm text-exxon-gray">
          {user ? userFullName(user) : null}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="text-exxon-gray hover:text-exxon-red"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
