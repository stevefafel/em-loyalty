"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { Shop } from "@/types/database";

interface ShopState {
  activeShop: Shop | null;
  shops: Shop[];
  /** Returns true when the switch succeeded (session re-sealed server-side). */
  setActiveShop: (shop: Shop) => Promise<boolean>;
  setShops: (shops: Shop[]) => void;
}

const ShopContext = createContext<ShopState | undefined>(undefined);

export function ShopProvider({
  children,
  initialShop,
  initialShops,
}: {
  children: ReactNode;
  initialShop: Shop | null;
  initialShops: Shop[];
}) {
  const [activeShop, setActiveShopState] = useState<Shop | null>(initialShop);
  const [shops, setShops] = useState<Shop[]>(initialShops);

  // The session cookie is httpOnly and sealed server-side, so the active shop
  // must be changed via a server route that re-seals it. Await the round-trip
  // before the caller refreshes, or the server re-renders the stale shop.
  const setActiveShop = async (shop: Shop): Promise<boolean> => {
    try {
      const res = await fetch("/api/session/shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId: shop.id }),
      });
      if (!res.ok) {
        toast.error("Could not switch shop. Please try again.");
        return false;
      }
      setActiveShopState(shop);
      return true;
    } catch {
      toast.error("Could not switch shop. Please try again.");
      return false;
    }
  };

  return (
    <ShopContext.Provider
      value={{ activeShop, shops, setActiveShop, setShops }}
    >
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used within ShopProvider");
  return ctx;
}
