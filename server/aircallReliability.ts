import { Resend } from "resend";
import { and, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import {
  aircallCalls,
  aircallIntegrationState,
  aircallUnmatchedCalls,
  aircallWebhookEvents,
  communications,
} from "../drizzle/schema";
import {
  downloadAndStoreRecording,
  processAircallCall,
  reconcileUnmatchedAircallCalls,
  type AircallCallData,
} from "./aircall";
import { transcribeAndSummarize } from "./aircallTranscribe";

const AIRCALL_WEBHOOK_URL = `${(process.env.APP_URL || "https://os.savvy-agents.com").replace(/\/$/, "")}/api/webhooks/aircall`;
const REQUIRED_EVENTS = [
  "call.ended",
  "call.comm_assets_generated",
  "message.sent",
  "message.received",
  "message.status_updated",
];
const WORKER_INTERVAL_MS = 15_000;
const INVENTORY_INTERVAL_MS = 30 * 60_000;
const WEBHOOK_VERIFY_INTERVAL_MS = 6 * 60 * 60_000;
const EVENT_LEASE_MS = 5 * 60_000;
const MAX_WORKER_BATCH = 25;
const ALERT_AFTER_ATTEMPTS = 10;
const ALERT_COOLDOWN_MS = 6 * 60 * 60_000;
const INVENTORY_LOOKBACK_SECONDS = 48 * 60 * 60;
const HISTORICAL_START_AT = new Date(process.env.AIRCALL_HISTORY_START_AT || "2020-01-01T00:00:00.000Z");
const HISTORICAL_SLICE_DAYS = 30;
const HISTORICAL_INTERVAL_MS = 60_000;
// This rematch is database-only. A short interval clears a newly created or
// corrected-contact match promptly and cycles the full unmatched backlog often.
const UNMATCHED_REMATCH_INTERVAL_MS = 15_000;
const UNMATCHED_REMATCH_BATCH_SIZE = 25;
const API_MIN_SPACING_MS = 1_000;
const TRANSCRIPTION_WORKER_INTERVAL_MS = 15_000;
const TRANSCRIPTION_RETRY_MIN_MS = 2 * 60_000;

let workerRunning = false;
let inventoryRunning = false;
let historicalRunning = false;
let unmatchedRematchRunning = false;
let configurationRunning = false;
let transcriptionRecoveryRunning = false;
let lastApiRequestAt = 0;

interface AircallWebhookEnvelope {
  event: string;
  resource: string;
  timestamp: number;
  token?: string;
  data: AircallCallData;
}

interface AircallApiWebhook {
  webhook_id: string;
  url: string;
  active: boolean;
  token?: string;
  custom_name?: string;
  events?: string[];
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryDelayMs(attempts: number): number {
  return Math.min(6 * 60 * 60_000, Math.max(30_000, 30_000 * 2 ** Math.min(attempts - 1, 8)));
}

function transcriptionRetryDelayMs(attempts: number): number {
  return Math.min(6 * 60 * 60_000, Math.max(
    TRANSCRIPTION_RETRY_MIN_MS,
    TRANSCRIPTION_RETRY_MIN_MS * 2 ** Math.min(attempts - 1, 5),
  ));
}

function basicAuth(): string | null {
  const apiId = process.env.AIRCALL_API_ID;
  const apiToken = process.env.AIRCALL_API_TOKEN;
  return apiId && apiToken ? Buffer.from(`${apiId}:${apiToken}`).toString("base64") : null;
}

async function paceApi(): Promise<void> {
  const pause = lastApiRequestAt + API_MIN_SPACING_MS - Date.now();
  if (pause > 0) await wait(pause);
  lastApiRequestAt = Date.now();
}

async function aircallApi(path: string, init: RequestInit = {}): Promise<Response> {
  const auth = basicAuth();
  if (!auth) throw new Error("Aircall API credentials are not configured");
  await paceApi();
  const response = await fetch(`https://api.aircall.io/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 429) {
    const reset = Number(response.headers.get("X-AircallApi-Reset"));
    const retryAfter = Number(response.headers.get("Retry-After"));
    const pause = Number.isFinite(reset) && reset > Date.now() / 1000
      ? Math.max(1_000, reset * 1_000 - Date.now())
      : Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1_000
        : 60_000;
    await wait(pause);
    return aircallApi(path, init);
  }
  return response;
}

function eventKey(payload: AircallWebhookEnvelope): string {
  return `${payload.event}:${payload.data.id}:${payload.timestamp}`;
}

function asEnvelope(value: unknown): AircallWebhookEnvelope | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<AircallWebhookEnvelope>;
  if (!payload.event || !payload.data || typeof payload.data.id !== "number") return null;
  return payload as AircallWebhookEnvelope;
}

async function upsertIntegrationState(values: Partial<typeof aircallIntegrationState.$inferInsert>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(aircallIntegrationState).values({ id: 1, ...values }).onDuplicateKeyUpdate({ set: values });
}

async function alertAircallFailure(subject: string, detail: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [state] = await db.select({ lastAlertAt: aircallIntegrationState.lastAlertAt })
    .from(aircallIntegrationState).where(eq(aircallIntegrationState.id, 1)).limit(1);
  if (state?.lastAlertAt && Date.now() - state.lastAlertAt.getTime() < ALERT_COOLDOWN_MS) return;

  const recipient = process.env.AIRCALL_ALERT_EMAIL || "tyler@savvy.realty";
  if (ENV.resendApiKey) {
    const resend = new Resend(ENV.resendApiKey);
    const result = await resend.emails.send({
      from: "Savvy STR Agents <notifications@savvy-agents.com>",
      to: recipient,
      subject,
      html: `<p>${detail}</p><p>Review <a href="https://os.savvy-agents.com/ism?tab=calls">ISM Dashboard → Calls</a>.</p>`,
    }, { idempotencyKey: `aircall-alert-${Math.floor(Date.now() / ALERT_COOLDOWN_MS)}` });
    if (result.error) console.error("[AircallReliability] Alert delivery failed:", result.error.message);
  }
  await upsertIntegrationState({ lastAlertAt: new Date(), lastError: detail.slice(0, 512) });
}

export async function persistAircallWebhook(
  payload: AircallWebhookEnvelope,
  options?: { key?: string },
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const key = options?.key ?? eventKey(payload);
  const now = new Date();
  await db.insert(aircallWebhookEvents).values({
    eventKey: key,
    aircallCallId: payload.data.id,
    eventType: payload.event,
    payload: payload as any,
    status: "pending",
    nextAttemptAt: now,
  }).onDuplicateKeyUpdate({
    set: {
      payload: payload as any,
      // A redelivery may contain the asset link that was absent on an earlier
      // delivery. Re-queue it unless it is already being safely processed.
      nextAttemptAt: now,
      updatedAt: now,
    },
  });
}

export async function verifyAircallWebhookToken(token: string | undefined): Promise<boolean> {
  const configured = process.env.AIRCALL_WEBHOOK_TOKEN;
  if (configured) return token === configured;
  const db = await getDb();
  if (!db) return false;
  const [state] = await db.select({ webhookToken: aircallIntegrationState.webhookToken })
    .from(aircallIntegrationState).where(eq(aircallIntegrationState.id, 1)).limit(1);
  return Boolean(state?.webhookToken && token === state.webhookToken);
}

async function obtainCommunicationId(call: AircallCallData): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [existing] = await db.select({ communicationId: aircallCalls.communicationId })
    .from(aircallCalls).where(eq(aircallCalls.aircallCallId, call.id)).limit(1);
  if (existing?.communicationId) return existing.communicationId;

  const result = await processAircallCall(call, { skipMediaDownload: true });
  if (result.action === "unmatched") return null;
  return result.communicationId ?? null;
}

async function persistCallMedia(communicationId: number, call: AircallCallData): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [communication] = await db.select({ audioFileUrl: communications.audioFileUrl })
    .from(communications).where(eq(communications.id, communicationId)).limit(1);
  if (communication?.audioFileUrl) return;

  if (!call.recording && !call.voicemail) {
    if (call.duration && call.duration >= 10) {
      throw new Error("Recording asset not yet available from Aircall");
    }
    return;
  }

  const [recording, voicemail] = await Promise.all([
    downloadAndStoreRecording(call.id, call.recording, "recording"),
    downloadAndStoreRecording(call.id, call.voicemail, "voicemail"),
  ]);
  const media = recording ?? voicemail;
  if (!media) throw new Error("Aircall supplied media but it could not be durably stored");

  await db.update(communications).set({ audioFileUrl: media.url })
    .where(eq(communications.id, communicationId));
  await db.update(aircallCalls).set(
    recording
      ? { recordingUrl: recording.url, recordingKey: recording.key }
      : { voicemailUrl: voicemail!.url, voicemailKey: voicemail!.key },
  ).where(eq(aircallCalls.communicationId, communicationId));
  // Durable transcription recovery owns the AI step. It picks this stored audio
  // up from the database and persists retry state instead of using a process-local task.
}

async function processWebhookEvent(eventId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [event] = await db.select().from(aircallWebhookEvents)
    .where(eq(aircallWebhookEvents.id, eventId)).limit(1);
  if (!event) return;
  const envelope = asEnvelope(event.payload);
  if (!envelope) throw new Error("Invalid persisted Aircall webhook payload");

  const communicationId = await obtainCommunicationId(envelope.data);
  if (!communicationId) {
    // This is a valid business state, not a delivery failure. The independent
    // cursor-based rematch loop keeps trying it against newly created or fixed
    // contact phone numbers without clogging the media-recovery queue.
    console.log(`[AircallReliability] Call ${envelope.data.id} is currently unmatched; rematch loop retained ownership.`);
    return;
  }
  await persistCallMedia(communicationId, envelope.data);
}

export async function processDueAircallWebhookEvents(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  try {
    const db = await getDb();
    if (!db) return;
    const now = new Date();
    const rows = await db.select({ id: aircallWebhookEvents.id })
      .from(aircallWebhookEvents)
      .where(or(
        and(inArray(aircallWebhookEvents.status, ["pending", "retrying"]), or(
          isNull(aircallWebhookEvents.nextAttemptAt),
          lte(aircallWebhookEvents.nextAttemptAt, now),
        )),
        and(eq(aircallWebhookEvents.status, "processing"), lte(aircallWebhookEvents.leaseExpiresAt, now)),
      ))
      .orderBy(aircallWebhookEvents.createdAt)
      .limit(MAX_WORKER_BATCH);

    for (const row of rows) {
      const lease = new Date(Date.now() + EVENT_LEASE_MS);
      await db.update(aircallWebhookEvents).set({
        status: "processing",
        attempts: sql`${aircallWebhookEvents.attempts} + 1`,
        leaseExpiresAt: lease,
        lastAttemptAt: now,
      }).where(eq(aircallWebhookEvents.id, row.id));

      try {
        await processWebhookEvent(row.id);
        await db.update(aircallWebhookEvents).set({
          status: "completed",
          processedAt: new Date(),
          nextAttemptAt: null,
          leaseExpiresAt: null,
          lastError: null,
        }).where(eq(aircallWebhookEvents.id, row.id));
      } catch (error) {
        const [current] = await db.select({ attempts: aircallWebhookEvents.attempts, aircallCallId: aircallWebhookEvents.aircallCallId })
          .from(aircallWebhookEvents).where(eq(aircallWebhookEvents.id, row.id)).limit(1);
        const attempts = current?.attempts ?? 1;
        const message = error instanceof Error ? error.message : String(error);
        await db.update(aircallWebhookEvents).set({
          status: "retrying",
          nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
          leaseExpiresAt: null,
          lastError: message.slice(0, 512),
        }).where(eq(aircallWebhookEvents.id, row.id));
        console.error(`[AircallReliability] Event ${row.id} retry ${attempts}: ${message}`);
        if (attempts >= ALERT_AFTER_ATTEMPTS) {
          await alertAircallFailure(
            "SavvyOS Aircall recovery needs attention",
            `Call ${current?.aircallCallId ?? "unknown"} is still retrying after ${attempts} durable attempts. ${message}`,
          );
        }
      }
    }
  } finally {
    workerRunning = false;
  }
}

export async function processDueAircallTranscriptions(): Promise<void> {
  if (transcriptionRecoveryRunning) return;
  transcriptionRecoveryRunning = true;
  try {
    const db = await getDb();
    if (!db) return;
    const now = new Date();
    const [candidate] = await db.select({
      callId: aircallCalls.id,
      aircallCallId: aircallCalls.aircallCallId,
      communicationId: aircallCalls.communicationId,
      direction: aircallCalls.direction,
      duration: aircallCalls.duration,
      audioFileUrl: communications.audioFileUrl,
      transcription: communications.transcription,
      body: communications.body,
      attempts: aircallCalls.transcriptionRecoveryAttempts,
    }).from(aircallCalls)
      .innerJoin(communications, eq(communications.id, aircallCalls.communicationId))
      .where(and(
        isNotNull(communications.audioFileUrl),
        sql`COALESCE(${aircallCalls.duration}, 0) >= 10`,
        or(
          isNull(communications.transcription),
          and(
            sql`CHAR_LENGTH(TRIM(${communications.transcription})) >= 20`,
            sql`COALESCE(${communications.body}, '') NOT LIKE '%AI Summary:%'`,
          ),
        ),
        or(
          isNull(aircallCalls.transcriptionRecoveryNextAttemptAt),
          lte(aircallCalls.transcriptionRecoveryNextAttemptAt, now),
        ),
      ))
      .orderBy(desc(aircallCalls.startedAt))
      .limit(1);
    if (!candidate?.communicationId || !candidate.audioFileUrl) return;

    const attempts = candidate.attempts + 1;
    const nextAttemptAt = new Date(Date.now() + transcriptionRetryDelayMs(attempts));
    await db.update(aircallCalls).set({
      transcriptionRecoveryAttempts: attempts,
      transcriptionRecoveryLastAttemptAt: now,
      transcriptionRecoveryNextAttemptAt: nextAttemptAt,
      transcriptionRecoveryLastError: null,
    }).where(eq(aircallCalls.id, candidate.callId));

    try {
      await transcribeAndSummarize({
        communicationId: candidate.communicationId,
        aircallCallId: candidate.aircallCallId,
        audioUrl: candidate.audioFileUrl,
        direction: candidate.direction,
        duration: candidate.duration,
      });
      const [updated] = await db.select({
        transcription: communications.transcription,
        body: communications.body,
      }).from(communications).where(eq(communications.id, candidate.communicationId)).limit(1);
      const hasTranscript = Boolean(updated?.transcription?.trim());
      const needsSummary = (updated?.transcription?.trim().length ?? 0) >= 20
        && !((updated?.body ?? "").includes("\n\nAI Summary:"));
      if (!hasTranscript || needsSummary) {
        throw new Error(!hasTranscript ? "Transcription provider returned no transcript" : "Summary provider returned no summary");
      }
      await db.update(aircallCalls).set({
        transcriptionRecoveryNextAttemptAt: null,
        transcriptionRecoveryLastError: null,
      }).where(eq(aircallCalls.id, candidate.callId));
      console.log(`[AircallReliability] Completed transcript and summary for call ${candidate.aircallCallId}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.update(aircallCalls).set({
        transcriptionRecoveryNextAttemptAt: nextAttemptAt,
        transcriptionRecoveryLastError: message.slice(0, 512),
      }).where(eq(aircallCalls.id, candidate.callId));
      console.error(`[AircallReliability] Transcription retry ${attempts} for call ${candidate.aircallCallId}: ${message}`);
      if (attempts >= ALERT_AFTER_ATTEMPTS) {
        await alertAircallFailure(
          "SavvyOS Aircall transcription recovery needs attention",
          `Call ${candidate.aircallCallId} remains queued after ${attempts} controlled transcription attempts. ${message}`,
        );
      }
    }
  } finally {
    transcriptionRecoveryRunning = false;
  }
}

async function listAircallWebhooks(): Promise<AircallApiWebhook[]> {
  const response = await aircallApi("/webhooks?per_page=100");
  if (!response.ok) throw new Error(`Aircall webhook list returned HTTP ${response.status}`);
  const payload = await response.json() as { webhooks?: AircallApiWebhook[] };
  return payload.webhooks ?? [];
}

export async function ensureAircallWebhookConfiguration(): Promise<void> {
  if (configurationRunning || !basicAuth()) return;
  configurationRunning = true;
  try {
    const webhooks = await listAircallWebhooks();
    let webhook = webhooks.find(item => item.url === AIRCALL_WEBHOOK_URL);
    if (!webhook) {
      const response = await aircallApi("/webhooks", {
        method: "POST",
        body: JSON.stringify({
          custom_name: "SavvyOS Communications",
          url: AIRCALL_WEBHOOK_URL,
          events: REQUIRED_EVENTS,
        }),
      });
      if (!response.ok) throw new Error(`Aircall webhook creation returned HTTP ${response.status}`);
      const payload = await response.json() as { webhook?: AircallApiWebhook };
      webhook = payload.webhook;
    } else {
      const currentEvents = new Set(webhook.events ?? []);
      const missingEvents = REQUIRED_EVENTS.filter(event => !currentEvents.has(event));
      if (!webhook.active || missingEvents.length) {
        const query = missingEvents.length ? "?events_action=add" : "";
        const response = await aircallApi(`/webhooks/${webhook.webhook_id}${query}`, {
          method: "PUT",
          body: JSON.stringify({
            custom_name: webhook.custom_name || "SavvyOS Call Reliability",
            url: AIRCALL_WEBHOOK_URL,
            active: true,
            ...(missingEvents.length ? { events: missingEvents } : {}),
          }),
        });
        if (!response.ok) throw new Error(`Aircall webhook repair returned HTTP ${response.status}`);
        const payload = await response.json() as { webhook?: AircallApiWebhook };
        webhook = payload.webhook ?? webhook;
      }
    }
    if (!webhook?.webhook_id) throw new Error("Aircall webhook configuration response was incomplete");
    await upsertIntegrationState({
      webhookId: webhook.webhook_id,
      webhookToken: webhook.token,
      lastVerifiedAt: new Date(),
      lastWebhookRepairAt: new Date(),
      lastError: null,
    });
    console.log(`[AircallReliability] Verified active media-ready webhook ${webhook.webhook_id}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[AircallReliability] Webhook configuration check failed:", message);
    await upsertIntegrationState({ lastVerifiedAt: new Date(), lastError: message.slice(0, 512) });
    await alertAircallFailure("SavvyOS Aircall webhook verification failed", message);
  } finally {
    configurationRunning = false;
  }
}

async function queueCallForReliability(call: AircallCallData, source: string): Promise<void> {
  if (!call.id || !call.direction || !call.status) return;
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [existing] = await db.select({
    communicationId: aircallCalls.communicationId,
    audioFileUrl: communications.audioFileUrl,
  }).from(aircallCalls)
    .leftJoin(communications, eq(communications.id, aircallCalls.communicationId))
    .where(eq(aircallCalls.aircallCallId, call.id))
    .limit(1);
  const hasAircallMedia = Boolean(call.recording || call.voicemail);
  const needsCallImport = !existing;
  const needsMediaRecovery = Boolean(existing?.communicationId && !existing.audioFileUrl && hasAircallMedia);
  if (!needsCallImport && !needsMediaRecovery) return;

  const kind = needsMediaRecovery ? `${source}_assets` : source;
  await persistAircallWebhook({
    event: kind,
    resource: "call",
    timestamp: Math.floor(Date.now() / 1_000),
    data: call,
  }, { key: `${source}:${call.id}:${needsMediaRecovery ? "assets" : "call"}` });
}

export async function reconcileAircallInventory(): Promise<void> {
  if (inventoryRunning || !basicAuth()) return;
  inventoryRunning = true;
  try {
    let page = 1;
    const from = Math.floor(Date.now() / 1_000) - INVENTORY_LOOKBACK_SECONDS;
    while (true) {
      const response = await aircallApi(`/calls?per_page=50&order=desc&from=${from}&page=${page}`);
      if (!response.ok) throw new Error(`Aircall inventory returned HTTP ${response.status}`);
      const payload = await response.json() as { calls?: AircallCallData[]; meta?: { next_page_link?: string | null } };
      const calls = payload.calls ?? [];
      for (const call of calls) {
        await queueCallForReliability(call, "inventory");
      }
      if (!payload.meta?.next_page_link || calls.length === 0) break;
      page += 1;
    }
    console.log("[AircallReliability] Completed inventory reconciliation for the trailing 48 hours.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[AircallReliability] Inventory reconciliation failed:", message);
    await alertAircallFailure("SavvyOS Aircall inventory reconciliation failed", message);
  } finally {
    inventoryRunning = false;
  }
}

export async function reconcileAllHistoricalAircallCalls(): Promise<void> {
  if (historicalRunning || !basicAuth()) return;
  historicalRunning = true;
  try {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const [state] = await db.select({
      historicalBackfillCursorAt: aircallIntegrationState.historicalBackfillCursorAt,
      historicalBackfillCompletedAt: aircallIntegrationState.historicalBackfillCompletedAt,
    }).from(aircallIntegrationState).where(eq(aircallIntegrationState.id, 1)).limit(1);
    if (state?.historicalBackfillCompletedAt) return;

    let cursor = state?.historicalBackfillCursorAt ?? HISTORICAL_START_AT;
    const now = new Date();
    let slices = 0;
    while (cursor < now && slices < 6) {
      const sliceEnd = new Date(Math.min(cursor.getTime() + HISTORICAL_SLICE_DAYS * 24 * 60 * 60_000, now.getTime()));
      const from = Math.floor(cursor.getTime() / 1_000);
      const to = Math.floor(sliceEnd.getTime() / 1_000);
      let page = 1;
      let callsQueued = 0;
      while (true) {
        const response = await aircallApi(`/calls?per_page=50&order=asc&from=${from}&to=${to}&page=${page}`);
        if (!response.ok) throw new Error(`Aircall historical inventory returned HTTP ${response.status}`);
        const payload = await response.json() as { calls?: AircallCallData[]; meta?: { next_page_link?: string | null } };
        const calls = payload.calls ?? [];
        for (const call of calls) {
          await queueCallForReliability(call, "historical");
          callsQueued += 1;
        }
        if (!payload.meta?.next_page_link || calls.length === 0) break;
        page += 1;
      }
      cursor = sliceEnd;
      slices += 1;
      await upsertIntegrationState({
        historicalBackfillCursorAt: cursor,
        historicalBackfillCompletedAt: cursor >= now ? new Date() : null,
      });
      console.log(`[AircallReliability] Historical slice ${new Date(from * 1_000).toISOString()}–${sliceEnd.toISOString()}: ${callsQueued} calls scanned.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[AircallReliability] Historical inventory reconciliation failed:", message);
    await alertAircallFailure("SavvyOS Aircall historical reconciliation failed", message);
  } finally {
    historicalRunning = false;
  }
}

export async function rematchAllUnmatchedAircallCalls(): Promise<void> {
  if (unmatchedRematchRunning) return;
  unmatchedRematchRunning = true;
  try {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const [state] = await db.select({ unmatchedRematchCursorId: aircallIntegrationState.unmatchedRematchCursorId })
      .from(aircallIntegrationState).where(eq(aircallIntegrationState.id, 1)).limit(1);
    const result = await reconcileUnmatchedAircallCalls({
      limit: UNMATCHED_REMATCH_BATCH_SIZE,
      beforeId: state?.unmatchedRematchCursorId ?? undefined,
      // Use currently available media when a historical unmatched call becomes
      // matchable; expired media is harmlessly skipped by the downloader.
      skipMediaDownload: false,
    });
    const completedPass = result.scanned < UNMATCHED_REMATCH_BATCH_SIZE;
    await upsertIntegrationState({
      unmatchedRematchCursorId: completedPass ? null : result.nextCursor,
      lastUnmatchedReconcileAt: new Date(),
    });
    console.log(`[AircallReliability] Unmatched re-match: ${result.matched} matched, ${result.noContact} still unmatched, ${result.skipped} skipped from ${result.scanned} calls.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[AircallReliability] Unmatched re-match failed:", message);
    await alertAircallFailure("SavvyOS Aircall unmatched-call re-match failed", message);
  } finally {
    unmatchedRematchRunning = false;
  }
}

export function scheduleAircallReliability(): void {
  void ensureAircallWebhookConfiguration();
  void reconcileAircallInventory();
  void reconcileAllHistoricalAircallCalls();
  void rematchAllUnmatchedAircallCalls();
  void processDueAircallWebhookEvents();
  void processDueAircallTranscriptions();

  setInterval(() => { void processDueAircallWebhookEvents(); }, WORKER_INTERVAL_MS);
  setInterval(() => { void processDueAircallTranscriptions(); }, TRANSCRIPTION_WORKER_INTERVAL_MS);
  setInterval(() => { void reconcileAircallInventory(); }, INVENTORY_INTERVAL_MS);
  setInterval(() => { void reconcileAllHistoricalAircallCalls(); }, HISTORICAL_INTERVAL_MS);
  setInterval(() => { void rematchAllUnmatchedAircallCalls(); }, UNMATCHED_REMATCH_INTERVAL_MS);
  setInterval(() => { void ensureAircallWebhookConfiguration(); }, WEBHOOK_VERIFY_INTERVAL_MS);
}
