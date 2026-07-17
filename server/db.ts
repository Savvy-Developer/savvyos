import { aliasedTable, and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lte, or, sql } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import {
  InsertUser,
  activityLog,
  agentConnections,
  agentGoals,
  automations,
  communications,
  contacts,
  documents,
  groupMembers,
  groups,
  properties,
  propertyOwnership,
  tasks,
  transactionPayoutItems,
  transactionExports,
  transactions,
  users,
  leadSources,
  listings,
  listingNotes,
  transactionDocuments,
  transactionNotes,
  contactProperties,
  markets,
  marketProfiles,
  feedback,
  taskNotes,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _pool: mysql.Pool | null = null;
let _db: MySql2Database<Record<string, unknown>> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Use a connection POOL, not a single connection. Passing the URL string
      // directly to drizzle() opens ONE connection, which serializes every query
      // across all users and causes the app to hang under concurrent load.
      _pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        connectionLimit: 15,
        maxIdle: 15,
        idleTimeout: 60000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
      });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}
export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

/**
 * Merges a manually-created user account with their real OAuth identity.
 * Updates the openId (and optionally name/loginMethod) on the existing row
 * so all their existing data (connections, transactions, tasks) is preserved.
 */
export async function mergeManualUserWithOAuth(
  userId: number,
  data: { openId: string; name?: string | null; loginMethod?: string | null; lastSignedIn?: Date }
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({
      openId: data.openId,
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.loginMethod !== undefined ? { loginMethod: data.loginMethod } : {}),
      lastSignedIn: data.lastSignedIn ?? new Date(),
    })
    .where(eq(users.id, userId));
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(users.name);
}

export async function getUsersByRole(role: "admin" | "agent" | "isa" | "agent_support") {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(eq(users.role, role)).orderBy(users.name);
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function updateUserRole(userId: number, role: "admin" | "agent" | "isa" | "agent_support") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function setUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function setPasswordResetToken(userId: number, token: string, expiry: Date) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ passwordResetToken: token, passwordResetExpiry: expiry }).where(eq(users.id, userId));
}

export async function clearPasswordResetToken(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ passwordResetToken: null, passwordResetExpiry: null }).where(eq(users.id, userId));
}

export async function getUserByResetToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.passwordResetToken, token)).limit(1);
  return result[0];
}

// ─── Contacts ─────────────────────────────────────────────────────────────────
export async function getContacts(search?: string, isaId?: number, agentId?: number, page = 1, limit = 25, isaStatus?: string, marketId?: number, leadSourceId?: number, sortOrder: "asc" | "desc" = "desc") {
  const offset = (page - 1) * limit;
  const db = await getDb();
  if (!db) return { rows: [], total: 0, page, limit };
  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(contacts.firstName, `%${search}%`),
        like(contacts.lastName, `%${search}%`),
        like(contacts.email, `%${search}%`),
        like(contacts.phone, `%${search}%`),
        sql`CONCAT(${contacts.firstName}, ' ', ${contacts.lastName}) LIKE ${`%${search}%`}`
      )
    );
  }
  // Relevance ordering when a search term is provided:
  // 0=exact name match, 1=name starts-with, 2=name contains, 3=email contains, 4=other
  const orderExprs: any[] = [];
  if (search) {
    const s = search.toLowerCase();
    const startsWith = `${s}%`;
    const contains = `%${s}%`;
    orderExprs.push(sql`CASE
      WHEN LOWER(${contacts.firstName}) = ${s}
        OR LOWER(${contacts.lastName}) = ${s}
        OR LOWER(CONCAT(${contacts.firstName}, ' ', ${contacts.lastName})) = ${s}
      THEN 0
      WHEN LOWER(${contacts.firstName}) LIKE ${startsWith}
        OR LOWER(${contacts.lastName}) LIKE ${startsWith}
        OR LOWER(CONCAT(${contacts.firstName}, ' ', ${contacts.lastName})) LIKE ${startsWith}
      THEN 1
      WHEN LOWER(${contacts.firstName}) LIKE ${contains}
        OR LOWER(${contacts.lastName}) LIKE ${contains}
        OR LOWER(CONCAT(${contacts.firstName}, ' ', ${contacts.lastName})) LIKE ${contains}
      THEN 2
      WHEN LOWER(${contacts.email}) LIKE ${contains}
      THEN 3
      ELSE 4
    END`);
  }
  orderExprs.push(sortOrder === "asc" ? asc(contacts.firstName) : desc(contacts.createdAt));
  if (isaId === -1) {
    conditions.push(isNull(contacts.assignedIsaId));
  } else if (isaId) {
    conditions.push(eq(contacts.assignedIsaId, isaId));
  }
  if (isaStatus) {
    conditions.push(eq(contacts.isaStatus, isaStatus as any));
  }
  // Exclude archived contacts by default
  conditions.push(isNull(contacts.archivedAt));
  // Filter by lead source
  if (leadSourceId) {
    conditions.push(eq(contacts.leadSourceId, leadSourceId));
  }
  // Filter by market: find agents in the given market, then filter contacts connected to those agents
  if (marketId) {
    const db2 = await getDb();
    if (db2) {
      const marketAgents = await db2
        .select({ id: users.id })
        .from(users)
        .where(eq(users.marketProfileId, marketId));
      const marketAgentIds = marketAgents.map((a) => a.id);
      if (marketAgentIds.length > 0) {
        const marketContactIds = await db2
          .select({ contactId: agentConnections.contactId })
          .from(agentConnections)
          .where(inArray(agentConnections.agentId, marketAgentIds));
        const ids = Array.from(new Set(marketContactIds.map((r) => r.contactId).filter(Boolean))) as number[];
        if (ids.length === 0) return { rows: [], total: 0, page, limit };
        conditions.push(inArray(contacts.id, ids));
      } else {
        return { rows: [], total: 0, page, limit };
      }
    }
  }
  if (agentId) {
    // For agents: only show contacts they have an agent connection with
    const db2 = await getDb();
    if (db2) {
      const agentContactIds = await db2
        .select({ contactId: agentConnections.contactId, connectionId: agentConnections.id })
        .from(agentConnections)
        .where(eq(agentConnections.agentId, agentId));
      const ids = agentContactIds.map((r) => r.contactId).filter(Boolean) as number[];
      if (ids.length === 0) return { rows: [], total: 0, page, limit };
      conditions.push(inArray(contacts.id, ids));
      const connMap = new Map(agentContactIds.map((r) => [r.contactId, r.connectionId]));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [countResult, rows] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(contacts).where(where),
        db.select({
            contact: contacts,
            assignedIsa: users,
            lastContacted: sql<Date | null>`(SELECT MAX(communicatedAt) FROM communications WHERE relatedContactId = ${contacts.id})`,
          })
          .from(contacts)
          .leftJoin(users, eq(contacts.assignedIsaId, users.id))
          .where(where)
          .orderBy(...orderExprs)
          .limit(limit)
          .offset(offset),
      ]);
      const total = Number(countResult[0]?.count ?? 0);
      return { rows: rows.map((r) => ({ ...r, agentConnectionId: connMap.get(r.contact.id) ?? null })), total, page, limit };
    }
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const assignedIsaAlias = aliasedTable(users, "assignedIsa");
  const agentAlias = aliasedTable(users, "agent");
  const [countResult, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(contacts).where(where),
    db.select({
        contact: contacts,
        assignedIsa: assignedIsaAlias,
        pipelineStatus: sql<string | null>`MAX(${agentConnections.pipelineStatus})`,
        agentConnectionId: sql<number | null>`MAX(${agentConnections.id})`,
        agentId: sql<number | null>`MAX(${agentConnections.agentId})`,
        agentName: sql<string | null>`MAX(${agentAlias.name})`,
        connectionCount: sql<number>`COUNT(DISTINCT ${agentConnections.id})`,
        lastContacted: sql<Date | null>`(SELECT MAX(communicatedAt) FROM communications WHERE relatedContactId = ${contacts.id})`,
      })
      .from(contacts)
      .leftJoin(assignedIsaAlias, eq(contacts.assignedIsaId, assignedIsaAlias.id))
      .leftJoin(agentConnections, eq(contacts.id, agentConnections.contactId))
      .leftJoin(agentAlias, eq(agentConnections.agentId, agentAlias.id))
      .where(where)
      .groupBy(contacts.id, assignedIsaAlias.id)
      .orderBy(...orderExprs)
      .limit(limit)
      .offset(offset),
  ]);
  const total = Number(countResult[0]?.count ?? 0);
  return { rows, total, page, limit };
}

export async function getContactById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const parentLeadSources = aliasedTable(leadSources, "parentLeadSources");
  const result = await db
    .select({
      contact: contacts,
      assignedIsa: users,
      leadSource: {
        id: leadSources.id,
        name: leadSources.name,
        parentId: leadSources.parentId,
        parentName: parentLeadSources.name,
      },
    })
    .from(contacts)
    .leftJoin(users, eq(contacts.assignedIsaId, users.id))
    .leftJoin(leadSources, eq(contacts.leadSourceId, leadSources.id))
    .leftJoin(parentLeadSources, eq(leadSources.parentId, parentLeadSources.id))
    .where(eq(contacts.id, id))
    .limit(1);
  return result[0];
}

export async function createContact(data: typeof contacts.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(contacts).values(data);
  const insertId = (result as any).insertId as number;
  // Outbound GHL sync — fire-and-forget; never blocks contact creation. See
  // server/_core/ghlSync.ts for the chokepoint design.
  void import("./_core/ghlSync").then((m) => m.triggerGhlContactSync(insertId));
  return insertId;
}

export async function updateContact(id: number, data: Partial<typeof contacts.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(contacts).set(data).where(eq(contacts.id, id));
}
export async function archiveContact(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(contacts).set({ archivedAt: new Date() }).where(eq(contacts.id, id));
}
export async function deleteContact(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(contacts).where(eq(contacts.id, id));
}

// ─── Agent Connections ────────────────────────────────────────────────────────
type AgentConnectionListFilters = {
  scopeAgentId?: number;
  agentId?: number;
  contactId?: number;
  status?: string;
  isaId?: number;
  leadSourceId?: number;
  search?: string;
  followUpDateFrom?: Date;
  followUpDateTo?: Date;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
};

