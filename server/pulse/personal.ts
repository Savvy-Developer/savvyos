import { TRPCError } from "@trpc/server";
import { pulseProcedure } from "./authorization";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { pulseMeetingUpdates, pulseMeetings, pulseWeeklySubmissions, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { router } from "../_core/trpc";
import { sendTransactionalEmail } from "../_core/resendEmail";
import { visible_meeting_ids } from "./access";
import { getMeetingScorecard, saveCurrentScorecardValue } from "./scorecard";
import { listAccessibleItems } from "./workItems";

const uuid = () => crypto.randomUUID();
const week = () => { const date = new Date(); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); date.setHours(0, 0, 0, 0); return date; };
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
async function dbOrThrow() { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pulse is not available right now. Please try again." }); return db; }
async function myMeetingIds(db: any, personId: number) { return visible_meeting_ids(db, personId); }

async function personalMeetingPrep(db: any, personId: number) {
  const ids = await myMeetingIds(db, personId);
  if (!ids.length) return { weekOf: week(), meetings: [], fields: [], complete: true };
  const meetings = await db.select({ id: pulseMeetings.id, name: pulseMeetings.name, dayOfWeek: pulseMeetings.dayOfWeek, startTime: pulseMeetings.startTime, sectionsEnabled: pulseMeetings.sectionsEnabled })
    .from(pulseMeetings).where(and(inArray(pulseMeetings.id, ids), eq(pulseMeetings.isActive, true), isNull(pulseMeetings.deletedAt))).orderBy(asc(pulseMeetings.name));
  const scorecards = await Promise.all(meetings.map(async (meeting: any) => ({ meeting, scorecard: await getMeetingScorecard(db, personId, meeting.id) })));
  const todayWeek = week();
  const submissions = await db.select().from(pulseWeeklySubmissions).where(and(eq(pulseWeeklySubmissions.personId, personId), eq(pulseWeeklySubmissions.weekOf, todayWeek), isNull(pulseWeeklySubmissions.withdrawnAt)));
  const submittedIds = new Set(submissions.map((submission: any) => submission.meetingId));
  const updates = await db.select().from(pulseMeetingUpdates).where(and(eq(pulseMeetingUpdates.authorId, personId), inArray(pulseMeetingUpdates.meetingId, ids), eq(pulseMeetingUpdates.weekOf, todayWeek), isNull(pulseMeetingUpdates.deletedAt)));
  const fields: any[] = [];
  for (const { meeting, scorecard } of scorecards) {
    for (const metric of scorecard.items) {
      if (!metric.canEdit) continue;
      fields.push({ key: `metric:${metric.metricId}`, kind: "number", label: metric.name, target: metric.target, meetingId: meeting.id, meetingName: meeting.name, value: metric.current.value, cadence: metric.cadence, required: true, source: metric.metricType });
    }
    const segue = updates.find((update: any) => update.meetingId === meeting.id && update.updateType === "segue");
    const headline = updates.find((update: any) => update.meetingId === meeting.id && update.updateType === "headline");
    fields.push({ key: `segue:${meeting.id}`, kind: "text", label: "Segue", meetingId: meeting.id, meetingName: meeting.name, value: segue?.body ?? "", required: Boolean((meeting.sectionsEnabled as any)?.segue), updateType: "segue" });
    fields.push({ key: `headline:${meeting.id}`, kind: "text", label: "Headline", meetingId: meeting.id, meetingName: meeting.name, value: headline?.body ?? "", tone: headline?.tone ?? "green", required: false, updateType: "headline" });
  }
  const displayMeetings = meetings.map((meeting: any) => ({ ...meeting, submitted: submittedIds.has(meeting.id), requiredFields: fields.filter((field: any) => field.meetingId === meeting.id && field.required), complete: fields.filter((field: any) => field.meetingId === meeting.id && field.required).every((field: any) => field.value !== null && String(field.value).trim() !== "") }));
  return { weekOf: todayWeek, meetings: displayMeetings, fields, complete: displayMeetings.every((meeting: any) => meeting.submitted) };
}

export const pulsePersonalRouter = router({
  inputs: pulseProcedure.query(async ({ ctx }) => personalMeetingPrep(await dbOrThrow(), ctx.user.id)),

  saveInput: pulseProcedure.input(z.object({ key: z.string().min(1).max(100), value: z.union([z.number().finite(), z.string().max(8000)]), meetingId: z.string().uuid(), tone: z.enum(["green", "amber", "red"]).optional() })).mutation(async ({ ctx, input }) => {
    const db = await dbOrThrow();
    const ids = await myMeetingIds(db, ctx.user.id);
    if (!ids.includes(input.meetingId)) throw new TRPCError({ code: "NOT_FOUND", message: "That L10 is not available." });
    if (input.key.startsWith("metric:")) {
      const metricId = Number(input.key.slice(7));
      if (!Number.isInteger(metricId)) throw new TRPCError({ code: "NOT_FOUND", message: "That measurable is not available." });
      return saveCurrentScorecardValue(db, ctx.user.id, { meetingId: input.meetingId, metricId, actualValue: Number(input.value) });
    }
    const updateType = input.key.startsWith("headline:") ? "headline" : input.key.startsWith("segue:") ? "segue" : null;
    if (!updateType) throw new TRPCError({ code: "BAD_REQUEST", message: "That input is not available." });
    const weekOf = week();
    const [existing] = await db.select({ id: pulseMeetingUpdates.id }).from(pulseMeetingUpdates).where(and(eq(pulseMeetingUpdates.meetingId, input.meetingId), eq(pulseMeetingUpdates.authorId, ctx.user.id), eq(pulseMeetingUpdates.updateType, updateType), eq(pulseMeetingUpdates.weekOf, weekOf), isNull(pulseMeetingUpdates.deletedAt))).limit(1);
    const values = { body: String(input.value), tone: updateType === "headline" ? input.tone ?? "green" : null, weekOf };
    if (existing) await db.update(pulseMeetingUpdates).set(values).where(eq(pulseMeetingUpdates.id, existing.id));
    else await db.insert(pulseMeetingUpdates).values({ id: uuid(), meetingId: input.meetingId, authorId: ctx.user.id, updateType, ...values });
    return { success: true };
  }),

  submitWeeklyPrep: pulseProcedure.input(z.object({ meetingId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await dbOrThrow();
    const prep = await personalMeetingPrep(db, ctx.user.id);
    const meeting = prep.meetings.find((entry: any) => entry.id === input.meetingId);
    if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "That L10 is not available." });
    const missing = meeting.requiredFields.filter((field: any) => field.value === null || String(field.value).trim() === "");
    if (missing.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Complete ${missing.map((field: any) => field.label).join(", ")} before confirming.` });
    const summary = { submittedFields: meeting.requiredFields.map((field: any) => ({ label: field.label, value: field.value })), confirmedAt: new Date().toISOString() };
    await db.insert(pulseWeeklySubmissions).values({ id: uuid(), meetingId: input.meetingId, personId: ctx.user.id, weekOf: prep.weekOf, confirmationSummary: summary }).onDuplicateKeyUpdate({ set: { submittedAt: new Date(), confirmationSummary: summary, withdrawnAt: null } });
    const [person] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (person?.email) {
      const delivery = await sendTransactionalEmail("pulse_submission_confirmation", { recipientEmail: person.email, recipientName: person.name ?? undefined, pulseMeetingName: meeting.name, pulseSubmissionSummary: `${meeting.requiredFields.length} required item${meeting.requiredFields.length === 1 ? "" : "s"} confirmed.`, pulseActionUrl: "https://os.savvy-agents.com/pulse/weekly-prep" }, { idempotencyKey: `pulse-weekly-prep:${input.meetingId}:${ctx.user.id}:${dateOnly(prep.weekOf)}` });
      if (delivery.sent || delivery.skipped) await db.update(pulseWeeklySubmissions).set({ emailSentAt: new Date() }).where(and(eq(pulseWeeklySubmissions.meetingId, input.meetingId), eq(pulseWeeklySubmissions.personId, ctx.user.id), eq(pulseWeeklySubmissions.weekOf, prep.weekOf)));
    }
    return { success: true, summary };
  }),

  withdrawWeeklyPrep: pulseProcedure.input(z.object({ meetingId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await dbOrThrow(); const ids = await myMeetingIds(db, ctx.user.id);
    if (!ids.includes(input.meetingId)) throw new TRPCError({ code: "NOT_FOUND", message: "That L10 is not available." });
    await db.update(pulseWeeklySubmissions).set({ withdrawnAt: new Date() }).where(and(eq(pulseWeeklySubmissions.meetingId, input.meetingId), eq(pulseWeeklySubmissions.personId, ctx.user.id), eq(pulseWeeklySubmissions.weekOf, week())));
    return { success: true };
  }),

  dashboard: pulseProcedure.query(async ({ ctx }) => {
    const db = await dbOrThrow();
    const ids = await myMeetingIds(db, ctx.user.id);
    const all = await listAccessibleItems(db, ctx.user.id, {});
    const items = all.filter((item: any) => item.assigneeId === ctx.user.id || item.ownerPersonId === ctx.user.id).map((item: any) => ({ ...item, source: item.meetingName ?? "Personal" }));
    const sort = (left: any, right: any) => Number(right.isOverdue) - Number(left.isOverdue) || (left.dueDate ?? "9999").localeCompare(right.dueDate ?? "9999") || left.source.localeCompare(right.source);
    const meetings = ids.length ? await db.select({ id: pulseMeetings.id, name: pulseMeetings.name }).from(pulseMeetings).where(and(inArray(pulseMeetings.id, ids), eq(pulseMeetings.isActive, true), isNull(pulseMeetings.deletedAt))).orderBy(asc(pulseMeetings.name)) : [];
    return { meetings, items: { todos: items.filter((item: any) => item.type === "todo").sort(sort), issues: items.filter((item: any) => item.type === "issue" && item.status !== "solved").sort(sort), rocks: items.filter((item: any) => item.type === "rock").sort(sort) } };
  }),
});
