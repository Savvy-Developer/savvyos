/**
 * Market pages (/newsite/markets/<state>/<city>) get a real title and
 * description and are in the sitemap. Before, the server did not know these
 * addresses: Google saw all 31 titled "SavvyOS" with no description.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  findMarketForPage,
  marketCityKey,
  marketPageDescription,
  marketPagePath,
  marketPageTitle,
  marketPlace,
  marketSlug,
} from "@shared/websiteMarketPages";
import { describeText, parseWebsitePath } from "./websiteSeoPages";

const root = path.resolve(import.meta.dirname, "..");
// Normalised: the Windows checkout is CRLF.
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");

const gulfShores = { id: 1, name: "Gulf Shores", state: "AL", propertyCount: 12 };
const hiltonHead = { id: 2, name: "Hilton Head & Bluffton, SC", state: "SC", propertyCount: 1 };
const noState = { id: 3, name: "Caribbean", state: null, propertyCount: 0 };
const markets = [gulfShores, hiltonHead, noState];

describe("a market's address", () => {
  it("is /markets/<state>/<city>, the address the Markets page links to", () => {
    expect(marketPagePath(gulfShores)).toBe("/markets/al/gulf-shores");
    expect(marketPagePath(hiltonHead)).toBe("/markets/sc/hilton-head-and-bluffton");
    expect(marketPagePath(noState)).toBe("/markets/us/caribbean");
    expect(marketSlug("  St. George, UT ")).toBe("st-george");
    expect(marketCityKey("Gulf Shores, AL")).toBe("gulf shores");
  });

  it("finds the market back from its address, whatever the letter case", () => {
    expect(findMarketForPage(markets, "al", "gulf-shores")).toBe(gulfShores);
    expect(findMarketForPage(markets, "AL", "Gulf-Shores")).toBe(gulfShores);
    expect(findMarketForPage(markets, "us", "caribbean")).toBe(noState);
    // The same city in another state is a different page.
    expect(findMarketForPage(markets, "fl", "gulf-shores")).toBeUndefined();
    expect(findMarketForPage(markets, "al", "nowhere")).toBeUndefined();
  });

  it("is read by the server's router", () => {
    expect(parseWebsitePath("/newsite/markets/al/gulf-shores")).toEqual({ kind: "market", state: "al", city: "gulf-shores" });
    expect(parseWebsitePath("/newsite/markets/AL/Gulf-Shores/")).toEqual({ kind: "market", state: "al", city: "gulf-shores" });
    expect(parseWebsitePath("/newsite/markets")).toEqual({ kind: "markets" });
    // Only /markets has a three-part address.
    expect(parseWebsitePath("/newsite/properties/a/b")).toBeNull();
    expect(parseWebsitePath("/newsite/markets/al/gulf-shores/extra")).toBeNull();
  });
});

describe("what Google gets for a market page", () => {
  it("names the place, and says how many properties only when there are some", () => {
    expect(marketPlace(gulfShores)).toBe("Gulf Shores, AL");
    expect(marketPlace(hiltonHead)).toBe("Hilton Head & Bluffton, SC");
    expect(marketPlace(noState)).toBe("Caribbean");
    expect(marketPageTitle(gulfShores)).toBe("Gulf Shores, AL Short-Term Rentals for Sale");
    expect(marketPageDescription(gulfShores)).toContain("Browse 12 short-term rental properties for sale in Gulf Shores, AL");
    expect(marketPageDescription(hiltonHead)).toContain("Browse 1 short-term rental property for sale in");
    expect(marketPageDescription(noState)).toContain("Short-term rental investing in Caribbean");
    expect(marketPageDescription(noState)).not.toContain("Browse");
  });

  it("fits a search result without being cut", () => {
    for (const market of markets) {
      const text = marketPageDescription(market);
      expect(text.length <= 160).toBe(true);
      expect(describeText(text)).toBe(text);
    }
  });

  it("is the same title the page itself shows", () => {
    const client = read("client/src/pages/PublicWebsite.tsx");
    expect(client).toContain('usePageTitle(market ? marketPageTitle(market) : "Market");');
    expect(client).toContain("findMarketForPage((directory.data || []) as any[], state, city)");
    expect(client).toContain("return path(marketPagePath(market));");
  });
});

describe("wiring", () => {
  const seo = read("server/websiteSeo.ts");
  it("describes a market page from the market, and leaves an unknown one undescribed", () => {
    const block = seo.slice(seo.indexOf('case "market": {'), seo.indexOf('case "page": {'));
    expect(block).toContain("findMarketForPage(await loadMarketDirectory(db), route.state, route.city)");
    expect(block).toContain("title: marketPageTitle(market),");
    expect(block).toContain("if (market) {");
  });
  it("lists every market page in the sitemap, without failing the sitemap if markets cannot load", () => {
    const sitemap = seo.slice(seo.indexOf("export async function listWebsiteSitemapEntries"));
    expect(sitemap).toContain("entries.push({ path: marketPath });");
    expect(sitemap).toContain("loadMarketDirectory(db).catch(");
  });
});
