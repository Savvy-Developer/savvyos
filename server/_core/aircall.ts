/**
 * Aircall SMS helper
 * Uses Basic Auth: api_id + api_token (Base64 encoded)
 * Docs: https://developer.aircall.io/api-references#send-message
 */

const AIRCALL_API_ORIGIN = "https://api.aircall.io";
const AIRCALL_API_BASE = `${AIRCALL_API_ORIGIN}/v1`;

function getAircallAuth(): string | null {
  const apiId = process.env.AIRCALL_API_ID;
  const apiToken = process.env.AIRCALL_API_TOKEN;
  if (!apiId || !apiToken) return null;
  return Buffer.from(`${apiId}:${apiToken}`).toString("base64");
}


export function isAircallApiConfigured(): boolean {
  return !!getAircallAuth();
}

export function isAircallConfigured(): boolean {
  return isAircallApiConfigured() && !!process.env.AIRCALL_NUMBER_ID;
}

/**
 * Make an authenticated request to a supported Aircall REST path. Credentials
 * remain server-only and callers may pass either a v1 or v2 API path.
 */
export async function aircallApiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const auth = getAircallAuth();
  if (!auth) throw new Error("Aircall API credentials are not configured");
  if (!path.startsWith("/v1/") && !path.startsWith("/v2/")) {
    throw new Error("Unsupported Aircall API path");
  }

  return fetch(`${AIRCALL_API_ORIGIN}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
}

export type AircallSmsSendResult = {
  success: boolean;
  messageId?: string;
  error?: string;
  message?: Record<string, unknown>;
};

/**
 * Send SMS into an Aircall native conversation. Native mode keeps the
 * conversation available in Aircall while SavvyOS mirrors it through the
 * message webhooks and immediate local persistence.
 */
export async function sendAircallSMS(
  to: string,
  body: string,
  senderNumberId?: number | string | null,
): Promise<AircallSmsSendResult> {
  const auth = getAircallAuth();
  const numberId = senderNumberId ?? process.env.AIRCALL_NUMBER_ID;

  if (!auth || !numberId) {
    console.warn("[Aircall] SMS not sent — Aircall credentials or sender number are not configured.");
    return { success: false, error: "Aircall marketing sender is not configured" };
  }

  // Normalize a U.S. local number to E.164 while leaving already-normalized
  // international values intact for Aircall validation.
  const normalizedTo = to.startsWith("+") ? to : `+1${to.replace(/\D/g, "")}`;

  try {
    const response = await fetch(`${AIRCALL_API_BASE}/numbers/${numberId}/messages/native/send`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: normalizedTo, body }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Aircall] SMS send failed (${response.status}):`, errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json() as Record<string, unknown>;
    return { success: true, messageId: data.id ? String(data.id) : undefined, message: data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Aircall] SMS send error:", message);
    return { success: false, error: message };
  }
}
