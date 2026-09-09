import type { Express, Request, Response } from "express";
import {
  extractSwoogoEventId,
  resolveSwoogoWebhookType,
  staticWebhookTokenMatches,
} from "./eventsLogic";
import { queueSwoogoRecountVerification } from "./routers/events";

/**
 * Swoogo supports custom HTTP headers but does not sign webhook payloads. The
 * endpoint verifies the configured static secret, replies before database work,
 * and queues a debounced source-verification record. Headcount aggregation is
 * deliberately not enabled until the source/de-duplication decision is made.
 */
export function registerSwoogoEventsWebhook(app: Express) {
  app.post("/api/webhooks/swoogo", (req: Request, res: Response) => {
    const expected = process.env.SWOOGO_WEBHOOK_TOKEN?.trim();
    if (!expected)
      return res
        .status(503)
        .json({ error: "Swoogo webhook is not configured." });

    const header =
      process.env.SWOOGO_WEBHOOK_HEADER?.trim() || "x-savvy-webhook-token";
    const received = req.get(header) ?? undefined;
    if (!staticWebhookTokenMatches(received, expected)) {
      console.warn(
        "[Events/Swoogo] Rejected webhook with invalid static header."
      );
      return res.status(401).json({ error: "Unauthorized" });
    }

    const providerEventId = extractSwoogoEventId(req.body);
    const eventType = resolveSwoogoWebhookType(req.body);

    // A 2xx acknowledgement is intentionally sent before any database query or
    // recount work. Swoogo retries failed deliveries, so slow work must never
    // turn an accepted event into a duplicate delivery.
    res.status(200).json({ received: true });

    setImmediate(() => {
      if (!providerEventId) {
        console.warn(
          "[Events/Swoogo] Webhook had no recognizable event_id; source verification not queued."
        );
        return;
      }
      queueSwoogoRecountVerification({
        providerEventId,
        eventType,
        payload: req.body as Record<string, unknown>,
      }).catch(error =>
        console.error(
          "[Events/Swoogo] Verification queue failed:",
          error instanceof Error ? error.message : error
        )
      );
    });
  });
}
