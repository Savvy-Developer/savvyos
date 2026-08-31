/**
 * Lossless contact merge engine.
 *
 * A merge never deletes a contact, connection, or losing field value. The losing
 * contact is soft-archived; values not retained on the surviving record are
 * recorded in contact_merge_archives with their full source context. Active
 * references are re-pointed to the surviving contact whenever that is safe.
 */

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { agentConnections, contactMergeArchives, contactRelationships, contacts, duplicateContactPairs } from "../drizzle/schema";
import { getDb } from "./db";

export type MergeMethodSelection = {
  value: string;
  isPrimary: boolean;
};

export interface MergeOptions {
  /** The contact to keep. */
  winnerId: number;
  /** The contact to archive. */
  loserId: number;
  /** The duplicate-pair audit record. */
  /** Existing duplicate-pair audit record; omitted only for a manual merge. */
  pairId?: number;
  /** Administrator performing the merge. */
  reviewedById: number;
  /** Explicitly selected scalar values for conflicting fields. */
  fieldOverrides?: Partial<Record<string, string | number | null>>;
  /** Up to three retained emails, with exactly one primary selection. */
  retainEmails?: MergeMethodSelection[];
  /** Up to three retained phones, with exactly one primary selection. */
  retainPhones?: MergeMethodSelection[];
  /** Explicitly retained agents when both records have different agents. */
  retainAgentIds?: number[];
  /** Explicit choice for conflicting profiles on a shared agent connection. */
  connectionFieldOverrides?: Record<string, Record<string, "winner" | "loser">>;
}

export interface MergeResult {
  success: boolean;
  winnerId: number;
  loserId: number;
  fieldsUpdated: string[];
  rowsReparented: number;
  archivedItems: number;
}

const CONTACT_PROMPT_FIELDS = [
  "firstName", "lastName", "address", "city", "state", "zip",
  "spouseFirstName", "spouseLastName", "spouseEmail", "spousePhone",
  "assignedIsaId", "isaStatus", "timezone",
] as const;

const CONNECTION_PROMPT_FIELDS = [
  "pipelineStatus", "followUpDate", "propertyType", "minPrice", "maxPrice",
  "minBeds", "maxBeds", "minBaths", "minSqft", "maxSqft", "targetCities",
  "targetZips", "strRequirements", "investmentNotes", "appointmentSet",
  "appointmentSetAt", "appointmentSetByUserId", "agingUpdatedAt",
] as const;

const CONTACT_REFERENCE_COLUMNS: Array<[string, string]> = [
  ["property_ownership", "ownerContactId"],
  ["transactions", "primaryContactId"],
  ["transactions", "seller_contact_id"],
  ["transactions", "buyer_contact_id"],
  ["review_requests", "contactId"],
  ["reviews", "contactId"],
  ["isa_outcome_attributions", "contactId"],
  ["tasks", "relatedContactId"],
  ["webinar_attendees", "contactId"],
  ["documents", "relatedContactId"],
  ["communications", "relatedContactId"],
  ["contact_properties", "contactId"],
  ["listings", "contactId"],
  ["one_time_send_recipients", "contactId"],
  ["market_match_sessions", "contactId"],
  ["pipeline_email_sends", "contactId"],
  ["webhook_logs", "contactId"],
  ["landing_page_submissions", "contactId"],
  ["landing_page_events", "contactId"],
  ["landing_page_sms_consents", "contactId"],
  ["email_behaviors", "contactId"],
  ["aircall_messages", "contactId"],
  ["aircall_calls", "contactId"],
  ["referrals", "contactId"],
];

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  if (left instanceof Date || right instanceof Date) return new Date(left as any).getTime() === new Date(right as any).getTime();
  return JSON.stringify(left) === JSON.stringify(right);
}

function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalisePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function safeId(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid merge identifier");
  return value;
}

function sqlDate(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace("T", " ");
}

function leadSourceSignature(contact: any): string {
  // Do not treat a shared ID as permission to overwrite conflicting legacy
  // attribution. Any attribution difference is a non-bypassable hard stop.
  return `id:${contact.leadSourceId ?? ""}|legacy:${contact.leadSourceType ?? ""}|${contact.campaignSource ?? ""}|${contact.partnershipName ?? ""}`;
}

export function areLeadSourcesCompatible(winner: unknown, loser: unknown): boolean {
  return leadSourceSignature(winner as any) === leadSourceSignature(loser as any);
}

