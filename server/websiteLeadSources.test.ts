import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { oldSiteWebsiteLeadSource, websiteFormLeadSource, WEBSITE_LEAD_SOURCES } from "@shared/websiteLeadSources";
import { MARKET_STATE_FIXES } from "./marketStateFix";
import { metricChanges } from "./proformaWebsiteSync";

const read = (file: string) =>
  readFileSync(path.resolve(import.meta.dirname, file), "utf8").replace(/\r\n/g, "\n");

describe("website form lead sources", () => {
  it("files each form under its own sub-source", () => {
    expect(websiteFormLeadSource({ intent: "property", sourcePath: "/newsite/properties/x" })).toBe("Property Inquiry");
    expect(websiteFormLeadSource({ intent: "property", requestType: "showing" })).toBe("Book a Showing");
    expect(websiteFormLeadSource({ intent: "property", requestType: "analysis" })).toBe("Deeper Analysis Request");
    expect(websiteFormLeadSource({ intent: "property", requestType: "financing" })).toBe("Financing Request");
    expect(websiteFormLeadSource({ intent: "property", sourcePath: "/newsite/case-studies/a-story" })).toBe("Case Study Inquiry");
    expect(websiteFormLeadSource({ intent: "agent", sourcePath: "/newsite/agents/jane" })).toBe("Agent Message");
    expect(websiteFormLeadSource({ intent: "sell" })).toBe("Seller Enquiry");
    expect(websiteFormLeadSource({ intent: "general" })).toBe("General Inquiry");
    expect(websiteFormLeadSource({})).toBe("General Inquiry");
  });

  it("only ever names a source that startup creates", () => {
    for (const input of [{ intent: "property" }, { intent: "agent" }, { intent: "sell" }, { intent: "buy" }, { requestType: "showing" }]) {
      expect(WEBSITE_LEAD_SOURCES).toContain(websiteFormLeadSource(input));
    }
  });

  it("maps the old site's lead types that match a form, and nothing else", () => {
    expect(oldSiteWebsiteLeadSource("property_detail")).toBe("Property Inquiry");
    expect(oldSiteWebsiteLeadSource("book_showing")).toBe("Book a Showing");
    expect(oldSiteWebsiteLeadSource("deeper_analysis")).toBe("Deeper Analysis Request");
    expect(oldSiteWebsiteLeadSource("financing")).toBe("Financing Request");
    expect(oldSiteWebsiteLeadSource("agent_profile")).toBe("Agent Message");
    expect(oldSiteWebsiteLeadSource("seller")).toBe("Seller Enquiry");
    expect(oldSiteWebsiteLeadSource("website")).toBeNull();
    expect(oldSiteWebsiteLeadSource("google_ads")).toBeNull();
    expect(oldSiteWebsiteLeadSource(undefined)).toBeNull();
  });

  it("checks organic social first, then the form, and starts Smart Plans for any source", () => {
    const website = read("routers/website.ts");
    const organic = website.indexOf("const organicSourceId = await resolveOrganicSocialLeadSourceId(db, adAttribution);");
    const form = website.indexOf("(await websiteLeadSourceId(");
    expect(organic).toBeGreaterThan(-1);
    expect(form).toBeGreaterThan(organic);
    expect(website).toContain("await triggerSmartPlansForContact(newContactId, leadSourceId)");
    expect(read("_core/index.ts")).toContain("await ensureWebsiteLeadSources();");
  });
});

describe("pro-forma numbers on website listings", () => {
  const before = { grossRevenue: "106074.43", cashOnCash: "0.0375", capRate: "0.0809" };

  it("moves only the numbers the pro-forma changed", () => {
    expect(metricChanges(before, { ...before, cashOnCash: "-0.1143" })).toEqual([
      { column: "cashOnCash", from: "0.0375", to: "-0.1143" },
    ]);
    expect(metricChanges(before, { grossRevenue: "106074.4300", cashOnCash: "0.03750", capRate: "0.0809" })).toEqual([]);
  });

  it("only overwrites listing numbers that still equal the old pro-forma value", () => {
    const sync = read("proformaWebsiteSync.ts");
    expect(sync).toContain("eq(websiteProperties.sourceProformaId, proformaId)");
    expect(sync).toContain("change.from == null ? isNull(column) : eq(column, change.from)");
    expect(read("routers/properties.ts")).toContain("await syncWebsiteListingsWithProforma(db, input.id, {");
  });
});

describe("market state fix", () => {
  it("fixes exactly the seven markets, once, without re-running their AI profile", () => {
    expect(MARKET_STATE_FIXES).toHaveLength(7);
    const fix = read("marketStateFix.ts");
    expect(fix).toContain("UPDATE market_profiles SET state = ? WHERE id = ? AND name = ? AND state = 'N/A'");
    expect(fix).not.toContain("refreshMarketIntelligence");
    expect(read("_core/index.ts")).toContain("await ensureMarketStateFix();");
  });
});
