import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./_core/resendEmail", () => ({ sendTransactionalEmail: vi.fn() }));
vi.mock("../drizzle/schema", () => ({
  scheduledReportRuns: {},
  transactions: {},
  users: {},
}));

import {
  addEasternDays,
  aggregateAgentProductionMetrics,
  easternDateTimeToUtc,
  getNextFridayAt6PmEastern,
  renderAgentProductionTable,
  type AgentProductionReport,
} from "./agentProductionReportScheduler";

const asOf = new Date("2026-07-17T22:00:00.000Z"); // Friday, 6:00 PM EDT

function transaction(agentId: number, purchasePrice: number, dates: { contractDate?: string; closingDate?: string }) {
  return {
    agentId,
    purchasePrice,
    contractDate: dates.contractDate ? new Date(dates.contractDate) : null,
    closingDate: dates.closingDate ? new Date(dates.closingDate) : null,
  };
}

describe("Agent production report scheduling", () => {
  it("converts 6 PM Eastern correctly in daylight and standard time", () => {
    expect(easternDateTimeToUtc("2026-07-17", 18).toISOString()).toBe("2026-07-17T22:00:00.000Z");
    expect(easternDateTimeToUtc("2026-01-16", 18).toISOString()).toBe("2026-01-16T23:00:00.000Z");
  });

  it("calculates the next Friday at 6 PM Eastern across DST", () => {
    expect(getNextFridayAt6PmEastern(new Date("2026-07-13T13:00:00.000Z")).toISOString()).toBe("2026-07-17T22:00:00.000Z");
    expect(getNextFridayAt6PmEastern(new Date("2026-01-12T14:00:00.000Z")).toISOString()).toBe("2026-01-16T23:00:00.000Z");
  });

  it("keeps Eastern calendar-day helpers stable across a timezone boundary", () => {
    expect(addEasternDays("2026-07-17", -7)).toBe("2026-07-10");
    expect(addEasternDays("2026-03-09", -7)).toBe("2026-03-02");
  });
});

describe("Agent production report aggregation", () => {
  it("reports current under-contract, new under-contract, and closed time windows per active agent", () => {
    const rows = aggregateAgentProductionMetrics(
      [
        { id: 1, name: "Sarah Mitchell" },
        { id: 2, name: "Jordan Lee" },
        { id: 3, name: "Zero Production" },
      ],
      [
        transaction(1, 500_000, { contractDate: "2026-07-12T12:00:00.000Z" }),
        transaction(1, 325_000, { contractDate: "2026-07-01T12:00:00.000Z" }),
        transaction(2, 410_000, { contractDate: "2026-07-10T23:00:00.000Z" }),
      ],
      [
        transaction(1, 500_000, { contractDate: "2026-07-12T12:00:00.000Z" }),
        transaction(1, 725_000, { contractDate: "2026-07-13T12:00:00.000Z" }), // Later left under contract
        transaction(2, 410_000, { contractDate: "2026-07-10T23:00:00.000Z" }),
      ],
      [
        transaction(1, 600_000, { closingDate: "2026-07-15T16:00:00.000Z" }),
        transaction(1, 425_000, { closingDate: "2026-06-30T16:00:00.000Z" }),
        transaction(2, 350_000, { closingDate: "2026-01-22T16:00:00.000Z" }),
        transaction(2, 700_000, { closingDate: "2025-12-30T16:00:00.000Z" }),
      ],
      asOf,
    );

    const sarah = rows.find((row) => row.agentId === 1)!;
    const jordan = rows.find((row) => row.agentId === 2)!;
    const zero = rows.find((row) => row.agentId === 3)!;

    expect(sarah.currentUnderContract).toEqual({ units: 2, volume: 825_000 });
    expect(sarah.newUnderContract7d).toEqual({ units: 2, volume: 1_225_000 });
    expect(sarah.closed7d).toEqual({ units: 1, volume: 600_000 });
    expect(sarah.closed30d).toEqual({ units: 2, volume: 1_025_000 });
    expect(sarah.closedMtd).toEqual({ units: 1, volume: 600_000 });
    expect(sarah.closedYtd).toEqual({ units: 2, volume: 1_025_000 });

    expect(jordan.currentUnderContract).toEqual({ units: 1, volume: 410_000 });
    expect(jordan.newUnderContract7d).toEqual({ units: 1, volume: 410_000 });
    expect(jordan.closed7d).toEqual({ units: 0, volume: 0 });
    expect(jordan.closed30d).toEqual({ units: 0, volume: 0 });
    expect(jordan.closedMtd).toEqual({ units: 0, volume: 0 });
    expect(jordan.closedYtd).toEqual({ units: 1, volume: 350_000 });
    expect(zero.currentUnderContract).toEqual({ units: 0, volume: 0 });
  });

  it("renders all requested measures in a readable HTML table with a total row", () => {
    const report: AgentProductionReport = {
      reportDate: "July 17, 2026",
      reportDateKey: "2026-07-17",
      asOfLabel: "Friday, July 17, 2026 at 6:00 PM EDT",
      rows: [
        {
          agentId: 1,
          agentName: "Sarah Mitchell",
          currentUnderContract: { units: 1, volume: 500_000 },
          newUnderContract7d: { units: 1, volume: 500_000 },
          closed7d: { units: 1, volume: 600_000 },
          closed30d: { units: 1, volume: 600_000 },
          closedMtd: { units: 1, volume: 600_000 },
          closedYtd: { units: 1, volume: 600_000 },
        },
      ],
      totals: {
        currentUnderContract: { units: 1, volume: 500_000 },
        newUnderContract7d: { units: 1, volume: 500_000 },
        closed7d: { units: 1, volume: 600_000 },
        closed30d: { units: 1, volume: 600_000 },
        closedMtd: { units: 1, volume: 600_000 },
        closedYtd: { units: 1, volume: 600_000 },
      },
    };

    const html = renderAgentProductionTable(report);
    expect(html).toContain("Current Under Contract");
    expect(html).toContain("New Under Contract · 7 Days");
    expect(html).toContain("Closed · 7 Days");
    expect(html).toContain("Closed · 30 Days");
    expect(html).toContain("Closed · MTD");
    expect(html).toContain("Closed · YTD");
    expect(html).toContain("Sarah Mitchell");
    expect(html).toContain("Total");
    expect(html).toContain("$600,000");
  });
});
