import { useEffect, useState } from "react";
import { ArrowRightLeft, FolderKanban, ListTodo } from "lucide-react";
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

export type PersonalTodoProjectOption = {
  id: number;
  title: string;
};

export default function PersonalTodoRouteProjectDialog({
  todoTitle,
  projects,
  isPending = false,
  onRoute,
}: {
  todoTitle: string;
  projects: PersonalTodoProjectOption[];
  isPending?: boolean;
  onRoute: (destinationProjectId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [destinationProjectId, setDestinationProjectId] = useState("");
  const destination = projects.find(
    project => project.id === Number(destinationProjectId)
  );

  useEffect(() => {
    if (!open) setDestinationProjectId("");
  }, [open]);

  if (!projects.length) return null;

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
            <DialogTitle>Move Personal To-Do to a Project</DialogTitle>
            <DialogDescription>
              Move “{todoTitle}” into a Project you can access. It will become a
              Project To-Do in that Project&apos;s main To-Do list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2 rounded-md border bg-muted/20 p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Current location
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                  <ListTodo className="h-4 w-4 text-primary" />
                  Personal To-Dos
                </p>
              </div>
              <ArrowRightLeft className="hidden h-5 w-5 text-primary sm:block" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Destination Project
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                  <FolderKanban className="h-4 w-4 text-primary" />
                  {destination?.title ?? "Choose a Project"}
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="personal-todo-project-route">Move to</Label>
              <Select
                value={destinationProjectId}
                onValueChange={setDestinationProjectId}
              >
                <SelectTrigger
                  id="personal-todo-project-route"
                  className="h-10"
                >
                  <SelectValue placeholder="Select a Project you can access" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="rounded-md border border-primary/15 bg-primary/[0.025] px-3 py-2 text-xs text-muted-foreground">
              The title, details, due date, recurrence, and your ownership move
              with the To-Do. The personal copy is removed once the Project
              To-Do is created.
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
                onRoute(Number(destinationProjectId));
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
