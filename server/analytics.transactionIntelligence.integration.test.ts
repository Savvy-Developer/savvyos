import { describe, expect, it } from "vitest";
import { getDb, getTransactions } from "./db";
import { getTransactionIntelligenceReport } from "./analytics/transactionIntelligence";

/**
 * This invariant is intentionally opt-in because it reads the configured live
 * database. It proves that the dedicated report's live under-contract snapshot
 * uses the same status semantics as the canonical Transactions source page.
 */
const liveIt = process.env.RUN_TRANSACTION_INTELLIGENCE_RECONCILIATION === "1" ? it : it.skip;

describe("Transaction Intelligence reconciliation", () => {
  liveIt("matches the canonical Transactions live under-contract count", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for the live reconciliation invariant.");

    const transactionsPage = await getTransactions(undefined, "under_contract", undefined, 1, 1);
    const report = await getTransactionIntelligenceReport({});

    expect(report.scope.financeVisible).toBe(true);
    expect(report.pipeline.units).toBe(transactionsPage.total);
    expect(report.actuals.units).toBeGreaterThanOrEqual(0);
    expect(report.actuals.recordedPayoutTransactions).toBeLessThanOrEqual(report.actuals.units);
    expect(report.actuals.payoutCoveragePct === null || report.actuals.payoutCoveragePct <= 100).toBe(true);
    expect(report.evidence.length).toBeLessThanOrEqual(75);
  }, 45_000);
});
