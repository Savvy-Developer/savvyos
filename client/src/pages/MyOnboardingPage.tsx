import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ClipboardCheck, CheckCircle2, PartyPopper, Calendar, AlertTriangle } from "lucide-react";
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

function daysUntilDue(dueDate: Date | string | null | undefined): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function DueDateLabel({ dueDate, completed }: { dueDate: Date | string | null | undefined; completed: boolean }) {
  if (!dueDate) return null;
  const overdue = isOverdue(dueDate, completed);
  const days = daysUntilDue(dueDate);

  if (completed) {
    return (
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        <Calendar className="h-3 w-3" />
        Was due {formatDueDate(dueDate)}
      </span>
    );
  }

  if (overdue) {
    return (
      <span className="text-xs text-red-600 font-semibold flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        Overdue — was due {formatDueDate(dueDate)}
      </span>
    );
  }

  return (
    <span className={`text-xs flex items-center gap-1 ${days != null && days <= 2 ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
      <Calendar className="h-3 w-3" />
      Due {formatDueDate(dueDate)}
      {days != null && days <= 2 && days >= 0 && (
        <span className="ml-1">({days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`})</span>
      )}
    </span>
  );
}

export default function MyOnboardingPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: onboarding, isLoading } = trpc.onboarding.myOnboarding.useQuery();

  const toggleTaskMut = trpc.onboarding.toggleTask.useMutation({
    onSuccess: () => {
      utils.onboarding.myOnboarding.invalidate();
      utils.onboarding.hasActiveOnboarding.invalidate();
      toast.success("Task updated");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Checklist" />
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!onboarding) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Checklist" />
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-emerald-500" />
            <h2 className="text-xl font-semibold mb-2">All Caught Up!</h2>
            <p className="text-muted-foreground">
              You have no active tasks. If you just joined or are departing, your admin will set up your checklist soon.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tasks = onboarding.tasks;
  const agentTasks = tasks.filter((t) => t.assignee === "agent");
  const adminTasks = tasks.filter((t) => t.assignee === "admin");
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.completed).length;
  const overdueTasks = tasks.filter((t) => isOverdue(t.dueDate, t.completed)).length;
  const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="My Checklist" />

      {/* Progress Overview */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-lg">{onboarding.template?.name ?? "Checklist"}</h3>
              <p className="text-sm text-muted-foreground">
                Started {safeFormat(onboarding.instance.startedAt, "MMMM d, yyyy")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {overdueTasks > 0 && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {overdueTasks} overdue
                </Badge>
              )}
              <Badge variant={pct === 100 ? "default" : "secondary"} className="text-sm">
                {pct === 100 ? "Complete!" : `${pct}% Done`}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Progress value={pct} className="flex-1 h-3" />
            <span className="text-sm font-medium whitespace-nowrap">
              {completedTasks}/{totalTasks}
            </span>
          </div>
        </CardContent>
      </Card>

      {pct === 100 && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="py-6 text-center">
            <PartyPopper className="h-10 w-10 mx-auto mb-2 text-emerald-500" />
            <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
              Congratulations! You've completed all tasks!
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              All tasks are done. Great work!
            </p>
          </CardContent>
        </Card>
      )}

      {/* Your Tasks (agent-assigned) */}
      {agentTasks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Your Tasks
          </h3>
          <p className="text-sm text-muted-foreground">
            These tasks are assigned to you. Check them off as you complete them.
          </p>
          <div className="space-y-2">
            {agentTasks.map((task) => {
              const overdue = isOverdue(task.dueDate, task.completed);
              return (
                <Card key={task.id} className={`${task.completed ? "opacity-70" : ""} ${overdue ? "border-red-500/30" : ""}`}>
                  <CardContent className="py-3">
                    <div className="flex items-start gap-3">
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
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <DueDateLabel dueDate={task.dueDate} completed={task.completed} />
                          {task.completedAt && (
                            <span className="text-xs text-emerald-600">
                              Completed {safeFormat(task.completedAt, "MMM d, yyyy h:mm a")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin Tasks (read-only for agent) */}
      {adminTasks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Admin Tasks
          </h3>
          <p className="text-sm text-muted-foreground">
            These tasks are handled by your admin. You can track their progress here.
          </p>
          <div className="space-y-2">
            {adminTasks.map((task) => {
              const overdue = isOverdue(task.dueDate, task.completed);
              return (
                <Card key={task.id} className={`${task.completed ? "opacity-70" : ""} ${overdue ? "border-red-500/30" : ""}`}>
                  <CardContent className="py-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {task.completed ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <div className="h-5 w-5 rounded border-2 border-muted-foreground/30" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium ${task.completed ? "line-through text-muted-foreground" : ""}`}>
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">{task.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <DueDateLabel dueDate={task.dueDate} completed={task.completed} />
                          {task.completedAt && (
                            <span className="text-xs text-emerald-600">
                              Completed {safeFormat(task.completedAt, "MMM d, yyyy h:mm a")}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">Admin</Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
