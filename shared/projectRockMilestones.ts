export type ProjectRockMilestoneDraft = {
  title: string;
  dueDate: string;
};

type DatedMilestone = {
  dueDate: Date | string | null | undefined;
};

/**
 * Removes untouched milestone inputs while preserving partially completed rows
 * so the form can report that specific data is incomplete.
 */
export function prepareProjectRockMilestones(drafts: readonly ProjectRockMilestoneDraft[]) {
  const milestones = drafts
    .map((milestone) => ({
      title: milestone.title.trim(),
      dueDate: milestone.dueDate,
    }))
    .filter((milestone) => Boolean(milestone.title || milestone.dueDate));

  return {
    milestones,
    hasIncompleteMilestone: milestones.some((milestone) => !milestone.title || !milestone.dueDate),
  };
}

export function hasDatedProjectRockMilestone(
  existingSections: readonly DatedMilestone[],
  newMilestones: readonly DatedMilestone[],
) {
  return [...existingSections, ...newMilestones].some((milestone) => Boolean(milestone.dueDate));
}
