import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn(), logActivity: vi.fn() }));
vi.mock("./permissions", () => ({ canAdminUsePermission: vi.fn() }));

import { agentOwnsProperty } from "./website";

/**
 * agentOwnsProperty runs up to three lookups in order: properties they added,
 * transactions they hold, listings they hold. This fake answers each in turn.
 */
function fakeDb(hits: { added?: boolean; tx?: boolean; listing?: boolean }) {
  const order = [hits.added, hits.tx, hits.listing];
  let call = -1;
  const chain: any = {
    select: () => chain,
    from: () => { call += 1; return chain; },
    where: () => chain,
    limit: async () => (order[call] ? [{ id: 1 }] : []),
  };
  return chain;
}

describe("agentOwnsProperty", () => {
  it("accepts a property the agent added", async () => {
    expect(await agentOwnsProperty(fakeDb({ added: true }), 7, 100)).toBe(true);
  });

  it("accepts a property the agent has a transaction on", async () => {
    expect(await agentOwnsProperty(fakeDb({ tx: true }), 7, 100)).toBe(true);
  });

  it("accepts a property the agent has a listing on", async () => {
    expect(await agentOwnsProperty(fakeDb({ listing: true }), 7, 100)).toBe(true);
  });

  it("rejects a property the agent has no link to", async () => {
    expect(await agentOwnsProperty(fakeDb({}), 7, 100)).toBe(false);
  });
});
