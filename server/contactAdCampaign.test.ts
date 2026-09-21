import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contactInput } from "./routers/contacts";
import { AD_ATTRIBUTION_MAX_LENGTH } from "@shared/adAttribution";

const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(path.join(repoRoot, relative), "utf8");

/**
 * The ad campaign is the one attribution field on a contact that can be
 * corrected by hand.
 *
 * Four neighbouring fields — leadSourceId, leadSourceType, campaignSource and
 * partnershipName — are locked in two separate places: a guard in the contacts
 * router that throws FORBIDDEN, and a strip in updateContact that silently
 * drops them. Both lists are written out by name, so the way this feature
 * breaks is somebody adding utmCampaign to one of them while tidying up. The
 * router guard would make editing fail loudly; the db.ts strip would make it
 * fail silently, saving nothing and reporting success.
 */
describe("the ad campaign is editable", () => {
  it("accepts a campaign on the contact input", () => {
    const parsed = contactInput.partial().parse({ utmCampaign: "spring-investor-meta" });
    expect(parsed.utmCampaign).toBe("spring-investor-meta");
  });

  it("accepts null, which is how the field is cleared", () => {
    expect(contactInput.partial().parse({ utmCampaign: null }).utmCampaign).toBeNull();
  });

  /** The column is varchar(255); a longer value would be truncated by MySQL. */
  it("rejects a value longer than the column", () => {
    const tooLong = "x".repeat(AD_ATTRIBUTION_MAX_LENGTH + 1);
    expect(contactInput.partial().safeParse({ utmCampaign: tooLong }).success).toBe(false);
    expect(
      contactInput.partial().safeParse({ utmCampaign: "x".repeat(AD_ATTRIBUTION_MAX_LENGTH) }).success,
    ).toBe(true);
  });

  it("is not one of the fields the router refuses to change", () => {
    const source = read("server/routers/contacts.ts");
    const guard = source.slice(
      source.indexOf("Lead source attribution is locked") - 1200,
      source.indexOf("Lead source attribution is locked"),
    );
    expect(guard).toContain("input.data.campaignSource !== undefined");
    expect(guard).not.toContain("input.data.utmCampaign");
  });

  it("is not one of the fields updateContact strips before writing", () => {
    const source = read("server/db.ts");
    const line = source
      .split("\n")
      .find(text => text.includes("const immutableAttributionFields"));
    expect(line).toBeDefined();
    expect(line).toContain("campaignSource");
    expect(line).not.toContain("utmCampaign");
  });

  /**
   * Vitest only collects server/**, so nothing here runs the contact page. A
   * field the server accepts but the form never sends is the failure this
   * catches, and reading the page's source is the only way to catch it.
   */
  it("is sent by the contact edit form", () => {
    const page = read("client/src/pages/ContactDetail.tsx");
    expect(page).toContain("utmCampaign: editForm.utmCampaign?.trim() || null");
    expect(page).toContain("utmCampaign: (contact as any).utmCampaign ?? \"\"");
  });
});
