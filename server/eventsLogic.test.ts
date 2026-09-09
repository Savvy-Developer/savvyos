import { describe, expect, it } from "vitest";
import {
  calculateHeadcount,
  extractSwoogoEventId,
  matchSwoogoType,
  resolveSwoogoWebhookType,
  staticWebhookTokenMatches,
} from "./eventsLogic";

describe("Events domain safeguards", () => {
  it("refuses to compute a headcount with an uncounted component", () => {
    expect(
      calculateHeadcount([
        { count: 43, sourceType: "Swoogo: Agent" },
        { count: null, sourceType: "Swoogo: Staff" },
      ])
    ).toEqual({ total: null, missing: 1 });
  });

  it("computes a fully-counted component total", () => {
    expect(
      calculateHeadcount([
        { count: 43, sourceType: "Swoogo: Agent" },
        { count: 8, sourceType: "Swoogo: Staff" },
        { count: 3, sourceType: "Manual" },
      ])
    ).toEqual({ total: 54, missing: 0 });
  });

  it("matches approved Swoogo types without hardcoding a provider default", () => {
    expect(matchSwoogoType("Agent", ["Agent", "Speaker", "Sponsor Rep"])).toBe(
      "Agent"
    );
    expect(matchSwoogoType("sponsor", ["Agent", "Sponsor Rep"])).toBe(
      "Sponsor Rep"
    );
    expect(matchSwoogoType("Guest", ["Agent", "Speaker"])).toBeNull();
  });

  it("extracts provider event IDs from supported webhook envelope shapes", () => {
    expect(extractSwoogoEventId({ event_id: 88 })).toBe("88");
    expect(extractSwoogoEventId({ data: { eventId: "SW-89104" } })).toBe(
      "SW-89104"
    );
    expect(extractSwoogoEventId({ data: {} })).toBeNull();
  });

  it("normalizes webhook event labels", () => {
    expect(resolveSwoogoWebhookType({ type: "Registrant.Updated" })).toBe(
      "registrant.updated"
    );
    expect(resolveSwoogoWebhookType({})).toBe("registrant");
  });

  it("requires an exact configured static webhook secret", () => {
    expect(staticWebhookTokenMatches("shared-token", "shared-token")).toBe(
      true
    );
    expect(staticWebhookTokenMatches("wrong", "shared-token")).toBe(false);
    expect(staticWebhookTokenMatches(undefined, "shared-token")).toBe(false);
    expect(staticWebhookTokenMatches("shared-token", undefined)).toBe(false);
  });
});
