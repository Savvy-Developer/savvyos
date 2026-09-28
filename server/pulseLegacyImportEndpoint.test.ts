import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workItems = readFileSync(path.resolve(import.meta.dirname, "pulse/workItems.ts"), "utf8");
const importStart = workItems.indexOf("importLegacyOpenL10Work:");
const importEnd = workItems.indexOf("  saveEditor:", importStart);
const legacyImport = workItems.slice(importStart, importEnd);

describe("Pulse legacy work import endpoint", () => {
  it("is limited to a Pulse L10 manager and approved source keys", () => {
    expect(importStart).toBeGreaterThan(-1);
    expect(legacyImport).toContain('requirePulseCapability(db, ctx.user, "manage_l10s")');
    expect(legacyImport).toContain("isLegacyPulseImportSourceKey(item.sourceKey)");
  });

  it("preserves ownership without creating Pulse membership or assignment notifications", () => {
    expect(legacyImport).toContain("assigneeId: resolvedAssigneeId");
    expect(legacyImport).toContain("membershipGranted: false");
    expect(legacyImport).toContain("notificationsSent: false");
    expect(legacyImport).not.toContain("pulseMeetingMembers");
    expect(legacyImport).not.toContain("requireMeetingMember");
    expect(legacyImport).not.toContain("pulseNotifications");
  });

  it("is idempotent through its persisted legacy source key", () => {
    expect(legacyImport).toContain("priorSourceKeys");
    expect(legacyImport).toContain("Legacy Pulse Export Key:");
    expect(legacyImport).toContain("skippedSourceKeys");
  });
});
