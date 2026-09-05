import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import {
  activityLog,
  aircallCalls,
  communications,
  contactIntelligenceBackfillRuns,
  contactIntelligenceJobs,
  contactIntelligenceProfiles,
  contactIntelligenceSignalReviews,
  contactIntelligenceSignals,
  contacts,
  users,
} from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";
import { notifySavvyOSPromptRun } from "./_core/slackNotifications";
import { getDb } from "./db";

// Railway's provisioned native OpenAI endpoint supports the GPT-4.1 family.
// It passed the full-transcript strict-schema probe; gpt-5's hidden reasoning
// exhausted the available completion budget and Gemini is not provisioned here.
export const CONTACT_INTELLIGENCE_EXTRACTION_VERSION = "contact-intelligence-v3";
const PRIMARY_EXTRACTION_MODEL = "gpt-4.1";
const SECONDARY_EXTRACTION_MODEL = "gpt-4.1-mini";
const JOB_LEASE_MS = 2 * 60_000;
const JOB_INTERVAL_MS = 20_000;
const MAX_JOB_ATTEMPTS = 8;
// Four concurrent, non-overlapping calls are enough to drain a large campaign
// quickly while preserving back pressure on the model provider and database.
const MAX_JOB_BATCH = 4;
const MAX_BACKFILL_IN_FLIGHT = 40;
const DEFAULT_BACKFILL_LIMIT = 1_946;
// GPT-4.1's long context lets us retain an entire native call in nearly every
// case; clipping remains a bounded safeguard for exceptionally long records.
const MAX_TRANSCRIPT_CHARS = 48_000;

let workerRunning = false;
let schedulerStarted = false;

type SignalConfidence = "low" | "medium" | "high";
type IntentTier = "priority" | "active" | "nurture" | "unknown";
type SignalKey =
  | "target_market"
  | "property_preference"
  | "price_range"
  | "financing_readiness"
  | "timeline"
  | "strategy"
  | "motivation"
  | "objection"
  | "next_step"
  | "communication_preference";

type ExtractedSignal = {
  signalKey: SignalKey;
  value: string;
  confidence: SignalConfidence;
  evidenceExcerpt: string;
  evidenceTimestamp: string;
};

type ExtractedProfile = {
  executiveBriefing: string;
  investorProfile: string;
  targetMarkets: string[];
  propertyPreferences: string[];
  priceRange: string;
  financingReadiness: string;
  timeline: string;
  strategy: string;
  motivations: string[];
  objections: Array<{ category: string; status: "open" | "addressed" | "resolved"; detail: string }>;
  nextBestAction: string;
  promisedNextStep: string;
  missingDiscovery: string[];
  scoreReasons: string[];
  confidence: SignalConfidence;
  intentTier: IntentTier;
  intentScore: number;
};

type ExtractionResult = {
  profile: ExtractedProfile;
  signals: ExtractedSignal[];
  extractionMode: "structured" | "native_summary_only";
  modelUsed: string | null;
};

type Row = Record<string, unknown>;

const extractionSchema = {
  name: "savvyos_contact_intelligence",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      profile: {
        type: "object",
        additionalProperties: false,
        properties: {
          executiveBriefing: { type: "string" },
          investorProfile: { type: "string" },
          targetMarkets: { type: "array", items: { type: "string" } },
          propertyPreferences: { type: "array", items: { type: "string" } },
          priceRange: { type: "string" },
          financingReadiness: { type: "string" },
          timeline: { type: "string" },
          strategy: { type: "string" },
          motivations: { type: "array", items: { type: "string" } },
          objections: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                category: { type: "string" },
                status: { type: "string", enum: ["open", "addressed", "resolved"] },
                detail: { type: "string" },
              },
              required: ["category", "status", "detail"],
            },
          },
          nextBestAction: { type: "string" },
          promisedNextStep: { type: "string" },
          missingDiscovery: { type: "array", items: { type: "string" } },
          scoreReasons: { type: "array", items: { type: "string" } },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          intentTier: { type: "string", enum: ["priority", "active", "nurture", "unknown"] },
          intentScore: { type: "integer", minimum: 0, maximum: 100 },
        },
        required: [
          "executiveBriefing",
          "investorProfile",
          "targetMarkets",
          "propertyPreferences",
          "priceRange",
          "financingReadiness",
          "timeline",
          "strategy",
          "motivations",
          "objections",
          "nextBestAction",
          "promisedNextStep",
          "missingDiscovery",
          "scoreReasons",
          "confidence",
          "intentTier",
          "intentScore",
        ],
      },
      signals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            signalKey: {
              type: "string",
              enum: [
                "target_market",
                "property_preference",
                "price_range",
                "financing_readiness",
                "timeline",
                "strategy",
                "motivation",
                "objection",
                "next_step",
                "communication_preference",
              ],
            },
            value: { type: "string" },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            evidenceExcerpt: { type: "string" },
            evidenceTimestamp: { type: "string" },
          },
          required: ["signalKey", "value", "confidence", "evidenceExcerpt", "evidenceTimestamp"],
        },
      },
    },
    required: ["profile", "signals"],
  },
} as const;

function rowsFromResult<T extends Row = Row>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function responseText(value: Awaited<ReturnType<typeof invokeLLM>>): string {
  const content = value.choices[0]?.message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map(part => part.text)
      .join("\n");
  }
  return "";
}

/**
 * Structured-output capable providers occasionally preserve a Markdown fence or
 * a short preface despite receiving a JSON-schema response format. Recover the
 * single JSON object without persisting or logging source conversation content.
 */
function parseStructuredResponse(raw: string): unknown {
  const candidates = [
    raw.trim(),
    raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(),
  ];
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(raw.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next safe representation of the same model response.
    }
  }
  throw new Error("Contact Intelligence model did not return valid structured output");
}

