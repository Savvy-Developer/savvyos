import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  lt,
  sql,
} from "drizzle-orm";
import { aliasedTable } from "drizzle-orm";
import {
  coachingFeedbackInvitations,
  coachingFeedbackResponses,
  coachingFeedbackSettings,
  coachingSessions,
  scheduledReportRuns,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { sendTransactionalEmail } from "./_core/resendEmail";
import {
  addEasternDays,
  easternDateKey,
  easternDateTimeToUtc,
  getEasternTimeParts,
} from "./agentProductionReportScheduler";

const APP_URL = process.env.PUBLIC_APP_URL || "https://os.savvy-agents.com";
const EASTERN_TIME_ZONE = "America/New_York";
const INVITATION_DELAY_MS = 60 * 60 * 1000;
const INVITATION_TTL_MS = 21 * 24 * 60 * 60 * 1000;
const PUBLIC_TOKEN_MIN_LENGTH = 48;
const STALE_RUN_MS = 60 * 60 * 1000;
const FRIDAY_INDEX = 5;
const WEEKLY_REPORT_HOUR = 20;
const LIVE_REPORT_KEY = "coaching_feedback_weekly";

/** The named leaders who may access company-wide anonymous feedback. */
export const COACH_FEEDBACK_LEADERSHIP_EMAILS = [
  "tyler@savvy.realty",
  "philleone@savvy.realty",
  "elana@savvy.realty",
  "dyl@savvy.realty",
] as const;

const publicSubmissionAttempts = new Map<string, { count: number; resetAt: number }>();

type SessionStatus = "Scheduled" | "In Progress" | "Completed" | "Canceled" | "No Show";

type FeedbackInvitationCandidate = {
  session: {
    id: number;
    agentId: number;
    scheduledCoachId: number | null;
    sessionDate: Date | null;
    sessionType: string;
    status: SessionStatus;
  };
  agent: { id: number; name: string | null; email: string | null };
  coach: { id: number; name: string | null; email: string | null };
};

export type CoachFeedbackAggregate = {
  coachId: number;
  coachName: string;
  coachEmail: string | null;
  responseCount: number;
  overallAverage: number | null;
  prioritiesAverage: number | null;
  clarityAverage: number | null;
  supportAverage: number | null;
  comments: Array<{ helpful: string | null; improvement: string | null; additional: string | null }>;
};

export type WeeklyCoachFeedbackReport = {
  weekStart: string;
  periodLabel: string;
  aggregates: CoachFeedbackAggregate[];
  leadershipRecipients: Array<{ id: number; name: string; email: string }>;
  overall: {
    responseCount: number;
    overallAverage: number | null;
    prioritiesAverage: number | null;
    clarityAverage: number | null;
    supportAverage: number | null;
  };
};

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createPublicToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function clampAverage(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 10) / 10 : null;
}

function weekdayIndex(weekday: string): number {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

function currentEasternWeekStart(asOf = new Date()): string {
  const eastern = getEasternTimeParts(asOf);
  const daysSinceMonday = (weekdayIndex(eastern.weekday) - 1 + 7) % 7;
  return addEasternDays(easternDateKey(eastern), -daysSinceMonday);
}

function easternWeekStartForSession(sessionDate: Date): string {
  return currentEasternWeekStart(sessionDate);
}

function formatPeriodLabel(weekStart: string): string {
  const start = easternDateTimeToUtc(weekStart, 0, 0, 0);
  const friday = easternDateTimeToUtc(addEasternDays(weekStart, 4), 20, 0, 0);
  const startLabel = new Intl.DateTimeFormat("en-US", { timeZone: EASTERN_TIME_ZONE, month: "short", day: "numeric" }).format(start);
  const endLabel = new Intl.DateTimeFormat("en-US", { timeZone: EASTERN_TIME_ZONE, month: "short", day: "numeric", year: "numeric" }).format(friday);
  return `${startLabel}–${endLabel}`;
}

/**
 * MySQL stores `sessionWeekStart` as a calendar DATE. Bind each boundary as
 * UTC midnight for that calendar date rather than Eastern midnight, whose UTC
 * offset can exclude the intended DATE value.
 */
export function getCoachFeedbackWeekDateRange(weekStart: string): { start: Date; endExclusive: Date } {
  const toUtcCalendarDate = (dateKey: string) => new Date(`${dateKey}T00:00:00.000Z`);
  return {
    start: toUtcCalendarDate(weekStart),
    endExclusive: toUtcCalendarDate(addEasternDays(weekStart, 7)),
  };
}

function formatSessionDate(sessionDate: Date | null): string {
  if (!sessionDate) return "your recent coaching session";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(sessionDate);
}

export function checkPublicCoachFeedbackSubmissionRateLimit(ip: string): void {
  const now = Date.now();
  const current = publicSubmissionAttempts.get(ip);
  if (!current || current.resetAt <= now) {
    publicSubmissionAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return;
  }
  if (current.count >= 12) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Please wait a few minutes before trying again." });
  }
  current.count += 1;
}

