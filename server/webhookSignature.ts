/**
 * Inbound webhook signatures.
 *
 * A sender signs the exact bytes it sends. The old check re-serialized the
 * parsed body with JSON.stringify, which only matches when the sender happened
 * to send compact JSON with the same key order and escaping. Anything else
 * (pretty-printed JSON, form posts, "é" style escapes) failed with 401
 * even though the signature was correct.
 *
 * The body parsers now keep the original bytes for /api/inbound/* requests, and
 * the signature is checked against them. The re-serialized body is still
 * accepted as a fallback so senders set up against the old behaviour keep
 * working. Both paths require the endpoint secret, so the fallback does not
 * weaken the check.
 */
import crypto from "crypto";

export const INBOUND_WEBHOOK_PATH_PREFIX = "/api/inbound/";

const RAW_BODY_KEY = "_inboundRawBody";

/** `verify` hook for express.json / express.urlencoded. Keeps a copy of the
 *  original bytes, only for inbound webhook requests. */
export function captureInboundRawBody(req: unknown, _res: unknown, buf: Buffer): void {
  const r = req as { originalUrl?: string; url?: string } & Record<string, unknown>;
  const path = r.originalUrl ?? r.url ?? "";
  if (path.startsWith(INBOUND_WEBHOOK_PATH_PREFIX)) r[RAW_BODY_KEY] = Buffer.from(buf);
}

export function inboundRawBody(req: unknown): Buffer | undefined {
  const value = (req as Record<string, unknown>)[RAW_BODY_KEY];
  return Buffer.isBuffer(value) ? value : undefined;
}

function signatureMatches(payload: Buffer, secret: string, sig: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, "hex");
  } catch {
    return false;
  }
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/**
 * True when `headerValue` is a valid HMAC-SHA256 of the request.
 * Accepts "sha256=<hex>" (GitHub style) or plain hex.
 */
export function verifyInboundSignature(
  secret: string,
  headerValue: string | undefined,
  rawBody: Buffer | undefined,
  parsedBody: unknown,
): boolean {
  if (!headerValue) return false;
  const sig = (headerValue.startsWith("sha256=") ? headerValue.slice(7) : headerValue).trim();
  if (!/^[0-9a-fA-F]+$/.test(sig)) return false;

  if (rawBody && signatureMatches(rawBody, secret, sig)) return true;

  // Legacy: senders that signed JSON.stringify of the payload.
  const legacy =
    typeof parsedBody === "string"
      ? parsedBody
      : parsedBody && typeof parsedBody === "object"
        ? JSON.stringify(parsedBody)
        : "{}";
  return signatureMatches(Buffer.from(legacy, "utf8"), secret, sig);
}
