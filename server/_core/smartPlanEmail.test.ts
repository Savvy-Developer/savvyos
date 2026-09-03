import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  process.env.JWT_SECRET = "smart-plan-email-test-secret";
  process.env.RESEND_API_KEY = "test-resend-key";
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ id: "email_test_123" }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
});

describe("Smart Plan campaign email", () => {
  it("sends a working recipient-specific unsubscribe URL in HTML, text, and headers", async () => {
    const { sendSmartPlanEmail } = await import("./smartPlanEmail");

    await expect(
      sendSmartPlanEmail({
        to: "client@example.com",
        subject: "Campaign update",
        body: "<p>Hello client</p>",
        isHtml: true,
      })
    ).resolves.toEqual({ success: true, messageId: "email_test_123" });

    const request = fetchMock.mock.calls[0];
    expect(request?.[0]).toBe("https://api.resend.com/emails");
    const payload = JSON.parse(request?.[1]?.body);
    const unsubscribeUrl = payload.headers["List-Unsubscribe"].slice(1, -1);

    expect(unsubscribeUrl).toMatch(
      /^https:\/\/os\.savvy-agents\.com\/api\/unsubscribe\?token=/
    );
    expect(payload.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click"
    );
    expect(payload.html).toContain(`href="${unsubscribeUrl}"`);
    expect(payload.html).not.toContain("{{UNSUBSCRIBE_URL}}");
    expect(payload.text).toContain(`To unsubscribe, visit: ${unsubscribeUrl}`);
  });
});
