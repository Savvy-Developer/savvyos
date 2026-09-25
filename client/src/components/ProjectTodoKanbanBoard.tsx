import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildProjectTodoLayout,
  moveProjectTodo,
  moveProjectTodoSection,
  type ProjectTodoDragData,
  type ProjectTodoLayoutItem,
} from "@/components/ProjectTodoBoard";

type TodoRow = {
  id: number;
  title: string;
  sectionId: number | null;
  sortOrder: number;
  completed: boolean;
  createdAt?: Date | string | null;
};

type SectionRow = {
  id: number;
  title: string;
  dueDate?: Date | string | null;
  sortOrder: number;
  createdAt?: Date | string | null;
};

const taskSortableId = (taskId: number) => `todo-${taskId}`;
const sectionSortableId = (sectionId: number) => `section-${sectionId}`;
const containerId = (sectionId: number | null) =>
  sectionId === null
    ? "project-board-unassigned"
    : `project-board-section-${sectionId}`;

function TaskCard({
  taskId,
  disabled,
  children,
}: {
  taskId: number;
  disabled: boolean;
  children: (handle: any) => ReactNode;
}) {
  const sortable = useSortable({
    id: taskSortableId(taskId),
    data: { type: "task", taskId } satisfies ProjectTodoDragData,
    disabled,
  });
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={cn("relative", sortable.isDragging && "z-20 opacity-30")}
    >
      {children({
        setActivatorNodeRef: sortable.setActivatorNodeRef,
        attributes: sortable.attributes,
        listeners: sortable.listeners,
      })}
    </div>
  );
}

