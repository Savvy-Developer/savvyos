import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { toast } from "sonner";
import {
  CheckCircle2,
  CheckSquare2,
  CircleAlert,
  Clock3,
  Loader2,
  Plus,
  UserRound,
  UsersRound,
} from "lucide-react";

type TodoView = "mine" | "scope";
type TodoFilter = "open" | "completed" | "all";

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function priorityClass(priority?: string | null) {
  switch (priority) {
    case "urgent":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "high":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "low":
      return "border-slate-200 bg-slate-50 text-slate-600";
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function todoTiming(dueDate?: Date | string | null) {
  if (!dueDate)
    return {
      label: "No due date",
      className: "text-muted-foreground",
      isOverdue: false,
      isToday: false,
    };
  const due = new Date(dueDate);
  const today = new Date();
  const dueKey = dateKey(due);
  const todayKey = dateKey(today);
  const isOverdue = dueKey < todayKey;
  const isToday = dueKey === todayKey;
  return {
    label: isOverdue
      ? `Overdue · ${due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : isToday
        ? "Due today"
        : `Due ${due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
    className: isOverdue
      ? "text-rose-700"
      : isToday
        ? "text-amber-700"
        : "text-muted-foreground",
    isOverdue,
    isToday,
  };
}

export function PulseTodosPanel({ actorPersonId }: { actorPersonId: number }) {
  const utils = trpc.useUtils();
  const { data: scopes = [] } = trpc.pulse.visibleScopes.useQuery(undefined, {
    staleTime: 15_000,
  });
  const { data: personal = [], isLoading: loadingPersonal } =
    trpc.pulse.myWork.useQuery(undefined, { staleTime: 10_000 });
  const [view, setView] = useState<TodoView>("mine");
  const [filter, setFilter] = useState<TodoFilter>("open");
  const [scopeId, setScopeId] = useState("");
  const { data: scoped = [], isLoading: loadingScoped } =
    trpc.pulse.scopeWork.useQuery(
      { scopeId: Number(scopeId || 1) },
      { enabled: view === "scope" && Boolean(scopeId), staleTime: 10_000 }
    );
  const [createOpen, setCreateOpen] = useState(false);
  const [completeItem, setCompleteItem] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<
    "low" | "medium" | "high" | "urgent"
  >("medium");
  const [completionNote, setCompletionNote] = useState("");

  useEffect(() => {
    if (!scopeId && scopes.length) setScopeId(String(scopes[0].id));
  }, [scopeId, scopes]);

  const invalidate = () => {
    utils.pulse.myWork.invalidate();
    utils.pulse.scopeWork.invalidate();
    utils.pulse.notificationWork.invalidate();
    utils.pulse.getFoundation.invalidate();
  };

  const createTodo = trpc.pulse.createWorkItem.useMutation({
    onSuccess: () => {
      toast.success("Todo created and assigned to you.");
      setCreateOpen(false);
      setTitle("");
      setDueDate("");
      setPriority("medium");
      invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const completeTodo = trpc.pulse.transitionWorkItem.useMutation({
    onSuccess: () => {
      toast.success("Todo marked complete.");
      setCompleteItem(null);
      setCompletionNote("");
      invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const todos = useMemo(() => {
    const source = view === "mine" ? personal : scoped;
    return source
      .filter((item: any) => item.itemType === "todo")
      .filter(
        (item: any) =>
          filter === "all" ||
          (filter === "completed"
            ? item.status === "complete"
            : item.status !== "complete" && item.status !== "skipped")
      )
      .sort((left: any, right: any) => {
        const leftOverdue = todoTiming(left.todo?.dueDate).isOverdue ? 0 : 1;
        const rightOverdue = todoTiming(right.todo?.dueDate).isOverdue ? 0 : 1;
        if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue;
        const leftDate = left.todo?.dueDate
          ? new Date(left.todo.dueDate).getTime()
          : Number.MAX_SAFE_INTEGER;
        const rightDate = right.todo?.dueDate
          ? new Date(right.todo.dueDate).getTime()
          : Number.MAX_SAFE_INTEGER;
        return leftDate - rightDate;
      });
  }, [filter, personal, scoped, view]);

  const openTodos = useMemo(
    () =>
      todos.filter(
        (item: any) => item.status !== "complete" && item.status !== "skipped"
      ),
    [todos]
  );
  const overdueCount = useMemo(
    () =>
      openTodos.filter((item: any) => todoTiming(item.todo?.dueDate).isOverdue)
        .length,
    [openTodos]
  );
  const dueTodayCount = useMemo(
    () =>
      openTodos.filter((item: any) => todoTiming(item.todo?.dueDate).isToday)
        .length,
    [openTodos]
  );
  const loading = view === "mine" ? loadingPersonal : loadingScoped;
  const formScopeId = scopeId || (scopes[0] ? String(scopes[0].id) : "");

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.05] to-transparent">
        <CardHeader className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CheckSquare2 className="h-5 w-5 text-primary" />
              <CardTitle>Todos</CardTitle>
            </div>
            <CardDescription className="mt-1 max-w-3xl">
              Keep your Pulse commitments visible, prioritize what is due, and
              record a completion note when the work is finished.
            </CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)} disabled={!formScopeId}>
            <Plus className="mr-2 h-4 w-4" />
            New todo
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={view === "mine" ? "default" : "outline"}
              onClick={() => setView("mine")}
            >
              <UserRound className="mr-1.5 h-3.5 w-3.5" />
              My todos
            </Button>
            <Button
              size="sm"
              variant={view === "scope" ? "default" : "outline"}
              onClick={() => setView("scope")}
            >
              <UsersRound className="mr-1.5 h-3.5 w-3.5" />
              Scope todos
            </Button>
            {view === "scope" && (
              <Select value={scopeId} onValueChange={setScopeId}>
                <SelectTrigger className="h-8 w-[230px]">
                  <SelectValue placeholder="Choose visible scope" />
                </SelectTrigger>
                <SelectContent>
                  {scopes.map((scope: any) => (
                    <SelectItem key={scope.id} value={String(scope.id)}>
                      {scope.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-background/70 px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground">
                Open in this view
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {openTodos.length}
              </p>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2.5">
              <p className="text-xs font-medium text-rose-700">Overdue</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-rose-700">
                {overdueCount}
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5">
              <p className="text-xs font-medium text-amber-700">Due today</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-700">
                {dueTodayCount}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {(["open", "completed", "all"] as TodoFilter[]).map(value => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? "default" : "outline"}
                onClick={() => setFilter(value)}
              >
                {value === "open"
                  ? "Open"
                  : value === "completed"
                    ? "Completed"
                    : "All"}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : todos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center">
            <CheckSquare2 className="mx-auto h-9 w-9 text-muted-foreground/60" />
            <p className="mt-4 font-medium">
              {view === "mine"
                ? "No todos assigned to you"
                : "No todos in this scope"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {view === "mine"
                ? "Create a todo to add it to your personal Pulse queue."
                : "Create the first todo for this visible scope."}
            </p>
            {formScopeId && (
              <Button className="mt-5" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New todo
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {todos.map((item: any) => {
            const timing = todoTiming(item.todo?.dueDate);
            const isClosed =
              item.status === "complete" || item.status === "skipped";
            return (
              <Card
                key={item.id}
                className={
                  timing.isOverdue && !isClosed ? "border-rose-200" : undefined
                }
              >
                <CardHeader className="space-y-3 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-start gap-2">
                        <CheckSquare2
                          className={`mt-0.5 h-4 w-4 shrink-0 ${isClosed ? "text-emerald-600" : "text-primary"}`}
                        />
                        <CardTitle
                          className={`text-base ${isClosed ? "text-muted-foreground line-through" : ""}`}
                        >
                          {item.title}
                        </CardTitle>
                      </div>
                      {item.description && (
                        <CardDescription className="mt-1 line-clamp-2">
                          {item.description}
                        </CardDescription>
                      )}
                    </div>
                    <Badge
                      variant={
                        item.status === "blocked"
                          ? "destructive"
                          : isClosed
                            ? "default"
                            : "secondary"
                      }
                      className="shrink-0"
                    >
                      {statusLabel(item.status)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge
                      variant="outline"
                      className={priorityClass(item.todo?.priority)}
                    >
                      {item.todo?.priority ?? "medium"} priority
                    </Badge>
                    <span
                      className={`inline-flex items-center gap-1 font-medium ${timing.className}`}
                    >
                      <Clock3 className="h-3.5 w-3.5" />
                      {timing.label}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 border-t pt-3">
                  <div className="grid grid-cols-[85px_1fr] gap-x-2 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Scope</span>
                    <span>
                      {item.currentScope?.name || "Unavailable scope"}
                    </span>
                    <span className="text-muted-foreground">Owner</span>
                    <span>{item.owner?.displayName || "Unassigned"}</span>
                  </div>
                  {!isClosed && (
                    <Button
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => {
                        setCompleteItem(item);
                        setCompletionNote("");
                      }}
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      Mark complete
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New todo</DialogTitle>
            <DialogDescription>
              This todo will be assigned to you and recorded in the selected
              active Pulse scope.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={formScopeId} onValueChange={setScopeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose active scope" />
                </SelectTrigger>
                <SelectContent>
                  {scopes.map((scope: any) => (
                    <SelectItem key={scope.id} value={String(scope.id)}>
                      {scope.name} · {scope.scopeType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder="Follow up with a lead"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Due date</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={event => setDueDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={priority}
                  onValueChange={value => setPriority(value as typeof priority)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createTodo.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                createTodo.mutate({
                  itemType: "todo",
                  title,
                  primaryScopeId: Number(formScopeId),
                  assigneePersonId: actorPersonId,
                  todo: {
                    dueDate: dueDate
                      ? new Date(`${dueDate}T00:00:00.000Z`)
                      : undefined,
                    priority,
                  },
                })
              }
              disabled={
                createTodo.isPending || title.trim().length < 2 || !formScopeId
              }
            >
              {createTodo.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create todo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(completeItem)}
        onOpenChange={open => {
          if (!open) {
            setCompleteItem(null);
            setCompletionNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete todo</DialogTitle>
            <DialogDescription>
              Record a concise completion note so the work history remains
              useful to the team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="completion-note">Completion note</Label>
            <Input
              id="completion-note"
              value={completionNote}
              onChange={event => setCompletionNote(event.target.value)}
              placeholder="Sent the requested follow-up"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCompleteItem(null);
                setCompletionNote("");
              }}
              disabled={completeTodo.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                completeItem &&
                completeTodo.mutate({
                  itemId: completeItem.id,
                  status: "complete",
                  note: completionNote,
                  completionNote,
                })
              }
              disabled={
                completeTodo.isPending || completionNote.trim().length < 3
              }
            >
              {completeTodo.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Mark complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
