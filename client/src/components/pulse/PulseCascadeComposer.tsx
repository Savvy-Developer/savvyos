import { useMemo, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type CascadeComposerFormProps = {
  sourceMeetingId: string;
  sourceMeetingName: string;
  sessionId?: string;
  onSaved?: () => void;
};

function CascadeComposerForm({
  sourceMeetingId,
  sourceMeetingName,
  sessionId,
  onSaved,
}: CascadeComposerFormProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const meetings = trpc.pulse.list.useQuery();
  const send = trpc.pulse.cascades.send.useMutation({
    onSuccess: result => {
      setSubject("");
      setBody("");
      setTargets([]);
      toast.success(
        `Cascade sent to ${result.recipientCount} recipient${result.recipientCount === 1 ? "" : "s"}.`
      );
      onSaved?.();
    },
    onError: error => toast.error(error.message),
  });
  const draft = trpc.pulse.l10.draftCascade.useMutation({
    onSuccess: () => {
      setSubject("");
      setBody("");
      setTargets([]);
      toast.success("Cascade prepared for publication when this L10 closes.");
      onSaved?.();
    },
    onError: error => toast.error(error.message),
  });
  const candidates = useMemo(
    () =>
      (meetings.data ?? []).filter(
        (meeting: any) => meeting.id !== sourceMeetingId
      ),
    [meetings.data, sourceMeetingId]
  );
  const pending = send.isPending || draft.isPending;
  const toggleTarget = (meetingId: string) =>
    setTargets(current =>
      current.includes(meetingId)
        ? current.filter(id => id !== meetingId)
        : [...current, meetingId]
    );
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!subject.trim() || !body.trim() || !targets.length) return;
    const input = {
      toMeetingIds: targets,
      subject: subject.trim(),
      body: body.trim(),
    };
    if (sessionId) {
      draft.mutate({ meetingId: sourceMeetingId, sessionId, ...input });
    } else {
      send.mutate({ fromMeetingId: sourceMeetingId, ...input });
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="rounded-lg border border-primary/20 bg-primary/[0.035] px-3 py-2.5 text-sm">
        <span className="text-muted-foreground">Sending from </span>
        <span className="font-semibold text-foreground">
          {sourceMeetingName}
        </span>
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor={sessionId ? "cascade-draft-subject" : "cascade-send-subject"}
        >
          Subject
        </Label>
        <Input
          id={sessionId ? "cascade-draft-subject" : "cascade-send-subject"}
          value={subject}
          maxLength={255}
          onChange={event => setSubject(event.target.value)}
          placeholder="What does the receiving meeting need to know?"
          className="min-h-11"
        />
      </div>
      <div className="space-y-2">
        <Label>Send to</Label>
        {meetings.isLoading ? (
          <p className="text-sm text-muted-foreground">
            Loading authorized meetings…
          </p>
        ) : candidates.length ? (
          <div className="flex flex-wrap gap-2">
            {candidates.map((meeting: any) => {
              const selected = targets.includes(meeting.id);
              const type =
                meeting.label === "level_10"
                  ? "L10"
                  : meeting.label === "one_on_one"
                    ? "1:1"
                    : "Meeting";
              return (
                <button
                  key={meeting.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleTarget(meeting.id)}
                  className={`min-h-10 rounded-md border px-3 text-left text-sm font-medium transition-colors ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}
                >
                  <span>{meeting.name}</span>
                  <span
                    className={`ml-1.5 text-xs ${selected ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                  >
                    · {type}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            There are no other authorized meetings available for this handoff.
          </p>
        )}
        <p className="text-xs leading-5 text-muted-foreground">
          Only meetings you can access are available. Every recipient must also
          have access to {sourceMeetingName} before this cascade can be sent.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor={sessionId ? "cascade-draft-message" : "cascade-send-message"}
        >
          Message
        </Label>
        <Textarea
          id={sessionId ? "cascade-draft-message" : "cascade-send-message"}
          value={body}
          maxLength={4000}
          onChange={event => setBody(event.target.value)}
          className="min-h-28"
          placeholder="Write the context the receiving meeting should carry forward…"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          {sessionId
            ? "This stays a draft until the L10 is closed."
            : "Recipients will be notified and asked to acknowledge it."}
        </p>
        <Button
          type="submit"
          className="min-h-11"
          disabled={
            pending || !subject.trim() || !body.trim() || !targets.length
          }
        >
          <Send className="mr-2 h-4 w-4" />
          {pending
            ? sessionId
              ? "Preparing…"
              : "Sending…"
            : sessionId
              ? "Prepare cascade"
              : "Send cascade"}
        </Button>
      </div>
    </form>
  );
}

export function PulseCascadeComposerDialog({
  open,
  onOpenChange,
  sourceMeetingId,
  sourceMeetingName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceMeetingId: string;
  sourceMeetingName: string;
  onSaved?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send a cascade</DialogTitle>
          <DialogDescription>
            Hand off a clear message from {sourceMeetingName} to another
            authorized Pulse meeting. Recipients will be asked to acknowledge
            it.
          </DialogDescription>
        </DialogHeader>
        <CascadeComposerForm
          sourceMeetingId={sourceMeetingId}
          sourceMeetingName={sourceMeetingName}
          onSaved={() => {
            onSaved?.();
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function PulseCascadeDraftForm({
  sourceMeetingId,
  sourceMeetingName,
  sessionId,
  onSaved,
}: CascadeComposerFormProps & { sessionId: string }) {
  return (
    <CascadeComposerForm
      sourceMeetingId={sourceMeetingId}
      sourceMeetingName={sourceMeetingName}
      sessionId={sessionId}
      onSaved={onSaved}
    />
  );
}
