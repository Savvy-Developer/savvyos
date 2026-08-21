import { describe, expect, it } from "vitest";
import { businessInsightTestApi } from "./businessInsights";

describe("AI Business Insights production snapshot", () => {
  it("preserves closed production and live pipeline metrics through the sanitized fact pack", () => {
    const rawReports = {
      transactionStatistics: {
        summary: {
          // The status=all summary includes both closed and terminated outcomes.
          closedUnits: 442,
          grossCommission: 11_435_945.57,
          savvyNet: 0,
        },
        statuses: [
          {
            status: "closed",
            units: 442,
            volume: 188_319_120,
            grossCommission: 8_539_355.04,
            savvyNet: 0,
          },
          {
            status: "terminated",
            units: 115,
            volume: 0,
            grossCommission: 2_896_590.53,
            savvyNet: 0,
          },
        ],
        pipeline: {
          units: 103,
          volume: 0,
          grossCommission: 2_497_429.58,
          savvyNet: 0,
        },
        flags: {},
      },
      taskExecution: { summary: { overdue: 0 } },
      isaAppointmentsAndFunnel: { totalAppointmentsSet: 0 },
      leadCohortConversion: { summary: {} },
      transactionEconomics: { actuals: {} },
    };

    const factPack = businessInsightTestApi.buildFactPack(rawReports);
    const snapshot = factPack.companyProductionSnapshot;
    const fallback = businessInsightTestApi.buildDeterministicFallback(factPack);

    expect(snapshot.ytdClosed).toMatchObject({
      units: 442,
      grossCommission: 8_539_355.04,
    });
    expect(snapshot.currentUnderContract).toMatchObject({ units: 103 });
    expect(fallback.executiveSummary).toContain("442 YTD closed units");
    expect(fallback.executiveSummary).toContain("$8,539,355 in recorded GCI");
    expect(fallback.executiveSummary).toContain("103 current under-contract units");
  });
});
