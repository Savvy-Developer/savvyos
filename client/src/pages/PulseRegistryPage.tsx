import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Activity, Archive, CalendarClock, Check, CircleUserRound, Clock3, Edit3, Loader2, Plus, ShieldCheck, UsersRound } from "lucide-react";

const DAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
] as const;

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

const DEFAULT_SECTIONS: Record<string, boolean> = {
  overview: true,
  segue: true,
  headlines: true,
  scorecard: true,
  rocks: true,
  todos: true,
  issues: true,
  archive: true,
};

type Meeting = any;
type FullUser = { id: number; name: string | null; email: string | null; title: string | null };

type MeetingDraft = {
  meetingKey: string;
  name: string;
  scheduleDay: (typeof DAYS)[number];
  scheduleTime: string;
  timezone: string;
  durationMinutes: number;
  sectionVisibility: Record<string, boolean>;
  facilitatorUserId: string;
  memberUserIds: number[];
};

function makeDraft(meeting?: Meeting): MeetingDraft {
  const facilitator = meeting?.access?.find((entry: any) => entry.accessLevel === "facilitator");
  return {
    meetingKey: meeting?.meetingKey ?? "",
    name: meeting?.name ?? "",
    scheduleDay: meeting?.scheduleDay ?? "monday",
    scheduleTime: meeting?.scheduleTime ?? "09:00",
    timezone: meeting?.timezone ?? "America/New_York",
    durationMinutes: meeting?.durationMinutes ?? 90,
    sectionVisibility: { ...DEFAULT_SECTIONS, ...(meeting?.sectionVisibility ?? {}) },
    facilitatorUserId: facilitator?.userId ? String(facilitator.userId) : (meeting?.facilitatorUserId ? String(meeting.facilitatorUserId) : ""),
    memberUserIds: (meeting?.access ?? [])
      .filter((entry: any) => entry.accessLevel === "member")
      .map((entry: any) => entry.userId),
  };
}

function personName(person: { name: string | null; email: string | null }) {
  return person.name?.trim() || person.email || "Unnamed person";
}

function ScheduleSummary({ meeting }: { meeting: Meeting }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{meeting.scheduleDay.slice(0, 1).toUpperCase() + meeting.scheduleDay.slice(1)} at {meeting.scheduleTime}</span>
      <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{meeting.durationMinutes} minutes</span>
      <span>{meeting.timezone}</span>
    </div>
  );
}

