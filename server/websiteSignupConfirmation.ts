import crypto from "crypto";
import { and, eq, isNull } from "drizzle-orm";

import { websiteAccountTokens, websiteAccounts } from "../drizzle/schema";
import { hashToken } from "./_core/websiteAccountAuth";
import { sendTransactionalEmail } from "./_core/resendEmail";
import { PUBLIC_SITE_BASE } from "./websiteDailyEmailLogic";
import { addSignupToResendAudience, cleanSegmentId } from "./websiteSignupAudience";

/**
 * Email confirmation for new website accounts, and the sign-up email list.
 *
 * The old savvy-agents.com added someone to the Resend audience "All
 * Savvy-Agent Users" only once they had confirmed their email (Supabase sends
 * the confirmation, and savvy-web's /auth/confirm route adds the person in the
 * background). The new site created the account and stopped there.
 *
 * With WEBSITE_SIGNUP_CONFIRMATION_ENABLED on:
 * - sign-up still creates the account and signs the person in, exactly as
 *   before. Nothing waits for confirmation and sign-in never checks it;
 * - a confirmation email with a one-time link goes out in the background;
 * - opening the link sets emailVerifiedAt and then, in the background, adds
 *   the person to the sign-up list. The list is the one chosen in Website
 *   Studio > Daily Email if there is one, otherwise
 *   WEBSITE_SIGNUP_RESEND_AUDIENCE_ID, otherwise the old site's list;
 * - sign-up itself no longer adds anyone to the list, since confirming does.
 *
 * With it off (the default) nothing here runs and sign-up behaves as it
 * always has. Accounts that existed before are left alone: none is emailed,
 * marked or added.
 */

/**
 * The old site's "All Savvy-Agent Users" Resend audience, taken from savvy-web
 * (packages/db/src/services/resendAudience.service.ts). Resend now calls
 * audiences segments; the id is the same.
 */
export const OLD_SITE_SIGNUP_AUDIENCE_ID = "21d6ce52-d41a-4fcd-823e-f8bf5ea5e26d";

/** How long a confirmation link works. */
export const EMAIL_CONFIRMATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

type Env = Record<string, string | undefined>;

/** WEBSITE_SIGNUP_CONFIRMATION_ENABLED, off unless set to true/1/yes/on. */
export function signupConfirmationEnabled(env: Env = process.env): boolean {
  const value = String(env.WEBSITE_SIGNUP_CONFIRMATION_ENABLED ?? "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes" || value === "on";
}

/** The list confirmed sign-ups join when none is chosen in Website Studio. */
export function confirmedSignupAudienceId(env: Env = process.env): string {
  return cleanSegmentId(env.WEBSITE_SIGNUP_RESEND_AUDIENCE_ID) ?? OLD_SITE_SIGNUP_AUDIENCE_ID;
}

export function emailConfirmationUrl(token: string): string {
  return `${PUBLIC_SITE_BASE}/confirm-email?token=${encodeURIComponent(token)}`;
}

/**
 * Issue a confirmation token. Only its hash is stored, as with password
 * resets. Any earlier unused confirmation token for the account is spent first.
 */
export async function createEmailConfirmationToken(
  db: any,
  accountId: number,
  now: Date = new Date()
): Promise<string> {
  await db
    .update(websiteAccountTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(websiteAccountTokens.accountId, accountId),
        eq(websiteAccountTokens.purpose, "email_verification"),
        isNull(websiteAccountTokens.usedAt)
      )
    );
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(websiteAccountTokens).values({
    accountId,
    purpose: "email_verification",
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + EMAIL_CONFIRMATION_LIFETIME_MS),
  });
  return token;
}

export type SendConfirmationResult = { sent: boolean; reason?: string };

/**
 * Create a token and email the link. Never throws: the account already
 * exists, and a mail problem must not fail or slow the sign-up.
 */
