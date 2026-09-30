import { describe, expect, it } from "vitest";
import { projectRoutedPersonalRocks } from "./myEosRocks";

describe("My EOS Rock routing projection", () => {
  const personalRock = {
    id: "personal-rock",
    type: "rock",
    meetingId: null,
    meetingName: null,
    ownerPersonId: 42,
    assigneeId: null,
    title: "Keep My EOS current",
  };

  it("shows an owned personal Rock in its routed L10 without changing ownership", () => {
    const [rock] = projectRoutedPersonalRocks([personalRock], [{
      workItemId: "personal-rock",
      meetingId: "leadership-l10",
      meetingName: "Leadership L10",
    }], 42);

    expect(rock).toMatchObject({
      id: "personal-rock",
      ownerPersonId: 42,
      meetingId: "leadership-l10",
      meetingName: "Leadership L10",
      routedFromPersonal: true,
    });
    expect(rock.meetingId).toBe("leadership-l10");
  });

  it("does not project a Rock owned by someone else or alter a Rock that already has a home meeting", () => {
    const otherPersonsRock = { ...personalRock, id: "other-person-rock", ownerPersonId: 7 };
    const meetingRock = { ...personalRock, id: "meeting-rock", meetingId: "marketing-l10", meetingName: "Marketing L10" };
    const [unchangedOther, unchangedMeeting] = projectRoutedPersonalRocks([
      otherPersonsRock,
      meetingRock,
    ], [
      { workItemId: "other-person-rock", meetingId: "leadership-l10", meetingName: "Leadership L10" },
      { workItemId: "meeting-rock", meetingId: "leadership-l10", meetingName: "Leadership L10" },
    ], 42);

    expect(unchangedOther).toEqual(otherPersonsRock);
    expect(unchangedMeeting).toEqual(meetingRock);
  });

  it("projects an owned personal Rock into every selected visible L10", () => {
    const routed = projectRoutedPersonalRocks([personalRock], [
      { workItemId: "personal-rock", meetingId: "leadership-l10", meetingName: "Leadership L10" },
      { workItemId: "personal-rock", meetingId: "marketing-l10", meetingName: "Marketing L10" },
    ], 42);

    expect(routed.map((rock) => rock.meetingName)).toEqual(["Leadership L10", "Marketing L10"]);
    expect(routed.every((rock) => rock.ownerPersonId === 42 && rock.routedFromPersonal)).toBe(true);
  });

  it("does not route non-Rock work items", () => {
    const todo = { ...personalRock, id: "todo", type: "todo" };
    expect(projectRoutedPersonalRocks([todo], [{ workItemId: "todo", meetingId: "leadership-l10", meetingName: "Leadership L10" }], 42)[0]).toEqual(todo);
  });
});