function cleanText(value: unknown, maxLength = 1_500): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…` : cleaned;
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function uniqueStrings(values: unknown, limit = 8): string[] {
  if (!Array.isArray(values)) return [];
  const unique = new Map<string, string>();
  for (const value of values) {
    const normalized = cleanText(value, 180);
    if (!normalized) continue;
    unique.set(normalized.toLocaleLowerCase(), normalized);
    if (unique.size >= limit) break;
  }
  return Array.from(unique.values());
}

function normalProfile(value: unknown): ExtractedProfile | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const intentTier = source.intentTier;
  const confidence = source.confidence;
  if (!(["priority", "active", "nurture", "unknown"] as const).includes(intentTier as IntentTier)) return null;
  if (!(["low", "medium", "high"] as const).includes(confidence as SignalConfidence)) return null;
  const rawObjections = Array.isArray(source.objections) ? source.objections : [];
  const objections = rawObjections.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const status = item.status;
    if (!["open", "addressed", "resolved"].includes(String(status))) return [];
    const category = cleanText(item.category, 120);
    const detail = cleanText(item.detail, 320);
    return category && detail ? [{ category, detail, status: status as "open" | "addressed" | "resolved" }] : [];
  }).slice(0, 8);
  return {
    executiveBriefing: cleanText(source.executiveBriefing, 1_400),
    investorProfile: cleanText(source.investorProfile, 600),
    targetMarkets: uniqueStrings(source.targetMarkets),
    propertyPreferences: uniqueStrings(source.propertyPreferences),
    priceRange: cleanText(source.priceRange, 180),
    financingReadiness: cleanText(source.financingReadiness, 220),
    timeline: cleanText(source.timeline, 220),
    strategy: cleanText(source.strategy, 300),
    motivations: uniqueStrings(source.motivations),
    objections,
    nextBestAction: cleanText(source.nextBestAction, 420),
    promisedNextStep: cleanText(source.promisedNextStep, 420),
    missingDiscovery: uniqueStrings(source.missingDiscovery),
    scoreReasons: uniqueStrings(source.scoreReasons),
    confidence: confidence as SignalConfidence,
    intentTier: intentTier as IntentTier,
    intentScore: Math.min(100, Math.max(0, Math.round(Number(source.intentScore) || 0))),
  };
}

function normalSignals(value: unknown): ExtractedSignal[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<SignalKey>([
    "target_market", "property_preference", "price_range", "financing_readiness",
    "timeline", "strategy", "motivation", "objection", "next_step", "communication_preference",
  ]);
  const byKey = new Map<SignalKey, ExtractedSignal>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const signal = candidate as Record<string, unknown>;
    const key = signal.signalKey as SignalKey;
    const confidence = signal.confidence as SignalConfidence;
    if (!allowed.has(key) || !(["low", "medium", "high"] as const).includes(confidence)) continue;
    const normalized: ExtractedSignal = {
      signalKey: key,
      value: cleanText(signal.value, 500),
      confidence,
      evidenceExcerpt: cleanText(signal.evidenceExcerpt, 560),
      evidenceTimestamp: cleanText(signal.evidenceTimestamp, 32),
    };
    if (!normalized.value || !normalized.evidenceExcerpt) continue;
    const existing = byKey.get(key);
    const rank = { low: 1, medium: 2, high: 3 } as const;
    if (!existing || rank[normalized.confidence] >= rank[existing.confidence]) byKey.set(key, normalized);
  }
  return Array.from(byKey.values());
}

function mergeProfiles(previous: ExtractedProfile | null, next: ExtractedProfile): ExtractedProfile {
  if (!previous) return next;
  const preferNext = (value: string, prior: string) => value && value.toLowerCase() !== "unknown" ? value : prior;
  const rank = { low: 1, medium: 2, high: 3 } as const;
  return {
    ...next,
    executiveBriefing: preferNext(next.executiveBriefing, previous.executiveBriefing),
    investorProfile: preferNext(next.investorProfile, previous.investorProfile),
    targetMarkets: uniqueStrings([...previous.targetMarkets, ...next.targetMarkets]),
    propertyPreferences: uniqueStrings([...previous.propertyPreferences, ...next.propertyPreferences]),
    priceRange: preferNext(next.priceRange, previous.priceRange),
    financingReadiness: preferNext(next.financingReadiness, previous.financingReadiness),
    timeline: preferNext(next.timeline, previous.timeline),
    strategy: preferNext(next.strategy, previous.strategy),
    motivations: uniqueStrings([...previous.motivations, ...next.motivations]),
    objections: [...next.objections, ...previous.objections]
      .filter((entry, index, list) => list.findIndex(item => `${item.category}|${item.detail}` === `${entry.category}|${entry.detail}`) === index)
      .slice(0, 8),
    nextBestAction: preferNext(next.nextBestAction, previous.nextBestAction),
    promisedNextStep: preferNext(next.promisedNextStep, previous.promisedNextStep),
    missingDiscovery: uniqueStrings([...next.missingDiscovery, ...previous.missingDiscovery]),
    scoreReasons: uniqueStrings([...next.scoreReasons, ...previous.scoreReasons]),
    confidence: rank[next.confidence] >= rank[previous.confidence] ? next.confidence : previous.confidence,
    intentTier: next.intentTier === "unknown" ? previous.intentTier : next.intentTier,
    intentScore: next.intentScore || previous.intentScore,
  };
}

function contactSummary(profile: ExtractedProfile): string {
  const unknown = (value: string) => !value || value.toLowerCase() === "unknown" || value.toLowerCase() === "not discussed";
  const lines = [
    `Current objective: ${profile.executiveBriefing || "A recent call has been analyzed; no concise objective was available."}`,
    `Buy box & readiness: ${[profile.targetMarkets.length ? `Markets: ${profile.targetMarkets.join(", ")}` : "Markets not yet established", profile.propertyPreferences.length ? `Property: ${profile.propertyPreferences.join(", ")}` : "Property preferences not yet established", !unknown(profile.priceRange) ? `Range: ${profile.priceRange}` : "Price range not discussed", !unknown(profile.financingReadiness) ? `Financing: ${profile.financingReadiness}` : "Financing readiness not discussed", !unknown(profile.timeline) ? `Timeline: ${profile.timeline}` : "Timeline not discussed"].join(". ")}.`,
    `Conversation & engagement: ${profile.investorProfile || "Investor context remains incomplete."} Intent is ${profile.intentTier} (${profile.intentScore}/100) based on ${profile.scoreReasons.join("; ") || "the available conversation evidence"}.`,
    `Open objections or risks: ${profile.objections.filter(item => item.status === "open").map(item => `${item.category}: ${item.detail}`).join("; ") || "No active objection was clearly stated in the analyzed conversations."}`,
    `Recommended next action: ${profile.nextBestAction || "Review the latest call and agree one specific next outreach action."}${profile.promisedNextStep ? ` Explicit commitment: ${profile.promisedNextStep}` : ""}`,
  ];
  return lines.join("\n\n");
}

function extractSummary(body: string | null): string {
  const match = (body ?? "").match(/\n\n(?:AI|Aircall) Summary:\n([\s\S]*)$/i);
  return cleanText(match?.[1] ?? "", 3_000);
}

/**
 * A strict, non-inferential fallback for a provider response that is empty or
 * invalid in both structured modes. It preserves the native Aircall summary but
 * deliberately creates no extracted signals, intent tier, or action claim. This
 * keeps the durable queue moving without letting a provider outage manufacture
 * contact facts.
 */
function nativeSummaryFallback(input: Awaited<ReturnType<typeof getJobInput>>): ExtractionResult {
  const summary = extractSummary(input.communication.body);
  return {
    profile: {
      executiveBriefing: summary || "A completed native Aircall transcript is available, but structured Contact Intelligence extraction was unavailable for this call.",
      investorProfile: "Unknown",
      targetMarkets: [],
      propertyPreferences: [],
      priceRange: "Unknown",
      financingReadiness: "Unknown",
      timeline: "Unknown",
      strategy: "Unknown",
      motivations: [],
      objections: [],
      nextBestAction: "Review the linked native Aircall transcript and summary before deciding a follow-up action.",
      promisedNextStep: "",
      missingDiscovery: ["Structured conversation extraction was unavailable; review the source before relying on this profile."],
      scoreReasons: ["No intent score was assigned because a structured model response was unavailable."],
      confidence: "low",
      intentTier: "unknown",
      intentScore: 0,
    },
    signals: [],
    extractionMode: "native_summary_only",
    modelUsed: null,
  };
}

function retryDelay(attempts: number): number {
  return Math.min(6 * 60 * 60_000, Math.max(60_000, 60_000 * 2 ** Math.min(attempts - 1, 7)));
}

export function contactIntelligenceSourceHash(transcription: string, body: string | null): string {
  return createHash("sha256")
    .update(`${transcription}\n---SUMMARY---\n${extractSummary(body)}`)
    .digest("hex");
}

type EnqueueContactIntelligenceOptions = {
  backfillRunId?: number | null;
  extractionVersion?: string;
  // Historical reconciliation may reprocess a completed, identical source only
  // when the resolved current-version profile is missing. Normal webhook
  // delivery remains source-hash idempotent.
  forceReprocess?: boolean;
};

export async function enqueueContactIntelligenceForCommunication(
  communicationId: number,
  options: EnqueueContactIntelligenceOptions = {}
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db.select({
    communicationId: communications.id,
    // Newer communication records carry relatedContactId, while a small set of
    // historic Aircall imports retained their verified match only on the call.
    // Either record is sufficient evidence to enrich the same CRM contact.
    contactId: sql<number>`COALESCE(${communications.relatedContactId}, ${aircallCalls.contactId})`,
    transcription: communications.transcription,
    body: communications.body,
    aircallCallId: aircallCalls.aircallCallId,
  }).from(communications)
    .innerJoin(aircallCalls, eq(aircallCalls.communicationId, communications.id))
    .where(eq(communications.id, communicationId))
    .limit(1);
  if (!row?.contactId || !row.transcription?.trim() || !row.aircallCallId) return;

  const now = new Date();
  const sourceHash = contactIntelligenceSourceHash(row.transcription, row.body);
  const extractionVersion = options.extractionVersion ?? CONTACT_INTELLIGENCE_EXTRACTION_VERSION;
  await db.insert(contactIntelligenceJobs).values({
    aircallCallId: row.aircallCallId,
    contactId: row.contactId,
    communicationId: row.communicationId,
    backfillRunId: options.backfillRunId ?? null,
    sourceHash,
    extractionVersion,
    status: "pending",
    nextAttemptAt: now,
  }).onDuplicateKeyUpdate({
    set: options.forceReprocess
      ? {
        backfillRunId: options.backfillRunId ?? null,
        status: "pending",
        attempts: 0,
        nextAttemptAt: now,
        leaseExpiresAt: null,
        lastAttemptAt: null,
        processedAt: null,
        lastError: null,
        extractionMode: null,
        modelUsed: null,
        updatedAt: now,
      }
      : { updatedAt: now },
  });
}

async function getJobInput(jobId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db.select({
    job: contactIntelligenceJobs,
    contact: contacts,
    communication: communications,
    call: aircallCalls,
  }).from(contactIntelligenceJobs)
    .innerJoin(contacts, eq(contacts.id, contactIntelligenceJobs.contactId))
    .innerJoin(communications, eq(communications.id, contactIntelligenceJobs.communicationId))
    .innerJoin(aircallCalls, eq(aircallCalls.aircallCallId, contactIntelligenceJobs.aircallCallId))
    .where(eq(contactIntelligenceJobs.id, jobId))
    .limit(1);
  if (!row) throw new Error(`Contact Intelligence job ${jobId} was not found`);
  if (!row.communication.transcription?.trim()) throw new Error("Contact Intelligence requires a completed native Aircall transcript");
  return row;
}

async function extractConversationIntelligence(input: Awaited<ReturnType<typeof getJobInput>>): Promise<ExtractionResult> {
  const transcript = input.communication.transcription?.trim() ?? "";
  const clippedTranscript = transcript.length > MAX_TRANSCRIPT_CHARS
    ? `${transcript.slice(0, MAX_TRANSCRIPT_CHARS).trimEnd()}\n[Transcript clipped for this extraction; use the linked source call for the complete record.]`
    : transcript;
  const summary = extractSummary(input.communication.body);
  const contactName = `${input.contact.firstName} ${input.contact.lastName}`.trim();
  const contactContext = [
    `Contact: ${contactName || "Unknown"}`,
    input.contact.isaStatus ? `Current CRM lifecycle: ${input.contact.isaStatus}` : "Current CRM lifecycle: not recorded",
    input.contact.notes ? `Existing human contact notes: ${cleanText(input.contact.notes, 1_200)}` : "Existing human contact notes: none",
    `Call direction: ${input.call.direction}; duration: ${input.call.duration ?? "unknown"} seconds; call date: ${input.call.startedAt?.toISOString?.() ?? "unknown"}`,
  ].join("\n");
  const system = `You are a careful real-estate conversation analyst for Savvy STR Agents. Extract only business-relevant, evidence-supported investor signals from a native Aircall transcript and its native summary. This is a sales-assist profile, not an authority to edit CRM facts.

