import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isFromOldSite, matchesListingFilter, matchesListingSearch, type ListingRow } from "@shared/websiteListingFilters";

const base: ListingRow = {
  id: 1,
  propertyId: 2178,
  slug: "430-sugar-cove-way",
  status: "draft",
  sourceUrl: "https://www.savvy-agents.com/properties/430-sugar-cove-way",
  heroImageUrl: "https://photos.zillowstatic.com/a.jpg",
  address: "430 Sugar Cove Way",
  city: "Newport",
  state: "TN",
  zip: "37821",
  beds: "3",
  baths: "2",
  listPrice: "450000",
  assignedAgentName: "Tyler Coon",
};

describe("website listings filters", () => {
  it("sorts drafts into ready and needs details by the publish checklist", () => {
    expect(matchesListingFilter(base, "draft")).toBe(true);
    expect(matchesListingFilter(base, "ready")).toBe(true);
    expect(matchesListingFilter(base, "needs")).toBe(false);
    const noZip = { ...base, zip: null };
    expect(matchesListingFilter(noZip, "ready")).toBe(false);
    expect(matchesListingFilter(noZip, "needs")).toBe(true);
  });

  it("never counts a live or archived listing as ready or needing details", () => {
    for (const status of ["published", "archived"] as const) {
      expect(matchesListingFilter({ ...base, status }, "ready")).toBe(false);
      expect(matchesListingFilter({ ...base, status, zip: null }, "needs")).toBe(false);
      expect(matchesListingFilter({ ...base, status }, status)).toBe(true);
      expect(matchesListingFilter({ ...base, status }, "draft")).toBe(false);
    }
  });

  it("knows which listings came from the old site", () => {
    expect(isFromOldSite(base)).toBe(true);
    expect(isFromOldSite({ sourceUrl: "https://savvy-agents.com/properties/x" })).toBe(true);
    expect(isFromOldSite({ sourceUrl: "https://www.zillow.com/homedetails/x" })).toBe(false);
    expect(isFromOldSite({ sourceUrl: null })).toBe(false);
    expect(matchesListingFilter({ ...base, sourceUrl: null }, "old-site")).toBe(false);
  });

  it("searches address, city, state, ZIP and agent, ignoring case", () => {
    expect(matchesListingSearch(base, "sugar")).toBe(true);
    expect(matchesListingSearch(base, "NEWPORT")).toBe(true);
    expect(matchesListingSearch(base, "37821")).toBe(true);
    expect(matchesListingSearch(base, "tyler")).toBe(true);
    expect(matchesListingSearch(base, "  ")).toBe(true);
    expect(matchesListingSearch(base, "gulf shores")).toBe(false);
  });
});

describe("wiring", () => {
  const page = readFileSync(path.resolve(import.meta.dirname, "../client/src/pages/WebsitePage.tsx"), "utf8");
  it("shows the Listings tab only to people who manage website properties", () => {
    expect(page).toContain('{ key: "listings", label: "Listings", icon: Building2 }');
    expect(page).toContain('(item.key !== "listings" || can("canManageWebsiteProperties"))');
    expect(page).toContain('tab === "listings" && can("canManageWebsiteProperties")');
  });
  it("opens each listing on its property's Website tab", () => {
    const panel = readFileSync(
      path.resolve(import.meta.dirname, "../client/src/components/website/WebsiteListingsPanel.tsx"),
      "utf8"
    );
    expect(panel).toContain("navigate(`/properties/${row.propertyId}?tab=website`)");
  });
});
