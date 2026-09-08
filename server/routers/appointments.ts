import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  agentConnections,
  agentSupportAssignments,
  appointmentEvents,
  appointments,
  calendarConnections,
  contacts,
  smartPlanEnrollments,
  users,
} from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { createAgentConnection, createContact, getDb, logActivity, updateAgentConnection } from "../db";
import {
  CalendarIntegrationError,
  cancelGoogleCalendarEvent,
  createGoogleCalendarEvent,
  googleCalendarAvailability,
  isGoogleCalendarConfigured,
  updateGoogleCalendarEvent,
} from "../calendarService";
import { sendAppointmentEmail } from "../appointmentNotifications";
import { triggerSmartPlansForAppointment } from "../smartPlanScheduler";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
] as const;

const appointmentDateInput = z.coerce.date();
const appointmentFormSchema = z.object({
  title: z.string().trim().min(2).max(255),
  startAt: appointmentDateInput,
  endAt: appointmentDateInput,
  timezone: z.enum(TIMEZONES),
  location: z.string().trim().max(512).optional().nullable(),
  notes: z.string().trim().max(10_000).optional().nullable(),
});

const lifecycleStatus = z.enum(["confirmed", "completed", "no_show"]);

type ConnectionRecord = typeof agentConnections.$inferSelect;
type AppointmentRecord = typeof appointments.$inferSelect;

function displayName(contact: Pick<typeof contacts.$inferSelect, "firstName" | "lastName">): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || "Client";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function intervalsOverlap(startAt: Date, endAt: Date, busy: Array<{ start: string; end: string }>): boolean {
  return busy.some(item => {
    const busyStart = new Date(item.start).getTime();
    const busyEnd = new Date(item.end).getTime();
    return Number.isFinite(busyStart) && Number.isFinite(busyEnd) && startAt.getTime() < busyEnd && endAt.getTime() > busyStart;
  });
}

function withoutExactAppointmentBlock(
  busy: Array<{ start: string; end: string }>,
  appointment?: Pick<AppointmentRecord, "startAt" | "endAt"> | null,
) {
  if (!appointment) return busy;
  return busy.filter(item => {
    const start = new Date(item.start).getTime();
    const end = new Date(item.end).getTime();
    return start !== appointment.startAt.getTime() || end !== appointment.endAt.getTime();
  });
}

async function getConnectionForAccess(connectionId: number, user: typeof users.$inferSelect): Promise<ConnectionRecord> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [connection] = await db
    .select()
    .from(agentConnections)
    .where(and(eq(agentConnections.id, connectionId), isNull(agentConnections.archivedAt)))
    .limit(1);
  if (!connection) throw new TRPCError({ code: "NOT_FOUND", message: "Agent connection not found" });
  if (user.role === "admin" || user.role === "isa") return connection;
  if (user.role === "agent" && connection.agentId === user.id) return connection;
  if (user.role === "agent_support") {
    const [assignment] = await db
      .select({ id: agentSupportAssignments.id })
      .from(agentSupportAssignments)
      .where(and(
        eq(agentSupportAssignments.agentSupportUserId, user.id),
        eq(agentSupportAssignments.agentId, connection.agentId),
      ))
      .limit(1);
    if (assignment) return connection;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage appointments for accessible agent connections." });
}

async function getAppointmentForAccess(appointmentId: number, user: typeof users.$inferSelect): Promise<{ appointment: AppointmentRecord; connection: ConnectionRecord }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [appointment] = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
  if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Appointment not found" });
  const connection = await getConnectionForAccess(appointment.agentConnectionId, user);
  return { appointment, connection };
}

async function appointmentParties(appointment: AppointmentRecord) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [[contact], [agent]] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.id, appointment.contactId)).limit(1),
    db.select().from(users).where(eq(users.id, appointment.hostUserId)).limit(1),
  ]);
  if (!contact || !agent) throw new Error("Appointment participant record is unavailable");
  return { contact, agent };
}

function calendarEventInput(appointment: AppointmentRecord, contact: typeof contacts.$inferSelect) {
  return {
    title: appointment.title,
    description: appointment.notes,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    timezone: appointment.timezone,
    location: appointment.location,
    attendeeEmail: contact.email,
    appointmentId: appointment.id,
  };
}