Rules:
- Use only the supplied transcript, native Aircall summary, and limited CRM context. Do not invent, guess, or calculate facts.
- If a field was not clearly discussed, use "Unknown" for scalar fields and an empty array for lists. Do not turn a vague conversation into a commitment.
- Do not extract or infer protected traits, health information, income, credit score, legal conclusions, identity changes, addresses, consent, or Do-Not-Contact status.
- The contact's own statements are stronger evidence than an agent's speculation. Include only 1 short evidence excerpt per extracted signal, preserving the source wording without personally identifying information beyond what appears in the call.
- An objection is open only when it remains unresolved in the conversation. Use "addressed" or "resolved" when the conversation clearly supports that status.
- Intent is an explainable prioritization tier, not a probability of closing. A priority tier requires explicit near-term intent or a clear requested next step plus meaningful readiness.
- Never propose automatic CRM field changes, send client messages, or invent deadlines.
- Return strict JSON matching the schema.`;
  const user = `${contactContext}\n\n=== Native Aircall summary ===\n${summary || "No native summary was available."}\n\n=== Native Aircall transcript ===\n${clippedTranscript}`;
  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
  const validate = (raw: string, modelUsed: string): ExtractionResult => {
    const parsed = parseStructuredResponse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("Contact Intelligence model response was empty");
    const result = parsed as Record<string, unknown>;
    const profile = normalProfile(result.profile);
    if (!profile) throw new Error("Contact Intelligence model profile did not pass validation");
    return {
      profile,
      signals: normalSignals(result.signals),
      extractionMode: "structured",
      modelUsed,
    };
  };

  let primarySchemaError: unknown;
  try {
    const schemaResponse = await invokeLLM({
      model: PRIMARY_EXTRACTION_MODEL,
      maxTokens: 2_800,
      responseFormat: { type: "json_schema", json_schema: extractionSchema },
      messages,
    });
    return validate(responseText(schemaResponse), PRIMARY_EXTRACTION_MODEL);
  } catch (error) {
    primarySchemaError = error;
  }
  // First retry in broadly supported JSON object mode on the same long-context
  // provider. The strict prompt and application validator still govern storage.
  let primaryJsonError: unknown;
  try {
    const jsonFallbackResponse = await invokeLLM({
      model: PRIMARY_EXTRACTION_MODEL,
      maxTokens: 2_800,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${system}\n\nFallback format instruction: emit one JSON object only. Do not use Markdown fences, commentary, or a preface.`,
        },
        { role: "user", content: user },
      ],
    });
    return validate(responseText(jsonFallbackResponse), PRIMARY_EXTRACTION_MODEL);
  } catch (error) {
    primaryJsonError = error;
  }
  // A provider-level fallback helps avoid turning otherwise analyzable calls
  // into summary-only profiles because of a transient output-format quirk.
  try {
    const secondaryResponse = await invokeLLM({
      model: SECONDARY_EXTRACTION_MODEL,
      maxTokens: 2_800,
      responseFormat: { type: "json_schema", json_schema: extractionSchema },
      messages,
    });
    return validate(responseText(secondaryResponse), SECONDARY_EXTRACTION_MODEL);
  } catch (secondaryError) {
    const initialMessage = primarySchemaError instanceof Error ? primarySchemaError.message : String(primarySchemaError);
    const jsonMessage = primaryJsonError instanceof Error ? primaryJsonError.message : String(primaryJsonError);
    const secondaryMessage = secondaryError instanceof Error ? secondaryError.message : String(secondaryError);
    console.warn(`[ContactIntelligence] Structured extraction unavailable; persisting native-summary-only fallback. Primary schema: ${initialMessage}; primary JSON: ${jsonMessage}; secondary schema: ${secondaryMessage}`);
    return nativeSummaryFallback(input);
  }
}

