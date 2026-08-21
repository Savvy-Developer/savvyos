import { describe, expect, it } from "vitest";
import { normaliseReceivedEmailList } from "./resendInbox";

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
});
