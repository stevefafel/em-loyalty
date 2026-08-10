// Stock-Up promotions are countable metrics, separate from loyalty points.
// Two distinct numbers, both derived from a shop's APPROVED invoices:
//
//   COUNT   — how many approved invoice uploads the shop has. One per approved
//             invoice, regardless of amount.
//   BENEFIT — how many whole $500 units those invoices clear, rounded down:
//             <$500 → 0, $500–$999.99 → 1, $1,567 → 3.
//
// A $100 approved invoice is count 1, benefit 0 — that difference is the whole
// point of tracking them separately. Both count initial and subsequent
// invoices alike, and only once the invoice is approved.

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

/** Stock-Up Promotion Count: a shop's approved invoice uploads. */
export function stockUpPromotionCount(invoices: StockUpInvoice[]): number {
  return invoices.filter(isApproved).length;
}

/** Stock-Up Promotion Benefit: total $500 units across a shop's approved invoices. */
export function stockUpPromotionBenefit(invoices: StockUpInvoice[]): number {
  return invoices
    .filter(isApproved)
    .reduce((sum, inv) => sum + stockUpBenefitForAmount(inv.amount), 0);
}
