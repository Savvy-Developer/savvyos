export type MilestoneDependencyLink = {
  milestoneId: number;
  predecessorMilestoneId: number;
};

export function normalizePredecessorMilestoneIds(ids: number[]) {
  return Array.from(new Set(ids));
}

/** Returns true if replacing one milestone's blockers would create a cycle. */
export function wouldCreateMilestoneDependencyCycle(
  milestoneId: number,
  predecessorMilestoneIds: number[],
  existingLinks: MilestoneDependencyLink[],
) {
  const blockersByMilestone = new Map<number, number[]>();
  for (const link of existingLinks) {
    if (link.milestoneId === milestoneId) continue;
    blockersByMilestone.set(link.milestoneId, [
      ...(blockersByMilestone.get(link.milestoneId) ?? []),
      link.predecessorMilestoneId,
    ]);
  }
  blockersByMilestone.set(milestoneId, predecessorMilestoneIds);

  const reachesMilestone = (candidateId: number, visited = new Set<number>()): boolean => {
    if (candidateId === milestoneId) return true;
    if (visited.has(candidateId)) return false;
    visited.add(candidateId);
    return (blockersByMilestone.get(candidateId) ?? []).some(blockerId =>
      reachesMilestone(blockerId, visited),
    );
  };

  return predecessorMilestoneIds.some(predecessorId => reachesMilestone(predecessorId));
}
