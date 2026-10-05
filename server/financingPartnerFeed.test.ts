/**
 * Website financing requests passed on to the lending partners. Every partner
 * call here goes to a mocked fetch; nothing reaches the network.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FINANCING_PARTNER_ACTION,
  buildInboundPayload,
  buildMstrPayload,
  financingFeedEnabled,
  financingLeadContext,
  formatBudget,
  queueFinancingPartnerFeed,
  FINANCING_PARTNER_SKIPPED_ACTION,
  partnerUrlStatus,
  readFinancingPartnerConfig,
  resetLocalFinancingSendCount,
  runFinancingPartnerFeed,
  startOfEasternDay,
  type FinancingFeedInput,
  type FinancingPageFacts,
} from "./financingPartnerFeed";

const MSTR_URL = "https://lender.test/leads";
const INBOUND_URL = "https://inbound.test/api/leads/inbound";
const ENV = {
  FINANCING_PARTNER_FEED_ENABLED: "on",
  FINANCING_PARTNER_MSTR_URL: MSTR_URL,
  FINANCING_PARTNER_MSTR_API_KEY: "test-mstr-key",
  FINANCING_PARTNER_INBOUND_URL: INBOUND_URL,
  FINANCING_PARTNER_INBOUND_TOKEN: "test-inbound-token",
  PUBLIC_LANDING_PAGE_HOST: "home.example.test",
};

const PROPERTY_FACTS: FinancingPageFacts = {
  property: {
    address: "608 Touchstone Circle",
    city: "Port Orange",
    state: "FL",
    listPrice: 450000,
    slug: "608-touchstone-circle-port-orange",
  },
  marketName: "Daytona Beach",
  caseStudy: null,
};

const propertyInput: FinancingFeedInput = {
  requestType: "financing",
  contactId: 77,
  firstName: "Ada",
  lastName: "Investor",
  email: "Ada@Example.com",
  phone: "555-0100",
  propertyId: 12,
  sourcePath: "/newsite/properties/608-touchstone-circle-port-orange",
};

const caseStudyInput: FinancingFeedInput = {
  ...propertyInput,
  propertyId: 12,
  sourcePath: "/newsite/case-studies/orem-utah-511755547",
};
const CASE_STUDY_FACTS: FinancingPageFacts = {
  ...PROPERTY_FACTS,
  caseStudy: { title: "How a first-time investor bought in Orem", slug: "orem-utah-511755547" },
};

function okFetch(statusFor: (url: string) => number | Error = () => 200) {
  return vi.fn(async (url: any, _init?: any) => {
    const status = statusFor(String(url));
    if (status instanceof Error) throw status;
    return new Response("{}", { status });
  });
}

function deps(overrides: Partial<Parameters<typeof runFinancingPartnerFeed>[1]> = {}) {
  return {
    env: ENV,
    fetchImpl: okFetch() as unknown as typeof fetch,
    loadFacts: vi.fn(async () => PROPERTY_FACTS),
    logTimeline: vi.fn(async () => undefined),
    warn: vi.fn(),
    ...overrides,
  };
}

const callTo = (fetchMock: any, url: string) => fetchMock.mock.calls.find((call: any[]) => call[0] === url);
const bodyOf = (call: any[]) => JSON.parse(call[1].body);

afterEach(() => {
  vi.useRealTimers();
  resetLocalFinancingSendCount();
});

describe("the switch", () => {
  it("is on only for exactly on or true", () => {
    expect(financingFeedEnabled("on")).toBe(true);
    expect(financingFeedEnabled("true")).toBe(true);
    expect(financingFeedEnabled(" TRUE ")).toBe(true);
    for (const value of [undefined, "", "off", "false", "1", "yes", "enabled"]) {
      expect(financingFeedEnabled(value)).toBe(false);
    }
  });

  it("sends nothing when off", async () => {
    for (const flag of [undefined, "off", "false", "1"]) {
      const d = deps({ env: { ...ENV, FINANCING_PARTNER_FEED_ENABLED: flag } });
      expect(await runFinancingPartnerFeed(propertyInput, d)).toBeNull();
      expect(d.fetchImpl).not.toHaveBeenCalled();
      expect(d.loadFacts).not.toHaveBeenCalled();
      expect(d.logTimeline).not.toHaveBeenCalled();
    }
  });

  it("has no partner address or key of its own", () => {
    const config = readFinancingPartnerConfig({});
    expect(config).toMatchObject({ enabled: false, mstr: null, inbound: null });
    const source = readFileSync(path.join(import.meta.dirname, "financingPartnerFeed.ts"), "utf8");
    expect(source).not.toMatch(/mystrhomeloan\.com|104\.196\.|https?:\/\/(?!\$\{)/i);
  });
});

describe("sending a property page financing request", () => {
  it("posts to both partners with their own headers and payloads", async () => {
    const d = deps();
    const results = await runFinancingPartnerFeed(propertyInput, d);
    expect(results).toEqual({ mstr: "ok", inbound: "ok" });
    const fetchMock = d.fetchImpl as any;
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const mstr = callTo(fetchMock, MSTR_URL);
    expect(mstr[1].method).toBe("POST");
    expect(mstr[1].headers).toEqual({ "x-api-key": "test-mstr-key", "Content-Type": "application/json" });
    expect(mstr[1].signal).toBeInstanceOf(AbortSignal);
    const url = "https://home.example.test/newsite/properties/608-touchstone-circle-port-orange";
    const address = "608 Touchstone Circle, Port Orange, FL";
    expect(bodyOf(mstr)).toEqual({
      name: "Ada Investor",
      email: "ada@example.com",
      phone: "555-0100",
      tags: ["buyer", "STR"],
      custom_fields: {
        market: "Daytona Beach",
        property_url: url,
        propertyUrl: url,
        "Property URL": url,
        property_address: address,
        propertyAddress: address,
        "property address": address,
      },
    });

    const inbound = callTo(fetchMock, INBOUND_URL);
    expect(inbound[1].headers).toEqual({
      Authorization: "Bearer test-inbound-token",
      "Content-Type": "application/json",
    });
    expect(bodyOf(inbound)).toEqual({
      tags: ["buyer", "STR"],
      phone: "555-0100",
      name: "Ada Investor",
      email: "ada@example.com",
      custom_fields: { market: "Daytona Beach", budget: "$450k" },
    });
  });

  it("notes the outcome on the contact timeline, with no keys or payload", async () => {
    const d = deps();
    await runFinancingPartnerFeed(propertyInput, d);
    expect(d.logTimeline).toHaveBeenCalledTimes(1);
    const entry = (d.logTimeline as any).mock.calls[0][0];
    expect(entry).toMatchObject({
      action: FINANCING_PARTNER_ACTION,
      entityType: "contact",
      entityId: 77,
      relatedContactId: 77,
      userId: null,
    });
    expect(entry.details.summary).toBe("Financing request sent to lender partners: mystrhomeloan ok, inbound ok");
    const written = JSON.stringify(entry);
    for (const secret of ["test-mstr-key", "test-inbound-token", MSTR_URL, INBOUND_URL, "555-0100", "ada@example.com"]) {
      expect(written).not.toContain(secret);
    }
  });

  it("leaves out what it does not know rather than guessing", () => {
    const lead = financingLeadContext(
      { ...propertyInput, phone: null, sourcePath: null },
      { property: { ...PROPERTY_FACTS.property!, listPrice: null }, marketName: null, caseStudy: null },
      ENV
    );
    expect(lead.market).toBe("Port Orange, FL");
    expect(lead.pageUrl).toBe("https://home.example.test/newsite/properties/608-touchstone-circle-port-orange");
    expect(buildMstrPayload(lead)).not.toHaveProperty("phone");
    expect(buildInboundPayload(lead)).toEqual({
      tags: ["buyer", "STR"],
      name: "Ada Investor",
      email: "ada@example.com",
      custom_fields: { market: "Port Orange, FL" },
    });
  });

  it("writes the budget in thousands", () => {
    expect(formatBudget(450000)).toBe("$450k");
    expect(formatBudget(1_250_000)).toBe("$1250k");
    expect(formatBudget(null)).toBeNull();
    expect(formatBudget(0)).toBeNull();
  });
});

describe("one partner failing", () => {
  it("does not stop the other, and is recorded", async () => {
    const d = deps({
      fetchImpl: okFetch(url => (url === MSTR_URL ? new TypeError("fetch failed") : 200)) as unknown as typeof fetch,
    });
    const results = await runFinancingPartnerFeed(propertyInput, d);
    expect(results).toEqual({ mstr: "error", inbound: "ok" });
    expect(callTo(d.fetchImpl, INBOUND_URL)).toBeTruthy();
    expect((d.logTimeline as any).mock.calls[0][0].details.summary).toBe(
      "Financing request sent to lender partners: mystrhomeloan error, inbound ok"
    );
  });

  it("reports an HTTP failure by its status", async () => {
    const d = deps({ fetchImpl: okFetch(url => (url === INBOUND_URL ? 502 : 200)) as unknown as typeof fetch });
    expect(await runFinancingPartnerFeed(propertyInput, d)).toEqual({ mstr: "ok", inbound: "502" });
    expect((d.logTimeline as any).mock.calls[0][0].details.summary).toBe(
      "Financing request sent to lender partners: mystrhomeloan ok, inbound 502"
    );
  });

  it("reports a timeout", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const d = deps({ fetchImpl: okFetch(url => (url === MSTR_URL ? timeout : 200)) as unknown as typeof fetch });
    expect(await runFinancingPartnerFeed(propertyInput, d)).toEqual({ mstr: "timeout", inbound: "ok" });
  });

  it("never throws, even when the timeline and the page lookup fail", async () => {
    const d = deps({
      loadFacts: vi.fn(async () => {
        throw new Error("db down");
      }),
      logTimeline: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    await expect(runFinancingPartnerFeed(propertyInput, d)).resolves.toEqual({ mstr: "ok", inbound: "ok" });
  });

  it("runs after the form has its answer, and a failure never reaches it", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("boom");
    });
    const d = deps({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(() => queueFinancingPartnerFeed(propertyInput, d)).not.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
    await new Promise(resolve => setImmediate(resolve));
    await vi.waitFor(() => expect(d.logTimeline).toHaveBeenCalled());
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("missing settings", () => {
  it("skips the partner with a warning naming the setting, and still sends the other", async () => {
    const d = deps({ env: { ...ENV, FINANCING_PARTNER_INBOUND_TOKEN: "" } });
    const results = await runFinancingPartnerFeed(propertyInput, d);
    expect(results).toEqual({ mstr: "ok", inbound: "not configured" });
    expect(d.fetchImpl).toHaveBeenCalledTimes(1);
    expect(callTo(d.fetchImpl, MSTR_URL)).toBeTruthy();
    expect(d.warn).toHaveBeenCalledWith(expect.stringContaining("FINANCING_PARTNER_INBOUND_TOKEN"));
  });

  it("sends nothing when no partner is configured", async () => {
    const d = deps({ env: { FINANCING_PARTNER_FEED_ENABLED: "true" } });
    expect(await runFinancingPartnerFeed(propertyInput, d)).toBeNull();
    expect(d.fetchImpl).not.toHaveBeenCalled();
    expect(d.warn).toHaveBeenCalledWith(expect.stringContaining("FINANCING_PARTNER_MSTR_URL"));
    expect(d.logTimeline).not.toHaveBeenCalled();
  });

  it("never puts a key value in a warning", async () => {
    const d = deps({
      env: { ...ENV, FINANCING_PARTNER_INBOUND_URL: "" },
      fetchImpl: okFetch(() => 500) as unknown as typeof fetch,
    });
    await runFinancingPartnerFeed(propertyInput, d);
    const warnings = JSON.stringify((d.warn as any).mock.calls);
    expect(warnings).not.toContain("test-mstr-key");
    expect(warnings).not.toContain("test-inbound-token");
  });
});

describe("a financing request from a case study", () => {
  it("sends the market, the case study and its page, never the street address or a budget", async () => {
    const d = deps({ loadFacts: vi.fn(async () => CASE_STUDY_FACTS) });
    await runFinancingPartnerFeed(caseStudyInput, d);
    const mstr = bodyOf(callTo(d.fetchImpl, MSTR_URL));
    const inbound = bodyOf(callTo(d.fetchImpl, INBOUND_URL));
    const pageUrl = "https://home.example.test/newsite/case-studies/orem-utah-511755547";
    expect(mstr.custom_fields).toEqual({
      market: "Daytona Beach",
      property_url: pageUrl,
      propertyUrl: pageUrl,
      "Property URL": pageUrl,
      case_study: "How a first-time investor bought in Orem",
    });
    expect(inbound.custom_fields).toEqual({ market: "Daytona Beach" });
    const sent = JSON.stringify([mstr, inbound]);
    expect(sent).not.toContain("Touchstone");
    expect(sent).not.toContain("608");
    expect((d.logTimeline as any).mock.calls[0][0].details.fromCaseStudy).toBe(true);
  });

  it("falls back to the city when the market is unknown", () => {
    const lead = financingLeadContext(caseStudyInput, { ...CASE_STUDY_FACTS, marketName: null }, ENV);
    expect(lead).toMatchObject({ market: "Port Orange, FL", propertyAddress: null, price: null });
  });
});

describe("other website requests", () => {
  it("never reach the partners", async () => {
    for (const requestType of [undefined, null, "showing", "analysis"]) {
      const d = deps();
      expect(await runFinancingPartnerFeed({ ...propertyInput, requestType }, d)).toBeNull();
      queueFinancingPartnerFeed({ ...propertyInput, requestType }, d);
      await new Promise(resolve => setImmediate(resolve));
      expect(d.fetchImpl).not.toHaveBeenCalled();
      expect(d.loadFacts).not.toHaveBeenCalled();
    }
  });
});

describe("website.submitLead", () => {
  const router = readFileSync(path.join(import.meta.dirname, "routers/website.ts"), "utf8").replace(/\r\n/g, "\n");
  const submitLead = router.slice(router.indexOf("  submitLead: publicProcedure"), router.indexOf("  adminOverview:"));

  it("queues the feed for financing requests only, without awaiting it", () => {
    expect(submitLead).toContain('if (input.requestType === "financing") {\n        queueFinancingPartnerFeed(');
    expect(submitLead).not.toMatch(/await\s+queueFinancingPartnerFeed|await\s+runFinancingPartnerFeed/);
    // After the throttle, the honeypot and the duplicate check, so a bot or a
    // double click is never passed on.
    expect(submitLead.indexOf("queueFinancingPartnerFeed(")).toBeGreaterThan(submitLead.indexOf("recentDuplicate[0]"));
    expect(submitLead.indexOf("queueFinancingPartnerFeed(")).toBeGreaterThan(submitLead.indexOf("if (input.website)"));
  });
});

describe("partner URLs must be https", () => {
  it("accepts https, refuses http unless FINANCING_PARTNER_ALLOW_HTTP is on, and refuses junk", () => {
    expect(partnerUrlStatus("https://lender.test/x", false)).toBe("ok");
    expect(partnerUrlStatus("http://104.0.0.1:3000/api", false)).toBe("refused");
    expect(partnerUrlStatus("http://104.0.0.1:3000/api", true)).toBe("insecure-allowed");
    expect(partnerUrlStatus("ftp://lender.test", true)).toBe("refused");
    expect(partnerUrlStatus("not a url", true)).toBe("refused");
  });

  it("skips an http partner by default, with a warning naming the setting, and still sends to the other", async () => {
    const fetchImpl = okFetch();
    const d = deps({
      env: { ...ENV, FINANCING_PARTNER_INBOUND_URL: "http://inbound.test:3000/api/leads/inbound" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await runFinancingPartnerFeed(propertyInput, d);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(callTo(fetchImpl, MSTR_URL)).toBeTruthy();
    const warnings = d.warn.mock.calls.map((call: any[]) => String(call[0])).join("\n");
    expect(warnings).toContain("Refused FINANCING_PARTNER_INBOUND_URL");
    expect(warnings).toContain("FINANCING_PARTNER_ALLOW_HTTP");
    expect(warnings).not.toContain("test-inbound-token");
  });

  it("sends to an http partner when allowed, and warns that it is not encrypted", async () => {
    const httpUrl = "http://inbound.test:3000/api/leads/inbound";
    const fetchImpl = okFetch();
    const d = deps({
      env: { ...ENV, FINANCING_PARTNER_INBOUND_URL: httpUrl, FINANCING_PARTNER_ALLOW_HTTP: "on" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await runFinancingPartnerFeed(propertyInput, d);
    expect(callTo(fetchImpl, httpUrl)).toBeTruthy();
    const warnings = d.warn.mock.calls.map((call: any[]) => String(call[0])).join("\n");
    expect(warnings).toContain("plain http to FINANCING_PARTNER_INBOUND_URL");
  });

  it("reports refused URLs by name only", () => {
    const config = readFinancingPartnerConfig({ ...ENV, FINANCING_PARTNER_MSTR_URL: "http://lender.test" });
    expect(config.mstr).toBeNull();
    expect(config.refused).toEqual(["FINANCING_PARTNER_MSTR_URL"]);
  });
});

describe("daily cap", () => {
  it("defaults to 50 and can be configured", () => {
    expect(readFinancingPartnerConfig(ENV).dailyCap).toBe(50);
    expect(readFinancingPartnerConfig({ ...ENV, FINANCING_PARTNER_DAILY_CAP: "5" }).dailyCap).toBe(5);
    expect(readFinancingPartnerConfig({ ...ENV, FINANCING_PARTNER_DAILY_CAP: "junk" }).dailyCap).toBe(50);
  });

  it("skips and logs once today's count reaches the cap, without calling any partner", async () => {
    const fetchImpl = okFetch();
    const d = deps({
      env: { ...ENV, FINANCING_PARTNER_DAILY_CAP: "50" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      countSentToday: vi.fn(async () => 50),
    });
    const result = await runFinancingPartnerFeed(propertyInput, d);
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(d.warn.mock.calls.map((call: any[]) => String(call[0])).join("\n")).toContain("Daily cap of 50 reached");
    expect(d.logTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ action: FINANCING_PARTNER_SKIPPED_ACTION, entityId: propertyInput.contactId })
    );
  });

  it("sends below the cap, and counts this server's own sends when the database count is unavailable", async () => {
    const fetchImpl = okFetch();
    const d = deps({
      env: { ...ENV, FINANCING_PARTNER_DAILY_CAP: "2" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      countSentToday: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    await runFinancingPartnerFeed(propertyInput, d);
    await runFinancingPartnerFeed(propertyInput, d);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    await runFinancingPartnerFeed(propertyInput, d);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("counts from midnight Eastern", () => {
    const start = startOfEasternDay(new Date("2026-10-05T15:30:00Z"));
    expect(start.toISOString()).toBe("2026-10-05T04:00:00.000Z");
  });

  it("is wired in submitLead from today's timeline entries", () => {
    const router = readFileSync(path.resolve(__dirname, "routers/website.ts"), "utf8");
    expect(router).toContain("eq(activityLog.action, FINANCING_PARTNER_ACTION)");
    expect(router).toContain("gte(activityLog.createdAt, startOfEasternDay())");
  });
});

describe("spam checks run before any partner send", () => {
  it("honeypot, IP/email throttle and the 60-second duplicate check come before the feed in submitLead", () => {
    const router = readFileSync(path.resolve(__dirname, "routers/website.ts"), "utf8");
    const start = router.indexOf("  submitLead: publicProcedure");
    const body = router.slice(start);
    const at = (needle: string) => body.indexOf(needle);
    const feed = at("queueFinancingPartnerFeed(");
    expect(feed).toBeGreaterThan(0);
    for (const check of [
      "if (input.website) return { success: true };",
      "await enforceLeadThrottle(db, ctx.req, normalizedEmail);",
      "if (recentDuplicate[0]) return { success: true };",
    ]) {
      expect(at(check)).toBeGreaterThan(0);
      expect(at(check)).toBeLessThan(feed);
    }
  });
});
