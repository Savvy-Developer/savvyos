import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { and, eq, or } from "drizzle-orm";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { contacts } from "../drizzle/schema";

const SAVVYOS_BASE_URL = "https://os.savvy-agents.com";
const TOKEN_VERSION = "v1";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function signingSecret(): string {
  return ENV.cookieSecret;
}

function sign(value: string): string {
  return crypto
    .createHmac("sha256", signingSecret())
    .update(value)
    .digest("base64url");
}

/**
 * Creates a recipient-specific, tamper-proof unsubscribe URL for campaign email.
 * Resend's {{{RESEND_UNSUBSCRIBE_URL}}} is limited to Broadcasts and Automations,
 * while SavvyOS campaign email is sent through the Emails API.
 */
export function createMarketingUnsubscribeUrl(email: string): string | null {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !signingSecret()) return null;

  const emailPart = Buffer.from(normalizedEmail, "utf8").toString("base64url");
  const signedValue = `${TOKEN_VERSION}.${emailPart}`;
  const token = `${signedValue}.${sign(signedValue)}`;
  return `${SAVVYOS_BASE_URL}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function emailFromMarketingUnsubscribeToken(
  token: string | null | undefined
): string | null {
  if (!token || !signingSecret()) return null;
  const [version, emailPart, receivedSignature, ...extra] = token.split(".");
  if (
    version !== TOKEN_VERSION ||
    !emailPart ||
    !receivedSignature ||
    extra.length > 0
  ) {
    return null;
  }

  const signedValue = `${version}.${emailPart}`;
  const expectedSignature = sign(signedValue);
  const receivedBuffer = Buffer.from(receivedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const email = normalizeEmail(
      Buffer.from(emailPart, "base64url").toString("utf8")
    );
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  } catch {
    return null;
  }
}

export async function unsubscribeMarketingEmail(
  token: string | null | undefined
): Promise<{ valid: boolean; email: string | null }> {
  const email = emailFromMarketingUnsubscribeToken(token);
  if (!email) return { valid: false, email: null };

  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await db
    .update(contacts)
    .set({ emailStatus: "unsubscribed", emailUnsubscribedAt: new Date() })
    .where(
      and(
        or(
          eq(contacts.email, email),
          eq(contacts.secondaryEmail, email),
          eq(contacts.thirdEmail, email),
          eq(contacts.spouseEmail, email)
        )
      )
    );

  return { valid: true, email };
}

function unsubscribePage(message: string, isError = false): string {
  const color = isError ? "#b91c1c" : "#0f766e";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${isError ? "Unsubscribe link unavailable" : "Email preferences updated"}</title></head><body style="margin:0;background:#f4f6f8;color:#1f2937;font-family:Arial,Helvetica,sans-serif"><main style="max-width:560px;margin:72px auto;padding:0 20px"><section style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:36px;box-shadow:0 1px 3px rgba(15,23,42,.06)"><p style="margin:0 0 14px;color:${color};font-size:14px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">Savvy STR Agents</p><h1 style="margin:0 0 16px;font-size:26px;line-height:1.25">${isError ? "This unsubscribe link is unavailable" : "You have been unsubscribed"}</h1><p style="margin:0;font-size:16px;line-height:1.6">${message}</p></section></main></body></html>`;
}

async function processUnsubscribe(req: Request, res: Response): Promise<void> {
  try {
    const result = await unsubscribeMarketingEmail(
      typeof req.query.token === "string" ? req.query.token : null
    );
    if (!result.valid) {
      res
        .status(400)
        .type("html")
        .send(
          unsubscribePage(
            "Please use the unsubscribe link from a recent Savvy STR Agents email, or contact hello@savvy-agents.com for help.",
            true
          )
        );
      return;
    }

    res
      .status(200)
      .type("html")
      .send(
        unsubscribePage(
          "You will no longer receive Smart Plan or one-time marketing emails at this address. This change may take a few moments to reach sends already in progress."
        )
      );
  } catch (error) {
    console.error("[MarketingUnsubscribe] Unable to update preference:", error);
    res
      .status(503)
      .type("html")
      .send(
        unsubscribePage(
          "We could not update your preference right now. Please try the link again shortly or contact hello@savvy-agents.com for help.",
          true
        )
      );
  }
}

/** Registers browser and RFC 8058 one-click unsubscribe handling for campaign email. */
export function registerMarketingEmailUnsubscribeRoutes(app: Express): void {
  app.get("/api/unsubscribe", processUnsubscribe);
  // Mail clients send an empty form POST to this exact URL for one-click list
  // unsubscribe. A successful response must be blank with a 200 status.
  app.post("/api/unsubscribe", async (req, res) => {
    try {
      const result = await unsubscribeMarketingEmail(
        typeof req.query.token === "string" ? req.query.token : null
      );
      if (!result.valid) return res.sendStatus(400);
      return res.status(200).end();
    } catch (error) {
      console.error(
        "[MarketingUnsubscribe] Unable to process one-click request:",
        error
      );
      return res.sendStatus(503);
    }
  });
}
