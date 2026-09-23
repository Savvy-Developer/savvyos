import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LEGACY_PAGES, legacyTarget, resolveLegacyTarget, withQuery } from "./legacySiteRedirectRules";

const go = (p: string, published = false) => {
  const target = legacyTarget(p);
  return target ? resolveLegacyTarget(target, published) : null;
};

describe("old savvy-agents.com addresses", () => {
  it("sends an indexed property page to the same listing when it is published", () => {
    expect(go("/properties/6927-south-virginia-dare-trail", true)).toEqual({
      to: "/newsite/properties/6927-south-virginia-dare-trail",
      permanent: true,
    });
  });

  it("falls back to the list, temporarily, when the listing is not on the new site", () => {
    expect(go("/properties/some-old-listing", false)).toEqual({ to: "/newsite/properties", permanent: false });
    expect(go("/case-studies/orem-utah-511755547", false)).toEqual({ to: "/newsite/case-studies", permanent: false });
    expect(go("/resources/cape-cod-str-rules-before-you-buy", false)).toEqual({ to: "/newsite/resources", permanent: false });
    expect(go("/agents/jane-doe", false)).toEqual({ to: "/newsite/agents", permanent: false });
  });

  it("treats the old comps and v2 views as the listing itself", () => {
    expect(legacyTarget("/properties/abc/comps")).toEqual({ kind: "item", section: "properties", slug: "abc" });
    expect(legacyTarget("/properties/abc/v2")).toEqual({ kind: "item", section: "properties", slug: "abc" });
    expect(legacyTarget("/properties/abc/other")).toBeNull();
  });

  it("lowercases slugs, since old URLs mixed case and new slugs do not", () => {
    expect(legacyTarget("/resources/what-are-you-actually-buying-this-NJ-shore-STR-for")).toEqual({
      kind: "item",
      section: "resources",
      slug: "what-are-you-actually-buying-this-nj-shore-str-for",
    });
  });

  it("moves the old top-level and account pages", () => {
    expect(go("/legal")).toEqual({ to: "/newsite/legal", permanent: true });
    expect(go("/login/")).toEqual({ to: "/newsite/sign-in", permanent: true });
    expect(go("/markets/nc/asheville")).toEqual({ to: "/newsite/markets", permanent: true });
    expect(go("/team")).toEqual({ to: "/newsite/agents", permanent: false });
  });

  it("leaves alone anything that is not an old site address", () => {
    for (const p of ["/", "/newsite", "/newsite/properties", "/api/trpc/x", "/marketmatch", "/some-landing-page", "/admin/users"]) {
      expect(legacyTarget(p)).toBeNull();
    }
  });

  it("keeps ad tracking parameters across the redirect", () => {
    expect(withQuery("/newsite/properties", "/properties?utm_source=meta&utm_campaign=x")).toBe(
      "/newsite/properties?utm_source=meta&utm_campaign=x"
    );
    expect(withQuery("/newsite/properties", "/properties")).toBe("/newsite/properties");
  });

  it("covers every public page the old site's sitemap and menus listed", () => {
    for (const p of ["/properties", "/about", "/agents", "/case-studies", "/contact", "/markets", "/recent-sales", "/team", "/privacy", "/legal", "/resources", "/sell", "/account"]) {
      expect(LEGACY_PAGES[p]).toBeDefined();
    }
  });
});

describe("wiring", () => {
  it("runs after the hand-made redirects, so those always win", () => {
    const index = readFileSync(path.resolve(import.meta.dirname, "_core/index.ts"), "utf8");
    const handMade = index.indexOf("registerLandingPageRedirects(app)");
    const legacy = index.indexOf("registerLegacySiteRedirects(app)");
    expect(handMade).toBeGreaterThan(-1);
    expect(legacy).toBeGreaterThan(handMade);
  });
});
