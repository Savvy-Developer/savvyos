import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
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
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Layers3,
  PartyPopper,
  UserCheck,
  Users,
} from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";

type OnboardingTask = {
  id: number;
  title: string;
  description: string | null;
  assignee: "admin" | "agent";
  stageName: string | null;
  dueDate: Date | string | null;
  completed: boolean;
  completedAt: Date | string | null;
};
type TaskFilter = "all" | "incomplete" | "completed";
type DueSort = "due_asc" | "due_desc";

function isOverdue(
  dueDate: Date | string | null | undefined,
  completed: boolean
): boolean {
  return (
    Boolean(dueDate) && !completed && new Date(dueDate!).getTime() < Date.now()
  );
}
function formatDueDate(dueDate: Date | string | null | undefined): string {
  return dueDate ? safeFormat(dueDate, "MMM d, yyyy") : "";
}
function sortTasks(tasks: OnboardingTask[], dueSort: DueSort) {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const aDue = a.dueDate
      ? new Date(a.dueDate).getTime()
      : Number.POSITIVE_INFINITY;
    const bDue = b.dueDate
      ? new Date(b.dueDate).getTime()
      : Number.POSITIVE_INFINITY;
    if (aDue === bDue) return a.title.localeCompare(b.title);
    return dueSort === "due_asc" ? aDue - bDue : bDue - aDue;
  });
}
function groupByStage(tasks: OnboardingTask[]) {
  const groups = new Map<string, OnboardingTask[]>();
  tasks.forEach(task => {
    const stage = task.stageName?.trim() || "Other tasks";
    groups.set(stage, [...(groups.get(stage) ?? []), task]);
  });
  return Array.from(groups.entries());
}

function DueDateLabel({
  dueDate,
  completed,
}: Pick<OnboardingTask, "dueDate" | "completed">) {
  if (!dueDate)
    return <span className="text-xs text-muted-foreground">No due date</span>;
  if (completed)
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Calendar className="h-3 w-3" />
        Was due {formatDueDate(dueDate)}
      </span>
    );
  if (isOverdue(dueDate, completed))
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-red-600">
        <AlertTriangle className="h-3 w-3" />
        Overdue — was due {formatDueDate(dueDate)}
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Calendar className="h-3 w-3" />
      Due {formatDueDate(dueDate)}
    </span>
  );
}

