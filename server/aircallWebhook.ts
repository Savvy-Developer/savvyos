/**
 * Aircall Live Webhook Handler
 * =============================
 * Registered as POST /api/webhooks/aircall in the Express server.
 *
 * Aircall sends a POST request for every call event. We:
 *  1. Respond 200 immediately (Aircall will disable webhook after 10 failures)
 *  2. Process the call asynchronously to avoid the 5-second timeout
 *  3. Only act on `call.ended` events (all call data is available at that point)
 *  4. Delegate to processAircallCall() which is fully idempotent
 *
 * Webhook token verification:
 *  - Aircall sends a `token` field in the payload body
 *  - We compare it to AIRCALL_WEBHOOK_TOKEN env var
 *  - If the env var is not set, verification is skipped (dev mode)
 */

import type { Express, Request, Response } from "express";
import { processAircallCall, type AircallCallData } from "./aircall";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AircallWebhookPayload {
  event: string;
  resource: string;
  timestamp: number;
  token?: string; // Webhook token for verification
  data: AircallCallData;
}

// ─── Token Verification ────────────────────────────────────────────────────────

function verifyWebhookToken(token: string | undefined): boolean {
  const expected = process.env.AIRCALL_WEBHOOK_TOKEN;
  if (!expected) {
    // Token not configured — skip verification (log a warning in production)
    if (process.env.NODE_ENV === "production") {
      console.warn("[Aircall Webhook] WARNING: AIRCALL_WEBHOOK_TOKEN not set. Skipping token verification.");
    }
    return true;
  }
  return token === expected;
}

// ─── Async Processor ──────────────────────────────────────────────────────────

async function handleCallEnded(callData: AircallCallData): Promise<void> {
  try {
    const result = await processAircallCall(callData);
    switch (result.action) {
      case "created":
        console.log(
          `[Aircall Webhook] call.ended ${callData.id} → contact ${result.contactId}, comm ${result.communicationId}`
        );
        break;
      case "skipped":
        console.log(`[Aircall Webhook] call.ended ${callData.id} — already processed`);
        break;
      case "unmatched":
        console.log(
          `[Aircall Webhook] call.ended ${callData.id} — unmatched phone: ${callData.raw_digits ?? "(none)"}`
        );
        break;
    }
  } catch (err: any) {
    console.error(`[Aircall Webhook] Error processing call ${callData.id}: ${err.message}`);
  }
}

// ─── Route Registration ────────────────────────────────────────────────────────

export function registerAircallWebhook(app: Express): void {
  app.post("/api/webhooks/aircall", (req: Request, res: Response) => {
    // ── 1. Respond 200 immediately ────────────────────────────────────────────
    // Aircall requires a 2xx response within 5 seconds or it counts as a failure.
    // After 10 failures, Aircall auto-disables the webhook.
    res.sendStatus(200);

    // ── 2. Parse and validate payload ─────────────────────────────────────────
    const payload = req.body as AircallWebhookPayload;

    if (!payload || !payload.event || !payload.data) {
      console.warn("[Aircall Webhook] Received malformed payload");
      return;
    }

    // ── 3. Token verification ─────────────────────────────────────────────────
    if (!verifyWebhookToken(payload.token)) {
      console.warn(
        `[Aircall Webhook] Token mismatch for event ${payload.event} — ignoring`
      );
      return;
    }

    // ── 4. Only process call.ended (all data including recording is available) ─
    // call.hungup fires immediately but recording URL is not yet available.
    // call.ended fires ~30 seconds later with the full call object.
    if (payload.event !== "call.ended") {
      // Silently acknowledge other events — we don't need them for Phase 1
      return;
    }

    // ── 5. Process asynchronously ─────────────────────────────────────────────
    handleCallEnded(payload.data).catch((err) => {
      console.error(`[Aircall Webhook] Unhandled error: ${err.message}`);
    });
  });

  console.log("[Aircall Webhook] Registered POST /api/webhooks/aircall");
}
