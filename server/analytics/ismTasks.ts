import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  sql,
  type SQL,
  aliasedTable,
} from "drizzle-orm";
import {
  activityLog,
  contacts,
  taskNotes,
  tasks,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OPEN_TASK_STATUSES = ["pending", "in_progress"] as const;

export type IsmTaskBoardFilters = {
  page?: number;
  limit?: number;
  isaIds?: number[];
  status?:
    | "all"
    | "open"
    | "overdue"
    | "pending"
    | "in_progress"
    | "completed"
    | "cancelled";
  dueDateFrom?: string;
  dueDateTo?: string;
};

function uniqueIsaIds(ids: number[] | undefined): number[] {
  return Array.from(
    new Set((ids ?? []).filter(id => Number.isInteger(id) && id > 0))
  );
}

function validDay(value: string | undefined): string | undefined {
  return value && DATE_PATTERN.test(value) ? value : undefined;
}

function startOfDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function endOfDay(day: string): Date {
  return new Date(`${day}T23:59:59.999Z`);
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function taskStatusConditions(status: IsmTaskBoardFilters["status"]): SQL[] {
  if (status === "open")
    return [inArray(tasks.status, [...OPEN_TASK_STATUSES])];
  if (status === "overdue") {
    return [
      inArray(tasks.status, [...OPEN_TASK_STATUSES]),
      isNotNull(tasks.dueDate),
      sql`DATE(${tasks.dueDate}) < CURDATE()`,
    ];
  }
  if (status && status !== "all") return [eq(tasks.status, status)];
  return [];
}

function taskMetrics() {
  return {
    assignedTasks: sql<number>`COUNT(*)`,
    openTasks: sql<number>`COALESCE(SUM(CASE WHEN ${tasks.status} IN ('pending', 'in_progress') THEN 1 ELSE 0 END), 0)`,
    completedTasks: sql<number>`COALESCE(SUM(CASE WHEN ${tasks.status} = 'completed' THEN 1 ELSE 0 END), 0)`,
    overdueTasks: sql<number>`COALESCE(SUM(CASE WHEN ${tasks.status} IN ('pending', 'in_progress') AND ${tasks.dueDate} IS NOT NULL AND DATE(${tasks.dueDate}) < CURDATE() THEN 1 ELSE 0 END), 0)`,
    dueToday: sql<number>`COALESCE(SUM(CASE WHEN ${tasks.status} IN ('pending', 'in_progress') AND ${tasks.dueDate} IS NOT NULL AND DATE(${tasks.dueDate}) = CURDATE() THEN 1 ELSE 0 END), 0)`,
    completedLast30Days: sql<number>`COALESCE(SUM(CASE WHEN ${tasks.status} = 'completed' AND ${tasks.completedAt} >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) THEN 1 ELSE 0 END), 0)`,
  };
}

/**
 * Operations-focused task workload for the ISM dashboard. Every row is scoped
 * to an ISA assignee, while activity remains visible whether an ISA, an admin,
 * or another permitted user performed the task action.
 */
export async function getIsmTaskBoard(filters: IsmTaskBoardFilters = {}) {
  const db = await getDb();
  const empty = {
    summary: {
      assignedTasks: 0,
      openTasks: 0,
      overdueTasks: 0,
      dueToday: 0,
      completedLast30Days: 0,
      completionRate: null as number | null,
    },
    isaStats: [],
    tasks: [],
    total: 0,
    page: 1,
    limit: 50,
    isas: [],
    activities: [],
  };
  if (!db) return empty;

  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(Math.max(1, filters.limit ?? 50), 100);
  const offset = (page - 1) * limit;
  const isaIds = uniqueIsaIds(filters.isaIds);
  const dueDateFrom = validDay(filters.dueDateFrom);
  const dueDateTo = validDay(filters.dueDateTo);

  const baseConditions: SQL[] = [eq(users.role, "isa")];
  if (isaIds.length) baseConditions.push(inArray(tasks.assignedToId, isaIds));
  if (dueDateFrom)
    baseConditions.push(gte(tasks.dueDate, startOfDay(dueDateFrom)));
  if (dueDateTo) baseConditions.push(lte(tasks.dueDate, endOfDay(dueDateTo)));
  const baseWhere = and(...baseConditions)!;
  const filteredWhere = and(
    ...baseConditions,
    ...taskStatusConditions(filters.status)
  )!;

  const actor = aliasedTable(users, "ism_task_activity_actor");
  const noteAuthor = aliasedTable(users, "ism_task_note_author");

  const [
    summaryRows,
    isaStats,
    taskRows,
    countRows,
    isas,
    activityRows,
    noteRows,
  ] = await Promise.all([
    db
      .select(taskMetrics())
      .from(tasks)
      .innerJoin(users, eq(tasks.assignedToId, users.id))
      .where(baseWhere),
    db
      .select({
        isa: {
          id: users.id,
          name: users.name,
          email: users.email,
          title: users.title,
          isActive: users.isActive,
        },
        ...taskMetrics(),
      })
      .from(tasks)
      .innerJoin(users, eq(tasks.assignedToId, users.id))
      .where(baseWhere)
      .groupBy(users.id, users.name, users.email, users.title, users.isActive)
      .orderBy(
        desc(
          sql`COALESCE(SUM(CASE WHEN ${tasks.status} IN ('pending', 'in_progress') AND ${tasks.dueDate} IS NOT NULL AND DATE(${tasks.dueDate}) < CURDATE() THEN 1 ELSE 0 END), 0)`
        ),
        desc(
          sql`COALESCE(SUM(CASE WHEN ${tasks.status} IN ('pending', 'in_progress') THEN 1 ELSE 0 END), 0)`
        ),
        asc(users.name)
      ),
    db
      .select({
        task: tasks,
        assignedIsa: {
          id: users.id,
          name: users.name,
          email: users.email,
          title: users.title,
          isActive: users.isActive,
        },
        contact: {
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
        },
      })
      .from(tasks)
      .innerJoin(users, eq(tasks.assignedToId, users.id))
      .leftJoin(contacts, eq(tasks.relatedContactId, contacts.id))
      .where(filteredWhere)
      .orderBy(
        asc(
          sql`CASE WHEN ${tasks.status} IN ('pending', 'in_progress') AND ${tasks.dueDate} IS NOT NULL AND DATE(${tasks.dueDate}) < CURDATE() THEN 0 WHEN ${tasks.status} IN ('pending', 'in_progress') THEN 1 ELSE 2 END`
        ),
        asc(tasks.dueDate),
        desc(tasks.updatedAt)
      )
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tasks)
      .innerJoin(users, eq(tasks.assignedToId, users.id))
      .where(filteredWhere),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        title: users.title,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.role, "isa"))
      .orderBy(asc(users.name)),
    db
      .select({
        id: activityLog.id,
        taskId: tasks.id,
        taskTitle: tasks.title,
        action: activityLog.action,
        details: activityLog.details,
        createdAt: activityLog.createdAt,
        assignedIsa: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
        actor: {
          id: actor.id,
          name: actor.name,
          email: actor.email,
        },
      })
      .from(activityLog)
      .innerJoin(
        tasks,
        and(
          eq(activityLog.entityType, "task"),
          eq(activityLog.entityId, tasks.id)
        )
      )
      .innerJoin(users, eq(tasks.assignedToId, users.id))
      .leftJoin(actor, eq(activityLog.userId, actor.id))
      .where(filteredWhere)
      .orderBy(desc(activityLog.createdAt))
      .limit(50),
    db
      .select({
        id: taskNotes.id,
        taskId: tasks.id,
        taskTitle: tasks.title,
        content: taskNotes.content,
        createdAt: taskNotes.createdAt,
        assignedIsa: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
        actor: {
          id: noteAuthor.id,
          name: noteAuthor.name,
          email: noteAuthor.email,
        },
      })
      .from(taskNotes)
      .innerJoin(tasks, eq(taskNotes.taskId, tasks.id))
      .innerJoin(users, eq(tasks.assignedToId, users.id))
      .innerJoin(noteAuthor, eq(taskNotes.authorId, noteAuthor.id))
      .where(filteredWhere)
      .orderBy(desc(taskNotes.createdAt))
      .limit(50),
  ]);

  const summary = summaryRows[0];
  const assignedTasks = toNumber(summary?.assignedTasks);
  const openTasks = toNumber(summary?.openTasks);
  const completedTasks = toNumber(summary?.completedTasks);
  const completionPool = completedTasks + openTasks;
  const completionRate = completionPool
    ? Math.round((completedTasks / completionPool) * 1000) / 10
    : null;

  const recentActivityRows = activityRows as Array<any>;
  const recentNoteRows = noteRows as Array<any>;
  const activities = [
    ...recentActivityRows.map(row => ({
      id: `activity-${row.id}`,
      kind: "event" as const,
      taskId: row.taskId,
      taskTitle: row.taskTitle,
      action: row.action,
      details: row.details,
      createdAt: row.createdAt,
      assignedIsa: row.assignedIsa,
      actor: row.actor,
    })),
    ...recentNoteRows.map(row => ({
      id: `note-${row.id}`,
      kind: "note" as const,
      taskId: row.taskId,
      taskTitle: row.taskTitle,
      action: "task_note_added",
      details: { content: row.content },
      createdAt: row.createdAt,
      assignedIsa: row.assignedIsa,
      actor: row.actor,
    })),
  ]
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    )
    .slice(0, 50);

  return {
    summary: {
      assignedTasks,
      openTasks,
      overdueTasks: toNumber(summary?.overdueTasks),
      dueToday: toNumber(summary?.dueToday),
      completedLast30Days: toNumber(summary?.completedLast30Days),
      completionRate,
    },
    isaStats: isaStats.map(row => {
      const assigned = toNumber(row.assignedTasks);
      const open = toNumber(row.openTasks);
      const completed = toNumber(row.completedTasks);
      const completionPool = completed + open;
      return {
        isa: row.isa,
        assignedTasks: assigned,
        openTasks: open,
        overdueTasks: toNumber(row.overdueTasks),
        dueToday: toNumber(row.dueToday),
        completedLast30Days: toNumber(row.completedLast30Days),
        completionRate: completionPool
          ? Math.round((completed / completionPool) * 1000) / 10
          : null,
      };
    }),
    tasks: taskRows,
    total: toNumber(countRows[0]?.count),
    page,
    limit,
    isas,
    activities,
  };
}
