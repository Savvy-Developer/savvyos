import { describe, expect, it } from "vitest";
import { getPulseNavDestinations } from "../../shared/pulseNav";

describe("getPulseNavDestinations", () => {
  it("keeps the top-level Pulse navigation focused on My EOS and allowed settings", () => {
    expect(getPulseNavDestinations({ canSeeSettings: true })).toEqual([
      { label: "My EOS Dashboard", path: "/pulse/dashboard" },
      { label: "Settings", path: "/pulse/settings" },
    ]);
  });

  it("does not expose a separate meetings-index destination", () => {
    const destinations = getPulseNavDestinations({
      canSeeSettings: false,
      meetings: [{ id: "meeting-1", name: "Leadership L10" }],
    });
    expect(destinations).toEqual([
      { label: "My EOS Dashboard", path: "/pulse/dashboard" },
    ]);
    expect(destinations.some(destination => destination.path === "/pulse/meetings")).toBe(false);
  });
});
