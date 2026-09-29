import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { isOldSiteSocialSource, isOrganicSocialName, organicSocialTarget } from "@shared/organicSocial";
import { resetOrganicSocialCache, resolveOrganicSocialLeadSourceId } from "./organicSocialLeadSources";

/**
 * Cam's request (28 Sep 2026): organic social posts need a lead source before
 * the first one goes out, because a lead source locks at creation and Smart
 * Plans enrol by it.
 */
describe("which visits are organic social", () => {
  it("maps each spelled-out platform with utm_medium=social to its sub-source", () => {
    expect(organicSocialTarget({ utmSource: "instagram", utmMedium: "social" })).toEqual({ kind: "child", child: "Instagram" });
    expect(organicSocialTarget({ utmSource: "facebook", utmMedium: "social" })).toEqual({ kind: "child", child: "Facebook" });
    expect(organicSocialTarget({ utmSource: "linkedin", utmMedium: "social" })).toEqual({ kind: "child", child: "LinkedIn" });
    expect(organicSocialTarget({ utmSource: "youtube", utmMedium: "social" })).toEqual({ kind: "child", child: "YouTube" });
    expect(organicSocialTarget({ utmSource: "tiktok", utmMedium: "social" })).toEqual({ kind: "child", child: "TikTok" });
  });

  it("files any other source with utm_medium=social under the parent", () => {
    expect(organicSocialTarget({ utmSource: "pinterest", utmMedium: "social" })).toEqual({ kind: "parent" });
    expect(organicSocialTarget({ utmMedium: "social" })).toEqual({ kind: "parent" });
  });

  it("matches the medium exactly, ignoring case and spaces, never as a contains-match", () => {
    expect(organicSocialTarget({ utmSource: "Instagram", utmMedium: " Social " })).toEqual({ kind: "child", child: "Instagram" });
    expect(organicSocialTarget({ utmSource: "facebook", utmMedium: "paid_social" })).toBeNull();
    expect(organicSocialTarget({ utmSource: "facebook", utmMedium: "social_paid" })).toBeNull();
    expect(organicSocialTarget({ utmSource: "facebook", utmMedium: "paid" })).toBeNull();
    expect(organicSocialTarget({ utmSource: "instagram" })).toBeNull();
    expect(organicSocialTarget(null)).toBeNull();
  });

  it("never files the Meta ad abbreviations fb and ig as organic, not even the parent", () => {
    expect(organicSocialTarget({ utmSource: "fb", utmMedium: "social" })).toBeNull();
    expect(organicSocialTarget({ utmSource: "IG", utmMedium: "social" })).toBeNull();
  });

  it("treats only the old site's exact \"social\" source as organic", () => {
    expect(isOldSiteSocialSource("social")).toBe(true);
    expect(isOldSiteSocialSource(" Social ")).toBe(true);
    expect(isOldSiteSocialSource("facebook_ads")).toBe(false);
    expect(isOldSiteSocialSource("social_ads")).toBe(false);
    expect(isOldSiteSocialSource(undefined)).toBe(false);
  });

  it("knows the Organic Social names", () => {
    expect(isOrganicSocialName("Facebook")).toBe(true);
    expect(isOrganicSocialName("organic social")).toBe(true);
    expect(isOrganicSocialName("Meta Ad")).toBe(false);
  });
});

/** A db whose two selects answer the parent, then its children. */
function fakeDb(parent: { id: number } | null, children: Array<{ id: number; name: string }>) {
  let call = 0;
  const calls = { count: 0 };
  const chain = (rows: unknown[]) => {
    const promise: any = Promise.resolve(rows);
    promise.limit = async () => rows;
    return promise;
  };
  const db = {
    select: () => ({
      from: () => ({
        where: () => {
          calls.count++;
          call++;
          return chain(call === 1 ? (parent ? [parent] : []) : children);
        },
      }),
    }),
  };
  return { db, calls };
}

