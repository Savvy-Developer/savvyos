import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, ArrowLeft, CalendarClock, Clock3, EyeOff, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";

const SECTION_LABELS: Record<string, string> = {
  overview: "Overview",
  segue: "Segue",
  headlines: "Headlines",
  scorecard: "Scorecard",
  rocks: "Rocks",
  todos: "To-Dos",
  issues: "Issues",
  archive: "History",
};

export default function PulseMeetingPage({ meetingId }: { meetingId: number }) {
  const [, navigate] = useLocation();
  const { data: meeting, isLoading, error } = trpc.pulse.getMeeting.useQuery(
    { meetingId },
    { enabled: Number.isInteger(meetingId) && meetingId > 0 },
  );

  if (isLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  if (error || !meeting) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-center justify-center text-center">
        <LockKeyhole className="h-10 w-10 text-muted-foreground/60" />
        <h1 className="mt-4 text-xl font-semibold">Meeting unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error?.message || "You do not have an active access relationship for this meeting."}</p>
        <Button variant="outline" className="mt-5" onClick={() => navigate("/")}><ArrowLeft className="mr-2 h-4 w-4" />Return to SavvyOS</Button>
      </div>
    );
  }

  const visibleSections = Object.entries(meeting.sectionVisibility as Record<string, boolean>).filter(([, visible]) => visible);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => navigate("/")}><ArrowLeft className="mr-1.5 h-4 w-4" />SavvyOS</Button>
      <section className="rounded-2xl border bg-gradient-to-br from-primary/[0.08] via-background to-background p-6 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><Activity className="h-3.5 w-3.5" />Operate · Pulse</div><h1 className="mt-2 text-3xl font-semibold tracking-tight">{meeting.name}</h1><p className="mt-2 font-mono text-xs text-muted-foreground">{meeting.meetingKey}</p></div>
          <Badge className="w-fit">{meeting.accessLevel === "facilitator" ? "Facilitator access" : "Member access"}</Badge>
        </div>
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground"><span className="inline-flex items-center gap-2"><CalendarClock className="h-4 w-4" />{meeting.scheduleDay.slice(0, 1).toUpperCase() + meeting.scheduleDay.slice(1)} · {meeting.scheduleTime} {meeting.timezone}</span><span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" />{meeting.durationMinutes} minutes expected</span></div>
      </section>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Registry access confirmed</CardTitle><CardDescription>This meeting was returned from an active person-to-meeting relationship. Its availability was checked before the grant, so archived meetings cannot be opened even by privileged users.</CardDescription></CardHeader>
        <CardContent><div className="flex flex-wrap gap-2">{visibleSections.map(([key]) => <Badge key={key} variant="secondary">{SECTION_LABELS[key] ?? key}</Badge>)}</div></CardContent>
      </Card>

      <Card className="border-dashed"><CardContent className="py-10 text-center"><EyeOff className="mx-auto h-8 w-8 text-muted-foreground/60" /><h2 className="mt-3 font-semibold">Meeting operations will appear here</h2><p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">The registry, access rules, archive gate, and section configuration are now in place. Subsequent Pulse increments can add the runner, scorecard, work, teams, 1:1s, and communications on the same entitlement model rather than introducing duplicate visibility controls.</p></CardContent></Card>
    </div>
  );
}
