import { beforeEach, describe, expect, it, vi } from "vitest";

import { websitePages, websiteProperties, websiteSiteSettings } from "../drizzle/schema";
import {
  injectNotFoundHead,
  isWebsitePath,
  parseWebsitePath,
  spaStatus,
  websitePageStatus,
} from "./websiteSeoPages";

vi.mock("./db", async importOriginal => ({ ...(await importOriginal<typeof import("./db")>()), getDb: vi.fn() }));
vi.mock("./routers/website", async importOriginal => ({
  ...(await importOriginal<typeof import("./routers/website")>()),
  loadMarketDirectory: vi.fn(),
}));
vi.mock("./staffWebsiteHandoff", async importOriginal => ({
  ...(await importOriginal<typeof import("./staffWebsiteHandoff")>()),
  staffFromRequest: vi.fn(),
}));

const { getDb } = await import("./db");
const { staffFromRequest } = await import("./staffWebsiteHandoff");
const { loadMarketDirectory } = await import("./routers/website");
const { resolveWebsitePage } = await import("./websiteSeo");

const status = (path: string, lookup: "published" | "draft" | "missing", visitorIsStaff = false) =>
  websitePageStatus({ route: parseWebsitePath(path), lookup, visitorIsStaff });

describe("websitePageStatus", () => {
  it("is 200 for a published listing, agent, article, case study, market or CMS page", () => {
    for (const p of [
      "/newsite/properties/12-oak-st",
      "/newsite/agents/ana-estevez",
      "/newsite/resources/a-b",
      "/newsite/case-studies/a-b",
      "/newsite/markets/nc/asheville",
      "/newsite/privacy",
    ]) {
      expect(status(p, "published")).toBe(200);
    }
  });

  it("is 404 for a Draft listing when the visitor is not signed-in staff", () => {
    expect(status("/newsite/properties/12-oak-st", "draft")).toBe(404);
  });

  it("is 200 for a Draft listing, case study or article previewed by signed-in staff", () => {
    expect(status("/newsite/properties/12-oak-st", "draft", true)).toBe(200);
    expect(status("/newsite/case-studies/a-b", "draft", true)).toBe(200);
    expect(status("/newsite/resources/a-b", "draft", true)).toBe(200);
  });

  it("is 404 for staff too where the site has no draft preview (agents, CMS pages)", () => {
    expect(status("/newsite/agents/ana-estevez", "draft", true)).toBe(404);
    expect(status("/newsite/some-page", "draft", true)).toBe(404);
  });

  it("is 404 for an unknown slug, staff or not", () => {
    expect(status("/newsite/properties/no-such-listing", "missing")).toBe(404);
    expect(status("/newsite/properties/no-such-listing", "missing", true)).toBe(404);
    expect(status("/newsite/markets/zz/nowhere", "missing")).toBe(404);
    expect(status("/newsite/garbage", "missing")).toBe(404);
  });

  it("is 404 for an address the site does not route at all", () => {
    expect(status("/newsite/a/b/c/d", "missing")).toBe(404);
    expect(status("/newsite/properties/bad_slug!", "missing")).toBe(404);
  });

  it("reads a market or CMS address the way the client does", () => {
    // A market whose state is saved with a space: the client decodes the
    // segment and matches it case-insensitively.
    for (const p of [
      "/newsite/markets/north%20carolina/asheville",
      "/newsite/markets/North%20Carolina/Asheville/",
      "/newsite/markets/north carolina/asheville",
    ]) {
      expect(parseWebsitePath(p)).toEqual({ kind: "market", state: "north carolina", city: "asheville" });
    }
    // A CMS page is looked up by its cleaned slug, whatever the case. The
    // client passes this segment undecoded, so %20 cleans to "-20", as there.
    for (const p of ["/newsite/Some-Page", "/newsite/some-page/", "/newsite/SOME_PAGE", "/newsite/some%20page"]) {
      expect(parseWebsitePath(p)).toEqual({ kind: "page", slug: p.includes("%20") ? "some-20page" : "some-page" });
    }
    expect(status("/newsite/markets/north%20carolina/asheville", "published")).toBe(200);
    expect(status("/newsite/Some-Page", "published")).toBe(200);
  });

  it("is always 200 for the home page, built-in pages and account screens", () => {
    for (const p of [
      "/newsite",
      "/newsite/",
      "/newsite/properties",
      "/newsite/agents",
      "/newsite/case-studies",
      "/newsite/resources",
      "/newsite/about",
      "/newsite/contact",
      "/newsite/markets",
      "/newsite/join-our-team",
      "/newsite/team",
      "/newsite/sell",
      "/newsite/sign-in",
      "/newsite/confirm-email",
      "/newsite/account/saved",
    ]) {
      expect(status(p, "missing")).toBe(200);
    }
  });
});

describe("helpers", () => {
  it("knows which paths are the public site", () => {
    expect(isWebsitePath("/newsite")).toBe(true);
    expect(isWebsitePath("/newsite/")).toBe(true);
    expect(isWebsitePath("/newsite/x")).toBe(true);
    expect(isWebsitePath("/newsitex")).toBe(false);
    expect(isWebsitePath("/api/trpc/x")).toBe(false);
    expect(isWebsitePath("/sitemap.xml")).toBe(false);
  });

  it("marks a 404 page noindex with the not-found title", () => {
    const html = injectNotFoundHead("<html><head><title>SavvyOS</title></head><body></body></html>");
    expect(html).toContain("<title>Page not found | Savvy STR Agents</title>");
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(html).not.toContain("<title>SavvyOS</title>");
  });

  it("serves the app with 404 only when the metadata step said so", () => {
    expect(spaStatus({ websiteNotFound: true })).toBe(404);
    expect(spaStatus({ websiteNotFound: false })).toBe(200);
    expect(spaStatus({})).toBe(200);
  });
});

