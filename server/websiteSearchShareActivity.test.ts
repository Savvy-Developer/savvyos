/**
 * Market searches and shares by signed-in website investors reach the contact
 * timeline under the old site's action names, behind a switch that is off by
 * default. No real database: the db is a stand-in that answers by table and
 * records inserts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { activityLog, contacts, marketProfiles, properties, websiteBlogPosts } from "../drizzle/schema";
import {
  describeSearch,
  isEmptySearch,
  searchSignature,
} from "@shared/websiteSearchShareActivity";

const env = vi.hoisted(() => ({ flag: "" }));
const auth = vi.hoisted(() => ({ account: null as any }));
const dbState = vi.hoisted(() => ({ db: null as any }));

vi.mock("./_core/env", async importOriginal => {
  const actual: any = await importOriginal();
  return {
    ENV: new Proxy(actual.ENV, {
      get: (target, key) => (key === "websiteTimelineSearchShareEnabled" ? env.flag : target[key]),
    }),
  };
});
vi.mock("./_core/websiteAccountAuth", async importOriginal => {
  const actual: any = await importOriginal();
  return { ...actual, accountFromRequest: vi.fn(async () => auth.account) };
});
vi.mock("./db", async importOriginal => {
  const actual: any = await importOriginal();
  return { ...actual, getDb: vi.fn(async () => dbState.db) };
});
vi.mock("./_core/auditMiddleware", async importOriginal => {
  const actual: any = await importOriginal();
  return { ...actual, auditLogMutation: vi.fn(async () => undefined) };
});
vi.mock("./smartPlanScheduler", () => ({ triggerSmartPlansForContact: vi.fn(async () => undefined) }));

import {
  REPEAT_SEARCH_QUIET_MS,
  SEARCH_SHARE_THROTTLE_RULES,
  SearchShareGuard,
  WEBSITE_ACTIVITY_VIA,
  recordWebsiteSearchActivity,
  recordWebsiteShareActivity,
  websiteTimelineSearchShareEnabled,
} from "./websiteActivity";
import { websiteAccountRouter } from "./routers/websiteAccount";
import { shouldAuditLog } from "./_core/auditMiddleware";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");

type Insert = { table: unknown; values: any };

function fakeDb(options: {
  contactRows?: Array<{ id: number }>;
  marketRows?: Array<{ name: string; state: string | null }>;
  propertyRows?: Array<{ address: string; city: string | null; state: string | null; zip: string | null }>;
  postRows?: Array<{ title: string; slug: string }>;
  failInsert?: boolean;
} = {}) {
  const inserts: Insert[] = [];
  return {
    inserts,
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === contacts) return options.contactRows ?? [];
            if (table === marketProfiles) return options.marketRows ?? [];
            if (table === properties) return options.propertyRows ?? [];
            if (table === websiteBlogPosts) return options.postRows ?? [];
            return [];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: async (values: any) => {
        if (options.failInsert) throw new Error("insert failed");
        inserts.push({ table, values });
        return [{ insertId: 1 }];
      },
    }),
  };
}

const account = { id: 9, email: "pat.lee@example.com", firstName: "Pat", lastName: "Lee", phone: null, contactId: null };

beforeEach(() => {
  env.flag = "";
  auth.account = null;
  dbState.db = null;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("what counts as a search", () => {
  it("ignores an empty search and a one-letter stub", () => {
    expect(isEmptySearch({})).toBe(true);
    expect(isEmptySearch({ query: "  " })).toBe(true);
    expect(isEmptySearch({ query: "a" })).toBe(true);
    expect(isEmptySearch({ minBeds: 0, minPrice: null })).toBe(true);
  });

  it("counts text or any filter", () => {
    expect(isEmptySearch({ query: "Austin" })).toBe(false);
    expect(isEmptySearch({ marketId: 4 })).toBe(false);
    expect(isEmptySearch({ minBeds: 3 })).toBe(false);
  });

  it("treats case and spacing in the text as the same search", () => {
    expect(searchSignature({ query: " Austin  TX" }, "properties")).toBe(
      searchSignature({ query: "austin tx" }, "properties")
    );
    expect(searchSignature({ query: "Austin" }, "properties")).not.toBe(
      searchSignature({ query: "Austin", minBeds: 3 }, "properties")
    );
    expect(searchSignature({ marketId: 4 }, "properties")).not.toBe(
      searchSignature({ marketId: 4 }, "market_page")
    );
  });

  it("describes a search in one line", () => {
    expect(
      describeSearch({ query: "lake", marketId: 4, minBeds: 3, minPrice: 500000, maxPrice: 1000000 }, "Destin, FL")
    ).toBe('"lake" · Market: Destin, FL · 3+ beds · $500k–$1M');
    expect(describeSearch({ maxPrice: 750000, propertyType: "Cabin" })).toBe("Type: Cabin · Up to $750k");
    expect(describeSearch({})).toBe("All properties");
  });
});

describe("the switch", () => {
  it("is off unless exactly true", () => {
    for (const value of [undefined, null, "", " ", "1", "yes", "false"]) {
      expect(websiteTimelineSearchShareEnabled(value as any)).toBe(false);
    }
    expect(websiteTimelineSearchShareEnabled("true")).toBe(true);
    expect(websiteTimelineSearchShareEnabled(" TRUE ")).toBe(true);
  });
});

describe("the server-side guard", () => {
  it("lets an identical search through once per quiet window", () => {
    let now = 1_000_000;
    const guard = new SearchShareGuard(() => now);
    expect(guard.firstInWindow("9:a")).toBe(true);
    expect(guard.firstInWindow("9:a")).toBe(false);
    expect(guard.firstInWindow("9:b")).toBe(true);
    now += REPEAT_SEARCH_QUIET_MS + 1;
    expect(guard.firstInWindow("9:a")).toBe(true);
  });

  it("rate-limits each account separately", () => {
    const guard = new SearchShareGuard(() => 5_000);
    const limit = SEARCH_SHARE_THROTTLE_RULES.search.limit;
    for (let i = 0; i < limit; i++) expect(guard.allow("search", 1)).toBe(true);
    expect(guard.allow("search", 1)).toBe(false);
    expect(guard.allow("search", 2)).toBe(true);
    expect(guard.allow("share", 1)).toBe(true);
  });

  it("stays bounded in memory", () => {
    const guard = new SearchShareGuard(() => 0, 3);
    for (const key of ["a", "b", "c", "d"]) expect(guard.firstInWindow(key)).toBe(true);
    // "a" was dropped to make room, so it counts again.
    expect(guard.firstInWindow("a")).toBe(true);
    expect(guard.firstInWindow("d")).toBe(false);
  });
});

describe("recording a search", () => {
  it("logs market_searched on the existing contact with what was searched", async () => {
    const db = fakeDb({ contactRows: [{ id: 41 }], marketRows: [{ name: "Destin", state: "FL" }] });
    const result = await recordWebsiteSearchActivity(db, account, {
      criteria: { query: "gulf view", marketId: 4, minBeds: 3 },
      source: "properties",
    });
    expect(result).toEqual({ logged: true, contactId: 41, createdContact: false });
    expect(db.inserts).toHaveLength(1);
    const { table, values } = db.inserts[0];
    expect(table).toBe(activityLog);
    expect(values).toMatchObject({
      userId: null,
      action: "market_searched",
      entityType: "contact",
      entityId: 41,
      relatedContactId: 41,
      details: {
        searchSummary: '"gulf view" · Market: Destin, FL · 3+ beds',
        searchQuery: "gulf view",
        marketId: 4,
        marketName: "Destin, FL",
        filters: { minBeds: 3, minPrice: null },
        searchSource: "properties",
        event: "activity.search",
        via: WEBSITE_ACTIVITY_VIA,
      },
    });
  });

  it("uses the contact staff linked without a lookup", async () => {
    const db = fakeDb({ contactRows: [] });
    const result = await recordWebsiteSearchActivity(db, { ...account, contactId: 77 }, {
      criteria: { query: "cabins" },
      source: "properties",
    });
    expect(result.contactId).toBe(77);
  });

  it("never creates a contact for a search", async () => {
    const db = fakeDb({ contactRows: [] });
    const result = await recordWebsiteSearchActivity(db, account, { criteria: { query: "Austin" }, source: "properties" });
    expect(result.logged).toBe(false);
    expect(db.inserts).toEqual([]);
  });

  it("writes nothing for an empty search", async () => {
    const db = fakeDb({ contactRows: [{ id: 41 }] });
    await recordWebsiteSearchActivity(db, account, { criteria: { query: "" }, source: "properties" });
    expect(db.inserts).toEqual([]);
  });

  it("never throws when the database fails", async () => {
    const db = fakeDb({ contactRows: [{ id: 41 }], failInsert: true });
    await expect(
      recordWebsiteSearchActivity(db, account, { criteria: { query: "Austin" }, source: "properties" })
    ).resolves.toMatchObject({ logged: false });
  });
});

describe("recording a share", () => {
  it("logs property_shared with the listing and the channel", async () => {
    const db = fakeDb({
      contactRows: [{ id: 41 }],
      propertyRows: [{ address: "12 Shore Rd", city: "Destin", state: "FL", zip: "32541" }],
    });
    const result = await recordWebsiteShareActivity(db, account, {
      target: { kind: "property", propertyId: 5 },
      channel: "whatsapp",
    });
    expect(result.logged).toBe(true);
    expect(db.inserts[0].values).toMatchObject({
      action: "property_shared",
      entityId: 41,
      details: {
        propertyId: 5,
        propertyAddress: "12 Shore Rd, Destin, FL",
        propertyZip: "32541",
        shareChannel: "whatsapp",
        shareChannelLabel: "WhatsApp",
        event: "activity.share",
        via: WEBSITE_ACTIVITY_VIA,
      },
    });
  });

  it("logs article_shared with the article title", async () => {
    const db = fakeDb({ contactRows: [{ id: 41 }], postRows: [{ title: "STR taxes", slug: "str-taxes" }] });
    await recordWebsiteShareActivity(db, account, { target: { kind: "post", contentId: 3 }, channel: "copy_link" });
    expect(db.inserts[0].values).toMatchObject({
      action: "article_shared",
      details: { contentId: 3, contentTitle: "STR taxes", contentSlug: "str-taxes", shareChannel: "copy_link" },
    });
  });

  it("never creates a contact for a share", async () => {
    const db = fakeDb({ contactRows: [] });
    const result = await recordWebsiteShareActivity(db, account, {
      target: { kind: "property", propertyId: 5 },
      channel: "x",
    });
    expect(result.logged).toBe(false);
    expect(db.inserts).toEqual([]);
  });

  it("never throws when the database fails", async () => {
    const db = fakeDb({ contactRows: [{ id: 41 }], failInsert: true });
    await expect(
      recordWebsiteShareActivity(db, account, { target: { kind: "property", propertyId: 5 }, channel: "x" })
    ).resolves.toMatchObject({ logged: false });
  });
});

function caller() {
  return websiteAccountRouter.createCaller({
    user: null,
    realUser: null,
    req: { headers: {}, protocol: "https" },
    res: {},
  } as any);
}

describe("the account procedures", () => {
  it("refuse an anonymous visitor", async () => {
    env.flag = "true";
    await expect(caller().recordSearch({ source: "properties", query: "Austin" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      caller().recordShare({ target: { kind: "property", propertyId: 1 }, channel: "x" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("write nothing while the switch is off", async () => {
    auth.account = { ...account, id: 101 };
    const db = fakeDb({ contactRows: [{ id: 41 }] });
    dbState.db = db;
    expect(await caller().recordSearch({ source: "properties", query: "Austin" })).toEqual({ ok: true });
    expect(
      await caller().recordShare({ target: { kind: "property", propertyId: 1 }, channel: "x" })
    ).toEqual({ ok: true });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(db.inserts).toEqual([]);
  });

  it("log a search once, then skip the identical repeat", async () => {
    env.flag = "true";
    auth.account = { ...account, id: 102 };
    const db = fakeDb({ contactRows: [{ id: 41 }] });
    dbState.db = db;
    await caller().recordSearch({ source: "properties", query: "Destin", minBeds: 2 });
    await caller().recordSearch({ source: "properties", query: " destin ", minBeds: 2 });
    await new Promise(resolve => setTimeout(resolve, 0));
    const searches = db.inserts.filter(i => i.values.action === "market_searched");
    expect(searches).toHaveLength(1);
  });

  it("skip an empty search", async () => {
    env.flag = "true";
    auth.account = { ...account, id: 103 };
    const db = fakeDb({ contactRows: [{ id: 41 }] });
    dbState.db = db;
    await caller().recordSearch({ source: "properties", query: "" });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(db.inserts).toEqual([]);
  });

  it("stop logging searches past the rate limit", async () => {
    env.flag = "true";
    auth.account = { ...account, id: 104 };
    const db = fakeDb({ contactRows: [{ id: 41 }] });
    dbState.db = db;
    const limit = SEARCH_SHARE_THROTTLE_RULES.search.limit;
    for (let i = 0; i < limit + 5; i++) {
      await caller().recordSearch({ source: "properties", query: `town ${i}` });
    }
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(db.inserts.filter(i => i.values.action === "market_searched")).toHaveLength(limit);
  });

  it("log a share, once per listing and channel in a short window", async () => {
    env.flag = "true";
    auth.account = { ...account, id: 105 };
    const db = fakeDb({ contactRows: [{ id: 41 }] });
    dbState.db = db;
    await caller().recordShare({ target: { kind: "property", propertyId: 7 }, channel: "copy_link" });
    await caller().recordShare({ target: { kind: "property", propertyId: 7 }, channel: "copy_link" });
    await caller().recordShare({ target: { kind: "property", propertyId: 7 }, channel: "facebook" });
    await new Promise(resolve => setTimeout(resolve, 0));
    const shares = db.inserts.filter(i => i.values.action === "property_shared");
    expect(shares.map(s => s.values.details.shareChannel)).toEqual(["copy_link", "facebook"]);
  });
});

describe("where it is wired in", () => {
  const site = read("client/src/pages/PublicWebsite.tsx");
  const parts = read("client/src/components/website/liveSiteParts.tsx");
  const hooks = read("client/src/components/website/publicAccountPages.tsx");

  it("records searches from the Properties page and market pages", () => {
    expect(site).toMatch(/useRecordSearch\(\s*\{\s*query: debouncedSearch/);
    expect(site).toContain('useRecordSearch(market?.id ? { marketId: Number(market.id) } : null, "market_page")');
  });

  it("only sends for a signed-in visitor, after the search has stood, once per session", () => {
    expect(hooks).toMatch(/if \(!signedIn \|\| !signature\) return;/);
    expect(hooks).toContain("firstThisSession(`search:${signature}`)");
    expect(hooks).toContain("COMMITTED_SEARCH_MS = 2000");
    expect(hooks).toMatch(/if \(!signedIn \|\| !target\) return;/);
  });

  it("records shares from every share button", () => {
    expect(parts).toContain('recordShare(target, "copy_link")');
    expect(parts).toContain("recordShare(target, channel)");
    expect(parts).toMatch(/target=\{item\.propertyId \? \{ kind: "property"/);
    expect(site).toMatch(/pill\s+target=\{item\.propertyId \? \{ kind: "property"/);
    expect(site).toContain('recordShare(shareTarget, "copy_link")');
    expect(site).toContain('recordShare(shareTarget, "x")');
    expect(site).toContain('recordShare(shareTarget, "linkedin")');
  });

  it("keeps the two procedures out of the generic audit log", () => {
    expect(shouldAuditLog("mutation", "websiteAccount.recordSearch")).toBe(false);
    expect(shouldAuditLog("mutation", "websiteAccount.recordShare")).toBe(false);
  });

  it("reads the switch from the environment, off by default", () => {
    expect(read("server/_core/env.ts")).toContain(
      'websiteTimelineSearchShareEnabled: process.env.WEBSITE_TIMELINE_SEARCH_SHARE_ENABLED ?? ""'
    );
  });
});
