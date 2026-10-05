/**
 * New-site sign-ups, views, favourites and requests reach the contact's
 * timeline under the old site's action names. Nothing here touches a real
 * database: the db is a stand-in that answers by table and records inserts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { activityLog, contacts, properties } from "../drizzle/schema";
import { SAVVY_WEB_EVENTS } from "./webhookHandlers";
import { WEBSITE_ACCOUNT_LEAD_SOURCE, WEBSITE_LEAD_SOURCES } from "@shared/websiteLeadSources";

const smartPlans = vi.hoisted(() => ({ trigger: vi.fn(async () => undefined) }));
const leadSource = vi.hoisted(() => ({ id: 77 as number | null }));
vi.mock("./smartPlanScheduler", () => ({ triggerSmartPlansForContact: smartPlans.trigger }));
vi.mock("./websiteLeadSources", () => ({ websiteLeadSourceId: vi.fn(async () => leadSource.id) }));

import {
  REPEAT_VIEW_QUIET_MS,
  WEBSITE_ACTIVITY_VIA,
  contactIdForAccount,
  isRepeatView,
  nameForAccount,
  recordWebsiteAccountActivity,
  recordWebsiteRequestActivity,
  websiteRequestAction,
} from "./websiteActivity";

const root = path.resolve(import.meta.dirname, "..");
// Line endings are normalised: core.autocrlf checks files out with CRLF on Windows.
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");

type Insert = { table: unknown; values: any };

/** A db that returns `contactRows` / `propertyRows` by table and records every insert. */
function fakeDb(options: {
  contactRows?: Array<{ id: number }>;
  propertyRows?: Array<{ address: string; city: string | null; state: string | null; zip: string | null }>;
  newContactId?: number;
  failInsertInto?: unknown;
} = {}) {
  const inserts: Insert[] = [];
  const db = {
    inserts,
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === contacts) return options.contactRows ?? [];
            if (table === properties) return options.propertyRows ?? [];
            return [];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: async (values: any) => {
        if (options.failInsertInto === table) throw new Error("insert failed");
        inserts.push({ table, values });
        return [{ insertId: table === contacts ? (options.newContactId ?? 501) : 1 }];
      },
    }),
  };
  return db;
}

const account = { id: 9, email: "pat.lee@example.com", firstName: "Pat", lastName: "Lee", phone: null, contactId: null };
const home = { address: "12 Shore Rd", city: "Destin", state: "FL", zip: "32541" };

