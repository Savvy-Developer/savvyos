import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockState, mockSendTransactionalEmail } = vi.hoisted(() => ({
  mockState: {
    contactsByEmail: {} as Record<string, number>,
    agents: [] as Array<Record<string, unknown>>,
    existingConnections: [] as Array<Record<string, unknown>>,
    insertedConnections: [] as Array<Record<string, unknown>>,
    activities: [] as Array<Record<string, unknown>>,
  },
  mockSendTransactionalEmail: vi.fn(),
}));

function resultChain(rows: Array<Record<string, unknown>>) {
  const promise = Promise.resolve(rows) as Promise<
    Array<Record<string, unknown>>
  > & {
    limit: (count: number) => Promise<Array<Record<string, unknown>>>;
  };
  promise.limit = async () => rows;
  return promise;
}

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: () => ({
      from: (table: Record<string, unknown>) => ({
        where: () => {
          if (table.id === "users.id") return resultChain(mockState.agents);
          if (table.id === "agentConnections.id")
            return resultChain(mockState.existingConnections);
          const contactId =
            mockState.contactsByEmail[
              (globalThis as any).__websiteHandoffLookupEmail
            ];
          return resultChain(contactId ? [{ id: contactId }] : []);
        },
      }),
    }),
    insert: (table: Record<string, unknown>) => ({
      values: async (row: Record<string, unknown>) => {
        if (table.id === "agentConnections.id")
          mockState.insertedConnections.push(row);
        return [{ insertId: 1 }];
      },
    }),
  }),
  logActivity: vi.fn(async (entry: Record<string, unknown>) => {
    mockState.activities.push(entry);
  }),
  scheduleAircallPhoneRematch: vi.fn(),
}));

vi.mock("./_core/ghlSync", () => ({
  triggerGhlContactSync: vi.fn(),
}));

vi.mock("./_core/resendEmail", () => ({
  sendTransactionalEmail: mockSendTransactionalEmail,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((column: string, value: unknown) => {
    if (column === "contacts.email" && typeof value === "string") {
      (globalThis as any).__websiteHandoffLookupEmail = value;
    }
    return { column, value };
  }),
  and: vi.fn((...conditions: unknown[]) => conditions),
  or: vi.fn((...conditions: unknown[]) => conditions),
  isNull: vi.fn(),
}));

vi.mock("../drizzle/schema", () => ({
  contacts: {
    id: "contacts.id",
    email: "contacts.email",
    phone: "contacts.phone",
    notes: "contacts.notes",
  },
  leadSources: { id: "leadSources.id", name: "leadSources.name" },
  agentConnections: {
    id: "agentConnections.id",
    agentId: "agentConnections.agentId",
    contactId: "agentConnections.contactId",
  },
  users: {
    id: "users.id",
    name: "users.name",
    email: "users.email",
    isActive: "users.isActive",
    callBookingLink: "users.callBookingLink",
    role: "users.role",
  },
}));

import { savvyWebEventHandler } from "./webhookHandlers";
import type { WebhookEndpoint } from "../drizzle/schema";

const endpoint = {
  id: 18,
  name: "Property Views",
  slug: "property-views",
  handlerType: "custom",
  defaultLeadSourceId: 42,
  defaultAgentId: null,
} as unknown as WebhookEndpoint;

function envelope(event: string, data: Record<string, unknown>) {
  return { event, timestamp: "2026-08-28T21:00:00.000Z", data };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState.contactsByEmail = { "client@example.com": 501 };
  mockState.agents = [
    {
      id: 99,
      name: "Avery Agent",
      email: "agent@example.com",
      callBookingLink: "calendly.com/avery-agent",
      role: "agent",
    },
  ];
  mockState.existingConnections = [];
  mockState.insertedConnections = [];
  mockState.activities = [];
  (globalThis as any).__websiteHandoffLookupEmail = undefined;
  mockSendTransactionalEmail.mockResolvedValue({ sent: true, skipped: false });
});

describe("Savvy website request handoffs", () => {
  it.each([
    [
      "lead.analysis_requested",
      "deeper_analysis",
      "website_deeper_analysis_request",
    ],
    ["lead.created", "financing", "website_financing_request"],
    ["lead.showing_requested", "book_showing", "website_showing_request"],
  ])(
    "sends a shared %s email and creates the missing agent connection",
    async (event, source, emailType) => {
      const result = await savvyWebEventHandler(
        envelope(event, {
          leadEmail: "client@example.com",
          firstName: "Casey",
          lastName: "Client",
          source,
          agentEmail: "agent@example.com",
          agentName: "Avery Agent",
          propertyAddress: "123 Main St",
          city: "Asheville",
          state: "NC",
          zip: "28801",
          propertyId: "property-123",
          leadId: `lead-${emailType}`,
        }),
        endpoint
      );

      expect(result.message).toContain("agent connection created");
      expect(result.message).toContain("handoff email sent");
      expect(mockState.insertedConnections).toEqual([
        expect.objectContaining({
          agentId: 99,
          contactId: 501,
          pipelineStatus: "new_lead",
        }),
      ]);
      expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
        emailType,
        expect.objectContaining({
          recipientEmail: "agent@example.com",
          recipientName: "Avery Agent",
          ccEmails: ["client@example.com"],
          agentName: "Avery Agent",
          contactName: "Casey Client",
          propertyAddress: "123 Main St, Asheville, NC 28801",
          agentBookingLink: "https://calendly.com/avery-agent",
        }),
        expect.objectContaining({
          injectMagicLinks: false,
          allowTemplateOverride: false,
          idempotencyKey: expect.stringContaining(emailType),
        })
      );
    }
  );

  it("does not send a financing handoff for a generic website lead", async () => {
    await savvyWebEventHandler(
      envelope("lead.created", {
        leadEmail: "client@example.com",
        source: "website_signup",
        agentEmail: "agent@example.com",
        propertyAddress: "123 Main St",
      }),
      endpoint
    );

    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("does not duplicate an existing agent connection", async () => {
    mockState.existingConnections = [{ id: 77 }];

    await savvyWebEventHandler(
      envelope("lead.analysis_requested", {
        leadEmail: "client@example.com",
        source: "deeper_analysis",
        agentEmail: "agent@example.com",
        propertyAddress: "123 Main St",
      }),
      endpoint
    );

    expect(mockState.insertedConnections).toEqual([]);
    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it("looks up an omitted property address using the public website property ID", async () => {
    const propertyFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          address: "109 Pin Tail Pl",
          city: "Whittier",
          state: "NC",
          zip_code: "28789",
        },
      ],
    });
    vi.stubGlobal("fetch", propertyFetch);

    await savvyWebEventHandler(
      envelope("lead.analysis_requested", {
        leadEmail: "client@example.com",
        source: "deeper_analysis",
        agentEmail: "agent@example.com",
        propertyId: "7072fc72-0405-4d1b-a3b6-f73575739368",
      }),
      endpoint
    );

    expect(propertyFetch).toHaveBeenCalledTimes(1);
    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      "website_deeper_analysis_request",
      expect.objectContaining({
        propertyAddress: "109 Pin Tail Pl, Whittier, NC 28789",
      }),
      expect.anything()
    );
    vi.unstubAllGlobals();
  });
});
