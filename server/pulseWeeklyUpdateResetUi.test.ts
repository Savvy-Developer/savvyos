import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const personal = read("server/pulse/personal.ts");
const l10 = read("server/pulse/l10.ts");
const meetingViews = read("server/pulse/meetingViews.ts");
const sharedSections = read("server/pulse/sections/shared.ts");
const myEos = read("client/src/pages/PulseMyWorkPage.tsx");
const preparation = read("client/src/components/pulse/PulseWeeklyPreparation.tsx");
const measurables = read("client/src/components/pulse/PulseMyMeasurables.tsx");
const masterScorecard = read("client/src/components/pulse/PulseMasterScorecard.tsx");

describe("Pulse weekly meeting update reset", () => {
  it("uses the same Saturday-start cycle for preparation drafts and submissions", () => {
    expect(personal).toContain(
      'import { pulseWeeklyCycle, pulseWeeklyCycleStart } from "../../shared/pulseWeeklyCycle";'
    );
    expect(personal).toContain(
      "const week = (reference = new Date()) => pulseWeeklyCycleStart(reference);"
    );
    expect(personal).toContain("return pulseWeeklyCycle(reference);");
  });

  it("shows only current-cycle Segues, Headlines, and Briefs in meeting workspaces", () => {
    expect(l10).toContain("const weekOf = pulseWeeklyCycleStart();");
    expect(l10).toContain("eq(pulseMeetingUpdates.weekOf, weekOf)");
    expect(sharedSections).toContain("eq(pulseMeetingUpdates.weekOf, weekOf)");
  });

  it("stamps every interactive meeting update with the active cycle", () => {
    expect(l10).toContain("weekOf: pulseWeeklyCycleStart()");
    expect(meetingViews).toContain("weekOf: pulseWeeklyCycleStart()");
  });

  it("refreshes active Pulse views promptly after the Saturday boundary", () => {
    expect(myEos).toContain("refetchInterval: 15_000");
    expect(preparation).toContain("inputs.useQuery(undefined, { refetchInterval: 15_000 })");
    expect(measurables).toContain("inputs.useQuery(undefined, { refetchInterval: 15_000 })");
    expect(masterScorecard).toContain("}, { refetchInterval: 15_000 });");
  });
});
