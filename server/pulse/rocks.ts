import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { pulseMeetingRocks, pulseMeetings, pulseWorkItems, users } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { is_visible_meeting_manager, require_visible_meeting } from "./access";

const id = () => crypto.randomUUID();
function unavailable() { return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rocks are not available right now. Please try again." }); }
async function dbOrThrow() { const db = await getDb(); if (!db) throw unavailable(); return db; }
async function requireManager(db: any, personId: number, meetingId: string) { if (!await is_visible_meeting_manager(db, personId, meetingId)) throw new TRPCError({ code: "NOT_FOUND", message: "This meeting is not available." }); }

async function mappings(db: any, meetingId: string) {
  return db.select({ mapping: pulseMeetingRocks, item: pulseWorkItems, homeMeeting: pulseMeetings, assignee: users })
    .from(pulseMeetingRocks)
    .innerJoin(pulseWorkItems, eq(pulseWorkItems.id, pulseMeetingRocks.workItemId))
    .leftJoin(pulseMeetings, eq(pulseMeetings.id, pulseWorkItems.meetingId))
    .leftJoin(users, eq(users.id, pulseWorkItems.assigneeId))
    .where(and(eq(pulseMeetingRocks.meetingId, meetingId), eq(pulseWorkItems.type, "rock"), isNull(pulseWorkItems.deletedAt)))
    .orderBy(asc(pulseMeetingRocks.sortOrder));
}

export async function getMeetingRocks(db: any, viewerId: number, meetingId: string) {
  await require_visible_meeting(db, viewerId, meetingId);
  const rows = await mappings(db, meetingId);
  return rows.map((row: any) => ({ ...row.item, id: row.item.id, displayMappingId: row.mapping.id, assigneeName: row.assignee?.name ?? null, homeMeetingName: row.homeMeeting?.name ?? "Original meeting", readOnly: row.item.meetingId !== meetingId, displayedInMeetingId: meetingId }));
}

export const pulseRocksRouter = router({
  configuration: protectedProcedure.input(z.object({ meetingId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const db = await dbOrThrow(); await requireManager(db, ctx.user.id, input.meetingId);
    const [mapped, available] = await Promise.all([
      mappings(db, input.meetingId),
      db.select({ id: pulseWorkItems.id, title: pulseWorkItems.title, status: pulseWorkItems.status, homeMeetingName: pulseMeetings.name, homeMeetingId: pulseWorkItems.meetingId, assigneeName: users.name })
        .from(pulseWorkItems).leftJoin(pulseMeetings, eq(pulseMeetings.id, pulseWorkItems.meetingId)).leftJoin(users, eq(users.id, pulseWorkItems.assigneeId))
        .where(and(eq(pulseWorkItems.type, "rock"), isNull(pulseWorkItems.deletedAt))).orderBy(asc(pulseWorkItems.title)),
    ]);
    return { mapped: mapped.map((row: any) => ({ mappingId: row.mapping.id, workItemId: row.item.id, title: row.item.title, homeMeetingId: row.item.meetingId, homeMeetingName: row.homeMeeting?.name ?? "Original meeting", sortOrder: row.mapping.sortOrder })), available };
  }),
  addRock: protectedProcedure.input(z.object({ meetingId: z.string().uuid(), workItemId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await dbOrThrow(); await requireManager(db, ctx.user.id, input.meetingId);
    const [rock] = await db.select({ id: pulseWorkItems.id, type: pulseWorkItems.type }).from(pulseWorkItems).where(and(eq(pulseWorkItems.id, input.workItemId), isNull(pulseWorkItems.deletedAt))).limit(1);
    if (!rock || rock.type !== "rock") throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active Pulse rock." });
    const rows = await mappings(db, input.meetingId); const sortOrder = rows.length ? Math.max(...rows.map((row: any) => row.mapping.sortOrder)) + 1 : 0;
    await db.insert(pulseMeetingRocks).values({ id: id(), meetingId: input.meetingId, workItemId: input.workItemId, sortOrder }); return { success: true };
  }),
  removeRock: protectedProcedure.input(z.object({ meetingId: z.string().uuid(), mappingId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await dbOrThrow(); await requireManager(db, ctx.user.id, input.meetingId);
    await db.delete(pulseMeetingRocks).where(and(eq(pulseMeetingRocks.id, input.mappingId), eq(pulseMeetingRocks.meetingId, input.meetingId))); return { success: true };
  }),
  globalQuarterly: protectedProcedure.query(async ({ ctx }) => {
    const db = await dbOrThrow();
    const [profile] = await db.select({ platformRole: (await import("../../drizzle/schema")).pulseProfiles.platformRole }).from((await import("../../drizzle/schema")).pulseProfiles).where(eq((await import("../../drizzle/schema")).pulseProfiles.userId, ctx.user.id)).limit(1);
    if (profile?.platformRole !== "super_admin") throw new TRPCError({ code: "FORBIDDEN", message: "Quarterly Rocks is available to super admins only." });
    return db.select({ id: pulseWorkItems.id, title: pulseWorkItems.title, status: pulseWorkItems.status, percentComplete: pulseWorkItems.percentComplete, quarter: pulseWorkItems.quarter, meetingName: pulseMeetings.name, assigneeName: users.name }).from(pulseWorkItems).leftJoin(pulseMeetings, eq(pulseMeetings.id, pulseWorkItems.meetingId)).leftJoin(users, eq(users.id, pulseWorkItems.assigneeId)).where(and(eq(pulseWorkItems.type, "rock"), isNull(pulseWorkItems.deletedAt))).orderBy(asc(pulseWorkItems.quarter), asc(pulseWorkItems.title));
  }),
});
