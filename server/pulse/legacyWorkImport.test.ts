import { describe, expect, it } from "vitest";
import {
  isLegacyPulseImportSourceKey,
  legacyPulseImportMarker,
  withLegacyPulseImportProvenance,
} from "./legacyWorkImport";

describe("legacy Pulse work import provenance", () => {
  const source = {
    sourceKey: "pulse-open-l10-work-export-2026-09-28:todo:5250005:agent-success-l10",
    legacyId: "5250005",
    sourceMeetingName: "Agent Success L10",
    sourceOwnerName: "Hunter Webb",
  };

  it("adds a durable, searchable source marker without replacing the imported notes", () => {
    const description = withLegacyPulseImportProvenance("<p>Need to launch cohorts.</p>", source);

    expect(description).toContain("Need to launch cohorts.");
    expect(description).toContain(legacyPulseImportMarker(source.sourceKey));
    expect(description).toContain("Legacy Pulse Export ID: 5250005");
    expect(description).toContain("Source meeting: Agent Success L10");
    expect(description).toContain("Legacy owner: Hunter Webb");
  });

  it("records an unresolved source owner without inventing an assignment", () => {
    const description = withLegacyPulseImportProvenance(null, { ...source, sourceOwnerName: null });

    expect(description).toContain("Legacy owner: unresolved");
  });

  it("accepts only the scoped September 2026 import keys", () => {
    expect(isLegacyPulseImportSourceKey(source.sourceKey)).toBe(true);
    expect(isLegacyPulseImportSourceKey("pulse-open-l10-work-export-2026-09-28:issue:6510016:isa-l10")).toBe(true);
    expect(isLegacyPulseImportSourceKey("pulse-open-l10-work-export-2026-09-29:todo:1:x")).toBe(false);
    expect(isLegacyPulseImportSourceKey("arbitrary-import-key")).toBe(false);
  });
});
