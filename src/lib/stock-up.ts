// Stock-Up promotions are countable metrics, separate from loyalty points.
// Two distinct numbers, both derived from a shop's APPROVED invoices:
//
//   COUNT   — how many qualifying invoices the shop has uploaded. An approved
//             invoice of $500 or more is worth exactly one promotion, however
//             far above $500 it lands. Below $500 it is worth none.
//   BENEFIT — how many whole $500 units those invoices clear, rounded down:
//             <$500 → 0, $500–$999.99 → 1, $1,567 → 3. Each unit is one free
//             roll of oil change stickers.
//
// One $1,567 invoice is count 1, benefit 3 — count tracks participation,
// benefit scales with spend. Both count initial and subsequent invoices alike,
// and only once the invoice is approved.

export const STOCK_UP_UNIT = 500;

interface StockUpInvoice {
  amount: number;
  status: string;
}

const isApproved = (inv: StockUpInvoice) => inv.status === "approved";

/** Whole-$500 Stock-Up benefit units earned by a single invoice amount (rounded down). */
export function stockUpBenefitForAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount < STOCK_UP_UNIT) return 0;
  return Math.floor(amount / STOCK_UP_UNIT);
}

/** Stock-Up Promotion Count: approved invoices that clear the $500 minimum. */
export function stockUpPromotionCount(invoices: StockUpInvoice[]): number {
  return invoices.filter(
    (inv) => isApproved(inv) && stockUpBenefitForAmount(inv.amount) >= 1
  ).length;
}

/** Stock-Up Promotion Benefit: total $500 units across a shop's approved invoices. */
export function stockUpPromotionBenefit(invoices: StockUpInvoice[]): number {
  return invoices
    .filter(isApproved)
    .reduce((sum, inv) => sum + stockUpBenefitForAmount(inv.amount), 0);
}
