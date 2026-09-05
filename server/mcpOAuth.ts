import crypto from "crypto";
import bcrypt from "bcryptjs";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import type { RowDataPacket } from "mysql2";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { getMcpPool } from "./mcpDatabase";
import { isMcpAccessManager } from "./routers/mcpAccess";

export const MCP_ENDPOINT_PATH = "/api/mcp";
export const MCP_PUBLIC_ORIGIN = "https://os.savvy-agents.com";
export const MCP_RESOURCE_URL = `${MCP_PUBLIC_ORIGIN}${MCP_ENDPOINT_PATH}`;
export const MCP_OAUTH_REQUEST_COOKIE = "savvy_mcp_authorization";
export const MCP_AUTHORIZATION_REQUEST_TTL_MS = 10 * 60 * 1000;
export const MCP_AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;
export const MCP_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
export const MCP_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SUPPORTED_SCOPES = new Set(["savvyos.read", "offline_access"]);
const REQUIRED_SCOPE = "savvyos.read";
const oauthRateLimitBuckets = new Map<
  string,
  { count: number; windowStartedAt: number }
>();

type OAuthClientMetadata = {
  client_id: string;
  redirect_uris: string[];
  token_endpoint_auth_method?: string;
  client_name?: string;
  client_uri?: string;
  scope?: string;
  grant_types?: string[];
  response_types?: string[];
  [key: string]: unknown;
};

type AuthorizationRequestRow = RowDataPacket & {
  id: number;
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scopes: string[] | string;
  resource: string;
  expiresAt: Date;
};

type AuthorizationCodeRow = RowDataPacket & {
  id: number;
  clientId: string;
  userId: number;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[] | string;
  resource: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

type AccessTokenRow = RowDataPacket & {
  id: number;
  clientId: string;
  userId: number;
  scopes: string[] | string;
  resource: string;
  expiresAt: Date;
  revokedAt: Date | null;
  email: string | null;
  isActive: number | boolean;
  personType: "full_user" | "teammate";
};

type RefreshTokenRow = RowDataPacket & {
  id: number;
  familyId: string;
  clientId: string;
  userId: number;
  scopes: string[] | string;
  resource: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomSecret(prefix: string): string {
  return `${prefix}${crypto.randomBytes(32).toString("base64url")}`;
}

function timingSafeMatch(
  left: string | undefined,
  right: string | undefined
): boolean {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function dateAfter(ms: number): Date {
  return new Date(Date.now() + ms);
}

function jsonArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function publicBaseUrl(): string {
  return (process.env.MCP_PUBLIC_BASE_URL || MCP_PUBLIC_ORIGIN).replace(
    /\/$/,
    ""
  );
}

export function mcpResourceUrl(): string {
  return `${publicBaseUrl()}${MCP_ENDPOINT_PATH}`;
}

export function mcpProtectedResourceMetadataUrl(): string {
  return `${publicBaseUrl()}/.well-known/oauth-protected-resource${MCP_ENDPOINT_PATH}`;
}

function mcpOAuthMetadata(): Record<string, unknown> {
  const base = publicBaseUrl();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["savvyos.read", "offline_access"],
    service_documentation: `${base}/mcp-access`,
  };
}

function mcpProtectedResourceMetadata(): Record<string, unknown> {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [publicBaseUrl()],
    scopes_supported: ["savvyos.read", "offline_access"],
    bearer_methods_supported: ["header"],
    resource_name: "SavvyOS Read-Only Data",
    resource_documentation: `${publicBaseUrl()}/mcp-access`,
  };
}

function setCors(res: Response): void {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Mcp-Protocol-Version",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  });
}

function oauthClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(",")[0];
  return forwardedIp?.trim() || req.ip || req.socket.remoteAddress || "unknown";
}