describe("resolving the lead source for a new contact", () => {
  beforeEach(() => resetOrganicSocialCache());

  it("returns the platform sub-source", async () => {
    const { db } = fakeDb({ id: 500 }, [{ id: 501, name: "Instagram" }, { id: 502, name: "Facebook" }]);
    expect(await resolveOrganicSocialLeadSourceId(db, { utmSource: "instagram", utmMedium: "social" })).toBe(501);
  });

  it("falls back to the parent when the sub-source is missing", async () => {
    const { db } = fakeDb({ id: 500 }, []);
    expect(await resolveOrganicSocialLeadSourceId(db, { utmSource: "tiktok", utmMedium: "social" })).toBe(500);
  });

  it("returns nothing when the Organic Social rows do not exist", async () => {
    const { db } = fakeDb(null, []);
    expect(await resolveOrganicSocialLeadSourceId(db, { utmSource: "instagram", utmMedium: "social" })).toBeNull();
  });

  it("does not touch the database for a visit that is not organic social", async () => {
    const { db, calls } = fakeDb({ id: 500 }, []);
    expect(await resolveOrganicSocialLeadSourceId(db, { utmSource: "fb", utmMedium: "paid" })).toBeNull();
    expect(calls.count).toBe(0);
  });
});

const read = (file: string) =>
  readFileSync(path.resolve(import.meta.dirname, file), "utf8").replace(/\r\n/g, "\n");

describe("where the rule is applied", () => {
  it("files new website contacts from organic social and starts their Smart Plans", () => {
    const website = read("routers/website.ts");
    expect(website).toContain("const organicSourceId = await resolveOrganicSocialLeadSourceId(db, adAttribution);");
    // Organic social is checked first; the website form source only fills in when it is not organic.
    expect(website).toContain("organicSourceId ??");
    expect(website).toContain("...(leadSourceId ? { leadSourceId } : {}),");
    expect(website).toContain("await triggerSmartPlansForContact(newContactId, leadSourceId)");
    // The UTM fields are still written alongside the lead source.
    expect(website).toContain("...adAttributionUpdates(adAttribution),");
  });

  it("lets a webhook's named source win, then organic social, then the endpoint default", () => {
    const webhooks = read("webhookHandlers.ts");
    const order = [
      "(await resolveLeadSourceId((p._leadSourceName as string) || (p.leadSourceId as number), null)) ??",
      "(await resolveOrganicSocialLeadSourceId(db, adAttribution)) ??",
      "endpoint.defaultLeadSourceId ??",
    ].map(line => webhooks.indexOf(line));
    expect(order.every(index => index > -1)).toBe(true);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    // A Zap naming "Facebook" never lands in the organic rows.
    expect(webhooks).toContain("if (row && isOrganicSocialName(nameOrId)) {");
  });

  it("creates the rows at startup and retires the legacy buckets only by id, old name and parent", () => {
    const guard = read("organicSocialLeadSources.ts");
    expect(guard).toContain("UPDATE lead_sources SET name = ?, isActive = 0 WHERE id = ? AND name = ? AND parentId = ?");
    expect(guard).toContain('{ id: 112, name: "Facebook", renamed: "Facebook - Legacy Import" }');
    expect(guard).toContain('{ id: 111, name: "Instagram", renamed: "Instagram - Legacy Import" }');
    expect(guard).not.toContain("UPDATE contacts");
    expect(read("_core/index.ts")).toContain("await ensureOrganicSocialLeadSources();");
  });

  it("keeps retired sources visible where records still carry them", () => {
    expect(read("routers/leadSources.ts")).toContain("input?.includeInactive ? undefined : eq(leadSources.isActive, true)");
    expect(read("../client/src/pages/ContactsPage.tsx")).toContain("trpc.leadSources.listFlat.useQuery({ includeInactive: true })");
    expect(read("../client/src/pages/SmartPlanEditorPage.tsx")).toContain("allLeadSources.find((source) => source.id === id)");
  });
});
