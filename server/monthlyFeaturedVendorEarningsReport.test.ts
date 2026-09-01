import { describe, expect, it } from "vitest";
import {
  getNextMonthlyFeaturedVendorEarningsAt9AmEastern,
  previousEasternMonthWindow,
  renderAgentFeaturedVendorEarningsReport,
  renderFeaturedVendorLeadershipReport,
  type FeaturedVendorMonthlyEarningsReport,
} from "./monthlyFeaturedVendorEarningsReport";
import { calculateAgentEarningsCents, formatUsdFromCents } from "./vendorBilling";

const report: FeaturedVendorMonthlyEarningsReport = {
  reportDate: "2026-09-01",
  reportDateLabel: "Sep 1, 2026",
  periodStart: new Date("2026-08-01T04:00:00.000Z"),
  periodEnd: new Date("2026-09-01T04:00:00.000Z"),
  periodLabel: "August 2026",
  agents: [{
    agentId: 22,
    agentName: "Casey Agent",
    agentEmail: "casey@example.com",
    payments: [{
      paymentId: 7,
      vendorName: "Blue Ridge Turnover Co.",
      amountPaidCents: 7_500,
      agentEarningsCents: 5_625,
      paidAt: new Date("2026-08-15T16:00:00.000Z"),
    }],
    grossCollectedCents: 7_500,
    agentEarningsCents: 5_625,
    savvyShareCents: 1_875,
  }],
  grossCollectedCents: 7_500,
  agentEarningsCents: 5_625,
  savvyShareCents: 1_875,
  leadershipRecipients: [{ name: "Tyler", email: "tyler@savvy.realty" }],
};

describe("featured vendor billing calculations", () => {
  it("calculates agent earnings from gross successful payments", () => {
    expect(calculateAgentEarningsCents(7_500)).toBe(5_625);
    expect(calculateAgentEarningsCents(101)).toBe(76);
    expect(formatUsdFromCents(5_625)).toBe("$56.25");
  });

  it("uses the prior full Eastern calendar month as the reporting window", () => {
    const window = previousEasternMonthWindow(new Date("2026-09-01T14:00:00.000Z"));
    expect(window.periodLabel).toBe("August 2026");
    expect(window.periodStart.toISOString()).toBe("2026-08-01T04:00:00.000Z");
    expect(window.periodEnd.toISOString()).toBe("2026-09-01T04:00:00.000Z");
  });

  it("schedules the next first-of-month 9 AM report in Eastern time", () => {
    expect(getNextMonthlyFeaturedVendorEarningsAt9AmEastern(new Date("2026-09-01T12:00:00.000Z")).toISOString()).toBe("2026-09-01T13:00:00.000Z");
    expect(getNextMonthlyFeaturedVendorEarningsAt9AmEastern(new Date("2026-09-01T14:00:00.000Z")).toISOString()).toBe("2026-10-01T13:00:00.000Z");
  });

  it("renders leadership and private agent reports with the correct revenue shares", () => {
    const leadership = renderFeaturedVendorLeadershipReport(report);
    const agent = renderAgentFeaturedVendorEarningsReport(report, report.agents[0]);
    expect(leadership).toContain("$75.00");
    expect(leadership).toContain("$56.25");
    expect(leadership).toContain("$18.75");
    expect(agent).toContain("Blue Ridge Turnover Co.");
    expect(agent).toContain("$56.25");
    expect(agent).toContain("Savvy will process payment separately");
  });
});
