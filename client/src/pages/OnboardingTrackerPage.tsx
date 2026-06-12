import { useState, useMemo } from "react";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Users,
  ClipboardCheck,
  Clock,
  CheckCircle2,
  Eye,
  UserCheck,
  AlertTriangle,
  Calendar,
  CalendarPlus,
  Bell,
  Pencil,
} from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";

function isOverdue(dueDate: Date | string | null | undefined, completed: boolean): boolean {
  if (!dueDate || completed) return false;
  const due = new Date(dueDate);
  return due.getTime() < Date.now();
}

function formatDueDate(dueDate: Date | string | null | undefined): string {
  if (!dueDate) return "";
  return safeFormat(dueDate, "MMM d, yyyy");
}

function toInputDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  return date.toISOString().split("T")[0];
}

export default function OnboardingTrackerPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<"all" | "in_progress" | "completed" | "overdue">("all");
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | null>(null);
  const [bulkDays, setBulkDays] = useState<string>("7");
  const [showBulkExtend, setShowBulkExtend] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editDueDate, setEditDueDate] = useState<string>("");

  // "overdue" is client-side only — fetch in_progress and filter by overdueTasks > 0
  const serverStatus = statusFilter === "overdue" ? "in_progress" : statusFilter;
  const { data: rawInstances = [], isLoading } = trpc.onboarding.listInstances.useQuery({ status: serverStatus as any });
  const instances = statusFilter === "overdue"
    ? rawInstances.filter((i) => Number(i.overdueTasks) > 0)
    : rawInstances;
  const { data: instanceDetail } = trpc.onboarding.getInstance.useQuery(
    { id: selectedInstanceId! },
    { enabled: !!selectedInstanceId }
  );

  const toggleTaskMut = trpc.onboarding.toggleTask.useMutation({
    onSuccess: () => {
      utils.onboarding.getInstance.invalidate();
      utils.onboarding.listInstances.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkExtendMut = trpc.onboarding.bulkExtendDueDates.useMutation({
    onSuccess: () => {
      toast.success(`Due dates shifted by ${bulkDays} day(s)`);
      utils.onboarding.getInstance.invalidate();
      utils.onboarding.listInstances.invalidate();
      setShowBulkExtend(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateTaskDueMut = trpc.onboarding.updateTaskDueDate.useMutation({
    onSuccess: () => {
      toast.success("Due date updated");
      utils.onboarding.getInstance.invalidate();
      utils.onboarding.listInstances.invalidate();
      setEditingTaskId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const triggerOverdueMut = trpc.onboarding.triggerOverdueCheck.useMutation({
    onSuccess: () => toast.success("Overdue check completed — emails sent if any overdue tasks found"),
    onError: (e) => toast.error(e.message),
  });

  if (user?.role !== "admin") return null;

  const inProgressCount = instances.filter((i) => i.instance.status === "in_progress").length;
  const completedCount = instances.filter((i) => i.instance.status === "completed").length;
  const overdueCount = instances.filter((i) => Number(i.overdueTasks) > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="On/Offboarding Tracker"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => triggerOverdueMut.mutate()}
            disabled={triggerOverdueMut.isPending}
          >
            <Bell className="h-4 w-4 mr-1" />
            {triggerOverdueMut.isPending ? "Sending..." : "Send Overdue Alerts"}
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{instances.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold">{inProgressCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overdue Tasks</p>
                <p className="text-2xl font-bold">{overdueCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{completedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Status:</span>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-[180px]">
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

      {/* Instances List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : instances.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">No onboarding instances yet</p>
            <p className="text-sm mt-1">Start onboarding when adding a new team member.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {instances.map((item) => {
            const total = Number(item.totalTasks);
            const completed = Number(item.completedTasks);
            const overdue = Number(item.overdueTasks);
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
            return (
              <Card key={item.instance.id} className={`hover:shadow-md transition-shadow ${overdue > 0 ? "border-red-500/30" : ""}`}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold truncate">
                          {item.agent?.name ?? item.agent?.email ?? "Unknown Agent"}
                        </span>
                        <Badge variant={item.instance.status === "completed" ? "default" : "secondary"}>
                          {item.instance.status === "completed" ? "Completed" : "In Progress"}
                        </Badge>
                        {overdue > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {overdue} overdue
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Template: {item.template?.name ?? "Unknown"} &middot; Started {safeFormat(item.instance.startedAt, "MMM d, yyyy")}
                        {item.instance.completedAt && ` · Completed ${safeFormat(item.instance.completedAt, "MMM d, yyyy")}`}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <Progress value={pct} className="flex-1 h-2" />
                        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                          {completed}/{total} tasks ({pct}%)
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedInstanceId(item.instance.id)}
                    >
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Instance Detail Dialog */}
      <Dialog open={!!selectedInstanceId} onOpenChange={(o) => { if (!o) { setSelectedInstanceId(null); setShowBulkExtend(false); setEditingTaskId(null); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Onboarding: {instanceDetail?.agent?.name ?? "Agent"}
            </DialogTitle>
          </DialogHeader>
          {instanceDetail && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Template: <strong className="text-foreground">{instanceDetail.template?.name}</strong></span>
                  <Badge variant={instanceDetail.instance.status === "completed" ? "default" : "secondary"}>
                    {instanceDetail.instance.status === "completed" ? "Completed" : "In Progress"}
                  </Badge>
                </div>
                {instanceDetail.instance.status === "in_progress" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBulkExtend(!showBulkExtend)}
                  >
                    <CalendarPlus className="h-4 w-4 mr-1" />
                    Bulk Extend Dates
                  </Button>
                )}
              </div>

              {/* Bulk Extend Panel */}
              {showBulkExtend && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="py-4">
                    <p className="text-sm font-medium mb-3">Shift all due dates by a number of days</p>
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">Days to shift (negative to shorten)</Label>
                        <Input
                          type="number"
                          value={bulkDays}
                          onChange={(e) => setBulkDays(e.target.value)}
                          min={-365}
                          max={365}
                          className="mt-1"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          const days = parseInt(bulkDays);
                          if (isNaN(days) || days === 0) {
                            toast.error("Enter a non-zero number of days");
                            return;
                          }
                          bulkExtendMut.mutate({ instanceId: selectedInstanceId!, days });
                        }}
                        disabled={bulkExtendMut.isPending}
                      >
                        {bulkExtendMut.isPending ? "Updating..." : `Shift ${parseInt(bulkDays) > 0 ? "+" : ""}${bulkDays} days`}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-2">
                {instanceDetail.tasks.map((task) => {
                  const overdue = isOverdue(task.dueDate, task.completed);
                  const isEditing = editingTaskId === task.id;
                  return (
                    <div
                      key={task.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        task.completed ? "bg-muted/50" : overdue ? "bg-red-500/5 border-red-500/30" : "bg-card"
                      }`}
                    >
                      <Checkbox
                        checked={task.completed}
                        onCheckedChange={(checked) =>
                          toggleTaskMut.mutate({ taskId: task.id, completed: !!checked })
                        }
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium ${task.completed ? "line-through text-muted-foreground" : ""}`}>
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">{task.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {task.assignee === "agent" ? "Agent task" : "Admin task"}
                          </Badge>

                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="date"
                                value={editDueDate}
                                onChange={(e) => setEditDueDate(e.target.value)}
                                className="h-7 text-xs w-[140px]"
                              />
                              <Button
                                variant="default"
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={() => {
                                  updateTaskDueMut.mutate({
                                    taskId: task.id,
                                    dueDate: editDueDate || null,
                                  });
                                }}
                                disabled={updateTaskDueMut.isPending}
                              >
                                Save
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={() => setEditingTaskId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <>
                              {task.dueDate && (
                                <span className={`text-xs flex items-center gap-1 ${
                                  overdue ? "text-red-600 font-semibold" : "text-muted-foreground"
                                }`}>
                                  <Calendar className="h-3 w-3" />
                                  {overdue ? "Overdue — " : "Due "}
                                  {formatDueDate(task.dueDate)}
                                </span>
                              )}
                              {!task.completed && (
                                <button
                                  className="text-xs text-primary hover:underline flex items-center gap-0.5"
                                  onClick={() => {
                                    setEditingTaskId(task.id);
                                    setEditDueDate(toInputDate(task.dueDate));
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                  {task.dueDate ? "Edit" : "Set date"}
                                </button>
                              )}
                            </>
                          )}

                          {task.completedAt && (
                            <span className="text-xs text-muted-foreground">
                              Completed {safeFormat(task.completedAt, "MMM d, yyyy h:mm a")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
