export type SectionMoveDirection = "up" | "down";

type TaskTreeRow = {
  id: number;
  parentTaskId: number | null;
};

export function moveSectionInOrder(
  orderedIds: number[],
  sectionId: number,
  direction: SectionMoveDirection
) {
  const currentIndex = orderedIds.indexOf(sectionId);
  if (currentIndex === -1) {
    throw new Error("Section is not part of the supplied order.");
  }

  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= orderedIds.length) return [...orderedIds];

  const reordered = [...orderedIds];
  [reordered[currentIndex], reordered[nextIndex]] = [
    reordered[nextIndex],
    reordered[currentIndex],
  ];
  return reordered;
}

export function collectTaskFamilyIds(tasks: TaskTreeRow[], rootTaskId: number) {
  const familyIds = new Set<number>([rootTaskId]);
  let addedTask = true;

  while (addedTask) {
    addedTask = false;
    for (const task of tasks) {
      if (
        task.parentTaskId !== null &&
        familyIds.has(task.parentTaskId) &&
        !familyIds.has(task.id)
      ) {
        familyIds.add(task.id);
        addedTask = true;
      }
    }
  }

  return Array.from(familyIds);
}
