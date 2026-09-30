import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Minus,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { PulseMetricObservations } from "@/components/pulse/PulseMetricObservations";
import { RecordMarker } from "@/components/roles-responsibilities/RecordMarker";

function formatValue(value: number | null | undefined, displayFormat: string) {
  if (value == null) return "—";
  if (displayFormat === "percentage") return `${value}%`;
  if (displayFormat === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (displayFormat === "duration") return `${value} min`;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    value
  );
}

function formatWeeklyValue(
  value: number | null | undefined,
  displayFormat: string
) {
  return value == null ? "" : formatValue(value, displayFormat);
}

function MetricValue({
  metric,
  meetingId,
  onSaved,
  editableCurrent = true,
  blankWhenMissing = false,
}: {
  metric: any;
  meetingId?: string;
  onSaved: () => void;
  editableCurrent?: boolean;
  blankWhenMissing?: boolean;
}) {
  const [value, setValue] = useState(
    metric.current.value == null ? "" : String(metric.current.value)
  );
  const [message, setMessage] = useState("");
  const targetMeetingId = metric.meetingId ?? meetingId;
  const save = trpc.pulse.scorecard.saveCurrentValue.useMutation({
    onSuccess: () => {
      setMessage("");
      onSaved();
    },
    onError: error => {
      setValue(metric.current.value == null ? "" : String(metric.current.value));
      setMessage(
        error.message ||
          "SavvyOS could not save that number. Your prior value is still showing."
      );
    },
  });

  useEffect(() => {
    setValue(metric.current.value == null ? "" : String(metric.current.value));
  }, [metric.current.value]);

  if (!metric.canEdit || !editableCurrent) {
    return (
      <span className="inline-flex items-center justify-end gap-1 text-lg font-semibold tabular-nums sm:text-sm">
        {blankWhenMissing
          ? formatWeeklyValue(metric.current.value, metric.displayFormat)
          : formatValue(metric.current.value, metric.displayFormat)}
        <RecordMarker performance={metric.periodToDatePerformance} />
      </span>
    );
  }

  return (
    <div className="text-right">
      <Input
        aria-label={`This week ${metric.name}`}
        className="min-h-11 w-24 text-right text-base font-semibold tabular-nums"
        type="number"
        inputMode="decimal"
        value={value}
        onChange={event => setValue(event.target.value)}
        onBlur={() => {
          if (!targetMeetingId || value.trim() === "") return;
          const next = Number(value);
          if (!Number.isFinite(next)) return;
          save.mutate({
            meetingId: targetMeetingId,
            metricId: metric.metricId,
            actualValue: next,
          });
        }}
        disabled={save.isPending}
      />
      {message ? (
        <p role="alert" className="mt-1 max-w-44 text-xs leading-4 text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function Trend({ metric }: { metric: any }) {
  if (!metric.trend) return null;
  const isUp = /up|rising/i.test(metric.trend);
  const isDown = /down|declining/i.test(metric.trend);
  const Icon = isUp ? ArrowUp : isDown ? ArrowDown : Minus;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {metric.trend}
    </span>
  );
}

function WeeklyHistory({ metric }: { metric: any }) {
  const periods = [...(metric.periods ?? [])].slice(0, 8).reverse();
  return (
    <div
      className="grid min-w-[30rem] grid-cols-8 gap-1"
      aria-label={`Eight-week history for ${metric.name}`}
    >
      {periods.map((period: any) => (
        <div
          key={period.periodStart}
          className="min-w-0 rounded border border-border/70 bg-muted/25 px-1.5 py-1.5 text-center"
          title={`${period.label}: ${formatValue(
            period.value,
            metric.displayFormat
          )}`}
        >
          <p className="truncate text-[10px] text-muted-foreground">
            {period.label}
          </p>
          <p className="mt-0.5 inline-flex max-w-full items-center justify-center gap-0.5 truncate text-xs font-semibold tabular-nums">
            {formatWeeklyValue(period.value, metric.displayFormat)}
            <RecordMarker performance={period.periodToDatePerformance} />
          </p>
        </div>
      ))}
    </div>
  );
}

function YtdAgainstTarget({ metric }: { metric: any }) {
  const ytd = metric.ytd;
  if (!ytd) return <span className="text-muted-foreground">—</span>;
  const statusClass =
    ytd.onTarget === false
      ? "text-amber-700"
      : ytd.onTarget === true
        ? "text-emerald-700"
        : "";
  return (
    <span className={`inline-flex flex-col text-right tabular-nums ${statusClass}`}>
      <span className="font-semibold">
        {formatValue(ytd.actual, metric.displayFormat)}
      </span>
      <span className="text-xs text-muted-foreground">
        target {formatValue(ytd.target, metric.displayFormat)}
      </span>
    </span>
  );
}

function MetricDetail({ metric }: { metric: any }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-left font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {metric.name}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{metric.name}</DialogTitle>
          <DialogDescription>{metric.detail.responsibility}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            {metric.detail.definition ||
              "No plain-language definition has been added in SavvyOS yet."}
          </p>
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3">
            <div>
              <dt className="text-muted-foreground">Owner</dt>
              <dd className="font-medium">{metric.detail.ownerName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Target</dt>
              <dd className="font-medium">
                {formatValue(metric.target, metric.displayFormat)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cadence</dt>
              <dd className="font-medium capitalize">{metric.cadence}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">This period</dt>
              <dd className="font-medium">
                {formatValue(metric.current.value, metric.displayFormat)}
              </dd>
            </div>
            {metric.ytd ? (
              <div>
                <dt className="text-muted-foreground">YTD / target</dt>
                <dd className="font-medium">
                  {formatValue(metric.ytd.actual, metric.displayFormat)} / {" "}
                  {formatValue(metric.ytd.target, metric.displayFormat)}
                </dd>
              </div>
            ) : null}
          </dl>
          <div>
            <p className="font-medium">
              {metric.cadence === "weekly" ? "Eight-week history" : "Recent history"}
            </p>
            <div className="mt-2 space-y-1">
              {metric.periods.map((period: any) => (
                <p key={period.periodStart} className="flex justify-between gap-3">
                  <span>{period.label}</span>
                  <span className="inline-flex items-center gap-1 font-medium tabular-nums">
                    {formatValue(period.value, metric.displayFormat)}
                    <RecordMarker performance={period.periodToDatePerformance} />
                  </span>
                </p>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScorecardConfiguration({
  meetingId,
  onChanged,
}: {
  meetingId: string;
  onChanged: () => void;
}) {
  const utils = trpc.useUtils();
  const configuration = trpc.pulse.scorecard.configuration.useQuery({ meetingId });
  const add = trpc.pulse.scorecard.addMetric.useMutation({
    onSuccess: () => {
      void utils.pulse.scorecard.configuration.invalidate({ meetingId });
      onChanged();
    },
  });
  const remove = trpc.pulse.scorecard.removeMetric.useMutation({
    onSuccess: () => {
      void utils.pulse.scorecard.configuration.invalidate({ meetingId });
      onChanged();
    },
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="min-h-11">
          <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Scorecard settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Scorecard settings</DialogTitle>
          <DialogDescription>
            Pulse only chooses where a SavvyOS measurable appears. Names, owners,
            targets, cadence, and values stay in SavvyOS.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div>
            <p className="font-medium">Shown in this meeting</p>
            <div className="mt-2 space-y-2">
              {(configuration.data?.mapped ?? []).map((metric: any) => (
                <div
                  key={metric.mappingId}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2"
                >
                  <span>
                    {metric.name}
                    {metric.status !== "active" ? (
                      <span className="ml-2 text-sm text-muted-foreground">
                        ({metric.status === "deleted" ? "deleted in SavvyOS" : "inactive in SavvyOS"})
                      </span>
                    ) : null}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11"
                    onClick={() => remove.mutate({ meetingId, mappingId: metric.mappingId })}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {!(configuration.data?.mapped ?? []).length ? (
                <p className="text-sm text-muted-foreground">
                  No SavvyOS measurables are selected for this meeting.
                </p>
              ) : null}
            </div>
          </div>
          <div>
            <p className="font-medium">Add an active SavvyOS measurable</p>
            <div className="mt-2 space-y-2">
              {(configuration.data?.available ?? [])
                .filter(
                  (metric: any) =>
                    !(configuration.data?.mapped ?? []).some(
                      (mapped: any) => mapped.metricId === metric.id
                    )
                )
                .map((metric: any) => (
                  <div
                    key={metric.id}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{metric.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {metric.ownerName} · {metric.frequency}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      onClick={() => add.mutate({ meetingId, metricId: metric.id })}
                    >
                      Add
                    </Button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PulseScorecard({
  section,
  meetingId,
  canConfigure = false,
  showMeeting = false,
  showObservations = true,
  hideCadenceTabs = false,
  editableCurrent = true,
  emptyMessage = "No active SavvyOS measurables are selected for this meeting.",
  onChanged,
}: {
  section: any;
  meetingId: string;
  canConfigure?: boolean;
  showMeeting?: boolean;
  showObservations?: boolean;
  hideCadenceTabs?: boolean;
  editableCurrent?: boolean;
  emptyMessage?: string;
  onChanged: () => void;
}) {
  const items = section.items ?? [];
  const tabs = section.meta?.tabs ?? [];
  const [cadence, setCadence] = useState<string>(tabs[0] ?? "weekly");

  useEffect(() => {
    if (!tabs.includes(cadence)) setCadence(tabs[0] ?? "weekly");
  }, [cadence, tabs]);

  const visible = useMemo(
    () => items.filter((metric: any) => metric.cadence === cadence),
    [items, cadence]
  );
  const weekly = cadence === "weekly";

  return (
    <div className="space-y-3">
      {!hideCadenceTabs || canConfigure ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!hideCadenceTabs ? (
            <Tabs value={cadence} onValueChange={setCadence}>
              <TabsList className="h-auto flex-wrap justify-start">
                {tabs.map((tab: string) => (
                  <TabsTrigger key={tab} value={tab} className="min-h-10 capitalize">
                    {tab === "annually" ? "Annual" : tab}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : null}
          {canConfigure ? (
            <ScorecardConfiguration meetingId={meetingId} onChanged={onChanged} />
          ) : null}
        </div>
      ) : null}

      {canConfigure
        ? (section.meta?.configurationNotes ?? []).map((note: any) => (
            <p
              key={note.mappingId}
              className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {note.note}
            </p>
          ))
        : null}

      {!items.length ? (
        <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : null}
      {items.length > 0 && !visible.length ? (
        <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
          No measurables use this cadence.
        </p>
      ) : null}

      {visible.length ? (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 font-medium">Measurable</th>
                  {showMeeting ? <th className="px-3 py-3 font-medium">Meeting</th> : null}
                  <th className="px-3 py-3 font-medium">Owner</th>
                  {weekly ? (
                    <>
                      <th className="px-3 py-3 text-right font-medium">Previous week</th>
                      <th className="px-3 py-3 text-right font-medium">This week</th>
                      <th className="px-3 py-3 text-right font-medium">YTD vs. Target</th>
                      <th className="px-3 py-3 font-medium">8-week history</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-3 font-medium">Target</th>
                      {visible[0]?.periods.map((period: any) => (
                        <th key={period.periodStart} className="px-3 py-3 text-right font-medium">
                          {period.label}
                        </th>
                      ))}
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((metric: any) => (
                  <tr
                    key={`${metric.meetingId ?? meetingId}-${metric.metricId}`}
                    className="border-t border-border"
                  >
                    <td className="px-3 py-3">
                      <MetricDetail metric={metric} />
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Trend metric={metric} />
                        {metric.onTarget === false ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                            Off target
                          </span>
                        ) : null}
                      </div>
                    </td>
                    {showMeeting ? (
                      <td className="px-3 py-3 text-muted-foreground">{metric.meetingName}</td>
                    ) : null}
                    <td className="px-3 py-3">{metric.owner.name}</td>
                    {weekly ? (
                      <>
                        <td className="px-3 py-3 text-right">
                          <span className="inline-flex items-center justify-end gap-1 font-semibold tabular-nums">
                            {formatWeeklyValue(metric.previous?.value, metric.displayFormat)}
                            <RecordMarker performance={metric.previous?.periodToDatePerformance} />
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <MetricValue
                            metric={metric}
                            meetingId={meetingId}
                            onSaved={onChanged}
                            editableCurrent={editableCurrent}
                            blankWhenMissing
                          />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <YtdAgainstTarget metric={metric} />
                        </td>
                        <td className="px-3 py-3">
                          <WeeklyHistory metric={metric} />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-3">
                          {formatValue(metric.target, metric.displayFormat)}
                        </td>
                        {metric.periods.map((period: any, index: number) => (
                          <td key={period.periodStart} className="px-3 py-3 text-right">
                            {index === 0 ? (
                              <MetricValue
                                metric={metric}
                                meetingId={meetingId}
                                onSaved={onChanged}
                                editableCurrent={editableCurrent}
                              />
                            ) : (
                              <span className="inline-flex items-center justify-end gap-1 tabular-nums">
                                {formatValue(period.value, metric.displayFormat)}
                                <RecordMarker performance={period.periodToDatePerformance} />
                              </span>
                            )}
                          </td>
                        ))}
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 sm:hidden">
            {visible.map((metric: any) => (
              <article
                key={`${metric.meetingId ?? meetingId}-${metric.metricId}`}
                className="rounded-lg border border-border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <MetricDetail metric={metric} />
                    <p className="mt-1 text-sm text-muted-foreground">
                      {showMeeting && metric.meetingName ? `${metric.meetingName} · ` : ""}
                      {metric.owner.name}
                      {!weekly ? ` · target ${formatValue(metric.target, metric.displayFormat)}` : ""}
                    </p>
                  </div>
                  {metric.onTarget === false ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium">
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      Off target
                    </span>
                  ) : metric.onTarget === true ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" aria-label="On target" />
                  ) : null}
                </div>

                {weekly ? (
                  <>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                      <p className="rounded bg-muted/50 p-2">
                        <span className="block text-xs text-muted-foreground">Previous week</span>
                        <span className="inline-flex items-center gap-1 font-medium tabular-nums">
                          {formatWeeklyValue(metric.previous?.value, metric.displayFormat)}
                          <RecordMarker performance={metric.previous?.periodToDatePerformance} />
                        </span>
                      </p>
                      <div className="rounded bg-muted/50 p-2">
                        <p className="text-xs text-muted-foreground">This week</p>
                        <MetricValue
                          metric={metric}
                          meetingId={meetingId}
                          onSaved={onChanged}
                          editableCurrent={editableCurrent}
                          blankWhenMissing
                        />
                      </div>
                      <p className="rounded bg-muted/50 p-2">
                        <span className="block text-xs text-muted-foreground">YTD vs. Target</span>
                        <YtdAgainstTarget metric={metric} />
                      </p>
                    </div>
                    <div className="mt-4 overflow-x-auto pb-1">
                      <WeeklyHistory metric={metric} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">{metric.current.label}</p>
                        <MetricValue
                          metric={metric}
                          meetingId={meetingId}
                          onSaved={onChanged}
                          editableCurrent={editableCurrent}
                        />
                      </div>
                      <Trend metric={metric} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      {metric.periods.slice(1).map((period: any) => (
                        <p key={period.periodStart} className="rounded bg-muted/50 p-2">
                          <span className="block text-xs text-muted-foreground">{period.label}</span>
                          <span className="inline-flex items-center gap-1 font-medium tabular-nums">
                            {formatValue(period.value, metric.displayFormat)}
                            <RecordMarker performance={period.periodToDatePerformance} />
                          </span>
                        </p>
                      ))}
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        </>
      ) : null}

      {showObservations ? (
        <PulseMetricObservations meetingId={meetingId} onChanged={onChanged} />
      ) : null}
    </div>
  );
}
