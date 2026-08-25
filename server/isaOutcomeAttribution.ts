import { and, desc, eq } from "drizzle-orm";
import {
  agentConnections,
  contacts,
  isaOutcomeAttributions,
  transactions,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";

/**
 * Creates or refreshes the durable ISA attribution for a transaction.
 *
 * Attribution is intentionally snapshotted only once. We prefer the ISA who
 * recorded the appointment on the transaction's agent connection; when no
 * recorded ISA appointment exists, we fall back to the contact's assigned ISA.
 * Later contact reassignment does not move historical transaction credit.
 */
export async function syncIsaOutcomeAttribution(transactionId: number) {
  const db = await getDb();
  if (!db) return { attributed: false as const, reason: "db_unavailable" as const };

  const [transactionRow] = await db
    .select({
      id: transactions.id,
      agentId: transactions.agentId,
      contactId: transactions.primaryContactId,
      status: transactions.status,
      contractDate: transactions.contractDate,
      closingDate: transactions.closingDate,
      createdAt: transactions.createdAt,
      updatedAt: transactions.updatedAt,
      assignedIsaId: contacts.assignedIsaId,
    })
    .from(transactions)
    .innerJoin(contacts, eq(contacts.id, transactions.primaryContactId))
    .where(eq(transactions.id, transactionId))
    .limit(1);

  if (!transactionRow) return { attributed: false as const, reason: "transaction_not_found" as const };

  const [existing] = await db
    .select()
    .from(isaOutcomeAttributions)
    .where(eq(isaOutcomeAttributions.transactionId, transactionId))
    .limit(1);

  const underContractAt = transactionRow.contractDate ?? existing?.underContractAt ?? transactionRow.createdAt;
  const closedAt = transactionRow.status === "closed"
    ? transactionRow.closingDate ?? existing?.closedAt ?? transactionRow.updatedAt
    : existing?.closedAt ?? null;

  if (existing) {
    await db
      .update(isaOutcomeAttributions)
      .set({
        status: transactionRow.status,
        underContractAt,
        closedAt,
      })
      .where(eq(isaOutcomeAttributions.id, existing.id));

    return {
      attributed: true as const,
      isaId: existing.isaId,
      basis: existing.attributionBasis,
      preserved: true as const,
    };
  }

  const [appointment] = await db
    .select({
      connectionId: agentConnections.id,
      appointmentSetByUserId: agentConnections.appointmentSetByUserId,
      appointmentSetterRole: users.role,
    })
    .from(agentConnections)
    .leftJoin(users, eq(users.id, agentConnections.appointmentSetByUserId))
    .where(and(
      eq(agentConnections.contactId, transactionRow.contactId),
      eq(agentConnections.agentId, transactionRow.agentId),
      eq(agentConnections.appointmentSet, true),
    ))
    .orderBy(desc(agentConnections.appointmentSetAt), desc(agentConnections.createdAt))
    .limit(1);

  let isaId: number | null = null;
  let appointmentConnectionId: number | null = null;
  let attributionBasis: "appointment_setter" | "assigned_isa" = "assigned_isa";

  if (appointment?.appointmentSetByUserId && appointment.appointmentSetterRole === "isa") {
    isaId = appointment.appointmentSetByUserId;
    appointmentConnectionId = appointment.connectionId;
    attributionBasis = "appointment_setter";
  } else if (transactionRow.assignedIsaId) {
    const [assignedUser] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, transactionRow.assignedIsaId))
      .limit(1);
    if (assignedUser?.role === "isa") isaId = assignedUser.id;
  }

  if (!isaId) return { attributed: false as const, reason: "no_isa_attribution" as const };

  await db.insert(isaOutcomeAttributions).values({
    transactionId,
    isaId,
    contactId: transactionRow.contactId,
    appointmentConnectionId,
    attributionBasis,
    status: transactionRow.status,
    underContractAt,
    closedAt,
  });

  return { attributed: true as const, isaId, basis: attributionBasis, preserved: false as const };
}
