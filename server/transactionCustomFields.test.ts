import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { customFilterCondition, normalizeCustomValue, resolveCustomFilters } from "./routers/transactionCustomFields";
import { transactionCustomFieldsRouter } from "./routers/transactionCustomFields";
import { getDb } from "./db";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({ getDb: vi.fn() }));
const field = (type: "date" | "money" | "number" | "percent" | "checkbox" | "select", options: string[] | null = null) => ({ id: 42, agentId: 7, name: "Private field", type, options, createdAt: new Date() });
const context = (role: "agent" | "admin", id: number) => ({
  user: { id, role, name: role, openId: `test-${id}` },
  realUser: { id, role, name: role, openId: `test-${id}` },
  req: { protocol: "https", headers: {} }, res: {},
} as unknown as TrpcContext);

beforeEach(() => vi.resetAllMocks());

describe("agent transaction custom fields", () => {
  it("validates all six types and preserves a false checkbox as a real value", () => {
    expect(normalizeCustomValue(field("date"), "2026-10-01")).toBe("2026-10-01");
    expect(normalizeCustomValue(field("money"), " 150.50 ")).toBe("150.5");
    expect(normalizeCustomValue(field("number"), "-0.1234")).toBe("-0.1234");
    expect(normalizeCustomValue(field("percent"), "25.5")).toBe("25.5");
    expect(normalizeCustomValue(field("checkbox"), "false")).toBe("false");
    expect(normalizeCustomValue(field("select", ["Pending", "Done"]), "Done")).toBe("Done");
  });

  it("rejects invalid dates, percentages, precision, dropdown options and checkbox values", () => {
    expect(() => normalizeCustomValue(field("date"), "2026-02-30")).toThrow();
    expect(() => normalizeCustomValue(field("percent"), "101")).toThrow();
    expect(() => normalizeCustomValue(field("money"), "1.234")).toThrow();
    expect(() => normalizeCustomValue(field("select", ["Done"]), "Other")).toThrow();
    expect(() => normalizeCustomValue(field("checkbox"), "yes")).toThrow();
  });

  it("rejects filtering another agent's field before issuing the list query", async () => {
    vi.mocked(getDb).mockResolvedValue({ select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }) } as any);
    await expect(resolveCustomFilters([{ fieldId: 42, operator: "eq", value: "Pending" }], 8)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("binds filter values and owner id rather than interpolating them into SQL", () => {
    const dialect = new MySqlDialect();
    const result = dialect.sqlToQuery(customFilterCondition({ fieldId: 42, operator: "eq", value: "Pending' OR 1=1" }, field("select", ["Pending' OR 1=1"]) as any, 7));
    expect(result.sql).toContain("cf.agentId = ?");
    expect(result.sql).not.toContain("Pending' OR 1=1");
    expect(result.params).toContain(7);
    expect(result.params).toContain("Pending' OR 1=1");
  });

  it("filters empty values with NOT EXISTS and numeric ranges with decimal comparison", () => {
    const dialect = new MySqlDialect();
    const empty = dialect.sqlToQuery(customFilterCondition({ fieldId: 42, operator: "empty" }, field("date") as any, 7));
    expect(empty.sql).toContain("NOT EXISTS");
    const numeric = dialect.sqlToQuery(customFilterCondition({ fieldId: 42, operator: "gte", value: "15.5" }, field("money") as any, 7));
    expect(numeric.sql).toContain("DECIMAL(18,4)");
    expect(numeric.params).toContain("15.5");
  });

  it("rejects an agent reading another agent's transaction custom fields", async () => {
    vi.mocked(getDb).mockResolvedValue({ select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ agentId: 8 }]) }) }) }) } as any);
    await expect(transactionCustomFieldsRouter.createCaller(context("agent", 7)).forTransaction({ transactionId: 99, viewerId: 8, viewerRole: "admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows an admin to inspect the private fields on an agent's transaction", async () => {
    let call = 0;
    const rows = [{ field: field("select", ["Pending"]), value: "Pending" }];
    vi.mocked(getDb).mockResolvedValue({ select: () => ({ from: () => ++call === 1
      ? { where: () => ({ limit: () => Promise.resolve([{ agentId: 7 }]) }) }
      : { leftJoin: () => ({ where: () => ({ orderBy: () => Promise.resolve(rows) }) }) } }) } as any);
    await expect(transactionCustomFieldsRouter.createCaller(context("admin", 1)).forTransaction({ transactionId: 99 })).resolves.toEqual(rows);
  });

  it("rejects admin creation and writes to private agent values", async () => {
    const caller = transactionCustomFieldsRouter.createCaller(context("admin", 1));
    await expect(caller.create({ name: "Secret", type: "money" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.setValue({ transactionId: 99, fieldId: 42, value: "100" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an agent changing a custom value on a deal they do not own", async () => {
    let call = 0;
    vi.mocked(getDb).mockResolvedValue({ select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(++call === 1 ? [] : [field("money")]) }) }) }) } as any);
    await expect(transactionCustomFieldsRouter.createCaller(context("agent", 7)).setValue({ transactionId: 99, fieldId: 42, value: "100" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a default view containing another agent's custom column", async () => {
    vi.mocked(getDb).mockResolvedValue({ select: () => ({ from: () => ({ where: () => Promise.resolve([{ id: 42 }]) }) }) } as any);
    const view = {
      visibleColumns: ["contact", "custom:99"], statusFilter: "all", typeFilter: "all", marketFilter: "all",
      agentFilter: "all", leadSourceFilter: "all", txSearch: "", closingDateFrom: "", closingDateTo: "",
      contractDateFrom: "", contractDateTo: "", sortColumn: "closing_date", sortOrder: "desc" as const,
      txLimit: 25 as const, customFilters: [],
    };
    await expect(transactionCustomFieldsRouter.createCaller(context("agent", 7)).saveView(view)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
