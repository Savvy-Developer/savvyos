import express, { type Express, type Request, type Response } from "express";
import { verifyResendWebhookSignature } from "./_core/resendWebhook";
import { describeResendWebhookEvent, enqueueResendWebhookEvent } from "./resendWebhookInbox";
import { isDailyEmailEngagementCandidate } from "./websiteDailyEmailLogic";

/**
 * Registers the Resend callback before the global JSON parser. Svix signatures
 * cover the raw payload, and an absent verification secret disables ingestion.
 */
export function registerResendWebhookRoute(app: Pick<Express, "post">): void {
  app.post(
    "/api/webhooks/resend",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      try {
        const rawBody = Buffer.isBuffer(req.body)
          ? req.body.toString("utf8")
          : JSON.stringify(req.body);
        const signature = req.headers["svix-signature"] as string | undefined;
        const svixId = req.headers["svix-id"] as string | undefined;
        const svixTimestamp = req.headers["svix-timestamp"] as string | undefined;
        const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();

        // A missing secret is a deployment problem, never permission to accept
        // arbitrary events into the durable processing queue.
        if (!secret) {
          console.error("[Resend Webhook] RESEND_WEBHOOK_SECRET is not configured");
          return res.status(503).json({ error: "Webhook verification is not configured" });
        }

        if (
          !verifyResendWebhookSignature(
            rawBody,
            signature,
            secret,
            svixId,
            svixTimestamp
          )
        ) {
          console.warn("[Resend Webhook] Signature verification FAILED");
          return res.status(401).json({ error: "Invalid webhook signature" });
        }

        // Persist first and return immediately. The dedicated worker performs
        // CRM matching, analytics projection, and campaign rollups outside the
        // interactive SavvyOS process.
        await enqueueResendWebhookEvent(describeResendWebhookEvent(rawBody, svixId));
        res.status(200).json({ ok: true, queued: true });
        countDailyEmailEngagement(rawBody);
        return;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[Resend Webhook] Error:", message);
        return res.status(500).json({ error: "Webhook processing failed" });
      }
    }
  );
}

/**
 * Opens and clicks on the daily property email are also counted here, after
 * the reply has gone, rather than only in the webhook worker. The worker is a
 * separate Railway service that does not always redeploy with the app, and a
 * worker running older code marks these events done without counting them.
 *
 * Cheap and safe to run twice: only opened and clicked events that carry a
 * daily email tag or a broadcast ID get this far, and the writes are upserts
 * keyed on the run and email, so the worker counting the same event later
 * changes nothing.
 */
function countDailyEmailEngagement(rawBody: string): void {
  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return;
  }
  if (!isDailyEmailEngagementCandidate(event)) return;
  setImmediate(() => {
    import("./websiteDailyEmail")
      .then(module => module.recordDailyEmailEvent(event as any))
      .catch(error =>
        console.warn("[Resend Webhook] Daily email engagement not counted.", error)
      );
  });
}
