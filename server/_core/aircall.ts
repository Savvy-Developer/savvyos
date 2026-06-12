/**
 * Aircall SMS helper
 * Uses Basic Auth: api_id + api_token (Base64 encoded)
 * Docs: https://developer.aircall.io/api-references#send-message
 */

const AIRCALL_API_BASE = "https://api.aircall.io/v1";

function getAircallAuth(): string | null {
  const apiId = process.env.AIRCALL_API_ID;
  const apiToken = process.env.AIRCALL_API_TOKEN;
  if (!apiId || !apiToken) return null;
  return Buffer.from(`${apiId}:${apiToken}`).toString("base64");
}


export function isAircallConfigured(): boolean {
  return !!(process.env.AIRCALL_API_ID && process.env.AIRCALL_API_TOKEN && process.env.AIRCALL_NUMBER_ID);
}

export async function sendAircallSMS(to: string, body: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const auth = getAircallAuth();
  const numberId = process.env.AIRCALL_NUMBER_ID;

  if (!auth || !numberId) {
    console.warn("[Aircall] SMS not sent — AIRCALL_API_ID, AIRCALL_API_TOKEN, or AIRCALL_NUMBER_ID not configured.");
    return { success: false, error: "Aircall not configured" };
  }

  // Normalize phone number to E.164 format if not already
  const normalizedTo = to.startsWith("+") ? to : `+1${to.replace(/\D/g, "")}`;

  try {
    const response = await fetch(`${AIRCALL_API_BASE}/numbers/${numberId}/messages/send`, {
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

    const data = await response.json() as { id?: string };
    return { success: true, messageId: data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Aircall] SMS send error:", message);
    return { success: false, error: message };
  }
}
