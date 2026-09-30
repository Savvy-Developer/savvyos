import { createServer } from "http";
import { MlsIngestionScheduler } from "./mls/worker";

/**
 * MLS ingestion worker process. Deploy as a separate Railway service with
 * SAVVYOS_PROCESS=mlsIngestionWorker (same image, same DATABASE_URL, MLS_MEDIA_*
 * and MLS_CRED_* variables). Set MLS_INGESTION=off to keep it idle.
 *
 * railway.json applies a /healthz deploy check to every service built from this
 * repo, so the worker answers it on PORT. It has no other HTTP surface.
 */
function startHealthServer(state: { ready: boolean; idle: boolean }) {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port <= 0) return null;
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url?.split("?")[0] === "/healthz") {
      const ok = state.ready || state.idle;
      res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ status: ok ? "ok" : "starting", process: "mlsIngestionWorker", idle: state.idle }));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(port, () => console.log(`[mls] health endpoint listening on ${port}`));
  return server;
}

async function main() {
  const state = { ready: false, idle: process.env.MLS_INGESTION === "off" };
  const health = startHealthServer(state);
  if (state.idle) {
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
    health?.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  await scheduler.start();
  state.ready = true;
}

main().catch(error => {
  console.error("[mls] worker failed to start", error);
  process.exit(1);
});
