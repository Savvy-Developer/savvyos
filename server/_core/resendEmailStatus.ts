import { ENV } from "./env";

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";

export type ResendEmailStatus = {
  id: string;
  lastEvent: string | null;
  createdAt: string | null;
};

/** Retrieves the current Resend state for an individual message ID. */
export async function getResendEmailStatus(
  messageId: string
): Promise<
  { success: true; data: ResendEmailStatus } | { success: false; error: string }
> {
  if (!ENV.resendApiKey)
    return { success: false, error: "Resend is not configured" };
  try {
    const response = await fetch(
      `${RESEND_EMAIL_ENDPOINT}/${encodeURIComponent(messageId)}`,
      {
        headers: { Authorization: `Bearer ${ENV.resendApiKey}` },
      }
    );
    if (!response.ok) {
      return {
        success: false,
        error: `Resend status lookup failed (${response.status}): ${(await response.text()).slice(0, 500)}`,
      };
    }
    const data = (await response.json()) as {
      id?: string;
      last_event?: string | null;
      created_at?: string | null;
    };
    return {
      success: true,
      data: {
        id: data.id ?? messageId,
        lastEvent: data.last_event ?? null,
        createdAt: data.created_at ?? null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