async function sendFallbackEmails(appointment: AppointmentRecord, action: "scheduled" | "rescheduled" | "canceled"): Promise<{ status: "sent" | "failed" | "not_needed"; error: string | null }> {
  const { contact, agent } = await appointmentParties(appointment);
  const recipients = [
    agent.email ? { email: agent.email, name: agent.name } : null,
    contact.email && contact.email.toLowerCase() !== agent.email?.toLowerCase()
      ? { email: contact.email, name: displayName(contact) }
      : null,
  ].filter(Boolean) as Array<{ email: string; name: string | null }>;
  if (!recipients.length) return { status: "not_needed", error: null };
  const results = await Promise.all(
    recipients.map(recipient => sendAppointmentEmail({
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      clientName: displayName(contact),
      agentName: agent.name ?? "Your Savvy agent",
      title: appointment.title,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      timezone: appointment.timezone,
      location: appointment.location,
      notes: appointment.notes,
      appointmentId: appointment.id,
      action,
    }))
  );
  const failures = results.filter(result => !result.sent).map(result => result.error || "Email delivery failed");
  return {
    status: failures.length === results.length ? "failed" : "sent",
    error: failures.length ? failures.join("; ").slice(0, 2_000) : null,
  };
}

async function markIsaAppointmentCredit(connection: ConnectionRecord, actor: typeof users.$inferSelect) {
  if (actor.role !== "isa") return;
  await updateAgentConnection(connection.id, {
    appointmentSet: true,
    appointmentSetAt: new Date(),
    appointmentSetByUserId: actor.id,
  } as any);
}

async function addAppointmentEvent(input: {
  appointmentId: number;
  actorUserId?: number | null;
  eventType: "scheduled" | "confirmed" | "rescheduled" | "canceled" | "completed" | "no_show" | "imported";
  details?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(appointmentEvents).values({
    appointmentId: input.appointmentId,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    details: input.details ?? null,
  });
}

async function calendarConnectionStatus(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db || !isGoogleCalendarConfigured()) return false;
  const [connection] = await db
    .select({ status: calendarConnections.status })
    .from(calendarConnections)
    .where(and(eq(calendarConnections.userId, userId), eq(calendarConnections.provider, "google")))
    .limit(1);
  return connection?.status === "connected";
}

async function persistAppointmentEmails(appointment: AppointmentRecord, action: "scheduled" | "rescheduled" | "canceled") {
  const delivery = await sendFallbackEmails(appointment, action).catch(error => ({
    status: "failed" as const,
    error: errorMessage(error).slice(0, 2_000),
  }));
  const db = await getDb();
  if (db) {
    await db.update(appointments).set({
      invitationDeliveryStatus: delivery.status,
      invitationDeliveryError: delivery.error,
    }).where(eq(appointments.id, appointment.id));
  }
  return delivery;
}

function requireUpcomingRange(startAt: Date, endAt: Date): void {
  if (endAt.getTime() <= startAt.getTime()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The appointment end time must be after its start time." });
  }
  if (startAt.getTime() < Date.now() - 5 * 60 * 1000) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a current or future appointment time." });
  }
}

async function syncGoogleEvent(
  appointment: AppointmentRecord,
  mode: "create" | "update" | "cancel"
): Promise<{ synced: boolean; error: string | null; eventId?: string | null; htmlLink?: string | null }> {
  try {
    if (mode === "cancel") {
      if (!appointment.externalCalendarEventId) return { synced: false, error: null };
      await cancelGoogleCalendarEvent(appointment.hostUserId, appointment.externalCalendarEventId);
      return { synced: true, error: null };
    }
    const { contact } = await appointmentParties(appointment);
    if (mode === "create") {
      const result = await createGoogleCalendarEvent(appointment.hostUserId, calendarEventInput(appointment, contact));
      return { synced: true, error: null, eventId: result.eventId, htmlLink: result.htmlLink };
    }
    if (!appointment.externalCalendarEventId) return { synced: false, error: null };
    await updateGoogleCalendarEvent(appointment.hostUserId, appointment.externalCalendarEventId, calendarEventInput(appointment, contact));
    return { synced: true, error: null };
  } catch (error) {
    return { synced: false, error: errorMessage(error).slice(0, 2_000) };
  }
}

