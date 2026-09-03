/**
 * Aircall Live Webhook Handler
 * =============================
 * Every call event is durably committed before Aircall receives a 2xx response.
 * This prevents a deployment, crash, or transient downstream failure from losing
 * a recording-ready event after it has been acknowledged.
 */

import type { Express, Request, Response } from "express";
import type { AircallCallData } from "./aircall";
import { directionFromAircallMessageEvent, isAircallMessageWebhook, persistAircallMessage, type AircallMessageData } from "./aircallMessaging";
import {
  asAircallConversationIntelligenceWebhook,
  persistAircallConversationIntelligenceWebhook,
  persistAircallLiveTranscript,
  persistAircallWebhook,
  processDueAircallWebhookEvents,
  verifyAircallWebhookToken,
} from "./aircallReliability";

interface AircallWebhookPayload {
  event: string;
  resource: string;
  timestamp: number;
  token?: string;
  data: AircallCallData;
}

const DURABLE_CALL_EVENTS = new Set([
  "call.ended",
  "call.comm_assets_generated",
]);

function isValidPayload(payload: unknown): payload is AircallWebhookPayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<AircallWebhookPayload>;
  return Boolean(
    candidate.event
    && candidate.resource
    && candidate.data
    && typeof candidate.data.id === "number",
  );
}

export function registerAircallWebhook(app: Express): void {
  app.post("/api/webhooks/aircall", async (req: Request, res: Response) => {
    const payload = req.body as unknown;
    const messagePayload = isAircallMessageWebhook(payload);
    const callPayload = isValidPayload(payload);
    const conversationIntelligencePayload = asAircallConversationIntelligenceWebhook(payload);
    if (!callPayload && !messagePayload && !conversationIntelligencePayload) {
      console.warn("[Aircall Webhook] Rejected malformed payload");
      res.sendStatus(400);
      return;
    }

    const eventName = messagePayload
      ? (payload.event ?? payload.event_name ?? "message.unknown")
      : conversationIntelligencePayload?.event ?? (payload as AircallWebhookPayload).event;

    try {
      const tokenValid = await verifyAircallWebhookToken((payload as { token?: string }).token);
      if (!tokenValid) {
        console.error(`[Aircall Webhook] Rejected token for ${eventName}`);
        res.sendStatus(401);
        return;
      }

      // Native Aircall messages are already fully materialized. Persist their
      // state before the acknowledgement so a failed CRM write is retried by
      // Aircall instead of silently dropping Contact history.
      if (messagePayload) {
        await persistAircallMessage(payload.data as AircallMessageData, {
          direction: directionFromAircallMessageEvent(eventName),
          rawPayload: payload as Record<string, unknown>,
        });
        res.sendStatus(204);
        return;
      }

      // Live utterances are intentionally stored as provisional source data only.
      // Future in-call features can consume them without treating them as the final
      // CRM transcript that Aircall produces after the call has ended.
      if (conversationIntelligencePayload?.event === "realtime_transcription.utterances_received") {
        await persistAircallLiveTranscript(conversationIntelligencePayload);
        res.sendStatus(204);
        return;
      }

      // Aircall tells us when a completed transcript is ready and includes the
      // standard summary directly. Both are queued durably before acknowledgement.
      if (conversationIntelligencePayload) {
        await persistAircallConversationIntelligenceWebhook(conversationIntelligencePayload);
        res.sendStatus(204);
        void processDueAircallWebhookEvents();
        return;
      }

      // Acknowledge unrelated Aircall events after validation. The integration
      // self-check intentionally subscribes only to the durable media-ready call events.
      const callEventPayload = payload as AircallWebhookPayload;
      if (!DURABLE_CALL_EVENTS.has(callEventPayload.event)) {
        res.sendStatus(204);
        return;
      }

      // The DB insert is the acknowledgement boundary. Once it succeeds, a
      // restart or a transient S3/AI/Aircall issue cannot lose the event.
      await persistAircallWebhook(callEventPayload);
      res.sendStatus(204);

      // Opportunistic low-latency processing; the persistent worker will pick
      // it up again after any failure or process interruption.
      void processDueAircallWebhookEvents();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Aircall Webhook] Durable persistence failed for ${eventName}:`, message);
      // Non-2xx asks Aircall to retry rather than silently accepting a lost call.
      res.sendStatus(503);
    }
  });

  console.log("[Aircall Webhook] Registered durable POST /api/webhooks/aircall");
}
