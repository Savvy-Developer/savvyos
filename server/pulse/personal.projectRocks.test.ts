import { describe, expect, it } from "vitest";
import { projectRockForMyEos } from "./personal";

describe("My EOS Project Rock projection", () => {
  it("keeps a routed Project Rock connected to its Project and L10", () => {
    const rock = projectRockForMyEos({
      projectId: 41,
      title: "Recruit the next ISA",
      description: "Build the hiring plan.",
      ownerId: 7,
      ownerName: "Jordan Lee",
      reportingOwnerId: 13,
      status: "at_risk",
      priority: "high",
      dueDate: new Date("2026-10-20T12:00:00Z"),
      quarter: "Q4 2026",
      definitionOfDone: "Offer accepted.",
      updatedAt: new Date("2026-10-01T12:00:00Z"),
      meetingId: "11111111-1111-4111-8111-111111111111",
      meetingName: "Leadership L10",
    });

    expect(rock).toMatchObject({
      id: "project-rock:41:11111111-1111-4111-8111-111111111111",
      type: "rock",
      sourceType: "project",
      projectId: 41,
      ownerPersonId: 7,
      assigneeId: 13,
      meetingName: "Leadership L10",
      sourceHref: "/projects/41",
      status: "at_risk",
    });
  });
});
