import { useEffect, useMemo, useState } from "react";
import { ChartNoAxesCombined, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { PulseScorecard } from "@/components/pulse/PulseScorecard";

const CADENCES = ["weekly", "monthly", "quarterly", "annually"] as const;
type Cadence = (typeof CADENCES)[number];

function cadenceLabel(cadence: Cadence) {
  return cadence === "annually"
    ? "Annual"
    : `${cadence.slice(0, 1).toUpperCase()}${cadence.slice(1)}`;
}

function shiftedPeriodStart(
  periodStart: string,
  cadence: Cadence,
  direction: -1 | 1
) {
  const next = new Date(`${periodStart}T12:00:00.000Z`);
  if (cadence === "weekly") next.setUTCDate(next.getUTCDate() + direction * 7);
  if (cadence === "monthly") next.setUTCMonth(next.getUTCMonth() + direction);
  if (cadence === "quarterly")
    next.setUTCMonth(next.getUTCMonth() + direction * 3);
  if (cadence === "annually")
    next.setUTCFullYear(next.getUTCFullYear() + direction);
  return next.toISOString().slice(0, 10);
}

export function PulseMasterScorecard() {
  const utils = trpc.useUtils();
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [periodStart, setPeriodStart] = useState<string | undefined>();
  const [meetingId, setMeetingId] = useState("all");
  const scorecard = trpc.pulse.scorecard.master.useQuery({
    cadence,
    periodStart,
  });

  useEffect(() => {
    if (!scorecard.data) return;
    if (
      meetingId !== "all" &&
      !scorecard.data.meetings.some((meeting: any) => meeting.id === meetingId)
    )
      setMeetingId("all");
  }, [meetingId, scorecard.data]);

  const items = useMemo(() => {
    if (!scorecard.data) return [];
    return meetingId === "all"
      ? scorecard.data.items
      : scorecard.data.items.filter(
          (item: any) => item.meetingId === meetingId
        );
  }, [meetingId, scorecard.data]);

  const selectCadence = (next: string) => {
    setCadence(next as Cadence);
    setPeriodStart(undefined);
  };
  const movePeriod = (direction: -1 | 1) => {
    if (
      !scorecard.data ||
      (direction > 0 && scorecard.data.selectedPeriod.isCurrent)
    )
      return;
    setPeriodStart(
      shiftedPeriodStart(
        scorecard.data.selectedPeriod.periodStart,
        cadence,
        direction
      )
    );
  };

  if (scorecard.isLoading)
    return (
      <Card>
        <CardContent className="p-5">
          <Skeleton className="h-72 w-full" />
        </CardContent>
      </Card>
    );
  if (scorecard.error || !scorecard.data)
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          The master scorecard is not available right now.
        </CardContent>
      </Card>
    );

  const { selectedPeriod } = scorecard.data;
  return (
    <section aria-label="Master scorecard" className="space-y-3">
      <Card className="border-primary/20 bg-primary/[0.018]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <ChartNoAxesCombined className="h-5 w-5 text-primary" />
            Master scorecard
          </CardTitle>
          <CardDescription>
            All active SavvyOS metrics from the L10s you are authorized to
            access. Select a cadence, then move backward through completed
            reporting periods.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={cadence} onValueChange={selectCadence}>
            <div className="max-w-full overflow-x-auto pb-1">
              <TabsList className="h-auto min-w-max justify-start">
                {CADENCES.map(value => (
                  <TabsTrigger key={value} value={value} className="min-h-9">
                    {cadenceLabel(value)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/70 px-2 py-2 sm:px-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-10"
              onClick={() => movePeriod(-1)}
              aria-label={`View previous ${cadence} reporting period`}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <p className="min-w-36 text-center text-sm font-medium tabular-nums">
              {selectedPeriod.label}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-10"
              onClick={() => movePeriod(1)}
              disabled={selectedPeriod.isCurrent}
              aria-label={`View next ${cadence} reporting period`}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
          <Tabs value={meetingId} onValueChange={setMeetingId}>
            <div className="max-w-full overflow-x-auto pb-1">
              <TabsList className="h-auto min-w-max justify-start">
                <TabsTrigger value="all" className="min-h-9">
                  All meetings{" "}
                  <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                    {scorecard.data.items.length}
                  </span>
                </TabsTrigger>
                {scorecard.data.meetings.map((meeting: any) => (
                  <TabsTrigger
                    key={meeting.id}
                    value={meeting.id}
                    className="min-h-9"
                  >
                    {meeting.name}{" "}
                    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                      {meeting.metricCount}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {items.length ? (
        <PulseScorecard
          section={{ items, meta: { tabs: [cadence] } }}
          meetingId={meetingId}
          showMeeting={meetingId === "all"}
          showObservations={false}
          hideCadenceTabs
          editableCurrent={selectedPeriod.isCurrent}
          emptyMessage="No active SavvyOS metrics match this meeting filter."
          onChanged={() => {
            void scorecard.refetch();
            void utils.pulse.personal.inputs.invalidate();
          }}
        />
      ) : (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            No active {cadence} measurables are currently selected for the L10s
            you can access in {selectedPeriod.label}.
          </CardContent>
        </Card>
      )}
    </section>
  );
}
