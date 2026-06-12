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

import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { webhookEndpoints, webhookLogs } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { HANDLERS } from "./webhookHandlers";

// ─── Signature Verification ───────────────────────────────────────────────────

function verifyHmac(
  rawBody: string,
  secret: string,
  headerValue: string | undefined
): boolean {
  if (!headerValue) return false;
  // Support "sha256=<hex>" prefix (GitHub style) or plain hex
  const sig = headerValue.startsWith("sha256=") ? headerValue.slice(7) : headerValue;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

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
  // Use express.raw so we can verify the HMAC over the original bytes
  app.post(
    "/api/inbound/:slug",
    (req, res, next) => {
      // express.json() has already parsed the body upstream.
      // Reconstruct _rawBody from the already-parsed req.body for HMAC verification.
      // This avoids re-reading the consumed stream (which would hang forever).
      if (req.body && typeof req.body === "object") {
        (req as any)._rawBody = JSON.stringify(req.body);
      } else if (typeof req.body === "string") {
        (req as any)._rawBody = req.body;
      } else {
        (req as any)._rawBody = "{}";
      }
      next();
    },
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
        const rawBody = (req as any)._rawBody ?? JSON.stringify(req.body);
        const sigHeader = endpoint.signatureHeader ?? "x-savvy-signature";
        const sigValue = req.headers[sigHeader.toLowerCase()] as string | undefined;
        if (!verifyHmac(rawBody, endpoint.secret, sigValue)) {
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
