#!/usr/bin/env tsx
/**
 * Reconcile recent Aircall activities that have no permanently stored recording.
 *
 * Optional environment variables:
 *   AIRCALL_RECORDING_RECOVERY_LOOKBACK_DAYS=7
 *   AIRCALL_RECORDING_RECOVERY_PAGE_SIZE=100
 *   AIRCALL_RECORDING_RECOVERY_MAX_ATTEMPTS=5
 */
import "dotenv/config";
import { reconcileRecentAircallRecordings } from "../server/aircall";

const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

async function main() {
  const result = await reconcileRecentAircallRecordings({
    lookbackDays: positiveInt(process.env.AIRCALL_RECORDING_RECOVERY_LOOKBACK_DAYS, 7),
    batchSize: positiveInt(process.env.AIRCALL_RECORDING_RECOVERY_PAGE_SIZE, 100),
    maxAttempts: positiveInt(process.env.AIRCALL_RECORDING_RECOVERY_MAX_ATTEMPTS, 5),
  });
  console.log("[AircallRecordingRecovery]", JSON.stringify(result));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[AircallRecordingRecovery] Failed:", error);
    process.exit(1);
  });
