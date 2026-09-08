import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { recordQuizCalendlyBooking } from "./marketMatchQuiz";
import { recordSavvyCalendlyAppointment } from "./routers/appointments";

const webhookSchema = z.object({
  event: z.enum(["invitee.created", "invitee.canceled"]),
  payload: z.record(z.string(), z.unknown()),
});

function configuredSecretMatches(request: Request): boolean {
  const expected = process.env.CALENDLY_WEBHOOK_SECRET?.trim();
  // Calendly webhooks do not provide a native request signature. A long secret
  // in the subscription URL is optional but strongly recommended when creating
  // the subscription, while existing Calendly setups remain compatible.
  if (!expected) return true;
  const received = String(request.query.secret ?? request.headers["x-calendly-webhook-secret"] ?? "");
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isSavvyAppointmentImportConfigured(): boolean {
  // The legacy Market Match reconciler predates a webhook secret and remains
  // compatible. General CRM appointment import creates contacts/connections,
  // so it is enabled only once its authenticated subscription is configured.
  return Boolean(process.env.CALENDLY_WEBHOOK_SECRET?.trim());
}

function trackingContent(payload: Record<string, unknown>) {
  const rootTracking = payload.tracking as Record<string, unknown> | undefined;
  const invitee = payload.invitee as Record<string, unknown> | undefined;
  const inviteeTracking = invitee?.tracking as Record<string, unknown> | undefined;
  const event = payload.event as Record<string, unknown> | undefined;
  const eventTracking = event?.tracking as Record<string, unknown> | undefined;
  return rootTracking?.utm_content ?? inviteeTracking?.utm_content ?? eventTracking?.utm_content ?? null;
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

/**
 * Provider-confirmed booking attribution for Market Match handoffs. The public
 * flow also records a schedule-open event immediately, but this route is the
 * durable source of truth for a Calendly booking or cancellation.
 */
export function registerMarketMatchQuizCalendlyWebhook(app: Express) {
  app.post("/api/webhooks/calendly", async (req: Request, res: Response) => {
    if (!configuredSecretMatches(req)) return res.status(401).json({ error: "Unauthorized" });
    const parsed = webhookSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Unsupported Calendly webhook payload" });
    try {
      const payload = parsed.data.payload;
      const event = payload.event as Record<string, unknown> | undefined;
      const invitee = payload.invitee as Record<string, unknown> | undefined;
      const [savvyResult, marketMatchResult] = await Promise.all([
        isSavvyAppointmentImportConfigured()
          ? recordSavvyCalendlyAppointment({ eventType: parsed.data.event, payload })
          : Promise.resolve({ matched: false, reason: "Calendly appointment import is awaiting authenticated webhook configuration" }),
        recordQuizCalendlyBooking({
        trackingContent: trackingContent(payload),
        eventUri: stringField(event?.uri ?? payload.event_uri),
        inviteeUri: stringField(invitee?.uri ?? payload.invitee_uri),
        eventType: parsed.data.event,
        rawPayload: parsed.data as unknown as Record<string, unknown>,
        }),
      ]);
      return res.json({ ok: true, savvy: savvyResult, marketMatch: marketMatchResult });
    } catch (error) {
      console.error("[MarketMatchQuiz] Calendly webhook failed:", error);
      return res.status(500).json({ error: "Unable to record Calendly event" });
    }
  });
}

export const __testables__ = { configuredSecretMatches, isSavvyAppointmentImportConfigured, trackingContent };
