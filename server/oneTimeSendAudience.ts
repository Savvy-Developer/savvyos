/**
 * The two One Time Send audiences that are not Smart Plan triggers.
 *
 * Every other audience is a trigger borrowed from Smart Plans — a lead source,
 * a transaction reaching a stage — and answers "who will keep arriving here".
 * These two answer "who is already here": contacts carrying a tag, and a list
 * somebody picked by hand. Neither can be a Smart Plan trigger, because a
 * Smart Plan enrols contacts as they arrive and a hand-picked list cannot
 * arrive. They live here rather than in smartPlanScheduler.ts for that reason.
 */

import { and, inArray, isNull, or, sql } from "drizzle-orm";

import { getDb } from "./db";
import { contacts } from "../drizzle/schema";

/**
 * Longest tag a One Time Send can target. Contact tags are free text from
 * imports and Zapier, and in production 271 of 1,190 distinct tags are over
 * 64 characters, so a shorter limit hid a fifth of them from the picker.
 */
export const ONE_TIME_SEND_TAG_MAX_LENGTH = 255;

export const BROADCAST_ONLY_AUDIENCES = ["tag", "manual_contacts"] as const;
export type BroadcastOnlyAudience = (typeof BROADCAST_ONLY_AUDIENCES)[number];

export function isBroadcastOnlyAudience(value: string): value is BroadcastOnlyAudience {
  return (BROADCAST_ONLY_AUDIENCES as readonly string[]).includes(value);
}

export type BroadcastAudienceConfiguration = {
  triggerType: string;
  triggerTags?: string[] | null;
  triggerContactIds?: number[] | null;
};

/**
 * Tags as they will be matched.
 *
 * Contacts carry tags in a JSON array written by the importer and the contact
 * form, so " VIP" and "VIP" both exist in the data. Trimming here means the
 * composer and the send agree on what was asked for, and de-duplicating stops
 * one contact being counted twice when two spellings of a tag collapse into
 * one. Order is kept so the history reads back the way it was chosen.
 */
export function normalizedAudienceTags(tags: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags ?? []) {
    const trimmed = typeof tag === "string" ? tag.trim() : "";
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Hand-picked contact ids, de-duplicated.
 *
 * The picker can add the same contact twice — search, pick, search again — and
 * a duplicate would mean two messages to one person.
 */
export function normalizedAudienceContactIds(ids: readonly number[] | null | undefined): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of ids ?? []) {
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Contacts carrying any one of the tags.
 *
 * MySQL sees contacts.tags as JSON, so a LIKE over the raw text would match
 * "VIP" inside "VIP-2024" and inside a contact's notes-shaped tag. JSON_CONTAINS
 * against a quoted scalar matches whole elements only. JSON_OVERLAPS would do
 * the whole list in one call but needs MySQL 8.0.17, and this runs against
 * whatever Railway provisions, so it is an OR of exact element matches.
 *
 * An unset tags column is NULL rather than [], and JSON_CONTAINS returns NULL
 * for it, which is not TRUE — so untagged contacts drop out on their own.
 */
export async function contactIdsForTagAudience(tags: readonly string[]): Promise<number[]> {
  const normalized = normalizedAudienceTags(tags);
  if (!normalized.length) return [];
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      or(
        ...normalized.map(
          tag => sql`JSON_CONTAINS(${contacts.tags}, JSON_QUOTE(${tag}))`,
        ),
      ),
    );
  return Array.from(new Set(rows.map(row => row.id)));
}

/**
 * The picked contacts that still exist and are not archived.
 *
 * The list is chosen in the composer and queued later, so a contact can be
 * archived in between. Reading them back rather than trusting the ids also
 * keeps a stale browser tab from queueing a send to a deleted record, and the
 * count the composer previews is then the count that is actually sent.
 */
export async function contactIdsForManualAudience(ids: readonly number[]): Promise<number[]> {
  const normalized = normalizedAudienceContactIds(ids);
  if (!normalized.length) return [];
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(inArray(contacts.id, normalized), isNull(contacts.archivedAt)));
  const found = new Set(rows.map(row => row.id));
  // Kept in the order they were picked, so the preview and the history read
  // back the way the list was built.
  return normalized.filter(id => found.has(id));
}

/** Resolve whichever of the two audiences this configuration describes. */
export async function contactIdsForBroadcastAudience(
  config: BroadcastAudienceConfiguration,
): Promise<number[]> {
  if (config.triggerType === "tag") return contactIdsForTagAudience(config.triggerTags ?? []);
  if (config.triggerType === "manual_contacts") {
    return contactIdsForManualAudience(config.triggerContactIds ?? []);
  }
  return [];
}