export function getCoachFeedbackRequestIp(ctx: { req: any }): string {
  return (ctx.req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? ctx.req.socket?.remoteAddress
    ?? "unknown";
}

function renderCoachFeedbackInvitationEmail(params: {
  recipientName: string;
  coachName: string;
  sessionDate: Date | null;
  feedbackUrl: string;
  isTest: boolean;
}): string {
  const testBanner = params.isTest
    ? `<div style="margin:0 0 18px;padding:11px 14px;border:1px solid #0EA5E9;border-radius:8px;background:#F0F9FF;font-size:12px;line-height:1.5;color:#0C4A6E;"><strong>Test delivery only.</strong> Your response will not appear in any live coaching-feedback report.</div>`
    : "";
  return `${testBanner}
    <h1 style="margin:0 0 6px;font-size:22px;line-height:1.3;color:#0A0A0A;letter-spacing:-.2px;">How was your coaching session?</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">A short reflection on your ${escapeHtml(formatSessionDate(params.sessionDate))} session with ${escapeHtml(params.coachName)} will help Savvy STR Agents strengthen coaching.</p>
    <div style="margin:0 0 20px;padding:16px 18px;border:1px solid #A5F3FC;border-left:4px solid #0FC0DF;border-radius:8px;background:#ECFEFF;">
      <p style="margin:0 0 7px;font-size:14px;font-weight:800;color:#0F172A;">Your feedback is fully anonymous.</p>
      <p style="margin:0;font-size:13px;line-height:1.55;color:#334155;">Your name and email are never stored with your answers. Leadership, your coach, and anyone viewing feedback cannot see who submitted it or connect your answers to a specific coaching session. Coaches receive only a weekly aggregate, not immediate individual feedback.</p>
    </div>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#374151;">This takes about two minutes. Please share candid feedback about the value, focus, clarity, and support you experienced.</p>
    <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 0 18px;"><tr><td style="background:#0FC0DF;border-radius:7px;"><a href="${escapeHtml(params.feedbackUrl)}" style="display:inline-block;padding:13px 22px;color:#0A0A0A;font-size:14px;font-weight:800;text-decoration:none;">Share anonymous feedback</a></td></tr></table>
    <p style="margin:0;font-size:12px;line-height:1.55;color:#64748B;">This private link accepts one response and expires in 21 days. Please do not include your name or any details that could identify you in the written responses.</p>`;
}

function renderCoachWeeklyEmail(aggregate: CoachFeedbackAggregate, report: WeeklyCoachFeedbackReport): string {
  const metrics = [
    ["Overall value", aggregate.overallAverage],
    ["Business priorities", aggregate.prioritiesAverage],
    ["Next-step clarity", aggregate.clarityAverage],
    ["Felt supported", aggregate.supportAverage],
  ].map(([label, average]) => `<td style="width:25%;padding:10px 7px;border:1px solid #E5E7EB;text-align:center;vertical-align:top;"><div style="font-size:20px;font-weight:800;color:#0F172A;">${average === null ? "—" : `${average}/5`}</div><div style="margin-top:4px;font-size:10px;line-height:1.25;color:#64748B;">${label}</div></td>`).join("");
  const comments = aggregate.comments.flatMap((comment) => [
    comment.helpful ? { label: "Most helpful", text: comment.helpful } : null,
    comment.improvement ? { label: "More valuable if", text: comment.improvement } : null,
    comment.additional ? { label: "Additional context", text: comment.additional } : null,
  ]).filter(Boolean) as Array<{ label: string; text: string }>;
  const commentHtml = comments.length
    ? comments.map((comment) => `<div style="margin:0 0 10px;padding:12px 14px;background:#F8FAFC;border-left:3px solid #0FC0DF;border-radius:6px;"><div style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:.2px;color:#0891B2;">${escapeHtml(comment.label)}</div><div style="font-size:13px;line-height:1.55;color:#334155;white-space:pre-wrap;">${escapeHtml(comment.text)}</div></div>`).join("")
    : `<p style="margin:0;font-size:13px;line-height:1.5;color:#64748B;">No written comments were submitted in this reporting period.</p>`;

  return `<h1 style="margin:0 0 6px;font-size:22px;line-height:1.3;color:#0A0A0A;letter-spacing:-.2px;">Your anonymous coaching feedback</h1>
    <p style="margin:0 0 18px;font-size:13px;font-weight:600;color:#64748B;">${escapeHtml(report.periodLabel)} &nbsp;·&nbsp; Weekly aggregate</p>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#374151;">This weekly snapshot combines anonymous coaching feedback. It does not include agent names, email addresses, session details, response timing, or any technical identifier that can connect a response to an agent.</p>
    <div style="margin:0 0 18px;padding:12px 14px;border:1px solid #A5F3FC;border-radius:8px;background:#ECFEFF;font-size:13px;line-height:1.55;color:#164E63;"><strong>${aggregate.responseCount} response${aggregate.responseCount === 1 ? "" : "s"}</strong> were included. Feedback is delivered only in this weekly aggregate so you do not see immediate individual submissions.</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;margin:0 0 22px;"><tr>${metrics}</tr></table>
    <h2 style="margin:0 0 9px;font-size:16px;color:#0F172A;">Anonymous written feedback</h2>
    ${commentHtml}
    <p style="margin:18px 0 0;font-size:11px;line-height:1.5;color:#64748B;">Use this only as an aggregate learning signal. Do not attempt to identify a respondent from their feedback.</p>`;
}

function renderLeadershipWeeklyEmail(report: WeeklyCoachFeedbackReport): string {
  const rows = report.aggregates.length
    ? report.aggregates.map((aggregate) => `<tr><td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#0F172A;">${escapeHtml(aggregate.coachName)}</td><td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:13px;color:#334155;">${aggregate.responseCount}</td><td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:13px;color:#334155;">${aggregate.overallAverage === null ? "—" : `${aggregate.overallAverage}/5`}</td><td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:13px;color:#334155;">${aggregate.prioritiesAverage === null ? "—" : `${aggregate.prioritiesAverage}/5`}</td><td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:13px;color:#334155;">${aggregate.clarityAverage === null ? "—" : `${aggregate.clarityAverage}/5`}</td><td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:13px;color:#334155;">${aggregate.supportAverage === null ? "—" : `${aggregate.supportAverage}/5`}</td></tr>`).join("")
    : `<tr><td colspan="6" style="padding:16px 8px;font-size:13px;color:#64748B;text-align:center;">No coaching sessions were included this week.</td></tr>`;

  return `<h1 style="margin:0 0 6px;font-size:22px;line-height:1.3;color:#0A0A0A;letter-spacing:-.2px;">Coach feedback — weekly aggregate</h1>
    <p style="margin:0 0 18px;font-size:13px;font-weight:600;color:#64748B;">${escapeHtml(report.periodLabel)}</p>
    <div style="margin:0 0 18px;padding:12px 14px;border:1px solid #A5F3FC;border-radius:8px;background:#ECFEFF;font-size:13px;line-height:1.55;color:#164E63;"><strong>Anonymous by design.</strong> This report contains only aggregate feedback. It never includes agent names, emails, session details, response timing, or any identifier that can connect an answer to a person.</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 0 18px;"><tr><td style="padding:12px;border:1px solid #E5E7EB;border-radius:8px;text-align:center;"><div style="font-size:23px;font-weight:800;color:#0F172A;">${report.overall.responseCount}</div><div style="margin-top:3px;font-size:11px;color:#64748B;">Responses</div></td><td style="padding:12px;border:1px solid #E5E7EB;border-radius:8px;text-align:center;"><div style="font-size:23px;font-weight:800;color:#0F172A;">${report.overall.overallAverage === null ? "—" : `${report.overall.overallAverage}/5`}</div><div style="margin-top:3px;font-size:11px;color:#64748B;">Overall value</div></td><td style="padding:12px;border:1px solid #E5E7EB;border-radius:8px;text-align:center;"><div style="font-size:23px;font-weight:800;color:#0F172A;">${report.overall.clarityAverage === null ? "—" : `${report.overall.clarityAverage}/5`}</div><div style="margin-top:3px;font-size:11px;color:#64748B;">Next-step clarity</div></td></tr></table>
    <h2 style="margin:0 0 8px;font-size:16px;color:#0F172A;">By coach</h2>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;margin:0 0 20px;"><tr style="background:#0F172A;"><th style="padding:9px 8px;text-align:left;font-size:10px;color:#FFFFFF;">Coach</th><th style="padding:9px 8px;text-align:center;font-size:10px;color:#FFFFFF;">Responses</th><th style="padding:9px 8px;text-align:center;font-size:10px;color:#FFFFFF;">Value</th><th style="padding:9px 8px;text-align:center;font-size:10px;color:#FFFFFF;">Priorities</th><th style="padding:9px 8px;text-align:center;font-size:10px;color:#FFFFFF;">Clarity</th><th style="padding:9px 8px;text-align:center;font-size:10px;color:#FFFFFF;">Support</th></tr>${rows}</table>
    <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td style="background:#0FC0DF;border-radius:7px;"><a href="https://os.savvy-agents.com/coach-feedback" style="display:inline-block;padding:12px 20px;color:#0A0A0A;font-size:13px;font-weight:800;text-decoration:none;">Open Coach feedback</a></td></tr></table>
    <p style="margin:18px 0 0;font-size:11px;line-height:1.5;color:#64748B;">Use this feedback only as an aggregate learning signal. Do not attempt to identify a respondent from scores or comments.</p>`;
}

async function createAndSendInvitation(candidate: FeedbackInvitationCandidate, recipientEmail: string, recipientName: string, isTest: boolean): Promise<{ sent: boolean; feedbackUrl: string; reason?: string }> {
  const db = await getDb();
  if (!db || !candidate.session.sessionDate) return { sent: false, feedbackUrl: "", reason: "Database or session data unavailable" };

  const token = createPublicToken();
  const feedbackUrl = `${APP_URL}/coach-feedback/survey?token=${token}`;
  let invitationId = 0;
  try {
    const [inserted] = await db.insert(coachingFeedbackInvitations).values({
      sessionId: candidate.session.id,
      agentId: candidate.agent.id,
      coachId: candidate.coach.id,
      recipientEmail: recipientEmail.trim().toLowerCase(),
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      isTest,
    });
    invitationId = Number((inserted as any).insertId);
  } catch (error) {
    return { sent: false, feedbackUrl, reason: "An invitation already exists for this session." };
  }

  const delivery = await sendTransactionalEmail("coaching_feedback_invitation", {
    recipientEmail: recipientEmail.trim().toLowerCase(),
    recipientName,
    coachFeedbackSubject: `${isTest ? "TEST — " : ""}${(isTest ? recipientName : candidate.agent.name?.trim()) || "Agent"}, feedback on your coaching session today with ${candidate.coach.name?.trim() || "your coach"}?`,
    coachFeedbackHtml: renderCoachFeedbackInvitationEmail({
      recipientName,
      coachName: candidate.coach.name?.trim() || "your coach",
      sessionDate: candidate.session.sessionDate,
      feedbackUrl,
      isTest,
    }),
  }, {
    allowTemplateOverride: false,
    injectMagicLinks: false,
    bypassNotificationSetting: isTest,
    idempotencyKey: `coaching-feedback-invitation:${isTest ? "test:" : ""}${candidate.session.id}`,
  });

  if (delivery.sent) {
    await db.update(coachingFeedbackInvitations).set({ sentAt: new Date() })
      .where(eq(coachingFeedbackInvitations.id, invitationId));
    return { sent: true, feedbackUrl };
  }

  // A delivery that never left SavvyOS must not block the next scheduler pass.
  await db.delete(coachingFeedbackInvitations).where(eq(coachingFeedbackInvitations.id, invitationId));
  return { sent: false, feedbackUrl, reason: delivery.reason ?? "Email delivery was not accepted." };
}

async function getEligibleInvitationCandidates(now: Date, activationTime: Date): Promise<FeedbackInvitationCandidate[]> {
  const db = await getDb();
  if (!db) return [];
  const agent = aliasedTable(users, "coachFeedbackAgent");
  const coach = aliasedTable(users, "coachFeedbackCoach");
  const cutoff = new Date(now.getTime() - INVITATION_DELAY_MS);

  return db.select({
    session: {
      id: coachingSessions.id,
      agentId: coachingSessions.agentId,
      scheduledCoachId: coachingSessions.scheduledCoachId,
      sessionDate: coachingSessions.sessionDate,
      sessionType: coachingSessions.sessionType,
      status: coachingSessions.status,
    },
    agent: { id: agent.id, name: agent.name, email: agent.email },
    coach: { id: coach.id, name: coach.name, email: coach.email },
  })
    .from(coachingSessions)
    .innerJoin(agent, eq(coachingSessions.agentId, agent.id))
    .innerJoin(coach, eq(coachingSessions.scheduledCoachId, coach.id))
    .leftJoin(coachingFeedbackInvitations, eq(coachingFeedbackInvitations.sessionId, coachingSessions.id))
    .where(and(
      isNull(coachingFeedbackInvitations.id),
      isNotNull(coachingSessions.sessionDate),
      isNotNull(coachingSessions.scheduledCoachId),
      gte(coachingSessions.sessionDate, activationTime),
      lte(coachingSessions.sessionDate, cutoff),
      inArray(coachingSessions.status, ["Scheduled", "In Progress", "Completed"]),
      eq(agent.isActive, true),
      isNotNull(agent.email),
    ))
    .orderBy(asc(coachingSessions.sessionDate))
    .limit(100) as Promise<FeedbackInvitationCandidate[]>;
}

/**
 * Scheduler entry point. The first live pass sets an activation boundary and does
 * not back-send surveys for historic sessions. Later passes send once a session is
 * one hour past its scheduled time, unless it has been canceled or marked no-show.
 */
export async function processDueCoachingFeedbackInvitations(now = new Date()): Promise<{ sent: number; skipped: number; activated: boolean }> {
  const db = await getDb();
  if (!db) return { sent: 0, skipped: 0, activated: false };
  const settings = await db.select().from(coachingFeedbackSettings).orderBy(asc(coachingFeedbackSettings.id)).limit(1);
  if (!settings[0]) {
    await db.insert(coachingFeedbackSettings).values({ automationStartedAt: now });
    console.info("[CoachFeedback] Automation activated; historic coaching sessions will not receive retrospective surveys.");
    return { sent: 0, skipped: 0, activated: true };
  }

  const candidates = await getEligibleInvitationCandidates(now, settings[0].automationStartedAt);
  let sent = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    if (!candidate.agent.email) {
      skipped += 1;
      continue;
    }
    const delivery = await createAndSendInvitation(
      candidate,
      candidate.agent.email,
      candidate.agent.name?.trim() || "there",
      false,
    );
    if (delivery.sent) sent += 1;
    else skipped += 1;
  }
  if (sent || skipped) console.info(`[CoachFeedback] Due invitation pass: ${sent} sent, ${skipped} skipped.`);
  return { sent, skipped, activated: false };
}

