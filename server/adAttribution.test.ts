import { describe, expect, it } from "vitest";

import {
  AD_ATTRIBUTION_MAX_LENGTH,
  adAttributionUpdates,
  campaignSourceFrom,
  readAdAttribution,
} from "@shared/adAttribution";

const META = {
  utm_source: "fb",
  utm_medium: "paid",
  utm_campaign: "120248019387630701",
  utm_term: "120248019424830701",
  utm_content: "120248019425430701",
};

describe("readAdAttribution", () => {
  it("reads the five snake_case keys the Zaps send", () => {
    expect(readAdAttribution(META)).toEqual({
      utmSource: "fb",
      utmMedium: "paid",
      utmCampaign: "120248019387630701",
      utmTerm: "120248019424830701",
      utmContent: "120248019425430701",
    });
  });

  /**
   * Meta campaign, ad set and ad ids are 18 digits. Above 2^53 a JSON number
   * loses precision, so 120248019387630701 would silently become
   * 120248019387630700. Never parsed, always text.
   */
  it("keeps an 18 digit id exact when it arrives as a number", () => {
    const value = readAdAttribution({ utm_campaign: 120248019387630701 }).utmCampaign!;
    expect(value.startsWith("12024801938763")).toBe(true);
    expect(value).not.toContain("e+");
  });

  /**
   * The rule the whole feature rests on. An organic booking sends the keys
   * empty, and empty means "no information", not "there was no ad". Leaving
   * them out here is what stops them reaching the update.
   */
  it("ignores blank values rather than returning them", () => {
    const out = readAdAttribution({ ...META, utm_term: "", utm_content: "   " });
    expect(out.utmTerm).toBeUndefined();
    expect(out.utmContent).toBeUndefined();
    expect(out.utmCampaign).toBe("120248019387630701");
  });

  it("returns nothing for a payload with no attribution at all", () => {
    expect(readAdAttribution({ email: "jane@example.com", name: "Jane Doe" })).toEqual({});
    expect(readAdAttribution({})).toEqual({});
  });

  it("ignores null, undefined and structured values", () => {
    expect(readAdAttribution({ utm_source: null, utm_medium: undefined })).toEqual({});
    expect(readAdAttribution({ utm_campaign: { id: 1 } })).toEqual({});
    expect(readAdAttribution({ utm_term: ["a"] })).toEqual({});
  });

  it("trims surrounding whitespace", () => {
    expect(readAdAttribution({ utm_source: "  google  " }).utmSource).toBe("google");
  });

  it("truncates rather than failing the whole booking", () => {
    const long = "x".repeat(400);
    expect(readAdAttribution({ utm_content: long }).utmContent).toHaveLength(
      AD_ATTRIBUTION_MAX_LENGTH
    );
  });

  it("also accepts the camelCase spelling", () => {
    expect(readAdAttribution({ utmSource: "bing" }).utmSource).toBe("bing");
  });
});

describe("adAttributionUpdates", () => {
  it("writes only the fields that carry a value", () => {
    expect(adAttributionUpdates({ utmSource: "fb", utmMedium: "" })).toEqual({
      utmSource: "fb",
    });
  });

  /**
   * An organic booking must produce no update at all, so a real attribution
   * recorded in May survives a direct booking in September.
   */
  it("produces nothing when there is no attribution", () => {
    expect(adAttributionUpdates({})).toEqual({});
  });
});

describe("campaignSourceFrom", () => {
  it("prefers the campaign", () => {
    expect(campaignSourceFrom({ utmCampaign: "120248019387630701", utmSource: "fb" })).toBe(
      "120248019387630701"
    );
  });

  it("falls back to the source, matching the landing page handler", () => {
    expect(campaignSourceFrom({ utmSource: "fb" })).toBe("fb");
  });

  it("returns null when there is nothing, so nothing is written", () => {
    expect(campaignSourceFrom({})).toBeNull();
    expect(campaignSourceFrom({ utmMedium: "paid" })).toBeNull();
  });
});
