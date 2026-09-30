import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  OLD_SITE_STORAGE,
  mapOldListing,
  oldPhotoUrls,
  oldTagLabel,
  oldTags,
  splitRange,
  streetKey,
  type OldListing,
} from "./oldSiteListingImportLogic";
import { buildMetaCatalogCsv, catalogDescription, csvEscape } from "./websiteMetaCatalog";
import { missingForPublish } from "@shared/websitePublishChecklist";

const OLD: OldListing = {
  id: "15f7e9cf-c3c5-449b-8060-2d443e52c503",
  slug: "361-preacher-hill-rd-cresco-7ud9ov",
  address: "361 Preacher Hill Rd",
  city: "Cresco",
  state: "pa",
  zipCode: "18326",
  title: "361 Preacher Hill Rd",
  description: "Poconos cabin with a hot tub.",
  price: 499000,
  bedrooms: 4,
  bathrooms: "2.5",
  sqft: 1800,
  yearBuilt: 1985,
  propertyType: "single_family",
  strategyTags: ["family-friendly", "remote-work"],
  amenityTags: ["hot tub", "EV charger", "Family-Friendly"],
  photos: [
    { externalUrl: "https://photos.zillowstatic.com/b.jpg", displayOrder: 2 },
    { storagePath: "property-photos/a.jpg", displayOrder: 1, isPrimary: true },
    { externalUrl: "https://photos.zillowstatic.com/b.jpg", displayOrder: 3 },
  ],
  market: { name: "Poconos" },
  agent: { slug: "Tyler-Coon", profile: { email: "Tyler@Savvy.Realty", fullName: "Tyler Coon" } },
};

describe("old listing mapping", () => {
  it("keeps the old slug, facts and agent", () => {
    const mapped = mapOldListing(OLD, "2026-09-30");
    expect(mapped.website.slug).toBe("361-preacher-hill-rd-cresco-7ud9ov");
    expect(mapped.website.sourceUrl).toBe("https://www.savvy-agents.com/properties/361-preacher-hill-rd-cresco-7ud9ov");
    expect(mapped.property).toMatchObject({
      address: "361 Preacher Hill Rd",
      city: "Cresco",
      state: "PA",
      zip: "18326",
      beds: "4",
      baths: "2.5",
      sqft: 1800,
      yearBuilt: 1985,
      propertyType: "single_family",
      listPrice: "499000",
    });
    expect(mapped.agentSlug).toBe("tyler-coon");
    expect(mapped.agentEmail).toBe("tyler@savvy.realty");
    expect(mapped.website.importedData).toMatchObject({ source: "savvy-agents.com", oldId: OLD.id, oldMarket: "Poconos" });
  });

  it("puts the primary photo first, drops repeats, and builds storage addresses", () => {
    expect(oldPhotoUrls(OLD.photos)).toEqual([`${OLD_SITE_STORAGE}property-photos/a.jpg`, "https://photos.zillowstatic.com/b.jpg"]);
    const mapped = mapOldListing(OLD, "2026-09-30");
    expect(mapped.website.heroImageUrl).toBe(`${OLD_SITE_STORAGE}property-photos/a.jpg`);
  });

  it("reads tags the way the new site shows them", () => {
    expect(oldTagLabel("family-friendly")).toBe("Family-friendly");
    expect(oldTagLabel("remote-work")).toBe("Remote Work");
    expect(oldTagLabel("hot tub")).toBe("Hot Tub");
    expect(oldTagLabel("brrrr")).toBe("BRRRR");
    expect(oldTags(OLD)).toEqual(["Family-friendly", "Remote Work", "Hot Tub", "EV Charger"]);
  });

  it("never invents a number that was not there", () => {
    const mapped = mapOldListing({ ...OLD, price: 0, bedrooms: null, bathrooms: "0", propertyType: "castle", zipCode: "" }, "2026-09-30");
    expect(mapped.property.listPrice).toBeNull();
    expect(mapped.property.beds).toBeNull();
    expect(mapped.property.baths).toBeNull();
    expect(mapped.property.propertyType).toBeNull();
    expect(mapped.property.zip).toBeNull();
    expect(missingForPublish({ ...mapped.property, ...mapped.website })).toEqual([
      "the list price",
      "bedrooms",
      "bathrooms",
      "the ZIP code",
    ]);
  });

  it("passes the publish checklist when the old listing was complete", () => {
    const mapped = mapOldListing(OLD, "2026-09-30");
    expect(missingForPublish({ ...mapped.property, ...mapped.website })).toEqual([]);
  });

  it("matches a house without its ZIP, so a listing with no ZIP still finds its SavvyOS record", () => {
    expect(streetKey("361 Preacher Hill Rd", "Cresco", "PA")).toBe(streetKey("361 preacher hill road", "cresco", "pa"));
  });

  it("splits a price range in two", () => {
    expect(splitRange(0, 100)).toEqual([
      [0, 50],
      [51, 100],
    ]);
    expect(splitRange(5, 5)).toBeNull();
  });
});

