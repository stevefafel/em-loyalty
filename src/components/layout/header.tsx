"use client";

import { useAuth } from "@/context/auth-context";
import { useShop } from "@/context/shop-context";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShopSwitcher } from "./shop-switcher";
import { LogOut } from "lucide-react";

export function Header() {
  const { user, isAdmin, logout } = useAuth();
  const { activeShop } = useShop();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
    router.refresh();
  };

  const statusColor =
    activeShop?.program_status === "approved"
      ? "border-green-500 text-green-700 bg-green-50"
      : activeShop?.program_status === "pending"
      ? "border-yellow-500 text-yellow-700 bg-yellow-50"
      : activeShop?.program_status === "rejected"
      ? "border-red-500 text-red-700 bg-red-50"
      : "border-gray-400 text-gray-600 bg-gray-50";

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
          </>
        )}
        {isAdmin && !activeShop && (
          <h2 className="text-base font-semibold text-exxon-charcoal">
            Admin Access
          </h2>
        )}
      </div>

      <div className="flex items-center gap-3">
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
        <span className="text-sm text-exxon-gray">{user?.name}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="text-exxon-gray hover:text-exxon-red"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
