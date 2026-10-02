/**
 * New website accounts join the Resend list chosen in Website Studio.
 * Nothing here reaches Resend or a database: fetch and the db are stand-ins.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addResendContactToSegment, listResendSegments } from "./_core/resendMarketingBroadcast";
import {
  WEBSITE_SIGNUP_AUDIENCE_DDL,
  addSignupToResendAudience,
  cleanSegmentId,
  emailIsSuppressed,
  getSignupSegmentId,
} from "./websiteSignupAudience";

const root = path.resolve(import.meta.dirname, "..");
// Line endings are normalised: core.autocrlf checks files out with CRLF on Windows.
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");

type Call = { url: string; method: string; body: any };
let calls: Call[] = [];
let responses: Array<{ ok: boolean; status: number; body: unknown }> = [];
const originalFetch = globalThis.fetch;
const originalKey = process.env.RESEND_API_KEY;

const ok = (body: unknown = { id: "contact_1" }) => ({ ok: true, status: 200, body });
const fail = (status: number, message = "nope") => ({ ok: false, status, body: { message } });

beforeEach(() => {
  calls = [];
  responses = [];
  process.env.RESEND_API_KEY = "test-key";
  globalThis.fetch = (async (url: any, init: any = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : null });
    const next = responses.shift() ?? ok();
    return { ok: next.ok, status: next.status, text: async () => JSON.stringify(next.body) } as any;
  }) as any;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalKey;
  vi.restoreAllMocks();
});

/** A db whose saved list is `segmentId` and whose contacts with that email are `contactRows`. */
function dbWith(segmentId: unknown, contactRows: Array<{ emailStatus: string | null }> | Error = []) {
  return {
    execute: async () => [[{ segmentId }]],
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (contactRows instanceof Error) throw contactRows;
            return contactRows;
          },
        }),
      }),
    }),
  };
}

describe("the chosen list", () => {
  it("treats blank, non-text and over-long values as no list", () => {
    expect(cleanSegmentId("  seg_1 ")).toBe("seg_1");
    expect(cleanSegmentId("")).toBeNull();
    expect(cleanSegmentId("   ")).toBeNull();
    expect(cleanSegmentId(null)).toBeNull();
    expect(cleanSegmentId(42)).toBeNull();
    expect(cleanSegmentId("x".repeat(256))).toBeNull();
  });

  it("reads the saved list from either result shape the driver returns", async () => {
    expect(await getSignupSegmentId({ execute: async () => [[{ segmentId: "seg_1" }], []] })).toBe("seg_1");
    expect(await getSignupSegmentId({ execute: async () => [{ segmentId: "seg_2" }] })).toBe("seg_2");
    expect(await getSignupSegmentId({ execute: async () => [[]] })).toBeNull();
    expect(await getSignupSegmentId(dbWith(null))).toBeNull();
  });

  it("is simply off when the table is missing, instead of failing", async () => {
    const db = {
      execute: async () => {
        throw new Error("Table 'railway.website_signup_audience' doesn't exist");
      },
    };
    expect(await getSignupSegmentId(db)).toBeNull();
    const result = await addSignupToResendAudience(db, { email: "a@example.com" });
    expect(result).toEqual({ attempted: false, success: false, reason: "No list chosen" });
    expect(calls).toHaveLength(0);
  });

  it("lives in its own table, created only if missing, with a matching SQL record", () => {
    expect(WEBSITE_SIGNUP_AUDIENCE_DDL).toContain("CREATE TABLE IF NOT EXISTS `website_signup_audience`");
    expect(WEBSITE_SIGNUP_AUDIENCE_DDL).not.toMatch(/ALTER TABLE|DROP /i);
    const record = read("drizzle/20261002_website_signup_audience.sql");
    expect(record).toContain("CREATE TABLE IF NOT EXISTS `website_signup_audience`");
    for (const column of ["singletonKey", "segmentId", "updatedById", "updatedAt"]) {
      expect(WEBSITE_SIGNUP_AUDIENCE_DDL).toContain(`\`${column}\``);
      expect(record).toContain(`\`${column}\``);
    }
  });
});

