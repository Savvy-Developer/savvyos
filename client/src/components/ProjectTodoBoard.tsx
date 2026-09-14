import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProjectTodoSection } from "@/components/ProjectTodoSection";

export type ProjectTodoLayoutItem =
  | { type: "task"; id: number }
  | { type: "section"; id: number; taskIds: number[] };

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
  sortOrder: number;
  createdAt?: Date | string | null;
};

export type ProjectTodoDragData =
  | { type: "task"; taskId: number }
  | { type: "section"; sectionId: number }
  | { type: "section-header"; sectionId: number }
  | { type: "container"; sectionId: number | null }
  | { type: "root-slot"; index: number };

type TaskLocation = { sectionId: number | null; index: number };

const ROOT_CONTAINER_ID = "todo-root-container";
const taskSortableId = (taskId: number) => `todo-${taskId}`;
const sectionSortableId = (sectionId: number) => `section-${sectionId}`;
const sectionContainerId = (sectionId: number) =>
  `section-container-${sectionId}`;

const keepDragPreviewBelowPointer: Modifier = ({ transform }) => ({
  ...transform,
  x: transform.x + 18,
  y: transform.y + 44,
});

function compareRows(
  left: { sortOrder: number; createdAt?: Date | string | null; id: number },
  right: { sortOrder: number; createdAt?: Date | string | null; id: number }
) {
  if (left.sortOrder !== right.sortOrder)
    return left.sortOrder - right.sortOrder;
  const leftCreatedAt = left.createdAt ? new Date(left.createdAt).getTime() : 0;
  const rightCreatedAt = right.createdAt
    ? new Date(right.createdAt).getTime()
    : 0;
  if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt - rightCreatedAt;
  return left.id - right.id;
}

export function buildProjectTodoLayout(
  sections: SectionRow[],
  todos: TodoRow[]
): ProjectTodoLayoutItem[] {
  const topLevelTodos = todos.filter(todo => !todo.sectionId);
  const rootItems: Array<
    (SectionRow & { type: "section" }) | (TodoRow & { type: "task" })
  > = [
    ...sections.map(section => ({ ...section, type: "section" as const })),
    ...topLevelTodos.map(todo => ({ ...todo, type: "task" as const })),
  ].sort(compareRows);

  return rootItems.map(item => {
    if (item.type === "task") return { type: "task", id: item.id };
    return {
      type: "section",
      id: item.id,
      taskIds: todos
        .filter(todo => todo.sectionId === item.id)
        .sort(compareRows)
        .map(todo => todo.id),
    };
  });
}

function cloneLayout(layout: ProjectTodoLayoutItem[]) {
  return layout.map(item =>
    item.type === "section"
      ? { ...item, taskIds: [...item.taskIds] }
      : { ...item }
  );
}

function findTaskLocation(
  layout: ProjectTodoLayoutItem[],
  taskId: number
): TaskLocation | null {
  const rootIndex = layout.findIndex(
    item => item.type === "task" && item.id === taskId
  );
  if (rootIndex >= 0) return { sectionId: null, index: rootIndex };

  for (const item of layout) {
    if (item.type !== "section") continue;
    const index = item.taskIds.indexOf(taskId);
    if (index >= 0) return { sectionId: item.id, index };
  }
  return null;
}

function taskIdsForContainer(
  layout: ProjectTodoLayoutItem[],
  sectionId: number | null
) {
  if (sectionId === null) {
    return layout
      .filter(
        (item): item is Extract<ProjectTodoLayoutItem, { type: "task" }> =>
          item.type === "task"
      )
      .map(item => item.id);
  }
  return (
    layout.find(
      (item): item is Extract<ProjectTodoLayoutItem, { type: "section" }> =>
        item.type === "section" && item.id === sectionId
    )?.taskIds ?? []
  );
}

function replaceContainerTasks(
  layout: ProjectTodoLayoutItem[],
  sectionId: number | null,
  orderedTaskIds: number[]
) {
  if (sectionId === null) return layout;

  return layout.map(item =>
    item.type === "section" && item.id === sectionId
      ? { ...item, taskIds: orderedTaskIds }
      : item
  );
}