function TaskColumn({
  section,
  taskIds,
  activeTask,
  saving,
  onAddTodo,
  children,
}: {
  section: SectionRow | null;
  taskIds: number[];
  activeTask: boolean;
  saving: boolean;
  onAddTodo: () => void;
  children: ReactNode;
}) {
  const sortable = useSortable({
    id: section
      ? sectionSortableId(section.id)
      : "project-board-unassigned-column",
    data: section
      ? ({
          type: "section",
          sectionId: section.id,
        } satisfies ProjectTodoDragData)
      : ({ type: "container", sectionId: null } satisfies ProjectTodoDragData),
    disabled: saving || !section || activeTask,
  });
  const droppable = useDroppable({
    id: containerId(section?.id ?? null),
    data: {
      type: "container",
      sectionId: section?.id ?? null,
    } satisfies ProjectTodoDragData,
  });
  const style = section
    ? {
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }
    : undefined;
  const label = section?.title ?? "No section";
  const dueDate = section?.dueDate ? new Date(section.dueDate) : null;

  return (
    <div
      ref={section ? sortable.setNodeRef : undefined}
      style={style}
      className={cn(
        "w-[20rem] shrink-0 rounded-lg border border-border bg-muted/25",
        section && sortable.isDragging && "z-20 opacity-35"
      )}
    >
      <div className="flex min-h-12 items-center gap-2 border-b border-border bg-card px-3 py-2.5">
        {section ? (
          <button
            type="button"
            ref={sortable.setActivatorNodeRef}
            {...sortable.attributes}
            {...sortable.listeners}
            className="flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
            aria-label={`Drag ${section.title} section`}
            title="Drag section"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : (
          <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{label}</h3>
          {dueDate ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Due{" "}
              {dueDate.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={onAddTodo}
          aria-label={`Add To-Do to ${label}`}
          title="Add To-Do"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <SortableContext
        items={taskIds.map(taskSortableId)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={droppable.setNodeRef}
          className={cn(
            "min-h-32 space-y-2 p-2.5 transition-colors",
            droppable.isOver &&
              "bg-primary/[0.08] ring-2 ring-inset ring-primary/35"
          )}
        >
          {activeTask && droppable.isOver ? (
            <div className="rounded-md border-2 border-dashed border-primary/55 bg-primary/[0.06] px-3 py-2 text-center text-xs font-semibold text-primary">
              Drop To-Do here
            </div>
          ) : null}
          {children}
          {!children ? (
            <p className="rounded-md border border-dashed border-border bg-card/60 px-3 py-5 text-center text-xs text-muted-foreground">
              Drop a To-Do here
            </p>
          ) : null}
        </div>
      </SortableContext>
    </div>
  );
}

export default function ProjectTodoKanbanBoard({
  sections,
  todos,
  showCompleted,
  renderTodo,
  onAddTodo,
  onLayoutChange,
  saving,
}: {
  sections: SectionRow[];
  todos: TodoRow[];
  showCompleted: boolean;
  renderTodo: (todo: TodoRow, dragHandle?: any) => ReactNode;
  onAddTodo: (sectionId: number | null) => void;
  onLayoutChange: (layout: ProjectTodoLayoutItem[]) => Promise<unknown>;
  saving: boolean;
}) {
  const incomingLayout = useMemo(
    () => buildProjectTodoLayout(sections, todos),
    [sections, todos]
  );
  const incomingSignature = JSON.stringify(incomingLayout);
  const [layout, setLayout] = useState<ProjectTodoLayoutItem[]>(incomingLayout);
  const [activeDrag, setActiveDrag] = useState<ProjectTodoDragData | null>(
    null
  );
  const todoById = useMemo(
    () => new Map(todos.map(todo => [todo.id, todo])),
    [todos]
  );
  const sectionById = useMemo(
    () => new Map(sections.map(section => [section.id, section])),
    [sections]
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const collisionDetection: CollisionDetection = args => {
    const pointerCollisions = pointerWithin(args);
    return pointerCollisions.length ? pointerCollisions : closestCenter(args);
  };
  useEffect(() => {
    setLayout(incomingLayout);
  }, [incomingSignature]);

  const visible = (taskId: number) => {
    const task = todoById.get(taskId);
    return !!task && (showCompleted || !task.completed);
  };
  const rootTaskIds = layout
    .filter(
      (item): item is Extract<ProjectTodoLayoutItem, { type: "task" }> =>
        item.type === "task"
    )
    .map(item => item.id)
    .filter(visible);
  const sectionItems = layout.filter(
    (item): item is Extract<ProjectTodoLayoutItem, { type: "section" }> =>
      item.type === "section"
  );

  async function endDrag(event: DragEndEvent) {
    const active = event.active.data.current as ProjectTodoDragData | undefined;
    const over = event.over?.data.current as ProjectTodoDragData | undefined;
    setActiveDrag(null);
    if (
      !active ||
      !over ||
      active.type === "container" ||
      active.type === "root-slot"
    )
      return;
    const next =
      active.type === "section"
        ? moveProjectTodoSection(layout, active.sectionId, over)
        : active.type === "task"
          ? moveProjectTodo(layout, active.taskId, over)
          : layout;
    if (JSON.stringify(next) === JSON.stringify(layout)) return;
    const previous = layout;
    setLayout(next);
    try {
      await onLayoutChange(next);
    } catch {
      setLayout(previous);
    }
  }

  function column(section: SectionRow | null, taskIds: number[]) {
    const visibleTaskIds = taskIds.filter(visible);
    return (
      <TaskColumn
        key={section?.id ?? "none"}
        section={section}
        taskIds={visibleTaskIds}
        activeTask={activeDrag?.type === "task"}
        saving={saving}
        onAddTodo={() => onAddTodo(section?.id ?? null)}
      >
        {visibleTaskIds.length
          ? visibleTaskIds.map(taskId => {
              const todo = todoById.get(taskId);
              return todo ? (
                <TaskCard key={taskId} taskId={taskId} disabled={saving}>
                  {dragHandle => renderTodo(todo, dragHandle)}
                </TaskCard>
              ) : null;
            })
          : null}
      </TaskColumn>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Drag a To-Do to another section to move it. Drag section headers to
        order columns. Use{" "}
        <span className="font-medium text-foreground">List View</span> to edit,
        add, or delete sections.
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={(event: DragStartEvent) => {
          setActiveDrag(
            (event.active.data.current as ProjectTodoDragData | undefined) ??
              null
          );
        }}
        onDragCancel={() => {
          setActiveDrag(null);
        }}
        onDragEnd={endDrag}
      >
        <div className="overflow-x-auto pb-2">
          <SortableContext
            items={sectionItems.map(item => sectionSortableId(item.id))}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex min-h-[22rem] items-start gap-3">
              {column(null, rootTaskIds)}
              {sectionItems.map(item => {
                const section = sectionById.get(item.id);
                return section ? column(section, item.taskIds) : null;
              })}
              <div className="flex w-[20rem] shrink-0 items-center justify-center rounded-lg border border-dashed border-border px-5 text-center text-sm text-muted-foreground">
                Create sections in List View to add more board columns.
              </div>
            </div>
          </SortableContext>
        </div>
        <DragOverlay>
          {activeDrag?.type === "task" ? (
            <div className="flex max-w-sm items-center gap-2 rounded-md border border-primary/30 bg-card px-3 py-2 text-sm font-medium shadow-xl">
              <GripVertical className="h-4 w-4 text-primary" />
              <span className="truncate">
                {todoById.get(activeDrag.taskId)?.title}
              </span>
            </div>
          ) : activeDrag?.type === "section" ? (
            <div className="flex max-w-sm items-center gap-2 rounded-md border border-primary/30 bg-card px-3 py-2 text-sm font-semibold shadow-xl">
              <GripVertical className="h-4 w-4 text-primary" />
              <span className="truncate">
                {sectionById.get(activeDrag.sectionId)?.title}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
