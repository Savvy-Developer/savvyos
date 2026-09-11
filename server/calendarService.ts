import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { calendarConnections } from "../drizzle/schema";
import { getDb } from "./db";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.events.freebusy",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
].join(" ");
const APP_URL = (process.env.SAVVYOS_APP_URL ?? "https://os.savvy-agents.com").replace(/\/$/, "");
const STATE_TTL_MS = 10 * 60 * 1000;

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleCalendarConnection = typeof calendarConnections.$inferSelect;

export class CalendarIntegrationError extends Error {
  constructor(
    public readonly code:
      | "not_configured"
      | "not_connected"
      | "authorization_failed"
      | "provider_error",
    message: string
  ) {
    super(message);
    this.name = "CalendarIntegrationError";
  }
}

function getConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const encryptionKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY?.trim();
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() ??
    `${APP_URL}/api/calendar/google/callback`;
  return { clientId, clientSecret, encryptionKey, redirectUri };
}

export function isGoogleCalendarConfigured(): boolean {
  const { clientId, clientSecret, encryptionKey } = getConfig();
  return Boolean(clientId && clientSecret && encryptionKey);
}

function requireConfig(): {
  clientId: string;
  clientSecret: string;
  encryptionKey: string;
  redirectUri: string;
} {
  const config = getConfig();
  if (!config.clientId || !config.clientSecret || !config.encryptionKey) {
    throw new CalendarIntegrationError(
      "not_configured",
      "Google Calendar is not configured yet. Please contact SavvyOS support."
    );
  }
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    encryptionKey: config.encryptionKey,
    redirectUri: config.redirectUri,
  };
}

function encryptionKey(): Buffer {
  const { encryptionKey: configuredKey } = requireConfig();
  return crypto.createHash("sha256").update(configuredKey).digest();
}

/** Encrypt an OAuth credential before it is persisted. Never log its output. */
export function encryptCalendarToken(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptCalendarToken(value: string): string {
  const [version, ivValue, tagValue, cipherValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !cipherValue) {
    throw new CalendarIntegrationError("provider_error", "Saved calendar credentials are invalid.");
  }
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivValue, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(cipherValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new CalendarIntegrationError("provider_error", "Saved calendar credentials cannot be read.");
  }
}

function signedState(payload: string): string {
  const { encryptionKey: configuredKey } = requireConfig();
  return crypto
    .createHmac("sha256", configuredKey)
    .update(payload)
    .digest("base64url");
}

export function createGoogleOAuthState(userId: number): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, expiresAt: Date.now() + STATE_TTL_MS, nonce: crypto.randomBytes(18).toString("base64url") })
  ).toString("base64url");
  return `${payload}.${signedState(payload)}`;
}

export function parseGoogleOAuthState(state: string): { userId: number } {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) {
    throw new CalendarIntegrationError("authorization_failed", "Your calendar connection request is invalid or expired.");
  }
  const expected = signedState(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new CalendarIntegrationError("authorization_failed", "Your calendar connection request is invalid or expired.");
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Number.isInteger(parsed.userId) || !Number.isFinite(parsed.expiresAt) || parsed.expiresAt < Date.now()) {
      throw new Error("invalid state");
    }
    return { userId: parsed.userId };
  } catch {
    throw new CalendarIntegrationError("authorization_failed", "Your calendar connection request is invalid or expired.");
  }
}

export function googleAuthorizationUrl(userId: number, loginHint?: string | null): string {
  const { clientId, redirectUri } = requireConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: createGoogleOAuthState(userId),
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function requestGoogleToken(params: URLSearchParams): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const result = (await response.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!response.ok || !result.access_token) {
    throw new CalendarIntegrationError(
      "authorization_failed",
      result.error_description || "Google could not authorize this calendar connection."
    );
  }
  return result;
}

async function googleApi<T>(accessToken: string, path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 204) return {} as T;
  const result = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new CalendarIntegrationError(
      "provider_error",
      result?.error?.message || "Google Calendar could not complete this request."
    );
  }
  return result;
}

