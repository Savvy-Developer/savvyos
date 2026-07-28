import { describe, expect, it } from "vitest";
import { analyticsRouter } from "./routers/analytics";

const nonAdminContext = {
  user: {
    id: 999_998,
    role: "agent",
  },
} as any;

describe("Lead Cohort Conversion access control", () => {
  it("rejects a non-admin before querying the focused report", async () => {
    const caller = analyticsRouter.createCaller(nonAdminContext);
    await expect(caller.leadCohortConversion({})).rejects.toThrow(
      "Lead Cohort Conversion is currently available to administrators only."
    );
  });

  it("rejects a non-admin before reading or refreshing cohort intelligence", async () => {
    const caller = analyticsRouter.createCaller(nonAdminContext);
    await expect(caller.leadCohortConversionInsights({})).rejects.toThrow(
      "Lead Cohort Conversion is currently available to administrators only."
    );
    await expect(caller.refreshLeadCohortConversionInsights({})).rejects.toThrow(
      "Lead Cohort Conversion is currently available to administrators only."
    );
  });
});
