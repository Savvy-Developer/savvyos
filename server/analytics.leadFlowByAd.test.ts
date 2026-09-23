import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  NOT_SET,
  leadFlowTotals,
  leadOutcome,
  summarizeLeadFlow,
  type LeadFlowContact,
} from "./analytics/leadFlowByAdSummary";

function lead(overrides: Partial<LeadFlowContact>): LeadFlowContact {
  return {
    contactId: 1,
    contactName: "A Lead",
    createdAt: "2026-09-01",
    utmSource: "facebook",
    utmCampaign: "Spring Investors",
    utmTerm: "Asheville 35-55",
    utmContent: "Video A",
    stage: "new_lead",
    firstBookedAt: null,
    firstContractDate: null,
    firstClosingDate: null,
    ...overrides,
  };
}

describe("leadOutcome", () => {
  it("counts only what happened on or after the day the lead came in", () => {
    expect(leadOutcome(lead({ firstBookedAt: "2026-08-20" })).booked).toBe(false);
    expect(leadOutcome(lead({ firstBookedAt: "2026-09-01" })).booked).toBe(true);
    expect(leadOutcome(lead({ firstContractDate: "2025-01-01" })).contracted).toBe(false);
  });

  it("counts a close as a contract even with no contract date, like Lead Cohort Conversion", () => {
    expect(leadOutcome(lead({ firstClosingDate: "2026-10-15" }))).toEqual({ booked: false, contracted: true, closed: true });
  });
});

describe("summarizeLeadFlow", () => {
  const contacts = [
    lead({ contactId: 1, firstBookedAt: "2026-09-02" }),
    lead({ contactId: 2, utmContent: "Video B", firstBookedAt: "2026-09-03", firstContractDate: "2026-09-20" }),
    lead({ contactId: 3, utmTerm: "Outer Banks", utmContent: "Carousel" }),
    lead({ contactId: 4, utmCampaign: "Cost Seg", utmTerm: null, utmContent: null, utmSource: "google" }),
    lead({ contactId: 5, utmCampaign: null, utmTerm: "Orphan", utmContent: null }),
  ];

  it("rolls ads up into their campaign", () => {
    const groups = summarizeLeadFlow(contacts, "campaign");
    const spring = groups.find(g => g.campaign === "Spring Investors")!;
    expect(spring.leads).toBe(3);
    expect(spring.bookedCalls).toBe(2);
    expect(spring.underContract).toBe(1);
    expect(spring.bookedPct).toBe(66.7);
    expect(groups.map(g => g.key)).toEqual(["Spring Investors", "Cost Seg", NOT_SET]);
  });

  it("splits by ad set and by ad when asked", () => {
    expect(summarizeLeadFlow(contacts, "adSet").find(g => g.key === "Spring Investors › Asheville 35-55")!.leads).toBe(2);
    const ads = summarizeLeadFlow(contacts, "ad");
    expect(ads.find(g => g.key === "Spring Investors › Asheville 35-55 › Video B")!.underContract).toBe(1);
    expect(ads.find(g => g.key === `Cost Seg › ${NOT_SET} › ${NOT_SET}`)).toBeDefined();
  });

  it("puts rows nobody can act on last", () => {
    const groups = summarizeLeadFlow(contacts, "campaign");
    expect(groups[groups.length - 1].key).toBe(NOT_SET);
  });

  it("totals add up to the rows", () => {
    const totals = leadFlowTotals(summarizeLeadFlow(contacts, "ad"));
    expect(totals).toMatchObject({ leads: 5, bookedCalls: 2, underContract: 1, closed: 0 });
  });
});

describe("wiring", () => {
  const root = path.resolve(import.meta.dirname, "..");
  it("is an admin-only analytics report with its own page", () => {
    const router = readFileSync(path.join(root, "server/routers/analytics.ts"), "utf8");
    const procedure = router.slice(router.indexOf("leadFlowByAd: protectedProcedure"), router.indexOf("leadCohortConversion: protectedProcedure"));
    expect(procedure).toContain('ctx.user.role !== "admin"');
    const app = readFileSync(path.join(root, "client/src/App.tsx"), "utf8");
    expect(app).toContain('path="/analytics/lead-flow-by-ad"');
  });
});
