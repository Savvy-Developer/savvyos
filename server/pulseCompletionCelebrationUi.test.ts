import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const celebration = readFileSync(path.join(root, "client/src/components/pulse/PulseCompletionCelebration.tsx"), "utf8");
const contextPanel = readFileSync(path.join(root, "client/src/components/pulse/PulseItemContextPanel.tsx"), "utf8");
const itemEditor = readFileSync(path.join(root, "client/src/components/pulse/PulseItemEditor.tsx"), "utf8");

describe("Pulse completion celebrations", () => {
  it("launches Savvy-branded canvas confetti synchronously from completion success", () => {
    expect(celebration).toContain('const SAVVY_CONFETTI_COLORS = ["#0fc0df", "#000000", "#ffffff"]');
    expect(celebration).toContain("function launchSavvyConfetti");
    expect(celebration).toContain("confetti({ ...options, colors: SAVVY_CONFETTI_COLORS");
    expect(celebration).toContain("if (!reducedMotion) launchSavvyConfetti(anchor, variant);");
    expect(celebration).not.toContain("confetti.create");
  });

  it("celebrates only after a completed To-Do or resolved Issue succeeds", () => {
    expect(contextPanel).toContain('const completed = variables.status === "completed"');
    expect(contextPanel).toContain('celebrate(statusAnchor.current, issue ? "issue" : "todo", message)');
    expect(itemEditor).toContain('if (variables.status === "completed") celebrate(statusAnchor.current, item.type === "issue" ? "issue" : "todo"');
    expect(contextPanel).toContain('!statusNote.trim()');
    expect(itemEditor).toContain('!statusNote.trim()');
  });
});
