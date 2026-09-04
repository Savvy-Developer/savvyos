import { TRPCError } from "@trpc/server";
import sanitizeHtml from "sanitize-html";
import { pulseMemberProcedure } from "./authorization";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  pulseActivityLog,
  pulseIssueResultingTodos,
  pulseMeetingMembers,
  pulseMeetingSessions,
  pulseMeetings,
  pulseRockMilestones,
  pulseRockRaciAssignments,
  pulseWorkItemCommentMentions,
  pulseWorkItemComments,
  pulseWorkItemMoves,
  pulseWorkItemNotifications,
  pulseNotifications,
  pulseWorkItemStatusNotes,
  pulseWorkItemAttachments,
  pulseWorkItems,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { router } from "../_core/trpc";
import { sendTransactionalEmail } from "../_core/resendEmail";
import { require_visible_meeting, visible_meeting_ids } from "./access";
import { getPulseNotificationPreference } from "./notifications";

const workItemTypeSchema = z.enum(["todo", "issue", "rock"]);
const workflowStatusSchema = z.enum(["not_started", "in_progress", "blocked", "completed"]);
const todoStatusSchema = workflowStatusSchema;
const issueStatusSchema = workflowStatusSchema;
const rockStatusSchema = z.enum(["on_track", "at_risk", "off_track", "done", "dropped"]);
const quarterSchema = z.string().trim().regex(/^Q[1-4]\s\d{4}$/, "Use a quarter such as Q3 2026.");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format.");
const raciRoleSchema = z.enum(["responsible", "accountable", "consulted", "informed"]);
const priorityLevelSchema = z.enum(["low", "medium", "high", "urgent"]);
const issueTimeframeSchema = z.enum(["short_term", "long_term"]);
const editorStatusSchema = z.enum(["not_started", "in_progress", "blocked", "completed", "on_track", "at_risk", "off_track", "done", "dropped"]);

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function sanitizeDetails(value?: string | null) {
  if (!value?.trim()) return null;
  const sanitized = sanitizeHtml(value, {
    allowedTags: ["p", "br", "strong", "em", "b", "i", "ul", "ol", "li", "a"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
  }).trim().replace(/<p><strong>Saved links<\/strong><\/p><ul>[\s\S]*?<\/ul>$/i, "").trim();
  if (!sanitized) return null;
  const links = Array.from(new Set(Array.from(sanitized.matchAll(/href=[\"']([^\"']+)|\b(https?:\/\/[^\s<>\"']+)/gi)).map((match) => match[1] ?? match[2]).filter((href): href is string => Boolean(href))));
  if (!links.length) return sanitized;
  const savedLinks = links.map((href) => `<li><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a></li>`).join("");
  return `${sanitized}<p><strong>Saved links</strong></p><ul>${savedLinks}</ul>`;
}

function uuid() {
  return crypto.randomUUID();
}

function unavailable() {
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pulse is not available right now. Please try again." });
}

function easternDateToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dateValue(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isOverdue(item: { type: string; status: string; dueDate: unknown }) {
  const dueDate = dateValue(item.dueDate);
  return item.type === "todo" && item.status !== "completed" && !!dueDate && dueDate < easternDateToday();
}

function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function defaultStatus(type: z.infer<typeof workItemTypeSchema>) {
  if (type === "todo") return "not_started";
  if (type === "issue") return "not_started";
  return "on_track";
}

function statusIsValidForType(type: string, status: string) {
  if (type === "todo" || type === "issue") return ["not_started", "in_progress", "blocked", "completed"].includes(status);
  return ["on_track", "at_risk", "off_track", "done", "dropped"].includes(status);
}

async function writeActivity(db: any, personId: number, entityType: string, entityId: string, action: string, fieldChanged?: string, oldValue?: unknown, newValue?: unknown) {
  await db.insert(pulseActivityLog).values({
    id: uuid(),
    personId,
    entityType,
    entityId,
    action,
    fieldChanged: fieldChanged ?? null,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
  });
}

async function visibleMeetingMember(db: any, meetingId: string, personId: number) {
  const [membership] = await db.select({ id: pulseMeetingMembers.id }).from(pulseMeetingMembers)
    .innerJoin(users, eq(users.id, pulseMeetingMembers.personId))
    .where(and(
      eq(pulseMeetingMembers.meetingId, meetingId),
      eq(pulseMeetingMembers.personId, personId),
      isNull(pulseMeetingMembers.removedAt),
      isNull(pulseMeetingMembers.deletedAt),
      sql`${users.openId} NOT LIKE 'pulse_slice_fixture_%'`,
    )).limit(1);
  return !!membership;
}

async function personLabel(db: any, personId: number) {
  const [person] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, personId)).limit(1);
  return person?.name ?? person?.email ?? "That person";
}

async function requireMeetingMember(db: any, personId: number, meeting: { id: string; name: string }) {
  if (await visibleMeetingMember(db, meeting.id, personId)) return;
  const name = await personLabel(db, personId);
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `${name} isn't in ${meeting.name}, so they can't see this item. Add them to the meeting, or move the item.`,
  });
}

async function getAccessibleWorkItem(db: any, personId: number, workItemId: string) {
  const [item] = await db.select().from(pulseWorkItems).where(and(
    eq(pulseWorkItems.id, workItemId),
    isNull(pulseWorkItems.deletedAt),
  )).limit(1);
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "This work item no longer exists." });

  if (item.meetingId) {
    const meeting = await require_visible_meeting(db, personId, item.meetingId);
    return { item, meeting };
  }
  if (item.ownerPersonId !== personId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "This work item no longer exists." });
  }
  return { item, meeting: null };
}

async function milestonesFor(db: any, workItemId: string) {
  return db.select({
    id: pulseRockMilestones.id,
    title: pulseRockMilestones.title,
    dueDate: pulseRockMilestones.dueDate,
    isComplete: pulseRockMilestones.isComplete,
    completedById: pulseRockMilestones.completedById,
    completedByName: users.name,
    completedAt: pulseRockMilestones.completedAt,
    sortOrder: pulseRockMilestones.sortOrder,
  }).from(pulseRockMilestones)
    .leftJoin(users, eq(users.id, pulseRockMilestones.completedById))
    .where(and(eq(pulseRockMilestones.workItemId, workItemId), isNull(pulseRockMilestones.deletedAt)))
    .orderBy(asc(pulseRockMilestones.sortOrder), asc(pulseRockMilestones.createdAt));
}

async function syncMilestoneProgress(db: any, workItemId: string) {
  const milestones = await db.select({ isComplete: pulseRockMilestones.isComplete })
    .from(pulseRockMilestones)
    .where(and(eq(pulseRockMilestones.workItemId, workItemId), isNull(pulseRockMilestones.deletedAt)));
  if (!milestones.length) return { count: 0, completed: 0, percent: null };
  const completed = milestones.filter((milestone: any) => milestone.isComplete).length;
  const percent = Math.round((completed / milestones.length) * 100);
  await db.update(pulseWorkItems).set({ percentComplete: percent, percentSource: "from_milestones" }).where(eq(pulseWorkItems.id, workItemId));
  return { count: milestones.length, completed, percent };
}

function itemResponse(item: any, meetingName: string | null) {
  return {
    ...item,
    dueDate: dateValue(item.dueDate),
    isOverdue: isOverdue(item),
    meetingName,
  };
}

