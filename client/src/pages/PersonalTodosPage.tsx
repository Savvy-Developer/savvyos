import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { format, isPast, isToday } from "date-fns";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  Circle,
  ListTodo,
  Pencil,
  Plus,
  Repeat2,
  Save,
  Trash2,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import PersonalTodoRouteProjectDialog, {
  type PersonalTodoProjectOption,
} from "@/components/PersonalTodoRouteProjectDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Recurrence = "none" | "daily" | "weekdays" | "weekly" | "monthly";

type PersonalTodo = {
  id: number;
  userId: number;
  title: string;
  notes: string | null;
  dueDate: Date | null;
  recurrence: Recurrence;
  completed: boolean;
};

const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: "One-time",
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  monthly: "Monthly",
};

function PersonalTodoRow({
  todo,
  editable,
  projects,
  onRefresh,
}: {
  todo: PersonalTodo;
  editable: boolean;
  projects: PersonalTodoProjectOption[];
  onRefresh: () => void;
}) {
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const formForTodo = () => ({
    title: todo.title,
    notes: todo.notes ?? "",
    dueDate: todo.dueDate ? format(new Date(todo.dueDate), "yyyy-MM-dd") : "",
    recurrence: todo.recurrence,
  });
  const [form, setForm] = useState(formForTodo);
  const complete = trpc.pm.personalTodos.toggleComplete.useMutation({
    onSuccess: result => {
      toast.success(
        result.rolledForward
          ? "Recurring To-Do moved to its next due date"
          : "Personal To-Do updated"
      );
      onRefresh();
    },
    onError: error => toast.error(error.message),
  });
  const update = trpc.pm.personalTodos.update.useMutation({
    onSuccess: () => {
      toast.success("Personal To-Do updated");
      setEditing(false);
      onRefresh();
    },
    onError: error => toast.error(error.message),
  });
  const routeToProject = trpc.pm.personalTodos.routeToProject.useMutation({
    onSuccess: result => {
      toast.success(`Moved to ${result.destinationProjectTitle}.`);
      void utils.pm.projects.invalidate();
      void utils.pm.myTodos.invalidate();
      onRefresh();
    },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.pm.personalTodos.delete.useMutation({
    onSuccess: () => {
      toast.success("Personal To-Do removed");
      onRefresh();
    },
    onError: error => toast.error(error.message),
  });

  const dueDate = todo.dueDate ? new Date(todo.dueDate) : null;
  const overdue =
    !!dueDate && !todo.completed && isPast(dueDate) && !isToday(dueDate);

  useEffect(() => {
    if (!editing) setForm(formForTodo());
  }, [editing, todo.dueDate, todo.notes, todo.recurrence, todo.title]);

  function save() {
    if (!form.title.trim()) {
      toast.error("A To-Do title is required");
      return;
    }
    if (form.recurrence !== "none" && !form.dueDate) {
      toast.error("Recurring To-Dos need a first due date");
      return;
    }
    update.mutate({
      id: todo.id,
      title: form.title.trim(),
      notes: form.notes.trim() || null,
      dueDate: form.dueDate ? new Date(`${form.dueDate}T12:00:00`) : null,
      recurrence: form.recurrence,
    });
  }

  function startEditing() {
    setForm(formForTodo());
    setExpanded(true);
    setEditing(true);
  }

  function cancelEditing() {
    setForm(formForTodo());
    setEditing(false);
  }

  return (
    <div
      id={`personal-todo-${todo.id}`}
      className={cn(
        "overflow-hidden rounded-md border border-border bg-card",
        todo.completed && "opacity-70"
      )}
    >
      <div className="flex w-full flex-wrap items-center gap-1.5 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/45">
        <button
          type="button"
          disabled={!editable || complete.isPending}
          onClick={() =>
            complete.mutate({ id: todo.id, completed: !todo.completed })
          }
          aria-label={
            todo.completed ? "Completed. Reopen To-Do." : "Complete To-Do"
          }
          title={todo.completed ? "Completed" : "Complete To-Do"}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed",
            todo.completed
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-muted-foreground hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700"
          )}
        >
          {todo.completed ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Circle className="h-3.5 w-3.5" />
          )}
        </button>
        {editing ? (
          <Input
            aria-label="Personal To-Do title"
            value={form.title}
            onChange={event =>
              setForm(current => ({ ...current, title: event.target.value }))
            }
            className="h-8 min-w-0 flex-1 bg-background text-sm"
            autoFocus
          />
        ) : (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(value => !value)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-sm font-medium",
                  todo.completed && "text-muted-foreground line-through"
                )}
              >
                {todo.title}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                expanded && "rotate-180"
              )}
            />
          </button>
        )}
        <span className="inline-flex h-7 shrink-0 items-center rounded border border-primary/20 bg-primary/[0.04] px-2 text-xs text-primary">
          Personal
        </span>
        {dueDate ? (
          <span
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1 rounded border bg-background px-2 text-xs",
              overdue && "border-red-200 text-red-600"
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {overdue
              ? `Overdue · ${format(dueDate, "MMM d")}`
              : isToday(dueDate)
                ? "Due today"
                : `Due ${format(dueDate, "MMM d")}`}
          </span>
        ) : null}
        {todo.recurrence !== "none" ? (
          <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-primary/20 bg-primary/[0.04] px-2 text-xs text-primary">
            <Repeat2 className="h-3.5 w-3.5" />
            {RECURRENCE_LABELS[todo.recurrence]}
          </span>
        ) : null}
      </div>

      {expanded ? (
        <div className="border-t border-primary/20 bg-primary/[0.025] p-2">
          {editing ? (
            <div className="rounded-md border bg-muted/20 p-2">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div className="lg:col-span-3">
                  <Label className="text-xs">To-Do</Label>
                  <Input
                    className="mt-1 h-8 text-sm"
                    value={form.title}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Due date</Label>
                  <Input
                    className="mt-1 h-8 text-xs"
                    type="date"
                    value={form.dueDate}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        dueDate: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Repeats</Label>
                  <Select
                    value={form.recurrence}
                    onValueChange={value =>
                      setForm(current => ({
                        ...current,
                        recurrence: value as Recurrence,
                      }))
                    }
                  >
                    <SelectTrigger className="mt-1 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(RECURRENCE_LABELS).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-2">
                <Label className="text-xs">Details</Label>
                <Textarea
                  className="mt-1 text-sm"
                  rows={2}
                  value={form.notes}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="mt-2 flex justify-end gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  onClick={save}
                  disabled={update.isPending}
                >
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {update.isPending ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={cancelEditing}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <section className="rounded-md border bg-background p-2 sm:p-2.5">
              <h4 className="text-sm font-semibold">Details</h4>
              {todo.notes ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {todo.notes}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  No details added.
                </p>
              )}
            </section>
          )}

          <section className="mt-2 rounded-md border bg-background">
            <div className="flex flex-wrap items-center justify-between gap-1.5 px-2 py-1.5">
              <div>
                <p className="text-sm font-semibold">Personal To-Do</p>
                <p className="text-xs text-muted-foreground">
                  Keep it private or move it into a Project when it becomes
                  shared work.
                </p>
              </div>
              {editable ? (
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={startEditing}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit To-Do
                  </Button>
                  {!todo.completed ? (
                    <PersonalTodoRouteProjectDialog
                      todoTitle={todo.title}
                      projects={projects}
                      isPending={routeToProject.isPending}
                      onRoute={destinationProjectId =>
                        routeToProject.mutate({
                          id: todo.id,
                          destinationProjectId,
                        })
                      }
                    />
                  ) : null}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (window.confirm(`Delete “${todo.title}”?`))
                        remove.mutate({ id: todo.id });
                    }}
                    aria-label="Delete To-Do"
                    title="Delete To-Do"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default function PersonalTodosPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const currentUserId = Number((user as any)?.id ?? 0);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    notes: "",
    dueDate: "",
    recurrence: "none" as Recurrence,
  });
  const targetUserId = Number(selectedUserId || currentUserId || 0);
  const userInput = useMemo(
    () => (targetUserId ? { userId: targetUserId } : undefined),
    [targetUserId]
  );
  const { data: users = [] } = trpc.pm.personalTodos.availableUsers.useQuery();
  const { data: todos = [], refetch } = trpc.pm.personalTodos.list.useQuery(
    userInput,
    { enabled: !!targetUserId, refetchInterval: 1500 }
  );
  const { data: stats, refetch: refetchStats } =
    trpc.pm.personalTodos.stats.useQuery(userInput, {
      enabled: !!targetUserId,
      refetchInterval: 1500,
    });
  const targetUser = (users as any[]).find(
    person => person.id === targetUserId
  );
  const editable = targetUserId === currentUserId;
  const { data: moveProjects = [] } =
    trpc.pm.projects.moveDestinations.useQuery(undefined, {
      enabled: editable,
    });
  const create = trpc.pm.personalTodos.create.useMutation({
    onSuccess: () => {
      toast.success("Personal To-Do added");
      setCreateOpen(false);
      setForm({ title: "", notes: "", dueDate: "", recurrence: "none" });
      void refetch();
      void refetchStats();
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!selectedUserId && currentUserId)
      setSelectedUserId(String(currentUserId));
  }, [currentUserId, selectedUserId]);

  const active = (todos as PersonalTodo[]).filter(todo => !todo.completed);
  const completed = (todos as PersonalTodo[]).filter(todo => todo.completed);
  const refreshAll = () => {
    void refetch();
    void refetchStats();
  };

  function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) return toast.error("A To-Do title is required");
    if (form.recurrence !== "none" && !form.dueDate)
      return toast.error("Recurring To-Dos need a first due date");
    create.mutate({
      title: form.title.trim(),
      notes: form.notes.trim() || undefined,
      dueDate: form.dueDate ? new Date(`${form.dueDate}T12:00:00`) : null,
      recurrence: form.recurrence,
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate("/projects")}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Projects
      </button>
      <PageHeader
        title={
          editable
            ? "My Personal To-Dos"
            : `${targetUser?.name ?? "User"}'s Personal To-Dos`
        }
        subtitle={
          editable
            ? "Private work that can move into a Project when it becomes shared."
            : "Viewing this user's private To-Do list"
        }
        actions={
          editable ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add Personal To-Do
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <div>
          <Label className="mb-1.5 block text-xs">Personal To-Do list</Label>
          <SearchableSelect
            options={(users as any[]).map(person => ({
              value: String(person.id),
              label: person.name ?? person.email ?? `User #${person.id}`,
              description: person.email ?? undefined,
            }))}
            value={String(targetUserId || "")}
            onValueChange={setSelectedUserId}
            placeholder="Select a user"
            searchPlaceholder="Search users…"
            listClassName="max-h-72"
          />
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-2.5 text-center">
          <p className="text-xl font-bold text-black">{stats?.active ?? 0}</p>
          <p className="text-xs text-muted-foreground">Open</p>
        </div>
        <div className="rounded-lg border border-red-100 bg-card px-4 py-2.5 text-center">
          <p className="text-xl font-bold text-red-600">
            {stats?.overdue ?? 0}
          </p>
          <p className="text-xs text-muted-foreground">Overdue</p>
        </div>
      </div>

      {!editable ? (
        <div className="mb-4 rounded-lg border border-muted bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Only {targetUser?.name ?? "this user"} can add, edit, complete,
          remove, or move their personal To-Dos.
        </div>
      ) : null}
      {active.length === 0 && completed.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-14 text-center text-muted-foreground">
          <ListTodo className="mx-auto mb-3 h-9 w-9 opacity-30" />
          <p className="font-medium">No personal To-Dos yet</p>
          <p className="mt-1 text-sm">
            {editable
              ? "Add private work here, then move it to a Project when it becomes shared."
              : "This user has not added any personal To-Dos."}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {active.map(todo => (
            <PersonalTodoRow
              key={todo.id}
              todo={todo}
              editable={editable}
              projects={moveProjects as PersonalTodoProjectOption[]}
              onRefresh={refreshAll}
            />
          ))}
          {completed.length > 0 ? (
            <details className="mt-5">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                {completed.length} completed To-Do
                {completed.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-2 space-y-1.5">
                {completed.map(todo => (
                  <PersonalTodoRow
                    key={todo.id}
                    todo={todo}
                    editable={editable}
                    projects={moveProjects as PersonalTodoProjectOption[]}
                    onRefresh={refreshAll}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Personal To-Do</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitCreate}>
            <div>
              <Label htmlFor="personal-todo-title">
                What needs to be done? *
              </Label>
              <Input
                id="personal-todo-title"
                className="mt-1"
                autoFocus
                value={form.title}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="personal-todo-date">Due date</Label>
                <Input
                  id="personal-todo-date"
                  className="mt-1"
                  type="date"
                  value={form.dueDate}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      dueDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Repeats</Label>
                <Select
                  value={form.recurrence}
                  onValueChange={value =>
                    setForm(current => ({
                      ...current,
                      recurrence: value as Recurrence,
                    }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="personal-todo-notes">Details</Label>
              <Textarea
                id="personal-todo-notes"
                className="mt-1"
                rows={3}
                value={form.notes}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Adding…" : "Add To-Do"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