export async function getPublicCoachFeedback(token: string): Promise<{ status: "ready" | "submitted" | "invalid"; isTest?: boolean }> {
  const db = await getDb();
  if (!db) return { status: "invalid" };
  const [invitation] = await db.select({
    expiresAt: coachingFeedbackInvitations.expiresAt,
    submittedAt: coachingFeedbackInvitations.submittedAt,
    isTest: coachingFeedbackInvitations.isTest,
  })
    .from(coachingFeedbackInvitations)
    .where(eq(coachingFeedbackInvitations.tokenHash, tokenHash(token)))
    .limit(1);
  if (!invitation || invitation.expiresAt < new Date()) return { status: "invalid" };
  if (invitation.submittedAt) return { status: "submitted", isTest: invitation.isTest };
  return { status: "ready", isTest: invitation.isTest };
}

export async function submitPublicCoachFeedback(input: {
  token: string;
  overallRating: number;
  prioritiesRating: number;
  clarityRating: number;
  supportRating: number;
  helpfulComment?: string;
  improvementComment?: string;
  additionalComment?: string;
}): Promise<{ status: "submitted" }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The feedback form is temporarily unavailable." });

  const now = new Date();
  const [invitation] = await db.select({
    id: coachingFeedbackInvitations.id,
    coachId: coachingFeedbackInvitations.coachId,
    isTest: coachingFeedbackInvitations.isTest,
    sessionDate: coachingSessions.sessionDate,
  })
    .from(coachingFeedbackInvitations)
    .innerJoin(coachingSessions, eq(coachingFeedbackInvitations.sessionId, coachingSessions.id))
    .where(and(
      eq(coachingFeedbackInvitations.tokenHash, tokenHash(input.token)),
      isNull(coachingFeedbackInvitations.submittedAt),
      gte(coachingFeedbackInvitations.expiresAt, now),
    ))
    .limit(1);

  if (!invitation?.sessionDate) {
    throw new TRPCError({ code: "NOT_FOUND", message: "This feedback link is invalid, expired, or has already been used." });
  }
  const sessionDate = invitation.sessionDate;

  await db.transaction(async (tx) => {
    const updateResult = await tx.update(coachingFeedbackInvitations)
      .set({ submittedAt: now })
      .where(and(eq(coachingFeedbackInvitations.id, invitation.id), isNull(coachingFeedbackInvitations.submittedAt)));
    if (Number((updateResult as any)[0]?.affectedRows ?? (updateResult as any).affectedRows ?? 0) !== 1) {
      throw new TRPCError({ code: "CONFLICT", message: "This feedback link has already been used." });
    }

    // This insert intentionally carries no invitation, session, agent, email, IP, or invitation identifier.
    // `submittedAt` is restricted to the authorized Coach feedback admin history at Tyler's request.
    await tx.insert(coachingFeedbackResponses).values({
      coachId: invitation.coachId,
      sessionWeekStart: easternDateTimeToUtc(easternWeekStartForSession(sessionDate), 0, 0, 0),
      overallRating: input.overallRating,
      prioritiesRating: input.prioritiesRating,
      clarityRating: input.clarityRating,
      supportRating: input.supportRating,
      helpfulComment: input.helpfulComment?.trim() || null,
      improvementComment: input.improvementComment?.trim() || null,
      additionalComment: input.additionalComment?.trim() || null,
      isTest: invitation.isTest,
      submittedAt: now,
    });
  });

  return { status: "submitted" };
}

