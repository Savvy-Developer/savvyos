import { useEffect, useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SortableProject = {
  id: number;
  title: string;
  description: string;
  department: string;
  taskOpen: number;
};

type ProjectSortListProps = {
  projects: SortableProject[];
  saving: boolean;
  onOrderChange: (projectIds: number[]) => Promise<boolean>;
};

function SortableProjectRow({
  project,
  index,
  projectCount,
  saving,
  onMove,
}: {
  project: SortableProject;
  index: number;
  projectCount: number;
  saving: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const sortable = useSortable({ id: project.id, disabled: saving });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={cn(sortable.isDragging && "relative z-20 opacity-35")}
    >
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm transition-shadow hover:shadow">
        <Button
          ref={sortable.setActivatorNodeRef}
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={`Drag ${project.title} to reorder`}
          title="Drag to reorder. Keyboard: Space, then arrow keys."
          disabled={saving}
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical className="h-4 w-4" />
        </Button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {project.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {project.description}
          </p>
        </div>

        <span className="hidden shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground sm:inline">
          {project.department}
        </span>
        <span
          className="hidden shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground sm:inline"
          title={`${project.taskOpen} open To-Do${project.taskOpen === 1 ? "" : "s"}`}
        >
          {project.taskOpen} open
        </span>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label={`Move ${project.title} up`}
            title="Move up"
            disabled={saving || index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label={`Move ${project.title} down`}
            title="Move down"
            disabled={saving || index === projectCount - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectSortList({
  projects,
  saving,
  onOrderChange,
}: ProjectSortListProps) {
  const incomingIds = useMemo(
    () => projects.map(project => project.id),
    [projects]
  );
  const incomingSignature = incomingIds.join(",");
  const [projectIds, setProjectIds] = useState<number[]>(incomingIds);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    setProjectIds(incomingIds);
  }, [incomingSignature]);

  const orderedProjects = useMemo(() => {
    const projectsById = new Map(
      projects.map(project => [project.id, project])
    );
    const ordered = projectIds
      .map(id => projectsById.get(id))
      .filter((project): project is SortableProject => !!project);
    const orderedIds = new Set(ordered.map(project => project.id));
    return [
      ...ordered,
      ...projects.filter(project => !orderedIds.has(project.id)),
    ];
  }, [projectIds, projects]);

  async function saveOrder(nextProjectIds: number[]) {
    if (saving || nextProjectIds.join(",") === projectIds.join(",")) return;
    const previousProjectIds = projectIds;
    setProjectIds(nextProjectIds);
    const saved = await onOrderChange(nextProjectIds);
    if (!saved) setProjectIds(previousProjectIds);
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = Number(event.active.id);
    const overId = event.over ? Number(event.over.id) : null;
    if (!overId || activeId === overId || saving) return;
    const fromIndex = projectIds.indexOf(activeId);
    const toIndex = projectIds.indexOf(overId);
    if (fromIndex < 0 || toIndex < 0) return;
    void saveOrder(arrayMove(projectIds, fromIndex, toIndex));
  }

  function moveProject(projectId: number, direction: -1 | 1) {
    const fromIndex = projectIds.indexOf(projectId);
    const toIndex = fromIndex + direction;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= projectIds.length) return;
    void saveOrder(arrayMove(projectIds, fromIndex, toIndex));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={projectIds}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {orderedProjects.map((project, index) => (
            <SortableProjectRow
              key={project.id}
              project={project}
              index={index}
              projectCount={orderedProjects.length}
              saving={saving}
              onMove={direction => moveProject(project.id, direction)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
