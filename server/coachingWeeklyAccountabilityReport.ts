import { and, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import {
  coachingCommitments,
  coachingProfiles,
  coachingSessions,
  scheduledReportRuns,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  addEasternDays,
  easternDateKey,
  easternDateTimeToUtc,
  getEasternTimeParts,
} from "./agentProductionReportScheduler";
import { sendTransactionalEmail } from "./_core/resendEmail";

const EASTERN_TIME_ZONE = "America/New_York";
const TEST_RECIPIENT_EMAIL = "tyler@savvy.realty";
const LIVE_REPORT_KEY = "coaching_weekly_accountability";
const FRIDAY_INDEX = 5;
const LIVE_REPORT_HOUR = 12;
const STALE_RUN_MS = 60 * 60 * 1000;

/**
 * This deliberately exists as a recipient allowlist rather than a role query.
 * The eventual scheduled delivery must send one identical leadership email to
 * exactly the people Tyler named, not to every administrator in SavvyOS.
 */
export const WEEKLY_COACHING_LEADERSHIP_RECIPIENT_EMAILS = [
  "philleone@savvy.realty",
  "dyl@savvy.realty",
  "elana@savvy.realty",
  "trish@savvy.realty",
  "ashleigh@savvy.realty",
  "hunter@savvy.realty",
  "tyler@savvy.realty",
] as const;

type SessionStatus = "Scheduled" | "In Progress" | "Completed" | "Canceled" | "No Show";
type CommitmentStatus =
  | "AI Suggested"
  | "Not Started"
  | "In Progress"
  | "Submitted for Verification"
  | "Completed"
  | "Partially Completed"
  | "Missed"
  | "Waived"
  | "No Longer Relevant";

type ExceptionPriority = "P1" | "P2" | "P3";

export interface CoachingWeeklyCoachRow {
  coachId: number | null;
  coachName: string;
  activeRoster: number;
  scheduled: number;
  completed: number;
  canceled: number;
  noShow: number;
  nextMeetingRecorded: number;
  notesRecorded: number;
  documentationComplete: number;
  commitmentsCreated: number;
  completeCommitments: number;
  commitmentsDue: number;
  commitmentsCompletedOnTime: number;
  openOverdueCommitments: number;
  exceptionCount: number;
}

export interface CoachingWeeklyException {
  priority: ExceptionPriority;
  category: "Roster" | "Session" | "Documentation" | "Commitment" | "Data";
  coachName: string;
  agentName: string;
  issue: string;
  ageLabel: string;
  action: string;
  actionPath: string;
}

export interface CoachingWeeklySummary {
  activeRoster: number;
  assignedRoster: number;
  unassignedRoster: number;
  scheduled: number;
  completed: number;
  canceled: number;
  noShow: number;
  nextMeetingRecorded: number;
  notesRecorded: number;
  documentationComplete: number;
  commitmentsCreated: number;
  commitmentsDue: number;
  commitmentsCompletedOnTime: number;
  openOverdueCommitments: number;
  exceptions: number;
}

export interface CoachingWeeklyAccountabilityReport {
  periodStart: Date;
  periodEndExclusive: Date;
  periodLabel: string;
  asOfLabel: string;
  summary: CoachingWeeklySummary;
  coaches: CoachingWeeklyCoachRow[];
  exceptions: CoachingWeeklyException[];
  leadershipRecipients: Array<{ id: number; name: string; email: string }>;
}

interface ProfileRecord {
  profile: typeof coachingProfiles.$inferSelect;
  agent: { id: number; name: string | null };
  coach: { id: number | null; name: string | null };
}

interface SessionRecord {
  id: number;
  agentId: number;
  status: SessionStatus;
  sessionDate: Date | null;
  actualCoachId: number | null;
  durationMinutes: number | null;
  sourceNotes: string | null;
  transcript: string | null;
  primaryDiagnosis: string | null;
  diagnosisEvidence: string | null;
  nextSessionDate: Date | null;
  completedAt: Date | null;
}

interface CommitmentRecord {
  id: number;
  agentId: number;
  description: string;
  ownerId: number | null;
  dueDate: Date | null;
  expectedResult: string | null;
  status: CommitmentStatus;
  completedDate: Date | null;
  coachVerificationStatus: "Pending" | "Verified" | "Rejected" | null;
  repeatCount: number | null;
  createdAt: Date;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function weekdayIndex(weekday: string): number {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

function getCompletedLabel(value: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${value}/${denominator} (${Math.round((value / denominator) * 100)}%)`;
}

function formatShortDate(value: Date | null | undefined): string {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    month: "short",
    day: "numeric",
  }).format(value);
}

function formatAgeDays(value: Date, asOf: Date): string {
  const wholeDays = Math.max(0, Math.floor((asOf.getTime() - value.getTime()) / (24 * 60 * 60 * 1000)));
  return wholeDays === 1 ? "1 day" : `${wholeDays} days`;
}

function isSubstantiveText(value: string | null | undefined, minimumCharacters = 40): boolean {
  return Boolean(value && value.trim().length >= minimumCharacters);
}

function isOpenCommitment(status: CommitmentStatus): boolean {
  return ["AI Suggested", "Not Started", "In Progress", "Submitted for Verification"].includes(status);
}

function isCompleteCommitment(record: CommitmentRecord): boolean {
  return Boolean(
    record.ownerId
    && record.dueDate
    && isSubstantiveText(record.description, 10)
    && isSubstantiveText(record.expectedResult, 10),
  );
}

/** Previous Monday–Sunday in Eastern time. The report is always a closed weekly window. */
export function getPreviousEasternWeek(asOf = new Date()): { start: Date; endExclusive: Date; periodLabel: string } {
  const eastern = getEasternTimeParts(asOf);
  const todayKey = easternDateKey(eastern);
  const daysSinceMonday = (weekdayIndex(eastern.weekday) - 1 + 7) % 7;
  const currentMondayKey = addEasternDays(todayKey, -daysSinceMonday);
  const previousMondayKey = addEasternDays(currentMondayKey, -7);
  const previousSundayKey = addEasternDays(currentMondayKey, -1);
  const start = easternDateTimeToUtc(previousMondayKey, 0, 0, 0);
  const endExclusive = easternDateTimeToUtc(currentMondayKey, 0, 0, 0);
  const periodLabel = `${new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    month: "short",
    day: "numeric",
  }).format(start)}–${new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(easternDateTimeToUtc(previousSundayKey, 23, 59, 59))}`;
  return { start, endExclusive, periodLabel };
}

async function getLeadershipRecipients(): Promise<Array<{ id: number; name: string; email: string }>> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for weekly coaching report recipients.");

  const rows = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(
      inArray(users.email, [...WEEKLY_COACHING_LEADERSHIP_RECIPIENT_EMAILS]),
      eq(users.isActive, true),
      isNotNull(users.email),
    ));

  const byEmail = new Map(rows.map((row) => [row.email!.toLowerCase(), row]));
  const missing = WEEKLY_COACHING_LEADERSHIP_RECIPIENT_EMAILS.filter((email) => !byEmail.has(email));
  if (missing.length > 0) {
    throw new Error(`Weekly coaching leadership recipient account(s) missing or inactive: ${missing.join(", ")}`);
  }

  return WEEKLY_COACHING_LEADERSHIP_RECIPIENT_EMAILS.map((email) => {
    const row = byEmail.get(email)!;
    return { id: row.id, name: row.name?.trim() || email, email };
  });
}

/**
 * Builds a transparent, deterministic leadership report from the existing
 * Coaching Hub source-of-truth tables. No scheduler is registered here.
 */
export async function buildWeeklyCoachingAccountabilityReport(asOf = new Date()): Promise<CoachingWeeklyAccountabilityReport> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for weekly coaching accountability reporting.");

  const { start, endExclusive, periodLabel } = getPreviousEasternWeek(asOf);
  const [profiles, leadershipRecipients] = await Promise.all([
    db.select({
      profile: coachingProfiles,
      agent: { id: users.id, name: users.name },
      coach: { id: users.id, name: users.name },
    })
      .from(coachingProfiles)
      .innerJoin(users, eq(coachingProfiles.agentId, users.id))
      .where(and(eq(users.role, "agent"), eq(users.isActive, true))),
    getLeadershipRecipients(),
  ]);

  // Drizzle cannot join the users table twice without an alias. Fetch coaches
  // separately and then map them onto the enrolled coaching roster.
  const coachIds = Array.from(new Set(profiles.map((row) => row.profile.coachOfRecordId).filter((id): id is number => Boolean(id))));
  const coachRows = coachIds.length > 0
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, coachIds))
    : [];
  const coachById = new Map(coachRows.map((row) => [row.id, row]));
  const roster: ProfileRecord[] = profiles.map((row) => ({
    profile: row.profile,
    agent: row.agent,
    coach: row.profile.coachOfRecordId
      ? { id: row.profile.coachOfRecordId, name: coachById.get(row.profile.coachOfRecordId)?.name ?? null }
      : { id: null, name: null },
  }));

  const agentIds = roster.map((row) => row.agent.id);
  const [weeklySessions, futureSessions, allCommitments] = agentIds.length > 0
    ? await Promise.all([
      db.select({
        id: coachingSessions.id,
        agentId: coachingSessions.agentId,
        status: coachingSessions.status,
        sessionDate: coachingSessions.sessionDate,
        actualCoachId: coachingSessions.actualCoachId,
        durationMinutes: coachingSessions.durationMinutes,
        sourceNotes: coachingSessions.sourceNotes,
        transcript: coachingSessions.transcript,
        primaryDiagnosis: coachingSessions.primaryDiagnosis,
        diagnosisEvidence: coachingSessions.diagnosisEvidence,
        nextSessionDate: coachingSessions.nextSessionDate,
        completedAt: coachingSessions.completedAt,
      })
        .from(coachingSessions)
        .where(and(
          inArray(coachingSessions.agentId, agentIds),
          gte(coachingSessions.sessionDate, start),
          lt(coachingSessions.sessionDate, endExclusive),
        )),
      db.select({ agentId: coachingSessions.agentId, sessionDate: coachingSessions.sessionDate })
        .from(coachingSessions)
        .where(and(
          inArray(coachingSessions.agentId, agentIds),
          eq(coachingSessions.status, "Scheduled"),
          gte(coachingSessions.sessionDate, endExclusive),
        )),
      db.select({
        id: coachingCommitments.id,
        agentId: coachingCommitments.agentId,
        description: coachingCommitments.description,
        ownerId: coachingCommitments.ownerId,
        dueDate: coachingCommitments.dueDate,
        expectedResult: coachingCommitments.expectedResult,
        status: coachingCommitments.status,
        completedDate: coachingCommitments.completedDate,
        coachVerificationStatus: coachingCommitments.coachVerificationStatus,
        repeatCount: coachingCommitments.repeatCount,
        createdAt: coachingCommitments.createdAt,
      })
        .from(coachingCommitments)
        .where(inArray(coachingCommitments.agentId, agentIds)),
    ])
    : [[], [], []] as [SessionRecord[], Array<{ agentId: number; sessionDate: Date | null }>, CommitmentRecord[]];

  const sessionsByAgent = new Map<number, SessionRecord[]>();
  for (const session of weeklySessions as SessionRecord[]) {
    const current = sessionsByAgent.get(session.agentId) ?? [];
    current.push(session);
    sessionsByAgent.set(session.agentId, current);
  }
  const futureSessionAgentIds = new Set(futureSessions.filter((row) => row.sessionDate).map((row) => row.agentId));
  const commitmentsByAgent = new Map<number, CommitmentRecord[]>();
  for (const commitment of allCommitments as CommitmentRecord[]) {
    const current = commitmentsByAgent.get(commitment.agentId) ?? [];
    current.push(commitment);
    commitmentsByAgent.set(commitment.agentId, current);
  }

  const exceptions: CoachingWeeklyException[] = [];
  const coachRowsById = new Map<number | null, CoachingWeeklyCoachRow>();
  const ensureCoach = (coachId: number | null, coachName: string): CoachingWeeklyCoachRow => {
    const existing = coachRowsById.get(coachId);
    if (existing) return existing;
    const created: CoachingWeeklyCoachRow = {
      coachId,
      coachName,
      activeRoster: 0,
      scheduled: 0,
      completed: 0,
      canceled: 0,
      noShow: 0,
      nextMeetingRecorded: 0,
      notesRecorded: 0,
      documentationComplete: 0,
      commitmentsCreated: 0,
      completeCommitments: 0,
      commitmentsDue: 0,
      commitmentsCompletedOnTime: 0,
      openOverdueCommitments: 0,
      exceptionCount: 0,
    };
    coachRowsById.set(coachId, created);
    return created;
  };

  for (const row of roster) {
    const coachName = row.coach.name?.trim() || "Unassigned";
    const metric = ensureCoach(row.coach.id, coachName);
    metric.activeRoster += 1;
    const agentName = row.agent.name?.trim() || `Agent #${row.agent.id}`;
    const sessions = sessionsByAgent.get(row.agent.id) ?? [];
    const completedSessions = sessions.filter((session) => session.status === "Completed");
    const agentHasFutureSession = futureSessionAgentIds.has(row.agent.id)
      || Boolean(row.profile.nextSessionDate && row.profile.nextSessionDate >= endExclusive);

    if (!row.coach.id) {
      exceptions.push({
        priority: "P1",
        category: "Roster",
        coachName: "Unassigned",
        agentName,
        issue: "Active coaching profile has no coach of record.",
        ageLabel: "Current",
        action: "Assign a coach of record and schedule the next session.",
        actionPath: "/coaching",
      });
    }

    if (!agentHasFutureSession) {
      exceptions.push({
        priority: row.profile.performanceStatus === "Launch" || row.profile.performanceStatus === "Red" ? "P1" : "P2",
        category: "Roster",
        coachName,
        agentName,
        issue: `No future coaching session is recorded for this ${row.profile.performanceStatus} agent.`,
        ageLabel: row.profile.nextSessionDate ? `Last next date: ${formatShortDate(row.profile.nextSessionDate)}` : "No next date",
        action: "Schedule the next coaching session and record it in SavvyOS.",
        actionPath: `/coaching/agent/${row.agent.id}`,
      });
    } else {
      metric.nextMeetingRecorded += 1;
    }

    for (const session of sessions) {
      metric.scheduled += 1;
      if (session.status === "Completed") metric.completed += 1;
      if (session.status === "Canceled") metric.canceled += 1;
      if (session.status === "No Show") metric.noShow += 1;

      if (session.status === "Completed") {
        const hasNotes = isSubstantiveText(session.sourceNotes) || isSubstantiveText(session.transcript);
        const hasDiagnosis = Boolean(session.primaryDiagnosis) && isSubstantiveText(session.diagnosisEvidence, 15);
        const hasDuration = Boolean(session.durationMinutes && session.durationMinutes > 0);
        if (hasNotes) metric.notesRecorded += 1;
        if (hasNotes && hasDiagnosis && hasDuration) metric.documentationComplete += 1;

        const sessionPath = `/coaching/session/${session.id}`;
        const ageReference = session.completedAt ?? session.sessionDate ?? start;
        if (!hasNotes) {
          exceptions.push({
            priority: asOf.getTime() - ageReference.getTime() > 72 * 60 * 60 * 1000 ? "P1" : "P2",
            category: "Documentation",
            coachName,
            agentName,
            issue: "Completed session has no substantive notes or transcript.",
            ageLabel: `Completed ${formatAgeDays(ageReference, asOf)} ago`,
            action: "Finalize session notes or document the appropriate exception.",
            actionPath: sessionPath,
          });
        }
        if (!hasDiagnosis) {
          exceptions.push({
            priority: "P2",
            category: "Documentation",
            coachName,
            agentName,
            issue: "Completed session is missing a primary diagnosis and supporting evidence.",
            ageLabel: `Completed ${formatAgeDays(ageReference, asOf)} ago`,
            action: "Record the diagnosis and evidence from the coaching conversation.",
            actionPath: sessionPath,
          });
        }
        if (!hasDuration) {
          exceptions.push({
            priority: "P3",
            category: "Documentation",
            coachName,
            agentName,
            issue: "Completed session has no duration recorded.",
            ageLabel: `Completed ${formatAgeDays(ageReference, asOf)} ago`,
            action: "Record the actual session duration.",
            actionPath: sessionPath,
          });
        }
        if (!session.actualCoachId) {
          exceptions.push({
            priority: "P2",
            category: "Session",
            coachName,
            agentName,
            issue: "Completed session has no actual coach recorded.",
            ageLabel: `Completed ${formatAgeDays(ageReference, asOf)} ago`,
            action: "Assign the coach who conducted the session.",
            actionPath: sessionPath,
          });
        }
      }

      if (session.status === "No Show" || session.status === "Canceled") {
        exceptions.push({
          priority: session.status === "No Show" ? "P2" : "P3",
          category: "Session",
          coachName,
          agentName,
          issue: `Session was marked ${session.status.toLowerCase()}.`,
          ageLabel: formatShortDate(session.sessionDate),
          action: "Confirm the reason and ensure the replacement session is scheduled.",
          actionPath: `/coaching/session/${session.id}`,
        });
      }
    }

    const commitments = commitmentsByAgent.get(row.agent.id) ?? [];
    const commitmentsCreatedThisWeek = commitments.filter((item) => item.createdAt >= start && item.createdAt < endExclusive);
    metric.commitmentsCreated += commitmentsCreatedThisWeek.length;
    metric.completeCommitments += commitmentsCreatedThisWeek.filter(isCompleteCommitment).length;

    for (const commitment of commitmentsCreatedThisWeek.filter((item) => !isCompleteCommitment(item))) {
      exceptions.push({
        priority: "P2",
        category: "Commitment",
        coachName,
        agentName,
        issue: "New commitment is missing an owner, due date, expected result, or substantive description.",
        ageLabel: `Created ${formatAgeDays(commitment.createdAt, asOf)} ago`,
        action: "Complete the commitment definition so it can be measured and verified.",
        actionPath: "/coaching",
      });
    }

    const commitmentsDueInWindow = commitments.filter((item) => Boolean(item.dueDate && item.dueDate >= start && item.dueDate < endExclusive));
    metric.commitmentsDue += commitmentsDueInWindow.length;
    metric.commitmentsCompletedOnTime += commitmentsDueInWindow.filter((item) => Boolean(item.completedDate && item.dueDate && item.completedDate <= item.dueDate && item.status === "Completed")).length;

    for (const commitment of commitments.filter((item) => Boolean(item.dueDate && item.dueDate < endExclusive && isOpenCommitment(item.status)))) {
      metric.openOverdueCommitments += 1;
      const dueDate = commitment.dueDate!;
      exceptions.push({
        priority: asOf.getTime() - dueDate.getTime() > 14 * 24 * 60 * 60 * 1000 ? "P1" : "P2",
        category: "Commitment",
        coachName,
        agentName,
        issue: `Open commitment is overdue (${commitment.status}).${(commitment.repeatCount ?? 0) > 1 ? ` Repeated ${commitment.repeatCount} times.` : ""}`,
        ageLabel: `${formatAgeDays(dueDate, asOf)} overdue`,
        action: "Verify completion, revise the commitment, or close it with documented evidence.",
        actionPath: "/coaching",
      });
    }
  }

  const exceptionCountByCoach = new Map<string, number>();
  for (const exception of exceptions) {
    exceptionCountByCoach.set(exception.coachName, (exceptionCountByCoach.get(exception.coachName) ?? 0) + 1);
  }
  for (const row of Array.from(coachRowsById.values())) row.exceptionCount = exceptionCountByCoach.get(row.coachName) ?? 0;

  const coaches = Array.from(coachRowsById.values()).sort((a, b) =>
    b.exceptionCount - a.exceptionCount || a.coachName.localeCompare(b.coachName),
  );
  const summary: CoachingWeeklySummary = {
    activeRoster: roster.length,
    assignedRoster: roster.filter((row) => Boolean(row.coach.id)).length,
    unassignedRoster: roster.filter((row) => !row.coach.id).length,
    scheduled: coaches.reduce((sum, row) => sum + row.scheduled, 0),
    completed: coaches.reduce((sum, row) => sum + row.completed, 0),
    canceled: coaches.reduce((sum, row) => sum + row.canceled, 0),
    noShow: coaches.reduce((sum, row) => sum + row.noShow, 0),
    nextMeetingRecorded: coaches.reduce((sum, row) => sum + row.nextMeetingRecorded, 0),
    notesRecorded: coaches.reduce((sum, row) => sum + row.notesRecorded, 0),
    documentationComplete: coaches.reduce((sum, row) => sum + row.documentationComplete, 0),
    commitmentsCreated: coaches.reduce((sum, row) => sum + row.commitmentsCreated, 0),
    commitmentsDue: coaches.reduce((sum, row) => sum + row.commitmentsDue, 0),
    commitmentsCompletedOnTime: coaches.reduce((sum, row) => sum + row.commitmentsCompletedOnTime, 0),
    openOverdueCommitments: coaches.reduce((sum, row) => sum + row.openOverdueCommitments, 0),
    exceptions: exceptions.length,
  };

  const asOfLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(asOf);

  return {
    periodStart: start,
    periodEndExclusive: endExclusive,
    periodLabel,
    asOfLabel,
    summary,
    coaches,
    exceptions: exceptions.sort((a, b) => a.priority.localeCompare(b.priority) || a.coachName.localeCompare(b.coachName) || a.agentName.localeCompare(b.agentName)),
    leadershipRecipients,
  };
}