async function connectionForUser(userId: number): Promise<GoogleCalendarConnection> {
  const db = await getDb();
  if (!db) throw new CalendarIntegrationError("provider_error", "Database unavailable.");
  const [connection] = await db
    .select()
    .from(calendarConnections)
    .where(and(eq(calendarConnections.userId, userId), eq(calendarConnections.provider, "google")))
    .limit(1);
  if (!connection?.refreshTokenEncrypted || connection.status !== "connected") {
    throw new CalendarIntegrationError("not_connected", "This agent has not connected Google Calendar.");
  }
  return connection;
}

async function accessTokenForConnection(connection: GoogleCalendarConnection): Promise<string> {
  const config = requireConfig();
  const refreshToken = decryptCalendarToken(connection.refreshTokenEncrypted!);
  try {
    const token = await requestGoogleToken(
      new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      })
    );
    const db = await getDb();
    if (db) {
      await db
        .update(calendarConnections)
        .set({
          accessTokenEncrypted: encryptCalendarToken(token.access_token!),
          tokenExpiresAt: new Date(Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000),
          lastSyncedAt: new Date(),
          lastError: null,
          status: "connected",
        })
        .where(eq(calendarConnections.id, connection.id));
    }
    return token.access_token!;
  } catch (error) {
    const db = await getDb();
    if (db) {
      await db
        .update(calendarConnections)
        .set({ status: "error", lastError: error instanceof Error ? error.message.slice(0, 2_000) : "Token refresh failed" })
        .where(eq(calendarConnections.id, connection.id));
    }
    if (error instanceof CalendarIntegrationError) throw error;
    throw new CalendarIntegrationError("provider_error", "Google Calendar could not refresh this connection.");
  }
}

async function googleAccessToken(userId: number): Promise<{ connection: GoogleCalendarConnection; accessToken: string }> {
  const connection = await connectionForUser(userId);
  return { connection, accessToken: await accessTokenForConnection(connection) };
}

export async function connectGoogleCalendar(userId: number, code: string): Promise<{ email: string | null }> {
  const config = requireConfig();
  const token = await requestGoogleToken(
    new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    })
  );
  const db = await getDb();
  if (!db) throw new CalendarIntegrationError("provider_error", "Database unavailable.");

  const profile: { id?: string; summary?: string } = await googleApi<{ id?: string; summary?: string }>(
    token.access_token!,
    "/users/me/calendarList/primary"
  ).catch((): { id: string; summary?: string } => ({ id: "primary" }));
  const [existing] = await db
    .select()
    .from(calendarConnections)
    .where(and(eq(calendarConnections.userId, userId), eq(calendarConnections.provider, "google")))
    .limit(1);
  const refreshToken = token.refresh_token
    ? encryptCalendarToken(token.refresh_token)
    : existing?.refreshTokenEncrypted ?? null;
  if (!refreshToken) {
    throw new CalendarIntegrationError("authorization_failed", "Google did not provide a refresh token. Please try connecting again.");
  }

  const email = profile.summary?.includes("@") ? profile.summary : null;
  const values = {
    calendarId: profile.id || "primary",
    connectedEmail: email,
    refreshTokenEncrypted: refreshToken,
    accessTokenEncrypted: encryptCalendarToken(token.access_token!),
    tokenExpiresAt: new Date(Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000),
    grantedScopes: token.scope ?? GOOGLE_SCOPES,
    status: "connected" as const,
    lastError: null,
    lastSyncedAt: new Date(),
    disconnectedAt: null,
  };
  if (existing) {
    await db.update(calendarConnections).set(values).where(eq(calendarConnections.id, existing.id));
  } else {
    await db.insert(calendarConnections).values({ userId, provider: "google", ...values });
  }
  return { email };
}

export async function disconnectGoogleCalendar(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new CalendarIntegrationError("provider_error", "Database unavailable.");
  await db
    .update(calendarConnections)
    .set({
      refreshTokenEncrypted: null,
      accessTokenEncrypted: null,
      tokenExpiresAt: null,
      grantedScopes: null,
      status: "disconnected",
      lastError: null,
      disconnectedAt: new Date(),
    })
    .where(and(eq(calendarConnections.userId, userId), eq(calendarConnections.provider, "google")));
}