export async function sendSignupConfirmation(
  db: any,
  account: { id: number; email: string; firstName?: string | null },
  send: typeof sendTransactionalEmail = sendTransactionalEmail
): Promise<SendConfirmationResult> {
  try {
    const token = await createEmailConfirmationToken(db, account.id);
    const result = await send(
      "website_account_email_confirmation",
      {
        recipientEmail: account.email,
        recipientName: account.firstName?.trim() || undefined,
        websiteConfirmUrl: emailConfirmationUrl(token),
      },
      // An investor is not a SavvyOS user: no SavvyOS sign-in links.
      { injectMagicLinks: false }
    );
    if (!result.sent) {
      console.warn("[websiteSignupConfirmation] confirmation email not sent:", result.reason);
      return { sent: false, reason: result.reason };
    }
    return { sent: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn("[websiteSignupConfirmation] confirmation email not sent:", reason);
    return { sent: false, reason };
  }
}

export type ConfirmEmailOutcome =
  | { status: "confirmed"; accountId: number }
  | { status: "already_confirmed"; accountId: number }
  | { status: "expired" }
  | { status: "invalid" };

type AudienceAdder = typeof addSignupToResendAudience;

function affectedRows(result: unknown): number {
  return Number((result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0);
}

/**
 * Spend a confirmation link.
 *
 * - Unknown token: invalid.
 * - The account is already confirmed (a second click, or a second link):
 *   already_confirmed, and nothing is sent to Resend again.
 * - Spent or past its expiry: expired.
 * - Otherwise the token is claimed with a conditional update, so two clicks at
 *   once cannot both win, the account gets emailVerifiedAt, and the person is
 *   added to the sign-up list without being waited on. A Resend failure is
 *   logged by addSignupToResendAudience and never reaches the page.
 */
export async function confirmSignupEmail(
  db: any,
  token: string,
  options: {
    now?: Date;
    env?: Env;
    addToAudience?: AudienceAdder;
  } = {}
): Promise<ConfirmEmailOutcome> {
  const now = options.now ?? new Date();
  const env = options.env ?? process.env;
  const addToAudience = options.addToAudience ?? addSignupToResendAudience;

  const [record] = await db
    .select({
      id: websiteAccountTokens.id,
      accountId: websiteAccountTokens.accountId,
      expiresAt: websiteAccountTokens.expiresAt,
      usedAt: websiteAccountTokens.usedAt,
    })
    .from(websiteAccountTokens)
    .where(
      and(
        eq(websiteAccountTokens.tokenHash, hashToken(token)),
        eq(websiteAccountTokens.purpose, "email_verification")
      )
    )
    .limit(1);
  if (!record) return { status: "invalid" };

  const [account] = await db
    .select({
      id: websiteAccounts.id,
      email: websiteAccounts.email,
      firstName: websiteAccounts.firstName,
      lastName: websiteAccounts.lastName,
      emailVerifiedAt: websiteAccounts.emailVerifiedAt,
    })
    .from(websiteAccounts)
    .where(eq(websiteAccounts.id, record.accountId))
    .limit(1);
  if (!account) return { status: "invalid" };
  if (account.emailVerifiedAt) return { status: "already_confirmed", accountId: account.id };

  if (record.usedAt || new Date(record.expiresAt).getTime() <= now.getTime()) {
    return { status: "expired" };
  }

  const claimed = await db
    .update(websiteAccountTokens)
    .set({ usedAt: now })
    .where(and(eq(websiteAccountTokens.id, record.id), isNull(websiteAccountTokens.usedAt)));
  if (affectedRows(claimed) !== 1) {
    // Lost a race with another click on the same link, which confirmed it.
    return { status: "already_confirmed", accountId: account.id };
  }

  const marked = await db
    .update(websiteAccounts)
    .set({ emailVerifiedAt: now })
    .where(and(eq(websiteAccounts.id, account.id), isNull(websiteAccounts.emailVerifiedAt)));
  if (affectedRows(marked) !== 1) return { status: "already_confirmed", accountId: account.id };

  if (signupConfirmationEnabled(env)) {
    // Not awaited. addSignupToResendAudience never throws, and the catch is
    // a second guard so nothing here can surface as an unhandled rejection.
    void Promise.resolve()
      .then(() =>
        addToAudience(
          db,
          { email: account.email, firstName: account.firstName, lastName: account.lastName },
          { fallbackSegmentId: confirmedSignupAudienceId(env) }
        )
      )
      .catch(error =>
        console.warn(
          "[websiteSignupConfirmation] confirmed sign-up not added to the list:",
          error instanceof Error ? error.message : String(error)
        )
      );
  }

  return { status: "confirmed", accountId: account.id };
}
