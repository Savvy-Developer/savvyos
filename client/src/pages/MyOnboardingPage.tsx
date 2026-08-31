import { useState } from "react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { ClipboardCheck, CheckCircle2, PartyPopper, Calendar, AlertTriangle, UserCheck, Users } from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";

type OnboardingTask = {
  id: number;
  title: string;
  description: string | null;
  assignee: "admin" | "agent";
  dueDate: Date | string | null;
  completed: boolean;
  completedAt: Date | string | null;
};

function isOverdue(dueDate: Date | string | null | undefined, completed: boolean): boolean {
  if (!dueDate || completed) return false;
  return new Date(dueDate).getTime() < Date.now();
}

function formatDueDate(dueDate: Date | string | null | undefined): string {
  return dueDate ? safeFormat(dueDate, "MMM d, yyyy") : "";
}

function daysUntilDue(dueDate: Date | string | null | undefined): number | null {
  if (!dueDate) return null;
  return Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function DueDateLabel({ dueDate, completed }: Pick<OnboardingTask, "dueDate" | "completed">) {
  if (!dueDate) return null;
  const overdue = isOverdue(dueDate, completed);
  const days = daysUntilDue(dueDate);
  if (completed) {
    return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Calendar className="h-3 w-3" />Was due {formatDueDate(dueDate)}</span>;
  }
  if (overdue) {
    return <span className="flex items-center gap-1 text-xs font-semibold text-red-600"><AlertTriangle className="h-3 w-3" />Overdue — was due {formatDueDate(dueDate)}</span>;
  }
  return (
    <span className={`flex items-center gap-1 text-xs ${days != null && days <= 2 ? "font-medium text-amber-600" : "text-muted-foreground"}`}>
      <Calendar className="h-3 w-3" />Due {formatDueDate(dueDate)}
      {days != null && days <= 2 && days >= 0 && <span className="ml-1">({days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`})</span>}
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
  if (!tasks.length) return <p className="py-3 text-sm text-muted-foreground">{emptyMessage}</p>;
  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const overdue = isOverdue(task.dueDate, task.completed);
        return (
          <Card key={task.id} className={`${task.completed ? "opacity-70" : ""} ${overdue ? "border-red-500/30" : ""}`}>
            <CardContent className="py-3">
              <div className="flex items-start gap-3">
                {canComplete ? (
                  <Checkbox
                    checked={task.completed}
                    onCheckedChange={(checked) => onToggle(task, Boolean(checked))}
                    className="mt-0.5"
                    aria-label={`Mark ${task.title} ${task.completed ? "incomplete" : "complete"}`}
                  />
                ) : (
                  <div className="mt-0.5" aria-label={task.completed ? "Completed by admin" : "Pending admin task"}>
                    {task.completed ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <div className="h-5 w-5 rounded border-2 border-muted-foreground/30" />}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${task.completed ? "text-muted-foreground line-through" : ""}`}>{task.title}</p>
                  {task.description && <p className="mt-0.5 text-sm text-muted-foreground">{task.description}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <DueDateLabel dueDate={task.dueDate} completed={task.completed} />
                    {task.completedAt && <span className="text-xs text-emerald-600">Completed {safeFormat(task.completedAt, "MMM d, yyyy h:mm a")}</span>}
                  </div>
                </div>
                {!canComplete && <Badge variant="outline" className="text-xs">Admin</Badge>}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function MyOnboardingPage() {
  const utils = trpc.useUtils();
  const [showCompleted, setShowCompleted] = useState(false);
  const { data: onboarding, isLoading } = trpc.onboarding.myOnboarding.useQuery();

  const toggleTaskMut = trpc.onboarding.toggleTask.useMutation({
    onSuccess: () => {
      utils.onboarding.myOnboarding.invalidate();
      utils.onboarding.hasActiveOnboarding.invalidate();
      toast.success("Task updated");
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading) {
    return <div className="space-y-6"><PageHeader title="Onboarding" /><div className="py-12 text-center text-muted-foreground">Loading...</div></div>;
  }

  if (!onboarding) {
    return (
      <div className="space-y-6">
        <PageHeader title="Onboarding" />
        <Card><CardContent className="py-16 text-center"><CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-emerald-500" /><h2 className="mb-2 text-xl font-semibold">All Caught Up!</h2><p className="text-muted-foreground">You have no active onboarding tasks. Your admin will set up a checklist whenever one is needed.</p></CardContent></Card>
      </div>
    );
  }

  const tasks = onboarding.tasks as OnboardingTask[];
  const agentTasks = tasks.filter((task) => task.assignee === "agent");
  const adminTasks = tasks.filter((task) => task.assignee === "admin");
  const visibleAgentTasks = showCompleted ? agentTasks : agentTasks.filter((task) => !task.completed);
  const visibleAdminTasks = showCompleted ? adminTasks : adminTasks.filter((task) => !task.completed);
  const completedTasks = tasks.filter((task) => task.completed).length;
  const overdueTasks = tasks.filter((task) => isOverdue(task.dueDate, task.completed)).length;
  const pct = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Onboarding" subtitle="Your onboarding tasks and the items your admin is handling" />
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{onboarding.template?.name ?? "Onboarding checklist"}</h3>
              <p className="text-sm text-muted-foreground">Started {safeFormat(onboarding.instance.startedAt, "MMMM d, yyyy")}</p>
            </div>
            <div className="flex items-center gap-2">
              {overdueTasks > 0 && <Badge variant="destructive" className="text-xs"><AlertTriangle className="mr-1 h-3 w-3" />{overdueTasks} overdue</Badge>}
              <Badge variant={pct === 100 ? "default" : "secondary"} className="text-sm">{pct === 100 ? "Complete!" : `${pct}% Done`}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-3"><Progress value={pct} className="h-3 flex-1" /><span className="whitespace-nowrap text-sm font-medium">{completedTasks}/{tasks.length}</span></div>
          <div className="mt-4 flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2.5">
            <div><p className="text-sm font-medium">Show completed tasks</p><p className="text-xs text-muted-foreground">Completed items are hidden by default so you can focus on what remains.</p></div>
            <Switch checked={showCompleted} onCheckedChange={setShowCompleted} aria-label="Show completed onboarding tasks" />
          </div>
        </CardContent>
      </Card>

      {pct === 100 && <Card className="border-emerald-500/30 bg-emerald-500/5"><CardContent className="py-6 text-center"><PartyPopper className="mx-auto mb-2 h-10 w-10 text-emerald-500" /><h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">Congratulations! You've completed all tasks!</h3><p className="mt-1 text-sm text-muted-foreground">All tasks are done. Great work!</p></CardContent></Card>}

      <Card>
        <CardContent className="py-1">
          <Accordion type="multiple" defaultValue={["your-tasks"]} className="w-full">
            <AccordionItem value="your-tasks">
              <AccordionTrigger className="py-4 no-underline hover:no-underline">
                <span className="flex items-center gap-2 text-left"><UserCheck className="h-5 w-5 text-primary" /><span><span className="block text-base font-semibold">Your Tasks</span><span className="block pt-0.5 text-xs font-normal text-muted-foreground">{visibleAgentTasks.length} remaining · check off items assigned to you</span></span></span>
              </AccordionTrigger>
              <AccordionContent><TaskList tasks={visibleAgentTasks} canComplete onToggle={(task, completed) => toggleTaskMut.mutate({ taskId: task.id, completed })} emptyMessage={showCompleted ? "No tasks have been assigned to you." : "You have completed all tasks assigned to you."} /></AccordionContent>
            </AccordionItem>
            <AccordionItem value="admin-tasks">
              <AccordionTrigger className="py-4 no-underline hover:no-underline">
                <span className="flex items-center gap-2 text-left"><Users className="h-5 w-5 text-primary" /><span><span className="block text-base font-semibold">Admin Tasks</span><span className="block pt-0.5 text-xs font-normal text-muted-foreground">{visibleAdminTasks.length} remaining · your admin is responsible for these items</span></span></span>
              </AccordionTrigger>
              <AccordionContent><TaskList tasks={visibleAdminTasks} canComplete={false} onToggle={() => undefined} emptyMessage={showCompleted ? "No admin tasks are on this checklist." : "Your admin has completed all tasks in this section."} /></AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
