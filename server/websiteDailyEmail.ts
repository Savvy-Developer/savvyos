import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";

import {
  properties,
  websiteAccounts,
  websiteDailyEmailClicks,
  websiteDailyEmailEngagement,
  websiteDailyEmailRuns,
  websiteDailyEmailSettings,
  websiteProperties,
} from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { invokeLLM } from "./_core/llm";
import {
  createResendBroadcast,
  sendResendBroadcast,
} from "./_core/resendMarketingBroadcast";
import type { ResendWebhookEvent } from "./_core/resendWebhook";
import { easternDateKey, getEasternTimeParts } from "./agentProductionReportScheduler";
import { dailyPropertyEmailEnabled } from "./dailyPropertyEmailMatching";
import {
  deliver,
  sendPersonalPropertyEmails,
  type EmailListing,
} from "./dailyPropertyEmail";
import {
  isScheduledSendDue,
  linkKeyFromUrl,
  parseEmailList,
  renderBroadcastEmail,
  renderSubject,
  runIdFromTags,
  type BroadcastListing,
} from "./websiteDailyEmailLogic";

/**
 * The daily property email, rebuilt in SavvyOS to replace the old site's
 * 5 PM digest. Managed in Website Studio > Daily Email.
 *
 * How a day works:
 *
 * 1. A listing published on the site joins the review queue.
 * 2. An admin approves the ones to send. Nothing goes out unapproved, the
 *    same rule the old site's reviewer checkbox had.
 * 3. At the chosen hour (Eastern) the approved batch is sent once:
 *    - one shared email broadcast to the chosen Resend segments (the big list),
 *    - a copy to the internal recipients, so a person sees what went out,
 *    - a personal, preference-matched email to new-site accounts.
 *    Each listing is stamped as sent so it never goes out twice.
 * 4. Opens and clicks come back through Resend webhooks and are counted
 *    against the send, for the Analytics section and the AI review.
 *
 * Two switches must both be on for anything to reach the list: "enabled" in
 * the Studio, and DAILY_PROPERTY_EMAIL_ENABLED=true on the server. Test sends
 * to named addresses work with either off, so the email can be checked first.
 */

export function masterSwitchOn(): boolean {
  return dailyPropertyEmailEnabled(ENV.dailyPropertyEmailEnabled);
}

// ─── Settings ────────────────────────────────────────────────────────────────

export type DailyEmailSettings = {
  enabled: boolean;
  sendHourEt: number;
  segmentIds: string[];
  internalRecipients: string[];
  personalEmailsEnabled: boolean;
  subjectTemplate: string | null;
  introText: string | null;
  updatedAt: Date | null;
};

const DEFAULT_SETTINGS: DailyEmailSettings = {
  enabled: false,
  sendHourEt: 17,
  segmentIds: [],
  internalRecipients: [],
  personalEmailsEnabled: true,
  subjectTemplate: null,
  introText: null,
  updatedAt: null,
};

