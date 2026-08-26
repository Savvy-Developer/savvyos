import crypto from "crypto";

export type ZoomRegistrationApproval = "automatically" | "manually" | "no_registration";

export type ZoomWebinarRecord = {
  id: string | number;
  uuid?: string;
  join_url?: string;
  registration_url?: string;
  start_url?: string;
  created_at?: string;
};

export type ZoomRegistrant = {
  id?: string;
  registrant_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  create_time?: string;
  status?: string;
  join_time?: string;
  leave_time?: string;
  duration?: number;
  participant_user_id?: string;
  [key: string]: unknown;
};

type AccessTokenCache = { accessToken: string; expiresAt: number } | null;
let accessTokenCache: AccessTokenCache = null;

function getZoomConfig() {
  return {
    accountId: process.env.ZOOM_ACCOUNT_ID?.trim() ?? "",
    clientId: process.env.ZOOM_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.ZOOM_CLIENT_SECRET?.trim() ?? "",
    hostUserId: process.env.ZOOM_WEBINAR_HOST_ID?.trim() ?? "",
    webhookSecretToken: process.env.ZOOM_WEBHOOK_SECRET_TOKEN?.trim() ?? "",
  };
}

export function getZoomConfigurationStatus() {
  const config = getZoomConfig();
  return {
    configured: Boolean(config.accountId && config.clientId && config.clientSecret && config.hostUserId),
    webhookConfigured: Boolean(config.webhookSecretToken),
    missing: [
      !config.accountId ? "ZOOM_ACCOUNT_ID" : null,
      !config.clientId ? "ZOOM_CLIENT_ID" : null,
      !config.clientSecret ? "ZOOM_CLIENT_SECRET" : null,
      !config.hostUserId ? "ZOOM_WEBINAR_HOST_ID" : null,
    ].filter(Boolean),
  };
}

function requireZoomConfiguration() {
  const config = getZoomConfig();
  const missing = getZoomConfigurationStatus().missing;
  if (missing.length > 0) {
    throw new Error(`Zoom webinar integration is not configured. Missing: ${missing.join(", ")}.`);
  }
  return config as Required<typeof config>;
}

async function getAccessToken(): Promise<string> {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now() + 60_000) {
    return accessTokenCache.accessToken;
  }

  const config = requireZoomConfiguration();
  const authorization = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const params = new URLSearchParams({ grant_type: "account_credentials", account_id: config.accountId });
  const response = await fetch(`https://zoom.us/oauth/token?${params.toString()}`, {
    method: "POST",
    headers: { Authorization: `Basic ${authorization}` },
  });
  const data = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; reason?: string; message?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(data.reason || data.message || "Zoom authorization failed.");
  }
  accessTokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max((data.expires_in ?? 3600) - 90, 60) * 1000,
  };
  return accessTokenCache.accessToken;
}

async function zoomRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");

  const response = await fetch(`https://api.zoom.us/v2${path}`, { ...init, headers });
  if (response.status === 204) return {} as T;
  const data = await response.json().catch(() => ({})) as T & { message?: string; code?: number };
  if (!response.ok) {
    const detail = (data as { message?: string; code?: number }).message ?? `HTTP ${response.status}`;
    throw new Error(`Zoom API request failed: ${detail}`);
  }
  return data;
}

function approvalType(approval: ZoomRegistrationApproval): number {
  if (approval === "manually") return 1;
  if (approval === "no_registration") return 2;
  return 0;
}

export async function createZoomWebinar(input: {
  title: string;
  description?: string | null;
  startTime: Date;
  durationMinutes: number;
  timezone: string;
  registrationApproval: ZoomRegistrationApproval;
}): Promise<ZoomWebinarRecord> {
  const config = requireZoomConfiguration();
  const body = {
    topic: input.title,
    agenda: input.description ?? "",
    type: 5,
    start_time: input.startTime.toISOString(),
    duration: input.durationMinutes,
    timezone: input.timezone,
    settings: {
      approval_type: approvalType(input.registrationApproval),
      registration_type: 1,
      close_registration: false,
      registrants_confirmation_email: true,
      registrants_email_notification: true,
      allow_multiple_devices: false,
    },
  };
  return zoomRequest<ZoomWebinarRecord>(`/users/${encodeURIComponent(config.hostUserId)}/webinars`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateZoomWebinar(zoomWebinarId: string, input: {
  title: string;
  description?: string | null;
  startTime: Date;
  durationMinutes: number;
  timezone: string;
  registrationApproval: ZoomRegistrationApproval;
}): Promise<void> {
  await zoomRequest(`/webinars/${encodeURIComponent(zoomWebinarId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      topic: input.title,
      agenda: input.description ?? "",
      start_time: input.startTime.toISOString(),
      duration: input.durationMinutes,
      timezone: input.timezone,
      settings: { approval_type: approvalType(input.registrationApproval) },
    }),
  });
}

export async function deleteZoomWebinar(zoomWebinarId: string): Promise<void> {
  await zoomRequest(`/webinars/${encodeURIComponent(zoomWebinarId)}`, { method: "DELETE" });
}

export async function listZoomWebinarRegistrants(zoomWebinarId: string): Promise<ZoomRegistrant[]> {
  const all: ZoomRegistrant[] = [];
  for (const status of ["approved", "pending", "denied"]) {
    let nextPageToken = "";
    do {
      const params = new URLSearchParams({ status, page_size: "300" });
      if (nextPageToken) params.set("next_page_token", nextPageToken);
      const page = await zoomRequest<{ registrants?: ZoomRegistrant[]; next_page_token?: string }>(
        `/webinars/${encodeURIComponent(zoomWebinarId)}/registrants?${params.toString()}`,
      );
      all.push(...(page.registrants ?? []).map((registrant) => ({ ...registrant, status: registrant.status ?? status })));
      nextPageToken = page.next_page_token ?? "";
    } while (nextPageToken);
  }
  return all;
}

export function normalizeZoomRegistrantStatus(value?: string): "registered" | "approved" | "cancelled" | "denied" | "attended" | "no_show" {
  const status = value?.toLowerCase();
  if (status === "approved") return "approved";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "denied") return "denied";
  if (status === "attended") return "attended";
  if (status === "no_show" || status === "no show") return "no_show";
  return "registered";
}

export function parseZoomDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function verifyZoomWebhookSignature(rawBody: string, timestamp: string | undefined, signature: string | undefined): boolean {
  const secret = getZoomConfig().webhookSecretToken;
  if (!secret || !timestamp || !signature) return false;
  const expected = `v0=${crypto.createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function buildZoomWebhookValidationResponse(plainToken: string): { plainToken: string; encryptedToken: string } {
  const secret = getZoomConfig().webhookSecretToken;
  if (!secret) throw new Error("Zoom webhook secret is not configured.");
  return {
    plainToken,
    encryptedToken: crypto.createHmac("sha256", secret).update(plainToken).digest("hex"),
  };
}

export function createZoomEventKey(rawBody: string, requestId?: string): string {
  return crypto.createHash("sha256").update(`${requestId ?? ""}:${rawBody}`).digest("hex");
}

export function isZoomWebhookConfigured(): boolean {
  return Boolean(getZoomConfig().webhookSecretToken);
}
