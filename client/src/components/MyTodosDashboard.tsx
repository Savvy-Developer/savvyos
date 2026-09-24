import { useState } from "react";
import { format, isPast, isToday } from "date-fns";
import {
  Check,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FolderKanban,
  Loader2,
  Pencil,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PulseItemEditor } from "@/components/pulse/PulseItemEditor";
import { toast } from "sonner";

type Todo = {
  id: string;
  source: "l10" | "project";
  title: string;
  dueDate: Date | string | null;
  sourceId: string | number;
  meetingId?: string;
  projectId?: number;
  sourceLabel: string;
  sourceDate: Date | string | null;
  priority?: "high" | "medium" | "low";
  status?: "not_started" | "in_progress" | "blocked" | "completed";
  notes?: string | null;
  recurrence?: "none" | "daily" | "weekdays" | "weekly" | "monthly";
};

type ProjectTodoForm = {
  title: string;
  dueDate: string;
  priority: "high" | "medium" | "low";
  status: "not_started" | "in_progress" | "blocked" | "completed";
  notes: string;
};

function duePresentation(value: Date | string | null) {
  if (!value)
    return { label: "No due date", className: "text-muted-foreground" };
  const due = new Date(value);
  if (isPast(due) && !isToday(due))
    return {
      label: `Overdue · ${format(due, "MMM d")}`,
      className: "font-medium text-destructive",
    };
  if (isToday(due))
    return { label: "Due today", className: "font-medium text-amber-700" };
  return {
    label: `Due ${format(due, "MMM d, yyyy")}`,
    className: "text-muted-foreground",
  };
}

function projectForm(todo: Todo): ProjectTodoForm {
  return {
    title: todo.title,
    dueDate: todo.dueDate ? format(new Date(todo.dueDate), "yyyy-MM-dd") : "",
    priority: todo.priority ?? "medium",
    status: todo.status ?? "not_started",
    notes: todo.notes ?? "",
  };
}

