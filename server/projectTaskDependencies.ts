export type ProjectTaskDependencyLink = {
  taskId: number;
  predecessorTaskId: number;
};

/**
 * Dependency links point from a dependent To-Do to the work that must finish
 * first. This normalizes client input before it is checked against the
 * project’s actual task graph.
 */
export function normalizePredecessorTaskIds(ids: number[]) {
  return Array.from(new Set(ids.filter(id => Number.isInteger(id) && id > 0)));
}

/**
 * Returns true if replacing taskId's predecessors with predecessorTaskIds
 * would create a cycle in the Project To-Do dependency graph.
 */
export function wouldCreateProjectTaskDependencyCycle(
  taskId: number,
  predecessorTaskIds: number[],
  existingLinks: ProjectTaskDependencyLink[]
) {
  const linksByTask = new Map<number, number[]>();
  for (const link of existingLinks) {
    if (link.taskId === taskId) continue;
    linksByTask.set(link.taskId, [
      ...(linksByTask.get(link.taskId) ?? []),
      link.predecessorTaskId,
    ]);
  }
  linksByTask.set(taskId, predecessorTaskIds);

  const reachesTask = (fromTaskId: number) => {
    const seen = new Set<number>();
    const pending = [fromTaskId];
    while (pending.length) {
      const current = pending.pop();
      if (current === undefined || seen.has(current)) continue;
      if (current === taskId) return true;
      seen.add(current);
      pending.push(...(linksByTask.get(current) ?? []));
    }
    return false;
  };

  return predecessorTaskIds.some(
    predecessorTaskId =>
      predecessorTaskId === taskId || reachesTask(predecessorTaskId)
  );
}
