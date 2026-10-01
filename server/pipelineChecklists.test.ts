import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

/**
 * TR016: checklists (agent SOPs) on Pipeline connections.
 *
 * A tiny fake database answers every `select ... from(table)` chain with the
 * rows set for that table, so the real authorization helpers and router run
 * unchanged against it.
 */
const fake = vi.hoisted(() => {
  const rows = new Map<unknown, unknown[]>();
  const inserts: Array<{ table: unknown; values: any }> = [];
  function chain(table: unknown) {
    const result = () => Promise.resolve(rows.get(table) ?? []);
    const self: any = {
      leftJoin: () => self,
      innerJoin: () => self,
      where: () => self,
      orderBy: () => self,
      limit: () => self,
      then: (resolve: any, reject: any) => result().then(resolve, reject),
    };
    return self;
  }
  const db: any = {
    select: () => ({ from: (table: unknown) => chain(table) }),
    insert: (table: unknown) => ({
      values: (values: any) => {
        inserts.push({ table, values });
        return Promise.resolve([{ insertId: 501 }]);
      },
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    delete: () => ({ where: () => Promise.resolve() }),
    transaction: async (callback: (tx: any) => Promise<unknown>) => callback(db),
  };
  return { rows, inserts, db };
});

vi.mock("./db", () => ({
  getDb: vi.fn(async () => fake.db),
  logActivity: vi.fn(async () => undefined),
}));

import {
  agentChecklistApplicationItems,
  agentChecklistApplications,
  agentChecklistTemplates,
  agentConnections,
} from "../drizzle/schema";
import {
  requireApplicationAccess,
  requireApplicationItemAccess,
  requireChecklistTargetAccess,
  requireTemplateManage,
  type ChecklistViewer,
} from "./checklistAuthorization";
import {
  checklistApplicationTargetId,
  checklistTemplateMatchesTarget,
  type ChecklistTargetSnapshot,
} from "./checklistService";
import {
  CHECKLIST_EXACT_TARGET_CHECK,
  migratePipelineChecklists,
  modifyEnumStatement,
  widenEnumColumnType,
} from "./pipelineChecklistSchema";
import { appRouter } from "./routers";

const OWNER = 7;
const OTHER_AGENT = 8;

const agent = (id: number): ChecklistViewer => ({ id, role: "agent" });
const admin: ChecklistViewer = { id: 1, role: "admin" };

function connectionRow(agentId: number) {
  return { id: 300, agentUserId: agentId, createdAt: new Date("2026-09-01T15:00:00Z") };
}

function pipelineApplication(overrides: Record<string, unknown> = {}) {
  return {
    id: 40,
    targetType: "pipeline_connection",
    transactionId: null,
    listingId: null,
    agentConnectionId: 300,
    removedAt: null,
    ...overrides,
  };
}

function ctxFor(id: number, role: "admin" | "agent" | "isa" | "agent_support"): TrpcContext {
  const user = {
    id,
    openId: `user-${id}`,
    email: `user${id}@example.com`,
    name: `User ${id}`,
    loginMethod: "manus" as const,
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    realUser: user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

const sop = {
  name: "Buyer SOP",
  description: null,
  targetType: "pipeline_connection" as const,
  transactionTypeFilter: "any" as const,
  automaticDefaultEvent: "none" as const,
  items: [
    { title: "Buyer-broker agreement signed", sectionName: "Onboarding", dueAnchor: "target_created" as const, dueOffsetDays: 2, assignmentType: "owner" as const },
    { title: "Property and pro-forma sent", sectionName: "Onboarding", dueAnchor: null, dueOffsetDays: 0, assignmentType: "none" as const },
    { title: "Follow-up call scheduled", sectionName: "Follow-up", dueAnchor: "target_created" as const, dueOffsetDays: 7, assignmentType: "none" as const },
  ],
};

beforeEach(() => {
  fake.rows.clear();
  fake.inserts.length = 0;
});

describe("attaching checklists to pipeline connections", () => {
  it("lets an agent reach their own connection", async () => {
    fake.rows.set(agentConnections, [connectionRow(OWNER)]);
    const target = await requireChecklistTargetAccess(fake.db, agent(OWNER), "pipeline_connection", 300);
    expect(target).toMatchObject({ targetType: "pipeline_connection", targetId: 300, agentUserId: OWNER });
  });

  it("refuses another agent's connection", async () => {
    fake.rows.set(agentConnections, [connectionRow(OWNER)]);
    await expect(
      requireChecklistTargetAccess(fake.db, agent(OTHER_AGENT), "pipeline_connection", 300)
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "You can only access pipeline connections assigned to you." });
  });

  it("lets administrators reach any connection", async () => {
    fake.rows.set(agentConnections, [connectionRow(OWNER)]);
    await expect(requireChecklistTargetAccess(fake.db, admin, "pipeline_connection", 300)).resolves.toBeTruthy();
  });

  it("keeps agent support and ISAs out, as for every checklist", async () => {
    fake.rows.set(agentConnections, [connectionRow(OWNER)]);
    for (const role of ["agent_support", "isa"] as const) {
      await expect(
        requireChecklistTargetAccess(fake.db, { id: OWNER, role }, "pipeline_connection", 300)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("returns not found for a connection that does not exist", async () => {
    await expect(
      requireChecklistTargetAccess(fake.db, agent(OWNER), "pipeline_connection", 999)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses to read or change a checklist on another agent's connection", async () => {
    fake.rows.set(agentConnections, [connectionRow(OWNER)]);
    fake.rows.set(agentChecklistApplications, [pipelineApplication()]);
    fake.rows.set(agentChecklistApplicationItems, [{ id: 90, applicationId: 40, removedAt: null }]);

    await expect(requireApplicationAccess(fake.db, agent(OTHER_AGENT), 40)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requireApplicationItemAccess(fake.db, agent(OTHER_AGENT), 90)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requireApplicationAccess(fake.db, agent(OWNER), 40)).resolves.toMatchObject({ id: 40 });
    await expect(requireApplicationItemAccess(fake.db, agent(OWNER), 90)).resolves.toMatchObject({ item: { id: 90 } });
  });

  it("goes through the router too: another agent cannot list, apply to, or tick off a connection's checklist", async () => {
    fake.rows.set(agentConnections, [connectionRow(OWNER)]);
    fake.rows.set(agentChecklistApplications, [pipelineApplication()]);
    fake.rows.set(agentChecklistApplicationItems, [{ id: 90, applicationId: 40, removedAt: null, completed: false }]);
    fake.rows.set(agentChecklistTemplates, [
      { id: 12, ownerUserId: OTHER_AGENT, targetType: "pipeline_connection", transactionTypeFilter: "any", archivedAt: null },
    ]);
    const caller = appRouter.createCaller(ctxFor(OTHER_AGENT, "agent"));

    await expect(
      caller.checklists.applications.list({ targetType: "pipeline_connection", targetId: 300 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.checklists.applications.applyTemplate({ targetType: "pipeline_connection", targetId: 300, templateId: 12 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.checklists.items.update({ id: 90, data: { completed: true } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.checklists.applications.remove({ id: 40 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.inserts).toHaveLength(0);
  });

  it("applies the owner's SOP to their own connection, writing the connection id", async () => {
    fake.rows.set(agentConnections, [connectionRow(OWNER)]);
    fake.rows.set(agentChecklistTemplates, [
      { id: 12, ownerUserId: OWNER, name: "Buyer SOP", description: null, targetType: "pipeline_connection", transactionTypeFilter: "any", automaticDefaultEvent: "none", archivedAt: null },
    ]);
    const caller = appRouter.createCaller(ctxFor(OWNER, "agent"));
    await caller.checklists.applications.applyTemplate({ targetType: "pipeline_connection", targetId: 300, templateId: 12 });

    const application = fake.inserts.find(entry => entry.table === agentChecklistApplications)?.values;
    expect(application).toMatchObject({
      targetType: "pipeline_connection",
      agentConnectionId: 300,
      transactionId: null,
      listingId: null,
      targetAgentUserIdSnapshot: OWNER,
    });
  });
});

describe("agents' own SOP templates", () => {
  it("lets an agent create a pipeline template they own", async () => {
    const caller = appRouter.createCaller(ctxFor(OWNER, "agent"));
    await caller.checklists.templates.create(sop);
    const template = fake.inserts.find(entry => entry.table === agentChecklistTemplates)?.values;
    expect(template).toMatchObject({ ownerUserId: OWNER, targetType: "pipeline_connection", transactionTypeFilter: "any", automaticDefaultEvent: "none" });
  });

  it("refuses pipeline templates that would apply automatically or count from a deal date", async () => {
    const caller = appRouter.createCaller(ctxFor(OWNER, "agent"));
    await expect(caller.checklists.templates.create({ ...sop, automaticDefaultEvent: "on_create" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.checklists.templates.create({ ...sop, items: [{ ...sop.items[0], dueAnchor: "closing" }] })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fake.inserts).toHaveLength(0);
  });

  it("does not let an agent edit, archive or share another agent's template", async () => {
    fake.rows.set(agentChecklistTemplates, [{ id: 12, ownerUserId: OTHER_AGENT, targetType: "pipeline_connection" }]);
    await expect(requireTemplateManage(fake.db, agent(OWNER), 12)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const caller = appRouter.createCaller(ctxFor(OWNER, "agent"));
    await expect(caller.checklists.templates.update({ id: 12, data: sop })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.checklists.templates.archive({ id: 12 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("still lets the owner and administrators manage it", async () => {
    fake.rows.set(agentChecklistTemplates, [{ id: 12, ownerUserId: OWNER, targetType: "pipeline_connection" }]);
    await expect(requireTemplateManage(fake.db, agent(OWNER), 12)).resolves.toMatchObject({ id: 12 });
    await expect(requireTemplateManage(fake.db, admin, 12)).resolves.toMatchObject({ id: 12 });
  });
});

describe("transactions and listings are unchanged", () => {
  const target = (targetType: ChecklistTargetSnapshot["targetType"], transactionType: ChecklistTargetSnapshot["transactionType"] = null) =>
    ({ targetType, targetId: 1, agentUserId: OWNER, transactionType, createdAt: new Date(), contractDate: null, closingDate: null, listDate: null }) as ChecklistTargetSnapshot;

  it("matches templates only to their own target type", () => {
    expect(checklistTemplateMatchesTarget({ targetType: "pipeline_connection", transactionTypeFilter: "any" }, target("pipeline_connection"))).toBe(true);
    expect(checklistTemplateMatchesTarget({ targetType: "pipeline_connection", transactionTypeFilter: "any" }, target("transaction", "buyer"))).toBe(false);
    expect(checklistTemplateMatchesTarget({ targetType: "transaction", transactionTypeFilter: "buyer" }, target("pipeline_connection"))).toBe(false);
    expect(checklistTemplateMatchesTarget({ targetType: "transaction", transactionTypeFilter: "seller" }, target("transaction", "buyer"))).toBe(false);
    expect(checklistTemplateMatchesTarget({ targetType: "listing", transactionTypeFilter: "any" }, target("listing"))).toBe(true);
  });

  it("finds each application's record by its own column", () => {
    expect(checklistApplicationTargetId({ targetType: "transaction", transactionId: 5, listingId: null, agentConnectionId: null })).toBe(5);
    expect(checklistApplicationTargetId({ targetType: "listing", transactionId: null, listingId: 6, agentConnectionId: null })).toBe(6);
    expect(checklistApplicationTargetId({ targetType: "pipeline_connection", transactionId: null, listingId: null, agentConnectionId: 7 })).toBe(7);
  });

  it("still limits an agent to their own transactions", async () => {
    fake.rows.set(agentConnections, []);
    const { transactions } = await import("../drizzle/schema");
    fake.rows.set(transactions, [{ id: 5, agentUserId: OWNER, transactionType: "buyer", createdAt: new Date(), contractDate: null, closingDate: null }]);
    await expect(requireChecklistTargetAccess(fake.db, agent(OWNER), "transaction", 5)).resolves.toMatchObject({ targetType: "transaction" });
    await expect(requireChecklistTargetAccess(fake.db, agent(OTHER_AGENT), "transaction", 5)).rejects.toMatchObject({
      message: "You can only access transactions assigned to you.",
    });
  });
});

describe("schema", () => {
  it("adds the connection column, index and three-way exact-target check", () => {
    const config = getTableConfig(agentChecklistApplications);
    expect(config.columns.map(column => column.name)).toContain("agentConnectionId");
    expect(config.indexes.map(index => index.config.name)).toContain("agent_checklist_applications_connection_idx");
    const check = config.checks.find(item => item.name === CHECKLIST_EXACT_TARGET_CHECK);
    expect(check).toBeTruthy();
    const templateTarget = getTableConfig(agentChecklistTemplates).columns.find(column => column.name === "targetType") as any;
    expect(templateTarget.enumValues).toEqual(["transaction", "listing", "pipeline_connection"]);
  });

  it("widens enums by appending, keeping existing values and nullability", () => {
    expect(widenEnumColumnType("enum('transaction','listing')")).toBe("enum('transaction','listing','pipeline_connection')");
    expect(widenEnumColumnType("enum('transaction','listing','pipeline_connection')")).toBeNull();
    expect(widenEnumColumnType("enum('a','it''s')")).toBe("enum('a','it''s','pipeline_connection')");
    expect(() => widenEnumColumnType("varchar(32)")).toThrow();
    expect(
      modifyEnumStatement("agent_checklist_templates", "targetType", { columnType: "enum('transaction','listing')", isNullable: false, columnDefault: null })
    ).toBe("ALTER TABLE `agent_checklist_templates` MODIFY COLUMN `targetType` enum('transaction','listing','pipeline_connection') NOT NULL");
    expect(
      modifyEnumStatement("t", "c", { columnType: "enum('x')", isNullable: true, columnDefault: "x" })
    ).toBe("ALTER TABLE `t` MODIFY COLUMN `c` enum('x','pipeline_connection') NULL DEFAULT 'x'");
  });

  /** A fake MySQL that answers the INFORMATION_SCHEMA checks and records DDL. */
  function fakeMysql(state: { migrated: boolean }) {
    const ddl: string[] = [];
    let checkPresent = true;
    const enumType = state.migrated ? "enum('transaction','listing','pipeline_connection')" : "enum('transaction','listing')";
    const connection: any = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/INFORMATION_SCHEMA\.COLUMNS/.test(sql)) {
          const [, column] = params as string[];
          if (column === "agentConnectionId") return [state.migrated ? [{ columnType: "int", isNullable: "YES", columnDefault: null }] : []];
          return [[{ columnType: enumType, isNullable: "NO", columnDefault: null }]];
        }
        if (/INFORMATION_SCHEMA\.STATISTICS/.test(sql)) return [[{ count: state.migrated ? 1 : 0 }]];
        if (/INFORMATION_SCHEMA\.TABLE_CONSTRAINTS/.test(sql)) {
          const type = (params as string[])[2];
          return [[{ count: type === "CHECK" ? (checkPresent ? 1 : 0) : state.migrated ? 1 : 0 }]];
        }
        if (/INFORMATION_SCHEMA\.CHECK_CONSTRAINTS/.test(sql)) {
          return [[{ clause: state.migrated ? "... 'pipeline_connection' ..." : "(`targetType` = 'transaction') OR (`targetType` = 'listing')" }]];
        }
        ddl.push(sql);
        if (/DROP CHECK/.test(sql)) checkPresent = false;
        if (/ADD CONSTRAINT .* CHECK/.test(sql)) checkPresent = true;
        return [[]];
      },
    };
    return { connection, ddl };
  }

  it("migrates a database in today's production shape, in a safe order", async () => {
    const { connection, ddl } = fakeMysql({ migrated: false });
    await migratePipelineChecklists(connection);
    expect(ddl[0]).toBe("ALTER TABLE `agent_checklist_applications` DROP CHECK `agent_checklist_applications_exact_target_chk`");
    expect(ddl.slice(1, 4)).toEqual([
      "ALTER TABLE `agent_checklist_templates` MODIFY COLUMN `targetType` enum('transaction','listing','pipeline_connection') NOT NULL",
      "ALTER TABLE `agent_checklist_applications` MODIFY COLUMN `targetType` enum('transaction','listing','pipeline_connection') NOT NULL",
      "ALTER TABLE `agent_checklist_applications` MODIFY COLUMN `templateTargetTypeSnapshot` enum('transaction','listing','pipeline_connection') NOT NULL",
    ]);
    expect(ddl[4]).toContain("ADD COLUMN `agentConnectionId` int NULL AFTER `listingId`");
    expect(ddl[5]).toContain("CREATE INDEX `agent_checklist_applications_connection_idx`");
    expect(ddl[6]).toContain("FOREIGN KEY (`agentConnectionId`) REFERENCES `agent_connections` (`id`) ON DELETE CASCADE");
    expect(ddl[7]).toContain("ADD CONSTRAINT `agent_checklist_applications_exact_target_chk` CHECK");
    expect(ddl[7]).toContain("`agentConnectionId` IS NOT NULL AND `targetType` = 'pipeline_connection'");
    expect(ddl).toHaveLength(8);
    expect(ddl.join("\n")).not.toMatch(/DROP (TABLE|COLUMN)|TRUNCATE|DELETE FROM/i);
  });

  it("does nothing on a database that is already migrated", async () => {
    const { connection, ddl } = fakeMysql({ migrated: true });
    await migratePipelineChecklists(connection);
    expect(ddl).toEqual([]);
  });

  it("is registered at startup and only runs in production", () => {
    const index = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
    expect(index).toContain("await ensurePipelineChecklistSchema();");
    const source = readFileSync(new URL("./pipelineChecklistSchema.ts", import.meta.url), "utf8");
    expect(source).toContain('if (process.env.NODE_ENV !== "production") return;');
    const migration = readFileSync(new URL("../drizzle/20261001_pipeline_checklists.sql", import.meta.url), "utf8");
    expect(migration).toContain("ADD COLUMN `agentConnectionId` int NULL");
    expect(migration).toContain("'pipeline_connection'");
  });
});