function exceptionRowHtml(exception: CoachingWeeklyException): string {
  const priorityColor = exception.priority === "P1" ? "#B91C1C" : exception.priority === "P2" ? "#B45309" : "#475569";
  const actionUrl = `https://os.savvy-agents.com${exception.actionPath}`;
  return `<tr>
    <td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;font-weight:700;color:${priorityColor};white-space:nowrap;">${exception.priority}</td>
    <td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;color:#374151;white-space:nowrap;">${escapeHtml(exception.category)}</td>
    <td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;color:#111827;font-weight:600;white-space:nowrap;">${escapeHtml(exception.coachName)}</td>
    <td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;color:#111827;font-weight:600;white-space:nowrap;">${escapeHtml(exception.agentName)}</td>
    <td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;color:#374151;line-height:1.35;">${escapeHtml(exception.issue)}</td>
    <td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;color:#6B7280;white-space:nowrap;">${escapeHtml(exception.ageLabel)}</td>
    <td style="padding:9px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;color:#374151;line-height:1.35;">${escapeHtml(exception.action)}<br /><a href="${actionUrl}" style="display:inline-block;margin-top:4px;color:#0284C7;font-weight:700;text-decoration:none;">Open record →</a></td>
  </tr>`;
}

/** Renders a complete, email-client-safe, single shared leadership report. */
export function renderWeeklyCoachingAccountabilityEmail(
  report: CoachingWeeklyAccountabilityReport,
  options: { isTest?: boolean } = {},
): string {
  const { summary } = report;
  const metricCard = (label: string, value: string, color = "#111827") => `<td style="width:25%;padding:8px;vertical-align:top;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E5E7EB;border-radius:8px;background:#F9FAFB;">
      <tr><td style="padding:12px 10px;text-align:center;"><div style="font-size:19px;font-weight:800;color:${color};line-height:1.2;">${value}</div><div style="margin-top:4px;font-size:10px;font-weight:700;letter-spacing:.25px;color:#6B7280;text-transform:uppercase;line-height:1.3;">${label}</div></td></tr>
    </table>
  </td>`;
  const coachRows = report.coaches.map((row, index) => `<tr style="background:${index % 2 === 0 ? "#FFFFFF" : "#F9FAFB"};">
    <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;font-weight:700;color:#111827;white-space:nowrap;">${escapeHtml(row.coachName)}</td>
    <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;text-align:center;color:#374151;">${row.activeRoster}</td>
    <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;text-align:center;color:#374151;">${row.scheduled}</td>
    <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;text-align:center;color:#111827;font-weight:700;">${getCompletedLabel(row.completed, row.scheduled)}</td>
    <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;text-align:center;color:#374151;">${row.canceled}/${row.noShow}</td>
    <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;text-align:center;color:${row.nextMeetingRecorded === row.activeRoster ? "#047857" : "#B45309"};font-weight:700;">${getCompletedLabel(row.nextMeetingRecorded, row.activeRoster)}</td>
    <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;text-align:center;color:${row.completed === 0 || row.documentationComplete === row.completed ? "#047857" : "#B45309"};font-weight:700;">${getCompletedLabel(row.documentationComplete, row.completed)}</td>
    <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;text-align:center;color:#374151;">${row.commitmentsCreated}/${row.completeCommitments}</td>
    <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;text-align:center;color:${row.commitmentsDue === 0 || row.commitmentsCompletedOnTime === row.commitmentsDue ? "#047857" : "#B45309"};font-weight:700;">${getCompletedLabel(row.commitmentsCompletedOnTime, row.commitmentsDue)}</td>
    <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;text-align:center;color:${row.openOverdueCommitments > 0 ? "#B91C1C" : "#047857"};font-weight:800;">${row.openOverdueCommitments}</td>
    <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-size:11px;text-align:center;color:${row.exceptionCount > 0 ? "#B91C1C" : "#047857"};font-weight:800;">${row.exceptionCount}</td>
  </tr>`).join("");
  const exceptionRows = report.exceptions.map(exceptionRowHtml).join("");
  const scheduledMeetingLabel = getCompletedLabel(summary.completed, summary.scheduled);
  const recipients = report.leadershipRecipients.map((recipient) => escapeHtml(recipient.name)).join(", ");
  const compactCoachCards = report.coaches.map((row) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 0 12px;border:1px solid #D1D5DB;border-radius:8px;border-collapse:separate;background:#FFFFFF;">
    <tr><td colspan="2" style="padding:11px 12px;background:#F8FAFC;border-bottom:1px solid #E5E7EB;font-size:14px;font-weight:800;color:#111827;">${escapeHtml(row.coachName)} <span style="float:right;color:${row.exceptionCount > 0 ? "#B91C1C" : "#047857"};font-size:12px;">${row.exceptionCount} exception${row.exceptionCount === 1 ? "" : "s"}</span></td></tr>
    <tr><td style="width:50%;padding:9px 12px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;">Roster <strong style="float:right;color:#111827;">${row.activeRoster}</strong></td><td style="width:50%;padding:9px 12px;border-bottom:1px solid #E5E7EB;border-left:1px solid #E5E7EB;font-size:12px;color:#374151;">Meetings completed <strong style="float:right;color:#111827;">${getCompletedLabel(row.completed, row.scheduled)}</strong></td></tr>
    <tr><td style="width:50%;padding:9px 12px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;">Future meeting <strong style="float:right;color:${row.nextMeetingRecorded === row.activeRoster ? "#047857" : "#B45309"};">${getCompletedLabel(row.nextMeetingRecorded, row.activeRoster)}</strong></td><td style="width:50%;padding:9px 12px;border-bottom:1px solid #E5E7EB;border-left:1px solid #E5E7EB;font-size:12px;color:#374151;">Documentation <strong style="float:right;color:${row.completed === 0 || row.documentationComplete === row.completed ? "#047857" : "#B45309"};">${getCompletedLabel(row.documentationComplete, row.completed)}</strong></td></tr>
    <tr><td style="width:50%;padding:9px 12px;font-size:12px;color:#374151;">New commitments <strong style="float:right;color:#111827;">${row.commitmentsCreated}/${row.completeCommitments}</strong></td><td style="width:50%;padding:9px 12px;border-left:1px solid #E5E7EB;font-size:12px;color:#374151;">Overdue commitments <strong style="float:right;color:${row.openOverdueCommitments > 0 ? "#B91C1C" : "#047857"};">${row.openOverdueCommitments}</strong></td></tr>
  </table>`).join("");
  const compactExceptionCards = report.exceptions.map((exception) => {
    const priorityColor = exception.priority === "P1" ? "#B91C1C" : exception.priority === "P2" ? "#B45309" : "#475569";
    const actionUrl = `https://os.savvy-agents.com${exception.actionPath}`;
    return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 0 10px;border:1px solid #E5E7EB;border-left:4px solid ${priorityColor};border-radius:6px;border-collapse:separate;background:#FFFFFF;"><tr><td style="padding:11px 12px;"><div style="font-size:11px;font-weight:800;color:${priorityColor};letter-spacing:.2px;">${exception.priority} · ${escapeHtml(exception.category)} · ${escapeHtml(exception.coachName)}</div><div style="margin-top:4px;font-size:13px;font-weight:800;color:#111827;">${escapeHtml(exception.agentName)}</div><div style="margin-top:4px;font-size:12px;line-height:1.45;color:#374151;">${escapeHtml(exception.issue)}</div><div style="margin-top:7px;font-size:11px;line-height:1.4;color:#6B7280;"><strong>Age:</strong> ${escapeHtml(exception.ageLabel)}<br /><strong>Required action:</strong> ${escapeHtml(exception.action)}</div><a href="${actionUrl}" style="display:inline-block;margin-top:9px;color:#0284C7;font-size:12px;font-weight:800;text-decoration:none;">Open record →</a></td></tr></table>`;
  }).join("");

  return `
    ${options.isTest ? `<div style="margin:0 0 18px;padding:11px 14px;border:1px solid #0EA5E9;border-radius:8px;background:#F0F9FF;font-size:12px;line-height:1.5;color:#0C4A6E;"><strong>Test delivery only.</strong> This preview/test was sent only to Tyler for review. The live shared leadership report is scheduled for Friday at 12:00 PM Eastern.</div>` : ""}
    <h1 style="margin:0 0 5px;font-size:22px;line-height:1.25;color:#0A0A0A;letter-spacing:-.25px;">Coaching Hub Weekly Accountability</h1>
    <p style="margin:0 0 18px;font-size:13px;font-weight:600;letter-spacing:.2px;color:#6B7280;">${escapeHtml(report.periodLabel)} &nbsp;·&nbsp; Frozen view generated ${escapeHtml(report.asOfLabel)}</p>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.55;color:#374151;">This is one shared leadership accountability report. Use Reply All to keep Phil, Dyl, Elana, Trish, Ashleigh, and Hunter in the same follow-through conversation. It shows assigned roster ownership, session execution, documentation discipline, next-meeting coverage, and commitment follow-through. Missing data is counted as an exception rather than treated as zero.</p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 0 16px;">
      <tr>
        ${metricCard("Active coaching roster", String(summary.activeRoster))}
        ${metricCard("Sessions completed", scheduledMeetingLabel, summary.completed === summary.scheduled ? "#047857" : "#B45309")}
        ${metricCard("Roster with future meeting", getCompletedLabel(summary.nextMeetingRecorded, summary.activeRoster), summary.nextMeetingRecorded === summary.activeRoster ? "#047857" : "#B45309")}
        ${metricCard("Open overdue commitments", String(summary.openOverdueCommitments), summary.openOverdueCommitments > 0 ? "#B91C1C" : "#047857")}
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 0 24px;">
      <tr>
        ${metricCard("Documentation complete", getCompletedLabel(summary.documentationComplete, summary.completed), summary.documentationComplete === summary.completed ? "#047857" : "#B45309")}
        ${metricCard("Notes recorded", getCompletedLabel(summary.notesRecorded, summary.completed), summary.notesRecorded === summary.completed ? "#047857" : "#B45309")}
        ${metricCard("Commitments due on time", getCompletedLabel(summary.commitmentsCompletedOnTime, summary.commitmentsDue), summary.commitmentsDue === 0 || summary.commitmentsCompletedOnTime === summary.commitmentsDue ? "#047857" : "#B45309")}
        ${metricCard("Named exceptions", String(summary.exceptions), summary.exceptions > 0 ? "#B91C1C" : "#047857")}
      </tr>
    </table>

    <h2 style="margin:0 0 8px;font-size:16px;color:#0A0A0A;">Coach Scoreboard</h2>
    ${compactCoachCards || `<p style="margin:0 0 20px;font-size:12px;color:#6B7280;">No active coaching profiles are currently enrolled.</p>`}
    <p style="margin:0 0 12px;font-size:12px;line-height:1.45;color:#6B7280;">Sessions are assigned to the coach of record. “Documentation complete” is a transparent first-version proxy: substantive notes or transcript, primary diagnosis with evidence, and duration recorded. This report does not yet score cadence compliance because cadence policy is not configured in SavvyOS.</p>
    <div style="display:none;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;table-layout:fixed;border-collapse:collapse;border:1px solid #D1D5DB;">
        <tr style="background:#0A0A0A;">
          <th style="padding:9px 8px;text-align:left;font-size:10px;color:#FFFFFF;letter-spacing:.2px;">Coach</th><th style="padding:9px 8px;text-align:center;font-size:10px;color:#FFFFFF;">Roster</th><th style="padding:9px 8px;text-align:center;font-size:10px;color:#FFFFFF;">Scheduled</th><th style="padding:9px 8px;text-align:center;font-size:10px;color:#FFFFFF;">Completed</th><th style="padding:9px 8px;text-align:center;font-size:10px;color:#FFFFFF;">Cancel / No-show</th><th style="padding:9px 8px;text-align:center;font-size:10px;color:#FFFFFF;">Future meeting</th><th style="padding:9px 8px;text-align:center;font-size:10px;color:#FFFFFF;">Documentation</th><th style="padding:9px 8px;text-align:center;font-size:10px;color:#FFFFFF;">New commitments / complete</th><th style="padding:9px 8px;text-align:center;font-size:10px;color:#FFFFFF;">Due on time</th><th style="padding:9px 8px;text-align:center;font-size:10px;color:#FFFFFF;">Open overdue</th><th style="padding:9px 8px;text-align:center;font-size:10px;color:#FFFFFF;">Exceptions</th>
        </tr>
        ${coachRows || `<tr><td colspan="11" style="padding:18px;text-align:center;font-size:12px;color:#6B7280;">No active coaching profiles are currently enrolled.</td></tr>`}
      </table>
    </div>

    <h2 style="margin:22px 0 8px;font-size:16px;color:#0A0A0A;">Named Exception Ledger</h2>
    ${compactExceptionCards || `<p style="margin:0 0 20px;font-size:12px;color:#047857;font-weight:700;">No named exceptions in this reporting window.</p>`}
    <p style="margin:0 0 12px;font-size:12px;line-height:1.45;color:#6B7280;">Every exception remains visible by owner and agent. P1 requires immediate leadership attention; P2 requires resolution this week; P3 is a data-quality correction. Open SavvyOS Coaching Hub to resolve the underlying record.</p>
    <div style="display:none;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;table-layout:fixed;border-collapse:collapse;border:1px solid #D1D5DB;">
        <tr style="background:#0A0A0A;">
          <th style="padding:9px 8px;text-align:left;font-size:10px;color:#FFFFFF;">Priority</th><th style="padding:9px 8px;text-align:left;font-size:10px;color:#FFFFFF;">Category</th><th style="padding:9px 8px;text-align:left;font-size:10px;color:#FFFFFF;">Coach</th><th style="padding:9px 8px;text-align:left;font-size:10px;color:#FFFFFF;">Agent</th><th style="padding:9px 8px;text-align:left;font-size:10px;color:#FFFFFF;">Exception</th><th style="padding:9px 8px;text-align:left;font-size:10px;color:#FFFFFF;">Age</th><th style="padding:9px 8px;text-align:left;font-size:10px;color:#FFFFFF;">Required action</th>
        </tr>
        ${exceptionRows || `<tr><td colspan="7" style="padding:18px;text-align:center;font-size:12px;color:#047857;font-weight:700;">No named exceptions in this reporting window.</td></tr>`}
      </table>
    </div>
    <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:22px 0 0;"><tr><td style="background:#0FC0DF;border-radius:7px;"><a href="https://os.savvy-agents.com/coaching" style="display:inline-block;padding:12px 20px;color:#0A0A0A;font-size:13px;font-weight:800;text-decoration:none;">Open Coaching Hub</a></td></tr></table>
    <p style="margin:18px 0 0;font-size:11px;line-height:1.5;color:#6B7280;">Shared leadership recipients: ${recipients}. This report is sent as one email conversation so Reply All keeps the group together. Report definitions: “notes recorded” requires substantive notes or transcript; “complete commitment” requires an owner, due date, expected result, and substantive description; no data is not converted to zero.</p>
  `;
}

