import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import ProjectMilestoneDependencyDialog, { type ProjectMilestoneDependencyOption } from "@/components/ProjectMilestoneDependencyDialog";
import { useDroppable } from "@dnd-kit/core";
import {
  CalendarDays,
  Check,
  ChevronDown,
  GripVertical,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

export function ProjectTodoSection({
  section,
  todoCount,
  displayCount,
  onAddTodo,
  onUpdate,
  onDelete,
  isRock,
  dragHandle,
  acceptingTask,
  taskDragActive,
  milestoneDependencyOptions,
  onSetDependencies,
  dependenciesPending,
  children,
}: {
  section: {
    id: number;
    title: string;
    description?: string | null;
    dueDate?: Date | string | null;
    predecessorMilestoneIds?: number[];
    predecessors?: ProjectMilestoneDependencyOption[];
  };
  todoCount: number;
  displayCount: number;
  onAddTodo: () => void;
  onUpdate: (updates: { title: string; description: string | null; dueDate: Date | null }) => void;
  onDelete: () => void;
  isRock: boolean;
  dragHandle: any;
  acceptingTask: boolean;
  taskDragActive: boolean;
  milestoneDependencyOptions?: ProjectMilestoneDependencyOption[];
  onSetDependencies?: (predecessorMilestoneIds: number[]) => void;
  dependenciesPending?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [description, setDescription] = useState(section.description ?? "");
  const dueDateValue = section.dueDate ? new Date(section.dueDate).toISOString().slice(0, 10) : "";
  const [dueDate, setDueDate] = useState(dueDateValue);
  const sectionLabel = isRock ? "milestone" : "section";
  const sectionLabelTitle = isRock ? "Milestone" : "Section";
  const headerDrop = useDroppable({
    id: `section-header-${section.id}`,
    data: { type: "section-header", sectionId: section.id },
    disabled: !taskDragActive,
  });

  useEffect(() => {
    setTitle(section.title);
  }, [section.title]);

  useEffect(() => {
    setDescription(section.description ?? "");
  }, [section.description]);

  useEffect(() => {
    setDueDate(section.dueDate ? new Date(section.dueDate).toISOString().slice(0, 10) : "");
  }, [section.dueDate]);

  useEffect(() => {
    if (acceptingTask) setExpanded(true);
  }, [acceptingTask]);

  function saveSection() {
    const normalizedTitle = title.trim();
    if (!normalizedTitle || (isRock && !dueDate)) return;
    onUpdate({ title: normalizedTitle, description: description.trim() || null, dueDate: dueDate ? new Date(`${dueDate}T12:00:00`) : null });
    setEditing(false);
  }

  function cancelEditing() {
    setTitle(section.title);
    setDescription(section.description ?? "");
    setDueDate(section.dueDate ? new Date(section.dueDate).toISOString().slice(0, 10) : "");
    setEditing(false);
  }

  return (
    <Collapsible
      open={expanded || acceptingTask}
      onOpenChange={setExpanded}
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
    >
      <div ref={headerDrop.setNodeRef} className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-muted/30 px-3 py-2.5">

        <button
          type="button"
          ref={dragHandle.setActivatorNodeRef}
          {...dragHandle.attributes}
          {...dragHandle.listeners}
          className="flex h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:cursor-grabbing"
          aria-label={`Drag ${section.title} ${sectionLabel}`}
          title={`Drag ${sectionLabel}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        {editing ? (
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex min-w-0 items-center gap-2">
              <ListChecks className="h-4 w-4 shrink-0 text-primary" />
              <Input
                value={title}
                onChange={event => setTitle(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Escape") cancelEditing();
                }}
                className="h-7 max-w-sm bg-background text-sm font-semibold"
                autoFocus
              />
              <Input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className="h-7 w-32 shrink-0 bg-background text-xs" aria-label={`${sectionLabelTitle} due date`} required={isRock} />
            </div>
            <Textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} maxLength={8_000} className="bg-background text-sm" placeholder={isRock ? "Milestone description, dependencies, and external dependencies" : "Optional section description"} aria-label={`${sectionLabelTitle} description`} />
          </div>
        ) : (
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-label={`${expanded ? "Collapse" : "Expand"} ${section.title} ${sectionLabel}`}
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  !expanded && "-rotate-90"
                )}
              />
              <ListChecks className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate text-sm font-semibold">
                {section.title}
              </span>
              {dueDate || isRock ? <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", dueDate ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive")}><CalendarDays className="h-3 w-3" />{dueDate ? `Due ${new Date(`${dueDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "Due date required"}</span> : null}
            </button>
          </CollapsibleTrigger>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {!editing && !isRock && section.dueDate ? <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onUpdate({ title: section.title, description: section.description ?? null, dueDate: null })}
          >
            Clear date
          </Button> : null}
          {editing ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={saveSection}
                disabled={!title.trim() || (isRock && !dueDate)}
                aria-label={`Save ${sectionLabel}`}
                title={`Save ${sectionLabel}`}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={cancelEditing}
                aria-label={`Cancel ${sectionLabel} title edit`}
                title="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              {isRock && onSetDependencies ? <ProjectMilestoneDependencyDialog milestone={section} options={milestoneDependencyOptions ?? []} isPending={dependenciesPending} onSave={onSetDependencies} /> : null}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setEditing(true)}
                aria-label={`Edit ${section.title}`}
                title={`Edit ${sectionLabel}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
                aria-label={`Delete ${section.title}`}
                title={`Delete ${sectionLabel}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={onAddTodo}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Todo
          </Button>
        </div>
      </div>

      <CollapsibleContent>
        {section.description || section.predecessors?.length ? <div className="space-y-2 border-b border-border/70 px-3 py-2.5">
          {section.description ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{section.description}</p> : null}
          {section.predecessors?.length ? <div className="flex flex-wrap items-center gap-1.5 text-xs text-primary"><span className="h-2.5 w-2.5 rotate-45 rounded-[1px] border border-primary bg-primary/10" /><span className="font-semibold">Depends on</span>{section.predecessors.map(predecessor => <span key={predecessor.id} className="rounded-full border border-primary/20 bg-primary/[0.025] px-2 py-0.5">{predecessor.projectTitle} / {predecessor.title}</span>)}</div> : null}
        </div> : null}
        {displayCount > 0 || acceptingTask ? (
          <div className="space-y-2 p-2.5">{children}</div>
        ) : (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {todoCount > 0
              ? `No open todos in this ${sectionLabel}. Turn on Show completed to view them.`
              : `No todos in this ${sectionLabel} yet.`}
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
