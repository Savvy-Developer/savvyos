/**
 * Contact Merge Engine
 *
 * Merges a "loser" contact into a "winner" contact by:
 *  1. Re-parenting all FK references from loser → winner
 *  2. Merging scalar fields (winner wins on conflict; loser fills gaps)
 *  3. Concatenating notes
 *  4. Soft-deleting the loser (archivedAt = now)
 *  5. Updating the duplicate_contact_pairs row as merged
 *
 * Tables re-parented:
 *  - agent_connections (contactId)
 *  - property_ownership (ownerContactId)
 *  - transactions (primaryContactId, sellerContactId, buyerContactId)
 *  - tasks (relatedContactId)
 *  - documents (relatedContactId)
 *  - communications (relatedContactId)
 *  - contact_properties (contactId)
 *  - listings (contactId)
 *  - smart_plan_enrollments (contactId)
 *  - market_match_sessions (contactId)
 *  - connection_requests (contactId)
 *  - activity_log (entityId where entityType='contact')
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { contacts, duplicateContactPairs } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

export interface MergeOptions {
  /** The contact to keep */
  winnerId: number;
  /** The contact to archive/remove */
  loserId: number;
  /** The duplicate pair record id */
  pairId: number;
  /** Admin user performing the merge */
  reviewedById: number;
  /**
   * Field-level overrides: if the admin explicitly chose a value for a field
   * from the loser, pass it here. Keys are contact field names.
   */
  fieldOverrides?: Partial<Record<string, string | number | null>>;
}

export interface MergeResult {
  success: boolean;
  winnerId: number;
  loserId: number;
  fieldsUpdated: string[];
  rowsReparented: number;
}

export async function mergeContacts(opts: MergeOptions): Promise<MergeResult> {
  const dbConn = await getDb();
  if (!dbConn) throw new Error("Database unavailable");
  const db = dbConn;

  const { winnerId, loserId, pairId, reviewedById, fieldOverrides = {} } = opts;

  // Load both contacts
  const [winnerRows, loserRows] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.id, winnerId)),
    db.select().from(contacts).where(eq(contacts.id, loserId)),
  ]);

  const winner = winnerRows[0];
  const loser = loserRows[0];

  if (!winner || !loser) throw new Error("One or both contacts not found");

  // ─── Step 1: Build merged scalar fields ──────────────────────────────────────
  // Winner's value takes precedence; loser fills in gaps (null/empty fields)
  const fieldsUpdated: string[] = [];

  const scalarFields: Array<keyof typeof winner> = [
    "email", "phone", "secondaryEmail", "secondaryPhone",
    "address", "city", "state", "zip",
    "spouseFirstName", "spouseLastName", "spouseEmail", "spousePhone",
    "leadSourceId", "assignedIsaId", "isaStatus",
    "campaignSource", "partnershipName",
  ];

  const updates: Record<string, unknown> = {};

  for (const field of scalarFields) {
    // Admin override takes top priority
    if (field in fieldOverrides) {
      const override = fieldOverrides[field as string];
      if (override !== winner[field]) {
        updates[field] = override;
        fieldsUpdated.push(field);
      }
      continue;
    }
    // Winner has value → keep it; winner is null/empty → take loser's value
    const winnerVal = winner[field];
    const loserVal = loser[field];
    if ((winnerVal === null || winnerVal === undefined || winnerVal === "") && loserVal) {
      updates[field] = loserVal;
      fieldsUpdated.push(field);
    }
  }

  // Merge notes: concatenate with separator if both have notes
  if (loser.notes) {
    const combined = winner.notes
      ? `${winner.notes}\n\n--- Merged from duplicate contact ---\n${loser.notes}`
      : loser.notes;
    updates["notes"] = combined;
    fieldsUpdated.push("notes");
  }

  // Apply scalar updates to winner
  if (Object.keys(updates).length > 0) {
    await db.update(contacts).set(updates).where(eq(contacts.id, winnerId));
  }

  // ─── Step 2: Re-parent all FK references ─────────────────────────────────────
  let rowsReparented = 0;

  // Helper: run a raw UPDATE and count affected rows
  async function reparent(tableName: string, column: string): Promise<number> {
    const result = await db.execute(
      sql.raw(`UPDATE \`${tableName}\` SET \`${column}\` = ${winnerId} WHERE \`${column}\` = ${loserId}`)
    );
    // mysql2 returns [ResultSetHeader, FieldPacket[]]
    const header = Array.isArray(result) ? result[0] : result;
    return (header as { affectedRows?: number }).affectedRows ?? 0;
  }

  rowsReparented += await reparent("agent_connections", "contactId");
  rowsReparented += await reparent("property_ownership", "ownerContactId");
  rowsReparented += await reparent("transactions", "primaryContactId");
  rowsReparented += await reparent("transactions", "seller_contact_id");
  rowsReparented += await reparent("transactions", "buyer_contact_id");
  rowsReparented += await reparent("tasks", "relatedContactId");
  rowsReparented += await reparent("documents", "relatedContactId");
  rowsReparented += await reparent("communications", "relatedContactId");
  rowsReparented += await reparent("contact_properties", "contactId");
  rowsReparented += await reparent("listings", "contactId");
  rowsReparented += await reparent("smart_plan_enrollments", "contactId");
  rowsReparented += await reparent("market_match_sessions", "contactId");
  rowsReparented += await reparent("connection_requests", "contactId");

  // Activity log uses polymorphic entityId + entityType
  const activityResult = await db.execute(
    sql.raw(`UPDATE \`activity_log\` SET \`entityId\` = ${winnerId} WHERE \`entityId\` = ${loserId} AND \`entityType\` = 'contact'`)
  );
  const activityHeader = Array.isArray(activityResult) ? activityResult[0] : activityResult;
  rowsReparented += (activityHeader as { affectedRows?: number }).affectedRows ?? 0;

  // Also update any duplicate_contact_pairs that reference the loser
  await db.execute(
    sql.raw(`UPDATE \`duplicate_contact_pairs\` SET \`contactAId\` = ${winnerId} WHERE \`contactAId\` = ${loserId} AND \`id\` != ${pairId}`)
  );
  await db.execute(
    sql.raw(`UPDATE \`duplicate_contact_pairs\` SET \`contactBId\` = ${winnerId} WHERE \`contactBId\` = ${loserId} AND \`id\` != ${pairId}`)
  );
  // Dismiss any other pairs that now point to the same contact on both sides
  await db.execute(
    sql.raw(`UPDATE \`duplicate_contact_pairs\` SET \`status\` = 'dismissed' WHERE \`contactAId\` = \`contactBId\` AND \`id\` != ${pairId}`)
  );

  // ─── Step 3: Soft-delete the loser ───────────────────────────────────────────
  await db.update(contacts)
    .set({ archivedAt: new Date() })
    .where(eq(contacts.id, loserId));

  // ─── Step 4: Mark the pair as merged ─────────────────────────────────────────
  await db.update(duplicateContactPairs)
    .set({
      status: "merged",
      keptContactId: winnerId,
      reviewedById,
      reviewedAt: new Date(),
    })
    .where(eq(duplicateContactPairs.id, pairId));

  return { success: true, winnerId, loserId, fieldsUpdated, rowsReparented };
}