function TaskList({
  tasks,
  canComplete,
  onToggle,
  emptyMessage,
}: {
  tasks: OnboardingTask[];
  canComplete: boolean;
  onToggle: (task: OnboardingTask, completed: boolean) => void;
  emptyMessage: string;
}) {
  const groups = groupByStage(tasks);
  if (!tasks.length)
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  return (
    <div className="space-y-5">
      {groups.map(([stage, stageTasks]) => (
        <section key={stage} className="space-y-2">
          <div className="flex items-center gap-2 border-b pb-2">
            <Layers3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">{stage}</h3>
            <Badge variant="secondary" className="text-xs">
              {stageTasks.length}
            </Badge>
          </div>
          {stageTasks.map(task => {
            const overdue = isOverdue(task.dueDate, task.completed);
            return (
              <Card
                key={task.id}
                className={`${task.completed ? "opacity-70" : ""} ${overdue ? "border-red-500/30" : ""}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    {canComplete ? (
                      <Checkbox
                        checked={task.completed}
                        onCheckedChange={checked =>
                          onToggle(task, Boolean(checked))
                        }
                        className="mt-0.5"
                        aria-label={`Mark ${task.title} ${task.completed ? "incomplete" : "complete"}`}
                      />
                    ) : (
                      <div
                        className="mt-0.5"
                        aria-label={
                          task.completed
                            ? "Completed by admin"
                            : "Pending admin task"
                        }
                      >
                        {task.completed ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <div className="h-5 w-5 rounded border-2 border-muted-foreground/30" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={`font-medium ${task.completed ? "text-muted-foreground line-through" : ""}`}
                      >
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {task.description}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-3">
                        <DueDateLabel
                          dueDate={task.dueDate}
                          completed={task.completed}
                        />
                        {task.completedAt && (
                          <span className="text-xs text-emerald-700">
                            Completed{" "}
                            {safeFormat(task.completedAt, "MMM d, yyyy h:mm a")}
                          </span>
                        )}
                      </div>
                    </div>
                    {!canComplete && (
                      <Badge variant="outline" className="text-xs">
                        Admin
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      ))}
    </div>
  );
}

export default function MyOnboardingPage() {
  const utils = trpc.useUtils();
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("incomplete");
  const [dueSort, setDueSort] = useState<DueSort>("due_asc");
  const { data: onboarding, isLoading } =
    trpc.onboarding.myOnboarding.useQuery();
  const toggleTaskMut = trpc.onboarding.toggleTask.useMutation({
    onSuccess: () => {
      void utils.onboarding.myOnboarding.invalidate();
      void utils.onboarding.hasActiveOnboarding.invalidate();
      toast.success("Task updated");
    },
    onError: error => toast.error(error.message),
  });
  const visibleTasks = useMemo(() => {
    const tasks = (onboarding?.tasks ?? []) as OnboardingTask[];
    return sortTasks(
      tasks.filter(
        task =>
          taskFilter === "all" ||
          (taskFilter === "completed" ? task.completed : !task.completed)
      ),
      dueSort
    );
  }, [onboarding?.tasks, taskFilter, dueSort]);

  if (isLoading)
    return (
      <div className="space-y-6">
        <PageHeader title="Onboarding" />
        <div className="py-12 text-center text-muted-foreground">
          Loading...
        </div>
      </div>
    );
  if (!onboarding)
    return (
      <div className="space-y-6">
        <PageHeader title="Onboarding" />
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-emerald-500" />
            <h2 className="mb-2 text-xl font-semibold">All Caught Up!</h2>
            <p className="text-muted-foreground">
              You have no active onboarding tasks. Your admin will set up a
              checklist whenever one is needed.
            </p>
          </CardContent>
        </Card>
      </div>
    );

  const tasks = onboarding.tasks as OnboardingTask[];
  const completedTasks = tasks.filter(task => task.completed).length;
  const overdueTasks = tasks.filter(task =>
    isOverdue(task.dueDate, task.completed)
  ).length;
  const pct = tasks.length
    ? Math.round((completedTasks / tasks.length) * 100)
    : 0;
  const agentTasks = visibleTasks.filter(task => task.assignee === "agent");
  const adminTasks = visibleTasks.filter(task => task.assignee === "admin");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding"
        subtitle="Your staged checklist and the items your admin is handling."
      />
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold">
                {onboarding.template?.name ?? "Onboarding checklist"}
              </h3>
              <p className="text-sm text-muted-foreground">
                Started{" "}
                {safeFormat(onboarding.instance.startedAt, "MMMM d, yyyy")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {overdueTasks > 0 && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {overdueTasks} overdue
                </Badge>
              )}
              <Badge
                variant={pct === 100 ? "default" : "secondary"}
                className="text-sm"
              >
                {pct === 100 ? "Complete!" : `${pct}% Done`}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Progress value={pct} className="h-3 flex-1" />
            <span className="whitespace-nowrap text-sm font-medium">
              {completedTasks}/{tasks.length}
            </span>
          </div>
        </CardContent>
      </Card>
      {pct === 100 && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="py-6 text-center">
            <PartyPopper className="mx-auto mb-2 h-10 w-10 text-emerald-500" />
            <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
              Congratulations! You've completed all tasks!
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              All tasks are done. Great work!
            </p>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="space-y-5 p-4 sm:p-6">
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">
                Show tasks
              </Label>
              <Select
                value={taskFilter}
                onValueChange={value => setTaskFilter(value as TaskFilter)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tasks</SelectItem>
                  <SelectItem value="incomplete">Incomplete tasks</SelectItem>
                  <SelectItem value="completed">Completed tasks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">
                Sort by due date
              </Label>
              <Select
                value={dueSort}
                onValueChange={value => setDueSort(value as DueSort)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="due_asc">Earliest first</SelectItem>
                  <SelectItem value="due_desc">Latest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <section>
            <div className="mb-3 flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold">Your Tasks</h2>
                <p className="text-xs text-muted-foreground">
                  Check off items assigned to you.
                </p>
              </div>
            </div>
            <TaskList
              tasks={agentTasks}
              canComplete
              onToggle={(task, completed) =>
                toggleTaskMut.mutate({ taskId: task.id, completed })
              }
              emptyMessage="No assigned tasks match this filter."
            />
          </section>
          <section className="border-t pt-5">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold">Admin Tasks</h2>
                <p className="text-xs text-muted-foreground">
                  Your admin is responsible for these items.
                </p>
              </div>
            </div>
            <TaskList
              tasks={adminTasks}
              canComplete={false}
              onToggle={() => undefined}
              emptyMessage="No admin tasks match this filter."
            />
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
