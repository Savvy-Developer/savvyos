import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const myWorkPage = readFileSync(path.join(root, "client/src/pages/PulseMyWorkPage.tsx"), "utf8");
const completedHistory = readFileSync(path.join(root, "client/src/components/pulse/PulseCompletedHistory.tsx"), "utf8");

describe("My EOS bottom panels", () => {
  it("uses equal responsive columns and matched full-height panels", () => {
    expect(myWorkPage).toContain('section className="grid items-stretch gap-2 xl:grid-cols-2"');
    expect(myWorkPage).toContain('className="h-full min-h-36 min-w-0 overflow-hidden"');
    expect(myWorkPage).toContain('className="h-full min-h-36 overflow-hidden pulse-card-compact"');
    expect(myWorkPage).not.toContain('xl:grid-cols-[1.15fr_0.85fr]');
  });

  it("keeps completed history extensible without forcing layout changes elsewhere", () => {
    expect(completedHistory).toContain('className?: string;');
    expect(completedHistory).toContain('className={cn("border-emerald-200/80 bg-emerald-50/20", className)}');
  });
});
