import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const myWorkPage = readFileSync(path.join(root, "client/src/pages/PulseMyWorkPage.tsx"), "utf8");
const completedHistory = readFileSync(path.join(root, "client/src/components/pulse/PulseCompletedHistory.tsx"), "utf8");
const meetingDashboard = readFileSync(path.join(root, "client/src/pages/PulseMeetingDashboardPage.tsx"), "utf8");

describe("Pulse compact expansion controls", () => {
  it("uses chevron-only buttons for dashboard sections and activity", () => {
    expect(myWorkPage).toContain('size="icon" className="h-8 w-8 shrink-0"');
    expect(myWorkPage).toContain('aria-label={`${open ? "Collapse" : "Expand"} ${title}`}');
    expect(myWorkPage).toContain('aria-label={open ? "Collapse activity" : "Expand activity"}');
    expect(myWorkPage).not.toContain('{open ? "Collapse" : "Expand"}<ChevronDown');
  });

  it("lets the completed history at the bottom expand through the same chevron control and expandable rows", () => {
    expect(completedHistory).toContain('size="icon"');
    expect(completedHistory).toContain('aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}');
    expect(completedHistory).toContain('<PulseInlineItemRow item={item}');
  });

  it("keeps only Add To-Do and Add Issue actions in the L10 rhythm card", () => {
    expect(meetingDashboard).toContain('onClick={() => onCreate("todo")}>Add To-Do</Button>');
    expect(meetingDashboard).toContain('onClick={() => onCreate("issue")}>Add Issue</Button>');
    expect(meetingDashboard).not.toContain('aria-label="Review scorecard"');
    expect(meetingDashboard).not.toContain('aria-label="Open Issues"');
    expect(meetingDashboard).not.toContain('onClick={() => onOpenTab("scorecard")}>Scorecard</Button>');
    expect(meetingDashboard).not.toContain('onClick={() => onOpenTab("issues")}>Issues</Button>');
  });
});