export function getWeeklyCoachingAccountabilityEmailSubject(report: CoachingWeeklyAccountabilityReport, isTest = false): string {
  return `${isTest ? "TEST — " : ""}Coaching Hub Weekly Accountability | ${report.periodLabel} | ${report.summary.exceptions} exception${report.summary.exceptions === 1 ? "" : "s"}`;
}

/**
 * Explicitly Tyler-only. This is the sole send function in the initial release;
 * it is intentionally not called by server startup or a recurring scheduler.
 */
async function claimLiveCoachingReportRun(reportKey: string, reportDate: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available for coaching report-run tracking.");

  const existing = await db.select().from(scheduledReportRuns)
    .where(and(eq(scheduledReportRuns.reportKey, reportKey), eq(scheduledReportRuns.reportDate, reportDate)))
    .limit(1);
  const run = existing[0];
  if (run?.status === "sent") {
    console.info(`[CoachingWeeklyAccountability] ${reportDate} already delivered — skipping duplicate run.`);
    return false;
  }
  if (run?.status === "running" && Date.now() - run.startedAt.getTime() < STALE_RUN_MS) {
    console.info(`[CoachingWeeklyAccountability] ${reportDate} is already running — skipping overlap.`);
    return false;
  }

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
      await db.insert(scheduledReportRuns).values({
        reportKey,
        reportDate,
        status: "running",
        startedAt: new Date(),
      });
    } catch (error) {
      console.warn("[CoachingWeeklyAccountability] Could not claim report run:", error);
      return false;
    }
  }
  return true;
}

