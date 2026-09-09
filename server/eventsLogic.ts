import { timingSafeEqual } from "node:crypto";

export type HeadcountComponentValue = {
  count: number | null;
  sourceType: string;
};

export function calculateHeadcount(components: HeadcountComponentValue[]) {
  const missing = components.filter(
    component => component.count === null
  ).length;
  if (missing > 0) return { total: null, missing };
  return {
    total: components.reduce(
      (sum, component) => sum + (component.count ?? 0),
      0
    ),
    missing: 0,
  };
}

export function normalizeSwoogoType(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * Matches the prototype behavior: exact type matches are preferred, then a
 * cautious substring fallback can be used after the source model is approved.
 */
export function matchSwoogoType(
  requestedType: string,
  availableTypes: string[]
): string | null {
  const requested = normalizeSwoogoType(requestedType);
  if (!requested) return null;
  const exact = availableTypes.find(
    type => normalizeSwoogoType(type) === requested
  );
  if (exact) return exact;
  return (
    availableTypes.find(type => {
      const normalized = normalizeSwoogoType(type);
      return normalized.includes(requested) || requested.includes(normalized);
    }) ?? null
  );
}

export function extractSwoogoEventId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  const nested = [
    body.data,
    body.payload,
    body.registrant,
    body.speaker,
    body.sponsor,
  ].find(value => value && typeof value === "object") as
    | Record<string, unknown>
    | undefined;
  const candidate =
    nested?.event_id ?? nested?.eventId ?? body.event_id ?? body.eventId;
  if (candidate === null || candidate === undefined) return null;
  const value = String(candidate).trim();
  return value || null;
}

export function resolveSwoogoWebhookType(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "unknown";
  const body = payload as Record<string, unknown>;
  const candidate = body.type ?? body.event ?? body.object ?? "registrant";
  return String(candidate).trim().toLowerCase().slice(0, 64) || "registrant";
}

export function staticWebhookTokenMatches(
  received: string | undefined,
  expected: string | undefined
): boolean {
  if (!expected?.trim() || !received) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected.trim());
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