describe("wiring", () => {
  it("only moves listings in as drafts unless publishing the ready ones was asked for", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "oldSiteListingImport.ts"), "utf8");
    expect(source).toContain('status: goLive ? "published" : "draft"');
    expect(source).toContain("const goLive = params.publishReady && missing.length === 0;");
    const router = readFileSync(path.resolve(import.meta.dirname, "routers/website.ts"), "utf8");
    expect(router).toMatch(/importOldSiteListings: protectedProcedure[\s\S]{0,300}canManageWebsiteProperties/);
    expect(router).toMatch(/publishReadyImportedListings: protectedProcedure[\s\S]{0,200}canManageWebsiteProperties/);
  });
});

describe("Meta catalog feed", () => {
  const row = {
    id: 7,
    slug: "8188-clover-spring-lane",
    headline: 'The "Clover" house',
    address: "8188 Clover Spring Lane",
    city: "Cottonwood Heights",
    state: "UT",
    listPrice: "700000.00",
    heroImageUrl: "https://cdn.example/a.jpg",
    galleryImageUrls: [],
    projectedRevenue: "70000",
    importedData: null,
    createdAt: new Date("2026-09-28T16:41:26Z"),
  };

  it("uses the old feed's columns and escapes quotes", () => {
    const csv = buildMetaCatalogCsv([row], "https://home.savvy-agents.com");
    const [header, line] = csv.replace(/^﻿/, "").split("\n");
    expect(header).toBe("id,title,description,availability,condition,price,link,image_link,date created");
    expect(line).toContain('"savvyos-7"');
    expect(line).toContain('"The ""Clover"" house"');
    expect(line).toContain('"in stock","new","700000","https://home.savvy-agents.com/newsite/properties/8188-clover-spring-lane"');
    expect(line).toContain('"09/28/2026, 12:41 PM"');
  });

  it("keeps an imported listing's old id so Meta sees the same item", () => {
    const csv = buildMetaCatalogCsv(
      [{ ...row, importedData: { source: "savvy-agents.com", oldId: "15f7e9cf" } }],
      "https://home.savvy-agents.com"
    );
    expect(csv).toContain('"15f7e9cf"');
  });

  it("shows a return only when there is a projection, and no photo means out of stock", () => {
    expect(catalogDescription(row)).toBe("📍 Located in Cottonwood Heights, UT | 🔥 Projected Return: 10.0% ROI");
    expect(catalogDescription({ ...row, projectedRevenue: null })).toBe("📍 Located in Cottonwood Heights, UT");
    const csv = buildMetaCatalogCsv([{ ...row, heroImageUrl: null }], "https://x");
    expect(csv).toContain('"out of stock"');
    expect(csvEscape(null)).toBe('""');
  });
});
