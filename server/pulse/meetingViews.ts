import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { pulseCascadingMessages, pulseMeetingUpdates, pulseMeetingsArchive, pulseScorecardEntries, pulseScorecardMetrics } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { is_visible_meeting_manager, require_visible_meeting } from "./access";
import { getMeetingSectionPayloads, PULSE_SECTION_FUNCTIONS } from "./sections";

const meetingId = z.string().uuid();
const uuid = () => crypto.randomUUID();
function unavailable() { return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pulse is not available right now. Please try again." }); }
function startOfWeek() { const d = new Date(); const day = d.getDay(); d.setDate(d.getDate() - ((day + 6) % 7)); d.setHours(0, 0, 0, 0); return d; }

async function dashboardPayload(db: any, viewerId: number, id: string) {
  const { meeting, sections } = await getMeetingSectionPayloads(db, viewerId, id);
  const isManager = await is_visible_meeting_manager(db, viewerId, id);
  return {
    viewerId,
    meeting: { id: meeting.id, name: meeting.name, dayOfWeek: meeting.dayOfWeek, startTime: meeting.startTime, cadence: meeting.cadence, durationMinutes: meeting.durationMinutes, sectionsEnabled: meeting.sectionsEnabled, sectionOrder: meeting.sectionOrder },
    sections,
    sectionFunctions: PULSE_SECTION_FUNCTIONS,
    ...(isManager ? { manager: { canRun: true } } : {}),
  };
}

export const pulseMeetingViewsRouter = router({
  dashboard: protectedProcedure.input(z.object({ meetingId })).query(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw unavailable();
    return dashboardPayload(db, ctx.user.id, input.meetingId);
  }),
  run: protectedProcedure.input(z.object({ meetingId })).query(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw unavailable();
    if (!await is_visible_meeting_manager(db, ctx.user.id, input.meetingId)) throw new TRPCError({ code: "NOT_FOUND", message: "This meeting no longer exists. Go to your meetings." });
    const payload = await dashboardPayload(db, ctx.user.id, input.meetingId);
    return { ...payload, run: { sectionDurations: (await require_visible_meeting(db, ctx.user.id, input.meetingId)).sectionDurations } };
  }),
  addUpdate: protectedProcedure.input(z.object({ meetingId, updateType: z.enum(["segue", "headline"]), body: z.string().trim().min(1).max(4000) })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw unavailable(); await require_visible_meeting(db, ctx.user.id, input.meetingId);
    await db.insert(pulseMeetingUpdates).values({ id: uuid(), meetingId: input.meetingId, authorId: ctx.user.id, updateType: input.updateType, body: input.body }); return { success: true };
  }),
  setScorecardValue: protectedProcedure.input(z.object({ metricId: z.string().uuid(), value: z.number().int().min(-1000000).max(1000000) })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw unavailable();
    const [metric] = await db.select().from(pulseScorecardMetrics).where(and(eq(pulseScorecardMetrics.id, input.metricId), isNull(pulseScorecardMetrics.deletedAt))).limit(1);
    if (!metric) throw new TRPCError({ code: "NOT_FOUND", message: "That number is no longer available." }); await require_visible_meeting(db, ctx.user.id, metric.meetingId);
    const periodStart = startOfWeek();
    await db.insert(pulseScorecardEntries).values({ id: uuid(), metricId: metric.id, personId: ctx.user.id, periodStart, value: input.value }).onDuplicateKeyUpdate({ set: { value: input.value, deletedAt: null } }); return { success: true };
  }),
  acknowledgeCascade: protectedProcedure.input(z.object({ messageId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw unavailable();
    const [message] = await db.select().from(pulseCascadingMessages).where(and(eq(pulseCascadingMessages.id, input.messageId), isNull(pulseCascadingMessages.deletedAt))).limit(1);
    if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "That message is no longer available." }); await require_visible_meeting(db, ctx.user.id, message.toMeetingId);
    await db.update(pulseCascadingMessages).set({ acknowledgedAt: new Date(), acknowledgedById: ctx.user.id }).where(eq(pulseCascadingMessages.id, message.id)); return { success: true };
  }),
  conclude: protectedProcedure.input(z.object({ meetingId, rating: z.number().int().min(1).max(10), durationActualMinutes: z.number().int().min(0).max(1440), attendeeIds: z.array(z.number().int().positive()).max(100), notes: z.string().trim().max(4000).optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw unavailable(); if (!await is_visible_meeting_manager(db, ctx.user.id, input.meetingId)) throw new TRPCError({ code: "NOT_FOUND", message: "This meeting no longer exists. Go to your meetings." });
    const payload = await getMeetingSectionPayloads(db, ctx.user.id, input.meetingId);
    const todos = payload.sections.find((section: any) => section.section === "todos")?.items ?? []; const issues = payload.sections.find((section: any) => section.section === "issues")?.items ?? [];
    await db.insert(pulseMeetingsArchive).values({ id: uuid(), meetingId: input.meetingId, occurredAt: new Date(), durationActualMinutes: input.durationActualMinutes, attendeeIds: input.attendeeIds, todosCreated: todos.length, todosCompleted: todos.filter((item: any) => item.status === "done").length, issuesCreated: issues.length, issuesResolved: issues.filter((item: any) => item.status === "solved").length, rating: input.rating, notes: input.notes ?? null }); return { success: true };
  }),
});
