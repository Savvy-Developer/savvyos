export const PROJECT_TODO_STATUSES = [
  "not_started",
  "in_progress",
  "blocked",
  "completed",
] as const;

export type ProjectTodoStatus = (typeof PROJECT_TODO_STATUSES)[number];

export const TODO_RECURRENCES = [
  "none",
  "daily",
  "weekdays",
  "weekly",
  "monthly",
] as const;

export type TodoRecurrence = (typeof TODO_RECURRENCES)[number];

type RecurringTodo = {
  dueDate: Date | null;
  recurrence: TodoRecurrence;
};

/**
 * Move a recurring todo to its next actionable due date. Recurrence advances
 * from a future due date when one exists, otherwise from the completion time.
 */
export function advanceRecurringDueDate(
  dueDate: Date | null,
  recurrence: Exclude<TodoRecurrence, "none">,
  now = new Date(),
): Date {
  const next = new Date(dueDate && dueDate > now ? dueDate : now);
  if (recurrence === "daily") next.setDate(next.getDate() + 1);
  if (recurrence === "weekdays") {
    next.setDate(next.getDate() + 1);
    while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
  }
  if (recurrence === "weekly") next.setDate(next.getDate() + 7);
  if (recurrence === "monthly") next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * Completing a repeating todo keeps its single record active and advances its
 * due date. One-time todos retain the normal completed state.
 */
export function completionUpdate(
  todo: RecurringTodo,
  now = new Date(),
): {
  status: ProjectTodoStatus;
  completed: boolean;
  completedAt: Date | null;
  dueDate?: Date;
  rolledForward: boolean;
} {
  if (todo.recurrence !== "none") {
    return {
      status: "not_started",
      completed: false,
      completedAt: null,
      dueDate: advanceRecurringDueDate(todo.dueDate, todo.recurrence, now),
      rolledForward: true,
    };
  }

  return {
    status: "completed",
    completed: true,
    completedAt: now,
    rolledForward: false,
  };
}

export function reopenUpdate(): ReturnType<typeof completionUpdate> {
  return {
    status: "not_started",
    completed: false,
    completedAt: null,
    rolledForward: false,
  };
}
