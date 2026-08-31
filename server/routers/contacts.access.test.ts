import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateContact, mockGetDb, mockLogActivity } = vi.hoisted(() => ({
  mockCreateContact: vi.fn(),
  mockGetDb: vi.fn(),
  mockLogActivity: vi.fn(),
}));

vi.mock("../db", () => ({
  createContact: mockCreateContact,
  createCommunication: vi.fn(),
  getCommunications: vi.fn(),
  getContactById: vi.fn(),
  getContacts: vi.fn(),
  getDb: mockGetDb,
  logActivity: mockLogActivity,
  updateContact: vi.fn(),
  resetLeadAgingForAgent: vi.fn(),
  archiveContact: vi.fn(),
  deleteContact: vi.fn(),
}));

vi.mock("../_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("../_core/resendEmail", () => ({ sendTransactionalEmail: vi.fn() }));

import { contactsRouter } from "./contacts";

const validContact = {
  firstName: "Taylor",
  lastName: "Morgan",
  leadSourceId: 360005,
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
  sourceQuery.limit.mockResolvedValue(sourceName ? [{ name: sourceName }] : []);

  const duplicateQuery = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue([]),
  };
  duplicateQuery.from.mockReturnValue(duplicateQuery);
  duplicateQuery.where.mockReturnValue(duplicateQuery);

  return {
    select: vi.fn((shape: Record<string, unknown>) =>
      "name" in shape && Object.keys(shape).length === 1
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
});
