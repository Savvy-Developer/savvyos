import mysql, { type Pool } from "mysql2/promise";

let mcpPool: Pool | null = null;

/**
 * Isolated, low-concurrency pool for the external read-only MCP service and its
 * OAuth authorization server. It intentionally uses the same database but does
 * not share request-scoped application connections.
 */
export function getMcpPool(): Pool {
  if (mcpPool) return mcpPool;
  const uri = process.env.MCP_DATABASE_URL || process.env.DATABASE_URL;
  if (!uri) throw new Error("MCP database unavailable");
  mcpPool = mysql.createPool({
    uri,
    connectionLimit: 6,
    maxIdle: 6,
    idleTimeout: 60_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
  });
  return mcpPool;
}
