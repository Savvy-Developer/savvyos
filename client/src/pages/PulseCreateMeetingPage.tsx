import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Check, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const sections = [
  { key: "overview", label: "Overview" }, { key: "segue", label: "Segue" }, { key: "headlines", label: "Headlines" }, { key: "scorecard", label: "Scorecard" }, { key: "rocks", label: "Rocks" }, { key: "todos", label: "To-Dos" }, { key: "issues", label: "Issues" }, { key: "archive", label: "Archive" },
] as const;

export default function PulseCreateMeetingPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const people = trpc.pulse.settings.peopleForAdministration.useQuery();
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("monday");
  const [startTime, setStartTime] = useState("09:00");
  const [durationMinutes, setDurationMinutes] = useState("90");
  const [facilitatorId, setFacilitatorId] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [participantIds, setParticipantIds] = useState<number[]>([]);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => Object.fromEntries(sections.map((section) => [section.key, true])));
  const matchingPeople = useMemo(() => (people.data ?? []).filter((person: any) => !participantIds.includes(person.id) && `${person.name} ${person.email}`.toLowerCase().includes(memberSearch.toLowerCase())).slice(0, 10), [people.data, participantIds, memberSearch]);
  const personForId = (personId: number) => (people.data ?? []).find((person: any) => person.id === personId);
  const create = trpc.pulse.l10.createMeeting.useMutation({ onSuccess: async (result) => { await utils.pulse.shell.invalidate(); toast.success("L10 workspace created."); navigate(`/pulse/meetings/${result.id}`); }, onError: (error) => toast.error(error.message) });
  const submit = () => {
    const facilitator = Number(facilitatorId) || undefined;
    const participants = Array.from(new Set([...(facilitator ? [facilitator] : []), ...participantIds]));
    if (!name.trim() || !participants.length) { toast.error("Name the L10 and add at least one participant."); return; }
    create.mutate({ name: name.trim(), purpose: purpose.trim() || null, dayOfWeek: dayOfWeek === "none" ? null : dayOfWeek as any, startTime: startTime || null, durationMinutes: Number(durationMinutes) || 90, facilitatorId: facilitator ?? null, participantIds: participants, sectionsEnabled: enabled as any });
  };
  if (people.isLoading) return <main className="mx-auto max-w-3xl"><Skeleton className="h-96 w-full"/></main>;
  if (people.error) return <main className="mx-auto max-w-3xl"><Card><CardContent className="p-6">This L10 setup page is not available. <Link className="underline" href="/pulse">Return to Pulse</Link>.</CardContent></Card></main>;
  return <main className="mx-auto max-w-3xl space-y-6 pb-10"><header className="border-b border-border pb-5"><Button asChild variant="ghost" className="-ml-3 min-h-11"><Link href="/pulse/settings"><ArrowLeft className="mr-2 h-4 w-4"/>Pulse settings</Link></Button><p className="mt-3 text-sm font-medium text-primary">Pulse · New recurring workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Create a Level 10</h1><p className="mt-2 text-base text-muted-foreground">This creates the recurring L10 type. Every actual meeting will be recorded as a dated session with its own report and outcomes.</p></header><Card><CardHeader><CardTitle>Meeting details</CardTitle><CardDescription>Set the fixed rhythm the EOS method expects.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="new-l10-name">L10 name</Label><Input id="new-l10-name" className="min-h-11 text-base" value={name} onChange={(event) => setName(event.target.value)} placeholder="Leadership Team L10" autoFocus/></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="new-l10-purpose">Purpose</Label><Textarea id="new-l10-purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="What this team will use the L10 to accomplish?"/></div><div className="space-y-2"><Label>Meeting day</Label><Select value={dayOfWeek} onValueChange={setDayOfWeek}><SelectTrigger className="min-h-11"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">No fixed day</SelectItem>{["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((value) => <SelectItem value={value} key={value}>{value.slice(0, 1).toUpperCase() + value.slice(1)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="new-l10-start">Start time</Label><Input id="new-l10-start" type="time" className="min-h-11" value={startTime} onChange={(event) => setStartTime(event.target.value)}/></div><div className="space-y-2"><Label htmlFor="new-l10-duration">Duration (minutes)</Label><Input id="new-l10-duration" type="number" min="15" max="240" className="min-h-11" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)}/></div></CardContent></Card><Card><CardHeader><CardTitle>Facilitator and participants</CardTitle><CardDescription>The facilitator is a meeting label. Pulse permissions—not SavvyOS roles—control authority. Every participant has access only to this L10’s workspace.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label>Facilitator</Label><Select value={facilitatorId} onValueChange={setFacilitatorId}><SelectTrigger className="min-h-11"><SelectValue placeholder="Choose a facilitator"/></SelectTrigger><SelectContent>{(people.data ?? []).map((person: any) => <SelectItem key={person.id} value={String(person.id)}>{person.name ?? person.email}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="new-l10-members">Add participants</Label><Input id="new-l10-members" className="min-h-11" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search people by name or email"/>{memberSearch ? <div className="rounded-xl border">{matchingPeople.length ? matchingPeople.map((person: any) => <button key={person.id} type="button" onClick={() => { setParticipantIds((ids) => [...ids, person.id]); setMemberSearch(""); }} className="flex min-h-11 w-full items-center justify-between border-b px-3 text-left last:border-b-0 hover:bg-muted/60"><span><span className="block font-medium">{person.name ?? person.email}</span><span className="text-xs text-muted-foreground">{person.email}</span></span><Plus className="h-4 w-4 text-primary"/></button>) : <p className="p-3 text-sm text-muted-foreground">No eligible people match.</p>}</div> : null}</div><div className="flex flex-wrap gap-2">{participantIds.map((personId) => <button key={personId} type="button" onClick={() => setParticipantIds((ids) => ids.filter((id) => id !== personId))} className="inline-flex min-h-10 items-center gap-1 rounded-full bg-muted px-3 text-sm font-medium">{personForId(personId)?.name ?? "Participant"}<X className="h-4 w-4"/></button>)}</div></CardContent></Card><Card><CardHeader><CardTitle>Workspace sections</CardTitle><CardDescription>All sections start enabled. You can change the L10’s dashboard tabs and runner sequence at any time.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{sections.map((section) => <label key={section.key} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3"><Checkbox checked={enabled[section.key]} onCheckedChange={(checked) => setEnabled((state) => ({ ...state, [section.key]: Boolean(checked) }))}/><span className="font-medium">{section.label}</span></label>)}</CardContent></Card><div className="flex justify-end"><Button className="min-h-11" disabled={create.isPending} onClick={submit}><Check className="mr-2 h-4 w-4"/>{create.isPending ? "Creating…" : "Create L10 workspace"}</Button></div></main>;
}
