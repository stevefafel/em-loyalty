"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Shop } from "@/types/database";

interface ShopState {
  activeShop: Shop | null;
  shops: Shop[];
  setActiveShop: (shop: Shop) => void;
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

  const setActiveShop = (shop: Shop) => {
    setActiveShopState(shop);
    // Update the cookie so server components see the new shop_id
    const raw = document.cookie
      .split("; ")
      .find((c) => c.startsWith("mock-session="));
    if (raw) {
      const session = JSON.parse(
        decodeURIComponent(raw.split("=").slice(1).join("="))
      );
      session.shopId = shop.id;
      document.cookie = `mock-session=${encodeURIComponent(
        JSON.stringify(session)
      )}; path=/; max-age=86400`;
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
