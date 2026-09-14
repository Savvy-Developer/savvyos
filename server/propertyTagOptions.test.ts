import { describe, expect, it } from "vitest";

import {
  AMENITY_TAGS,
  ALL_TAGS,
  STRATEGY_TAGS,
  canonicalTag,
  splitTags,
} from "../client/src/components/website/propertyTagOptions";

/**
 * Tags drive the filters on the public property list, so the thing that
 * matters is that two authors describing the same feature end up on the same
 * tag. Free text did not guarantee that, which is the whole reason this exists.
 */

describe("canonicalTag", () => {
  it("matches regardless of case, hyphens or spacing", () => {
    for (const written of ["hot tub", "Hot-Tub", "HOT  TUB", "hot_tub"]) {
      expect(canonicalTag(written)).toBe("Hot tub");
    }
  });

  it("returns nothing for a tag outside the vocabulary", () => {
    expect(canonicalTag("Helipad")).toBeNull();
  });

  it("handles empty and missing input without throwing", () => {
    expect(canonicalTag("")).toBeNull();
    expect(canonicalTag("   ")).toBeNull();
    expect(canonicalTag(undefined as any)).toBeNull();
  });

  it("round-trips every tag in the vocabulary", () => {
    for (const tag of ALL_TAGS) {
      expect(canonicalTag(tag)).toBe(tag);
    }
  });

  it("has no duplicate tags across the two lists", () => {
    expect(new Set(ALL_TAGS).size).toBe(ALL_TAGS.length);
    expect(ALL_TAGS.length).toBe(STRATEGY_TAGS.length + AMENITY_TAGS.length);
  });
});

describe("splitTags", () => {
  it("recognises the tags already on live listings", () => {
    // These four are on a published property today, written before the
    // vocabulary existed. If they did not resolve, this change would move
    // every live listing's tags into the "not standard" bucket.
    const { known, custom } = splitTags([
      "Family-friendly",
      "Fire Pit",
      "Sauna",
      "Game Room",
    ]);
    expect(known).toEqual(["Family-friendly", "Fire pit", "Sauna", "Game room"]);
    expect(custom).toEqual([]);
  });

  it("keeps a tag it does not recognise rather than dropping it", () => {
    // Someone chose it deliberately. Silently deleting it on the next save
    // would be a nasty surprise.
    const { known, custom } = splitTags(["Pool", "Helipad"]);
    expect(known).toEqual(["Pool"]);
    expect(custom).toEqual(["Helipad"]);
  });

  it("collapses variants of the same tag into one", () => {
    expect(splitTags(["hot-tub", "HOT TUB", "Hot tub"]).known).toEqual(["Hot tub"]);
  });

  it("does not collapse two different unrecognised tags", () => {
    expect(splitTags(["Helipad", "Dock"]).custom).toEqual(["Helipad", "Dock"]);
  });

  it("drops blank entries", () => {
    expect(splitTags(["  ", "", "Pool"])).toEqual({ known: ["Pool"], custom: [] });
  });

  it("survives input that is not a list", () => {
    expect(splitTags(null)).toEqual({ known: [], custom: [] });
    expect(splitTags(undefined)).toEqual({ known: [], custom: [] });
    expect(splitTags("Pool")).toEqual({ known: [], custom: [] });
  });
});
