import { type ReactNode, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "sonner";
import {
  AlertTriangle,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  Layers3,
  Pencil,
  Trash2,
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

type TaskView = "all" | "incomplete" | "completed";
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

function toInputDate(value: Date | string | null | undefined): string {
  return value ? new Date(value).toISOString().split("T")[0] : "";
}

function sortTasks(tasks: OnboardingTask[], sort: DueSort) {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const aDue = a.dueDate
      ? new Date(a.dueDate).getTime()
      : Number.POSITIVE_INFINITY;
    const bDue = b.dueDate
      ? new Date(b.dueDate).getTime()
      : Number.POSITIVE_INFINITY;
    if (aDue === bDue) return a.title.localeCompare(b.title);
    return sort === "due_asc" ? aDue - bDue : bDue - aDue;
  });
}

function stageGroups(tasks: OnboardingTask[]) {
  const groups = new Map<string, OnboardingTask[]>();
  tasks.forEach(task => {
    const name = task.stageName?.trim() || "Other tasks";
    groups.set(name, [...(groups.get(name) ?? []), task]);
  });
  return Array.from(groups.entries());
}

export default function OnboardingTrackerPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<
    "all" | "in_progress" | "completed" | "overdue"
  >("all");
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | null>(
    null
  );
  const [bulkDays, setBulkDays] = useState("7");
  const [showBulkExtend, setShowBulkExtend] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editDueDate, setEditDueDate] = useState("");
  const [taskView, setTaskView] = useState<TaskView>("incomplete");
  const [dueSort, setDueSort] = useState<DueSort>("due_asc");
  const [assignmentTarget, setAssignmentTarget] = useState<{
    id: number;
    agentUserId: number;
    agentName: string;
  } | null>(null);
  const [assignmentAgentId, setAssignmentAgentId] = useState("");
  const [instanceToRemove, setInstanceToRemove] = useState<{
    id: number;
    agentName: string;
    templateName: string;
  } | null>(null);

  const serverStatus =
    statusFilter === "overdue" ? "in_progress" : statusFilter;
  const { data: rawInstances = [], isLoading } =
    trpc.onboarding.listInstances.useQuery({ status: serverStatus });
  const instances =
    statusFilter === "overdue"
      ? rawInstances.filter(instance => Number(instance.overdueTasks) > 0)
      : rawInstances;
  const { data: instanceDetail } = trpc.onboarding.getInstance.useQuery(
    { id: selectedInstanceId! },
    { enabled: Boolean(selectedInstanceId) }
  );
  const { data: agentUsers = [] } = trpc.users.list.useQuery(
    { role: "agent" },
    { enabled: user?.role === "admin" }
  );
  const activeAgents = agentUsers.filter(
    (agent: any) => agent.isActive !== false
  );

  const toggleTaskMut = trpc.onboarding.toggleTask.useMutation({
    onSuccess: () => {
      void utils.onboarding.getInstance.invalidate();
      void utils.onboarding.listInstances.invalidate();
      toast.success("Task updated");
    },
    onError: error => toast.error(error.message),
  });
  const bulkExtendMut = trpc.onboarding.bulkExtendDueDates.useMutation({
    onSuccess: () => {
      toast.success(`Due dates shifted by ${bulkDays} day(s)`);
      void utils.onboarding.getInstance.invalidate();
      void utils.onboarding.listInstances.invalidate();
      setShowBulkExtend(false);
    },
    onError: error => toast.error(error.message),
  });
  const updateTaskDueMut = trpc.onboarding.updateTaskDueDate.useMutation({
    onSuccess: () => {
      toast.success("Due date updated");
      void utils.onboarding.getInstance.invalidate();
      void utils.onboarding.listInstances.invalidate();
      setEditingTaskId(null);
    },
    onError: error => toast.error(error.message),
  });
  const updateAssignmentMut =
    trpc.onboarding.updateInstanceAssignment.useMutation({
      onSuccess: () => {
        toast.success("Onboarding assignment updated");
        void utils.onboarding.getInstance.invalidate();
        void utils.onboarding.listInstances.invalidate();
        setAssignmentTarget(null);
      },
      onError: error => toast.error(error.message),
    });
  const deleteInstanceMut = trpc.onboarding.deleteInstance.useMutation({
    onSuccess: () => {
      toast.success("Onboarding checklist removed");
      void utils.onboarding.getInstance.invalidate();
      void utils.onboarding.listInstances.invalidate();
      setSelectedInstanceId(null);
      setInstanceToRemove(null);
    },
    onError: error => toast.error(error.message),
  });

  const visibleTaskGroups = useMemo(() => {
    const tasks = (instanceDetail?.tasks ?? []) as OnboardingTask[];
    const matchesView = tasks.filter(
      task =>
        taskView === "all" ||
        (taskView === "completed" ? task.completed : !task.completed)
    );
    const incomplete = sortTasks(
      matchesView.filter(task => !task.completed),
      dueSort
    );
    const completed = sortTasks(
      matchesView.filter(task => task.completed),
      dueSort
    );
    return {
      incomplete: stageGroups(incomplete),
      completed: stageGroups(completed),
    };
  }, [instanceDetail?.tasks, taskView, dueSort]);

  if (user?.role !== "admin") return null;

  const inProgressCount = instances.filter(
    instance => instance.instance.status === "in_progress"
  ).length;
  const completedCount = instances.filter(
    instance => instance.instance.status === "completed"
  ).length;
  const overdueCount = instances.filter(
    instance => Number(instance.overdueTasks) > 0
  ).length;

  function openAssignment(instance: (typeof rawInstances)[number]) {
    const agentName =
      instance.agent?.name ?? instance.agent?.email ?? "this agent";
    setAssignmentTarget({
      id: instance.instance.id,
      agentUserId: instance.instance.agentUserId,
      agentName,
    });
    setAssignmentAgentId(String(instance.instance.agentUserId));
  }

  function renderTaskGroups(groups: [string, OnboardingTask[]][]) {
    if (!groups.length)
      return (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No tasks match this filter.
        </p>
      );
    return groups.map(([stageName, tasks]) => (
      <section key={stageName} className="space-y-2">
        <div className="flex items-center gap-2 border-b pb-2">
          <Layers3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{stageName}</h3>
          <Badge variant="secondary" className="text-xs">
            {tasks.length}
          </Badge>
        </div>
        {tasks.map(task => {
          const overdue = isOverdue(task.dueDate, task.completed);
          const isEditing = editingTaskId === task.id;
          return (
            <div
              key={task.id}
              className={`flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start ${task.completed ? "bg-muted/50" : overdue ? "border-red-500/30 bg-red-500/5" : "bg-card"}`}
            >
              <Checkbox
                checked={task.completed}
                onCheckedChange={checked =>
                  toggleTaskMut.mutate({
                    taskId: task.id,
                    completed: Boolean(checked),
                  })
                }
                className="mt-0.5"
                aria-label={`Mark ${task.title} ${task.completed ? "incomplete" : "complete"}`}
              />
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
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {task.assignee === "agent" ? "Agent task" : "Admin task"}
                  </Badge>
                  {isEditing ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="date"
                        value={editDueDate}
                        onChange={event => setEditDueDate(event.target.value)}
                        className="h-8 w-[150px] text-xs"
                      />
                      <Button
                        size="sm"
                        className="h-8"
                        onClick={() =>
                          updateTaskDueMut.mutate({
                            taskId: task.id,
                            dueDate: editDueDate || null,
                          })
                        }
                        disabled={updateTaskDueMut.isPending}
                      >
                        {updateTaskDueMut.isPending ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => setEditingTaskId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      {task.dueDate ? (
                        <span
                          className={`flex items-center gap-1 text-xs ${overdue ? "font-semibold text-red-600" : "text-muted-foreground"}`}
                        >
                          <Calendar className="h-3 w-3" />
                          {overdue ? "Overdue — " : "Due "}
                          {formatDueDate(task.dueDate)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No due date
                        </span>
                      )}
                      {!task.completed && (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs"
                          onClick={() => {
                            setEditingTaskId(task.id);
                            setEditDueDate(toInputDate(task.dueDate));
                          }}
                        >
                          <Pencil className="mr-1 h-3 w-3" />
                          {task.dueDate ? "Edit date" : "Set date"}
                        </Button>
                      )}
                    </>
                  )}
                  {task.completedAt && (
                    <span className="text-xs text-emerald-700">
                      Completed{" "}
                      {safeFormat(task.completedAt, "MMM d, yyyy h:mm a")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>
    ));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="On/Offboarding Tracker"
        subtitle="Review every checklist, adjust launched assignments, and keep task dates on track."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<Users className="h-5 w-5 text-blue-500" />}
          label="Total"
          value={instances.length}
        />
        <SummaryCard
          icon={<Clock className="h-5 w-5 text-amber-500" />}
          label="In Progress"
          value={inProgressCount}
        />
        <SummaryCard
          icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
          label="With Overdue Tasks"
          value={overdueCount}
        />
        <SummaryCard
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
          label="Completed"
          value={completedCount}
        />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="text-sm text-muted-foreground">Status:</span>
        <Select
          value={statusFilter}
          onValueChange={value => setStatusFilter(value as typeof statusFilter)}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">
          Loading...
        </div>
      ) : instances.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardCheck className="mx-auto mb-3 h-12 w-12 opacity-40" />
            <p className="text-lg font-medium">No onboarding instances yet</p>
            <p className="mt-1 text-sm">
              Start onboarding when adding a new team member.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {instances.map(item => {
            const total = Number(item.totalTasks);
            const completed = Number(item.completedTasks);
            const overdue = Number(item.overdueTasks);
            const pct = total ? Math.round((completed / total) * 100) : 0;
            const agentName =
              item.agent?.name ?? item.agent?.email ?? "Unknown Agent";
            return (
              <Card
                key={item.instance.id}
                className={`transition-shadow hover:shadow-md ${overdue > 0 ? "border-red-500/30" : ""}`}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold">{agentName}</span>
                        <Badge
                          variant={
                            item.instance.status === "completed"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {item.instance.status === "completed"
                            ? "Completed"
                            : "In Progress"}
                        </Badge>
                        {overdue > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            {overdue} overdue
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Template: {item.template?.name ?? "Unknown"} · Started{" "}
                        {safeFormat(item.instance.startedAt, "MMM d, yyyy")}
                        {item.instance.completedAt &&
                          ` · Completed ${safeFormat(item.instance.completedAt, "MMM d, yyyy")}`}
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        <Progress value={pct} className="h-2 flex-1" />
                        <span className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                          {completed}/{total} ({pct}%)
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAssignment(item)}
                      >
                        <Pencil className="mr-1 h-4 w-4" /> Edit Assignment
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setSelectedInstanceId(item.instance.id)}
                      >
                        <Eye className="mr-1 h-4 w-4" /> View Checklist
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="text-destructive"
                        aria-label={`Remove ${item.template?.name ?? "onboarding"} from ${agentName}`}
                        onClick={() =>
                          setInstanceToRemove({
                            id: item.instance.id,
                            agentName,
                            templateName:
                              item.template?.name ?? "Onboarding checklist",
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={Boolean(selectedInstanceId)}
        onOpenChange={open => {
          if (!open) {
            setSelectedInstanceId(null);
            setShowBulkExtend(false);
            setEditingTaskId(null);
            setTaskView("incomplete");
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Onboarding:{" "}
              {instanceDetail?.agent?.name ??
                instanceDetail?.agent?.email ??
                "Agent"}
            </DialogTitle>
            <DialogDescription>
              Review the full checklist, task ownership, due dates, and
              completion status.
            </DialogDescription>
          </DialogHeader>
          {instanceDetail && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    Template:{" "}
                    <strong className="text-foreground">
                      {instanceDetail.template?.name}
                    </strong>
                  </span>
                  <Badge
                    variant={
                      instanceDetail.instance.status === "completed"
                        ? "default"
                        : "secondary"
                    }
                  >
                    {instanceDetail.instance.status === "completed"
                      ? "Completed"
                      : "In Progress"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAssignmentTarget({
                        id: instanceDetail.instance.id,
                        agentUserId: instanceDetail.instance.agentUserId,
                        agentName:
                          instanceDetail.agent?.name ??
                          instanceDetail.agent?.email ??
                          "this agent",
                      });
                      setAssignmentAgentId(
                        String(instanceDetail.instance.agentUserId)
                      );
                    }}
                  >
                    <Pencil className="mr-1 h-4 w-4" />
                    Edit Assignment
                  </Button>
                  {instanceDetail.instance.status === "in_progress" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowBulkExtend(!showBulkExtend)}
                    >
                      <CalendarPlus className="mr-1 h-4 w-4" />
                      Bulk Extend
                    </Button>
                  )}
                </div>
              </div>
              {showBulkExtend && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-4">
                    <p className="mb-3 text-sm font-medium">
                      Shift every due date on this checklist
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">
                          Days to shift (negative to shorten)
                        </Label>
                        <Input
                          type="number"
                          value={bulkDays}
                          onChange={event => setBulkDays(event.target.value)}
                          min={-365}
                          max={365}
                          className="mt-1"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          const days = Number.parseInt(bulkDays, 10);
                          if (!Number.isFinite(days) || days === 0)
                            return toast.error(
                              "Enter a non-zero number of days"
                            );
                          bulkExtendMut.mutate({
                            instanceId: selectedInstanceId!,
                            days,
                          });
                        }}
                        disabled={bulkExtendMut.isPending}
                      >
                        {bulkExtendMut.isPending
                          ? "Updating..."
                          : `Shift ${Number.parseInt(bulkDays, 10) > 0 ? "+" : ""}${bulkDays} days`}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">
                    Show tasks
                  </Label>
                  <Select
                    value={taskView}
                    onValueChange={value => setTaskView(value as TaskView)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All tasks</SelectItem>
                      <SelectItem value="incomplete">
                        Incomplete tasks
                      </SelectItem>
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
              <div className="space-y-5">
                {renderTaskGroups(visibleTaskGroups.incomplete)}
                {visibleTaskGroups.completed.length > 0 &&
                  taskView !== "incomplete" && (
                    <section className="space-y-3 border-t pt-5">
                      <h3 className="text-sm font-semibold text-muted-foreground">
                        Completed tasks
                      </h3>
                      {renderTaskGroups(visibleTaskGroups.completed)}
                    </section>
                  )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(assignmentTarget)}
        onOpenChange={open =>
          !open && !updateAssignmentMut.isPending && setAssignmentTarget(null)
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Onboarding Assignment</DialogTitle>
            <DialogDescription>
              Move this already-launched checklist to a different active agent.
              Its task progress and dates stay intact.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Assigned agent</Label>
            <SearchableSelect
              className="mt-1 w-full"
              options={activeAgents.map((agent: any) => ({
                value: String(agent.id),
                label: agent.name ?? agent.email ?? `Agent #${agent.id}`,
              }))}
              value={assignmentAgentId}
              onValueChange={setAssignmentAgentId}
              placeholder="Select agent…"
              searchPlaceholder="Search agents…"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAssignmentTarget(null)}
              disabled={updateAssignmentMut.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={!assignmentAgentId || updateAssignmentMut.isPending}
              onClick={() =>
                assignmentTarget &&
                updateAssignmentMut.mutate({
                  id: assignmentTarget.id,
                  agentUserId: Number(assignmentAgentId),
                })
              }
            >
              {updateAssignmentMut.isPending ? "Saving..." : "Save Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(instanceToRemove)}
        onOpenChange={open =>
          !open && !deleteInstanceMut.isPending && setInstanceToRemove(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove onboarding checklist?</AlertDialogTitle>
            <AlertDialogDescription>
              {instanceToRemove
                ? `Remove “${instanceToRemove.templateName}” from ${instanceToRemove.agentName}? The checklist, its progress, and linked admin tasks will be deleted. This cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteInstanceMut.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteInstanceMut.isPending}
              onClick={event => {
                event.preventDefault();
                if (instanceToRemove)
                  deleteInstanceMut.mutate({ id: instanceToRemove.id });
              }}
            >
              {deleteInstanceMut.isPending ? "Removing..." : "Remove Checklist"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted p-2">{icon}</div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