/**
 * A stand-in for the drizzle client: each query on a table answers with the
 * next result queued for that table, or no rows.
 */
function fakeDb(results: Map<unknown, unknown[][]>) {
  const query = (table: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["innerJoin", "leftJoin", "where", "orderBy"]) chain[method] = () => chain;
    chain.limit = async () => results.get(table)?.shift() ?? [];
    return chain;
  };
  return { select: () => ({ from: (table: unknown) => query(table) }) };
}

const request = (path: string, hostname = "home.savvy-agents.com") => ({ path, hostname, headers: {} }) as any;

describe("resolveWebsitePage", () => {
  beforeEach(() => {
    vi.mocked(staffFromRequest).mockReset();
    vi.mocked(staffFromRequest).mockResolvedValue(null);
  });

  const withRows = (rows: Array<[unknown, unknown[][]]>) =>
    vi.mocked(getDb).mockResolvedValue(fakeDb(new Map([[websiteSiteSettings, [[]]], ...rows])) as any);

  it("is 200 with metadata for a published listing", async () => {
    withRows([[websiteProperties, [[{ address: "12 Oak St", city: "Asheville", state: "NC" }]]]]);
    const page = await resolveWebsitePage(request("/newsite/properties/12-oak-st"));
    expect(page?.status).toBe(200);
    expect(page?.metadata?.pageTitle).toContain("12 Oak St");
  });

  it("is 404 for a Draft listing opened by an anonymous visitor", async () => {
    withRows([[websiteProperties, [[], [{ id: 1 }]]]]);
    const page = await resolveWebsitePage(request("/newsite/properties/draft-one"));
    expect(page).toEqual({ status: 404, metadata: null });
  });

  it("is 200 for a Draft listing opened by signed-in staff", async () => {
    vi.mocked(staffFromRequest).mockResolvedValue({ id: 7 } as any);
    withRows([[websiteProperties, [[], [{ id: 1 }]]]]);
    const page = await resolveWebsitePage(request("/newsite/properties/draft-one"));
    expect(page).toEqual({ status: 200, metadata: null });
  });

  it("is 404 for an unknown slug, even for staff", async () => {
    vi.mocked(staffFromRequest).mockResolvedValue({ id: 7 } as any);
    withRows([[websiteProperties, [[], []]]]);
    const page = await resolveWebsitePage(request("/newsite/properties/no-such-listing"));
    expect(page?.status).toBe(404);
  });

  it("is 200 for a built-in page", async () => {
    withRows([]);
    expect((await resolveWebsitePage(request("/newsite/properties")))?.status).toBe(200);
    expect((await resolveWebsitePage(request("/newsite")))?.status).toBe(200);
  });

  it("is 404 for an address the site does not route", async () => {
    withRows([]);
    expect((await resolveWebsitePage(request("/newsite/a/b/c/d")))?.status).toBe(404);
  });

  it("is 200 for a market whose state is written with a space", async () => {
    withRows([]);
    vi.mocked(loadMarketDirectory).mockResolvedValue([
      { id: 1, name: "Asheville", state: "North Carolina", status: "active", propertyCount: 2 },
    ] as any);
    for (const p of [
      "/newsite/markets/north%20carolina/asheville",
      "/newsite/markets/North%20Carolina/Asheville",
    ]) {
      const page = await resolveWebsitePage(request(p));
      expect(page?.status).toBe(200);
      expect(page?.metadata?.pageTitle).toContain("Asheville, North Carolina");
      expect(page?.metadata?.canonicalUrl).toMatch(/\/newsite\/markets\/north%20carolina\/asheville$/);
    }
    // The client does not turn "north-carolina" into "north carolina", so
    // neither does the server: that address shows "not found" in both.
    expect((await resolveWebsitePage(request("/newsite/markets/north-carolina/asheville")))?.status).toBe(404);
  });

  it("is 200 for a published CMS page whatever the case of its address", async () => {
    for (const p of ["/newsite/Some-Page", "/newsite/some-page", "/newsite/SOME_PAGE"]) {
      withRows([[websitePages, [[{ name: "Some Page", metaTitle: null, bodyMarkdown: "Hello there." }]]]]);
      const page = await resolveWebsitePage(request(p));
      expect(page?.status).toBe(200);
      expect(page?.metadata?.canonicalUrl).toMatch(/\/newsite\/some-page$/);
    }
    withRows([]);
    expect((await resolveWebsitePage(request("/newsite/No-Such-Page")))?.status).toBe(404);
  });

  it("leaves other hosts, other paths and a missing database alone", async () => {
    withRows([]);
    expect(await resolveWebsitePage(request("/newsite/properties/x", "os.savvy-agents.com"))).toBeNull();
    expect(await resolveWebsitePage(request("/api/trpc/website.publicHome"))).toBeNull();
    expect(await resolveWebsitePage(request("/sitemap.xml"))).toBeNull();
    vi.mocked(getDb).mockResolvedValue(null as any);
    expect(await resolveWebsitePage(request("/newsite/properties/x"))).toBeNull();
  });
});