function removeTask(
  layout: ProjectTodoLayoutItem[],
  taskId: number,
  location: TaskLocation
) {
  if (location.sectionId === null) {
    return layout.filter(item => !(item.type === "task" && item.id === taskId));
  }
  const taskIds = taskIdsForContainer(layout, location.sectionId).filter(
    id => id !== taskId
  );
  return replaceContainerTasks(layout, location.sectionId, taskIds);
}

function insertTask(
  layout: ProjectTodoLayoutItem[],
  taskId: number,
  sectionId: number | null,
  index: number
) {
  if (sectionId === null) {
    const next = [...layout];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, {
      type: "task",
      id: taskId,
    });
    return next;
  }

  return layout.map(item => {
    if (item.type !== "section" || item.id !== sectionId) return item;
    const nextTaskIds = [...item.taskIds];
    nextTaskIds.splice(
      Math.max(0, Math.min(index, nextTaskIds.length)),
      0,
      taskId
    );
    return { ...item, taskIds: nextTaskIds };
  });
}

export function moveProjectTodo(
  layout: ProjectTodoLayoutItem[],
  taskId: number,
  overData: ProjectTodoDragData
) {
  const source = findTaskLocation(layout, taskId);
  if (!source) return layout;

  if (overData.type === "root-slot") {
    const withoutTask = removeTask(cloneLayout(layout), taskId, source);
    const adjustedIndex =
      source.sectionId === null && source.index < overData.index
        ? overData.index - 1
        : overData.index;
    return insertTask(withoutTask, taskId, null, adjustedIndex);
  }

  if (overData.type === "task") {
    const destination = findTaskLocation(layout, overData.taskId);
    if (!destination || overData.taskId === taskId) return layout;
    if (source.sectionId === destination.sectionId) {
      if (source.sectionId === null) {
        return arrayMove(layout, source.index, destination.index);
      }
      const orderedTaskIds = taskIdsForContainer(layout, source.sectionId);
      return replaceContainerTasks(
        layout,
        source.sectionId,
        arrayMove(orderedTaskIds, source.index, destination.index)
      );
    }

    const withoutTask = removeTask(cloneLayout(layout), taskId, source);
    const refreshedDestination = findTaskLocation(withoutTask, overData.taskId);
    if (!refreshedDestination) return layout;
    return insertTask(
      withoutTask,
      taskId,
      refreshedDestination.sectionId,
      refreshedDestination.index
    );
  }

  const destinationSectionId = overData.sectionId;
  if (source.sectionId === destinationSectionId) return layout;
  const withoutTask = removeTask(cloneLayout(layout), taskId, source);
  return insertTask(
    withoutTask,
    taskId,
    destinationSectionId,
    destinationSectionId === null
      ? withoutTask.length
      : taskIdsForContainer(withoutTask, destinationSectionId).length
  );
}

function rootIndexForOverData(
  layout: ProjectTodoLayoutItem[],
  overData: ProjectTodoDragData
) {
  if (overData.type === "root-slot") return overData.index;
  if (overData.type === "section" || overData.type === "section-header") {
    return layout.findIndex(
      item => item.type === "section" && item.id === overData.sectionId
    );
  }
  if (overData.type === "container") {
    if (overData.sectionId === null) return layout.length - 1;
    return layout.findIndex(
      item => item.type === "section" && item.id === overData.sectionId
    );
  }
  const taskLocation = findTaskLocation(layout, overData.taskId);
  if (!taskLocation) return -1;
  if (taskLocation.sectionId !== null) {
    return layout.findIndex(
      item => item.type === "section" && item.id === taskLocation.sectionId
    );
  }
  return layout.findIndex(
    item => item.type === "task" && item.id === overData.taskId
  );
}

export function moveProjectTodoSection(
  layout: ProjectTodoLayoutItem[],
  sectionId: number,
  overData: ProjectTodoDragData
) {
  const sourceIndex = layout.findIndex(
    item => item.type === "section" && item.id === sectionId
  );
  let destinationIndex = rootIndexForOverData(layout, overData);
  if (
    overData.type === "root-slot" &&
    sourceIndex >= 0 &&
    sourceIndex < destinationIndex
  ) {
    destinationIndex -= 1;
  }
  if (
    sourceIndex < 0 ||
    destinationIndex < 0 ||
    sourceIndex === destinationIndex
  ) {
    return layout;
  }
  return arrayMove(layout, sourceIndex, destinationIndex);
}

