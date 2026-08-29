import { describe, expect, it } from "vitest";
import { planCustomReportWithSafeFallback } from "./customReports";

describe("Custom Report Copilot planning", () => {
  it("builds a verified contact detail plan for contacts missing an email", () => {
    const plan = planCustomReportWithSafeFallback(
      "Show a list of contacts with an empty email field."
    );

    expect(plan.supportStatus).toBe("supported");
    expect(plan.definition).toMatchObject({
      dataset: "contacts",
      mode: "detail",
      emailFilter: "missing",
      detailColumns: [
        "contact_name",
        "email",
        "lead_source",
        "assigned_isa",
        "contact_status",
        "created_at",
      ],
    });
  });

  it("builds a prior-period lead-source comparison and preserves explicit dates", () => {
    const plan = planCustomReportWithSafeFallback(
      "How many leads came from each lead source for 8/21-8/27 versus the prior period?"
    );

    expect(plan.supportStatus).toBe("supported");
    expect(plan.definition).toMatchObject({
      dataset: "contacts",
      mode: "comparison",
      groupBy: "lead_source",
      comparison: "prior_period",
      dateFrom: "2026-08-21",
      dateTo: "2026-08-27",
    });
  });

  it("uses an actual average-purchase-price measure rather than total volume", () => {
    const plan = planCustomReportWithSafeFallback(
      "Give me the average purchase price of all closed transactions by agent for this year"
    );

    expect(plan.supportStatus).toBe("supported");
    expect(plan.definition).toMatchObject({
      dataset: "transactions",
      groupBy: "agent",
      transactionStatus: "closed",
    });
    expect(plan.definition.metrics).toContain("average_purchase_price");
    expect(plan.definition.metrics).not.toContain("purchase_volume");
  });

  it("requires visible entity scoping rather than silently ignoring a named source", () => {
    const plan = planCustomReportWithSafeFallback(
      'How many leads came in for the "Affiliate Referral" lead source this week?'
    );

    expect(plan.supportStatus).toBe("needs_clarification");
    expect(plan.clarification).toContain(
      "Choose the requested people or lead sources"
    );
  });

  it("declines unsupported group and payout detail instead of substituting a generic aggregate", () => {
    const plan = planCustomReportWithSafeFallback(
      "Pull all closed transactions for the Cribs Group with Savvy GCI, agent GCI, and group leader GCI."
    );

    expect(plan.supportStatus).toBe("unsupported");
    expect(plan.unsupportedConcepts).toContain("group and payout detail");
  });
});
