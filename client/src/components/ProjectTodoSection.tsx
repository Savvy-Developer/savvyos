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
import {
  Check,
  ChevronDown,
  ChevronUp,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

type Direction = "up" | "down";

export function ProjectTodoSection({
  section,
  sectionIndex,
  sectionCount,
  todoCount,
  completedCount,
  displayCount,
  onAddTodo,
  onRename,
  onMove,
  onDelete,
  children,
}: {
  section: { id: number; title: string };
  sectionIndex: number;
  sectionCount: number;
  todoCount: number;
  completedCount: number;
  displayCount: number;
  onAddTodo: () => void;
  onRename: (title: string) => void;
  onMove: (direction: Direction) => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(section.title);

  useEffect(() => {
    setTitle(section.title);
  }, [section.title]);

  function saveTitle() {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return;
    onRename(normalizedTitle);
    setEditing(false);
  }

  function cancelEditing() {
    setTitle(section.title);
    setEditing(false);
  }

  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-muted/30 px-3 py-2.5">
        {editing ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ListChecks className="h-4 w-4 shrink-0 text-primary" />
            <Input
              value={title}
              onChange={event => setTitle(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") saveTitle();
                if (event.key === "Escape") cancelEditing();
              }}
              className="h-7 max-w-sm bg-background text-sm font-semibold"
              autoFocus
            />
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
                onClick={saveTitle}
                disabled={!title.trim()}
                aria-label="Save section title"
                title="Save section title"
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
                aria-label={`Rename ${section.title}`}
                title="Rename section"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => onMove("up")}
                disabled={sectionIndex === 0}
                aria-label={`Move ${section.title} higher`}
                title="Move section higher"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => onMove("down")}
                disabled={sectionIndex === sectionCount - 1}
                aria-label={`Move ${section.title} lower`}
                title="Move section lower"
              >
                <ChevronDown className="h-4 w-4" />
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
        <div className="space-y-2 p-2.5">
          {displayCount > 0 ? (
            children
          ) : (
            <p className="px-2 py-5 text-center text-sm text-muted-foreground">
              {todoCount > 0
                ? "No open todos in this section. Turn on Show completed to view them."
                : "No todos in this section yet."}
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
