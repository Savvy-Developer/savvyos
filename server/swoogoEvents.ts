const DEFAULT_TOKEN_URL = "https://api.swoogo.com/api/v1/oauth2/token";
const DEFAULT_API_BASE = "https://api.swoogo.com/api/v1";
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

const state: {
  accessToken: string | null;
  expiresAt: number;
  refreshedAt: string | null;
  inFlight: Promise<string> | null;
  timer: NodeJS.Timeout | null;
  lastError: { message: string; at: string } | null;
  refreshCount: number;
} = {
  accessToken: null,
  expiresAt: 0,
  refreshedAt: null,
  inFlight: null,
  timer: null,
  lastError: null,
  refreshCount: 0,
};

function tokenUrl() {
  return process.env.SWOOGO_TOKEN_URL?.trim() || DEFAULT_TOKEN_URL;
}

function apiBase() {
  return process.env.SWOOGO_API_BASE?.trim() || DEFAULT_API_BASE;
}

function refreshIntervalMs() {
  const configuredMinutes = Number(process.env.SWOOGO_REFRESH_MINUTES);
  return (
    (Number.isFinite(configuredMinutes) && configuredMinutes > 0
      ? configuredMinutes
      : 25) * 60_000
  );
}

function basicCredentials() {
  const preEncoded = process.env.SWOOGO_CREDENTIALS_B64?.trim();
  if (preEncoded) return preEncoded;
  const key = process.env.SWOOGO_CONSUMER_KEY?.trim();
  const secret = process.env.SWOOGO_CONSUMER_SECRET?.trim();
  if (key && secret)
    return Buffer.from(`${key}:${secret}`, "utf8").toString("base64");
  throw new Error("Swoogo API credentials are not configured.");
}

function configured() {
  return Boolean(
    process.env.SWOOGO_CREDENTIALS_B64?.trim() ||
      (process.env.SWOOGO_CONSUMER_KEY?.trim() &&
        process.env.SWOOGO_CONSUMER_SECRET?.trim())
  );
}

function parseExpiry(response: Record<string, unknown>) {
  const expiresIn = Number(response.expires_in);
  if (Number.isFinite(expiresIn) && expiresIn > 0)
    return Date.now() + expiresIn * 1000;
  if (typeof response.expires_at === "string" && response.expires_at.trim()) {
    const normalized = response.expires_at.includes("T")
      ? response.expires_at
      : `${response.expires_at.replace(" ", "T")}Z`;
    const parsed = Date.parse(normalized);
    if (!Number.isNaN(parsed)) return parsed;
  }
  // Swoogo tokens currently last 30 minutes; keep a conservative fallback if
  // a provider response ever omits expiry metadata.
  return Date.now() + 25 * 60_000;
}

function isFresh() {
  return (
    Boolean(state.accessToken) &&
    Date.now() < state.expiresAt - EXPIRY_MARGIN_MS
  );
}

async function requestToken() {
  const response = await fetch(tokenUrl(), {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicCredentials()}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!response.ok)
    throw new Error(`Swoogo token request failed with HTTP ${response.status}`);
  const body = (await response.json()) as Record<string, unknown>;
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new Error("Swoogo token response contained no access_token.");
  }
  state.accessToken = body.access_token;
  state.expiresAt = parseExpiry(body);
  state.refreshedAt = new Date().toISOString();
  state.lastError = null;
  state.refreshCount += 1;
  console.info(`[Events/Swoogo] Token refreshed (#${state.refreshCount}).`);
  return state.accessToken;
}

export function refreshSwoogoToken() {
  if (state.inFlight) return state.inFlight;
  state.inFlight = requestToken()
    .catch(error => {
      state.lastError = {
        message:
          error instanceof Error
            ? error.message
            : "Swoogo token refresh failed.",
        at: new Date().toISOString(),
      };
      console.error(
        "[Events/Swoogo] Token refresh failed:",
        state.lastError.message
      );
      throw error;
    })
    .finally(() => {
      state.inFlight = null;
    });
  return state.inFlight;
}

export async function getSwoogoToken() {
  if (isFresh()) return state.accessToken as string;
  return refreshSwoogoToken();
}

export async function swoogoGet(
  path: string,
  params: Record<string, string | number | undefined> = {},
  retry = true
) {
  const token = await getSwoogoToken();
  const url = new URL(
    `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`
  );
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (response.status === 401 && retry) {
    state.accessToken = null;
    state.expiresAt = 0;
    return swoogoGet(path, params, false);
  }
  if (!response.ok)
    throw new Error(
      `Swoogo GET ${url.pathname} failed with HTTP ${response.status}`
    );
  return response.json() as Promise<Record<string, unknown>>;
}

export function startSwoogoTokenRefresh() {
  if (state.timer || !configured()) return;
  void refreshSwoogoToken().catch(() => undefined);
  state.timer = setInterval(
    () => void refreshSwoogoToken().catch(() => undefined),
    refreshIntervalMs()
  );
  state.timer.unref?.();
}

export function stopSwoogoTokenRefresh() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

export function getSwoogoConfigurationStatus() {
  const webhookHeader =
    process.env.SWOOGO_WEBHOOK_HEADER?.trim() || "x-savvy-webhook-token";
  return {
    apiConfigured: configured(),
    webhookConfigured: Boolean(process.env.SWOOGO_WEBHOOK_TOKEN?.trim()),
    webhookHeader,
    countedSourceAutomationEnabled: false,
    token: {
      hasToken: Boolean(state.accessToken),
      expiresAt: state.expiresAt
        ? new Date(state.expiresAt).toISOString()
        : null,
      lastRefreshedAt: state.refreshedAt,
      lastError: state.lastError,
      refreshCount: state.refreshCount,
    },
  };
}
