import { describe, expect, it } from "vitest";
import { analyticsRouter } from "./routers/analytics";

const nonAdminContext = {
  user: {
    id: 999_999,
    role: "agent",
  },
} as any;

describe("Transaction Intelligence access control", () => {
  it("rejects a non-admin before querying the focused report", async () => {
    const caller = analyticsRouter.createCaller(nonAdminContext);
    await expect(caller.transactionIntelligence({})).rejects.toThrow(
      "Transaction Intelligence is currently available to administrators only."
    );
  });

  it("rejects a non-admin before reading or refreshing report intelligence", async () => {
    const caller = analyticsRouter.createCaller(nonAdminContext);
    await expect(caller.transactionIntelligenceInsights({})).rejects.toThrow(
      "Transaction Intelligence is currently available to administrators only."
    );
    await expect(caller.refreshTransactionIntelligenceInsights({})).rejects.toThrow(
      "Transaction Intelligence is currently available to administrators only."
    );
  });
});
