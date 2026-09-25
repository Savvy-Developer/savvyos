import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ProjectMoveOption = {
  id: number;
  title: string;
};

export default function ProjectTodoMoveProjectDialog({
  todoTitle,
  currentProjectId,
  currentProjectTitle,
  projects,
  childCount = 0,
  isPending = false,
  onMove,
}: {
  todoTitle: string;
  currentProjectId: number;
  currentProjectTitle: string;
  projects: ProjectMoveOption[];
  childCount?: number;
  isPending?: boolean;
  onMove: (destinationProjectId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [destinationProjectId, setDestinationProjectId] = useState("");
  const destinations = useMemo(
    () => projects.filter(project => project.id !== currentProjectId),
    [currentProjectId, projects]
  );
  const destination = destinations.find(
    project => project.id === Number(destinationProjectId)
  );

  useEffect(() => {
    if (!open) setDestinationProjectId("");
  }, [open]);

  if (!destinations.length) return null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8"
        onClick={() => setOpen(true)}
      >
        <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
        Move to project
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Move To-Do to another project</DialogTitle>
            <DialogDescription>
              Move “{todoTitle}” only to a project you can access. It will be
              placed in that project&apos;s main To-Do list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2 rounded-md border bg-muted/20 p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Current project
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                  <FolderKanban className="h-4 w-4 text-primary" />
                  {currentProjectTitle}
                </p>
              </div>
              <ArrowRightLeft className="hidden h-5 w-5 text-primary sm:block" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Destination project
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                  <FolderKanban className="h-4 w-4 text-primary" />
                  {destination?.title ?? "Choose a project"}
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`project-todo-project-move-${currentProjectId}`}>
                Move to
              </Label>
              <Select
                value={destinationProjectId}
                onValueChange={setDestinationProjectId}
              >
                <SelectTrigger
                  id={`project-todo-project-move-${currentProjectId}`}
                  className="h-10"
                >
                  <SelectValue placeholder="Select a project you can access" />
                </SelectTrigger>
                <SelectContent>
                  {destinations.map(project => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="rounded-md border border-primary/15 bg-primary/[0.025] px-3 py-2 text-xs text-muted-foreground">
              Details, comments, completion state, and activity stay with this
              To-Do.
              {childCount
                ? ` Its ${childCount} sub-To-Do${childCount === 1 ? "" : "s"} move with it.`
                : ""}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isPending || !destinationProjectId}
              onClick={() => {
                if (!destinationProjectId) return;
                onMove(Number(destinationProjectId));
                setOpen(false);
              }}
            >
              {isPending ? "Moving…" : "Move To-Do"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
