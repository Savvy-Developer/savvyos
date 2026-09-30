import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  agentListsMarket,
  findMarketForPath,
  marketBaseName,
  marketCitySlug,
  marketPagePath,
} from "@shared/websiteMarketPages";
import { parseWebsitePath } from "./websiteSeoPages";
import { WEBSITE_PUBLIC_TRPC_PATHS } from "./routers/website";

const MARKETS = [
  { id: 1, name: "Gulf Shores", state: "AL" },
  { id: 2, name: "Outer Banks, North Carolina", state: "NC" },
  { id: 3, name: "Raleigh", state: "NC" },
  { id: 4, name: "Central & North Florida", state: "FL" },
  { id: 5, name: "Florida Keys", state: null },
  { id: 6, name: "Columbus, OH", state: "OH" },
];

describe("market page addresses", () => {
  it("builds the same address the old site used", () => {
    expect(marketPagePath(MARKETS[0])).toBe("/markets/al/gulf-shores");
    expect(marketPagePath(MARKETS[3])).toBe("/markets/fl/central-and-north-florida");
    expect(marketCitySlug("Pompano Beach - Fort Lauderdale")).toBe("pompano-beach-fort-lauderdale");
  });

  it("gives a market with no state a page under /us", () => {
    expect(marketPagePath(MARKETS[4])).toBe("/markets/us/florida-keys");
    expect(marketPagePath({ name: "Smokies", state: "N/A" })).toBe("/markets/us/smokies");
  });

  it("finds the market for its own address", () => {
    expect(findMarketForPath(MARKETS, "al", "gulf-shores")).toEqual({ market: MARKETS[0], canonical: true });
    expect(findMarketForPath(MARKETS, "us", "florida-keys")?.market.id).toBe(5);
  });

  it("accepts old and short-form addresses, and says they are not the canonical one", () => {
    expect(findMarketForPath(MARKETS, "nc", "outer-banks")).toEqual({ market: MARKETS[1], canonical: false });
    expect(findMarketForPath(MARKETS, "AL", "Gulf-Shores")).toEqual({ market: MARKETS[0], canonical: false });
    expect(findMarketForPath(MARKETS, "fl", "central-&-north-florida")).toEqual({ market: MARKETS[3], canonical: false });
    expect(findMarketForPath(MARKETS, "oh", "columbus")?.market.id).toBe(6);
  });

  it("never guesses across states or at a partial name", () => {
    expect(findMarketForPath(MARKETS, "sc", "gulf-shores")).toBeNull();
    expect(findMarketForPath(MARKETS, "nc", "outer")).toBeNull();
    expect(findMarketForPath(MARKETS, "fl", "florida")).toBeNull();
    expect(findMarketForPath(MARKETS, "", "gulf-shores")).toBeNull();
  });
});

describe("agents in a market", () => {
  it("matches whole names, long or short form", () => {
    expect(agentListsMarket(["Gulf Shores"], "Gulf Shores")).toBe(true);
    expect(agentListsMarket(["Outer Banks"], "Outer Banks, North Carolina")).toBe(true);
    expect(agentListsMarket(["Phoenix, AZ"], "Phoenix, Arizona")).toBe(true);
    expect(agentListsMarket(["gulf shores "], "Gulf Shores")).toBe(true);
  });

  it("does not match a different market that shares a word", () => {
    expect(agentListsMarket(["Florida"], "Florida Keys")).toBe(false);
    expect(agentListsMarket(["Gulf Coast"], "Gulf Shores")).toBe(false);
    expect(agentListsMarket(null, "Gulf Shores")).toBe(false);
  });

  it("shortens only a trailing state part", () => {
    expect(marketBaseName("Outer Banks, North Carolina")).toBe("Outer Banks");
    expect(marketBaseName("Gulf Shores")).toBe("Gulf Shores");
  });
});

describe("wiring", () => {
  it("routes the page on the server the same way as in the browser", () => {
    expect(parseWebsitePath("/newsite/markets/al/gulf-shores")).toEqual({ kind: "market", state: "al", city: "gulf-shores" });
    expect(parseWebsitePath("/newsite/markets")).toEqual({ kind: "markets" });
    const page = readFileSync(path.resolve(import.meta.dirname, "../client/src/pages/PublicWebsite.tsx"), "utf8");
    expect(page).toContain('if (segments[0] === "markets" && segments.length === 3)');
    expect(page).toContain("href={path(marketPagePath(market))}");
  });

  it("is reachable from the public host", () => {
    expect(WEBSITE_PUBLIC_TRPC_PATHS.has("website.publicMarketPage")).toBe(true);
  });
});
