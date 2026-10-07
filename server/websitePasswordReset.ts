import { sendTransactionalEmail } from "./_core/resendEmail";
import { PUBLIC_SITE_BASE } from "./websiteDailyEmailLogic";

/**
 * The password reset email for website (investor) accounts.
 *
 * websiteAccount.requestPasswordReset used to create the reset token and stop
 * there: nothing ever emailed the link, so "Forgot password" on the new site
 * told people to check their email and no email came. This sends it.
 *
 * The SavvyOS staff reset (auth.forgotPassword, the "password_reset" type) is a
 * different account system and is not touched.
 */

export function passwordResetUrl(token: string): string {
  return `${PUBLIC_SITE_BASE}/reset-password?token=${encodeURIComponent(token)}`;
}

export type SendPasswordResetResult = { sent: boolean; reason?: string };

/**
 * Email the reset link. Never throws: the caller answers the same neutral
 * reply whether or not an account exists, and a mail problem must not change
 * that reply.
 */
export async function sendPasswordResetEmail(
  account: { email: string; firstName?: string | null },
  token: string,
  send: typeof sendTransactionalEmail = sendTransactionalEmail
): Promise<SendPasswordResetResult> {
  try {
    const result = await send(
      "website_account_password_reset",
      {
        recipientEmail: account.email,
        recipientName: account.firstName?.trim() || undefined,
        websiteResetUrl: passwordResetUrl(token),
      },
      // An investor is not a SavvyOS user: no SavvyOS sign-in links.
      { injectMagicLinks: false }
    );
    if (!result.sent) {
      console.warn("[websitePasswordReset] reset email not sent:", result.reason);
      return { sent: false, reason: result.reason };
    }
    return { sent: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn("[websitePasswordReset] reset email not sent:", reason);
    return { sent: false, reason };
  }
}