export function agentConnectionResolutionRequired(winnerAgentIds: number[], loserAgentIds: number[]): boolean {
  const winnerIds = new Set(winnerAgentIds);
  const loserIds = new Set(loserAgentIds);
  return winnerIds.size > 0 && loserIds.size > 0 && (
    Array.from(winnerIds).some((agentId) => !loserIds.has(agentId)) ||
    Array.from(loserIds).some((agentId) => !winnerIds.has(agentId))
  );
}

function toComparable(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function resolveMergeMethodSelections(
  selections: MergeMethodSelection[] | undefined,
  candidates: string[],
  kind: "email" | "phone",
): string[] {
  const uniqueCandidates = candidates.filter((value, index, values) => {
    const key = kind === "email" ? normaliseEmail(value) : normalisePhone(value);
    return values.findIndex((entry) => (kind === "email" ? normaliseEmail(entry) : normalisePhone(entry)) === key) === index;
  });
  if (uniqueCandidates.length === 0) return [];
  if (!selections || selections.length === 0) {
    throw new Error(`Select the ${kind}s to retain and mark one as Primary before merging.`);
  }
  if (selections.length > 3) throw new Error(`A maximum of three ${kind}s can be retained.`);
  if (selections.filter((entry) => entry.isPrimary).length !== 1) {
    throw new Error(`Mark exactly one retained ${kind} as Primary.`);
  }
  const seen = new Set<string>();
  for (const selection of selections) {
    const value = selection.value?.trim();
    const key = kind === "email" ? normaliseEmail(value) : normalisePhone(value);
    const matchesCandidate = uniqueCandidates.some((candidate) => (kind === "email" ? normaliseEmail(candidate) : normalisePhone(candidate)) === key);
    if (!value || !matchesCandidate || seen.has(key)) throw new Error(`Each retained ${kind} must be a unique value from the selected contacts.`);
    seen.add(key);
  }
  return [...selections]
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    .map((entry) => entry.value.trim());
}

function priorityEmailStatus(status: string | null | undefined): "valid" | "bounced" | "unsubscribed" {
  if (status === "unsubscribed") return "unsubscribed";
  if (status === "bounced") return "bounced";
  return "valid";
}

function mergeTags(winnerTags: unknown, loserTags: unknown): string[] | null {
  const tags = [...(Array.isArray(winnerTags) ? winnerTags : []), ...(Array.isArray(loserTags) ? loserTags : [])]
    .filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
  const unique = Array.from(new Set(tags));
  return unique.length ? unique : null;
}

/** Reuse this service from both detected and manual relationship flows. */
export async function linkContactsAsRelationship(input: {
  contactAId: number;
  contactBId: number;
  relationshipType: "spouse" | "partner" | "business_partner" | "unknown_relationship";
  createdByUserId: number;
  sourcePairId?: number | null;
}): Promise<{ success: true; relationshipType: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const contactAId = safeId(input.contactAId);
  const contactBId = safeId(input.contactBId);
  if (contactAId === contactBId) throw new Error("Choose two different contacts to link.");

  const active = await db.select({ id: contacts.id }).from(contacts).where(and(
    inArray(contacts.id, [contactAId, contactBId]),
    isNull(contacts.archivedAt),
  ));
  if (active.length !== 2) throw new Error("One or both selected contacts are no longer active.");

  const [existing]: any = await db.execute(sql.raw(
    `SELECT id FROM contact_relationships WHERE archivedAt IS NULL AND ((contactId = ${contactAId} AND relatedContactId = ${contactBId}) OR (contactId = ${contactBId} AND relatedContactId = ${contactAId})) LIMIT 1`,
  ));
  if (!existing?.length) {
    await db.execute(sql.raw(`INSERT INTO contact_relationships (contactId, relatedContactId, relationshipType, sourcePairId, createdByUserId) VALUES (${contactAId}, ${contactBId}, '${input.relationshipType}', ${input.sourcePairId ?? "NULL"}, ${safeId(input.createdByUserId)}), (${contactBId}, ${contactAId}, '${input.relationshipType}', ${input.sourcePairId ?? "NULL"}, ${safeId(input.createdByUserId)})`));
  }
  return { success: true, relationshipType: input.relationshipType };
}

export async function mergeContacts(opts: MergeOptions): Promise<MergeResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const winnerId = safeId(opts.winnerId);
  const loserId = safeId(opts.loserId);
  let pairId = opts.pairId == null ? null : safeId(opts.pairId);
  const reviewedById = safeId(opts.reviewedById);
  if (winnerId === loserId) throw new Error("Choose two different contacts to merge.");

  const [winnerRows, loserRows] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.id, winnerId)),
    db.select().from(contacts).where(eq(contacts.id, loserId)),
  ]);
  const winner: any = winnerRows[0];
  const loser: any = loserRows[0];
  if (!winner || !loser || winner.archivedAt || loser.archivedAt) throw new Error("One or both contacts are no longer active.");

  // There is deliberately no bypass for source attribution. This check lives in
  // the engine so detected pairs, manual pairs, and any future API all obey it.
  if (!areLeadSourcesCompatible(winner, loser)) {
    throw new Error("Merge blocked: contacts have different Lead Source values. Lead Source attribution cannot be merged or overridden.");
  }

  if (pairId != null) {
    const [pair] = await db.select().from(duplicateContactPairs).where(eq(duplicateContactPairs.id, pairId)).limit(1);
    const pairMatchesContacts = pair && (
      (pair.contactAId === winnerId && pair.contactBId === loserId) ||
      (pair.contactAId === loserId && pair.contactBId === winnerId)
    );
    if (!pairMatchesContacts || pair.status !== "pending") {
      throw new Error("The duplicate review record no longer matches these active contacts. Refresh and review the pair again.");
    }
  }

  const candidateEmails = [winner.email, winner.secondaryEmail, winner.thirdEmail, loser.email, loser.secondaryEmail, loser.thirdEmail].filter(hasValue) as string[];
  const candidatePhones = [winner.phone, winner.secondaryPhone, winner.thirdPhone, loser.phone, loser.secondaryPhone, loser.thirdPhone].filter(hasValue) as string[];
  const retainedEmails = resolveMergeMethodSelections(opts.retainEmails, candidateEmails, "email");
  const retainedPhones = resolveMergeMethodSelections(opts.retainPhones, candidatePhones, "phone");

  const [winnerConnectionRows, loserConnectionRows]: any = await Promise.all([
    db.execute(sql.raw(`SELECT * FROM agent_connections WHERE contactId = ${winnerId} AND archivedAt IS NULL`)),
    db.execute(sql.raw(`SELECT * FROM agent_connections WHERE contactId = ${loserId} AND archivedAt IS NULL`)),
  ]);
  const winnerConnections = winnerConnectionRows[0] as any[];
  const loserConnections = loserConnectionRows[0] as any[];
  const winnerAgentIds = new Set(winnerConnections.map((connection) => connection.agentId));
  const loserAgentIds = new Set(loserConnections.map((connection) => connection.agentId));
  const hasAgentConflict = agentConnectionResolutionRequired(Array.from(winnerAgentIds), Array.from(loserAgentIds));
  const retainAgentIds = new Set(opts.retainAgentIds ?? []);
  const allAgentIds = new Set(Array.from(winnerAgentIds).concat(Array.from(loserAgentIds)));
  if (hasAgentConflict) {
    if (retainAgentIds.size === 0 || Array.from(retainAgentIds).some((agentId) => !allAgentIds.has(agentId))) {
      throw new Error("Merge blocked: both contacts are connected to different agents. Select the agent connection(s) to retain before merging.");
    }
  } else {
    Array.from(allAgentIds).forEach((agentId) => retainAgentIds.add(agentId));
  }

  // Validate all user-resolvable contact conflicts before making a write.
  const fieldOverrides = opts.fieldOverrides ?? {};
  for (const field of CONTACT_PROMPT_FIELDS) {
    const winnerValue = winner[field];
    const loserValue = loser[field];
    if (hasValue(winnerValue) && hasValue(loserValue) && !valuesEqual(winnerValue, loserValue)) {
      if (!(field in fieldOverrides)) {
        throw new Error(`Choose which ${field} value to retain before merging.`);
      }
      const chosen = fieldOverrides[field];
      if (!valuesEqual(chosen, winnerValue) && !valuesEqual(chosen, loserValue)) {
        throw new Error(`The selected ${field} value must come from one of the two contacts.`);
      }
    }
  }

  // Validate shared-agent connection conflicts before writing. Notes are merged
  // as history; all other live profile conflicts require an explicit selection.
  const connectionOverrides = opts.connectionFieldOverrides ?? {};
  for (const winnerConnection of winnerConnections) {
    const loserConnection = loserConnections.find((connection) => connection.agentId === winnerConnection.agentId);
    if (!loserConnection || !retainAgentIds.has(winnerConnection.agentId)) continue;
    for (const field of CONNECTION_PROMPT_FIELDS) {
      const winnerValue = winnerConnection[field];
      const loserValue = loserConnection[field];
      if (hasValue(winnerValue) && hasValue(loserValue) && !valuesEqual(winnerValue, loserValue)) {
        const choice = connectionOverrides[String(winnerConnection.agentId)]?.[field];
        if (choice !== "winner" && choice !== "loser") {
          throw new Error(`Choose which ${field} value to retain for the shared agent connection before merging.`);
        }
      }
    }
  }

  let rowsReparented = 0;
  let archivedItems = 0;
  const fieldsUpdated: string[] = [];
  const now = new Date();

  await db.transaction(async (tx: any) => {
    // A manual pair is created only after every no-write validation above has
    // passed, so a blocked manual merge cannot leave behind a spurious pair.
    if (pairId == null) {
      const pairResult = await tx.insert(duplicateContactPairs).values({
        contactAId: winnerId,
        contactBId: loserId,
        matchType: "manual",
        confidence: 100,
        status: "pending",
      });
      pairId = Number(pairResult[0].insertId);
    }
    const archive = async (input: {
      kind: string;
      sourceContactId?: number | null;
      sourceTable?: string | null;
      sourceRecordId?: number | null;
      fieldName?: string | null;
      value: unknown;
      keptValue?: unknown;
      mergedIntoId?: number | null;
    }) => {
      await tx.insert(contactMergeArchives).values({
        mergePairId: pairId!,
        winnerContactId: winnerId,
        loserContactId: loserId,
        kind: input.kind,
        sourceContactId: input.sourceContactId ?? null,
        sourceTable: input.sourceTable ?? null,
        sourceRecordId: input.sourceRecordId ?? null,
        fieldName: input.fieldName ?? null,
        archivedValue: input.value as any,
        keptValue: input.keptValue as any,
        mergedIntoId: input.mergedIntoId ?? null,
        archivedById: reviewedById,
        archivedAt: now,
      });
      archivedItems++;
    };

    // The complete losing record is the primary recovery artifact. Field-level
    // entries below make individual differences easy to inspect, while this
    // snapshot covers every contact column, including non-promptable metadata.
    await archive({
      kind: "contact_record",
      sourceContactId: loserId,
      sourceTable: "contacts",
      sourceRecordId: loserId,
      value: loser,
      keptValue: winner,
    });

    const updates: Record<string, unknown> = {
      email: retainedEmails[0] ?? null,
      secondaryEmail: retainedEmails[1] ?? null,
      thirdEmail: retainedEmails[2] ?? null,
      phone: retainedPhones[0] ?? null,
      secondaryPhone: retainedPhones[1] ?? null,
      thirdPhone: retainedPhones[2] ?? null,
      tags: mergeTags(winner.tags, loser.tags),
      // Compliance is intentionally fail-safe rather than user-overridable.
      doNotContact: Boolean(winner.doNotContact || loser.doNotContact),
      doNotContactReason: winner.doNotContactReason ?? loser.doNotContactReason ?? null,
      doNotContactAt: winner.doNotContactAt ?? loser.doNotContactAt ?? null,
      doNotContactByUserId: winner.doNotContactByUserId ?? loser.doNotContactByUserId ?? null,
      emailStatus: priorityEmailStatus(winner.emailStatus) === "unsubscribed" || priorityEmailStatus(loser.emailStatus) === "unsubscribed"
        ? "unsubscribed"
        : priorityEmailStatus(winner.emailStatus) === "bounced" || priorityEmailStatus(loser.emailStatus) === "bounced"
          ? "bounced"
          : "valid",
      emailBouncedAt: winner.emailBouncedAt ?? loser.emailBouncedAt ?? null,
      emailUnsubscribedAt: winner.emailUnsubscribedAt ?? loser.emailUnsubscribedAt ?? null,
      smsMarketingConsentAt: winner.smsMarketingConsentAt ?? loser.smsMarketingConsentAt ?? null,
      smsMarketingConsentSource: winner.smsMarketingConsentSource ?? loser.smsMarketingConsentSource ?? null,
      smsMarketingOptedOutAt: winner.smsMarketingOptedOutAt ?? loser.smsMarketingOptedOutAt ?? null,
      smsMarketingOptOutReason: winner.smsMarketingOptOutReason ?? loser.smsMarketingOptOutReason ?? null,
    };

    const retainedEmailKeys = new Set(retainedEmails.map(normaliseEmail));
    const retainedPhoneKeys = new Set(retainedPhones.map(normalisePhone));
    for (const [sourceContact, sourceLabel] of [[winner, "kept"], [loser, "archived"]] as const) {
      for (const field of ["email", "secondaryEmail", "thirdEmail"] as const) {
        const value = sourceContact[field];
        if (value && !retainedEmailKeys.has(normaliseEmail(value))) {
          await archive({ kind: "email", sourceContactId: sourceContact.id, fieldName: field, value, keptValue: retainedEmails, sourceTable: "contacts", sourceRecordId: sourceContact.id });
        }
      }
      for (const field of ["phone", "secondaryPhone", "thirdPhone"] as const) {
        const value = sourceContact[field];
        if (value && !retainedPhoneKeys.has(normalisePhone(value))) {
          await archive({ kind: "phone", sourceContactId: sourceContact.id, fieldName: field, value, keptValue: retainedPhones, sourceTable: "contacts", sourceRecordId: sourceContact.id });
        }
      }
      void sourceLabel;
    }

    for (const field of CONTACT_PROMPT_FIELDS) {
      const winnerValue = winner[field];
      const loserValue = loser[field];
      if (!hasValue(winnerValue) && hasValue(loserValue)) {
        updates[field] = loserValue;
        fieldsUpdated.push(field);
      } else if (hasValue(winnerValue) && hasValue(loserValue) && !valuesEqual(winnerValue, loserValue)) {
        const chosen = fieldOverrides[field];
        const keptFrom = valuesEqual(chosen, winnerValue) ? "winner" : "loser";
        updates[field] = chosen;
        await archive({
          kind: "contact_field",
          sourceContactId: keptFrom === "winner" ? loserId : winnerId,
          sourceTable: "contacts",
          sourceRecordId: keptFrom === "winner" ? loserId : winnerId,
          fieldName: field,
          value: keptFrom === "winner" ? loserValue : winnerValue,
          keptValue: chosen,
        });
        if (!valuesEqual(chosen, winnerValue)) fieldsUpdated.push(field);
      }
    }

    if (loser.notes) {
      updates.notes = winner.notes ? `${winner.notes}\n\n--- Notes from merged contact #${loserId} ---\n${loser.notes}` : loser.notes;
      fieldsUpdated.push("notes");
    }

    // Values selected by strict compliance rules are archived whenever they
    // conflict, making the deterministic safety rule fully inspectable.
    for (const field of ["doNotContact", "doNotContactReason", "doNotContactAt", "doNotContactByUserId", "emailStatus", "emailBouncedAt", "emailUnsubscribedAt", "smsMarketingConsentAt", "smsMarketingConsentSource", "smsMarketingOptedOutAt", "smsMarketingOptOutReason", "aiSummary", "aiSummaryUpdatedAt"] as const) {
      if (hasValue(winner[field]) && hasValue(loser[field]) && !valuesEqual(winner[field], loser[field])) {
        await archive({ kind: "system_field", sourceContactId: loserId, sourceTable: "contacts", sourceRecordId: loserId, fieldName: field, value: loser[field], keptValue: updates[field] ?? winner[field] });
      }
    }

    await tx.update(contacts).set(updates).where(eq(contacts.id, winnerId));

    const reparent = async (table: string, column: string): Promise<void> => {
      const result = await tx.execute(sql.raw(`UPDATE \`${table}\` SET \`${column}\` = ${winnerId} WHERE \`${column}\` = ${loserId}`));
      const header = Array.isArray(result) ? result[0] : result;
      rowsReparented += Number((header as any)?.affectedRows ?? 0);
    };

    // Shared agent connections merge into their surviving active connection.
    // Every unselected connection is itself soft-archived, never deleted.
    for (const loserConnection of loserConnections) {
      const matchingWinnerConnection = winnerConnections.find((connection) => connection.agentId === loserConnection.agentId);
      const shouldRetain = retainAgentIds.has(loserConnection.agentId);
      if (!shouldRetain) {
        await tx.update(agentConnections).set({
          archivedAt: now,
          mergeArchivedAt: now,
          mergeArchivedById: reviewedById,
        }).where(eq(agentConnections.id, loserConnection.id));
        await archive({ kind: "agent_connection", sourceContactId: loserId, sourceTable: "agent_connections", sourceRecordId: loserConnection.id, value: loserConnection, keptValue: null });
        continue;
      }
      if (!matchingWinnerConnection) {
        const result = await tx.execute(sql.raw(`UPDATE agent_connections SET contactId = ${winnerId} WHERE id = ${safeId(loserConnection.id)}`));
        rowsReparented += Number((Array.isArray(result) ? result[0] : result as any)?.affectedRows ?? 0);
        continue;
      }

      const connectionUpdates: Record<string, unknown> = {};
      for (const field of CONNECTION_PROMPT_FIELDS) {
        const winnerValue = matchingWinnerConnection[field];
        const loserValue = loserConnection[field];
        if (!hasValue(winnerValue) && hasValue(loserValue)) {
          connectionUpdates[field] = loserValue;
        } else if (hasValue(winnerValue) && hasValue(loserValue) && !valuesEqual(winnerValue, loserValue)) {
          const choice = connectionOverrides[String(matchingWinnerConnection.agentId)]?.[field];
          const keptValue = choice === "loser" ? loserValue : winnerValue;
          connectionUpdates[field] = keptValue;
          await archive({ kind: "agent_connection_field", sourceContactId: loserId, sourceTable: "agent_connections", sourceRecordId: loserConnection.id, fieldName: field, value: choice === "loser" ? winnerValue : loserValue, keptValue, mergedIntoId: matchingWinnerConnection.id });
        }
      }
      if (loserConnection.agentNotes) {
        connectionUpdates.agentNotes = matchingWinnerConnection.agentNotes
          ? `${matchingWinnerConnection.agentNotes}\n\n--- Notes from merged contact #${loserId} ---\n${loserConnection.agentNotes}`
          : loserConnection.agentNotes;
      }
      if (Object.keys(connectionUpdates).length) {
        await tx.update(agentConnections).set(connectionUpdates as any)
          .where(eq(agentConnections.id, safeId(matchingWinnerConnection.id)));
      }

      // Child records retain their history but now point to the one active
      // merged agent connection.
      for (const [table, column] of [["tasks", "relatedAgentConnectionId"], ["communications", "relatedAgentConnectionId"], ["pipeline_email_sends", "agentConnectionId"], ["isa_outcome_attributions", "appointmentConnectionId"]] as const) {
        await tx.execute(sql.raw(`UPDATE \`${table}\` SET \`${column}\` = ${safeId(matchingWinnerConnection.id)} WHERE \`${column}\` = ${safeId(loserConnection.id)}`));
      }
      await tx.execute(sql.raw(`UPDATE activity_log SET entityId = ${safeId(matchingWinnerConnection.id)} WHERE entityId = ${safeId(loserConnection.id)} AND entityType = 'agent_connection'`));
      await tx.execute(sql.raw(`UPDATE agent_connections SET archivedAt = '${sqlDate(now)}', mergeArchivedAt = '${sqlDate(now)}', mergeArchivedById = ${reviewedById}, mergedIntoConnectionId = ${safeId(matchingWinnerConnection.id)} WHERE id = ${safeId(loserConnection.id)}`));
      await archive({ kind: "agent_connection", sourceContactId: loserId, sourceTable: "agent_connections", sourceRecordId: loserConnection.id, value: loserConnection, keptValue: matchingWinnerConnection, mergedIntoId: matchingWinnerConnection.id });
      rowsReparented++;
    }

    // When two records had different agents, retaining one is an explicit
    // decision. Preserve unselected winner-side connections as archived rows
    // as well; otherwise a winner connection would be silently auto-retained.
    if (hasAgentConflict) {
      for (const winnerConnection of winnerConnections) {
        if (retainAgentIds.has(winnerConnection.agentId)) continue;
        await tx.update(agentConnections).set({
          archivedAt: now,
          mergeArchivedAt: now,
          mergeArchivedById: reviewedById,
        }).where(eq(agentConnections.id, winnerConnection.id));
        await archive({ kind: "agent_connection", sourceContactId: winnerId, sourceTable: "agent_connections", sourceRecordId: winnerConnection.id, value: winnerConnection, keptValue: null });
      }
    }

    // Preserve duplicate connection-request history rather than deleting it.
    const [winnerRequestRows, loserRequestRows]: any = await Promise.all([
      tx.execute(sql.raw(`SELECT * FROM connection_requests WHERE contactId = ${winnerId} AND archivedAt IS NULL`)),
      tx.execute(sql.raw(`SELECT * FROM connection_requests WHERE contactId = ${loserId} AND archivedAt IS NULL`)),
    ]);
    const winnerRequests = winnerRequestRows[0] as any[];
    for (const loserRequest of loserRequestRows[0] as any[]) {
      const duplicateRequest = winnerRequests.find((request) => request.agentId === loserRequest.agentId && request.status === loserRequest.status);
      if (duplicateRequest) {
        await tx.execute(sql.raw(`UPDATE connection_requests SET archivedAt = '${sqlDate(now)}', mergedIntoRequestId = ${safeId(duplicateRequest.id)} WHERE id = ${safeId(loserRequest.id)}`));
        await archive({ kind: "connection_request", sourceContactId: loserId, sourceTable: "connection_requests", sourceRecordId: loserRequest.id, value: loserRequest, keptValue: duplicateRequest, mergedIntoId: duplicateRequest.id });
      } else {
        const result = await tx.execute(sql.raw(`UPDATE connection_requests SET contactId = ${winnerId} WHERE id = ${safeId(loserRequest.id)}`));
        rowsReparented += Number((Array.isArray(result) ? result[0] : result as any)?.affectedRows ?? 0);
      }
    }

    // Merge unique smart-plan records into one live enrollment. The archived
    // enrollment keeps its execution history attached and remains restorable.
    const [winnerEnrollmentRows, loserEnrollmentRows]: any = await Promise.all([
      tx.execute(sql.raw(`SELECT * FROM smart_plan_enrollments WHERE contactId = ${winnerId} AND archivedAt IS NULL`)),
      tx.execute(sql.raw(`SELECT * FROM smart_plan_enrollments WHERE contactId = ${loserId} AND archivedAt IS NULL`)),
    ]);
    const winnerEnrollments = winnerEnrollmentRows[0] as any[];
    for (const loserEnrollment of loserEnrollmentRows[0] as any[]) {
      const duplicateEnrollment = winnerEnrollments.find((enrollment) => enrollment.planId === loserEnrollment.planId);
      if (duplicateEnrollment) {
        await tx.execute(sql.raw(`UPDATE smart_plan_enrollments SET archivedAt = '${sqlDate(now)}', mergedIntoEnrollmentId = ${safeId(duplicateEnrollment.id)} WHERE id = ${safeId(loserEnrollment.id)}`));
        await archive({ kind: "smart_plan_enrollment", sourceContactId: loserId, sourceTable: "smart_plan_enrollments", sourceRecordId: loserEnrollment.id, value: loserEnrollment, keptValue: duplicateEnrollment, mergedIntoId: duplicateEnrollment.id });
      } else {
        const result = await tx.execute(sql.raw(`UPDATE smart_plan_enrollments SET contactId = ${winnerId} WHERE id = ${safeId(loserEnrollment.id)}`));
        rowsReparented += Number((Array.isArray(result) ? result[0] : result as any)?.affectedRows ?? 0);
      }
    }

    // A marketing text inbox has one live thread per contact. Preserve a
    // duplicate thread as archived history instead of deleting it.
    const [winnerThreadRows, loserThreadRows]: any = await Promise.all([
      tx.execute(sql.raw(`SELECT * FROM marketing_text_inbox_threads WHERE contactId = ${winnerId}`)),
      tx.execute(sql.raw(`SELECT * FROM marketing_text_inbox_threads WHERE contactId = ${loserId}`)),
    ]);
    const winnerThread = (winnerThreadRows[0] as any[])[0];
    const loserThread = (loserThreadRows[0] as any[])[0];
    if (loserThread && winnerThread) {
      await tx.execute(sql.raw(`UPDATE marketing_text_inbox_threads SET archivedAt = COALESCE(archivedAt, '${sqlDate(now)}'), mergedIntoThreadId = ${safeId(winnerThread.id)} WHERE id = ${safeId(loserThread.id)}`));
      await archive({ kind: "marketing_text_thread", sourceContactId: loserId, sourceTable: "marketing_text_inbox_threads", sourceRecordId: loserThread.id, value: loserThread, keptValue: winnerThread, mergedIntoId: winnerThread.id });
    } else if (loserThread) {
      const result = await tx.execute(sql.raw(`UPDATE marketing_text_inbox_threads SET contactId = ${winnerId} WHERE id = ${safeId(loserThread.id)}`));
      rowsReparented += Number((Array.isArray(result) ? result[0] : result as any)?.affectedRows ?? 0);
    }

    for (const [table, column] of CONTACT_REFERENCE_COLUMNS) await reparent(table, column);

    // Keep relationship edges reachable from the surviving contact. A direct
    // loser↔winner edge would become a self-link, so retain it as archived
    // relationship history instead of silently deleting it.
    const [selfRelationshipRows]: any = await tx.execute(sql.raw(
      `SELECT * FROM contact_relationships WHERE (contactId = ${loserId} AND relatedContactId = ${winnerId}) OR (contactId = ${winnerId} AND relatedContactId = ${loserId})`,
    ));
    for (const relationship of selfRelationshipRows as any[]) {
      await archive({ kind: "contact_relationship", sourceContactId: loserId, sourceTable: "contact_relationships", sourceRecordId: relationship.id, value: relationship, keptValue: null });
    }
    await tx.update(contactRelationships).set({ archivedAt: now })
      .where(sql`(${contactRelationships.contactId} = ${loserId} AND ${contactRelationships.relatedContactId} = ${winnerId}) OR (${contactRelationships.contactId} = ${winnerId} AND ${contactRelationships.relatedContactId} = ${loserId})`);
    await tx.execute(sql.raw(`UPDATE contact_relationships SET contactId = ${winnerId} WHERE contactId = ${loserId} AND relatedContactId != ${winnerId}`));
    await tx.execute(sql.raw(`UPDATE contact_relationships SET relatedContactId = ${winnerId} WHERE relatedContactId = ${loserId} AND contactId != ${winnerId}`));

    await tx.execute(sql.raw(`UPDATE activity_log SET entityId = ${winnerId}, relatedContactId = ${winnerId} WHERE entityId = ${loserId} AND entityType = 'contact'`));
    await tx.execute(sql.raw(`UPDATE activity_log SET relatedContactId = ${winnerId} WHERE relatedContactId = ${loserId}`));

    await tx.execute(sql.raw(`UPDATE duplicate_contact_pairs SET contactAId = ${winnerId} WHERE contactAId = ${loserId} AND id != ${pairId}`));
    await tx.execute(sql.raw(`UPDATE duplicate_contact_pairs SET contactBId = ${winnerId} WHERE contactBId = ${loserId} AND id != ${pairId}`));
    await tx.execute(sql.raw(`UPDATE duplicate_contact_pairs SET status = 'dismissed' WHERE contactAId = contactBId AND id != ${pairId}`));

    await tx.update(contacts).set({ archivedAt: now }).where(eq(contacts.id, loserId));
    await tx.update(duplicateContactPairs).set({ status: "merged", keptContactId: winnerId, reviewedById, reviewedAt: now }).where(eq(duplicateContactPairs.id, pairId!));
  });

  return { success: true, winnerId, loserId, fieldsUpdated, rowsReparented, archivedItems };
}

