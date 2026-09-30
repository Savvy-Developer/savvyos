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
import { CalendarClock, CheckCircle2, Clock3, Plus, TriangleAlert, UserRound } from "lucide-react";
import { toast } from "sonner";
import { safeFormatET } from "@/lib/safeFormat";

type Filter = "all" | "upcoming" | "due_soon" | "overdue" | "not_scheduled";
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

function statusPresentation(row: any) {
  if (row.isOverdue) return { label: "Overdue", className: "bg-red-100 text-red-800 border-red-200" };
  if (row.isDueSoon) return { label: "Due soon", className: "bg-amber-100 text-amber-800 border-amber-200" };
  if (row.isNoSchedule) return { label: "No 1:1 scheduled", className: "bg-slate-100 text-slate-700 border-slate-200" };
  return { label: "Current", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
}

export default function OneOnOneMeetingsPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: dashboard, isLoading } = trpc.oneOnOnes.dashboard.useQuery();
  const { data: people = [] } = trpc.oneOnOnes.people.useQuery();
  const [filter, setFilter] = useState<Filter>("all");
  const [setupOpen, setSetupOpen] = useState(false);
  const [setup, setSetup] = useState<SetupState>(blankSetup);

  const upsertRelationship = trpc.oneOnOnes.upsertRelationship.useMutation({
    onSuccess: async result => {
      await utils.oneOnOnes.dashboard.invalidate();
      setSetupOpen(false);
      setSetup(blankSetup());
      if (result.meeting?.calendar?.calendarSyncStatus === "Needs Attention") {
        toast.warning("1:1 saved. Google Calendar needs attention for this leader.");
      } else {
        toast.success(result.meeting ? "1:1 set up and scheduled" : "1:1 relationship saved");
      }
      if (result.meeting?.meetingId) navigate(`/hr/one-on-ones/${result.meeting.meetingId}`);
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

  const rows = useMemo(() => (dashboard?.rows ?? []).filter((row: any) => {
    if (filter === "all") return true;
    if (filter === "upcoming") return row.isUpcoming;
    if (filter === "due_soon") return row.isDueSoon;
    if (filter === "overdue") return row.isOverdue;
    return row.isNoSchedule;
  }), [dashboard?.rows, filter]);

  const openSetup = (row?: any) => {
    if (row) {
      setSetup({
        relationshipId: row.relationship.id,
        employeeId: String(row.relationship.employeeId),
        leaderId: String(row.relationship.leaderId),
        frequencyDays: String(row.relationship.frequencyDays),
        nextScheduledAt: "",
        durationMinutes: "45",
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
    { key: "upcoming" as const, label: "Upcoming", value: dashboard?.counts.upcoming ?? 0, icon: CalendarClock, tone: "text-sky-700 bg-sky-50 border-sky-200" },
    { key: "due_soon" as const, label: "Due soon", value: dashboard?.counts.dueSoon ?? 0, icon: Clock3, tone: "text-amber-700 bg-amber-50 border-amber-200" },
    { key: "overdue" as const, label: "Overdue", value: dashboard?.counts.overdue ?? 0, icon: TriangleAlert, tone: "text-red-700 bg-red-50 border-red-200" },
    { key: "not_scheduled" as const, label: "No 1:1 scheduled", value: dashboard?.counts.noSchedule ?? 0, icon: UserRound, tone: "text-slate-700 bg-slate-50 border-slate-200" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary"><UserRound className="h-5 w-5" /><span className="text-sm font-semibold">HR</span></div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">1:1 Meetings</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">A single place for recurring 1:1s, real commitments, and the follow-through leadership needs to see.</p>
        </div>
        <Button onClick={() => openSetup()}><Plus className="mr-2 h-4 w-4" />Set up 1:1</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {counters.map(counter => {
          const Icon = counter.icon;
          const active = filter === counter.key;
          return <button key={counter.key} type="button" onClick={() => setFilter(active ? "all" : counter.key)} className={`rounded-lg border p-4 text-left transition hover:shadow-sm ${counter.tone} ${active ? "ring-2 ring-primary ring-offset-2" : ""}`}>
            <div className="flex items-start justify-between"><p className="text-xs font-semibold uppercase tracking-wide">{counter.label}</p><Icon className="h-4 w-4" /></div>
            <p className="mt-2 text-3xl font-bold">{counter.value}</p>
            <p className="mt-1 text-xs opacity-80">{active ? "Showing this group" : "View this group"}</p>
          </button>;
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div><CardTitle>Team 1:1s</CardTitle><CardDescription>{filter === "all" ? "All recurring employee and leader relationships" : "Filtered by the selected reminder state"}</CardDescription></div>
          {filter !== "all" && <Button variant="ghost" size="sm" onClick={() => setFilter("all")}>Clear filter</Button>}
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="py-12 text-center text-sm text-muted-foreground">Loading 1:1 relationships…</p> : rows.length === 0 ? <div className="rounded-lg border border-dashed py-12 text-center"><CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" /><p className="font-medium">No 1:1s in this view</p><p className="mt-1 text-sm text-muted-foreground">Set up a recurring employee and leader relationship to get started.</p></div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Leader</TableHead><TableHead>Cadence</TableHead><TableHead>Last 1:1</TableHead><TableHead>Next 1:1</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map((row: any) => {
            const status = statusPresentation(row);
            return <TableRow key={row.relationship.id}>
              <TableCell><div className="font-medium">{row.employee?.name ?? "Unknown employee"}</div><div className="text-xs text-muted-foreground">{row.employee?.title ?? "No role recorded"}</div></TableCell>
              <TableCell>{row.leader?.name ?? "Unknown leader"}</TableCell>
              <TableCell>Every {row.relationship.frequencyDays} days</TableCell>
              <TableCell>{row.lastMeeting?.heldAt ? safeFormatET(row.lastMeeting.heldAt, { month: "short", day: "numeric", year: "numeric" }) : "No completed 1:1 yet"}</TableCell>
              <TableCell>{row.relationship.nextScheduledAt ? safeFormatET(row.relationship.nextScheduledAt) : "Not scheduled"}</TableCell>
              <TableCell><Badge variant="outline" className={status.className}>{status.label}</Badge></TableCell>
              <TableCell><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => openSetup(row)}>Configure</Button><Button size="sm" onClick={() => startMeeting.mutate({ relationshipId: row.relationship.id })} disabled={startMeeting.isPending}>Start 1:1</Button></div></TableCell>
            </TableRow>;
          })}</TableBody></Table></div>}
        </CardContent>
      </Card>

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{setup.relationshipId ? "Configure recurring 1:1" : "Set up recurring 1:1"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Employee</Label><Select value={setup.employeeId} disabled={Boolean(setup.relationshipId)} onValueChange={employeeId => setSetup(current => ({ ...current, employeeId }))}><SelectTrigger><SelectValue placeholder="Choose employee" /></SelectTrigger><SelectContent>{people.map((person: any) => <SelectItem key={person.id} value={String(person.id)}>{person.name ?? person.email ?? `User ${person.id}`}{person.title ? ` · ${person.title}` : ""}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label>Leader</Label><Select value={setup.leaderId} disabled={Boolean(setup.relationshipId)} onValueChange={leaderId => setSetup(current => ({ ...current, leaderId }))}><SelectTrigger><SelectValue placeholder="Choose leader" /></SelectTrigger><SelectContent>{people.map((person: any) => <SelectItem key={person.id} value={String(person.id)}>{person.name ?? person.email ?? `User ${person.id}`}{person.title ? ` · ${person.title}` : ""}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>Cadence (days)</Label><Input type="number" min="7" max="365" value={setup.frequencyDays} onChange={event => setSetup(current => ({ ...current, frequencyDays: event.target.value }))} /></div><div className="grid gap-2"><Label>Meeting duration</Label><Select value={setup.durationMinutes} onValueChange={durationMinutes => setSetup(current => ({ ...current, durationMinutes }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">30 minutes</SelectItem><SelectItem value="45">45 minutes</SelectItem><SelectItem value="60">60 minutes</SelectItem></SelectContent></Select></div></div>
            <div className="grid gap-2"><Label>Schedule the next 1:1 <span className="font-normal text-muted-foreground">(optional)</span></Label><Input type="datetime-local" value={setup.nextScheduledAt} onChange={event => setSetup(current => ({ ...current, nextScheduledAt: event.target.value }))} /><p className="text-xs text-muted-foreground">When a time is set, SavvyOS creates a Google Calendar event on the leader’s connected calendar when available.</p></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSetupOpen(false)}>Cancel</Button><Button onClick={submitSetup} disabled={upsertRelationship.isPending}>{upsertRelationship.isPending ? "Saving…" : setup.nextScheduledAt ? "Save and schedule" : "Save 1:1"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
