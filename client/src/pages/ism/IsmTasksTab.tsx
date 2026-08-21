import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  ExternalLink,
  ListTodo,
  Loader2,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type TaskStatusFilter =
  | "all"
  | "open"
  | "overdue"
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";

const TASK_STATUS_OPTIONS: Array<{ value: TaskStatusFilter; label: string }> = [
  { value: "open", label: "Open tasks" },
  { value: "overdue", label: "Overdue" },
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function dateLabel(value: Date | string | null | undefined) {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No due date";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function dateTimeLabel(value: Date | string | null | undefined) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function titleCase(value: string | null | undefined) {
  return (value ?? "Unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function taskStatusClass(status: string | null | undefined) {
  if (status === "completed")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "in_progress")
    return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "cancelled")
    return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function priorityClass(priority: string | null | undefined) {
  if (priority === "urgent") return "border-rose-200 bg-rose-50 text-rose-700";
  if (priority === "high")
    return "border-orange-200 bg-orange-50 text-orange-700";
  if (priority === "medium") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function actionLabel(action: string | null | undefined) {
  const labels: Record<string, string> = {
    task_created: "Created task",
    task_updated: "Updated task",
    task_completed: "Completed task",
    task_note_added: "Added a task note",
  };
  return labels[action ?? ""] ?? titleCase(action ?? "Task activity");
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  tone: string;
  onClick?: () => void;
}) {
  const content = (
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {detail}
          </p>
        </div>
        <span className={`shrink-0 rounded-xl bg-muted p-2.5 ${tone}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </CardContent>
  );

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="border-border/80 shadow-sm">{content}</Card>
    </button>
  ) : (
    <Card className="border-border/80 shadow-sm">{content}</Card>
  );
}

export default function IsmTasksTab() {
  const [selectedIsaIds, setSelectedIsaIds] = useState<string[]>([]);
  const [status, setStatus] = useState<TaskStatusFilter>("open");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const queryInput = useMemo(
    () => ({
      page,
      limit: pageSize,
      isaIds: selectedIsaIds.length ? selectedIsaIds.map(Number) : undefined,
      status,
      dueDateFrom: dueDateFrom || undefined,
      dueDateTo: dueDateTo || undefined,
    }),
    [dueDateFrom, dueDateTo, page, selectedIsaIds, status]
  );

  const { data, error, isFetching, isLoading, refetch } =
    trpc.analytics.ismTaskBoard.useQuery(queryInput, {
      staleTime: 20_000,
      refetchOnWindowFocus: false,
    });

  const isas = (data?.isas ?? []).map((isa: any) => ({
    value: String(isa.id),
    label: isa.name ?? isa.email ?? "Unnamed ISA",
    description: isa.title ?? (isa.isActive ? "Active" : "Inactive"),
  }));
  const tasks = data?.tasks ?? [];
  const isaStats = data?.isaStats ?? [];
  const activities = data?.activities ?? [];
  const summary = data?.summary;
  const total = Number(data?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters =
    selectedIsaIds.length > 0 ||
    status !== "open" ||
    !!dueDateFrom ||
    !!dueDateTo;

  const updateStatus = (value: TaskStatusFilter) => {
    setStatus(value);
    setPage(1);
  };

  const resetFilters = () => {
    setSelectedIsaIds([]);
    setStatus("open");
    setDueDateFrom("");
    setDueDateTo("");
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.09] via-background to-cyan-50/60 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                ISA execution
              </p>
              <Badge variant="secondary">Live task workload</Badge>
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              See task ownership, deadlines, and follow-through across every
              ISA.
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Prioritize overdue follow-ups, compare individual task loads, and
              review the most recent task work without leaving the ISM
              dashboard.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Focus the task board</CardTitle>
          <CardDescription>
            Filter assigned ISA work by owner, state, and due-date window.
            Summary metrics remain scoped to the selected ISA and due-date
            filters.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1.5 xl:col-span-2">
            <Label className="text-xs">ISAs</Label>
            <MultiSelect
              options={isas}
              value={selectedIsaIds}
              onValueChange={value => {
                setSelectedIsaIds(value);
                setPage(1);
              }}
              placeholder="All ISAs"
              searchPlaceholder="Search ISAs…"
              maxDisplay={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Task state</Label>
            <Select
              value={status}
              onValueChange={value => updateStatus(value as TaskStatusFilter)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Open tasks" />
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUS_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ism-task-due-from" className="text-xs">
              Due on or after
            </Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="ism-task-due-from"
                type="date"
                value={dueDateFrom}
                onChange={event => {
                  setDueDateFrom(event.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ism-task-due-to" className="text-xs">
              Due on or before
            </Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="ism-task-due-to"
                type="date"
                value={dueDateTo}
                onChange={event => {
                  setDueDateTo(event.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-rose-200">
          <CardContent className="flex min-h-60 flex-col items-center justify-center p-8 text-center">
            <AlertTriangle className="mb-3 h-8 w-8 text-rose-600" />
            <p className="font-semibold">Unable to load ISA tasks</p>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">
              {error.message}
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Assigned tasks"
              value={Number(summary?.assignedTasks ?? 0).toLocaleString()}
              detail="Tasks assigned to selected ISAs"
              icon={ClipboardList}
              tone="text-primary"
              onClick={() => updateStatus("all")}
            />
            <MetricCard
              label="Open tasks"
              value={Number(summary?.openTasks ?? 0).toLocaleString()}
              detail="Pending or currently in progress"
              icon={ListTodo}
              tone="text-blue-700"
              onClick={() => updateStatus("open")}
            />
            <MetricCard
              label="Overdue"
              value={Number(summary?.overdueTasks ?? 0).toLocaleString()}
              detail="Open tasks past their due date"
              icon={AlertTriangle}
              tone="text-rose-700"
              onClick={() => updateStatus("overdue")}
            />
            <MetricCard
              label="Due today"
              value={Number(summary?.dueToday ?? 0).toLocaleString()}
              detail="Open tasks due before day end"
              icon={Clock3}
              tone="text-amber-700"
              onClick={() => updateStatus("open")}
            />
            <MetricCard
              label="Completed, 30 days"
              value={Number(summary?.completedLast30Days ?? 0).toLocaleString()}
              detail={
                summary?.completionRate == null
                  ? "No completion rate available"
                  : `${summary.completionRate.toFixed(1)}% completed across scoped tasks`
              }
              icon={CheckCircle2}
              tone="text-emerald-700"
              onClick={() => updateStatus("completed")}
            />
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle className="text-base">ISA workload snapshot</CardTitle>
              <CardDescription>
                Open work and exceptions by ISA. Completion rate uses all scoped
                assigned tasks, not just the list filter.
              </CardDescription>
            </CardHeader>
            {isaStats.length === 0 ? (
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No assigned ISA tasks match the current owner or due-date
                filters.
              </CardContent>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[740px] w-full text-sm">
                  <thead className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3 text-left font-semibold">ISA</th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Assigned
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Open
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Overdue
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Due today
                      </th>
                      <th className="px-5 py-3 text-right font-semibold">
                        Completion
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {isaStats.map((row: any) => {
                      const name =
                        row.isa?.name ?? row.isa?.email ?? "Unnamed ISA";
                      return (
                        <tr
                          key={row.isa.id}
                          className="transition-colors hover:bg-muted/30"
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                {name.slice(0, 1).toUpperCase()}
                              </span>
                              <div>
                                <p className="font-medium">{name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {row.isa?.title ??
                                    (row.isa?.isActive
                                      ? "Active ISA"
                                      : "Inactive ISA")}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right tabular-nums">
                            {Number(row.assignedTasks).toLocaleString()}
                          </td>
                          <td className="px-4 py-3.5 text-right tabular-nums">
                            {Number(row.openTasks).toLocaleString()}
                          </td>
                          <td className="px-4 py-3.5 text-right tabular-nums">
                            <span
                              className={
                                Number(row.overdueTasks) > 0
                                  ? "font-semibold text-rose-700"
                                  : "text-muted-foreground"
                              }
                            >
                              {Number(row.overdueTasks).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right tabular-nums">
                            {Number(row.dueToday).toLocaleString()}
                          </td>
                          <td className="px-5 py-3.5 text-right tabular-nums">
                            {row.completionRate == null
                              ? "—"
                              : `${Number(row.completionRate).toFixed(1)}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">
                    Assigned ISA tasks
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Overdue open work is listed first. Open a task to review its
                    full context and notes.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Search className="h-4 w-4" />
                  {total.toLocaleString()} task{total === 1 ? "" : "s"} found
                  {isFetching && <span className="text-xs">Updating…</span>}
                </div>
              </div>
            </CardHeader>
            {tasks.length === 0 ? (
              <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
                <ClipboardList className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="font-semibold">
                  No ISA tasks match these filters
                </p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Try another task state or expand the selected due-date window.
                </p>
                {hasFilters && (
                  <Button
                    className="mt-4"
                    variant="outline"
                    size="sm"
                    onClick={resetFilters}
                  >
                    Reset filters
                  </Button>
                )}
              </CardContent>
            ) : (
              <div className="divide-y">
                {tasks.map((row: any) => {
                  const task = row.task;
                  const isaName =
                    row.assignedIsa?.name ??
                    row.assignedIsa?.email ??
                    "Unnamed ISA";
                  const contactName = [
                    row.contact?.firstName,
                    row.contact?.lastName,
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const isOverdue =
                    ["pending", "in_progress"].includes(task.status) &&
                    task.dueDate &&
                    new Date(task.dueDate).getTime() <
                      new Date(new Date().toDateString()).getTime();
                  return (
                    <div
                      key={task.id}
                      className="grid gap-3 p-4 transition-colors hover:bg-muted/20 xl:grid-cols-[minmax(0,2fr)_minmax(10rem,0.8fr)_auto_auto_auto] xl:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/tasks/${task.id}`}
                            className="min-w-0 truncate font-semibold text-primary hover:underline"
                          >
                            {task.title}
                          </Link>
                          <Badge
                            variant="outline"
                            className={`capitalize text-[10px] ${taskStatusClass(task.status)}`}
                          >
                            {titleCase(task.status)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`capitalize text-[10px] ${priorityClass(task.priority)}`}
                          >
                            {task.priority}
                          </Badge>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{titleCase(task.taskType)}</span>
                          {contactName && (
                            <Link
                              href={`/contacts/${row.contact.id}`}
                              className="text-primary hover:underline"
                            >
                              {contactName}
                            </Link>
                          )}
                          {task.description && (
                            <span className="max-w-lg truncate">
                              {task.description}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <UserRound className="h-4 w-4 text-muted-foreground" />
                        <span>{isaName}</span>
                      </div>
                      <div className="text-sm xl:text-right">
                        <p
                          className={
                            isOverdue
                              ? "font-semibold text-rose-700"
                              : "font-medium"
                          }
                        >
                          {dateLabel(task.dueDate)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isOverdue ? "Overdue" : "Due date"}
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground xl:text-right">
                        Updated {dateTimeLabel(task.updatedAt)}
                      </p>
                      <Link
                        href={`/tasks/${task.id}`}
                        className="inline-flex items-center justify-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5 xl:justify-self-end"
                      >
                        Open <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
            {total > pageSize && (
              <CardContent className="flex items-center justify-between border-t py-4">
                <p className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(current => Math.max(1, current - 1))}
                    disabled={page <= 1 || isFetching}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPage(current => Math.min(totalPages, current + 1))
                    }
                    disabled={page >= totalPages || isFetching}
                  >
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle className="text-base">Recent task activity</CardTitle>
              <CardDescription>
                Latest task creation, updates, completions, and notes for the
                scoped ISA workload.
              </CardDescription>
            </CardHeader>
            {activities.length === 0 ? (
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No recorded task activity matches the current filters.
              </CardContent>
            ) : (
              <div className="divide-y">
                {activities.map((activity: any) => {
                  const actorName =
                    activity.actor?.name ??
                    activity.actor?.email ??
                    "SavvyOS user";
                  const isaName =
                    activity.assignedIsa?.name ??
                    activity.assignedIsa?.email ??
                    "Unnamed ISA";
                  const detail =
                    activity.kind === "note"
                      ? activity.details?.content
                      : activity.details?.status
                        ? `Status: ${titleCase(activity.details.status)}`
                        : null;
                  return (
                    <div key={activity.id} className="flex gap-3 p-4">
                      <span
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${activity.kind === "note" ? "bg-violet-100 text-violet-700" : "bg-primary/10 text-primary"}`}
                      >
                        {activity.kind === "note" ? (
                          <ClipboardList className="h-4 w-4" />
                        ) : (
                          <Activity className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-sm font-medium">
                            {actionLabel(activity.action)}
                          </p>
                          <Badge variant="secondary" className="text-[10px]">
                            {isaName}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80">
                            {actorName}
                          </span>{" "}
                          on{" "}
                          <Link
                            href={`/tasks/${activity.taskId}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {activity.taskTitle}
                          </Link>
                        </p>
                        {detail && (
                          <p className="mt-2 max-w-3xl whitespace-pre-wrap rounded-md bg-muted/60 px-2.5 py-1.5 text-xs leading-5 text-muted-foreground">
                            {detail}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-muted-foreground">
                          {dateTimeLabel(activity.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
