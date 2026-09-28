import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  ListChecks,
  Milestone,
  UserRound,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type HubProject = any;

type Group = {
  id: "off_track" | "at_risk" | "on_track" | "missing" | "due";
  label: string;
  description: string;
  className: string;
};

const groups: Group[] = [
  {
    id: "off_track",
    label: "Off Track",
    description: "Needs leadership attention",
    className: "border-rose-200 bg-rose-50/60",
  },
  {
    id: "at_risk",
    label: "At Risk",
    description: "Monitor or unblock",
    className: "border-amber-200 bg-amber-50/60",
  },
  {
    id: "on_track",
    label: "On Track",
    description: "Submitted as expected",
    className: "border-emerald-200 bg-emerald-50/60",
  },
  {
    id: "missing",
    label: "Missing",
    description: "No update after the deadline",
    className: "border-slate-200 bg-slate-50/80",
  },
  {
    id: "due",
    label: "Due This Week",
    description: "Awaiting the reporting owner",
    className: "border-slate-200 bg-slate-50/80",
  },
];

function groupId(project: HubProject): Group["id"] {
  if (!project.update)
    return project.submissionStatus === "missing" ? "missing" : "due";
  return project.health as Group["id"];
}

function formatWeek(weekOf: string) {
  return `Week of ${format(new Date(`${weekOf}T12:00:00`), "MMM d, yyyy")}`;
}

function dateLabel(value: string | Date | null | undefined) {
  return value ? format(new Date(value), "MMM d, yyyy") : "Not set";
}

function lifecycleLabel(project: HubProject) {
  if (project.isRock) {
    return (
      (
        {
          on_track: "On Track",
          at_risk: "At Risk",
          off_track: "Off Track",
          done: "Done",
          dropped: "Dropped",
        } as Record<string, string>
      )[project.rockStatus] ?? project.rockStatus
    );
  }
  return (
    (
      {
        not_started: "Not Started",
        in_progress: "In Progress",
        at_risk: "At Risk",
        completed: "Completed",
      } as Record<string, string>
    )[project.status] ?? project.status
  );
}

function submissionLabel(project: HubProject) {
  if (!project.update)
    return project.submissionStatus === "missing" ? "Missing" : "Due";
  return project.update.reportStatus === "late" ? "Late" : "Submitted";
}

