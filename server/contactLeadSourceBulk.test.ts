import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const {
  mockCanAdminUsePermission,
  mockCreateContact,
  mockGetDb,
  mockLogActivity,
  mockSetMissingContactLeadSource,
} = vi.hoisted(() => ({
  mockCanAdminUsePermission: vi.fn(),
  mockCreateContact: vi.fn(),
  mockGetDb: vi.fn(),
  mockLogActivity: vi.fn(),
  mockSetMissingContactLeadSource: vi.fn(),
}));

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    createContact: mockCreateContact,
    getDb: mockGetDb,
    logActivity: mockLogActivity,
    setMissingContactLeadSource: mockSetMissingContactLeadSource,
  };
});
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./_core/resendEmail", () => ({ sendTransactionalEmail: vi.fn() }));
vi.mock("./routers/permissions", () => ({ canAdminUsePermission: mockCanAdminUsePermission }));

import { contactsRouter } from "./routers/contacts";
import { missingContactLeadSourceWhere } from "./db";

type Source = { id: number; name: string; parentId: number | null; isActive: boolean };

const WEBSITE: Source = { id: 360015, name: "Website", parentId: 330001, isActive: true };
const SAVVY_AGENTS: Source = { id: 330001, name: "Savvy-Agents", parentId: null, isActive: true };

function context(role: "admin" | "agent" | "isa") {
  return { user: { id: 7, name: "Test User", role } } as any;
}

// A db stub that answers lead source lookups by id and reports no duplicates.
function makeDb(sources: Source[]) {
  const byId = new Map(sources.map(source => [source.id, source]));
  let lookupId: number | undefined;
  const leadSourceQuery = {
    from: vi.fn(() => leadSourceQuery),
    where: vi.fn((condition: any) => {
      lookupId = findEqValue(condition);
      return leadSourceQuery;
    }),
    limit: vi.fn(async () => {
      const found = lookupId === undefined ? undefined : byId.get(lookupId);
      return found ? [found] : [];
    }),
  };
  const duplicateQuery = {
    from: vi.fn(() => duplicateQuery),
    where: vi.fn(() => duplicateQuery),
    limit: vi.fn(async () => []),
  };
  return {
    select: vi.fn((shape: Record<string, unknown>) =>
      "isActive" in shape ? leadSourceQuery : duplicateQuery
    ),
    // The global audit middleware writes one row per mutation.
    insert: vi.fn(() => ({ values: vi.fn(async () => []) })),
  };
}

// Pulls the bound id out of eq(leadSources.id, n) without depending on drizzle internals.
function findEqValue(condition: any): number | undefined {
  const query = new MySqlDialect().sqlToQuery(condition);
  const value = query.params.find(param => typeof param === "number");
  return typeof value === "number" ? value : undefined;
}

const row = (firstName: string, extra: Record<string, unknown> = {}) => ({
  firstName,
  lastName: "Lead",
  email: `${firstName.toLowerCase()}@example.com`,
  leadSourceType: null,
  pipelineStatus: null,
  isaStatus: null,
  ...extra,
});