/** Small process-local guard for public OAuth endpoints; Railway's edge remains the primary perimeter. */
function allowOAuthRequest(
  req: Request,
  res: Response,
  bucket: string,
  limit: number,
  windowMs: number
): boolean {
  const key = `${bucket}:${oauthClientIp(req)}`;
  const now = Date.now();
  const current = oauthRateLimitBuckets.get(key);
  if (!current || now - current.windowStartedAt >= windowMs) {
    oauthRateLimitBuckets.set(key, { count: 1, windowStartedAt: now });
    return true;
  }
  current.count += 1;
  if (current.count <= limit) return true;
  res.set(
    "Retry-After",
    String(
      Math.max(
        1,
        Math.ceil((windowMs - (now - current.windowStartedAt)) / 1000)
      )
    )
  );
  sendOAuthError(
    res,
    429,
    "temporarily_unavailable",
    "Too many OAuth requests. Please try again later."
  );
  return false;
}

function sendOAuthError(
  res: Response,
  status: number,
  error: string,
  description: string
): void {
  res.set("Cache-Control", "no-store");
  res.status(status).json({ error, error_description: description });
}

function renderPage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} · SavvyOS</title><style>body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#0f172a;margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box}.card{width:100%;max-width:480px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;box-shadow:0 16px 42px rgba(15,23,42,.09)}h1{font-size:24px;margin:0 0 10px}p{line-height:1.5;color:#475569}.brand{color:#0891b2;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:14px}.notice{border:1px solid #bae6fd;background:#f0f9ff;border-radius:10px;padding:12px 14px;font-size:14px;color:#0c4a6e;margin:18px 0}.error{border-color:#fecaca;background:#fef2f2;color:#991b1b}label{display:block;font-size:14px;font-weight:600;margin:16px 0 6px}input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}button{width:100%;margin-top:22px;padding:12px 16px;background:#06b6d4;border:0;border-radius:8px;color:#fff;font:600 15px inherit;cursor:pointer}button:hover{background:#0891b2}.secondary{background:#fff;border:1px solid #cbd5e1;color:#334155;margin-top:10px}.fine{font-size:12px;margin-top:20px}.client{font-weight:700;color:#0f172a}</style></head><body><main class="card"><div class="brand">SavvyOS</div>${body}</main></body></html>`;
}

function escapeHtml(value: string | null | undefined): string {
  return String(value ?? "").replace(
    /[&<>'"]/g,
    char =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ] as string
  );
}

function safeClientName(client: OAuthClientMetadata): string {
  const name =
    typeof client.client_name === "string"
      ? client.client_name.trim()
      : "An MCP client";
  return name || "An MCP client";
}

function canonicalResource(input: string | undefined): string | null {
  if (!input) return mcpResourceUrl();
  try {
    const parsed = new URL(input);
    const expected = new URL(mcpResourceUrl());
    if (
      parsed.protocol !== expected.protocol ||
      parsed.host !== expected.host ||
      parsed.pathname !== expected.pathname ||
      parsed.search ||
      parsed.hash
    )
      return null;
    return expected.href;
  } catch {
    return null;
  }
}

function validRedirectUri(value: string): boolean {
  try {
    const uri = new URL(value);
    if (uri.protocol === "https:") return true;
    return (
      uri.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(uri.hostname)
    );
  } catch {
    return false;
  }
}

function redirectUriMatches(requested: string, registered: string): boolean {
  if (requested === registered) return true;
  try {
    const requestUri = new URL(requested);
    const registeredUri = new URL(registered);
    const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
    return (
      loopback.has(requestUri.hostname) &&
      loopback.has(registeredUri.hostname) &&
      requestUri.protocol === registeredUri.protocol &&
      requestUri.hostname === registeredUri.hostname &&
      requestUri.pathname === registeredUri.pathname &&
      requestUri.search === registeredUri.search
    );
  } catch {
    return false;
  }
}

function normalizeRequestedScopes(scope: string | undefined): string[] | null {
  const requested = scope?.trim() ? scope.trim().split(/\s+/) : [];
  if (requested.some(item => !SUPPORTED_SCOPES.has(item))) return null;
  const result = new Set([REQUIRED_SCOPE]);
  for (const item of requested) result.add(item);
  return Array.from(result);
}

function oauthRequestCookie(req: Request): string | undefined {
  return parseCookieHeader(req.headers.cookie ?? "")[MCP_OAUTH_REQUEST_COOKIE];
}

