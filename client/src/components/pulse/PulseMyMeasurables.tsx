import { useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Send, Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

function weekLabel(start?: string, end?: string) {
  if (!start || !end) return "this reporting week";
  const first = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  const firstLabel = first.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const lastLabel = last.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${firstLabel} – ${lastLabel}`;
}

function valueLabel(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : "—";
}

type Draft = { value: string; note: string };

/** A person-level weekly reporting surface; metric records remain authoritative in SavvyOS. */
export function PulseMyMeasurables() {
  const utils = trpc.useUtils();
  const measurableQuery = trpc.pulse.personal.myMeasurables.useQuery();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const refresh = trpc.pulse.personal.refreshMyMeasurable.useMutation({
    onSuccess: () => {
      toast.success("Measurable refreshed.");
      void utils.pulse.personal.myMeasurables.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const submit = trpc.pulse.personal.submitMyMeasurables.useMutation({
    onSuccess: () => {
      toast.success(
        "My Measurables submitted. A confirmation email is on its way."
      );
      setReviewOpen(false);
      setDrafts({});
      void utils.pulse.personal.myMeasurables.invalidate();
      void utils.pulse.personal.dashboard.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const data = measurableQuery.data;
  const measurables = data?.measurables ?? [];
  const draftFor = (measurable: any): Draft =>
    drafts[measurable.metricId] ?? {
      value: measurable.value == null ? "" : String(measurable.value),
      note: measurable.note ?? "",
    };
  const setDraft = (
    metricId: number,
    change: Partial<Draft>,
    measurable: any
  ) => {
    setDrafts(current => ({
      ...current,
      [metricId]: { ...draftFor(measurable), ...current[metricId], ...change },
    }));
  };
  const summary = useMemo(
    () =>
      measurables.map((measurable: any) => {
        const draft = draftFor(measurable);
        const value =
          measurable.entryType === "manual" ? draft.value : measurable.value;
        return {
          ...measurable,
          summaryValue: value,
          summaryNote:
            measurable.entryType === "manual"
              ? draft.note.trim()
              : measurable.note,
        };
      }),
    [measurables, drafts]
  );
  const incomplete = summary.filter(
    (measurable: any) => !Number.isFinite(Number(measurable.summaryValue))
  );
  const openReview = () => {
    if (incomplete.length) {
      toast.error(
        `Enter or refresh every measurable before submitting: ${incomplete.map((measurable: any) => measurable.name).join(", ")}.`
      );
      return;
    }
    setReviewOpen(true);
  };
  const confirm = () =>
    submit.mutate({
      manualValues: summary
        .filter((measurable: any) => measurable.entryType === "manual")
        .map((measurable: any) => ({
          metricId: measurable.metricId,
          actualValue: Number(measurable.summaryValue),
          note: measurable.summaryNote || null,
        })),
    });

  if (measurableQuery.isLoading)
    return (
      <section id="my-measurables" className="pulse-section scroll-mt-6">
        <Card>
          <CardContent className="p-5">
            <Skeleton className="h-52 w-full" />
          </CardContent>
        </Card>
      </section>
    );
  if (measurableQuery.error || !data)
    return (
      <section id="my-measurables" className="pulse-section scroll-mt-6">
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            My Measurables is not available right now.
          </CardContent>
        </Card>
      </section>
    );

  return (
    <section id="my-measurables" className="pulse-section scroll-mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">
            Reporting week ·{" "}
            {weekLabel(data.reportingWeek?.start, data.reportingWeek?.end)}
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            My Measurables
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Submit every active measurable you own for this Sunday–Saturday
            reporting week.
          </p>
        </div>
        {measurables.length ? (
          <Button
            type="button"
            onClick={openReview}
            disabled={submit.isPending}
          >
            <Send className="mr-2 h-4 w-4" />
            Review submission
          </Button>
        ) : null}
      </div>

      <Card className="pulse-card-compact mt-3">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" />
            Owned measurables
          </CardTitle>
          <CardDescription>
            {measurables.length
              ? `${measurables.length} active measurable${measurables.length === 1 ? "" : "s"} assigned to you.`
              : "Active measurables assigned to you will appear here."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!measurables.length ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
              You do not own any active measurables for this reporting week.
            </p>
          ) : (
            measurables.map((measurable: any) => {
              const draft = draftFor(measurable);
              const automatic = measurable.entryType === "automatic";
              return (
                <article
                  key={measurable.metricId}
                  className="rounded-md border border-border/70 bg-background/60 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-medium">{measurable.name}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${automatic ? "bg-sky-100 text-sky-800" : "bg-muted text-muted-foreground"}`}
                        >
                          {automatic ? "Automatically pulled" : "Manual"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {measurable.responsibilityName}
                        {measurable.target == null
                          ? ""
                          : ` · Target ${valueLabel(measurable.target)}`}
                      </p>
                    </div>
                    {automatic ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={refresh.isPending}
                        onClick={() =>
                          refresh.mutate({ metricId: measurable.metricId })
                        }
                      >
                        <RefreshCw
                          className={`mr-1.5 h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`}
                        />
                        Refresh
                      </Button>
                    ) : null}
                  </div>
                  {automatic ? (
                    <div className="mt-3 rounded-md bg-muted/50 px-3 py-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="text-lg font-semibold">
                          {valueLabel(measurable.value)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {measurable.pulledSource
                            ? `Source: ${measurable.pulledSource}`
                            : "SavvyOS calculation"}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {measurable.lastRefreshedAt
                          ? `Last refreshed ${new Date(measurable.lastRefreshedAt).toLocaleString()}`
                          : measurable.value == null
                            ? "No value has been pulled for this reporting week. Select Refresh to pull it now."
                            : "Pulled for this reporting week."}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-2 md:grid-cols-[minmax(12rem,0.35fr)_minmax(0,0.65fr)]">
                      <div className="space-y-1">
                        <Label
                          htmlFor={`measurable-value-${measurable.metricId}`}
                          className="text-xs"
                        >
                          Value
                        </Label>
                        <Input
                          id={`measurable-value-${measurable.metricId}`}
                          type="number"
                          inputMode="decimal"
                          value={draft.value}
                          onChange={event =>
                            setDraft(
                              measurable.metricId,
                              { value: event.target.value },
                              measurable
                            )
                          }
                          placeholder="Enter value"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label
                          htmlFor={`measurable-note-${measurable.metricId}`}
                          className="text-xs"
                        >
                          Note{" "}
                          <span className="font-normal text-muted-foreground">
                            (optional)
                          </span>
                        </Label>
                        <Textarea
                          id={`measurable-note-${measurable.metricId}`}
                          className="min-h-10 resize-y"
                          value={draft.note}
                          onChange={event =>
                            setDraft(
                              measurable.metricId,
                              { note: event.target.value },
                              measurable
                            )
                          }
                          placeholder="Add context for this result…"
                        />
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </CardContent>
      </Card>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirm My Measurables</DialogTitle>
            <DialogDescription>
              Review every value that will be saved to measurable history for{" "}
              {weekLabel(data.reportingWeek?.start, data.reportingWeek?.end)}. A
              confirmation email will be sent after submission.
            </DialogDescription>
          </DialogHeader>
          <div className="divide-y rounded-md border">
            {summary.map((measurable: any) => (
              <div
                key={measurable.metricId}
                className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="font-medium">{measurable.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {measurable.entryType === "automatic"
                      ? `${measurable.pulledSource ?? "SavvyOS"} · Automatically pulled`
                      : "Manual entry"}
                    {measurable.summaryNote
                      ? ` · ${measurable.summaryNote}`
                      : ""}
                  </p>
                </div>
                <p className="shrink-0 text-base font-semibold">
                  {valueLabel(measurable.summaryValue)}
                </p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReviewOpen(false)}
            >
              Back
            </Button>
            <Button type="button" disabled={submit.isPending} onClick={confirm}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {submit.isPending ? "Submitting…" : "Submit measurables"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
