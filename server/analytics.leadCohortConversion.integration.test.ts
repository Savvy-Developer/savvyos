import { describe, expect, it } from "vitest";
import { getLeadCohortConversionReport } from "./analytics/leadCohortConversion";

/**
 * This is opt-in because it reads the configured live database. It validates
 * the report's internal accounting invariants without writing data or assuming
 * any particular production outcome volume.
 */
const liveIt = process.env.RUN_LEAD_COHORT_RECONCILIATION === "1" ? it : it.skip;

function localDay(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

describe("Lead Cohort Conversion reconciliation", () => {
  liveIt("keeps cohort denominator, current-stage population, and evidence aligned", async () => {
    const today = new Date();
    const dateFrom = localDay(new Date(today.getFullYear(), 0, 1));
    const report = await getLeadCohortConversionReport({ dateFrom, dateTo: localDay(today) });
    const stagePopulation = report.currentStages.reduce((total, row) => total + row.contacts, 0);

    expect(report.definitionVersion).toBe("lead-cohort-conversion-v1");
    expect(report.summary.cohortLeads).toBeGreaterThanOrEqual(0);
    expect(stagePopulation).toBe(report.summary.cohortLeads);
    expect(report.summary.contractedContacts).toBeLessThanOrEqual(report.summary.cohortLeads);
    expect(report.summary.closedContacts).toBeLessThanOrEqual(report.summary.cohortLeads);
    expect(report.summary.closedContacts).toBeLessThanOrEqual(report.summary.contractedContacts);
    expect(report.summary.closeConversionPct === null || report.summary.closeConversionPct <= 100).toBe(true);
    expect(report.summary.contractConversionPct === null || report.summary.contractConversionPct <= 100).toBe(true);
    expect(report.evidence.length).toBeLessThanOrEqual(150);
    expect(report.evidenceTotal).toBe(report.summary.cohortLeads);
    expect(report.evidence.every((row) => row.convertedToClose ? row.daysToClose !== null && row.daysToClose >= 0 : true)).toBe(true);
    expect(report.evidence.every((row) => row.convertedToContract ? row.daysToContract !== null && row.daysToContract >= 0 : true)).toBe(true);
  }, 60_000);
});