export async function listAccessibleItems(db: any, personId: number, filters: {
  type?: z.infer<typeof workItemTypeSchema>;
  meetingId?: string | null;
  assigneeId?: number;
  status?: string;
}) {
  const visibleIds = await visible_meeting_ids(db, personId);
  const accessCondition = visibleIds.length
    ? or(inArray(pulseWorkItems.meetingId, visibleIds), eq(pulseWorkItems.ownerPersonId, personId))
    : eq(pulseWorkItems.ownerPersonId, personId);
  const conditions: any[] = [accessCondition, isNull(pulseWorkItems.deletedAt)];
  if (filters.type) conditions.push(eq(pulseWorkItems.type, filters.type));
  if (filters.meetingId !== undefined) {
    conditions.push(filters.meetingId === null ? isNull(pulseWorkItems.meetingId) : eq(pulseWorkItems.meetingId, filters.meetingId));
  }
  if (filters.assigneeId) conditions.push(eq(pulseWorkItems.assigneeId, filters.assigneeId));
  if (filters.status) conditions.push(eq(pulseWorkItems.status, filters.status));

  const rows = await db.select({
    id: pulseWorkItems.id,
    type: pulseWorkItems.type,
    title: pulseWorkItems.title,
    description: pulseWorkItems.description,
    meetingId: pulseWorkItems.meetingId,
    parentWorkItemId: pulseWorkItems.parentWorkItemId,
    ownerPersonId: pulseWorkItems.ownerPersonId,
    assigneeId: pulseWorkItems.assigneeId,
    assigneeName: users.name,
    status: pulseWorkItems.status,
    dueDate: pulseWorkItems.dueDate,
    carriedOverCount: pulseWorkItems.carriedOverCount,
    priority: pulseWorkItems.priority,
    priorityLevel: pulseWorkItems.priorityLevel,
    issueTimeframe: pulseWorkItems.issueTimeframe,
    solvedNote: pulseWorkItems.solvedNote,
    quarter: pulseWorkItems.quarter,
    percentComplete: pulseWorkItems.percentComplete,
    percentSource: pulseWorkItems.percentSource,
    isProposed: pulseWorkItems.isProposed,
    savvyosMetricId: pulseWorkItems.savvyosMetricId,
    sortOrder: pulseWorkItems.sortOrder,
    meetingName: pulseMeetings.name,
    createdAt: pulseWorkItems.createdAt,
    updatedAt: pulseWorkItems.updatedAt,
    commentCount: sql<number>`(select count(*) from ${pulseWorkItemComments} where ${pulseWorkItemComments.workItemId} = ${pulseWorkItems.id} and ${pulseWorkItemComments.deletedAt} is null)`.as("commentCount"),
    attachmentCount: sql<number>`(select count(*) from ${pulseWorkItemAttachments} where ${pulseWorkItemAttachments.workItemId} = ${pulseWorkItems.id} and ${pulseWorkItemAttachments.deletedAt} is null)`.as("attachmentCount"),
    linkedSubTodoCount: sql<number>`(select count(*) from \`pulse_work_items\` child where child.\`parentWorkItemId\` = ${pulseWorkItems.id} and child.\`deletedAt\` is null)`.as("linkedSubTodoCount"),
  }).from(pulseWorkItems)
    .leftJoin(users, eq(users.id, pulseWorkItems.assigneeId))
    .leftJoin(pulseMeetings, eq(pulseMeetings.id, pulseWorkItems.meetingId))
    .where(and(...conditions))
    .orderBy(asc(pulseMeetings.name), asc(pulseWorkItems.type), asc(pulseWorkItems.priority), asc(pulseWorkItems.sortOrder), desc(pulseWorkItems.updatedAt));

  return rows.map((row: any) => itemResponse(row, row.meetingName ?? null));
}

