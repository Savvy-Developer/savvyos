import { describe, expect, it } from "vitest";
import {
  calculatePartnerSalesCycleDays,
  resolveExpectedReferralPayout,
} from "./partnerPortalMetrics";

describe("partner portal transaction metrics", () => {
  it("uses the recorded referral payout when it exists", () => {
    expect(resolveExpectedReferralPayout({
      recordedPayoutAmount: "2500.50",
      grossCommissionIncome: "10000.00",
      transactionReferralPayoutPct: "20.00",
      sourceReferralPct: 15,
    })).toBe(2500.5);
  });

  it("falls back to the transaction payout percentage before the lead-source rate", () => {
    expect(resolveExpectedReferralPayout({
      grossCommissionIncome: "10000.00",
      transactionReferralPayoutPct: "25.00",
      sourceReferralPct: 15,
    })).toBe(2500);
  });

  it("uses the lead-source percentage for legacy transactions without payout data", () => {
    expect(resolveExpectedReferralPayout({
      grossCommissionIncome: 12000,
      sourceReferralPct: 15,
    })).toBe(1800);
  });

  it("does not invent an expected payout when the required transaction data is missing", () => {
    expect(resolveExpectedReferralPayout({
      sourceReferralPct: 15,
    })).toBeNull();
  });

  it("measures closed sales cycles from lead introduction through close", () => {
    expect(calculatePartnerSalesCycleDays({
      leadSubmittedAt: "2026-01-01T00:00:00.000Z",
      transactionStatus: "closed",
      closingDate: "2026-01-11T00:00:00.000Z",
    })).toBe(10);
  });

  it("shows the elapsed sales cycle for an active transaction", () => {
    expect(calculatePartnerSalesCycleDays({
      leadSubmittedAt: "2026-01-01T00:00:00.000Z",
      transactionStatus: "under_contract",
      closingDate: "2026-01-10T00:00:00.000Z",
      now: new Date("2026-01-08T00:00:00.000Z"),
    })).toBe(7);
  });
});
