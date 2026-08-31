import { describe, expect, it } from "vitest";
import { __testables__ } from "./releaseNotificationRoute";

describe("release notification route authorization", () => {
  it("accepts an exact shared secret", () => {
    expect(__testables__.secretsMatch("trusted-secret", "trusted-secret")).toBe(
      true
    );
  });

  it("rejects missing, mismatched, and length-mismatched secrets", () => {
    expect(__testables__.secretsMatch(undefined, "trusted-secret")).toBe(false);
    expect(__testables__.secretsMatch("other-secret", "trusted-secret")).toBe(
      false
    );
    expect(__testables__.secretsMatch("trusted", "trusted-secret")).toBe(false);
  });
});
