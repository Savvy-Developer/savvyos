/**
 * Duplicate Contact Detection Engine
 *
 * Identifies duplicate contacts via:
 *  1. Exact email match (case-insensitive)
 *  2. Exact phone match (normalized to digits only)
 *  3. Exact first+last+address match (case-insensitive, normalized)
 *  4. Fuzzy name match using Jaro-Winkler similarity (≥ 0.92 threshold)
 *
 * Returns a list of candidate pairs with matchType and confidence score.
 */

import { getDb } from "./db";
import { contacts, duplicateContactPairs } from "../drizzle/schema";
import { sql } from "drizzle-orm";

// ─── Jaro-Winkler similarity ──────────────────────────────────────────────────

function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDist = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
}

function jaroWinkler(s1: string, s2: string, p = 0.1): number {
  const jaroSim = jaro(s1, s2);
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaroSim + prefix * p * (1 - jaroSim);
}

// ─── Normalization helpers ────────────────────────────────────────────────────

export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

export function normalizeEmail(email: string | null | undefined): string {
  if (!email) return "";
  return email.trim().toLowerCase();
}

function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeAddress(addr: string | null | undefined): string {
  if (!addr) return "";
  return addr.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,#-]/g, "");
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type MatchType = "email" | "phone" | "name_address" | "fuzzy_name";

export interface DuplicatePairCandidate {
  contactAId: number;
  contactBId: number;
  matchType: MatchType;
  confidence: number; // 0-100
}

// ─── Detection ────────────────────────────────────────────────────────────────

/**
 * Scan the entire contacts table and return all duplicate pair candidates.
 * Excludes archived contacts and already-merged pairs.
 */
export async function detectAllDuplicates(): Promise<DuplicatePairCandidate[]> {
  // Load all non-archived contacts
  const db = await getDb();
  if (!db) return [];
  const allContacts = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      address: contacts.address,
      city: contacts.city,
      state: contacts.state,
    })
    .from(contacts)
    .where(sql`${contacts.archivedAt} IS NULL`);

  const pairs: DuplicatePairCandidate[] = [];
  const seen = new Set<string>();

  function addPair(aId: number, bId: number, matchType: MatchType, confidence: number) {
    const key = `${Math.min(aId, bId)}-${Math.max(aId, bId)}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ contactAId: Math.min(aId, bId), contactBId: Math.max(aId, bId), matchType, confidence });
  }

  // Build lookup maps for exact matches
  const emailMap = new Map<string, number[]>();
  const phoneMap = new Map<string, number[]>();
  const nameAddrMap = new Map<string, number[]>();

  for (const c of allContacts) {
    const email = normalizeEmail(c.email);
    if (email) {
      if (!emailMap.has(email)) emailMap.set(email, []);
      emailMap.get(email)!.push(c.id);
    }

    const phone = normalizePhone(c.phone);
    if (phone.length >= 10) {
      // Use last 10 digits to normalize country codes
      const normalized = phone.slice(-10);
      if (!phoneMap.has(normalized)) phoneMap.set(normalized, []);
      phoneMap.get(normalized)!.push(c.id);
    }

    const fn = normalizeName(c.firstName);
    const ln = normalizeName(c.lastName);
    const addr = normalizeAddress(c.address);
    const city = normalizeName(c.city);
    if (fn && ln && (addr || city)) {
      const key = `${fn}|${ln}|${addr}|${city}`;
      if (!nameAddrMap.has(key)) nameAddrMap.set(key, []);
      nameAddrMap.get(key)!.push(c.id);
    }
  }

  // Exact email duplicates
  for (const ids of Array.from(emailMap.values())) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        addPair(ids[i], ids[j], "email", 100);
      }
    }
  }

  // Exact phone duplicates
  for (const ids of Array.from(phoneMap.values())) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        addPair(ids[i], ids[j], "phone", 95);
      }
    }
  }

  // Exact name+address duplicates
  for (const ids of Array.from(nameAddrMap.values())) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        addPair(ids[i], ids[j], "name_address", 90);
      }
    }
  }

  // Fuzzy name matching (Jaro-Winkler ≥ 0.92 on full name)
  // Only run on contacts that haven't already been paired by exact match
  const FUZZY_THRESHOLD = 0.92;
  for (let i = 0; i < allContacts.length; i++) {
    const a = allContacts[i];
    const fullA = normalizeName(`${a.firstName} ${a.lastName}`);
    if (!fullA.trim()) continue;

    for (let j = i + 1; j < allContacts.length; j++) {
      const b = allContacts[j];
      const key = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
      if (seen.has(key)) continue; // already captured by exact match

      const fullB = normalizeName(`${b.firstName} ${b.lastName}`);
      if (!fullB.trim()) continue;

      const sim = jaroWinkler(fullA, fullB);
      if (sim >= FUZZY_THRESHOLD) {
        const confidence = Math.round(sim * 100);
        addPair(a.id, b.id, "fuzzy_name", confidence);
      }
    }
  }

  return pairs;
}

/**
 * Persist detected pairs to the DB, skipping pairs that already exist.
 * Returns the count of newly inserted pairs.
 */
export async function persistDuplicatePairs(pairs: DuplicatePairCandidate[]): Promise<number> {
  if (pairs.length === 0) return 0;

  // Load existing pairs to avoid re-inserting
  const db = await getDb();
  if (!db) return 0;
  const existing = await db
    .select({ contactAId: duplicateContactPairs.contactAId, contactBId: duplicateContactPairs.contactBId })
    .from(duplicateContactPairs);

  const existingSet = new Set(existing.map((p: { contactAId: number; contactBId: number }) => `${p.contactAId}-${p.contactBId}`));

  const toInsert = pairs.filter((p) => !existingSet.has(`${p.contactAId}-${p.contactBId}`));

  if (toInsert.length === 0) return 0;

  await db.insert(duplicateContactPairs).values(
    toInsert.map((p) => ({
      contactAId: p.contactAId,
      contactBId: p.contactBId,
      matchType: p.matchType,
      confidence: p.confidence,
      status: "pending" as const,
    }))
  );

  return toInsert.length;
}