function MeetingDialog({
  open,
  onOpenChange,
  initialMeeting,
  fullUsers,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMeeting?: Meeting | null;
  fullUsers: FullUser[];
  onSubmit: (draft: MeetingDraft) => void;
  submitting: boolean;
}) {
  const [draft, setDraft] = useState<MeetingDraft>(() => makeDraft(initialMeeting));

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setDraft(makeDraft(initialMeeting));
    onOpenChange(nextOpen);
  }

  function toggleMember(userId: number, checked: boolean) {
    setDraft((current) => ({
      ...current,
      memberUserIds: checked
        ? Array.from(new Set([...current.memberUserIds, userId]))
        : current.memberUserIds.filter((id) => id !== userId),
    }));
  }

  const selectedFacilitatorId = Number(draft.facilitatorUserId || 0);
  const isEdit = !!initialMeeting;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit meeting registry" : "Generate a meeting registry"}</DialogTitle>
          <DialogDescription>
            A meeting is configuration plus one normalized access relationship per person. The facilitator is assigned through that same relationship.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pulse-name">Meeting name</Label>
            <Input id="pulse-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Leadership L10" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pulse-key">Stable meeting key</Label>
            <Input id="pulse-key" value={draft.meetingKey} onChange={(event) => setDraft((current) => ({ ...current, meetingKey: event.target.value.toLowerCase().replace(/\s+/g, "-") }))} placeholder="leadership-l10" />
          </div>
          <div className="space-y-2">
            <Label>Schedule day</Label>
            <Select value={draft.scheduleDay} onValueChange={(value) => setDraft((current) => ({ ...current, scheduleDay: value as MeetingDraft["scheduleDay"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DAYS.map((day) => <SelectItem key={day} value={day}>{day.slice(0, 1).toUpperCase() + day.slice(1)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pulse-time">Local start time</Label>
            <Input id="pulse-time" type="time" value={draft.scheduleTime} onChange={(event) => setDraft((current) => ({ ...current, scheduleTime: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pulse-timezone">Timezone</Label>
            <Input id="pulse-timezone" value={draft.timezone} onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))} placeholder="America/New_York" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pulse-duration">Expected duration (minutes)</Label>
            <Input id="pulse-duration" type="number" min={15} max={480} value={draft.durationMinutes} onChange={(event) => setDraft((current) => ({ ...current, durationMinutes: Number(event.target.value) || 15 }))} />
          </div>
        </div>

        <div className="space-y-2 border-t pt-4">
          <Label>Facilitator</Label>
          <Select value={draft.facilitatorUserId} onValueChange={(value) => setDraft((current) => ({ ...current, facilitatorUserId: value }))}>
            <SelectTrigger><SelectValue placeholder="Select an active Full User" /></SelectTrigger>
            <SelectContent>
              {fullUsers.map((person) => <SelectItem key={person.id} value={String(person.id)}>{personName(person)}{person.title ? ` · ${person.title}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Facilitator is an access level, not a role exception. Changing it updates the meeting’s single access relation.</p>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div>
            <Label>Member access</Label>
            <p className="text-xs text-muted-foreground mt-1">Only active Full Users are eligible. Teammates are deliberately excluded from access, assignment, and notification paths.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {fullUsers.map((person) => {
              const isFacilitator = person.id === selectedFacilitatorId;
              const checked = isFacilitator || draft.memberUserIds.includes(person.id);
              return (
                <label key={person.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${isFacilitator ? "border-primary/30 bg-primary/5" : "hover:bg-muted/50"}`}>
                  <Checkbox checked={checked} disabled={isFacilitator} onCheckedChange={(value) => toggleMember(person.id, !!value)} />
                  <span className="min-w-0 flex-1 truncate">{personName(person)}</span>
                  {isFacilitator && <Badge variant="secondary" className="text-[10px]">Facilitator</Badge>}
                </label>
              );
            })}
          </div>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div>
            <Label>Section visibility</Label>
            <p className="text-xs text-muted-foreground mt-1">This controls future meeting surfaces without deleting their data or creating alternate configuration paths.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(SECTION_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm hover:bg-muted/50">
                <Checkbox checked={draft.sectionVisibility[key] !== false} onCheckedChange={(value) => setDraft((current) => ({ ...current, sectionVisibility: { ...current.sectionVisibility, [key]: !!value } }))} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={() => onSubmit(draft)} disabled={submitting || !draft.name.trim() || !draft.meetingKey.trim() || !draft.facilitatorUserId}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {isEdit ? "Save meeting" : "Create meeting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PulseRegistryPage() {
  const utils = trpc.useUtils();
  const { data: meetings = [], isLoading: meetingsLoading, error: meetingsError } = trpc.pulse.getRegistry.useQuery();
  const { data: directory, isLoading: directoryLoading } = trpc.pulse.getDirectory.useQuery();
  const fullUsers = (directory?.fullUsers ?? []) as FullUser[];
  const teammates = directory?.teammates ?? [];
  const [createOpen, setCreateOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [archiveMeeting, setArchiveMeeting] = useState<Meeting | null>(null);
  const [archiveNote, setArchiveNote] = useState("");
  const [teammateOpen, setTeammateOpen] = useState(false);
  const [teammateName, setTeammateName] = useState("");
  const [teammateTitle, setTeammateTitle] = useState("");

  const invalidatePulse = () => {
    utils.pulse.getRegistry.invalidate();
    utils.pulse.getDirectory.invalidate();
    utils.pulse.getNavigation.invalidate();
  };

  const createMeeting = trpc.pulse.createMeeting.useMutation({
    onSuccess: () => { toast.success("Meeting registry created"); setCreateOpen(false); invalidatePulse(); },
    onError: (error) => toast.error(error.message),
  });
  const updateMeeting = trpc.pulse.updateMeeting.useMutation({ onError: (error) => toast.error(error.message) });
  const replaceAccess = trpc.pulse.replaceMeetingAccess.useMutation({ onError: (error) => toast.error(error.message) });
  const archive = trpc.pulse.archiveMeeting.useMutation({
    onSuccess: () => { toast.success("Meeting archived and removed from all active Pulse surfaces"); setArchiveMeeting(null); setArchiveNote(""); invalidatePulse(); },
    onError: (error) => toast.error(error.message),
  });
  const createTeammate = trpc.pulse.createTeammate.useMutation({
    onSuccess: () => { toast.success("Teammate added to the directory"); setTeammateOpen(false); setTeammateName(""); setTeammateTitle(""); invalidatePulse(); },
    onError: (error) => toast.error(error.message),
  });

  const meetingStats = useMemo(() => ({
    accessible: meetings.length,
    facilitators: meetings.filter((meeting: any) => meeting.accessLevel === "facilitator").length,
    people: new Set(meetings.flatMap((meeting: any) => meeting.access.map((entry: any) => entry.userId))).size,
  }), [meetings]);

  async function submitEdit(draft: MeetingDraft) {
    if (!editingMeeting) return;
    await updateMeeting.mutateAsync({
      meetingId: editingMeeting.id,
      meetingKey: draft.meetingKey,
      name: draft.name,
      scheduleDay: draft.scheduleDay,
      scheduleTime: draft.scheduleTime,
      timezone: draft.timezone,
      durationMinutes: draft.durationMinutes,
      sectionVisibility: draft.sectionVisibility,
    });
    await replaceAccess.mutateAsync({
      meetingId: editingMeeting.id,
      facilitatorUserId: Number(draft.facilitatorUserId),
      memberUserIds: draft.memberUserIds,
    });
    toast.success("Meeting registry updated");
    setEditingMeeting(null);
    invalidatePulse();
  }

  if (meetingsLoading || directoryLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  if (meetingsError) {
    return <div className="py-16 text-center"><ShieldCheck className="mx-auto h-9 w-9 text-muted-foreground" /><h1 className="mt-3 text-lg font-semibold">Pulse configuration is unavailable</h1><p className="mt-1 text-sm text-muted-foreground">{meetingsError.message}</p></div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><Activity className="h-3.5 w-3.5" /> Administer · Pulse</div>
          <h1 className="text-2xl font-semibold tracking-tight">Pulse meeting registry</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">Configure the operating cadence without recreating legacy access flags. Active meetings are discovered only through their normalized person-to-meeting entitlement.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setTeammateOpen(true)}><CircleUserRound className="mr-2 h-4 w-4" />Add Teammate</Button>
          <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Generate meeting</Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardDescription>Accessible active meetings</CardDescription><CardTitle className="text-3xl">{meetingStats.accessible}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">The registry never lists archived or ungranted meetings.</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Your facilitator grants</CardDescription><CardTitle className="text-3xl">{meetingStats.facilitators}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Facilitation is an access level, not a role shortcut.</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Full Users in visible access rosters</CardDescription><CardTitle className="text-3xl">{meetingStats.people}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Directory Teammates are excluded from meeting access.</CardContent></Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold">Active registry</h2><p className="text-sm text-muted-foreground">Archive is evaluated before any facilitator or administrative access rule.</p></div><Badge variant="outline">{meetings.length} active</Badge></div>
        {meetings.length === 0 ? (
          <Card className="border-dashed"><CardContent className="flex flex-col items-center py-14 text-center"><Activity className="h-9 w-9 text-muted-foreground/60" /><h3 className="mt-4 font-semibold">No accessible Pulse meetings</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">Generate the first meeting or have a facilitator grant you membership. Meeting names are never exposed before that relationship exists.</p><Button className="mt-5" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Generate the first meeting</Button></CardContent></Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {(meetings as Meeting[]).map((meeting) => {
              const facilitator = meeting.access.find((entry: any) => entry.accessLevel === "facilitator");
              const canFacilitate = meeting.accessLevel === "facilitator";
              return (
                <Card key={meeting.id} className="overflow-hidden">
                  <CardHeader className="space-y-3 border-b bg-muted/20">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><CardTitle className="truncate">{meeting.name}</CardTitle><Badge variant={canFacilitate ? "default" : "secondary"}>{canFacilitate ? "Facilitator" : "Member"}</Badge></div><CardDescription className="mt-1 font-mono text-[11px]">{meeting.meetingKey}</CardDescription></div><Activity className="h-5 w-5 shrink-0 text-primary" /></div>
                    <ScheduleSummary meeting={meeting} />
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    <div><p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Access roster</p><div className="flex flex-wrap gap-1.5">{meeting.access.map((entry: any) => <Badge key={entry.userId} variant="outline" className="font-normal">{entry.accessLevel === "facilitator" && <Check className="mr-1 h-3 w-3 text-primary" />}{personName(entry)}</Badge>)}</div></div>
                    <div><p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Visible sections</p><div className="flex flex-wrap gap-1.5">{Object.entries(meeting.sectionVisibility as Record<string, boolean>).filter(([, visible]) => visible).map(([key]) => <Badge key={key} variant="secondary" className="text-[10px]">{SECTION_LABELS[key] ?? key}</Badge>)}</div></div>
                    <div className="flex justify-end gap-2 border-t pt-4">
                      {canFacilitate ? <><Button size="sm" variant="outline" onClick={() => setEditingMeeting(meeting)}><Edit3 className="mr-1.5 h-3.5 w-3.5" />Edit</Button><Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setArchiveMeeting(meeting)}><Archive className="mr-1.5 h-3.5 w-3.5" />Archive</Button></> : <p className="text-xs text-muted-foreground">Member access provides visibility; only the facilitator can change this registry.</p>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><UsersRound className="h-4 w-4 text-primary" />Full Users</CardTitle><CardDescription>These people may authenticate and can be granted Pulse access. Assignment and notification eligibility will also remain Full User-only.</CardDescription></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{fullUsers.map((person) => <div key={person.id} className="rounded-lg border px-3 py-2.5"><p className="text-sm font-medium">{personName(person)}</p><p className="text-xs text-muted-foreground">{person.title || person.email || "Full User"}</p></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CircleUserRound className="h-4 w-4 text-primary" />Teammate directory</CardTitle><CardDescription>Reference records only. They never receive login navigation, access, assignments, or notifications.</CardDescription></CardHeader><CardContent className="space-y-2">{teammates.length === 0 ? <p className="text-sm text-muted-foreground">No directory-only Teammates yet.</p> : teammates.map((person: any) => <div key={person.id} className="rounded-lg border px-3 py-2.5"><p className="text-sm font-medium">{personName(person)}</p><p className="text-xs text-muted-foreground">{person.title || "Teammate"}</p></div>)}</CardContent></Card>
      </section>

      <MeetingDialog open={createOpen} onOpenChange={setCreateOpen} fullUsers={fullUsers} submitting={createMeeting.isPending} onSubmit={(draft) => createMeeting.mutate({ ...draft, facilitatorUserId: Number(draft.facilitatorUserId) })} />
      <MeetingDialog open={!!editingMeeting} onOpenChange={(open) => { if (!open) setEditingMeeting(null); }} initialMeeting={editingMeeting} fullUsers={fullUsers} submitting={updateMeeting.isPending || replaceAccess.isPending} onSubmit={submitEdit} />

      <Dialog open={!!archiveMeeting} onOpenChange={(open) => { if (!open) { setArchiveMeeting(null); setArchiveNote(""); } }}>
        <DialogContent><DialogHeader><DialogTitle>Archive {archiveMeeting?.name}?</DialogTitle><DialogDescription>This removes the meeting from every normal Pulse surface immediately. Archive is not an access question: even facilitators and privileged administrators cannot discover or open it until an explicit reactivation.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="archive-note">Archive note (optional)</Label><Textarea id="archive-note" value={archiveNote} onChange={(event) => setArchiveNote(event.target.value)} placeholder="Why is this meeting being deactivated?" /></div><DialogFooter><Button variant="outline" onClick={() => setArchiveMeeting(null)} disabled={archive.isPending}>Cancel</Button><Button variant="destructive" onClick={() => archiveMeeting && archive.mutate({ meetingId: archiveMeeting.id, archiveNote: archiveNote || undefined })} disabled={archive.isPending}>{archive.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Archive meeting</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={teammateOpen} onOpenChange={setTeammateOpen}>
        <DialogContent><DialogHeader><DialogTitle>Add a Teammate</DialogTitle><DialogDescription>Creates a directory-only person. This does not create a credential, grant visibility, or create an assignment or notification recipient.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="teammate-name">Name</Label><Input id="teammate-name" value={teammateName} onChange={(event) => setTeammateName(event.target.value)} placeholder="Jordan Smith" /></div><div className="space-y-2"><Label htmlFor="teammate-title">Title or seat</Label><Input id="teammate-title" value={teammateTitle} onChange={(event) => setTeammateTitle(event.target.value)} placeholder="Director of Operations" /></div></div><DialogFooter><Button variant="outline" onClick={() => setTeammateOpen(false)} disabled={createTeammate.isPending}>Cancel</Button><Button onClick={() => createTeammate.mutate({ name: teammateName, title: teammateTitle || undefined })} disabled={createTeammate.isPending || teammateName.trim().length < 2}>{createTeammate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Teammate</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
