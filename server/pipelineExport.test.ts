import { beforeEach, describe, expect, it, vi } from "vitest";
import { and } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const { mockGetDb, mockGetAgentConnectionExportRows } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockGetAgentConnectionExportRows: vi.fn(),
}));

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: mockGetDb,
    getAgentConnectionExportRows: mockGetAgentConnectionExportRows,
  };
});

import { buildAgentConnectionBaseConditions } from "./db";
import { agentConnectionsRouter } from "./routers/agentConnections";
import { buildPipelineCsv, csvCell, PIPELINE_CSV_HEADERS } from "../shared/pipelineCsv";

const dialect = new MySqlDialect();
function render(conditions: any[] | null) {
  if (!conditions) return null;
  return dialect.sqlToQuery(and(...conditions)!);
}

describe("buildAgentConnectionBaseConditions", () => {
  it("always excludes archived connections", () => {
    const query = render(buildAgentConnectionBaseConditions({}))!;
    expect(query.sql).toContain("`agent_connections`.`archivedAt` is null");
  });

  it("an agent scope limits to that agent's own connections", () => {
    const query = render(buildAgentConnectionBaseConditions({ scopeAgentId: 42 }))!;
    expect(query.sql).toContain("`agent_connections`.`agentId` = ?");
    expect(query.params).toContain(42);
  });

  it("an agent_support scope limits to the assigned agents", () => {
    const query = render(buildAgentConnectionBaseConditions({ scopeAgentIds: [3, 9] }))!;
    expect(query.sql).toContain("`agent_connections`.`agentId` in (?, ?)");
    expect(query.params).toEqual(expect.arrayContaining([3, 9]));
  });

  it("an empty agent_support scope allows nothing (null), never everything", () => {
    expect(buildAgentConnectionBaseConditions({ scopeAgentIds: [] })).toBeNull();
  });

  it("no scope (admin, ISA) adds no agent restriction", () => {
    const query = render(buildAgentConnectionBaseConditions({}))!;
    expect(query.sql).not.toContain("`agentId`");
  });

  it("filters by the chosen stages", () => {
    const query = render(buildAgentConnectionBaseConditions({ statuses: ["under_contract", "closed"] }))!;
    expect(query.sql).toContain("`agent_connections`.`pipelineStatus` in (?, ?)");
    expect(query.params).toEqual(expect.arrayContaining(["under_contract", "closed"]));
  });

  it("an empty stage list selects nothing", () => {
    expect(buildAgentConnectionBaseConditions({ statuses: [] })).toBeNull();
  });

  it("keeps the page filters: ISA, unassigned lead source and search", () => {
    const query = render(buildAgentConnectionBaseConditions({ isaId: 5, leadSourceId: -1, search: "  ann   lee " }))!;
    expect(query.sql).toContain("`contacts`.`assignedIsaId` = ?");
    expect(query.sql).toContain("`contacts`.`leadSourceId` is null");
    expect(query.params).toContain("%ann lee%");
  });
});

describe("agentConnections.exportRows scope", () => {
  const caller = (role: string, id = 7) => agentConnectionsRouter.createCaller({ user: { id, name: "U", role } } as any);
  const input = { statuses: ["under_contract", "closed"], agentId: 99, isaId: 5, search: " smith " };

  beforeEach(() => {
    mockGetDb.mockReset();
    mockGetAgentConnectionExportRows.mockReset();
    mockGetAgentConnectionExportRows.mockResolvedValue({ rows: [], truncated: false, cap: 10000 });
  });

  it("agents export only their own connections and cannot pick another agent", async () => {
    await caller("agent", 7).exportRows(input);
    const filters = mockGetAgentConnectionExportRows.mock.calls[0][0];
    expect(filters.scopeAgentId).toBe(7);
    expect(filters.agentId).toBeUndefined();
    expect(filters.statuses).toEqual(["under_contract", "closed"]);
    expect(filters.search).toBe("smith");
  });

  it("agent_support exports only their assigned agents", async () => {
    const where = vi.fn(async () => [{ agentId: 3 }, { agentId: 9 }]);
    mockGetDb.mockResolvedValue({ select: () => ({ from: () => ({ where }) }) });
    await caller("agent_support", 11).exportRows(input);
    const filters = mockGetAgentConnectionExportRows.mock.calls[0][0];
    expect(filters.scopeAgentIds).toEqual([3, 9]);
    expect(filters.scopeAgentId).toBeUndefined();
  });

  it("agent_support with no assignments gets an empty scope", async () => {
    mockGetDb.mockResolvedValue({ select: () => ({ from: () => ({ where: async () => [] }) }) });
    await caller("agent_support", 11).exportRows(input);
    expect(mockGetAgentConnectionExportRows.mock.calls[0][0].scopeAgentIds).toEqual([]);
  });

  it("admins are unscoped and can filter by agent", async () => {
    await caller("admin").exportRows(input);
    const filters = mockGetAgentConnectionExportRows.mock.calls[0][0];
    expect(filters.scopeAgentId).toBeUndefined();
    expect(filters.scopeAgentIds).toBeUndefined();
    expect(filters.agentId).toBe(99);
  });

  it("requires at least one stage", async () => {
    await expect(caller("admin").exportRows({ statuses: [] })).rejects.toThrow();
  });
});

describe("pipeline CSV", () => {
  it("escapes commas, quotes and newlines", () => {
    expect(csvCell("Smith, Jr.")).toBe('"Smith, Jr."');
    expect(csvCell('The "Lake" house')).toBe('"The ""Lake"" house"');
    expect(csvCell("line 1\nline 2")).toBe('"line 1\nline 2"');
    expect(csvCell(null)).toBe("");
  });

  it("defuses spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1 555 0100")).toBe("'+1 555 0100");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell("plain")).toBe("plain");
  });

  it("writes the header and one labelled row per connection", () => {
    const csv = buildPipelineCsv(
      [
        {
          firstName: "Ann",
          lastName: "Lee",
          email: "ann@example.com",
          phone: "(555) 010-0100",
          address: "1 Main St",
          city: "Branson",
          state: "MO",
          zip: "65616",
          stage: "under_contract",
          relationshipType: "both",
          agentName: "Rich Clover",
          isaName: null,
          leadSourceName: "Website",
          parentLeadSourceName: "Savvy-Agents",
          updatedAt: new Date("2026-09-30T14:05:00Z"),
        },
      ],
      { under_contract: "Under Contract" },
    );
    const [header, row, end] = csv.split("\r\n");
    expect(header).toBe(PIPELINE_CSV_HEADERS.join(","));
    expect(row).toBe(
      "Ann Lee,ann@example.com,(555) 010-0100,1 Main St,Branson,MO,65616,Under Contract,Buyer & Seller,Rich Clover,,Savvy-Agents > Website,2026-09-30 14:05",
    );
    expect(end).toBe("");
  });
});
