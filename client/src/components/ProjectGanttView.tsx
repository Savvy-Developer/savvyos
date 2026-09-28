import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  addDays,
  addWeeks,
  differenceInCalendarDays,
  format,
  isBefore,
  startOfDay,
  startOfWeek,
  subWeeks,
} from "date-fns";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Flag,
  GitBranch,
  ListTodo,
  Milestone,
  Pencil,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const DAYS_VISIBLE = 84;
const TABLE_COLUMNS = "minmax(20rem, 24rem) minmax(44rem, 1fr)";

type TodoStatus = "not_started" | "in_progress" | "blocked" | "completed";

type GanttTask = {
  id: number;
  title: string;
  parentTaskId: number | null;
  sectionId: number | null;
  ownerId: number;
  ownerName?: string | null;
  startDate?: Date | string | null;
  dueDate?: Date | string | null;
  status?: TodoStatus | null;
  completed: boolean;
  createdAt: Date | string;
  predecessorTaskIds?: number[];
  predecessors?: Array<{
    id: number;
    title: string;
    completed: boolean;
    dueDate?: Date | string | null;
  }>;
};

type GanttSection = {
  id: number;
  title: string;
  description?: string | null;
  dueDate?: Date | string | null;
  predecessorMilestoneIds?: number[];
  predecessors?: Array<{
    id: number;
    title: string;
    projectId: number;
    projectTitle: string;
    dueDate?: Date | string | null;
  }>;
};

type TaskRow = {
  type: "task";
  id: string;
  task: GanttTask;
  title: string;
  startDate: Date;
  dueDate: Date;
  indent: number;
};

type SectionRow = {
  type: "section";
  id: string;
  section: GanttSection | null;
  title: string;
  dueDate: Date | null;
  openCount: number;
  overdueCount: number;
  taskIds: number[];
};

type ProjectRow = {
  type: "project";
  id: string;
  title: string;
  dueDate: Date;
  isRock: boolean;
};

type GanttRow = TaskRow | SectionRow | ProjectRow;

type DependencyPath = {
  id: string;
  path: string;
  atRisk: boolean;
  label: string;
};

type ScheduleForm = {
  startDate: string;
  dueDate: string;
  status: TodoStatus;
  ownerId: string;
};

const TASK_STATUS_META: Record<
  TodoStatus,
  { label: string; bar: string; badge: string }
