import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "../_core/env";
import {
  resendRateLimitRetryDelayMs,
  sendViaResend,
} from "./pipelineEmail";

const originalResendKey = ENV.resendApiKey;

afterEach(() => {
  ENV.resendApiKey = originalResendKey;
  vi.unstubAllGlobals();
});

describe("Pipeline email Resend rate limiting", () => {
  it("uses Resend's retry-after response header when a request is rate limited", () => {
    expect(
      resendRateLimitRetryDelayMs(
        new Headers({ "retry-after": "1.25" }),
        0
      )
    ).toBe(1250);
  });

  it("falls back to a capped exponential retry delay when Resend omits retry headers", () => {
    expect(resendRateLimitRetryDelayMs(new Headers(), 0)).toBe(500);
    expect(resendRateLimitRetryDelayMs(new Headers(), 4)).toBe(5000);
  });

  it("retries a rate-limited Pipeline email instead of recording it as failed", async () => {
    ENV.resendApiKey = "test-resend-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ name: "rate_limit_exceeded" }), {
          status: 429,
          headers: { "retry-after": "0" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "email-after-retry" }), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendViaResend({
        to: "lead@example.com",
        replyTo: "agent@savvy.realty",
        subject: "Property update",
        html: "<p>Property update</p>",
        text: "Property update",
      })
    ).resolves.toEqual({ success: true, messageId: "email-after-retry" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" })
    );
  });
});
