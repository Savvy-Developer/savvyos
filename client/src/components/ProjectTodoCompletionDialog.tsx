import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

type ProjectTodoCompletionDialogProps = {
  open: boolean;
  taskTitle: string;
  isPending?: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (completionNote: string) => void;
};

/**
 * Project To-Dos retain outcomes in their Project activity history. Keeping the
 * prompt here gives every Project surface the same completion behavior.
 */
export default function ProjectTodoCompletionDialog({
  open,
  taskTitle,
  isPending = false,
  onOpenChange,
  onComplete,
}: ProjectTodoCompletionDialogProps) {
  const [completionNote, setCompletionNote] = useState("");

  useEffect(() => {
    if (!open) setCompletionNote("");
  }, [open]);

  function closeDialog(nextOpen: boolean) {
    if (!nextOpen && !isPending) {
      setCompletionNote("");
      onOpenChange(false);
    }
  }

  function submit() {
    const note = completionNote.trim();
    if (!note) return;
    onComplete(note);
  }

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete Project To-Do</DialogTitle>
          <DialogDescription>
            Record the completed outcome before closing this work. The note is
            retained in this To-Do&apos;s Project activity history.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">
            {taskTitle}
          </p>
          <Label htmlFor="project-todo-completion-note">
            What was completed?
          </Label>
          <Textarea
            id="project-todo-completion-note"
            autoFocus
            value={completionNote}
            onChange={event => setCompletionNote(event.target.value)}
            className="min-h-24"
            placeholder="Describe the outcome, deliverable, or completed work…"
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => closeDialog(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!completionNote.trim() || isPending}
            onClick={submit}
          >
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            {isPending ? "Completing…" : "Complete To-Do"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
