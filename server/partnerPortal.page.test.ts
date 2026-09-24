import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const portalPage = () => readFileSync("client/src/pages/PartnerPortalPage.tsx", "utf-8");
const portalRouter = () => readFileSync("server/routers/partnerPortal.ts", "utf-8");

describe("partner portal visibility contract", () => {
  it("shows the requested lead and transaction visibility fields", () => {
    const page = portalPage();

    expect(page).toContain("Client last name");
    expect(page).toContain("Client email");
    expect(page).toContain("Sales cycle");
    expect(page).toContain("GCI");
    expect(page).toContain("Expected referral payout");
    expect(page).toContain("lead.lastName");
    expect(page).toContain("lead.email");
    expect(page).toContain("transaction.salesCycleDays");
    expect(page).toContain("transaction.grossCommissionIncome");
    expect(page).toContain("transaction.expectedReferralPayout");
  });

  it("returns the added fields only through the source-scoped portal query", () => {
    const router = portalRouter();

    expect(router).toContain("email: contacts.email");
    expect(router).toContain("sourceReferralPct: leadSources.referralPercent");
    expect(router).toContain("transactionPayoutItems");
    expect(router).toContain("resolveExpectedReferralPayout");
    expect(router).toContain("calculatePartnerSalesCycleDays");
    expect(router).toContain("inArray(contacts.leadSourceId, sourceIds)");
  });
});