async function saveExtraction(jobId: number, extraction: ExtractionResult): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const input = await getJobInput(jobId);
  const [existingProfile] = await db.select().from(contactIntelligenceProfiles)
    .where(eq(contactIntelligenceProfiles.contactId, input.job.contactId))
    .limit(1);
  let resolved = mergeProfiles(normalProfile(existingProfile?.profile), extraction.profile);
  // A human correction is a durable override of the derived profile. A later
  // transcript may add evidence, but it may not erase the reviewed value.
  const corrections = await db.select({
    signalKey: contactIntelligenceSignals.signalKey,
    overrideValue: contactIntelligenceSignalReviews.overrideValue,
  }).from(contactIntelligenceSignals)
    .innerJoin(
      contactIntelligenceSignalReviews,
      eq(contactIntelligenceSignalReviews.signalId, contactIntelligenceSignals.id)
    )
    .where(and(
      eq(contactIntelligenceSignals.contactId, input.job.contactId),
      eq(contactIntelligenceSignalReviews.disposition, "corrected"),
    ));
  for (const correction of corrections) {
    const overrideValue = cleanText(correction.overrideValue, 500);
    if (overrideValue) resolved = setProfileScalar(resolved, correction.signalKey as SignalKey, overrideValue);
  }
  const now = new Date();
  const lastSourceAt = input.call.startedAt ?? input.communication.communicatedAt ?? now;
  const values = {
    profile: resolved as Record<string, unknown>,
    aiSummary: contactSummary(resolved),
    intentTier: resolved.intentTier,
    intentScore: resolved.intentScore,
    confidence: resolved.confidence,
    sourceCallCount: existingProfile?.sourceCallCount ?? 0,
    latestSourceAt: lastSourceAt,
    lastAnalyzedAt: now,
    extractionVersion: CONTACT_INTELLIGENCE_EXTRACTION_VERSION,
    extractionMode: extraction.extractionMode,
    modelUsed: extraction.modelUsed,
    updatedAt: now,
  };
  await db.insert(contactIntelligenceProfiles).values({ contactId: input.job.contactId, ...values })
    .onDuplicateKeyUpdate({ set: values });
  const [profile] = await db.select({ id: contactIntelligenceProfiles.id })
    .from(contactIntelligenceProfiles)
    .where(eq(contactIntelligenceProfiles.contactId, input.job.contactId))
    .limit(1);
  if (!profile) throw new Error("Contact Intelligence profile could not be saved");

  for (const signal of extraction.signals) {
    await db.insert(contactIntelligenceSignals).values({
      contactId: input.job.contactId,
      profileId: profile.id,
      aircallCallId: input.job.aircallCallId,
      communicationId: input.job.communicationId,
      sourceHash: input.job.sourceHash,
      signalKey: signal.signalKey,
      value: signal.value,
      confidence: signal.confidence,
      evidenceExcerpt: signal.evidenceExcerpt,
      evidenceTimestamp: signal.evidenceTimestamp || null,
      sourceOccurredAt: lastSourceAt,
      extractionVersion: CONTACT_INTELLIGENCE_EXTRACTION_VERSION,
      status: "active",
    }).onDuplicateKeyUpdate({
      set: {
        profileId: profile.id,
        value: signal.value,
        confidence: signal.confidence,
        evidenceExcerpt: signal.evidenceExcerpt,
        evidenceTimestamp: signal.evidenceTimestamp || null,
        sourceOccurredAt: lastSourceAt,
        status: "active",
        extractionVersion: CONTACT_INTELLIGENCE_EXTRACTION_VERSION,
        updatedAt: now,
      },
    });
  }

  const [callCountRow] = await db.select({ count: sql<number>`COUNT(DISTINCT ${contactIntelligenceSignals.aircallCallId})` })
    .from(contactIntelligenceSignals)
    .where(eq(contactIntelligenceSignals.contactId, input.job.contactId));
  await db.update(contactIntelligenceProfiles).set({
    sourceCallCount: Number(callCountRow?.count ?? 0),
    updatedAt: now,
  }).where(eq(contactIntelligenceProfiles.id, profile.id));

  // The generated contact briefing is derived data. It is intentionally the only
  // existing contact field updated automatically; staff-owned CRM fields stay put.
  await db.update(contacts).set({ aiSummary: values.aiSummary, aiSummaryUpdatedAt: now })
    .where(eq(contacts.id, input.job.contactId));
  await db.insert(activityLog).values({
    action: "contact_intelligence_updated",
    entityType: "contact_intelligence",
    entityId: profile.id,
    relatedContactId: input.job.contactId,
    details: {
      source: "native_aircall_transcript",
      sourceCallId: input.job.aircallCallId,
      signalCount: extraction.signals.length,
      intentTier: resolved.intentTier,
      confidence: resolved.confidence,
      extractionVersion: CONTACT_INTELLIGENCE_EXTRACTION_VERSION,
    },
  });
}

