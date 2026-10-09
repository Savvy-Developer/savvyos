import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarClock, CheckCircle2, Clock3, ExternalLink, PlayCircle, Plus, RefreshCw, TriangleAlert, UserRound, Video } from "lucide-react";
import { toast } from "sonner";
import { safeFormatET } from "@/lib/safeFormat";

type SetupState = {
  relationshipId?: number;
  employeeId: string;
  leaderId: string;
  frequencyDays: string;
  nextScheduledAt: string;
  durationMinutes: string;
};

const blankSetup = (): SetupState => ({
  employeeId: "",
  leaderId: "",
  frequencyDays: "30",
  nextScheduledAt: "",
  durationMinutes: "45",
});

function toDateTimeInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function relationshipStatus(row: any) {
  if (row.isNoSchedule) return { label: "No next 1:1", className: "bg-slate-100 text-slate-700 border-slate-200" };
  if (row.isOverdue) return { label: row.nextMeeting ? "Ready to run" : "Needs a next date", className: "bg-red-100 text-red-800 border-red-200" };
  if (row.isDueSoon) return { label: "Next 1:1 due soon", className: "bg-amber-100 text-amber-800 border-amber-200" };
  return { label: "Configured", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
}

export default function OneOnOneMeetingsPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: dashboard, isLoading } = trpc.oneOnOnes.dashboard.useQuery();
  const { data: people = [] } = trpc.oneOnOnes.people.useQuery();
  const [setupOpen, setSetupOpen] = useState(false);
  const [setup, setSetup] = useState<SetupState>(blankSetup);

  const selectedRelationship = useMemo(
    () => dashboard?.rows.find((row: any) => row.relationship.id === setup.relationshipId) ?? null,
    [dashboard?.rows, setup.relationshipId],
  );
  const scheduledMeeting = selectedRelationship?.nextMeeting ?? null;

  const upsertRelationship = trpc.oneOnOnes.upsertRelationship.useMutation({
    onSuccess: async result => {
      setSetup(current => ({ ...current, relationshipId: result.relationshipId }));
      await utils.oneOnOnes.dashboard.invalidate();
      if (result.meeting?.calendar?.calendarSyncStatus !== "Synced" || result.meeting?.zoom?.zoomSyncStatus !== "Synced") {
        toast.warning("The 1:1 was saved, but Zoom or Google Calendar needs attention below.");
      } else {
        toast.success(result.meeting ? "Next 1:1 configured with Zoom and Google Calendar" : "Recurring 1:1 configuration saved");
      }
    },
    onError: error => toast.error(error.message),
  });

  const syncMeetingIntegrations = trpc.oneOnOnes.retryCalendarSync.useMutation({
    onSuccess: async result => {
      await utils.oneOnOnes.dashboard.invalidate();
      if (result.calendarSyncStatus === "Synced" && result.zoom?.zoomSyncStatus === "Synced") toast.success("Zoom link and Google Calendar event are ready.");
      else toast.warning(result.zoom?.zoomSyncError || result.calendarSyncError || "Zoom or Google Calendar still needs attention.");
    },
    onError: error => toast.error(error.message),
  });

  const startMeeting = trpc.oneOnOnes.startMeeting.useMutation({
    onSuccess: result => {
      void utils.oneOnOnes.dashboard.invalidate();
      navigate(`/hr/one-on-ones/${result.meetingId}`);
    },
    onError: error => toast.error(error.message),
  });

  const openSetup = (row?: any) => {
    if (row) {
      setSetup({
        relationshipId: row.relationship.id,
        employeeId: String(row.relationship.employeeId),
        leaderId: String(row.relationship.leaderId),
        frequencyDays: String(row.relationship.frequencyDays),
        nextScheduledAt: toDateTimeInput(row.nextMeeting?.scheduledAt),
        durationMinutes: String(row.nextMeeting?.durationMinutes ?? 45),
      });
    } else {
      setSetup(blankSetup());
    }
    setSetupOpen(true);
  };

  const submitSetup = () => {
    if (!setup.employeeId || !setup.leaderId) {
      toast.error("Choose both an employee and a leader.");
      return;
    }
    upsertRelationship.mutate({
      relationshipId: setup.relationshipId,
      employeeId: Number(setup.employeeId),
      leaderId: Number(setup.leaderId),
      frequencyDays: Number(setup.frequencyDays || 30),
      nextScheduledAt: setup.nextScheduledAt ? new Date(setup.nextScheduledAt).toISOString() : null,
      durationMinutes: Number(setup.durationMinutes || 45),
    });
  };

  const counters = [
    { label: "Configured", value: dashboard?.counts.upcoming ?? 0, icon: CalendarClock, tone: "text-sky-700 bg-sky-50 border-sky-200" },
    { label: "Due soon", value: dashboard?.counts.dueSoon ?? 0, icon: Clock3, tone: "text-amber-700 bg-amber-50 border-amber-200" },
    { label: "Past due", value: dashboard?.counts.overdue ?? 0, icon: TriangleAlert, tone: "text-red-700 bg-red-50 border-red-200" },
    { label: "No schedule", value: dashboard?.counts.noSchedule ?? 0, icon: UserRound, tone: "text-slate-700 bg-slate-50 border-slate-200" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary"><UserRound className="h-5 w-5" /><span className="text-sm font-semibold">HR</span></div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">1:1 Meetings</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Configure the recurring relationship and its next calendar-backed occurrence here. Run the actual conversation only when it is due.</p>
        </div>
        <Button onClick={() => openSetup()}><Plus className="mr-2 h-4 w-4" />Create 1:1</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {counters.map(counter => {
          const Icon = counter.icon;
          return <div key={counter.label} className={`rounded-lg border p-4 ${counter.tone}`}><div className="flex items-start justify-between"><p className="text-xs font-semibold uppercase tracking-wide">{counter.label}</p><Icon className="h-4 w-4" /></div><p className="mt-2 text-3xl font-bold">{counter.value}</p></div>;
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div><CardTitle>Configure recurring 1:1s</CardTitle><CardDescription>Set the cadence, next date, Zoom link, and Google Calendar event. Saving a new date updates the existing next occurrence instead of creating a duplicate.</CardDescription></div>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="py-12 text-center text-sm text-muted-foreground">Loading 1:1 relationships…</p> : (dashboard?.rows.length ?? 0) === 0 ? <div className="rounded-lg border border-dashed py-12 text-center"><CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" /><p className="font-medium">No 1:1s configured yet</p><p className="mt-1 text-sm text-muted-foreground">Create a recurring employee and leader relationship to get started.</p></div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Leader</TableHead><TableHead>Cadence</TableHead><TableHead>Next 1:1</TableHead><TableHead>Setup</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{dashboard?.rows.map((row: any) => {
            const status = relationshipStatus(row);
            const meeting = row.nextMeeting;
            return <TableRow key={row.relationship.id}>
              <TableCell><div className="font-medium">{row.employee?.name ?? "Unknown employee"}</div><div className="text-xs text-muted-foreground">{row.employee?.title ?? "No role recorded"}</div></TableCell>
              <TableCell>{row.leader?.name ?? "Unknown leader"}</TableCell>
              <TableCell>Every {row.relationship.frequencyDays} days</TableCell>
              <TableCell>{meeting?.scheduledAt ? safeFormatET(meeting.scheduledAt) : "Not scheduled"}</TableCell>
              <TableCell><Badge variant="outline" className={status.className}>{meeting ? `${meeting.zoomSyncStatus === "Synced" && meeting.calendarSyncStatus === "Synced" ? "Ready" : "Needs attention"}` : status.label}</Badge></TableCell>
              <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => openSetup(row)}>Configure</Button></TableCell>
            </TableRow>;
          })}</TableBody></Table></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Run 1:1s</CardTitle><CardDescription>Only meetings scheduled for today or earlier appear here. Unfinished past meetings remain available until their notes and follow-through are completed.</CardDescription></CardHeader>
        <CardContent>
          {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Checking today’s 1:1s…</p> : (dashboard?.runQueue.length ?? 0) === 0 ? <div className="rounded-lg border border-dashed py-10 text-center"><CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-emerald-600" /><p className="font-medium">Nothing to run right now</p><p className="mt-1 text-sm text-muted-foreground">Configure the next occurrence above. It will appear here on its scheduled date.</p></div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Leader</TableHead><TableHead>Scheduled</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{dashboard?.runQueue.map((row: any) => <TableRow key={row.meeting.id}><TableCell><div className="font-medium">{row.employee?.name ?? "Unknown employee"}</div><div className="text-xs text-muted-foreground">{row.employee?.title ?? "No role recorded"}</div></TableCell><TableCell>{row.leader?.name ?? "Unknown leader"}</TableCell><TableCell>{row.meeting.scheduledAt ? safeFormatET(row.meeting.scheduledAt) : "Legacy meeting"}{row.isOverdue && <span className="ml-2 text-xs text-amber-700">Past due</span>}</TableCell><TableCell><Badge variant={row.meeting.status === "Scheduled" ? "secondary" : "outline"}>{row.meeting.status}</Badge></TableCell><TableCell className="text-right">{row.meeting.status === "Scheduled" ? <Button size="sm" onClick={() => startMeeting.mutate({ relationshipId: row.meeting.relationshipId })} disabled={startMeeting.isPending}><PlayCircle className="mr-1.5 h-4 w-4" />Start 1:1</Button> : <Button size="sm" onClick={() => navigate(`/hr/one-on-ones/${row.meeting.id}`)}>Continue 1:1</Button>}</TableCell></TableRow>)}</TableBody></Table></div>}
        </CardContent>
      </Card>

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{setup.relationshipId ? "Configure recurring 1:1" : "Create recurring 1:1"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Employee</Label><Select value={setup.employeeId} disabled={Boolean(setup.relationshipId)} onValueChange={employeeId => setSetup(current => ({ ...current, employeeId }))}><SelectTrigger><SelectValue placeholder="Choose employee" /></SelectTrigger><SelectContent>{people.map((person: any) => <SelectItem key={person.id} value={String(person.id)}>{person.name ?? person.email ?? `User ${person.id}`}{person.title ? ` · ${person.title}` : ""}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label>Leader</Label><Select value={setup.leaderId} disabled={Boolean(setup.relationshipId)} onValueChange={leaderId => setSetup(current => ({ ...current, leaderId }))}><SelectTrigger><SelectValue placeholder="Choose leader" /></SelectTrigger><SelectContent>{people.map((person: any) => <SelectItem key={person.id} value={String(person.id)}>{person.name ?? person.email ?? `User ${person.id}`}{person.title ? ` · ${person.title}` : ""}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>Cadence (days)</Label><Input type="number" min="7" max="365" value={setup.frequencyDays} onChange={event => setSetup(current => ({ ...current, frequencyDays: event.target.value }))} /></div><div className="grid gap-2"><Label>Meeting duration</Label><Select value={setup.durationMinutes} onValueChange={durationMinutes => setSetup(current => ({ ...current, durationMinutes }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">30 minutes</SelectItem><SelectItem value="45">45 minutes</SelectItem><SelectItem value="60">60 minutes</SelectItem></SelectContent></Select></div></div>
            <div className="grid gap-2"><Label>Next 1:1 <span className="font-normal text-muted-foreground">(optional)</span></Label><Input type="datetime-local" value={setup.nextScheduledAt} onChange={event => setSetup(current => ({ ...current, nextScheduledAt: event.target.value }))} /><p className="text-xs text-muted-foreground">This configures the next real 1:1, creates or updates its Zoom meeting and Google Calendar event, and prevents duplicate future events. When it is completed, SavvyOS automatically schedules the following occurrence every {setup.frequencyDays || "30"} days.</p></div>

            {scheduledMeeting && <div className="rounded-lg border bg-muted/20 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-medium">Current next occurrence</p><p className="mt-1 text-sm text-muted-foreground">{scheduledMeeting.scheduledAt ? safeFormatET(scheduledMeeting.scheduledAt) : "Date needs to be set"}</p></div><div className="flex flex-wrap gap-2">{scheduledMeeting.zoomJoinUrl && <Button asChild size="sm"><a href={scheduledMeeting.zoomJoinUrl} target="_blank" rel="noreferrer"><Video className="mr-1.5 h-3.5 w-3.5" />Join Zoom <ExternalLink className="ml-1 h-3.5 w-3.5" /></a></Button>}{scheduledMeeting.calendarEventUrl && <Button asChild size="sm" variant="outline"><a href={scheduledMeeting.calendarEventUrl} target="_blank" rel="noreferrer">Calendar <ExternalLink className="ml-1 h-3.5 w-3.5" /></a></Button>}</div></div><div className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><p><span className="font-medium">Zoom:</span> {scheduledMeeting.zoomSyncStatus}{scheduledMeeting.zoomSyncError ? ` · ${scheduledMeeting.zoomSyncError}` : ""}</p><p><span className="font-medium">Google Calendar:</span> {scheduledMeeting.calendarSyncStatus}{scheduledMeeting.calendarSyncError ? ` · ${scheduledMeeting.calendarSyncError}` : ""}</p></div>{(scheduledMeeting.zoomSyncStatus !== "Synced" || scheduledMeeting.calendarSyncStatus !== "Synced") && <Button className="mt-3" size="sm" variant="outline" onClick={() => syncMeetingIntegrations.mutate({ meetingId: scheduledMeeting.id })} disabled={syncMeetingIntegrations.isPending}>{syncMeetingIntegrations.isPending ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}Sync Zoom and Calendar</Button>}</div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSetupOpen(false)}>Close</Button><Button onClick={submitSetup} disabled={upsertRelationship.isPending}>{upsertRelationship.isPending ? "Saving…" : setup.nextScheduledAt ? (scheduledMeeting ? "Save schedule changes" : "Schedule 1:1") : "Save configuration"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
