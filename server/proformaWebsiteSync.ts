import { and, eq, isNull } from "drizzle-orm";

import { proformas, websiteProperties } from "../drizzle/schema";

/**
 * Keeps a website listing's headline numbers in step with its pro-forma.
 *
 * A listing copies revenue, cash-on-cash and cap rate from the pro-forma
 * picked on its Website tab. The copy was taken once: the tab then reloads
 * the saved numbers into its form, so every later save treated them as typed
 * and the listing never followed the pro-forma again. Live on 29 Sep: 8188
 * Clover Spring Lane showed 3.75% cash-on-cash and $106K revenue while its
 * pro-forma had moved to -11.4% and $61K.
 *
 * Now, when a pro-forma is saved, every listing linked to it gets the new
 * value for each number that still equals the pro-forma's old value, so it
 * was inherited. A number that differs was typed on purpose on the Website
 * tab, and is left alone.
 */

type Metrics = {
  grossRevenue: string | null;
  cashOnCash: string | null;
  capRate: string | null;
};

const FIELDS = [
  { metric: "grossRevenue", column: "projectedRevenue" },
  { metric: "cashOnCash", column: "cashOnCash" },
  { metric: "capRate", column: "capRate" },
] as const;

const same = (a: string | null | undefined, b: string | null | undefined) => {
  if (a == null || a === "") return b == null || b === "";
  if (b == null || b === "") return false;
  return Number(a) === Number(b);
};

/** Which listing columns to move, and from what to what. Pure, for tests. */
export function metricChanges(before: Metrics, after: Metrics) {
  return FIELDS.filter(field => !same(before[field.metric], after[field.metric])).map(field => ({
    column: field.column,
    from: before[field.metric],
    to: after[field.metric],
  }));
}

export async function readProformaMetrics(db: any, proformaId: number): Promise<Metrics | null> {
  const [row] = await db
    .select({ grossRevenue: proformas.grossRevenue, cashOnCash: proformas.cashOnCash, capRate: proformas.capRate })
    .from(proformas)
    .where(eq(proformas.id, proformaId))
    .limit(1);
  return row ?? null;
}

/** Call after a pro-forma save with the numbers it had before the save. */
export async function syncWebsiteListingsWithProforma(db: any, proformaId: number, before: Metrics | null) {
  if (!before) return 0;
  const after = await readProformaMetrics(db, proformaId);
  if (!after) return 0;
  let updated = 0;
  for (const change of metricChanges(before, after)) {
    const column = websiteProperties[change.column];
    const [result] = await db
      .update(websiteProperties)
      .set({ [change.column]: change.to } as any)
      .where(
        and(
          eq(websiteProperties.sourceProformaId, proformaId),
          change.from == null ? isNull(column) : eq(column, change.from)
        )
      );
    updated += Number((result as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
  }
  return updated;
}
