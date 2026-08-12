import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, inArray, isNull, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  users,
  workAttachments,
  workCustomFields,
  workFormFields,
  workForms,
  workMyTaskMemberships,
  workMyTaskSections,
  workNotifications,
  workPortfolioItems,
  workPortfolioMembers,
  workPortfolios,
  workProjectCustomFields,
  workProjectMembers,
  workProjectSections,
  workProjects,
  workRuleActions,
  workRules,
  workSavedViews,
  workStatusUpdates,
  workStories,
  workTags,
  workTaskAssignees,
  workTaskCustomFieldValues,
  workTaskDependencies,
  workTaskFollowers,
  workTaskProjectMemberships,
  workTaskRecurrences,
  workTaskTags,
  workTasks,
  workTeamMembers,
  workTeams,
  workTemplates,
} from "../../drizzle/schema";

type AccessLevel = "admin" | "editor" | "commenter" | "viewer";
type AppUser = { id: number; role: string; email?: string | null };

const accessWeight: Record<AccessLevel, number> = {
  viewer: 1,
  commenter: 2,
  editor: 3,
  admin: 4,
};

const jsonObject = z.record(z.string(), z.unknown());
const richText = jsonObject.optional();
const dateInput = z.coerce.date().nullable().optional();
const dateTimeInput = z.coerce.date().nullable().optional();
const rankInput = z.string().min(1).max(64).optional();
const accessLevelInput = z.enum(["admin", "editor", "commenter", "viewer"]);

function slugify(value: string) {
  const base = value
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 84) || "item";
  return `${base}-${randomUUID().slice(0, 8)}`;
}