async function getLeadershipRecipients(): Promise<Array<{ id: number; name: string; email: string }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(inArray(users.email, [...COACH_FEEDBACK_LEADERSHIP_EMAILS]), eq(users.isActive, true), isNotNull(users.email)));
  const byEmail = new Map(rows.map((row) => [row.email!.toLowerCase(), row]));
  return COACH_FEEDBACK_LEADERSHIP_EMAILS.flatMap((email) => {
    const user = byEmail.get(email);
    return user ? [{ id: user.id, name: user.name?.trim() || email, email }] : [];
  });
}

async function getCoachRosterForWeek(weekStart: string, endExclusive: Date): Promise<Array<{ id: number; name: string; email: string | null }>> {
  const db = await getDb();
  if (!db) return [];
  const start = easternDateTimeToUtc(weekStart, 0, 0, 0);
  const rows = await db.selectDistinct({ id: users.id, name: users.name, email: users.email })
    .from(coachingSessions)
    .innerJoin(users, eq(coachingSessions.scheduledCoachId, users.id))
    .where(and(
      gte(coachingSessions.sessionDate, start),
      lt(coachingSessions.sessionDate, endExclusive),
      inArray(coachingSessions.status, ["Scheduled", "In Progress", "Completed"]),
      eq(users.isActive, true),
    ));
  return rows.map((row) => ({ id: row.id, name: row.name?.trim() || "Coach", email: row.email }));
}