async function processJob(jobId: number): Promise<ExtractionResult> {
  const input = await getJobInput(jobId);
  const extraction = await extractConversationIntelligence(input);
  await saveExtraction(jobId, extraction);
  // This message is deliberately PII-free. It confirms every production prompt
  // run without sending customer content or record identifiers to Slack.
  void notifySavvyOSPromptRun({
    title: "Contact Intelligence profile refreshed",
    summary: `A native Aircall transcript was analyzed with the Contact Intelligence ${CONTACT_INTELLIGENCE_EXTRACTION_VERSION} extraction schema. The evidence-linked profile and AI contact briefing were refreshed; no human-managed CRM fields were changed.`,
    actionUrl: "/analytics/conversation-intelligence",
  });
  return extraction;
}

export async function processDueContactIntelligenceJobs(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  try {
    const db = await getDb();
    if (!db) return;
    const now = new Date();
    await db.update(contactIntelligenceJobs).set({
      status: "failed",
      nextAttemptAt: null,
      leaseExpiresAt: null,
      processedAt: now,
      lastError: sql`COALESCE(${contactIntelligenceJobs.lastError}, 'Contact Intelligence stopped after maximum attempts')`,
    }).where(and(
      sql`${contactIntelligenceJobs.attempts} >= ${MAX_JOB_ATTEMPTS}`,
      or(
        inArray(contactIntelligenceJobs.status, ["pending", "retrying"]),
        and(eq(contactIntelligenceJobs.status, "processing"), lte(contactIntelligenceJobs.leaseExpiresAt, now)),
      ),
    ));
    const jobs = await db.select({ id: contactIntelligenceJobs.id })
      .from(contactIntelligenceJobs)
      .where(and(
        or(
          and(
          inArray(contactIntelligenceJobs.status, ["pending", "retrying"]),
          sql`${contactIntelligenceJobs.attempts} < ${MAX_JOB_ATTEMPTS}`,
          or(isNull(contactIntelligenceJobs.nextAttemptAt), lte(contactIntelligenceJobs.nextAttemptAt, now)),
          ),
          and(
          eq(contactIntelligenceJobs.status, "processing"),
          sql`${contactIntelligenceJobs.attempts} < ${MAX_JOB_ATTEMPTS}`,
          lte(contactIntelligenceJobs.leaseExpiresAt, now),
          ),
        ),
        sql`(
        ${contactIntelligenceJobs.backfillRunId} IS NULL
        OR EXISTS (
          SELECT 1 FROM \`contact_intelligence_backfill_runs\` campaign
          WHERE campaign.\`id\` = ${contactIntelligenceJobs.backfillRunId}
            AND campaign.\`status\` = 'running'
        )
        )`
      ))
      .orderBy(contactIntelligenceJobs.createdAt)
      .limit(MAX_JOB_BATCH);

    await Promise.all(jobs.map(async (job) => {
      await db.update(contactIntelligenceJobs).set({
        status: "processing",
        attempts: sql`${contactIntelligenceJobs.attempts} + 1`,
        lastAttemptAt: now,
        leaseExpiresAt: new Date(Date.now() + JOB_LEASE_MS),
      }).where(eq(contactIntelligenceJobs.id, job.id));
      try {
        const extraction = await processJob(job.id);
        await db.update(contactIntelligenceJobs).set({
          status: "completed",
          processedAt: new Date(),
          nextAttemptAt: null,
          leaseExpiresAt: null,
          lastError: null,
          extractionMode: extraction.extractionMode,
          modelUsed: extraction.modelUsed,
        }).where(eq(contactIntelligenceJobs.id, job.id));
      } catch (error) {
        const [current] = await db.select({ attempts: contactIntelligenceJobs.attempts })
          .from(contactIntelligenceJobs)
          .where(eq(contactIntelligenceJobs.id, job.id))
          .limit(1);
        const attempts = current?.attempts ?? 1;
        const message = error instanceof Error ? error.message : String(error);
        await db.update(contactIntelligenceJobs).set({
          status: attempts >= MAX_JOB_ATTEMPTS ? "failed" : "retrying",
          nextAttemptAt: attempts >= MAX_JOB_ATTEMPTS ? null : new Date(Date.now() + retryDelay(attempts)),
          leaseExpiresAt: null,
          processedAt: attempts >= MAX_JOB_ATTEMPTS ? new Date() : null,
          lastError: message.slice(0, 512),
        }).where(eq(contactIntelligenceJobs.id, job.id));
        console.error(`[ContactIntelligence] Job ${job.id} ${attempts >= MAX_JOB_ATTEMPTS ? "failed" : "will retry"}: ${message}`);
      }
    }));
  } finally {
    workerRunning = false;
    // A completed batch frees campaign capacity. Refill only through the durable
    // run state, never from an HTTP request, so campaign controls stay auditable.
    void refillActiveBackfillRuns();
  }
}

