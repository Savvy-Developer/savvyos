import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { getDb, getTransactions } from "./db";
import { getAnalyticsWorkspace } from "./analytics/workspace";

/**
 * This is intentionally opt-in because it reads the configured live database.
 * Run with RUN_ANALYTICS_RECONCILIATION=1 after sourcing the deployment
 * environment to prove that the Analytics under-contract snapshot and the
 * canonical Transactions source page have the same result at the same moment.
 */
const liveIt = process.env.RUN_ANALYTICS_RECONCILIATION === "1" ? it : it.skip;

describe("Analytics under-contract reconciliation", () => {
  liveIt("matches the canonical Transactions page count for an admin company scope", async () => {
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is required for the live reconciliation invariant.");

    const [admin] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);
    if (!admin || admin.role !== "admin") throw new Error("An active admin user is required for this invariant.");

    // This is exactly the count query used by the operational Transactions page:
    // status is under_contract and there is no date predicate on the snapshot.
    const transactionsPage = await getTransactions(undefined, "under_contract", undefined, 1, 1);
    const workspace = await getAnalyticsWorkspace({ id: admin.id, role: "admin" }, {});
    const reconciliation = workspace.canonicalTransactions.reconciliation;

    expect(reconciliation.status).toBe("pass");
    expect(reconciliation.canonicalCount).toBe(transactionsPage.total);
    expect(reconciliation.analyticsCount).toBe(transactionsPage.total);
    expect(workspace.canonicalTransactions.snapshot.underContractCount).toBe(transactionsPage.total);
  }, 30_000);
});
