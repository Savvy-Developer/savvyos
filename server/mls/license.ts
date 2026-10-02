import type { MlsFeed } from "../../drizzle/mlsSchema";

/** A transport credential is not a license. No feed runs until its signed scope is recorded. */
export type FeedLicense = {
  approved: boolean;
  internalUse: boolean;
  reference: string;
  expiresAt?: string;
  retainHistory?: boolean;
};

export function licenseError(feed: Pick<MlsFeed, "options" | "retentionPolicy">, now = new Date()): string | null {
  const license = feed.options?.license as Partial<FeedLicense> | undefined;
  if (!license || license.approved !== true || license.internalUse !== true || typeof license.reference !== "string" || !license.reference.trim()) {
    return "Record the signed license reference and explicit internal-use approval in options.license before running this feed.";
  }
  if (license.expiresAt && (!Number.isFinite(Date.parse(license.expiresAt)) || Date.parse(license.expiresAt) <= now.getTime())) {
    return "This feed's recorded license has expired or has an invalid expiry date.";
  }
  if (feed.retentionPolicy === "retain_history" && license.retainHistory !== true) {
    return "History retention requires explicit permission in the signed license and options.license.retainHistory=true.";
  }
  return null;
}

export function approvedFeedSql(alias = "lf", feedIdExpr = "mls_listings.feedId") {
  // Arguments come only from application code, never user input. Mirrors licenseError for SQL reads.
  return `EXISTS (SELECT 1 FROM mls_feeds AS ${alias}
    WHERE ${alias}.id = ${feedIdExpr}
      AND ${alias}.options->>'$.license.approved' = 'true'
      AND ${alias}.options->>'$.license.internalUse' = 'true'
      AND COALESCE(TRIM(${alias}.options->>'$.license.reference'), '') <> ''
      AND (${alias}.options->>'$.license.expiresAt' IS NULL
        OR STR_TO_DATE(LEFT(${alias}.options->>'$.license.expiresAt', 10), '%Y-%m-%d') > UTC_DATE())
      AND (${alias}.retentionPolicy <> 'retain_history' OR ${alias}.options->>'$.license.retainHistory' = 'true'))`;
}

/** For large search/count scans, resolve licensed feed IDs once rather than
 * rechecking the same JSON license on every listing. Keep the exact predicate
 * in approvedFeedSql so expiry and revocation remain fail-closed. */
export function approvedFeedSetSql(alias = "scope", feedIdExpr = "mls_listings.feedId") {
  // Aliases and expressions are fixed application code, never user input.
  return `${feedIdExpr} IN (SELECT ${alias}.id FROM mls_feeds AS ${alias}
    WHERE ${approvedFeedSql(`${alias}License`, `${alias}.id`)})`;
}