> = {
  not_started: {
    label: "Not Started",
    bar: "bg-slate-500 hover:bg-slate-600",
    badge: "border-slate-200 bg-slate-50 text-slate-700",
  },
  in_progress: {
    label: "In Progress",
    bar: "bg-blue-600 hover:bg-blue-700",
    badge: "border-blue-200 bg-blue-50 text-blue-800",
  },
  blocked: {
    label: "Blocked",
    bar: "bg-rose-600 hover:bg-rose-700",
    badge: "border-rose-200 bg-rose-50 text-rose-800",
  },
  completed: {
    label: "Completed",
    bar: "bg-emerald-600/55 hover:bg-emerald-600/70",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
};

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function toDateInput(value: Date | string | null | undefined) {
  return value ? format(asDate(value), "yyyy-MM-dd") : "";
}

function taskStatus(task: GanttTask): TodoStatus {
  return (task.status ??
    (task.completed ? "completed" : "not_started")) as TodoStatus;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function daysToPercent(days: number) {
  return (days / DAYS_VISIBLE) * 100;
}

function isTaskOverdue(task: GanttTask, today: Date) {
  return (
    !task.completed && !!task.dueDate && isBefore(asDate(task.dueDate), today)
  );
}

function isDependencyAtRisk(task: GanttTask, predecessor: NonNullable<GanttTask["predecessors"]>[number]) {
  if (!predecessor.completed) return true;
  if (!predecessor.dueDate) return false;
  const dependentStartDate = asDate(task.startDate ?? task.createdAt);
  return asDate(predecessor.dueDate) > dependentStartDate;
}

function scheduleDates(task: GanttTask) {
  const startDate = asDate(task.startDate ?? task.createdAt);
  const dueDate = asDate(task.dueDate!);
  return {
    startDate: startDate <= dueDate ? startDate : dueDate,
    dueDate,
  };
}

export default function ProjectGanttView({
  project,
  adminUsers = [],
  onUpdateTask,
}: {
  project: any;
  adminUsers?: any[];
  onUpdateTask: (id: number, data: Record<string, unknown>) => Promise<unknown>;
}) {
  const [start, setStart] = useState(() =>
    startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 })
  );
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>({
    startDate: "",
    dueDate: "",
    status: "not_started",
    ownerId: "",
  });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const ganttTableRef = useRef<HTMLDivElement | null>(null);
  const taskTimelineRefs = useRef(new Map<number, HTMLDivElement>());
  const [dependencyPaths, setDependencyPaths] = useState<DependencyPath[]>([]);
  const dragRef = useRef<{ task: GanttTask; startX: number } | null>(null);
  const suppressClickRef = useRef(false);

  const end = addDays(start, DAYS_VISIBLE - 1);
  const days = useMemo(
    () =>
      Array.from({ length: DAYS_VISIBLE }, (_, index) => addDays(start, index)),
    [start]
  );
  const today = startOfDay(new Date());
  const people = useMemo(
    () =>
      [...adminUsers].sort((left: any, right: any) =>
        (left.name ?? left.email ?? "").localeCompare(
          right.name ?? right.email ?? ""
        )
      ),
    [adminUsers]
  );

  const allTasks = (project.tasks ?? []) as GanttTask[];
  const unscheduledTasks = useMemo(
    () => allTasks.filter(task => !task.completed && !task.dueDate),
    [allTasks]
  );
  const dependencyRiskTasks = useMemo(
    () =>
      allTasks.filter(
        task =>
          !task.completed &&
          (task.predecessors ?? []).some(predecessor =>
            isDependencyAtRisk(task, predecessor),
          ),
      ),
    [allTasks],
  );

  const { rows, scheduledTaskRows, rowsOutsideWindow } = useMemo(() => {
    const sections = (project.todoSections ?? []) as GanttSection[];
    const visibleTasks = allTasks.filter(
      task => showCompleted || !task.completed
    );
    const tasksBySection = new Map<number | null, GanttTask[]>();
    for (const task of visibleTasks) {
      const group = tasksBySection.get(task.sectionId ?? null) ?? [];
      group.push(task);
      tasksBySection.set(task.sectionId ?? null, group);
    }

    const nextRows: GanttRow[] = [];
    const taskRows: TaskRow[] = [];
    if (project.dueDate) {
      nextRows.push({
        type: "project",
        id: `project-${project.id}`,
        title: project.title,
        dueDate: asDate(project.dueDate),
        isRock: Boolean(project.isRock),
      });
    }

    const groups: Array<{ section: GanttSection | null; tasks: GanttTask[] }> =
      [
        ...sections.map(section => ({
          section,
          tasks: tasksBySection.get(section.id) ?? [],
        })),
        {
          section: null,
          tasks: tasksBySection.get(null) ?? [],
        },
      ];

    for (const group of groups) {
      const scheduledTasks = group.tasks.filter(task => !!task.dueDate);
      const openCount = group.tasks.filter(task => !task.completed).length;
      const overdueCount = group.tasks.filter(task =>
        isTaskOverdue(task, today)
      ).length;
      if (!group.section && scheduledTasks.length === 0) continue;
      if (
        group.section &&
        !group.section.dueDate &&
        scheduledTasks.length === 0
      )
        continue;

      const groupTaskIds = scheduledTasks.map(task => task.id);
      nextRows.push({
        type: "section",
        id: group.section ? `section-${group.section.id}` : "section-main",
        section: group.section,
        title: group.section?.title ?? "Main To-Dos",
        dueDate: group.section?.dueDate ? asDate(group.section.dueDate) : null,
        openCount,
        overdueCount,
        taskIds: groupTaskIds,
      });

      const includedTaskIds = new Set(group.tasks.map(task => task.id));
      const childrenByParent = new Map<number, GanttTask[]>();
      for (const task of group.tasks) {
        if (
          task.parentTaskId === null ||
          !includedTaskIds.has(task.parentTaskId)
        )
          continue;
        const children = childrenByParent.get(task.parentTaskId) ?? [];
        children.push(task);
        childrenByParent.set(task.parentTaskId, children);
      }
      const compareTasks = (left: GanttTask, right: GanttTask) => {
        const leftDate = left.dueDate
          ? asDate(left.dueDate).getTime()
          : Number.MAX_SAFE_INTEGER;
        const rightDate = right.dueDate
          ? asDate(right.dueDate).getTime()
          : Number.MAX_SAFE_INTEGER;
        return leftDate - rightDate || left.title.localeCompare(right.title);
      };
      Array.from(childrenByParent.values()).forEach(children =>
        children.sort(compareTasks)
      );

      const addTaskRows = (task: GanttTask, indent: number) => {
        if (task.dueDate) {
          const dates = scheduleDates(task);
          const row: TaskRow = {
            type: "task",
            id: `task-${task.id}`,
            task,
            title: task.title,
            startDate: dates.startDate,
            dueDate: dates.dueDate,
            indent,
          };
          nextRows.push(row);
          taskRows.push(row);
        }
        for (const child of childrenByParent.get(task.id) ?? []) {
          addTaskRows(child, indent + 1);
        }
      };

      group.tasks
        .filter(
          task =>
            task.parentTaskId === null ||
            !includedTaskIds.has(task.parentTaskId)
        )
        .sort(compareTasks)
        .forEach(task => addTaskRows(task, 1));
    }

    const visibleTaskIds = new Set(
      taskRows
        .filter(row => row.startDate <= end && row.dueDate >= start)
        .map(row => row.task.id)
    );
    const visibleRows = nextRows.filter(row => {
      if (row.type === "task") return visibleTaskIds.has(row.task.id);
      if (row.type === "project")
        return row.dueDate >= start && row.dueDate <= end;
      return (
        (row.dueDate !== null && row.dueDate >= start && row.dueDate <= end) ||
        row.taskIds.some(taskId => visibleTaskIds.has(taskId))
      );
    });
    const outside =
      taskRows.filter(row => row.startDate > end || row.dueDate < start)
        .length +
      nextRows.filter(
        row =>
          (row.type === "project" || row.type === "section") &&
          row.dueDate !== null &&
          (row.dueDate < start || row.dueDate > end)
      ).length;

    return {
      rows: visibleRows,
      scheduledTaskRows: taskRows,
      rowsOutsideWindow: outside,
    };
  }, [
    allTasks,
    end,
    project.dueDate,
    project.id,
    project.isRock,
    project.title,
    project.todoSections,
    showCompleted,
    start,
    today,
  ]);

  useLayoutEffect(() => {
    const table = ganttTableRef.current;
    if (!table) return;

    const redraw = () => {
      const tableBounds = table.getBoundingClientRect();
      const nextPaths: DependencyPath[] = [];
      for (const row of scheduledTaskRows) {
        const dependentTimeline = taskTimelineRefs.current.get(row.task.id);
        if (!dependentTimeline) continue;
        const dependentBounds = dependentTimeline.getBoundingClientRect();
        for (const predecessor of row.task.predecessors ?? []) {
          const predecessorTimeline = taskTimelineRefs.current.get(predecessor.id);
          if (!predecessorTimeline) continue;
          const predecessorRow = scheduledTaskRows.find(
            taskRow => taskRow.task.id === predecessor.id,
          );
          if (!predecessorRow) continue;
          const predecessorBounds = predecessorTimeline.getBoundingClientRect();
          const predecessorEnd = taskBarStyle(predecessorRow);
          const dependentStart = taskBarStyle(row);
          const predecessorX =
            predecessorBounds.left - tableBounds.left +
            (Number.parseFloat(predecessorEnd.left) + Number.parseFloat(predecessorEnd.width)) /
              100 *
              predecessorBounds.width;
          const dependentX =
            dependentBounds.left - tableBounds.left +
            Number.parseFloat(dependentStart.left) / 100 * dependentBounds.width;
          const predecessorY = predecessorBounds.top - tableBounds.top + predecessorBounds.height / 2;
          const dependentY = dependentBounds.top - tableBounds.top + dependentBounds.height / 2;
          const middleX = predecessorX + Math.max(14, (dependentX - predecessorX) / 2);
          nextPaths.push({
            id: `${predecessor.id}-${row.task.id}`,
            path: `M ${predecessorX} ${predecessorY} H ${middleX} V ${dependentY} H ${dependentX}`,
            atRisk: isDependencyAtRisk(row.task, predecessor),
            label: `${row.task.title} is blocked by ${predecessor.title}`,
          });
        }
      }
      setDependencyPaths(current => {
        const nextSignature = nextPaths
          .map(path => `${path.id}:${path.path}:${path.atRisk}`)
          .join("|");
        const currentSignature = current
          .map(path => `${path.id}:${path.path}:${path.atRisk}`)
          .join("|");
        return nextSignature === currentSignature ? current : nextPaths;
      });
    };

    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(table);
    return () => observer.disconnect();
  }, [scheduledTaskRows, rows, showCompleted, start]);

  function openSchedule(task: GanttTask) {
    const dates = scheduleDates(task);
    setScheduleForm({
      startDate: toDateInput(dates.startDate),
      dueDate: toDateInput(dates.dueDate),
      status: taskStatus(task),
      ownerId: String(task.ownerId),
    });
    setEditingTask(task);
  }

  async function saveSchedule() {
    if (!editingTask) return;
    if (
      scheduleForm.startDate &&
      scheduleForm.dueDate &&
      scheduleForm.startDate > scheduleForm.dueDate
    ) {
      return;
    }
    setSavingSchedule(true);
    try {
      await onUpdateTask(editingTask.id, {
        startDate: scheduleForm.startDate
          ? new Date(`${scheduleForm.startDate}T12:00:00`)
          : null,
        dueDate: scheduleForm.dueDate
          ? new Date(`${scheduleForm.dueDate}T12:00:00`)
          : null,
        status: scheduleForm.status,
        ownerId: Number(scheduleForm.ownerId),
      });
      setEditingTask(null);
    } catch {
      // The parent mutation displays the actionable server error.
    } finally {
      setSavingSchedule(false);
    }
  }

  function beginTaskDrag(
    event: PointerEvent<HTMLButtonElement>,
    task: GanttTask
  ) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { task, startX: event.clientX };
    setDraggingTaskId(task.id);
  }

  function finishTaskDrag(
    event: PointerEvent<HTMLButtonElement>,
    task: GanttTask
  ) {
    const drag = dragRef.current;
    dragRef.current = null;
    setDraggingTaskId(null);
    if (!drag || drag.task.id !== task.id || !timelineRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const timelineWidth = timelineRef.current.getBoundingClientRect().width;
    if (!timelineWidth) return;
    const shiftDays = Math.round(
      (event.clientX - drag.startX) / (timelineWidth / DAYS_VISIBLE)
    );
    if (shiftDays === 0) return;
    suppressClickRef.current = true;
    const dates = scheduleDates(task);
    void onUpdateTask(task.id, {
      startDate: addDays(dates.startDate, shiftDays),
      dueDate: addDays(dates.dueDate, shiftDays),
    }).catch(() => undefined);
  }

  function cancelTaskDrag() {
    dragRef.current = null;
    setDraggingTaskId(null);
  }

  function renderCalendarGrid() {
    return days.map(day => (
      <span
        key={day.toISOString()}
        className={cn(
          "absolute inset-y-0 border-l border-border/45",
          (day.getDay() === 0 || day.getDay() === 6) && "bg-muted/25"
        )}
        style={{
          left: `${daysToPercent(differenceInCalendarDays(day, start))}%`,
          width: `${daysToPercent(1)}%`,
        }}
      />
    ));
  }

  function markerPosition(date: Date) {
    return `${daysToPercent(clamp(differenceInCalendarDays(date, start) + 0.5, 0, DAYS_VISIBLE))}%`;
  }

  function taskBarStyle(row: TaskRow) {
    const startOffset = clamp(
      differenceInCalendarDays(row.startDate, start),
      0,
      DAYS_VISIBLE - 1
    );
    const endOffset = clamp(
      differenceInCalendarDays(row.dueDate, start),
      0,
      DAYS_VISIBLE - 1
    );
    return {
      left: `${daysToPercent(startOffset)}%`,
      width: `${Math.max(daysToPercent(endOffset - startOffset + 1), daysToPercent(1))}%`,
    };
  }

  const todayVisible = today >= start && today <= end;
  const scheduleError = Boolean(
    scheduleForm.startDate &&
      scheduleForm.dueDate &&
      scheduleForm.startDate > scheduleForm.dueDate
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Gantt Chart</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Plan active Project To-Dos from start to due date. Drag a bar to
            move its schedule, or select it to update dates, status, and
            assignee. Dependency arrows show work that must finish first.
            Milestone diamonds label milestone-to-milestone dependencies.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5">
            <Switch
              id="show-completed-gantt-todos"
              checked={showCompleted}
              onCheckedChange={setShowCompleted}
            />
            <Label
              htmlFor="show-completed-gantt-todos"
              className="cursor-pointer text-xs text-muted-foreground"
            >
              Show completed
            </Label>
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
      </div>

      {unscheduledTasks.length > 0 ? (
        <a
          href={`/projects/${project.id}?tab=tasks`}
          className="flex items-center justify-between gap-3 rounded-lg border border-amber-300/70 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-950 transition-colors hover:bg-amber-100/70"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
            <span>
              <strong>{unscheduledTasks.length}</strong> open To-Do
              {unscheduledTasks.length === 1 ? " needs" : "s need"} a due date
              and {unscheduledTasks.length === 1 ? "is" : "are"} not yet on the
              schedule.
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-amber-800">
            Review To-Dos
          </span>
        </a>
      ) : null}

      {dependencyRiskTasks.length > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-300/70 bg-red-50/70 px-3 py-2.5 text-sm text-red-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
          <p>
            <strong>{dependencyRiskTasks.length}</strong> To-Do
            {dependencyRiskTasks.length === 1 ? " has" : "s have"} a
            dependency that needs attention: the blocker is unfinished or its
            due date falls after the dependent To-Do’s start date.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-amber-500" />
          Milestone
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-violet-600" />
          Project or Rock due date
        </span>
        {Object.entries(TASK_STATUS_META).map(([status, meta]) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span
              className={`h-2.5 w-4 rounded-sm ${meta.bar.split(" ")[0]}`}
            />
            {meta.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
          Overdue
        </span>
        <span className="inline-flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 text-primary" />
          To-Do dependency
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rotate-45 rounded-[1px] border border-primary bg-primary/10" />
          Milestone dependency
        </span>
        <span className="ml-auto">
          {format(start, "MMM d, yyyy")} – {format(end, "MMM d, yyyy")}
        </span>
      </div>

      {scheduledTaskRows.length === 0 &&
      !project.dueDate &&
      !(project.todoSections ?? []).some(
        (section: GanttSection) => section.dueDate
      ) ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          This project has no scheduled work yet. Add due dates to Project
          To-Dos or milestones to build its timeline.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <div ref={ganttTableRef} className="relative min-w-[1100px]">
            <div
              className="grid border-b bg-muted/35"
              style={{ gridTemplateColumns: TABLE_COLUMNS }}
            >
              <div className="sticky left-0 z-30 border-r bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
                Work item
              </div>
              <div ref={timelineRef} className="relative h-10 overflow-hidden">
                {days.map((day, index) =>
                  day.getDay() === 1 || index === 0 ? (
                    <div
                      key={day.toISOString()}
                      className="absolute top-0 h-full border-l border-border px-1.5 pt-2 text-[10px] font-medium text-muted-foreground"
                      style={{ left: `${daysToPercent(index)}%` }}
                    >
                      {format(day, "MMM d")}
                    </div>
                  ) : null
                )}
                <div className="absolute inset-x-0 bottom-0 h-3">
                  {renderCalendarGrid()}
                </div>
                {todayVisible ? (
                  <span
                    className="absolute inset-y-0 z-10 w-px bg-primary/80"
                    style={{ left: markerPosition(today) }}
                    aria-label="Today"
                  />
                ) : null}
              </div>
            </div>

            {rows.map(row => {
              if (row.type === "project") {
                const Icon = row.isRock ? Flag : CircleDot;
                return (
                  <div
                    key={row.id}
                    className="grid border-b border-violet-200/70 bg-violet-50/35"
                    style={{ gridTemplateColumns: TABLE_COLUMNS }}
                  >
                    <div className="sticky left-0 z-20 flex min-w-0 items-center gap-2 border-r bg-violet-50 px-3 py-2">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-violet-700" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {row.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-violet-800">
                        Due {format(row.dueDate, "MMM d")}
                      </span>
                    </div>
                    <div className="relative min-h-9 overflow-hidden">
                      {renderCalendarGrid()}
                      <span
                        title={`${row.title} · due ${format(row.dueDate, "MMM d, yyyy")}`}
                        className="absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border-2 border-card bg-violet-600 shadow-sm"
                        style={{ left: markerPosition(row.dueDate) }}
                      />
                    </div>
                  </div>
                );
              }

              if (row.type === "section") {
                const isMilestone = !!row.section?.dueDate;
                return (
                  <div
                    key={row.id}
                    className="grid border-b bg-muted/20"
                    style={{ gridTemplateColumns: TABLE_COLUMNS }}
                  >
                    <div className="sticky left-0 z-20 flex min-w-0 items-center gap-2 border-r bg-muted px-3 py-1.5">
                      {isMilestone ? (
                        <Milestone className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                      ) : (
                        <ListTodo className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {row.title}
                        </span>
                        {row.section?.predecessors?.length ? <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] font-medium normal-case tracking-normal text-primary" title={`Depends on ${row.section.predecessors.map(predecessor => `${predecessor.projectTitle} / ${predecessor.title}`).join(", ")}`}><span className="h-2 w-2 shrink-0 rotate-45 rounded-[1px] border border-primary bg-primary/10" /><span className="truncate">Depends on {row.section.predecessors.map(predecessor => predecessor.title).join(", ")}</span></span> : null}
                      </div>
                      {row.openCount ? (
                        <span className="shrink-0 rounded bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {row.openCount} open
                        </span>
                      ) : null}
                      {row.overdueCount ? (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
                          <AlertTriangle className="h-3 w-3" />
                          {row.overdueCount}
                        </span>
                      ) : null}
                      {row.dueDate ? (
                        <span className="shrink-0 text-[10px] text-amber-800">
                          Due {format(row.dueDate, "MMM d")}
                        </span>
                      ) : null}
                    </div>
                    <div className="relative min-h-8 overflow-hidden">
                      {renderCalendarGrid()}
                      {row.dueDate &&
                      row.dueDate >= start &&
                      row.dueDate <= end ? (
                        <span
                          title={`${row.title} milestone · due ${format(row.dueDate, "MMM d, yyyy")}${row.section?.predecessors?.length ? ` · depends on ${row.section.predecessors.map(predecessor => `${predecessor.projectTitle} / ${predecessor.title}`).join(", ")}` : ""}`}
                          className="absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border-2 border-card bg-amber-500 shadow-sm"
                          style={{ left: markerPosition(row.dueDate) }}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              }

              const status = taskStatus(row.task);
              const statusMeta =
                TASK_STATUS_META[status] ?? TASK_STATUS_META.not_started;
              const overdue = isTaskOverdue(row.task, today);
              return (
                <div
                  key={row.id}
                  className="grid border-b last:border-b-0 hover:bg-muted/25"
                  style={{ gridTemplateColumns: TABLE_COLUMNS }}
                >
                  <div
                    className="sticky left-0 z-10 flex min-w-0 items-center gap-2 border-r bg-card px-3 py-2"
                    style={{ paddingLeft: `${0.75 + row.indent * 1.15}rem` }}
                  >
                    <ListTodo
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        overdue ? "text-red-600" : "text-primary"
                      )}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-sm hover:text-primary hover:underline"
                      onClick={() => openSchedule(row.task)}
                    >
                      {row.title}
                    </button>
                    {overdue ? (
                      <AlertTriangle
                        className="h-3.5 w-3.5 shrink-0 text-red-600"
                        aria-label="Overdue"
                      />
                    ) : null}
                    {row.task.predecessors?.length ? (
                      <GitBranch
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          row.task.predecessors.some(predecessor =>
                            isDependencyAtRisk(row.task, predecessor),
                          )
                            ? "text-red-600"
                            : "text-primary",
                        )}
                        aria-label="Has dependencies"
                      />
                    ) : null}
                    <span
                      className={cn(
                        "hidden shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium lg:inline",
                        statusMeta.badge
                      )}
                    >
                      {statusMeta.label}
                    </span>
                    <span
                      className={cn(
                        "hidden shrink-0 text-[10px] xl:inline",
                        overdue
                          ? "font-semibold text-red-700"
                          : "text-muted-foreground"
                      )}
                    >
                      {format(row.startDate, "MMM d")} –{" "}
                      {format(row.dueDate, "MMM d")}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => openSchedule(row.task)}
                      aria-label={`Schedule ${row.title}`}
                      title="Edit schedule"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div
                    ref={element => {
                      if (element) taskTimelineRefs.current.set(row.task.id, element);
                      else taskTimelineRefs.current.delete(row.task.id);
                    }}
                    className="relative min-h-10 overflow-hidden"
                  >
                    {renderCalendarGrid()}
                    {todayVisible ? (
                      <span
                        className="absolute inset-y-0 z-[1] w-px bg-primary/55"
                        style={{ left: markerPosition(today) }}
                      />
                    ) : null}
                    <button
                      type="button"
                      className={cn(
                        "absolute top-1/2 z-10 h-5 -translate-y-1/2 rounded-sm border border-card/80 shadow-sm transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                        overdue
                          ? "bg-red-600 hover:bg-red-700"
                          : statusMeta.bar,
                        draggingTaskId === row.task.id &&
                          "cursor-grabbing opacity-70 shadow-md"
                      )}
                      style={taskBarStyle(row)}
                      title={`${row.title} · ${format(row.startDate, "MMM d, yyyy")} – ${format(row.dueDate, "MMM d, yyyy")}. Drag to move the schedule; select to edit.`}
                      aria-label={`Schedule ${row.title} from ${format(row.startDate, "MMMM d")} through ${format(row.dueDate, "MMMM d")}`}
                      onPointerDown={event => beginTaskDrag(event, row.task)}
                      onPointerUp={event => finishTaskDrag(event, row.task)}
                      onPointerCancel={cancelTaskDrag}
                      onClick={() => {
                        if (suppressClickRef.current) {
                          suppressClickRef.current = false;
                          return;
                        }
                        openSchedule(row.task);
                      }}
                    >
                      <span className="sr-only">{row.title}</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {dependencyPaths.length ? (
              <svg
                className="pointer-events-none absolute inset-0 z-[2] h-full w-full overflow-visible"
                aria-label="Project To-Do dependencies"
              >
                <defs>
                  <marker id="gantt-dependency-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M 0 0 L 6 3 L 0 6 z" fill="#0f766e" />
                  </marker>
                  <marker id="gantt-dependency-risk-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M 0 0 L 6 3 L 0 6 z" fill="#dc2626" />
                  </marker>
                </defs>
                {dependencyPaths.map(dependency => (
                  <path
                    key={dependency.id}
                    d={dependency.path}
                    fill="none"
                    stroke={dependency.atRisk ? "#dc2626" : "#0f766e"}
                    strokeWidth="1.5"
                    strokeDasharray={dependency.atRisk ? "4 3" : undefined}
                    markerEnd={`url(#${dependency.atRisk ? "gantt-dependency-risk-arrow" : "gantt-dependency-arrow"})`}
                  >
                    <title>{dependency.label}</title>
                  </path>
                ))}
              </svg>
            ) : null}

            {rows.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No scheduled work falls in this 12-week window. Use the arrows
                to browse the timeline.
              </div>
            ) : null}
          </div>
        </div>
      )}

      {rowsOutsideWindow ? (
        <p className="text-xs text-muted-foreground">
          {rowsOutsideWindow} scheduled item
          {rowsOutsideWindow === 1 ? " is" : "s are"} outside this 12-week
          window.
        </p>
      ) : null}

      <Dialog
        open={Boolean(editingTask)}
        onOpenChange={open => !open && setEditingTask(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Schedule To-Do</DialogTitle>
            <DialogDescription>{editingTask?.title}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="gantt-task-start-date">Start date</Label>
              <Input
                id="gantt-task-start-date"
                type="date"
                value={scheduleForm.startDate}
                onChange={event =>
                  setScheduleForm(form => ({
                    ...form,
                    startDate: event.target.value,
                  }))
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="gantt-task-due-date">Due date</Label>
              <Input
                id="gantt-task-due-date"
                type="date"
                value={scheduleForm.dueDate}
                onChange={event =>
                  setScheduleForm(form => ({
                    ...form,
                    dueDate: event.target.value,
                  }))
                }
                className="mt-1"
              />
            </div>
            {scheduleError ? (
              <p className="sm:col-span-2 text-xs font-medium text-destructive">
                The start date cannot be after the due date.
              </p>
            ) : null}
            <div>
              <Label htmlFor="gantt-task-status">Status</Label>
              <Select
                value={scheduleForm.status}
                onValueChange={status =>
                  setScheduleForm(form => ({
                    ...form,
                    status: status as TodoStatus,
                  }))
                }
              >
                <SelectTrigger id="gantt-task-status" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_STATUS_META).map(([status, meta]) => (
                    <SelectItem key={status} value={status}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="gantt-task-assignee">Assignee</Label>
              <Select
                value={scheduleForm.ownerId}
                onValueChange={ownerId =>
                  setScheduleForm(form => ({ ...form, ownerId }))
                }
              >
                <SelectTrigger id="gantt-task-assignee" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {people.map((person: any) => (
                    <SelectItem key={person.id} value={String(person.id)}>
                      <span className="inline-flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" />
                        {person.name ?? person.email ?? `User #${person.id}`}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="rounded-md border border-primary/15 bg-primary/[0.025] px-3 py-2 text-xs text-muted-foreground">
            Drag the bar to shift both dates together. Change these fields when
            the duration, status, or assignee needs to change.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingTask(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                savingSchedule || scheduleError || !scheduleForm.ownerId
              }
              onClick={saveSchedule}
            >
              {savingSchedule ? "Saving…" : "Save schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