export function scheduleContactIntelligence(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  void processDueContactIntelligenceJobs();
  setInterval(() => { void processDueContactIntelligenceJobs(); }, JOB_INTERVAL_MS);
}

function setProfileScalar(profile: ExtractedProfile, key: SignalKey, value: string): ExtractedProfile {
  const next = { ...profile };
  if (key === "target_market") next.targetMarkets = uniqueStrings([value, ...next.targetMarkets]);
  if (key === "property_preference") next.propertyPreferences = uniqueStrings([value, ...next.propertyPreferences]);
  if (key === "price_range") next.priceRange = value;
  if (key === "financing_readiness") next.financingReadiness = value;
  if (key === "timeline") next.timeline = value;
  if (key === "strategy") next.strategy = value;
  if (key === "motivation") next.motivations = uniqueStrings([value, ...next.motivations]);
  if (key === "next_step") next.nextBestAction = value;
  if (key === "objection") next.objections = [{ category: "Reviewed", status: "open" as const, detail: value }, ...next.objections].slice(0, 8);
  return next;
}

export async function reviewContactIntelligenceSignal(input: {
  signalId: number;
  reviewerId: number;
  disposition: "accepted" | "rejected" | "corrected";
  overrideValue?: string | null;
  note?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [signal] = await db.select().from(contactIntelligenceSignals)
    .where(eq(contactIntelligenceSignals.id, input.signalId))
    .limit(1);
  if (!signal) throw new Error("Contact Intelligence signal was not found");
  const now = new Date();
  const overrideValue = cleanText(input.overrideValue, 500) || null;
  if (input.disposition === "corrected" && !overrideValue) throw new Error("A corrected signal needs a replacement value");
  await db.insert(contactIntelligenceSignalReviews).values({
    signalId: signal.id,
    reviewerId: input.reviewerId,
    disposition: input.disposition,
    overrideValue,
    note: cleanText(input.note, 1_000) || null,
  }).onDuplicateKeyUpdate({
    set: {
      reviewerId: input.reviewerId,
      disposition: input.disposition,
      overrideValue,
      note: cleanText(input.note, 1_000) || null,
      updatedAt: now,
    },
  });
  await db.update(contactIntelligenceSignals).set({
    status: input.disposition === "rejected" ? "dismissed" : "active",
    updatedAt: now,
  }).where(eq(contactIntelligenceSignals.id, signal.id));
  if (input.disposition === "corrected" && overrideValue) {
    const [profile] = await db.select().from(contactIntelligenceProfiles)
      .where(eq(contactIntelligenceProfiles.contactId, signal.contactId))
      .limit(1);
    const existing = normalProfile(profile?.profile);
    if (profile && existing) {
      const resolved = setProfileScalar(existing, signal.signalKey as SignalKey, overrideValue);
      const summary = contactSummary(resolved);
      await db.update(contactIntelligenceProfiles).set({ profile: resolved as Record<string, unknown>, aiSummary: summary, updatedAt: now })
        .where(eq(contactIntelligenceProfiles.id, profile.id));
      await db.update(contacts).set({ aiSummary: summary, aiSummaryUpdatedAt: now })
        .where(eq(contacts.id, signal.contactId));
    }
  }
  await db.insert(activityLog).values({
    userId: input.reviewerId,
    action: "contact_intelligence_signal_reviewed",
    entityType: "contact_intelligence_signal",
    entityId: signal.id,
    relatedContactId: signal.contactId,
    details: { disposition: input.disposition, signalKey: signal.signalKey, sourceCallId: signal.aircallCallId },
  });
}

export async function getContactIntelligence(contactId: number) {
  const db = await getDb();
  if (!db) return { profile: null, signals: [] };
  const [profile] = await db.select().from(contactIntelligenceProfiles)
    .where(eq(contactIntelligenceProfiles.contactId, contactId))
    .limit(1);
  const signals = await db.select({
    signal: contactIntelligenceSignals,
    review: contactIntelligenceSignalReviews,
    reviewer: { id: users.id, name: users.name },
  }).from(contactIntelligenceSignals)
    .leftJoin(contactIntelligenceSignalReviews, eq(contactIntelligenceSignalReviews.signalId, contactIntelligenceSignals.id))
    .leftJoin(users, eq(users.id, contactIntelligenceSignalReviews.reviewerId))
    .where(eq(contactIntelligenceSignals.contactId, contactId))
    .orderBy(desc(contactIntelligenceSignals.sourceOccurredAt), desc(contactIntelligenceSignals.createdAt))
    .limit(80);
  return { profile, signals };
}

type BackfillStatus = "running" | "paused" | "completed" | "cancelled";

export type ContactIntelligenceBackfillOptions = {
  name?: string;
  limit?: number;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  minimumDurationSeconds?: number;
  actionableOnly?: boolean;
  createdById?: number | null;
};

type BackfillCandidate = { communicationId: number };

function getBackfillDateStart(): Date {
  const start = new Date();
  start.setDate(start.getDate() - 89);
  start.setHours(0, 0, 0, 0);
  return start;
}

async function readBackfillCandidates(
  run: typeof contactIntelligenceBackfillRuns.$inferSelect,
  limit: number
): Promise<BackfillCandidate[]> {
  const db = await getDb();
  if (!db || limit < 1) return [];
  const actionableClause = run.actionableOnly
    ? sql`AND c.\`archived_at\` IS NULL AND c.\`doNotContact\` = 0 AND c.\`isa_status\` IN ('new_lead', 'attempted_contact', 'nurture', 'active_client')`
    : sql``;
  const rows = await (db as unknown as { execute: (query: SQL) => Promise<unknown> }).execute(sql`
    WITH ranked_candidates AS (
      SELECT
        comm.\`id\` AS communicationId,
        ac.\`contactId\` AS contactId,
        ROW_NUMBER() OVER (
          PARTITION BY ac.\`contactId\`
          ORDER BY ac.\`startedAt\` DESC, ac.\`aircallCallId\` DESC
        ) AS rowNumber
      FROM \`aircall_calls\` ac
      INNER JOIN \`communications\` comm ON comm.\`id\` = ac.\`communicationId\`
      INNER JOIN \`contacts\` c ON c.\`id\` = ac.\`contactId\`
      LEFT JOIN \`contact_intelligence_profiles\` profile ON profile.\`contactId\` = ac.\`contactId\`
      WHERE ac.\`contactId\` IS NOT NULL
        AND comm.\`transcription\` IS NOT NULL
        AND CHAR_LENGTH(TRIM(comm.\`transcription\`)) > 0
        AND (profile.\`id\` IS NULL OR profile.\`extractionVersion\` <> ${run.extractionVersion})
        AND ac.\`duration\` >= ${run.minimumDurationSeconds}
        ${run.dateFrom ? sql`AND ac.\`startedAt\` >= ${run.dateFrom}` : sql``}
        ${run.dateTo ? sql`AND ac.\`startedAt\` < DATE_ADD(${run.dateTo}, INTERVAL 1 DAY)` : sql``}
        ${actionableClause}
        AND NOT EXISTS (
          SELECT 1
          FROM \`contact_intelligence_jobs\` queued
          WHERE queued.\`contactId\` = ac.\`contactId\`
            AND queued.\`extractionVersion\` = ${run.extractionVersion}
            AND queued.\`status\` IN ('pending', 'processing', 'retrying')
        )
    )
    SELECT communicationId
    FROM ranked_candidates
    WHERE rowNumber = 1
    ORDER BY communicationId DESC
    LIMIT ${limit}
  `);
  return rowsFromResult<BackfillCandidate>(rows);
}

async function refreshBackfillRun(runId: number): Promise<typeof contactIntelligenceBackfillRuns.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;
  const [run] = await db.select().from(contactIntelligenceBackfillRuns)
    .where(eq(contactIntelligenceBackfillRuns.id, runId))
    .limit(1);
  if (!run) return null;
  const [counts] = await db.select({
    queued: sql<number>`COUNT(DISTINCT ${contactIntelligenceJobs.contactId})`,
    completed: sql<number>`COUNT(DISTINCT CASE WHEN ${contactIntelligenceJobs.status} = 'completed' THEN ${contactIntelligenceJobs.contactId} END)`,
    structured: sql<number>`COUNT(DISTINCT CASE WHEN ${contactIntelligenceJobs.status} = 'completed' AND ${contactIntelligenceJobs.extractionMode} = 'structured' THEN ${contactIntelligenceJobs.contactId} END)`,
    nativeSummaryOnly: sql<number>`COUNT(DISTINCT CASE WHEN ${contactIntelligenceJobs.status} = 'completed' AND ${contactIntelligenceJobs.extractionMode} = 'native_summary_only' THEN ${contactIntelligenceJobs.contactId} END)`,
    inFlight: sql<number>`COUNT(DISTINCT CASE WHEN ${contactIntelligenceJobs.status} IN ('pending', 'processing', 'retrying') THEN ${contactIntelligenceJobs.contactId} END)`,
  }).from(contactIntelligenceJobs)
    .where(eq(contactIntelligenceJobs.backfillRunId, runId));
  const now = new Date();
  await db.update(contactIntelligenceBackfillRuns).set({
    queuedContacts: Number(counts?.queued ?? 0),
    completedContacts: Number(counts?.completed ?? 0),
    structuredContacts: Number(counts?.structured ?? 0),
    nativeSummaryOnlyContacts: Number(counts?.nativeSummaryOnly ?? 0),
    updatedAt: now,
  }).where(eq(contactIntelligenceBackfillRuns.id, runId));
  const [refreshed] = await db.select().from(contactIntelligenceBackfillRuns)
    .where(eq(contactIntelligenceBackfillRuns.id, runId))
    .limit(1);
  return refreshed ?? null;
}