async function finalizeLiveCoachingReportRun(
  reportKey: string,
  reportDate: string,
  status: "sent" | "partial" | "failed" | "skipped",
  recipientCount: number,
  successfulRecipientCount: number,
  errorMessage?: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(scheduledReportRuns).set({
    status,
    recipientCount,
    successfulRecipientCount,
    errorMessage: errorMessage ?? null,
    completedAt: new Date(),
  }).where(and(eq(scheduledReportRuns.reportKey, reportKey), eq(scheduledReportRuns.reportDate, reportDate)));
}

/**
 * Sends one live leadership email: Phil is the primary recipient and the other
 * five named leaders are copied in the same conversation for Reply All.
 */
export async function sendWeeklyCoachingAccountabilityReport(
  asOf = new Date(),
  options: { reportKey?: string } = {},
): Promise<{
  sent: boolean;
  skipped: boolean;
  reason?: string;
  report: CoachingWeeklyAccountabilityReport;
}> {
  const report = await buildWeeklyCoachingAccountabilityReport(asOf);
  const reportDate = easternDateKey(getEasternTimeParts(asOf));
  const reportKey = options.reportKey ?? LIVE_REPORT_KEY;
  if (!(await claimLiveCoachingReportRun(reportKey, reportDate))) {
    return { sent: false, skipped: true, reason: "This live report was already claimed or delivered for the Eastern calendar date.", report };
  }

  const primaryRecipient = report.leadershipRecipients[0];
  const copiedRecipients = report.leadershipRecipients.slice(1);
  if (!primaryRecipient || copiedRecipients.length !== WEEKLY_COACHING_LEADERSHIP_RECIPIENT_EMAILS.length - 1) {
    const reason = "The configured shared leadership recipient group is incomplete.";
    await finalizeLiveCoachingReportRun(reportKey, reportDate, "failed", report.leadershipRecipients.length, 0, reason);
    return { sent: false, skipped: false, reason, report };
  }

  try {
    const delivery = await sendTransactionalEmail(
      "coaching_weekly_accountability",
      {
        recipientName: primaryRecipient.name,
        recipientEmail: primaryRecipient.email,
        ccEmails: copiedRecipients.map((recipient) => recipient.email),
        coachingReportDate: report.periodLabel,
        coachingReportHtml: renderWeeklyCoachingAccountabilityEmail(report),
        coachingReportSubject: getWeeklyCoachingAccountabilityEmailSubject(report),
      },
      {
        allowTemplateOverride: false,
        injectMagicLinks: false,
        idempotencyKey: `${reportKey}:${reportDate}:shared-leadership`,
      },
    );

    const recipientCount = report.leadershipRecipients.length;
    if (delivery.sent) {
      await finalizeLiveCoachingReportRun(reportKey, reportDate, "sent", recipientCount, recipientCount);
      console.info(`[CoachingWeeklyAccountability] Sent one shared leadership email to ${primaryRecipient.email} with ${copiedRecipients.length} copied recipient(s).`);
    } else {
      await finalizeLiveCoachingReportRun(
        reportKey,
        reportDate,
        delivery.skipped ? "skipped" : "failed",
        recipientCount,
        0,
        delivery.reason,
      );
    }
    return { ...delivery, report };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await finalizeLiveCoachingReportRun(reportKey, reportDate, "failed", report.leadershipRecipients.length, 0, reason);
    console.error("[CoachingWeeklyAccountability] Shared leadership delivery failed:", error);
    return { sent: false, skipped: false, reason, report };
  }
}

