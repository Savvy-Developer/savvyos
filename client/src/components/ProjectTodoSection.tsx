import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
  completedCount,
  displayCount,
  onAddTodo,
  onUpdate,
  onDelete,
  isRock,
  dragHandle,
  acceptingTask,
  taskDragActive,
  children,
}: {
  section: { id: number; title: string; dueDate?: Date | string | null };
  todoCount: number;
  completedCount: number;
  displayCount: number;
  onAddTodo: () => void;
  onUpdate: (updates: { title: string; dueDate: Date | null }) => void;
  onDelete: () => void;
  isRock: boolean;
  dragHandle: any;
  acceptingTask: boolean;
  taskDragActive: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(section.title);
  const dueDateValue = section.dueDate ? new Date(section.dueDate).toISOString().slice(0, 10) : "";
  const [dueDate, setDueDate] = useState(dueDateValue);
  const headerDrop = useDroppable({
    id: `section-header-${section.id}`,
    data: { type: "section-header", sectionId: section.id },
    disabled: !taskDragActive,
  });

  useEffect(() => {
    setTitle(section.title);
  }, [section.title]);

  useEffect(() => {
    setDueDate(section.dueDate ? new Date(section.dueDate).toISOString().slice(0, 10) : "");
  }, [section.dueDate]);

  useEffect(() => {
    if (acceptingTask) setExpanded(true);
  }, [acceptingTask]);

  function saveSection() {
    const normalizedTitle = title.trim();
    if (!normalizedTitle || (isRock && !dueDate)) return;
    onUpdate({ title: normalizedTitle, dueDate: dueDate ? new Date(`${dueDate}T12:00:00`) : null });
    setEditing(false);
  }

  function cancelEditing() {
    setTitle(section.title);
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
          aria-label={`Drag ${section.title} section`}
          title="Drag section"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        {editing ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ListChecks className="h-4 w-4 shrink-0 text-primary" />
            <Input
              value={title}
              onChange={event => setTitle(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") saveSection();
                if (event.key === "Escape") cancelEditing();
              }}
              className="h-7 max-w-sm bg-background text-sm font-semibold"
              autoFocus
            />
            <Input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className="h-7 w-32 shrink-0 bg-background text-xs" aria-label="Section due date" required={isRock} />
            <Badge
              variant="secondary"
              className="shrink-0 text-[11px]"
              aria-label={`${completedCount} of ${todoCount} todos completed`}
            >
              {completedCount}/{todoCount}
            </Badge>
          </div>
        ) : (
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-label={`${expanded ? "Collapse" : "Expand"} ${section.title} section`}
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
              <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", dueDate ? "bg-muted text-muted-foreground" : isRock ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}><CalendarDays className="h-3 w-3" />{dueDate ? `Due ${new Date(`${dueDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : isRock ? "Due date required" : "No due date"}</span>
              <Badge
                variant="secondary"
                className="shrink-0 text-[11px]"
                aria-label={`${completedCount} of ${todoCount} todos completed`}
              >
                {completedCount}/{todoCount}
              </Badge>
            </button>
          </CollapsibleTrigger>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {editing ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={saveSection}
                disabled={!title.trim() || (isRock && !dueDate)}
                aria-label="Save section"
                title="Save section"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={cancelEditing}
                aria-label="Cancel section title edit"
                title="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setEditing(true)}
                aria-label={`Edit ${section.title}`}
                title="Edit section"
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
                title="Delete section"
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
        {displayCount > 0 || acceptingTask ? (
          <div className="space-y-2 p-2.5">{children}</div>
        ) : (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {todoCount > 0
              ? "No open todos in this section. Turn on Show completed to view them."
              : "No todos in this section yet."}
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
