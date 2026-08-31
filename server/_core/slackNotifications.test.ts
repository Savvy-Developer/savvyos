import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("./env", () => ({
  ENV: {
    slackSavvyosPromptQueueWebhookUrl: "https://hooks.slack.com/services/test",
  },
}));

import {
  __testables__,
  notifySavvyOSFeatureUpdate,
} from "./slackNotifications";

afterEach(() => {
  fetchMock.mockReset();
});

describe("SavvyOS Slack Feature Update notifications", () => {
  it("escapes Slack markup and prevents broadcast mentions", () => {
    expect(
      __testables__.sanitizeForSlack("Improve <reports> & alert @channel")
    ).toBe("Improve &lt;reports&gt; &amp; alert @\u200bchannel");
  });

  it("converts only approved SavvyOS action paths into links", () => {
    expect(__testables__.toSavvyOSUrl("/daily-report")).toBe(
      "https://os.savvy-agents.com/daily-report"
    );
    expect(
      __testables__.toSavvyOSUrl("https://os.savvy-agents.com/tasks")
    ).toBe("https://os.savvy-agents.com/tasks");
    expect(__testables__.toSavvyOSUrl("https://example.com")).toBeNull();
  });

  it("posts a concise published Feature Update with the in-app action", async () => {
    fetchMock.mockResolvedValue({ ok: true });

    await expect(
      notifySavvyOSFeatureUpdate({
        event: "published",
        title: "Hot Leads now shows email engagement",
        summary: "Prioritize leads using recent delivery and reply signals.",
        details: "Review the engagement column before starting outreach.",
        actionUrl: "/hot-leads",
      })
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/test",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: [
            ":mega: *SavvyOS Feature Update published*",
            "*Hot Leads now shows email engagement*",
            "Prioritize leads using recent delivery and reply signals.",
            "Details: Review the engagement column before starting outreach.",
            "<https://os.savvy-agents.com/hot-leads|Open in SavvyOS>",
          ].join("\n"),
        }),
      }
    );
  });

  it("returns false rather than blocking an update when Slack rejects the request", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "error",
    });

    await expect(
      notifySavvyOSFeatureUpdate({
        event: "revised",
        title: "Reports",
        summary: "A revision.",
      })
    ).resolves.toBe(false);
  });
});
