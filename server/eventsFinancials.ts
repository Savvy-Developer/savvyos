import { and, eq, ne, sql } from "drizzle-orm";
import { eventExpenses, eventPortfolio } from "../drizzle/schema";

/**
 * The event expense ledger is the financial source of truth. The event-level
 * committedCost field is retained as a fast portfolio summary and updated from
 * the ledger after every expense mutation.
 */
export async function recalculateEventCommittedExpense(
  db: any,
  eventId: number
) {
  const rows = await db
    .select({ amount: eventExpenses.amount })
    .from(eventExpenses)
    .where(
      and(eq(eventExpenses.eventId, eventId), ne(eventExpenses.status, "void"))
    );
  const committedCost = rows.reduce(
    (total: number, row: any) => total + (Number(row.amount) || 0),
    0
  );
  await db
    .update(eventPortfolio)
    .set({
      committedCost: String(committedCost),
      version: sql`${eventPortfolio.version} + 1`,
    })
    .where(eq(eventPortfolio.id, eventId));
  return committedCost;
}

/**
 * The Events Console existed before itemized expenses. Create a visible opening
 * balance for an event only once so existing P/L stays intact while operators
 * replace that balance with itemized invoices over time.
 */
export async function ensureEventExpenseOpeningBalances(db: any) {
  const events = await db
    .select({
      id: eventPortfolio.id,
      committedCost: eventPortfolio.committedCost,
    })
    .from(eventPortfolio);
  for (const event of events) {
    const existing = await db
      .select({ id: eventExpenses.id })
      .from(eventExpenses)
      .where(eq(eventExpenses.eventId, event.id))
      .limit(1);
    const amount = Number(event.committedCost) || 0;
    if (existing.length || amount <= 0) continue;
    await db.insert(eventExpenses).values({
      eventId: event.id,
      description: "Opening committed expense balance",
      category: "Opening balance",
      amount: String(amount),
      status: "planned",
      categorizationNote:
        "Created from the existing committed-cost total. Adjust or replace this line as invoices are itemized.",
    });
  }
}