export async function getAgentConnections(filters: AgentConnectionListFilters = {}) {
  const db = await getDb();
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 50;
  if (!db) {
    return {
      rows: [], total: 0, page, limit,
      stageCounts: {}, agentCounts: {}, isaCounts: {}, leadSourceCounts: {},
      fullPipelineTotal: 0,
      stats: {
        total: 0, openCount: 0, overdueFollowUps: 0, dueToday: 0,
        avgAgeDays: 0, oldestAgeDays: 0, staleCount: 0,
        agingBuckets: { fresh: 0, idle: 0, stale: 0, aging: 0, critical: 0 },
      },
    };
  }

  const baseConditions: any[] = [];
  if (filters.scopeAgentId) baseConditions.push(eq(agentConnections.agentId, filters.scopeAgentId));
  if (filters.agentId) baseConditions.push(eq(agentConnections.agentId, filters.agentId));
  if (filters.contactId) baseConditions.push(eq(agentConnections.contactId, filters.contactId));
  if (filters.isaId === -1) {
    baseConditions.push(isNull(contacts.assignedIsaId));
  } else if (filters.isaId) {
    baseConditions.push(eq(contacts.assignedIsaId, filters.isaId));
  }
  if (filters.leadSourceId === -1) {
    baseConditions.push(isNull(contacts.leadSourceId));
  } else if (filters.leadSourceId) {
    baseConditions.push(eq(contacts.leadSourceId, filters.leadSourceId));
  }
  if (filters.search) {
    const s = `%${filters.search}%`;
    baseConditions.push(or(
      like(contacts.firstName, s),
      like(contacts.lastName, s),
      like(contacts.email, s),
      like(contacts.phone, s),
    ));
  }
  if (filters.followUpDateFrom) baseConditions.push(gte(agentConnections.followUpDate, filters.followUpDateFrom));
  if (filters.followUpDateTo) baseConditions.push(lte(agentConnections.followUpDate, filters.followUpDateTo));

  const resultConditions = [...baseConditions];
  if (filters.status) resultConditions.push(eq(agentConnections.pipelineStatus, filters.status as any));
  const baseWhere = baseConditions.length > 0 ? and(...baseConditions) : undefined;
  const resultWhere = resultConditions.length > 0 ? and(...resultConditions) : undefined;
  const scopeWhere = filters.scopeAgentId ? eq(agentConnections.agentId, filters.scopeAgentId) : undefined;
  const offset = (page - 1) * limit;
  const pipelineParentLS = aliasedTable(leadSources, "pipelineParentLS");

  // Stage counts intentionally exclude only the active stage filter. This keeps
  // every stage card accurate and switchable while honoring all other filters.
  const [countRows, rows, stageRows, agentFacetRows, isaFacetRows, leadSourceFacetRows, summaryRows] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` })
      .from(agentConnections)
      .leftJoin(contacts, eq(agentConnections.contactId, contacts.id))
      .where(resultWhere),
    db.select({
      connection: agentConnections,
      contact: contacts,
      agent: users,
      leadSource: { id: leadSources.id, name: leadSources.name, parentId: leadSources.parentId },
      parentLeadSource: { id: pipelineParentLS.id, name: pipelineParentLS.name },
    })
      .from(agentConnections)
      .leftJoin(contacts, eq(agentConnections.contactId, contacts.id))
      .leftJoin(users, eq(agentConnections.agentId, users.id))
      .leftJoin(leadSources, eq(contacts.leadSourceId, leadSources.id))
      .leftJoin(pipelineParentLS, eq(leadSources.parentId, pipelineParentLS.id))
      .where(resultWhere)
      .orderBy(filters.sortOrder === "asc" ? asc(contacts.firstName) : desc(agentConnections.updatedAt))
      .limit(limit)
      .offset(offset),
    db.select({ status: agentConnections.pipelineStatus, count: sql<number>`COUNT(*)` })
      .from(agentConnections)
      .leftJoin(contacts, eq(agentConnections.contactId, contacts.id))
      .where(baseWhere)
      .groupBy(agentConnections.pipelineStatus),
    db.select({ id: agentConnections.agentId, count: sql<number>`COUNT(*)` })
      .from(agentConnections)
      .where(scopeWhere)
      .groupBy(agentConnections.agentId),
    db.select({ id: contacts.assignedIsaId, count: sql<number>`COUNT(*)` })
      .from(agentConnections)
      .leftJoin(contacts, eq(agentConnections.contactId, contacts.id))
      .where(scopeWhere)
      .groupBy(contacts.assignedIsaId),
    db.select({ id: contacts.leadSourceId, count: sql<number>`COUNT(*)` })
      .from(agentConnections)
      .leftJoin(contacts, eq(agentConnections.contactId, contacts.id))
      .where(scopeWhere)
      .groupBy(contacts.leadSourceId),
    db.select({
      total: sql<number>`COUNT(*)`,
      openCount: sql<number>`COALESCE(SUM(CASE WHEN ${agentConnections.pipelineStatus} NOT IN ('closed', 'dead') THEN 1 ELSE 0 END), 0)`,
      overdueFollowUps: sql<number>`COALESCE(SUM(CASE WHEN ${agentConnections.followUpDate} < CURDATE() AND ${agentConnections.pipelineStatus} NOT IN ('closed', 'dead') THEN 1 ELSE 0 END), 0)`,
      dueToday: sql<number>`COALESCE(SUM(CASE WHEN DATE(${agentConnections.followUpDate}) = CURDATE() AND ${agentConnections.pipelineStatus} NOT IN ('closed', 'dead') THEN 1 ELSE 0 END), 0)`,
      avgAgeDays: sql<number>`COALESCE(AVG(CASE WHEN ${agentConnections.pipelineStatus} NOT IN ('closed', 'dead') THEN GREATEST(DATEDIFF(NOW(), ${agentConnections.updatedAt}), 0) END), 0)`,
      oldestAgeDays: sql<number>`COALESCE(MAX(CASE WHEN ${agentConnections.pipelineStatus} NOT IN ('closed', 'dead') THEN GREATEST(DATEDIFF(NOW(), ${agentConnections.updatedAt}), 0) END), 0)`,
      staleCount: sql<number>`COALESCE(SUM(CASE WHEN ${agentConnections.pipelineStatus} NOT IN ('closed', 'dead') AND DATEDIFF(NOW(), ${agentConnections.updatedAt}) >= 7 THEN 1 ELSE 0 END), 0)`,
      freshCount: sql<number>`COALESCE(SUM(CASE WHEN ${agentConnections.pipelineStatus} NOT IN ('closed', 'dead') AND DATEDIFF(NOW(), ${agentConnections.updatedAt}) BETWEEN 0 AND 2 THEN 1 ELSE 0 END), 0)`,
      idleCount: sql<number>`COALESCE(SUM(CASE WHEN ${agentConnections.pipelineStatus} NOT IN ('closed', 'dead') AND DATEDIFF(NOW(), ${agentConnections.updatedAt}) BETWEEN 3 AND 6 THEN 1 ELSE 0 END), 0)`,
      agingCount: sql<number>`COALESCE(SUM(CASE WHEN ${agentConnections.pipelineStatus} NOT IN ('closed', 'dead') AND DATEDIFF(NOW(), ${agentConnections.updatedAt}) BETWEEN 7 AND 13 THEN 1 ELSE 0 END), 0)`,
      olderCount: sql<number>`COALESCE(SUM(CASE WHEN ${agentConnections.pipelineStatus} NOT IN ('closed', 'dead') AND DATEDIFF(NOW(), ${agentConnections.updatedAt}) BETWEEN 14 AND 29 THEN 1 ELSE 0 END), 0)`,
      criticalCount: sql<number>`COALESCE(SUM(CASE WHEN ${agentConnections.pipelineStatus} NOT IN ('closed', 'dead') AND DATEDIFF(NOW(), ${agentConnections.updatedAt}) >= 30 THEN 1 ELSE 0 END), 0)`,
    })
      .from(agentConnections)
      .leftJoin(contacts, eq(agentConnections.contactId, contacts.id))
      .where(resultWhere),
  ]);

  const toCountMap = (items: Array<{ id: number | null; count: number }>) => Object.fromEntries(
    items.map((item) => [item.id == null ? "unassigned" : String(item.id), Number(item.count)]),
  );
  const stageCounts = Object.fromEntries(stageRows.map((item) => [item.status, Number(item.count)]));
  const agentCounts = toCountMap(agentFacetRows);
  const isaCounts = toCountMap(isaFacetRows);
  const leadSourceCounts = toCountMap(leadSourceFacetRows);
  const fullPipelineTotal = Object.values(agentCounts).reduce((sum, count) => sum + count, 0);
  const summary = summaryRows[0];

  return {
    rows,
    total: Number(countRows[0]?.count ?? 0),
    page,
    limit,
    stageCounts,
    agentCounts,
    isaCounts,
    leadSourceCounts,
    fullPipelineTotal,
    stats: {
      total: Number(summary?.total ?? 0),
      openCount: Number(summary?.openCount ?? 0),
      overdueFollowUps: Number(summary?.overdueFollowUps ?? 0),
      dueToday: Number(summary?.dueToday ?? 0),
      avgAgeDays: Number(summary?.avgAgeDays ?? 0),
      oldestAgeDays: Number(summary?.oldestAgeDays ?? 0),
      staleCount: Number(summary?.staleCount ?? 0),
      agingBuckets: {
        fresh: Number(summary?.freshCount ?? 0),
        idle: Number(summary?.idleCount ?? 0),
        stale: Number(summary?.agingCount ?? 0),
        aging: Number(summary?.olderCount ?? 0),
        critical: Number(summary?.criticalCount ?? 0),
      },
    },
  };
}

export async function getAgentConnectionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  // Alias for ISA user join
  const isaUser = aliasedTable(users, "isa_user");
  const parentLS = aliasedTable(leadSources, "parentLS");
  const result = await db
    .select({
      connection: agentConnections,
      contact: contacts,
      agent: users,
      isa: isaUser,
      leadSource: { id: leadSources.id, name: leadSources.name, parentId: leadSources.parentId },
      parentLeadSource: { id: parentLS.id, name: parentLS.name },
    })
    .from(agentConnections)
    .leftJoin(contacts, eq(agentConnections.contactId, contacts.id))
    .leftJoin(users, eq(agentConnections.agentId, users.id))
    .leftJoin(isaUser, eq(contacts.assignedIsaId, isaUser.id))
    .leftJoin(leadSources, eq(contacts.leadSourceId, leadSources.id))
    .leftJoin(parentLS, eq(leadSources.parentId, parentLS.id))
    .where(eq(agentConnections.id, id))
    .limit(1);
  return result[0];
}

export async function createAgentConnection(data: typeof agentConnections.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(agentConnections).values(data);
  return (result as any).insertId as number;
}

export async function updateAgentConnection(id: number, data: Partial<typeof agentConnections.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(agentConnections).set(data).where(eq(agentConnections.id, id));
}

// ─── Properties ───────────────────────────────────────────────────────────────
export async function getProperties(
  search?: string,
  sortOrder: "asc" | "desc" = "desc",
  page = 1,
  limit = 100,
) {
  const db = await getDb();
  if (!db) return [];
  const where = search
    ? or(like(properties.address, `%${search}%`), like(properties.city, `%${search}%`))
    : undefined;
  const offset = Math.max(0, (page - 1) * limit);

  // Pre-aggregate per-propertyId once per related table, then LEFT JOIN. Replaces
  // 6 per-row correlated subqueries with 3 grouped scans — one pass each.
  // NOTE: each CTE's aggregate columns get a UNIQUE name (txCnt/txNames,
  // lCnt/lNames, cpCnt/cpNames). Drizzle references `sql``.as()` CTE columns
  // unqualified in the outer SELECT, so reusing "cnt"/"names" across all three
  // CTEs produces an ambiguous-column error (MySQL 1052) and a 500.
  const txAgg = db.$with("txAgg").as(
    db
      .select({
        propertyId: transactions.propertyId,
        txCnt: sql<number>`COUNT(*)`.as("txCnt"),
        txNames: sql<string | null>`SUBSTRING_INDEX(GROUP_CONCAT(CONCAT(${contacts.firstName}, ' ', ${contacts.lastName}) ORDER BY ${transactions.id} SEPARATOR ', '), ', ', 3)`.as("txNames"),
      })
      .from(transactions)
      .leftJoin(contacts, eq(transactions.primaryContactId, contacts.id))
      .groupBy(transactions.propertyId),
  );
  const lAgg = db.$with("lAgg").as(
    db
      .select({
        propertyId: listings.propertyId,
        lCnt: sql<number>`COUNT(*)`.as("lCnt"),
        lNames: sql<string | null>`SUBSTRING_INDEX(GROUP_CONCAT(CONCAT(${contacts.firstName}, ' ', ${contacts.lastName}) ORDER BY ${listings.id} SEPARATOR ', '), ', ', 3)`.as("lNames"),
      })
      .from(listings)
      .leftJoin(contacts, eq(listings.contactId, contacts.id))
      .groupBy(listings.propertyId),
  );
  const cpAgg = db.$with("cpAgg").as(
    db
      .select({
        propertyId: contactProperties.propertyId,
        cpCnt: sql<number>`COUNT(*)`.as("cpCnt"),
        cpNames: sql<string | null>`SUBSTRING_INDEX(GROUP_CONCAT(CONCAT(${contacts.firstName}, ' ', ${contacts.lastName}) ORDER BY ${contactProperties.id} SEPARATOR ', '), ', ', 3)`.as("cpNames"),
      })
      .from(contactProperties)
      .leftJoin(contacts, eq(contactProperties.contactId, contacts.id))
      .groupBy(contactProperties.propertyId),
  );

  return db
    .with(txAgg, lAgg, cpAgg)
    .select({
      property: properties,
      transactionCount: sql<number>`COALESCE(${txAgg.txCnt}, 0)`,
      listingCount: sql<number>`COALESCE(${lAgg.lCnt}, 0)`,
      contactCount: sql<number>`COALESCE(${cpAgg.cpCnt}, 0)`,
      transactionNames: txAgg.txNames,
      listingNames: lAgg.lNames,
      contactNames: cpAgg.cpNames,
    })
    .from(properties)
    .leftJoin(txAgg, eq(txAgg.propertyId, properties.id))
    .leftJoin(lAgg, eq(lAgg.propertyId, properties.id))
    .leftJoin(cpAgg, eq(cpAgg.propertyId, properties.id))
    .where(where)
    .orderBy(sortOrder === "asc" ? asc(properties.address) : desc(properties.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getPropertyById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
  return result[0];
}

export async function createProperty(data: typeof properties.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(properties).values(data);
  return (result as any).insertId as number;
}

export async function updateProperty(id: number, data: Partial<typeof properties.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(properties).set(data).where(eq(properties.id, id));
}

export async function getPropertyOwnership(propertyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ ownership: propertyOwnership, contact: contacts })
    .from(propertyOwnership)
    .leftJoin(contacts, eq(propertyOwnership.ownerContactId, contacts.id))
    .where(eq(propertyOwnership.propertyId, propertyId))
    .orderBy(desc(propertyOwnership.ownershipStartDate));
}

// ─── Transactions ─────────────────────────────────────────────────────────────
export async function getTransactions(agentId?: number, status?: string, search?: string, page = 1, limit = 25, marketId?: number, contractDateFrom?: string, contractDateTo?: string, closingDateFrom?: string, closingDateTo?: string, flagNoClosingDate?: boolean, flagPastClosingDate?: boolean, leadSourceId?: number, flagPayoutIntegrity?: boolean, transactionType?: string, sortOrder: "asc" | "desc" = "desc", sortBy: string = "closing_date") {
  const offset = (page - 1) * limit;
  const db = await getDb();
  if (!db) return { rows: [], total: 0, page, limit };
  const conditions = [];
  if (agentId) conditions.push(eq(transactions.agentId, agentId));
  if (status) conditions.push(eq(transactions.status, status as any));
  if (search) conditions.push(or(like(transactions.transactionNumber, `%${search}%`), like(contacts.firstName, `%${search}%`), like(contacts.lastName, `%${search}%`), sql`CONCAT(${contacts.firstName}, ' ', ${contacts.lastName}) LIKE ${`%${search}%`}`, like(properties.address, `%${search}%`), like(properties.city, `%${search}%`)));
  if (contractDateFrom) conditions.push(sql`${transactions.contractDate} >= ${contractDateFrom}`);
  if (contractDateTo) conditions.push(sql`${transactions.contractDate} <= ${contractDateTo}`);
  if (closingDateFrom) conditions.push(sql`${transactions.closingDate} >= ${closingDateFrom}`);
  if (closingDateTo) conditions.push(sql`${transactions.closingDate} <= ${closingDateTo}`);
  if (flagNoClosingDate) conditions.push(sql`${transactions.closingDate} IS NULL`);
  if (flagPastClosingDate) conditions.push(sql`${transactions.closingDate} < NOW() AND ${transactions.status} NOT IN ('closed', 'terminated')`);
  if (flagPayoutIntegrity) conditions.push(eq(transactions.payoutIntegrityFlag, true));
  if (leadSourceId) conditions.push(eq(contacts.leadSourceId, leadSourceId));
  if (transactionType) conditions.push(eq(transactions.transactionType, transactionType as any));

  if (marketId) {
    // Filter transactions by agents in the given market
    const db2 = await getDb();
    if (db2) {
      const marketAgents = await db2
        .select({ id: users.id })
        .from(users)
        .where(eq(users.marketProfileId, marketId));
      const marketAgentIds = marketAgents.map((a) => a.id);
      if (marketAgentIds.length > 0) {
        conditions.push(inArray(transactions.agentId, marketAgentIds));
      } else {
        return { rows: [], total: 0, page, limit };
      }
    }
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [countResult, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(transactions).leftJoin(contacts, eq(transactions.primaryContactId, contacts.id)).leftJoin(properties, eq(transactions.propertyId, properties.id)).where(where),
    (() => {
      const txParentLS = aliasedTable(leadSources, 'txParentLS');
      return db.select({ transaction: transactions, agent: users, contact: contacts, property: properties, leadSource: { id: leadSources.id, name: leadSources.name, parentId: leadSources.parentId }, parentLeadSource: { id: txParentLS.id, name: txParentLS.name } })
        .from(transactions)
        .leftJoin(users, eq(transactions.agentId, users.id))
        .leftJoin(contacts, eq(transactions.primaryContactId, contacts.id))
        .leftJoin(properties, eq(transactions.propertyId, properties.id))
        .leftJoin(leadSources, eq(contacts.leadSourceId, leadSources.id))
        .leftJoin(txParentLS, eq(leadSources.parentId, txParentLS.id))
        .where(where)
        .orderBy((() => {
          const d = (col: any) => sortOrder === "asc" ? asc(col) : desc(col);
          switch (sortBy) {
            case "contact": return d(contacts.firstName);
            case "property": return d(properties.address);
            case "agent": return d(users.name);
            case "type": return d(transactions.transactionType);
            case "price": return d(transactions.purchasePrice);
            case "gci": return d(transactions.grossCommissionIncome);
            case "status": return d(transactions.status);
            case "contract_date": return d(transactions.contractDate);
            case "closing_date":
            default: return sortOrder === "asc" ? asc(transactions.closingDate) : desc(transactions.closingDate);
          }
        })())
        .limit(limit)
        .offset(offset);
    })(),
  ]);
  return { rows, total: Number(countResult[0]?.count ?? 0), page, limit };
}

export type TransactionExportFilters = {
  agentId?: number;
  status?: string;
  transactionType?: string;
  search?: string;
  marketId?: number;
  contractDateFrom?: string;
  contractDateTo?: string;
  closingDateFrom?: string;
  closingDateTo?: string;
  flagNoClosingDate?: boolean;
  flagPastClosingDate?: boolean;
  flagPayoutIntegrity?: boolean;
  leadSourceId?: number;
  sortOrder?: "asc" | "desc";
  sortBy?: string;
};

/** Fetches the complete filtered transaction dataset for an admin CSV export. */
export async function getTransactionsForExport(filters: TransactionExportFilters) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters.agentId) conditions.push(eq(transactions.agentId, filters.agentId));
  if (filters.status) conditions.push(eq(transactions.status, filters.status as any));
  if (filters.search) {
    conditions.push(or(
      like(transactions.transactionNumber, `%${filters.search}%`),
      like(contacts.firstName, `%${filters.search}%`),
      like(contacts.lastName, `%${filters.search}%`),
      sql`CONCAT(${contacts.firstName}, ' ', ${contacts.lastName}) LIKE ${`%${filters.search}%`}`,
      like(properties.address, `%${filters.search}%`),
      like(properties.city, `%${filters.search}%`),
    ));
  }
  if (filters.contractDateFrom) conditions.push(sql`${transactions.contractDate} >= ${filters.contractDateFrom}`);
  if (filters.contractDateTo) conditions.push(sql`${transactions.contractDate} <= ${filters.contractDateTo}`);
  if (filters.closingDateFrom) conditions.push(sql`${transactions.closingDate} >= ${filters.closingDateFrom}`);
  if (filters.closingDateTo) conditions.push(sql`${transactions.closingDate} <= ${filters.closingDateTo}`);
  if (filters.flagNoClosingDate) conditions.push(sql`${transactions.closingDate} IS NULL`);
  if (filters.flagPastClosingDate) conditions.push(sql`${transactions.closingDate} < NOW() AND ${transactions.status} NOT IN ('closed', 'terminated')`);
  if (filters.flagPayoutIntegrity) conditions.push(eq(transactions.payoutIntegrityFlag, true));
  if (filters.leadSourceId) conditions.push(eq(contacts.leadSourceId, filters.leadSourceId));
  if (filters.transactionType) conditions.push(eq(transactions.transactionType, filters.transactionType as any));

  if (filters.marketId) {
    const marketAgents = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.marketProfileId, filters.marketId));
    const marketAgentIds = marketAgents.map((agent) => agent.id);
    if (marketAgentIds.length === 0) return [];
    conditions.push(inArray(transactions.agentId, marketAgentIds));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const txParentLS = aliasedTable(leadSources, "exportParentLeadSource");
  const sortOrder = filters.sortOrder ?? "desc";
  const sortBy = filters.sortBy ?? "closing_date";
  const direction = (column: any) => sortOrder === "asc" ? asc(column) : desc(column);
  let orderBy;
  switch (sortBy) {
    case "contact": orderBy = direction(contacts.firstName); break;
    case "property": orderBy = direction(properties.address); break;
    case "agent": orderBy = direction(users.name); break;
    case "type": orderBy = direction(transactions.transactionType); break;
    case "price": orderBy = direction(transactions.purchasePrice); break;
    case "gci": orderBy = direction(transactions.grossCommissionIncome); break;
    case "status": orderBy = direction(transactions.status); break;
    case "contract_date": orderBy = direction(transactions.contractDate); break;
    case "closing_date":
    default: orderBy = direction(transactions.closingDate); break;
  }

  return db
    .select({
      transaction: transactions,
      agent: users,
      contact: contacts,
      property: properties,
      leadSource: { id: leadSources.id, name: leadSources.name, parentId: leadSources.parentId },
      parentLeadSource: { id: txParentLS.id, name: txParentLS.name },
    })
    .from(transactions)
    .leftJoin(users, eq(transactions.agentId, users.id))
    .leftJoin(contacts, eq(transactions.primaryContactId, contacts.id))
    .leftJoin(properties, eq(transactions.propertyId, properties.id))
    .leftJoin(leadSources, eq(contacts.leadSourceId, leadSources.id))
    .leftJoin(txParentLS, eq(leadSources.parentId, txParentLS.id))
    .where(where)
    .orderBy(orderBy);
}

export async function createTransactionExportHistory(data: typeof transactionExports.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(transactionExports).values(data);
  return (result as any).insertId as number;
}

export async function getTransactionExportHistory(page = 1, limit = 20) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0, page, limit };
  const offset = (page - 1) * limit;
  const [countResult, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(transactionExports),
    db
      .select({
        export: transactionExports,
        exportedBy: { id: users.id, name: users.name, email: users.email },
      })
      .from(transactionExports)
      .leftJoin(users, eq(transactionExports.exportedById, users.id))
      .orderBy(desc(transactionExports.createdAt))
      .limit(limit)
      .offset(offset),
  ]);
  return { rows, total: Number(countResult[0]?.count ?? 0), page, limit };
}

export async function getTransactionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const buyerContacts = aliasedTable(contacts, "buyerContacts");
  const result = await db
    .select({ transaction: transactions, agent: users, contact: contacts, property: properties, buyerContact: buyerContacts })
    .from(transactions)
    .leftJoin(users, eq(transactions.agentId, users.id))
    .leftJoin(contacts, eq(transactions.primaryContactId, contacts.id))
    .leftJoin(properties, eq(transactions.propertyId, properties.id))
    .leftJoin(buyerContacts, eq(transactions.buyerContactId, buyerContacts.id))
    .where(eq(transactions.id, id))
    .limit(1);
  return result[0];
}

export async function createTransaction(data: typeof transactions.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(transactions).values(data);
  return (result as any).insertId as number;
}

export async function updateTransaction(id: number, data: Partial<typeof transactions.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(transactions).set(data).where(eq(transactions.id, id));
}

// ─── Transaction Payout Items ─────────────────────────────────────────────────
export async function getPayoutItems(transactionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ payout: transactionPayoutItems, user: users })
    .from(transactionPayoutItems)
    .leftJoin(users, eq(transactionPayoutItems.payeeUserId, users.id))
    .where(eq(transactionPayoutItems.transactionId, transactionId));
}

/**
 * Upsert a payout item by (transactionId, payeeType).
 * If a row with the same transactionId + payeeType already exists and is auto-generated,
 * it is updated in-place rather than duplicated.
 * Override rows (isOverride=true) are never touched by this function.
 */
export async function upsertAutoPayoutItem(data: typeof transactionPayoutItems.$inferInsert): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Check for an existing auto-generated, non-override row with same transactionId + payeeType
  const [existing] = await db
    .select({ id: transactionPayoutItems.id })
    .from(transactionPayoutItems)
    .where(
      and(
        eq(transactionPayoutItems.transactionId, data.transactionId as number),
        eq(transactionPayoutItems.payeeType, data.payeeType as any),
        eq(transactionPayoutItems.isAutoGenerated, true),
        eq(transactionPayoutItems.isOverride, false)
      )
    )
    .limit(1);
  if (existing) {
    // Update the existing row instead of inserting a duplicate
    await db
      .update(transactionPayoutItems)
      .set({
        payeeUserId: data.payeeUserId ?? null,
        payeeName: data.payeeName ?? null,
        percentage: data.percentage,
        commissionType: data.commissionType,
        amount: data.amount,
        referralFeePaidBy: data.referralFeePaidBy ?? null,
        notes: data.notes ?? null,
      } as any)
      .where(eq(transactionPayoutItems.id, existing.id));
    return existing.id;
  }
  // No existing row — plain insert
  const [result] = await db.insert(transactionPayoutItems).values(data);
  return (result as any).insertId as number;
}

export async function createPayoutItem(data: typeof transactionPayoutItems.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(transactionPayoutItems).values(data);
  return (result as any).insertId as number;
}

export async function updatePayoutItem(id: number, data: Partial<typeof transactionPayoutItems.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(transactionPayoutItems).set(data).where(eq(transactionPayoutItems.id, id));
}

export async function deletePayoutItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(transactionPayoutItems).where(eq(transactionPayoutItems.id, id));
}

export async function validatePayoutIntegrity(transactionId: number): Promise<{ valid: boolean; total: number }> {
  const db = await getDb();
  if (!db) return { valid: true, total: 0 };
  const items = await db
    .select({ percentage: transactionPayoutItems.percentage })
    .from(transactionPayoutItems)
    .where(eq(transactionPayoutItems.transactionId, transactionId));
  const total = items.reduce((sum, item) => sum + parseFloat(String(item.percentage)), 0);
  return { valid: total <= 100, total };
}

/**
 * Validates payout integrity AND checks split adherence against the agent's configured rules.
 * Automatically clears the payoutIntegrityFlag when both conditions are met:
 *   1. All payout percentages sum to exactly 100%
 *   2. The payout items match the expected splits for the agent
 *
 * Returns { resolved: true } if the flag was cleared, { resolved: false, reason } if not.
 */
export async function validateAndAutoResolveFlag(
  transactionId: number
): Promise<{ resolved: boolean; reason?: string; total: number }> {
  const db = await getDb();
  if (!db) return { resolved: false, reason: "DB unavailable", total: 0 };

  // 1. Sum all payout percentages
  const items = await db
    .select({
      percentage: transactionPayoutItems.percentage,
      payeeType: transactionPayoutItems.payeeType,
      isOverride: transactionPayoutItems.isOverride,
    })
    .from(transactionPayoutItems)
    .where(eq(transactionPayoutItems.transactionId, transactionId));

  const total = items.reduce((sum, item) => sum + parseFloat(String(item.percentage ?? "0")), 0);
  const rounded = Math.round(total * 100) / 100;

  // Condition 1: must sum to exactly 100%
  if (rounded !== 100) {
    // Still update flag based on whether it exceeds 100
    if (rounded > 100) {
      await updateTransaction(transactionId, {
        payoutIntegrityFlag: true,
        payoutIntegrityNote: `Payout total ${rounded.toFixed(2)}% exceeds 100%`,
      });
    }
    return { resolved: false, reason: `Payout total is ${rounded.toFixed(2)}% (must be exactly 100%)`, total: rounded };
  }

  // 2. Look up the transaction's agent and their configured splits
  const [tx] = await db
    .select({
      agentId: transactions.agentId,
    })
    .from(transactions)
    .where(eq(transactions.id, transactionId));

  if (!tx?.agentId) {
    // No agent — just clear the flag since total is 100%
    await updateTransaction(transactionId, { payoutIntegrityFlag: false, payoutIntegrityNote: null });
    return { resolved: true, total: rounded };
  }

  const [agent] = await db
    .select({ commissionSplit: users.commissionSplit })
    .from(users)
    .where(eq(users.id, tx.agentId));

  if (!agent?.commissionSplit) {
    // Agent has no split configured — just clear the flag since total is 100%
    await updateTransaction(transactionId, { payoutIntegrityFlag: false, payoutIntegrityNote: null });
    return { resolved: true, total: rounded };
  }

  // 3. Check if agent is in a group
  const [membership] = await db
    .select({
      groupId: groupMembers.groupId,
      leaderSplitOverride: groupMembers.leaderSplitOverride,
    })
    .from(groupMembers)
    .where(eq(groupMembers.userId, tx.agentId))
    .limit(1);

  let expectedGroupLeaderSplit: number | null = null;
  if (membership) {
    const [group] = await db
      .select({ leaderCommissionSplit: groups.leaderCommissionSplit })
      .from(groups)
      .where(eq(groups.id, membership.groupId));
    if (group) {
      expectedGroupLeaderSplit = membership.leaderSplitOverride ?? group.leaderCommissionSplit ?? null;
    }
  }

  // 4. Verify split adherence for non-overridden items
  const nonOverrideItems = items.filter((i) => !i.isOverride);
  const agentItem = nonOverrideItems.find((i) => i.payeeType === "agent");
  const leaderItem = nonOverrideItems.find((i) => i.payeeType === "group_leader");

  if (agentItem) {
    const agentPct = parseFloat(String(agentItem.percentage ?? "0"));
    const tolerance = 0.5; // allow small rounding differences
    if (Math.abs(agentPct - agent.commissionSplit) > tolerance) {
      // Agent split doesn't match configured split — flag it
      await updateTransaction(transactionId, {
        payoutIntegrityFlag: true,
        payoutIntegrityNote: `Agent split is ${agentPct}% but configured split is ${agent.commissionSplit}%`,
      });
      return {
        resolved: false,
        reason: `Agent split mismatch: actual ${agentPct}% vs configured ${agent.commissionSplit}%`,
        total: rounded,
      };
    }
  }

  if (leaderItem && expectedGroupLeaderSplit !== null) {
    const leaderPct = parseFloat(String(leaderItem.percentage ?? "0"));
    const tolerance = 0.5;
    if (Math.abs(leaderPct - expectedGroupLeaderSplit) > tolerance) {
      await updateTransaction(transactionId, {
        payoutIntegrityFlag: true,
        payoutIntegrityNote: `Group leader split is ${leaderPct}% but configured split is ${expectedGroupLeaderSplit}%`,
      });
      return {
        resolved: false,
        reason: `Group leader split mismatch: actual ${leaderPct}% vs configured ${expectedGroupLeaderSplit}%`,
        total: rounded,
      };
    }
  }

  // All conditions met — clear the flag
  await updateTransaction(transactionId, { payoutIntegrityFlag: false, payoutIntegrityNote: null });
  return { resolved: true, total: rounded };
}

// ─── Tasks ────────────────────────────────────────────────────────────────────
export async function getTasks(assignedToId?: number, status?: string, relatedContactId?: number, relatedTransactionId?: number, page = 1, limit = 25, dueDateFrom?: Date, dueDateTo?: Date) {
  const offset = (page - 1) * limit;
  const db = await getDb();
  if (!db) return { rows: [], total: 0, page, limit };
  const conditions = [];
  if (assignedToId) conditions.push(eq(tasks.assignedToId, assignedToId));
  if (status) conditions.push(eq(tasks.status, status as any));
  if (relatedContactId) conditions.push(eq(tasks.relatedContactId, relatedContactId));
  if (relatedTransactionId) conditions.push(eq(tasks.relatedTransactionId, relatedTransactionId));
  if (dueDateFrom) conditions.push(gte(tasks.dueDate, dueDateFrom));
  if (dueDateTo) conditions.push(lte(tasks.dueDate, dueDateTo));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [countResult, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(tasks).where(where),
    db.select({ task: tasks, assignedTo: users, contact: contacts })
      .from(tasks)
      .leftJoin(users, eq(tasks.assignedToId, users.id))
      .leftJoin(contacts, eq(tasks.relatedContactId, contacts.id))
      .where(where)
      .orderBy(tasks.dueDate, desc(tasks.createdAt))
      .limit(limit)
      .offset(offset),
  ]);
  return { rows, total: Number(countResult[0]?.count ?? 0), page, limit };
}

export async function getMyOverdueTaskCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const now = new Date();
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(and(
      eq(tasks.assignedToId, userId),
      lte(tasks.dueDate, now),
      eq(tasks.status, "pending"),
    ));
  return Number(result?.count ?? 0);
}
export async function createTask(data: typeof tasks.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(tasks).values(data);
  return (result as any).insertId as number;
}

export async function updateTask(id: number, data: Partial<typeof tasks.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(tasks).set(data).where(eq(tasks.id, id));
}

// ─── Documents ────────────────────────────────────────────────────────────────
export async function getDocuments(filters: { contactId?: number; transactionId?: number; propertyId?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.contactId) conditions.push(eq(documents.relatedContactId, filters.contactId));
  if (filters.transactionId) conditions.push(eq(documents.relatedTransactionId, filters.transactionId));
  if (filters.propertyId) conditions.push(eq(documents.relatedPropertyId, filters.propertyId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return db
    .select({ document: documents, uploadedBy: users })
    .from(documents)
    .leftJoin(users, eq(documents.uploadedById, users.id))
    .where(where)
    .orderBy(desc(documents.createdAt));
}

export async function createDocument(data: typeof documents.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(documents).values(data);
  return (result as any).insertId as number;
}

export async function deleteDocument(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(documents).where(eq(documents.id, id));
}

// ─── Communications ───────────────────────────────────────────────────────────
export async function getCommunications(filters: { contactId?: number; transactionId?: number; agentConnectionId?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.contactId) conditions.push(eq(communications.relatedContactId, filters.contactId));
  if (filters.transactionId) conditions.push(eq(communications.relatedTransactionId, filters.transactionId));
  if (filters.agentConnectionId) conditions.push(eq(communications.relatedAgentConnectionId, filters.agentConnectionId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return db
    .select({ communication: communications, author: users })
    .from(communications)
    .leftJoin(users, eq(communications.authorId, users.id))
    .where(where)
    .orderBy(desc(communications.communicatedAt));
}

export async function createCommunication(data: typeof communications.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(communications).values(data);
  return (result as any).insertId as number;
}

// ─── Groups ───────────────────────────────────────────────────────────────────
export async function getGroups() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ group: groups, leader: users })
    .from(groups)
    .leftJoin(users, eq(groups.leaderId, users.id))
    .orderBy(groups.name);
}

export async function createGroup(data: typeof groups.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(groups).values(data);
  return (result as any).insertId as number;
}

// ─── Activity Log ─────────────────────────────────────────────────────────────
export async function logActivity(data: typeof activityLog.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(activityLog).values(data);
}

export async function getActivityLog(entityType?: string, entityId?: number, limit = 50, contactId?: number) {
  const db = await getDb();
  if (!db) return [];

  // If contactId is provided, fetch a broad history: direct contact logs +
  // logs for tasks, communications, and agent_connections related to this contact
  if (contactId) {
    // Get related entity IDs
    const relatedTasks = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.relatedContactId, contactId));
    const relatedComms = await db
      .select({ id: communications.id })
      .from(communications)
      .where(eq(communications.relatedContactId, contactId));
    const relatedConns = await db
      .select({ id: agentConnections.id })
      .from(agentConnections)
      .where(eq(agentConnections.contactId, contactId));

    const taskIds = relatedTasks.map((t) => t.id);
    const commIds = relatedComms.map((c) => c.id);
    const connIds = relatedConns.map((c) => c.id);

    const orConditions = [
      and(eq(activityLog.entityType, "contact"), eq(activityLog.entityId, contactId)),
      ...(taskIds.length > 0 ? [and(eq(activityLog.entityType, "task"), inArray(activityLog.entityId, taskIds))] : []),
      ...(commIds.length > 0 ? [and(eq(activityLog.entityType, "communication"), inArray(activityLog.entityId, commIds))] : []),
      ...(connIds.length > 0 ? [and(eq(activityLog.entityType, "agent_connection"), inArray(activityLog.entityId, connIds))] : []),
    ];

    return db
      .select({ log: activityLog, user: users })
      .from(activityLog)
      .leftJoin(users, eq(activityLog.userId, users.id))
      .where(or(...orConditions))
      .orderBy(desc(activityLog.createdAt))
      .limit(limit);
  }

  const conditions = [];
  if (entityType) conditions.push(eq(activityLog.entityType, entityType));
  if (entityId) conditions.push(eq(activityLog.entityId, entityId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return db
    .select({ log: activityLog, user: users })
    .from(activityLog)
    .leftJoin(users, eq(activityLog.userId, users.id))
    .where(where)
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
}

// ─── Analytics ────────────────────────────────────────────────────────────────
export async function getAnalyticsOverview() {
  const db = await getDb();
  if (!db) return null;

  const [totalContacts] = await db.select({ count: sql<number>`COUNT(*)` }).from(contacts);
  const [totalTransactions] = await db.select({ count: sql<number>`COUNT(*)` }).from(transactions);
  const [closedTransactions] = await db
    .select({ count: sql<number>`COUNT(*)`, revenue: sql<number>`SUM(grossCommissionIncome)` })
    .from(transactions)
    .where(eq(transactions.status, "closed"));
  const [activePipeline] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(transactions)
    .where(eq(transactions.status, "under_contract"));
  const [pendingTasks] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(tasks)
    .where(eq(tasks.status, "pending"));

  return {
    totalContacts: totalContacts?.count ?? 0,
    totalTransactions: totalTransactions?.count ?? 0,
    closedTransactions: closedTransactions?.count ?? 0,
    totalRevenue: closedTransactions?.revenue ?? 0,
    activePipeline: activePipeline?.count ?? 0,
    pendingTasks: pendingTasks?.count ?? 0,
  };
}

export async function getAgentPerformance() {
  const db = await getDb();
  if (!db) return [];
  // Get transaction-based stats
  const txStats = await db
    .select({
      agent: users,
      closedCount: sql<number>`COUNT(CASE WHEN ${transactions.status} = 'closed' THEN 1 END)`,
      totalGCI: sql<number>`SUM(CASE WHEN ${transactions.status} = 'closed' THEN ${transactions.grossCommissionIncome} ELSE 0 END)`,
      activeCount: sql<number>`COUNT(CASE WHEN ${transactions.status} = 'under_contract' THEN 1 END)`,
    })
    .from(users)
    .leftJoin(transactions, eq(transactions.agentId, users.id))
    .where(eq(users.role, "agent"))
    .groupBy(users.id)
    .orderBy(sql`SUM(CASE WHEN ${transactions.status} = 'closed' THEN ${transactions.grossCommissionIncome} ELSE 0 END) DESC`);

  // Get pipeline contact counts per agent
  const pipelineCounts = await db
    .select({
      agentId: agentConnections.agentId,
      pipelineContacts: sql<number>`COUNT(*)`,
    })
    .from(agentConnections)
    .where(isNotNull(agentConnections.agentId))
    .groupBy(agentConnections.agentId);

  const pipelineMap = new Map(pipelineCounts.map(p => [p.agentId, p.pipelineContacts]));

  return txStats.map(row => ({
    ...row,
    pipelineContacts: pipelineMap.get(row.agent.id) ?? 0,
  }));
}

export async function getPipelineByStatus() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      status: agentConnections.pipelineStatus,
      count: sql<number>`COUNT(*)`,
    })
    .from(agentConnections)
    .groupBy(agentConnections.pipelineStatus);
}

export async function getMonthlyRevenue(months = 12) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      month: sql<string>`DATE_FORMAT(closingDate, '%Y-%m')`,
      revenue: sql<number>`SUM(grossCommissionIncome)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .where(and(eq(transactions.status, "closed"), sql`closingDate >= DATE_SUB(NOW(), INTERVAL ${months} MONTH)`))
    .groupBy(sql`DATE_FORMAT(closingDate, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(closingDate, '%Y-%m')`);
}