function SortableTodoRow({
  taskId,
  children,
  disabled,
}: {
  taskId: number;
  children: (dragHandle: any) => ReactNode;
  disabled: boolean;
}) {
  const sortable = useSortable({
    id: taskSortableId(taskId),
    data: { type: "task", taskId } satisfies ProjectTodoDragData,
    disabled,
  });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={cn("relative z-0", sortable.isDragging && "z-20 opacity-35")}
    >
      {children({
        setActivatorNodeRef: sortable.setActivatorNodeRef,
        attributes: sortable.attributes,
        listeners: sortable.listeners,
      })}
    </div>
  );
}

function SectionTaskContainer({
  sectionId,
  sectionTitle,
  taskIds,
  acceptingTask,
  children,
}: {
  sectionId: number;
  sectionTitle: string;
  taskIds: number[];
  acceptingTask: boolean;
  children: ReactNode;
}) {
  const droppable = useDroppable({
    id: sectionContainerId(sectionId),
    data: { type: "container", sectionId } satisfies ProjectTodoDragData,
  });

  return (
    <SortableContext
      items={taskIds.map(taskSortableId)}
      strategy={verticalListSortingStrategy}
    >
      <div
        ref={droppable.setNodeRef}
        className={cn(
          "min-h-10 space-y-2 rounded-md transition-colors",
          (droppable.isOver || acceptingTask) && "bg-primary/[0.035] ring-2 ring-primary/25"
        )}
      >
        {acceptingTask ? <div className="flex min-h-16 items-center justify-center gap-2 rounded-md border-2 border-dashed border-primary/55 bg-primary/[0.07] px-3 py-3 text-sm font-semibold text-primary shadow-sm" role="status" aria-live="polite"><ListChecks className="h-4 w-4 shrink-0" />Drop To-Do here to place it in {sectionTitle}</div> : null}
        {children}
      </div>
    </SortableContext>
  );
}

function SortableSectionRow({
  section,
  taskIds,
  todoCount,
  completedCount,
  displayCount,
  onAddTodo,
  onRename,
  onDelete,
  children,
    disabled,
    acceptingTask,
    freezeDuringTaskDrag,
    taskDragActive,
}: {
  section: SectionRow;
  taskIds: number[];
  todoCount: number;
  completedCount: number;
  displayCount: number;
  onAddTodo: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  children: ReactNode;
  disabled: boolean;
  acceptingTask: boolean;
  freezeDuringTaskDrag: boolean;
  taskDragActive: boolean;
}) {
  const sortable = useSortable({
    id: sectionSortableId(section.id),
    data: {
      type: "section",
      sectionId: section.id,
    } satisfies ProjectTodoDragData,
    disabled: disabled || taskDragActive,
  });
  const style = {
    transform: freezeDuringTaskDrag ? undefined : CSS.Transform.toString(sortable.transform),
    transition: freezeDuringTaskDrag ? undefined : sortable.transition,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={cn(sortable.isDragging && "z-20 opacity-35")}
    >
      <ProjectTodoSection
        section={section}
        todoCount={todoCount}
        completedCount={completedCount}
        displayCount={displayCount}
        onAddTodo={onAddTodo}
        onRename={onRename}
        onDelete={onDelete}
        dragHandle={{
          setActivatorNodeRef: sortable.setActivatorNodeRef,
          attributes: sortable.attributes,
          listeners: sortable.listeners,
        }}
        acceptingTask={acceptingTask}
        taskDragActive={taskDragActive}
      >
        <SectionTaskContainer sectionId={section.id} sectionTitle={section.title} taskIds={taskIds} acceptingTask={acceptingTask}>
          {children}
        </SectionTaskContainer>
      </ProjectTodoSection>
    </div>
  );
}

