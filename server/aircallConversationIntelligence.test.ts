import { describe, expect, it } from "vitest";
import {
  formatAircallTranscript,
  withAircallSummary,
} from "./aircallConversationIntelligence";
import { asAircallConversationIntelligenceWebhook } from "./aircallReliability";

describe("Aircall conversation intelligence formatting", () => {
  it("formats final Aircall utterances with speakers and timestamps", () => {
    const transcript = formatAircallTranscript([
      { start_time: 2.4, participant_type: "internal", text: "Hi, this is Jordan." },
      { start_time: 65.8, participant_type: "external", text: "I want to learn more." },
      { start_time: 70, participant_type: "internal", text: "   " },
    ]);

    expect(transcript).toBe("[00:02] Agent: Hi, this is Jordan.\n[01:05] Contact: I want to learn more.");
  });

  it("returns null when Aircall provides no usable utterances", () => {
    expect(formatAircallTranscript([{ participant_type: "external", text: "   " }])).toBeNull();
    expect(formatAircallTranscript(undefined)).toBeNull();
  });

  it("replaces generated summaries without modifying call metadata", () => {
    const body = "Outbound call — Completed\nDuration: 3m 10s\n\nAI Summary:\nOld summary";
    expect(withAircallSummary(body, "Aircall's native summary.")).toBe(
      "Outbound call — Completed\nDuration: 3m 10s\n\nAircall Summary:\nAircall's native summary.",
    );
  });
});

describe("Aircall conversation intelligence webhook validation", () => {
  it("accepts a standard summary webhook that identifies the related call", () => {
    const payload = asAircallConversationIntelligenceWebhook({
      resource: "conversation_intelligence",
      event: "summary.created",
      timestamp: 1779960465,
      token: "webhook-token",
      data: {
        id: "81330225",
        call_id: "3811606146",
        content: "A native Aircall call summary.",
      },
    });

    expect(payload?.event).toBe("summary.created");
    expect(payload?.data.call_id).toBe("3811606146");
  });

  it("accepts live transcript webhooks and rejects events without a call ID", () => {
    expect(asAircallConversationIntelligenceWebhook({
      resource: "conversation_intelligence",
      event: "realtime_transcription.utterances_received",
      timestamp: 1779960465,
      data: { call_id: 3811606146, content: { utterances: [] } },
    })?.event).toBe("realtime_transcription.utterances_received");

    expect(asAircallConversationIntelligenceWebhook({
      resource: "conversation_intelligence",
      event: "transcription.created",
      timestamp: 1779960465,
      data: { id: 1 },
    })).toBeNull();
  });
});
