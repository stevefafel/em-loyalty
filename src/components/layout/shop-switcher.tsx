"use client";

import { useShop } from "@/context/shop-context";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Check } from "lucide-react";

export function ShopSwitcher() {
  const { activeShop, shops, setActiveShop } = useShop();
  const router = useRouter();

  if (shops.length <= 1) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {activeShop?.name || "Select Shop"}
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {shops.map((shop) => (
          <DropdownMenuItem
            key={shop.id}
            onClick={() => {
              setActiveShop(shop);
              router.refresh();
            }}
            className="gap-2"
          >
            {shop.id === activeShop?.id && (
              <Check className="h-4 w-4 text-exxon-red" />
            )}
            {shop.id !== activeShop?.id && <div className="w-4" />}
            {shop.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