export async function getLeadSourceBreakdown() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      source: contacts.leadSourceType,
      count: sql<number>`COUNT(*)`,
    })
    .from(contacts)
    .groupBy(contacts.leadSourceType);
}

// ─── User Management ──────────────────────────────────────────────────────────
export async function createUser(data: { name: string; email: string; role: "admin" | "agent" | "isa" | "agent_support"; phone?: string | null; title?: string | null; reportsToId?: number | null; marketProfileId?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Generate a placeholder openId so the user can be created before they log in
  const openId = `manual_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const [result] = await db.insert(users).values({
    openId,
    name: data.name,
    email: data.email,
    role: data.role,
    phone: data.phone ?? null,
    title: data.title ?? null,
    reportsToId: data.reportsToId ?? null,
    marketProfileId: data.marketProfileId ?? null,
    loginMethod: "manual",
    lastSignedIn: new Date(),
  });
  return (result as any).insertId as number;
}

export async function updateUser(id: number, data: { name?: string; email?: string; role?: "admin" | "agent" | "isa" | "agent_support"; phone?: string | null; title?: string | null; reportsToId?: number | null; marketProfileId?: number | null; isActive?: boolean; allowHiddenNav?: boolean; commissionSplit?: number | null; callBookingLink?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(users).set(data).where(eq(users.id, id));
}

export async function deleteUser(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(users).where(eq(users.id, id));
}

// ─── Groups ───────────────────────────────────────────────────────────────────
export async function updateGroup(id: number, data: Partial<typeof groups.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(groups).set(data).where(eq(groups.id, id));
}

export async function deleteGroup(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(groupMembers).where(eq(groupMembers.groupId, id));
  await db.delete(groups).where(eq(groups.id, id));
}

export async function getGroupMembers(groupId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ member: groupMembers, user: users })
    .from(groupMembers)
    .leftJoin(users, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, groupId));
}

export async function addGroupMember(groupId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(groupMembers).values({ groupId, userId }).onDuplicateKeyUpdate({ set: { groupId } });
}

export async function removeGroupMember(groupId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
}

/** Returns the groupMembers row if the user is already a member of any group, otherwise undefined. */
export async function getAgentGroupMembership(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .limit(1);
  return result[0];
}

/** Returns the groups row if the user is already a leader of any group, otherwise undefined. */
export async function getAgentGroupLeadership(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(groups)
    .where(eq(groups.leaderId, userId))
    .limit(1);
  return result[0];
}

// ─── All Payout Items (admin report) ─────────────────────────────────────────
export async function getAllPayoutItems(filters?: { agentId?: number; payeeUserId?: number; paid?: boolean; payeeType?: string; dateFrom?: Date; dateTo?: Date; sortOrder?: "asc" | "desc" }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.paid !== undefined) conditions.push(eq(transactionPayoutItems.isPaid, filters.paid));
  if (filters?.payeeUserId !== undefined) conditions.push(eq(transactionPayoutItems.payeeUserId, filters.payeeUserId));
  if (filters?.payeeType !== undefined) conditions.push(eq(transactionPayoutItems.payeeType, filters.payeeType as any));
  if (filters?.agentId !== undefined) conditions.push(eq(transactions.agentId, filters.agentId));
  if (filters?.dateFrom !== undefined) conditions.push(gte(transactions.closingDate, filters.dateFrom));
  if (filters?.dateTo !== undefined) conditions.push(lte(transactions.closingDate, filters.dateTo));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const payeeUserAlias = aliasedTable(users, "payeeUser");
  const txAgentAlias = aliasedTable(users, "txAgent");
  return db
    .select({
      payout: transactionPayoutItems,
      transaction: {
        id: transactions.id,
        transactionNumber: transactions.transactionNumber,
        status: transactions.status,
        closingDate: transactions.closingDate,
        salePrice: transactions.purchasePrice,
        agentId: transactions.agentId,
        grossCommissionIncome: transactions.grossCommissionIncome,
        transactionType: transactions.transactionType,
      },
      contact: {
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      },
      property: {
        id: properties.id,
        address: properties.address,
        city: properties.city,
        state: properties.state,
      },
      payeeUser: {
        id: payeeUserAlias.id,
        name: payeeUserAlias.name,
      },
      txAgent: {
        id: txAgentAlias.id,
        name: txAgentAlias.name,
      },
    })
    .from(transactionPayoutItems)
    .leftJoin(transactions, eq(transactionPayoutItems.transactionId, transactions.id))
    .leftJoin(contacts, eq(transactions.primaryContactId, contacts.id))
    .leftJoin(properties, eq(transactions.propertyId, properties.id))
    .leftJoin(payeeUserAlias, eq(transactionPayoutItems.payeeUserId, payeeUserAlias.id))
    .leftJoin(txAgentAlias, eq(transactions.agentId, txAgentAlias.id))
    .where(where)
    .orderBy((filters?.sortOrder ?? "desc") === "asc" ? asc(contacts.firstName) : desc(transactionPayoutItems.createdAt));
}

// ─── Listings ────────────────────────────────────────────────────────────────
export async function getListings(opts?: {
  agentId?: number; status?: string; search?: string;
  listingDateFrom?: string; listingDateTo?: string;
  sortOrder?: "asc" | "desc";
  expirationDateFrom?: string; expirationDateTo?: string;
  terminationDateFrom?: string; terminationDateTo?: string;
  filterAgentId?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const { agentId, status, search, listingDateFrom, listingDateTo, expirationDateFrom, expirationDateTo, terminationDateFrom, terminationDateTo, filterAgentId } = opts || {};
  const conditions: any[] = [];
  if (agentId) conditions.push(eq(listings.agentId, agentId));
  if (filterAgentId) conditions.push(eq(listings.agentId, filterAgentId));
  if (status) conditions.push(eq(listings.listingStatus, status as any));
  if (search) {
    conditions.push(
      or(
        like(listings.mlsNumber, `%${search}%`),
        like(properties.address, `%${search}%`),
        like(properties.city, `%${search}%`)
      )
    );
  }
  if (listingDateFrom) conditions.push(gte(listings.listDate, listingDateFrom));
  if (listingDateTo) conditions.push(lte(listings.listDate, listingDateTo));
  if (expirationDateFrom) conditions.push(gte(listings.expirationDate, expirationDateFrom));
  if (expirationDateTo) conditions.push(lte(listings.expirationDate, expirationDateTo));
  if (terminationDateFrom) conditions.push(gte(listings.terminationDate, terminationDateFrom));
  if (terminationDateTo) conditions.push(lte(listings.terminationDate, terminationDateTo));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
   const agentAlias = aliasedTable(users, "listingAgent");
  const contactAlias = aliasedTable(contacts, "listingContact");
  return db
    .select({ listing: listings, agent: agentAlias, property: properties, contact: contactAlias })
    .from(listings)
    .leftJoin(agentAlias, eq(listings.agentId, agentAlias.id))
    .leftJoin(properties, eq(listings.propertyId, properties.id))
    .leftJoin(contactAlias, eq(listings.contactId, contactAlias.id))
    .where(where)
    .orderBy((opts?.sortOrder ?? "desc") === "asc" ? asc(properties.address) : desc(listings.updatedAt));
}
export async function getListingById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const agentAlias = aliasedTable(users, "listingAgent");
  const contactAlias = aliasedTable(contacts, "listingContact");
  const result = await db
    .select({ listing: listings, agent: agentAlias, property: properties, contact: contactAlias })
    .from(listings)
    .leftJoin(agentAlias, eq(listings.agentId, agentAlias.id))
    .leftJoin(properties, eq(listings.propertyId, properties.id))
    .leftJoin(contactAlias, eq(listings.contactId, contactAlias.id))
    .where(eq(listings.id, id))
    .limit(1);
  return result[0];
}

export async function createListing(data: typeof listings.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(listings).values(data);
  return (result as any).insertId as number;
}

export async function updateListing(id: number, data: Partial<typeof listings.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(listings).set(data).where(eq(listings.id, id));
}

export async function deleteListing(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(listings).where(eq(listings.id, id));
}

// ─── Contact Counts ──────────────────────────────────────────────────────────
export async function getContactCounts(contactId: number) {
  const db = await getDb();
  if (!db) return { properties: 0, transactions: 0, pendingTasks: 0 };
  const [propCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(contactProperties).where(eq(contactProperties.contactId, contactId));
  const [txCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(transactions).where(eq(transactions.primaryContactId, contactId));
  const [taskCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(tasks).where(and(eq(tasks.relatedContactId, contactId), sql`${tasks.status} NOT IN ('completed','cancelled')`));
  return {
    properties: propCount?.count ?? 0,
    transactions: txCount?.count ?? 0,
    pendingTasks: taskCount?.count ?? 0,
  };
}

// ─── Tasks: getAllTasks with assignedTo filter ───────────────────────────────
export async function getAllTasks(filters?: { status?: string; assignedToId?: number; createdFrom?: Date; createdTo?: Date; page?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };
  const conditions: any[] = [];
  if (filters?.status) conditions.push(eq(tasks.status, filters.status as any));
  if (filters?.assignedToId) conditions.push(eq(tasks.assignedToId, filters.assignedToId));
  if (filters?.createdFrom) conditions.push(gte(tasks.createdAt, filters.createdFrom));
  if (filters?.createdTo) conditions.push(lte(tasks.createdAt, filters.createdTo));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 50;
  const offset = (page - 1) * limit;
  const [rows, countRows] = await Promise.all([
    db
      .select({ task: tasks, assignedTo: users, contact: contacts })
      .from(tasks)
      .leftJoin(users, eq(tasks.assignedToId, users.id))
      .leftJoin(contacts, eq(tasks.relatedContactId, contacts.id))
      .where(where)
      .orderBy(tasks.dueDate, desc(tasks.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tasks)
      .where(where),
  ]);
  return { rows, total: Number(countRows[0]?.count ?? 0) };
}

// ─── Deep Analytics ───────────────────────────────────────────────────────────

/** Lead source funnel: for each lead source, count contacts, active clients, and closed transactions */
export async function getLeadSourceFunnel(dateFrom?: Date, dateTo?: Date, agentId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (dateFrom) conditions.push(gte(contacts.createdAt, dateFrom));
  if (dateTo) conditions.push(lte(contacts.createdAt, dateTo));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Contacts per lead source (with source name)
  let contactQuery = db
    .select({
      leadSourceId: contacts.leadSourceId,
      sourceName: leadSources.name,
      parentId: leadSources.parentId,
      contactCount: sql<number>`COUNT(DISTINCT ${contacts.id})`,
    })
    .from(contacts)
    .leftJoin(leadSources, eq(contacts.leadSourceId, leadSources.id));
  if (agentId) {
    (contactQuery as any) = (contactQuery as any).innerJoin(agentConnections, and(eq(agentConnections.contactId, contacts.id), eq(agentConnections.agentId, agentId)));
  }
  const contactRows: Array<{ leadSourceId: number | null; sourceName: string | null; parentId: number | null; contactCount: number }> = await (contactQuery as any).where(where).groupBy(contacts.leadSourceId, leadSources.name, leadSources.parentId);

  // Closed transactions per lead source
  const closedConditions: any[] = [eq(transactions.primaryContactId, contacts.id), eq(transactions.status, "closed")];
  if (agentId) closedConditions.push(eq(transactions.agentId, agentId));
  const closedRows = await db
    .select({
      leadSourceId: contacts.leadSourceId,
      closedCount: sql<number>`COUNT(DISTINCT ${transactions.id})`,
      totalGci: sql<number>`SUM(${transactions.grossCommissionIncome})`,
    })
    .from(contacts)
    .innerJoin(transactions, and(...closedConditions))
    .groupBy(contacts.leadSourceId);

  // Active pipeline per lead source
  const activeConditions: any[] = [eq(agentConnections.contactId, contacts.id), sql`${agentConnections.pipelineStatus} IN ('active_client','under_contract')`];
  if (agentId) activeConditions.push(eq(agentConnections.agentId, agentId));
  const activeRows = await db
    .select({
      leadSourceId: contacts.leadSourceId,
      activeCount: sql<number>`COUNT(DISTINCT ${agentConnections.id})`,
    })
    .from(contacts)
    .innerJoin(agentConnections, and(...activeConditions))
    .groupBy(contacts.leadSourceId);

  const closedMap = new Map(closedRows.map(r => [r.leadSourceId, r]));
  const activeMap = new Map(activeRows.map(r => [r.leadSourceId, r]));

  return contactRows.map(r => ({
    leadSourceId: r.leadSourceId,
    sourceName: r.sourceName ?? "Unknown",
    parentId: r.parentId,
    contactCount: Number(r.contactCount),
    activeCount: Number(activeMap.get(r.leadSourceId)?.activeCount ?? 0),
    closedCount: Number(closedMap.get(r.leadSourceId)?.closedCount ?? 0),
    totalGci: Number(closedMap.get(r.leadSourceId)?.totalGci ?? 0),
    conversionRate: r.contactCount > 0
      ? Math.round((Number(closedMap.get(r.leadSourceId)?.closedCount ?? 0) / Number(r.contactCount)) * 1000) / 10
      : 0,
  }));
}

/** Agent production: GCI, closed deals, avg days to close, pipeline count per agent with month trend */
export async function getAgentProduction(dateFrom?: Date, dateTo?: Date) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(transactions.status, "closed")];
  if (dateFrom) conditions.push(gte(transactions.closingDate, dateFrom));
  if (dateTo) conditions.push(lte(transactions.closingDate, dateTo));

  const rows = await db
    .select({
      agentId: users.id,
      agentName: users.name,
      closedDeals: sql<number>`COUNT(DISTINCT ${transactions.id})`,
      totalGci: sql<number>`SUM(${transactions.grossCommissionIncome})`,
      avgDaysToClose: sql<number>`AVG(DATEDIFF(${transactions.closingDate}, ${transactions.contractDate}))`,
      avgPurchasePrice: sql<number>`AVG(${transactions.purchasePrice})`,
    })
    .from(users)
    .leftJoin(transactions, and(eq(transactions.agentId, users.id), ...conditions))
    .where(sql`${users.role} = 'agent' AND ${users.isActive} = true`)
    .groupBy(users.id, users.name)
    .orderBy(sql`SUM(${transactions.grossCommissionIncome}) DESC`);

  // Pipeline counts per agent
  const pipelineRows = await db
    .select({
      agentId: agentConnections.agentId,
      pipelineCount: sql<number>`COUNT(*)`,
    })
    .from(agentConnections)
    .where(sql`${agentConnections.pipelineStatus} NOT IN ('closed','dead')`)
    .groupBy(agentConnections.agentId);

  const pipelineMap = new Map(pipelineRows.map(r => [r.agentId, Number(r.pipelineCount)]));

  return rows.map(r => ({
    agentId: r.agentId,
    agentName: r.agentName ?? "Unknown",
    closedDeals: Number(r.closedDeals),
    totalGci: Number(r.totalGci ?? 0),
    avgDaysToClose: r.avgDaysToClose ? Math.round(Number(r.avgDaysToClose)) : null,
    avgPurchasePrice: Number(r.avgPurchasePrice ?? 0),
    activePipeline: pipelineMap.get(r.agentId) ?? 0,
  }));
}

/** ISA performance: leads assigned, contacted, converted to active, conversion rate */
export async function getIsaPerformance(dateFrom?: Date, dateTo?: Date) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (dateFrom) conditions.push(gte(contacts.createdAt, dateFrom));
  if (dateTo) conditions.push(lte(contacts.createdAt, dateTo));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const assignedRows = await db
    .select({
      isaId: contacts.assignedIsaId,
      isaName: users.name,
      leadsAssigned: sql<number>`COUNT(DISTINCT ${contacts.id})`,
    })
    .from(contacts)
    .leftJoin(users, eq(contacts.assignedIsaId, users.id))
    .where(where)
    .groupBy(contacts.assignedIsaId, users.name);

  const convertedRows = await db
    .select({
      isaId: contacts.assignedIsaId,
      converted: sql<number>`COUNT(DISTINCT ${agentConnections.id})`,
    })
    .from(contacts)
    .innerJoin(agentConnections, and(
      eq(agentConnections.contactId, contacts.id),
      sql`${agentConnections.pipelineStatus} IN ('active_client','under_contract','closed')`
    ))
    .groupBy(contacts.assignedIsaId);

  const convertedMap = new Map(convertedRows.map(r => [r.isaId, Number(r.converted)]));

  return assignedRows
    .filter(r => r.isaId !== null)
    .map(r => ({
      isaId: r.isaId,
      isaName: r.isaName ?? "Unknown",
      leadsAssigned: Number(r.leadsAssigned),
      converted: convertedMap.get(r.isaId!) ?? 0,
      conversionRate: r.leadsAssigned > 0
        ? Math.round(((convertedMap.get(r.isaId!) ?? 0) / Number(r.leadsAssigned)) * 1000) / 10
        : 0,
    }));
}

/** Monthly GCI trend with deal count and avg price, filterable by agent */
export async function getMonthlyGciTrend(months = 12, agentId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [
    eq(transactions.status, "closed"),
    sql`${transactions.closingDate} >= DATE_SUB(NOW(), INTERVAL ${months} MONTH)`,
  ];
  if (agentId) conditions.push(eq(transactions.agentId, agentId));
  return db
    .select({
      month: sql<string>`DATE_FORMAT(${transactions.closingDate}, '%Y-%m')`,
      gci: sql<number>`SUM(${transactions.grossCommissionIncome})`,
      deals: sql<number>`COUNT(*)`,
      avgPrice: sql<number>`AVG(${transactions.purchasePrice})`,
    })
    .from(transactions)
    .where(and(...conditions))
    .groupBy(sql`DATE_FORMAT(closingDate, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(closingDate, '%Y-%m')`);
}

/** Agent-specific lead source breakdown */
export async function getAgentLeadSourceBreakdown(agentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      source: contacts.leadSourceType,
      count: sql<number>`COUNT(DISTINCT ${contacts.id})`,
    })
    .from(agentConnections)
    .innerJoin(contacts, eq(agentConnections.contactId, contacts.id))
    .where(eq(agentConnections.agentId, agentId))
    .groupBy(contacts.leadSourceType);
}

/** Agent-specific transaction type breakdown */
export async function getAgentTransactionTypeBreakdown(agentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      type: transactions.transactionType,
      count: sql<number>`COUNT(*)`,
      totalGci: sql<number>`SUM(${transactions.grossCommissionIncome})`,
    })
    .from(transactions)
    .where(and(eq(transactions.agentId, agentId), eq(transactions.status, "closed")))
    .groupBy(transactions.transactionType);
}

/** Pipeline velocity: avg days per stage transition */
export async function getPipelineVelocity() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      status: agentConnections.pipelineStatus,
      count: sql<number>`COUNT(*)`,
    })
    .from(agentConnections)
    .groupBy(agentConnections.pipelineStatus)
    .orderBy(agentConnections.pipelineStatus);
}

/** Transaction type breakdown: buyer vs seller */
export async function getTransactionTypeBreakdown(dateFrom?: Date, dateTo?: Date) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(transactions.status, "closed")];
  if (dateFrom) conditions.push(gte(transactions.closingDate, dateFrom));
  if (dateTo) conditions.push(lte(transactions.closingDate, dateTo));
  return db
    .select({
      type: transactions.transactionType,
      count: sql<number>`COUNT(*)`,
      totalGci: sql<number>`SUM(${transactions.grossCommissionIncome})`,
    })
    .from(transactions)
    .where(and(...conditions))
    .groupBy(transactions.transactionType);
}



// ─── Listing Notes ─────────────────────────────────────────────────────────────
export async function getListingNotes(listingId: number) {
  const db = await getDb();
  if (!db) return [];
  const authorAlias = aliasedTable(users, "author");
  return db
    .select({ note: listingNotes, author: authorAlias })
    .from(listingNotes)
    .leftJoin(authorAlias, eq(listingNotes.authorId, authorAlias.id))
    .where(eq(listingNotes.listingId, listingId))
    .orderBy(desc(listingNotes.createdAt));
}

export async function createListingNote(data: { listingId: number; authorId: number; content: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(listingNotes).values(data);
  return (result as any).insertId as number;
}

// ─── Transaction Documents ─────────────────────────────────────────────────────
export async function getTransactionDocuments(transactionId: number) {
  const db = await getDb();
  if (!db) return [];
  const uploaderAlias = aliasedTable(users, "uploader");
  return db
    .select({ doc: transactionDocuments, uploader: uploaderAlias })
    .from(transactionDocuments)
    .leftJoin(uploaderAlias, eq(transactionDocuments.uploadedBy, uploaderAlias.id))
    .where(eq(transactionDocuments.transactionId, transactionId))
    .orderBy(desc(transactionDocuments.createdAt));
}

export async function createTransactionDocument(data: typeof transactionDocuments.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(transactionDocuments).values(data);
  return (result as any).insertId as number;
}

export async function renameTransactionDocument(id: number, fileName: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(transactionDocuments).set({ fileName }).where(eq(transactionDocuments.id, id));
}

export async function deleteTransactionDocument(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(transactionDocuments).where(eq(transactionDocuments.id, id));
}

// ─── Transaction Notes ─────────────────────────────────────────────────────────
export async function getTransactionNotes(transactionId: number) {
  const db = await getDb();
  if (!db) return [];
  const authorAlias = aliasedTable(users, "txNoteAuthor");
  return db
    .select({ note: transactionNotes, author: authorAlias })
    .from(transactionNotes)
    .leftJoin(authorAlias, eq(transactionNotes.authorId, authorAlias.id))
    .where(eq(transactionNotes.transactionId, transactionId))
    .orderBy(desc(transactionNotes.createdAt));
}

export async function createTransactionNote(data: { transactionId: number; authorId: number; content: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(transactionNotes).values(data);
  return (result as any).insertId as number;
}

// ─── ISA Status Funnel ─────────────────────────────────────────────────────────
/** ISA pipeline status funnel: count of contacts per stage, optionally filtered by ISA */
export async function getIsaStatusFunnel(isaId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [sql`${contacts.isaStatus} IS NOT NULL`];
  if (isaId) conditions.push(eq(contacts.assignedIsaId, isaId));
  const rows = await db
    .select({
      isaStatus: contacts.isaStatus,
      count: sql<number>`COUNT(*)`,
    })
    .from(contacts)
    .where(and(...conditions))
    .groupBy(contacts.isaStatus);
  return rows.map(r => ({ isaStatus: r.isaStatus, count: Number(r.count) }));
}

/** ISA status funnel broken down by ISA (for admin view) */
export async function getIsaStatusFunnelByIsa() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      isaId: contacts.assignedIsaId,
      isaName: users.name,
      isaStatus: contacts.isaStatus,
      count: sql<number>`COUNT(*)`,
    })
    .from(contacts)
    .leftJoin(users, eq(contacts.assignedIsaId, users.id))
    .where(sql`${contacts.isaStatus} IS NOT NULL AND ${contacts.assignedIsaId} IS NOT NULL`)
    .groupBy(contacts.assignedIsaId, users.name, contacts.isaStatus);
  return rows.map(r => ({
    isaId: r.isaId,
    isaName: r.isaName ?? "Unknown",
    isaStatus: r.isaStatus,
    count: Number(r.count),
  }));
}


// ─── Market Performance Analytics ────────────────────────────────────────────

export async function getMarketPerformance() {
  const db = await getDb();
  if (!db) return [];
  // Get all markets with their agent counts, transaction counts, total GCI, and closed deals
  const rows = await db
    .select({
      marketId: marketProfiles.id,
      marketName: marketProfiles.name,
      agentCount: sql<number>`COUNT(DISTINCT ${users.id})`,
      totalTransactions: sql<number>`COUNT(DISTINCT ${transactions.id})`,
      closedDeals: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'closed' THEN ${transactions.id} END)`,
      activeDeals: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'under_contract' THEN ${transactions.id} END)`,
      totalGci: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' THEN CAST(${transactions.grossCommissionIncome} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
      totalVolume: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' THEN CAST(${transactions.purchasePrice} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
      avgDealSize: sql<string>`COALESCE(AVG(CASE WHEN ${transactions.status} = 'closed' THEN CAST(${transactions.purchasePrice} AS DECIMAL(15,2)) END), 0)`,
      annualGciGoal: marketProfiles.annualGciGoal,
    })
    .from(marketProfiles)
    .leftJoin(users, eq(users.marketProfileId, marketProfiles.id))
    .leftJoin(transactions, eq(transactions.agentId, users.id))
    .groupBy(marketProfiles.id, marketProfiles.name, marketProfiles.annualGciGoal)
    .orderBy(desc(sql`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' THEN CAST(${transactions.grossCommissionIncome} AS DECIMAL(15,2)) ELSE 0 END), 0)`));
  return rows.map(r => ({
      marketId: r.marketId,
    marketName: r.marketName,
    agentCount: Number(r.agentCount),
    totalTransactions: Number(r.totalTransactions),
    closedDeals: Number(r.closedDeals),
    activeDeals: Number(r.activeDeals),
    totalGci: Number(r.totalGci),
    totalVolume: Number(r.totalVolume),
    avgDealSize: Number(r.avgDealSize),
    annualGciGoal: r.annualGciGoal != null ? Number(r.annualGciGoal) : null,
  }));
}

export async function getMarketMonthlyTrend(months = 12) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      marketId: marketProfiles.id,
      marketName: marketProfiles.name,
      month: sql<string>`DATE_FORMAT(${transactions.closingDate}, '%Y-%m')`,
      gci: sql<string>`COALESCE(SUM(CAST(${transactions.grossCommissionIncome} AS DECIMAL(15,2))), 0)`,
      deals: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .innerJoin(users, eq(transactions.agentId, users.id))
    .innerJoin(marketProfiles, eq(users.marketProfileId, marketProfiles.id))
    .where(
      and(
        eq(transactions.status, "closed" as any),
        sql`${transactions.closingDate} >= DATE_SUB(CURDATE(), INTERVAL ${months} MONTH)`
      )
    )
    .groupBy(marketProfiles.id, marketProfiles.name, sql`DATE_FORMAT(closingDate, '%Y-%m')`)
    .orderBy(sql`month`);
  return rows.map(r => ({
    marketId: r.marketId,
    marketName: r.marketName,
    month: r.month,
    gci: Number(r.gci),
    deals: Number(r.deals),
  }));
}