export async function listArchivedContactMerges(page = 1, pageSize = 20) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const archives = await db.select().from(contactMergeArchives).orderBy(desc(contactMergeArchives.archivedAt));
  const mergePairIds = Array.from(new Set(archives.map((archive) => archive.mergePairId)));
  if (!mergePairIds.length) return { merges: [], total: 0, page, pageSize };
  const pairs = await db.select().from(duplicateContactPairs).where(inArray(duplicateContactPairs.id, mergePairIds));
  const contactIds = Array.from(new Set(pairs.flatMap((pair) => [pair.contactAId, pair.contactBId, pair.keptContactId]).filter((id): id is number => Boolean(id))));
  const contactRows = contactIds.length ? await db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, archivedAt: contacts.archivedAt }).from(contacts).where(inArray(contacts.id, contactIds)) : [];
  const pairMap = new Map(pairs.map((pair) => [pair.id, pair]));
  const contactMap = new Map(contactRows.map((contact) => [contact.id, contact]));
  const grouped = new Map<number, any[]>();
  for (const archive of archives) grouped.set(archive.mergePairId, [...(grouped.get(archive.mergePairId) ?? []), archive]);
  const allMerges = Array.from(grouped.entries())
    .map(([mergePairId, items]) => {
      const pair = pairMap.get(mergePairId);
      if (!pair) return null;
      const winnerId = pair.keptContactId ?? pair.contactAId;
      const loserId = winnerId === pair.contactAId ? pair.contactBId : pair.contactAId;
      return {
        pairId: mergePairId,
        mergedAt: pair.reviewedAt,
        winner: contactMap.get(winnerId) ?? null,
        archivedContact: contactMap.get(loserId) ?? null,
        restored: items.some((item: any) => item.restoredAt),
        archivedItems: items,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => new Date(b.mergedAt ?? 0).getTime() - new Date(a.mergedAt ?? 0).getTime());
  const offset = Math.max(0, page - 1) * pageSize;
  return { merges: allMerges.slice(offset, offset + pageSize), total: allMerges.length, page, pageSize };
}

export async function restoreMergedContact(pairId: number, restoredById: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [pair] = await db.select().from(duplicateContactPairs).where(eq(duplicateContactPairs.id, safeId(pairId))).limit(1);
  if (!pair || pair.status !== "merged" || !pair.keptContactId) throw new Error("Archived merge record not found.");
  const loserId = pair.keptContactId === pair.contactAId ? pair.contactBId : pair.contactAId;
  await db.transaction(async (tx: any) => {
    await tx.update(contacts).set({ archivedAt: null }).where(eq(contacts.id, loserId));
    await tx.update(contactMergeArchives).set({ restoredAt: new Date(), restoredById: safeId(restoredById) }).where(eq(contactMergeArchives.mergePairId, pair.id));
  });
  return { success: true, restoredContactId: loserId };
}

export function formatArchiveValue(value: unknown): string {
  return toComparable(value);
}
