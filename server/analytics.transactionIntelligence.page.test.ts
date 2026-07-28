import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const reportPage = () => readFileSync("client/src/pages/TransactionIntelligencePage.tsx", "utf-8");
const transactionsPage = () => readFileSync("client/src/pages/TransactionsPage.tsx", "utf-8");
const analyticsRouter = () => readFileSync("server/routers/analytics.ts", "utf-8");

describe("Transaction Intelligence report — stable decision and evidence contract", () => {
  it("keeps closed production, recorded Savvy Net, and commission comparisons visible", () => {
    const content = reportPage();
    expect(content).toContain("Closed units");
    expect(content).toContain("Closed volume");
    expect(content).toContain("Avg. purchase price");
    expect(content).toContain("Recorded Savvy Net");
    expect(content).toContain("Average recorded commission rate");
    expect(content).toContain("Buyer, seller, and dual production");
    expect(content).toContain("Avg. commission");
  });

  it("makes source records and live under-contract evidence explicit rather than mixing them", () => {
    const content = reportPage();
    expect(content).toContain("Closed source records");
    expect(content).toContain("Open all matching closings");
    expect(content).toContain("Live under-contract inventory");
    expect(content).toContain('status: "under_contract", includeClosedDateRange: false');
  });

  it("encodes report context in each evidence handoff and validates it on Transactions", () => {
    const report = reportPage();
    const transactions = transactionsPage();
    expect(report).toContain('report: "transaction-intelligence", returnTo: location');
    expect(report).toContain('params.set("closingDateFrom"');
    expect(transactions).toContain('candidate.startsWith("/analytics")');
    expect(transactions).toContain('params.get("analytics") !== "1"');
    expect(transactions).toContain("Back to report");
  });

  it("exposes data and insight endpoints through explicit administrator gates", () => {
    const router = analyticsRouter();
    expect(router).toContain("transactionIntelligence: protectedProcedure");
    expect(router).toContain("transactionIntelligenceInsights: protectedProcedure");
    expect(router).toContain("refreshTransactionIntelligenceInsights: protectedProcedure");
    const focusedSection = router.slice(router.indexOf("transactionIntelligence: protectedProcedure"));
    expect(focusedSection).toContain('ctx.user.role !== "admin"');
    expect(focusedSection).toContain("Transaction Intelligence is currently available to administrators only.");
  });
});