describe("adding a sign-up to the list", () => {
  it("sends nothing to Resend until a list is chosen", async () => {
    const result = await addSignupToResendAudience(dbWith(null), { email: "a@example.com" });
    expect(result.attempted).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("adds an address Resend already knows to the list and changes nothing else about it", async () => {
    responses = [ok({ id: "contact_9" })];
    const result = await addResendContactToSegment({ email: "Old@Example.com", segmentId: "seg 1" });
    expect(result).toEqual({ success: true, data: { id: "contact_9" } });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.resend.com/contacts/old%40example.com/segments/seg%201");
    expect(calls[0].body).toBeNull();
  });

  it("creates a contact Resend does not know, already on the list, without sending unsubscribed", async () => {
    responses = [fail(404, "Contact not found"), ok({ id: "contact_new" })];
    const result = await addSignupToResendAudience(dbWith("seg_1"), {
      email: "New.Person@Example.com",
      firstName: "New",
      lastName: "Person",
    });
    expect(result).toEqual({ attempted: true, success: true });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://api.resend.com/contacts/new.person%40example.com/segments/seg_1");
    expect(calls[1].url).toBe("https://api.resend.com/contacts");
    expect(calls[1].method).toBe("POST");
    expect(calls[1].body).toEqual({
      email: "new.person@example.com",
      first_name: "New",
      last_name: "Person",
      segments: [{ id: "seg_1" }],
    });
    expect(calls[1].body).not.toHaveProperty("unsubscribed");
  });

  it("does not create a contact when Resend is rate limiting or down", async () => {
    for (const status of [429, 500, 503]) {
      calls = [];
      responses = [fail(status)];
      const result = await addResendContactToSegment({ email: "a@example.com", segmentId: "seg_1" });
      expect(result.success).toBe(false);
      expect(calls).toHaveLength(1);
    }
  });

  it("skips someone SavvyOS has as unsubscribed or bounced", async () => {
    for (const emailStatus of ["unsubscribed", "bounced"]) {
      calls = [];
      const db = dbWith("seg_1", [{ emailStatus: "valid" }, { emailStatus }]);
      expect(await emailIsSuppressed(db, "a@example.com")).toBe(true);
      const result = await addSignupToResendAudience(db, { email: "a@example.com" });
      expect(result).toEqual({ attempted: false, success: false, reason: "Unsubscribed or bounced in SavvyOS" });
      expect(calls).toHaveLength(0);
    }
    expect(await emailIsSuppressed(dbWith("seg_1", [{ emailStatus: "valid" }, { emailStatus: null }]), "a@example.com")).toBe(false);
    expect(await emailIsSuppressed(dbWith("seg_1", []), "a@example.com")).toBe(false);
  });

  it("adds nobody when the unsubscribe check itself fails", async () => {
    const db = dbWith("seg_1", new Error("connection lost"));
    expect(await emailIsSuppressed(db, "a@example.com")).toBe(true);
    const result = await addSignupToResendAudience(db, { email: "a@example.com" });
    expect(result.attempted).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("reports both failures and never throws when Resend refuses or is unreachable", async () => {
    responses = [fail(404, "Contact not found"), fail(422, "bad segment")];
    const result = await addSignupToResendAudience(dbWith("seg_1"), { email: "a@example.com" });
    expect(result.attempted).toBe(true);
    expect(result.success).toBe(false);
    expect(result.reason).toContain("(404)");
    expect(result.reason).toContain("; then ");
    expect(result.reason).toContain("(422)");

    calls = [];
    globalThis.fetch = (async () => {
      calls.push({ url: "x", method: "POST", body: null });
      throw new Error("network down");
    }) as any;
    const second = await addSignupToResendAudience(dbWith("seg_1"), { email: "a@example.com" });
    expect(second.success).toBe(false);
    expect(second.reason).toContain("network down");
    expect(calls).toHaveLength(1);
  });

  it("needs both an email and a list", async () => {
    expect((await addResendContactToSegment({ email: " ", segmentId: "seg_1" })).success).toBe(false);
    expect((await addResendContactToSegment({ email: "a@example.com", segmentId: " " })).success).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("loading the lists from Resend", () => {
  it("reads every page, not just the first 20", async () => {
    responses = [
      ok({ has_more: true, data: [{ id: "s1", name: "One" }, { id: "s2" }] }),
      ok({ has_more: false, data: [{ id: "s3", name: "Three" }] }),
    ];
    const result = await listResendSegments();
    expect(result).toEqual({
      success: true,
      data: [
        { id: "s1", name: "One" },
        { id: "s2", name: "s2" },
        { id: "s3", name: "Three" },
      ],
    });
    expect(calls.map(call => call.url)).toEqual([
      "https://api.resend.com/segments?limit=100",
      "https://api.resend.com/segments?limit=100&after=s2",
    ]);
  });

  it("stops on one page when there are no more, and passes a failure through", async () => {
    responses = [ok({ data: [{ id: "s1", name: "One" }] })];
    expect((await listResendSegments()).success).toBe(true);
    expect(calls).toHaveLength(1);

    calls = [];
    responses = [fail(500)];
    const failed = await listResendSegments();
    expect(failed.success).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

describe("how it is wired", () => {
  it("runs after the account exists and is not awaited, so it cannot fail a sign-up", () => {
    const source = read("server/routers/websiteAccount.ts");
    const signUp = source.slice(source.indexOf("signUp: publicProcedure"), source.indexOf("signIn: publicProcedure"));
    const insert = signUp.indexOf("db.insert(websiteAccounts)");
    const join = signUp.indexOf("void addSignupToResendAudience(db,");
    expect(insert).toBeGreaterThan(-1);
    expect(join).toBeGreaterThan(insert);
    expect(signUp).not.toContain("await addSignupToResendAudience");
    // Staff signing in on the website are not new sign-ups.
    const rest = source.slice(source.indexOf("signIn: publicProcedure"));
    expect(rest).not.toContain("addSignupToResendAudience");
  });

  it("creates its table at startup with the other website guards", () => {
    const index = read("server/_core/index.ts");
    expect(index).toContain("await ensureWebsiteSignupAudienceSchema();");
  });

  it("only people who manage website settings can choose the list, and only a real list", () => {
    const router = read("server/routers/website.ts");
    const section = router.slice(
      router.indexOf("setSignupAudience: protectedProcedure"),
      router.indexOf("setPriceDropAlerts: protectedProcedure")
    );
    const permission = section.indexOf('requireWebsitePermission(ctx, "canManageWebsiteSettings")');
    const lists = section.indexOf("listResendSegments()");
    const save = section.indexOf("saveSignupSegmentId(");
    expect(permission).toBeGreaterThan(-1);
    expect(lists).toBeGreaterThan(permission);
    expect(save).toBeGreaterThan(lists);
  });
});
