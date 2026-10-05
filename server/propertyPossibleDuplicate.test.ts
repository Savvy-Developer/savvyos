import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// A fake driver, so the real createProperty runs without a database. The
// exact check ends in limit(1); the possible-duplicate check awaits the
// where() directly; the insert returns a new id.
const state = vi.hoisted(() => ({
  exact: [] as unknown[],
  nearby: [] as unknown[],
  inserted: [] as unknown[],
}));

vi.mock("mysql2/promise", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", () => {
  const where = () => ({
    limit: async () => state.exact,
    then: (resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve(state.nearby).then(resolve, reject),
  });
  const db = {
    select: () => ({ from: () => ({ where }) }),
    insert: () => ({
      values: async (row: unknown) => {
        state.inserted.push(row);
        return [{ insertId: 1992 }];
      },
    }),
  };
  return { drizzle: () => db };
});

import { createProperty, DuplicatePropertyError, PossibleDuplicatePropertyError } from "./db";

beforeAll(() => {
  process.env.DATABASE_URL = "mysql://test/test";
});

const OVERLOOK = { id: 861, address: "360 E Overlook", city: "Glendale", state: "UT", zip: "84729" };

describe("createProperty possible-duplicate check", () => {
  beforeEach(() => {
    state.exact = [];
    state.nearby = [];
    state.inserted = [];
  });

  it("stops a loose match with a message naming the existing property", async () => {
    state.nearby = [OVERLOOK];
    const attempt = createProperty({ address: "360 E Overlook Ln", city: "Glendale", state: "UT", zip: "84729" } as any);
    await expect(attempt).rejects.toBeInstanceOf(PossibleDuplicatePropertyError);
    await expect(attempt).rejects.toThrow("Possible duplicate of #861 (360 E Overlook, Glendale, UT 84729)");
    expect(state.inserted).toHaveLength(0);
  });

  it("is still a DuplicatePropertyError, so existing handlers stop too", async () => {
    state.nearby = [OVERLOOK];
    const error = await createProperty({ address: "360 E Overlook Ln", city: "Glendale", state: "UT", zip: "84729" } as any).catch(e => e);
    expect(error).toBeInstanceOf(DuplicatePropertyError);
    expect(error.existingProperty.id).toBe(861);
  });

  it("creates it when the person confirmed it is a different home", async () => {
    state.nearby = [OVERLOOK];
    const id = await createProperty(
      { address: "360 E Overlook Ln", city: "Glendale", state: "UT", zip: "84729" } as any,
      { allowPossibleDuplicate: true },
    );
    expect(id).toBe(1992);
    expect(state.inserted).toHaveLength(1);
  });

  it("creates a different house on the same street, or another unit in the same building", async () => {
    state.nearby = [OVERLOOK, { id: 900, address: "24230 Perdido Beach Blvd Apt 3104", city: "Orange Beach", state: "AL", zip: "36561" }];
    await expect(createProperty({ address: "362 E Overlook", city: "Glendale", state: "UT", zip: "84729" } as any)).resolves.toBe(1992);
    await expect(
      createProperty({ address: "24230 Perdido Beach Blvd Apt 3125", city: "Orange Beach", state: "AL", zip: "36561" } as any),
    ).resolves.toBe(1992);
  });

  it("keeps the exact check first", async () => {
    state.exact = [OVERLOOK];
    const error = await createProperty({ address: "360 E Overlook", city: "Glendale", state: "UT", zip: "84729" } as any).catch(e => e);
    expect(error).toBeInstanceOf(DuplicatePropertyError);
    expect(error).not.toBeInstanceOf(PossibleDuplicatePropertyError);
    expect(error.message).toBe("A property with this address already exists.");
  });
});
