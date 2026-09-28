export type WeeklyProjectTask = {
  completed: boolean;
  dueDate: Date | null;
  sectionId: number | null;
};

export type WeeklyProjectMilestone = {
  id: number;
  title: string;
  dueDate: Date | null;
};

export type WeeklyProjectSnapshot = {
  taskTotal: number;
  taskCompleted: number;
  milestoneTotal: number;
  milestoneCompleted: number;
  overdueTaskCount: number;
  targetDate: Date | null;
  nextMilestoneTitle: string | null;
  nextMilestoneDueDate: Date | null;
};

/**
 * Captures only data SavvyOS can calculate from the Project work itself.
 * The resulting snapshot is written with a weekly update so history stays true
 * even when the project changes later.
 */
export function buildProjectWeeklyUpdateSnapshot(
  tasks: readonly WeeklyProjectTask[],
  milestones: readonly WeeklyProjectMilestone[],
  targetDate: Date | null,
  now = new Date()
): WeeklyProjectSnapshot {
  const completedMilestoneIds = new Set(
    milestones
      .filter(milestone => {
        const milestoneTasks = tasks.filter(
          task => task.sectionId === milestone.id
        );
        return (
          milestoneTasks.length > 0 &&
          milestoneTasks.every(task => task.completed)
        );
      })
      .map(milestone => milestone.id)
  );
  const nextMilestone =
    milestones
      .filter(
        milestone =>
          milestone.dueDate && !completedMilestoneIds.has(milestone.id)
      )
      .sort(
        (left, right) => left.dueDate!.getTime() - right.dueDate!.getTime()
      )[0] ?? null;

  return {
    taskTotal: tasks.length,
    taskCompleted: tasks.filter(task => task.completed).length,
    milestoneTotal: milestones.length,
    milestoneCompleted: completedMilestoneIds.size,
    overdueTaskCount: tasks.filter(
      task =>
        !task.completed &&
        task.dueDate &&
        task.dueDate.getTime() < now.getTime()
    ).length,
    targetDate,
    nextMilestoneTitle: nextMilestone?.title ?? null,
    nextMilestoneDueDate: nextMilestone?.dueDate ?? null,
  };
}
