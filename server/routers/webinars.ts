import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  contacts,
  emailTemplates,
  leadSources,
  users,
  webinarAttendees,
  webinars,
  zoomWebhookEvents,
} from "../../drizzle/schema";
import { createCommunication, createContact, getDb, logActivity } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { canAdminUsePermission } from "./permissions";
import { sendTransactionalEmail } from "../_core/resendEmail";
import { triggerSmartPlansForContact } from "../smartPlanScheduler";
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

const approvalSchema = z.enum(["automatically", "manually", "no_registration"]);
const WEBINAR_MARKETING_EMAIL_TYPE = "webinar_marketing_request";
const MARKETING_EMAIL = "marketing@savvy.realty";
const DEFAULT_MARKETING_EMAIL_TEMPLATE = {
  subject: "New Webinar Marketing Request: {{webinar_title}}",
  bodyText: "A new webinar has been created in SavvyOS. Please coordinate the promotional plan with {{webinar_creator_name}} and use the registration link below in approved marketing.",
};

async function requireWebinarAccess(user: { id: number; role: string; email?: string | null }) {
  if (user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access is required." });
  if (!await canAdminUsePermission(user, "canViewWebinars")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Webinar access has not been granted in Super Permissions." });
  }
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

function webinarRegistrationEnabled(approval: "automatically" | "manually" | "no_registration") {
  return approval !== "no_registration";
}

function registrantName(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 128) : fallback;
}

async function syncRegistrantContact(input: {
  attendeeId: number;
  webinar: typeof webinars.$inferSelect;
  email: string | null;
  firstName: string;
  lastName: string;
  registeredAt: Date | null;
}) {
  if (!input.email) return;
  const db = await getDatabase();
  const [attendee] = await db.select({
    contactId: webinarAttendees.contactId,
    contactRegistrationNotedAt: webinarAttendees.contactRegistrationNotedAt,
  }).from(webinarAttendees).where(eq(webinarAttendees.id, input.attendeeId)).limit(1);
  if (!attendee) return;

  let contactId = attendee.contactId;
  let createdContact = false;
  if (!contactId) {
    const [existingContact] = await db.select({ id: contacts.id })
      .from(contacts)
      .where(or(
        sql`LOWER(${contacts.email}) = ${input.email}`,
        sql`LOWER(${contacts.secondaryEmail}) = ${input.email}`,
        sql`LOWER(${contacts.spouseEmail}) = ${input.email}`,
      ))
      .limit(1);
    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const [zoomWebinarSource] = await db.select({ id: leadSources.id })
        .from(leadSources)
        .where(eq(leadSources.name, "Zoom Webinar"))
        .limit(1);
      if (!zoomWebinarSource) {
        throw new Error('The "Zoom Webinar" lead source is required before registrants can be created as contacts.');
      }
      contactId = await createContact({
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        leadSourceId: zoomWebinarSource.id,
        isaStatus: "new_lead",
      });
      createdContact = true;
      triggerSmartPlansForContact(contactId, zoomWebinarSource.id).catch((error) =>
        console.error("[Webinar] Smart Plan trigger failed for webinar registrant", contactId, error),
      );
      await logActivity({
        userId: input.webinar.createdById,
        action: "contact_created_from_webinar_registration",
        entityType: "contact",
        entityId: contactId,
        relatedContactId: contactId,
        details: { webinarId: input.webinar.id, webinarTitle: input.webinar.title, leadSource: "Zoom Webinar" },
      });
    }
    await db.update(webinarAttendees).set({ contactId }).where(eq(webinarAttendees.id, input.attendeeId));
  }

  if (!contactId || attendee.contactRegistrationNotedAt) return;
  const registrationTime = input.registeredAt ?? new Date();
  const registrationLabel = registrationTime.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: input.webinar.timezone || "America/New_York" });
  const noteId = await createCommunication({
    type: "note",
    subject: `Registered for Zoom webinar: ${input.webinar.title}`,
    body: `Registered for the Zoom webinar “${input.webinar.title}” on ${registrationLabel}.`,
    direction: "internal",
    authorId: input.webinar.createdById,
    relatedContactId: contactId,
  });
  await db.update(webinarAttendees).set({ contactId, contactRegistrationNotedAt: new Date() }).where(eq(webinarAttendees.id, input.attendeeId));
  await logActivity({
    userId: input.webinar.createdById,
    action: "webinar_registration_recorded_on_contact",
    entityType: "communication",
    entityId: noteId,
    relatedContactId: contactId,
    details: { webinarId: input.webinar.id, webinarTitle: input.webinar.title, contactCreated: createdContact },
  });
}

