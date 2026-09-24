import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCanAdminUsePermission, mockCreateContact, mockGetContactById, mockGetDb, mockLogActivity, mockUpdateContact } = vi.hoisted(() => ({
  mockCanAdminUsePermission: vi.fn(),
  mockCreateContact: vi.fn(),
  mockGetContactById: vi.fn(),
  mockGetDb: vi.fn(),
  mockLogActivity: vi.fn(),
  mockUpdateContact: vi.fn(),
}));

vi.mock("../db", () => ({
  createContact: mockCreateContact,
  createCommunication: vi.fn(),
  getCommunications: vi.fn(),
  getContactById: mockGetContactById,
  getContacts: vi.fn(),
  getDb: mockGetDb,
  logActivity: mockLogActivity,
  updateContact: mockUpdateContact,
  resetLeadAgingForAgent: vi.fn(),
  archiveContact: vi.fn(),
  deleteContact: vi.fn(),
}));

vi.mock("../_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("../_core/resendEmail", () => ({ sendTransactionalEmail: vi.fn() }));
vi.mock("./permissions", () => ({ canAdminUsePermission: mockCanAdminUsePermission }));

import { contactsRouter } from "./contacts";

const validContact = {
  firstName: "Taylor",
  lastName: "Morgan",
  leadSourceId: 360005,
  email: "taylor@example.com",
  phone: "(555) 123-4567",
};

function context(role: "admin" | "agent" | "isa") {
  return { user: { id: 7, name: "Test User", role } } as any;
}

function makeDb(sourceName: string | undefined) {
  const sourceQuery = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  sourceQuery.from.mockReturnValue(sourceQuery);
  sourceQuery.where.mockReturnValue(sourceQuery);
  sourceQuery.limit.mockResolvedValue(sourceName ? [{ id: 360006, name: sourceName, parentId: null, isActive: true }] : []);

  const duplicateQuery = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue([]),
  };
  duplicateQuery.from.mockReturnValue(duplicateQuery);
  duplicateQuery.where.mockReturnValue(duplicateQuery);

  return {
    select: vi.fn((shape: Record<string, unknown>) =>
      "name" in shape && "isActive" in shape
        ? sourceQuery
        : duplicateQuery
    ),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
    sourceQuery,
    duplicateQuery,
  };
}

describe("contacts.create source and phone policies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateContact.mockResolvedValue(88);
    mockGetDb.mockResolvedValue(makeDb("Agent Sourced"));
  });

  it("rejects an agent-created contact without a phone number", async () => {
    const caller = contactsRouter.createCaller(context("agent"));

    await expect(
      caller.create({
        ...validContact,
        phone: null,
        email: "taylor@example.com",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("phone number is required"),
    });

    expect(mockCreateContact).not.toHaveBeenCalled();
  });

  it("rejects an agent-created contact without an email address", async () => {
    const caller = contactsRouter.createCaller(context("agent"));

    await expect(
      caller.create({
        ...validContact,
        email: "",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("email address is required"),
    });

    expect(mockCreateContact).not.toHaveBeenCalled();
  });

  it("requires a lead source for every manually created contact", async () => {
    const caller = contactsRouter.createCaller(context("agent"));

    await expect(
      caller.create({
        ...validContact,
        leadSourceId: undefined,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("lead source is required"),
    });

    expect(mockCreateContact).not.toHaveBeenCalled();
  });

  it("allows an agent-created contact with a valid phone number", async () => {
    const caller = contactsRouter.createCaller(context("agent"));

    await expect(caller.create(validContact)).resolves.toEqual({ id: 88 });

    expect(mockCreateContact).toHaveBeenCalledWith(
      expect.objectContaining(validContact)
    );
  });

  it.each(["agent", "isa"] as const)(
    "blocks %s users from selecting SOI List",
    async role => {
      mockGetDb.mockResolvedValue(makeDb("SOI List"));
      const caller = contactsRouter.createCaller(context(role));

      await expect(
        caller.create({ ...validContact, leadSourceId: 360004 })
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: expect.stringContaining("Only admins"),
      });

      expect(mockCreateContact).not.toHaveBeenCalled();
    }
  );

  it("allows admins to select SOI List", async () => {
    const caller = contactsRouter.createCaller(context("admin"));

    await expect(
      caller.create({ ...validContact, leadSourceId: 360004 })
    ).resolves.toEqual({ id: 88 });

    expect(mockCreateContact).toHaveBeenCalledWith(
      expect.objectContaining({ leadSourceId: 360004 })
    );
  });

  it.each(["Unattributed", "Unattributed (Webhook)"])(
    "blocks the reserved %s source from manual contact creation",
    async sourceName => {
      mockGetDb.mockResolvedValue(makeDb(sourceName));
      const caller = contactsRouter.createCaller(context("agent"));

      await expect(caller.create(validContact)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("reserved for automated records"),
      });

      expect(mockCreateContact).not.toHaveBeenCalled();
    }
  );
});

describe("contacts.update lead-source corrections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAdminUsePermission.mockResolvedValue(true);
    mockGetContactById.mockResolvedValue({
      contact: { id: 88, firstName: "Taylor", lastName: "Morgan", leadSourceId: 360005 },
      leadSource: { id: 360005, name: "Agent Sourced", parentName: null },
    });
    mockGetDb.mockResolvedValue(makeDb("Referral"));
    mockUpdateContact.mockResolvedValue(undefined);
  });

  it("persists a permitted lead-source correction through the standard contact update", async () => {
    const caller = contactsRouter.createCaller(context("admin"));

    await expect(caller.update({ id: 88, data: { leadSourceId: 360006 } })).resolves.toEqual({ success: true });

    expect(mockCanAdminUsePermission).toHaveBeenCalledWith(
      expect.objectContaining({ role: "admin" }),
      "canEditContactLeadSource",
    );
    expect(mockUpdateContact).toHaveBeenCalledWith(
      88,
      expect.objectContaining({ leadSourceId: 360006 }),
      { allowLeadSourceUpdate: true },
    );
  });

  it("routes the legacy source-only correction endpoint through the same database guard", async () => {
    const caller = contactsRouter.createCaller(context("admin"));

    await expect(caller.updateLeadSource({ id: 88, leadSourceId: 360006 })).resolves.toMatchObject({ success: true });

    expect(mockUpdateContact).toHaveBeenCalledWith(
      88,
      { leadSourceId: 360006 },
      { allowLeadSourceUpdate: true },
    );
  });

  it("blocks a lead-source correction when the Super Permission is not granted", async () => {
    mockCanAdminUsePermission.mockResolvedValue(false);
    const caller = contactsRouter.createCaller(context("admin"));

    await expect(caller.update({ id: 88, data: { leadSourceId: 360006 } })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("permission"),
    });

    expect(mockUpdateContact).not.toHaveBeenCalled();
  });

  it("requires a concrete manual lead source for a correction", async () => {
    const caller = contactsRouter.createCaller(context("admin"));

    await expect(caller.update({ id: 88, data: { leadSourceId: null } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("active manual lead source"),
    });

    expect(mockUpdateContact).not.toHaveBeenCalled();
  });
});