async function getClient(
  clientId: string
): Promise<OAuthClientMetadata | null> {
  const [rows] = await getMcpPool().query<RowDataPacket[]>(
    "SELECT metadata FROM mcp_oauth_clients WHERE clientId = ? LIMIT 1",
    [clientId]
  );
  if (!rows.length || !rows[0].metadata || typeof rows[0].metadata !== "object")
    return null;
  const metadata = rows[0].metadata as OAuthClientMetadata;
  if (!Array.isArray(metadata.redirect_uris)) return null;
  return metadata;
}

async function getAuthorizationRequest(
  rawRequest: string | undefined
): Promise<AuthorizationRequestRow | null> {
  if (!rawRequest) return null;
  const [rows] = await getMcpPool().query<AuthorizationRequestRow[]>(
    "SELECT id, clientId, redirectUri, state, codeChallenge, scopes, resource, expiresAt FROM mcp_oauth_authorization_requests WHERE requestHash = ? AND expiresAt > NOW() LIMIT 1",
    [hash(rawRequest)]
  );
  return rows[0] ?? null;
}

async function getCurrentMcpUser(req: Request) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (
      !user ||
      !user.isActive ||
      user.personType === "teammate" ||
      !isMcpAccessManager(user.email)
    )
      return null;
    return user;
  } catch {
    return null;
  }
}

async function isAuthorizedMcpUserId(userId: number): Promise<boolean> {
  const [rows] = await getMcpPool().query<
    Array<
      RowDataPacket & {
        email: string | null;
        isActive: number | boolean;
        personType: "full_user" | "teammate";
      }
    >
  >("SELECT email, isActive, personType FROM users WHERE id = ? LIMIT 1", [
    userId,
  ]);
  const user = rows[0];
  return Boolean(
    user &&
      user.isActive &&
      user.personType !== "teammate" &&
      isMcpAccessManager(user.email)
  );
}

async function createTokens(input: {
  clientId: string;
  userId: number;
  scopes: string[];
  resource: string;
  familyId?: string;
}): Promise<{
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope: string;
}> {
  const accessToken = randomSecret("svy_mcp_oat_");
  const refreshToken = input.scopes.includes("offline_access")
    ? randomSecret("svy_mcp_ort_")
    : undefined;
  const familyId = input.familyId || crypto.randomUUID();
  const accessExpiresAt = dateAfter(MCP_ACCESS_TOKEN_TTL_MS);
  const refreshExpiresAt = dateAfter(MCP_REFRESH_TOKEN_TTL_MS);
  const pool = getMcpPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      "INSERT INTO mcp_oauth_access_tokens (tokenHash, clientId, userId, scopes, resource, expiresAt) VALUES (?, ?, ?, ?, ?, ?)",
      [
        hash(accessToken),
        input.clientId,
        input.userId,
        JSON.stringify(input.scopes),
        input.resource,
        accessExpiresAt,
      ]
    );
    if (refreshToken) {
      await connection.query(
        "INSERT INTO mcp_oauth_refresh_tokens (tokenHash, familyId, clientId, userId, scopes, resource, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          hash(refreshToken),
          familyId,
          input.clientId,
          input.userId,
          JSON.stringify(input.scopes),
          input.resource,
          refreshExpiresAt,
        ]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return {
    access_token: accessToken,
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
    token_type: "Bearer",
    expires_in: Math.floor(MCP_ACCESS_TOKEN_TTL_MS / 1000),
    scope: input.scopes.join(" "),
  };
}

function accessDeniedRedirect(
  request: AuthorizationRequestRow,
  description: string
): string {
  const target = new URL(request.redirectUri);
  target.searchParams.set("error", "access_denied");
  target.searchParams.set("error_description", description);
  if (request.state) target.searchParams.set("state", request.state);
  return target.href;
}

function clearAuthorizationRequestCookie(res: Response): void {
  res.clearCookie(MCP_OAUTH_REQUEST_COOKIE, {
    httpOnly: true,
    path: "/oauth",
    sameSite: "lax",
    secure: true,
  });
}

function authorizationCookieOptions() {
  return {
    httpOnly: true,
    path: "/oauth",
    sameSite: "lax" as const,
    secure: true,
    maxAge: MCP_AUTHORIZATION_REQUEST_TTL_MS,
  };
}

