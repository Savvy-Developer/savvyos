import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("./env", () => ({
  ENV: {
    slackSavvyosPromptQueueWebhookUrl: "https://hooks.slack.com/services/test",
  },
}));

vi.mock("./llm", () => ({ invokeLLM: vi.fn() }));

import {
  __testables__,
  notifySavvyOSFeatureUpdate,
  notifySavvyOSRelease,
} from "./slackNotifications";
import { invokeLLM } from "./llm";

const invokeLlmMock = vi.mocked(invokeLLM);

afterEach(() => {
  fetchMock.mockReset();
  invokeLlmMock.mockReset();
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

  it("uses the release material only as private source context", () => {
    const prompt = __testables__.buildReleaseSummaryPrompt({
      commitMessage: "feat: streamline sharing",
      changedFiles: ["server/routers/sharing.ts"],
      diff: "+ agents can share client lists with their support team",
    });
    expect(prompt).toContain("feat: streamline sharing");
    expect(prompt).toContain("server/routers/sharing.ts");
    expect(prompt).toContain(
      "Never mention commits, GitHub, source code, file paths"
    );
    expect(__testables__.fallbackReleaseSummary().whatChanged).toContain(
      "behind-the-scenes improvements"
    );
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
            ":mega: *Savvy OS has just been updated!*",
            "*Hot Leads now shows email engagement*",
            "Prioritize leads using recent delivery and reply signals.",
            "Review the engagement column before starting outreach.",
            "<https://os.savvy-agents.com/hot-leads|Open in SavvyOS>",
          ].join("\n"),
        }),
      }
    );
  });

  it("posts a useful release summary without exposing the technical source material", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    invokeLlmMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              audience: "Admins, agents, and ISAs",
              whatChanged:
                "You can now share contact context with the right teammate more easily.",
              whyItMatters:
                "It keeps handoffs clear and helps everyone work from the same client information.",
              additionalImpact:
                "Existing contact records and sharing workflows remain available.",
            }),
          },
        },
      ],
    } as any);

    await expect(
      notifySavvyOSRelease({
        commitMessage: "feat: streamline sharing and contact attribution",
        changedFiles: ["server/routers/contacts.ts"],
        diff: "+ internal implementation details",
      })
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/test",
      expect.objectContaining({
        body: JSON.stringify({
          text: [
            ":mega: *Savvy OS has just been updated!*",
            "*Who this helps:* Admins, agents, and ISAs",
            "*What's new:* You can now share contact context with the right teammate more easily.",
            "*Why it matters:* It keeps handoffs clear and helps everyone work from the same client information.",
            "*Also affects:* Existing contact records and sharing workflows remain available.",
          ].join("\n"),
        }),
      })
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
