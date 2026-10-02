import { eq, sql } from "drizzle-orm";
import mysql from "mysql2/promise";

import { contacts } from "../drizzle/schema";
import { addResendContactToSegment } from "./_core/resendMarketingBroadcast";

/**
 * New website accounts join a Resend email list (call with Tyler, 1 Oct: the
 * old site adds everyone who registers to a Resend audience; the new site did
 * not).
 *
 * Which list is chosen in Website Studio > Daily Email. Until one is chosen
 * nothing is sent to Resend, so shipping this changes nothing on its own.
 *
 * The choice lives in its own one-row table, read with plain SQL, rather than
 * a new column on website_daily_email_settings: Drizzle selects every column
 * of that table by name, so a missing column there breaks the Daily Email tab
 * and the price drop check (September did exactly that). Here a missing table
 * only means "no list chosen".
 *
 * Someone SavvyOS already has as unsubscribed or bounced is not added, and
 * an address Resend already knows keeps its own unsubscribe state.
 *
 * Joining the list never blocks or fails a sign-up. A failure is logged.
 * The table is also recorded in drizzle/20261002_website_signup_audience.sql.
 */
export const WEBSITE_SIGNUP_AUDIENCE_DDL = `
  CREATE TABLE IF NOT EXISTS \`website_signup_audience\` (
    \`singletonKey\` varchar(32) NOT NULL DEFAULT 'primary',
    \`segmentId\` varchar(255) NULL,
    \`updatedById\` int NULL,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`singletonKey\`)
  )
`;

let readiness: Promise<void> | null = null;

async function applyWebsiteSignupAudienceSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  let connection: Awaited<ReturnType<typeof mysql.createConnection>> | null = null;
  try {
    connection = await mysql.createConnection(databaseUrl);
    await connection.query(WEBSITE_SIGNUP_AUDIENCE_DDL);
  } catch (error) {
    console.error("[websiteSignupAudience] could not create website_signup_audience", error);
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

export function ensureWebsiteSignupAudienceSchema() {
  readiness ??= applyWebsiteSignupAudienceSchema();
  return readiness;
}

/** A Resend segment id, or null. Trims, and treats blank as "none". */
export function cleanSegmentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 255 ? trimmed : null;
}

function firstRow(result: unknown): Record<string, unknown> | null {
  const rows = (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result) as unknown;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0];
  return row && typeof row === "object" ? (row as Record<string, unknown>) : null;
}

let warnedUnreadable = false;

/** The list new sign-ups join, or null when none is chosen (or the table is missing). */
export async function getSignupSegmentId(db: any): Promise<string | null> {
  try {
    const result = await db.execute(
      sql`SELECT segmentId FROM website_signup_audience WHERE singletonKey = 'primary' LIMIT 1`
    );
    return cleanSegmentId(firstRow(result)?.segmentId);
  } catch (error) {
    // Once, not on every sign-up and every load of the Daily Email tab.
    if (!warnedUnreadable) {
      warnedUnreadable = true;
      console.warn(
        "[websiteSignupAudience] could not read the sign-up list, treating it as off:",
        error instanceof Error ? error.message : String(error)
      );
    }
    return null;
  }
}

/**
 * True when SavvyOS already has this address as unsubscribed or bounced.
 * If the check itself fails the answer is "yes", so a doubt never adds anyone.
 */
export async function emailIsSuppressed(db: any, email: string): Promise<boolean> {
  try {
    const rows = await db
      .select({ emailStatus: contacts.emailStatus })
      .from(contacts)
      .where(eq(contacts.email, email))
      .limit(25);
    return (rows as Array<{ emailStatus: string | null }>).some(
      row => row.emailStatus === "unsubscribed" || row.emailStatus === "bounced"
    );
  } catch (error) {
    console.warn(
      "[websiteSignupAudience] could not check the unsubscribe list, so the sign-up was not added:",
      error instanceof Error ? error.message : String(error)
    );
    return true;
  }
}

export async function saveSignupSegmentId(db: any, segmentId: string | null, userId: number): Promise<void> {
  const value = cleanSegmentId(segmentId);
  await db.execute(sql`
    INSERT INTO website_signup_audience (singletonKey, segmentId, updatedById)
    VALUES ('primary', ${value}, ${userId})
    ON DUPLICATE KEY UPDATE segmentId = VALUES(segmentId), updatedById = VALUES(updatedById)
  `);
}

export type SignupAudienceResult = { attempted: boolean; success: boolean; reason?: string };

/**
 * Add one new account to the chosen list. Never throws: the account already
 * exists by the time this runs, and a Resend problem must not undo or delay it.
 */
export async function addSignupToResendAudience(
  db: any,
  account: { email: string; firstName?: string | null; lastName?: string | null }
): Promise<SignupAudienceResult> {
  try {
    const segmentId = await getSignupSegmentId(db);
    if (!segmentId) return { attempted: false, success: false, reason: "No list chosen" };
    if (await emailIsSuppressed(db, account.email)) {
      return { attempted: false, success: false, reason: "Unsubscribed or bounced in SavvyOS" };
    }
    const result = await addResendContactToSegment({
      email: account.email,
      firstName: account.firstName ?? null,
      lastName: account.lastName ?? null,
      segmentId,
    });
    if (!result.success) {
      console.warn("[websiteSignupAudience] sign-up not added to the Resend list:", result.error);
      return { attempted: true, success: false, reason: result.error };
    }
    return { attempted: true, success: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn("[websiteSignupAudience] sign-up not added to the Resend list:", reason);
    return { attempted: true, success: false, reason };
  }
}
