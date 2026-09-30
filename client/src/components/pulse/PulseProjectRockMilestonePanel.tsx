import { useState } from "react";
import { ChevronRight, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/**
 * Renders Project-owned Rock milestones in Pulse without duplicating the
 * Project. Completion updates always write through to the authoritative
 * Project task record.
 */
export function PulseProjectRockMilestonePanel({
  meetingId,
  projectId,
  milestones,
  onChanged,
}: {
  meetingId: string;
  projectId: number;
  milestones: any[];
  onChanged: () => void;
}) {
  const [expandedMilestoneId, setExpandedMilestoneId] = useState<number | null>(
    null
  );
  const setCompletion = trpc.pulse.l10.setProjectRockTodoCompletion.useMutation(
    {
      onSuccess: onChanged,
      onError: error => toast.error(error.message),
    }
  );
  const completed = milestones.reduce(
    (total, milestone) => total + Number(milestone.completed ?? 0),
    0
  );
  const total = milestones.reduce(
    (sum, milestone) => sum + Number(milestone.total ?? 0),
    0
  );

  return (
    <section className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" />
          Project milestones
        </p>
        <span className="text-xs text-muted-foreground">
          {total
            ? `${completed}/${total} to-dos complete`
            : `${milestones.length} milestone${milestones.length === 1 ? "" : "s"}`}
        </span>
      </div>
      {milestones.length ? (
        <div className="mt-2 space-y-2">
          {milestones.map(milestone => {
            const open = expandedMilestoneId === milestone.id;
            return (
              <div
                key={milestone.id}
                className="overflow-hidden rounded-md border border-border bg-background"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedMilestoneId(open ? null : milestone.id)
                  }
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50"
                  aria-expanded={open}
                  aria-label={`${open ? "Collapse" : "Expand"} ${milestone.title} milestone`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
                    />
                    <span className="truncate font-medium">
                      {milestone.title}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {milestone.dueDate ? (
                      <span>
                        Due{" "}
                        {new Date(milestone.dueDate).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" }
                        )}
                      </span>
                    ) : null}
                    <span>
                      {milestone.completed}/{milestone.total} to-dos
                    </span>
                  </span>
                </button>
                {open ? (
                  <div className="border-t border-border px-3 py-2">
                    {milestone.description ? (
                      <p className="mb-2 whitespace-pre-wrap text-sm text-muted-foreground">
                        {milestone.description}
                      </p>
                    ) : null}
                    {milestone.todos?.length ? (
                      <div className="space-y-1">
                        {milestone.todos.map((todo: any) => (
                          <label
                            key={todo.id}
                            className={`flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-sm hover:bg-muted/50 ${todo.parentTaskId ? "ml-5" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(todo.completed)}
                              disabled={setCompletion.isPending}
                              onChange={event =>
                                setCompletion.mutate({
                                  meetingId,
                                  projectId,
                                  sectionId: milestone.id,
                                  taskId: todo.id,
                                  completed: event.target.checked,
                                })
                              }
                              className="h-4 w-4 rounded border-input accent-primary"
                            />
                            <span
                              className={
                                todo.completed
                                  ? "min-w-0 flex-1 text-muted-foreground line-through"
                                  : "min-w-0 flex-1"
                              }
                            >
                              {todo.title}
                            </span>
                            {todo.ownerName ? (
                              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                                {todo.ownerName}
                              </span>
                            ) : null}
                            {todo.dueDate ? (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {new Date(todo.dueDate).toLocaleDateString(
                                  undefined,
                                  { month: "short", day: "numeric" }
                                )}
                              </span>
                            ) : null}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="py-2 text-sm text-muted-foreground">
                        No to-dos in this milestone yet.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          No milestone sections are available yet.
        </p>
      )}
    </section>
  );
}
