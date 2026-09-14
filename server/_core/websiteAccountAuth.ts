import crypto from "crypto";
import type { Request } from "express";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, gt, isNull } from "drizzle-orm";

import { websiteAccountTokens, websiteAccounts } from "../../drizzle/schema";
import { getDb } from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";

/**
 * Authentication for investors on the public website.
 *
 * These accounts are deliberately isolated from the `users` table that holds
 * agents, admins and ISAs. Everything here has its own cookie, its own token
 * audience and its own table, so a mistake in the public site cannot reach a
 * staff session. The partner portal established this shape in SavvyOS; this
 * follows it rather than inventing a second approach.
 *
 * The distinct audience matters as much as the distinct cookie: even if a
 * website token were somehow presented to a staff endpoint, jwtVerify rejects
 * it, because a token minted here can only ever be read back here.
 */

export const WEBSITE_SESSION_COOKIE = "savvy_website_session";
const SESSION_AUDIENCE = "savvy-website-account";
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
/** Cost 12 rather than the default 10: these are public internet passwords. */
const BCRYPT_COST = 12;

function signingKey() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(ENV.cookieSecret);
}

export function normalizeAccountEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Whether a password is acceptable.
 *
 * Length is the only rule that reliably helps. Composition rules push people
 * towards "Password1!" and no further, so this asks for length and rejects the
 * handful of strings that show up constantly in credential stuffing lists.
 */
const OBVIOUS_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "qwerty123",
  "letmein1", "welcome1", "iloveyou", "admin123", "changeme", "savvy123",
]);

export function passwordProblem(password: string): string | null {
  const value = String(password ?? "");
  if (value.length < 10) return "Use at least 10 characters.";
  if (value.length > 200) return "That password is too long.";
  if (OBVIOUS_PASSWORDS.has(value.toLowerCase())) {
    return "That password is too common. Please choose another.";
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export async function createAccountSession(
  accountId: number,
  expiresInMs = SESSION_LIFETIME_MS
): Promise<string> {
  return new SignJWT({ websiteAccount: true, accountId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(accountId))
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + expiresInMs) / 1000))
    .sign(signingKey());
}

/** The account id carried by a session token, or null if it is not one of ours. */
export async function readAccountSession(token: string | null | undefined): Promise<number | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ["HS256"],
      audience: SESSION_AUDIENCE,
    });
    if (payload.websiteAccount !== true) return null;
    const accountId = Number(payload.accountId);
    return Number.isInteger(accountId) && accountId > 0 ? accountId : null;
  } catch {
    return null;
  }
}

export function readSessionCookie(req: Request): string | null {
  const header = req.headers.cookie ?? "";
  const match = header
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${WEBSITE_SESSION_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(WEBSITE_SESSION_COOKIE.length + 1)) : null;
}

export async function sessionCookieFor(req: Request, accountId: number) {
  return {
    name: WEBSITE_SESSION_COOKIE,
    value: await createAccountSession(accountId),
    options: { ...getSessionCookieOptions(req), maxAge: SESSION_LIFETIME_MS },
  };
}

export function clearedSessionCookie(req: Request) {
  return {
    name: WEBSITE_SESSION_COOKIE,
    value: "",
    options: { ...getSessionCookieOptions(req), maxAge: 0 },
  };
}

/**
 * The signed-in investor, or null.
 *
 * A suspended account is treated as signed out rather than as an error, so
 * suspending someone takes effect on their next request without needing to
 * hunt down their session.
 */
export async function accountFromRequest(req: Request) {
  const accountId = await readAccountSession(readSessionCookie(req));
  if (!accountId) return null;
  const db = await getDb();
  if (!db) return null;
  const [account] = await db
    .select({
      id: websiteAccounts.id,
      email: websiteAccounts.email,
      firstName: websiteAccounts.firstName,
      lastName: websiteAccounts.lastName,
      phone: websiteAccounts.phone,
      status: websiteAccounts.status,
      contactId: websiteAccounts.contactId,
    })
    .from(websiteAccounts)
    .where(eq(websiteAccounts.id, accountId))
    .limit(1);
  if (!account || account.status !== "active") return null;
  return account;
}

/**
 * Issue a password reset token.
 *
 * Returns the raw token for the email; only its hash is stored, so the table
 * cannot be read back into a working reset link. Any earlier unused reset for
 * the same account is spent first, so a stream of requests does not leave a
 * trail of live tokens.
 */
export async function createPasswordResetToken(accountId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(websiteAccountTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(websiteAccountTokens.accountId, accountId),
        eq(websiteAccountTokens.purpose, "password_reset"),
        isNull(websiteAccountTokens.usedAt)
      )
    );
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(websiteAccountTokens).values({
    accountId,
    purpose: "password_reset",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_LIFETIME_MS),
  });
  return token;
}

/**
 * Spend a reset token and return the account it belongs to.
 *
 * The token is claimed with a conditional update, so two simultaneous clicks on
 * the same link cannot both succeed.
 */
export async function consumePasswordResetToken(token: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [record] = await db
    .select({ id: websiteAccountTokens.id, accountId: websiteAccountTokens.accountId })
    .from(websiteAccountTokens)
    .where(
      and(
        eq(websiteAccountTokens.tokenHash, hashToken(token)),
        eq(websiteAccountTokens.purpose, "password_reset"),
        gt(websiteAccountTokens.expiresAt, new Date()),
        isNull(websiteAccountTokens.usedAt)
      )
    )
    .limit(1);
  if (!record) return null;

  const claimed = await db
    .update(websiteAccountTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(websiteAccountTokens.id, record.id), isNull(websiteAccountTokens.usedAt)));
  const affected = Number(
    (claimed as any)[0]?.affectedRows ?? (claimed as any).affectedRows ?? 0
  );
  return affected === 1 ? record.accountId : null;
}
