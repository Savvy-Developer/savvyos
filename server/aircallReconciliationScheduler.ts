import { reconcileRecentAircallRecordings, reconcileUnmatchedAircallCalls } from "./aircall";

const DAILY_RECONCILIATION_HOUR = 2;
const DAILY_RECONCILIATION_MINUTE = 30;
const RECENT_RECORDING_LOOKBACK_DAYS = 7;
const RECENT_RECORDING_PAGE_SIZE = 100;
const RECENT_RECORDING_MAX_ATTEMPTS = 5;
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
 * Reconcile the unmatched-call queue and every eligible recent call missing
 * permanently stored media once per night. Immediate webhook retries remain the
 * first line of defense during the business day; this is the late-arrival safety net.
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
      `[AircallReconciliation] Full nightly unmatched-call sweep complete: ${totalMatched} matched, ${totalNoContact} still unmatched, ${totalSkipped} skipped from ${totalScanned} calls in ${batches} batch(es).`
    );
  } catch (error) {
    console.error("[AircallReconciliation] Full nightly unmatched-call sweep failed:", error);
  }

  try {
    const recordingResult = await reconcileRecentAircallRecordings({
      lookbackDays: RECENT_RECORDING_LOOKBACK_DAYS,
      batchSize: RECENT_RECORDING_PAGE_SIZE,
      maxAttempts: RECENT_RECORDING_MAX_ATTEMPTS,
    });
    console.log(
      `[AircallReconciliation] Recent recording recovery complete: ${recordingResult.recovered} recovered, ${recordingResult.noRecordingAvailable} not yet available, ${recordingResult.errors} errors from ${recordingResult.candidates} candidates.`
    );
  } catch (error) {
    console.error("[AircallReconciliation] Recent recording recovery failed:", error);
  } finally {
    isRunning = false;
  }
}

/** Register the once-daily Aircall reconciliation timer after server startup. */
export function scheduleAircallReconciliation(): void {
  const delay = msUntilNextRun();
  const nextRun = new Date(Date.now() + delay);
  console.log(
      `[AircallReconciliation] Next nightly Aircall reconciliation scheduled for ${nextRun.toLocaleString("en-US", { timeZone: TIME_ZONE, timeZoneName: "short" })}.`
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
