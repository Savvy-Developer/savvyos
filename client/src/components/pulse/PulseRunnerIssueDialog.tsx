import { useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

export type PulseRunnerIssueSourceRequest = {
  sourceType: "headline" | "scorecard" | "rock";
  sourceId: string;
  sourceLabel: string;
  defaultTitle: string;
  summary: string;
};

type Props = {
  meetingId: string;
  sessionId: string;
  source: PulseRunnerIssueSourceRequest | null;
  onOpenChange: (open: boolean) => void;
  onRaised: (issueId: string) => void;
};

export function PulseRunnerIssueDialog({
  meetingId,
  sessionId,
  source,
  onOpenChange,
  onRaised,
}: Props) {
  const [title, setTitle] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [issueTimeframe, setIssueTimeframe] = useState<
    "short_term" | "long_term"
  >("short_term");
  const raiseIssue = trpc.pulse.l10.raiseIssueFromRunner.useMutation({
    onSuccess: result => {
      if (result.alreadyRaised) {
        toast.message("This item is already in IDS for this L10.");
      } else {
        toast.success("Issue added to IDS with its source context.");
      }
      onRaised(result.issueId);
      onOpenChange(false);
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!source) return;
    setTitle(source.defaultTitle);
    setAdditionalContext("");
    setIssueTimeframe("short_term");
  }, [source]);

  const submit = () => {
    if (!source || !title.trim()) return;
    raiseIssue.mutate({
      meetingId,
      sessionId,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      title: title.trim(),
      additionalContext: additionalContext.trim() || undefined,
      issueTimeframe,
    });
  };

  return (
    <Dialog open={Boolean(source)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-amber-600" />
            Add to IDS
          </DialogTitle>
          <DialogDescription>
            This creates an Issue in this L10 and retains the{" "}
            {source?.sourceLabel.toLowerCase() ?? "source"} context.
          </DialogDescription>
        </DialogHeader>

        {source ? (
          <div className="space-y-4">
            <section className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm">
              <p className="font-semibold text-amber-950">Source context</p>
              <p className="mt-1 whitespace-pre-wrap text-amber-950/80">
                {source.summary}
              </p>
            </section>
            <div className="space-y-2">
              <Label htmlFor="pulse-runner-issue-title">Issue</Label>
              <Input
                id="pulse-runner-issue-title"
                autoFocus
                value={title}
                onChange={event => setTitle(event.target.value)}
                maxLength={500}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
              <div className="space-y-2">
                <Label htmlFor="pulse-runner-issue-context">
                  Add context{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Textarea
                  id="pulse-runner-issue-context"
                  className="min-h-24"
                  value={additionalContext}
                  onChange={event => setAdditionalContext(event.target.value)}
                  maxLength={2000}
                  placeholder="What should IDS discuss or decide?"
                />
              </div>
              <div className="space-y-2">
                <Label>Timeframe</Label>
                <Select
                  value={issueTimeframe}
                  onValueChange={value =>
                    setIssueTimeframe(value as "short_term" | "long_term")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short_term">Short Term</SelectItem>
                    <SelectItem value="long_term">Long Term</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!source || !title.trim() || raiseIssue.isPending}
            onClick={submit}
          >
            <Flag className="mr-2 h-4 w-4" />
            {raiseIssue.isPending ? "Adding…" : "Add Issue to IDS"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
