/**
 * Tests for the savvy-web inbound event handlers.
 *
 * Unlike server/webhooks.test.ts — which re-implements the functions it
 * asserts on — these import and execute the real handlers from
 * webhookHandlers.ts, so a regression in the shipped code fails the suite.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// vi.mock is hoisted, so state lives on globalThis rather than in closures.

interface MockState {
  /** email → contact id, for findExistingContact */
  contactsByEmail: Record<string, number>;
  /** rows passed to db.insert(contacts).values(...) */
  inserted: Record<string, unknown>[];
  /** calls to logActivity */
  activities: Record<string, unknown>[];
  /** contact ids passed to triggerGhlContactSync */
  ghlSynced: number[];
  /** id handed back by the next contact insert */
  nextInsertId: number;
}

const state = globalThis as unknown as { __mock: MockState };

state.__mock = {
  contactsByEmail: {},
  inserted: [],
  activities: [],
  ghlSynced: [],
  nextInsertId: 900,
};

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            const m = (globalThis as any).__mock as MockState;
            const email = (globalThis as any).__lastLookupEmail as
              | string
              | undefined;
            const id = email ? m.contactsByEmail[email] : undefined;
            return id ? [{ id }] : [];
          },
        }),
      }),
    }),
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        const m = (globalThis as any).__mock as MockState;
        m.inserted.push(row);
        return [{ insertId: m.nextInsertId }];
      },
    }),
  }),
  logActivity: vi.fn(async (entry: Record<string, unknown>) => {
    ((globalThis as any).__mock as MockState).activities.push(entry);
  }),
  scheduleAircallPhoneRematch: vi.fn(),
}));

vi.mock("./_core/ghlSync", () => ({
  triggerGhlContactSync: vi.fn((id: number) => {
    ((globalThis as any).__mock as MockState).ghlSynced.push(id);
  }),
}));

// drizzle's `eq` is where the handler hands us the email it is looking up.
// Capturing it lets the mocked select() answer realistically.
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, value: unknown) => {
    if (typeof value === "string" && value.includes("@")) {
      (globalThis as any).__lastLookupEmail = value;
    }
    return { _eq: value };
  }),
  and: vi.fn(),
  or: vi.fn((...args: unknown[]) => args),
  isNull: vi.fn(),
}));

vi.mock("../drizzle/schema", () => ({
  contacts: {
    id: "contacts.id",
    email: "contacts.email",
    phone: "contacts.phone",
  },
  leadSources: { id: "leadSources.id", name: "leadSources.name" },
  agentConnections: {},
}));

// Import after the mocks are registered.
import {
  savvyWebEventHandler,
  customHandler,
  deriveNameFromEmail,
  resolveContactName,
  SAVVY_WEB_EVENTS,
} from "./webhookHandlers";
import type { WebhookEndpoint } from "../drizzle/schema";

const endpoint = {
  id: 18,
  name: "Property Views",
  slug: "property-views",
  handlerType: "custom",
  defaultLeadSourceId: 42,
  defaultAgentId: null,
} as unknown as WebhookEndpoint;

/** Build a savvy-web envelope. */
function envelope(event: string, data: Record<string, unknown>) {
  return { event, timestamp: "2026-08-12T16:00:00.600Z", data };
}

beforeEach(() => {
  state.__mock.contactsByEmail = {};
  state.__mock.inserted = [];
  state.__mock.activities = [];
  state.__mock.ghlSynced = [];
  state.__mock.nextInsertId = 900;
  (globalThis as any).__lastLookupEmail = undefined;
});

// ─── Event routing ────────────────────────────────────────────────────────────

