import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Merge Tag Renderer ───────────────────────────────────────────────────────
import { renderMergeTags } from "./_core/smartPlanMergeTags";

describe("renderMergeTags", () => {
  it("replaces {{first_name}}", () => {
    expect(renderMergeTags("Hi {{first_name}}!", { firstName: "Tyler" })).toBe("Hi Tyler!");
  });

  it("replaces {{last_name}}", () => {
    expect(renderMergeTags("Hello {{last_name}}", { lastName: "Smith" })).toBe("Hello Smith");
  });

  it("replaces {{full_name}}", () => {
    expect(renderMergeTags("Dear {{full_name}}", { firstName: "Tyler", lastName: "Smith" })).toBe("Dear Tyler Smith");
  });

  it("replaces {{agent_name}}", () => {
    expect(renderMergeTags("Your agent is {{agent_name}}", { agentName: "Jane Doe" })).toBe(
      "Your agent is Jane Doe"
    );
  });

  it("replaces {{lead_source}}", () => {
    expect(renderMergeTags("Source: {{lead_source}}", { leadSource: "Zillow" })).toBe("Source: Zillow");
  });

  it("uses fallback 'there' when first_name is null", () => {
    expect(renderMergeTags("Hi {{first_name}}!", { firstName: null })).toBe("Hi there!");
  });

  it("uses fallback 'Your Agent' when agent_name is null", () => {
    expect(renderMergeTags("Contact {{agent_name}}", { agentName: null })).toBe("Contact Your Agent");
  });

  it("handles multiple tags in one template", () => {
    const result = renderMergeTags(
      "Hi {{first_name}}, this is {{agent_name}} from {{lead_source}}.",
      { firstName: "Tyler", agentName: "Jane", leadSource: "Zillow" }
    );
    expect(result).toBe("Hi Tyler, this is Jane from Zillow.");
  });

  it("is case-insensitive for tag names", () => {
    expect(renderMergeTags("Hi {{FIRST_NAME}}!", { firstName: "Tyler" })).toBe("Hi Tyler!");
  });
});

// ─── Aircall Helper ───────────────────────────────────────────────────────────
describe("sendAircallSMS", () => {
  it("returns error when not configured", async () => {
    // Ensure env vars are not set
    delete process.env.AIRCALL_API_ID;
    delete process.env.AIRCALL_API_TOKEN;
    delete process.env.AIRCALL_NUMBER_ID;

    const { sendAircallSMS } = await import("./_core/aircall");
    const result = await sendAircallSMS("+15551234567", "Test message");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not configured");
  });
});

// ─── isAircallConfigured ──────────────────────────────────────────────────────
describe("isAircallConfigured", () => {
  it("returns false when env vars are missing", async () => {
    delete process.env.AIRCALL_API_ID;
    delete process.env.AIRCALL_API_TOKEN;
    delete process.env.AIRCALL_NUMBER_ID;

    const { isAircallConfigured } = await import("./_core/aircall");
    expect(isAircallConfigured()).toBe(false);
  });

  it("returns true when all env vars are set", async () => {
    process.env.AIRCALL_API_ID = "test_id";
    process.env.AIRCALL_API_TOKEN = "test_token";
    process.env.AIRCALL_NUMBER_ID = "123456";

    // Re-import to pick up new env
    vi.resetModules();
    const { isAircallConfigured } = await import("./_core/aircall");
    expect(isAircallConfigured()).toBe(true);

    // Cleanup
    delete process.env.AIRCALL_API_ID;
    delete process.env.AIRCALL_API_TOKEN;
    delete process.env.AIRCALL_NUMBER_ID;
  });
});
