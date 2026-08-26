import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  tasks,
  users,
  webinarAttendees,
  webinarMarketingTemplateTasks,
  webinarMarketingTemplates,
  webinars,
  webinarTaskLinks,
  zoomWebhookEvents,
} from "../../drizzle/schema";
import { getDb, logActivity } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createZoomWebinar,
  deleteZoomWebinar,
  getZoomConfigurationStatus,
  listZoomWebinarRegistrants,
  normalizeZoomRegistrantStatus,
  parseZoomDate,
  type ZoomRegistrant,
  updateZoomWebinar,
} from "../zoomWebinarService";

const taskTypeSchema = z.enum(["follow_up", "outreach", "document", "call", "email", "meeting", "review", "payout", "other"]);
const prioritySchema = z.enum(["low", "medium", "high", "urgent"]);
const approvalSchema = z.enum(["automatically", "manually", "no_registration"]);

function requireAdmin(role: string) {
  if (role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access is required." });
}

async function getDatabase() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  return db;
}

function parseDateTime(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid webinar date and time." });
  return date;
}

function taskDueDate(webinarStart: Date, offsetDays: number): Date {
  return new Date(webinarStart.getTime() + offsetDays * 24 * 60 * 60 * 1000);
}

function webinarRegistrationEnabled(approval: "automatically" | "manually" | "no_registration") {
  return approval !== "no_registration";
}

async function createWebinarTasks(input: {
  webinarId: number;
  templateId: number | null | undefined;
  startTime: Date;
  createdById: number;
  webinarTitle: string;
}) {
  if (!input.templateId) return 0;
  const db = await getDatabase();
  const templateTasks = await db
    .select()
    .from(webinarMarketingTemplateTasks)
    .where(eq(webinarMarketingTemplateTasks.templateId, input.templateId))
    .orderBy(asc(webinarMarketingTemplateTasks.sortOrder));

  for (const templateTask of templateTasks) {
    const dueDate = taskDueDate(input.startTime, templateTask.dueDaysOffset);
    const [taskResult] = await db.insert(tasks).values({
      title: templateTask.title.replace(/\{\{webinar_title\}\}/g, input.webinarTitle),
      description: [
        templateTask.description?.replace(/\{\{webinar_title\}\}/g, input.webinarTitle),
        `Webinar marketing task for “${input.webinarTitle}”.`,
      ].filter(Boolean).join("\n\n"),
      assignedToId: templateTask.assignedToId,
      createdById: input.createdById,
      dueDate,
      priority: templateTask.priority,
      taskType: templateTask.taskType,
      isAutomated: true,
    });
    await db.insert(webinarTaskLinks).values({
      webinarId: input.webinarId,
      taskId: taskResult.insertId,
      templateTaskId: templateTask.id,
    });
  }
  return templateTasks.length;
}

async function upsertZoomAttendee(webinarId: number, registrant: ZoomRegistrant, statusOverride?: ReturnType<typeof normalizeZoomRegistrantStatus>) {
  const db = await getDatabase();
  const registrantId = String(registrant.registrant_id ?? registrant.id ?? "").trim() || null;
  const email = typeof registrant.email === "string" ? registrant.email.trim().toLowerCase() : null;
  const status = statusOverride ?? normalizeZoomRegistrantStatus(registrant.status);
  const data = {
    zoomRegistrantId: registrantId,
    zoomParticipantId: typeof registrant.participant_user_id === "string" ? registrant.participant_user_id : null,
    email,
    firstName: typeof registrant.first_name === "string" ? registrant.first_name : null,
    lastName: typeof registrant.last_name === "string" ? registrant.last_name : null,
    status,
    registeredAt: parseZoomDate(registrant.create_time),
    joinedAt: parseZoomDate(registrant.join_time),
    leftAt: parseZoomDate(registrant.leave_time),
    attendanceMinutes: typeof registrant.duration === "number" ? Math.round(registrant.duration) : null,
    providerData: registrant as Record<string, unknown>,
  };

  let existing: { id: number } | undefined;
  if (registrantId) {
    [existing] = await db.select({ id: webinarAttendees.id })
      .from(webinarAttendees)
      .where(and(eq(webinarAttendees.webinarId, webinarId), eq(webinarAttendees.zoomRegistrantId, registrantId)))
      .limit(1);
  }
  if (!existing && email) {
    [existing] = await db.select({ id: webinarAttendees.id })
      .from(webinarAttendees)
      .where(and(eq(webinarAttendees.webinarId, webinarId), eq(webinarAttendees.email, email)))
      .limit(1);
  }

  if (existing) {
    await db.update(webinarAttendees).set(data).where(eq(webinarAttendees.id, existing.id));
  } else {
    await db.insert(webinarAttendees).values({ webinarId, ...data });
  }
}