describe("customHandler event routing", () => {
  it("routes every one of the five supported events to the savvy-web handler", async () => {
    state.__mock.contactsByEmail["lead@example.com"] = 501;

    for (const event of Object.keys(SAVVY_WEB_EVENTS)) {
      state.__mock.activities = [];
      const result = await customHandler(
        envelope(event, {
          leadEmail: "lead@example.com",
          propertyAddress: "1 Main St",
        }),
        endpoint
      );
      expect(result.contactId, `${event} should resolve a contact`).toBe(501);
      expect(result.action, `${event} should not be a no-op`).toBe("logged");
      expect(state.__mock.activities).toHaveLength(1);
      expect(state.__mock.activities[0].action).toBe(
        SAVVY_WEB_EVENTS[event].action
      );
    }
  });

  it("writes a distinct activity action per event", async () => {
    const actions = Object.values(SAVVY_WEB_EVENTS).map(s => s.action);
    expect(new Set(actions).size).toBe(actions.length);
  });

  it("names the event when it is unrecognised, instead of a bare 200", async () => {
    const result = await customHandler(
      envelope("activity.unknown", {}),
      endpoint
    );
    expect(result.action).toBe("logged");
    expect(result.message).toContain("activity.unknown");
    expect(result.message).toContain("Unhandled");
    expect(state.__mock.activities).toHaveLength(0);
  });

  it("keeps the original message for a payload with no event field", async () => {
    const result = await customHandler({ hello: "world" }, endpoint);
    expect(result.message).toBe("Payload logged (custom handler)");
  });
});

// ─── Contact matching ─────────────────────────────────────────────────────────

describe("contact matching", () => {
  it("reads the email from data.leadEmail", async () => {
    state.__mock.contactsByEmail["a@example.com"] = 1;
    const r = await savvyWebEventHandler(
      envelope("activity.favorite", { leadEmail: "a@example.com" }),
      endpoint
    );
    expect(r.contactId).toBe(1);
  });

  it("reads the email from data.email", async () => {
    state.__mock.contactsByEmail["b@example.com"] = 2;
    const r = await savvyWebEventHandler(
      envelope("activity.favorite", { email: "b@example.com" }),
      endpoint
    );
    expect(r.contactId).toBe(2);
  });

  it("falls back to a top-level email when data carries none", async () => {
    // Regression: the previous implementation only fell back to the top level
    // when `data` was absent entirely, so this threw.
    state.__mock.contactsByEmail["c@example.com"] = 3;
    const r = await savvyWebEventHandler(
      {
        event: "activity.favorite",
        data: { propertyId: "p1" },
        leadEmail: "c@example.com",
      },
      endpoint
    );
    expect(r.contactId).toBe(3);
  });

  it("rejects a payload with no email at all", async () => {
    await expect(
      savvyWebEventHandler(
        envelope("activity.favorite", { propertyId: "p1" }),
        endpoint
      )
    ).rejects.toThrow(/required/);
  });
});

// ─── Unmatched email behaviour ────────────────────────────────────────────────

describe("unmatched email", () => {
  it("creates a contact for a deliberate action and logs against it", async () => {
    const r = await savvyWebEventHandler(
      envelope("activity.favorite", {
        leadEmail: "newvisitor@example.com",
        firstName: "New",
        lastName: "Visitor",
        propertyAddress: "9 Ocean Dr",
      }),
      endpoint
    );

    expect(r.action).toBe("created");
    expect(r.contactId).toBe(900);
    expect(r.message).toContain("contact created");

    expect(state.__mock.inserted).toHaveLength(1);
    expect(state.__mock.inserted[0]).toMatchObject({
      firstName: "New",
      lastName: "Visitor",
      email: "newvisitor@example.com",
    });

    // contact_created, then the favourite itself.
    expect(state.__mock.activities.map(a => a.action)).toEqual([
      "contact_created",
      "property_favorited",
    ]);
  });

  it("does NOT create a contact for a page view", async () => {
    const r = await savvyWebEventHandler(
      envelope("property.viewed", { leadEmail: "ghost@example.com" }),
      endpoint
    );
    expect(r.action).toBe("skipped");
    expect(r.message).toContain("No contact found");
    expect(state.__mock.inserted).toHaveLength(0);
    expect(state.__mock.activities).toHaveLength(0);
  });

  it("attributes a created contact to the endpoint's default lead source", async () => {
    await savvyWebEventHandler(
      envelope("lead.showing_requested", {
        leadEmail: "x@example.com",
        name: "X Y",
      }),
      endpoint
    );
    expect(state.__mock.inserted[0].leadSourceId).toBe(42);
  });

  it("syncs a newly created contact outbound to GHL", async () => {
    await savvyWebEventHandler(
      envelope("activity.contact", {
        leadEmail: "sync@example.com",
        name: "S Y",
      }),
      endpoint
    );
    expect(state.__mock.ghlSynced).toEqual([900]);
  });

  it("does not create or sync when the contact already exists", async () => {
    state.__mock.contactsByEmail["known@example.com"] = 77;
    const r = await savvyWebEventHandler(
      envelope("activity.favorite", { leadEmail: "known@example.com" }),
      endpoint
    );
    expect(r.action).toBe("logged");
    expect(state.__mock.inserted).toHaveLength(0);
    expect(state.__mock.ghlSynced).toEqual([]);
  });
});

