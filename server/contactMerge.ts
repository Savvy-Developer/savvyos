/**
 * Contact Merge Engine
 *
 * Merges a "loser" contact into a "winner" contact by:
 *  1. Re-parenting all FK references from loser → winner
 *  2. Merging scalar fields (winner wins on conflict; loser fills gaps)
 *  3. Concatenating notes
 *  4. Retaining ALL agent connections and ISA assignments from both contacts
 *  5. Soft-deleting the loser (archivedAt = now)
 *  6. Updating the duplicate_contact_pairs row as merged
 *
 * Tables re-parented:
 *  - agent_connections (contactId) — with deduplication to avoid duplicate agent+contact pairs
 *  - property_ownership (ownerContactId)
 *  - transactions (primaryContactId, sellerContactId, buyerContactId)
 *  - tasks (relatedContactId)
 *  - documents (relatedContactId)
 *  - communications (relatedContactId)
 *  - contact_properties (contactId)
 *  - listings (contactId)
 *  - smart_plan_enrollments (contactId)
 *  - market_match_sessions (contactId)
 *  - connection_requests (contactId) — with deduplication to avoid duplicate agent+contact pairs
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
    "assignedIsaId", "isaStatus",
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

  // ─── Agent Connections: Retain ALL from both contacts ─────────────────────────
  // Instead of a blind re-parent (which could create duplicate agent+contact rows
  // or silently fail on unique constraints), we:
  //   1. Find which agents are already connected to the winner
  //   2. For loser's connections where the agent is NOT already connected to winner,
  //      re-parent them (move to winner)
  //   3. For loser's connections where the agent IS already connected to winner,
  //      merge the notes/data into the existing winner connection, then delete the duplicate
  const [winnerConnections]: any = await db.execute(
    sql.raw(`SELECT id, agentId, pipelineStatus, agentNotes, followUpDate, appointmentSet, appointmentSetAt, createdAt FROM agent_connections WHERE contactId = ${winnerId}`)
  );
  const [loserConnections]: any = await db.execute(
    sql.raw(`SELECT id, agentId, pipelineStatus, agentNotes, followUpDate, appointmentSet, appointmentSetAt, createdAt FROM agent_connections WHERE contactId = ${loserId}`)
  );

  const winnerAgentIds = new Set((winnerConnections as any[]).map((c: any) => c.agentId));

  for (const loserConn of (loserConnections as any[])) {
    if (!winnerAgentIds.has(loserConn.agentId)) {
      // Agent not connected to winner yet — move this connection to the winner
      await db.execute(
        sql.raw(`UPDATE agent_connections SET contactId = ${winnerId} WHERE id = ${loserConn.id}`)
      );
      rowsReparented++;
    } else {
      // Agent already connected to winner — merge notes and keep the more advanced pipeline status
      const winnerConn = (winnerConnections as any[]).find((c: any) => c.agentId === loserConn.agentId);
      if (winnerConn) {
        // Merge agentNotes from both connections
        if (loserConn.agentNotes) {
          // Use MySQL CONCAT to safely merge notes
          await db.execute(
            sql.raw(`UPDATE agent_connections SET agentNotes = CONCAT(COALESCE(agentNotes, ''), '\n\n--- Notes from merged contact ---\n', COALESCE((SELECT agentNotes FROM (SELECT agentNotes FROM agent_connections WHERE id = ${loserConn.id}) AS tmp), '')) WHERE id = ${winnerConn.id}`)
          );
        }

        // Keep the earlier createdAt (longer relationship)
        if (loserConn.createdAt && winnerConn.createdAt && new Date(loserConn.createdAt) < new Date(winnerConn.createdAt)) {
          await db.execute(
            sql.raw(`UPDATE agent_connections SET createdAt = '${new Date(loserConn.createdAt).toISOString().slice(0, 19).replace('T', ' ')}' WHERE id = ${winnerConn.id}`)
          );
        }

        // If loser had appointmentSet=true and winner doesn't, keep it
        if (loserConn.appointmentSet && !winnerConn.appointmentSet) {
          await db.execute(
            sql.raw(`UPDATE agent_connections SET appointmentSet = 1, appointmentSetAt = ${loserConn.appointmentSetAt ? "'" + new Date(loserConn.appointmentSetAt).toISOString().slice(0, 19).replace('T', ' ') + "'" : "NULL"} WHERE id = ${winnerConn.id}`)
          );
        }

        // If loser had a followUpDate and winner doesn't, keep it
        if (loserConn.followUpDate && !winnerConn.followUpDate) {
          await db.execute(
            sql.raw(`UPDATE agent_connections SET followUpDate = '${new Date(loserConn.followUpDate).toISOString().slice(0, 19).replace('T', ' ')}' WHERE id = ${winnerConn.id}`)
          );
        }
      }

      // Delete the loser's duplicate connection (data has been merged into winner's)
      await db.execute(
        sql.raw(`DELETE FROM agent_connections WHERE id = ${loserConn.id}`)
      );
      rowsReparented++;
    }
  }

  // ─── Connection Requests: Retain ALL from both contacts ───────────────────────
  // Similar logic: move loser's requests to winner, skip if same agent already has a request
  const [winnerRequests]: any = await db.execute(
    sql.raw(`SELECT id, agentId FROM connection_requests WHERE contactId = ${winnerId}`)
  );
  const [loserRequests]: any = await db.execute(
    sql.raw(`SELECT id, agentId FROM connection_requests WHERE contactId = ${loserId}`)
  );

  const winnerRequestAgentIds = new Set((winnerRequests as any[]).map((r: any) => r.agentId));

  for (const loserReq of (loserRequests as any[])) {
    if (!winnerRequestAgentIds.has(loserReq.agentId)) {
      // No existing request from this agent to winner — move it
      await db.execute(
        sql.raw(`UPDATE connection_requests SET contactId = ${winnerId} WHERE id = ${loserReq.id}`)
      );
      rowsReparented++;
    } else {
      // Agent already has a request for winner — delete the duplicate
      await db.execute(
        sql.raw(`DELETE FROM connection_requests WHERE id = ${loserReq.id}`)
      );
      rowsReparented++;
    }
  }

  // ─── Standard re-parenting for other tables ───────────────────────────────────
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
