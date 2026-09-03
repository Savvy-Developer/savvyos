import { getDb } from "../db";
import { marketProfiles } from "../../drizzle/schema";
import { asc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";

// A shared read-only selector for reports and user setup. Full administration,
// source ingestion, and agent coverage belong to the Agent Markets module.
export const marketsRouter = router({
  // Returns id + name for all market_profiles — used in dropdowns across the app.
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({ id: marketProfiles.id, name: marketProfiles.name, state: marketProfiles.state })
      .from(marketProfiles)
      .orderBy(asc(marketProfiles.name));
    return rows;
  }),
});
