import { eq } from "drizzle-orm";
import { communications } from "../drizzle/schema";
import { enqueueContactIntelligenceForCommunication } from "./contactIntelligence";
import { getDb } from "./db";

export type AircallTranscriptUtterance = {
  start_time?: number;
  end_time?: number;
  duration_ms?: number;
  participant_type?: string;
  phone_number?: string;
  user_id?: number;
  text?: string;
  timestamp?: number;
};

type AircallTranscriptResponse = {
  transcription?: {
    content?: {
      language?: string;
      utterances?: AircallTranscriptUtterance[];
    };
  };
};

type AircallSummaryResponse = {
  summary?: {
    content?: string;
  };
};

const AIRCALL_API_BASE_URL = "https://api.aircall.io/v1";
const API_MIN_SPACING_MS = 1_000;
let lastApiRequestAt = 0;

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

async function fetchAircallJson<T>(path: string): Promise<T> {
  const auth = basicAuth();
  if (!auth) throw new Error("Aircall API credentials are not configured");

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await paceApi();
    const response = await fetch(`${AIRCALL_API_BASE_URL}${path}`, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    if (response.status === 429 && attempt < 3) {
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.ceil(retryAfterSeconds * 1_000)
        : 30_000 * attempt;
      await wait(delayMs);
      continue;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Aircall ${path} returned HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
    }

    return await response.json() as T;
  }

  throw new Error(`Aircall ${path} exhausted retry attempts`);
}

function formatTimestamp(seconds: number | undefined, milliseconds: number | undefined): string | null {
  const totalSeconds = Number.isFinite(seconds)
    ? Math.max(0, Math.floor(seconds as number))
    : Number.isFinite(milliseconds)
      ? Math.max(0, Math.floor((milliseconds as number) / 1_000))
      : null;
  if (totalSeconds === null) return null;
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatSpeaker(participantType: string | undefined): string {
  switch (participantType?.toLowerCase()) {
    case "internal":
      return "Agent";
    case "external":
      return "Contact";
    case "ai_voice_agent":
      return "AI Voice Agent";
    default:
      return "Speaker";
  }
}

/** Convert Aircall's speaker-separated utterances into a readable CRM transcript. */
export function formatAircallTranscript(utterances: AircallTranscriptUtterance[] | undefined): string | null {
  if (!utterances?.length) return null;

  const lines = utterances
    .map(utterance => {
      const text = utterance.text?.trim();
      if (!text) return null;
      const timestamp = formatTimestamp(utterance.start_time, utterance.timestamp);
      const prefix = `${timestamp ? `[${timestamp}] ` : ""}${formatSpeaker(utterance.participant_type)}:`;
      return `${prefix} ${text}`;
    })
    .filter((line): line is string => Boolean(line));

  return lines.length ? lines.join("\n") : null;
}

function normalizeSummary(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const summary = value.trim();
  return summary || null;
}

/** Keep the immutable call metadata and replace only a prior generated summary. */
export function withAircallSummary(existingBody: string | null | undefined, summary: string): string {
  const base = (existingBody ?? "")
    .replace(/\n\n(?:AI|Aircall) Summary:\n[\s\S]*$/i, "")
    .trimEnd();
  return `${base}\n\nAircall Summary:\n${summary}`;
}

/** Retrieve and persist the finished Aircall transcript after transcription.created. */
export async function syncAircallTranscript(
  communicationId: number,
  aircallCallId: number,
): Promise<{ transcript: string }> {
  const payload = await fetchAircallJson<AircallTranscriptResponse>(`/calls/${aircallCallId}/transcription`);
  const transcript = formatAircallTranscript(payload.transcription?.content?.utterances);
  if (!transcript) {
    throw new Error(`Aircall returned no usable transcript for call ${aircallCallId}`);
  }

  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(communications)
    .set({ transcription: transcript })
    .where(eq(communications.id, communicationId));
  // Aircall remains the transcript source. Once its completed transcript is
  // durable in SavvyOS, enqueue an idempotent evidence-extraction job rather
  // than doing model work inside the webhook path.
  await enqueueContactIntelligenceForCommunication(communicationId);

  return { transcript };
}

/** Persist Aircall's standard summary after summary.created, fetching it only when necessary. */
export async function syncAircallSummary(
  communicationId: number,
  aircallCallId: number,
  webhookContent?: unknown,
): Promise<{ summary: string }> {
  let summary = normalizeSummary(webhookContent);
  if (!summary) {
    const payload = await fetchAircallJson<AircallSummaryResponse>(`/calls/${aircallCallId}/summary`);
    summary = normalizeSummary(payload.summary?.content);
  }
  if (!summary) {
    throw new Error(`Aircall returned no usable summary for call ${aircallCallId}`);
  }

  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [communication] = await db.select({ body: communications.body })
    .from(communications)
    .where(eq(communications.id, communicationId))
    .limit(1);
  if (!communication) {
    throw new Error(`Communication ${communicationId} was not found for Aircall call ${aircallCallId}`);
  }

  await db.update(communications)
    .set({ body: withAircallSummary(communication.body, summary) })
    .where(eq(communications.id, communicationId));
  // The summary may arrive after transcription.created. The source-hashed job
  // queue reopens only when this native evidence materially changes.
  await enqueueContactIntelligenceForCommunication(communicationId);

  return { summary };
}
