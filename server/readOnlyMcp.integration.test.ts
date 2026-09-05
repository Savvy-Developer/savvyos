import crypto from "crypto";
import express from "express";
import mysql, { type Connection } from "mysql2/promise";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerReadOnlyMcpRoute } from "./readOnlyMcp";

const testSecret = `svy_mcp_${crypto.randomBytes(32).toString("base64url")}`;
const testHash = crypto.createHash("sha256").update(testSecret).digest("hex");
let server: Server;
let database: Connection;
let baseUrl = "";

async function requestMcp(body: object, authorized = true) {
  return fetch(`${baseUrl}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(authorized ? { authorization: `Bearer ${testSecret}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function readMcpPayload(response: Response): Promise<any> {
  const text = await response.text();
  const data = text
    .split("\n")
    .find(line => line.startsWith("data: "))
    ?.slice("data: ".length);
  if (!data)
    throw new Error(`Expected an MCP response payload, received: ${text}`);
  return JSON.parse(data);
}

describe("read-only MCP HTTP endpoint", () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl)
      throw new Error("DATABASE_URL is required for MCP integration testing.");
    database = await mysql.createConnection(databaseUrl);
    await database.execute(
      "INSERT INTO mcp_access_keys (name, keyPrefix, secretHash) VALUES (?, ?, ?)",
      [
        "Ephemeral automated MCP protocol test",
        testSecret.slice(0, 20),
        testHash,
      ]
    );

    const app = express();
    app.use(express.json());
    registerReadOnlyMcpRoute(app);
    await new Promise<void>(resolve => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Test server did not start.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await database.execute("DELETE FROM mcp_access_keys WHERE secretHash = ?", [
      testHash,
    ]);
    await database.end();
  });

  it("requires a valid bearer key", async () => {
    const response = await requestMcp(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      false
    );
    expect(response.status).toBe(401);
  });

  it("negotiates MCP and presents only read tools", async () => {
    const initialized = await requestMcp({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "savvyos-integration-test", version: "1.0.0" },
      },
    });
    expect(initialized.status).toBe(200);
    expect((await readMcpPayload(initialized)).result.serverInfo.name).toBe(
      "savvyos-read-only"
    );

    const tools = await requestMcp({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });
    expect(tools.status).toBe(200);
    const toolNames = (
      (await readMcpPayload(tools)).result.tools as Array<{ name: string }>
    ).map(tool => tool.name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        "list_savvyos_tables",
        "describe_savvyos_table",
        "read_savvyos_data",
      ])
    );
    expect(
      toolNames.every(name => !/(create|update|delete|write|send)/i.test(name))
    ).toBe(true);
  });

  it("rejects a mutating tool query without changing data", async () => {
    const response = await requestMcp({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "read_savvyos_data",
        arguments: { sql: "UPDATE contacts SET firstName = 'blocked' LIMIT 1" },
      },
    });
    expect(response.status).toBe(200);
    const payload = await readMcpPayload(response);
    expect(payload.result.isError).toBe(true);
    expect(payload.result.content[0].text).toContain("Only SELECT queries");
  });
});
