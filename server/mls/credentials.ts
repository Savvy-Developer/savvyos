import type { MlsFeed, MlsProvider } from "../../drizzle/mlsSchema";

/**
 * MLS credentials live in the environment (Railway service variables), never
 * in the database or the admin UI. A feed stores only a reference such as
 * "MLSGRID"; the secret is read from MLS_CRED_MLSGRID_TOKEN (or _CLIENT_ID and
 * _CLIENT_SECRET for OAuth client-credential providers).
 *
 * One credential can serve several feeds. MLS Grid issues one token per
 * subscription that covers every approved originating system, so all MLS Grid
 * feeds usually share the same reference and the same rate limits.
 */

export const CREDENTIAL_REF_PATTERN = /^[A-Z][A-Z0-9_]{1,40}$/;

const REQUIRED_PARTS: Record<MlsProvider, string[][]> = {
  mls_grid: [["TOKEN"]],
  trestle: [["CLIENT_ID", "CLIENT_SECRET"]],
  spark: [["TOKEN"]],
  // Direct RESO servers use either a static bearer token or client credentials.
  reso_web_api: [["TOKEN"], ["CLIENT_ID", "CLIENT_SECRET"]],
  custom: [[]],
};

export function credentialVariable(ref: string, part: string) {
  return `MLS_CRED_${ref}_${part}`;
}

export function readCredential(ref: string, part: string): string | null {
  const value = process.env[credentialVariable(ref, part)];
  return value && value.trim() ? value.trim() : null;
}

export function credentialStatus(feed: Pick<MlsFeed, "provider" | "credentialRef">) {
  const options = REQUIRED_PARTS[feed.provider];
  const ref = feed.credentialRef;
  const valid = CREDENTIAL_REF_PATTERN.test(ref);
  const satisfied = valid && options.some(parts => parts.every(part => readCredential(ref, part)));
  return {
    configured: satisfied,
    expectedVariables: options.map(parts => parts.map(part => credentialVariable(ref, part))),
  };
}