/** One separately audited resend is available for a recipient-list correction without reopening the normal Friday delivery record. */
export async function resendWeeklyCoachingAccountabilityReport(asOf = new Date()) {
  return sendWeeklyCoachingAccountabilityReport(asOf, { reportKey: `${LIVE_REPORT_KEY}_resend` });
}

function getNextFridayAtNoonEastern(now = new Date()): Date {
  const eastern = getEasternTimeParts(now);
  const daysUntilFriday = (FRIDAY_INDEX - weekdayIndex(eastern.weekday) + 7) % 7;
  let targetDate = addEasternDays(easternDateKey(eastern), daysUntilFriday);
  if (daysUntilFriday === 0 && (eastern.hour > LIVE_REPORT_HOUR || (eastern.hour === LIVE_REPORT_HOUR && (eastern.minute > 0 || eastern.second > 0)))) {
    targetDate = addEasternDays(targetDate, 7);
  }
  return easternDateTimeToUtc(targetDate, LIVE_REPORT_HOUR);
}

let liveReportTimer: NodeJS.Timeout | undefined;
let liveReportStartupRecoveryTimer: NodeJS.Timeout | undefined;

function scheduleNextLiveCoachingReport(): void {
  if (liveReportTimer) clearTimeout(liveReportTimer);
  const nextRun = getNextFridayAtNoonEastern();
  const delay = Math.max(nextRun.getTime() - Date.now(), 1_000);
  console.info(`[CoachingWeeklyAccountability] Next shared report scheduled for ${nextRun.toLocaleString("en-US", { timeZone: EASTERN_TIME_ZONE })}.`);
  liveReportTimer = setTimeout(async () => {
    await sendWeeklyCoachingAccountabilityReport();
    scheduleNextLiveCoachingReport();
  }, delay);
}

