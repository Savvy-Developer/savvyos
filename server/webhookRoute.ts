/**
 * Inbound Webhook Route
 *
 * Registers the Express route:  POST /api/inbound/:slug
 *
 * Flow:
 *  1. Look up the endpoint by slug
 *  2. Verify HMAC-SHA256 signature (if endpoint has a secret)
 *  3. Dispatch to the appropriate handler
 *  4. Write a log entry regardless of outcome
 *  5. Return a JSON response to the caller
 */

import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { webhookEndpoints, webhookLogs } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { HANDLERS } from "./webhookHandlers";
import { inboundRawBody, verifyInboundSignature } from "./webhookSignature";

// ─── Log Writer ───────────────────────────────────────────────────────────────

async function writeLog(entry: {
  endpointId: number | null;
  slug: string;
  statusCode: number;
  outcome: "success" | "auth_failed" | "validation_error" | "handler_error" | "not_found";
  requestPayload: unknown;
  responseBody: unknown;
  errorMessage?: string;
  contactId?: number;
  sourceIp?: string;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(webhookLogs).values({
      endpointId: entry.endpointId,
      slug: entry.slug,
      statusCode: entry.statusCode,
      outcome: entry.outcome,
      requestPayload: entry.requestPayload as any,
      responseBody: entry.responseBody as any,
      errorMessage: entry.errorMessage ?? null,
      contactId: entry.contactId ?? null,
      sourceIp: entry.sourceIp ?? null,
    });
  } catch (e: any) {
    console.error("[WebhookLog] Failed to write log:", e.message);
  }
}

// ─── Route Registration ───────────────────────────────────────────────────────

export function registerWebhookRoute(app: Express) {
  // The body parsers in server/_core/index.ts keep the original bytes for
  // this path (captureInboundRawBody), so the HMAC is checked against exactly
  // what the sender signed.
  app.post(
    "/api/inbound/:slug",
    async (req: Request, res: Response) => {
      const slug = req.params.slug;
      const sourceIp =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        "unknown";

      // ── 1. Look up endpoint ──────────────────────────────────────────────
      let endpoint: typeof webhookEndpoints.$inferSelect | null = null;
      try {
        const db = await getDb();
        if (db) {
          const [row] = await db
            .select()
            .from(webhookEndpoints)
            .where(eq(webhookEndpoints.slug, slug))
            .limit(1);
          endpoint = row ?? null;
        }
      } catch (e: any) {
        console.error("[Webhook] DB lookup error:", e.message);
      }

      if (!endpoint || !endpoint.isActive) {
        const body = { ok: false, error: "Endpoint not found" };
        await writeLog({
          endpointId: null,
          slug,
          statusCode: 404,
          outcome: "not_found",
          requestPayload: req.body,
          responseBody: body,
          sourceIp,
        });
        return res.status(404).json(body);
      }

      // ── 2. Verify HMAC signature ─────────────────────────────────────────
      if (endpoint.secret) {
        const sigHeader = endpoint.signatureHeader ?? "x-savvy-signature";
        const sigValue = req.headers[sigHeader.toLowerCase()] as string | undefined;
        if (!verifyInboundSignature(endpoint.secret, sigValue, inboundRawBody(req), req.body)) {
          const body = { ok: false, error: "Invalid signature" };
          await writeLog({
            endpointId: endpoint.id,
            slug,
            statusCode: 401,
            outcome: "auth_failed",
            requestPayload: req.body,
            responseBody: body,
            sourceIp,
          });
          return res.status(401).json(body);
        }
      }

      // ── 3. Dispatch to handler ───────────────────────────────────────────
      const handler = HANDLERS[endpoint.handlerType];
      if (!handler) {
        const body = { ok: false, error: `No handler for type: ${endpoint.handlerType}` };
        await writeLog({
          endpointId: endpoint.id,
          slug,
          statusCode: 500,
          outcome: "handler_error",
          requestPayload: req.body,
          responseBody: body,
          errorMessage: body.error,
          sourceIp,
        });
        return res.status(500).json(body);
      }

      try {
        const result = await handler(req.body as Record<string, unknown>, endpoint);
        const body = { ok: true, ...result };
        await writeLog({
          endpointId: endpoint.id,
          slug,
          statusCode: 200,
          outcome: "success",
          requestPayload: req.body,
          responseBody: body,
          contactId: result.contactId,
          sourceIp,
        });
        return res.status(200).json(body);
      } catch (e: any) {
        const isValidation =
          e.message?.includes("required") || e.message?.includes("No contact found");
        const body = { ok: false, error: e.message };
        await writeLog({
          endpointId: endpoint.id,
          slug,
          statusCode: isValidation ? 422 : 500,
          outcome: isValidation ? "validation_error" : "handler_error",
          requestPayload: req.body,
          responseBody: body,
          errorMessage: e.message,
          sourceIp,
        });
        return res.status(isValidation ? 422 : 500).json(body);
      }
    }
  );
}