async function getAggregatesForWeek(weekStart: string, roster: Array<{ id: number; name: string; email: string | null }>): Promise<CoachFeedbackAggregate[]> {
  const db = await getDb();
  if (!db) return [];
  const { start, endExclusive } = getCoachFeedbackWeekDateRange(weekStart);
  const grouped = await db.select({
    coachId: coachingFeedbackResponses.coachId,
    responseCount: sql<number>`COUNT(*)`,
    overallAverage: sql<number>`AVG(${coachingFeedbackResponses.overallRating})`,
    prioritiesAverage: sql<number>`AVG(${coachingFeedbackResponses.prioritiesRating})`,
    clarityAverage: sql<number>`AVG(${coachingFeedbackResponses.clarityRating})`,
    supportAverage: sql<number>`AVG(${coachingFeedbackResponses.supportRating})`,
  })
    .from(coachingFeedbackResponses)
    .where(and(
      gte(coachingFeedbackResponses.sessionWeekStart, start),
      lt(coachingFeedbackResponses.sessionWeekStart, endExclusive),
      eq(coachingFeedbackResponses.isTest, false),
    ))
    .groupBy(coachingFeedbackResponses.coachId);

  const comments = await db.select({
    coachId: coachingFeedbackResponses.coachId,
    helpful: coachingFeedbackResponses.helpfulComment,
    improvement: coachingFeedbackResponses.improvementComment,
    additional: coachingFeedbackResponses.additionalComment,
  })
    .from(coachingFeedbackResponses)
    .where(and(
      gte(coachingFeedbackResponses.sessionWeekStart, start),
      lt(coachingFeedbackResponses.sessionWeekStart, endExclusive),
      eq(coachingFeedbackResponses.isTest, false),
    ))
    .orderBy(desc(coachingFeedbackResponses.id));

  const responseByCoach = new Map(grouped.map((row) => [row.coachId, row]));
  const commentsByCoach = new Map<number, Array<{ helpful: string | null; improvement: string | null; additional: string | null }>>();
  for (const comment of comments) {
    const hasText = [comment.helpful, comment.improvement, comment.additional].some((value) => Boolean(value?.trim()));
    if (!hasText) continue;
    const existing = commentsByCoach.get(comment.coachId) ?? [];
    existing.push({ helpful: comment.helpful, improvement: comment.improvement, additional: comment.additional });
    commentsByCoach.set(comment.coachId, existing);
  }

  const rosterById = new Map(roster.map((coach) => [coach.id, coach]));
  const allCoachIds = Array.from(new Set(Array.from(rosterById.keys()).concat(Array.from(responseByCoach.keys()))));
  return allCoachIds.map((coachId) => {
    const coach = rosterById.get(coachId) ?? { id: coachId, name: "Coach", email: null };
    const response = responseByCoach.get(coachId);
    return {
      coachId,
      coachName: coach.name,
      coachEmail: coach.email,
      responseCount: Number(response?.responseCount ?? 0),
      overallAverage: clampAverage(response?.overallAverage),
      prioritiesAverage: clampAverage(response?.prioritiesAverage),
      clarityAverage: clampAverage(response?.clarityAverage),
      supportAverage: clampAverage(response?.supportAverage),
      comments: commentsByCoach.get(coachId) ?? [],
    };
  }).sort((left, right) => left.coachName.localeCompare(right.coachName));
}

