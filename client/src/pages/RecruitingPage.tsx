import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, CheckCircle2, Clock3, Filter, Loader2, Plus, Search, Settings2, Users } from "lucide-react";
import { toast } from "sonner";

const NONE = "__none__";
const defaultCreate = { firstName: "", lastName: "", email: "", phone: "", currentBrokerage: "", primaryMarketText: "", source: "", nextAction: "", nextFollowUpAt: "" };

function shortDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function relativeFollowUp(value: string | Date | null | undefined) {
  if (!value) return "No follow-up";
  const date = new Date(value);
  const today = new Date();
  const day = 24 * 60 * 60 * 1000;
  const difference = Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / day);
  if (difference < 0) return `Overdue ${Math.abs(difference)}d`;
  if (difference === 0) return "Due today";
  if (difference === 1) return "Due tomorrow";
  return shortDate(date);
}

function CalendarSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const settings = trpc.recruiting.calendarSettings.useQuery(undefined, { enabled: open });
  const update = trpc.recruiting.updateCalendarSettings.useMutation({ onSuccess: () => { utils.recruiting.calendarSettings.invalidate(); toast.success("Recruiting availability saved."); } });
  const [draft, setDraft] = useState<any>(null);
  const source = settings.data?.settings;
  const state = draft ?? source;
  const initialize = () => { if (source) setDraft({ ...source, workingHours: source.workingHours ?? {} }); };
  const save = async () => {
    if (!state) return;
    try {
      await update.mutateAsync({
        meetingDurationMinutes: Number(state.meetingDurationMinutes), timezone: state.timezone,
        workingHours: state.workingHours, bufferBeforeMinutes: Number(state.bufferBeforeMinutes), bufferAfterMinutes: Number(state.bufferAfterMinutes),
        minimumNoticeHours: Number(state.minimumNoticeHours), conflictCalendarIds: state.conflictCalendarIds ?? [],
      });
      setDraft(null);
    } catch (error: any) { toast.error(error.message || "Could not save availability."); }
  };
  return <Dialog open={open} onOpenChange={value => { onOpenChange(value); if (value) initialize(); }}>
    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>My recruiting calendar</DialogTitle><DialogDescription>Connect your Google Calendar and set the hours SavvyOS may offer for your recruiting conversations.</DialogDescription></DialogHeader>
      {settings.isLoading || !state ? <div className="flex h-52 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : <div className="space-y-6">
        <div className={`rounded-xl border p-4 ${settings.data?.connection?.status === "connected" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{settings.data?.connection?.status === "connected" ? "Google Calendar connected" : "Google Calendar not connected"}</p><p className="mt-1 text-sm text-muted-foreground">{settings.data?.connection?.status === "connected" ? `Connected as ${settings.data.connection.connectedEmail || "your Google account"}.` : "A Google Calendar connection is required before SavvyOS can confirm public recruiting appointments."}</p></div>{settings.data?.configured ? <Button variant="outline" onClick={() => window.location.assign("/api/calendar/google/connect")}>{settings.data?.connection?.status === "connected" ? "Reconnect" : "Connect Google Calendar"}</Button> : <Badge variant="outline">Calendar setup pending</Badge>}</div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3"><div><Label>Meeting length</Label><Select value={String(state.meetingDurationMinutes)} onValueChange={value => setDraft({ ...state, meetingDurationMinutes: Number(value) })}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{[15, 30, 45, 60].map(value => <SelectItem key={value} value={String(value)}>{value} minutes</SelectItem>)}</SelectContent></Select></div><div><Label>Buffer before</Label><Input className="mt-1.5" type="number" min="0" max="120" value={state.bufferBeforeMinutes} onChange={event => setDraft({ ...state, bufferBeforeMinutes: event.target.value })} /></div><div><Label>Buffer after</Label><Input className="mt-1.5" type="number" min="0" max="120" value={state.bufferAfterMinutes} onChange={event => setDraft({ ...state, bufferAfterMinutes: event.target.value })} /></div><div><Label>Minimum notice (hours)</Label><Input className="mt-1.5" type="number" min="0" max="168" value={state.minimumNoticeHours} onChange={event => setDraft({ ...state, minimumNoticeHours: event.target.value })} /></div><div className="sm:col-span-2"><Label>Calendar timezone</Label><Input className="mt-1.5" value={state.timezone} onChange={event => setDraft({ ...state, timezone: event.target.value })} placeholder="America/New_York" /></div></div>
        <div><Label>Working hours</Label><div className="mt-2 divide-y rounded-xl border">{Object.entries(state.workingHours || {}).map(([day, window]: [string, any]) => <div className="grid grid-cols-[110px_1fr_1fr] items-center gap-3 p-3" key={day}><div className="flex items-center gap-2"><Switch checked={window.enabled} onCheckedChange={enabled => setDraft({ ...state, workingHours: { ...state.workingHours, [day]: { ...window, enabled } } })} /><span className="capitalize text-sm font-medium">{day}</span></div><Input type="time" disabled={!window.enabled} value={window.start} onChange={event => setDraft({ ...state, workingHours: { ...state.workingHours, [day]: { ...window, start: event.target.value } } })} /><Input type="time" disabled={!window.enabled} value={window.end} onChange={event => setDraft({ ...state, workingHours: { ...state.workingHours, [day]: { ...window, end: event.target.value } } })} /></div>)}</div></div>
        {settings.data?.calendars?.length ? <div><Label>Calendars checked for conflicts</Label><p className="mt-1 text-xs text-muted-foreground">Leave all unchecked to use your primary calendar only.</p><div className="mt-2 space-y-2">{settings.data.calendars.map(calendar => { const checked = (state.conflictCalendarIds ?? []).includes(calendar.id); return <label key={calendar.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} onChange={event => setDraft({ ...state, conflictCalendarIds: event.target.checked ? [...(state.conflictCalendarIds ?? []), calendar.id] : (state.conflictCalendarIds ?? []).filter((id: string) => id !== calendar.id) })} />{calendar.summary}{calendar.primary ? " (primary)" : ""}</label>; })}</div></div> : null}
      </div>}
      <DialogFooter><Button onClick={save} disabled={settings.isLoading || update.isPending}>{update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save availability</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export default function RecruitingPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const bootstrap = trpc.recruiting.bootstrap.useQuery();
  const [filters, setFilters] = useState({ search: "", ownerId: NONE, stageId: NONE, marketId: NONE, source: NONE, overdueOnly: false, todayOnly: false, missingNextStep: false });
  const list = trpc.recruiting.list.useQuery({
    search: filters.search || undefined, ownerId: filters.ownerId === NONE ? undefined : Number(filters.ownerId), stageId: filters.stageId === NONE ? undefined : Number(filters.stageId),
    marketId: filters.marketId === NONE ? undefined : Number(filters.marketId), source: filters.source === NONE ? undefined : filters.source,
    overdueOnly: filters.overdueOnly, todayOnly: filters.todayOnly, missingNextStep: filters.missingNextStep,
  });
  const create = trpc.recruiting.create.useMutation({ onSuccess: async data => { await utils.recruiting.list.invalidate(); navigate(`/recruiting/${data.id}`); } });
  const saveStage = trpc.recruiting.saveStage.useMutation({ onSuccess: () => { utils.recruiting.bootstrap.invalidate(); toast.success("Stage saved."); } });
  const [createOpen, setCreateOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [form, setForm] = useState(defaultCreate);
  const [stageDrafts, setStageDrafts] = useState<Record<number, any>>({});

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await create.mutateAsync({ ...form, email: form.email || null, phone: form.phone || null, currentBrokerage: form.currentBrokerage || null, primaryMarketText: form.primaryMarketText || null, source: form.source || null, nextAction: form.nextAction || null, nextFollowUpAt: form.nextFollowUpAt ? new Date(`${form.nextFollowUpAt}T12:00:00`) : null });
    } catch (error: any) { toast.error(error.message || "Could not create recruit."); }
  };
  const stages = bootstrap.data?.stages ?? [];
  const activeFilterCount = [filters.ownerId, filters.stageId, filters.marketId, filters.source].filter(value => value !== NONE).length + Number(filters.overdueOnly) + Number(filters.todayOnly) + Number(filters.missingNextStep);
  const sourceOptions = useMemo(() => list.data?.sources ?? [], [list.data?.sources]);

  return <div className="mx-auto max-w-[1550px] space-y-6 p-5 sm:p-7">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Agent growth</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Recruiting</h1><p className="mt-1 text-sm text-muted-foreground">A clean workspace for every future agent relationship, next step, and conversation.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setCalendarOpen(true)}><CalendarDays className="mr-2 h-4 w-4" />My booking calendar</Button><Button onClick={() => { setForm(defaultCreate); setCreateOpen(true); }}><Plus className="mr-2 h-4 w-4" />Add recruit</Button></div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ["Active recruits", list.data?.summary.total ?? 0, "text-slate-900", () => setFilters({ ...filters, overdueOnly: false, todayOnly: false, missingNextStep: false })],
      ["Overdue follow-ups", list.data?.summary.overdue ?? 0, "text-red-600", () => setFilters({ ...filters, overdueOnly: !filters.overdueOnly, todayOnly: false, missingNextStep: false })],
      ["Due today", list.data?.summary.today ?? 0, "text-amber-600", () => setFilters({ ...filters, todayOnly: !filters.todayOnly, overdueOnly: false, missingNextStep: false })],
      ["Missing next step", list.data?.summary.missingNextStep ?? 0, "text-violet-700", () => setFilters({ ...filters, missingNextStep: !filters.missingNextStep, overdueOnly: false, todayOnly: false })],
    ].map(([label, value, className, onClick]: any) => <Card key={label} className="cursor-pointer transition-shadow hover:shadow-md" onClick={onClick}><CardContent className="p-5"><p className="text-3xl font-bold tracking-tight"><span className={className}>{value}</span></p><p className="mt-1 text-sm text-muted-foreground">{label}</p></CardContent></Card>)}</div>
    <Card><CardContent className="p-4"><div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_repeat(4,minmax(130px,0.45fr))_auto]"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search name, email, brokerage, market…" value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} /></div><Select value={filters.ownerId} onValueChange={value => setFilters({ ...filters, ownerId: value })}><SelectTrigger><SelectValue placeholder="All owners" /></SelectTrigger><SelectContent><SelectItem value={NONE}>All owners</SelectItem>{bootstrap.data?.admins.map(admin => <SelectItem key={admin.id} value={String(admin.id)}>{admin.name || admin.email}</SelectItem>)}</SelectContent></Select><Select value={filters.stageId} onValueChange={value => setFilters({ ...filters, stageId: value })}><SelectTrigger><SelectValue placeholder="All stages" /></SelectTrigger><SelectContent><SelectItem value={NONE}>All stages</SelectItem>{stages.filter(stage => stage.isActive).map(stage => <SelectItem key={stage.id} value={String(stage.id)}>{stage.name}</SelectItem>)}</SelectContent></Select><Select value={filters.marketId} onValueChange={value => setFilters({ ...filters, marketId: value })}><SelectTrigger><SelectValue placeholder="All markets" /></SelectTrigger><SelectContent><SelectItem value={NONE}>All markets</SelectItem>{bootstrap.data?.markets.map(market => <SelectItem key={market.id} value={String(market.id)}>{market.name}</SelectItem>)}</SelectContent></Select><Select value={filters.source} onValueChange={value => setFilters({ ...filters, source: value })}><SelectTrigger><SelectValue placeholder="All sources" /></SelectTrigger><SelectContent><SelectItem value={NONE}>All sources</SelectItem>{sourceOptions.map(source => <SelectItem key={source} value={source}>{source}</SelectItem>)}</SelectContent></Select><Button variant="outline" onClick={() => setFilters({ search: "", ownerId: NONE, stageId: NONE, marketId: NONE, source: NONE, overdueOnly: false, todayOnly: false, missingNextStep: false })}><Filter className="mr-2 h-4 w-4" />{activeFilterCount ? `Clear ${activeFilterCount}` : "Filters"}</Button></div></CardContent></Card>
    <Card className="overflow-hidden"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold">Recruiting list</h2><p className="text-sm text-muted-foreground">{list.data?.rows.length ?? 0} matching records</p></div><Button size="sm" variant="ghost" onClick={() => setStagesOpen(true)}><Settings2 className="mr-2 h-4 w-4" />Pipeline stages</Button></div><div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Recruit</th><th className="px-4 py-3 font-medium">Market / brokerage</th><th className="px-4 py-3 font-medium">Owner</th><th className="px-4 py-3 font-medium">Stage</th><th className="px-4 py-3 font-medium">Production</th><th className="px-4 py-3 font-medium">Last contact</th><th className="px-4 py-3 font-medium">Next follow-up</th></tr></thead><tbody>{list.isLoading ? <tr><td colSpan={7} className="px-5 py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></td></tr> : list.data?.rows.length ? list.data.rows.map(({ recruit, owner, stage, market }: any) => <tr key={recruit.id} onClick={() => navigate(`/recruiting/${recruit.id}`)} className="cursor-pointer border-t transition-colors hover:bg-muted/50"><td className="px-5 py-4"><p className="font-semibold">{recruit.firstName} {recruit.lastName}</p><p className="mt-0.5 text-xs text-muted-foreground">{recruit.email || recruit.phone || "No contact details"}</p></td><td className="px-4 py-4"><p>{market?.name || recruit.primaryMarketText || "—"}</p><p className="mt-0.5 text-xs text-muted-foreground">{recruit.currentBrokerage || "No brokerage"}</p></td><td className="px-4 py-4">{owner?.name || "—"}</td><td className="px-4 py-4"><Badge variant="secondary">{stage?.name || "—"}</Badge></td><td className="px-4 py-4">{recruit.transactionCount != null || recruit.salesVolume != null ? <><p>{recruit.transactionCount != null ? `${recruit.transactionCount} txns` : ""}{recruit.transactionCount != null && recruit.salesVolume != null ? " · " : ""}{recruit.salesVolume != null ? `$${Number(recruit.salesVolume).toLocaleString()}` : ""}</p><p className="text-xs text-muted-foreground">{recruit.productionPeriod || "Period unknown"}</p></> : <span className="text-muted-foreground">Unknown</span>}</td><td className="px-4 py-4">{shortDate(recruit.lastContactAt)}</td><td className="px-4 py-4"><span className={recruit.nextFollowUpAt && new Date(recruit.nextFollowUpAt) < new Date() ? "font-semibold text-red-600" : ""}>{relativeFollowUp(recruit.nextFollowUpAt)}</span><p className="mt-0.5 max-w-44 truncate text-xs text-muted-foreground">{recruit.nextAction || ""}</p></td></tr>) : <tr><td colSpan={7} className="px-5 py-16 text-center text-muted-foreground"><Users className="mx-auto mb-3 h-8 w-8 opacity-40" /><p>No recruits match these filters.</p></td></tr>}</tbody></table></div></Card>
    <CalendarSettingsDialog open={calendarOpen} onOpenChange={setCalendarOpen} />
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Add recruit</DialogTitle><DialogDescription>Creating this record does not create a Savvy agent login, contact, or lead-routing record.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={submitCreate}><div className="grid gap-4 sm:grid-cols-2"><div><Label>First name</Label><Input className="mt-1.5" required value={form.firstName} onChange={event => setForm({ ...form, firstName: event.target.value })} /></div><div><Label>Last name</Label><Input className="mt-1.5" required value={form.lastName} onChange={event => setForm({ ...form, lastName: event.target.value })} /></div><div><Label>Email</Label><Input className="mt-1.5" type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></div><div><Label>Phone</Label><Input className="mt-1.5" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></div><div><Label>Current brokerage</Label><Input className="mt-1.5" value={form.currentBrokerage} onChange={event => setForm({ ...form, currentBrokerage: event.target.value })} /></div><div><Label>Primary market</Label><Input className="mt-1.5" value={form.primaryMarketText} onChange={event => setForm({ ...form, primaryMarketText: event.target.value })} /></div><div><Label>Source / referral</Label><Input className="mt-1.5" value={form.source} onChange={event => setForm({ ...form, source: event.target.value })} /></div><div><Label>Next follow-up</Label><Input className="mt-1.5" type="date" value={form.nextFollowUpAt} onChange={event => setForm({ ...form, nextFollowUpAt: event.target.value })} /></div><div className="sm:col-span-2"><Label>Next action</Label><Input className="mt-1.5" value={form.nextAction} onChange={event => setForm({ ...form, nextAction: event.target.value })} placeholder="e.g. Send brokerage overview" /></div></div><DialogFooter><Button type="submit" disabled={create.isPending}>{create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create recruit</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={stagesOpen} onOpenChange={setStagesOpen}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Recruiting pipeline stages</DialogTitle><DialogDescription>Adjust the labels, order, or active status without changing recruiting history.</DialogDescription></DialogHeader><div className="space-y-3">{stages.map(stage => { const draft = stageDrafts[stage.id] ?? stage; return <div key={stage.id} className="grid grid-cols-[1fr_70px_auto_auto] items-center gap-2 rounded-xl border p-3"><Input value={draft.name} onChange={event => setStageDrafts({ ...stageDrafts, [stage.id]: { ...draft, name: event.target.value } })} /><Input type="number" value={draft.position} onChange={event => setStageDrafts({ ...stageDrafts, [stage.id]: { ...draft, position: Number(event.target.value) } })} /><label className="flex items-center gap-1 text-xs"><Switch checked={draft.isActive} onCheckedChange={isActive => setStageDrafts({ ...stageDrafts, [stage.id]: { ...draft, isActive } })} />Active</label><Button size="sm" variant="outline" disabled={saveStage.isPending} onClick={() => saveStage.mutate({ id: stage.id, name: draft.name, position: Number(draft.position), isActive: draft.isActive, isClosed: draft.isClosed })}>Save</Button></div>; })}</div></DialogContent></Dialog>
  </div>;
}