beforeEach(() => {
  smartPlans.trigger.mockClear();
  leadSource.id = 77;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("which old-site action a website request is", () => {
  it("maps the three request buttons one to one", () => {
    expect(websiteRequestAction({ requestType: "showing", intent: "property", propertyId: 3 })).toBe("showing_requested");
    expect(websiteRequestAction({ requestType: "analysis", intent: "property", propertyId: 3 })).toBe("analysis_requested");
    expect(websiteRequestAction({ requestType: "financing", intent: "property", propertyId: 3 })).toBe("financing_requested");
  });

  it("treats a plain message from a property page as Message Agent", () => {
    expect(websiteRequestAction({ intent: "property", propertyId: 3 })).toBe("property_contact_requested");
  });

  it("leaves forms with no old-site equivalent as a plain website inquiry", () => {
    expect(websiteRequestAction({ intent: "general" })).toBeNull();
    expect(websiteRequestAction({ intent: "sell" })).toBeNull();
    expect(websiteRequestAction({ intent: "buy" })).toBeNull();
    expect(websiteRequestAction({ intent: "agent" })).toBeNull();
    // A case study page reuses the property form without a property.
    expect(websiteRequestAction({ intent: "property" })).toBeNull();
    expect(websiteRequestAction({})).toBeNull();
  });

  it("only uses actions the old site's webhook already writes", () => {
    const oldActions = new Set(Object.values(SAVVY_WEB_EVENTS).map(spec => spec.action));
    for (const input of [
      { requestType: "showing" },
      { requestType: "analysis" },
      { requestType: "financing" },
      { intent: "property", propertyId: 1 },
    ]) {
      expect(oldActions).toContain(websiteRequestAction(input));
    }
    for (const action of ["user_registered", "property_viewed", "property_favorited"]) {
      expect(oldActions).toContain(action);
    }
  });
});

describe("repeat views", () => {
  const now = new Date("2026-10-05T12:00:00Z");

  it("counts a first view and a view after the quiet period", () => {
    expect(isRepeatView(null, now)).toBe(false);
    expect(isRepeatView(undefined, now)).toBe(false);
    expect(isRepeatView(new Date(now.getTime() - REPEAT_VIEW_QUIET_MS), now)).toBe(false);
    expect(isRepeatView(new Date(now.getTime() - 24 * 60 * 60_000), now)).toBe(false);
  });

  it("skips a reload inside the quiet period", () => {
    expect(isRepeatView(new Date(now.getTime() - 5_000), now)).toBe(true);
    expect(isRepeatView(new Date(now.getTime() - REPEAT_VIEW_QUIET_MS + 1), now)).toBe(true);
    expect(isRepeatView("2026-10-05T11:45:00Z", now)).toBe(true);
    // A database clock a few seconds ahead still reads as the same visit.
    expect(isRepeatView(new Date(now.getTime() + 5_000), now)).toBe(true);
  });

  it("does not trust a date far in the future or one it cannot read", () => {
    expect(isRepeatView(new Date(now.getTime() + 6 * 60 * 60_000), now)).toBe(false);
    expect(isRepeatView("not a date", now)).toBe(false);
  });
});

describe("a name for the contact", () => {
  it("uses the account's own name", () => {
    expect(nameForAccount(account)).toEqual({ firstName: "Pat", lastName: "Lee" });
    expect(nameForAccount({ ...account, lastName: null })).toEqual({ firstName: "Pat", lastName: "" });
  });

  it("falls back to the email address, and never to an empty first name", () => {
    expect(nameForAccount({ id: 1, email: "jane.doe@example.com" })).toEqual({ firstName: "Jane", lastName: "Doe" });
    expect(nameForAccount({ id: 1, email: "sam@example.com" })).toEqual({ firstName: "Sam", lastName: "" });
    expect(nameForAccount({ id: 1, email: "12345@example.com" })).toEqual({ firstName: "Website", lastName: "" });
  });
});

describe("finding the contact for an account", () => {
  it("prefers the contact staff linked, without a lookup", async () => {
    const db = fakeDb({ contactRows: [{ id: 2 }] });
    expect(await contactIdForAccount(db, { ...account, contactId: 40 })).toBe(40);
  });

  it("otherwise matches on email, or finds nothing", async () => {
    expect(await contactIdForAccount(fakeDb({ contactRows: [{ id: 2 }] }), account)).toBe(2);
    expect(await contactIdForAccount(fakeDb(), account)).toBeNull();
  });
});

describe("recording what an account did", () => {
  it("logs a favourite on the existing contact with the property's address", async () => {
    const db = fakeDb({ contactRows: [{ id: 2 }], propertyRows: [home] });
    const result = await recordWebsiteAccountActivity(db, account, { action: "property_favorited", propertyId: 15 });
    expect(result).toEqual({ logged: true, contactId: 2, createdContact: false });
    expect(db.inserts).toHaveLength(1);
    const [entry] = db.inserts;
    expect(entry.table).toBe(activityLog);
    expect(entry.values).toMatchObject({
      userId: null,
      action: "property_favorited",
      entityType: "contact",
      entityId: 2,
      relatedContactId: 2,
    });
    expect(entry.values.details).toMatchObject({
      propertyId: 15,
      propertyAddress: "12 Shore Rd, Destin, FL",
      propertyCity: "Destin",
      propertyState: "FL",
      propertyZip: "32541",
      event: "activity.favorite",
      via: WEBSITE_ACTIVITY_VIA,
    });
    expect(smartPlans.trigger).not.toHaveBeenCalled();
  });

  it("creates the contact for a favourite when there is none, then logs it", async () => {
    const db = fakeDb({ propertyRows: [home], newContactId: 501 });
    const result = await recordWebsiteAccountActivity(db, account, { action: "property_favorited", propertyId: 15 });
    expect(result).toEqual({ logged: true, contactId: 501, createdContact: true });
    const [contact, created, favourite] = db.inserts;
    expect(contact.table).toBe(contacts);
    expect(contact.values).toMatchObject({
      firstName: "Pat",
      lastName: "Lee",
      email: "pat.lee@example.com",
      leadSourceId: 77,
      leadSourceType: "organic",
      isaStatus: "new_lead",
      tags: ["Savvy website"],
    });
    expect(created.values).toMatchObject({ action: "contact_created", entityId: 501 });
    expect(favourite.values).toMatchObject({ action: "property_favorited", entityId: 501 });
    expect(smartPlans.trigger).toHaveBeenCalledWith(501, 77);
  });

  it("creates the contact on registration", async () => {
    const db = fakeDb({ newContactId: 610 });
    const result = await recordWebsiteAccountActivity(db, account, { action: "user_registered" });
    expect(result).toEqual({ logged: true, contactId: 610, createdContact: true });
    expect(db.inserts.map(insert => insert.values.action ?? "contact")).toEqual([
      "contact",
      "contact_created",
      "user_registered",
    ]);
    expect(db.inserts[2].values.details).toMatchObject({ event: "user.registered", propertyAddress: null });
  });

  it("logs a registration on a contact that already exists, without a second contact", async () => {
    const db = fakeDb({ contactRows: [{ id: 2 }] });
    await recordWebsiteAccountActivity(db, account, { action: "user_registered" });
    expect(db.inserts.map(insert => insert.table)).toEqual([activityLog]);
    expect(smartPlans.trigger).not.toHaveBeenCalled();
  });

  it("never creates a contact for a view alone", async () => {
    const db = fakeDb({ propertyRows: [home] });
    const result = await recordWebsiteAccountActivity(db, account, { action: "property_viewed", propertyId: 15 });
    expect(result).toEqual({ logged: false, contactId: null, createdContact: false });
    expect(db.inserts).toHaveLength(0);
  });

  it("logs a view on an existing contact", async () => {
    const db = fakeDb({ contactRows: [{ id: 2 }], propertyRows: [home] });
    await recordWebsiteAccountActivity(db, account, { action: "property_viewed", propertyId: 15 });
    expect(db.inserts[0].values).toMatchObject({ action: "property_viewed", entityType: "contact", entityId: 2 });
    expect(db.inserts[0].values.details.event).toBe("property.viewed");
  });

  it("still creates the contact when the lead source is missing, without Smart Plans", async () => {
    leadSource.id = null;
    const db = fakeDb({ newContactId: 700 });
    const result = await recordWebsiteAccountActivity(db, account, { action: "user_registered" });
    expect(result.createdContact).toBe(true);
    expect(db.inserts[0].values).not.toHaveProperty("leadSourceId");
    expect(smartPlans.trigger).not.toHaveBeenCalled();
  });

  it("never throws when the database fails", async () => {
    const db = fakeDb({ contactRows: [{ id: 2 }], failInsertInto: activityLog });
    await expect(
      recordWebsiteAccountActivity(db, account, { action: "property_favorited", propertyId: 15 })
    ).resolves.toEqual({ logged: false, contactId: null, createdContact: false });
  });
});

describe("recording a website request", () => {
  it("logs the old-site action with the property, alongside the inquiry", async () => {
    const db = fakeDb({ propertyRows: [home] });
    const action = await recordWebsiteRequestActivity(db, {
      contactId: 2,
      requestType: "analysis",
      intent: "property",
      propertyId: 15,
      propertyAddress: "12 Shore Rd, Destin, FL",
      agentId: 8,
    });
    expect(action).toBe("analysis_requested");
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0].values).toMatchObject({
      action: "analysis_requested",
      entityType: "contact",
      entityId: 2,
      relatedContactId: 2,
    });
    expect(db.inserts[0].values.details).toMatchObject({
      propertyId: 15,
      propertyAddress: "12 Shore Rd, Destin, FL",
      agentId: 8,
      via: WEBSITE_ACTIVITY_VIA,
    });
  });

  it("writes nothing for a form with no old-site action", async () => {
    const db = fakeDb();
    expect(await recordWebsiteRequestActivity(db, { contactId: 2, intent: "sell" })).toBeNull();
    expect(db.inserts).toHaveLength(0);
  });

  it("never throws when the database fails", async () => {
    const db = fakeDb({ failInsertInto: activityLog });
    await expect(
      recordWebsiteRequestActivity(db, { contactId: 2, requestType: "showing", propertyId: 15 })
    ).resolves.toBeNull();
  });
});

