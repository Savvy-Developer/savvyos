import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  listMissing,
  missingForPublish,
  publishBlockedMessage,
} from "@shared/websitePublishChecklist";

const ready = {
  city: "Nags Head",
  state: "NC",
  zip: "27959",
  listPrice: "1599000.00",
  beds: "7.0",
  baths: "8.0",
  heroImageUrl: "https://cdn.example.com/a.jpg",
  galleryImageUrls: [],
};

describe("publish checklist", () => {
  it("lets a complete listing publish", () => {
    expect(missingForPublish(ready)).toEqual([]);
  });

  it("accepts a gallery photo when there is no main photo", () => {
    expect(missingForPublish({ ...ready, heroImageUrl: null, galleryImageUrls: ["https://x/y.jpg"] })).toEqual([]);
  });

  it("names everything that is missing, in form order", () => {
    expect(
      missingForPublish({ heroImageUrl: " ", galleryImageUrls: [""], listPrice: "0.00", beds: null, baths: "", city: "", state: null, zip: null })
    ).toEqual(["a photo", "the list price", "bedrooms", "bathrooms", "the city", "the state", "the ZIP code"]);
  });

  it("reads like a sentence", () => {
    expect(listMissing(["a photo"])).toBe("a photo");
    expect(listMissing(["a photo", "the ZIP code"])).toBe("a photo and the ZIP code");
    expect(publishBlockedMessage(["a photo", "bedrooms", "the ZIP code"])).toBe(
      "Add a photo, bedrooms and the ZIP code before publishing. You can still save it as a draft."
    );
  });
});

describe("where the checklist is enforced", () => {
  const source = readFileSync(path.resolve(import.meta.dirname, "routers/website.ts"), "utf8");
  const body = (name: string) => {
    const start = source.indexOf(`  ${name}: protectedProcedure`);
    expect(start).toBeGreaterThan(-1);
    const next = source.slice(start + 1).search(/\n  [a-zA-Z]+: (protectedProcedure|publicProcedure)/);
    return source.slice(start, next === -1 ? undefined : start + 1 + next);
  };

  it("blocks publishing from every path that can publish a property", () => {
    for (const name of ["savePropertyWebsiteContent", "publishProperty", "saveProperty"]) {
      expect(body(name)).toContain("missingForPublish(");
      expect(body(name)).toContain('input.status === "published"');
    }
  });
});