function RootTodoContainer({
  activeDrag,
  children,
}: {
  activeDrag: ProjectTodoDragData | null;
  children: ReactNode;
}) {
  const droppable = useDroppable({
    id: ROOT_CONTAINER_ID,
    data: { type: "container", sectionId: null } satisfies ProjectTodoDragData,
  });

  return (
    <div
      ref={droppable.setNodeRef}
      className={cn(
        "space-y-3 rounded-lg transition-colors",
        droppable.isOver &&
          activeDrag?.type === "task" &&
          "bg-primary/[0.025] ring-2 ring-primary/20"
      )}
    >
      {children}
      {activeDrag?.type === "task" ? (
        <div
          className={cn(
            "flex min-h-10 items-center justify-center rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground",
            droppable.isOver && "border-primary bg-primary/5 text-primary"
          )}
        >
          Drop here to keep this todo outside a section
        </div>
      ) : null}
    </div>
  );
}

function RootDropSlot({
  index,
  position,
  activeDrag,
}: {
  index: number;
  position: "before" | "after";
  activeDrag: ProjectTodoDragData | null;
}) {
  const droppable = useDroppable({
    id: `root-slot-${index}`,
    data: { type: "root-slot", index } satisfies ProjectTodoDragData,
    disabled: !activeDrag || activeDrag.type === "container" || activeDrag.type === "section-header",
  });

  if (!activeDrag || activeDrag.type === "container" || activeDrag.type === "section-header") return null;
  return (
    <div
      ref={droppable.setNodeRef}
      className={cn(
        "absolute left-2 right-2 z-10 h-3 rounded-full border border-dashed border-transparent transition-colors",
        position === "before" ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2",
        droppable.isOver && "border-primary bg-primary/10"
      )}
      aria-label={`Place To-Do at main-list position ${index + 1}`}
    />
  );
}