export async function buildWeeklyCoachFeedbackReport(asOf = new Date()): Promise<WeeklyCoachFeedbackReport> {
  const weekStart = currentEasternWeekStart(asOf);
  const roster = await getCoachRosterForWeek(weekStart, asOf);
  const aggregates = await getAggregatesForWeek(weekStart, roster);
  const leadershipRecipients = await getLeadershipRecipients();
  const totalCount = aggregates.reduce((sum, aggregate) => sum + aggregate.responseCount, 0);
  const weightedAverage = (key: "overallAverage" | "prioritiesAverage" | "clarityAverage" | "supportAverage") => {
    if (!totalCount) return null;
    const weighted = aggregates.reduce((sum, aggregate) => sum + (aggregate[key] ?? 0) * aggregate.responseCount, 0);
    return Math.round((weighted / totalCount) * 10) / 10;
  };
  return {
    weekStart,
    periodLabel: formatPeriodLabel(weekStart),
    aggregates,
    leadershipRecipients,
    overall: {
      responseCount: totalCount,
      overallAverage: weightedAverage("overallAverage"),
      prioritiesAverage: weightedAverage("prioritiesAverage"),
      clarityAverage: weightedAverage("clarityAverage"),
      supportAverage: weightedAverage("supportAverage"),
    },
  };
}

