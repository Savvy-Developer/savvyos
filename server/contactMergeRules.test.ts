import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb }));

import {
  agentConnectionResolutionRequired,
  areLeadSourcesCompatible,
  linkContactsAsRelationship,
  mergeContacts,
  resolveMergeMethodSelections,
} from "./contactMerge";

describe("lossless contact merge rules", () => {
  it("blocks any different Lead Source signature while allowing matching source attribution", () => {
    expect(areLeadSourcesCompatible({ leadSourceId: 14 }, { leadSourceId: 14 })).toBe(true);
    expect(areLeadSourcesCompatible({ leadSourceId: 14 }, { leadSourceId: 15 })).toBe(false);
    expect(areLeadSourcesCompatible(
      { leadSourceId: 14, campaignSource: "Partner A" },
      { leadSourceId: 14, campaignSource: "Partner B" },
    )).toBe(false);
    expect(areLeadSourcesCompatible(
      { leadSourceId: null, leadSourceType: "referral", campaignSource: "Partner A", partnershipName: null },
      { leadSourceId: null, leadSourceType: "referral", campaignSource: "Partner B", partnershipName: null },
    )).toBe(false);
  });

  it("requires a user choice whenever active connections include different agents", () => {
    expect(agentConnectionResolutionRequired([4], [])).toBe(false);
    expect(agentConnectionResolutionRequired([4], [4])).toBe(false);
    expect(agentConnectionResolutionRequired([4], [9])).toBe(true);
    expect(agentConnectionResolutionRequired([4], [4, 9])).toBe(true);
    expect(agentConnectionResolutionRequired([4, 9], [4, 9])).toBe(false);
  });

  it("supports three retained methods and places the marked primary first", () => {
    expect(resolveMergeMethodSelections([
      { value: "two@example.com", isPrimary: false },
      { value: "one@example.com", isPrimary: true },
      { value: "three@example.com", isPrimary: false },
    ], ["one@example.com", "two@example.com", "three@example.com", "four@example.com"], "email"))
      .toEqual(["one@example.com", "two@example.com", "three@example.com"]);
  });

  it("rejects a missing primary, duplicate selection, or more than three retained methods", () => {
    expect(() => resolveMergeMethodSelections([{ value: "one@example.com", isPrimary: false }], ["one@example.com"], "email"))
      .toThrow("Mark exactly one retained email as Primary");
    expect(() => resolveMergeMethodSelections([
      { value: "one@example.com", isPrimary: true }, { value: "ONE@example.com", isPrimary: false },
    ], ["one@example.com"], "email")).toThrow("unique value");
    expect(() => resolveMergeMethodSelections([
      { value: "1", isPrimary: true }, { value: "2", isPrimary: false }, { value: "3", isPrimary: false }, { value: "4", isPrimary: false },
    ], ["1", "2", "3", "4"], "phone")).toThrow("maximum of three phones");
  });

  it("enforces the Lead Source hard-stop inside the merge engine before a transaction or any writes", async () => {
    const winner = { id: 1, leadSourceId: 10, archivedAt: null };
    const loser = { id: 2, leadSourceId: 11, archivedAt: null };
    const select = vi.fn()
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([winner]) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([loser]) }) });
    const transaction = vi.fn();
    getDb.mockResolvedValue({ select, transaction });

    await expect(mergeContacts({
      winnerId: 1, loserId: 2, pairId: 99, reviewedById: 7,
      retainEmails: [], retainPhones: [],
    })).rejects.toThrow("contacts have different Lead Source values");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("links manually selected contacts through the shared relationship service without merging either record", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 2 }]);
    getDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({ from: () => ({ where: () => Promise.resolve([{ id: 1 }, { id: 2 }]) }) }),
      execute,
    });

    await expect(linkContactsAsRelationship({
      contactAId: 1, contactBId: 2, relationshipType: "partner", createdByUserId: 7, sourcePairId: 11,
    })).resolves.toEqual({ success: true, relationshipType: "partner" });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(String(execute.mock.calls[1][0].queryChunks?.[0]?.value ?? execute.mock.calls[1][0])).toContain("INSERT INTO contact_relationships");
  });

  it("completes a same-Lead-Source manual merge and archives the losing record", async () => {
    const winner = { id: 1, leadSourceId: 14, archivedAt: null, email: null, phone: null, tags: null, doNotContact: false, emailStatus: "valid" };
    const loser = { id: 2, leadSourceId: 14, archivedAt: null, email: null, phone: null, tags: null, doNotContact: false, emailStatus: "valid" };
    const selectResponses = [[winner], [loser]];
    const select = vi.fn(() => ({
      from: () => ({ where: () => Promise.resolve(selectResponses.shift() ?? []) }),
    }));
    let insertCount = 0;
    const tx = {
      insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve(++insertCount === 1 ? [{ insertId: 777 }] : [{}])) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
      execute: vi.fn(() => Promise.resolve([[]])),
    };
    getDb.mockResolvedValue({
      select,
      execute: vi.fn(() => Promise.resolve([[]])),
      transaction: vi.fn(async (callback) => callback(tx)),
    });

    const result = await mergeContacts({ winnerId: 1, loserId: 2, reviewedById: 7, retainEmails: [], retainPhones: [] });
    expect(result).toMatchObject({ success: true, winnerId: 1, loserId: 2 });
    expect(result.archivedItems).toBeGreaterThanOrEqual(1);
    expect(tx.insert).toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalled();
  });

  it("merges shared-agent history into one active connection and archives the retired connection", async () => {
    const winner = { id: 1, leadSourceId: 14, archivedAt: null, email: null, phone: null, tags: null, doNotContact: false, emailStatus: "valid" };
    const loser = { id: 2, leadSourceId: 14, archivedAt: null, email: null, phone: null, tags: null, doNotContact: false, emailStatus: "valid" };
    const selectResponses = [[winner], [loser]];
    const select = vi.fn(() => ({ from: () => ({ where: () => Promise.resolve(selectResponses.shift() ?? []) }) }));
    let insertCount = 0;
    const tx = {
      insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve(++insertCount === 1 ? [{ insertId: 778 }] : [{}])) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
      execute: vi.fn(() => Promise.resolve([[]])),
    };
    const sharedWinnerConnection = { id: 41, agentId: 9, contactId: 1, pipelineStatus: "new_lead", agentNotes: "Initial notes" };
    const sharedLoserConnection = { id: 42, agentId: 9, contactId: 2, pipelineStatus: "new_lead", agentNotes: "More history" };
    const execute = vi.fn()
      .mockResolvedValueOnce([[sharedWinnerConnection]])
      .mockResolvedValueOnce([[sharedLoserConnection]]);
    getDb.mockResolvedValue({ select, execute, transaction: vi.fn(async (callback) => callback(tx)) });

    const result = await mergeContacts({ winnerId: 1, loserId: 2, reviewedById: 7, retainEmails: [], retainPhones: [] });
    expect(result.rowsReparented).toBeGreaterThanOrEqual(1);
    expect(result.archivedItems).toBeGreaterThanOrEqual(2);
    expect(tx.update).toHaveBeenCalled();
  });
});

beforeEach(() => { vi.clearAllMocks(); });
