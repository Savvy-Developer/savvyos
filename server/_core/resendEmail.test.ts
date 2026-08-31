import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb, mockSend } = vi.hoisted(() => {
  process.env.RESEND_API_KEY = "test-resend-key";
  return {
    mockGetDb: vi.fn(),
    mockSend: vi.fn(),
  };
});

vi.mock("../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));

import { getEmailPreview, sendTransactionalEmail } from "./resendEmail";

describe("listing created email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockResolvedValue(null);
    mockSend.mockResolvedValue({ data: { id: "email_123" }, error: null });
  });

  it("includes the seller and full property address in the subject and message", async () => {
    await sendTransactionalEmail("listing_created", {
      recipientEmail: "agent@example.com",
      recipientName: "Alex Agent",
      contactName: "Jamie Seller",
      listingAddress: "123 Main St, Austin, TX",
    }, {
      allowTemplateOverride: false,
      bypassNotificationSetting: true,
      injectMagicLinks: false,
    });

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      subject: "New Listing Created — Jamie Seller — 123 Main St, Austin, TX",
      html: expect.stringContaining("Seller</strong>&nbsp;&nbsp; Jamie Seller"),
    }), undefined);
    expect(mockSend.mock.calls[0][0].html).toContain("Property</strong>&nbsp;&nbsp; 123 Main St, Austin, TX");
  });

  it("escapes seller and property values in the HTML email", async () => {
    await sendTransactionalEmail("listing_created", {
      recipientEmail: "agent@example.com",
      contactName: "Jamie & Jordan",
      listingAddress: "15 <Main> St",
    }, {
      allowTemplateOverride: false,
      bypassNotificationSetting: true,
      injectMagicLinks: false,
    });

    expect(mockSend.mock.calls[0][0].html).toContain("Jamie &amp; Jordan");
    expect(mockSend.mock.calls[0][0].html).toContain("15 &lt;Main&gt; St");
  });
});

describe("transaction created email", () => {
  it("includes the client, property address, and formatted purchase price", () => {
    const preview = getEmailPreview("transaction_created", {
      recipientEmail: "agent@example.com",
      recipientName: "Avery Agent",
      contactName: "Jamie Client",
      propertyAddress: "123 Main St, Austin, TX",
      amount: "$500,000",
    });

    expect(preview.html).toContain("Client</strong>&nbsp;&nbsp; Jamie Client");
    expect(preview.html).toContain("Property</strong>&nbsp;&nbsp; 123 Main St, Austin, TX");
    expect(preview.html).toContain("Purchase Price</strong>&nbsp;&nbsp; <span style=\"font-weight:700;color:#0fc0df;\">$500,000</span>");
  });

  it("escapes the client and property values before rendering", () => {
    const preview = getEmailPreview("transaction_created", {
      recipientEmail: "agent@example.com",
      contactName: "Jamie & Jordan",
      propertyAddress: "15 <Main> St",
      amount: "$500,000",
    });

    expect(preview.html).toContain("Jamie &amp; Jordan");
    expect(preview.html).toContain("15 &lt;Main&gt; St");
  });
});