export async function getMarketAgentLeaderboard(marketId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      agentId: users.id,
      agentName: users.name,
      closedDeals: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'closed' THEN ${transactions.id} END)`,
      totalGci: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' THEN CAST(${transactions.grossCommissionIncome} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
      activeDeals: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'under_contract' THEN ${transactions.id} END)`,
      contactCount: sql<number>`(SELECT COUNT(DISTINCT ${agentConnections.contactId}) FROM ${agentConnections} WHERE ${agentConnections.agentId} = ${users.id})`,
    })
    .from(users)
    .leftJoin(transactions, eq(transactions.agentId, users.id))
    .where(eq(users.marketProfileId, marketId))
    .groupBy(users.id, users.name)
    .orderBy(desc(sql`totalGci`));
  return rows.map(r => ({
    agentId: r.agentId,
    agentName: r.agentName ?? "Unknown",
    closedDeals: Number(r.closedDeals),
    totalGci: Number(r.totalGci),
    activeDeals: Number(r.activeDeals),
    contactCount: Number(r.contactCount),
  }));
}


// ─── Feedback (Bug Reports / Feature Requests) ──────────────────────────────

export async function getFeedback(status?: string, type?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (status) conditions.push(eq(feedback.status, status as any));
  if (type) conditions.push(eq(feedback.type, type as any));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return db
    .select({ feedback, user: users })
    .from(feedback)
    .leftJoin(users, eq(feedback.userId, users.id))
    .where(where)
    .orderBy(desc(feedback.createdAt));
}

