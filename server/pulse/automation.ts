import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import {
  pulseMeetings,
  pulseNotifications,
  pulseWorkItemNotifications,
  pulseWorkItems,
  scheduledReportRuns,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { sendTransactionalEmail } from "../_core/resendEmail";
import { getPulseNotificationPreference } from "./notifications";

const OVERDUE_DIGEST_KEY = "pulse_overdue_digest";
let isDigestRunning = false;
let isQuarterRolloverRunning = false;

function easternDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] ?? character));
}

function quarterFrom(date = new Date()) {
  const eastern = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric", year: "numeric" }).formatToParts(date);
  const month = Number(eastern.find((part) => part.type === "month")?.value ?? 1);
  const year = Number(eastern.find((part) => part.type === "year")?.value ?? date.getUTCFullYear());
  return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
}

function quarterBefore(left: string | null, right: string) {
  if (!left) return false;
  const leftMatch = left.match(/^Q([1-4])\s(\d{4})$/);
  const rightMatch = right.match(/^Q([1-4])\s(\d{4})$/);
  if (!leftMatch || !rightMatch) return false;
  const leftValue = Number(leftMatch[2]) * 4 + Number(leftMatch[1]);
  const rightValue = Number(rightMatch[2]) * 4 + Number(rightMatch[1]);
  return leftValue < rightValue;
}

/**
 * Increment this only from the future meeting Run conclusion transaction. It is
 * intentionally exported now so a meeting cannot gain a hidden second source of
 * truth for carry-over counts.
 */
export async function recordPulseMeetingCarryOver(meetingId: string, concludedById: number) {
  const db = await getDb();
  if (!db) return { updated: 0 };
  const openTodos = await db.select({ id: pulseWorkItems.id, carriedOverCount: pulseWorkItems.carriedOverCount })
    .from(pulseWorkItems)
    .where(and(
      eq(pulseWorkItems.meetingId, meetingId),
      eq(pulseWorkItems.type, "todo"),
      eq(pulseWorkItems.status, "open"),
      isNull(pulseWorkItems.deletedAt),
    ));
  for (const todo of openTodos) {
    await db.update(pulseWorkItems).set({ carriedOverCount: todo.carriedOverCount + 1 }).where(eq(pulseWorkItems.id, todo.id));
  }
  return { updated: openTodos.length, concludedById };
}

export async function sendPulseOverdueDigest(reportDate = easternDate()) {
  if (isDigestRunning) return { status: "skipped", reason: "A Pulse overdue digest is already running." };
  isDigestRunning = true;
  try {
    const db = await getDb();
    if (!db) return { status: "skipped", reason: "Database unavailable." };

    const [existing] = await db.select().from(scheduledReportRuns).where(and(
      eq(scheduledReportRuns.reportKey, OVERDUE_DIGEST_KEY),
      eq(scheduledReportRuns.reportDate, reportDate),
    )).limit(1);
    if (existing) return { status: "skipped", reason: `Digest already ${existing.status} for ${reportDate}.` };

    try {
      await db.insert(scheduledReportRuns).values({ reportKey: OVERDUE_DIGEST_KEY, reportDate, status: "running" });
    } catch {
      return { status: "skipped", reason: "Digest was started by another process." };
    }

    const overdue = await db.select({
      id: pulseWorkItems.id,
      title: pulseWorkItems.title,
      dueDate: pulseWorkItems.dueDate,
      assigneeId: pulseWorkItems.assigneeId,
      meetingName: pulseMeetings.name,
      assigneeName: users.name,
      assigneeEmail: users.email,
    }).from(pulseWorkItems)
      .innerJoin(users, eq(users.id, pulseWorkItems.assigneeId))
      .leftJoin(pulseMeetings, eq(pulseMeetings.id, pulseWorkItems.meetingId))
      .where(and(
        eq(pulseWorkItems.type, "todo"),
        eq(pulseWorkItems.status, "open"),
        isNull(pulseWorkItems.deletedAt),
        lt(pulseWorkItems.dueDate, new Date(`${reportDate}T00:00:00.000Z`)),
      ));

    const byAssignee = new Map<number, typeof overdue>();
    for (const item of overdue) {
      if (!item.assigneeId || !item.assigneeEmail) continue;
      const list = byAssignee.get(item.assigneeId) ?? [];
      list.push(item);
      byAssignee.set(item.assigneeId, list);
    }

    let sent = 0;
    let failed = 0;
    for (const [assigneeId, items] of Array.from(byAssignee.entries())) {
      const first = items[0];
      const list = `<ul style="margin:0;padding-left:20px;">${items.map((item) => `<li style="margin:8px 0;"><strong>${escapeHtml(item.title)}</strong> — ${escapeHtml(item.meetingName ?? "Personal work")} · due ${escapeHtml(String(item.dueDate).slice(0, 10))}</li>`).join("")}</ul>`;
      const preference = await getPulseNotificationPreference(db, assigneeId, "overdue_digest");
      let delivered = false;
      if (preference.inApp) {
        await db.insert(pulseNotifications).values({ id: crypto.randomUUID(), personId: assigneeId, notificationType: "overdue", requiresAction: false, sourceType: "overdue_digest", sourceId: `${reportDate}:${assigneeId}`, meetingId: null, body: `${items.length} overdue Pulse item${items.length === 1 ? "" : "s"} need attention.` });
        delivered = true;
      }
      if (preference.email) {
        const result = await sendTransactionalEmail("overdue_digest", {
          recipientEmail: first.assigneeEmail!,
          recipientName: first.assigneeName ?? undefined,
          pulseOverdueCount: String(items.length),
          pulseOverdueList: list,
        }, { idempotencyKey: `pulse-overdue:${reportDate}:${assigneeId}` });
        if (result.sent || result.skipped) delivered = true;
        else failed += 1;
      }
      if (delivered) sent += 1;
    }

    await db.update(scheduledReportRuns).set({
      status: failed ? (sent ? "partial" : "failed") : "sent",
      recipientCount: byAssignee.size,
      successfulRecipientCount: sent,
      errorMessage: failed ? `${failed} Pulse overdue digest recipient(s) failed.` : null,
      completedAt: new Date(),
    }).where(and(eq(scheduledReportRuns.reportKey, OVERDUE_DIGEST_KEY), eq(scheduledReportRuns.reportDate, reportDate)));
    return { status: failed ? "partial" : "sent", recipients: byAssignee.size, successfulRecipients: sent };
  } finally {
    isDigestRunning = false;
  }
}

