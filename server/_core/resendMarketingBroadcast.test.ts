import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOneTimeBroadcastCsv,
  createResendBroadcast,
  createResendContactImport,
  createResendSegment,
  renderOneTimeBroadcastEmail,
  renderOneTimeBroadcastMergeTags,
} from "./resendMarketingBroadcast";

const originalResendKey = process.env.RESEND_API_KEY;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalResendKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalResendKey;
});

describe("One Time Email Resend Broadcast preparation", () => {
  it("creates CSV that preserves quoted contact data", () => {
    expect(
      buildOneTimeBroadcastCsv([
        {
          email: "lead@example.com",
          firstName: 'Jane "JJ"',
          lastName: "Doe",
          leadSource: "Referral, past client",
        },
      ])
    ).toBe(
      'Email,First Name,Last Name,Savvy Lead Source\n"lead@example.com","Jane ""JJ""","Doe","Referral, past client"\n'
    );
  });

  it("converts Savvy merge tags to recipient-specific Broadcast fields", () => {
    expect(
      renderOneTimeBroadcastMergeTags(
        "Hi {{first_name}} {{last_name}} ({{full_name}}) from {{lead_source}} — {{agent_name}} {{property}}"
      )
    ).toBe(
      "Hi {{{contact.first_name|there}}} {{{contact.last_name|}}} ({{{contact.first_name|there}}} {{{contact.last_name|}}}) from {{{savvy_lead_source|}}} — Your Agent "
    );
  });

  it("uses the Resend unsubscribe placeholder in the branded email shell", () => {
    const rendered = renderOneTimeBroadcastEmail({
      subject: "Welcome, {{first_name}}",
      body: "Hello {{lead_source}}!",
    });

    expect(rendered.subject).toBe("Welcome, {{{contact.first_name|there}}}");
    expect(rendered.html).toContain("Hello {{{savvy_lead_source|}}}!");
    expect(rendered.html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    expect(rendered.text).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
  });

  it("calls Resend Marketing endpoints with a campaign-specific Segment and contact import", async () => {
    process.env.RESEND_API_KEY = "test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "segment-123" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "import-123" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "broadcast-123" }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createResendSegment("One Time Email #12")).resolves.toEqual({
      success: true,
      data: { id: "segment-123" },
    });
    await expect(
      createResendContactImport({
        csv: "Email\ncontact@example.com\n",
        segmentId: "segment-123",
      })
    ).resolves.toEqual({ success: true, data: { id: "import-123" } });
    await expect(
      createResendBroadcast({
        name: "One Time Email #12",
        segmentId: "segment-123",
        subject: "Hello",
        html: "<p>Hello</p>",
        text: "Hello",
      })
    ).resolves.toEqual({ success: true, data: { id: "broadcast-123" } });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.resend.com/segments",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
        body: JSON.stringify({ name: "One Time Email #12" }),
      })
    );
    const importCall = fetchMock.mock.calls[1];
    expect(importCall[0]).toBe("https://api.resend.com/contacts/imports");
    const importForm = (importCall[1] as RequestInit).body as FormData;
    expect(importForm.get("on_conflict")).toBe("upsert");
    expect(importForm.get("segments")).toBe(
      JSON.stringify([{ id: "segment-123" }])
    );
    expect(importForm.get("column_map")).toContain("savvy_lead_source");
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.resend.com/broadcasts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "One Time Email #12",
          segment_id: "segment-123",
          from: "Savvy STR Agents <hello@savvy-agents.com>",
          subject: "Hello",
          html: "<p>Hello</p>",
          text: "Hello",
        }),
      })
    );
  });
});