function nextRank() {
  return `${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
}

function plainTextFromDoc(doc: Record<string, unknown> | undefined, fallback = "") {
  if (!doc) return fallback;
  const text: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const current = node as { text?: unknown; content?: unknown };
    if (typeof current.text === "string") text.push(current.text);
    if (Array.isArray(current.content)) current.content.forEach(walk);
  };
  walk(doc);
  return text.join(" ").replace(/\s+/g, " ").trim() || fallback;
}

function validateCursorLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? 50, 1), 100);
}

function atLeast(actual: AccessLevel | null, required: AccessLevel) {
  return !!actual && accessWeight[actual] >= accessWeight[required];
}

async function getRequiredDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  return db;
}

async function getTeamAccess(user: AppUser, teamId: number): Promise<AccessLevel | null> {
  if (user.role === "admin") return "admin";
  const db = await getRequiredDb();
  const [team] = await db.select().from(workTeams).where(and(eq(workTeams.id, teamId), isNull(workTeams.deletedAt))).limit(1);
  if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found." });
  if (team.createdById === user.id) return "admin";
  const [membership] = await db.select().from(workTeamMembers)
    .where(and(eq(workTeamMembers.teamId, teamId), eq(workTeamMembers.userId, user.id), isNull(workTeamMembers.deletedAt))).limit(1);
  if (membership) return membership.accessLevel;
  if (team.privacy === "public_to_workspace") return "viewer";
  return null;
}

async function getProjectAccess(user: AppUser, projectId: number): Promise<AccessLevel | null> {
  if (user.role === "admin") return "admin";
  const db = await getRequiredDb();
  const [project] = await db.select().from(workProjects)
    .where(and(eq(workProjects.id, projectId), isNull(workProjects.deletedAt))).limit(1);
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
  if (project.createdById === user.id || project.ownerId === user.id) return "admin";

  const [membership] = await db.select().from(workProjectMembers)
    .where(and(eq(workProjectMembers.projectId, projectId), eq(workProjectMembers.userId, user.id), isNull(workProjectMembers.deletedAt))).limit(1);
  const candidates: AccessLevel[] = membership ? [membership.accessLevel] : [];
  if (project.teamId) {
    const teamAccess = await getTeamAccess(user, project.teamId);
    if (teamAccess && project.privacy === "public_to_team") {
      const teamDefault = project.defaultAccessLevel;
      candidates.push(accessWeight[teamAccess] > accessWeight[teamDefault] ? teamAccess : teamDefault);
    }
  }
  if (project.privacy === "public_to_workspace") candidates.push(project.defaultAccessLevel);
  return candidates.length ? candidates.reduce((best, current) => accessWeight[current] > accessWeight[best] ? current : best) : null;
}

async function requireProjectAccess(user: AppUser, projectId: number, required: AccessLevel) {
  const access = await getProjectAccess(user, projectId);
  if (!atLeast(access, required)) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project." });
  return access;
}

async function getPortfolioAccess(user: AppUser, portfolioId: number): Promise<AccessLevel | null> {
  if (user.role === "admin") return "admin";
  const db = await getRequiredDb();
  const [portfolio] = await db.select().from(workPortfolios).where(and(eq(workPortfolios.id, portfolioId), isNull(workPortfolios.deletedAt))).limit(1);
  if (!portfolio) throw new TRPCError({ code: "NOT_FOUND", message: "Portfolio not found." });
  if (portfolio.createdById === user.id || portfolio.ownerId === user.id) return "admin";
  const [membership] = await db.select().from(workPortfolioMembers).where(and(eq(workPortfolioMembers.portfolioId, portfolioId), eq(workPortfolioMembers.userId, user.id), isNull(workPortfolioMembers.deletedAt))).limit(1);
  if (membership) return membership.accessLevel;
  return portfolio.privacy === "public_to_workspace" ? "viewer" : null;
}

async function requirePortfolioAccess(user: AppUser, portfolioId: number, required: AccessLevel) {
  const access = await getPortfolioAccess(user, portfolioId);
  if (!atLeast(access, required)) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this portfolio." });
  return access;
}

async function getTaskAccess(user: AppUser, taskId: number): Promise<AccessLevel | null> {
  if (user.role === "admin") return "admin";
  const db = await getRequiredDb();
  const [task] = await db.select().from(workTasks).where(and(eq(workTasks.id, taskId), isNull(workTasks.deletedAt))).limit(1);
  if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
  if (task.createdById === user.id) return "admin";
  const [assignee] = await db.select().from(workTaskAssignees)
    .where(and(eq(workTaskAssignees.taskId, taskId), eq(workTaskAssignees.userId, user.id), isNull(workTaskAssignees.deletedAt))).limit(1);
  const [follower] = await db.select().from(workTaskFollowers)
    .where(and(eq(workTaskFollowers.taskId, taskId), eq(workTaskFollowers.userId, user.id), isNull(workTaskFollowers.deletedAt))).limit(1);
  const memberships = await db.select({ projectId: workTaskProjectMemberships.projectId }).from(workTaskProjectMemberships)
    .where(and(eq(workTaskProjectMemberships.taskId, taskId), isNull(workTaskProjectMemberships.deletedAt)));
  const candidates: AccessLevel[] = [];
  if (assignee) candidates.push("editor");
  if (follower) candidates.push("commenter");
  for (const membership of memberships) {
    const projectAccess = await getProjectAccess(user, membership.projectId);
    if (projectAccess) candidates.push(projectAccess);
  }
  return candidates.length ? candidates.reduce((best, current) => accessWeight[current] > accessWeight[best] ? current : best) : null;
}

async function requireTaskAccess(user: AppUser, taskId: number, required: AccessLevel) {
  const access = await getTaskAccess(user, taskId);
  if (!atLeast(access, required)) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this task." });
  return access;
}

async function writeStory(input: {
  taskId?: number | null;
  projectId?: number | null;
  portfolioId?: number | null;
  actorId?: number | null;
  storyType: "comment" | "assigned" | "due_date_changed" | "section_changed" | "completed" | "attachment_added" | "custom_field_changed" | "created" | "updated" | "dependency_added" | "member_added" | "status_update";
  contentJson?: Record<string, unknown>;
  contentPlainText?: string;
  metadata?: Record<string, unknown>;
}) {
  const db = await getRequiredDb();
  const [result] = await db.insert(workStories).values({
    taskId: input.taskId ?? null,
    projectId: input.projectId ?? null,
    portfolioId: input.portfolioId ?? null,
    actorId: input.actorId ?? null,
    storyType: input.storyType,
    contentJson: input.contentJson ?? null,
    contentPlainText: input.contentPlainText ?? null,
    metadata: input.metadata ?? null,
  });
  return Number(result.insertId);
}

async function notifyUsers(input: {
  userIds: number[];
  actorId: number;
  type: "mention" | "assignment" | "comment" | "follower" | "due" | "status_update";
  title: string;
  body?: string;
  taskId?: number | null;
  projectId?: number | null;
  storyId?: number | null;
}) {
  const ids = Array.from(new Set(input.userIds)).filter(id => id !== input.actorId);
  if (!ids.length) return;
  const db = await getRequiredDb();
  await db.insert(workNotifications).values(ids.map(userId => ({
    userId,
    taskId: input.taskId ?? null,
    projectId: input.projectId ?? null,
    storyId: input.storyId ?? null,
    notificationType: input.type,
    title: input.title,
    body: input.body ?? null,
  })));
}

async function restoreOrCreateMembership(table: typeof workProjectMembers | typeof workTeamMembers | typeof workTaskAssignees | typeof workTaskFollowers, values: Record<string, unknown>, where: ReturnType<typeof and>) {
  const db = await getRequiredDb();
  await db.update(table as any).set({ deletedAt: null, updatedAt: new Date(), ...(values as any) }).where(where as any);
}

async function projectTaskContext(taskId: number) {
  const db = await getRequiredDb();
  const memberships = await db.select({ projectId: workTaskProjectMemberships.projectId }).from(workTaskProjectMemberships)
    .where(and(eq(workTaskProjectMemberships.taskId, taskId), isNull(workTaskProjectMemberships.deletedAt)));
  return memberships.map(m => m.projectId);
}

async function evaluateProjectRules(projectId: number, taskId: number, trigger: "task_added" | "task_completed" | "task_moved" | "due_date_changed" | "custom_field_changed" | "form_submitted", actorId: number, event: Record<string, unknown>) {
  const db = await getRequiredDb();
  const rules = await db.select().from(workRules).where(and(
    eq(workRules.projectId, projectId),
    eq(workRules.trigger, trigger),
    eq(workRules.isActive, true),
    isNull(workRules.deletedAt),
  ));
  for (const rule of rules) {
    const conditions = (rule.conditions ?? []) as Array<Record<string, unknown>>;
    const matches = conditions.every(condition => {
      if (condition.field === "customFieldId") return String(event.customFieldId ?? "") === String(condition.value ?? "");
      if (condition.field === "customFieldValue") return JSON.stringify(event.value ?? null) === JSON.stringify(condition.value ?? null);
      if (condition.field === "completionStatus") return event.completionStatus === condition.value;
      return true;
    });
    if (!matches) continue;
    const actions = await db.select().from(workRuleActions)
      .where(and(eq(workRuleActions.ruleId, rule.id), isNull(workRuleActions.deletedAt)))
      .orderBy(asc(workRuleActions.position));
    for (const action of actions) {
      const config = (action.config ?? {}) as Record<string, unknown>;
      if (action.actionType === "move_to_section" && typeof config.sectionId === "number") {
        await db.update(workTaskProjectMemberships).set({ sectionId: config.sectionId, position: nextRank() })
          .where(and(eq(workTaskProjectMemberships.taskId, taskId), eq(workTaskProjectMemberships.projectId, projectId), isNull(workTaskProjectMemberships.deletedAt)));
        await writeStory({ taskId, projectId, actorId, storyType: "section_changed", contentPlainText: "Rule moved task to a section.", metadata: { ruleId: rule.id, sectionId: config.sectionId } });
      }
      if (action.actionType === "assign_user" && typeof config.userId === "number") {
        const [existing] = await db.select().from(workTaskAssignees).where(and(eq(workTaskAssignees.taskId, taskId), eq(workTaskAssignees.userId, config.userId))).limit(1);
        if (existing) await db.update(workTaskAssignees).set({ deletedAt: null }).where(eq(workTaskAssignees.id, existing.id));
        else await db.insert(workTaskAssignees).values({ taskId, userId: config.userId });
        await notifyUsers({ userIds: [config.userId], actorId, type: "assignment", title: "A rule assigned you a task", taskId, projectId });
      }
      if (action.actionType === "mark_complete") {
        await db.update(workTasks).set({ completionStatus: "complete", completedAt: new Date(), completedById: actorId }).where(eq(workTasks.id, taskId));
      }
      if (action.actionType === "set_custom_field" && typeof config.customFieldId === "number") {
        await db.delete(workTaskCustomFieldValues).where(and(eq(workTaskCustomFieldValues.taskId, taskId), eq(workTaskCustomFieldValues.customFieldId, config.customFieldId)));
        await db.insert(workTaskCustomFieldValues).values({ taskId, customFieldId: config.customFieldId, value: config.value ?? null, plainTextValue: typeof config.value === "string" ? config.value : JSON.stringify(config.value ?? null) });
      }
    }
  }
}

export const workManagementRouter = router({
  teams: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getRequiredDb();
      if (ctx.user.role === "admin") return db.select().from(workTeams).where(isNull(workTeams.deletedAt)).orderBy(asc(workTeams.name));
      const memberships = await db.select({ teamId: workTeamMembers.teamId }).from(workTeamMembers)
        .where(and(eq(workTeamMembers.userId, ctx.user.id), isNull(workTeamMembers.deletedAt)));
      const ids = memberships.map(m => m.teamId);
      return db.select().from(workTeams).where(and(isNull(workTeams.deletedAt), or(eq(workTeams.privacy, "public_to_workspace"), ids.length ? inArray(workTeams.id, ids) : sql`false`))).orderBy(asc(workTeams.name));
    }),
    create: protectedProcedure.input(z.object({ name: z.string().min(1).max(255), description: z.string().max(5000).optional(), privacy: z.enum(["public_to_workspace", "request_to_join", "private"]).default("public_to_workspace") })).mutation(async ({ ctx, input }) => {
      const db = await getRequiredDb();
      const [result] = await db.insert(workTeams).values({ slug: slugify(input.name), name: input.name.trim(), description: input.description ?? null, privacy: input.privacy, createdById: ctx.user.id });
      const teamId = Number(result.insertId);
      await db.insert(workTeamMembers).values({ teamId, userId: ctx.user.id, accessLevel: "admin" });
      return { id: teamId };
    }),
    addMember: protectedProcedure.input(z.object({ teamId: z.number().int().positive(), userId: z.number().int().positive(), accessLevel: accessLevelInput.default("viewer") })).mutation(async ({ ctx, input }) => {
      if (!atLeast(await getTeamAccess(ctx.user, input.teamId), "admin")) throw new TRPCError({ code: "FORBIDDEN", message: "Team admin access is required." });
      const db = await getRequiredDb();
      const [existing] = await db.select().from(workTeamMembers).where(and(eq(workTeamMembers.teamId, input.teamId), eq(workTeamMembers.userId, input.userId))).limit(1);
      if (existing) await db.update(workTeamMembers).set({ accessLevel: input.accessLevel, deletedAt: null }).where(eq(workTeamMembers.id, existing.id));
      else await db.insert(workTeamMembers).values({ teamId: input.teamId, userId: input.userId, accessLevel: input.accessLevel });
      return { success: true };
    }),
  }),

  projects: router({
    list: protectedProcedure.input(z.object({ cursor: z.number().int().positive().optional(), limit: z.number().int().min(1).max(100).optional(), search: z.string().max(255).optional(), teamId: z.number().int().positive().optional(), fields: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
      const db = await getRequiredDb();
      const limit = validateCursorLimit(input?.limit);
      const conditions: any[] = [isNull(workProjects.deletedAt)];
      if (input?.cursor) conditions.push(gt(workProjects.id, input.cursor));
      if (input?.teamId) conditions.push(eq(workProjects.teamId, input.teamId));
      if (input?.search?.trim()) conditions.push(like(workProjects.name, `%${input.search.trim()}%`));
      const rows = await db.select({
        id: workProjects.id, slug: workProjects.slug, name: workProjects.name, teamId: workProjects.teamId, ownerId: workProjects.ownerId,
        privacy: workProjects.privacy, defaultView: workProjects.defaultView, color: workProjects.color, icon: workProjects.icon, dueOn: workProjects.dueOn,
        dueAt: workProjects.dueAt, archivedAt: workProjects.archivedAt, createdAt: workProjects.createdAt, updatedAt: workProjects.updatedAt,
        teamName: workTeams.name, ownerName: users.name,
      }).from(workProjects).leftJoin(workTeams, eq(workProjects.teamId, workTeams.id)).leftJoin(users, eq(workProjects.ownerId, users.id))
        .where(and(...conditions)).orderBy(asc(workProjects.id)).limit(limit + 1);
      const permitted = [] as typeof rows;
      for (const row of rows) {
        if (await getProjectAccess(ctx.user, row.id)) permitted.push(row);
      }
      const sliced = permitted.slice(0, limit);
      const ids = sliced.map(p => p.id);
      const counts = ids.length ? await db.select({ projectId: workTaskProjectMemberships.projectId, total: sql<number>`count(*)`, completed: sql<number>`sum(case when ${workTasks.completionStatus} = 'complete' then 1 else 0 end)` })
        .from(workTaskProjectMemberships).leftJoin(workTasks, eq(workTaskProjectMemberships.taskId, workTasks.id))
        .where(and(inArray(workTaskProjectMemberships.projectId, ids), isNull(workTaskProjectMemberships.deletedAt), isNull(workTasks.deletedAt))).groupBy(workTaskProjectMemberships.projectId) : [];
      const countByProject = new Map(counts.map(c => [c.projectId, { total: Number(c.total), completed: Number(c.completed ?? 0) }]));
      return { items: sliced.map(p => ({ ...p, taskCounts: countByProject.get(p.id) ?? { total: 0, completed: 0 } })), nextCursor: rows.length > limit ? sliced.at(-1)?.id ?? null : null };
    }),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.id, "viewer");
      const db = await getRequiredDb();
      const [project] = await db.select({
        id: workProjects.id, slug: workProjects.slug, name: workProjects.name, descriptionJson: workProjects.descriptionJson, descriptionPlainText: workProjects.descriptionPlainText,
        teamId: workProjects.teamId, ownerId: workProjects.ownerId, privacy: workProjects.privacy, defaultAccessLevel: workProjects.defaultAccessLevel,
        defaultView: workProjects.defaultView, color: workProjects.color, icon: workProjects.icon, externalGoalRef: workProjects.externalGoalRef,
        startOn: workProjects.startOn, startAt: workProjects.startAt, dueOn: workProjects.dueOn, dueAt: workProjects.dueAt, archivedAt: workProjects.archivedAt,
        teamName: workTeams.name, ownerName: users.name, createdAt: workProjects.createdAt, updatedAt: workProjects.updatedAt,
      }).from(workProjects).leftJoin(workTeams, eq(workProjects.teamId, workTeams.id)).leftJoin(users, eq(workProjects.ownerId, users.id))
        .where(and(eq(workProjects.id, input.id), isNull(workProjects.deletedAt))).limit(1);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      const [sections, members, fields, updates] = await Promise.all([
        db.select().from(workProjectSections).where(and(eq(workProjectSections.projectId, input.id), isNull(workProjectSections.deletedAt))).orderBy(asc(workProjectSections.position)),
        db.select({ userId: workProjectMembers.userId, accessLevel: workProjectMembers.accessLevel, name: users.name, email: users.email }).from(workProjectMembers).leftJoin(users, eq(workProjectMembers.userId, users.id)).where(and(eq(workProjectMembers.projectId, input.id), isNull(workProjectMembers.deletedAt))),
        db.select({ id: workCustomFields.id, name: workCustomFields.name, fieldType: workCustomFields.fieldType, enumOptions: workCustomFields.enumOptions, position: workProjectCustomFields.position }).from(workProjectCustomFields).leftJoin(workCustomFields, eq(workProjectCustomFields.customFieldId, workCustomFields.id)).where(and(eq(workProjectCustomFields.projectId, input.id), isNull(workProjectCustomFields.deletedAt))).orderBy(asc(workProjectCustomFields.position)),
        db.select().from(workStatusUpdates).where(and(eq(workStatusUpdates.projectId, input.id), isNull(workStatusUpdates.deletedAt))).orderBy(desc(workStatusUpdates.createdAt)).limit(10),
      ]);
      return { ...project, sections, members, customFields: fields, statusUpdates: updates };
    }),
    create: protectedProcedure.input(z.object({ name: z.string().min(1).max(255), teamId: z.number().int().positive().nullable().optional(), ownerId: z.number().int().positive().nullable().optional(), descriptionJson: richText, descriptionPlainText: z.string().max(100000).optional(), privacy: z.enum(["public_to_team", "private_to_members", "public_to_workspace"]).default("public_to_team"), defaultAccessLevel: accessLevelInput.default("editor"), defaultView: z.enum(["list", "board", "timeline", "calendar", "overview", "files"]).default("list"), color: z.string().max(32).optional(), icon: z.string().max(64).optional(), externalGoalRef: z.string().max(1000).optional(), startOn: dateInput, dueOn: dateInput, startAt: dateTimeInput, dueAt: dateTimeInput, memberIds: z.array(z.number().int().positive()).optional(), initialSectionName: z.string().min(1).max(255).optional() })).mutation(async ({ ctx, input }) => {
      if (input.teamId) await requireProjectAccess(ctx.user, input.teamId, "viewer").catch(async () => { if (!atLeast(await getTeamAccess(ctx.user, input.teamId!), "editor")) throw new TRPCError({ code: "FORBIDDEN", message: "Team editor access is required." }); });
      const db = await getRequiredDb();
      const descriptionPlainText = input.descriptionPlainText ?? plainTextFromDoc(input.descriptionJson);
      const [result] = await db.insert(workProjects).values({
        slug: slugify(input.name), name: input.name.trim(), teamId: input.teamId ?? null, ownerId: input.ownerId ?? ctx.user.id,
        descriptionJson: input.descriptionJson ?? null, descriptionPlainText: descriptionPlainText || null, privacy: input.privacy, defaultAccessLevel: input.defaultAccessLevel,
        defaultView: input.defaultView, color: input.color ?? null, icon: input.icon ?? null, externalGoalRef: input.externalGoalRef ?? null,
        startOn: input.startOn ?? null, dueOn: input.dueOn ?? null, startAt: input.startAt ?? null, dueAt: input.dueAt ?? null, createdById: ctx.user.id,
      });
      const projectId = Number(result.insertId);
      const memberIds = Array.from(new Set([ctx.user.id, ...(input.memberIds ?? [])]));
      await db.insert(workProjectMembers).values(memberIds.map(userId => ({ projectId, userId, accessLevel: userId === ctx.user.id ? "admin" as const : "editor" as const })));
      await db.insert(workProjectSections).values({ projectId, name: input.initialSectionName ?? "To do", position: "a0", createdById: ctx.user.id });
      await writeStory({ projectId, actorId: ctx.user.id, storyType: "created", contentPlainText: `Created project ${input.name.trim()}.` });
      return { id: projectId, slug: slugify(input.name) };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(1).max(255).optional(), ownerId: z.number().int().positive().nullable().optional(), descriptionJson: richText, descriptionPlainText: z.string().max(100000).nullable().optional(), privacy: z.enum(["public_to_team", "private_to_members", "public_to_workspace"]).optional(), defaultAccessLevel: accessLevelInput.optional(), defaultView: z.enum(["list", "board", "timeline", "calendar", "overview", "files"]).optional(), color: z.string().max(32).nullable().optional(), icon: z.string().max(64).nullable().optional(), externalGoalRef: z.string().max(1000).nullable().optional(), startOn: dateInput, dueOn: dateInput, startAt: dateTimeInput, dueAt: dateTimeInput, archivedAt: dateTimeInput })).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.id, "editor");
      const db = await getRequiredDb();
      const { id, ...fields } = input;
      const payload: Record<string, unknown> = { ...fields };
      if (fields.descriptionJson && fields.descriptionPlainText === undefined) payload.descriptionPlainText = plainTextFromDoc(fields.descriptionJson);
      await db.update(workProjects).set(payload as any).where(eq(workProjects.id, id));
      await writeStory({ projectId: id, actorId: ctx.user.id, storyType: "updated", contentPlainText: "Updated project details." });
      return { success: true };
    }),
    addMember: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), userId: z.number().int().positive(), accessLevel: accessLevelInput.default("viewer") })).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.projectId, "admin");
      const db = await getRequiredDb();
      const [existing] = await db.select().from(workProjectMembers).where(and(eq(workProjectMembers.projectId, input.projectId), eq(workProjectMembers.userId, input.userId))).limit(1);
      if (existing) await db.update(workProjectMembers).set({ accessLevel: input.accessLevel, deletedAt: null }).where(eq(workProjectMembers.id, existing.id));
      else await db.insert(workProjectMembers).values({ projectId: input.projectId, userId: input.userId, accessLevel: input.accessLevel });
      await writeStory({ projectId: input.projectId, actorId: ctx.user.id, storyType: "member_added", contentPlainText: "Added a project member.", metadata: { userId: input.userId, accessLevel: input.accessLevel } });
      return { success: true };
    }),
    addMessage: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), subject: z.string().max(255).optional(), contentJson: richText, contentPlainText: z.string().min(1).max(100000), mentionedUserIds: z.array(z.number().int().positive()).optional() })).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.projectId, "commenter");
      const storyId = await writeStory({ projectId: input.projectId, actorId: ctx.user.id, storyType: "comment", contentJson: input.contentJson, contentPlainText: input.contentPlainText, metadata: { subject: input.subject?.trim() || null, channel: "project_messages" } });
      await notifyUsers({ userIds: input.mentionedUserIds ?? [], actorId: ctx.user.id, type: "mention", title: input.subject?.trim() || "You were mentioned in a project message", body: input.contentPlainText.slice(0, 500), projectId: input.projectId, storyId });
      return { id: storyId };
    }),
    listMessages: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), limit: z.number().int().min(1).max(100).optional() })).query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.projectId, "viewer");
      const db = await getRequiredDb();
      return db.select({ id: workStories.id, contentPlainText: workStories.contentPlainText, metadata: workStories.metadata, actorId: workStories.actorId, actorName: users.name, createdAt: workStories.createdAt })
        .from(workStories).leftJoin(users, eq(workStories.actorId, users.id))
        .where(and(eq(workStories.projectId, input.projectId), eq(workStories.storyType, "comment")))
        .orderBy(desc(workStories.createdAt)).limit(input.limit ?? 100);
    }),
    archive: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.id, "editor");
      await (await getRequiredDb()).update(workProjects).set({ archivedAt: new Date() }).where(eq(workProjects.id, input.id));
      await writeStory({ projectId: input.id, actorId: ctx.user.id, storyType: "updated", contentPlainText: "Archived project." });
      return { success: true };
    }),
    unarchive: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.id, "editor");
      await (await getRequiredDb()).update(workProjects).set({ archivedAt: null }).where(eq(workProjects.id, input.id));
      await writeStory({ projectId: input.id, actorId: ctx.user.id, storyType: "updated", contentPlainText: "Unarchived project." });
      return { success: true };
    }),
    moveToTeam: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), teamId: z.number().int().positive().nullable() })).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.projectId, "admin");
      if (input.teamId && !atLeast(await getTeamAccess(ctx.user, input.teamId), "editor")) throw new TRPCError({ code: "FORBIDDEN", message: "Team editor access is required." });
      await (await getRequiredDb()).update(workProjects).set({ teamId: input.teamId }).where(eq(workProjects.id, input.projectId));
      await writeStory({ projectId: input.projectId, actorId: ctx.user.id, storyType: "updated", contentPlainText: input.teamId ? "Moved project to a team." : "Removed project from its team." });
      return { success: true };
    }),
    removeMember: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.projectId, "admin");
      const db = await getRequiredDb();
      await db.update(workProjectMembers).set({ deletedAt: new Date() }).where(and(eq(workProjectMembers.projectId, input.projectId), eq(workProjectMembers.userId, input.userId), isNull(workProjectMembers.deletedAt)));
      await writeStory({ projectId: input.projectId, actorId: ctx.user.id, storyType: "updated", contentPlainText: "Removed a project member.", metadata: { userId: input.userId } });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.id, "admin");
      const db = await getRequiredDb();
      await db.update(workProjects).set({ deletedAt: new Date() }).where(eq(workProjects.id, input.id));
      return { success: true };
    }),
  }),

  sections: router({
    create: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), name: z.string().min(1).max(255), position: rankInput })).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.projectId, "editor");
      const db = await getRequiredDb();
      const [result] = await db.insert(workProjectSections).values({ projectId: input.projectId, name: input.name.trim(), position: input.position ?? nextRank(), createdById: ctx.user.id });
      return { id: Number(result.insertId) };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(1).max(255).optional(), position: rankInput, isCollapsed: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getRequiredDb();
      const [section] = await db.select().from(workProjectSections).where(and(eq(workProjectSections.id, input.id), isNull(workProjectSections.deletedAt))).limit(1);
      if (!section) throw new TRPCError({ code: "NOT_FOUND", message: "Section not found." });
      await requireProjectAccess(ctx.user, section.projectId, "editor");
      const { id, ...fields } = input;
      await db.update(workProjectSections).set(fields).where(eq(workProjectSections.id, id));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getRequiredDb();
      const [section] = await db.select().from(workProjectSections).where(and(eq(workProjectSections.id, input.id), isNull(workProjectSections.deletedAt))).limit(1);
      if (!section) throw new TRPCError({ code: "NOT_FOUND", message: "Section not found." });
      await requireProjectAccess(ctx.user, section.projectId, "editor");
      await db.update(workProjectSections).set({ deletedAt: new Date() }).where(eq(workProjectSections.id, input.id));
      await db.update(workTaskProjectMemberships).set({ sectionId: null }).where(and(eq(workTaskProjectMemberships.sectionId, input.id), isNull(workTaskProjectMemberships.deletedAt)));
      return { success: true };
    }),
  }),

  customFields: router({
    list: protectedProcedure.query(async () => {
      const db = await getRequiredDb();
      return db.select().from(workCustomFields).where(isNull(workCustomFields.deletedAt)).orderBy(asc(workCustomFields.name));
    }),
    create: protectedProcedure.input(z.object({ name: z.string().min(1).max(255), description: z.string().max(2000).optional(), fieldType: z.enum(["text", "number", "date", "enum", "multi_enum", "person", "boolean", "url", "formula"]), enumOptions: z.array(z.object({ id: z.string(), label: z.string(), color: z.string().optional() })).optional(), config: jsonObject.optional() })).mutation(async ({ ctx, input }) => {
      const db = await getRequiredDb();
      const [result] = await db.insert(workCustomFields).values({ slug: slugify(input.name), name: input.name.trim(), description: input.description ?? null, fieldType: input.fieldType, enumOptions: input.enumOptions ?? null, config: input.config ?? null, createdById: ctx.user.id });
      return { id: Number(result.insertId) };
    }),
    addToProject: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), customFieldId: z.number().int().positive(), position: rankInput, isRequired: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.projectId, "editor");
      const db = await getRequiredDb();
      const [existing] = await db.select().from(workProjectCustomFields).where(and(eq(workProjectCustomFields.projectId, input.projectId), eq(workProjectCustomFields.customFieldId, input.customFieldId))).limit(1);
      if (existing) await db.update(workProjectCustomFields).set({ deletedAt: null, position: input.position ?? existing.position, isRequired: input.isRequired ?? existing.isRequired }).where(eq(workProjectCustomFields.id, existing.id));
      else await db.insert(workProjectCustomFields).values({ projectId: input.projectId, customFieldId: input.customFieldId, position: input.position ?? nextRank(), isRequired: input.isRequired ?? false });
      return { success: true };
    }),
  }),

  tags: router({
    list: protectedProcedure.query(async () => (await getRequiredDb()).select().from(workTags).where(isNull(workTags.deletedAt)).orderBy(asc(workTags.name))),
    create: protectedProcedure.input(z.object({ name: z.string().min(1).max(128), color: z.string().max(32).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getRequiredDb();
      const [result] = await db.insert(workTags).values({ slug: slugify(input.name), name: input.name.trim(), color: input.color ?? null, createdById: ctx.user.id });
      return { id: Number(result.insertId) };
    }),
  }),

  tasks: router({
    listForProject: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), cursor: z.number().int().positive().optional(), limit: z.number().int().min(1).max(100).optional(), sectionId: z.number().int().positive().nullable().optional(), fields: z.string().optional() })).query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.projectId, "viewer");
      const db = await getRequiredDb();
      const limit = validateCursorLimit(input.limit);
      const conditions: any[] = [eq(workTaskProjectMemberships.projectId, input.projectId), isNull(workTaskProjectMemberships.deletedAt), isNull(workTasks.deletedAt)];
      if (input.sectionId !== undefined) conditions.push(input.sectionId === null ? isNull(workTaskProjectMemberships.sectionId) : eq(workTaskProjectMemberships.sectionId, input.sectionId));
      if (input.cursor) conditions.push(gt(workTasks.id, input.cursor));
      const rows = await db.select({
        id: workTasks.id, slug: workTasks.slug, name: workTasks.name, taskType: workTasks.taskType, completionStatus: workTasks.completionStatus,
        completedAt: workTasks.completedAt, parentTaskId: workTasks.parentTaskId, startOn: workTasks.startOn, startAt: workTasks.startAt, dueOn: workTasks.dueOn, dueAt: workTasks.dueAt,
        actualTimeMinutes: workTasks.actualTimeMinutes, createdAt: workTasks.createdAt, updatedAt: workTasks.updatedAt,
        sectionId: workTaskProjectMemberships.sectionId, position: workTaskProjectMemberships.position,
      }).from(workTaskProjectMemberships).innerJoin(workTasks, eq(workTaskProjectMemberships.taskId, workTasks.id)).where(and(...conditions)).orderBy(asc(workTaskProjectMemberships.position), asc(workTasks.id)).limit(limit + 1);
      const items = rows.slice(0, limit);
      const taskIds = items.map(t => t.id);
      const assignees = taskIds.length ? await db.select({ taskId: workTaskAssignees.taskId, userId: workTaskAssignees.userId, name: users.name }).from(workTaskAssignees).leftJoin(users, eq(workTaskAssignees.userId, users.id)).where(and(inArray(workTaskAssignees.taskId, taskIds), isNull(workTaskAssignees.deletedAt))) : [];
      const assigneeByTask = new Map<number, typeof assignees>();
      for (const assignee of assignees) assigneeByTask.set(assignee.taskId, [...(assigneeByTask.get(assignee.taskId) ?? []), assignee]);
      return { items: items.map(task => ({ ...task, assignees: assigneeByTask.get(task.id) ?? [] })), nextCursor: rows.length > limit ? items.at(-1)?.id ?? null : null };
    }),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await requireTaskAccess(ctx.user, input.id, "viewer");
      const db = await getRequiredDb();
      const [task] = await db.select().from(workTasks).where(and(eq(workTasks.id, input.id), isNull(workTasks.deletedAt))).limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      const [memberships, assignees, followers, dependencies, customValues, stories, subtasks] = await Promise.all([
        db.select({ projectId: workTaskProjectMemberships.projectId, projectName: workProjects.name, sectionId: workTaskProjectMemberships.sectionId, sectionName: workProjectSections.name, position: workTaskProjectMemberships.position }).from(workTaskProjectMemberships).leftJoin(workProjects, eq(workTaskProjectMemberships.projectId, workProjects.id)).leftJoin(workProjectSections, eq(workTaskProjectMemberships.sectionId, workProjectSections.id)).where(and(eq(workTaskProjectMemberships.taskId, input.id), isNull(workTaskProjectMemberships.deletedAt))),
        db.select({ userId: workTaskAssignees.userId, name: users.name, email: users.email }).from(workTaskAssignees).leftJoin(users, eq(workTaskAssignees.userId, users.id)).where(and(eq(workTaskAssignees.taskId, input.id), isNull(workTaskAssignees.deletedAt))),
        db.select({ userId: workTaskFollowers.userId, name: users.name }).from(workTaskFollowers).leftJoin(users, eq(workTaskFollowers.userId, users.id)).where(and(eq(workTaskFollowers.taskId, input.id), isNull(workTaskFollowers.deletedAt))),
        db.select({ id: workTaskDependencies.id, dependsOnTaskId: workTaskDependencies.dependsOnTaskId, taskName: workTasks.name }).from(workTaskDependencies).leftJoin(workTasks, eq(workTaskDependencies.dependsOnTaskId, workTasks.id)).where(and(eq(workTaskDependencies.taskId, input.id), isNull(workTaskDependencies.deletedAt))),
        db.select({ customFieldId: workTaskCustomFieldValues.customFieldId, name: workCustomFields.name, fieldType: workCustomFields.fieldType, value: workTaskCustomFieldValues.value, plainTextValue: workTaskCustomFieldValues.plainTextValue }).from(workTaskCustomFieldValues).leftJoin(workCustomFields, eq(workTaskCustomFieldValues.customFieldId, workCustomFields.id)).where(and(eq(workTaskCustomFieldValues.taskId, input.id), isNull(workTaskCustomFieldValues.deletedAt))),
        db.select({ id: workStories.id, storyType: workStories.storyType, contentJson: workStories.contentJson, contentPlainText: workStories.contentPlainText, metadata: workStories.metadata, actorId: workStories.actorId, actorName: users.name, createdAt: workStories.createdAt }).from(workStories).leftJoin(users, eq(workStories.actorId, users.id)).where(eq(workStories.taskId, input.id)).orderBy(desc(workStories.createdAt)).limit(100),
        db.select({ id: workTasks.id, name: workTasks.name, completionStatus: workTasks.completionStatus, dueOn: workTasks.dueOn, position: workTasks.position }).from(workTasks).where(and(eq(workTasks.parentTaskId, input.id), isNull(workTasks.deletedAt))).orderBy(asc(workTasks.position)),
      ]);
      return { ...task, memberships, assignees, followers, dependencies, customValues, stories, subtasks };
    }),
    create: protectedProcedure.input(z.object({ name: z.string().min(1).max(512), projectId: z.number().int().positive().optional(), sectionId: z.number().int().positive().nullable().optional(), parentTaskId: z.number().int().positive().nullable().optional(), descriptionJson: richText, descriptionPlainText: z.string().max(100000).optional(), taskType: z.enum(["default_task", "milestone", "approval"]).default("default_task"), startOn: dateInput, startAt: dateTimeInput, dueOn: dateInput, dueAt: dateTimeInput, actualTimeMinutes: z.number().int().min(0).nullable().optional(), assigneeIds: z.array(z.number().int().positive()).optional(), followerIds: z.array(z.number().int().positive()).optional(), tagIds: z.array(z.number().int().positive()).optional(), position: rankInput })).mutation(async ({ ctx, input }) => {
      if (input.projectId) await requireProjectAccess(ctx.user, input.projectId, "editor");
      if (input.parentTaskId) await requireTaskAccess(ctx.user, input.parentTaskId, "editor");
      const db = await getRequiredDb();
      const descriptionPlainText = input.descriptionPlainText ?? plainTextFromDoc(input.descriptionJson);
      const [result] = await db.insert(workTasks).values({
        slug: slugify(input.name), name: input.name.trim(), parentTaskId: input.parentTaskId ?? null, descriptionJson: input.descriptionJson ?? null,
        descriptionPlainText: descriptionPlainText || null, taskType: input.taskType, startOn: input.startOn ?? null, startAt: input.startAt ?? null,
        dueOn: input.dueOn ?? null, dueAt: input.dueAt ?? null, actualTimeMinutes: input.actualTimeMinutes ?? null, position: input.position ?? nextRank(), createdById: ctx.user.id,
      });
      const taskId = Number(result.insertId);
      if (input.projectId) {
        await db.insert(workTaskProjectMemberships).values({ taskId, projectId: input.projectId, sectionId: input.sectionId ?? null, position: input.position ?? nextRank(), addedById: ctx.user.id });
      }
      if (input.assigneeIds?.length) await db.insert(workTaskAssignees).values(Array.from(new Set(input.assigneeIds)).map(userId => ({ taskId, userId })));
      if (input.followerIds?.length) await db.insert(workTaskFollowers).values(Array.from(new Set(input.followerIds)).map(userId => ({ taskId, userId })));
      if (input.tagIds?.length) await db.insert(workTaskTags).values(Array.from(new Set(input.tagIds)).map(tagId => ({ taskId, tagId })));
      const storyId = await writeStory({ taskId, projectId: input.projectId ?? null, actorId: ctx.user.id, storyType: "created", contentPlainText: `Created task ${input.name.trim()}.` });
      if (input.assigneeIds?.length) await notifyUsers({ userIds: input.assigneeIds, actorId: ctx.user.id, type: "assignment", title: `Assigned to task: ${input.name.trim()}`, taskId, projectId: input.projectId ?? null, storyId });
      if (input.projectId) await evaluateProjectRules(input.projectId, taskId, "task_added", ctx.user.id, {});
      return { id: taskId };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(1).max(512).optional(), descriptionJson: richText, descriptionPlainText: z.string().max(100000).nullable().optional(), taskType: z.enum(["default_task", "milestone", "approval"]).optional(), startOn: dateInput, startAt: dateTimeInput, dueOn: dateInput, dueAt: dateTimeInput, actualTimeMinutes: z.number().int().min(0).nullable().optional(), parentTaskId: z.number().int().positive().nullable().optional(), assigneeIds: z.array(z.number().int().positive()).optional(), customFieldValues: z.array(z.object({ customFieldId: z.number().int().positive(), value: z.unknown(), plainTextValue: z.string().max(10000).optional() })).optional() })).mutation(async ({ ctx, input }) => {
      await requireTaskAccess(ctx.user, input.id, "editor");
      const db = await getRequiredDb();
      const { id, assigneeIds, customFieldValues, ...fields } = input;
      const payload: Record<string, unknown> = { ...fields };
      if (fields.descriptionJson && fields.descriptionPlainText === undefined) payload.descriptionPlainText = plainTextFromDoc(fields.descriptionJson);
      await db.update(workTasks).set(payload as any).where(eq(workTasks.id, id));
      const projectIds = await projectTaskContext(id);
      if (assigneeIds !== undefined) {
        await db.update(workTaskAssignees).set({ deletedAt: new Date() }).where(and(eq(workTaskAssignees.taskId, id), isNull(workTaskAssignees.deletedAt)));
        for (const userId of Array.from(new Set(assigneeIds))) {
          const [existing] = await db.select().from(workTaskAssignees).where(and(eq(workTaskAssignees.taskId, id), eq(workTaskAssignees.userId, userId))).limit(1);
          if (existing) await db.update(workTaskAssignees).set({ deletedAt: null }).where(eq(workTaskAssignees.id, existing.id));
          else await db.insert(workTaskAssignees).values({ taskId: id, userId });
        }
        await notifyUsers({ userIds: assigneeIds, actorId: ctx.user.id, type: "assignment", title: "You were assigned a task", taskId: id, projectId: projectIds[0] ?? null });
      }
      if (customFieldValues?.length) {
        for (const field of customFieldValues) {
          await db.delete(workTaskCustomFieldValues).where(and(eq(workTaskCustomFieldValues.taskId, id), eq(workTaskCustomFieldValues.customFieldId, field.customFieldId)));
          await db.insert(workTaskCustomFieldValues).values({ taskId: id, customFieldId: field.customFieldId, value: field.value, plainTextValue: field.plainTextValue ?? (typeof field.value === "string" ? field.value : JSON.stringify(field.value)) });
          for (const projectId of projectIds) await evaluateProjectRules(projectId, id, "custom_field_changed", ctx.user.id, { customFieldId: field.customFieldId, value: field.value });
        }
      }
      const storyType = fields.dueOn !== undefined || fields.dueAt !== undefined ? "due_date_changed" as const : "updated" as const;
      for (const projectId of projectIds) await writeStory({ taskId: id, projectId, actorId: ctx.user.id, storyType, contentPlainText: storyType === "due_date_changed" ? "Changed task due date." : "Updated task." });
      return { success: true };
    }),
    complete: protectedProcedure.input(z.object({ id: z.number().int().positive(), completed: z.boolean() })).mutation(async ({ ctx, input }) => {
      await requireTaskAccess(ctx.user, input.id, "editor");
      const db = await getRequiredDb();
      await db.update(workTasks).set({ completionStatus: input.completed ? "complete" : "incomplete", completedAt: input.completed ? new Date() : null, completedById: input.completed ? ctx.user.id : null }).where(eq(workTasks.id, input.id));
      const projectIds = await projectTaskContext(input.id);
      for (const projectId of projectIds) {
        await writeStory({ taskId: input.id, projectId, actorId: ctx.user.id, storyType: "completed", contentPlainText: input.completed ? "Completed task." : "Reopened task." });
        if (input.completed) await evaluateProjectRules(projectId, input.id, "task_completed", ctx.user.id, { completionStatus: "complete" });
      }
      return { success: true };
    }),
    move: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), projectId: z.number().int().positive(), sectionId: z.number().int().positive().nullable(), position: z.string().min(1).max(64) })).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.projectId, "editor");
      await requireTaskAccess(ctx.user, input.taskId, "editor");
      const db = await getRequiredDb();
      await db.update(workTaskProjectMemberships).set({ sectionId: input.sectionId, position: input.position }).where(and(eq(workTaskProjectMemberships.taskId, input.taskId), eq(workTaskProjectMemberships.projectId, input.projectId), isNull(workTaskProjectMemberships.deletedAt)));
      await writeStory({ taskId: input.taskId, projectId: input.projectId, actorId: ctx.user.id, storyType: "section_changed", contentPlainText: "Moved task.", metadata: { sectionId: input.sectionId } });
      await evaluateProjectRules(input.projectId, input.taskId, "task_moved", ctx.user.id, { sectionId: input.sectionId });
      return { success: true };
    }),
    addToProject: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), projectId: z.number().int().positive(), sectionId: z.number().int().positive().nullable().optional(), position: rankInput })).mutation(async ({ ctx, input }) => {
      await requireTaskAccess(ctx.user, input.taskId, "editor");
      await requireProjectAccess(ctx.user, input.projectId, "editor");
      const db = await getRequiredDb();
      const [existing] = await db.select().from(workTaskProjectMemberships).where(and(eq(workTaskProjectMemberships.taskId, input.taskId), eq(workTaskProjectMemberships.projectId, input.projectId))).limit(1);
      if (existing) await db.update(workTaskProjectMemberships).set({ sectionId: input.sectionId ?? null, position: input.position ?? nextRank(), deletedAt: null }).where(eq(workTaskProjectMemberships.id, existing.id));
      else await db.insert(workTaskProjectMemberships).values({ taskId: input.taskId, projectId: input.projectId, sectionId: input.sectionId ?? null, position: input.position ?? nextRank(), addedById: ctx.user.id });
      await writeStory({ taskId: input.taskId, projectId: input.projectId, actorId: ctx.user.id, storyType: "updated", contentPlainText: "Added task to project." });
      return { success: true };
    }),
    addComment: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), contentJson: richText, contentPlainText: z.string().min(1).max(100000), mentionedUserIds: z.array(z.number().int().positive()).optional() })).mutation(async ({ ctx, input }) => {
      await requireTaskAccess(ctx.user, input.taskId, "commenter");
      const projectIds = await projectTaskContext(input.taskId);
      const storyId = await writeStory({ taskId: input.taskId, projectId: projectIds[0] ?? null, actorId: ctx.user.id, storyType: "comment", contentJson: input.contentJson, contentPlainText: input.contentPlainText });
      await notifyUsers({ userIds: input.mentionedUserIds ?? [], actorId: ctx.user.id, type: "mention", title: "You were mentioned in a task comment", body: input.contentPlainText.slice(0, 500), taskId: input.taskId, projectId: projectIds[0] ?? null, storyId });
      return { id: storyId };
    }),
    addDependency: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), dependsOnTaskId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (input.taskId === input.dependsOnTaskId) throw new TRPCError({ code: "BAD_REQUEST", message: "A task cannot depend on itself." });
      await requireTaskAccess(ctx.user, input.taskId, "editor");
      await requireTaskAccess(ctx.user, input.dependsOnTaskId, "viewer");
      const db = await getRequiredDb();
      const [existing] = await db.select().from(workTaskDependencies).where(and(eq(workTaskDependencies.taskId, input.taskId), eq(workTaskDependencies.dependsOnTaskId, input.dependsOnTaskId))).limit(1);
      if (existing) await db.update(workTaskDependencies).set({ deletedAt: null }).where(eq(workTaskDependencies.id, existing.id));
      else await db.insert(workTaskDependencies).values({ taskId: input.taskId, dependsOnTaskId: input.dependsOnTaskId, createdById: ctx.user.id });
      const projectIds = await projectTaskContext(input.taskId);
      for (const projectId of projectIds) await writeStory({ taskId: input.taskId, projectId, actorId: ctx.user.id, storyType: "dependency_added", contentPlainText: "Added a dependency.", metadata: { dependsOnTaskId: input.dependsOnTaskId } });
      return { success: true };
    }),
    follow: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), following: z.boolean() })).mutation(async ({ ctx, input }) => {
      await requireTaskAccess(ctx.user, input.taskId, "viewer");
      const db = await getRequiredDb();
      const [existing] = await db.select().from(workTaskFollowers).where(and(eq(workTaskFollowers.taskId, input.taskId), eq(workTaskFollowers.userId, ctx.user.id))).limit(1);
      if (existing) await db.update(workTaskFollowers).set({ deletedAt: input.following ? null : new Date() }).where(eq(workTaskFollowers.id, existing.id));
      else if (input.following) await db.insert(workTaskFollowers).values({ taskId: input.taskId, userId: ctx.user.id });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireTaskAccess(ctx.user, input.id, "editor");
      const db = await getRequiredDb();
      await db.update(workTasks).set({ deletedAt: new Date() }).where(eq(workTasks.id, input.id));
      return { success: true };
    }),
  }),

  myTasks: router({
    list: protectedProcedure.input(z.object({ cursor: z.number().int().positive().optional(), limit: z.number().int().min(1).max(100).optional() }).optional()).query(async ({ ctx, input }) => {
      const db = await getRequiredDb();
      const limit = validateCursorLimit(input?.limit);
      const conditions: any[] = [eq(workTaskAssignees.userId, ctx.user.id), isNull(workTaskAssignees.deletedAt), isNull(workTasks.deletedAt)];
      if (input?.cursor) conditions.push(gt(workTasks.id, input.cursor));
      const rows = await db.select({ id: workTasks.id, slug: workTasks.slug, name: workTasks.name, completionStatus: workTasks.completionStatus, dueOn: workTasks.dueOn, dueAt: workTasks.dueAt, parentTaskId: workTasks.parentTaskId, createdAt: workTasks.createdAt }).from(workTaskAssignees).innerJoin(workTasks, eq(workTaskAssignees.taskId, workTasks.id)).where(and(...conditions)).orderBy(asc(workTasks.dueOn), asc(workTasks.id)).limit(limit + 1);
      const items = rows.slice(0, limit);
      return { items, nextCursor: rows.length > limit ? items.at(-1)?.id ?? null : null };
    }),
    assignedToOthers: protectedProcedure.input(z.object({ cursor: z.number().int().positive().optional(), limit: z.number().int().min(1).max(100).optional() }).optional()).query(async ({ ctx, input }) => {
      const db = await getRequiredDb();
      const limit = validateCursorLimit(input?.limit);
      const conditions: any[] = [eq(workTasks.createdById, ctx.user.id), sql`${workTaskAssignees.userId} <> ${ctx.user.id}`, isNull(workTaskAssignees.deletedAt), isNull(workTasks.deletedAt)];
      if (input?.cursor) conditions.push(gt(workTasks.id, input.cursor));
      const rows = await db.select({ id: workTasks.id, slug: workTasks.slug, name: workTasks.name, completionStatus: workTasks.completionStatus, dueOn: workTasks.dueOn, dueAt: workTasks.dueAt, assigneeId: workTaskAssignees.userId, assigneeName: users.name, createdAt: workTasks.createdAt })
        .from(workTasks).innerJoin(workTaskAssignees, eq(workTaskAssignees.taskId, workTasks.id)).leftJoin(users, eq(workTaskAssignees.userId, users.id))
        .where(and(...conditions)).orderBy(asc(users.name), asc(workTasks.dueOn), asc(workTasks.id)).limit(limit + 1);
      const items = rows.slice(0, limit);
      return { items, nextCursor: rows.length > limit ? items.at(-1)?.id ?? null : null };
    }),
    createSection: protectedProcedure.input(z.object({ name: z.string().min(1).max(255), position: rankInput })).mutation(async ({ ctx, input }) => {
      const db = await getRequiredDb();
      const [result] = await db.insert(workMyTaskSections).values({ userId: ctx.user.id, name: input.name.trim(), position: input.position ?? nextRank() });
      return { id: Number(result.insertId) };
    }),
    move: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), sectionId: z.number().int().positive().nullable(), position: z.string().min(1).max(64) })).mutation(async ({ ctx, input }) => {
      await requireTaskAccess(ctx.user, input.taskId, "viewer");
      const db = await getRequiredDb();
      const [existing] = await db.select().from(workMyTaskMemberships).where(and(eq(workMyTaskMemberships.userId, ctx.user.id), eq(workMyTaskMemberships.taskId, input.taskId))).limit(1);
      if (existing) await db.update(workMyTaskMemberships).set({ sectionId: input.sectionId, position: input.position, deletedAt: null }).where(eq(workMyTaskMemberships.id, existing.id));
      else await db.insert(workMyTaskMemberships).values({ userId: ctx.user.id, taskId: input.taskId, sectionId: input.sectionId, position: input.position });
      return { success: true };
    }),
  }),

  inbox: router({
    list: protectedProcedure.input(z.object({ cursor: z.number().int().positive().optional(), limit: z.number().int().min(1).max(100).optional(), unreadOnly: z.boolean().optional() }).optional()).query(async ({ ctx, input }) => {
      const db = await getRequiredDb();
      const limit = validateCursorLimit(input?.limit);
      const conditions: any[] = [eq(workNotifications.userId, ctx.user.id), isNull(workNotifications.deletedAt)];
      if (input?.cursor) conditions.push(gt(workNotifications.id, input.cursor));
      if (input?.unreadOnly) conditions.push(isNull(workNotifications.readAt));
      const rows = await db.select().from(workNotifications).where(and(...conditions)).orderBy(desc(workNotifications.createdAt), desc(workNotifications.id)).limit(limit + 1);
      const items = rows.slice(0, limit);
      return { items, nextCursor: rows.length > limit ? items.at(-1)?.id ?? null : null };
    }),
    markRead: protectedProcedure.input(z.object({ ids: z.array(z.number().int().positive()).min(1), read: z.boolean() })).mutation(async ({ ctx, input }) => {
      const db = await getRequiredDb();
      await db.update(workNotifications).set({ readAt: input.read ? new Date() : null }).where(and(eq(workNotifications.userId, ctx.user.id), inArray(workNotifications.id, input.ids), isNull(workNotifications.deletedAt)));
      return { success: true };
    }),
  }),

  portfolios: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getRequiredDb();
      const rows = await db.select().from(workPortfolios).where(isNull(workPortfolios.deletedAt)).orderBy(asc(workPortfolios.name));
      const result = [] as typeof rows;
      for (const portfolio of rows) {
        if (ctx.user.role === "admin" || portfolio.createdById === ctx.user.id || portfolio.ownerId === ctx.user.id || portfolio.privacy === "public_to_workspace") result.push(portfolio);
        else {
          const [member] = await db.select().from(workPortfolioMembers).where(and(eq(workPortfolioMembers.portfolioId, portfolio.id), eq(workPortfolioMembers.userId, ctx.user.id), isNull(workPortfolioMembers.deletedAt))).limit(1);
          if (member) result.push(portfolio);
        }
      }
      return result;
    }),
    create: protectedProcedure.input(z.object({ name: z.string().min(1).max(255), descriptionJson: richText, descriptionPlainText: z.string().max(100000).optional(), ownerId: z.number().int().positive().nullable().optional(), privacy: z.enum(["private_to_members", "public_to_workspace"]).default("private_to_members") })).mutation(async ({ ctx, input }) => {
      const db = await getRequiredDb();
      const [result] = await db.insert(workPortfolios).values({ slug: slugify(input.name), name: input.name.trim(), descriptionJson: input.descriptionJson ?? null, descriptionPlainText: (input.descriptionPlainText ?? plainTextFromDoc(input.descriptionJson)) || null, ownerId: input.ownerId ?? ctx.user.id, privacy: input.privacy, createdById: ctx.user.id });
      const portfolioId = Number(result.insertId);
      await db.insert(workPortfolioMembers).values({ portfolioId, userId: ctx.user.id, accessLevel: "admin" });
      return { id: portfolioId };
    }),
    items: protectedProcedure.input(z.object({ portfolioId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await getRequiredDb();
      const [portfolio] = await db.select().from(workPortfolios).where(and(eq(workPortfolios.id, input.portfolioId), isNull(workPortfolios.deletedAt))).limit(1);
      if (!portfolio) throw new TRPCError({ code: "NOT_FOUND", message: "Portfolio not found." });
      await requirePortfolioAccess(ctx.user, input.portfolioId, "viewer");
      return db.select({ id: workPortfolioItems.id, projectId: workPortfolioItems.projectId, projectName: workProjects.name, childPortfolioId: workPortfolioItems.childPortfolioId, childPortfolioName: workPortfolios.name, position: workPortfolioItems.position }).from(workPortfolioItems).leftJoin(workProjects, eq(workPortfolioItems.projectId, workProjects.id)).leftJoin(workPortfolios, eq(workPortfolioItems.childPortfolioId, workPortfolios.id)).where(and(eq(workPortfolioItems.portfolioId, input.portfolioId), isNull(workPortfolioItems.deletedAt))).orderBy(asc(workPortfolioItems.position));
    }),
    addProject: protectedProcedure.input(z.object({ portfolioId: z.number().int().positive(), projectId: z.number().int().positive(), position: rankInput })).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.projectId, "viewer");
      const db = await getRequiredDb();
      const [member] = await db.select().from(workPortfolioMembers).where(and(eq(workPortfolioMembers.portfolioId, input.portfolioId), eq(workPortfolioMembers.userId, ctx.user.id), isNull(workPortfolioMembers.deletedAt))).limit(1);
      const [portfolio] = await db.select().from(workPortfolios).where(eq(workPortfolios.id, input.portfolioId)).limit(1);
      if (ctx.user.role !== "admin" && portfolio?.createdById !== ctx.user.id && !atLeast(member?.accessLevel ?? null, "editor")) throw new TRPCError({ code: "FORBIDDEN" });
      await db.insert(workPortfolioItems).values({ portfolioId: input.portfolioId, projectId: input.projectId, position: input.position ?? nextRank(), createdById: ctx.user.id });
      return { success: true };
    }),
  }),

  statusUpdates: router({
    create: protectedProcedure.input(z.object({ projectId: z.number().int().positive().optional(), portfolioId: z.number().int().positive().optional(), status: z.enum(["on_track", "at_risk", "off_track", "complete"]), title: z.string().max(255).optional(), bodyJson: richText, bodyPlainText: z.string().max(100000).optional() }).refine(value => !!value.projectId || !!value.portfolioId, "A project or portfolio is required.")).mutation(async ({ ctx, input }) => {
      if (input.projectId) await requireProjectAccess(ctx.user, input.projectId, "editor");
      if (input.portfolioId) await requirePortfolioAccess(ctx.user, input.portfolioId, "editor");
      const db = await getRequiredDb();
      const [result] = await db.insert(workStatusUpdates).values({ projectId: input.projectId ?? null, portfolioId: input.portfolioId ?? null, status: input.status, title: input.title ?? null, bodyJson: input.bodyJson ?? null, bodyPlainText: (input.bodyPlainText ?? plainTextFromDoc(input.bodyJson)) || null, authorId: ctx.user.id });
      if (input.projectId) await writeStory({ projectId: input.projectId, actorId: ctx.user.id, storyType: "status_update", contentPlainText: input.title ?? "Posted a status update." });
      return { id: Number(result.insertId) };
    }),
  }),

  templates: router({
    list: protectedProcedure.input(z.object({ templateType: z.enum(["project", "task"]).optional() }).optional()).query(async ({ input }) => {
      const db = await getRequiredDb();
      return db.select().from(workTemplates).where(and(isNull(workTemplates.deletedAt), input?.templateType ? eq(workTemplates.templateType, input.templateType) : sql`true`)).orderBy(asc(workTemplates.name));
    }),
    create: protectedProcedure.input(z.object({ name: z.string().min(1).max(255), templateType: z.enum(["project", "task"]), description: z.string().max(5000).optional(), definition: jsonObject, teamId: z.number().int().positive().nullable().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getRequiredDb();
      const [result] = await db.insert(workTemplates).values({ slug: slugify(input.name), name: input.name.trim(), templateType: input.templateType, description: input.description ?? null, definition: input.definition, teamId: input.teamId ?? null, createdById: ctx.user.id });
      return { id: Number(result.insertId) };
    }),
    instantiateProject: protectedProcedure.input(z.object({ templateId: z.number().int().positive(), name: z.string().min(1).max(255), teamId: z.number().int().positive().nullable().optional(), ownerId: z.number().int().positive().nullable().optional(), anchorDate: z.string().date().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getRequiredDb();
      const [template] = await db.select().from(workTemplates).where(and(eq(workTemplates.id, input.templateId), eq(workTemplates.templateType, "project"), isNull(workTemplates.deletedAt))).limit(1);
      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Project template not found." });
      const definition = (template.definition ?? {}) as Record<string, any>;
      const [projectResult] = await db.insert(workProjects).values({ slug: slugify(input.name), name: input.name.trim(), descriptionJson: definition.descriptionJson ?? null, descriptionPlainText: definition.descriptionPlainText ?? null, teamId: input.teamId ?? template.teamId ?? null, ownerId: input.ownerId ?? ctx.user.id, privacy: definition.privacy ?? "public_to_team", defaultAccessLevel: definition.defaultAccessLevel ?? "editor", defaultView: definition.defaultView ?? "list", createdById: ctx.user.id });
      const projectId = Number(projectResult.insertId);
      await db.insert(workProjectMembers).values({ projectId, userId: ctx.user.id, accessLevel: "admin" });
      const sections = Array.isArray(definition.sections) && definition.sections.length ? definition.sections : [{ name: "To do" }];
      const sectionIdByKey = new Map<string, number>();
      for (let index = 0; index < sections.length; index += 1) {
        const section = sections[index];
        const [sectionResult] = await db.insert(workProjectSections).values({ projectId, name: String(section.name ?? "Untitled section"), position: String(section.position ?? `${index}0`), createdById: ctx.user.id });
        sectionIdByKey.set(String(section.key ?? section.name ?? index), Number(sectionResult.insertId));
      }
      const templateTasks = Array.isArray(definition.tasks) ? definition.tasks : [];
      for (let index = 0; index < templateTasks.length; index += 1) {
        const task = templateTasks[index];
        const offset = typeof task.relativeDueDays === "number" && input.anchorDate ? new Date(new Date(input.anchorDate).getTime() + task.relativeDueDays * 86400000) : null;
        const [taskResult] = await db.insert(workTasks).values({ slug: slugify(String(task.name ?? "Template task")), name: String(task.name ?? "Template task"), taskType: task.taskType ?? "default_task", dueOn: offset, position: `${index}0`, createdById: ctx.user.id });
        await db.insert(workTaskProjectMemberships).values({ taskId: Number(taskResult.insertId), projectId, sectionId: sectionIdByKey.get(String(task.sectionKey ?? task.section ?? "")) ?? null, position: `${index}0`, addedById: ctx.user.id });
      }
      return { id: projectId };
    }),
  }),

  forms: router({
    list: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.projectId, "viewer");
      return (await getRequiredDb()).select().from(workForms).where(and(eq(workForms.projectId, input.projectId), isNull(workForms.deletedAt))).orderBy(asc(workForms.name));
    }),
    create: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), name: z.string().min(1).max(255), description: z.string().max(5000).optional(), isPublic: z.boolean().default(false), targetSectionId: z.number().int().positive().nullable().optional(), fields: z.array(z.object({ label: z.string().min(1).max(255), fieldType: z.enum(["short_text", "long_text", "date", "number", "single_select", "multi_select", "person", "attachment"]), options: z.array(z.string()).optional(), taskField: z.string().max(64).optional(), customFieldId: z.number().int().positive().optional(), isRequired: z.boolean().optional() })).optional() })).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.projectId, "editor");
      const db = await getRequiredDb();
      const [result] = await db.insert(workForms).values({ slug: slugify(input.name), projectId: input.projectId, name: input.name.trim(), description: input.description ?? null, isPublic: input.isPublic, targetSectionId: input.targetSectionId ?? null, createdById: ctx.user.id });
      const formId = Number(result.insertId);
      if (input.fields?.length) await db.insert(workFormFields).values(input.fields.map((field, index) => ({ formId, label: field.label, fieldType: field.fieldType, options: field.options ?? null, taskField: field.taskField ?? null, customFieldId: field.customFieldId ?? null, isRequired: field.isRequired ?? false, position: `${index}0` })));
      return { id: formId };
    }),
    getPublic: publicProcedure.input(z.object({ slug: z.string().min(1) })).query(async ({ input }) => {
      const db = await getRequiredDb();
      const [form] = await db.select({ id: workForms.id, slug: workForms.slug, name: workForms.name, description: workForms.description, projectId: workForms.projectId, targetSectionId: workForms.targetSectionId }).from(workForms).where(and(eq(workForms.slug, input.slug), eq(workForms.isPublic, true), eq(workForms.isActive, true), isNull(workForms.deletedAt))).limit(1);
      if (!form) throw new TRPCError({ code: "NOT_FOUND", message: "Form not found." });
      const fields = await db.select().from(workFormFields).where(and(eq(workFormFields.formId, form.id), isNull(workFormFields.deletedAt))).orderBy(asc(workFormFields.position));
      return { ...form, fields };
    }),
    submitPublic: publicProcedure.input(z.object({ slug: z.string().min(1), title: z.string().min(1).max(512), description: z.string().max(100000).optional(), values: z.array(z.object({ fieldId: z.number().int().positive(), value: z.unknown() })).optional() })).mutation(async ({ input }) => {
      const db = await getRequiredDb();
      const [form] = await db.select().from(workForms).where(and(eq(workForms.slug, input.slug), eq(workForms.isPublic, true), eq(workForms.isActive, true), isNull(workForms.deletedAt))).limit(1);
      if (!form) throw new TRPCError({ code: "NOT_FOUND", message: "Form not found." });
      const [project] = await db.select().from(workProjects).where(eq(workProjects.id, form.projectId)).limit(1);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
      const fields = await db.select().from(workFormFields).where(and(eq(workFormFields.formId, form.id), isNull(workFormFields.deletedAt)));
      const suppliedById = new Map((input.values ?? []).map(supplied => [supplied.fieldId, supplied.value]));
      const missing = fields.filter(field => field.isRequired && (suppliedById.get(field.id) === undefined || suppliedById.get(field.id) === null || suppliedById.get(field.id) === ""));
      if (missing.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Please complete: ${missing.map(field => field.label).join(", ")}.` });
      const answers = fields.flatMap(field => {
        const value = suppliedById.get(field.id);
        return value === undefined || value === null || value === "" ? [] : [`${field.label}: ${typeof value === "string" ? value : JSON.stringify(value)}`];
      });
      const descriptionPlainText = [input.description?.trim(), answers.length ? `Form submission\n${answers.join("\n")}` : null].filter(Boolean).join("\n\n") || null;
      const [taskResult] = await db.insert(workTasks).values({ slug: slugify(input.title), name: input.title.trim(), descriptionPlainText, createdById: project.createdById });
      const taskId = Number(taskResult.insertId);
      await db.insert(workTaskProjectMemberships).values({ taskId, projectId: form.projectId, sectionId: form.targetSectionId, position: nextRank(), addedById: project.createdById });
      for (const supplied of input.values ?? []) {
        const field = fields.find(f => f.id === supplied.fieldId);
        if (field?.customFieldId) await db.insert(workTaskCustomFieldValues).values({ taskId, customFieldId: field.customFieldId, value: supplied.value, plainTextValue: typeof supplied.value === "string" ? supplied.value : JSON.stringify(supplied.value) });
      }
      await evaluateProjectRules(form.projectId, taskId, "form_submitted", project.createdById, {});
      return { id: taskId };
    }),
  }),

  rules: router({
    list: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.projectId, "viewer");
      const db = await getRequiredDb();
      const rules = await db.select().from(workRules).where(and(eq(workRules.projectId, input.projectId), isNull(workRules.deletedAt))).orderBy(asc(workRules.name));
      const ids = rules.map(rule => rule.id);
      const actions = ids.length ? await db.select().from(workRuleActions).where(and(inArray(workRuleActions.ruleId, ids), isNull(workRuleActions.deletedAt))).orderBy(asc(workRuleActions.position)) : [];
      return rules.map(rule => ({ ...rule, actions: actions.filter(action => action.ruleId === rule.id) }));
    }),
    create: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), name: z.string().min(1).max(255), trigger: z.enum(["task_added", "task_completed", "task_moved", "due_date_changed", "custom_field_changed", "form_submitted"]), conditions: z.array(jsonObject).default([]), actions: z.array(z.object({ actionType: z.enum(["move_to_section", "assign_user", "set_due_date", "set_custom_field", "add_follower", "create_task", "mark_complete"]), config: jsonObject })).min(1) })).mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.projectId, "editor");
      const db = await getRequiredDb();
      const [result] = await db.insert(workRules).values({ slug: slugify(input.name), projectId: input.projectId, name: input.name.trim(), trigger: input.trigger, conditions: input.conditions, createdById: ctx.user.id });
      const ruleId = Number(result.insertId);
      await db.insert(workRuleActions).values(input.actions.map((action, index) => ({ ruleId, actionType: action.actionType, config: action.config, position: `${index}0` })));
      return { id: ruleId };
    }),
    setActive: protectedProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
      const db = await getRequiredDb();
      const [rule] = await db.select().from(workRules).where(and(eq(workRules.id, input.id), isNull(workRules.deletedAt))).limit(1);
      if (!rule) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found." });
      await requireProjectAccess(ctx.user, rule.projectId, "editor");
      await db.update(workRules).set({ isActive: input.isActive }).where(eq(workRules.id, input.id));
      return { success: true };
    }),
  }),

  savedViews: router({
    list: protectedProcedure.input(z.object({ projectId: z.number().int().positive().nullable().optional() }).optional()).query(async ({ ctx, input }) => {
      const db = await getRequiredDb();
      return db.select().from(workSavedViews).where(and(eq(workSavedViews.userId, ctx.user.id), isNull(workSavedViews.deletedAt), input?.projectId === undefined ? sql`true` : input.projectId === null ? isNull(workSavedViews.projectId) : eq(workSavedViews.projectId, input.projectId))).orderBy(asc(workSavedViews.name));
    }),
    create: protectedProcedure.input(z.object({ projectId: z.number().int().positive().nullable().optional(), name: z.string().min(1).max(255), viewType: z.enum(["list", "board", "timeline", "calendar", "overview", "files", "my_tasks", "search"]), filters: jsonObject, config: jsonObject.optional(), isShared: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
      if (input.projectId) await requireProjectAccess(ctx.user, input.projectId, "viewer");
      const db = await getRequiredDb();
      const [result] = await db.insert(workSavedViews).values({ slug: slugify(input.name), projectId: input.projectId ?? null, userId: ctx.user.id, name: input.name.trim(), viewType: input.viewType, filters: input.filters, config: input.config ?? null, isShared: input.isShared });
      return { id: Number(result.insertId) };
    }),
  }),

  search: protectedProcedure.input(z.object({ query: z.string().min(1).max(255), limit: z.number().int().min(1).max(100).optional() })).query(async ({ ctx, input }) => {
    const db = await getRequiredDb();
    const limit = validateCursorLimit(input.limit);
    const term = `%${input.query.trim()}%`;
    const [projects, tasks] = await Promise.all([
      db.select({ id: workProjects.id, slug: workProjects.slug, name: workProjects.name, type: sql<string>`'project'` }).from(workProjects).where(and(isNull(workProjects.deletedAt), or(like(workProjects.name, term), like(workProjects.descriptionPlainText, term)))).limit(limit),
      db.select({ id: workTasks.id, slug: workTasks.slug, name: workTasks.name, type: sql<string>`'task'` }).from(workTasks).where(and(isNull(workTasks.deletedAt), or(like(workTasks.name, term), like(workTasks.descriptionPlainText, term)))).limit(limit),
    ]);
    const allowedProjects = [] as typeof projects;
    for (const project of projects) if (await getProjectAccess(ctx.user, project.id)) allowedProjects.push(project);
    const allowedTasks = [] as typeof tasks;
    for (const task of tasks) if (await getTaskAccess(ctx.user, task.id)) allowedTasks.push(task);
    return [...allowedProjects, ...allowedTasks].slice(0, limit);
  }),

  attachments: router({
    listForProject: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user, input.projectId, "viewer");
      return (await getRequiredDb()).select().from(workAttachments).where(and(eq(workAttachments.projectId, input.projectId), isNull(workAttachments.deletedAt))).orderBy(desc(workAttachments.createdAt));
    }),
  }),

  recurrences: router({
    create: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), frequency: z.enum(["daily", "weekly", "monthly", "custom"]), intervalValue: z.number().int().min(1).default(1), weekDays: z.array(z.number().int().min(0).max(6)).optional(), endsOn: dateInput, nextOccurrenceOn: dateInput })).mutation(async ({ ctx, input }) => {
      await requireTaskAccess(ctx.user, input.taskId, "editor");
      const db = await getRequiredDb();
      const [result] = await db.insert(workTaskRecurrences).values({ taskId: input.taskId, frequency: input.frequency, intervalValue: input.intervalValue, weekDays: input.weekDays ?? null, endsOn: input.endsOn ?? null, nextOccurrenceOn: input.nextOccurrenceOn ?? null, createdById: ctx.user.id });
      return { id: Number(result.insertId) };
    }),
  }),
});
