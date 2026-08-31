export type TimedSmartPlanStep = {
  id: number;
  stepOrder: number;
  delayDays: number;
  delayHours: number;
};

/**
 * Sort workflow steps by their configured wait time. Existing order is used as a
 * stable tiebreaker so equal-timed messages retain their authored sequence.
 */
export function compareSmartPlanStepsByTiming<T extends TimedSmartPlanStep>(a: T, b: T): number {
  const aTiming = a.delayDays * 24 + a.delayHours;
  const bTiming = b.delayDays * 24 + b.delayHours;
  return aTiming - bTiming || a.stepOrder - b.stepOrder || a.id - b.id;
}

export function describeStepDelay(delayDays: number, delayHours: number): string {
  if (!delayDays && !delayHours) return "Immediately";
  const parts: string[] = [];
  if (delayDays) parts.push(`${delayDays} day${delayDays === 1 ? "" : "s"}`);
  if (delayHours) parts.push(`${delayHours} hour${delayHours === 1 ? "" : "s"}`);
  return parts.join(", ");
}
