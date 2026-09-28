const CONTENT_PREFIX = "savvyos-cascade-v2:";

type StoredCascadeContent = { subject: string; body: string };

/** Keeps the optional cascade subject with the canonical message body without changing the legacy table. */
export function encodeCascadeContent(subject: string, body: string) {
  return `${CONTENT_PREFIX}${JSON.stringify({ subject, body })}`;
}

/** Safely reads enriched content while preserving all historical cascade bodies unchanged. */
export function decodeCascadeContent(value: string): StoredCascadeContent {
  if (!value.startsWith(CONTENT_PREFIX))
    return { subject: "Cascading message", body: value };
  try {
    const parsed = JSON.parse(value.slice(CONTENT_PREFIX.length));
    if (
      typeof parsed?.subject === "string" &&
      typeof parsed?.body === "string"
    ) {
      return { subject: parsed.subject, body: parsed.body };
    }
  } catch {
    // Preserve malformed or hand-written legacy records as their original text.
  }
  return { subject: "Cascading message", body: value };
}