async function claimReportRun(reportDate: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [run] = await db.select().from(scheduledReportRuns)
    .where(and(eq(scheduledReportRuns.reportKey, LIVE_REPORT_KEY), eq(scheduledReportRuns.reportDate, reportDate)))
    .limit(1);
  if (run?.status === "sent") return false;
  if (run?.status === "running" && Date.now() - run.startedAt.getTime() < STALE_RUN_MS) return false;
  if (run) {
    await db.update(scheduledReportRuns).set({
      status: "running",
      startedAt: new Date(),
      completedAt: null,
      recipientCount: 0,
      successfulRecipientCount: 0,
      errorMessage: null,
    }).where(eq(scheduledReportRuns.id, run.id));
  } else {
    try {
      await db.insert(scheduledReportRuns).values({ reportKey: LIVE_REPORT_KEY, reportDate, status: "running", startedAt: new Date() });
    } catch {
      return false;
    }
  }
  return true;
}

async function finalizeReportRun(status: "sent" | "partial" | "failed" | "skipped", recipientCount: number, successfulRecipientCount: number, errorMessage?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const reportDate = easternDateKey(getEasternTimeParts());
  await db.update(scheduledReportRuns).set({
    status,
    recipientCount,
    successfulRecipientCount,
    errorMessage: errorMessage ?? null,
    completedAt: new Date(),
  }).where(and(eq(scheduledReportRuns.reportKey, LIVE_REPORT_KEY), eq(scheduledReportRuns.reportDate, reportDate)));
}

/** Sends each active coach their own weekly aggregate and the named leaders the company-wide aggregate. */
export async function sendWeeklyCoachFeedbackReport(
  asOf = new Date(),
  options: { correction?: boolean } = {},
): Promise<{ sent: number; skipped: boolean; report: WeeklyCoachFeedbackReport }> {
  const report = await buildWeeklyCoachFeedbackReport(asOf);
  const reportDate = easternDateKey(getEasternTimeParts(asOf));
  if (!options.correction && !(await claimReportRun(reportDate))) return { sent: 0, skipped: true, report };

  const deliveries: Array<Promise<{ sent: boolean; reason?: string }>> = [];
  for (const aggregate of report.aggregates) {
    if (!aggregate.coachEmail) continue;
    deliveries.push(sendTransactionalEmail("coaching_feedback_weekly_summary", {
      recipientEmail: aggregate.coachEmail,
      recipientName: aggregate.coachName,
      coachFeedbackSubject: `${options.correction ? "CORRECTED — " : ""}Your anonymous coaching feedback | ${report.periodLabel}`,
      coachFeedbackHtml: renderCoachWeeklyEmail(aggregate, report),
    }, {
      allowTemplateOverride: false,
      injectMagicLinks: false,
      idempotencyKey: `${LIVE_REPORT_KEY}:${reportDate}:${options.correction ? "correction:" : ""}coach:${aggregate.coachId}`,
    }));
  }
  for (const leader of report.leadershipRecipients) {
    deliveries.push(sendTransactionalEmail("coaching_feedback_weekly_summary", {
      recipientEmail: leader.email,
      recipientName: leader.name,
      coachFeedbackSubject: `${options.correction ? "CORRECTED — " : ""}Coach feedback — weekly aggregate | ${report.periodLabel}`,
      coachFeedbackHtml: renderLeadershipWeeklyEmail(report),
    }, {
      allowTemplateOverride: false,
      injectMagicLinks: false,
      idempotencyKey: `${LIVE_REPORT_KEY}:${reportDate}:${options.correction ? "correction:" : ""}leadership:${leader.id}`,
    }));
  }

  const results = await Promise.all(deliveries);
  const sent = results.filter((result) => result.sent).length;
  const failed = results.filter((result) => !result.sent);
  const recipientCount = results.length;
  if (!options.correction) {
    await finalizeReportRun(failed.length ? (sent ? "partial" : "failed") : "sent", recipientCount, sent, failed.map((result) => result.reason).filter(Boolean).join("; ") || undefined);
  }
  return { sent, skipped: false, report };
}

