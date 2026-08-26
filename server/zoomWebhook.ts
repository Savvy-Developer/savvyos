import type { Express, Request, Response } from "express";
import {
  buildZoomWebhookValidationResponse,
  createZoomEventKey,
  isZoomWebhookConfigured,
  verifyZoomWebhookSignature,
} from "./zoomWebinarService";
import { processZoomWebhookEvent } from "./routers/webinars";

/**
 * Zoom validates this endpoint with a challenge-response body and signs normal
 * event deliveries. The raw parser is intentional: the signature is calculated
 * over the exact serialized payload, not an Express-parsed object.
 */
export function registerZoomWebhook(app: Express): void {
  app.post("/api/webhooks/zoom", async (req: Request, res: Response) => {
    try {
      if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: "Expected a raw JSON payload." });
      const rawBody = req.body.toString("utf8");
      const event = JSON.parse(rawBody) as {
        event?: string;
        event_ts?: number;
        payload?: Record<string, unknown>;
      };
      const eventType = event.event ?? "";
      const timestamp = req.headers["x-zm-request-timestamp"] as string | undefined;
      const signature = req.headers["x-zm-signature"] as string | undefined;

      if (eventType === "endpoint.url_validation") {
        const plainToken = (event.payload?.plainToken ?? "") as string;
        if (!plainToken || !isZoomWebhookConfigured()) {
          return res.status(400).json({ error: "Zoom webhook validation is not configured." });
        }
        return res.status(200).json(buildZoomWebhookValidationResponse(plainToken));
      }

      if (!eventType || !event.payload) return res.status(400).json({ error: "Invalid Zoom webhook payload." });
      if (!isZoomWebhookConfigured() || !verifyZoomWebhookSignature(rawBody, timestamp, signature)) {
        return res.status(401).json({ error: "Invalid Zoom webhook signature." });
      }

      const eventKey = createZoomEventKey(rawBody, req.headers["x-zm-request-id"] as string | undefined);
      await processZoomWebhookEvent({
        eventKey,
        eventType,
        eventTimestamp: event.event_ts,
        payload: event.payload,
      });
      return res.status(204).end();
    } catch (error: any) {
      console.error("[Zoom Webhook] Processing failed", error?.message ?? error);
      return res.status(500).json({ error: "Zoom webhook processing failed." });
    }
  });
}