async function fillBackfillRun(runId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const run = await refreshBackfillRun(runId);
  if (!run || run.status !== "running") return;
  const inFlightRows = await db.select({
    count: sql<number>`COUNT(DISTINCT CASE WHEN ${contactIntelligenceJobs.status} IN ('pending', 'processing', 'retrying') THEN ${contactIntelligenceJobs.contactId} END)`,
  }).from(contactIntelligenceJobs)
    .where(eq(contactIntelligenceJobs.backfillRunId, run.id));
  const inFlight = Number(inFlightRows[0]?.count ?? 0);
  if (run.queuedContacts >= run.targetContacts && inFlight === 0) {
    await db.update(contactIntelligenceBackfillRuns).set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(contactIntelligenceBackfillRuns.id, run.id));
    return;
  }
  const remainingTarget = Math.max(0, run.targetContacts - run.queuedContacts);
  const capacity = Math.min(MAX_BACKFILL_IN_FLIGHT - inFlight, remainingTarget);
  if (capacity <= 0) return;
  const candidates = await readBackfillCandidates(run, capacity);
  if (candidates.length === 0) {
    if (inFlight === 0) {
      await db.update(contactIntelligenceBackfillRuns).set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(contactIntelligenceBackfillRuns.id, run.id));
    }
    return;
  }
  for (const candidate of candidates) {
    await enqueueContactIntelligenceForCommunication(candidate.communicationId, {
      backfillRunId: run.id,
      extractionVersion: run.extractionVersion,
      forceReprocess: true,
    });
  }
  await db.update(contactIntelligenceBackfillRuns).set({
    lastQueuedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(contactIntelligenceBackfillRuns.id, run.id));
  await refreshBackfillRun(run.id);
}

