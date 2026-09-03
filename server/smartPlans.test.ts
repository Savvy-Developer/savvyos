import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Merge Tag Renderer ───────────────────────────────────────────────────────
import { renderMergeTags } from "./_core/smartPlanMergeTags";
import {
  isDoNotContact,
  dateAddedFilterBounds,
  oneTimeRecipientScheduledAt,
  shouldBypassInitialSendWindow,
  smsMarketingEligibility,
} from "./smartPlanScheduler";
import { directionFromAircallMessageEvent, messageParticipantNumber } from "./aircallMessaging";

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

  it("replaces {{property}}", () => {
    expect(renderMergeTags("Property: {{property}}", { propertyAddress: "184 Hyland Dr, East Stroudsburg, PA" })).toBe("Property: 184 Hyland Dr, East Stroudsburg, PA");
  });

  it("supports {{firstname}} as a first-name alias", () => {
    expect(renderMergeTags("Hi {{firstname}}!", { firstName: "Tyler" })).toBe("Hi Tyler!");
  });

  it("clears {{property}} when a plan has no supplied property", () => {
    expect(renderMergeTags("Property: {{property}}", {})).toBe("Property: ");
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

describe("Smart Plan SMS eligibility", () => {
  it("allows a source-authorized lead without a separate consent field", () => {
    expect(smsMarketingEligibility({ smsMarketingOptedOutAt: null })).toEqual({ eligible: true });
  });

  it("blocks texts after an explicit SMS opt-out", () => {
    expect(smsMarketingEligibility({ smsMarketingOptedOutAt: new Date() })).toEqual({
      eligible: false,
      error: "Contact opted out of marketing texts",
    });
  });
});

describe("Smart Plan Do Not Contact guard", () => {
  it("stops every Smart Plan channel for a Do Not Contact contact", () => {
    expect(isDoNotContact({ doNotContact: true, isaStatus: null })).toBe(true);
    expect(isDoNotContact({ doNotContact: false, isaStatus: "do_not_contact" })).toBe(true);
  });

  it("does not treat a normal contact as Do Not Contact", () => {
    expect(isDoNotContact({ doNotContact: false, isaStatus: "new_lead" })).toBe(false);
  });
});

describe("Smart Plan immediate restart window override", () => {
  it("bypasses the window only for the explicitly restarted first step", () => {
    expect(shouldBypassInitialSendWindow({ currentStepIndex: 0, bypassInitialSendWindow: true })).toBe(true);
    expect(shouldBypassInitialSendWindow({ currentStepIndex: 1, bypassInitialSendWindow: true })).toBe(false);
    expect(shouldBypassInitialSendWindow({ currentStepIndex: 0, bypassInitialSendWindow: false })).toBe(false);
  });
});

describe("One-time send schedules", () => {
  const campaignStartAt = new Date("2030-01-01T12:00:00.000Z");

  it("keeps every recipient at the campaign start when staggering is disabled", () => {
    expect(oneTimeRecipientScheduledAt(campaignStartAt, 14, null)).toEqual(
      campaignStartAt
    );
  });

  it("places recipients into consecutive hourly delivery batches", () => {
    expect(
      oneTimeRecipientScheduledAt(campaignStartAt, 0, 100).toISOString()
    ).toBe("2030-01-01T12:00:00.000Z");
    expect(
      oneTimeRecipientScheduledAt(campaignStartAt, 99, 100).toISOString()
    ).toBe("2030-01-01T12:00:00.000Z");
    expect(
      oneTimeRecipientScheduledAt(campaignStartAt, 100, 100).toISOString()
    ).toBe("2030-01-01T13:00:00.000Z");
  });
});

describe("One-time send date-added filters", () => {
  it("uses an inclusive start and the day after the end as the exclusive bound", () => {
    const bounds = dateAddedFilterBounds({
      dateAddedFrom: "2030-02-01",
      dateAddedTo: "2030-02-28",
    });

    expect(bounds.from?.toISOString()).toBe("2030-02-01T00:00:00.000Z");
    expect(bounds.before?.toISOString()).toBe("2030-03-01T00:00:00.000Z");
  });

  it("permits a one-sided date-added bound", () => {
    expect(dateAddedFilterBounds({ dateAddedFrom: "2030-02-01" })).toMatchObject({
      from: new Date("2030-02-01T00:00:00.000Z"),
      before: undefined,
    });
  });
});

describe("Aircall message directions", () => {
  it("uses the webhook event and external sender number for an inbound reply", () => {
    expect(directionFromAircallMessageEvent("message.received")).toBe("inbound");
    expect(directionFromAircallMessageEvent("message.sent")).toBe("outbound");
    expect(directionFromAircallMessageEvent("message.status_updated")).toBeUndefined();
    expect(messageParticipantNumber({ external_number: "+1 818 689 0141" })).toBe("+18186890141");
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
