/**
 * Aircall Transcription & AI Summary Module
 *
 * Provides two functions:
 *  - transcribeRecording()  — downloads the S3 recording and sends it to the configured transcription service
 *  - generateCallSummary()  — sends the transcript to GPT for a concise summary
 *  - transcribeAndSummarize() — orchestrates both and updates the communications row
 */

import { ENV } from "./_core/env";
import { getDb } from "./db";
import { communications } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Whisper Transcription ────────────────────────────────────────────────────

/**
 * Download an audio file from S3 and transcribe it using OpenAI Whisper.
 * Returns the transcript text, or null on failure.
 */
export async function transcribeRecording(
  audioUrl: string,
  callId: number | string
): Promise<string | null> {
  const useForge = Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
  if (!useForge && !ENV.openaiApiKey) {
    console.warn("[Aircall Transcribe] No transcription credentials are configured — skipping transcription");
    return null;
  }

  try {
    // Download the audio from S3 (60s timeout to avoid hanging on large files)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let audioResponse: Response;
    try {
      audioResponse = await fetch(audioUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!audioResponse.ok) {
      console.error(`[Aircall Transcribe] Failed to download audio for call ${callId}: HTTP ${audioResponse.status}`);
      return null;
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });

    // Build multipart form for Whisper API
    const formData = new FormData();
    formData.append("file", audioBlob, `call-${callId}.mp3`);
    formData.append("model", "whisper-1");
    formData.append("language", "en");
    formData.append("response_format", "verbose_json");

    const forgeBaseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
    const directOpenAiBase = (process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const transcriptionUrl = useForge
      ? new URL("v1/audio/transcriptions", forgeBaseUrl).toString()
      : `${directOpenAiBase}/audio/transcriptions`;
    const response = await fetch(transcriptionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${useForge ? ENV.forgeApiKey : ENV.openaiApiKey}`,
        "Accept-Encoding": "identity",
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Aircall Transcribe] Whisper API error for call ${callId}: ${response.status} ${errText}`);
      return null;
    }

    const payload = await response.json() as { text?: string };
    const transcript = payload.text?.trim() ?? "";
    console.log(`[Aircall Transcribe] Transcribed call ${callId} — ${transcript.length} chars`);
    return transcript || null;
  } catch (err: any) {
    console.error(`[Aircall Transcribe] Error transcribing call ${callId}: ${err.message}`);
    return null;
  }
}

// ─── AI Summary ───────────────────────────────────────────────────────────────

/**
 * Generate a concise AI summary of a call transcript using GPT.
 * Returns a 2–4 sentence summary focused on what was discussed,
 * any next steps mentioned, and the overall outcome.
 */