export async function googleCalendarAvailability(input: {
  userId: number;
  timeMin: Date;
  timeMax: Date;
  timezone: string;
  calendarIds?: string[];
}): Promise<Array<{ start: string; end: string }>> {
  const { connection, accessToken } = await googleAccessToken(input.userId);
  const calendarIds = Array.from(new Set(
    (input.calendarIds?.length ? input.calendarIds : [connection.calendarId || "primary"])
      .filter((value): value is string => Boolean(value?.trim()))
  ));
  const result = await googleApi<{ calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }> }>(
    accessToken,
    "/freeBusy",
    {
      method: "POST",
      body: JSON.stringify({
        timeMin: input.timeMin.toISOString(),
        timeMax: input.timeMax.toISOString(),
        timeZone: input.timezone,
        items: calendarIds.map(id => ({ id })),
      }),
    }
  );
  return calendarIds.flatMap(id => result.calendars?.[id]?.busy ?? []);
}

/** Lists calendars the connected user can choose for recruiting conflict checks. */
export async function listGoogleCalendars(userId: number): Promise<Array<{ id: string; summary: string; primary: boolean }>> {
  const { accessToken } = await googleAccessToken(userId);
  const result = await googleApi<{ items?: Array<{ id?: string; summary?: string; primary?: boolean; selected?: boolean; accessRole?: string }> }>(
    accessToken,
    "/users/me/calendarList?minAccessRole=reader"
  );
  return (result.items ?? [])
    .filter(item => item.id && item.accessRole !== "none")
    .map(item => ({ id: item.id!, summary: item.summary || item.id!, primary: Boolean(item.primary) }))
    .sort((left, right) => Number(right.primary) - Number(left.primary) || left.summary.localeCompare(right.summary));
}

export type CalendarEventInput = {
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  location?: string | null;
  attendeeEmail?: string | null;
  appointmentId: number;
};

function calendarEventPayload(input: CalendarEventInput) {
  return {
    summary: input.title,
    description: input.description || undefined,
    location: input.location || undefined,
    start: { dateTime: input.startAt.toISOString(), timeZone: input.timezone },
    end: { dateTime: input.endAt.toISOString(), timeZone: input.timezone },
    attendees: input.attendeeEmail ? [{ email: input.attendeeEmail }] : undefined,
    extendedProperties: { private: { savvyosAppointmentId: String(input.appointmentId) } },
  };
}

export async function createGoogleCalendarEvent(userId: number, input: CalendarEventInput): Promise<{ eventId: string; htmlLink: string | null }> {
  const { connection, accessToken } = await googleAccessToken(userId);
  const result = await googleApi<{ id?: string; htmlLink?: string }>(
    accessToken,
    `/calendars/${encodeURIComponent(connection.calendarId || "primary")}/events?sendUpdates=all`,
    { method: "POST", body: JSON.stringify(calendarEventPayload(input)) }
  );
  if (!result.id) throw new CalendarIntegrationError("provider_error", "Google Calendar did not return an event ID.");
  return { eventId: result.id, htmlLink: result.htmlLink ?? null };
}

export async function updateGoogleCalendarEvent(userId: number, eventId: string, input: CalendarEventInput): Promise<void> {
  const { connection, accessToken } = await googleAccessToken(userId);
  await googleApi(
    accessToken,
    `/calendars/${encodeURIComponent(connection.calendarId || "primary")}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: "PUT", body: JSON.stringify(calendarEventPayload(input)) }
  );
}

export async function cancelGoogleCalendarEvent(userId: number, eventId: string): Promise<void> {
  const { connection, accessToken } = await googleAccessToken(userId);
  try {
    await googleApi(
      accessToken,
      `/calendars/${encodeURIComponent(connection.calendarId || "primary")}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      { method: "DELETE" }
    );
  } catch (error) {
    // A user may have deleted the event directly in Google Calendar. Its local
    // cancellation should still complete without presenting a dead-end error.
    if (error instanceof CalendarIntegrationError && /not found|notFound/i.test(error.message)) return;
    throw error;
  }
}

export const __testables__ = {
  createGoogleOAuthState,
  decryptCalendarToken,
  encryptCalendarToken,
  parseGoogleOAuthState,
};
