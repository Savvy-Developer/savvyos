import { TRPCError } from "@trpc/server";
import { pulseProcedure } from "./authorization";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { companyGoals, pulseMeetingGoals, users } from "../../drizzle/schema";
import { router } from "../_core/trpc";
import { getDb } from "../db";
import { is_visible_meeting_manager, require_visible_meeting } from "./access";

const id = () => crypto.randomUUID();
function unavailable() { return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "SavvyOS goals are not available right now. Please try again." }); }
async function dbOrThrow() { const db = await getDb(); if (!db) throw unavailable(); return db; }
async function requireManager(db: any, personId: number, meetingId: string) { if (!await is_visible_meeting_manager(db, personId, meetingId)) throw new TRPCError({ code: "NOT_FOUND", message: "This meeting is not available." }); }

async function mappedGoals(db: any, meetingId: string) {
  return db.select({ mapping: pulseMeetingGoals, goal: companyGoals, owner: users })
    .from(pulseMeetingGoals)
    .leftJoin(companyGoals, eq(companyGoals.id, pulseMeetingGoals.savvyosGoalId))
    .leftJoin(users, eq(users.id, companyGoals.ownerId))
    .where(eq(pulseMeetingGoals.meetingId, meetingId))
    .orderBy(asc(pulseMeetingGoals.sortOrder));
}

export async function getMeetingGoals(db: any, viewerId: number, meetingId: string) {
  await require_visible_meeting(db, viewerId, meetingId);
  const rows = await mappedGoals(db, meetingId);
  const items = rows.filter((row: any) => row.goal?.status === "active" || row.goal?.status === "completed").map((row: any) => {
    const target = row.goal.targetValue == null ? null : Number(row.goal.targetValue);
    const current = row.goal.currentValue == null ? null : Number(row.goal.currentValue);
    const percentComplete = target && current != null ? Math.max(0, Math.min(100, Math.round((current / target) * 100))) : null;
    return { mappingId: row.mapping.id, goalId: row.goal.id, title: row.goal.title, description: row.goal.description, owner: row.owner ? { id: row.owner.id, name: row.owner.name ?? row.owner.email ?? "Unassigned" } : null, year: row.goal.year, target, current, unit: row.goal.unit, status: row.goal.status, percentComplete };
  });
  const configurationNotes = rows.filter((row: any) => !row.goal || row.goal.status === "inactive").map((row: any) => ({ mappingId: row.mapping.id, note: !row.goal ? "A selected SavvyOS company goal was deleted and no longer appears in this meeting." : `“${row.goal.title}” is inactive in SavvyOS and no longer appears in this meeting.` }));
  return { items, configurationNotes };
}

export const pulseGoalsRouter = router({
  configuration: pulseProcedure.input(z.object({ meetingId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const db = await dbOrThrow(); await requireManager(db, ctx.user.id, input.meetingId);
    const [mapped, available] = await Promise.all([
      mappedGoals(db, input.meetingId),
      db.select({ id: companyGoals.id, title: companyGoals.title, year: companyGoals.year, status: companyGoals.status, ownerName: users.name }).from(companyGoals).leftJoin(users, eq(users.id, companyGoals.ownerId)).where(eq(companyGoals.status, "active")).orderBy(asc(companyGoals.title)),
    ]);
    return { mapped: mapped.map((row: any) => ({ mappingId: row.mapping.id, goalId: row.goal?.id ?? null, title: row.goal?.title ?? "Deleted SavvyOS company goal", status: row.goal?.status ?? "deleted", sortOrder: row.mapping.sortOrder })), available };
  }),
  addGoal: pulseProcedure.input(z.object({ meetingId: z.string().uuid(), goalId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await dbOrThrow(); await requireManager(db, ctx.user.id, input.meetingId);
    const [goal] = await db.select({ id: companyGoals.id, status: companyGoals.status }).from(companyGoals).where(eq(companyGoals.id, input.goalId)).limit(1);
    if (!goal || goal.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active SavvyOS company goal." });
    const rows = await mappedGoals(db, input.meetingId); const sortOrder = rows.length ? Math.max(...rows.map((row: any) => row.mapping.sortOrder)) + 1 : 0;
    await db.insert(pulseMeetingGoals).values({ id: id(), meetingId: input.meetingId, savvyosGoalId: input.goalId, sortOrder }); return { success: true };
  }),
  removeGoal: pulseProcedure.input(z.object({ meetingId: z.string().uuid(), mappingId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await dbOrThrow(); await requireManager(db, ctx.user.id, input.meetingId);
    await db.delete(pulseMeetingGoals).where(and(eq(pulseMeetingGoals.id, input.mappingId), eq(pulseMeetingGoals.meetingId, input.meetingId))); return { success: true };
  }),
});
