import { describe, expect, it } from "vitest";
import { isDmarcAggregateReport, normaliseReceivedEmailList, normaliseReceivedEmailListPage } from "./resendInbox";

describe("normaliseReceivedEmailList", () => {
  it("unwraps the Resend list envelope before callers iterate over it", () => {
    const emails = normaliseReceivedEmailList({
      object: "list",
      has_more: false,
      data: [
        { id: "received_1", from: "client@example.com", to: ["replies@savvy-agents.com"] },
      ],
    });

    expect(emails).toHaveLength(1);
    expect(emails[0]?.id).toBe("received_1");
  });

  it("preserves a direct array response and safely rejects malformed payloads", () => {
    expect(normaliseReceivedEmailList([{ id: "received_2" }])).toEqual([{ id: "received_2" }]);
    expect(normaliseReceivedEmailList({ object: "list", data: {} })).toEqual([]);
    expect(normaliseReceivedEmailList(null)).toEqual([]);
  });

  it("returns the final received-email ID as the next cursor when another page exists", () => {
    expect(normaliseReceivedEmailListPage({
      object: "list",
      has_more: true,
      data: [{ id: "received_101" }, { id: "received_100" }],
    })).toEqual({
      emails: [{ id: "received_101" }, { id: "received_100" }],
      hasMore: true,
      nextCursor: "received_100",
    });
  });
});

describe("isDmarcAggregateReport", () => {
  it("matches the DMARC aggregate reports currently delivered to the Savvy inbox", () => {
    expect(isDmarcAggregateReport({
      from: "noreply@dmarc.yahoo.com",
      subject: "Report Domain: savvy-agents.com Submitter: yahoo.com Report-ID: <123>",
    })).toBe(true);
    expect(isDmarcAggregateReport({
      from: "DMARC Reports <dmarc-noreply@google.com>",
      subject: "DMARC Aggregate Report",
    })).toBe(true);
    expect(isDmarcAggregateReport({
      from: "reports@fastmaildmarc.com",
      subject: "Report Domain: savvy-agents.com Submitter: fastmail.com Report-ID:2026.08.30.2132938039",
    })).toBe(true);
  });

  it("does not hide ordinary messages that only mention DMARC", () => {
    expect(isDmarcAggregateReport({ from: "client@example.com", subject: "Question about our DMARC policy" })).toBe(false);
    expect(isDmarcAggregateReport({ from: "noreply@dmarc.yahoo.com", subject: "Welcome to Yahoo Mail" })).toBe(false);
  });
});
