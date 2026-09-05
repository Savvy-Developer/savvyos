import crypto from "crypto";
import { and, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import {
  marketProfileSurveyInvitations,
  marketAgentAssignments,
  marketProfiles,
  users,
} from "../drizzle/schema";
import { generateMagicLinkUrl, sendTransactionalEmail } from "./_core/resendEmail";
import { getDb } from "./db";
import {
  addEasternDays,
  easternDateKey,
  easternDateTimeToUtc,
  getEasternTimeParts,
} from "./agentProductionReportScheduler";

type SurveyInvitationRow = {
  invitation: typeof marketProfileSurveyInvitations.$inferSelect;
  agent: Pick<typeof users.$inferSelect, "id" | "name" | "email" | "isActive" | "role">;
  market: Pick<typeof marketProfiles.$inferSelect, "id" | "name" | "state"> | null;
};

const SURVEY_PATH = "/market-profile-survey";
const MAX_REMINDERS = 5;
const SURVEY_INVITE_BATCH_SIZE = 100;
let reminderTimer: NodeJS.Timeout | undefined;
let startupTimer: NodeJS.Timeout | undefined;
let remindersRunning = false;

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function makeToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function marketLabel(market: SurveyInvitationRow["market"]): string {
  return market ? `${market.name}${market.state ? `, ${market.state}` : ""}` : "your market";
}

function firstSundayFollowUp(now = new Date()): Date {
  const eastern = getEasternTimeParts(now);
  const daysUntilSunday = (7 - ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(eastern.weekday)) % 7;
  let dateKey = addEasternDays(easternDateKey(eastern), daysUntilSunday);
  let scheduledAt = easternDateTimeToUtc(dateKey, 10, 15);

  // A launch after Sunday morning still gets one Sunday follow-up without waiting a full week.
  if (scheduledAt.getTime() <= now.getTime() + 30 * 60 * 1000) {
    scheduledAt = new Date(now.getTime() + 30 * 60 * 1000);
  }
  return scheduledAt;
}

/** Chooses a different weekday/time in the next reminder window and persists it. */
function rotatingWeeklyFollowUp(now = new Date()): Date {
  const eastern = getEasternTimeParts(now);
  const daysAhead = 6 + crypto.randomInt(0, 7); // 6–12 days after the last reminder
  const hour = 8 + crypto.randomInt(0, 10); // 8 AM–5 PM Eastern
  const minute = [5, 15, 25, 35, 45, 55][crypto.randomInt(0, 6)];
  return easternDateTimeToUtc(addEasternDays(easternDateKey(eastern), daysAhead), hour, minute);
}

async function sendSurveyMessage(
  row: SurveyInvitationRow,
  purpose: "initial" | "reminder",
  reminderNumber = 0,
): Promise<{ sent: boolean; skipped: boolean; reason?: string }> {
  if (!row.agent.email || !row.agent.isActive || row.agent.role !== "agent") {
    return { sent: false, skipped: true, reason: "Agent is inactive or has no email address." };
  }

  // The one-time magic link authenticates the user; the durable invitation ID is
  // safe to retain in the redirect because every survey procedure also confirms
  // that it belongs to the authenticated agent. This means older reminder links
  // continue to work after a newer reminder is delivered.
  const redirectPath = `${SURVEY_PATH}?invitation=${row.invitation.id}`;
  const surveyUrl = await generateMagicLinkUrl(row.agent.email, redirectPath);
  const delivery = await sendTransactionalEmail("market_profile_survey", {
    recipientEmail: row.agent.email,
    recipientName: row.agent.name ?? undefined,
    marketName: marketLabel(row.market),
    marketSurveyUrl: surveyUrl,
    marketSurveyReminderNumber: reminderNumber,
  }, {
    allowTemplateOverride: false,
    injectMagicLinks: false,
    idempotencyKey: `market-profile-survey:${purpose}:${row.invitation.id}:${purpose === "initial" ? "initial" : reminderNumber}`,
  });

  if (delivery.sent) {
    const db = await getDb();
    if (db) {
      await db.update(marketProfileSurveyInvitations)
        .set({ lastSentAt: new Date() })
        .where(eq(marketProfileSurveyInvitations.id, row.invitation.id));
    }
  }
  return delivery;
}

async function invitationRowsForAgentIds(agentIds: number[]): Promise<SurveyInvitationRow[]> {
  const db = await getDb();
  if (!db || !agentIds.length) return [];
  return db.select({
    invitation: marketProfileSurveyInvitations,
    agent: {
      id: users.id,
      name: users.name,
      email: users.email,
      isActive: users.isActive,
      role: users.role,
    },
    market: {
      id: marketProfiles.id,
      name: marketProfiles.name,
      state: marketProfiles.state,
    },
  }).from(marketProfileSurveyInvitations)
    .innerJoin(users, eq(marketProfileSurveyInvitations.agentId, users.id))
    .leftJoin(marketProfiles, eq(marketProfileSurveyInvitations.marketProfileId, marketProfiles.id))
    .where(inArray(marketProfileSurveyInvitations.agentId, agentIds));
}

/**
 * Creates individual invitations for all active agents and delivers only missing
 * initial sends. Existing draft/in-progress surveys keep their saved answers.
 */
export async function launchMarketProfileSurveyCampaign(): Promise<{
  created: number;
  sent: number;
  skippedCompleted: number;
  failed: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const assignments = await db.select({
    id: users.id,
    marketProfileId: marketAgentAssignments.marketProfileId,
    isPrimary: marketAgentAssignments.isPrimary,
  }).from(users)
    .innerJoin(marketAgentAssignments, eq(marketAgentAssignments.agentId, users.id))
    .where(and(
      eq(users.role, "agent"),
      eq(users.isActive, true),
      eq(marketAgentAssignments.isAvailable, true),
    ));
  // An agent can support several markets, but each person receives one
  // resumable survey. Prefer the assignment marked primary and fall back to the
  // first available assignment so every current Agent Market is represented.
  const agentMarkets = new Map<number, { id: number; marketProfileId: number; isPrimary: boolean | null }>();
  for (const assignment of assignments) {
    const current = agentMarkets.get(assignment.id);
    if (!current || (assignment.isPrimary && !current.isPrimary)) agentMarkets.set(assignment.id, assignment);
  }
  const agents = Array.from(agentMarkets.values());
  const existing = agents.length
    ? await db.select().from(marketProfileSurveyInvitations)
      .where(inArray(marketProfileSurveyInvitations.agentId, agents.map(agent => agent.id)))
    : [];
  const byAgentId = new Map(existing.map(invitation => [invitation.agentId, invitation]));
  let created = 0;
  let skippedCompleted = 0;
  const pendingIds: number[] = [];

  for (const agent of agents) {
    const current = byAgentId.get(agent.id);
    if (current?.status === "completed") {
      skippedCompleted += 1;
      continue;
    }
    if (!current) {
      const token = makeToken();
      const [result] = await db.insert(marketProfileSurveyInvitations).values({
        agentId: agent.id,
        marketProfileId: agent.marketProfileId ?? null,
        surveyTokenHash: tokenHash(token),
        status: "pending",
      });
      pendingIds.push(Number((result as any).insertId));
      created += 1;
    } else if (!current.initialSentAt) {
      if (!current.marketProfileId && agent.marketProfileId) {
        await db.update(marketProfileSurveyInvitations)
          .set({ marketProfileId: agent.marketProfileId })
          .where(eq(marketProfileSurveyInvitations.id, current.id));
      }
      pendingIds.push(current.id);
    }
  }

  let sent = 0;
  let failed = 0;
  for (let start = 0; start < pendingIds.length; start += SURVEY_INVITE_BATCH_SIZE) {
    const rows = await invitationRowsForAgentIds(
      (await db.select({ agentId: marketProfileSurveyInvitations.agentId })
        .from(marketProfileSurveyInvitations)
        .where(inArray(marketProfileSurveyInvitations.id, pendingIds.slice(start, start + SURVEY_INVITE_BATCH_SIZE))))
        .map(row => row.agentId),
    );
    for (const row of rows) {
      const delivery = await sendSurveyMessage(row, "initial");
      if (delivery.sent) {
        sent += 1;
        await db.update(marketProfileSurveyInvitations).set({
          initialSentAt: new Date(),
          nextReminderAt: firstSundayFollowUp(),
        }).where(eq(marketProfileSurveyInvitations.id, row.invitation.id));
      } else {
        failed += 1;
        console.warn("[MarketProfileSurvey] Initial invitation was not sent", {
          invitationId: row.invitation.id,
          reason: delivery.reason,
        });
      }
    }
  }

  return { created, sent, skippedCompleted, failed };
}

/** Processes the Sunday follow-up and four later rotating weekly reminders. */
export async function processMarketProfileSurveyReminders(): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  if (remindersRunning) return { processed: 0, sent: 0, failed: 0 };
  remindersRunning = true;
  try {
    const db = await getDb();
    if (!db) return { processed: 0, sent: 0, failed: 0 };
    const now = new Date();
    const due = await db.select({
      invitation: marketProfileSurveyInvitations,
      agent: {
        id: users.id,
        name: users.name,
        email: users.email,
        isActive: users.isActive,
        role: users.role,
      },
      market: {
        id: marketProfiles.id,
        name: marketProfiles.name,
        state: marketProfiles.state,
      },
    }).from(marketProfileSurveyInvitations)
      .innerJoin(users, eq(marketProfileSurveyInvitations.agentId, users.id))
      .leftJoin(marketProfiles, eq(marketProfileSurveyInvitations.marketProfileId, marketProfiles.id))
      .where(and(
        inArray(marketProfileSurveyInvitations.status, ["pending", "in_progress"]),
        isNotNull(marketProfileSurveyInvitations.nextReminderAt),
        lte(marketProfileSurveyInvitations.nextReminderAt, now),
        lte(marketProfileSurveyInvitations.reminderCount, MAX_REMINDERS - 1),
        eq(users.role, "agent"),
        eq(users.isActive, true),
      ))
      .limit(50);

    let sent = 0;
    let failed = 0;
    for (const row of due as SurveyInvitationRow[]) {
      const nextReminderNumber = row.invitation.reminderCount + 1;
      const delivery = await sendSurveyMessage(row, "reminder", nextReminderNumber);
      if (delivery.sent) sent += 1;
      else failed += 1;
      const nextReminderAt = nextReminderNumber >= MAX_REMINDERS
        ? null
        : rotatingWeeklyFollowUp(new Date());
      await db.update(marketProfileSurveyInvitations).set({
        reminderCount: nextReminderNumber,
        nextReminderAt,
      }).where(and(
        eq(marketProfileSurveyInvitations.id, row.invitation.id),
        isNull(marketProfileSurveyInvitations.completedAt),
      ));
    }
    return { processed: due.length, sent, failed };
  } finally {
    remindersRunning = false;
  }
}

export function scheduleMarketProfileSurveyReminders(): void {
  if (reminderTimer) clearInterval(reminderTimer);
  if (startupTimer) clearTimeout(startupTimer);
  reminderTimer = setInterval(() => {
    void processMarketProfileSurveyReminders().catch(error =>
      console.error("[MarketProfileSurvey] Reminder scheduler error:", error),
    );
  }, 5 * 60 * 1000);
  startupTimer = setTimeout(() => {
    void processMarketProfileSurveyReminders().catch(error =>
      console.error("[MarketProfileSurvey] Startup reminder check error:", error),
    );
  }, 20_000);
}
