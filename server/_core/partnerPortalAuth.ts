import crypto from "crypto";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, gt, isNull } from "drizzle-orm";
import { partnerPortalMagicLinks } from "../../drizzle/schema";
import { getDb } from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sendTransactionalEmail, type EmailDeliveryResult } from "./resendEmail";

export const PARTNER_PORTAL_COOKIE = "savvy_partner_portal";
export const PARTNER_PORTAL_PATH = "/partner-portal";
const APP_URL = "https://os.savvy-agents.com";
const MAGIC_LINK_LIFETIME_MS = 15 * 60 * 1000;
const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;

function signingKey() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(ENV.cookieSecret);
}

export function normalizePartnerPortalEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Creates a short-lived, single-use magic link for a configured partner email. */
export async function createPartnerPortalMagicLink(email: string): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const normalizedEmail = normalizePartnerPortalEmail(email);
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(partnerPortalMagicLinks).values({
    email: normalizedEmail,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + MAGIC_LINK_LIFETIME_MS),
  });

  return `${APP_URL}/api/auth/partner-portal?token=${encodeURIComponent(token)}`;
}

/** Sends the welcome or replacement magic link for a newly enabled portal partner. */
export async function sendPartnerPortalInvitation(input: {
  email: string;
  partnerName: string;
}): Promise<EmailDeliveryResult> {
  const portalUrl = await createPartnerPortalMagicLink(input.email);
  return sendTransactionalEmail("partner_portal_access", {
    recipientEmail: normalizePartnerPortalEmail(input.email),
    recipientName: input.partnerName,
    partnerName: input.partnerName,
    partnerPortalUrl: portalUrl,
  }, {
    allowTemplateOverride: false,
    injectMagicLinks: false,
  });
}

/**
 * Consumes a magic link once. It returns the authorized email only when the
 * token is current and belongs to an email that still has portal access.
 */
export async function consumePartnerPortalMagicLink(token: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const tokenHash = hashToken(token);
  const [record] = await db
    .select({ id: partnerPortalMagicLinks.id, email: partnerPortalMagicLinks.email })
    .from(partnerPortalMagicLinks)
    .where(and(
      eq(partnerPortalMagicLinks.tokenHash, tokenHash),
      gt(partnerPortalMagicLinks.expiresAt, new Date()),
      isNull(partnerPortalMagicLinks.usedAt),
    ))
    .limit(1);
  if (!record) return null;

  // Make simultaneous clicks single-use. A second request can only proceed if
  // it successfully claims the still-unused row.
  const updateResult = await db
    .update(partnerPortalMagicLinks)
    .set({ usedAt: new Date() })
    .where(and(eq(partnerPortalMagicLinks.id, record.id), isNull(partnerPortalMagicLinks.usedAt)));
  const affectedRows = Number((updateResult as any)[0]?.affectedRows ?? (updateResult as any).affectedRows ?? 0);
  if (affectedRows !== 1) return null;

  return normalizePartnerPortalEmail(record.email);
}

export async function createPartnerPortalSession(email: string): Promise<string> {
  return new SignJWT({ partnerPortal: true, email: normalizePartnerPortalEmail(email) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(normalizePartnerPortalEmail(email))
    .setAudience("savvy-partner-portal")
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + SESSION_LIFETIME_MS) / 1000))
    .sign(signingKey());
}

export async function getPartnerPortalEmailFromRequest(req: Request): Promise<string | null> {
  const cookieHeader = req.headers.cookie ?? "";
  const match = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${PARTNER_PORTAL_COOKIE}=`));
  const token = match ? decodeURIComponent(match.slice(PARTNER_PORTAL_COOKIE.length + 1)) : null;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ["HS256"],
      audience: "savvy-partner-portal",
    });
    if (payload.partnerPortal !== true || typeof payload.email !== "string") return null;
    return normalizePartnerPortalEmail(payload.email);
  } catch {
    return null;
  }
}

export async function setPartnerPortalSessionCookie(req: Request, email: string) {
  return {
    name: PARTNER_PORTAL_COOKIE,
    value: await createPartnerPortalSession(email),
    options: { ...getSessionCookieOptions(req), maxAge: SESSION_LIFETIME_MS },
  };
}

export function partnerPortalCookieOptions(req: Request) {
  return getSessionCookieOptions(req);
}
