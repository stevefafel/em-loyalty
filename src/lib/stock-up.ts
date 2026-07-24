// Stock-Up promotions are a countable metric (separate from loyalty points).
// An invoice earns one Stock-Up promotion for every whole $500 of its amount,
// rounded down: <$500 → 0, $500–$999.99 → 1, $1,567 → 3. A shop's total is the
// sum across its APPROVED invoices only (initial + subsequent alike).

export const STOCK_UP_UNIT = 500;

/** Whole-$500 Stock-Up promotions earned by a single invoice amount (rounded down). */
export function stockUpPromotionsForAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount < STOCK_UP_UNIT) return 0;
  return Math.floor(amount / STOCK_UP_UNIT);
}

/** Total Stock-Up promotions across a shop's invoices, counting approved ones only. */
export function totalStockUpPromotions(
  invoices: { amount: number; status: string }[]
): number {
  return invoices
    .filter((inv) => inv.status === "approved")
    .reduce((sum, inv) => sum + stockUpPromotionsForAmount(inv.amount), 0);
}
