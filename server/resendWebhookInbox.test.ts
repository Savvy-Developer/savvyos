import { describe, expect, it } from "vitest";
import {
  describeResendWebhookEvent,
  parseResendWebhookEvent,
  resendWebhookEventId,
  retryAt,
} from "./resendWebhookInbox";

describe("Resend webhook inbox", () => {
  const rawBody = JSON.stringify({
    type: "email.opened",
    created_at: "2026-09-16T21:34:00.000Z",
    data: {
      email_id: "email_123",
      to: ["person@example.com"],
    },
  });

  it("keeps a provider Svix ID as the idempotency key", () => {
    expect(resendWebhookEventId(rawBody, "msg_123")).toBe("msg_123");
  });

  it("derives a stable fallback idempotency key only when Svix is absent", () => {
    expect(resendWebhookEventId(rawBody)).toEqual(resendWebhookEventId(rawBody));
    expect(resendWebhookEventId(rawBody)).toMatch(/^payload:[a-f0-9]{64}$/);
  });

  it("parses the callback once and preserves event metadata for later projection", () => {
    const described = describeResendWebhookEvent(rawBody, "msg_123");
    expect(described).toMatchObject({
      svixId: "msg_123",
      event: { type: "email.opened", data: { email_id: "email_123" } },
    });
  });

  it("rejects malformed callbacks before they reach the durable queue", () => {
    expect(() => parseResendWebhookEvent("[]")).toThrow("payload must be an object");
    expect(() => parseResendWebhookEvent(JSON.stringify({ type: "email.opened" }))).toThrow(
      "missing event data"
    );
  });

  it("caps retry delay while backing off repeated projection failures", () => {
    const now = new Date("2026-09-16T21:34:00.000Z");
    expect(retryAt(1, now).getTime() - now.getTime()).toBe(2_000);
    expect(retryAt(50, now).getTime() - now.getTime()).toBe(30 * 60 * 1000);
  });
});
