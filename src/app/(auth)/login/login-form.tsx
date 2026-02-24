"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface LoginFormProps {
  users: { id: string; email: string; name: string; role: string }[];
  shopsByUser: Record<
    string,
    { id: string; name: string; program_status: string }[]
  >;
}

export function LoginForm({ users, shopsByUser }: LoginFormProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedShopId, setSelectedShopId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const selectedUser = users.find((u) => u.id === selectedUserId);
  const userShops = selectedUserId ? shopsByUser[selectedUserId] || [] : [];
  const isShopUser = selectedUser?.role === "user";
  const canSubmit =
    selectedUserId && (!isShopUser || selectedShopId);

  const handleLogin = async () => {
    if (!canSubmit) return;
    setIsLoading(true);

    const res = await fetch("/api/auth/mock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: selectedUserId,
        shopId: isShopUser ? selectedShopId : undefined,
      }),
    });

    if (!res.ok) {
      setIsLoading(false);
      return;
    }

    // Full page navigation ensures the cookie is sent on the server request
    window.location.href = "/dashboard";
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-semibold text-exxon-charcoal">
          Select User
        </label>
        <Select
          value={selectedUserId}
          onValueChange={(val) => {
            setSelectedUserId(val);
            setSelectedShopId("");
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose a user..." />
          </SelectTrigger>
          <SelectContent>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                <div className="flex items-center gap-2">
                  <span>{user.name}</span>
                  <Badge
                    variant={user.role === "admin" ? "default" : "secondary"}
                    className={
                      user.role === "admin"
                        ? "bg-exxon-red text-white"
                        : "bg-exxon-blue text-white"
                    }
                  >
                    {user.role}
                  </Badge>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isShopUser && userShops.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-semibold text-exxon-charcoal">
            Select Shop
          </label>
          <Select value={selectedShopId} onValueChange={setSelectedShopId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a shop..." />
            </SelectTrigger>
            <SelectContent>
              {userShops.map((shop) => (
                <SelectItem key={shop.id} value={shop.id}>
                  <div className="flex items-center gap-2">
                    <span>{shop.name}</span>
                    <Badge
                      variant="outline"
                      className={
                        shop.program_status === "approved"
                          ? "border-green-500 text-green-700"
                          : shop.program_status === "new"
                          ? "border-gray-400 text-gray-600"
                          : "border-yellow-500 text-yellow-700"
                      }
                    >
                      {shop.program_status}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isShopUser && userShops.length === 0 && (
        <p className="text-sm text-red-500">
          This user is not associated with any shops.
        </p>
      )}

      <Button
        onClick={handleLogin}
        disabled={!canSubmit || isLoading}
        className="w-full bg-exxon-red text-white hover:bg-exxon-red-dark"
      >
        {isLoading ? "Signing in..." : "Sign In"}
      </Button>
    </div>
  );
}
