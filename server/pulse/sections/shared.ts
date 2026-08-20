import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { pulseMeetingUpdates, pulseScorecardEntries, pulseScorecardMetrics, users } from "../../../drizzle/schema";
import { require_visible_meeting } from "../access";
import { getMeetingCascadePayloads } from "../cascadePayload";
import { listAccessibleItems } from "../workItems";

export type SectionKey = "segue" | "headlines" | "scorecard" | "goals" | "rocks" | "todos" | "issues" | "cascading" | "conclude";
export type SectionContext = { db: any; viewerId: number; meeting: any };

export async function visibleSectionContext(db: any, viewerId: number, meetingId: string): Promise<SectionContext> {
  const meeting = await require_visible_meeting(db, viewerId, meetingId);
  return { db, viewerId, meeting };
}

export function disabled(section: SectionKey) { return { section, enabled: false, meta: {}, items: [] as any[] }; }
export function enabled(section: SectionKey, meta: Record<string, unknown>, items: any[]) { return { section, enabled: true, meta, items }; }
export async function meetingItems(ctx: SectionContext, type: "todo" | "issue" | "rock") {
  return listAccessibleItems(ctx.db, ctx.viewerId, { meetingId: ctx.meeting.id, type });
}

export async function meetingUpdates(ctx: SectionContext, updateType: "segue" | "headline") {
  return ctx.db.select({ id: pulseMeetingUpdates.id, body: pulseMeetingUpdates.body, authorId: pulseMeetingUpdates.authorId, authorName: users.name, createdAt: pulseMeetingUpdates.createdAt })
    .from(pulseMeetingUpdates).leftJoin(users, eq(users.id, pulseMeetingUpdates.authorId))
    .where(and(eq(pulseMeetingUpdates.meetingId, ctx.meeting.id), eq(pulseMeetingUpdates.updateType, updateType), isNull(pulseMeetingUpdates.deletedAt)))
    .orderBy(desc(pulseMeetingUpdates.createdAt));
}

export async function scorecard(ctx: SectionContext) {
  const rows = await ctx.db.select({ id: pulseScorecardMetrics.id, title: pulseScorecardMetrics.title, targetValue: pulseScorecardMetrics.targetValue, ownerId: pulseScorecardMetrics.ownerId, sortOrder: pulseScorecardMetrics.sortOrder, value: pulseScorecardEntries.value, entryPersonId: pulseScorecardEntries.personId, entryId: pulseScorecardEntries.id })
    .from(pulseScorecardMetrics).leftJoin(pulseScorecardEntries, and(eq(pulseScorecardEntries.metricId, pulseScorecardMetrics.id), eq(pulseScorecardEntries.personId, ctx.viewerId), isNull(pulseScorecardEntries.deletedAt)))
    .where(and(eq(pulseScorecardMetrics.meetingId, ctx.meeting.id), isNull(pulseScorecardMetrics.deletedAt))).orderBy(asc(pulseScorecardMetrics.sortOrder));
  return rows;
}

export async function cascades(ctx: SectionContext) {
  return getMeetingCascadePayloads(ctx.db, ctx.viewerId, ctx.meeting.id);
}
