import { beforeAll, describe, expect, it, vi } from "vitest";

// A fake driver: every select chain ends in limit(n), which returns n rows, so
// the real getAgentConnectionExportRows can be checked against its cap.
const { limitCalls } = vi.hoisted(() => ({ limitCalls: [] as number[] }));

vi.mock("mysql2/promise", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", () => {
  const chain: any = {};
  for (const method of ["select", "from", "leftJoin", "where", "orderBy"]) chain[method] = () => chain;
  chain.limit = async (n: number) => {
    limitCalls.push(n);
    return Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
  };
  return { drizzle: () => chain };
});

import { AGENT_CONNECTION_EXPORT_CAP, getAgentConnectionExportRows } from "./db";

beforeAll(() => {
  process.env.DATABASE_URL = "mysql://test/test";
});

describe("getAgentConnectionExportRows cap", () => {
  it("is about 10k rows", () => {
    expect(AGENT_CONNECTION_EXPORT_CAP).toBe(10_000);
  });

  it("reads one row past the cap, returns at most the cap, and says it was cut short", async () => {
    const result = await getAgentConnectionExportRows({ statuses: ["closed"] }, 25);
    expect(limitCalls.at(-1)).toBe(26);
    expect(result.rows).toHaveLength(25);
    expect(result.truncated).toBe(true);
    expect(result.cap).toBe(25);
  });

  it("returns nothing and never queries for an empty agent_support scope", async () => {
    const before = limitCalls.length;
    const result = await getAgentConnectionExportRows({ scopeAgentIds: [], statuses: ["closed"] });
    expect(result).toEqual({ rows: [], truncated: false, cap: AGENT_CONNECTION_EXPORT_CAP });
    expect(limitCalls.length).toBe(before);
  });
});