// ─── Null-name fallback ───────────────────────────────────────────────────────

describe("deriveNameFromEmail", () => {
  it("splits a dotted local-part", () => {
    expect(deriveNameFromEmail("jane.doe@example.com")).toEqual({
      firstName: "Jane",
      lastName: "Doe",
    });
  });

  it("strips trailing digits", () => {
    expect(deriveNameFromEmail("j.smith92@example.com")).toEqual({
      firstName: "J",
      lastName: "Smith",
    });
  });

  it("handles a single-token local-part", () => {
    expect(deriveNameFromEmail("hello@example.com")).toEqual({
      firstName: "Hello",
      lastName: "",
    });
  });

  it("handles underscores and plus-addressing", () => {
    expect(deriveNameFromEmail("ann_lee+savvy@example.com")).toEqual({
      firstName: "Ann",
      lastName: "Lee Savvy",
    });
  });

  it("never returns an empty first name", () => {
    for (const email of ["123@example.com", "_@example.com", "@example.com"]) {
      expect(deriveNameFromEmail(email).firstName).not.toBe("");
    }
  });
});

describe("resolveContactName", () => {
  it("prefers explicit firstName/lastName", () => {
    expect(
      resolveContactName({ firstName: "Ada", lastName: "L" }, {}, "x@y.com")
    ).toEqual({
      firstName: "Ada",
      lastName: "L",
    });
  });

  it("splits a full name when no firstName is present", () => {
    expect(resolveContactName({ name: "Grace Hopper" }, {}, "x@y.com")).toEqual(
      {
        firstName: "Grace",
        lastName: "Hopper",
      }
    );
  });

  it("falls back to the email when every name field is null", () => {
    expect(
      resolveContactName(
        { name: null, firstName: null, lastName: null },
        {},
        "kay.ess@y.com"
      )
    ).toEqual({ firstName: "Kay", lastName: "Ess" });
  });
});

// ─── Property label ───────────────────────────────────────────────────────────

describe("property label", () => {
  beforeEach(() => {
    state.__mock.contactsByEmail["lead@example.com"] = 5;
  });

  it("accepts propertyAddress (activity + view events)", async () => {
    await savvyWebEventHandler(
      envelope("activity.favorite", {
        leadEmail: "lead@example.com",
        propertyAddress: "1 A St",
      }),
      endpoint
    );
    expect((state.__mock.activities[0].details as any).propertyAddress).toBe(
      "1 A St"
    );
  });

  it("accepts propertyTitle (lead events) under the same key", async () => {
    await savvyWebEventHandler(
      envelope("lead.analysis_requested", {
        leadEmail: "lead@example.com",
        propertyTitle: "Lakeside Cabin",
      }),
      endpoint
    );
    expect((state.__mock.activities[0].details as any).propertyAddress).toBe(
      "Lakeside Cabin"
    );
  });

  it("stores null when neither is sent, without failing the delivery", async () => {
    const r = await savvyWebEventHandler(
      envelope("activity.contact", { leadEmail: "lead@example.com" }),
      endpoint
    );
    expect(r.action).toBe("logged");
    expect(
      (state.__mock.activities[0].details as any).propertyAddress
    ).toBeNull();
  });

  it("keeps propertyId on the activity so a null address can be backfilled", async () => {
    await savvyWebEventHandler(
      envelope("activity.favorite", {
        leadEmail: "lead@example.com",
        propertyId: "abc-123",
      }),
      endpoint
    );
    expect((state.__mock.activities[0].details as any).propertyId).toBe(
      "abc-123"
    );
  });

  it("falls back to the envelope timestamp when the event carries no time", async () => {
    await savvyWebEventHandler(
      envelope("activity.favorite", { leadEmail: "lead@example.com" }),
      endpoint
    );
    expect((state.__mock.activities[0].details as any).occurredAt).toBe(
      "2026-08-12T16:00:00.600Z"
    );
  });
});
