/**
 * The website password reset email. Nothing here reaches Resend, a mailbox or
 * a database: the sender is a stand-in.
 */
import { readFileSync } from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn(async () => null), logActivity: vi.fn() }));

import { getEmailPreview } from "./_core/resendEmail";
import { passwordResetUrl, sendPasswordResetEmail } from "./websitePasswordReset";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("the reset email", () => {
  it("goes only to the account holder, with the link to the new site's reset page", async () => {
    const send = vi.fn(async () => ({ sent: true, skipped: false }));

    const result = await sendPasswordResetEmail({ email: "inv@example.com", firstName: " Nia " }, "a".repeat(64), send as any);

    expect(result).toEqual({ sent: true });
    expect(send).toHaveBeenCalledTimes(1);
    const [type, ctx, options] = send.mock.calls[0] as any[];
    expect(type).toBe("website_account_password_reset");
    expect(ctx.recipientEmail).toBe("inv@example.com");
    expect(ctx.recipientName).toBe("Nia");
    expect(ctx.ccEmail).toBeUndefined();
    expect(ctx.ccEmails).toBeUndefined();
    expect(options).toEqual({ injectMagicLinks: false });

    const url = new URL(ctx.websiteResetUrl);
    expect(url.origin + url.pathname).toBe("https://home.savvy-agents.com/newsite/reset-password");
    expect(url.searchParams.get("token")).toBe("a".repeat(64));
  });

  it("never throws when the email is refused or the sender fails", async () => {
    const refused = vi.fn(async () => ({ sent: false, skipped: true, reason: "off" }));
    expect(await sendPasswordResetEmail({ email: "a@example.com" }, "t", refused as any)).toEqual({
      sent: false,
      reason: "off",
    });

    const broken = vi.fn(async () => {
      throw new Error("resend down");
    });
    expect(await sendPasswordResetEmail({ email: "a@example.com" }, "t", broken as any)).toEqual({
      sent: false,
      reason: "resend down",
    });
  });

  it("renders the link and escapes the name", () => {
    const preview = getEmailPreview("website_account_password_reset", {
      recipientEmail: "inv@example.com",
      recipientName: "Nia <b>",
      websiteResetUrl: passwordResetUrl("abc"),
    });
    expect(preview.subject).toBe("Reset your Savvy STR Agents password");
    expect(preview.html).toContain('href="https://home.savvy-agents.com/newsite/reset-password?token=abc"');
    expect(preview.html).toContain("Nia &lt;b&gt;");
    expect(preview.html).not.toContain("Nia <b>");
  });
});

describe("wiring", () => {
  const router = readFileSync(path.resolve(import.meta.dirname, "routers/websiteAccount.ts"), "utf8").replace(
    /\r\n/g,
    "\n"
  );
  const reset = router.slice(router.indexOf("requestPasswordReset:"), router.indexOf("resetPassword:"));

  it("emails the token it creates, without waiting on the send", () => {
    const created = reset.indexOf("createPasswordResetToken(account.id)");
    const sent = reset.indexOf("void sendPasswordResetEmail(account, token)");
    expect(created).toBeGreaterThan(-1);
    expect(sent).toBeGreaterThan(created);
  });

  it("sends nothing for an unknown, inactive or over-limit email", () => {
    const beforeToken = reset.slice(0, reset.indexOf("createPasswordResetToken"));
    expect(beforeToken).not.toContain("sendPasswordResetEmail");
    expect(beforeToken).toContain('account.status !== "active") return NEUTRAL_RESET_REPLY');
  });
});
