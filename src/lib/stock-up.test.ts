import { describe, it, expect } from "vitest";
import {
  stockUpBenefitForAmount,
  stockUpPromotionBenefit,
  stockUpPromotionCount,
} from "./stock-up";

describe("stockUpBenefitForAmount", () => {
  it("earns nothing below $500", () => {
    expect(stockUpBenefitForAmount(0)).toBe(0);
    expect(stockUpBenefitForAmount(499.99)).toBe(0);
  });

  it("earns one benefit unit from $500 up to just under $1000", () => {
    expect(stockUpBenefitForAmount(500)).toBe(1);
    expect(stockUpBenefitForAmount(999.99)).toBe(1);
  });

  it("rounds down to the nearest whole $500 multiple", () => {
    expect(stockUpBenefitForAmount(1000)).toBe(2);
    expect(stockUpBenefitForAmount(1567)).toBe(3);
  });

  it("ignores non-finite amounts", () => {
    expect(stockUpBenefitForAmount(NaN)).toBe(0);
    expect(stockUpBenefitForAmount(-100)).toBe(0);
  });
});

describe("stockUpPromotionBenefit", () => {
  it("sums benefit units across approved invoices only", () => {
    const invoices = [
      { amount: 1567, status: "approved" }, // 3
      { amount: 500, status: "approved" }, // 1
      { amount: 2000, status: "pending" }, // ignored
      { amount: 900, status: "rejected" }, // ignored
    ];
    expect(stockUpPromotionBenefit(invoices)).toBe(4);
  });

  it("is zero with no approved invoices", () => {
    expect(stockUpPromotionBenefit([{ amount: 5000, status: "pending" }])).toBe(0);
  });
});

describe("stockUpPromotionCount", () => {
  it("counts each approved invoice that clears the $500 minimum", () => {
    const invoices = [
      { amount: 1567, status: "approved" }, // counts once, not three times
      { amount: 500, status: "approved" }, // exactly the minimum counts
      { amount: 2000, status: "pending" }, // ignored
      { amount: 900, status: "rejected" }, // ignored
    ];
    expect(stockUpPromotionCount(invoices)).toBe(2);
  });

  it("does not count an approved invoice below the $500 minimum", () => {
    // A qualifying invoice is worth exactly one promotion no matter how far
    // above $500 it lands; below $500 it is worth none. Benefit is the axis
    // that scales with amount, not count.
    const invoices = [{ amount: 499.99, status: "approved" }];
    expect(stockUpPromotionCount(invoices)).toBe(0);
    expect(stockUpPromotionBenefit(invoices)).toBe(0);
  });

  it("counts one promotion but many benefit units for a large invoice", () => {
    const invoices = [{ amount: 1567, status: "approved" }];
    expect(stockUpPromotionCount(invoices)).toBe(1);
    expect(stockUpPromotionBenefit(invoices)).toBe(3);
  });

  it("is zero with no approved invoices", () => {
    expect(stockUpPromotionCount([{ amount: 5000, status: "pending" }])).toBe(0);
  });
});