async function syncAttendeesFromZoom(webinarId: number) {
  const db = await getDatabase();
  const [webinar] = await db.select().from(webinars).where(eq(webinars.id, webinarId));
  if (!webinar) throw new TRPCError({ code: "NOT_FOUND", message: "Webinar not found." });
  if (!webinar.zoomWebinarId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This webinar does not have a Zoom webinar ID." });

  try {
    const registrants = await listZoomWebinarRegistrants(webinar.zoomWebinarId);
    for (const registrant of registrants) await upsertZoomAttendee(webinar.id, registrant);
    await db.update(webinars).set({ lastZoomSyncAt: new Date(), lastZoomSyncError: null }).where(eq(webinars.id, webinarId));
    return { synchronized: registrants.length, lastSyncAt: new Date() };
  } catch (error: any) {
    const message = error?.message ?? "Zoom attendee sync failed.";
    await db.update(webinars).set({ lastZoomSyncError: message }).where(eq(webinars.id, webinarId));
    throw new TRPCError({ code: "BAD_GATEWAY", message });
  }
}

function defaultMarketingTasks() {
  return [
    { title: "Build webinar registration page and RSVP messaging", description: "Create the registration experience and confirm the Zoom registration link is ready to share.", dueDaysOffset: -21, priority: "high" as const, taskType: "document" as const, sortOrder: 1 },
    { title: "Publish webinar promotion across email and social channels", description: "Launch the first promotional wave and use {{webinar_title}} consistently in all creative.", dueDaysOffset: -14, priority: "high" as const, taskType: "outreach" as const, sortOrder: 2 },
    { title: "Send the one-week webinar reminder", description: "Send a reminder to registered and target audiences with the webinar registration link.", dueDaysOffset: -7, priority: "medium" as const, taskType: "email" as const, sortOrder: 3 },
    { title: "Send the day-of webinar reminder", description: "Confirm event readiness and send the final reminder for {{webinar_title}}.", dueDaysOffset: 0, priority: "high" as const, taskType: "email" as const, sortOrder: 4 },
    { title: "Prepare webinar registrant follow-up", description: "Review the attendee list and create the post-webinar follow-up plan.", dueDaysOffset: 1, priority: "medium" as const, taskType: "follow_up" as const, sortOrder: 5 },
  ];
}

async function ensureDefaultTemplate(createdById: number) {
  const db = await getDatabase();
  const [existing] = await db.select({ id: webinarMarketingTemplates.id })
    .from(webinarMarketingTemplates)
    .where(eq(webinarMarketingTemplates.name, "Standard Webinar Marketing"))
    .limit(1);
  if (existing) return existing.id;

  const [result] = await db.insert(webinarMarketingTemplates).values({
    name: "Standard Webinar Marketing",
    description: "A reusable marketing checklist for promoting a SavvyOS webinar before and after the event.",
    createdById,
  });
  const templateId = result.insertId;
  await db.insert(webinarMarketingTemplateTasks).values(defaultMarketingTasks().map((task) => ({ templateId, ...task })));
  return templateId;
}

const templateTaskInput = z.object({
  title: z.string().trim().min(1).max(512),
  description: z.string().trim().max(5000).optional().nullable(),
  assignedToId: z.number().int().positive().optional().nullable(),
  dueDaysOffset: z.number().int().min(-365).max(365),
  priority: prioritySchema.default("medium"),
  taskType: taskTypeSchema.default("other"),
  sortOrder: z.number().int().min(0).default(0),
});

export const webinarsRouter = router({
  configuration: protectedProcedure.query(({ ctx }) => {
    requireAdmin(ctx.user.role);
    return getZoomConfigurationStatus();
  }),

  listEligibleAssignees: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDatabase();
    return db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.name));
  }),

  listTemplates: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.user.role);
    await ensureDefaultTemplate(ctx.user.id);
    const db = await getDatabase();
    return db.select({
      id: webinarMarketingTemplates.id,
      name: webinarMarketingTemplates.name,
      description: webinarMarketingTemplates.description,
      isActive: webinarMarketingTemplates.isActive,
      createdAt: webinarMarketingTemplates.createdAt,
      taskCount: sql<number>`(SELECT COUNT(*) FROM webinar_marketing_template_tasks WHERE templateId = ${webinarMarketingTemplates.id})`.as("taskCount"),
    }).from(webinarMarketingTemplates).orderBy(desc(webinarMarketingTemplates.isActive), asc(webinarMarketingTemplates.name));
  }),

  getTemplate: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input, ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDatabase();
    const [template] = await db.select().from(webinarMarketingTemplates).where(eq(webinarMarketingTemplates.id, input.id));
    if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Marketing template not found." });
    const templateTasks = await db.select({
      id: webinarMarketingTemplateTasks.id,
      title: webinarMarketingTemplateTasks.title,
      description: webinarMarketingTemplateTasks.description,
      assignedToId: webinarMarketingTemplateTasks.assignedToId,
      dueDaysOffset: webinarMarketingTemplateTasks.dueDaysOffset,
      priority: webinarMarketingTemplateTasks.priority,
      taskType: webinarMarketingTemplateTasks.taskType,
      sortOrder: webinarMarketingTemplateTasks.sortOrder,
      assigneeName: users.name,
      assigneeEmail: users.email,
    }).from(webinarMarketingTemplateTasks)
      .leftJoin(users, eq(webinarMarketingTemplateTasks.assignedToId, users.id))
      .where(eq(webinarMarketingTemplateTasks.templateId, input.id))
      .orderBy(asc(webinarMarketingTemplateTasks.sortOrder));
    return { ...template, tasks: templateTasks };
  }),

  createTemplate: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(255), description: z.string().trim().max(5000).optional().nullable() })).mutation(async ({ input, ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDatabase();
    const [result] = await db.insert(webinarMarketingTemplates).values({ ...input, createdById: ctx.user.id });
    return { id: result.insertId };
  }),

  updateTemplate: protectedProcedure.input(z.object({
    id: z.number().int().positive(),
    data: z.object({ name: z.string().trim().min(1).max(255).optional(), description: z.string().trim().max(5000).optional().nullable(), isActive: z.boolean().optional() }),
  })).mutation(async ({ input, ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDatabase();
    await db.update(webinarMarketingTemplates).set(input.data).where(eq(webinarMarketingTemplates.id, input.id));
    return { success: true };
  }),

  deleteTemplate: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDatabase();
    const [inUse] = await db.select({ count: sql<number>`COUNT(*)` }).from(webinars).where(eq(webinars.marketingTemplateId, input.id));
    if (Number(inUse?.count ?? 0) > 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This template is already linked to a webinar and cannot be deleted." });
    await db.delete(webinarMarketingTemplates).where(eq(webinarMarketingTemplates.id, input.id));
    return { success: true };
  }),

  addTemplateTask: protectedProcedure.input(z.object({ templateId: z.number().int().positive(), data: templateTaskInput })).mutation(async ({ input, ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDatabase();
    const [result] = await db.insert(webinarMarketingTemplateTasks).values({ templateId: input.templateId, ...input.data });
    return { id: result.insertId };
  }),

  updateTemplateTask: protectedProcedure.input(z.object({ id: z.number().int().positive(), data: templateTaskInput.partial() })).mutation(async ({ input, ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDatabase();
    await db.update(webinarMarketingTemplateTasks).set(input.data).where(eq(webinarMarketingTemplateTasks.id, input.id));
    return { success: true };
  }),

  deleteTemplateTask: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDatabase();
    await db.delete(webinarMarketingTemplateTasks).where(eq(webinarMarketingTemplateTasks.id, input.id));
    return { success: true };
  }),

  list: protectedProcedure.input(z.object({ includePast: z.boolean().default(false) }).optional()).query(async ({ input, ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDatabase();
    const values = await db.select({
      webinar: webinars,
      templateName: webinarMarketingTemplates.name,
      hostName: users.name,
    }).from(webinars)
      .leftJoin(webinarMarketingTemplates, eq(webinars.marketingTemplateId, webinarMarketingTemplates.id))
      .leftJoin(users, eq(webinars.hostUserId, users.id))
      .where(input?.includePast ? undefined : and(gte(webinars.startTime, new Date()), inArray(webinars.status, ["scheduled", "live"])))
      .orderBy(asc(webinars.startTime));

    const attendeeCounts = await db.select({
      webinarId: webinarAttendees.webinarId,
      registered: sql<number>`SUM(CASE WHEN ${webinarAttendees.status} IN ('registered', 'approved') THEN 1 ELSE 0 END)`.as("registered"),
      attended: sql<number>`SUM(CASE WHEN ${webinarAttendees.status} = 'attended' THEN 1 ELSE 0 END)`.as("attended"),
      total: sql<number>`COUNT(*)`.as("total"),
    }).from(webinarAttendees).groupBy(webinarAttendees.webinarId);
    const countByWebinar = new Map(attendeeCounts.map((count) => [count.webinarId, { registered: Number(count.registered ?? 0), attended: Number(count.attended ?? 0), total: Number(count.total ?? 0) }]));

    return values.map((value) => ({ ...value, attendeeCounts: countByWebinar.get(value.webinar.id) ?? { registered: 0, attended: 0, total: 0 } }));
  }),

  getById: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input, ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDatabase();
    const [value] = await db.select({ webinar: webinars, templateName: webinarMarketingTemplates.name, hostName: users.name })
      .from(webinars)
      .leftJoin(webinarMarketingTemplates, eq(webinars.marketingTemplateId, webinarMarketingTemplates.id))
      .leftJoin(users, eq(webinars.hostUserId, users.id))
      .where(eq(webinars.id, input.id));
    if (!value) throw new TRPCError({ code: "NOT_FOUND", message: "Webinar not found." });

    const linkedTasks = await db.select({ task: tasks, templateTaskTitle: webinarMarketingTemplateTasks.title })
      .from(webinarTaskLinks)
      .innerJoin(tasks, eq(webinarTaskLinks.taskId, tasks.id))
      .leftJoin(webinarMarketingTemplateTasks, eq(webinarTaskLinks.templateTaskId, webinarMarketingTemplateTasks.id))
      .where(eq(webinarTaskLinks.webinarId, input.id))
      .orderBy(asc(tasks.dueDate));
    const counts = await db.select({
      registered: sql<number>`SUM(CASE WHEN ${webinarAttendees.status} IN ('registered', 'approved') THEN 1 ELSE 0 END)`.as("registered"),
      attended: sql<number>`SUM(CASE WHEN ${webinarAttendees.status} = 'attended' THEN 1 ELSE 0 END)`.as("attended"),
      total: sql<number>`COUNT(*)`.as("total"),
    }).from(webinarAttendees).where(eq(webinarAttendees.webinarId, input.id));

    return { ...value, linkedTasks, attendeeCounts: { registered: Number(counts[0]?.registered ?? 0), attended: Number(counts[0]?.attended ?? 0), total: Number(counts[0]?.total ?? 0) } };
  }),

  create: protectedProcedure.input(z.object({
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().max(5000).optional().nullable(),
    startTime: z.string().min(1),
    durationMinutes: z.number().int().min(15).max(480).default(60),
    timezone: z.string().trim().min(1).max(64).default("America/New_York"),
    registrationApproval: approvalSchema.default("automatically"),
    marketingTemplateId: z.number().int().positive().optional().nullable(),
  })).mutation(async ({ input, ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDatabase();
    const startTime = parseDateTime(input.startTime);
    const configuration = getZoomConfigurationStatus();
    if (!configuration.configured) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Zoom is not configured. Add ${configuration.missing.join(", ")} to the SavvyOS service configuration first.` });
    }

    const zoomWebinar = await createZoomWebinar({ ...input, startTime });
    try {
      const [result] = await db.insert(webinars).values({
        title: input.title,
        description: input.description ?? null,
        startTime,
        durationMinutes: input.durationMinutes,
        timezone: input.timezone,
        registrationApproval: input.registrationApproval,
        registrationEnabled: webinarRegistrationEnabled(input.registrationApproval),
        marketingTemplateId: input.marketingTemplateId ?? null,
        createdById: ctx.user.id,
        zoomWebinarId: String(zoomWebinar.id),
        zoomWebinarUuid: zoomWebinar.uuid ?? null,
        zoomJoinUrl: zoomWebinar.join_url ?? null,
        zoomRegistrationUrl: zoomWebinar.registration_url ?? zoomWebinar.join_url ?? null,
        zoomStartUrl: zoomWebinar.start_url ?? null,
        zoomCreatedAt: parseZoomDate(zoomWebinar.created_at) ?? new Date(),
      });
      const webinarId = result.insertId;
      const generatedTasks = await createWebinarTasks({ webinarId, templateId: input.marketingTemplateId, startTime, createdById: ctx.user.id, webinarTitle: input.title });
      await logActivity({ userId: ctx.user.id, action: "webinar_created", entityType: "webinar", entityId: webinarId, details: { title: input.title, zoomWebinarId: zoomWebinar.id, generatedTasks } });
      return { id: webinarId, zoomRegistrationUrl: zoomWebinar.registration_url ?? zoomWebinar.join_url ?? null, generatedTasks };
    } catch (error) {
      try { await deleteZoomWebinar(String(zoomWebinar.id)); } catch { /* Preserve the original persistence failure. */ }
      throw error;
    }
  }),

  update: protectedProcedure.input(z.object({
    id: z.number().int().positive(),
    data: z.object({
      title: z.string().trim().min(1).max(255).optional(),
      description: z.string().trim().max(5000).optional().nullable(),
      startTime: z.string().optional(),
      durationMinutes: z.number().int().min(15).max(480).optional(),
      timezone: z.string().trim().min(1).max(64).optional(),
      registrationApproval: approvalSchema.optional(),
    }),
  })).mutation(async ({ input, ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDatabase();
    const [current] = await db.select().from(webinars).where(eq(webinars.id, input.id));
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Webinar not found." });
    const next = {
      title: input.data.title ?? current.title,
      description: input.data.description !== undefined ? input.data.description : current.description,
      startTime: input.data.startTime ? parseDateTime(input.data.startTime) : current.startTime,
      durationMinutes: input.data.durationMinutes ?? current.durationMinutes,
      timezone: input.data.timezone ?? current.timezone,
      registrationApproval: input.data.registrationApproval ?? current.registrationApproval,
    };
    if (current.zoomWebinarId) await updateZoomWebinar(current.zoomWebinarId, next);
    await db.update(webinars).set({ ...next, registrationEnabled: webinarRegistrationEnabled(next.registrationApproval) }).where(eq(webinars.id, input.id));
    await logActivity({ userId: ctx.user.id, action: "webinar_updated", entityType: "webinar", entityId: input.id, details: { title: next.title } });
    return { success: true };
  }),

  cancel: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDatabase();
    const [current] = await db.select().from(webinars).where(eq(webinars.id, input.id));
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Webinar not found." });
    if (current.status === "cancelled") return { success: true };
    if (current.zoomWebinarId) await deleteZoomWebinar(current.zoomWebinarId);
    await db.update(webinars).set({ status: "cancelled" }).where(eq(webinars.id, input.id));
    await logActivity({ userId: ctx.user.id, action: "webinar_cancelled", entityType: "webinar", entityId: input.id, details: { title: current.title } });
    return { success: true };
  }),

  listAttendees: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input, ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDatabase();
    return db.select().from(webinarAttendees).where(eq(webinarAttendees.webinarId, input.id)).orderBy(desc(webinarAttendees.registeredAt), asc(webinarAttendees.email));
  }),

  syncAttendees: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    requireAdmin(ctx.user.role);
    const result = await syncAttendeesFromZoom(input.id);
    await logActivity({ userId: ctx.user.id, action: "webinar_attendees_synced", entityType: "webinar", entityId: input.id, details: { synchronized: result.synchronized } });
    return result;
  }),
});

export async function processZoomWebhookEvent(input: { eventKey: string; eventType: string; eventTimestamp?: number; payload: Record<string, unknown> }) {
  const db = await getDatabase();
  const object = (input.payload.object ?? {}) as Record<string, unknown>;
  const zoomWebinarId = object.id != null ? String(object.id) : "";
  const [webinar] = zoomWebinarId
    ? await db.select().from(webinars).where(eq(webinars.zoomWebinarId, zoomWebinarId)).limit(1)
    : [];

  try {
    await db.insert(zoomWebhookEvents).values({
      eventKey: input.eventKey,
      webinarId: webinar?.id ?? null,
      eventType: input.eventType,
      eventTimestamp: input.eventTimestamp ? new Date(input.eventTimestamp) : null,
      payload: input.payload,
    });
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY" || String(error?.message ?? "").includes("Duplicate")) return { duplicate: true, handled: false };
    throw error;
  }

  if (!webinar) return { duplicate: false, handled: false };

  const registrant = (object.registrant ?? object.participant ?? object) as ZoomRegistrant;
  if (input.eventType.includes("registration_created")) {
    await upsertZoomAttendee(webinar.id, registrant, "registered");
  } else if (input.eventType.includes("registration_approved")) {
    await upsertZoomAttendee(webinar.id, registrant, "approved");
  } else if (input.eventType.includes("registration_cancelled")) {
    await upsertZoomAttendee(webinar.id, registrant, "cancelled");
  } else if (input.eventType.includes("registration_denied")) {
    await upsertZoomAttendee(webinar.id, registrant, "denied");
  } else if (input.eventType.includes("participant_joined")) {
    await upsertZoomAttendee(webinar.id, registrant, "attended");
  } else if (input.eventType.endsWith(".started")) {
    await db.update(webinars).set({ status: "live" }).where(eq(webinars.id, webinar.id));
  } else if (input.eventType.endsWith(".ended")) {
    await db.update(webinars).set({ status: "ended" }).where(eq(webinars.id, webinar.id));
  }

  await db.update(webinars).set({ lastZoomSyncAt: new Date(), lastZoomSyncError: null }).where(eq(webinars.id, webinar.id));
  return { duplicate: false, handled: true, webinarId: webinar.id };
}
