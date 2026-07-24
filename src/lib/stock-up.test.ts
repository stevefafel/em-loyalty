import { describe, it, expect } from "vitest";
import {
  stockUpPromotionsForAmount,
  totalStockUpPromotions,
} from "./stock-up";

describe("stockUpPromotionsForAmount", () => {
  it("earns nothing below $500", () => {
    expect(stockUpPromotionsForAmount(0)).toBe(0);
    expect(stockUpPromotionsForAmount(499.99)).toBe(0);
  });

  it("earns one promotion from $500 up to just under $1000", () => {
    expect(stockUpPromotionsForAmount(500)).toBe(1);
    expect(stockUpPromotionsForAmount(999.99)).toBe(1);
  });

  it("rounds down to the nearest whole $500 multiple", () => {
    expect(stockUpPromotionsForAmount(1000)).toBe(2);
    expect(stockUpPromotionsForAmount(1567)).toBe(3);
  });

  it("ignores non-finite amounts", () => {
    expect(stockUpPromotionsForAmount(NaN)).toBe(0);
    expect(stockUpPromotionsForAmount(-100)).toBe(0);
  });
});

describe("totalStockUpPromotions", () => {
  it("sums only approved invoices", () => {
    const invoices = [
      { amount: 1567, status: "approved" }, // 3
      { amount: 500, status: "approved" }, // 1
      { amount: 2000, status: "pending" }, // ignored
      { amount: 900, status: "rejected" }, // ignored
    ];
    expect(totalStockUpPromotions(invoices)).toBe(4);
  });

  it("is zero with no approved invoices", () => {
    expect(totalStockUpPromotions([{ amount: 5000, status: "pending" }])).toBe(0);
  });
});
