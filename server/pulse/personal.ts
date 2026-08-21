import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { pulseMeetingUpdates, pulsePersonalInputs } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { visible_meeting_ids } from "./access";
import { getMeetingScorecard, saveCurrentScorecardValue } from "./scorecard";
import { listAccessibleItems } from "./workItems";

const uuid = () => crypto.randomUUID();
const week = () => { const date = new Date(); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); date.setHours(0, 0, 0, 0); return date; };
async function dbOrThrow() { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pulse is not available right now. Please try again." }); return db; }
async function myMeetings(db: any, personId: number) { return visible_meeting_ids(db, personId); }

export const pulsePersonalRouter = router({
  inputs: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbOrThrow();
    const ids = await myMeetings(db, ctx.user.id);
    if (!ids.length) return { weekOf: week(), fields: [], complete: true };
    const scorecards = await Promise.all(ids.map(async (meetingId) => ({ meetingId, ...(await getMeetingScorecard(db, ctx.user.id, meetingId)) })));
    const fields: any[] = [];
    const seenMetricIds = new Set<number>();
    for (const scorecard of scorecards) {
      for (const metric of scorecard.items) {
        if (!metric.canEdit || seenMetricIds.has(metric.metricId)) continue;
        seenMetricIds.add(metric.metricId);
        fields.push({ key: `metric:${metric.metricId}`, kind: "number", label: metric.name, target: metric.target, meetingId: scorecard.meetingId, meetingName: metric.detail.responsibility, value: metric.current.value, cadence: metric.cadence });
      }
    }
    const [brief] = await db.select().from(pulsePersonalInputs).where(and(eq(pulsePersonalInputs.personId, ctx.user.id), eq(pulsePersonalInputs.inputKey, "brief"), eq(pulsePersonalInputs.weekOf, week()), isNull(pulsePersonalInputs.deletedAt)));
    fields.push({ key: "brief", kind: "text", label: "60-second measurables brief", meetingName: "Your week", value: brief?.textValue ?? "" });
    for (const type of ["segue", "headline"] as const) {
      const [update] = await db.select().from(pulseMeetingUpdates).where(and(inArray(pulseMeetingUpdates.meetingId, ids), eq(pulseMeetingUpdates.authorId, ctx.user.id), eq(pulseMeetingUpdates.updateType, type), isNull(pulseMeetingUpdates.deletedAt))).limit(1);
      fields.push({ key: type, kind: "text", label: type === "segue" ? "Segue" : "Headlines", meetingName: update ? "Saved to your meeting" : "Choose a meeting when you save", value: update?.body ?? "" });
    }
    const required = fields.filter((field) => field.kind === "number");
    return { weekOf: week(), fields, complete: required.every((field) => field.value !== null) };
  }),

  saveInput: protectedProcedure.input(z.object({ key: z.string().min(1).max(100), value: z.union([z.number().finite(), z.string().max(8000)]), meetingId: z.string().uuid().optional() })).mutation(async ({ ctx, input }) => {
    const db = await dbOrThrow();
    const ids = await myMeetings(db, ctx.user.id);
    if (input.key.startsWith("metric:")) {
      const metricId = Number(input.key.slice(7));
      if (!Number.isInteger(metricId) || !input.meetingId || !ids.includes(input.meetingId)) throw new TRPCError({ code: "NOT_FOUND", message: "That input is not available." });
      return saveCurrentScorecardValue(db, ctx.user.id, { meetingId: input.meetingId, metricId, actualValue: Number(input.value) });
    }
    if (input.key === "brief") {
      await db.insert(pulsePersonalInputs).values({ id: uuid(), personId: ctx.user.id, meetingId: null, inputKey: "brief", weekOf: week(), textValue: String(input.value) }).onDuplicateKeyUpdate({ set: { textValue: String(input.value), deletedAt: null } });
      return { success: true };
    }
    if (input.key === "segue" || input.key === "headline") {
      const meetingId = input.meetingId ?? ids[0];
      if (!meetingId || !ids.includes(meetingId)) throw new TRPCError({ code: "NOT_FOUND", message: "Choose a meeting you belong to." });
      await db.insert(pulseMeetingUpdates).values({ id: uuid(), meetingId, authorId: ctx.user.id, updateType: input.key, body: String(input.value) });
      return { success: true };
    }
    throw new TRPCError({ code: "BAD_REQUEST", message: "That input is not available." });
  }),

  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbOrThrow();
    const ids = await myMeetings(db, ctx.user.id);
    if (ids.length <= 1) return { redirectMeetingId: ids[0] ?? null, items: [] };
    const all = await listAccessibleItems(db, ctx.user.id, {});
    const items = all.filter((item: any) => item.assigneeId === ctx.user.id || item.ownerPersonId === ctx.user.id).map((item: any) => ({ ...item, source: item.meetingName ?? "Personal" }));
    const sort = (left: any, right: any) => Number(right.isOverdue) - Number(left.isOverdue) || (left.dueDate ?? "9999").localeCompare(right.dueDate ?? "9999") || left.source.localeCompare(right.source);
    return { redirectMeetingId: null, items: { todos: items.filter((item: any) => item.type === "todo").sort(sort), issues: items.filter((item: any) => item.type === "issue" && item.status !== "solved").sort(sort), rocks: items.filter((item: any) => item.type === "rock").sort(sort) } };
  }),
});