export default function MyTodosDashboard() {
  const utils = trpc.useUtils();
  const { data: todos = [], isLoading } = trpc.pm.myTodos.listOpen.useQuery(
    undefined,
    { refetchInterval: 1500 }
  );
  const [projectTodo, setProjectTodo] = useState<Todo | null>(null);
  const [projectTodoForm, setProjectTodoForm] =
    useState<ProjectTodoForm | null>(null);
  const [l10Todo, setL10Todo] = useState<Todo | null>(null);
  const items = todos as Todo[];

  const refreshEverywhere = () => {
    void utils.pm.myTodos.invalidate();
    void utils.pm.projects.invalidate();
    void utils.pm.l10Todos.invalidate();
    void utils.pulse.workItems.invalidate();
    void utils.pulse.l10.invalidate();
    void utils.pulse.personal.invalidate();
  };

  const complete = trpc.pm.myTodos.complete.useMutation({
    onSuccess: (_, input) => {
      toast.success(
        input.source === "l10"
          ? "L10 To-Do completed and sent for acknowledgement."
          : "Project To-Do completed."
      );
      refreshEverywhere();
    },
    onError: error => toast.error(error.message),
  });

  const updateProjectTodo = trpc.pm.tasks.update.useMutation({
    onSuccess: result => {
      toast.success(
        result.rolledForward
          ? "Recurring Project To-Do moved to its next due date."
          : "Project To-Do updated."
      );
      setProjectTodo(null);
      setProjectTodoForm(null);
      refreshEverywhere();
    },
    onError: error => toast.error(error.message),
  });

  function openProjectEditor(todo: Todo) {
    setProjectTodo(todo);
    setProjectTodoForm(projectForm(todo));
  }

  function saveProjectEditor() {
    if (!projectTodo || !projectTodoForm) return;
    if (!projectTodoForm.title.trim()) {
      toast.error("Enter a To-Do title.");
      return;
    }
    if (projectTodo.recurrence !== "none" && !projectTodoForm.dueDate) {
      toast.error("Recurring Project To-Dos need a due date.");
      return;
    }
    updateProjectTodo.mutate({
      id: Number(projectTodo.sourceId),
      title: projectTodoForm.title.trim(),
      dueDate: projectTodoForm.dueDate
        ? new Date(`${projectTodoForm.dueDate}T12:00:00`)
        : null,
      priority: projectTodoForm.priority,
      status: projectTodoForm.status,
      notes: projectTodoForm.notes,
    });
  }

  return (
    <section className="mb-6 rounded-lg border border-primary/25 bg-primary/[0.025]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-primary/15 p-4">
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold">My To-Dos</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Open commitments assigned to you from L10 meetings and Projects.
              Work them here or in their original source; changes stay in sync.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-primary/20 bg-background px-2.5 py-1 text-xs font-semibold text-primary">
          {items.length} open
        </span>
      </div>
      <div className="divide-y divide-border/70">
        {isLoading ? (
          <div className="p-5 text-sm text-muted-foreground">
            Loading your To-Dos…
          </div>
        ) : null}
        {!isLoading && items.length === 0 ? (
          <div className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            You have no open L10 or Project To-Dos.
          </div>
        ) : null}
        {items.map(todo => {
          const due = duePresentation(todo.dueDate);
          const isL10 = todo.source === "l10";
          const href = isL10
            ? `/pulse/meetings/${todo.meetingId}`
            : `/projects/${todo.projectId}?tab=tasks#todo-${todo.sourceId}`;
          const sourceText = isL10
            ? `L10 · ${todo.sourceLabel}${todo.sourceDate ? ` · ${format(new Date(todo.sourceDate), "MMM d, yyyy")}` : ""}`
            : `Project · ${todo.sourceLabel}`;
          return (
            <article
              key={todo.id}
              className="flex gap-3 p-4 transition-colors hover:bg-background/80"
            >
              <Checkbox
                checked={false}
                disabled={complete.isPending}
                onCheckedChange={checked => {
                  if (checked === true)
                    complete.mutate({
                      source: todo.source,
                      sourceId: todo.sourceId,
                    });
                }}
                aria-label={`Complete ${todo.title}`}
                className="mt-0.5 h-5 w-5 rounded-full data-[state=checked]:border-emerald-500 data-[state=checked]:bg-emerald-500"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="min-w-0 font-medium">{todo.title}</h3>
                  <span className={`shrink-0 text-xs ${due.className}`}>
                    {due.label}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <a
                    href={href}
                    className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors hover:brightness-95 ${isL10 ? "border-violet-200 bg-violet-50 text-violet-800" : "border-primary/20 bg-primary/10 text-primary"}`}
                  >
                    <span className="truncate">{sourceText}</span>
                    {isL10 ? (
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    ) : (
                      <FolderKanban className="h-3 w-3 shrink-0" />
                    )}
                  </a>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() =>
                      isL10 ? setL10Todo(todo) : openProjectEditor(todo)
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <Dialog
        open={Boolean(projectTodo && projectTodoForm)}
        onOpenChange={open => {
          if (!open && !updateProjectTodo.isPending) {
            setProjectTodo(null);
            setProjectTodoForm(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Project To-Do</DialogTitle>
            <DialogDescription>
              This edits the original Project To-Do. The Project list, board,
              Gantt, and this dashboard refresh from the same record.
            </DialogDescription>
          </DialogHeader>
          {projectTodoForm ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="my-todo-project-title">To-Do title</Label>
                <Input
                  id="my-todo-project-title"
                  className="mt-1"
                  value={projectTodoForm.title}
                  onChange={event =>
                    setProjectTodoForm(current =>
                      current
                        ? { ...current, title: event.target.value }
                        : current
                    )
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="my-todo-project-due-date">Due date</Label>
                  <Input
                    id="my-todo-project-due-date"
                    className="mt-1"
                    type="date"
                    value={projectTodoForm.dueDate}
                    onChange={event =>
                      setProjectTodoForm(current =>
                        current
                          ? { ...current, dueDate: event.target.value }
                          : current
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select
                    value={projectTodoForm.priority}
                    onValueChange={value =>
                      setProjectTodoForm(current =>
                        current
                          ? {
                              ...current,
                              priority: value as ProjectTodoForm["priority"],
                            }
                          : current
                      )
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={projectTodoForm.status}
                  onValueChange={value =>
                    setProjectTodoForm(current =>
                      current
                        ? {
                            ...current,
                            status: value as ProjectTodoForm["status"],
                          }
                        : current
                    )
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="my-todo-project-notes">Notes</Label>
                <Textarea
                  id="my-todo-project-notes"
                  className="mt-1"
                  rows={4}
                  value={projectTodoForm.notes}
                  onChange={event =>
                    setProjectTodoForm(current =>
                      current
                        ? { ...current, notes: event.target.value }
                        : current
                    )
                  }
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={updateProjectTodo.isPending}
              onClick={() => {
                setProjectTodo(null);
                setProjectTodoForm(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={updateProjectTodo.isPending}
              onClick={saveProjectEditor}
            >
              {updateProjectTodo.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PulseItemEditor
        open={Boolean(l10Todo)}
        onOpenChange={open => {
          if (!open) setL10Todo(null);
        }}
        workItemId={l10Todo?.sourceId as string | undefined}
        defaultType="todo"
        title={l10Todo ? `Edit ${l10Todo.title}` : "Edit L10 To-Do"}
        onSaved={() => {
          setL10Todo(null);
          refreshEverywhere();
        }}
      />
    </section>
  );
}
