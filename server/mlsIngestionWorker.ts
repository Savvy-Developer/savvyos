import { MlsIngestionScheduler } from "./mls/worker";

/**
 * MLS ingestion worker process. Deploy as a separate Railway service with
 * SAVVYOS_PROCESS=mlsIngestionWorker (same image, same DATABASE_URL, AWS and
 * MLS_CRED_* variables). Set MLS_INGESTION=off to keep it idle.
 */
async function main() {
  if (process.env.MLS_INGESTION === "off") {
    console.log("[mls] MLS_INGESTION=off; worker idle");
    return;
  }
  const scheduler = new MlsIngestionScheduler();
  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[mls] ${signal} received; finishing the current page and stopping`);
    const force = setTimeout(() => process.exit(0), 25_000);
    await scheduler.stop().catch(error => console.error("[mls] stop failed", error));
    clearTimeout(force);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  await scheduler.start();
}

main().catch(error => {
  console.error("[mls] worker failed to start", error);
  process.exit(1);
});
