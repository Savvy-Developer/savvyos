import "dotenv/config";
import { reconcileUnmatchedAircallCalls } from "../server/aircall";

const BATCH_SIZE = Math.max(1, Math.min(Number(process.env.AIRCALL_RECONCILE_BATCH_SIZE ?? 100), 250));
const MAX_BATCHES = Math.max(1, Number(process.env.AIRCALL_RECONCILE_MAX_BATCHES ?? 100));

async function main() {
  let beforeId: number | undefined;
  let totalScanned = 0;
  let totalMatched = 0;
  let totalNoContact = 0;
  let totalSkipped = 0;

  console.log(`[AircallReconciliation] Starting historical reconciliation in batches of ${BATCH_SIZE}.`);
  for (let batch = 1; batch <= MAX_BATCHES; batch += 1) {
    const result = await reconcileUnmatchedAircallCalls({
      limit: BATCH_SIZE,
      beforeId,
      skipMediaDownload: true,
    });
    totalScanned += result.scanned;
    totalMatched += result.matched;
    totalNoContact += result.noContact;
    totalSkipped += result.skipped;
    console.log(
      `[AircallReconciliation] Batch ${batch}: ${result.matched} matched, ${result.noContact} still unmatched, ${result.skipped} skipped from ${result.scanned} calls.`
    );

    if (!result.scanned || result.scanned < BATCH_SIZE || !result.nextCursor) break;
    beforeId = result.nextCursor;
  }

  console.log(JSON.stringify({
    scanned: totalScanned,
    matched: totalMatched,
    noContact: totalNoContact,
    skipped: totalSkipped,
  }));
}

main().catch(error => {
  console.error("[AircallReconciliation] Historical run failed:", error);
  process.exit(1);
});