export const pulseWorkItemsRouter = router({
  list: pulseMemberProcedure
    .input(z.object({
      type: workItemTypeSchema.optional(),
      meetingId: z.string().uuid().nullable().optional(),
      assigneeId: z.number().int().positive().optional(),
      status: z.string().trim().max(64).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw unavailable();
      return listAccessibleItems(db, ctx.user.id, input ?? {});
    }),

  editorOptions: pulseMemberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw unavailable();
    const visibleIds = await visible_meeting_ids(db, ctx.user.id);
    const [meetings, people, memberships] = await Promise.all([
      visibleIds.length ? db.select({ id: pulseMeetings.id, name: pulseMeetings.name }).from(pulseMeetings).where(and(inArray(pulseMeetings.id, visibleIds), isNull(pulseMeetings.deletedAt))).orderBy(asc(pulseMeetings.name)) : Promise.resolve([]),
      db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(and(eq(users.isActive, true), sql`${users.openId} NOT LIKE 'pulse_slice_fixture_%'`)).orderBy(asc(users.name), asc(users.email)),
      visibleIds.length ? db.select({ meetingId: pulseMeetingMembers.meetingId, personId: pulseMeetingMembers.personId }).from(pulseMeetingMembers).where(and(inArray(pulseMeetingMembers.meetingId, visibleIds), isNull(pulseMeetingMembers.removedAt), isNull(pulseMeetingMembers.deletedAt))) : Promise.resolve([]),
    ]);
    const accessByPerson = new Map<number, string[]>();
    for (const membership of memberships) accessByPerson.set(membership.personId, [...(accessByPerson.get(membership.personId) ?? []), membership.meetingId]);
    return {
      destinations: [{ id: "personal", name: "Personal work", type: "personal" as const }, ...meetings.map((meeting: any) => ({ ...meeting, type: "meeting" as const }))],
      people: people.map((person: any) => ({ ...person, destinationIds: [...(person.id === ctx.user.id ? ["personal"] : []), ...(accessByPerson.get(person.id) ?? [])] })),
    };
  }),

  saveEditor: pulseMemberProcedure
    .input(z.object({
      workItemId: z.string().uuid().optional(),
      type: z.enum(["todo", "issue"]),
      title: z.string().trim().min(1).max(500),
      description: z.string().max(50_000).nullable().optional(),
      assigneeId: z.number().int().positive(),
      dueDate: dateSchema,
      priorityLevel: priorityLevelSchema.default("medium"),
      status: editorStatusSchema,
      issueTimeframe: issueTimeframeSchema.nullable().optional(),
      statusNote: z.string().trim().max(2000).nullable().optional(),
      destinationId: z.union([z.literal("personal"), z.string().uuid()]),
      sourceSessionId: z.string().uuid().nullable().optional(),
      parentWorkItemId: z.string().uuid().nullable().optional(),
      attachments: z.array(z.object({ fileName: z.string().trim().min(1).max(500), fileKey: z.string().trim().min(1).max(1024), url: z.string().url().max(2048), mimeType: z.string().trim().max(128).nullable().optional(), fileSize: z.number().int().min(0).max(16 * 1024 * 1024).nullable().optional() })).max(10).default([]),
    }).superRefine((input, refinement) => {
      if (!statusIsValidForType(input.type, input.status)) refinement.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "Choose a status that applies to this item type." });
      if (input.type === "issue" && !input.issueTimeframe) refinement.addIssue({ code: z.ZodIssueCode.custom, path: ["issueTimeframe"], message: "Choose whether this issue is short-term or long-term." });
      if (input.type === "todo" && input.issueTimeframe) refinement.addIssue({ code: z.ZodIssueCode.custom, path: ["issueTimeframe"], message: "Only issues use a timeframe." });
      if (input.status === "completed" && !input.statusNote?.trim()) refinement.addIssue({ code: z.ZodIssueCode.custom, path: ["statusNote"], message: "Describe what completed looks like before marking this item completed." });
      if (input.parentWorkItemId && input.type !== "todo") refinement.addIssue({ code: z.ZodIssueCode.custom, path: ["parentWorkItemId"], message: "Only a To-Do can be created as a sub-To-Do." });
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw unavailable();
      const isPersonal = input.destinationId === "personal";
      const targetMeeting = isPersonal ? null : await require_visible_meeting(db, ctx.user.id, input.destinationId);
      if (isPersonal && input.assigneeId !== ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Personal work can only be assigned to you. Choose a meeting to assign it to someone else." });
      if (targetMeeting) await requireMeetingMember(db, input.assigneeId, targetMeeting);
      const sourceSessionId = input.sourceSessionId && targetMeeting
        ? await db.select({ id: pulseMeetingSessions.id }).from(pulseMeetingSessions).where(and(eq(pulseMeetingSessions.id, input.sourceSessionId), eq(pulseMeetingSessions.meetingId, targetMeeting.id))).limit(1).then((rows: any[]) => rows[0]?.id ?? null)
        : null;
      if (input.sourceSessionId && targetMeeting && !sourceSessionId) throw new TRPCError({ code: "BAD_REQUEST", message: "The active session does not belong to the selected destination meeting." });
      const details = sanitizeDetails(input.description);
      const destinationValues = targetMeeting ? { meetingId: targetMeeting.id, ownerPersonId: null } : { meetingId: null, ownerPersonId: ctx.user.id };
      let parentWorkItemId: string | null = input.parentWorkItemId ?? null;
      if (parentWorkItemId) {
        const { item: parent } = await getAccessibleWorkItem(db, ctx.user.id, parentWorkItemId);
        if (parent.type === "rock" || parent.parentWorkItemId) throw new TRPCError({ code: "BAD_REQUEST", message: "A sub-To-Do must be directly under a To-Do or Issue, not another sub-To-Do." });
        if (parent.meetingId !== destinationValues.meetingId || parent.ownerPersonId !== destinationValues.ownerPersonId) throw new TRPCError({ code: "BAD_REQUEST", message: "A sub-To-Do must remain in the same meeting or Personal work destination as its parent." });
      }
      const complete = input.status === "completed";
      if (!input.workItemId) {
        if (input.status !== "not_started" && !input.statusNote?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Describe this initial status before saving the item." });
        const id = uuid();
        await db.transaction(async (tx: any) => {
          await tx.insert(pulseWorkItems).values({
            id, type: input.type, title: input.title, description: details, ...destinationValues, parentWorkItemId, sourceSessionId, assigneeId: input.assigneeId, createdById: ctx.user.id,
            status: input.status, dueDate: input.dueDate, priorityLevel: input.priorityLevel, issueTimeframe: input.type === "issue" ? input.issueTimeframe : null,
            solvedNote: complete ? input.statusNote!.trim() : null, completedAt: complete ? new Date() : null, completedById: complete ? ctx.user.id : null,
            percentComplete: 0, percentSource: "manual",
          });
          if (input.attachments.length) {
            await tx.insert(pulseWorkItemAttachments).values(input.attachments.map((attachment) => ({ id: uuid(), workItemId: id, fileName: attachment.fileName, fileKey: attachment.fileKey, url: attachment.url, mimeType: attachment.mimeType ?? null, fileSize: attachment.fileSize ?? null, uploadedById: ctx.user.id })));
            for (const attachment of input.attachments) await writeActivity(tx, ctx.user.id, "work_item", id, "attachment_added", "attachment", null, { fileName: attachment.fileName });
          }
          await writeActivity(tx, ctx.user.id, "work_item", id, "created", undefined, undefined, { type: input.type, destinationId: input.destinationId, parentWorkItemId, assigneeId: input.assigneeId, priorityLevel: input.priorityLevel, issueTimeframe: input.issueTimeframe ?? null });
          if (complete) await tx.insert(pulseWorkItemStatusNotes).values({ id: uuid(), workItemId: id, fromStatus: null, toStatus: input.status, note: input.statusNote ?? null, personId: ctx.user.id });
        });
        return { id, created: true };
      }
      const { item } = await getAccessibleWorkItem(db, ctx.user.id, input.workItemId);
      if (item.type !== input.type) throw new TRPCError({ code: "BAD_REQUEST", message: "An existing work item cannot change between To-Do and Issue." });
      const destinationChanged = item.meetingId !== destinationValues.meetingId || item.ownerPersonId !== destinationValues.ownerPersonId;
      const statusChanged = item.status !== input.status;
      if (statusChanged && !input.statusNote?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: input.status === "completed" ? "Describe what completed looks like before marking this item completed." : "Describe this status update before saving it." });
      if (item.parentWorkItemId && destinationChanged) throw new TRPCError({ code: "BAD_REQUEST", message: "Move the parent To-Do first; its sub-To-Dos must stay in the same destination." });
      if (parentWorkItemId && parentWorkItemId !== item.parentWorkItemId) throw new TRPCError({ code: "BAD_REQUEST", message: "A saved item’s parent cannot be changed. Create a new sub-To-Do under the intended parent instead." });
      await db.transaction(async (tx: any) => {
        const values = { title: input.title, description: details, ...destinationValues, assigneeId: input.assigneeId, dueDate: input.dueDate, priorityLevel: input.priorityLevel, issueTimeframe: input.type === "issue" ? input.issueTimeframe : null, status: input.status, solvedNote: statusChanged && complete ? input.statusNote!.trim() : item.solvedNote, completedAt: complete ? new Date() : null, completedById: complete ? ctx.user.id : null };
        await tx.update(pulseWorkItems).set(values).where(eq(pulseWorkItems.id, item.id));
        if (destinationChanged) await tx.insert(pulseWorkItemMoves).values({ id: uuid(), workItemId: item.id, fromMeetingId: item.meetingId, toMeetingId: destinationValues.meetingId, movedById: ctx.user.id, reason: "Destination changed in the shared Pulse editor." });
        if (statusChanged) await tx.insert(pulseWorkItemStatusNotes).values({ id: uuid(), workItemId: item.id, fromStatus: item.status, toStatus: input.status, note: input.statusNote!.trim(), personId: ctx.user.id });
        if (input.attachments.length) {
          await tx.insert(pulseWorkItemAttachments).values(input.attachments.map((attachment) => ({ id: uuid(), workItemId: item.id, fileName: attachment.fileName, fileKey: attachment.fileKey, url: attachment.url, mimeType: attachment.mimeType ?? null, fileSize: attachment.fileSize ?? null, uploadedById: ctx.user.id })));
          for (const attachment of input.attachments) await writeActivity(tx, ctx.user.id, "work_item", item.id, "attachment_added", "attachment", null, { fileName: attachment.fileName });
        }
        await writeActivity(tx, ctx.user.id, "work_item", item.id, destinationChanged ? "moved_and_updated" : statusChanged ? "status_changed" : "updated", statusChanged ? "status" : undefined, statusChanged ? item.status : undefined, { destinationId: input.destinationId, assigneeId: input.assigneeId, priorityLevel: input.priorityLevel, status: input.status, statusNote: statusChanged ? input.statusNote!.trim() : null, issueTimeframe: input.issueTimeframe ?? null });
      });
      return { id: item.id, created: false };
    }),

  setWorkflowStatus: pulseMemberProcedure
    .input(z.object({ workItemId: z.string().uuid(), status: workflowStatusSchema, statusNote: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw unavailable();
      const { item } = await getAccessibleWorkItem(db, ctx.user.id, input.workItemId);
      if (item.type !== "todo" && item.type !== "issue") throw new TRPCError({ code: "BAD_REQUEST", message: "Only To-Dos and Issues use this workflow status." });
      if (item.status === input.status) return { success: true, unchanged: true };
      const completed = input.status === "completed";
      await db.transaction(async (tx: any) => {
        await tx.update(pulseWorkItems).set({ status: input.status, solvedNote: completed ? input.statusNote : item.solvedNote, completedAt: completed ? new Date() : null, completedById: completed ? ctx.user.id : null }).where(eq(pulseWorkItems.id, item.id));
        await tx.insert(pulseWorkItemStatusNotes).values({ id: uuid(), workItemId: item.id, fromStatus: item.status, toStatus: input.status, note: input.statusNote, personId: ctx.user.id });
        await writeActivity(tx, ctx.user.id, "work_item", item.id, "status_changed", "status", item.status, { status: input.status, statusNote: input.statusNote });
      });
      return { success: true, unchanged: false };
    }),

  removeAttachment: pulseMemberProcedure
    .input(z.object({ attachmentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw unavailable();
      const [attachment] = await db.select().from(pulseWorkItemAttachments).where(and(eq(pulseWorkItemAttachments.id, input.attachmentId), isNull(pulseWorkItemAttachments.deletedAt))).limit(1);
      if (!attachment) throw new TRPCError({ code: "NOT_FOUND", message: "This attachment no longer exists." });
      await getAccessibleWorkItem(db, ctx.user.id, attachment.workItemId);
      await db.transaction(async (tx: any) => {
        await tx.update(pulseWorkItemAttachments).set({ deletedAt: new Date() }).where(eq(pulseWorkItemAttachments.id, attachment.id));
        await writeActivity(tx, ctx.user.id, "work_item", attachment.workItemId, "attachment_removed", "attachment", { id: attachment.id, fileName: attachment.fileName }, null);
      });
      return { success: true };
    }),

  detail: pulseMemberProcedure
    .input(z.object({ workItemId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw unavailable();
      const { item, meeting } = await getAccessibleWorkItem(db, ctx.user.id, input.workItemId);
      const [assignee] = await db.select({ name: users.name }).from(users).where(eq(users.id, item.assigneeId)).limit(1);
      const [owner] = item.ownerPersonId
        ? await db.select({ name: users.name }).from(users).where(eq(users.id, item.ownerPersonId)).limit(1)
        : [];
      const [creator] = await db.select({ name: users.name }).from(users).where(eq(users.id, item.createdById)).limit(1);
      const [milestones, notes, moves, comments, activity, members, rolloverPrompts, raci, attachments, linkedSubTodos] = await Promise.all([
        item.type === "rock" ? milestonesFor(db, item.id) : Promise.resolve([]),
        db.select({
          id: pulseWorkItemStatusNotes.id,
          fromStatus: pulseWorkItemStatusNotes.fromStatus,
          toStatus: pulseWorkItemStatusNotes.toStatus,
          note: pulseWorkItemStatusNotes.note,
          personId: pulseWorkItemStatusNotes.personId,
          personName: users.name,
          createdAt: pulseWorkItemStatusNotes.createdAt,
        }).from(pulseWorkItemStatusNotes).leftJoin(users, eq(users.id, pulseWorkItemStatusNotes.personId))
          .where(and(eq(pulseWorkItemStatusNotes.workItemId, item.id), isNull(pulseWorkItemStatusNotes.deletedAt)))
          .orderBy(desc(pulseWorkItemStatusNotes.createdAt)),
        db.select({ id: pulseWorkItemMoves.id, workItemId: pulseWorkItemMoves.workItemId, fromMeetingId: pulseWorkItemMoves.fromMeetingId, toMeetingId: pulseWorkItemMoves.toMeetingId, movedById: pulseWorkItemMoves.movedById, movedByName: users.name, movedAt: pulseWorkItemMoves.movedAt, reason: pulseWorkItemMoves.reason })
          .from(pulseWorkItemMoves).leftJoin(users, eq(users.id, pulseWorkItemMoves.movedById))
          .where(and(eq(pulseWorkItemMoves.workItemId, item.id), isNull(pulseWorkItemMoves.deletedAt))).orderBy(desc(pulseWorkItemMoves.movedAt)),
        db.select({
          id: pulseWorkItemComments.id,
          body: pulseWorkItemComments.body,
          authorId: pulseWorkItemComments.authorId,
          authorName: users.name,
          createdAt: pulseWorkItemComments.createdAt,
          updatedAt: pulseWorkItemComments.updatedAt,
        }).from(pulseWorkItemComments).leftJoin(users, eq(users.id, pulseWorkItemComments.authorId))
          .where(and(eq(pulseWorkItemComments.workItemId, item.id), isNull(pulseWorkItemComments.deletedAt)))
          .orderBy(asc(pulseWorkItemComments.createdAt)),
        db.select({
          id: pulseActivityLog.id,
          action: pulseActivityLog.action,
          fieldChanged: pulseActivityLog.fieldChanged,
          oldValue: pulseActivityLog.oldValue,
          newValue: pulseActivityLog.newValue,
          personId: pulseActivityLog.personId,
          personName: users.name,
          createdAt: pulseActivityLog.createdAt,
        }).from(pulseActivityLog).leftJoin(users, eq(users.id, pulseActivityLog.personId))
          .where(and(eq(pulseActivityLog.entityType, "work_item"), eq(pulseActivityLog.entityId, item.id)))
          .orderBy(desc(pulseActivityLog.createdAt)),
        meeting
          ? db.select({ id: users.id, name: users.name, email: users.email })
            .from(pulseMeetingMembers)
            .innerJoin(users, eq(users.id, pulseMeetingMembers.personId))
            .where(and(eq(pulseMeetingMembers.meetingId, meeting.id), isNull(pulseMeetingMembers.removedAt), isNull(pulseMeetingMembers.deletedAt)))
            .orderBy(asc(users.name))
          : Promise.resolve([]),
        db.select({ id: pulseWorkItemNotifications.id }).from(pulseWorkItemNotifications).where(and(
          eq(pulseWorkItemNotifications.workItemId, item.id),
          eq(pulseWorkItemNotifications.recipientId, ctx.user.id),
          eq(pulseWorkItemNotifications.notificationType, "quarter_rollover"),
          isNull(pulseWorkItemNotifications.actionedAt),
          isNull(pulseWorkItemNotifications.deletedAt),
        )),
        item.type === "rock" ? db.select({ personId: pulseRockRaciAssignments.personId, role: pulseRockRaciAssignments.role, name: users.name, email: users.email })
          .from(pulseRockRaciAssignments).leftJoin(users, eq(users.id, pulseRockRaciAssignments.personId))
          .where(and(eq(pulseRockRaciAssignments.workItemId, item.id), isNull(pulseRockRaciAssignments.deletedAt))) : Promise.resolve([]),
        db.select({ id: pulseWorkItemAttachments.id, fileName: pulseWorkItemAttachments.fileName, fileKey: pulseWorkItemAttachments.fileKey, url: pulseWorkItemAttachments.url, mimeType: pulseWorkItemAttachments.mimeType, fileSize: pulseWorkItemAttachments.fileSize, uploadedById: pulseWorkItemAttachments.uploadedById, uploadedByName: users.name, createdAt: pulseWorkItemAttachments.createdAt })
          .from(pulseWorkItemAttachments).leftJoin(users, eq(users.id, pulseWorkItemAttachments.uploadedById))
          .where(and(eq(pulseWorkItemAttachments.workItemId, item.id), isNull(pulseWorkItemAttachments.deletedAt))).orderBy(desc(pulseWorkItemAttachments.createdAt)),
        db.select({ id: pulseWorkItems.id, title: pulseWorkItems.title, status: pulseWorkItems.status, dueDate: pulseWorkItems.dueDate, priorityLevel: pulseWorkItems.priorityLevel, assigneeName: users.name, meetingId: pulseWorkItems.meetingId, parentWorkItemId: pulseWorkItems.parentWorkItemId })
          .from(pulseWorkItems).leftJoin(users, eq(users.id, pulseWorkItems.assigneeId))
          .where(and(eq(pulseWorkItems.parentWorkItemId, item.id), eq(pulseWorkItems.type, "todo"), isNull(pulseWorkItems.deletedAt))).orderBy(asc(pulseWorkItems.sortOrder), desc(pulseWorkItems.createdAt)),
      ]);

      const commentIds = comments.map((comment) => comment.id);
      const mentions = commentIds.length
        ? await db.select({ commentId: pulseWorkItemCommentMentions.commentId, personId: pulseWorkItemCommentMentions.mentionedPersonId, name: users.name })
          .from(pulseWorkItemCommentMentions).leftJoin(users, eq(users.id, pulseWorkItemCommentMentions.mentionedPersonId))
          .where(inArray(pulseWorkItemCommentMentions.commentId, commentIds))
        : [];
      const mentionsByComment = new Map<string, { personId: number; name: string | null }[]>();
      for (const mention of mentions) {
        const group = mentionsByComment.get(mention.commentId) ?? [];
        group.push({ personId: mention.personId, name: mention.name });
        mentionsByComment.set(mention.commentId, group);
      }

      const movementMeetingIds = Array.from(new Set(moves.flatMap((move: any) => [move.fromMeetingId, move.toMeetingId]).filter((id: any): id is string => Boolean(id))));
      const visibleIds = await visible_meeting_ids(db, ctx.user.id);
      const historicalMeetings = movementMeetingIds.length
        ? await db.select({ id: pulseMeetings.id, name: pulseMeetings.name }).from(pulseMeetings).where(inArray(pulseMeetings.id, movementMeetingIds.filter((id) => visibleIds.includes(id))))
        : [];
      const historicalName = new Map(historicalMeetings.map((record) => [record.id, record.name]));

      const milestoneProgress = milestones.length
        ? { completed: milestones.filter((milestone: any) => milestone.isComplete).length, total: milestones.length, percent: Math.round((milestones.filter((milestone: any) => milestone.isComplete).length / milestones.length) * 100) }
        : null;
      return {
        item: itemResponse({ ...item, assigneeName: assignee?.name ?? null, ownerName: owner?.name ?? null, createdByName: creator?.name ?? null }, meeting?.name ?? null),
        milestones,
        milestoneProgress,
        statusNotes: notes,
        comments: comments.map((comment) => ({ ...comment, mentions: mentionsByComment.get(comment.id) ?? [] })),
        moves: moves.map((move) => ({
          ...move,
          fromMeetingName: move.fromMeetingId ? historicalName.get(move.fromMeetingId) ?? "another meeting" : "personal work",
          toMeetingName: move.toMeetingId ? historicalName.get(move.toMeetingId) ?? "another meeting" : "personal work",
        })),
        activity,
        attachments,
        linkedSubTodos: linkedSubTodos.map((todo: any) => ({ ...todo, dueDate: dateValue(todo.dueDate) })),
        members,
        quarterRolloverPending: rolloverPrompts.length > 0,
        raci: item.type === "rock" ? [{ personId: item.assigneeId, role: "responsible", name: assignee?.name ?? null }, ...raci] : [],
      };
    }),

  create: pulseMemberProcedure
    .input(z.object({
      type: workItemTypeSchema,
      title: z.string().trim().min(1).max(500),
      description: z.string().trim().max(8000).optional().nullable(),
      meetingId: z.string().uuid().nullable(),
      ownerPersonId: z.number().int().positive().nullable(),
      assigneeId: z.number().int().positive().optional(),
      assigneeIds: z.array(z.number().int().positive()).min(1).max(50).optional(),
      dueDate: dateSchema.optional().nullable(),
      quarter: quarterSchema.optional().nullable(),
      percentComplete: z.number().int().min(0).max(100).optional(),
      definitionOfDone: z.string().trim().min(1).max(8000).optional(),
      raci: z.array(z.object({ personId: z.number().int().positive(), role: raciRoleSchema })).max(100).default([]),
    }).refine((input) => (input.meetingId === null) !== (input.ownerPersonId === null), {
      message: "Choose one place: a meeting or one person.",
    }).superRefine((input, context) => {
      if (input.type !== "rock" && !input.meetingId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["meetingId"], message: "Choose an authorized meeting destination for every To-Do and Issue." });
      if (input.type === "rock" && !input.quarter) context.addIssue({ code: z.ZodIssueCode.custom, path: ["quarter"], message: "Choose the rock's quarter." });
      if (input.type === "rock" && !input.definitionOfDone?.trim()) context.addIssue({ code: z.ZodIssueCode.custom, path: ["definitionOfDone"], message: "Every Rock needs a definition of done." });
      if (input.type !== "rock" && input.quarter) context.addIssue({ code: z.ZodIssueCode.custom, path: ["quarter"], message: "Only rocks use a quarter." });
      if (input.type !== "todo" && (input.assigneeIds?.length ?? 0) > 1) context.addIssue({ code: z.ZodIssueCode.custom, path: ["assigneeIds"], message: "Only To-Dos can be assigned to multiple people." });
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw unavailable();
      let meeting: { id: string; name: string } | null = null;
      if (input.meetingId) {
        const currentMeeting = await require_visible_meeting(db, ctx.user.id, input.meetingId);
        meeting = currentMeeting;
      } else if (input.ownerPersonId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Personal work can only belong to you." });
      }

      const assigneeIds = Array.from(new Set(input.type === "todo" && input.assigneeIds?.length ? input.assigneeIds : [input.assigneeId ?? ctx.user.id]));
      if (meeting) for (const assigneeId of assigneeIds) await requireMeetingMember(db, assigneeId, meeting);
      const dueDate = input.type === "todo" ? (input.dueDate ?? defaultDueDate()) : input.dueDate ?? null;
      const assignmentGroupId = input.type === "todo" && assigneeIds.length > 1 ? uuid() : null;
      const createdIds: string[] = [];
      const preferences = new Map<number, { inApp: boolean; email: boolean }>();
      for (const assigneeId of assigneeIds) if (assigneeId !== ctx.user.id) preferences.set(assigneeId, await getPulseNotificationPreference(db, assigneeId, "todo_assigned"));
      await db.transaction(async (tx: any) => {
        for (const assigneeId of assigneeIds) {
          const id = uuid();
          createdIds.push(id);
          await tx.insert(pulseWorkItems).values({
            id,
            type: input.type,
            title: input.title,
            description: input.description ?? null,
            meetingId: input.meetingId,
            ownerPersonId: input.ownerPersonId,
            assigneeId,
            createdById: ctx.user.id,
            status: defaultStatus(input.type),
            dueDate,
            quarter: input.type === "rock" ? input.quarter : null,
            definitionOfDone: input.type === "rock" ? input.definitionOfDone!.trim() : null,
            assignmentGroupId,
            percentComplete: input.type === "rock" ? input.percentComplete ?? 0 : 0,
            percentSource: "manual",
          });
          if (input.type === "rock" && input.raci.length) {
            const raci = input.raci.filter((assignment) => assignment.personId !== assigneeId || assignment.role !== "responsible");
            if (raci.length) await tx.insert(pulseRockRaciAssignments).values(raci.map((assignment) => ({ id: uuid(), workItemId: id, personId: assignment.personId, role: assignment.role })));
          }
          await writeActivity(tx, ctx.user.id, "work_item", id, "created", undefined, undefined, { type: input.type, meetingId: input.meetingId, ownerPersonId: input.ownerPersonId, assigneeId, assignmentGroupId });
          if (preferences.get(assigneeId)?.inApp) await tx.insert(pulseNotifications).values({
            id: uuid(), personId: assigneeId, notificationType: "assignment", requiresAction: true, sourceType: "work_item", sourceId: id, meetingId: input.meetingId, body: input.title,
          });
        }
      });
      if (meeting && input.type === "todo") {
        const recipients = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, assigneeIds));
        await Promise.all(recipients.filter((recipient) => recipient.email && preferences.get(recipient.id)?.email).map((recipient) => sendTransactionalEmail("todo_assigned", {
          recipientEmail: recipient.email!, recipientName: recipient.name ?? undefined, pulseMeetingName: meeting!.name, pulseWorkItemTitle: input.title, pulseItemUrl: "https://os.savvy-agents.com/pulse/work",
        }, { idempotencyKey: `pulse-todo-assigned:${assignmentGroupId ?? createdIds[0]}:${recipient.id}` })));
      }
      return { id: createdIds[0], ids: createdIds, dueDate, assignmentGroupId };
    }),

  update: pulseMemberProcedure
    .input(z.object({
      workItemId: z.string().uuid(),
      title: z.string().trim().min(1).max(500).optional(),
      description: z.string().trim().max(8000).nullable().optional(),
      dueDate: dateSchema.nullable().optional(),
      assigneeId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw unavailable();
      const { item, meeting } = await getAccessibleWorkItem(db, ctx.user.id, input.workItemId);
      if (input.assigneeId && meeting) await requireMeetingMember(db, input.assigneeId, meeting);
      const values: Record<string, unknown> = {};
      if (input.title !== undefined) values.title = input.title;
      if (input.description !== undefined) values.description = input.description;
      if (input.dueDate !== undefined) values.dueDate = input.dueDate;
      if (input.assigneeId !== undefined) values.assigneeId = input.assigneeId;
      if (!Object.keys(values).length) return { success: true };
      await db.transaction(async (tx: any) => {
        await tx.update(pulseWorkItems).set(values).where(eq(pulseWorkItems.id, item.id));
        await writeActivity(tx, ctx.user.id, "work_item", item.id, "updated", undefined, undefined, values);
      });
      return { success: true };
    }),

  setTodoStatus: pulseMemberProcedure
    .input(z.object({ workItemId: z.string().uuid(), status: todoStatusSchema }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw unavailable();
      const { item } = await getAccessibleWorkItem(db, ctx.user.id, input.workItemId);
      if (item.type !== "todo") throw new TRPCError({ code: "BAD_REQUEST", message: "This item is not a to-do." });
      if (item.status === input.status) return { success: true };
      await db.transaction(async (tx: any) => {
        await tx.update(pulseWorkItems).set({
          status: input.status,
          completedAt: input.status === "completed" ? new Date() : null,
          completedById: input.status === "completed" ? ctx.user.id : null,
        }).where(eq(pulseWorkItems.id, item.id));
        await tx.insert(pulseWorkItemStatusNotes).values({ id: uuid(), workItemId: item.id, fromStatus: item.status, toStatus: input.status, note: null, personId: ctx.user.id });
        await writeActivity(tx, ctx.user.id, "work_item", item.id, "status_changed", "status", item.status, input.status);
      });
      return { success: true };
    }),

  setIssueStatus: pulseMemberProcedure
    .input(z.object({
      workItemId: z.string().uuid(),
      status: issueStatusSchema,
      solvedNote: z.string().trim().max(2000).optional().nullable(),
      createTodo: z.object({ title: z.string().trim().min(1).max(500), dueDate: dateSchema.optional().nullable(), assigneeId: z.number().int().positive().optional() }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw unavailable();
      const { item, meeting } = await getAccessibleWorkItem(db, ctx.user.id, input.workItemId);
      if (item.type !== "issue") throw new TRPCError({ code: "BAD_REQUEST", message: "This item is not an issue." });
      if (input.status === "completed" && !input.solvedNote?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "What does completed look like? Add one sentence before completing this issue." });
      }
      if (input.createTodo && !meeting) throw new TRPCError({ code: "BAD_REQUEST", message: "A personal issue cannot create a meeting to-do." });
      if (input.createTodo && meeting) await requireMeetingMember(db, input.createTodo.assigneeId ?? item.assigneeId, meeting);
      let todoId: string | null = null;
      await db.transaction(async (tx: any) => {
        await tx.update(pulseWorkItems).set({
          status: input.status,
          solvedNote: input.status === "completed" ? input.solvedNote!.trim() : item.solvedNote,
          completedAt: input.status === "completed" ? new Date() : null,
          completedById: input.status === "completed" ? ctx.user.id : null,
        }).where(eq(pulseWorkItems.id, item.id));
        await tx.insert(pulseWorkItemStatusNotes).values({ id: uuid(), workItemId: item.id, fromStatus: item.status, toStatus: input.status, note: input.status === "completed" ? input.solvedNote!.trim() : null, personId: ctx.user.id });
        if (input.createTodo && meeting) {
          todoId = uuid();
          await tx.insert(pulseWorkItems).values({
            id: todoId,
            type: "todo",
            title: input.createTodo.title,
            meetingId: meeting.id,
            ownerPersonId: null,
            assigneeId: input.createTodo.assigneeId ?? item.assigneeId,
            createdById: ctx.user.id,
            status: "not_started",
            dueDate: input.createTodo.dueDate ?? defaultDueDate(),
            percentComplete: 0,
            percentSource: "manual",
          });
          await tx.insert(pulseIssueResultingTodos).values({ id: uuid(), issueWorkItemId: item.id, todoWorkItemId: todoId });
          await writeActivity(tx, ctx.user.id, "work_item", todoId, "created_from_issue", undefined, undefined, { issueWorkItemId: item.id });
        }
        await writeActivity(tx, ctx.user.id, "work_item", item.id, "status_changed", "status", item.status, input.status);
      });
      return { success: true, todoId };
    }),

  setRockStatus: pulseMemberProcedure
    .input(z.object({ workItemId: z.string().uuid(), status: rockStatusSchema, note: z.string().trim().max(2000).optional().nullable(), issue: z.object({ meetingId: z.string().uuid(), title: z.string().trim().min(1).max(500).optional() }).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw unavailable();
      const { item, meeting } = await getAccessibleWorkItem(db, ctx.user.id, input.workItemId);
      if (item.type !== "rock") throw new TRPCError({ code: "BAD_REQUEST", message: "This item is not a rock." });
      if (input.status === "off_track" && !input.issue) throw new TRPCError({ code: "BAD_REQUEST", message: "An off-track Rock must be routed to an L10 Issue." });
      if (item.status === input.status) return { success: true, asksForNote: null };
      const shouldAsk = input.status === "at_risk" || input.status === "off_track"
        ? "What happened?"
        : (["at_risk", "off_track"].includes(item.status) && input.status === "on_track" ? "What changed?" : null);
      const note = input.note?.trim() || null;
      const rockDoneRecipientIds = input.status === "done" && meeting
        ? Array.from(new Set<number>([meeting.ownerId, meeting.administratorId])).filter((id) => id !== ctx.user.id)
        : [];
      const rockDonePreferences = new Map<number, { inApp: boolean; email: boolean }>();
      for (const recipientId of rockDoneRecipientIds) rockDonePreferences.set(recipientId, await getPulseNotificationPreference(db, recipientId, "rock_completed"));
      const inAppRockDoneRecipientIds = rockDoneRecipientIds.filter((recipientId) => rockDonePreferences.get(recipientId)?.inApp);
      const issueMeeting = input.issue ? await require_visible_meeting(db, ctx.user.id, input.issue.meetingId) : null;
      let issueId: string | null = null;
      await db.transaction(async (tx: any) => {
        await tx.update(pulseWorkItems).set({
          status: input.status,
          completedAt: input.status === "done" ? new Date() : null,
          completedById: input.status === "done" ? ctx.user.id : null,
        }).where(eq(pulseWorkItems.id, item.id));
        if (note || input.status === "done") {
          await tx.insert(pulseWorkItemStatusNotes).values({ id: uuid(), workItemId: item.id, fromStatus: item.status, toStatus: input.status, note, personId: ctx.user.id });
        }
        if (inAppRockDoneRecipientIds.length) await tx.insert(pulseWorkItemNotifications).values(inAppRockDoneRecipientIds.map((recipientId) => ({ id: uuid(), recipientId, workItemId: item.id, commentId: null, notificationType: "rock_done" as const })));
        if (issueMeeting && input.issue) {
          issueId = uuid();
          await tx.insert(pulseWorkItems).values({ id: issueId, type: "issue", title: input.issue.title ?? `Off-track Rock: ${item.title}`, description: note ?? item.definitionOfDone ?? null, meetingId: issueMeeting.id, ownerPersonId: null, assigneeId: ctx.user.id, createdById: ctx.user.id, status: "not_started", dueDate: null, percentComplete: 0, percentSource: "manual" });
          await writeActivity(tx, ctx.user.id, "work_item", issueId, "created_from_off_track_rock", undefined, undefined, { rockId: item.id, meetingId: issueMeeting.id });
        }
        await writeActivity(tx, ctx.user.id, "work_item", item.id, "status_changed", "status", item.status, input.status);
      });
      if (rockDoneRecipientIds.length && meeting) {
        const recipients = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, rockDoneRecipientIds));
        await Promise.all(recipients.filter((recipient) => !!recipient.email && rockDonePreferences.get(recipient.id)?.email).map((recipient) => sendTransactionalEmail("rock_completed", {
          recipientEmail: recipient.email!,
          recipientName: recipient.name ?? undefined,
          pulseWorkItemTitle: item.title,
          pulseMeetingName: meeting.name,
          pulseItemUrl: "https://os.savvy-agents.com/pulse/work",
        }, { idempotencyKey: `pulse-rock-completed:${item.id}:${recipient.id}` })));
      }
      return { success: true, asksForNote: shouldAsk, issueId };
    }),

  setRockRaci: pulseMemberProcedure
    .input(z.object({ workItemId: z.string().uuid(), assignments: z.array(z.object({ personId: z.number().int().positive(), role: raciRoleSchema })).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw unavailable();
      const { item, meeting } = await getAccessibleWorkItem(db, ctx.user.id, input.workItemId);
      if (item.type !== "rock") throw new TRPCError({ code: "BAD_REQUEST", message: "Only Rocks use RACI." });
      if (meeting) for (const assignment of input.assignments) await requireMeetingMember(db, assignment.personId, meeting);
      const assignments = input.assignments.filter((assignment) => !(assignment.personId === item.assigneeId && assignment.role === "responsible"));
      await db.transaction(async (tx: any) => {
        await tx.update(pulseRockRaciAssignments).set({ deletedAt: new Date() }).where(and(eq(pulseRockRaciAssignments.workItemId, item.id), isNull(pulseRockRaciAssignments.deletedAt)));
        if (assignments.length) await tx.insert(pulseRockRaciAssignments).values(assignments.map((assignment) => ({ id: uuid(), workItemId: item.id, personId: assignment.personId, role: assignment.role })));
        await writeActivity(tx, ctx.user.id, "work_item", item.id, "raci_updated", "raci", undefined, assignments);
      });
      return { success: true };
    }),

  setManualRockPercent: pulseMemberProcedure
    .input(z.object({ workItemId: z.string().uuid(), percentComplete: z.number().int().min(0).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw unavailable();
      const { item } = await getAccessibleWorkItem(db, ctx.user.id, input.workItemId);
      if (item.type !== "rock") throw new TRPCError({ code: "BAD_REQUEST", message: "Only rocks have progress." });
      const milestones = await milestonesFor(db, item.id);
      if (milestones.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Milestones set this rock's progress. Update a milestone instead." });
      await db.transaction(async (tx: any) => {
        await tx.update(pulseWorkItems).set({ percentComplete: input.percentComplete, percentSource: "manual" }).where(eq(pulseWorkItems.id, item.id));
        await writeActivity(tx, ctx.user.id, "work_item", item.id, "progress_updated", "percentComplete", item.percentComplete, input.percentComplete);
      });
      return { success: true };
    }),

  addMilestone: pulseMemberProcedure
    .input(z.object({ workItemId: z.string().uuid(), title: z.string().trim().min(1).max(500), dueDate: dateSchema, sortOrder: z.number().int().min(0).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw unavailable();
      const { item } = await getAccessibleWorkItem(db, ctx.user.id, input.workItemId);
      if (item.type !== "rock") throw new TRPCError({ code: "BAD_REQUEST", message: "Only rocks can have milestones." });
      const existing = await milestonesFor(db, item.id);
      const id = uuid();
      await db.transaction(async (tx: any) => {
        await tx.insert(pulseRockMilestones).values({ id, workItemId: item.id, title: input.title, dueDate: input.dueDate, sortOrder: input.sortOrder ?? existing.length });
        await syncMilestoneProgress(tx, item.id);
        await writeActivity(tx, ctx.user.id, "work_item", item.id, "milestone_added", undefined, undefined, { milestoneId: id, title: input.title });
      });
      return { id };
    }),

  setMilestoneComplete: pulseMemberProcedure
    .input(z.object({ milestoneId: z.string().uuid(), isComplete: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw unavailable();
      const [milestone] = await db.select().from(pulseRockMilestones).where(and(eq(pulseRockMilestones.id, input.milestoneId), isNull(pulseRockMilestones.deletedAt))).limit(1);
      if (!milestone) throw new TRPCError({ code: "NOT_FOUND", message: "This milestone no longer exists." });
      const { item } = await getAccessibleWorkItem(db, ctx.user.id, milestone.workItemId);
      if (item.type !== "rock") throw new TRPCError({ code: "BAD_REQUEST", message: "This milestone is not attached to a rock." });
      let finalMilestoneCompleted = false;
      await db.transaction(async (tx: any) => {
        await tx.update(pulseRockMilestones).set({
          isComplete: input.isComplete,
          completedAt: input.isComplete ? new Date() : null,
          completedById: input.isComplete ? ctx.user.id : null,
        }).where(eq(pulseRockMilestones.id, milestone.id));
        const progress = await syncMilestoneProgress(tx, item.id);
        const [remaining] = await tx.select({ count: sql<number>`count(*)` }).from(pulseRockMilestones).where(and(eq(pulseRockMilestones.workItemId, item.id), eq(pulseRockMilestones.isComplete, false), isNull(pulseRockMilestones.deletedAt)));
        finalMilestoneCompleted = input.isComplete && Number(remaining?.count ?? 0) === 0;
        await writeActivity(tx, ctx.user.id, "work_item", item.id, "milestone_updated", "milestone", { milestoneId: milestone.id, isComplete: milestone.isComplete }, { milestoneId: milestone.id, isComplete: input.isComplete, progress, finalMilestoneCompleted });
      });
      return { success: true, finalMilestoneCompleted };
    }),

  reorderIssues: pulseMemberProcedure
    .input(z.object({ meetingId: z.string().uuid(), issueIds: z.array(z.string().uuid()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw unavailable();
      await require_visible_meeting(db, ctx.user.id, input.meetingId);
      const issues = await db.select({ id: pulseWorkItems.id, type: pulseWorkItems.type, meetingId: pulseWorkItems.meetingId })
        .from(pulseWorkItems).where(and(inArray(pulseWorkItems.id, input.issueIds), isNull(pulseWorkItems.deletedAt)));
      if (issues.length !== input.issueIds.length || issues.some((issue) => issue.type !== "issue" || issue.meetingId !== input.meetingId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only issues from this meeting can be reordered here." });
      }
      await db.transaction(async (tx: any) => {
        for (let priority = 0; priority < input.issueIds.length; priority += 1) {
          await tx.update(pulseWorkItems).set({ priority }).where(eq(pulseWorkItems.id, input.issueIds[priority]));
        }
        await writeActivity(tx, ctx.user.id, "meeting", input.meetingId, "issues_reordered", undefined, undefined, { issueIds: input.issueIds });
      });
      return { success: true };
    }),

  move: pulseMemberProcedure
    .input(z.object({
      workItemId: z.string().uuid(),
      toMeetingId: z.string().uuid().nullable(),
      toOwnerPersonId: z.number().int().positive().nullable(),
      reason: z.string().trim().max(1000).optional().nullable(),
    }).refine((input) => (input.toMeetingId === null) !== (input.toOwnerPersonId === null), { message: "Choose one destination: a meeting or a person." }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw unavailable();
      const { item } = await getAccessibleWorkItem(db, ctx.user.id, input.workItemId);
      if (item.type !== "rock" && !input.toMeetingId) throw new TRPCError({ code: "BAD_REQUEST", message: "Every To-Do and Issue must stay in an authorized meeting forum." });
      let destination: { id: string; name: string } | null = null;
      if (input.toMeetingId) {
        const targetMeeting = await require_visible_meeting(db, ctx.user.id, input.toMeetingId);
        destination = targetMeeting;
        await requireMeetingMember(db, item.assigneeId, targetMeeting);
      } else if (input.toOwnerPersonId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Personal work can only be moved to you." });
      }
      await db.transaction(async (tx: any) => {
        await tx.update(pulseWorkItems).set({ meetingId: input.toMeetingId, ownerPersonId: input.toOwnerPersonId }).where(eq(pulseWorkItems.id, item.id));
        await tx.insert(pulseWorkItemMoves).values({ id: uuid(), workItemId: item.id, fromMeetingId: item.meetingId, toMeetingId: input.toMeetingId, movedById: ctx.user.id, reason: input.reason ?? null });
        await writeActivity(tx, ctx.user.id, "work_item", item.id, "moved", "meetingId", { meetingId: item.meetingId, ownerPersonId: item.ownerPersonId }, { meetingId: input.toMeetingId, ownerPersonId: input.toOwnerPersonId });
      });
      return { success: true };
    }),

  addComment: pulseMemberProcedure
    .input(z.object({ workItemId: z.string().uuid(), body: z.string().trim().min(1).max(8000), mentionedPersonIds: z.array(z.number().int().positive()).max(50).default([]) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw unavailable();
      const { item, meeting } = await getAccessibleWorkItem(db, ctx.user.id, input.workItemId);
      const mentionedPersonIds = Array.from(new Set<number>(input.mentionedPersonIds)).filter((id) => id !== ctx.user.id);
      if (mentionedPersonIds.length && !meeting) throw new TRPCError({ code: "BAD_REQUEST", message: "Personal work cannot mention someone else." });
      if (meeting) {
        for (const personId of mentionedPersonIds) await requireMeetingMember(db, personId, meeting);
      }
      const mentionPreferences = new Map<number, { inApp: boolean; email: boolean }>();
      for (const personId of mentionedPersonIds) mentionPreferences.set(personId, await getPulseNotificationPreference(db, personId, "mention"));
      const inAppMentionedPersonIds = mentionedPersonIds.filter((personId) => mentionPreferences.get(personId)?.inApp);
      const commentId = uuid();
      await db.transaction(async (tx: any) => {
        await tx.insert(pulseWorkItemComments).values({ id: commentId, workItemId: item.id, authorId: ctx.user.id, body: input.body });
        if (mentionedPersonIds.length) {
          await tx.insert(pulseWorkItemCommentMentions).values(mentionedPersonIds.map((mentionedPersonId) => ({ id: uuid(), commentId, mentionedPersonId })));
          if (inAppMentionedPersonIds.length) await tx.insert(pulseWorkItemNotifications).values(inAppMentionedPersonIds.map((recipientId) => ({ id: uuid(), recipientId, workItemId: item.id, commentId, notificationType: "mention" as const })));
        }
        // A direct comment to the assignee needs a response even when it does not use an @mention.
        // Do not create a second card when that same person was explicitly mentioned.
        if (item.assigneeId !== ctx.user.id && !mentionedPersonIds.includes(item.assigneeId)) {
          await tx.insert(pulseNotifications).values({
            id: uuid(),
            personId: item.assigneeId,
            notificationType: "comment",
            requiresAction: true,
            sourceType: "work_item",
            sourceId: item.id,
            meetingId: item.meetingId,
            body: input.body,
          });
        }
        await writeActivity(tx, ctx.user.id, "work_item", item.id, "comment_added", undefined, undefined, { commentId, mentionedPersonIds });
      });
      if (meeting && mentionedPersonIds.length) {
        const [author] = await db.select({ name: users.name }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
        const recipients = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, mentionedPersonIds));
        await Promise.all(recipients.filter((recipient) => !!recipient.email && mentionPreferences.get(recipient.id)?.email).map((recipient) => sendTransactionalEmail("mention", {
          recipientEmail: recipient.email!, recipientName: recipient.name ?? undefined, mentionedByName: author?.name ?? "A teammate", pulseMeetingName: meeting.name, pulseActionUrl: `https://os.savvy-agents.com/pulse/meetings/${meeting.id}`,
        }, { idempotencyKey: `pulse-mention:${commentId}:${recipient.id}` })));
      }
      return { id: commentId };
    }),

  resolveQuarterRollover: pulseMemberProcedure
    .input(z.object({
      workItemId: z.string().uuid(),
      action: z.enum(["carry", "done", "drop"]),
      nextQuarter: quarterSchema.optional(),
    }).superRefine((input, context) => {
      if (input.action === "carry" && !input.nextQuarter) context.addIssue({ code: z.ZodIssueCode.custom, path: ["nextQuarter"], message: "Choose the next quarter." });
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw unavailable();
      const { item } = await getAccessibleWorkItem(db, ctx.user.id, input.workItemId);
      if (item.type !== "rock") throw new TRPCError({ code: "BAD_REQUEST", message: "Only rocks have a quarter rollover choice." });
      if (item.assigneeId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Only the person assigned to this rock can choose what happens next." });
      const [prompt] = await db.select().from(pulseWorkItemNotifications).where(and(
        eq(pulseWorkItemNotifications.workItemId, item.id),
        eq(pulseWorkItemNotifications.recipientId, ctx.user.id),
        eq(pulseWorkItemNotifications.notificationType, "quarter_rollover"),
        isNull(pulseWorkItemNotifications.actionedAt),
        isNull(pulseWorkItemNotifications.deletedAt),
      )).limit(1);
      if (!prompt) throw new TRPCError({ code: "NOT_FOUND", message: "This rollover choice is no longer waiting for you." });

      const nextStatus = input.action === "done" ? "done" : input.action === "drop" ? "dropped" : "on_track";
      const note = input.action === "carry" ? `Carried to ${input.nextQuarter}.` : input.action === "done" ? "Marked done at quarter end." : "Dropped at quarter end.";
      await db.transaction(async (tx: any) => {
        await tx.update(pulseWorkItems).set({
          status: nextStatus,
          quarter: input.action === "carry" ? input.nextQuarter : item.quarter,
          completedAt: input.action === "done" ? new Date() : null,
          completedById: input.action === "done" ? ctx.user.id : null,
        }).where(eq(pulseWorkItems.id, item.id));
        await tx.update(pulseWorkItemNotifications).set({ actionedAt: new Date() }).where(eq(pulseWorkItemNotifications.id, prompt.id));
        await tx.insert(pulseWorkItemStatusNotes).values({ id: uuid(), workItemId: item.id, fromStatus: item.status, toStatus: nextStatus, note, personId: ctx.user.id });
        await writeActivity(tx, ctx.user.id, "work_item", item.id, "quarter_rollover_resolved", "quarter", item.quarter, input.action === "carry" ? input.nextQuarter : input.action);
      });
      return { success: true };
    }),

  assignees: pulseMemberProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw unavailable();
    const visibleIds = await visible_meeting_ids(db, ctx.user.id);
    if (!visibleIds.length) return [{ id: ctx.user.id, name: ctx.user.name, email: ctx.user.email }];
    const rows = await db.select({ id: users.id, name: users.name, email: users.email })
      .from(pulseMeetingMembers)
      .innerJoin(users, eq(users.id, pulseMeetingMembers.personId))
      .where(and(inArray(pulseMeetingMembers.meetingId, visibleIds), isNull(pulseMeetingMembers.removedAt), isNull(pulseMeetingMembers.deletedAt), sql`${users.openId} NOT LIKE 'pulse_slice_fixture_%'`))
      .orderBy(asc(users.name));
    const unique = new Map<number, typeof rows[number]>();
    for (const row of rows) unique.set(row.id, row);
    if (!unique.has(ctx.user.id)) unique.set(ctx.user.id, { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email });
    return Array.from(unique.values());
  }),

  validStatuses: pulseMemberProcedure.query(() => ({
    todo: todoStatusSchema.options,
    issue: issueStatusSchema.options,
    rock: rockStatusSchema.options,
  })),
});
