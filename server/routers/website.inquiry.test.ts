import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn(), logActivity: vi.fn() }));
vi.mock("./permissions", () => ({ canAdminUsePermission: vi.fn() }));

import { resolveInquiryAgent } from "./website";

/** Minimal chainable fake for the two drizzle queries resolveInquiryAgent runs. */
function fakeDb(options: { property?: any; activeUserIds?: number[] }) {
  const activeUserIds = new Set(options.activeUserIds ?? []);
  let mode: "property" | "user" = "property";
  const chain: any = {
    select: (shape: any) => {
      mode = shape && "assignedAgentId" in shape ? "property" : "user";
      return chain;
    },
    from: () => chain,
    innerJoin: () => chain,
    where: (cond: any) => {
      chain._cond = cond;
      return chain;
    },
    limit: async () => {
      if (mode === "property") return options.property ? [options.property] : [];
      // The user lookup filters on id + isActive; approximate by inspecting the
      // requested id captured from the drizzle `eq` object.
      const requested = extractId(chain._cond);
      return requested && activeUserIds.has(requested) ? [{ id: requested }] : [];
    },
  };
  return chain;
}

function extractId(cond: any): number | null {
  // drizzle `and(eq(users.id, X), eq(users.isActive, true))` -> queryChunks contain the params
  const chunks: any[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node.queryChunks)) node.queryChunks.forEach(walk);
    if ("value" in node && typeof node.value === "number") chunks.push(node.value);
  };
  walk(cond);
  return chunks[0] ?? null;
}

describe("resolveInquiryAgent", () => {
  it("prefers the explicit agent the visitor was looking at", async () => {
    const db = fakeDb({ property: { assignedAgentId: 9, address: "1 Main", city: "Asheville", state: "NC" }, activeUserIds: [7, 9] });
    const result = await resolveInquiryAgent(db, 123, 7);
    expect(result.agentId).toBe(7);
    expect(result.propertyAddress).toBe("1 Main, Asheville, NC");
  });

  it("falls back to the website property's assigned agent", async () => {
    const db = fakeDb({ property: { assignedAgentId: 9, address: "1 Main", city: "Asheville", state: "NC" }, activeUserIds: [9] });
    const result = await resolveInquiryAgent(db, 123, undefined);
    expect(result.agentId).toBe(9);
  });

  it("leaves the inquiry unassigned when there is no agent context", async () => {
    const db = fakeDb({ activeUserIds: [9] });
    const result = await resolveInquiryAgent(db, undefined, undefined);
    expect(result).toEqual({ agentId: null, propertyAddress: null });
  });

  it("does not connect to an inactive agent", async () => {
    const db = fakeDb({ property: { assignedAgentId: 9, address: "1 Main", city: null, state: "NC" }, activeUserIds: [] });
    const result = await resolveInquiryAgent(db, 123, 9);
    expect(result.agentId).toBeNull();
    expect(result.propertyAddress).toBe("1 Main, NC");
  });
});
