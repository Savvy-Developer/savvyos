import { useMemo, useState } from "react";
import {
  addDays,
  addWeeks,
  differenceInCalendarDays,
  format,
  startOfWeek,
  subWeeks,
} from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Flag,
  FolderKanban,
  ListTodo,
  Milestone,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

const DAYS_VISIBLE = 84;

type TimelineEntry = {
  id: string;
  kind: "rock" | "project" | "milestone" | "todo";
  title: string;
  dueDate: Date | string;
  projectId: number;
  projectTitle: string;
};

const kindMeta = {
  rock: {
    label: "Rock",
    dot: "bg-violet-600",
    icon: Flag,
    detail: "text-violet-700",
  },
  project: {
    label: "Project",
    dot: "bg-primary",
    icon: FolderKanban,
    detail: "text-primary",
  },
  milestone: {
    label: "Milestone",
    dot: "bg-amber-500",
    icon: Milestone,
    detail: "text-amber-700",
  },
  todo: {
    label: "To-Do",
    dot: "bg-emerald-600",
    icon: ListTodo,
    detail: "text-emerald-700",
  },
} as const;

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

export default function ProjectsGanttView({ showAll }: { showAll: boolean }) {
  const [start, setStart] = useState(() =>
    startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 })
  );
  const { data = [], isLoading } = trpc.pm.projects.timeline.useQuery({
    showAll,
  });
  const entries = data as TimelineEntry[];
  const end = addDays(start, DAYS_VISIBLE - 1);
  const days = useMemo(
    () =>
      Array.from({ length: DAYS_VISIBLE }, (_, index) => addDays(start, index)),
    [start]
  );
  const visibleEntries = entries.filter(entry => {
    const due = toDate(entry.dueDate);
    return due >= start && due <= end;
  });
  const hiddenAfter = entries.filter(
    entry => toDate(entry.dueDate) > end
  ).length;
  const hiddenBefore = entries.filter(
    entry => toDate(entry.dueDate) < start
  ).length;
  const grouped = useMemo(() => {
    const groups = new Map<
      number,
      { projectTitle: string; entries: TimelineEntry[] }
    >();
    for (const entry of visibleEntries) {
      const group = groups.get(entry.projectId) ?? {
        projectTitle: entry.projectTitle,
        entries: [],
      };
      group.entries.push(entry);
      groups.set(entry.projectId, group);
    }
    return Array.from(groups.entries()).map(([projectId, group]) => ({
      projectId,
      projectTitle: group.projectTitle,
      entries: [...group.entries].sort(
        (left, right) =>
          toDate(left.dueDate).getTime() - toDate(right.dueDate).getTime()
      ),
    }));
  }, [visibleEntries]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Gantt Chart</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Due-date timeline for Rocks, projects, milestone sections, and open
            project To-Dos. A marker indicates the committed due date because
            projects do not currently store start dates.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md border bg-background p-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setStart(current => subWeeks(current, 12))}
            aria-label="Show earlier dates"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() =>
              setStart(
                startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 })
              )
            }
          >
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setStart(current => addWeeks(current, 12))}
            aria-label="Show later dates"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {Object.entries(kindMeta).map(([kind, meta]) => (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        ))}
        <span className="ml-auto">
          {format(start, "MMM d, yyyy")} – {format(end, "MMM d, yyyy")}
        </span>
      </div>

      {isLoading ? (
        <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
          Loading timeline…
        </div>
      ) : null}
      {!isLoading && entries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No dated Rocks, projects, milestones, or open To-Dos are available in
          your Projects workspace.
        </div>
      ) : null}
      {!isLoading && entries.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <div className="min-w-[1050px]">
            <div
              className="grid border-b bg-muted/35"
              style={{ gridTemplateColumns: "19rem minmax(0, 1fr)" }}
            >
            <div className="sticky left-0 z-20 border-r bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
                Work item
              </div>
              <div className="relative h-10 overflow-hidden">
                {days.map((day, index) =>
                  day.getDay() === 1 || index === 0 ? (
                    <div
                      key={day.toISOString()}
                      className="absolute top-0 h-full border-l border-border px-1.5 pt-2 text-[10px] font-medium text-muted-foreground"
                      style={{ left: `${(index / DAYS_VISIBLE) * 100}%` }}
                    >
                      {format(day, "MMM d")}
                    </div>
                  ) : null
                )}
                <div className="absolute inset-x-0 bottom-0 flex h-3">
                  {days.map(day => (
                    <span
                      key={day.toISOString()}
                      className={`flex-1 border-l border-border/45 ${day.getDay() === 0 || day.getDay() === 6 ? "bg-muted/30" : ""}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            {grouped.map(group => (
              <div key={group.projectId}>
                <a
                  href={`/projects/${group.projectId}`}
                  className="grid border-b bg-primary/[0.035] hover:bg-primary/[0.075]"
                  style={{ gridTemplateColumns: "19rem minmax(0, 1fr)" }}
                >
              <div className="sticky left-0 z-10 truncate border-r bg-card px-3 py-2 text-xs font-semibold text-primary">
                    {group.projectTitle}
                  </div>
                  <div className="h-8" />
                </a>
                {group.entries.map(entry => {
                  const due = toDate(entry.dueDate);
                  const dayIndex = differenceInCalendarDays(due, start);
                  const percent = ((dayIndex + 0.5) / DAYS_VISIBLE) * 100;
                  const meta = kindMeta[entry.kind];
                  const Icon = meta.icon;
                  return (
                    <a
                      key={entry.id}
                      href={`/projects/${entry.projectId}${entry.kind === "todo" ? `?tab=tasks#todo-${entry.id.replace("todo-", "")}` : ""}`}
                      className="grid border-b last:border-b-0 hover:bg-muted/35"
                      style={{ gridTemplateColumns: "19rem minmax(0, 1fr)" }}
                    >
                      <div className="sticky left-0 z-10 flex min-w-0 items-center gap-2 border-r bg-card px-3 py-2">
                        <Icon
                          className={`h-3.5 w-3.5 shrink-0 ${meta.detail}`}
                        />
                        <span className="min-w-0 truncate text-sm">
                          {entry.title}
                        </span>
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                          {format(due, "MMM d")}
                        </span>
                      </div>
                      <div className="relative min-h-9 overflow-hidden">
                        {days.map(day => (
                          <span
                            key={day.toISOString()}
                            className={`absolute inset-y-0 border-l border-border/45 ${day.getDay() === 0 || day.getDay() === 6 ? "bg-muted/20" : ""}`}
                            style={{
                              left: `${(differenceInCalendarDays(day, start) / DAYS_VISIBLE) * 100}%`,
                              width: `${100 / DAYS_VISIBLE}%`,
                            }}
                          />
                        ))}
                        <span
                          title={`${entry.title} · due ${format(due, "MMM d, yyyy")}`}
                          className={`absolute top-1/2 z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-card ${meta.dot} shadow-sm`}
                          style={{ left: `${percent}%` }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
            ))}
            {grouped.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No due dates fall in this 12-week window. Use the arrows to
                browse the timeline.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {hiddenBefore || hiddenAfter ? (
        <p className="text-xs text-muted-foreground">
          {hiddenBefore
            ? `${hiddenBefore} item${hiddenBefore === 1 ? "" : "s"} due earlier. `
            : ""}
          {hiddenAfter
            ? `${hiddenAfter} item${hiddenAfter === 1 ? "" : "s"} due later.`
            : ""}
        </p>
      ) : null}
    </section>
  );
}