export async function getFeedbackByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(feedback)
    .where(eq(feedback.userId, userId))
    .orderBy(desc(feedback.createdAt));
}

export async function createFeedback(data: { type: "bug" | "feature"; title: string; description: string; userId: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(feedback).values(data);
  return (result as any).insertId as number;
}

export async function updateFeedbackStatus(id: number, status: string, adminNotes?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const data: any = { status };
  if (adminNotes !== undefined) data.adminNotes = adminNotes;
  await db.update(feedback).set(data).where(eq(feedback.id, id));
}

export async function getFeedbackCount(status?: string) {
  const db = await getDb();
  if (!db) return 0;
  const conditions = status ? [eq(feedback.status, status as any)] : [];
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [result] = await db.select({ count: sql<number>`COUNT(*)` }).from(feedback).where(where);
  return Number(result?.count ?? 0);
}

// ─── Task Notes ──────────────────────────────────────────────────────────────

export async function getTaskNotes(taskId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ note: taskNotes, author: users })
    .from(taskNotes)
    .leftJoin(users, eq(taskNotes.authorId, users.id))
    .where(eq(taskNotes.taskId, taskId))
    .orderBy(desc(taskNotes.createdAt));
}

export async function createTaskNote(data: { taskId: number; authorId: number; content: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(taskNotes).values(data);
  return (result as any).insertId as number;
}

// ─── Get Task By ID ──────────────────────────────────────────────────────────
export async function getTaskById(taskId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      task: tasks,
      assignedTo: { id: users.id, name: users.name, email: users.email, role: users.role },
      contact: { id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName },
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assignedToId, users.id))
    .leftJoin(contacts, eq(tasks.relatedContactId, contacts.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Executive Dashboard Analytics ───────────────────────────────────────────
export async function getExecutiveDashboard(filters?: {
  dateFrom?: Date;
  dateTo?: Date;
  marketId?: number;
  agentId?: number;
}) {
  const db = await getDb();
  if (!db) return null;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const buildTxWhere = (from?: Date, to?: Date, statusFilter = "closed") => {
    const conds: any[] = [eq(transactions.status, statusFilter as any)];
    if (from) conds.push(gte(transactions.closingDate, from));
    if (to) conds.push(lte(transactions.closingDate, to));
    // marketId filter applied via agentId scope
    if (filters?.agentId) conds.push(eq(transactions.agentId, filters.agentId));
    return and(...conds);
  };
  const getClosedMetrics = async (from?: Date, to?: Date) => {
    const [r] = await db!.select({
      count: sql<number>`COUNT(*)`,
      volume: sql<number>`COALESCE(SUM(purchasePrice), 0)`,
      gci: sql<number>`COALESCE(SUM(grossCommissionIncome), 0)`,
      avgPrice: sql<number>`COALESCE(AVG(purchasePrice), 0)`,
    }).from(transactions).where(buildTxWhere(from, to));
    return { closings: Number(r.count), volume: Number(r.volume), gci: Number(r.gci), avgPrice: Number(r.avgPrice) };
  };
  const [mtd, ytd, rangeMetrics] = await Promise.all([
    getClosedMetrics(startOfMonth),
    getClosedMetrics(startOfYear),
    getClosedMetrics(filters?.dateFrom, filters?.dateTo),
  ]);
  const pipelineConds: any[] = [eq(transactions.status, "under_contract" as any)];
  // marketId filter applied via agentId scope
  if (filters?.agentId) pipelineConds.push(eq(transactions.agentId, filters.agentId));
  const [pipeline] = await db.select({
    count: sql<number>`COUNT(*)`,
    value: sql<number>`COALESCE(SUM(purchasePrice), 0)`,
  }).from(transactions).where(and(...pipelineConds));
  const [totalLeads] = await db.select({ count: sql<number>`COUNT(*)` }).from(contacts);
  const contractConds: any[] = [sql`status IN ('under_contract', 'closed')`];
  if (filters?.agentId) contractConds.push(eq(transactions.agentId, filters.agentId));
  const [contractsWritten] = await db.select({ count: sql<number>`COUNT(*)` }).from(transactions).where(and(...contractConds));
  const [agentCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(users).where(eq(users.role, "agent"));
  const revenuePerLead = Number(totalLeads.count) > 0 ? ytd.gci / Number(totalLeads.count) : 0;
  const revenuePerAgent = Number(agentCount.count) > 0 ? ytd.gci / Number(agentCount.count) : 0;
  const pipelineCoverageRatio = ytd.volume > 0 ? Number(pipeline.value) / ytd.volume : 0;
  return {
    mtd, ytd, range: rangeMetrics,
    pipeline: { count: Number(pipeline.count), value: Number(pipeline.value) },
    contractsWritten: Number(contractsWritten.count),
    totalLeads: Number(totalLeads.count),
    activeAgents: Number(agentCount.count),
    revenuePerLead, revenuePerAgent, pipelineCoverageRatio,
  };
}

// ─── Sales Funnel with Conversion Rates ──────────────────────────────────────
export async function getSalesFunnelReport(filters?: { agentId?: number; marketId?: number }) {
  const db = await getDb();
  if (!db) return null;
  const stageConds: any[] = [];
  if (filters?.agentId) stageConds.push(eq(agentConnections.agentId, filters.agentId));
  const stageRows = await db.select({
    stage: agentConnections.pipelineStatus,
    count: sql<number>`COUNT(*)`,
  }).from(agentConnections)
    .where(stageConds.length > 0 ? and(...stageConds) : undefined)
    .groupBy(agentConnections.pipelineStatus);
  const stageMap = new Map(stageRows.map(r => [r.stage, Number(r.count)]));
  const stages = [
    { key: "new_lead", label: "New Leads" },
    { key: "attempted_contact", label: "Attempted Contact" },
    { key: "nurture", label: "Nurture" },
    { key: "active_client", label: "Active Client" },
    { key: "under_contract", label: "Under Contract" },
    { key: "closed", label: "Closed" },
  ];
  const stageData = stages.map(s => ({ ...s, count: stageMap.get(s.key as any) ?? 0 }));
  const totalLeads = stageData.reduce((sum, s) => sum + s.count, 0);
  const withConversion = stageData.map((s, i) => ({
    ...s,
    conversionFromPrev: i === 0 ? 100 : (stageData[i - 1].count > 0 ? (s.count / stageData[i - 1].count) * 100 : 0),
    conversionFromTop: totalLeads > 0 ? (s.count / totalLeads) * 100 : 0,
    dropOff: i === 0 ? 0 : stageData[i - 1].count - s.count,
  }));
  const txConds: any[] = [eq(transactions.status, "closed" as any), isNotNull(transactions.closingDate), isNotNull(transactions.contractDate)];
  if (filters?.agentId) txConds.push(eq(transactions.agentId, filters.agentId));
  const [avgDays] = await db.select({
    avgDays: sql<number>`COALESCE(AVG(DATEDIFF(closingDate, contractDate)), 0)`,
  }).from(transactions).where(and(...txConds));
  const [closedCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(agentConnections).where(eq(agentConnections.pipelineStatus, "closed" as any));
  return {
    stages: withConversion,
    totalLeads,
    avgDaysToClose: Number(avgDays.avgDays),
    leadToCloseRate: totalLeads > 0 ? ((stageMap.get("closed" as any) ?? 0) / totalLeads) * 100 : 0,
  };
}

// ─── Lead Source ROI Report ───────────────────────────────────────────────────
export async function getLeadSourceROI(filters?: { dateFrom?: Date; dateTo?: Date; marketId?: number; agentId?: number }) {
  const db = await getDb();
  if (!db) return [];
  const allSources = await db.select().from(leadSources);
  // Contact counts (optionally scoped to agent's connections)
  let contactCountQuery = db.select({
    leadSourceId: contacts.leadSourceId,
    count: sql<number>`COUNT(DISTINCT ${contacts.id})`,
  }).from(contacts);
  if (filters?.agentId) {
    (contactCountQuery as any) = (contactCountQuery as any).innerJoin(agentConnections, and(eq(agentConnections.contactId, contacts.id), eq(agentConnections.agentId, filters.agentId)));
  }
  const contactCounts: Array<{ leadSourceId: number | null; count: number }> = await (contactCountQuery as any).groupBy(contacts.leadSourceId);
  const txConds: any[] = [eq(transactions.status, "closed" as any)];
  if (filters?.dateFrom) txConds.push(gte(transactions.closingDate, filters.dateFrom));
  if (filters?.dateTo) txConds.push(lte(transactions.closingDate, filters.dateTo));
  if (filters?.agentId) txConds.push(eq(transactions.agentId, filters.agentId));
  const txBySource = await db.select({
    leadSourceId: contacts.leadSourceId,
    closedCount: sql<number>`COUNT(*)`,
    totalGci: sql<number>`COALESCE(SUM(${transactions.grossCommissionIncome}), 0)`,
    totalVolume: sql<number>`COALESCE(SUM(${transactions.purchasePrice}), 0)`,
  }).from(transactions)
    .innerJoin(contacts, eq(transactions.primaryContactId, contacts.id))
    .where(and(...txConds))
    .groupBy(contacts.leadSourceId);
  const contactMap = new Map(contactCounts.map((c: { leadSourceId: number | null; count: number }) => [c.leadSourceId, Number(c.count)]));
  const txMap = new Map(txBySource.map(t => [t.leadSourceId, t]));
  return allSources.map(src => {
    const leads = Number(contactMap.get(src.id) ?? 0);
    const tx = txMap.get(src.id);
    const closed = tx ? Number(tx.closedCount) : 0;
    const gci = tx ? Number(tx.totalGci) : 0;
    const volume = tx ? Number(tx.totalVolume) : 0;
    return {
      id: src.id, name: src.name, parentId: src.parentId,
      leads, closed,
      conversionRate: leads > 0 ? (closed / leads) * 100 : 0,
      totalGci: gci, totalVolume: volume,
      revenuePerLead: leads > 0 ? gci / leads : 0,
      avgDealSize: closed > 0 ? volume / closed : 0,
    };
  }).filter(s => s.leads > 0 || s.closed > 0).sort((a, b) => b.totalGci - a.totalGci);
}

// ─── Pipeline Health Report ───────────────────────────────────────────────────
export async function getPipelineHealthReport(filters?: { agentId?: number; marketId?: number }) {
  const db = await getDb();
  if (!db) return null;
  const stageConds: any[] = [];
  if (filters?.agentId) stageConds.push(eq(agentConnections.agentId, filters.agentId));
  const stageRows = await db.select({
    stage: agentConnections.pipelineStatus,
    count: sql<number>`COUNT(*)`,
    avgDaysInStage: sql<number>`COALESCE(AVG(DATEDIFF(NOW(), ${agentConnections.updatedAt})), 0)`,
    maxDaysInStage: sql<number>`COALESCE(MAX(DATEDIFF(NOW(), ${agentConnections.updatedAt})), 0)`,
  }).from(agentConnections)
    .where(stageConds.length > 0 ? and(...stageConds) : undefined)
    .groupBy(agentConnections.pipelineStatus);
  const stalledConds: any[] = [
    sql`pipelineStatus IN ('active_client', 'under_contract')`,
    sql`DATEDIFF(NOW(), ${agentConnections.updatedAt}) >= 14`,
  ];
  if (filters?.agentId) stalledConds.push(eq(agentConnections.agentId, filters.agentId));
  const stalledRows = await db.select({
    id: agentConnections.id,
    agentId: agentConnections.agentId,
    contactId: agentConnections.contactId,
    stage: agentConnections.pipelineStatus,
    daysSinceUpdate: sql<number>`DATEDIFF(NOW(), ${agentConnections.updatedAt})`,
    agentName: users.name,
    contactFirstName: contacts.firstName,
    contactLastName: contacts.lastName,
  }).from(agentConnections)
    .leftJoin(users, eq(agentConnections.agentId, users.id))
    .leftJoin(contacts, eq(agentConnections.contactId, contacts.id))
    .where(and(...stalledConds))
    .orderBy(sql`DATEDIFF(NOW(), ${agentConnections.updatedAt}) DESC`)
    .limit(50);
  const agingBuckets = await db.select({
    bucketId: sql<number>`CASE 
      WHEN DATEDIFF(NOW(), updatedAt) <= 7 THEN 1
      WHEN DATEDIFF(NOW(), updatedAt) <= 14 THEN 2
      WHEN DATEDIFF(NOW(), updatedAt) <= 30 THEN 3
      ELSE 4
    END`,
    count: sql<number>`COUNT(*)`,
  }).from(agentConnections)
    .where(sql`pipelineStatus NOT IN ('closed', 'dead')`)
    .groupBy(sql`CASE 
      WHEN DATEDIFF(NOW(), updatedAt) <= 7 THEN 1
      WHEN DATEDIFF(NOW(), updatedAt) <= 14 THEN 2
      WHEN DATEDIFF(NOW(), updatedAt) <= 30 THEN 3
      ELSE 4
    END`);
  const bucketLabels: Record<number, string> = { 1: '0-7 days', 2: '8-14 days', 3: '15-30 days', 4: '30+ days' };
  const pipelineConds: any[] = [eq(transactions.status, "under_contract" as any)];
  if (filters?.agentId) pipelineConds.push(eq(transactions.agentId, filters.agentId));
  const [pipelineValue] = await db.select({
    value: sql<number>`COALESCE(SUM(purchasePrice), 0)`,
    count: sql<number>`COUNT(*)`,
  }).from(transactions).where(and(...pipelineConds));
  return {
    stageBreakdown: stageRows.map(r => ({
      stage: r.stage, count: Number(r.count),
      avgDaysInStage: Number(r.avgDaysInStage),
      maxDaysInStage: Number(r.maxDaysInStage),
    })),
    stalledDeals: stalledRows.map(r => ({ ...r, daysSinceUpdate: Number(r.daysSinceUpdate) })),
    agingBuckets: agingBuckets.map(b => ({ bucket: bucketLabels[Number(b.bucketId)] ?? '30+ days', count: Number(b.count) })) as { bucket: string; count: number }[],
    pipelineValue: Number(pipelineValue.value),
    pipelineCount: Number(pipelineValue.count),
    totalStalled: stalledRows.length,
  };
}

// ─── Time-Based Trend Comparison ─────────────────────────────────────────────
export async function getTrendComparison(filters?: { agentId?: number; marketId?: number }) {
  const db = await getDb();
  if (!db) return null;
  const now = new Date();
  const getMetrics = async (from: Date, to: Date) => {
    const conds: any[] = [eq(transactions.status, "closed" as any), gte(transactions.closingDate, from), lte(transactions.closingDate, to)];
    if (filters?.agentId) conds.push(eq(transactions.agentId, filters.agentId));
    // marketId filter applied via agentId scope
    const [r] = await db!.select({
      closings: sql<number>`COUNT(*)`,
      gci: sql<number>`COALESCE(SUM(grossCommissionIncome), 0)`,
      volume: sql<number>`COALESCE(SUM(purchasePrice), 0)`,
    }).from(transactions).where(and(...conds));
    return { closings: Number(r.closings), gci: Number(r.gci), volume: Number(r.volume) };
  };
  const thisWeekStart = new Date(now); thisWeekStart.setDate(now.getDate() - now.getDay());
  const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart); lastWeekEnd.setDate(thisWeekStart.getDate() - 1);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const thisYearStart = new Date(now.getFullYear(), 0, 1);
  const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
  const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31);
  const [thisWeek, lastWeek, thisMonth, lastMonth, thisYear, lastYear] = await Promise.all([
    getMetrics(thisWeekStart, now), getMetrics(lastWeekStart, lastWeekEnd),
    getMetrics(thisMonthStart, now), getMetrics(lastMonthStart, lastMonthEnd),
    getMetrics(thisYearStart, now), getMetrics(lastYearStart, lastYearEnd),
  ]);
  const pct = (curr: number, prev: number) => prev > 0 ? ((curr - prev) / prev) * 100 : (curr > 0 ? 100 : 0);
  return {
    weekOverWeek: { current: thisWeek, previous: lastWeek, gciChange: pct(thisWeek.gci, lastWeek.gci), closingsChange: pct(thisWeek.closings, lastWeek.closings), volumeChange: pct(thisWeek.volume, lastWeek.volume) },
    monthOverMonth: { current: thisMonth, previous: lastMonth, gciChange: pct(thisMonth.gci, lastMonth.gci), closingsChange: pct(thisMonth.closings, lastMonth.closings), volumeChange: pct(thisMonth.volume, lastMonth.volume) },
    yearOverYear: { current: thisYear, previous: lastYear, gciChange: pct(thisYear.gci, lastYear.gci), closingsChange: pct(thisYear.closings, lastYear.closings), volumeChange: pct(thisYear.volume, lastYear.volume) },
  };
}

// ─── AI Insights Data Aggregator ─────────────────────────────────────────────
export async function getAiInsightsData() {
  const db = await getDb();
  if (!db) return null;
  const now = new Date();
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
  const sixtyDaysAgo = new Date(now); sixtyDaysAgo.setDate(now.getDate() - 60);
  const [recent30] = await db.select({
    gci: sql<number>`COALESCE(SUM(grossCommissionIncome), 0)`,
    closings: sql<number>`COUNT(*)`,
    volume: sql<number>`COALESCE(SUM(purchasePrice), 0)`,
  }).from(transactions).where(and(eq(transactions.status, "closed" as any), gte(transactions.closingDate, thirtyDaysAgo)));
  const [prior30] = await db.select({
    gci: sql<number>`COALESCE(SUM(grossCommissionIncome), 0)`,
    closings: sql<number>`COUNT(*)`,
    volume: sql<number>`COALESCE(SUM(purchasePrice), 0)`,
  }).from(transactions).where(and(eq(transactions.status, "closed" as any), gte(transactions.closingDate, sixtyDaysAgo), lte(transactions.closingDate, thirtyDaysAgo)));
  const [stalledCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(agentConnections)
    .where(and(sql`pipelineStatus IN ('active_client', 'under_contract')`, sql`DATEDIFF(NOW(), ${agentConnections.updatedAt}) >= 14`));
  const [overdueFollowUps] = await db.select({ count: sql<number>`COUNT(*)` }).from(agentConnections)
    .where(and(isNotNull(agentConnections.followUpDate), lte(agentConnections.followUpDate, now), sql`pipelineStatus NOT IN ('closed', 'dead')`));
  const agentStats = await db.select({
    agentId: transactions.agentId,
    agentName: users.name,
    closings: sql<number>`COUNT(*)`,
    gci: sql<number>`COALESCE(SUM(${transactions.grossCommissionIncome}), 0)`,
  }).from(transactions)
    .innerJoin(users, eq(transactions.agentId, users.id))
    .where(and(eq(transactions.status, "closed" as any), gte(transactions.closingDate, thirtyDaysAgo)))
    .groupBy(transactions.agentId, users.name)
    .orderBy(sql`COALESCE(SUM(${transactions.grossCommissionIncome}), 0) DESC`);
  const sourceStats = await db.select({
    sourceId: contacts.leadSourceId,
    sourceName: leadSources.name,
    leads: sql<number>`COUNT(DISTINCT ${contacts.id})`,
    closed: sql<number>`COUNT(DISTINCT ${transactions.id})`,
  }).from(contacts)
    .leftJoin(leadSources, eq(contacts.leadSourceId, leadSources.id))
    .leftJoin(transactions, and(eq(transactions.primaryContactId, contacts.id), eq(transactions.status, "closed" as any)))
    .groupBy(contacts.leadSourceId, leadSources.name)
    .orderBy(sql`COUNT(DISTINCT ${transactions.id}) DESC`)
    .limit(10);
  const pct = (curr: number, prev: number) => prev > 0 ? ((curr - prev) / prev) * 100 : (curr > 0 ? 100 : 0);
  return {
    recentGci: Number(recent30.gci),
    recentClosings: Number(recent30.closings),
    recentVolume: Number(recent30.volume),
    priorGci: Number(prior30.gci),
    priorClosings: Number(prior30.closings),
    gciTrend: pct(Number(recent30.gci), Number(prior30.gci)),
    closingsTrend: pct(Number(recent30.closings), Number(prior30.closings)),
    stalledDeals: Number(stalledCount.count),
    overdueFollowUps: Number(overdueFollowUps.count),
    topAgents: agentStats.slice(0, 3).map(a => ({ ...a, gci: Number(a.gci), closings: Number(a.closings) })),
    bottomAgents: agentStats.slice(-3).reverse().map(a => ({ ...a, gci: Number(a.gci), closings: Number(a.closings) })),
    sourceStats: sourceStats.map(s => ({ ...s, leads: Number(s.leads), closed: Number(s.closed) })),
  };
}

// ─── Agent Goals ──────────────────────────────────────────────────────────────
export async function upsertAgentGoal(data: {
  agentId: number;
  year: number;
  month: number;
  gciTarget?: number | null;
  closingsTarget?: number | null;
  volumeTarget?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .insert(agentGoals)
    .values({
      agentId: data.agentId,
      year: data.year,
      month: data.month,
      gciTarget: data.gciTarget != null ? String(data.gciTarget) : null,
      closingsTarget: data.closingsTarget ?? null,
      volumeTarget: data.volumeTarget != null ? String(data.volumeTarget) : null,
    })
    .onDuplicateKeyUpdate({
      set: {
        gciTarget: data.gciTarget != null ? String(data.gciTarget) : null,
        closingsTarget: data.closingsTarget ?? null,
        volumeTarget: data.volumeTarget != null ? String(data.volumeTarget) : null,
      },
    });
}

export async function getAgentGoals(agentId: number, year: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(agentGoals)
    .where(and(eq(agentGoals.agentId, agentId), eq(agentGoals.year, year)));
}

export async function getAllGoalsForYear(year: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ goal: agentGoals, agentName: users.name })
    .from(agentGoals)
    .leftJoin(users, eq(agentGoals.agentId, users.id))
    .where(eq(agentGoals.year, year));
}

/** Returns agent production stats joined with their goals for a given year/month */
export async function getAgentProductionWithGoals(year: number, month: number) {
  const db = await getDb();
  if (!db) return [];

  // month=0 means annual (all months in the year)
  const isAnnual = month === 0;
  const dateFilter = isAnnual
    ? sql`YEAR(transactions.closingDate) = ${year}`
    : sql`YEAR(transactions.closingDate) = ${year} AND MONTH(transactions.closingDate) = ${month}`;

  const production = await db
    .select({
      agentId: users.id,
      agentName: users.name,
      gci: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' THEN CAST(${transactions.grossCommissionIncome} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
      closings: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'closed' THEN ${transactions.id} END)`,
      volume: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' THEN CAST(${transactions.purchasePrice} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
      activePipeline: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'under_contract' THEN ${transactions.id} END)`,
    })
    .from(users)
    .leftJoin(transactions, and(eq(transactions.agentId, users.id), dateFilter))
    .where(and(eq(users.role, "agent"), sql`users.isActive = 1`))
    .groupBy(users.id, users.name)
    .orderBy(desc(sql`COALESCE(SUM(CASE WHEN transactions.status = 'closed' THEN CAST(transactions.grossCommissionIncome AS DECIMAL(15,2)) ELSE 0 END), 0)`));

  // Fetch goals for this year/month
  const goals = await db
    .select()
    .from(agentGoals)
    .where(and(eq(agentGoals.year, year), eq(agentGoals.month, month)));

  const goalMap = new Map(goals.map((g) => [g.agentId, g]));

  return production.map((p) => {
    const goal = goalMap.get(p.agentId);
    const gci = Number(p.gci);
    const closings = Number(p.closings);
    const volume = Number(p.volume);
    const gciTarget = goal?.gciTarget != null ? Number(goal.gciTarget) : null;
    const closingsTarget = goal?.closingsTarget ?? null;
    const volumeTarget = goal?.volumeTarget != null ? Number(goal.volumeTarget) : null;
    return {
      agentId: p.agentId,
      agentName: p.agentName ?? "Unknown",
      gci,
      closings,
      volume,
      activePipeline: Number(p.activePipeline),
      gciTarget,
      closingsTarget,
      volumeTarget,
      gciPct: gciTarget ? Math.min(Math.round((gci / gciTarget) * 100), 999) : null,
      closingsPct: closingsTarget ? Math.min(Math.round((closings / closingsTarget) * 100), 999) : null,
      volumePct: volumeTarget ? Math.min(Math.round((volume / volumeTarget) * 100), 999) : null,
    };
  });
}

/** Returns a single agent's production stats joined with their goals for a given year/month */
export async function getMyGoalsAndProduction(agentId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) return null;

  const isAnnual = month === 0;
  const dateFilter = isAnnual
    ? sql`YEAR(transactions.closingDate) = ${year}`
    : sql`YEAR(transactions.closingDate) = ${year} AND MONTH(transactions.closingDate) = ${month}`;

  const [production] = await db
    .select({
      agentId: users.id,
      agentName: users.name,
      gci: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' THEN CAST(${transactions.grossCommissionIncome} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
      closings: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'closed' THEN ${transactions.id} END)`,
      volume: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' THEN CAST(${transactions.purchasePrice} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
      activePipeline: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'under_contract' THEN ${transactions.id} END)`,
    })
    .from(users)
    .leftJoin(transactions, and(eq(transactions.agentId, users.id), dateFilter))
    .where(eq(users.id, agentId))
    .groupBy(users.id, users.name);

  if (!production) return null;

  const goals = await db
    .select()
    .from(agentGoals)
    .where(and(eq(agentGoals.agentId, agentId), eq(agentGoals.year, year), eq(agentGoals.month, month)));

  const goal = goals[0] ?? null;
  const gci = Number(production.gci);
  const closings = Number(production.closings);
  const volume = Number(production.volume);
  const gciTarget = goal?.gciTarget != null ? Number(goal.gciTarget) : null;
  const closingsTarget = goal?.closingsTarget ?? null;
  const volumeTarget = goal?.volumeTarget != null ? Number(goal.volumeTarget) : null;

  return {
    agentId: production.agentId,
    agentName: production.agentName ?? "Unknown",
    gci,
    closings,
    volume,
    activePipeline: Number(production.activePipeline),
    gciTarget,
    closingsTarget,
    volumeTarget,
    gciPct: gciTarget ? Math.min(Math.round((gci / gciTarget) * 100), 999) : null,
    closingsPct: closingsTarget ? Math.min(Math.round((closings / closingsTarget) * 100), 999) : null,
    volumePct: volumeTarget ? Math.min(Math.round((volume / volumeTarget) * 100), 999) : null,
    hasGoals: gciTarget !== null || closingsTarget !== null || volumeTarget !== null,
  };
}