async function refillActiveBackfillRuns(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const runs = await db.select({ id: contactIntelligenceBackfillRuns.id })
    .from(contactIntelligenceBackfillRuns)
    .where(eq(contactIntelligenceBackfillRuns.status, "running"))
    .orderBy(contactIntelligenceBackfillRuns.createdAt)
    .limit(3);
  for (const run of runs) await fillBackfillRun(run.id);
}

export async function startContactIntelligenceBackfill(
  options: ContactIntelligenceBackfillOptions = {}
): Promise<{ runId: number; queued: number; targetContacts: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date();
  const targetContacts = Math.min(5_000, Math.max(1, options.limit ?? DEFAULT_BACKFILL_LIMIT));
  const dateFrom = options.dateFrom ?? getBackfillDateStart();
  const dateTo = options.dateTo ?? now;
  const result = await db.insert(contactIntelligenceBackfillRuns).values({
    name: cleanText(options.name, 255) || "Current 90-day Contact Intelligence enrichment",
    status: "running",
    extractionVersion: CONTACT_INTELLIGENCE_EXTRACTION_VERSION,
    dateFrom,
    dateTo,
    minimumDurationSeconds: Math.max(0, Math.min(3_600, Math.round(options.minimumDurationSeconds ?? 90))),
    actionableOnly: options.actionableOnly ?? true,
    targetContacts,
    createdById: options.createdById ?? null,
  });
  const runId = Number(result[0].insertId);
  await fillBackfillRun(runId);
  const run = await refreshBackfillRun(runId);
  return {
    runId,
    queued: run?.queuedContacts ?? 0,
    targetContacts,
  };
}

export async function getContactIntelligenceBackfillRuns() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contactIntelligenceBackfillRuns)
    .orderBy(desc(contactIntelligenceBackfillRuns.createdAt))
    .limit(12);
}

export async function updateContactIntelligenceBackfillRun(
  runId: number,
  status: Extract<BackfillStatus, "running" | "paused" | "cancelled">
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [run] = await db.select().from(contactIntelligenceBackfillRuns)
    .where(eq(contactIntelligenceBackfillRuns.id, runId))
    .limit(1);
  if (!run) throw new Error("Contact Intelligence campaign was not found");
  if (run.status === "completed" || run.status === "cancelled") {
    throw new Error("A completed or cancelled Contact Intelligence campaign cannot be restarted");
  }
  await db.update(contactIntelligenceBackfillRuns).set({
    status,
    updatedAt: new Date(),
  }).where(eq(contactIntelligenceBackfillRuns.id, runId));
  if (status === "running") await fillBackfillRun(runId);
}

/** Legacy bounded pilot helper retained for the admin page while campaigns roll out. */
export async function queueContactIntelligenceBackfill(limit = 25): Promise<{ queued: number }> {
  const result = await startContactIntelligenceBackfill({
    name: "Manual Contact Intelligence pilot",
    limit: Math.min(100, Math.max(1, limit)),
    minimumDurationSeconds: 0,
    actionableOnly: false,
  });
  return { queued: result.queued };
}

export const __testables__ = {
  cleanText,
  contactIntelligenceSourceHash,
  contactSummary,
  extractionSchema,
  mergeProfiles,
  normalProfile,
  normalSignals,
  nativeSummaryFallback,
  parseStructuredResponse,
};
