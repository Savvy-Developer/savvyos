import { and, eq, isNull } from "drizzle-orm";
import { pulsePeople, pulsePersonAccounts, users } from "../../drizzle/schema";
import type { PulsePolicyDb } from "./policy";

/**
 * Ensures an authenticated SavvyOS account has one explicit Pulse person relationship.
 * This is a migration/backfill helper, not a fallback identity model: subsequent policy
 * decisions read the durable `pulse_person_accounts` relationship only.
 */
export async function ensurePulsePersonForAccount(db: PulsePolicyDb, userId: number) {
  const existing = await db
    .select({ personId: pulsePersonAccounts.personId })
    .from(pulsePersonAccounts)
    .where(and(eq(pulsePersonAccounts.userId, userId), isNull(pulsePersonAccounts.unlinkedAt)))
    .limit(1);
  if (existing[0]) return existing[0].personId as number;

  const account = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = account[0];
  if (!user) throw new Error("Account not found for Pulse person link");

  const [created] = await db.insert(pulsePeople).values({
    displayName: user.name?.trim() || user.email || `Account ${user.id}`,
    primaryEmail: user.email ?? null,
    isActive: user.isActive,
  });
  const personId = Number((created as any).insertId);
  await db.insert(pulsePersonAccounts).values({ personId, userId, isPrimary: true });
  return personId;
}
