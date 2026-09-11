import { TRPCError } from "@trpc/server";
import { aliasedTable, and, asc, desc, eq, isNull, like, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  calendarConnections,
  marketProfiles,
  recruits,
  recruitingActivities,
  recruitingAppointments,
  recruitingCalendarSettings,
  recruitingStages,
  recruitingTasks,
  users,
} from "../../drizzle/schema";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb, logActivity } from "../db";
import { normalizeOptionalUsPhone } from "@shared/phone";
import {
  CalendarIntegrationError,
  cancelGoogleCalendarEvent,
  createGoogleCalendarEvent,
  googleCalendarAvailability,
  isGoogleCalendarConfigured,
  listGoogleCalendars,
  updateGoogleCalendarEvent,
} from "../calendarService";
import { sendAppointmentEmail } from "../appointmentNotifications";
import { invokeLLM } from "../_core/llm";

const TRISH_EMAIL = "trish@savvy.realty";
const DEFAULT_TIMEZONE = "America/New_York";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ACTIVITY_TYPES = [
  "note",
  "call",
  "email",
  "text",
  "meeting",
] as const;

const APPOINTMENT_OUTCOMES = ["completed", "no_show"] as const;

type WorkingHour = { enabled: boolean; start: string; end: string };
type WorkingHours = Record<string, WorkingHour>;
type BusyInterval = { start: string; end: string };
type RecruitRecord = typeof recruits.$inferSelect;
type RecruitAppointment = typeof recruitingAppointments.$inferSelect;

function defaultWorkingHours(): WorkingHours {
  return {
    mon: { enabled: true, start: "09:00", end: "17:00" },
    tue: { enabled: true, start: "09:00", end: "17:00" },
    wed: { enabled: true, start: "09:00", end: "17:00" },
    thu: { enabled: true, start: "09:00", end: "17:00" },
    fri: { enabled: true, start: "09:00", end: "16:00" },
    sat: { enabled: false, start: "09:00", end: "17:00" },
    sun: { enabled: false, start: "09:00", end: "17:00" },
  };
}

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time, for example 09:00.");
const workingHoursSchema = z.record(z.string(), z.object({
  enabled: z.boolean(),
  start: timeSchema,
  end: timeSchema,
}));

const recruitInputSchema = z.object({
  firstName: z.string().trim().min(1).max(128),
  lastName: z.string().trim().min(1).max(128),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  currentBrokerage: z.string().trim().max(255).nullable().optional(),
  websiteUrl: z.string().trim().url().max(1024).nullable().optional(),
  linkedinUrl: z.string().trim().url().max(1024).nullable().optional(),
  instagramUrl: z.string().trim().url().max(1024).nullable().optional(),
  primaryMarketId: z.number().int().positive().nullable().optional(),
  primaryMarketText: z.string().trim().max(255).nullable().optional(),
  additionalMarkets: z.array(z.string().trim().min(1).max(255)).max(20).nullable().optional(),
  state: z.string().trim().max(64).nullable().optional(),
  yearsInRealEstate: z.number().int().min(0).max(100).nullable().optional(),
  shortTermRentalExperience: z.string().trim().max(5_000).nullable().optional(),
  transactionCount: z.number().int().min(0).max(1_000_000).nullable().optional(),
  salesVolume: z.number().nonnegative().max(9_999_999_999_999).nullable().optional(),
  productionPeriod: z.string().trim().max(80).nullable().optional(),
  ownerId: z.number().int().positive().nullable().optional(),
  source: z.string().trim().max(255).nullable().optional(),
  stageId: z.number().int().positive().nullable().optional(),
  lastContactAt: z.coerce.date().nullable().optional(),
  nextAction: z.string().trim().max(500).nullable().optional(),
  nextFollowUpAt: z.coerce.date().nullable().optional(),
  goals: z.string().trim().max(10_000).nullable().optional(),
  motivations: z.string().trim().max(10_000).nullable().optional(),
  objections: z.string().trim().max(10_000).nullable().optional(),
  context: z.string().trim().max(10_000).nullable().optional(),
});

const appointmentInputSchema = z.object({
  title: z.string().trim().min(2).max(255),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  timezone: z.string().trim().min(3).max(64),
  location: z.string().trim().max(512).nullable().optional(),
});

function nullIfBlank(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned || null;
}

function normalizedPhone(value: string | null | undefined): string | null {
  try {
    return normalizeOptionalUsPhone(value ?? null);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Phone numbers must contain exactly 10 U.S. digits." });
  }
}

function splitName(value: string): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Please enter your first and last name." });
  }
  return { firstName: parts.shift()!.slice(0, 128), lastName: parts.join(" ").slice(0, 128) };
}

function displayName(recruit: Pick<RecruitRecord, "firstName" | "lastName">): string {
  return `${recruit.firstName} ${recruit.lastName}`.trim();
}

function requireAdmin(user: { role: string }) {
  if (user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Recruiting is available to Admin users only." });
  }
}

async function activeAdmin(userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const [admin] = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.role, "admin"), eq(users.isActive, true)))
    .limit(1);
  if (!admin) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active Admin recruiter." });
  return admin;
}

async function stageById(stageId: number, allowInactive = false) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const [stage] = await db.select().from(recruitingStages)
    .where(allowInactive ? eq(recruitingStages.id, stageId) : and(eq(recruitingStages.id, stageId), eq(recruitingStages.isActive, true)))
    .limit(1);
  if (!stage) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active recruiting stage." });
  return stage;
}

async function defaultStage(preferredSlug = "new") {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const [preferred] = await db.select().from(recruitingStages)
    .where(and(eq(recruitingStages.slug, preferredSlug), eq(recruitingStages.isActive, true)))
    .limit(1);
  if (preferred) return preferred;
  const [stage] = await db.select().from(recruitingStages)
    .where(eq(recruitingStages.isActive, true))
    .orderBy(asc(recruitingStages.position))
    .limit(1);
  if (!stage) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No recruiting stages are configured." });
  return stage;
}