describe("where it is wired in", () => {
  const accountRouter = read("server/routers/websiteAccount.ts");
  const websiteRouter = read("server/routers/website.ts");

  it("records sign-ups, new favourites and views from the account router", () => {
    expect(accountRouter).toContain('{ action: "user_registered" }');
    expect(accountRouter).toContain('action: "property_favorited",');
    expect(accountRouter).toContain('action: "property_viewed",');
    // Only a new save, and only a view outside the quiet period.
    expect(accountRouter).toContain("if (!alreadySaved) {");
    expect(accountRouter).toContain("if (!isRepeatView(previous?.lastViewedAt)) {");
  });

  it("does not wait on the timeline before answering the visitor", () => {
    expect(accountRouter).not.toContain("await recordWebsiteAccountActivity(");
    expect(accountRouter.match(/void recordWebsiteAccountActivity\(/g)).toHaveLength(3);
  });

  it("never links an account to a contact by itself", () => {
    // That link is what lets an account read transactions, and it stays a
    // staff decision. See myTransactions.
    const activity = read("server/websiteActivity.ts");
    expect(activity).not.toContain(".update(");
    expect(activity).toContain('import { activityLog, contacts, properties } from "../drizzle/schema";');
  });

  it("logs the request action after the inquiry, inside the same contact check", () => {
    const inquiry = websiteRouter.indexOf('action: "website_inquiry_submitted"');
    const request = websiteRouter.indexOf("await recordWebsiteRequestActivity(db, {");
    expect(inquiry).toBeGreaterThan(-1);
    expect(request).toBeGreaterThan(inquiry);
  });

  it("files account contacts under a source that startup creates", () => {
    expect(WEBSITE_LEAD_SOURCES).toContain(WEBSITE_ACCOUNT_LEAD_SOURCE);
  });

  it("fills the request form from the signed-in account", () => {
    const page = read("client/src/pages/PublicWebsite.tsx");
    expect(page).toContain("const signedIn = useWebsiteAccount().data ?? null;");
    expect(page).toContain("email: prior.email || signedIn.email || \"\",");
  });
});
