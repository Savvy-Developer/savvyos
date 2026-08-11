import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { refreshAutomaticMetric } from "./routers/rolesResponsibilities";
import { rrMetricAutoConfigs, rrScorecardMetrics } from "../drizzle/schema";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
let scheduler: NodeJS.Timeout | undefined;
let startupTimer: NodeJS.Timeout | undefined;

/**
 * Refresh each active automatic metric on a bounded six-hour cadence. Individual
 * metric failures are persisted by the calculator and never prevent other metrics
 * from updating. Manual refresh uses the same calculator through the tRPC router.
 */
export async function refreshDueRrMetrics(): Promise<{ refreshed: number; failed: number }> {
  const db = await getDb();
  if (!db) return { refreshed: 0, failed: 0 };
  const metrics = await db
    .select({ id: rrScorecardMetrics.id })
    .from(rrScorecardMetrics)
    .innerJoin(rrMetricAutoConfigs, eq(rrMetricAutoConfigs.metricId, rrScorecardMetrics.id))
    .where(and(eq(rrScorecardMetrics.status, "active"), eq(rrScorecardMetrics.metricType, "automatic")));

  let refreshed = 0;
  let failed = 0;
  for (const metric of metrics) {
    try {
      await refreshAutomaticMetric(db, metric.id);
      refreshed += 1;
    } catch (error: any) {
      failed += 1;
      console.error(`[RrMetrics] Refresh failed for metric ${metric.id}:`, error?.message ?? error);
    }
  }
  return { refreshed, failed };
}

export function scheduleRrMetricRefresh(): void {
  if (scheduler) clearInterval(scheduler);
  scheduler = setInterval(() => {
    refreshDueRrMetrics()
      .then((result) => console.info(`[RrMetrics] Scheduled refresh: ${result.refreshed} refreshed, ${result.failed} failed.`))
      .catch((error) => console.error("[RrMetrics] Scheduled refresh error:", error));
  }, SIX_HOURS_MS);

  if (startupTimer) clearTimeout(startupTimer);
  startupTimer = setTimeout(() => {
    refreshDueRrMetrics()
      .then((result) => console.info(`[RrMetrics] Startup refresh: ${result.refreshed} refreshed, ${result.failed} failed.`))
      .catch((error) => console.error("[RrMetrics] Startup refresh error:", error));
  }, 45_000);
}