describe("contacts.bulkUpload lead source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let nextId = 500;
    mockCreateContact.mockImplementation(async () => nextId++);
    mockGetDb.mockResolvedValue(makeDb([WEBSITE, SAVVY_AGENTS]));
  });

  it("rejects an upload with no lead source before creating anything", async () => {
    const caller = contactsRouter.createCaller(context("admin"));

    await expect(
      caller.bulkUpload({ rows: [row("Alyssa")] } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockCreateContact).not.toHaveBeenCalled();
  });

  it("gives every row the chosen lead source and keeps the row's own Lead Source Type", async () => {
    const caller = contactsRouter.createCaller(context("admin"));

    const result = await caller.bulkUpload({
      leadSourceId: WEBSITE.id,
      rows: [row("Alyssa"), row("James", { leadSourceType: "referral" })],
    });

    expect(result).toMatchObject({ created: 2, skipped: 0, errors: 0 });
    expect(mockCreateContact).toHaveBeenCalledTimes(2);
    expect(mockCreateContact).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ firstName: "Alyssa", leadSourceId: WEBSITE.id, leadSourceType: null })
    );
    expect(mockCreateContact).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ firstName: "James", leadSourceId: WEBSITE.id, leadSourceType: "referral" })
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contact_created",
        details: expect.objectContaining({ source: "bulk_upload", leadSource: "Savvy-Agents → Website" }),
      })
    );
  });

  it.each([
    ["an unknown source", [WEBSITE, SAVVY_AGENTS], 999],
    ["an inactive source", [{ ...WEBSITE, isActive: false }, SAVVY_AGENTS], WEBSITE.id],
    ["a source under an inactive category", [WEBSITE, { ...SAVVY_AGENTS, isActive: false }], WEBSITE.id],
    ["the reserved Unattributed source", [{ id: 360006, name: "Unattributed", parentId: null, isActive: true }], 360006],
  ] as const)("rejects %s and creates nothing", async (_label, sources, leadSourceId) => {
    mockGetDb.mockResolvedValue(makeDb([...sources]));
    const caller = contactsRouter.createCaller(context("admin"));

    await expect(
      caller.bulkUpload({ leadSourceId, rows: [row("Alyssa"), row("James")] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockCreateContact).not.toHaveBeenCalled();
  });

  it("keeps SOI List for admins only", async () => {
    const soi: Source = { id: 360004, name: "SOI List", parentId: null, isActive: true };
    mockGetDb.mockResolvedValue(makeDb([soi]));

    await expect(
      contactsRouter.createCaller(context("isa")).bulkUpload({ leadSourceId: soi.id, rows: [row("Alyssa")] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockCreateContact).not.toHaveBeenCalled();

    await expect(
      contactsRouter.createCaller(context("admin")).bulkUpload({ leadSourceId: soi.id, rows: [row("Alyssa")] })
    ).resolves.toMatchObject({ created: 1 });
  });
});

describe("contacts.bulkSetMissingLeadSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAdminUsePermission.mockResolvedValue(true);
    mockGetDb.mockResolvedValue(makeDb([WEBSITE, SAVVY_AGENTS]));
  });

  it("needs the Edit Contact Lead Source permission", async () => {
    mockCanAdminUsePermission.mockResolvedValue(false);

    await expect(
      contactsRouter.createCaller(context("admin")).bulkSetMissingLeadSource({ contactIds: [1], leadSourceId: WEBSITE.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      contactsRouter.createCaller(context("isa")).bulkSetMissingLeadSource({ contactIds: [1], leadSourceId: WEBSITE.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mockSetMissingContactLeadSource).not.toHaveBeenCalled();
  });

  it("rejects an invalid source without touching any contact", async () => {
    mockGetDb.mockResolvedValue(makeDb([{ ...WEBSITE, isActive: false }, SAVVY_AGENTS]));

    await expect(
      contactsRouter.createCaller(context("admin")).bulkSetMissingLeadSource({ contactIds: [1, 2], leadSourceId: WEBSITE.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockSetMissingContactLeadSource).not.toHaveBeenCalled();
  });

  it("counts contacts that already had a source as skipped and logs only the ones it set", async () => {
    mockSetMissingContactLeadSource.mockResolvedValue([
      { id: 54337, firstName: "Alyssa", lastName: "Mills" },
      { id: 54387, firstName: "James", lastName: "Holbrook" },
    ]);

    const result = await contactsRouter
      .createCaller(context("admin"))
      .bulkSetMissingLeadSource({ contactIds: [54337, 54387, 100, 54337], leadSourceId: WEBSITE.id });

    expect(mockSetMissingContactLeadSource).toHaveBeenCalledWith([54337, 54387, 100], WEBSITE.id);
    expect(result).toEqual({ updated: 2, skipped: 1 });
    expect(mockLogActivity).toHaveBeenCalledTimes(2);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contact_lead_source_updated",
        entityId: 54387,
        relatedContactId: 54387,
        details: expect.objectContaining({
          contactName: "James Holbrook",
          changes: [{ field: "Lead source", from: null, to: "Savvy-Agents → Website" }],
        }),
      })
    );
  });

  it("only ever matches contacts whose lead source is still empty", () => {
    const query = new MySqlDialect().sqlToQuery(missingContactLeadSourceWhere([54337, 54387]));

    expect(query.sql).toMatch(/`contacts`\.`id` in \(\?, \?\)/);
    expect(query.sql).toMatch(/`contacts`\.`leadSourceId` is null/);
    expect(query.params).toEqual([54337, 54387]);
  });
});
