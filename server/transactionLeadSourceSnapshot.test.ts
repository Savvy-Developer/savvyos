import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = () => readFileSync("drizzle/schema.ts", "utf-8");
const migration = () => readFileSync("drizzle/20260912_transaction_lead_source_snapshot.sql", "utf-8");
const database = () => readFileSync("server/db.ts", "utf-8");
const reporting = () => readFileSync("server/analytics/reportingSuite.ts", "utf-8");
const intelligence = () => readFileSync("server/analytics/transactionIntelligence.ts", "utf-8");
const transactionsRouter = () => readFileSync("server/routers/transactions.ts", "utf-8");
const workspace = () => readFileSync("server/analytics/workspace.ts", "utf-8");
const weeklyLeadReport = () => readFileSync("server/weeklyLeadReportScheduler.ts", "utf-8");

describe("transaction lead-source snapshots", () => {
  it("stores an immutable lead-source reference on every transaction", () => {
    expect(schema()).toContain('transactionLeadSourceId: int("transactionLeadSourceId")');
    expect(migration()).toContain("ADD COLUMN `transactionLeadSourceId`");
    expect(migration()).toContain("SET t.`transactionLeadSourceId` = c.`leadSourceId`");
  });

  it("captures the primary contact source in the central transaction writer", () => {
    const source = database();
    expect(source).toContain("const [primaryContact] = await db");
    expect(source).toContain("transactionLeadSourceId: primaryContact?.leadSourceId ?? null");
  });

  it("uses the stored transaction source for transaction filtering and reporting", () => {
    const source = database();
    expect(source).toContain("inArray(transactions.transactionLeadSourceId, leadSourceIds)");
    expect(source).toContain("eq(transactions.transactionLeadSourceId, leadSourceId)");
    expect(source).toContain("const historicalSources = historicalSourceIds");
    expect(reporting()).toContain("t.\\`transactionLeadSourceId\\`");
    expect(intelligence()).toContain("t.\\`transactionLeadSourceId\\`");
    expect(transactionsRouter()).toContain("eq(transactions.transactionLeadSourceId, leadSources.id)");
    expect(workspace()).toContain('quoteColumn("t", "transactionLeadSourceId")');
    expect(workspace()).toContain("t.\\`transactionLeadSourceId\\` AS sourceId");
    expect(weeklyLeadReport()).toContain("leadSourceId: transactions.transactionLeadSourceId");
  });
});