/** Schedule one shared leadership report at 12:00 PM every Friday in America/New_York. */
export function scheduleWeeklyCoachingAccountabilityReport(): void {
  scheduleNextLiveCoachingReport();
  if (liveReportStartupRecoveryTimer) clearTimeout(liveReportStartupRecoveryTimer);
  liveReportStartupRecoveryTimer = setTimeout(() => {
    const eastern = getEasternTimeParts();
    if (eastern.weekday === "Fri" && eastern.hour >= LIVE_REPORT_HOUR) {
      sendWeeklyCoachingAccountabilityReport().catch((error) =>
        console.error("[CoachingWeeklyAccountability] Friday startup recovery failed:", error),
      );
    }
  }, 30_000);
}

/** The restricted preview/test path remains Tyler-only. */
export async function sendWeeklyCoachingAccountabilityTest(asOf = new Date()): Promise<{
  sent: boolean;
  skipped: boolean;
  reason?: string;
  report: CoachingWeeklyAccountabilityReport;
}> {
  const report = await buildWeeklyCoachingAccountabilityReport(asOf);
  const weeklyReportHtml = renderWeeklyCoachingAccountabilityEmail(report, { isTest: true });
  const delivery = await sendTransactionalEmail(
    "coaching_weekly_accountability",
    {
      recipientName: "Tyler",
      recipientEmail: TEST_RECIPIENT_EMAIL,
      coachingReportDate: report.periodLabel,
      coachingReportHtml: weeklyReportHtml,
      coachingReportSubject: getWeeklyCoachingAccountabilityEmailSubject(report, true),
    },
    {
      allowTemplateOverride: false,
      idempotencyKey: `coaching-weekly-accountability:test:${easternDateKey(getEasternTimeParts(asOf))}`,
    },
  );
  return { ...delivery, report };
}
