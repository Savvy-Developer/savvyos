type TaskTreeRow = {
  id: number;
  parentTaskId: number | null;
};

export type ProjectTodoLayoutItem =
  | { type: "task"; id: number }
  | { type: "section"; id: number; taskIds: number[] };

export type ProjectTodoLayoutChange = {
  id: number;
  sectionId: number | null;
  sortOrder: number;
};

export function normalizeProjectTodoLayout(
  layout: ProjectTodoLayoutItem[],
  sectionIds: number[],
  tasks: TaskTreeRow[]
) {
  const expectedSectionIds = new Set(sectionIds);
  const expectedTaskIds = new Set(
    tasks.filter(task => task.parentTaskId === null).map(task => task.id)
  );
  const seenSectionIds = new Set<number>();
  const seenTaskIds = new Set<number>();
  const sectionChanges: Array<{ id: number; sortOrder: number }> = [];
  const taskChanges: ProjectTodoLayoutChange[] = [];

  function registerTask(
    taskId: number,
    sectionId: number | null,
    sortOrder: number
  ) {
    if (!expectedTaskIds.has(taskId)) {
      throw new Error("Todo is not a top-level todo in this project.");
    }
    if (seenTaskIds.has(taskId)) {
      throw new Error("Each top-level todo must appear exactly once.");
    }
    seenTaskIds.add(taskId);
    taskChanges.push({ id: taskId, sectionId, sortOrder });
  }

  layout.forEach((item, rootSortOrder) => {
    if (item.type === "task") {
      registerTask(item.id, null, rootSortOrder);
      return;
    }

    if (!expectedSectionIds.has(item.id)) {
      throw new Error("Section is not part of this project.");
    }
    if (seenSectionIds.has(item.id)) {
      throw new Error("Each section must appear exactly once.");
    }
    seenSectionIds.add(item.id);
    sectionChanges.push({ id: item.id, sortOrder: rootSortOrder });
    item.taskIds.forEach((taskId, sectionSortOrder) => {
      registerTask(taskId, item.id, sectionSortOrder);
    });
  });

  if (seenSectionIds.size !== expectedSectionIds.size) {
    throw new Error("The layout must include every project section.");
  }
  if (seenTaskIds.size !== expectedTaskIds.size) {
    throw new Error("The layout must include every top-level project todo.");
  }

  return { sectionChanges, taskChanges };
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