async function createRecruitingActivity(input: {
  recruitId: number;
  type: typeof recruitingActivities.$inferInsert.type;
  body: string;
  occurredAt?: Date;
  enteredById?: number | null;
  outcome?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const [result] = await db.insert(recruitingActivities).values({
    recruitId: input.recruitId,
    type: input.type,
    body: input.body,
    occurredAt: input.occurredAt ?? new Date(),
    enteredById: input.enteredById ?? null,
    outcome: input.outcome ?? null,
    metadata: input.metadata ?? null,
  });
  return Number((result as any).insertId);
}

async function getRecruitOrThrow(recruitId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const [recruit] = await db.select().from(recruits)
    .where(and(eq(recruits.id, recruitId), eq(recruits.isArchived, false)))
    .limit(1);
  if (!recruit) throw new TRPCError({ code: "NOT_FOUND", message: "Recruit not found." });
  return recruit;
}

async function resolveRecruitByIdentity(input: { email?: string | null; phone?: string | null }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const email = input.email?.trim().toLowerCase() || null;
  const phone = normalizedPhone(input.phone);
  const [emailRows, phoneRows] = await Promise.all([
    email
      ? db.select().from(recruits).where(and(sql`LOWER(${recruits.email}) = ${email}`, eq(recruits.isArchived, false))).limit(5)
      : Promise.resolve([] as RecruitRecord[]),
    phone
      ? db.select().from(recruits).where(and(eq(recruits.phone, phone), eq(recruits.isArchived, false))).limit(5)
      : Promise.resolve([] as RecruitRecord[]),
  ]);
  const distinct = new Map<number, RecruitRecord>();
  for (const recruit of [...emailRows, ...phoneRows]) distinct.set(recruit.id, recruit);
  const matches = Array.from(distinct.values());
  if (!matches.length) return { kind: "none" as const, recruit: null, email, phone };
  if (matches.length === 1) return { kind: "match" as const, recruit: matches[0], email, phone };
  return { kind: "conflict" as const, recruit: null, email, phone, matches };
}

function dateParts(value: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = Object.fromEntries(formatter.formatToParts(value).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
    weekday: String(parts.weekday).toLowerCase().slice(0, 3),
  };
}

function timezoneOffsetMilliseconds(value: Date, timezone: string) {
  const parts = dateParts(value, timezone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - value.getTime();
}

function zonedDateTimeToUtc(parts: { year: number; month: number; day: number; hour: number; minute: number }, timezone: string) {
  const guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0));
  const once = new Date(guess.getTime() - timezoneOffsetMilliseconds(guess, timezone));
  return new Date(guess.getTime() - timezoneOffsetMilliseconds(once, timezone));
}

