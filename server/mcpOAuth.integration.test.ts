import crypto from "crypto";
import express from "express";
import mysql, { type Connection } from "mysql2/promise";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerMcpOAuthRoutes } from "./mcpOAuth";
import { registerReadOnlyMcpRoute } from "./readOnlyMcp";

const callbackUrl = "https://client.example.test/oauth/callback";
const verifier = "test-pkce-verifier-which-is-long-enough-to-be-valid";
const code = `svy_mcp_oac_${crypto.randomBytes(24).toString("base64url")}`;
const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");
const challenge = crypto
  .createHash("sha256")
  .update(verifier)
  .digest("base64url");

let server: Server;
let database: Connection;
let baseUrl = "";
let clientId = "";
let testUserId = 0;
let issuedTokens: { access_token: string; refresh_token: string } | null = null;
const originalMcpPublicBaseUrl = process.env.MCP_PUBLIC_BASE_URL;

async function mcpRequest(body: object, accessToken: string) {
  return fetch(`${baseUrl}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${accessToken}`,
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
  if (!data) throw new Error(`Expected MCP SSE payload, received: ${text}`);
  return JSON.parse(data);
}

describe("OAuth 2.1 MCP authorization", () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl)
      throw new Error("DATABASE_URL is required for OAuth MCP tests.");
    database = await mysql.createConnection(databaseUrl);
    const [userRows] = await database.query<Array<{ id: number }>>(
      "SELECT id FROM users WHERE email = ? AND isActive = 1 AND personType = 'full_user' LIMIT 1",
      ["tyler@savvy.realty"]
    );
    if (!userRows[0])
      throw new Error(
        "An authorized SavvyOS MCP user is required for this test."
      );
    testUserId = userRows[0].id;

    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    registerMcpOAuthRoutes(app);
    registerReadOnlyMcpRoute(app);
    await new Promise<void>(resolve => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Test server did not start.");
    baseUrl = `http://127.0.0.1:${address.port}`;
    process.env.MCP_PUBLIC_BASE_URL = baseUrl;
  });

  afterAll(async () => {
    if (clientId) {
      await database.execute(
        "DELETE FROM mcp_oauth_clients WHERE clientId = ?",
        [clientId]
      );
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
    await database.end();
    if (originalMcpPublicBaseUrl === undefined)
      delete process.env.MCP_PUBLIC_BASE_URL;
    else process.env.MCP_PUBLIC_BASE_URL = originalMcpPublicBaseUrl;
  });

  it("publishes protected-resource and authorization-server metadata", async () => {
    const protectedMetadata = await fetch(
      `${baseUrl}/.well-known/oauth-protected-resource/api/mcp`
    );
    expect(protectedMetadata.status).toBe(200);
    expect(await protectedMetadata.json()).toMatchObject({
      resource: `${baseUrl}/api/mcp`,
      authorization_servers: [baseUrl],
      scopes_supported: expect.arrayContaining([
        "savvyos.read",
        "offline_access",
      ]),
    });

    const authorizationMetadata = await fetch(
      `${baseUrl}/.well-known/oauth-authorization-server`
    );
    expect(authorizationMetadata.status).toBe(200);
    expect(await authorizationMetadata.json()).toMatchObject({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      code_challenge_methods_supported: ["S256"],
    });

    const unauthorized = await fetch(`${baseUrl}/api/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toContain(
      `resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/api/mcp"`
    );
  });

  it("registers a public client, exchanges a PKCE code, and authorizes MCP reads", async () => {
    const registration = await fetch(`${baseUrl}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        redirect_uris: [callbackUrl],
        token_endpoint_auth_method: "none",
        client_name: "SavvyOS OAuth integration test",
      }),
    });
    expect(registration.status).toBe(201);
    const client = await registration.json();
    clientId = client.client_id;
    expect(client).toMatchObject({
      token_endpoint_auth_method: "none",
      redirect_uris: [callbackUrl],
      grant_types: ["authorization_code", "refresh_token"],
    });

    await database.execute(
      "INSERT INTO mcp_oauth_authorization_codes (codeHash, clientId, userId, redirectUri, codeChallenge, scopes, resource, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))",
      [
        hash(code),
        clientId,
        testUserId,
        callbackUrl,
        challenge,
        JSON.stringify(["savvyos.read", "offline_access"]),
        `${baseUrl}/api/mcp`,
      ]
    );

    const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        code_verifier: verifier,
        redirect_uri: callbackUrl,
        resource: `${baseUrl}/api/mcp`,
      }),
    });
    expect(tokenResponse.status).toBe(200);
    issuedTokens = await tokenResponse.json();
    expect(issuedTokens).toMatchObject({
      token_type: "Bearer",
      expires_in: 3600,
      scope: "savvyos.read offline_access",
    });
    expect(issuedTokens?.access_token).toMatch(/^svy_mcp_oat_/);
    expect(issuedTokens?.refresh_token).toMatch(/^svy_mcp_ort_/);

    const initialized = await mcpRequest(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "oauth-integration-test", version: "1.0.0" },
        },
      },
      issuedTokens!.access_token
    );
    expect(initialized.status).toBe(200);
    expect((await readMcpPayload(initialized)).result.serverInfo.name).toBe(
      "savvyos-read-only"
    );
  });

  it("rotates refresh tokens and rejects a refresh-token replay", async () => {
    expect(issuedTokens).not.toBeNull();
    const refreshed = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: issuedTokens!.refresh_token,
        resource: `${baseUrl}/api/mcp`,
      }),
    });
    expect(refreshed.status).toBe(200);
    const nextTokens = await refreshed.json();
    expect(nextTokens.access_token).not.toBe(issuedTokens!.access_token);
    expect(nextTokens.refresh_token).not.toBe(issuedTokens!.refresh_token);

    const replay = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: issuedTokens!.refresh_token,
        resource: `${baseUrl}/api/mcp`,
      }),
    });
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ error: "invalid_grant" });
  });
});