// ─── Market Drill-Down ────────────────────────────────────────────────────────

export async function getMarketDrillDownAgents(marketId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      agentId: users.id,
      agentName: users.name,
      email: users.email,
      closedDeals: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'closed' THEN ${transactions.id} END)`,
      activeDeals: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'under_contract' THEN ${transactions.id} END)`,
      totalGci: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' THEN CAST(${transactions.grossCommissionIncome} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
      totalVolume: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' THEN CAST(${transactions.purchasePrice} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
    })
    .from(users)
    .leftJoin(transactions, eq(transactions.agentId, users.id))
    .where(and(eq(users.marketProfileId, marketId), eq(users.role, "agent" as any)))
    .groupBy(users.id, users.name, users.email)
    .orderBy(desc(sql`totalGci`));
  return rows.map(r => ({
    agentId: r.agentId,
    agentName: r.agentName ?? "Unknown",
    email: r.email ?? "",
    closedDeals: Number(r.closedDeals),
    activeDeals: Number(r.activeDeals),
    totalGci: Number(r.totalGci),
    totalVolume: Number(r.totalVolume),
  }));
}

export async function getMarketDrillDownDeals(marketId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      txId: transactions.id,
      txNumber: transactions.transactionNumber,
      agentName: users.name,
      status: transactions.status,
      purchasePrice: transactions.purchasePrice,
      grossCommissionIncome: transactions.grossCommissionIncome,
      closingDate: transactions.closingDate,
      transactionType: transactions.transactionType,
    })
    .from(transactions)
    .innerJoin(users, eq(transactions.agentId, users.id))
    .where(eq(users.marketProfileId, marketId))
    .orderBy(desc(transactions.closingDate))
    .limit(limit);
  return rows.map(r => ({
    txId: r.txId,
    txNumber: r.txNumber ?? "",
    agentName: r.agentName ?? "Unknown",
    status: r.status,
    transactionType: r.transactionType,
    purchasePrice: r.purchasePrice ? Number(r.purchasePrice) : null,
    gci: r.grossCommissionIncome ? Number(r.grossCommissionIncome) : null,
    closingDate: r.closingDate ? r.closingDate.getTime() : null,
  }));
}