describe("configured notification recipients", () => {
  it("replaces the default audience with the selected active users", async () => {
    mockSend.mockClear();
    const settingsQuery = {
      from: () => ({
        where: () => ({ limit: async () => [{ isEnabled: true, recipientUserIds: [7, 8] }] }),
      }),
    };
    const recipientsQuery = {
      from: () => ({
        where: async () => [
          { id: 7, name: "Taylor Admin", email: "taylor@example.com" },
          { id: 8, name: "Jordan ISA", email: "jordan@example.com" },
        ],
      }),
    };
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValueOnce(settingsQuery).mockReturnValueOnce(recipientsQuery),
    });

    await sendTransactionalEmail("listing_created", {
      recipientEmail: "default-agent@example.com",
      recipientName: "Default Agent",
      contactName: "Jamie Seller",
      listingAddress: "123 Main St",
    }, { allowTemplateOverride: false, injectMagicLinks: false });

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls.map(([message]) => message.to).sort()).toEqual([
      "jordan@example.com",
      "taylor@example.com",
    ]);
    expect(mockSend.mock.calls.every(([, options]) => String(options?.idempotencyKey).startsWith("recipient-override:listing_created:"))).toBe(true);
  });

  it("includes eligible users added after future-user enrollment is enabled", async () => {
    mockSend.mockClear();
    const settingsQuery = {
      from: () => ({
        where: () => ({
          limit: async () => [{
            isEnabled: true,
            recipientUserIds: [7],
            includeFutureUsers: true,
            futureUsersAfter: new Date("2026-08-29T20:00:00.000Z"),
          }],
        }),
      }),
    };
    const recipientsQuery = {
      from: () => ({
        where: async () => [
          { id: 7, name: "Selected Admin", email: "selected@example.com" },
          { id: 12, name: "New Agent", email: "new-user@example.com" },
        ],
      }),
    };
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValueOnce(settingsQuery).mockReturnValueOnce(recipientsQuery),
    });

    await sendTransactionalEmail(
      "listing_created",
      { recipientEmail: "default-agent@example.com", listingAddress: "123 Main St" },
      { allowTemplateOverride: false, injectMagicLinks: false }
    );

    expect(mockSend.mock.calls.map(([message]) => message.to).sort()).toEqual([
      "new-user@example.com",
      "selected@example.com",
    ]);
  });
});

describe("website property request handoff emails", () => {
  const context = {
    recipientEmail: "agent@example.com",
    recipientName: "Avery Agent",
    agentName: "Avery Agent",
    contactName: "Casey Client",
    propertyAddress: "123 Main St, Asheville, NC 28801",
    propertyUrl: "https://savvy-agents.com/properties/123-main-st-asheville-test",
    agentBookingLink: "https://calendly.com/avery-agent",
  };

  it.each([
    [
      "website_deeper_analysis_request",
      "Deeper Analysis Requested — 123 Main St, Asheville, NC 28801",
      "Hey <strong>Avery Agent</strong>, <strong>Casey Client</strong> has asked for a deeper analysis of",
      "Schedule a Call",
    ],
    [
      "website_financing_request",
      "Financing Information Requested — 123 Main St, Asheville, NC 28801",
      "Hey <strong>Avery Agent</strong>, <strong>Casey Client</strong> was looking for information regarding financing for this property:",
      "Schedule a Call",
    ],
    [
      "website_showing_request",
      "Showing Requested — 123 Main St, Asheville, NC 28801",
      "Hey <strong>Avery Agent</strong>, <strong>Casey Client</strong> just asked to book a showing for",
      "Schedule a Showing Call",
    ],
  ] as const)("renders the requested %s copy and booking CTA", (emailType, subject, message, cta) => {
    const preview = getEmailPreview(emailType, context);

    expect(preview.subject).toBe(subject);
    expect(preview.html).toContain(message);
    expect(preview.html).toContain(`href="${context.propertyUrl}"`);
    expect(preview.html).toContain("Website Client Handoff");
    expect(preview.html).not.toContain("Website Lead Handoff");
    expect(preview.html).not.toContain("Reply all to continue the conversation with your client.");
    expect(preview.html).toContain(`href="https://calendly.com/avery-agent"`);
    expect(preview.html).toContain(`>${cta}</a>`);
  });

  it("escapes client and property values before rendering the shared email", () => {
    const preview = getEmailPreview("website_deeper_analysis_request", {
      ...context,
      contactName: "Casey & Jordan",
      propertyAddress: "15 <Main> St",
    });

    expect(preview.html).toContain("Casey &amp; Jordan");
    expect(preview.html).toContain("15 &lt;Main&gt; St");
  });
});
