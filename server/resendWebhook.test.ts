import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

// ─── Mock DB ────────────────────────────────────────────────────────────────
// vi.mock is hoisted, so we can't reference variables declared outside.
// Use vi.fn() inline inside the factory.
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  }),
}));

vi.mock("../../drizzle/schema", () => ({
  contacts: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

// Import after mocks are set up
import { verifyResendWebhookSignature, handleResendWebhook } from "./_core/resendWebhook";
import { getDb } from "./db";

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("verifyResendWebhookSignature", () => {
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({ type: "email.bounced", data: { to: ["test@example.com"] } });

  it("returns true for a valid HMAC-SHA256 signature", () => {
    const signature = createHmac("sha256", secret).update(payload).digest("hex");
    expect(verifyResendWebhookSignature(payload, signature, secret)).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    expect(verifyResendWebhookSignature(payload, "invalid_sig", secret)).toBe(false);
  });

  it("returns false when signature is undefined", () => {
    expect(verifyResendWebhookSignature(payload, undefined, secret)).toBe(false);
  });

  it("returns false when secret is empty", () => {
    expect(verifyResendWebhookSignature(payload, "any_sig", "")).toBe(false);
  });
});

describe("handleResendWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock to return a fresh chain each time
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    });
  });

  it("handles email.bounced event and marks contact as bounced", async () => {
    const result = await handleResendWebhook({
      type: "email.bounced",
      data: { to: ["bounced@example.com"] },
    });
    expect(result.handled).toBe(true);
    expect(result.action).toBe("marked_bounced");
    expect(result.email).toBe("bounced@example.com");
  });

  it("handles email.complained event and marks contact as unsubscribed", async () => {
    const result = await handleResendWebhook({
      type: "email.complained",
      data: { to: ["complained@example.com"] },
    });
    expect(result.handled).toBe(true);
    expect(result.action).toBe("marked_unsubscribed_complaint");
    expect(result.email).toBe("complained@example.com");
  });

  it("handles email.suppressed event and marks contact as unsubscribed", async () => {
    const result = await handleResendWebhook({
      type: "email.suppressed",
      data: { to: ["suppressed@example.com"] },
    });
    expect(result.handled).toBe(true);
    expect(result.action).toBe("marked_unsubscribed_suppressed");
    expect(result.email).toBe("suppressed@example.com");
  });

  it("returns handled: false when no email address is present", async () => {
    const result = await handleResendWebhook({
      type: "email.bounced",
      data: {},
    });
    expect(result.handled).toBe(false);
    expect(result.reason).toBe("no_email");
  });

  it("returns handled: false for unrecognized event types", async () => {
    const result = await handleResendWebhook({
      type: "email.opened",
      data: { to: ["user@example.com"] },
    });
    expect(result.handled).toBe(false);
    expect(result.reason).toBe("unhandled_event_type");
  });

  it("does NOT handle contact.unsubscribed (event no longer exists in Resend)", async () => {
    const result = await handleResendWebhook({
      type: "contact.unsubscribed",
      data: { email: "user@example.com" },
    });
    expect(result.handled).toBe(false);
    expect(result.reason).toBe("unhandled_event_type");
  });
});
