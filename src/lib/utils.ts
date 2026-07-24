import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

/**
 * Format a date-only value (e.g. an extracted invoice date stored as a `@db.Date`
 * and serialized as midnight-UTC ISO) without shifting it into the viewer's
 * local timezone — which would render the day before in any zone behind UTC.
 */
export function formatDateUTC(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-US", { timeZone: "UTC" });
}

export function userFullName(user: {
  first_name: string;
  last_name: string;
}): string {
  return `${user.first_name} ${user.last_name}`.trim();
}

export function generateStoragePath(shopId: string, originalName: string): string {
  const timestamp = Date.now();
  return `${shopId}/${timestamp}_${originalName}`;
}
