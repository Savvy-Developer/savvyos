import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  HelpCircle,
  ListChecks,
  Milestone,
  Save,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
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
import { toast } from "sonner";

type UpdateStatus = "on_track" | "at_risk" | "off_track";

type Props = {
  projectId: number;
  isRock: boolean;
  updateContext: any;
  people: Array<{ id: number; name?: string | null; email?: string | null }>;
  currentUserId?: number;
  onSubmitted: () => void;
};

const healthOptions: Array<{ value: UpdateStatus; label: string }> = [
  { value: "on_track", label: "On Track" },
  { value: "at_risk", label: "At Risk" },
  { value: "off_track", label: "Off Track" },
];

function dateValue(value: Date | string | null | undefined) {
  return value ? format(new Date(value), "yyyy-MM-dd") : "";
}

function dateLabel(value: Date | string | null | undefined) {
  return value ? format(new Date(value), "MMM d, yyyy") : "Not set";
}

export default function ProjectWeeklyUpdateForm({
  projectId,
  isRock,
  updateContext,
  people,
  currentUserId,
  onSubmitted,
}: Props) {
  const currentUpdate = updateContext?.currentUpdate;
  const [form, setForm] = useState({
    updateStatus: "on_track" as UpdateStatus,
    currentState: "",
    timelineOnTrack: true,
    revisedTargetDate: "",
    topObstacle: "",
    proposedFix: "",
    nextWeekPriority: "",
    askNeededFromId: "",
    askNeededBy: "",
    askSummary: "",
    askProposedSolution: "",
  });
  const [askOpen, setAskOpen] = useState(false);

  useEffect(() => {
    setForm({
      updateStatus: (currentUpdate?.updateStatus ?? "on_track") as UpdateStatus,
      currentState:
        currentUpdate?.currentState ?? currentUpdate?.keyUpdates ?? "",
      timelineOnTrack: currentUpdate?.timelineOnTrack ?? true,
      revisedTargetDate: dateValue(currentUpdate?.revisedTargetDate),
      topObstacle: currentUpdate?.topObstacle ?? currentUpdate?.blockers ?? "",
      proposedFix: currentUpdate?.proposedFix ?? "",
      nextWeekPriority:
        currentUpdate?.nextWeekPriority ?? currentUpdate?.nextSteps ?? "",
      askNeededFromId: currentUpdate?.askNeededFromId
        ? String(currentUpdate.askNeededFromId)
        : "",
      askNeededBy: dateValue(currentUpdate?.askNeededBy),
      askSummary: currentUpdate?.askSummary ?? "",
      askProposedSolution: currentUpdate?.askProposedSolution ?? "",
    });
    setAskOpen(Boolean(currentUpdate?.askSummary));
  }, [currentUpdate?.id, updateContext?.weekOf]);

  const submit = trpc.pm.weeklyUpdates.submit.useMutation({
    onSuccess: result => {
      toast.success(
        result.reportStatus === "late"
          ? "Late weekly update saved"
          : "Weekly update saved"
      );
      onSubmitted();
    },
    onError: error => toast.error(error.message),
  });

  if (!updateContext?.isReportable) {
    return (
      <section className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm">
        <h3 className="font-semibold">
          Weekly updates are optional for this Project
        </h3>
        <p className="mt-1 text-muted-foreground">
          Enable them in Project Edit when this project needs a weekly owner
          update. Rocks are included automatically.
        </p>
      </section>
    );
  }

  const isReportingOwner = currentUserId === updateContext.reportingOwnerId;
  const snapshot = updateContext.snapshot;
  const targetDate = form.timelineOnTrack
    ? snapshot?.targetDate
    : form.revisedTargetDate || snapshot?.targetDate;
  const canSave =
    form.currentState.trim() &&
    form.nextWeekPriority.trim() &&
    (form.timelineOnTrack || form.revisedTargetDate) &&
    (!form.topObstacle.trim() || form.proposedFix.trim()) &&
    (!askOpen ||
      (form.askNeededFromId &&
        form.askNeededBy &&
        form.askSummary.trim() &&
        form.askProposedSolution.trim()));

  if (!isReportingOwner) {
    const reportingOwner = people.find(
      person => person.id === updateContext.reportingOwnerId
    );
    return (
      <section className="rounded-lg border bg-muted/20 p-4 text-sm">
        <h3 className="font-semibold">Weekly update</h3>
        <p className="mt-1 text-muted-foreground">
          This {isRock ? "Rock" : "Project"} is owned for reporting by{" "}
          <span className="font-medium text-foreground">
            {reportingOwner?.name ??
              reportingOwner?.email ??
              "the assigned reporting owner"}
          </span>
          .
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Weekly update</h3>
            {isRock ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                Rock
              </span>
            ) : null}
            {updateContext.isLate ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                Due / late after Thu 6 PM
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {updateContext.weekLabel} · Save once; edits stay on this week’s
            update.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          Deadline Thursday · 6:00 PM ET
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-md border bg-muted/20 px-2.5 py-2">
          <span className="flex items-center gap-1 text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5" /> To-Dos
          </span>
          <p className="mt-0.5 font-semibold">
            {snapshot?.taskCompleted ?? 0} / {snapshot?.taskTotal ?? 0} complete
          </p>
        </div>
        <div className="rounded-md border bg-muted/20 px-2.5 py-2">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Milestone className="h-3.5 w-3.5" /> Milestones
          </span>
          <p className="mt-0.5 font-semibold">
            {snapshot?.milestoneCompleted ?? 0} /{" "}
            {snapshot?.milestoneTotal ?? 0} complete
          </p>
        </div>
        <div className="rounded-md border bg-muted/20 px-2.5 py-2">
          <span className="flex items-center gap-1 text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" /> Overdue
          </span>
          <p className="mt-0.5 font-semibold">
            {snapshot?.overdueTaskCount ?? 0} To-Dos
          </p>
        </div>
        <div className="rounded-md border bg-muted/20 px-2.5 py-2">
          <span className="flex items-center gap-1 text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" /> Next milestone
          </span>
          <p
            className="mt-0.5 truncate font-semibold"
            title={snapshot?.nextMilestoneTitle ?? undefined}
          >
            {snapshot?.nextMilestoneTitle ?? "None"}
            {snapshot?.nextMilestoneDueDate
              ? ` · ${format(new Date(snapshot.nextMilestoneDueDate), "MMM d")}`
              : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <div>
          <Label className="text-xs">Health *</Label>
          <Select
            value={form.updateStatus}
            onValueChange={value =>
              setForm(current => ({
                ...current,
                updateStatus: value as UpdateStatus,
              }))
            }
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {healthOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Current state *</Label>
          <Textarea
            className="mt-1"
            rows={2}
            value={form.currentState}
            onChange={event =>
              setForm(current => ({
                ...current,
                currentState: event.target.value,
              }))
            }
            placeholder="What moved forward or changed this week?"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">On track for target date? *</Label>
          <Select
            value={form.timelineOnTrack ? "yes" : "no"}
            onValueChange={value =>
              setForm(current => ({
                ...current,
                timelineOnTrack: value === "yes",
                revisedTargetDate:
                  value === "yes" ? "" : current.revisedTargetDate,
              }))
            }
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">
                Yes · {dateLabel(snapshot?.targetDate)}
              </SelectItem>
              <SelectItem value="no">No · set a revised date</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {!form.timelineOnTrack ? (
          <div>
            <Label className="text-xs">Revised target date *</Label>
            <Input
              className="mt-1"
              type="date"
              value={form.revisedTargetDate}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  revisedTargetDate: event.target.value,
                }))
              }
            />
          </div>
        ) : (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Target date:</span>{" "}
            {dateLabel(targetDate)}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">
            Top obstacle{" "}
            <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            className="mt-1"
            rows={2}
            value={form.topObstacle}
            onChange={event =>
              setForm(current => ({
                ...current,
                topObstacle: event.target.value,
              }))
            }
            placeholder="Only if something needs attention"
          />
        </div>
        <div>
          <Label className="text-xs">
            Proposed fix {form.topObstacle.trim() ? "*" : "(optional)"}
          </Label>
          <Textarea
            className="mt-1"
            rows={2}
            value={form.proposedFix}
            onChange={event =>
              setForm(current => ({
                ...current,
                proposedFix: event.target.value,
              }))
            }
            placeholder="What do you recommend doing?"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs">Next week’s priority *</Label>
        <Input
          className="mt-1"
          value={form.nextWeekPriority}
          onChange={event =>
            setForm(current => ({
              ...current,
              nextWeekPriority: event.target.value,
            }))
          }
          placeholder="The one most important outcome for next week"
        />
      </div>

      {!askOpen ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-1 text-xs"
          onClick={() => setAskOpen(true)}
        >
          <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
          Add a decision / help ask
        </Button>
      ) : (
        <div className="rounded-md border border-primary/20 bg-primary/[0.025] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold">
                Ask for decision or help
              </h4>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Keep it specific and include the solution you recommend.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setAskOpen(false);
                setForm(current => ({
                  ...current,
                  askNeededFromId: "",
                  askNeededBy: "",
                  askSummary: "",
                  askProposedSolution: "",
                }));
              }}
            >
              Remove
            </Button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Needed from *</Label>
              <Select
                value={form.askNeededFromId}
                onValueChange={value =>
                  setForm(current => ({ ...current, askNeededFromId: value }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose a person" />
                </SelectTrigger>
                <SelectContent>
                  {people.map(person => (
                    <SelectItem key={person.id} value={String(person.id)}>
                      {person.name ?? person.email ?? `User #${person.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Needed by *</Label>
              <Input
                className="mt-1"
                type="date"
                value={form.askNeededBy}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    askNeededBy: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">Decision / help needed *</Label>
              <Textarea
                className="mt-1"
                rows={2}
                value={form.askSummary}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    askSummary: event.target.value,
                  }))
                }
                placeholder="What decision or help is needed?"
              />
            </div>
            <div>
              <Label className="text-xs">Proposed solution *</Label>
              <Textarea
                className="mt-1"
                rows={2}
                value={form.askProposedSolution}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    askProposedSolution: event.target.value,
                  }))
                }
                placeholder="What do you recommend?"
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          Completion and milestone counts are captured automatically when saved.
        </p>
        <Button
          size="sm"
          onClick={() =>
            submit.mutate({
              projectId,
              updateStatus: form.updateStatus,
              currentState: form.currentState.trim(),
              timelineOnTrack: form.timelineOnTrack,
              revisedTargetDate:
                form.timelineOnTrack || !form.revisedTargetDate
                  ? null
                  : new Date(form.revisedTargetDate),
              topObstacle: form.topObstacle.trim() || undefined,
              proposedFix: form.proposedFix.trim() || undefined,
              nextWeekPriority: form.nextWeekPriority.trim(),
              askNeededFromId:
                askOpen && form.askNeededFromId
                  ? Number(form.askNeededFromId)
                  : null,
              askNeededBy:
                askOpen && form.askNeededBy ? new Date(form.askNeededBy) : null,
              askSummary: askOpen
                ? form.askSummary.trim() || undefined
                : undefined,
              askProposedSolution: askOpen
                ? form.askProposedSolution.trim() || undefined
                : undefined,
            })
          }
          disabled={!canSave || submit.isPending}
        >
          {submit.isPending ? (
            "Saving…"
          ) : (
            <>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {currentUpdate ? "Save update" : "Submit update"}
            </>
          )}
        </Button>
      </div>
    </section>
  );
}
