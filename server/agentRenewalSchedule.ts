import { and, eq } from "drizzle-orm";
import { agentRenewals } from "../drizzle/schema";

function dateKey(value: Date | string): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function dateFromKey(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

/** Returns the first renewal anniversary: one calendar year after signing/onboarding. */
export function renewalDateFromOnboardedDate(onboardedDate: Date | string): string {
  const [year, month, day] = dateKey(onboardedDate).split("-").map(Number);
  const anniversary = new Date(Date.UTC(year + 1, month - 1, day));
  // A Feb. 29 signing/onboarding date renews on Feb. 28 in non-leap years.
  if (anniversary.getUTCMonth() !== month - 1) anniversary.setUTCDate(0);
  return anniversary.toISOString().slice(0, 10);
}

/**
 * Maintains exactly one scheduled renewal at the anniversary of the signed/onboarded date.
 * Completed renewal records are immutable historical meeting records.
 */
export async function syncScheduledRenewalWithOnboardedDate(
  db: any,
  agentId: number,
  onboardedDate: Date | string,
): Promise<{ renewalId: number; renewalDate: string; created: boolean }> {
  const renewalDate = renewalDateFromOnboardedDate(onboardedDate);
  const [scheduled] = await db
    .select({ id: agentRenewals.id })
    .from(agentRenewals)
    .where(and(eq(agentRenewals.agentId, agentId), eq(agentRenewals.status, "scheduled")))
    .limit(1);

  if (scheduled) {
    await db
      .update(agentRenewals)
      .set({ renewalDate: dateFromKey(renewalDate) })
      .where(eq(agentRenewals.id, scheduled.id));
    return { renewalId: scheduled.id, renewalDate, created: false };
  }

  const result = await db.insert(agentRenewals).values({
    agentId,
    renewalDate: dateFromKey(renewalDate),
  });
  return { renewalId: Number(result[0].insertId), renewalDate, created: true };
}
