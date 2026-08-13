import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { PulseWorkItemsPanel } from "@/components/PulseWorkItemsPanel";
import { PulseMeetingsPanel } from "@/components/PulseMeetingsPanel";
import { PulseScorecardsStrategyPanel } from "@/components/PulseScorecardsStrategyPanel";
import { PulseCommunicationsPanel } from "@/components/PulseCommunicationsPanel";
import { PulseTeamsDashboardPanel } from "@/components/PulseTeamsDashboardPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Activity, Archive, BarChart3, Bell, CalendarDays, CheckSquare2, CircleUserRound, Clock3, Database, Loader2, Plus, ShieldCheck, UsersRound } from "lucide-react";

const SCOPE_TYPES = ["company", "l10", "team", "one_on_one", "private"] as const;
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function titleForScopeType(type: string) {
  return type === "one_on_one" ? "1:1" : type === "l10" ? "L10" : type.slice(0, 1).toUpperCase() + type.slice(1).replaceAll("_", " ");
}

function IsoStamp({ value }: { value: string | Date }) {
  return <span>{new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>;
}

export default function PulseFoundationPage() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.pulse.getFoundation.useQuery(undefined, { staleTime: 15000 });
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [personDialogOpen, setPersonDialogOpen] = useState(false);
  const [scopeType, setScopeType] = useState<(typeof SCOPE_TYPES)[number]>("l10");
  const [scopeName, setScopeName] = useState("");
  const [scopeDescription, setScopeDescription] = useState("");
  const [ownerPersonId, setOwnerPersonId] = useState("");
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [personName, setPersonName] = useState("");
  const [personEmail, setPersonEmail] = useState("");
  const [calendar, setCalendar] = useState({ timezone: "America/New_York", fiscalYearStartMonth: 1, operatingWeekStartsOn: 1, dueWindowDays: 7 });

  const invalidate = () => {
    utils.pulse.getFoundation.invalidate();
    utils.pulse.visibleScopes.invalidate();
    utils.pulse.getCalendar.invalidate();
  };
  const createScope = trpc.pulse.createScope.useMutation({ onSuccess: () => { toast.success("Scope created with canonical membership"); setScopeDialogOpen(false); setScopeName(""); setScopeDescription(""); setMemberIds([]); invalidate(); }, onError: (e) => toast.error(e.message) });
  const archiveScope = trpc.pulse.archiveScope.useMutation({ onSuccess: () => { toast.success("Scope archived and removed from active Pulse queries"); invalidate(); }, onError: (e) => toast.error(e.message) });
  const createPerson = trpc.pulse.createPerson.useMutation({ onSuccess: () => { toast.success("Person created without requiring a platform account"); setPersonDialogOpen(false); setPersonName(""); setPersonEmail(""); invalidate(); }, onError: (e) => toast.error(e.message) });
  const configureCalendar = trpc.pulse.configureCalendar.useMutation({ onSuccess: () => { toast.success("Calendar service configured"); invalidate(); }, onError: (e) => toast.error(e.message) });

  useEffect(() => {
    if (data?.calendar) {
      setCalendar({
        timezone: data.calendar.timezone,
        fiscalYearStartMonth: data.calendar.fiscalYearStartMonth,
        operatingWeekStartsOn: data.calendar.operatingWeekStartsOn,
        dueWindowDays: data.calendar.dueWindowDays,
      });
    }
  }, [data?.calendar]);

  const people = data?.people ?? [];
  const scopes = data?.scopes ?? [];
  const l10Settings = new Map((data?.l10Settings ?? []).map((setting: any) => [setting.scopeId, setting]));
  const membershipCount = useMemo(() => {
    const counts = new Map<number, number>();
    for (const membership of data?.memberships ?? []) counts.set((membership as any).scopeId, (counts.get((membership as any).scopeId) ?? 0) + 1);
    return counts;
  }, [data?.memberships]);

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="py-16 text-center"><ShieldCheck className="mx-auto h-9 w-9 text-muted-foreground" /><h1 className="mt-3 text-lg font-semibold">Pulse foundation is unavailable</h1><p className="mt-1 text-sm text-muted-foreground">{error.message}</p></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between">
        <div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><Activity className="h-3.5 w-3.5" />Pulse</div><h1 className="mt-1 text-2xl font-semibold tracking-tight">Operating workspace</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Pulse is a standalone workspace: one person/account model, one Scope model, one policy service, one calendar authority, and one append-only event stream. Scope access is active-state first and is never bypassed by an administrative role.</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setPersonDialogOpen(true)}><CircleUserRound className="mr-2 h-4 w-4" />Add person</Button><Button onClick={() => setScopeDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Create scope</Button></div>
      </section>

      <Tabs defaultValue="scopes" className="space-y-5">
        <TabsList className="h-auto max-w-full justify-start gap-1 overflow-x-auto bg-muted/50 p-1"><TabsTrigger value="scopes" className="gap-2"><Database className="h-3.5 w-3.5" />Scopes <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">{scopes.length}</Badge></TabsTrigger><TabsTrigger value="meetings" className="gap-2"><Activity className="h-3.5 w-3.5" />Meetings</TabsTrigger><TabsTrigger value="scorecards" className="gap-2"><BarChart3 className="h-3.5 w-3.5" />Scorecards & strategy</TabsTrigger><TabsTrigger value="teams" className="gap-2"><UsersRound className="h-3.5 w-3.5" />Teams</TabsTrigger><TabsTrigger value="communications" className="gap-2"><Bell className="h-3.5 w-3.5" />Communications</TabsTrigger><TabsTrigger value="work" className="gap-2"><CheckSquare2 className="h-3.5 w-3.5" />Work items</TabsTrigger><TabsTrigger value="people" className="gap-2"><UsersRound className="h-3.5 w-3.5" />People & accounts</TabsTrigger><TabsTrigger value="calendar" className="gap-2"><CalendarDays className="h-3.5 w-3.5" />Calendar service</TabsTrigger><TabsTrigger value="events" className="gap-2"><Activity className="h-3.5 w-3.5" />Event stream</TabsTrigger></TabsList>

        <TabsContent value="scopes" className="mt-0 space-y-4">
          <div className="grid gap-4 md:grid-cols-4"><Card><CardHeader className="pb-2"><CardDescription>Visible active scopes</CardDescription><CardTitle className="text-3xl">{scopes.length}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">The same policy query serves every scope type.</CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>L10 scopes</CardDescription><CardTitle className="text-3xl">{scopes.filter((scope: any) => scope.scopeType === "l10").length}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Meeting cadence attaches to the L10 scope.</CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>Private scopes</CardDescription><CardTitle className="text-3xl">{scopes.filter((scope: any) => scope.scopeType === "private").length}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Owner-only access is a policy, not empty routing.</CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>Archive gate</CardDescription><CardTitle className="text-3xl">Active first</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Archived scopes never enter the visible query.</CardContent></Card></div>
          {scopes.length === 0 ? <Card className="border-dashed"><CardContent className="flex flex-col items-center py-14 text-center"><Database className="h-9 w-9 text-muted-foreground/60" /><h2 className="mt-4 font-semibold">No visible Pulse scopes</h2><p className="mt-1 max-w-lg text-sm text-muted-foreground">Create the first L10, team, 1:1, private, or company scope. It will use the same membership and access policy as every other context.</p><Button className="mt-5" onClick={() => setScopeDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Create first scope</Button></CardContent></Card> : <div className="grid gap-4 lg:grid-cols-2">{scopes.map((scope: any) => { const l10 = l10Settings.get(scope.id) as any; return <Card key={scope.id}><CardHeader className="space-y-3 border-b bg-muted/20"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><CardTitle>{scope.name}</CardTitle><Badge variant="secondary">{titleForScopeType(scope.scopeType)}</Badge></div><CardDescription className="mt-1">{scope.description || "Canonical Pulse scope"}</CardDescription></div><Database className="h-5 w-5 text-primary" /></div><div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground"><span>{scope.membershipPolicy.replaceAll("_", " ")} membership</span><span>·</span><span>{scope.accessPolicy.replaceAll("_", " ")} access</span><span>·</span><span>{membershipCount.get(scope.id) ?? 0} active members</span></div></CardHeader><CardContent className="space-y-3 pt-4">{l10 && <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs"><Clock3 className="mr-1.5 inline h-3.5 w-3.5 text-primary" />{l10.scheduleDay} · {l10.scheduleTime} · {l10.durationMinutes} minutes · {l10.timezone}</div>}<div className="flex justify-end border-t pt-3"><Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => { if (window.confirm(`Archive ${scope.name}? It will disappear before any policy or role check.`)) archiveScope.mutate({ scopeId: scope.id }); }} disabled={archiveScope.isPending}><Archive className="mr-1.5 h-3.5 w-3.5" />Archive</Button></div></CardContent></Card>; })}</div>}
        </TabsContent>

        <TabsContent value="meetings" className="mt-0"><PulseMeetingsPanel /></TabsContent>

        <TabsContent value="scorecards" className="mt-0"><PulseScorecardsStrategyPanel /></TabsContent>

        <TabsContent value="teams" className="mt-0"><PulseTeamsDashboardPanel /></TabsContent>

        <TabsContent value="communications" className="mt-0"><PulseCommunicationsPanel /></TabsContent>

        <TabsContent value="work" className="mt-0"><PulseWorkItemsPanel /></TabsContent>

        <TabsContent value="people" className="mt-0"><Card><CardHeader><CardTitle>People and authenticated accounts</CardTitle><CardDescription>People may participate in Pulse without login. The account column comes from an explicit `pulse_person_accounts` relationship, not from a missing-field convention.</CardDescription></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{people.map((person: any) => <div key={person.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{person.displayName}</p><p className="mt-0.5 text-xs text-muted-foreground">{person.primaryEmail || "No email required"}</p></div><Badge variant={person.accountUserId ? "default" : "secondary"}>{person.accountUserId ? "Account linked" : "Person only"}</Badge></div><p className="mt-3 text-xs text-muted-foreground">{person.isActive ? "Active person" : "Inactive person"}</p></div>)}</CardContent></Card></TabsContent>

        <TabsContent value="calendar" className="mt-0 space-y-4"><Card><CardHeader><CardTitle>Calendar authority</CardTitle><CardDescription>All reporting periods, fiscal years, operating weeks, holidays, and due windows originate in this service. No Pulse page calculates week boundaries itself.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"><div className="space-y-2"><Label>Timezone</Label><Input value={calendar.timezone} onChange={(e) => setCalendar((current) => ({ ...current, timezone: e.target.value }))} placeholder="America/New_York" /></div><div className="space-y-2"><Label>Fiscal year start month</Label><Input type="number" min={1} max={12} value={calendar.fiscalYearStartMonth} onChange={(e) => setCalendar((current) => ({ ...current, fiscalYearStartMonth: Number(e.target.value) || 1 }))} /></div><div className="space-y-2"><Label>Operating week starts</Label><Select value={String(calendar.operatingWeekStartsOn)} onValueChange={(value) => setCalendar((current) => ({ ...current, operatingWeekStartsOn: Number(value) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((name, index) => <SelectItem key={name} value={String(index)}>{name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Due window (days)</Label><Input type="number" min={0} max={90} value={calendar.dueWindowDays} onChange={(e) => setCalendar((current) => ({ ...current, dueWindowDays: Number(e.target.value) || 0 }))} /></div></CardContent><CardContent className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div className="text-sm text-muted-foreground">{data?.calendarSnapshot ? <>Current operating week: <strong>{data.calendarSnapshot.operatingWeekStart}</strong> to <strong>{data.calendarSnapshot.operatingWeekEnd}</strong> · FY {data.calendarSnapshot.fiscalYear} · {data.calendarSnapshot.isHoliday ? "Holiday" : "Business day"}</> : "Configure the calendar to activate canonical period calculations."}</div><Button onClick={() => configureCalendar.mutate(calendar)} disabled={configureCalendar.isPending}>{configureCalendar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save calendar</Button></CardContent></Card></TabsContent>

        <TabsContent value="events" className="mt-0"><Card><CardHeader><CardTitle>Append-only domain event stream</CardTitle><CardDescription>Events carry typed payloads and cannot be updated or deleted at the database level. Scope events disappear with archived scopes because archive is evaluated before event visibility.</CardDescription></CardHeader><CardContent>{(data?.events ?? []).length === 0 ? <p className="py-7 text-center text-sm text-muted-foreground">No events are visible yet. Creating a scope, membership, or calendar setting writes a typed event.</p> : <div className="space-y-2">{(data?.events ?? []).map((event: any) => <div key={event.id} className="flex flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"><div><Badge variant="secondary">{event.eventType.replaceAll("_", " ")}</Badge><code className="ml-2 text-xs text-muted-foreground">{JSON.stringify(event.payload)}</code></div><span className="text-xs text-muted-foreground"><IsoStamp value={event.occurredAt} /></span></div>)}</div>}</CardContent></Card></TabsContent>
      </Tabs>

      <Dialog open={scopeDialogOpen} onOpenChange={setScopeDialogOpen}><DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto"><DialogHeader><DialogTitle>Create canonical Scope</DialogTitle><DialogDescription>All scope types use the same primary container, membership, access policy, archive state, and event provenance. L10 adds cadence configuration without adding another access model.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 md:grid-cols-2"><div className="space-y-2"><Label>Scope type</Label><Select value={scopeType} onValueChange={(value) => setScopeType(value as typeof scopeType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SCOPE_TYPES.map((type) => <SelectItem key={type} value={type}>{titleForScopeType(type)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Name</Label><Input value={scopeName} onChange={(e) => setScopeName(e.target.value)} placeholder={scopeType === "l10" ? "Leadership L10" : scopeType === "one_on_one" ? "Manager · Agent 1:1" : "Operating scope name"} /></div><div className="space-y-2 md:col-span-2"><Label>Description</Label><Textarea value={scopeDescription} onChange={(e) => setScopeDescription(e.target.value)} placeholder="Purpose and operating context" /></div><div className="space-y-2 md:col-span-2"><Label>Owner person</Label><Select value={ownerPersonId} onValueChange={setOwnerPersonId}><SelectTrigger><SelectValue placeholder="Current administrator by default" /></SelectTrigger><SelectContent>{people.filter((person: any) => person.isActive).map((person: any) => <SelectItem key={person.id} value={String(person.id)}>{person.displayName}{person.accountUserId ? " · account linked" : " · person only"}</SelectItem>)}</SelectContent></Select></div></div>{scopeType !== "private" && scopeType !== "company" && <div className="space-y-3 border-t pt-4"><div><Label>Explicit members</Label><p className="mt-1 text-xs text-muted-foreground">Select people, not accounts. Membership resolves identically for L10, team, and 1:1 scopes.</p></div><div className="grid gap-2 sm:grid-cols-2">{people.filter((person: any) => person.isActive).map((person: any) => <label key={person.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><Checkbox checked={memberIds.includes(person.id)} onCheckedChange={(checked) => setMemberIds((current) => checked ? Array.from(new Set([...current, person.id])) : current.filter((id) => id !== person.id))} />{person.displayName}</label>)}</div></div>}{scopeType === "l10" && <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">The L10 will start with the configured default cadence. The same Scope membership will govern meeting management; no facilitator bypass is created.</p>}<DialogFooter><Button variant="outline" onClick={() => setScopeDialogOpen(false)} disabled={createScope.isPending}>Cancel</Button><Button onClick={() => createScope.mutate({ scopeType, name: scopeName, description: scopeDescription || undefined, ownerPersonId: ownerPersonId ? Number(ownerPersonId) : undefined, memberPersonIds: memberIds })} disabled={createScope.isPending || scopeName.trim().length < 2}>{createScope.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Scope</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={personDialogOpen} onOpenChange={setPersonDialogOpen}><DialogContent><DialogHeader><DialogTitle>Add Pulse person</DialogTitle><DialogDescription>This creates a business person that can become a member, owner, assignee, attendee, or recipient without granting a SavvyOS login.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>Name</Label><Input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Jordan Smith" /></div><div className="space-y-2"><Label>Email (optional)</Label><Input value={personEmail} onChange={(e) => setPersonEmail(e.target.value)} placeholder="jordan@example.com" /></div></div><DialogFooter><Button variant="outline" onClick={() => setPersonDialogOpen(false)}>Cancel</Button><Button onClick={() => createPerson.mutate({ displayName: personName, primaryEmail: personEmail || undefined })} disabled={createPerson.isPending || personName.trim().length < 2}>{createPerson.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create person</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
