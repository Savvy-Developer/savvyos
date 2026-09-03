import { describe, expect, it } from "vitest";
import { smartPlansRouter } from "./smartPlans";

const adminContext = {
  user: { id: 1, role: "admin", name: "Tyler" },
} as any;

const validOneTimeSend = {
  name: "Date filter validation",
  channel: "email" as const,
  subject: "A valid subject",
  body: "A valid email body.",
  triggerLeadSourceIds: null,
};

describe("one-time send date-added audience validation", () => {
  it("rejects a date-added filter for non-source audiences", async () => {
    const caller = smartPlansRouter.createCaller(adminContext);

    await expect(
      caller.oneTimeSends.preview({
        ...validOneTimeSend,
        triggerType: "buyer_closed",
        dateAddedFrom: "2030-02-01",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an inverted date-added range before any audience query runs", async () => {
    const caller = smartPlansRouter.createCaller(adminContext);

    await expect(
      caller.oneTimeSends.preview({
        ...validOneTimeSend,
        triggerType: "all_lead_sources",
        dateAddedFrom: "2030-03-01",
        dateAddedTo: "2030-02-01",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
