import { createServer } from "http";
import { databaseBackupConfig, ensureDatabaseBackupSchema, scheduleDatabaseBackup } from "./databaseBackup";

/**
 * Nightly off-Railway database backup, in its own process (security audit 04).
 * Deploy as a separate small Railway service from this repo with
 * SAVVYOS_PROCESS=databaseBackupWorker, the same DATABASE_URL, and the
 * DATABASE_BACKUP_* variables (see databaseBackup.ts). Without them it stays
 * idle. It never runs in the web server, so a long dump cannot slow the site.
 *
 * railway.json applies a /healthz deploy check to every service built from this
 * repo, so the worker answers it on PORT. It has no other HTTP surface.
 */
function startHealthServer(state: { idle: boolean }) {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port <= 0) return null;
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url?.split("?")[0] === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ status: "ok", process: "databaseBackupWorker", idle: state.idle }));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(port, () => console.log(`[DatabaseBackup] health endpoint listening on ${port}`));
  return server;
}

async function main() {
  const config = databaseBackupConfig();
  const health = startHealthServer({ idle: !config.enabled });
  // The web server creates the run table too; repeating it here is harmless
  // and means this service works even if it starts first.
  await ensureDatabaseBackupSchema();
  scheduleDatabaseBackup();
  const shutdown = (signal: string) => {
    console.log(`[DatabaseBackup] ${signal} received; stopping. An unfinished upload is discarded.`);
    health?.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch(error => {
  console.error("[DatabaseBackup] worker failed to start", error);
  process.exit(1);
});
