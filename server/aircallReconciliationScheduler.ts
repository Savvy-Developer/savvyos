import { reconcileUnmatchedAircallCalls } from "./aircall";

const DAILY_RECONCILIATION_HOUR = 3;
const DAILY_RECONCILIATION_MINUTE = 30;
const RECENT_WINDOW_DAYS = 45;
const BATCH_SIZE = 250;

let isRunning = false;

/**
 * Reconcile recent unmatched calls once per day as a safety net. Contact-write
 * events already perform immediate targeted retries; this job catches records
 * created by integrations that did not later produce a phone-field update.
 */
export async function reconcileRecentUnmatchedAircallCalls(): Promise<void> {
  if (isRunning) {
    console.log("[AircallReconciliation] A reconciliation run is already in progress.");
    return;
  }
  isRunning = true;

  try {
    const since = new Date();
    since.setDate(since.getDate() - RECENT_WINDOW_DAYS);
    const result = await reconcileUnmatchedAircallCalls({
      limit: BATCH_SIZE,
      since,
      skipMediaDownload: true,
    });
    console.log(
      `[AircallReconciliation] Recent daily sweep: ${result.matched} matched, ${result.noContact} still unmatched, ${result.skipped} skipped from ${result.scanned} calls.`
    );
  } catch (error) {
    console.error("[AircallReconciliation] Daily sweep failed:", error);
  } finally {
    isRunning = false;
  }
}

function msUntilNextRun(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(DAILY_RECONCILIATION_HOUR, DAILY_RECONCILIATION_MINUTE, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** Register the once-daily reconciliation timer after the SavvyOS server starts. */
export function scheduleAircallReconciliation(): void {
  const delay = msUntilNextRun();
  const nextRun = new Date(Date.now() + delay);
  console.log(
    `[AircallReconciliation] Next recent unmatched-call sweep scheduled for ${nextRun.toLocaleString()}.`
  );

  setTimeout(() => {
    reconcileRecentUnmatchedAircallCalls().catch(error =>
      console.error("[AircallReconciliation] Scheduled run failed:", error)
    );
    setInterval(() => {
      reconcileRecentUnmatchedAircallCalls().catch(error =>
        console.error("[AircallReconciliation] Scheduled run failed:", error)
      );
    }, 24 * 60 * 60 * 1000);
  }, delay);
}