export async function generateCallSummary(
  transcript: string,
  callMeta: {
    direction: string;
    duration?: number | null;
    contactName?: string;
    agentName?: string;
  }
): Promise<string | null> {
  const useForge = Boolean(ENV.forgeApiKey && ENV.forgeApiUrl);
  const useDirectOpenAi = Boolean(ENV.openaiApiKey);
  if (!useForge && !useDirectOpenAi) {
    console.warn("[Aircall Transcribe] No summary credentials are configured — skipping summary");
    return null;
  }

  if (!transcript || transcript.trim().length < 20) {
    return null; // Too short to summarize meaningfully
  }

  const dir = callMeta.direction === "inbound" ? "inbound" : "outbound";
  const dur = callMeta.duration ? `${Math.round(callMeta.duration / 60)} minutes` : "unknown duration";
  const contact = callMeta.contactName ?? "the contact";
  const agent = callMeta.agentName ?? "the agent";

  const systemPrompt = `You are a real estate CRM assistant. Summarize phone call transcripts for agents at a short-term rental investment company (Savvy STR Agents). Be concise, professional, and factual. Focus on: what was discussed, any properties or deals mentioned, next steps or follow-ups, and the outcome. Write in third person. Do not add information not in the transcript.`;

  const userPrompt = `Summarize this ${dir} call (${dur}) between ${agent} and ${contact}:

---
${transcript.slice(0, 4000)}
---

Write 2–4 sentences. Include: main topic, key points discussed, any next steps or commitments made, and overall outcome.`;

  try {
    const forgeBaseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
    const directOpenAiBase = (process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const summaryUrl = useForge
      ? new URL("v1/chat/completions", forgeBaseUrl).toString()
      : `${directOpenAiBase}/chat/completions`;
    const response = await fetch(summaryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${useForge ? ENV.forgeApiKey : ENV.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        // GPT-5 models only accept the default temperature. Keep the output cap
        // and use minimal reasoning, which is sufficient for concise call summaries.
        max_completion_tokens: 300,
        reasoning: { effort: "minimal" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Aircall Transcribe] GPT summary error: ${response.status} ${errText}`);
      return null;
    }

    const data = await response.json() as any;
    const summary = data?.choices?.[0]?.message?.content?.trim();
    return summary || null;
  } catch (err: any) {
    console.error(`[Aircall Transcribe] Error generating summary: ${err.message}`);
    return null;
  }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export interface TranscribeResult {
  communicationId: number;
  aircallCallId: number;
  transcript: string | null;
  summary: string | null;
  skipped?: boolean;
  reason?: string;
}

/**
 * Full pipeline: transcribe the recording, generate a summary, and update
 * the communications row with both. Also updates the body to include the summary.
 *
 * Safe to call multiple times — skips if transcription already exists.
 */
export async function transcribeAndSummarize(opts: {
  communicationId: number;
  aircallCallId: number;
  audioUrl: string;
  direction: string;
  duration?: number | null;
  contactName?: string;
  agentName?: string;
  forceRetranscribe?: boolean;
}): Promise<TranscribeResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Check if already transcribed
  if (!opts.forceRetranscribe) {
    const existing = await db
      .select({ transcription: communications.transcription, body: communications.body })
      .from(communications)
      .where(eq(communications.id, opts.communicationId))
      .limit(1);

    if (existing.length > 0 && existing[0].transcription) {
      const transcript = existing[0].transcription;
      if ((existing[0].body ?? "").includes("\n\nAI Summary:")) {
        return {
          communicationId: opts.communicationId,
          aircallCallId: opts.aircallCallId,
          transcript,
          summary: null,
          skipped: true,
          reason: "Already transcribed and summarized",
        };
      }
      const summary = await generateCallSummary(transcript, {
        direction: opts.direction,
        duration: opts.duration,
        contactName: opts.contactName,
        agentName: opts.agentName,
      });
      if (summary) {
        await db.update(communications)
          .set({ body: `${existing[0].body ?? ""}\n\nAI Summary:\n${summary}` })
          .where(eq(communications.id, opts.communicationId));
      }
      return {
        communicationId: opts.communicationId,
        aircallCallId: opts.aircallCallId,
        transcript,
        summary,
        skipped: !summary,
        reason: summary ? undefined : "Already transcribed; summary unavailable",
      };
    }
  }

  // Skip very short calls (under 10 seconds) — likely hangups
  if (opts.duration && opts.duration < 10) {
    return {
      communicationId: opts.communicationId,
      aircallCallId: opts.aircallCallId,
      transcript: null,
      summary: null,
      skipped: true,
      reason: "Call too short to transcribe",
    };
  }

  // Transcribe
  const transcript = await transcribeRecording(opts.audioUrl, opts.aircallCallId);

  // Generate summary
  let summary: string | null = null;
  if (transcript) {
    summary = await generateCallSummary(transcript, {
      direction: opts.direction,
      duration: opts.duration,
      contactName: opts.contactName,
      agentName: opts.agentName,
    });
  }

  // Build updated body: original call info + AI summary section
  if (transcript || summary) {
    const existingComm = await db
      .select({ body: communications.body })
      .from(communications)
      .where(eq(communications.id, opts.communicationId))
      .limit(1);

    const originalBody = existingComm[0]?.body ?? "";

    // Append AI summary to body if we have one
    let newBody = originalBody;
    if (summary) {
      // Replace any existing AI Summary section or append
      if (newBody.includes("\n\nAI Summary:")) {
        newBody = newBody.replace(/\n\nAI Summary:[\s\S]*$/, `\n\nAI Summary:\n${summary}`);
      } else {
        newBody = `${newBody}\n\nAI Summary:\n${summary}`;
      }
    }

    await db
      .update(communications)
      .set({
        transcription: transcript ?? undefined,
        body: newBody,
      })
      .where(eq(communications.id, opts.communicationId));

    console.log(
      `[Aircall Transcribe] Updated comm ${opts.communicationId} — transcript: ${transcript ? transcript.length + " chars" : "none"}, summary: ${summary ? "yes" : "no"}`
    );
  }

  return {
    communicationId: opts.communicationId,
    aircallCallId: opts.aircallCallId,
    transcript,
    summary,
  };
}
