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

import { sendTransactionalEmail } from "./resendEmail";

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
