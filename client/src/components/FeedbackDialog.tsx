import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bug, Lightbulb, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";

export default function FeedbackDialog() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"bug" | "feature">("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const create = trpc.feedback.create.useMutation({
    onSuccess: () => {
      toast.success("Thank you! Your feedback has been submitted.");
      setOpen(false);
      setTitle("");
      setDescription("");
      setType("bug");
    },
    onError: (e: any) => toast.error(e.message),
  });

  function handleSubmit() {
    if (!title.trim() || !description.trim()) {
      toast.error("Please fill in all fields.");
      return;
    }
    create.mutate({ type, title: title.trim(), description: description.trim() });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors">
          <MessageSquarePlus className="h-4 w-4" />
          <span>Report Bug / Request Feature</span>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Feedback</DialogTitle>
          <DialogDescription>
            Report a bug or request a new feature. Your feedback helps us improve.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs mb-1.5 block">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as "bug" | "feature")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">
                  <span className="flex items-center gap-2">
                    <Bug className="h-4 w-4 text-red-500" /> Bug Report
                  </span>
                </SelectItem>
                <SelectItem value="feature">
                  <span className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" /> Feature Request
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Title</Label>
            <Input
              placeholder={type === "bug" ? "Brief description of the bug..." : "What feature would you like?"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Description</Label>
            <Textarea
              placeholder={type === "bug" ? "Steps to reproduce, expected vs actual behavior..." : "Describe the feature in detail..."}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={create.isPending}>
              {create.isPending ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