function nextFridayAtEightEastern(now = new Date()): Date {
  const eastern = getEasternTimeParts(now);
  const daysUntilFriday = (FRIDAY_INDEX - weekdayIndex(eastern.weekday) + 7) % 7;
  let targetDate = addEasternDays(easternDateKey(eastern), daysUntilFriday);
  if (daysUntilFriday === 0 && (eastern.hour > WEEKLY_REPORT_HOUR || (eastern.hour === WEEKLY_REPORT_HOUR && (eastern.minute > 0 || eastern.second > 0)))) {
    targetDate = addEasternDays(targetDate, 7);
  }
  return easternDateTimeToUtc(targetDate, WEEKLY_REPORT_HOUR);
}

let invitationTimer: NodeJS.Timeout | undefined;
let weeklyReportTimer: NodeJS.Timeout | undefined;
let weeklyRecoveryTimer: NodeJS.Timeout | undefined;

function scheduleNextWeeklyReport(): void {
  if (weeklyReportTimer) clearTimeout(weeklyReportTimer);
  const nextRun = nextFridayAtEightEastern();
  const delay = Math.max(nextRun.getTime() - Date.now(), 1_000);
  console.info(`[CoachFeedback] Next weekly aggregate scheduled for ${nextRun.toLocaleString("en-US", { timeZone: EASTERN_TIME_ZONE })}.`);
  weeklyReportTimer = setTimeout(async () => {
    await sendWeeklyCoachFeedbackReport();
    scheduleNextWeeklyReport();
  }, delay);
}

/** Install the production scheduler: invitation checks every five minutes and Friday 8:00 PM Eastern aggregates. */
export function scheduleCoachFeedback(): void {
  if (invitationTimer) clearInterval(invitationTimer);
  invitationTimer = setInterval(() => {
    processDueCoachingFeedbackInvitations().catch((error) => console.error("[CoachFeedback] Invitation pass failed:", error));
  }, 5 * 60 * 1000);
  setTimeout(() => {
    processDueCoachingFeedbackInvitations().catch((error) => console.error("[CoachFeedback] Startup invitation pass failed:", error));
  }, 20_000);

  scheduleNextWeeklyReport();
  if (weeklyRecoveryTimer) clearTimeout(weeklyRecoveryTimer);
  weeklyRecoveryTimer = setTimeout(() => {
    const eastern = getEasternTimeParts();
    if (eastern.weekday === "Fri" && eastern.hour >= WEEKLY_REPORT_HOUR) {
      sendWeeklyCoachFeedbackReport().catch((error) => console.error("[CoachFeedback] Friday startup recovery failed:", error));
    }
  }, 45_000);
}

/** Sends Tyler a test-only one-time link for any recent real coaching session. */
export async function sendCoachFeedbackTestInvitation(sessionId: number, recipientEmail: string): Promise<{ sent: boolean; feedbackUrl: string; reason?: string }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const agent = aliasedTable(users, "coachFeedbackTestAgent");
  const coach = aliasedTable(users, "coachFeedbackTestCoach");
  const [candidate] = await db.select({
    session: {
      id: coachingSessions.id,
      agentId: coachingSessions.agentId,
      scheduledCoachId: coachingSessions.scheduledCoachId,
      sessionDate: coachingSessions.sessionDate,
      sessionType: coachingSessions.sessionType,
      status: coachingSessions.status,
    },
    agent: { id: agent.id, name: agent.name, email: agent.email },
    coach: { id: coach.id, name: coach.name, email: coach.email },
  })
    .from(coachingSessions)
    .innerJoin(agent, eq(coachingSessions.agentId, agent.id))
    .innerJoin(coach, eq(coachingSessions.scheduledCoachId, coach.id))
    .where(and(eq(coachingSessions.id, sessionId), isNotNull(coachingSessions.sessionDate)))
    .limit(1) as FeedbackInvitationCandidate[];
  if (!candidate) throw new TRPCError({ code: "NOT_FOUND", message: "A scheduled coaching session with an assigned coach was not found." });
  if (["Canceled", "No Show"].includes(candidate.session.status)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A canceled or no-show session cannot be used for preview." });
  }
  return createAndSendInvitation(candidate, recipientEmail, "Tyler", true);
}

export function assertCoachFeedbackDashboardAccess(user: { id: number; role: string; email?: string | null }, allowed: boolean): void {
  if (user.role !== "admin" || !allowed) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to anonymous coach feedback." });
  }
}

export const coachFeedbackPublicTokenMinLength = PUBLIC_TOKEN_MIN_LENGTH;