function dateKey(value: Date, timezone: string) {
  const parts = dateParts(value, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function parseTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

function rangesOverlap(startAt: Date, endAt: Date, busy: BusyInterval[]) {
  return busy.some(item => {
    const start = new Date(item.start).getTime();
    const end = new Date(item.end).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && startAt.getTime() < end && endAt.getTime() > start;
  });
}

function withBuffers(startAt: Date, endAt: Date, settings: typeof recruitingCalendarSettings.$inferSelect) {
  return {
    startAt: new Date(startAt.getTime() - settings.bufferBeforeMinutes * 60_000),
    endAt: new Date(endAt.getTime() + settings.bufferAfterMinutes * 60_000),
  };
}

function isWorkingSlot(startAt: Date, endAt: Date, settings: typeof recruitingCalendarSettings.$inferSelect) {
  const timezone = settings.timezone || DEFAULT_TIMEZONE;
  const start = dateParts(startAt, timezone);
  const end = dateParts(endAt, timezone);
  if (dateKey(startAt, timezone) !== dateKey(endAt, timezone)) return false;
  const workingHours = (settings.workingHours as WorkingHours | null) ?? defaultWorkingHours();
  const window = workingHours[start.weekday];
  if (!window?.enabled) return false;
  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;
  const windowStart = parseTime(window.start);
  const windowEnd = parseTime(window.end);
  return startMinutes >= windowStart.hour * 60 + windowStart.minute && endMinutes <= windowEnd.hour * 60 + windowEnd.minute;
}

async function ensureCalendarSettings(userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const [existing] = await db.select().from(recruitingCalendarSettings).where(eq(recruitingCalendarSettings.userId, userId)).limit(1);
  if (existing) return existing;
  await db.insert(recruitingCalendarSettings).values({
    userId,
    meetingDurationMinutes: 30,
    timezone: DEFAULT_TIMEZONE,
    workingHours: defaultWorkingHours(),
    bufferBeforeMinutes: 15,
    bufferAfterMinutes: 15,
    minimumNoticeHours: 24,
    conflictCalendarIds: [],
  });
  const [created] = await db.select().from(recruitingCalendarSettings).where(eq(recruitingCalendarSettings.userId, userId)).limit(1);
  if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not save recruiting availability settings." });
  return created;
}

async function calendarConnectionForUser(userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const [connection] = await db.select({
    calendarId: calendarConnections.calendarId,
    connectedEmail: calendarConnections.connectedEmail,
    status: calendarConnections.status,
    lastError: calendarConnections.lastError,
  }).from(calendarConnections).where(and(eq(calendarConnections.userId, userId), eq(calendarConnections.provider, "google"))).limit(1);
  return connection ?? null;
}

async function combinedBusyIntervals(input: {
  hostUserId: number;
  settings: typeof recruitingCalendarSettings.$inferSelect;
  startAt: Date;
  endAt: Date;
  excludeAppointmentId?: number;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const connection = await calendarConnectionForUser(input.hostUserId);
  if (!isGoogleCalendarConfigured() || connection?.status !== "connected") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Connect Google Calendar before offering recruiting appointments." });
  }
  const configuredIds = (input.settings.conflictCalendarIds as string[] | null)?.filter(Boolean) ?? [];
  const calendarIds = configuredIds.length ? configuredIds : [connection.calendarId || "primary"];
  let googleBusy: BusyInterval[];
  try {
    googleBusy = await googleCalendarAvailability({
      userId: input.hostUserId,
      timeMin: input.startAt,
      timeMax: input.endAt,
      timezone: input.settings.timezone,
      calendarIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Calendar availability check failed.";
    throw new TRPCError({ code: "PRECONDITION_FAILED", message });
  }
  const localAppointments = await db.select({ id: recruitingAppointments.id, startAt: recruitingAppointments.startAt, endAt: recruitingAppointments.endAt })
    .from(recruitingAppointments)
    .where(and(
      eq(recruitingAppointments.hostUserId, input.hostUserId),
      ne(recruitingAppointments.status, "canceled"),
      lte(recruitingAppointments.startAt, input.endAt),
      sql`${recruitingAppointments.endAt} >= ${input.startAt}`,
      input.excludeAppointmentId ? ne(recruitingAppointments.id, input.excludeAppointmentId) : undefined,
    ));
  return [...googleBusy, ...localAppointments.map(item => ({ start: item.startAt.toISOString(), end: item.endAt.toISOString() }))];
}

async function slotIsAvailable(input: {
  hostUserId: number;
  settings: typeof recruitingCalendarSettings.$inferSelect;
  startAt: Date;
  endAt: Date;
  excludeAppointmentId?: number;
}) {
  if (input.endAt <= input.startAt) return false;
  if (!isWorkingSlot(input.startAt, input.endAt, input.settings)) return false;
  const minimumStart = Date.now() + input.settings.minimumNoticeHours * 60 * 60 * 1000;
  if (input.startAt.getTime() < minimumStart) return false;
  const buffered = withBuffers(input.startAt, input.endAt, input.settings);
  const busy = await combinedBusyIntervals({
    ...input,
    startAt: new Date(buffered.startAt.getTime() - 5 * 60_000),
    endAt: new Date(buffered.endAt.getTime() + 5 * 60_000),
  });
  return !rangesOverlap(buffered.startAt, buffered.endAt, busy);
}

async function availabilitySlots(hostUserId: number, days = 14) {
  const settings = await ensureCalendarSettings(hostUserId);
  const connection = await calendarConnectionForUser(hostUserId);
  if (!isGoogleCalendarConfigured() || connection?.status !== "connected") {
    return { configured: isGoogleCalendarConfigured(), connected: false, settings, slots: [] as Array<{ startAt: string; endAt: string }> };
  }
  const timezone = settings.timezone || DEFAULT_TIMEZONE;
  const now = new Date();
  const today = dateParts(now, timezone);
  const rangeStart = new Date(now.getTime() - 60_000);
  const rangeEnd = zonedDateTimeToUtc({ year: today.year, month: today.month, day: today.day + days + 1, hour: 23, minute: 59 }, timezone);
  const busy = await combinedBusyIntervals({ hostUserId, settings, startAt: rangeStart, endAt: rangeEnd });
  const workingHours = (settings.workingHours as WorkingHours | null) ?? defaultWorkingHours();
  const slots: Array<{ startAt: string; endAt: string }> = [];
  const minStartAt = now.getTime() + settings.minimumNoticeHours * 60 * 60 * 1000;
  for (let offset = 0; offset < days && slots.length < 80; offset += 1) {
    const base = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const candidateDay = { year: base.getUTCFullYear(), month: base.getUTCMonth() + 1, day: base.getUTCDate() };
    const weekday = dateParts(zonedDateTimeToUtc({ ...candidateDay, hour: 12, minute: 0 }, timezone), timezone).weekday;
    const window = workingHours[weekday];
    if (!window?.enabled) continue;
    const start = parseTime(window.start);
    const end = parseTime(window.end);
    const duration = settings.meetingDurationMinutes;
    for (let minute = start.hour * 60 + start.minute; minute + duration <= end.hour * 60 + end.minute; minute += 30) {
      const startAt = zonedDateTimeToUtc({ ...candidateDay, hour: Math.floor(minute / 60), minute: minute % 60 }, timezone);
      const endAt = new Date(startAt.getTime() + duration * 60_000);
      if (startAt.getTime() < minStartAt) continue;
      const buffered = withBuffers(startAt, endAt, settings);
      if (!rangesOverlap(buffered.startAt, buffered.endAt, busy)) {
        slots.push({ startAt: startAt.toISOString(), endAt: endAt.toISOString() });
      }
    }
  }
  return { configured: true, connected: true, settings, slots };
}

function calendarEventPayload(appointment: RecruitAppointment, recruit: RecruitRecord) {
  return {
    title: appointment.title,
    description: "Recruiting conversation with Savvy STR Agents.",
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    timezone: appointment.timezone,
    location: appointment.location,
    attendeeEmail: recruit.email,
    appointmentId: appointment.id,
  };
}

async function sendRecruitingAppointmentEmails(appointment: RecruitAppointment, recruit: RecruitRecord, host: { name: string | null; email: string | null }, action: "scheduled" | "rescheduled" | "canceled") {
  const recipients = [
    host.email ? { email: host.email, name: host.name } : null,
    recruit.email && recruit.email.toLowerCase() !== host.email?.toLowerCase()
      ? { email: recruit.email, name: displayName(recruit) }
      : null,
  ].filter(Boolean) as Array<{ email: string; name: string | null }>;
  const results = await Promise.all(recipients.map(recipient => sendAppointmentEmail({
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    clientName: displayName(recruit),
    agentName: host.name ?? "Trish Bartley",
    title: appointment.title,
    startAt: appointment.startAt,
    endAt: appointment.endAt,
    timezone: appointment.visitorTimezone || appointment.timezone,
    location: appointment.location,
    notes: null,
    appointmentId: appointment.id,
    action,
  })));
  const failures = results.filter(result => !result.sent).map(result => result.error ?? "Email delivery failed");
  return { status: failures.length ? "failed" as const : "sent" as const, error: failures.join("; ").slice(0, 2_000) || null };
}

async function hostForAppointment(hostUserId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const [host] = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.id, hostUserId), eq(users.role, "admin"), eq(users.isActive, true)))
    .limit(1);
  if (!host) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected meeting host is not an active Admin." });
  return host;
}

async function createCalendarConfirmedAppointment(input: {
  recruit: RecruitRecord;
  hostUserId: number;
  scheduledByUserId: number | null;
  source: "public_trish" | "admin";
  title: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  visitorTimezone?: string | null;
  location?: string | null;
  visitorMessage?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const settings = await ensureCalendarSettings(input.hostUserId);
  const available = await slotIsAvailable({ hostUserId: input.hostUserId, settings, startAt: input.startAt, endAt: input.endAt });
  if (!available) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That time is no longer available. Please choose another time." });
  }
  const [inserted] = await db.insert(recruitingAppointments).values({
    recruitId: input.recruit.id,
    hostUserId: input.hostUserId,
    scheduledByUserId: input.scheduledByUserId,
    source: input.source,
    status: "pending",
    title: input.title,
    startAt: input.startAt,
    endAt: input.endAt,
    timezone: input.timezone,
    visitorTimezone: input.visitorTimezone ?? null,
    location: input.location ?? null,
    visitorMessage: input.visitorMessage ?? null,
  });
  const appointmentId = Number((inserted as any).insertId);
  let appointment = (await db.select().from(recruitingAppointments).where(eq(recruitingAppointments.id, appointmentId)).limit(1))[0];
  if (!appointment) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not save the recruiting appointment." });
  let google;
  try {
    google = await createGoogleCalendarEvent(input.hostUserId, calendarEventPayload(appointment, input.recruit));
  } catch (error) {
    await db.delete(recruitingAppointments).where(eq(recruitingAppointments.id, appointmentId));
    const message = error instanceof CalendarIntegrationError ? error.message : "Google Calendar could not create this appointment.";
    throw new TRPCError({ code: "PRECONDITION_FAILED", message });
  }
  const host = await hostForAppointment(input.hostUserId);
  const delivery = await sendRecruitingAppointmentEmails(appointment, input.recruit, host, "scheduled");
  await db.update(recruitingAppointments).set({
    status: "scheduled",
    externalCalendarEventId: google.eventId,
    externalCalendarEventUrl: google.htmlLink,
    invitationDeliveryStatus: delivery.status,
    invitationDeliveryError: delivery.error,
  }).where(eq(recruitingAppointments.id, appointmentId));
  appointment = (await db.select().from(recruitingAppointments).where(eq(recruitingAppointments.id, appointmentId)).limit(1))[0]!;
  return { appointment, host, delivery };
}

function readLlmText(result: Awaited<ReturnType<typeof invokeLLM>>) {
  const content = result.choices[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.filter(item => item.type === "text").map(item => item.text).join("\n").trim();
  return "";
}

export const recruitingRouter = router({
  bootstrap: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) return { stages: [], admins: [], markets: [] };
    const [stages, admins, markets] = await Promise.all([
      db.select().from(recruitingStages).orderBy(asc(recruitingStages.position)),
      db.select({ id: users.id, name: users.name, email: users.email }).from(users)
        .where(and(eq(users.role, "admin"), eq(users.isActive, true))).orderBy(asc(users.name)),
      db.select({ id: marketProfiles.id, name: marketProfiles.name, state: marketProfiles.state }).from(marketProfiles).orderBy(asc(marketProfiles.name)),
    ]);
    return { stages, admins, markets };
  }),

  list: protectedProcedure.input(z.object({
    search: z.string().trim().max(255).optional(),
    ownerId: z.number().int().positive().optional(),
    stageId: z.number().int().positive().optional(),
    marketId: z.number().int().positive().optional(),
    source: z.string().trim().max(255).optional(),
    overdueOnly: z.boolean().optional(),
    todayOnly: z.boolean().optional(),
    missingNextStep: z.boolean().optional(),
  }).optional()).query(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) return { rows: [], summary: { total: 0, overdue: 0, today: 0, missingNextStep: 0 }, sources: [] };
    const filters = input ?? {};
    const where: any[] = [eq(recruits.isArchived, false)];
    if (filters.search) {
      const term = `%${filters.search.replace(/\s+/g, " ")}%`;
      where.push(or(
        like(recruits.firstName, term), like(recruits.lastName, term), like(recruits.email, term), like(recruits.phone, term),
        like(recruits.currentBrokerage, term), like(recruits.primaryMarketText, term),
        sql`CONCAT(${recruits.firstName}, ' ', ${recruits.lastName}) LIKE ${term}`,
      ));
    }
    if (filters.ownerId) where.push(eq(recruits.ownerId, filters.ownerId));
    if (filters.stageId) where.push(eq(recruits.stageId, filters.stageId));
    if (filters.marketId) where.push(eq(recruits.primaryMarketId, filters.marketId));
    if (filters.source) where.push(eq(recruits.source, filters.source));
    if (filters.overdueOnly) where.push(lte(recruits.nextFollowUpAt, new Date()), eq(recruitingStages.isClosed, false));
    if (filters.todayOnly) where.push(sql`DATE(${recruits.nextFollowUpAt}) = CURDATE()`);
    if (filters.missingNextStep) where.push(or(isNull(recruits.nextAction), isNull(recruits.nextFollowUpAt)), eq(recruitingStages.isClosed, false));

    const owner = users;
    const rows = await db.select({
      recruit: recruits,
      stage: { id: recruitingStages.id, name: recruitingStages.name, slug: recruitingStages.slug, isClosed: recruitingStages.isClosed },
      owner: { id: owner.id, name: owner.name, email: owner.email },
      market: { id: marketProfiles.id, name: marketProfiles.name, state: marketProfiles.state },
    }).from(recruits)
      .leftJoin(recruitingStages, eq(recruits.stageId, recruitingStages.id))
      .leftJoin(owner, eq(recruits.ownerId, owner.id))
      .leftJoin(marketProfiles, eq(recruits.primaryMarketId, marketProfiles.id))
      .where(and(...where))
      .orderBy(sql`${recruits.nextFollowUpAt} IS NULL`, asc(recruits.nextFollowUpAt), desc(recruits.updatedAt));

    const base = [eq(recruits.isArchived, false)];
    const [summaryRow, sources] = await Promise.all([
      db.select({
        total: sql<number>`COUNT(*)`,
        overdue: sql<number>`COALESCE(SUM(CASE WHEN ${recruits.nextFollowUpAt} < NOW() AND ${recruitingStages.isClosed} = 0 THEN 1 ELSE 0 END), 0)`,
        today: sql<number>`COALESCE(SUM(CASE WHEN DATE(${recruits.nextFollowUpAt}) = CURDATE() THEN 1 ELSE 0 END), 0)`,
        missingNextStep: sql<number>`COALESCE(SUM(CASE WHEN (${recruits.nextAction} IS NULL OR ${recruits.nextFollowUpAt} IS NULL) AND ${recruitingStages.isClosed} = 0 THEN 1 ELSE 0 END), 0)`,
      }).from(recruits).leftJoin(recruitingStages, eq(recruits.stageId, recruitingStages.id)).where(and(...base)),
      db.selectDistinct({ source: recruits.source }).from(recruits).where(and(eq(recruits.isArchived, false), sql`${recruits.source} IS NOT NULL`)).orderBy(asc(recruits.source)),
    ]);
    const summary = summaryRow[0];
    return {
      rows,
      summary: {
        total: Number(summary?.total ?? 0), overdue: Number(summary?.overdue ?? 0), today: Number(summary?.today ?? 0), missingNextStep: Number(summary?.missingNextStep ?? 0),
      },
      sources: sources.map(item => item.source).filter((value): value is string => Boolean(value)),
    };
  }),

  get: protectedProcedure.input(z.object({ recruitId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const recruit = await getRecruitOrThrow(input.recruitId);
    const assignee = aliasedTable(users, "recruiting_task_assignee");
    const completer = aliasedTable(users, "recruiting_task_completer");
    const [stage, owner, market, activities, tasks, appointments] = await Promise.all([
      stageById(recruit.stageId, true),
      hostForAppointment(recruit.ownerId),
      recruit.primaryMarketId ? db.select({ id: marketProfiles.id, name: marketProfiles.name, state: marketProfiles.state }).from(marketProfiles).where(eq(marketProfiles.id, recruit.primaryMarketId)).limit(1) : Promise.resolve([]),
      db.select({ activity: recruitingActivities, enteredBy: { id: users.id, name: users.name, email: users.email } }).from(recruitingActivities)
        .leftJoin(users, eq(recruitingActivities.enteredById, users.id)).where(eq(recruitingActivities.recruitId, input.recruitId))
        .orderBy(desc(recruitingActivities.isPinned), desc(recruitingActivities.occurredAt), desc(recruitingActivities.id)),
      db.select({ task: recruitingTasks, assignee: { id: assignee.id, name: assignee.name, email: assignee.email }, completedBy: { id: completer.id, name: completer.name } }).from(recruitingTasks)
        .leftJoin(assignee, eq(recruitingTasks.assignedToId, assignee.id)).leftJoin(completer, eq(recruitingTasks.completedById, completer.id))
        .where(eq(recruitingTasks.recruitId, input.recruitId)).orderBy(sql`${recruitingTasks.completedAt} IS NOT NULL`, asc(recruitingTasks.dueDate)),
      db.select().from(recruitingAppointments).where(eq(recruitingAppointments.recruitId, input.recruitId)).orderBy(desc(recruitingAppointments.startAt)),
    ]);
    return { recruit, stage, owner, market: market[0] ?? null, activities, tasks, appointments };
  }),

  create: protectedProcedure.input(recruitInputSchema).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const identity = await resolveRecruitByIdentity({ email: input.email, phone: input.phone });
    if (identity.kind === "match") throw new TRPCError({ code: "CONFLICT", message: "A recruiting record already exists with this email or phone number." });
    if (identity.kind === "conflict") throw new TRPCError({ code: "CONFLICT", message: "The email and phone match different recruiting records. Review the duplicates before continuing." });
    const ownerId = input.ownerId ?? ctx.user.id;
    await activeAdmin(ownerId);
    const stage = input.stageId ? await stageById(input.stageId) : await defaultStage();
    const socialLinks = Object.fromEntries(Object.entries({ linkedin: nullIfBlank(input.linkedinUrl), instagram: nullIfBlank(input.instagramUrl) }).filter(([, value]) => value));
    const [result] = await db.insert(recruits).values({
      ...input,
      email: identity.email,
      phone: identity.phone,
      websiteUrl: nullIfBlank(input.websiteUrl),
      socialLinks: Object.keys(socialLinks).length ? socialLinks : null,
      primaryMarketText: nullIfBlank(input.primaryMarketText),
      currentBrokerage: nullIfBlank(input.currentBrokerage),
      state: nullIfBlank(input.state),
      shortTermRentalExperience: nullIfBlank(input.shortTermRentalExperience),
      productionPeriod: nullIfBlank(input.productionPeriod),
      source: nullIfBlank(input.source),
      nextAction: nullIfBlank(input.nextAction),
      goals: nullIfBlank(input.goals),
      motivations: nullIfBlank(input.motivations),
      objections: nullIfBlank(input.objections),
      context: nullIfBlank(input.context),
      additionalMarkets: input.additionalMarkets?.filter(Boolean) ?? null,
      ownerId,
      stageId: stage.id,
      createdById: ctx.user.id,
    } as any);
    const recruitId = Number((result as any).insertId);
    await createRecruitingActivity({ recruitId, type: "note", body: "Recruiting record created.", enteredById: ctx.user.id, metadata: { source: input.source ?? null } });
    await logActivity({ userId: ctx.user.id, action: "recruit_created", entityType: "recruit", entityId: recruitId, details: { ownerId, stageId: stage.id } });
    return { id: recruitId };
  }),

  update: protectedProcedure.input(z.object({ recruitId: z.number().int().positive(), data: recruitInputSchema.partial() })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const existing = await getRecruitOrThrow(input.recruitId);
    if (input.data.ownerId) await activeAdmin(input.data.ownerId);
    if (input.data.stageId && input.data.stageId !== existing.stageId) {
      const nextStage = await stageById(input.data.stageId);
      const priorStage = await stageById(existing.stageId, true);
      await createRecruitingActivity({
        recruitId: existing.id,
        type: "stage_changed",
        body: `Stage changed from ${priorStage.name} to ${nextStage.name}.`,
        enteredById: ctx.user.id,
        metadata: { fromStageId: priorStage.id, toStageId: nextStage.id },
      });
    }
    const data: Record<string, unknown> = { ...input.data };
    delete data.linkedinUrl;
    delete data.instagramUrl;
    if (input.data.email !== undefined || input.data.phone !== undefined) {
      const identity = await resolveRecruitByIdentity({ email: input.data.email ?? existing.email, phone: input.data.phone ?? existing.phone });
      if (identity.kind === "conflict" || (identity.kind === "match" && identity.recruit.id !== existing.id)) {
        throw new TRPCError({ code: "CONFLICT", message: "The email and phone match another recruiting record. Review the records before changing identity details." });
      }
      data.email = identity.email;
      data.phone = identity.phone;
    }
    if (input.data.websiteUrl !== undefined) data.websiteUrl = nullIfBlank(input.data.websiteUrl);
    if (input.data.currentBrokerage !== undefined) data.currentBrokerage = nullIfBlank(input.data.currentBrokerage);
    if (input.data.primaryMarketText !== undefined) data.primaryMarketText = nullIfBlank(input.data.primaryMarketText);
    if (input.data.source !== undefined) data.source = nullIfBlank(input.data.source);
    if (input.data.nextAction !== undefined) data.nextAction = nullIfBlank(input.data.nextAction);
    for (const field of ["state", "shortTermRentalExperience", "productionPeriod", "goals", "motivations", "objections", "context"] as const) {
      if (input.data[field] !== undefined) data[field] = nullIfBlank(input.data[field]);
    }
    if (input.data.additionalMarkets !== undefined) data.additionalMarkets = input.data.additionalMarkets?.filter(Boolean) ?? null;
    if (input.data.linkedinUrl !== undefined || input.data.instagramUrl !== undefined) {
      const currentLinks = (existing.socialLinks as Record<string, string> | null) ?? {};
      const links = { ...currentLinks };
      if (input.data.linkedinUrl !== undefined) {
        const value = nullIfBlank(input.data.linkedinUrl);
        if (value) links.linkedin = value; else delete links.linkedin;
      }
      if (input.data.instagramUrl !== undefined) {
        const value = nullIfBlank(input.data.instagramUrl);
        if (value) links.instagram = value; else delete links.instagram;
      }
      data.socialLinks = Object.keys(links).length ? links : null;
    }
    await db.update(recruits).set(data as any).where(eq(recruits.id, existing.id));
    await logActivity({ userId: ctx.user.id, action: "recruit_updated", entityType: "recruit", entityId: existing.id, details: { fields: Object.keys(data) } });
    return { success: true };
  }),

  addActivity: protectedProcedure.input(z.object({
    recruitId: z.number().int().positive(),
    type: z.enum(ACTIVITY_TYPES),
    body: z.string().trim().min(1).max(20_000),
    outcome: z.string().trim().max(1_000).nullable().optional(),
    occurredAt: z.coerce.date(),
    updateLastContact: z.boolean().default(true),
  })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await getRecruitOrThrow(input.recruitId);
    const activityId = await createRecruitingActivity({ ...input, enteredById: ctx.user.id });
    if (input.updateLastContact && ["call", "email", "text", "meeting"].includes(input.type)) {
      await db.update(recruits).set({ lastContactAt: input.occurredAt }).where(eq(recruits.id, input.recruitId));
    }
    return { id: activityId };
  }),

  togglePinnedActivity: protectedProcedure.input(z.object({ activityId: z.number().int().positive(), pinned: z.boolean() })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [activity] = await db.select().from(recruitingActivities).where(eq(recruitingActivities.id, input.activityId)).limit(1);
    if (!activity) throw new TRPCError({ code: "NOT_FOUND", message: "Recruiting activity not found." });
    await db.update(recruitingActivities).set({ isPinned: input.pinned, pinnedAt: input.pinned ? new Date() : null }).where(eq(recruitingActivities.id, activity.id));
    return { success: true };
  }),

  createTask: protectedProcedure.input(z.object({
    recruitId: z.number().int().positive(),
    title: z.string().trim().min(1).max(500),
    notes: z.string().trim().max(10_000).nullable().optional(),
    assignedToId: z.number().int().positive(),
    dueDate: z.string().regex(DATE_RE, "Choose a valid due date."),
  })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await getRecruitOrThrow(input.recruitId);
    await activeAdmin(input.assignedToId);
    const [result] = await db.insert(recruitingTasks).values({
      ...input,
      dueDate: new Date(`${input.dueDate}T12:00:00.000Z`),
      notes: nullIfBlank(input.notes),
      createdById: ctx.user.id,
    });
    const taskId = Number((result as any).insertId);
    await createRecruitingActivity({ recruitId: input.recruitId, type: "task_created", body: `Follow-up task created: ${input.title}`, enteredById: ctx.user.id, metadata: { taskId, dueDate: input.dueDate, assignedToId: input.assignedToId } });
    return { id: taskId };
  }),

  completeTask: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [task] = await db.select().from(recruitingTasks).where(eq(recruitingTasks.id, input.taskId)).limit(1);
    if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Recruiting task not found." });
    if (!task.completedAt) {
      await db.update(recruitingTasks).set({ completedAt: new Date(), completedById: ctx.user.id }).where(eq(recruitingTasks.id, task.id));
      await createRecruitingActivity({ recruitId: task.recruitId, type: "task_completed", body: `Follow-up task completed: ${task.title}`, enteredById: ctx.user.id, metadata: { taskId: task.id } });
    }
    return { success: true };
  }),

  createAppointment: protectedProcedure.input(z.object({ recruitId: z.number().int().positive(), appointment: appointmentInputSchema })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const recruit = await getRecruitOrThrow(input.recruitId);
    if (input.appointment.endAt <= input.appointment.startAt) throw new TRPCError({ code: "BAD_REQUEST", message: "The appointment end time must be after its start time." });
    const result = await createCalendarConfirmedAppointment({
      recruit,
      hostUserId: recruit.ownerId,
      scheduledByUserId: ctx.user.id,
      source: "admin",
      ...input.appointment,
    });
    await createRecruitingActivity({ recruitId: recruit.id, type: "appointment_scheduled", body: `Meeting scheduled for ${result.appointment.startAt.toLocaleString()}.`, enteredById: ctx.user.id, metadata: { appointmentId: result.appointment.id } });
    return { id: result.appointment.id, emailDelivery: result.delivery.status };
  }),

  rescheduleAppointment: protectedProcedure.input(z.object({ appointmentId: z.number().int().positive(), appointment: appointmentInputSchema })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [appointment] = await db.select().from(recruitingAppointments).where(eq(recruitingAppointments.id, input.appointmentId)).limit(1);
    if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Recruiting appointment not found." });
    if (appointment.status === "canceled" || appointment.status === "completed" || appointment.status === "no_show") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This appointment cannot be rescheduled." });
    if (!appointment.externalCalendarEventId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This appointment is not connected to Google Calendar." });
    if (input.appointment.endAt <= input.appointment.startAt) throw new TRPCError({ code: "BAD_REQUEST", message: "The appointment end time must be after its start time." });
    const [recruit, host] = await Promise.all([getRecruitOrThrow(appointment.recruitId), hostForAppointment(appointment.hostUserId)]);
    const settings = await ensureCalendarSettings(appointment.hostUserId);
    const available = await slotIsAvailable({ hostUserId: appointment.hostUserId, settings, startAt: input.appointment.startAt, endAt: input.appointment.endAt, excludeAppointmentId: appointment.id });
    if (!available) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That time is no longer available. Please choose another time." });
    const updated = { ...appointment, ...input.appointment } as RecruitAppointment;
    try {
      await updateGoogleCalendarEvent(appointment.hostUserId, appointment.externalCalendarEventId, calendarEventPayload(updated, recruit));
    } catch (error) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Google Calendar could not reschedule this appointment." });
    }
    await db.update(recruitingAppointments).set({ ...input.appointment, status: "scheduled" }).where(eq(recruitingAppointments.id, appointment.id));
    const after = (await db.select().from(recruitingAppointments).where(eq(recruitingAppointments.id, appointment.id)).limit(1))[0]!;
    const delivery = await sendRecruitingAppointmentEmails(after, recruit, host, "rescheduled");
    await db.update(recruitingAppointments).set({ invitationDeliveryStatus: delivery.status, invitationDeliveryError: delivery.error }).where(eq(recruitingAppointments.id, after.id));
    await createRecruitingActivity({ recruitId: recruit.id, type: "appointment_rescheduled", body: `Meeting rescheduled for ${after.startAt.toLocaleString()}.`, enteredById: ctx.user.id, metadata: { appointmentId: after.id } });
    return { success: true, emailDelivery: delivery.status };
  }),

  cancelAppointment: protectedProcedure.input(z.object({ appointmentId: z.number().int().positive(), reason: z.string().trim().max(1_000).nullable().optional() })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [appointment] = await db.select().from(recruitingAppointments).where(eq(recruitingAppointments.id, input.appointmentId)).limit(1);
    if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Recruiting appointment not found." });
    if (appointment.status === "canceled") return { success: true, alreadyCanceled: true };
    const [recruit, host] = await Promise.all([getRecruitOrThrow(appointment.recruitId), hostForAppointment(appointment.hostUserId)]);
    if (appointment.externalCalendarEventId) {
      try {
        await cancelGoogleCalendarEvent(appointment.hostUserId, appointment.externalCalendarEventId);
      } catch (error) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Google Calendar could not cancel this appointment." });
      }
    }
    await db.update(recruitingAppointments).set({ status: "canceled", canceledAt: new Date(), cancellationReason: nullIfBlank(input.reason) }).where(eq(recruitingAppointments.id, appointment.id));
    const after = (await db.select().from(recruitingAppointments).where(eq(recruitingAppointments.id, appointment.id)).limit(1))[0]!;
    const delivery = await sendRecruitingAppointmentEmails(after, recruit, host, "canceled");
    await db.update(recruitingAppointments).set({ invitationDeliveryStatus: delivery.status, invitationDeliveryError: delivery.error }).where(eq(recruitingAppointments.id, after.id));
    await createRecruitingActivity({ recruitId: recruit.id, type: "appointment_canceled", body: `Meeting canceled${input.reason ? `: ${input.reason}` : "."}`, enteredById: ctx.user.id, metadata: { appointmentId: appointment.id } });
    return { success: true };
  }),

  recordAppointmentOutcome: protectedProcedure.input(z.object({ appointmentId: z.number().int().positive(), status: z.enum(APPOINTMENT_OUTCOMES), outcome: z.string().trim().max(10_000).nullable().optional() })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [appointment] = await db.select().from(recruitingAppointments).where(eq(recruitingAppointments.id, input.appointmentId)).limit(1);
    if (!appointment) throw new TRPCError({ code: "NOT_FOUND", message: "Recruiting appointment not found." });
    if (appointment.status === "canceled") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Canceled appointments cannot have an outcome." });
    await db.update(recruitingAppointments).set({ status: input.status, completedAt: input.status === "completed" ? new Date() : null }).where(eq(recruitingAppointments.id, appointment.id));
    await createRecruitingActivity({
      recruitId: appointment.recruitId,
      type: input.status === "completed" ? "appointment_completed" : "appointment_no_show",
      body: input.outcome || (input.status === "completed" ? "Meeting marked completed." : "Meeting marked as a no-show."),
      enteredById: ctx.user.id,
      outcome: input.outcome ?? null,
      metadata: { appointmentId: appointment.id },
    });
    return { success: true };
  }),

  calendarSettings: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.user);
    const settings = await ensureCalendarSettings(ctx.user.id);
    const connection = await calendarConnectionForUser(ctx.user.id);
    let calendars: Array<{ id: string; summary: string; primary: boolean }> = [];
    if (connection?.status === "connected" && isGoogleCalendarConfigured()) {
      calendars = await listGoogleCalendars(ctx.user.id).catch(() => []);
    }
    return { settings, connection, configured: isGoogleCalendarConfigured(), calendars };
  }),

  updateCalendarSettings: protectedProcedure.input(z.object({
    meetingDurationMinutes: z.number().int().min(15).max(120),
    timezone: z.string().trim().min(3).max(64),
    workingHours: workingHoursSchema,
    bufferBeforeMinutes: z.number().int().min(0).max(120),
    bufferAfterMinutes: z.number().int().min(0).max(120),
    minimumNoticeHours: z.number().int().min(0).max(168),
    conflictCalendarIds: z.array(z.string().trim().min(1).max(512)).max(30),
  })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await ensureCalendarSettings(ctx.user.id);
    for (const day of Object.values(input.workingHours)) {
      if (day.enabled && day.end <= day.start) throw new TRPCError({ code: "BAD_REQUEST", message: "Each enabled workday must end after it starts." });
    }
    await db.update(recruitingCalendarSettings).set(input).where(eq(recruitingCalendarSettings.userId, ctx.user.id));
    return { success: true };
  }),

  saveStage: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), name: z.string().trim().min(1).max(120), position: z.number().int().min(0).max(1000), isActive: z.boolean(), isClosed: z.boolean() })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "stage";
    if (input.id) {
      await db.update(recruitingStages).set({ ...input, slug }).where(eq(recruitingStages.id, input.id));
      return { id: input.id };
    }
    const [result] = await db.insert(recruitingStages).values({ ...input, slug: `${slug}-${Date.now().toString(36)}` });
    return { id: Number((result as any).insertId) };
  }),

  summarizeTranscript: protectedProcedure.input(z.object({ recruitId: z.number().int().positive(), transcript: z.string().trim().min(100).max(50_000), occurredAt: z.coerce.date().optional() })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user);
    const recruit = await getRecruitOrThrow(input.recruitId);
    const result = await invokeLLM({
      model: "gpt-5-mini",
      reasoning: { effort: "minimal" },
      maxTokens: 1_500,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "recruiting_call_summary",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              motivations: { type: "array", items: { type: "string" } },
              objections: { type: "array", items: { type: "string" } },
              commitments: { type: "array", items: { type: "string" } },
              nextStep: { type: "string" },
            },
            required: ["summary", "motivations", "objections", "commitments", "nextStep"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        { role: "system", content: "You summarize recruiting calls for an internal brokerage CRM. State only facts supported by the transcript. Keep the summary concise, practical, and free of speculation. Do not create sensitive assumptions." },
        { role: "user", content: `Recruit: ${displayName(recruit)}\n\nTranscript:\n${input.transcript}` },
      ],
    });
    let parsed: { summary: string; motivations: string[]; objections: string[]; commitments: string[]; nextStep: string };
    try {
      parsed = JSON.parse(readLlmText(result));
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The call summary could not be parsed. Please try again." });
    }
    const body = [
      `Call summary\n${parsed.summary}`,
      parsed.motivations.length ? `Motivations: ${parsed.motivations.join("; ")}` : "",
      parsed.objections.length ? `Objections: ${parsed.objections.join("; ")}` : "",
      parsed.commitments.length ? `Commitments: ${parsed.commitments.join("; ")}` : "",
      parsed.nextStep ? `Recommended next step: ${parsed.nextStep}` : "",
    ].filter(Boolean).join("\n\n");
    const activityId = await createRecruitingActivity({ recruitId: recruit.id, type: "ai_summary", body, occurredAt: input.occurredAt ?? new Date(), enteredById: ctx.user.id, metadata: { model: "gpt-5-mini" } });
    return { activityId, ...parsed };
  }),

  publicAvailability: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { configured: false, connected: false, timezone: DEFAULT_TIMEZONE, duration: 30, slots: [] as Array<{ startAt: string; endAt: string }> };
    const [trish] = await db.select({ id: users.id }).from(users)
      .where(and(sql`LOWER(${users.email}) = ${TRISH_EMAIL}`, eq(users.role, "admin"), eq(users.isActive, true))).limit(1);
    if (!trish) return { configured: false, connected: false, timezone: DEFAULT_TIMEZONE, duration: 30, slots: [] as Array<{ startAt: string; endAt: string }> };
    const availability = await availabilitySlots(trish.id).catch(() => null);
    if (!availability) return { configured: isGoogleCalendarConfigured(), connected: false, timezone: DEFAULT_TIMEZONE, duration: 30, slots: [] as Array<{ startAt: string; endAt: string }> };
    return {
      configured: availability.configured,
      connected: availability.connected,
      timezone: availability.settings.timezone,
      duration: availability.settings.meetingDurationMinutes,
      slots: availability.slots,
    };
  }),

  publicBookTrish: publicProcedure.input(z.object({
    name: z.string().trim().min(3).max(255),
    email: z.string().trim().email().max(320),
    phone: z.string().trim().min(7).max(32),
    currentBrokerage: z.string().trim().max(255).nullable().optional(),
    primaryMarket: z.string().trim().min(1).max(255),
    message: z.string().trim().max(5_000).nullable().optional(),
    startAt: z.coerce.date(),
    timezone: z.string().trim().min(3).max(64),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Booking is temporarily unavailable." });
    const [trish] = await db.select({ id: users.id }).from(users)
      .where(and(sql`LOWER(${users.email}) = ${TRISH_EMAIL}`, eq(users.role, "admin"), eq(users.isActive, true))).limit(1);
    if (!trish) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This booking page is not ready yet." });
    const settings = await ensureCalendarSettings(trish.id);
    if (!isGoogleCalendarConfigured() || !(await calendarConnectionForUser(trish.id))?.status || (await calendarConnectionForUser(trish.id))?.status !== "connected") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Online booking is temporarily unavailable. Please try again later." });
    }
    const { firstName, lastName } = splitName(input.name);
    const identity = await resolveRecruitByIdentity({ email: input.email, phone: input.phone });
    if (identity.kind === "conflict") {
      throw new TRPCError({ code: "CONFLICT", message: "We need to confirm a detail before booking. Please contact Trish directly." });
    }
    let recruit: RecruitRecord;
    if (identity.kind === "match") {
      recruit = identity.recruit;
      const safeUpdates: Record<string, unknown> = {};
      if (!recruit.phone && identity.phone) safeUpdates.phone = identity.phone;
      if (!recruit.currentBrokerage && input.currentBrokerage) safeUpdates.currentBrokerage = nullIfBlank(input.currentBrokerage);
      if (!recruit.primaryMarketText) safeUpdates.primaryMarketText = input.primaryMarket;
      if (Object.keys(safeUpdates).length) {
        await db.update(recruits).set(safeUpdates).where(eq(recruits.id, recruit.id));
        recruit = (await db.select().from(recruits).where(eq(recruits.id, recruit.id)).limit(1))[0]!;
      }
    } else {
      const stage = await defaultStage("meeting-scheduled");
      const [created] = await db.insert(recruits).values({
        firstName,
        lastName,
        email: identity.email,
        phone: identity.phone,
        currentBrokerage: nullIfBlank(input.currentBrokerage),
        primaryMarketText: input.primaryMarket,
        ownerId: trish.id,
        source: "Trish public booking page",
        stageId: stage.id,
        createdById: null,
      });
      recruit = (await db.select().from(recruits).where(eq(recruits.id, Number((created as any).insertId))).limit(1))[0]!;
    }
    const endAt = new Date(input.startAt.getTime() + settings.meetingDurationMinutes * 60_000);
    const result = await createCalendarConfirmedAppointment({
      recruit,
      hostUserId: trish.id,
      scheduledByUserId: null,
      source: "public_trish",
      title: "Recruiting conversation with Trish Bartley",
      startAt: input.startAt,
      endAt,
      timezone: settings.timezone,
      visitorTimezone: input.timezone,
      visitorMessage: nullIfBlank(input.message),
    });
    await createRecruitingActivity({
      recruitId: recruit.id,
      type: "booking",
      body: `Booked a recruiting conversation through Trish’s public page.${input.message ? `\n\nVisitor message: ${input.message}` : ""}`,
      enteredById: null,
      occurredAt: new Date(),
      metadata: { appointmentId: result.appointment.id, source: "trish_public_page" },
    });
    await db.update(recruits).set({ lastContactAt: new Date() }).where(eq(recruits.id, recruit.id));
    await logActivity({ userId: null, action: "recruit_public_booking", entityType: "recruit", entityId: recruit.id, details: { appointmentId: result.appointment.id, ownerId: recruit.ownerId } });
    return { success: true, startAt: result.appointment.startAt, endAt: result.appointment.endAt, timezone: input.timezone, hostName: result.host.name ?? "Trish Bartley" };
  }),
});

export const RECRUITING_PUBLIC_TRPC_PATHS = new Set([
  "recruiting.publicAvailability",
  "recruiting.publicBookTrish",
]);

export const __testables__ = { defaultWorkingHours, isWorkingSlot, rangesOverlap, splitName };