/** Creates one pending choice per unfinished rock after its quarter ends. */
export async function createPulseQuarterRolloverPrompts(options: { workItemIds?: string[] } = {}) {
  if (isQuarterRolloverRunning) return { created: 0, skipped: true };
  isQuarterRolloverRunning = true;
  try {
    const db = await getDb();
    if (!db) return { created: 0, skipped: true };
    const currentQuarter = quarterFrom();
    const candidateConditions: any[] = [
      eq(pulseWorkItems.type, "rock"),
      isNull(pulseWorkItems.deletedAt),
      or(eq(pulseWorkItems.status, "on_track"), eq(pulseWorkItems.status, "at_risk"), eq(pulseWorkItems.status, "off_track")),
    ];
    if (options.workItemIds?.length) candidateConditions.push(inArray(pulseWorkItems.id, options.workItemIds));
    const candidates = await db.select({ id: pulseWorkItems.id, quarter: pulseWorkItems.quarter, assigneeId: pulseWorkItems.assigneeId })
      .from(pulseWorkItems)
      .where(and(...candidateConditions));
    const priorRocks = candidates.filter((rock) => quarterBefore(rock.quarter, currentQuarter));
    if (!priorRocks.length) return { created: 0, skipped: false };

    const existing = await db.select({ workItemId: pulseWorkItemNotifications.workItemId })
      .from(pulseWorkItemNotifications)
      .where(and(
        eq(pulseWorkItemNotifications.notificationType, "quarter_rollover"),
        isNull(pulseWorkItemNotifications.deletedAt),
      ));
    const alreadyPrompted = new Set(existing.map((notification) => notification.workItemId));
    const toCreate = priorRocks.flatMap((rock) => rock.assigneeId != null && !alreadyPrompted.has(rock.id) ? [{
      id: crypto.randomUUID(),
      recipientId: rock.assigneeId,
      workItemId: rock.id,
      commentId: null,
      notificationType: "quarter_rollover" as const,
    }] : []);
    if (toCreate.length) await db.insert(pulseWorkItemNotifications).values(toCreate);
    return { created: toCreate.length, skipped: false };
  } finally {
    isQuarterRolloverRunning = false;
  }
}

export function schedulePulseWorkItemAutomation() {
  function millisecondsUntilEastern(hour: number, weekday?: number) {
    const now = new Date();
    const formatted = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", hour12: false }).formatToParts(now);
    const weekdayName = formatted.find((part) => part.type === "weekday")?.value ?? "Mon";
    const hourNow = Number(formatted.find((part) => part.type === "hour")?.value ?? 0);
    const daysByName: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const today = daysByName[weekdayName] ?? 1;
    let offset = weekday === undefined ? 0 : (weekday - today + 7) % 7;
    if (offset === 0 && hourNow >= hour) offset = weekday === undefined ? 1 : 7;
    // The small offset remains valid through DST because the interval resets after each run.
    return offset * 24 * 60 * 60 * 1000 + Math.max(0, hour - hourNow) * 60 * 60 * 1000;
  }

  const runWeeklyDigest = () => sendPulseOverdueDigest().catch((error) => console.error("[PulseAutomation] Overdue digest error:", error));
  const runQuarterPrompt = () => createPulseQuarterRolloverPrompts().catch((error) => console.error("[PulseAutomation] Quarter rollover error:", error));
  const digestDelay = millisecondsUntilEastern(8, 1); // Monday 8am Eastern
  console.log(`[PulseAutomation] Next weekly overdue digest scheduled in ${Math.round(digestDelay / 60000)} minutes.`);
  setTimeout(() => { runWeeklyDigest(); setInterval(runWeeklyDigest, 7 * 24 * 60 * 60 * 1000); }, digestDelay);

  const rolloverDelay = millisecondsUntilEastern(8);
  console.log(`[PulseAutomation] Next quarter-rollover check scheduled in ${Math.round(rolloverDelay / 60000)} minutes.`);
  setTimeout(() => { runQuarterPrompt(); setInterval(runQuarterPrompt, 24 * 60 * 60 * 1000); }, rolloverDelay);
}
