import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, GitBranch, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProjectTodo = {
  id: number;
  title: string;
  completed?: boolean;
  status?: string | null;
  dueDate?: Date | string | null;
  predecessorTaskIds?: number[];
};

function todoStatus(todo: ProjectTodo) {
  return todo.status ?? (todo.completed ? "completed" : "not_started");
}

function dueDateLabel(value: Date | string | null | undefined) {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ProjectTodoDependencyDialog({
  task,
  tasks,
  isPending = false,
  onSave,
}: {
  task: ProjectTodo;
  tasks: ProjectTodo[];
  isPending?: boolean;
  onSave: (predecessorTaskIds: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const candidates = useMemo(
    () =>
      tasks
        .filter(candidate => candidate.id !== task.id)
        .filter(candidate => {
          const text =
            `${candidate.title} ${todoStatus(candidate)}`.toLowerCase();
          return text.includes(query.trim().toLowerCase());
        })
        .sort((left, right) => left.title.localeCompare(right.title)),
    [query, task.id, tasks]
  );
  const selectedTasks = useMemo(
    () => tasks.filter(candidate => selectedIds.includes(candidate.id)),
    [selectedIds, tasks]
  );

  useEffect(() => {
    if (!open) return;
    setSelectedIds(task.predecessorTaskIds ?? []);
    setQuery("");
  }, [open, task.id, task.predecessorTaskIds]);

  function toggleTodo(todoId: number, checked: boolean) {
    setSelectedIds(current =>
      checked
        ? Array.from(new Set([...current, todoId]))
        : current.filter(id => id !== todoId)
    );
  }

  function save() {
    onSave(selectedIds);
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8"
        onClick={() => setOpen(true)}
      >
        <GitBranch className="mr-1.5 h-3.5 w-3.5" />
        Dependencies
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Blocked by</DialogTitle>
            <DialogDescription>
              Choose the Project To-Dos that must finish before “{task.title}”.
              Dependencies stay within this project and are shown as arrows in
              Gantt View.
            </DialogDescription>
          </DialogHeader>

          {selectedTasks.length ? (
            <div className="rounded-md border border-primary/20 bg-primary/[0.025] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Current blockers
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedTasks.map(todo => (
                  <button
                    key={todo.id}
                    type="button"
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/20 bg-background px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5"
                    onClick={() => toggleTodo(todo.id, false)}
                    title={`Remove ${todo.title}`}
                  >
                    <span className="truncate">{todo.title}</span>
                    <X className="h-3 w-3 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex gap-2 rounded-md border border-amber-300/70 bg-amber-50/70 p-3 text-xs text-amber-950">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
              <p>No blockers selected. This To-Do can begin independently.</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={`dependency-search-${task.id}`}>
              Project To-Dos
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={`dependency-search-${task.id}`}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search Project To-Dos…"
                className="pl-8"
              />
            </div>
            <div className="max-h-64 divide-y overflow-y-auto rounded-md border bg-background">
              {candidates.length ? (
                candidates.map(todo => {
                  const selected = selectedIds.includes(todo.id);
                  const status = todoStatus(todo).replaceAll("_", " ");
                  return (
                    <label
                      key={todo.id}
                      className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={checked =>
                          toggleTodo(todo.id, checked === true)
                        }
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {todo.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {status[0]?.toUpperCase()}
                          {status.slice(1)} · {dueDateLabel(todo.dueDate)}
                        </span>
                      </span>
                    </label>
                  );
                })
              ) : (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No other Project To-Dos match this search.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={isPending} onClick={save}>
              {isPending ? "Saving…" : "Save dependencies"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
