import { reconcileUnmatchedAircallCalls } from "./aircall";

const DAILY_RECONCILIATION_HOUR = 3;
const DAILY_RECONCILIATION_MINUTE = 30;
const TIME_ZONE = "America/New_York";
const INTERNAL_BATCH_SIZE = 250;

let isRunning = false;

type TimeParts = { year: number; month: number; day: number; hour: number; minute: number };

function easternTimeParts(date: Date): TimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function easternDateAt(year: number, month: number, day: number, hour: number, minute: number): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const actual = easternTimeParts(utcGuess);
  const offsetMs = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute) - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}

function msUntilNextRun(): number {
  const now = new Date();
  const eastern = easternTimeParts(now);
  let candidate = easternDateAt(
    eastern.year,
    eastern.month,
    eastern.day,
    DAILY_RECONCILIATION_HOUR,
    DAILY_RECONCILIATION_MINUTE
  );
  if (candidate <= now) {
    const tomorrow = new Date(Date.UTC(eastern.year, eastern.month - 1, eastern.day + 1));
    candidate = easternDateAt(
      tomorrow.getUTCFullYear(),
      tomorrow.getUTCMonth() + 1,
      tomorrow.getUTCDate(),
      DAILY_RECONCILIATION_HOUR,
      DAILY_RECONCILIATION_MINUTE
    );
  }
  return candidate.getTime() - now.getTime();
}

/**
 * Reconcile the complete unmatched-call queue once per night. Batches are kept
 * internal for predictable DB usage, but the scheduler continues until the
 * queue has been fully reviewed. Immediate phone-update retries remain the
 * first line of defense during the business day.
 */
export async function reconcileAllUnmatchedAircallCalls(): Promise<void> {
  if (isRunning) {
    console.log("[AircallReconciliation] A reconciliation run is already in progress.");
    return;
  }
  isRunning = true;

  try {
    let beforeId: number | undefined;
    let totalScanned = 0;
    let totalMatched = 0;
    let totalNoContact = 0;
    let totalSkipped = 0;
    let batches = 0;

    while (true) {
      const result = await reconcileUnmatchedAircallCalls({
        limit: INTERNAL_BATCH_SIZE,
        beforeId,
        skipMediaDownload: true,
      });
      batches += 1;
      totalScanned += result.scanned;
      totalMatched += result.matched;
      totalNoContact += result.noContact;
      totalSkipped += result.skipped;

      if (!result.scanned || result.scanned < INTERNAL_BATCH_SIZE || !result.nextCursor) break;
      beforeId = result.nextCursor;
    }

    console.log(
      `[AircallReconciliation] Full nightly sweep complete: ${totalMatched} matched, ${totalNoContact} still unmatched, ${totalSkipped} skipped from ${totalScanned} calls in ${batches} batch(es).`
    );
  } catch (error) {
    console.error("[AircallReconciliation] Full nightly sweep failed:", error);
  } finally {
    isRunning = false;
  }
}

/** Register the full-queue once-daily reconciliation timer after server startup. */
export function scheduleAircallReconciliation(): void {
  const delay = msUntilNextRun();
  const nextRun = new Date(Date.now() + delay);
  console.log(
    `[AircallReconciliation] Next full unmatched-call sweep scheduled for ${nextRun.toLocaleString("en-US", { timeZone: TIME_ZONE, timeZoneName: "short" })}.`
  );

  setTimeout(() => {
    reconcileAllUnmatchedAircallCalls().catch(error =>
      console.error("[AircallReconciliation] Scheduled run failed:", error)
    );
    setInterval(() => {
      reconcileAllUnmatchedAircallCalls().catch(error =>
        console.error("[AircallReconciliation] Scheduled run failed:", error)
      );
    }, 24 * 60 * 60 * 1000);
  }, delay);
}