async function upsertZoomAttendee(webinarId: number, registrant: ZoomRegistrant, statusOverride?: ReturnType<typeof normalizeZoomRegistrantStatus>) {
  const db = await getDatabase();
  const [webinar] = await db.select().from(webinars).where(eq(webinars.id, webinarId)).limit(1);
  if (!webinar) throw new Error("Webinar not found while synchronizing a Zoom registrant.");

  const registrantId = String(registrant.registrant_id ?? registrant.id ?? "").trim() || null;
  const email = typeof registrant.email === "string" ? registrant.email.trim().toLowerCase() : null;
  const firstName = registrantName(registrant.first_name, "Zoom");
  const lastName = registrantName(registrant.last_name, "Webinar Registrant");
  const registeredAt = parseZoomDate(registrant.create_time);
  const status = statusOverride ?? normalizeZoomRegistrantStatus(registrant.status);
  const data = {
    zoomRegistrantId: registrantId,
    zoomParticipantId: typeof registrant.participant_user_id === "string" ? registrant.participant_user_id : null,
    email,
    firstName,
    lastName,
    status,
    registeredAt,
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

  const attendeeId = existing
    ? existing.id
    : Number((await db.insert(webinarAttendees).values({ webinarId, ...data }))[0].insertId);
  if (existing) await db.update(webinarAttendees).set(data).where(eq(webinarAttendees.id, attendeeId));

  try {
    await syncRegistrantContact({ attendeeId, webinar, email, firstName, lastName, registeredAt });
  } catch (error) {
    console.error("[Webinar] Contact synchronization failed for registrant", { webinarId, email, error });
    await logActivity({
      userId: webinar.createdById,
      action: "webinar_registration_contact_sync_failed",
      entityType: "webinar",
      entityId: webinarId,
      details: { email, error: error instanceof Error ? error.message : String(error) },
    });
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

export const webinarsRouter = router({
  configuration: protectedProcedure.query(async ({ ctx }) => {
    await requireWebinarAccess(ctx.user);
    return getZoomConfigurationStatus();
  }),

  getMarketingEmailTemplate: protectedProcedure.query(async ({ ctx }) => {
    await requireWebinarAccess(ctx.user);
    const db = await getDatabase();
    const [override] = await db.select({ subject: emailTemplates.subject, bodyText: emailTemplates.bodyText, updatedAt: emailTemplates.updatedAt })
      .from(emailTemplates)
      .where(eq(emailTemplates.emailType, WEBINAR_MARKETING_EMAIL_TYPE))
      .limit(1);
    return { ...DEFAULT_MARKETING_EMAIL_TEMPLATE, ...override, emailType: WEBINAR_MARKETING_EMAIL_TYPE, marketingEmail: MARKETING_EMAIL };
  }),

  updateMarketingEmailTemplate: protectedProcedure.input(z.object({
    subject: z.string().trim().min(3).max(255),
    bodyText: z.string().trim().min(10).max(6000),
  })).mutation(async ({ input, ctx }) => {
    await requireWebinarAccess(ctx.user);
    const db = await getDatabase();
    await db.insert(emailTemplates).values({
      emailType: WEBINAR_MARKETING_EMAIL_TYPE,
      subject: input.subject,
      bodyText: input.bodyText,
      updatedById: ctx.user.id,
    }).onDuplicateKeyUpdate({ set: { subject: input.subject, bodyText: input.bodyText, updatedById: ctx.user.id } });
    return { success: true };
  }),

  resetMarketingEmailTemplate: protectedProcedure.mutation(async ({ ctx }) => {
    await requireWebinarAccess(ctx.user);
    const db = await getDatabase();
    await db.delete(emailTemplates).where(eq(emailTemplates.emailType, WEBINAR_MARKETING_EMAIL_TYPE));
    return { success: true };
  }),

  list: protectedProcedure.input(z.object({ includePast: z.boolean().default(false) }).optional()).query(async ({ input, ctx }) => {
    await requireWebinarAccess(ctx.user);
    const db = await getDatabase();
    const values = await db.select({
      webinar: webinars,
      creatorName: users.name,
      creatorEmail: users.email,
    }).from(webinars)
      .leftJoin(users, eq(webinars.createdById, users.id))
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
    await requireWebinarAccess(ctx.user);
    const db = await getDatabase();
    const [value] = await db.select({ webinar: webinars, creatorName: users.name, creatorEmail: users.email })
      .from(webinars)
      .leftJoin(users, eq(webinars.createdById, users.id))
      .where(eq(webinars.id, input.id));
    if (!value) throw new TRPCError({ code: "NOT_FOUND", message: "Webinar not found." });

    const counts = await db.select({
      registered: sql<number>`SUM(CASE WHEN ${webinarAttendees.status} IN ('registered', 'approved') THEN 1 ELSE 0 END)`.as("registered"),
      attended: sql<number>`SUM(CASE WHEN ${webinarAttendees.status} = 'attended' THEN 1 ELSE 0 END)`.as("attended"),
      total: sql<number>`COUNT(*)`.as("total"),
    }).from(webinarAttendees).where(eq(webinarAttendees.webinarId, input.id));

    return { ...value, attendeeCounts: { registered: Number(counts[0]?.registered ?? 0), attended: Number(counts[0]?.attended ?? 0), total: Number(counts[0]?.total ?? 0) } };
  }),

  create: protectedProcedure.input(z.object({
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().max(5000).optional().nullable(),
    startTime: z.string().min(1),
    durationMinutes: z.number().int().min(15).max(480).default(60),
    timezone: z.string().trim().min(1).max(64).default("America/New_York"),
    registrationApproval: approvalSchema.default("automatically"),
  })).mutation(async ({ input, ctx }) => {
    await requireWebinarAccess(ctx.user);
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
        marketingTemplateId: null,
        createdById: ctx.user.id,
        zoomWebinarId: String(zoomWebinar.id),
        zoomWebinarUuid: zoomWebinar.uuid ?? null,
        zoomJoinUrl: zoomWebinar.join_url ?? null,
        zoomRegistrationUrl: zoomWebinar.registration_url ?? zoomWebinar.join_url ?? null,
        zoomStartUrl: zoomWebinar.start_url ?? null,
        zoomCreatedAt: parseZoomDate(zoomWebinar.created_at) ?? new Date(),
      });
      const webinarId = result.insertId;
      const creatorName = ctx.user.name ?? ctx.user.email ?? "SavvyOS user";
      const creatorEmail = ctx.user.email ?? undefined;
      const webinarRegistrationUrl = zoomWebinar.registration_url ?? zoomWebinar.join_url ?? undefined;
      const marketingEmail = await sendTransactionalEmail("webinar_marketing_request", {
        recipientEmail: MARKETING_EMAIL,
        recipientName: "Marketing Team",
        ccEmail: creatorEmail,
        webinarTitle: input.title,
        webinarDescription: input.description ?? undefined,
        webinarStartTime: startTime.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: input.timezone }),
        webinarDuration: `${input.durationMinutes} minutes`,
        webinarRegistrationUrl,
        webinarCreatorName: creatorName,
        webinarCreatorEmail: creatorEmail,
      }, { injectMagicLinks: false, idempotencyKey: `webinar-marketing-request-${webinarId}` });
      await logActivity({
        userId: ctx.user.id,
        action: "webinar_created",
        entityType: "webinar",
        entityId: webinarId,
        details: {
          title: input.title,
          zoomWebinarId: zoomWebinar.id,
          marketingEmailSent: marketingEmail.sent,
          marketingEmailSkipped: marketingEmail.skipped,
          marketingEmailReason: marketingEmail.reason ?? null,
        },
      });
      return { id: webinarId, zoomRegistrationUrl: webinarRegistrationUrl ?? null, marketingEmailSent: marketingEmail.sent, marketingEmailSkipped: marketingEmail.skipped, marketingEmailReason: marketingEmail.reason ?? null };
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
    await requireWebinarAccess(ctx.user);
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
    await requireWebinarAccess(ctx.user);
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
    await requireWebinarAccess(ctx.user);
    const db = await getDatabase();
    return db.select().from(webinarAttendees).where(eq(webinarAttendees.webinarId, input.id)).orderBy(desc(webinarAttendees.registeredAt), asc(webinarAttendees.email));
  }),

  syncAttendees: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    await requireWebinarAccess(ctx.user);
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
