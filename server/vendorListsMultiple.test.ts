import { readFileSync } from "node:fs";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb, mockCheckoutInvite } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockCheckoutInvite: vi.fn(),
}));

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: mockGetDb };
});
vi.mock("./_core/auditMiddleware", () => ({
  shouldAuditLog: () => false,
  auditLogMutation: vi.fn(),
}));
vi.mock("./vendorBilling", async importOriginal => {
  const actual = await importOriginal<typeof import("./vendorBilling")>();
  return { ...actual, createFeaturedVendorCheckoutInvite: mockCheckoutInvite };
});

import { users, vendorLists, vendors } from "../drizzle/schema";
import { vendorsRouter } from "./routers/vendors";

type Row = Record<string, any>;

/**
 * A small in-memory stand-in for drizzle: select/insert/update against rows
 * per table, honouring eq() conditions (the only filters these paths need to
 * decide ownership and slug lookups).
 */
function makeDb(tables: Map<unknown, Row[]>) {
  const dialect = new MySqlDialect();
  let nextId = 1000;

  function matches(row: Row, condition: unknown): boolean {
    if (!condition) return true;
    const { sql, params } = dialect.sqlToQuery(condition as any);
    const columns = Array.from(sql.matchAll(/`\w+`\.`(\w+)` = \?/g)).map(match => match[1]);
    return columns.every((column, index) => row[column] === params[index]);
  }

  function select() {
    const state: { table?: unknown; condition?: unknown } = {};
    const run = () => (tables.get(state.table) ?? []).filter(row => matches(row, state.condition));
    const builder: any = {
      from: (table: unknown) => { state.table = table; return builder; },
      innerJoin: () => builder,
      leftJoin: () => builder,
      where: (condition: unknown) => { state.condition = condition; return builder; },
      orderBy: () => builder,
      groupBy: () => builder,
      limit: async (count: number) => run().sort((a, b) => a.id - b.id).slice(0, count),
      then: (resolve: (rows: Row[]) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(run().sort((a, b) => a.id - b.id)).then(resolve, reject),
    };
    return builder;
  }

  return {
    select,
    insert: (table: unknown) => ({
      values: async (values: Row) => {
        const id = nextId++;
        const rows = tables.get(table) ?? [];
        rows.push({ id, ...values });
        tables.set(table, rows);
        return [{ insertId: id }];
      },
    }),
    update: (table: unknown) => ({
      set: (values: Row) => ({
        where: async (condition: unknown) => {
          for (const row of tables.get(table) ?? []) {
            if (matches(row, condition)) Object.assign(row, values);
          }
        },
      }),
    }),
    delete: () => ({ where: async () => undefined }),
  };
}

const AGENT_A = 7;
const AGENT_B = 8;

function context(role: "agent" | "admin", id = AGENT_A) {
  return { user: { id, role, name: "Casey Agent" } } as any;
}

let tables: Map<unknown, Row[]>;

beforeEach(() => {
  tables = new Map<unknown, Row[]>([
    [users, [
      { id: AGENT_A, name: "Casey Agent", role: "agent" },
      { id: AGENT_B, name: "Morgan Other", role: "agent" },
    ]],
    [vendorLists, [
      { id: 1, agentId: AGENT_A, label: null, displayName: "Casey's Vendor List", headline: null, intro: null, publicSlug: "vendors-7", isPublished: true },
      { id: 2, agentId: AGENT_B, label: null, displayName: "Morgan's Vendor List", headline: null, intro: null, publicSlug: "morgan-vendors", isPublished: true },
    ]],
  ]);
  mockGetDb.mockResolvedValue(makeDb(tables));
  mockCheckoutInvite.mockReset();
  mockCheckoutInvite.mockResolvedValue({ subscriptionId: 1, checkoutUrl: "https://checkout.example", emailSent: true });
});

const listRows = () => tables.get(vendorLists)!;

describe("multiple Vendor Lists per agent", () => {
  it("lets an agent add a second list for another market, with its own slug", async () => {
    const caller = vendorsRouter.createCaller(context("agent"));
    const result = await caller.createList({ label: "Lake of the Ozarks" });

    const created = listRows().find(row => row.id === result.id)!;
    expect(created.agentId).toBe(AGENT_A);
    expect(created.label).toBe("Lake of the Ozarks");
    expect(created.publicSlug).toBe("vendors-7-lake-of-the-ozarks");
    expect(created.isPublished).toBe(false);
    // The first list and its link are untouched.
    expect(listRows().find(row => row.id === 1)!.publicSlug).toBe("vendors-7");

    const mine = await caller.myLists();
    expect(mine.map(row => row.id)).toEqual([1, result.id]);
  });

  it("asks for a market name once the agent already has a list", async () => {
    const caller = vendorsRouter.createCaller(context("agent"));
    await expect(caller.createList()).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("still creates an agent's first list without a market name", async () => {
    tables.set(vendorLists, []);
    const caller = vendorsRouter.createCaller(context("agent"));
    const result = await caller.createList();
    expect(listRows().find(row => row.id === result.id)!.publicSlug).toBe("vendors-7");
  });

  it("without a listId, every call keeps using the agent's first list", async () => {
    listRows().push({ id: 3, agentId: AGENT_A, label: "Lake of the Ozarks", displayName: "Lake list", headline: null, intro: null, publicSlug: "vendors-7-lake", isPublished: false });
    const caller = vendorsRouter.createCaller(context("agent"));

    const list = await caller.getManageableList();
    expect(list?.id).toBe(1);

    await caller.updateList({ displayName: "Casey's St. Louis Vendors", publicSlug: "vendors-7", isPublished: true });
    expect(listRows().find(row => row.id === 1)!.displayName).toBe("Casey's St. Louis Vendors");
    expect(listRows().find(row => row.id === 3)!.displayName).toBe("Lake list");
  });

  it("with a listId, reads and updates that list", async () => {
    listRows().push({ id: 3, agentId: AGENT_A, label: "Lake of the Ozarks", displayName: "Lake list", headline: null, intro: null, publicSlug: "vendors-7-lake", isPublished: false });
    const caller = vendorsRouter.createCaller(context("agent"));

    expect((await caller.getManageableList({ listId: 3 }))?.label).toBe("Lake of the Ozarks");
    await caller.updateList({ listId: 3, label: "Lake Ozark", displayName: "Lake list", publicSlug: "vendors-7-lake", isPublished: true });
    expect(listRows().find(row => row.id === 3)).toMatchObject({ label: "Lake Ozark", isPublished: true });
  });
});

describe("ownership is checked per list", () => {
  it("an agent cannot open another agent's list by id", async () => {
    const caller = vendorsRouter.createCaller(context("agent"));
    await expect(caller.getManageableList({ listId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("an agent cannot change another agent's list by id", async () => {
    const caller = vendorsRouter.createCaller(context("agent"));
    await expect(
      caller.updateList({ listId: 2, displayName: "Taken over", publicSlug: "morgan-vendors", isPublished: false })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(listRows().find(row => row.id === 2)).toMatchObject({ displayName: "Morgan's Vendor List", isPublished: true });
  });

  it("an agent cannot add a category to another agent's list by id", async () => {
    const caller = vendorsRouter.createCaller(context("agent"));
    await expect(caller.createCategory({ listId: 2, name: "Cleaners", isVisible: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("an admin can manage any list by id, but not under the wrong agent", async () => {
    const caller = vendorsRouter.createCaller(context("admin", 1));
    expect((await caller.getManageableList({ listId: 2 }))?.agentId).toBe(AGENT_B);
    await expect(caller.getManageableList({ agentId: AGENT_A, listId: 2 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("public links are unchanged", () => {
  it("each slug still opens its own published list", async () => {
    listRows().push({ id: 3, agentId: AGENT_A, label: "Lake of the Ozarks", displayName: "Lake list", headline: null, intro: null, publicSlug: "vendors-7-lake", isPublished: true });
    const caller = vendorsRouter.createCaller({ user: null } as any);
    expect((await caller.getPublic({ slug: "vendors-7" }))?.displayName).toBe("Casey's Vendor List");
    expect((await caller.getPublic({ slug: "vendors-7-lake" }))?.displayName).toBe("Lake list");
    expect((await caller.getPublic({ slug: "morgan-vendors" }))?.displayName).toBe("Morgan's Vendor List");
  });
});

describe("Featured vendor billing resolves the list's owner", () => {
  it("bills against the owner of the named list when an admin passes only a listId", async () => {
    const caller = vendorsRouter.createCaller(context("admin", 1));
    await caller.createFeaturedPaymentInvite({ listId: 2, vendorId: 55, monthlyAmountDollars: 75 });
    expect(mockCheckoutInvite).toHaveBeenCalledWith({ vendorId: 55, agentId: AGENT_B, monthlyAmountCents: 7500 });
  });

  it("refuses an agent naming another agent's list, before any billing", async () => {
    const caller = vendorsRouter.createCaller(context("agent"));
    await expect(caller.createFeaturedPaymentInvite({ listId: 2, vendorId: 55, monthlyAmountDollars: 75 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockCheckoutInvite).not.toHaveBeenCalled();
  });

  it("without a listId, bills as the signed-in agent as before", async () => {
    const caller = vendorsRouter.createCaller(context("agent"));
    await caller.createFeaturedPaymentInvite({ vendorId: 55, monthlyAmountDollars: 75 });
    expect(mockCheckoutInvite).toHaveBeenCalledWith({ vendorId: 55, agentId: AGENT_A, monthlyAmountCents: 7500 });
  });

  it("the checkout invite matches a vendor on any of the agent's lists via its own list", async () => {
    const billing = await vi.importActual<typeof import("./vendorBilling")>("./vendorBilling");
    const previous = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
    try {
      // vendor -> category -> list -> agent: a vendor on Casey's second list.
      tables.set(vendors, [
        { id: 55, agentId: AGENT_A, email: null, businessName: "Lake Cleaners", publicSlug: "vendors-7-lake", isPublished: true },
      ]);
      await expect(
        billing.createFeaturedVendorCheckoutInvite({ vendorId: 55, agentId: AGENT_A, monthlyAmountCents: 7500 })
      ).rejects.toThrow(/email address/);
      await expect(
        billing.createFeaturedVendorCheckoutInvite({ vendorId: 55, agentId: AGENT_B, monthlyAmountCents: 7500 })
      ).rejects.toThrow("Vendor not found.");
    } finally {
      if (previous === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = previous;
    }
  });
});

describe("schema change ships with a startup guard", () => {
  const ensure = readFileSync("server/vendorListsMultiSchema.ts", "utf8");
  const migration = readFileSync("drizzle/20261001_vendor_lists_multiple.sql", "utf8");
  const schema = readFileSync("drizzle/schema.ts", "utf8");

  it("the migration adds the market label and swaps the UNIQUE agentId index for a plain one", () => {
    expect(migration).toContain("ADD COLUMN `label` varchar(120) NULL");
    const createIndex = migration.indexOf("CREATE INDEX `vendor_lists_agent_idx`");
    const dropUnique = migration.indexOf("DROP INDEX `vendor_lists_agentId_unique`");
    expect(createIndex).toBeGreaterThan(-1);
    expect(dropUnique).toBeGreaterThan(createIndex);
  });

  it("the startup guard checks INFORMATION_SCHEMA, runs only in production, and indexes before dropping", () => {
    expect(ensure).toContain('process.env.NODE_ENV !== "production"');
    expect(ensure).toContain("INFORMATION_SCHEMA.COLUMNS");
    expect(ensure).toContain("INFORMATION_SCHEMA.STATISTICS");
    expect(ensure).toContain("NON_UNIQUE = 0");
    expect(ensure.indexOf("VENDOR_LISTS_AGENT_INDEX);")).toBeLessThan(ensure.indexOf("DROP INDEX"));
  });

  it("runs before the server accepts traffic", () => {
    expect(readFileSync("server/_core/index.ts", "utf8")).toContain("await ensureVendorListsMultiSchema();");
  });

  it("drizzle schema no longer declares one list per agent", () => {
    const table = schema.slice(schema.indexOf("export const vendorLists = mysqlTable("), schema.indexOf("export type VendorList ="));
    expect(table).not.toContain(".unique(),\n    displayName");
    expect(table).toContain('label: varchar("label", { length: 120 })');
    expect(table).toContain('index("vendor_lists_agent_idx").on(table.agentId)');
  });

  it("admin billing figures are per list, not repeated per agent", () => {
    const router = readFileSync("server/routers/vendors.ts", "utf8");
    const adminList = router.slice(router.indexOf("adminList: protectedProcedure"), router.indexOf("getPublic: publicProcedure"));
    expect(adminList).not.toContain("${vendorFeaturedSubscriptions.agentId} = ${vendorLists.agentId}");
    expect(adminList).toContain("${vendorFeaturedSubscriptions.vendorId} in ${listVendorIds}");
    expect(router).toContain("count(distinct ${users.id})");
  });
});