export default function ProjectsWeeklyUpdatesHub() {
  const [, navigate] = useLocation();
  const [weekOf, setWeekOf] = useState<string | undefined>();
  const [openProjectIds, setOpenProjectIds] = useState<number[]>([]);
  const { data, refetch, isLoading } = trpc.pm.weeklyUpdates.hub.useQuery(
    weekOf ? { weekOf } : undefined,
    { refetchInterval: 30_000 }
  );
  const review = trpc.pm.weeklyUpdates.review.useMutation({
    onSuccess: () => {
      toast.success("Review updated");
      void refetch();
    },
    onError: error => toast.error(error.message),
  });

  const projects = (data?.projects ?? []) as HubProject[];
  const summary = useMemo(
    () => ({
      total: projects.length,
      submitted: projects.filter(project => project.update).length,
      late: projects.filter(project => project.update?.reportStatus === "late")
        .length,
      missing: projects.filter(
        project => project.submissionStatus === "missing"
      ).length,
    }),
    [projects]
  );

  if (isLoading)
    return (
      <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
        Loading weekly project updates…
      </div>
    );

  return (
    <section className="space-y-4">
      <div className="flex flex-col justify-between gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-start sm:p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">Weekly Update Hub</h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              Restricted Projects review
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            A compact review of reportable Projects and Rocks. Counts are
            captured when each owner saves their update.
          </p>
        </div>
        <div className="w-full sm:w-52">
          <Select
            value={data?.weekOf ?? weekOf ?? ""}
            onValueChange={value => setWeekOf(value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(data?.weekOptions ?? []).map(option => (
                <SelectItem key={option} value={option}>
                  {option === data?.weekOf
                    ? data.weekLabel
                    : formatWeek(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xl font-bold">
            {summary.submitted}
            <span className="text-sm font-medium text-muted-foreground">
              /{summary.total}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">Updated</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xl font-bold text-amber-700">{summary.late}</p>
          <p className="text-xs text-muted-foreground">Late</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xl font-bold text-rose-700">{summary.missing}</p>
          <p className="text-xs text-muted-foreground">Missing</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-sm font-semibold">
            {data?.isLate ? "Late window" : "Open"}
          </p>
          <p className="text-xs text-muted-foreground">Thu 6 PM deadline</p>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No active reportable Projects for this week.
        </div>
      ) : (
        groups.map(group => {
          const groupProjects = projects.filter(
            project => groupId(project) === group.id
          );
          if (!groupProjects.length) return null;
          return (
            <section
              key={group.id}
              className={cn(
                "overflow-hidden rounded-lg border",
                group.className
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-inherit px-3 py-2.5 sm:px-4">
                <div>
                  <h3 className="font-semibold">
                    {group.label}{" "}
                    <span className="text-sm font-medium text-muted-foreground">
                      ({groupProjects.length})
                    </span>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {group.description}
                  </p>
                </div>
              </div>
              <div className="space-y-px bg-border/40">
                {groupProjects.map(project => {
                  const isOpen = openProjectIds.includes(project.id);
                  const update = project.update;
                  const metrics = project.metrics;
                  return (
                    <article key={project.id} className="bg-card">
                      <button
                        type="button"
                        className="flex w-full flex-col gap-2 px-3 py-3 text-left transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:gap-3 sm:px-4"
                        onClick={() =>
                          setOpenProjectIds(current =>
                            current.includes(project.id)
                              ? current.filter(id => id !== project.id)
                              : [...current, project.id]
                          )
                        }
                      >
                        <span
                          className={cn(
                            "mt-1 hidden h-2.5 w-2.5 shrink-0 rounded-full sm:block",
                            group.id === "off_track"
                              ? "bg-rose-500"
                              : group.id === "at_risk"
                                ? "bg-amber-500"
                                : group.id === "on_track"
                                  ? "bg-emerald-500"
                                  : "bg-slate-400"
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">{project.title}</span>
                            {project.isRock ? (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                                Rock
                              </span>
                            ) : null}
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {lifecycleLabel(project)}
                            </span>
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                                project.submissionStatus === "missing"
                                  ? "bg-rose-100 text-rose-800"
                                  : project.submissionStatus === "due"
                                    ? "bg-slate-100 text-slate-700"
                                    : project.update?.reportStatus === "late"
                                      ? "bg-amber-100 text-amber-900"
                                      : "bg-emerald-100 text-emerald-800"
                              )}
                            >
                              {submissionLabel(project)}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <UserRound className="h-3 w-3" />
                              {project.reportingOwnerName}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <ListChecks className="h-3 w-3" />
                              {metrics.taskCompleted}/{metrics.taskTotal} To-Dos
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Milestone className="h-3 w-3" />
                              {metrics.milestoneCompleted}/
                              {metrics.milestoneTotal} milestones
                            </span>
                            {metrics.overdueTaskCount ? (
                              <span className="inline-flex items-center gap-1 text-rose-700">
                                <AlertTriangle className="h-3 w-3" />
                                {metrics.overdueTaskCount} overdue
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground sm:w-60 sm:justify-end">
                          <span className="hidden text-right sm:block">
                            {metrics.nextMilestoneTitle
                              ? `${metrics.nextMilestoneTitle} · ${dateLabel(metrics.nextMilestoneDueDate)}`
                              : `Target ${dateLabel(metrics.targetDate)}`}
                          </span>
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </div>
                      </button>
                      {isOpen ? (
                        <div className="border-t bg-muted/[0.12] px-3 py-3 sm:px-4">
                          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem]">
                            <div className="space-y-3">
                              {update ? (
                                <>
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                      Current state
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap text-sm">
                                      {update.currentState}
                                    </p>
                                  </div>
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Timeline
                                      </p>
                                      <p className="mt-1 text-sm">
                                        {update.timelineOnTrack
                                          ? `On track for ${dateLabel(update.snapshotTargetDate)}`
                                          : `Revised target: ${dateLabel(update.revisedTargetDate)}`}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Next week’s priority
                                      </p>
                                      <p className="mt-1 text-sm">
                                        {update.nextWeekPriority}
                                      </p>
                                    </div>
                                  </div>
                                  {update.topObstacle ? (
                                    <div className="rounded-md border border-amber-200 bg-amber-50/50 p-2.5 text-sm">
                                      <p className="font-semibold">Obstacle</p>
                                      <p className="mt-0.5 whitespace-pre-wrap">
                                        {update.topObstacle}
                                      </p>
                                      <p className="mt-2 text-xs">
                                        <span className="font-semibold">
                                          Proposed fix:
                                        </span>{" "}
                                        {update.proposedFix}
                                      </p>
                                    </div>
                                  ) : null}
                                  {update.askSummary ? (
                                    <div className="rounded-md border border-primary/20 bg-primary/[0.025] p-2.5 text-sm">
                                      <p className="flex items-center gap-1.5 font-semibold">
                                        <CircleHelp className="h-4 w-4 text-primary" />
                                        Open ask
                                      </p>
                                      <p className="mt-1">
                                        {update.askSummary}
                                      </p>
                                      <p className="mt-1 text-xs">
                                        <span className="font-semibold">
                                          Needed from:
                                        </span>{" "}
                                        {update.askNeededFromName ?? "Teammate"}{" "}
                                        ·{" "}
                                        <span className="font-semibold">
                                          By:
                                        </span>{" "}
                                        {dateLabel(update.askNeededBy)}
                                      </p>
                                      <p className="mt-1 text-xs">
                                        <span className="font-semibold">
                                          Proposed solution:
                                        </span>{" "}
                                        {update.askProposedSolution}
                                      </p>
                                    </div>
                                  ) : null}
                                </>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  No update has been submitted for this week.
                                </p>
                              )}
                            </div>
                            <aside className="space-y-2 rounded-md border bg-background p-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Automatic context
                                </p>
                                <p className="mt-1 text-sm">
                                  Target: {dateLabel(metrics.targetDate)}
                                </p>
                                <p className="mt-1 text-sm">
                                  Next milestone:{" "}
                                  {metrics.nextMilestoneTitle ?? "None"}
                                  {metrics.nextMilestoneDueDate
                                    ? ` · ${dateLabel(metrics.nextMilestoneDueDate)}`
                                    : ""}
                                </p>
                              </div>
                              {update ? (
                                <>
                                  <div className="border-t pt-2 text-xs text-muted-foreground">
                                    Submitted by {update.authorName} ·{" "}
                                    {format(
                                      new Date(update.updatedAt),
                                      "MMM d, h:mm a"
                                    )}
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={
                                      update.reviewedAt
                                        ? "secondary"
                                        : "outline"
                                    }
                                    className="w-full"
                                    disabled={review.isPending}
                                    onClick={() =>
                                      review.mutate({
                                        updateId: update.id,
                                        reviewed: !update.reviewedAt,
                                      })
                                    }
                                  >
                                    {update.reviewedAt ? (
                                      <>
                                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                        Reviewed
                                      </>
                                    ) : (
                                      <>
                                        <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
                                        Mark reviewed
                                      </>
                                    )}
                                  </Button>
                                </>
                              ) : null}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="w-full"
                                onClick={() =>
                                  navigate(
                                    `/projects/${project.id}?tab=updates`
                                  )
                                }
                              >
                                Open Project
                              </Button>
                            </aside>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </section>
  );
}
