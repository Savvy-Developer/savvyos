import { useEffect, useMemo, useState } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { PulseScorecard } from "@/components/pulse/PulseScorecard";

const CADENCES = ["weekly", "monthly", "quarterly", "annually"];

export function PulseMasterScorecard() {
  const utils = trpc.useUtils();
  const scorecard = trpc.pulse.scorecard.master.useQuery();
  const [meetingId, setMeetingId] = useState("all");

  useEffect(() => {
    if (!scorecard.data) return;
    if (meetingId !== "all" && !scorecard.data.meetings.some((meeting: any) => meeting.id === meetingId)) {
      setMeetingId("all");
    }
  }, [meetingId, scorecard.data]);

  const items = useMemo(() => {
    if (!scorecard.data) return [];
    return meetingId === "all"
      ? scorecard.data.items
      : scorecard.data.items.filter((item: any) => item.meetingId === meetingId);
  }, [meetingId, scorecard.data]);
  const cadenceTabs = useMemo(() => CADENCES.filter((cadence) => items.some((item: any) => item.cadence === cadence)), [items]);

  if (scorecard.isLoading) return <Card><CardContent className="p-5"><Skeleton className="h-72 w-full" /></CardContent></Card>;
  if (scorecard.error || !scorecard.data) return <Card><CardContent className="p-5 text-sm text-muted-foreground">The master scorecard is not available right now.</CardContent></Card>;

  return <section aria-label="Master scorecard" className="space-y-3">
    <Card className="border-primary/20 bg-primary/[0.018]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2"><ChartNoAxesCombined className="h-5 w-5 text-primary" />Master scorecard</CardTitle>
        <CardDescription>All active SavvyOS metrics from the L10s you are authorized to access. A metric appears once per meeting where it is reviewed.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={meetingId} onValueChange={setMeetingId}>
          <div className="max-w-full overflow-x-auto pb-1">
            <TabsList className="h-auto min-w-max justify-start">
              <TabsTrigger value="all" className="min-h-9">All meetings <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{scorecard.data.items.length}</span></TabsTrigger>
              {scorecard.data.meetings.map((meeting: any) => <TabsTrigger key={meeting.id} value={meeting.id} className="min-h-9">{meeting.name} <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{meeting.metricCount}</span></TabsTrigger>)}
            </TabsList>
          </div>
        </Tabs>
      </CardContent>
    </Card>

    {items.length ? <PulseScorecard
      section={{ items, meta: { tabs: cadenceTabs } }}
      meetingId={meetingId}
      showMeeting={meetingId === "all"}
      showObservations={false}
      emptyMessage="No active SavvyOS metrics match this meeting filter."
      onChanged={() => { void scorecard.refetch(); void utils.pulse.personal.inputs.invalidate(); }}
    /> : <Card><CardContent className="p-5 text-sm text-muted-foreground">No active SavvyOS metrics are currently selected for the L10s you can access.</CardContent></Card>}
  </section>;
}
