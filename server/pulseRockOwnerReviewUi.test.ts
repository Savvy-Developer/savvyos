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

describe("routed Project Rock and owner-review interfaces", () => {
  it("projects active Project Rocks to the owning person’s routed My EOS L10", () => {
    expect(personal).toContain("async function ownedProjectRockRoutes");
    expect(personal).toContain("pmProjectRockMeetings");
    expect(personal).toContain(
      "eq(pmProjects.weeklyReportingOwnerId, personId)"
    );
    expect(personal).toContain("projectRockForMyEos(route)");
    expect(personal).toContain(
      "projectRocks: projectRocksByMeeting.get(meeting.id) ?? []"
    );
    expect(personal).toContain(
      "const projectRocks = (projectRockRoutes as any[]).map(projectRockForMyEos)"
    );
  });

  it("shows routed Project Rocks during the selected L10 weekly preparation", () => {
    expect(weeklyPreparation).toContain("function ProjectRockPreparation");
    expect(weeklyPreparation).toContain("My Project Rocks in this L10");
    expect(weeklyPreparation).toContain("projectId: rock.projectId");
    expect(weeklyPreparation).toContain(
      "<ProjectRockPreparation rocks={meeting.projectRocks ?? []}"
    );
    expect(myEos).toContain("function ProjectRockWorkRow");
    expect(myEos).toContain('if (item.sourceType === "project")');
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
