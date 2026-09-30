import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { extractZillowPhotoUrls, mapZillowPropertyResponse } from "./externalApis";

const jpeg = (id: string, widths: number[]) => ({
  mixedSources: { jpeg: widths.map(width => ({ url: `https://photos.zillowstatic.com/${id}-${width}.jpg`, width })) },
});

describe("extractZillowPhotoUrls", () => {
  it("takes every listing photo, largest size, in Zillow's order", () => {
    const data = { propertyDetails: { originalPhotos: [jpeg("a", [384, 1536, 768]), jpeg("b", [1536, 384])] } };
    expect(extractZillowPhotoUrls(data)).toEqual([
      "https://photos.zillowstatic.com/a-1536.jpg",
      "https://photos.zillowstatic.com/b-1536.jpg",
    ]);
  });

  it("never reads nearby or comparable homes in the same payload", () => {
    const data = {
      propertyDetails: {
        originalPhotos: [jpeg("subject", [1536])],
        nearbyHomes: [{ miniCardPhotos: [{ url: "https://photos.zillowstatic.com/nearby.jpg" }] }],
        comps: [{ imgSrc: "https://photos.zillowstatic.com/comp.jpg" }],
      },
    };
    expect(extractZillowPhotoUrls(data)).toEqual(["https://photos.zillowstatic.com/subject-1536.jpg"]);
  });

  it("falls back to the single hero image, drops duplicates and non-https links", () => {
    expect(
      extractZillowPhotoUrls({ propertyDetails: { hiResImageLink: "https://x.example/1.jpg", imgSrc: "https://x.example/1.jpg" } })
    ).toEqual(["https://x.example/1.jpg"]);
    expect(extractZillowPhotoUrls({ propertyDetails: { photos: [{ url: "http://x.example/a.jpg" }] } })).toEqual([]);
    expect(extractZillowPhotoUrls(null)).toEqual([]);
  });

  it("is included in the pro-forma lookup response without changing the single photo", () => {
    const mapped = mapZillowPropertyResponse({
      propertyDetails: { price: 689000, hiResImageLink: "https://x.example/hero.jpg", originalPhotos: [jpeg("a", [1536])] },
    });
    expect(mapped?.photoUrl).toBe("https://x.example/hero.jpg");
    expect(mapped?.photos).toEqual(["https://photos.zillowstatic.com/a-1536.jpg"]);
  });
});

describe("draft preview on the public site", () => {
  const source = readFileSync(path.join(__dirname, "routers/website.ts"), "utf8");
  const detail = source.slice(source.indexOf("publicProperty: publicProcedure"), source.indexOf("publicPropertyEvidence: publicProcedure"));

  it("shows drafts only to signed-in Savvy staff, and published listings to everyone", () => {
    expect(detail).toContain("staffFromRequest");
    expect(detail).toMatch(/isStaff\s*\?\s*inArray\(websiteProperties\.status, \["published", "draft"\]\)\s*:\s*eq\(websiteProperties\.status, "published"\)/);
    expect(detail).not.toContain('"archived"');
  });

  it("keeps the photo import behind the property edit check", () => {
    const importer = source.slice(source.indexOf("importZillowPhotos: protectedProcedure"), source.indexOf("savePropertyWebsiteContent: protectedProcedure"));
    expect(importer.indexOf("propertyWebsiteAccess")).toBeGreaterThan(-1);
    expect(importer.indexOf("propertyWebsiteAccess")).toBeLessThan(importer.indexOf("fetchZillowListing"));
  });
});