export async function getDailyEmailSettings(db: any): Promise<DailyEmailSettings> {
  const [row] = await db
    .select()
    .from(websiteDailyEmailSettings)
    .where(eq(websiteDailyEmailSettings.singletonKey, "primary"))
    .limit(1);
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    enabled: !!row.enabled,
    sendHourEt: row.sendHourEt ?? 17,
    segmentIds: Array.isArray(row.segmentIds) ? row.segmentIds : [],
    internalRecipients: Array.isArray(row.internalRecipients) ? row.internalRecipients : [],
    personalEmailsEnabled: !!row.personalEmailsEnabled,
    subjectTemplate: row.subjectTemplate ?? null,
    introText: row.introText ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

export async function saveDailyEmailSettings(
  db: any,
  input: {
    enabled: boolean;
    sendHourEt: number;
    segmentIds: string[];
    internalRecipients: string;
    personalEmailsEnabled: boolean;
    subjectTemplate: string | null;
    introText: string | null;
  },
  userId: number
): Promise<void> {
  const values = {
    singletonKey: "primary",
    enabled: input.enabled,
    sendHourEt: Math.min(23, Math.max(0, Math.round(input.sendHourEt))),
    segmentIds: Array.from(
      new Set(input.segmentIds.map(id => id.trim()).filter(Boolean))
    ).slice(0, 20),
    internalRecipients: parseEmailList(input.internalRecipients).slice(0, 20),
    personalEmailsEnabled: input.personalEmailsEnabled,
    subjectTemplate: input.subjectTemplate?.trim() || null,
    introText: input.introText?.trim() || null,
    updatedById: userId,
  };
  const { singletonKey: _key, ...update } = values;
  await db.insert(websiteDailyEmailSettings).values(values).onDuplicateKeyUpdate({ set: update });
}

// ─── Review queue ────────────────────────────────────────────────────────────

export type QueueListing = BroadcastListing & {
  zip: string | null;
  publishedAt: Date | null;
  approved: boolean;
  approvedAt: Date | null;
};

const queueColumns = {
  propertyId: websiteProperties.propertyId,
  slug: websiteProperties.slug,
  headline: websiteProperties.headline,
  heroImageUrl: websiteProperties.heroImageUrl,
  publishedAt: websiteProperties.publishedAt,
  approvedAt: websiteProperties.dailyEmailApprovedAt,
  address: properties.address,
  city: properties.city,
  state: properties.state,
  zip: properties.zip,
  listPrice: properties.listPrice,
  beds: properties.beds,
  baths: properties.baths,
};

/** Published listings that have not gone out in a daily email yet. */
export async function loadQueue(db: any): Promise<QueueListing[]> {
  const rows = await db
    .select(queueColumns)
    .from(websiteProperties)
    .innerJoin(properties, eq(websiteProperties.propertyId, properties.id))
    .where(
      and(
        eq(websiteProperties.status, "published"),
        isNotNull(websiteProperties.publishedAt),
        isNull(websiteProperties.dailyEmailSentAt)
      )
    )
    .orderBy(desc(websiteProperties.publishedAt))
    .limit(200);
  return rows.map((row: any) => ({ ...row, approved: !!row.approvedAt }));
}

/**
 * Listings for a preview or test: the ticked ones, else the newest in the
 * queue, else the newest live listings on the site. The last one matters on
 * day one, when every live listing counts as already sent and the queue is
 * empty, so the email can still be checked before anything new is published.
 */
async function sampleListings(db: any, queue: QueueListing[]): Promise<{
  listings: BroadcastListing[];
  usingApproved: boolean;
}> {
  const approved = queue.filter(listing => listing.approved);
  if (approved.length) return { listings: approved, usingApproved: true };
  if (queue.length) return { listings: queue.slice(0, 3), usingApproved: false };
  const recent = await db
    .select(queueColumns)
    .from(websiteProperties)
    .innerJoin(properties, eq(websiteProperties.propertyId, properties.id))
    .where(eq(websiteProperties.status, "published"))
    .orderBy(desc(websiteProperties.publishedAt))
    .limit(3);
  return { listings: recent, usingApproved: false };
}

export async function setApproval(
  db: any,
  propertyIds: number[],
  approved: boolean,
  userId: number
): Promise<void> {
  if (!propertyIds.length) return;
  await db
    .update(websiteProperties)
    .set(
      approved
        ? { dailyEmailApprovedAt: new Date(), dailyEmailApprovedById: userId }
        : { dailyEmailApprovedAt: null, dailyEmailApprovedById: null }
    )
    .where(
      and(
        inArray(websiteProperties.propertyId, propertyIds),
        isNull(websiteProperties.dailyEmailSentAt)
      )
    );
}

// ─── Preview ─────────────────────────────────────────────────────────────────

export async function previewDailyEmail(db: any): Promise<{
  subject: string;
  html: string;
  listingCount: number;
  usingApproved: boolean;
}> {
  const settings = await getDailyEmailSettings(db);
  const queue = await loadQueue(db);
  // With nothing approved yet, preview a sample so the layout can still be
  // checked.
  const { listings, usingApproved } = await sampleListings(db, queue);
  const runDate = todayEastern();
  const subject = renderSubject(settings.subjectTemplate, listings.length);
  const { html } = renderBroadcastEmail({
    listings,
    subject,
    intro: settings.introText,
    runDate,
    unsubscribeUrl: "#unsubscribe",
  });
  return { subject, html, listingCount: listings.length, usingApproved };
}

// ─── Sending ─────────────────────────────────────────────────────────────────

function todayEastern(now = new Date()): string {
  return easternDateKey(getEasternTimeParts(now));
}

export type RunResult = {
  runId: number | null;
  status: "sent" | "partial" | "failed" | "skipped" | "already_sent" | "blocked";
  message: string;
};

async function insertRun(db: any, values: Record<string, unknown>): Promise<number> {
  const inserted = await db.insert(websiteDailyEmailRuns).values(values as any);
  return Number((inserted as any)[0]?.insertId);
}

/**
 * A test: the email as it would go out today, to named addresses only.
 * Nothing is stamped as sent, and the list is never touched.
 */
export async function sendTestDailyEmail(
  recipientsText: string,
  userId: number | null
): Promise<RunResult> {
  const db = await getDb();
  if (!db) return { runId: null, status: "failed", message: "Database unavailable" };
  const settings = await getDailyEmailSettings(db);
  const recipients = parseEmailList(recipientsText).slice(0, 10);
  if (!recipients.length) {
    return { runId: null, status: "blocked", message: "Add at least one email address to send the test to." };
  }
  const { listings } = await sampleListings(db, await loadQueue(db));
  if (!listings.length) {
    return { runId: null, status: "blocked", message: "There are no live listings on the site to put in a test." };
  }
  const runDate = todayEastern();
  const subject = `[Test] ${renderSubject(settings.subjectTemplate, listings.length)}`;
  const runId = await insertRun(db, {
    runDate,
    trigger: "test",
    status: "sending",
    subject,
    propertyIds: listings.map(listing => listing.propertyId),
    propertyCount: listings.length,
    sentById: userId,
    note: `Test to ${recipients.join(", ")}`,
  });
  const { html, text } = renderBroadcastEmail({
    listings,
    subject,
    intro: settings.introText,
    runDate,
    unsubscribeUrl: "https://home.savvy-agents.com/newsite/account/preferences",
  });
  let sent = 0;
  const errors: string[] = [];
  for (const to of recipients) {
    const result = await deliver(to, subject, html, runId, text);
    if (result.sent) sent += 1;
    else errors.push(`${to}: ${result.error}`);
  }
  const status = sent === recipients.length ? "sent" : sent > 0 ? "partial" : "failed";
  await db
    .update(websiteDailyEmailRuns)
    .set({
      status,
      internalSent: sent,
      broadcastError: errors.length ? errors.join("; ").slice(0, 2000) : null,
      completedAt: new Date(),
    })
    .where(eq(websiteDailyEmailRuns.id, runId));
  return {
    runId,
    status,
    message:
      status === "sent"
        ? `Test sent to ${recipients.join(", ")}.`
        : `Test ${status}: ${errors.join("; ")}`,
  };
}

/**
 * Send today's approved batch to everyone: the broadcast, the internal copy
 * and the personal emails. Used by the timed send and by "Send now".
 */
export async function runDailyEmail(params: {
  trigger: "scheduled" | "manual";
  userId?: number | null;
  now?: Date;
}): Promise<RunResult> {
  const db = await getDb();
  if (!db) return { runId: null, status: "failed", message: "Database unavailable" };
  if (!masterSwitchOn()) {
    return {
      runId: null,
      status: "blocked",
      message: "Sending is switched off on the server (DAILY_PROPERTY_EMAIL_ENABLED). Test sends still work.",
    };
  }
  const settings = await getDailyEmailSettings(db);
  if (params.trigger === "scheduled" && !settings.enabled) {
    return { runId: null, status: "blocked", message: "The daily email is turned off in settings." };
  }
  const runDate = todayEastern(params.now);
  const idempotencyKey = params.trigger === "scheduled" ? `scheduled:${runDate}` : null;

  const batch = (await loadQueue(db)).filter(listing => listing.approved);
  if (!batch.length) {
    if (idempotencyKey) {
      // Recorded so the scheduler stops checking for the rest of the day, and
      // so the history shows a quiet day rather than a missing one.
      try {
        await insertRun(db, {
          idempotencyKey,
          runDate,
          trigger: "scheduled",
          status: "skipped",
          propertyCount: 0,
          note: "Nothing approved to send.",
          completedAt: new Date(),
        });
      } catch {
        // Another instance already recorded today.
      }
    }
    return { runId: null, status: "skipped", message: "No approved listings to send." };
  }

  const subject = renderSubject(settings.subjectTemplate, batch.length);
  let runId: number;
  try {
    runId = await insertRun(db, {
      idempotencyKey,
      runDate,
      trigger: params.trigger,
      status: "sending",
      subject,
      propertyIds: batch.map(listing => listing.propertyId),
      propertyCount: batch.length,
      sentById: params.userId ?? null,
    });
  } catch {
    // The unique key on idempotencyKey: today's timed send already started.
    return { runId: null, status: "already_sent", message: "Today's email has already been sent." };
  }

  const { html, text } = renderBroadcastEmail({
    listings: batch,
    subject,
    intro: settings.introText,
    runDate,
  });

  // 1. The big list, one broadcast per segment.
  const broadcastIds: string[] = [];
  const broadcastErrors: string[] = [];
  for (const segmentId of settings.segmentIds) {
    const created = await createResendBroadcast({
      name: `SavvyOS daily properties ${runDate} #${runId}`,
      segmentId,
      subject,
      html,
      text,
    });
    if (!created.success) {
      broadcastErrors.push(`${segmentId}: ${created.error}`);
      continue;
    }
    const sent = await sendResendBroadcast(created.data.id);
    if (!sent.success) {
      broadcastErrors.push(`${segmentId}: ${sent.error}`);
      continue;
    }
    broadcastIds.push(created.data.id);
  }
  // Remembered straight away, so opens that arrive in the next seconds match.
  rememberBroadcasts(runId, broadcastIds);

  // 2. The internal copy. Resend's unsubscribe placeholder only works on a
  //    broadcast, so the copy links to the preferences page instead.
  let internalSent = 0;
  if (settings.internalRecipients.length) {
    const copy = renderBroadcastEmail({
      listings: batch,
      subject,
      intro: settings.introText,
      runDate,
      unsubscribeUrl: "https://home.savvy-agents.com/newsite/account/preferences",
    });
    for (const to of settings.internalRecipients) {
      const result = await deliver(to, subject, copy.html, runId, copy.text);
      if (result.sent) internalSent += 1;
    }
  }

  // 3. Personal emails to new-site accounts, from the same approved batch.
  let personalSent = 0;
  let personalFailed = 0;
  if (settings.personalEmailsEnabled) {
    try {
      const personal = await sendPersonalPropertyEmails({
        candidates: batch as EmailListing[],
        runId,
      });
      personalSent = personal.sent;
      personalFailed = personal.failed;
    } catch (error) {
      broadcastErrors.push(`personal: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const reachedAnyone = broadcastIds.length > 0 || internalSent > 0 || personalSent > 0;
  const allOk =
    broadcastErrors.length === 0 &&
    personalFailed === 0 &&
    internalSent === settings.internalRecipients.length;
  const status = !reachedAnyone ? "failed" : allOk ? "sent" : "partial";

  // Stamp only when something went out, so a failed day retries tomorrow.
  if (reachedAnyone) {
    await db
      .update(websiteProperties)
      .set({ dailyEmailSentAt: new Date() })
      .where(inArray(websiteProperties.propertyId, batch.map(listing => listing.propertyId)));
  }

  await db
    .update(websiteDailyEmailRuns)
    .set({
      status,
      broadcastIds,
      broadcastError: broadcastErrors.length ? broadcastErrors.join("; ").slice(0, 4000) : null,
      internalSent,
      personalSent,
      personalFailed,
      note:
        settings.segmentIds.length === 0
          ? "No segments chosen, so the big list was not emailed."
          : null,
      completedAt: new Date(),
    })
    .where(eq(websiteDailyEmailRuns.id, runId));

  console.info(
    `[DailyEmail] run ${runId} ${status}: ${batch.length} listings, ${broadcastIds.length}/${settings.segmentIds.length} broadcasts, ${internalSent} internal, ${personalSent} personal.`
  );
  return {
    runId,
    status,
    message:
      status === "failed"
        ? `Nothing was sent. ${broadcastErrors.join("; ")}`
        : `Sent ${batch.length} listing${batch.length === 1 ? "" : "s"}: ${broadcastIds.length} broadcast${broadcastIds.length === 1 ? "" : "s"}, ${personalSent} personal email${personalSent === 1 ? "" : "s"}, ${internalSent} internal cop${internalSent === 1 ? "y" : "ies"}.`,
  };
}

// ─── Scheduling ──────────────────────────────────────────────────────────────

let schedulerTimer: NodeJS.Timeout | null = null;
const TICK_MS = 10 * 60_000;

async function tick(): Promise<void> {
  if (!masterSwitchOn()) return;
  const db = await getDb();
  if (!db) return;
  const settings = await getDailyEmailSettings(db);
  const eastern = getEasternTimeParts();
  const runDate = easternDateKey(eastern);
  const [existing] = await db
    .select({ id: websiteDailyEmailRuns.id })
    .from(websiteDailyEmailRuns)
    .where(eq(websiteDailyEmailRuns.idempotencyKey, `scheduled:${runDate}`))
    .limit(1);
  const due = isScheduledSendDue({
    enabled: settings.enabled,
    masterSwitch: true,
    sendHourEt: settings.sendHourEt,
    easternHour: eastern.hour,
    alreadySentToday: !!existing,
  });
  if (!due) return;
  const result = await runDailyEmail({ trigger: "scheduled" });
  console.info(`[DailyEmail] Timed send: ${result.status}. ${result.message}`);
}

/**
 * Checks every ten minutes whether today's email is due. Cheap when it is
 * not: one settings read and one indexed lookup. The unique key on the run
 * means two server instances cannot both send.
 */
export function scheduleWebsiteDailyEmail(): void {
  if (schedulerTimer) clearInterval(schedulerTimer);
  if (!masterSwitchOn()) {
    console.info(
      "[DailyEmail] Server switch off (DAILY_PROPERTY_EMAIL_ENABLED). No timed sends. Test sends still work from the Website Studio."
    );
  }
  schedulerTimer = setInterval(() => {
    tick().catch(error => console.error("[DailyEmail] Scheduler tick failed.", error));
  }, TICK_MS);
  // A first check shortly after start, so a restart inside the send window
  // does not wait ten minutes.
  setTimeout(() => {
    tick().catch(error => console.error("[DailyEmail] Startup check failed.", error));
  }, 60_000);
}

// ─── Opens and clicks ────────────────────────────────────────────────────────

/** Broadcast ID to run ID, so a webhook flood costs no database lookups. */
const broadcastRuns = new Map<string, number>();
let broadcastRunsLoadedAt = 0;

function rememberBroadcasts(runId: number, broadcastIds: string[]) {
  for (const id of broadcastIds) broadcastRuns.set(id, runId);
}

async function runIdForBroadcast(db: any, broadcastId: string): Promise<number | null> {
  const known = broadcastRuns.get(broadcastId);
  if (known) return known;
  // Refresh at most every five minutes; an unknown broadcast between refreshes
  // is almost always someone else's (a One Time Send), not ours.
  if (Date.now() - broadcastRunsLoadedAt < 5 * 60_000) return null;
  broadcastRunsLoadedAt = Date.now();
  const since = new Date(Date.now() - 90 * 24 * 60 * 60_000);
  const rows = await db
    .select({ id: websiteDailyEmailRuns.id, broadcastIds: websiteDailyEmailRuns.broadcastIds })
    .from(websiteDailyEmailRuns)
    .where(and(gte(websiteDailyEmailRuns.createdAt, since), isNotNull(websiteDailyEmailRuns.broadcastIds)));
  for (const row of rows) {
    if (Array.isArray(row.broadcastIds)) rememberBroadcasts(row.id, row.broadcastIds);
  }
  return broadcastRuns.get(broadcastId) ?? null;
}

/**
 * Count an open or click against the daily email it came from. A no-op for
 * every other email, and for every other event type, so it adds nothing to
 * the webhook's work outside the daily email.
 */
export async function recordDailyEmailEvent(event: ResendWebhookEvent): Promise<boolean> {
  if (event.type !== "email.opened" && event.type !== "email.clicked") return false;
  const data: any = event.data || {};
  const emailId: string | undefined = data.email_id;
  if (!emailId) return false;
  let runId = runIdFromTags(data.tags);
  if (!runId && !data.broadcast_id) return false;
  const db = await getDb();
  if (!db) return false;
  if (!runId && data.broadcast_id) runId = await runIdForBroadcast(db, data.broadcast_id);
  if (!runId) return false;

  const at = event.created_at ? new Date(event.created_at) : new Date();
  const occurredAt = Number.isNaN(at.getTime()) ? new Date() : at;
  const opened = event.type === "email.opened";
  await db
    .insert(websiteDailyEmailEngagement)
    .values({
      runId,
      emailId: String(emailId).slice(0, 128),
      openedAt: opened ? occurredAt : null,
      clickedAt: opened ? null : occurredAt,
    })
    .onDuplicateKeyUpdate({
      set: opened
        ? { openedAt: sql`COALESCE(${websiteDailyEmailEngagement.openedAt}, VALUES(openedAt))` }
        : { clickedAt: sql`COALESCE(${websiteDailyEmailEngagement.clickedAt}, VALUES(clickedAt))` },
    });
  if (!opened) {
    await db
      .insert(websiteDailyEmailClicks)
      .values({
        runId,
        emailId: String(emailId).slice(0, 128),
        linkKey: linkKeyFromUrl(data.click?.link),
      })
      .onDuplicateKeyUpdate({ set: { runId } });
  }
  return true;
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export type RunStats = {
  id: number;
  runDate: string;
  trigger: string;
  status: string;
  subject: string | null;
  propertyCount: number;
  broadcasts: number;
  personalSent: number;
  internalSent: number;
  note: string | null;
  error: string | null;
  sentAt: Date | null;
  opens: number;
  clickers: number;
  newAccountsNext24h: number;
};

export async function loadDailyEmailAnalytics(db: any): Promise<{
  runs: RunStats[];
  topProperties: Array<{ slug: string; headline: string | null; clicks: number }>;
}> {
  const runs = await db
    .select()
    .from(websiteDailyEmailRuns)
    .orderBy(desc(websiteDailyEmailRuns.createdAt))
    .limit(30);
  if (!runs.length) return { runs: [], topProperties: [] };
  const ids = runs.map((run: any) => run.id);

  const engagement = await db
    .select({
      runId: websiteDailyEmailEngagement.runId,
      opens: sql<number>`SUM(${websiteDailyEmailEngagement.openedAt} IS NOT NULL)`,
      clickers: sql<number>`SUM(${websiteDailyEmailEngagement.clickedAt} IS NOT NULL)`,
    })
    .from(websiteDailyEmailEngagement)
    .where(inArray(websiteDailyEmailEngagement.runId, ids))
    .groupBy(websiteDailyEmailEngagement.runId);
  const byRun = new Map<number, { opens: number; clickers: number }>();
  for (const row of engagement) {
    byRun.set(row.runId, { opens: Number(row.opens) || 0, clickers: Number(row.clickers) || 0 });
  }

  const stats: RunStats[] = [];
  for (const run of runs) {
    const sentAt: Date | null = run.completedAt ?? null;
    let newAccountsNext24h = 0;
    if (sentAt && run.trigger !== "test" && (run.status === "sent" || run.status === "partial")) {
      const [row] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(websiteAccounts)
        .where(
          and(
            gte(websiteAccounts.createdAt, sentAt),
            lt(websiteAccounts.createdAt, new Date(sentAt.getTime() + 24 * 60 * 60_000))
          )
        );
      newAccountsNext24h = Number(row?.count) || 0;
    }
    const engaged = byRun.get(run.id) ?? { opens: 0, clickers: 0 };
    stats.push({
      id: run.id,
      runDate: run.runDate,
      trigger: run.trigger,
      status: run.status,
      subject: run.subject,
      propertyCount: run.propertyCount,
      broadcasts: Array.isArray(run.broadcastIds) ? run.broadcastIds.length : 0,
      personalSent: run.personalSent,
      internalSent: run.internalSent,
      note: run.note,
      error: run.broadcastError,
      sentAt,
      opens: engaged.opens,
      clickers: engaged.clickers,
      newAccountsNext24h,
    });
  }

  const clicks = await db
    .select({
      linkKey: websiteDailyEmailClicks.linkKey,
      clicks: sql<number>`COUNT(*)`,
    })
    .from(websiteDailyEmailClicks)
    .where(inArray(websiteDailyEmailClicks.runId, ids))
    .groupBy(websiteDailyEmailClicks.linkKey)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(10);
  const slugs = clicks.map((row: any) => row.linkKey).filter((key: string) => key !== "other");
  const headlines = new Map<string, string | null>();
  if (slugs.length) {
    const rows = await db
      .select({ slug: websiteProperties.slug, headline: websiteProperties.headline, address: properties.address })
      .from(websiteProperties)
      .innerJoin(properties, eq(websiteProperties.propertyId, properties.id))
      .where(inArray(websiteProperties.slug, slugs));
    for (const row of rows) headlines.set(row.slug, row.headline || row.address || null);
  }
  const topProperties = clicks.map((row: any) => ({
    slug: row.linkKey,
    headline: row.linkKey === "other" ? "Other links (browse, sign up)" : headlines.get(row.linkKey) ?? row.linkKey,
    clicks: Number(row.clicks) || 0,
  }));

  return { runs: stats, topProperties };
}

/**
 * A plain-English read of the last month of sends: what is working, what is
 * not, and what to try. Advisory only; nothing is changed automatically.
 */
export async function analyzeDailyEmailWithAi(db: any): Promise<string> {
  const { runs, topProperties } = await loadDailyEmailAnalytics(db);
  const real = runs.filter(run => run.trigger !== "test");
  if (real.length < 2) {
    return "There is not enough history yet. The AI review needs at least two real sends to compare.";
  }
  const data = {
    sends: real.map(run => ({
      date: run.runDate,
      weekday: run.sentAt
        ? new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "America/New_York" }).format(run.sentAt)
        : null,
      sentHourEt: run.sentAt ? getEasternTimeParts(run.sentAt).hour : null,
      subject: run.subject,
      properties: run.propertyCount,
      opens: run.opens,
      clickers: run.clickers,
      newWebsiteAccountsNext24h: run.newAccountsNext24h,
      status: run.status,
    })),
    mostClickedProperties: topProperties,
  };
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You review the daily new-listings email of Savvy STR Agents, a real estate team for short-term rental investors. Using only the numbers provided, give a short, plain-English review for a busy owner: 3 to 6 bullet points covering what is working, what is not, and specific things to try next (subject lines, send time, number of properties, which kinds of properties get clicks). Opens are unique emails opened; clickers are unique emails with a click. Say when there is too little data to be sure. No preamble, no headings, no em dashes.",
        },
        { role: "user", content: JSON.stringify(data) },
      ],
      maxTokens: 700,
      timeoutMs: 45_000,
    });
    const content = response.choices[0]?.message?.content;
    if (typeof content === "string" && content.trim()) return content.trim();
    return "The AI review came back empty. Try again in a minute.";
  } catch (error) {
    console.warn("[DailyEmail] AI review failed.", error);
    return "The AI review is unavailable right now. The numbers above are still accurate.";
  }
}
