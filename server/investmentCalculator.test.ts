import { describe, expect, it } from "vitest";

import {
  CALCULATOR_DEFAULTS,
  monthlyPayment,
  runCalculator,
} from "../client/src/lib/investmentCalculator";

const base = {
  purchasePrice: 500_000,
  annualRevenue: 90_000,
  downPaymentPct: CALCULATOR_DEFAULTS.downPaymentPct,
  interestRatePct: CALCULATOR_DEFAULTS.interestRatePct,
  loanTermYears: CALCULATOR_DEFAULTS.loanTermYears,
  operatingCostPct: CALCULATOR_DEFAULTS.operatingCostPct,
  annualTaxesAndInsurance: 6_000,
};

describe("monthlyPayment", () => {
  it("matches the standard amortization formula", () => {
    // $400,000 at 7% over 30 years is $2,661.21 a month.
    expect(monthlyPayment(400_000, 7, 30)).toBeCloseTo(2661.21, 1);
  });

  it("divides evenly at a zero rate rather than dividing by zero", () => {
    expect(monthlyPayment(360_000, 0, 30)).toBeCloseTo(1000, 6);
  });

  it("is zero when there is no loan", () => {
    expect(monthlyPayment(0, 7, 30)).toBe(0);
  });
});

describe("runCalculator", () => {
  it("computes a deal end to end", () => {
    const result = runCalculator(base)!;
    expect(result.downPayment).toBe(100_000);
    expect(result.loanAmount).toBe(400_000);
    expect(result.annualDebtService).toBeCloseTo(2661.21 * 12, 0);
    // 35% of 90,000 plus 6,000 of taxes and insurance.
    expect(result.operatingCosts).toBeCloseTo(37_500, 6);
    expect(result.netOperatingIncome).toBeCloseTo(52_500, 6);
    expect(result.capRate).toBeCloseTo(0.105, 6);
    expect(result.annualCashFlow).toBeCloseTo(52_500 - 2661.21 * 12, 0);
    expect(result.monthlyCashFlow).toBeCloseTo(result.annualCashFlow / 12, 6);
    expect(result.cashOnCash).toBeCloseTo(result.annualCashFlow / 100_000, 6);
  });

  /**
   * The rule that matters. An investor reading "$0 monthly cash flow" has been
   * told something false about the property. Nothing on screen tells them
   * nothing, which is the truth when a figure is missing.
   */
  it("returns nothing rather than zero when revenue is unknown", () => {
    expect(runCalculator({ ...base, annualRevenue: null })).toBeNull();
    expect(runCalculator({ ...base, annualRevenue: 0 })).toBeNull();
  });

  it("returns nothing rather than zero when the price is unknown", () => {
    expect(runCalculator({ ...base, purchasePrice: null })).toBeNull();
    expect(runCalculator({ ...base, purchasePrice: 0 })).toBeNull();
  });

  it("handles an all-cash purchase without dividing by zero", () => {
    const result = runCalculator({ ...base, downPaymentPct: 100 })!;
    expect(result.loanAmount).toBe(0);
    expect(result.annualDebtService).toBe(0);
    expect(result.cashOnCash).toBeCloseTo(52_500 / 500_000, 6);
  });

  it("reports no cash-on-cash when no cash went in", () => {
    const result = runCalculator({ ...base, downPaymentPct: 0 })!;
    // Zero down is not an infinite return, it is a return this model cannot
    // express.
    expect(result.cashOnCash).toBeNull();
    expect(result.loanAmount).toBe(500_000);
  });

  it("lets a deal come out negative rather than flooring it at zero", () => {
    const result = runCalculator({ ...base, annualRevenue: 30_000 })!;
    expect(result.annualCashFlow).toBeLessThan(0);
    expect(result.monthlyCashFlow).toBeLessThan(0);
  });

  it("keeps a nonsense percentage inside its range", () => {
    const high = runCalculator({ ...base, downPaymentPct: 250 })!;
    expect(high.downPayment).toBe(500_000);
    const low = runCalculator({ ...base, downPaymentPct: -40 })!;
    expect(low.downPayment).toBe(0);
    const costs = runCalculator({ ...base, operatingCostPct: 400 })!;
    expect(costs.operatingCosts).toBeCloseTo(90_000 + 6_000, 6);
  });

  it("ignores a negative tax and insurance figure rather than crediting it", () => {
    const result = runCalculator({ ...base, annualTaxesAndInsurance: -50_000 })!;
    expect(result.operatingCosts).toBeCloseTo(31_500, 6);
  });
});
