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
  it("counts approved invoices regardless of amount", () => {
    const invoices = [
      { amount: 1567, status: "approved" },
      { amount: 500, status: "approved" },
      { amount: 2000, status: "pending" }, // ignored
      { amount: 900, status: "rejected" }, // ignored
    ];
    expect(stockUpPromotionCount(invoices)).toBe(2);
  });

  it("counts an approved invoice that earns no benefit", () => {
    // A $100 invoice is still one approved stock-up upload (count 1),
    // even though it clears no $500 unit (benefit 0). This is exactly the
    // count-vs-benefit distinction.
    const invoices = [{ amount: 100, status: "approved" }];
    expect(stockUpPromotionCount(invoices)).toBe(1);
    expect(stockUpPromotionBenefit(invoices)).toBe(0);
  });

  it("is zero with no approved invoices", () => {
    expect(stockUpPromotionCount([{ amount: 5000, status: "pending" }])).toBe(0);
  });
});
