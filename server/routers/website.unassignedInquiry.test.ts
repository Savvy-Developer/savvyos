import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const email = vi.hoisted(() => ({
  recipients: vi.fn(async (_type: string, defaults: Array<{ name?: string; email: string }>) => defaults),
  send: vi.fn(async () => ({ sent: true, skipped: false })),
}));

vi.mock("../db", () => ({ getDb: vi.fn(), logActivity: vi.fn() }));
vi.mock("./permissions", () => ({ canAdminUsePermission: vi.fn() }));
vi.mock("../_core/resendEmail", async importOriginal => ({
  ...(await importOriginal<typeof import("../_core/resendEmail")>()),
  resolveNotificationRecipients: email.recipients,
  sendTransactionalEmail: email.send,
}));

import {
  UNASSIGNED_INQUIRY_DEFAULT_RECIPIENTS,
  alertOfficeOfUnassignedInquiry,
  websiteInquiryLabel,
} from "./website";

const seller = {
  websiteLeadId: 88,
  contactId: 4321,
  contactName: "Sam Seller",
  contactEmail: "sam@example.com",
  contactPhone: "828-555-0101",
  intent: "sell",
  requestType: null,
  message: "Address: 1 Main St\nTimeline: In the next 3 months",
  propertyAddress: null,
};

beforeEach(() => {
  email.recipients.mockClear();
  email.send.mockClear();
});

describe("the form a website inquiry came from", () => {
  it("names each form the office can receive", () => {
    expect(websiteInquiryLabel("sell", null)).toBe("Seller inquiry (Sell page)");
    expect(websiteInquiryLabel("general", null)).toBe("Contact form");
    expect(websiteInquiryLabel("buy", undefined)).toBe("Buyer inquiry");
    expect(websiteInquiryLabel("property", "analysis")).toBe("Deeper analysis request");
    expect(websiteInquiryLabel("something-new", null)).toBe("Website inquiry");
  });
});

describe("emailing the office about an inquiry with no agent", () => {
  it("goes to Tyler by default, as the old site's lead email did", async () => {
    alertOfficeOfUnassignedInquiry(seller);
    await vi.waitFor(() => expect(email.send).toHaveBeenCalledTimes(1));
    expect(email.recipients).toHaveBeenCalledWith("website_inquiry_unassigned", UNASSIGNED_INQUIRY_DEFAULT_RECIPIENTS);
    expect(UNASSIGNED_INQUIRY_DEFAULT_RECIPIENTS).toEqual([{ name: "Tyler", email: "tyler@savvy.realty" }]);
    const [type, context, options] = email.send.mock.calls[0] as any[];
    expect(type).toBe("website_inquiry_unassigned");
    expect(context).toMatchObject({
      recipientEmail: "tyler@savvy.realty",
      contactId: "4321",
      contactName: "Sam Seller",
      contactEmail: "sam@example.com",
      contactPhone: "828-555-0101",
      leadSourceLabel: "Seller inquiry (Sell page)",
      notes: seller.message,
    });
    expect(options).toMatchObject({
      injectMagicLinks: false,
      allowTemplateOverride: false,
      idempotencyKey: "savvyos-website-unassigned:88:tyler@savvy.realty",
    });
  });

  it("sends to every address saved for it in Email Notifications", async () => {
    email.recipients.mockResolvedValueOnce([
      { name: "a@savvy.realty", email: "a@savvy.realty" },
      { name: "b@savvy.realty", email: "b@savvy.realty" },
    ]);
    alertOfficeOfUnassignedInquiry(seller);
    await vi.waitFor(() => expect(email.send).toHaveBeenCalledTimes(2));
    expect((email.send.mock.calls as any[]).map(call => call[1].recipientEmail)).toEqual([
      "a@savvy.realty",
      "b@savvy.realty",
    ]);
    // No recipient ever gets a sign-in link, like the agent handoff email.
    expect((email.send.mock.calls as any[]).map(call => call[2].injectMagicLinks)).toEqual([false, false]);
  });

  it("never throws into the visitor's form", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    email.recipients.mockRejectedValueOnce(new Error("db down"));
    expect(() => alertOfficeOfUnassignedInquiry(seller)).not.toThrow();
    await vi.waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(email.send).not.toHaveBeenCalled();
  });
});

describe("where it is wired in", () => {
  const source = readFileSync(path.resolve(import.meta.dirname, "website.ts"), "utf8");
  const submitLead = source.slice(
    source.indexOf("submitLead: publicProcedure"),
    source.indexOf("adminOverview: protectedProcedure")
  );

  it("emails the office only when no agent was found for the inquiry", () => {
    const agentBranch = submitLead.indexOf("if (contactId && agentId) {");
    const officeBranch = submitLead.indexOf("} else if (contactId) {\n        alertOfficeOfUnassignedInquiry({");
    expect(agentBranch).toBeGreaterThan(-1);
    expect(officeBranch).toBeGreaterThan(agentBranch);
    expect(submitLead.match(/alertOfficeOfUnassignedInquiry\(/g)).toHaveLength(1);
  });
});
