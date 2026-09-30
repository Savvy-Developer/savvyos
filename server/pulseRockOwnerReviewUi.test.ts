import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const personal = read("server/pulse/personal.ts");
const weeklyPreparation = read(
  "client/src/components/pulse/PulseWeeklyPreparation.tsx"
);
const myEos = read("client/src/pages/PulseMyWorkPage.tsx");
const meetingDashboard = read("client/src/pages/PulseMeetingDashboardPage.tsx");
const runner = read("client/src/pages/PulseMeetingRunPage.tsx");
const ownerFilter = read(
  "client/src/components/pulse/PulseRockOwnerFilter.tsx"
);
const projectRockMilestonePanel = read(
  "client/src/components/pulse/PulseProjectRockMilestonePanel.tsx"
);

describe("routed Project Rock and owner-review interfaces", () => {
  it("projects active Project Rocks to the owning person’s routed My EOS L10", () => {
    expect(personal).toContain("async function ownedProjectRockRoutes");
    expect(personal).toContain("pmProjectRockMeetings");
    expect(personal).toContain(
      "eq(pmProjects.weeklyReportingOwnerId, personId)"
    );
    expect(personal).toContain("const projectRockItems = (routedProjectRockRoutes as any[])");
    expect(personal).toContain("async function projectRockMilestones");
    expect(personal).toContain("milestones: row.milestones ?? []");
    expect(personal).toContain(
      "const projectRocks = (projectRockRoutes as any[]).map(projectRockForMyEos)"
    );
  });

  it("shows routed Project Rocks in the selected L10's dedicated My Rocks section", () => {
    expect(myEos).toContain('title="My Rocks"');
    expect(myEos).toContain('aria-label="My Rocks"');
    expect(myEos).toContain(
      'description="Review and update this L10’s longer-term priorities, milestones, and current status."'
    );
    expect(myEos).toContain("function ProjectRockWorkRow");
    expect(myEos).toContain('if (item.sourceType === "project")');
    expect(myEos).toContain("PulseProjectRockMilestonePanel");
    expect(myEos).toContain("milestones={item.milestones ?? []}");
    expect(projectRockMilestonePanel).toContain(
      "setProjectRockTodoCompletion"
    );
    expect(projectRockMilestonePanel).toContain(
      "authoritative\n * Project task record"
    );
    expect(weeklyPreparation).not.toContain("ProjectRockPreparation");
  });

  it("keeps L10 Rock cards compact until a person expands one", () => {
    expect(meetingDashboard).toContain("expandedRockIds");
    expect(meetingDashboard).toContain("aria-expanded={open}");
    expect(meetingDashboard).toContain("PulseProjectRockMilestonePanel");
    expect(runner).toContain("expandedRockIds");
    expect(runner).toContain("aria-expanded={open}");
  });

  it("filters each L10 Rock review by owner in both workspace and runner", () => {
    expect(ownerFilter).toContain('aria-label="Filter Rocks by owner"');
    expect(ownerFilter).toContain("export function rockOwnerKey");
    expect(meetingDashboard).toContain("Review one owner’s Rocks at a time");
    expect(meetingDashboard).toContain(
      "const filteredRocks = ownerFilter === ALL_ROCK_OWNERS"
    );
    expect(runner).toContain(
      "Finish this person’s Rocks, then select the next owner."
    );
    expect(runner).toContain(
      "rock.projectId ? { meetingId: data.meeting.id, projectId: rock.projectId"
    );
  });
});