export async function getMarketDrillDownMonthlyTrend(marketId: number, months = 12) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      month: sql<string>`DATE_FORMAT(${transactions.closingDate}, '%Y-%m')`,
      gci: sql<string>`COALESCE(SUM(CAST(${transactions.grossCommissionIncome} AS DECIMAL(15,2))), 0)`,
      deals: sql<number>`COUNT(*)`,
      volume: sql<string>`COALESCE(SUM(CAST(${transactions.purchasePrice} AS DECIMAL(15,2))), 0)`,
    })
    .from(transactions)
    .innerJoin(users, eq(transactions.agentId, users.id))
    .where(
      and(
        eq(users.marketProfileId, marketId),
        eq(transactions.status, "closed" as any),
        sql`${transactions.closingDate} >= DATE_SUB(CURDATE(), INTERVAL ${months} MONTH)`
      )
    )
    .groupBy(sql`DATE_FORMAT(${transactions.closingDate}, '%Y-%m')`)
    .orderBy(sql`month`);
  return rows.map(r => ({
    month: r.month,
    gci: Number(r.gci),
    deals: Number(r.deals),
    volume: Number(r.volume),
  }));
}

export async function getMarketById(marketId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(markets)
    .where(eq(markets.id, marketId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateMarketGoal(marketId: number, annualGciGoal: number | null) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(markets)
    .set({ annualGciGoal: annualGciGoal?.toString() as any, updatedAt: new Date() })
    .where(eq(markets.id, marketId));
}

/** Monthly GCI breakdown for all agents in a given year — used for sparklines on Goals page */
export async function getAgentMonthlyGci(year: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      agentId: transactions.agentId,
      month: sql<number>`MONTH(${transactions.closingDate})`,
      gci: sql<number>`SUM(${transactions.grossCommissionIncome})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.status, "closed"),
        sql`YEAR(${transactions.closingDate}) = ${year}`,
        isNotNull(transactions.agentId)
      )
    )
    .groupBy(transactions.agentId, sql`MONTH(${transactions.closingDate})`);
  return rows;
}

// ─── Global Activity Log (admin timeline) ─────────────────────────────────────
export async function getGlobalActivityLog(opts: {
  page?: number;
  limit?: number;
  userId?: number;
  entityTypes?: string[];
}) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 50, 100);
  const offset = (page - 1) * limit;
  const conditions: any[] = [];
  if (opts.userId) conditions.push(eq(activityLog.userId, opts.userId));
  if (opts.entityTypes && opts.entityTypes.length > 0) {
    conditions.push(inArray(activityLog.entityType as any, opts.entityTypes));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, countResult] = await Promise.all([
    db
      .select({ log: activityLog, user: users })
      .from(activityLog)
      .leftJoin(users, eq(activityLog.userId, users.id))
      .where(where)
      .orderBy(desc(activityLog.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(activityLog)
      .where(where),
  ]);
  return { rows, total: Number(countResult[0]?.count ?? 0) };
}