/** Reconciles organization-wide Calendly webhooks without sending duplicate provider emails. */
export async function recordSavvyCalendlyAppointment(input: {
  eventType: "invitee.created" | "invitee.canceled";
  payload: Record<string, unknown>;
}): Promise<{ matched: boolean; appointmentId?: number; contactCreated?: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const invitee = asRecord(input.payload.invitee);
  const event = asRecord(input.payload.event);
  const inviteeUri = textField(invitee?.uri ?? input.payload.invitee_uri, 500);
  if (!inviteeUri) return { matched: false, reason: "No invitee URI" };

  if (input.eventType === "invitee.canceled") {
    const [existing] = await db.select().from(appointments).where(eq(appointments.calendlyInviteeUri, inviteeUri)).limit(1);
    if (!existing) return { matched: false, reason: "Appointment not found" };
    if (existing.status !== "canceled") {
      await db.update(appointments).set({ status: "canceled", canceledAt: new Date() }).where(eq(appointments.id, existing.id));
      await db.update(smartPlanEnrollments).set({ status: "cancelled", nextStepAt: null }).where(and(eq(smartPlanEnrollments.appointmentId, existing.id), eq(smartPlanEnrollments.status, "active")));
      await addAppointmentEvent({ appointmentId: existing.id, eventType: "canceled", details: { source: "calendly" } });
      await triggerSmartPlansForAppointment(existing.contactId, "appointment_canceled", existing.id).catch(error => console.error("[Appointments] Calendly cancel Smart Plan trigger failed:", error));
      await logActivity({ userId: null, action: "appointment_canceled", entityType: "appointment", entityId: existing.id, relatedContactId: existing.contactId, details: { source: "calendly" } });
    }
    return { matched: true, appointmentId: existing.id };
  }

  const inviteeEmail = textField(invitee?.email, 320)?.toLowerCase();
  const memberships = Array.isArray(event?.event_memberships) ? event?.event_memberships : [];
  const hostEmails = memberships
    .map(item => textField(asRecord(item)?.user_email, 320)?.toLowerCase())
    .filter((value): value is string => Boolean(value));
  if (!inviteeEmail || !hostEmails.length) return { matched: false, reason: "Missing invitee or host email" };

  const [host] = await db.select().from(users).where(and(
    sql`LOWER(${users.email}) IN (${sql.join(hostEmails.map(email => sql`${email}`), sql`, `)})`,
    eq(users.isActive, true),
  )).limit(1);
  if (!host) return { matched: false, reason: "Calendly host is not a SavvyOS user" };

  const [alreadyRecorded] = await db.select().from(appointments).where(eq(appointments.calendlyInviteeUri, inviteeUri)).limit(1);
  if (alreadyRecorded) return { matched: true, appointmentId: alreadyRecorded.id };

  let [contact] = await db.select().from(contacts).where(and(sql`LOWER(${contacts.email}) = ${inviteeEmail}`, isNull(contacts.archivedAt))).limit(1);
  let contactCreated = false;
  if (!contact) {
    const names = splitName(textField(invitee?.name, 255) ?? "Calendly Contact");
    const contactId = await createContact({
      firstName: names.firstName,
      lastName: names.lastName,
      email: inviteeEmail,
      phone: textField(invitee?.text_reminder_number, 32),
      leadSourceId: null,
      isaStatus: "new_lead",
      tags: ["Calendly"],
    } as any);
    [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
    contactCreated = true;
  }
  if (!contact) throw new Error("Unable to resolve Calendly contact");

  let [connection] = await db.select().from(agentConnections).where(and(
    eq(agentConnections.agentId, host.id),
    eq(agentConnections.contactId, contact.id),
  )).limit(1);
  if (!connection) {
    const connectionId = await createAgentConnection({
      agentId: host.id,
      contactId: contact.id,
      pipelineStatus: "new_lead",
      appointmentSet: false,
    } as any);
    [connection] = await db.select().from(agentConnections).where(eq(agentConnections.id, connectionId)).limit(1);
  }
  if (!connection) throw new Error("Unable to create Calendly connection");

  const startAt = parseEventTime(event?.start_time);
  const endAt = parseEventTime(event?.end_time);
  if (!startAt || !endAt || endAt <= startAt) return { matched: false, reason: "Calendly event has invalid times" };
  const eventLocation = asRecord(event?.location);
  const location = textField(eventLocation?.join_url ?? eventLocation?.location ?? eventLocation?.location_url, 512);
  const [inserted] = await db.insert(appointments).values({
    agentConnectionId: connection.id,
    contactId: contact.id,
    hostUserId: host.id,
    scheduledByUserId: null,
    source: "calendly",
    status: "confirmed",
    title: textField(event?.name, 255) ?? "Calendly appointment",
    startAt,
    endAt,
    timezone: textField(event?.timezone ?? invitee?.timezone, 64) ?? "America/New_York",
    location,
    calendarProvider: "calendly",
    calendlyEventUri: textField(event?.uri ?? input.payload.event_uri, 500),
    calendlyInviteeUri: inviteeUri,
    calendlyCancelUrl: textField(invitee?.cancel_url, 2_000),
    calendlyRescheduleUrl: textField(invitee?.reschedule_url, 2_000),
    invitationDeliveryStatus: "managed_by_calendly",
    confirmedAt: new Date(),
  });
  const appointmentId = Number((inserted as any).insertId);
  await addAppointmentEvent({ appointmentId, eventType: "imported", details: { source: "calendly", contactCreated } });
  await triggerSmartPlansForAppointment(contact.id, "appointment_scheduled", appointmentId).catch(error => console.error("[Appointments] Calendly scheduling Smart Plan trigger failed:", error));
  await triggerSmartPlansForAppointment(contact.id, "appointment_confirmed", appointmentId).catch(error => console.error("[Appointments] Calendly confirmation Smart Plan trigger failed:", error));
  await logActivity({ userId: null, action: "appointment_imported_from_calendly", entityType: "appointment", entityId: appointmentId, relatedContactId: contact.id, details: { source: "calendly", agentId: host.id, connectionId: connection.id, contactCreated } });
  return { matched: true, appointmentId, contactCreated };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function textField(value: unknown, limit: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;
}
function parseEventTime(value: unknown): Date | null {
  const parsed = typeof value === "string" ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}
function splitName(value: string): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return { firstName: (parts.shift() || "Calendly").slice(0, 128), lastName: parts.join(" ").slice(0, 128) };
}

export const appointmentsRouter = router({
  list: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const connection = await getConnectionForAccess(input.connectionId, ctx.user);
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(appointments)
        .where(eq(appointments.agentConnectionId, connection.id))
        .orderBy(desc(appointments.startAt));
      const appointmentIds = rows.map(row => row.id);
      const events = appointmentIds.length
        ? await db.select().from(appointmentEvents).where(inArray(appointmentEvents.appointmentId, appointmentIds)).orderBy(desc(appointmentEvents.createdAt))
        : [];
      return rows.map(appointment => ({
        appointment,
        events: events.filter(event => event.appointmentId === appointment.id),
      }));
    }),

  availability: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), startAt: appointmentDateInput, endAt: appointmentDateInput, timezone: z.enum(TIMEZONES), excludeAppointmentId: z.number().int().positive().optional() }))
    .query(async ({ input, ctx }) => {
      const connection = await getConnectionForAccess(input.connectionId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      if (input.endAt <= input.startAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid time range." });
      if (!(await calendarConnectionStatus(connection.agentId))) return { connected: false, busy: [], error: null };
      try {
        const busy = await googleCalendarAvailability({ userId: connection.agentId, timeMin: input.startAt, timeMax: input.endAt, timezone: input.timezone });
        const [excluded] = input.excludeAppointmentId
          ? await db.select().from(appointments).where(and(eq(appointments.id, input.excludeAppointmentId), eq(appointments.agentConnectionId, connection.id))).limit(1)
          : [];
        return { connected: true, busy: withoutExactAppointmentBlock(busy, excluded), error: null };
      } catch (error) {
        return { connected: true, busy: [], error: errorMessage(error) };
      }
    }),

  create: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive(), appointment: appointmentFormSchema }))
    .mutation(async ({ input, ctx }) => {
      requireUpcomingRange(input.appointment.startAt, input.appointment.endAt);
      const connection = await getConnectionForAccess(input.connectionId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, connection.contactId)).limit(1);
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Client contact not found" });

      const useGoogle = await calendarConnectionStatus(connection.agentId);
      if (useGoogle) {
        try {
          const busy = await googleCalendarAvailability({ userId: connection.agentId, timeMin: input.appointment.startAt, timeMax: input.appointment.endAt, timezone: input.appointment.timezone });
          if (intervalsOverlap(input.appointment.startAt, input.appointment.endAt, busy)) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This time is busy on the agent's connected Google Calendar. Choose another time." });
          }
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          console.warn("[Appointments] Google availability check failed; using email invitation fallback:", errorMessage(error));
        }
      }

      const [result] = await db.insert(appointments).values({
        agentConnectionId: connection.id,
        contactId: connection.contactId,
        hostUserId: connection.agentId,
        scheduledByUserId: ctx.user.id,
        source: "savvyos",
        status: "scheduled",
        title: input.appointment.title,
        startAt: input.appointment.startAt,
        endAt: input.appointment.endAt,
        timezone: input.appointment.timezone,
        location: input.appointment.location || null,
        notes: input.appointment.notes || null,
        calendarProvider: "none",
        invitationDeliveryStatus: "not_needed",
      });
      const appointmentId = Number((result as any).insertId);
      let appointment = (await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1))[0]!;
      let delivery: { status: string; error: string | null } = { status: "not_needed", error: null };
      let calendarSynced = false;

      if (useGoogle) {
        const sync = await syncGoogleEvent(appointment, "create");
        if (sync.synced) {
          calendarSynced = true;
          await db.update(appointments).set({
            calendarProvider: "google",
            externalCalendarEventId: sync.eventId ?? null,
            externalCalendarEventUrl: sync.htmlLink ?? null,
            invitationDeliveryStatus: contact.email ? "sent" : "not_needed",
            invitationDeliveryError: null,
          }).where(eq(appointments.id, appointmentId));
        } else {
          await db.update(appointments).set({ invitationDeliveryError: sync.error }).where(eq(appointments.id, appointmentId));
        }
      }

      appointment = (await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1))[0]!;
      if (!calendarSynced) delivery = await persistAppointmentEmails(appointment, "scheduled");
      await markIsaAppointmentCredit(connection, ctx.user);
      await addAppointmentEvent({ appointmentId, actorUserId: ctx.user.id, eventType: "scheduled", details: { calendar: calendarSynced ? "google" : "email", invitationStatus: delivery.status } });
      await triggerSmartPlansForAppointment(connection.contactId, "appointment_scheduled", appointmentId).catch(error => console.error("[Appointments] Scheduling Smart Plan trigger failed:", error));
      await logActivity({ userId: ctx.user.id, action: "appointment_scheduled", entityType: "appointment", entityId: appointmentId, relatedContactId: connection.contactId, details: { connectionId: connection.id, hostUserId: connection.agentId, calendar: calendarSynced ? "google" : "email", invitationStatus: delivery.status } });
      return { id: appointmentId, calendar: calendarSynced ? "google" : "email", invitationStatus: calendarSynced ? (contact.email ? "sent" : "not_needed") : delivery.status };
    }),

  reschedule: protectedProcedure
    .input(z.object({ appointmentId: z.number().int().positive(), appointment: appointmentFormSchema }))
    .mutation(async ({ input, ctx }) => {
      requireUpcomingRange(input.appointment.startAt, input.appointment.endAt);
      const { appointment, connection } = await getAppointmentForAccess(input.appointmentId, ctx.user);
      if (appointment.status === "canceled" || appointment.status === "completed" || appointment.status === "no_show") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This appointment cannot be rescheduled in its current state." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, appointment.contactId)).limit(1);
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Client contact not found" });

      if (appointment.calendarProvider === "google") {
        try {
          const busy = withoutExactAppointmentBlock(
            await googleCalendarAvailability({ userId: appointment.hostUserId, timeMin: input.appointment.startAt, timeMax: input.appointment.endAt, timezone: input.appointment.timezone }),
            appointment,
          );
          if (intervalsOverlap(input.appointment.startAt, input.appointment.endAt, busy)) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This time is busy on the agent's connected Google Calendar. Choose another time." });
          }
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          console.warn("[Appointments] Google availability check failed during reschedule:", errorMessage(error));
        }
      }

      await db.update(appointments).set({
        title: input.appointment.title,
        startAt: input.appointment.startAt,
        endAt: input.appointment.endAt,
        timezone: input.appointment.timezone,
        location: input.appointment.location || null,
        notes: input.appointment.notes || null,
        status: "scheduled",
        rescheduledAt: new Date(),
      }).where(eq(appointments.id, appointment.id));
      const updated = (await db.select().from(appointments).where(eq(appointments.id, appointment.id)).limit(1))[0]!;
      const sync = updated.calendarProvider === "google" ? await syncGoogleEvent(updated, "update") : { synced: false, error: null };
      const delivery = !sync.synced && updated.source === "savvyos"
        ? await persistAppointmentEmails(updated, "rescheduled")
        : { status: sync.synced ? "sent" : "not_needed", error: sync.error };
      if (sync.error) await db.update(appointments).set({ invitationDeliveryError: sync.error }).where(eq(appointments.id, updated.id));
      await addAppointmentEvent({ appointmentId: updated.id, actorUserId: ctx.user.id, eventType: "rescheduled", details: { calendar: sync.synced ? "google" : "email", invitationStatus: delivery.status } });
      await triggerSmartPlansForAppointment(updated.contactId, "appointment_rescheduled", updated.id).catch(error => console.error("[Appointments] Reschedule Smart Plan trigger failed:", error));
      await logActivity({ userId: ctx.user.id, action: "appointment_rescheduled", entityType: "appointment", entityId: updated.id, relatedContactId: updated.contactId, details: { connectionId: connection.id, calendar: sync.synced ? "google" : "email" } });
      return { success: true, calendar: sync.synced ? "google" : "email", invitationStatus: delivery.status };
    }),

  cancel: protectedProcedure
    .input(z.object({ appointmentId: z.number().int().positive(), reason: z.string().trim().max(1_000).optional().nullable() }))
    .mutation(async ({ input, ctx }) => {
      const { appointment, connection } = await getAppointmentForAccess(input.appointmentId, ctx.user);
      if (appointment.status === "canceled") return { success: true, alreadyCanceled: true };
      if (appointment.source === "calendly") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Cancel this Calendly booking from Calendly so SavvyOS can keep both systems in sync." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.update(appointments).set({ status: "canceled", canceledAt: new Date() }).where(eq(appointments.id, appointment.id));
      const updated = (await db.select().from(appointments).where(eq(appointments.id, appointment.id)).limit(1))[0]!;
      const sync = updated.calendarProvider === "google" ? await syncGoogleEvent(updated, "cancel") : { synced: false, error: null };
      const delivery = !sync.synced ? await persistAppointmentEmails(updated, "canceled") : { status: "sent", error: null };
      await db.update(smartPlanEnrollments).set({ status: "cancelled", nextStepAt: null }).where(and(eq(smartPlanEnrollments.appointmentId, updated.id), eq(smartPlanEnrollments.status, "active")));
      await addAppointmentEvent({ appointmentId: updated.id, actorUserId: ctx.user.id, eventType: "canceled", details: { reason: input.reason || null, calendar: sync.synced ? "google" : "email" } });
      await triggerSmartPlansForAppointment(updated.contactId, "appointment_canceled", updated.id).catch(error => console.error("[Appointments] Cancellation Smart Plan trigger failed:", error));
      await logActivity({ userId: ctx.user.id, action: "appointment_canceled", entityType: "appointment", entityId: updated.id, relatedContactId: updated.contactId, details: { connectionId: connection.id, reason: input.reason || null, calendar: sync.synced ? "google" : "email" } });
      return { success: true, calendar: sync.synced ? "google" : "email", invitationStatus: delivery.status };
    }),

  setStatus: protectedProcedure
    .input(z.object({ appointmentId: z.number().int().positive(), status: lifecycleStatus }))
    .mutation(async ({ input, ctx }) => {
      const { appointment, connection } = await getAppointmentForAccess(input.appointmentId, ctx.user);
      if (appointment.status === "canceled") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Canceled appointments cannot be updated." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const now = new Date();
      const update: Record<string, unknown> = { status: input.status };
      if (input.status === "confirmed") update.confirmedAt = now;
      if (input.status === "completed") update.completedAt = now;
      await db.update(appointments).set(update).where(eq(appointments.id, appointment.id));
      const updated = (await db.select().from(appointments).where(eq(appointments.id, appointment.id)).limit(1))[0]!;
      await addAppointmentEvent({ appointmentId: updated.id, actorUserId: ctx.user.id, eventType: input.status, details: { source: "savvyos" } });
      if (input.status === "confirmed") {
        await triggerSmartPlansForAppointment(updated.contactId, "appointment_confirmed", updated.id).catch(error => console.error("[Appointments] Confirmation Smart Plan trigger failed:", error));
      }
      await logActivity({ userId: ctx.user.id, action: `appointment_${input.status}`, entityType: "appointment", entityId: updated.id, relatedContactId: updated.contactId, details: { connectionId: connection.id } });
      return { success: true };
    }),
});

export const __testables__ = { intervalsOverlap, splitName, textField, withoutExactAppointmentBlock };
