import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./_core/resendEmail", () => ({ sendTransactionalEmail: vi.fn() }));
vi.mock("../drizzle/schema", () => ({
  contacts: {},
  referralAgents: {},
  referralPayments: {},
  referrals: {},
  referralStatusOptions: {},
  scheduledReportRuns: {},
  users: {},
  webinarAttendees: {},
  webinars: {},
}));

import {
  getNextMondayAtNoonEastern,
  renderWeeklyReferralReport,
  renderWeeklyWebinarReport,
  type WeeklyReferralReport,
  type WeeklyWebinarReport,
} from "./weeklyOperationsReportsScheduler";

describe("weekly operations report scheduling", () => {
  it("calculates Monday noon Eastern correctly in daylight and standard time", () => {
    expect(getNextMondayAtNoonEastern(new Date("2026-07-13T13:00:00.000Z")).toISOString()).toBe("2026-07-13T16:00:00.000Z");
    expect(getNextMondayAtNoonEastern(new Date("2026-01-12T14:00:00.000Z")).toISOString()).toBe("2026-01-12T17:00:00.000Z");
    expect(getNextMondayAtNoonEastern(new Date("2026-07-13T16:00:00.000Z")).toISOString()).toBe("2026-07-20T16:00:00.000Z");
  });
});

describe("weekly operations report rendering", () => {
  it("renders all requested upcoming webinar fields and escapes source data", () => {
    const report: WeeklyWebinarReport = {
      reportDateKey: "2026-07-13",
      asOfLabel: "Monday, July 13, 2026 at 12:00 PM EDT",
      rows: [{
        id: 1,
        title: "STR Tax Strategies <script>alert(1)</script>",
        startTime: new Date("2026-07-15T17:00:00.000Z"),
        timezone: "America/New_York",
        createdBy: "Alex Host",
        registeredAttendees: 24,
      }],
    };
    const html = renderWeeklyWebinarReport(report);
    expect(html).toContain("Upcoming Webinars");
    expect(html).toContain("Created by");
    expect(html).toContain("Registered");
    expect(html).toContain("Alex Host");
    expect(html).toContain("24");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("keeps unpaid referral fees visible while reporting sent, under-contract, and recent-closed referrals", () => {
    const referral = {
      id: 9,
      clientName: "Jordan Investor",
      referralAgent: "Taylor Agent",
      brokerage: "Mountain Realty",
      market: "Asheville, NC",
      status: "Under Contract",
      statusKey: "under_contract",
      referralSentAt: new Date("2026-07-10T16:00:00.000Z"),
      underContractAt: new Date("2026-07-11T16:00:00.000Z"),
      closedAt: null,
    };
    const report: WeeklyReferralReport = {
      reportDateKey: "2026-07-13",
      weekLabel: "Jul 7–Jul 13, 2026",
      asOfLabel: "Monday, July 13, 2026 at 12:00 PM EDT",
      sent: [referral],
      underContract: [referral],
      closedLast30Days: [{ ...referral, id: 10, clientName: "Casey Buyer", status: "Closed", statusKey: "closed", closedAt: new Date("2026-07-02T16:00:00.000Z") }],
      unpaid: [{ ...referral, paymentId: 4, paymentStatus: "invoiced", feeOwed: 3250, dueAt: new Date("2026-07-12T16:00:00.000Z"), paymentNote: null }],
    };
    const html = renderWeeklyReferralReport(report);
    expect(html).toContain("Referrals sent this week");
    expect(html).toContain("Currently under contract");
    expect(html).toContain("Closed in the last 30 days");
    expect(html).toContain("Unpaid referral fees");
    expect(html).toContain("Taylor Agent");
    expect(html).toContain("$3,250");
    expect(html).toContain("Casey Buyer");
  });
});
