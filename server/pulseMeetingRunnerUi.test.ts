import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const runner = read("client/src/pages/PulseMeetingRunPage.tsx");
const styles = read("client/src/index.css");

describe("Pulse Meeting Runner workspace", () => {
  it("renders incoming cascades as an actionable agenda step", () => {
    expect(runner).toContain('step === "cascades" ? <CascadesStep');
    expect(runner).toContain("PulseCascadeCard");
    expect(runner).toContain('from: "meeting_runner"');
  });

  it("uses a full-width, full-height work surface", () => {
    expect(runner).toContain(
      'className="flex w-full flex-wrap items-center justify-between gap-3"'
    );
    expect(runner).toContain("lg:min-h-[calc(100dvh-19rem)]");
    expect(styles).toMatch(/\.pulse-runner-content\s*\{[^}]*max-width: none;/s);
  });
});