async function issueAuthorizationCode(
  request: AuthorizationRequestRow,
  userId: number
): Promise<string> {
  const code = randomSecret("svy_mcp_oac_");
  const connection = await getMcpPool().getConnection();
  try {
    await connection.beginTransaction();
    const [deleted] = await connection.query<any>(
      "DELETE FROM mcp_oauth_authorization_requests WHERE id = ? AND expiresAt > NOW()",
      [request.id]
    );
    if (!Number(deleted.affectedRows))
      throw new Error("Authorization request has expired.");
    await connection.query(
      "INSERT INTO mcp_oauth_authorization_codes (codeHash, clientId, userId, redirectUri, codeChallenge, scopes, resource, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        hash(code),
        request.clientId,
        userId,
        request.redirectUri,
        request.codeChallenge,
        JSON.stringify(jsonArray(request.scopes)),
        request.resource,
        dateAfter(MCP_AUTHORIZATION_CODE_TTL_MS),
      ]
    );
    await connection.commit();
    return code;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function consumeAuthorizationCode(input: {
  code: string;
  clientId: string;
  codeVerifier: string;
  redirectUri: string | undefined;
  resource: string;
}): Promise<AuthorizationCodeRow | null> {
  const connection = await getMcpPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<AuthorizationCodeRow[]>(
      "SELECT id, clientId, userId, redirectUri, codeChallenge, scopes, resource, expiresAt, consumedAt FROM mcp_oauth_authorization_codes WHERE codeHash = ? LIMIT 1 FOR UPDATE",
      [hash(input.code)]
    );
    const code = rows[0];
    if (
      !code ||
      code.consumedAt ||
      code.expiresAt <= new Date() ||
      code.clientId !== input.clientId ||
      code.redirectUri !== input.redirectUri ||
      code.resource !== input.resource
    ) {
      await connection.rollback();
      return null;
    }
    const expectedChallenge = crypto
      .createHash("sha256")
      .update(input.codeVerifier)
      .digest("base64url");
    if (!timingSafeMatch(expectedChallenge, code.codeChallenge)) {
      await connection.rollback();
      return null;
    }
    const [updated] = await connection.query<any>(
      "UPDATE mcp_oauth_authorization_codes SET consumedAt = NOW() WHERE id = ? AND consumedAt IS NULL",
      [code.id]
    );
    if (!Number(updated.affectedRows)) {
      await connection.rollback();
      return null;
    }
    await connection.commit();
    return code;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Verifies an OAuth access token used with the read-only MCP resource server. */
export async function verifyMcpOAuthAccessToken(
  token: string
): Promise<{ clientId: string; userId: number; scopes: string[] } | null> {
  const [rows] = await getMcpPool().query<AccessTokenRow[]>(
    `SELECT t.id, t.clientId, t.userId, t.scopes, t.resource, t.expiresAt, t.revokedAt,
            u.email, u.isActive, u.personType
       FROM mcp_oauth_access_tokens t
       INNER JOIN users u ON u.id = t.userId
      WHERE t.tokenHash = ? AND t.revokedAt IS NULL AND t.expiresAt > NOW()
      LIMIT 1`,
    [hash(token)]
  );
  const row = rows[0];
  if (
    !row ||
    row.resource !== mcpResourceUrl() ||
    !Boolean(row.isActive) ||
    row.personType === "teammate" ||
    !isMcpAccessManager(row.email)
  )
    return null;
  const scopes = jsonArray(row.scopes);
  if (!scopes.includes(REQUIRED_SCOPE)) return null;
  return { clientId: row.clientId, userId: row.userId, scopes };
}

/** Registers OAuth 2.1, PKCE, and DCR endpoints for remote MCP clients. */
export function registerMcpOAuthRoutes(app: Express): void {
  const protectedMetadataPaths = [
    `/.well-known/oauth-protected-resource${MCP_ENDPOINT_PATH}`,
    "/.well-known/oauth-protected-resource",
  ];
  app.options(
    [
      "/oauth/register",
      "/oauth/token",
      "/oauth/revoke",
      ...protectedMetadataPaths,
      "/.well-known/oauth-authorization-server",
    ],
    (_req, res) => {
      setCors(res);
      return res.sendStatus(204);
    }
  );

  app.get(protectedMetadataPaths, (_req, res) => {
    setCors(res);
    return res.status(200).json(mcpProtectedResourceMetadata());
  });
  app.get(
    [
      "/.well-known/oauth-authorization-server",
      `/.well-known/oauth-authorization-server${MCP_ENDPOINT_PATH}`,
    ],
    (_req, res) => {
      setCors(res);
      return res.status(200).json(mcpOAuthMetadata());
    }
  );

  app.post("/oauth/register", async (req, res) => {
    setCors(res);
    res.set("Cache-Control", "no-store");
    if (!allowOAuthRequest(req, res, "register", 20, 60 * 60 * 1000)) return;
    const body = req.body as Record<string, unknown>;
    const redirectUris = Array.isArray(body?.redirect_uris)
      ? body.redirect_uris.filter(
          (uri): uri is string =>
            typeof uri === "string" && validRedirectUri(uri)
        )
      : [];
    const requestedMethod = body?.token_endpoint_auth_method;
    if (
      !redirectUris.length ||
      redirectUris.length !==
        (Array.isArray(body?.redirect_uris) ? body.redirect_uris.length : 0)
    ) {
      return sendOAuthError(
        res,
        400,
        "invalid_client_metadata",
        "At least one valid HTTPS or loopback redirect URI is required."
      );
    }
    if (requestedMethod && requestedMethod !== "none") {
      return sendOAuthError(
        res,
        400,
        "invalid_client_metadata",
        "SavvyOS MCP supports public OAuth clients with PKCE only."
      );
    }
    const clientId = crypto.randomUUID();
    const issuedAt = Math.floor(Date.now() / 1000);
    const metadata: OAuthClientMetadata = {
      ...(body as Record<string, unknown>),
      client_id: clientId,
      client_id_issued_at: issuedAt,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    };
    await getMcpPool().query(
      "INSERT INTO mcp_oauth_clients (clientId, metadata) VALUES (?, ?)",
      [clientId, JSON.stringify(metadata)]
    );
    return res.status(201).json(metadata);
  });

  app.get("/oauth/authorize", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!allowOAuthRequest(req, res, "authorize", 100, 15 * 60 * 1000)) return;
    const clientId =
      typeof req.query.client_id === "string" ? req.query.client_id : "";
    const redirectUri =
      typeof req.query.redirect_uri === "string" ? req.query.redirect_uri : "";
    const responseType =
      typeof req.query.response_type === "string"
        ? req.query.response_type
        : "";
    const codeChallenge =
      typeof req.query.code_challenge === "string"
        ? req.query.code_challenge
        : "";
    const challengeMethod =
      typeof req.query.code_challenge_method === "string"
        ? req.query.code_challenge_method
        : "";
    const state =
      typeof req.query.state === "string" ? req.query.state : undefined;
    const scope =
      typeof req.query.scope === "string" ? req.query.scope : undefined;
    const resource = canonicalResource(
      typeof req.query.resource === "string" ? req.query.resource : undefined
    );
    const client = await getClient(clientId);
    if (
      !client ||
      !redirectUri ||
      !client.redirect_uris.some(registered =>
        redirectUriMatches(redirectUri, registered)
      )
    ) {
      return sendOAuthError(
        res,
        400,
        "invalid_request",
        "The OAuth client or redirect URI is not registered."
      );
    }
    if (
      responseType !== "code" ||
      !codeChallenge ||
      challengeMethod !== "S256" ||
      !resource
    ) {
      const target = new URL(redirectUri);
      target.searchParams.set("error", "invalid_request");
      target.searchParams.set(
        "error_description",
        "SavvyOS MCP requires authorization code flow with PKCE S256 and its MCP resource URL."
      );
      if (state) target.searchParams.set("state", state);
      return res.redirect(302, target.href);
    }
    const scopes = normalizeRequestedScopes(scope);
    if (!scopes) {
      const target = new URL(redirectUri);
      target.searchParams.set("error", "invalid_scope");
      target.searchParams.set(
        "error_description",
        "The requested scope is not supported by SavvyOS MCP."
      );
      if (state) target.searchParams.set("state", state);
      return res.redirect(302, target.href);
    }
    const requestToken = randomSecret("svy_mcp_oar_");
    await getMcpPool().query(
      "INSERT INTO mcp_oauth_authorization_requests (requestHash, clientId, redirectUri, state, codeChallenge, scopes, resource, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        hash(requestToken),
        clientId,
        redirectUri,
        state || null,
        codeChallenge,
        JSON.stringify(scopes),
        resource,
        dateAfter(MCP_AUTHORIZATION_REQUEST_TTL_MS),
      ]
    );
    res.cookie(
      MCP_OAUTH_REQUEST_COOKIE,
      requestToken,
      authorizationCookieOptions()
    );
    return res.redirect(302, "/oauth/authorize/continue");
  });

  app.get("/oauth/authorize/continue", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const requestToken = oauthRequestCookie(req);
    const request = await getAuthorizationRequest(requestToken);
    if (!request) {
      clearAuthorizationRequestCookie(res);
      return res
        .status(400)
        .send(
          renderPage(
            "Connection expired",
            "<h1>Connection expired</h1><p>Please return to ChatGPT or Claude and start the SavvyOS connection again.</p>"
          )
        );
    }
    const client = await getClient(request.clientId);
    if (!client)
      return res
        .status(400)
        .send(
          renderPage(
            "Connection unavailable",
            "<h1>Connection unavailable</h1><p>This MCP client is no longer registered. Please restart the connection.</p>"
          )
        );
    const user = await getCurrentMcpUser(req);
    if (!user) {
      return res
        .status(200)
        .send(
          renderPage(
            "Sign in",
            `<h1>Sign in to SavvyOS</h1><p><span class="client">${escapeHtml(safeClientName(client))}</span> is requesting read-only access to SavvyOS.</p><form method="post" action="/oauth/login"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" required><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">Sign in and continue</button></form><p class="fine">Only Tyler, Elana, and Dyl can authorize this SavvyOS data connection.</p>`
          )
        );
    }
    return res
      .status(200)
      .send(
        renderPage(
          "Authorize read-only access",
          `<h1>Allow read-only SavvyOS access?</h1><p><span class="client">${escapeHtml(safeClientName(client))}</span> will be able to read and analyze SavvyOS data using your connection.</p><div class="notice"><strong>Read-only access.</strong><br>It cannot create, edit, send, delete, or otherwise change SavvyOS data. Credential-like fields remain unavailable.</div><form method="post" action="/oauth/authorize/approve"><input type="hidden" name="request_token" value="${escapeHtml(requestToken || "")}"><button type="submit">Allow read-only access</button></form><form method="post" action="/oauth/authorize/deny"><input type="hidden" name="request_token" value="${escapeHtml(requestToken || "")}"><button class="secondary" type="submit">Cancel</button></form><p class="fine">Signed in as ${escapeHtml(user.email)}.</p>`
        )
      );
  });

  app.post("/oauth/login", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!allowOAuthRequest(req, res, "login", 10, 15 * 60 * 1000)) return;
    const requestToken = oauthRequestCookie(req);
    const request = await getAuthorizationRequest(requestToken);
    if (!request)
      return res
        .status(400)
        .send(
          renderPage(
            "Connection expired",
            "<h1>Connection expired</h1><p>Please restart the MCP connection in your AI client.</p>"
          )
        );
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    const user = await db.getUserByEmail(email);
    const valid = user?.passwordHash
      ? await bcrypt.compare(password, user.passwordHash)
      : false;
    if (
      !valid ||
      !user ||
      !user.isActive ||
      user.personType === "teammate" ||
      !isMcpAccessManager(user.email)
    ) {
      return res
        .status(401)
        .send(
          renderPage(
            "Sign in",
            `<h1>Unable to sign in</h1><div class="notice error">Use the active SavvyOS account for Tyler, Elana, or Dyl. Check your email and password, then try again.</div><form method="post" action="/oauth/login"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" required value="${escapeHtml(email)}"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">Sign in and continue</button></form>`
          )
        );
    }
    const sessionToken = await sdk.createSessionToken(user.openId, {
      name: user.name ?? user.email ?? "",
      expiresInMs: ONE_YEAR_MS,
    });
    res.cookie(COOKIE_NAME, sessionToken, {
      ...getSessionCookieOptions(req),
      maxAge: ONE_YEAR_MS,
    });
    return res.redirect(302, "/oauth/authorize/continue");
  });

  app.post("/oauth/authorize/approve", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!allowOAuthRequest(req, res, "approve", 30, 15 * 60 * 1000)) return;
    const requestToken = oauthRequestCookie(req);
    if (
      !timingSafeMatch(
        requestToken,
        typeof req.body?.request_token === "string"
          ? req.body.request_token
          : undefined
      )
    ) {
      return res
        .status(400)
        .send(
          renderPage(
            "Connection request invalid",
            "<h1>Connection request invalid</h1><p>Please return to your AI client and start the connection again.</p>"
          )
        );
    }
    const request = await getAuthorizationRequest(requestToken);
    const user = await getCurrentMcpUser(req);
    if (!request || !user)
      return res
        .status(400)
        .send(
          renderPage(
            "Connection expired",
            "<h1>Connection expired</h1><p>Please restart the MCP connection.</p>"
          )
        );
    const code = await issueAuthorizationCode(request, user.id);
    clearAuthorizationRequestCookie(res);
    const target = new URL(request.redirectUri);
    target.searchParams.set("code", code);
    if (request.state) target.searchParams.set("state", request.state);
    return res.redirect(302, target.href);
  });

  app.post("/oauth/authorize/deny", async (req, res) => {
    const requestToken = oauthRequestCookie(req);
    const request = await getAuthorizationRequest(requestToken);
    clearAuthorizationRequestCookie(res);
    if (!request)
      return res
        .status(400)
        .send(
          renderPage(
            "Connection cancelled",
            "<h1>Connection cancelled</h1><p>You may close this window and return to your AI client.</p>"
          )
        );
    await getMcpPool().query(
      "DELETE FROM mcp_oauth_authorization_requests WHERE id = ?",
      [request.id]
    );
    return res.redirect(
      302,
      accessDeniedRedirect(
        request,
        "The SavvyOS connection was not authorized."
      )
    );
  });

  app.post("/oauth/token", async (req, res) => {
    setCors(res);
    res.set("Cache-Control", "no-store");
    if (!allowOAuthRequest(req, res, "token", 60, 15 * 60 * 1000)) return;
    const grantType =
      typeof req.body?.grant_type === "string" ? req.body.grant_type : "";
    const clientId =
      typeof req.body?.client_id === "string" ? req.body.client_id : "";
    const client = await getClient(clientId);
    if (!client || client.token_endpoint_auth_method !== "none")
      return sendOAuthError(
        res,
        400,
        "invalid_client",
        "The OAuth client is not registered."
      );
    const resource = canonicalResource(
      typeof req.body?.resource === "string" ? req.body.resource : undefined
    );
    if (!resource)
      return sendOAuthError(
        res,
        400,
        "invalid_target",
        "The requested OAuth resource is not SavvyOS MCP."
      );
    if (grantType === "authorization_code") {
      const code = typeof req.body?.code === "string" ? req.body.code : "";
      const codeVerifier =
        typeof req.body?.code_verifier === "string"
          ? req.body.code_verifier
          : "";
      const redirectUri =
        typeof req.body?.redirect_uri === "string"
          ? req.body.redirect_uri
          : undefined;
      if (!code || !codeVerifier || !redirectUri)
        return sendOAuthError(
          res,
          400,
          "invalid_request",
          "code, code_verifier, and redirect_uri are required."
        );
      const authorizationCode = await consumeAuthorizationCode({
        code,
        clientId,
        codeVerifier,
        redirectUri,
        resource,
      });
      if (!authorizationCode)
        return sendOAuthError(
          res,
          400,
          "invalid_grant",
          "The authorization code is invalid, expired, already used, or was issued to another client."
        );
      if (!(await isAuthorizedMcpUserId(authorizationCode.userId)))
        return sendOAuthError(
          res,
          400,
          "invalid_grant",
          "The SavvyOS user who approved this connection is no longer authorized."
        );
      const scopes = jsonArray(authorizationCode.scopes);
      try {
        return res.status(200).json(
          await createTokens({
            clientId,
            userId: authorizationCode.userId,
            scopes,
            resource,
          })
        );
      } catch (error) {
        console.error("[McpOAuth] Token issue failed:", error);
        return sendOAuthError(
          res,
          500,
          "server_error",
          "SavvyOS could not issue the access token."
        );
      }
    }
    if (grantType === "refresh_token") {
      const rawRefreshToken =
        typeof req.body?.refresh_token === "string"
          ? req.body.refresh_token
          : "";
      if (!rawRefreshToken)
        return sendOAuthError(
          res,
          400,
          "invalid_request",
          "refresh_token is required."
        );
      const connection = await getMcpPool().getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.query<RefreshTokenRow[]>(
          "SELECT id, familyId, clientId, userId, scopes, resource, expiresAt, revokedAt FROM mcp_oauth_refresh_tokens WHERE tokenHash = ? LIMIT 1 FOR UPDATE",
          [hash(rawRefreshToken)]
        );
        const refresh = rows[0];
        if (
          !refresh ||
          refresh.clientId !== clientId ||
          refresh.resource !== resource ||
          refresh.expiresAt <= new Date() ||
          refresh.revokedAt
        ) {
          if (refresh?.familyId)
            await connection.query(
              "UPDATE mcp_oauth_refresh_tokens SET revokedAt = NOW() WHERE familyId = ? AND revokedAt IS NULL",
              [refresh.familyId]
            );
          await connection.commit();
          return sendOAuthError(
            res,
            400,
            "invalid_grant",
            "The refresh token is invalid, expired, revoked, or has already been used."
          );
        }
        if (!(await isAuthorizedMcpUserId(refresh.userId))) {
          await connection.query(
            "UPDATE mcp_oauth_refresh_tokens SET revokedAt = NOW() WHERE familyId = ? AND revokedAt IS NULL",
            [refresh.familyId]
          );
          await connection.commit();
          return sendOAuthError(
            res,
            400,
            "invalid_grant",
            "The SavvyOS user who approved this connection is no longer authorized."
          );
        }
        await connection.query(
          "UPDATE mcp_oauth_refresh_tokens SET revokedAt = NOW() WHERE id = ?",
          [refresh.id]
        );
        await connection.commit();
        return res.status(200).json(
          await createTokens({
            clientId,
            userId: refresh.userId,
            scopes: jsonArray(refresh.scopes),
            resource,
            familyId: refresh.familyId,
          })
        );
      } catch (error) {
        await connection.rollback();
        console.error("[McpOAuth] Token refresh failed:", error);
        return sendOAuthError(
          res,
          500,
          "server_error",
          "SavvyOS could not refresh the access token."
        );
      } finally {
        connection.release();
      }
    }
    return sendOAuthError(
      res,
      400,
      "unsupported_grant_type",
      "SavvyOS MCP supports authorization_code and refresh_token grants."
    );
  });

  app.post("/oauth/revoke", async (req, res) => {
    setCors(res);
    res.set("Cache-Control", "no-store");
    if (!allowOAuthRequest(req, res, "revoke", 20, 15 * 60 * 1000)) return;
    const clientId =
      typeof req.body?.client_id === "string" ? req.body.client_id : "";
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    if (clientId && token) {
      await Promise.all([
        getMcpPool().query(
          "UPDATE mcp_oauth_access_tokens SET revokedAt = NOW() WHERE tokenHash = ? AND clientId = ? AND revokedAt IS NULL",
          [hash(token), clientId]
        ),
        getMcpPool().query(
          "UPDATE mcp_oauth_refresh_tokens SET revokedAt = NOW() WHERE tokenHash = ? AND clientId = ? AND revokedAt IS NULL",
          [hash(token), clientId]
        ),
      ]);
    }
    return res.status(200).send();
  });
}

export const __oauthTestables__ = {
  canonicalResource,
  normalizeRequestedScopes,
  redirectUriMatches,
  timingSafeMatch,
};
