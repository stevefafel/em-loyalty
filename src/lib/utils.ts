import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { DOLLAR_UNIT, POINTS_PER_DOLLAR } from "./constants"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculatePoints(amountInDollars: number): number {
  return Math.floor(amountInDollars / DOLLAR_UNIT) * POINTS_PER_DOLLAR;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function generateStoragePath(shopId: string, originalName: string): string {
  const timestamp = Date.now();
  return `${shopId}/${timestamp}_${originalName}`;
}