export function ProjectTodoBoard({
  sections,
  todos,
  showCompleted,
  renderTodo,
  onAddTodo,
  onRenameSection,
  onDeleteSection,
  onLayoutChange,
  saving,
}: {
  sections: SectionRow[];
  todos: TodoRow[];
  showCompleted: boolean;
  renderTodo: (todo: TodoRow, dragHandle?: any) => ReactNode;
  onAddTodo: (sectionId: number) => void;
  onRenameSection: (sectionId: number, title: string) => void;
  onDeleteSection: (section: SectionRow) => void;
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
  const [overDropTarget, setOverDropTarget] = useState<ProjectTodoDragData | null>(
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
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const collisionDetection: CollisionDetection = args => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length === 0) return closestCenter(args);
    return [...pointerCollisions].sort((left, right) => {
      const priority = (collision: (typeof pointerCollisions)[number]) => {
        const data = (collision.data?.droppableContainer.data.current ??
          null) as ProjectTodoDragData | null;
        if (data?.type === "task" || data?.type === "section-header") return 0;
        if (data?.type === "root-slot") return 1;
        if (data?.type === "container" && data.sectionId !== null) return 2;
        if (data?.type === "section") return 3;
        return 4;
      };
      return priority(left) - priority(right);
    });
  };
  useEffect(() => {
    setLayout(incomingLayout);
  }, [incomingSignature]);

  function isVisible(taskId: number) {
    const todo = todoById.get(taskId);
    return !!todo && (showCompleted || !todo.completed);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDrag(
      (event.active.data.current as ProjectTodoDragData | undefined) ?? null
    );
    setOverDropTarget(null);
  }

  function handleDragOver(event: DragOverEvent) {
    setOverDropTarget(
      (event.over?.data.current as ProjectTodoDragData | undefined) ?? null
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    const activeData = event.active.data.current as
      | ProjectTodoDragData
      | undefined;
    const overData = event.over?.data.current as
      | ProjectTodoDragData
      | undefined;
    setActiveDrag(null);
    setOverDropTarget(null);
    if (
      !activeData ||
      !overData ||
      activeData.type === "container" ||
      activeData.type === "root-slot"
    )
      return;

    const nextLayout =
      activeData.type === "section"
        ? moveProjectTodoSection(layout, activeData.sectionId, overData)
        : activeData.type === "task"
          ? moveProjectTodo(layout, activeData.taskId, overData)
          : layout;
    if (JSON.stringify(nextLayout) === JSON.stringify(layout)) return;

    const previousLayout = layout;
    setLayout(nextLayout);
    try {
      await onLayoutChange(nextLayout);
    } catch {
      setLayout(previousLayout);
    }
  }

  const visibleRootIds = layout.flatMap(item => {
    if (item.type === "section") return [sectionSortableId(item.id)];
    return isVisible(item.id) ? [taskSortableId(item.id)] : [];
  });

  function renderRootItem(item: ProjectTodoLayoutItem) {
    if (item.type === "task") {
      const todo = todoById.get(item.id);
      if (!todo || !isVisible(item.id)) return null;
      return (
        <SortableTodoRow taskId={item.id} disabled={saving}>
          {dragHandle => renderTodo(todo, dragHandle)}
        </SortableTodoRow>
      );
    }

    const section = sectionById.get(item.id);
    if (!section) return null;
    const sectionTodos = item.taskIds
      .map(taskId => todoById.get(taskId))
      .filter((todo): todo is TodoRow => !!todo);
    const visibleTaskIds = item.taskIds.filter(isVisible);
    const taskOverSectionId = overDropTarget?.type === "task"
      ? findTaskLocation(layout, overDropTarget.taskId)?.sectionId ?? null
      : null;
    const activeTaskSectionId = activeDrag?.type === "task"
      ? findTaskLocation(layout, activeDrag.taskId)?.sectionId ?? null
      : null;
    const isTaskReadyForSection = activeDrag?.type === "task" && activeTaskSectionId !== item.id && (
      (overDropTarget?.type === "section" && overDropTarget.sectionId === item.id) ||
      (overDropTarget?.type === "section-header" && overDropTarget.sectionId === item.id) ||
      (overDropTarget?.type === "container" && overDropTarget.sectionId === item.id) ||
      taskOverSectionId === item.id
    );
    return (
      <SortableSectionRow
        section={section}
        taskIds={visibleTaskIds}
        todoCount={sectionTodos.length}
        completedCount={sectionTodos.filter(todo => todo.completed).length}
        displayCount={visibleTaskIds.length}
        onAddTodo={() => onAddTodo(section.id)}
        onRename={title => onRenameSection(section.id, title)}
        onDelete={() => onDeleteSection(section)}
        disabled={saving}
        acceptingTask={isTaskReadyForSection}
        freezeDuringTaskDrag={activeDrag?.type === "task"}
        taskDragActive={activeDrag?.type === "task"}
      >
        {visibleTaskIds.map(taskId => {
          const todo = todoById.get(taskId);
          if (!todo) return null;
          return (
            <SortableTodoRow key={taskId} taskId={taskId} disabled={saving}>
              {dragHandle => renderTodo(todo, dragHandle)}
            </SortableTodoRow>
          );
        })}
      </SortableSectionRow>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragCancel={() => { setActiveDrag(null); setOverDropTarget(null); }}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={visibleRootIds} strategy={rectSortingStrategy}>
        <RootTodoContainer activeDrag={activeDrag}>
          {layout.map((item, rootIndex) => (
            <div className="relative" key={`${item.type}-${item.id}`}>
              <RootDropSlot index={rootIndex} position="before" activeDrag={activeDrag} />
              {renderRootItem(item)}
              {rootIndex === layout.length - 1 ? <RootDropSlot index={layout.length} position="after" activeDrag={activeDrag} /> : null}
            </div>
          ))}
          {visibleRootIds.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">
              No open todos. Turn on Show completed to view completed todos.
            </p>
          ) : null}
        </RootTodoContainer>
      </SortableContext>

      <DragOverlay
        modifiers={[keepDragPreviewBelowPointer]}
        dropAnimation={{
          duration: 180,
          easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      >
        {activeDrag?.type === "task" ? (
          <div className="flex max-w-md items-center gap-2 rounded-md border border-primary/30 bg-card px-3 py-2 text-sm font-medium shadow-xl">
            <GripVertical className="h-4 w-4 text-primary" />
            <span className="truncate">
              {todoById.get(activeDrag.taskId)?.title}
            </span>
          </div>
        ) : activeDrag?.type === "section" ? (
          <div className="flex max-w-md items-center gap-2 rounded-lg border border-primary/30 bg-card px-3 py-2 text-sm font-semibold shadow-xl">
            <GripVertical className="h-4 w-4 text-primary" />
            <ListChecks className="h-4 w-4 text-primary" />
            <span className="truncate">
              {sectionById.get(activeDrag.sectionId)?.title}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
