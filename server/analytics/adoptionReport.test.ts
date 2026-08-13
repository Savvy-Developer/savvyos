import { describe, expect, it } from "vitest";
import { getAdoptionScore } from "./adoptionReport";

describe("getAdoptionScore", () => {
  it("awards all 100 points for frequent platform use and fresh pipeline stewardship", () => {
    const score = getAdoptionScore({
      accountType: "full_user",
      daysSinceLogin: 0,
      contactActivitiesWeek: 5,
      tasksCompletedWeek: 3,
      activePipelineLeads: 5,
      averageLeadAgeDays: 7,
    });

    expect(score.total).toBe(100);
    expect(score.breakdown).toEqual({
      loginRecency: 30,
      contactActivity: 25,
      completedTasks: 15,
      pipelineCoverage: 15,
      leadFreshness: 15,
    });
  });

  it("reduces the score for stale engagement while preserving meaningful partial activity", () => {
    const score = getAdoptionScore({
      accountType: "full_user",
      daysSinceLogin: 21,
      contactActivitiesWeek: 2,
      tasksCompletedWeek: 1,
      activePipelineLeads: 3,
      averageLeadAgeDays: 31,
    });

    expect(score.total).toBe(38);
    expect(score.breakdown).toEqual({
      loginRecency: 10,
      contactActivity: 10,
      completedTasks: 5,
      pipelineCoverage: 9,
      leadFreshness: 4,
    });
  });

  it("keeps directory-only teammates visible without classifying them as inactive sign-in users", () => {
    const score = getAdoptionScore({
      accountType: "teammate",
      daysSinceLogin: null,
      contactActivitiesWeek: 8,
      tasksCompletedWeek: 4,
      activePipelineLeads: 9,
      averageLeadAgeDays: 2,
    });

    expect(score.total).toBe(0);
    expect(score.breakdown).toEqual({
      loginRecency: 0,
      contactActivity: 0,
      completedTasks: 0,
      pipelineCoverage: 0,
      leadFreshness: 0,
    });
  });
});
