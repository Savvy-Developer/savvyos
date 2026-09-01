import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CalendarCheck2, CalendarClock, Check, FileText, Link as LinkIcon, Loader2, Plus, Search, TriangleAlert, Users, X } from "lucide-react";

type Production = { t12Volume: number; t12Units: number; underContractVolume: number; underContractUnits: number };
type Splits = { agent: number | null; savvy: number | null; groups: Array<{ name: string; split: number | null }> };
type AgentContext = { agentId: number; agentName: string; agentEmail: string | null; markets: string[]; production: Production; splits: Splits };
type Renewal = {
  id: number;
  agentId: number;
  renewalDate: string;
  status: "scheduled" | "completed";
  meetingDate: string | null;
  completedAt: string | Date | null;
  completedById: number | null;
  completedBy?: string | null;
  attendees: string | null;
  discussionSummary: string | null;
  productionReview: string | null;
  goalsAndCommitments: string | null;
  followUpItems: string | null;
  splitNotes: string | null;
  agreementUrl: string | null;
  agreementName: string | null;
  agreementMimeType: string | null;
};
type UpcomingItem = AgentContext & { renewal: Renewal; isOverdue: boolean };
type HistoryItem = AgentContext & { renewal: Renewal };
type Overview = {
  upcoming: UpcomingItem[];
  missingDates: AgentContext[];
  history: HistoryItem[];
  summary: { due: number; overdue: number; missingDates: number; completedLast12Months: number };
};

type CompletionForm = {
  meetingDate: string;
  attendees: string;
  discussionSummary: string;
  productionReview: string;
  goalsAndCommitments: string;
  followUpItems: string;
  splitNotes: string;
};

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function addDays(days: number): string {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value ?? 0);
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const raw = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  const [year, month, day] = raw.split("-").map(Number);
  if (!year || !month || !day) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(year, month - 1, day));
}

function splitLabel(splits: Splits): string {
  if (splits.agent == null) return "Not set";
  return `Agent ${splits.agent}% · Savvy ${splits.savvy}%`;
}

function marketLabel(markets: string[]): string {
  return markets.length > 0 ? markets.join(" · ") : "No market assigned";
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(event) => onChange(event.target.value)} className="pl-9" placeholder={placeholder} />
    </div>
  );
}

function ProductionCell({ production }: { production: Production }) {
  return (
    <div className="min-w-[190px] space-y-1 text-xs">
      <p><span className="text-muted-foreground">T12:</span> <span className="font-medium text-foreground">{formatCurrency(production.t12Volume)}</span> · {production.t12Units} unit{production.t12Units === 1 ? "" : "s"}</p>
      <p><span className="text-muted-foreground">Under contract:</span> <span className="font-medium text-foreground">{production.underContractUnits}</span> unit{production.underContractUnits === 1 ? "" : "s"} · {formatCurrency(production.underContractVolume)}</p>
    </div>
  );
}

function SplitsCell({ splits }: { splits: Splits }) {
  return (
    <div className="min-w-[180px] space-y-1 text-xs">
      <p className="font-medium text-foreground">{splitLabel(splits)}</p>
      {splits.groups.map((group) => <p className="text-muted-foreground" key={group.name}>{group.name}: {group.split == null ? "split not set" : `${group.split}% leader split`}</p>)}
    </div>
  );
}

function RenewalContext({ item }: { item: AgentContext }) {
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-3">
      <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Market</p><p className="mt-1 font-medium">{marketLabel(item.markets)}</p></div>
      <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">T12 production</p><p className="mt-1 font-medium">{formatCurrency(item.production.t12Volume)} · {item.production.t12Units} units</p><p className="text-xs text-muted-foreground">Under contract: {item.production.underContractUnits} · {formatCurrency(item.production.underContractVolume)}</p></div>
      <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current splits</p><p className="mt-1 font-medium">{splitLabel(item.splits)}</p>{item.splits.groups.map((group) => <p className="text-xs text-muted-foreground" key={group.name}>{group.name}: {group.split == null ? "not set" : `${group.split}% leader split`}</p>)}</div>
    </div>
  );
}

export default function AgentRenewalsPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.agentRenewals.getOverview.useQuery(undefined, { staleTime: 30_000 });
  const overview = (data ?? { upcoming: [], missingDates: [], history: [], summary: { due: 0, overdue: 0, missingDates: 0, completedLast12Months: 0 } }) as Overview;
  const [search, setSearch] = useState("");
  const [completionItem, setCompletionItem] = useState<UpcomingItem | null>(null);
  const [historyItem, setHistoryItem] = useState<HistoryItem | null>(null);
  const [scheduleItem, setScheduleItem] = useState<AgentContext | null>(null);
  const [scheduleDate, setScheduleDate] = useState(addDays(30));
  const [agreementFile, setAgreementFile] = useState<File | null>(null);
  const [isUploadingAgreement, setIsUploadingAgreement] = useState(false);
  const [form, setForm] = useState<CompletionForm>({ meetingDate: localToday(), attendees: "", discussionSummary: "", productionReview: "", goalsAndCommitments: "", followUpItems: "", splitNotes: "" });

  const complete = trpc.agentRenewals.complete.useMutation({
    onSuccess: (result) => {
      toast.success(`Renewal marked done. Next renewal scheduled for ${formatDate(result.nextRenewalDate)}.`);
      setCompletionItem(null);
      setAgreementFile(null);
      void utils.agentRenewals.getOverview.invalidate();
    },
    onError: (error) => toast.error(error.message ?? "Unable to complete renewal"),
  });

  const schedule = trpc.agentRenewals.schedule.useMutation({
    onSuccess: () => {
      toast.success("Renewal date scheduled");
      setScheduleItem(null);
      void utils.agentRenewals.getOverview.invalidate();
    },
    onError: (error) => toast.error(error.message ?? "Unable to schedule renewal"),
  });

  const normalizedSearch = search.trim().toLowerCase();
  const matches = (item: AgentContext) => !normalizedSearch || [item.agentName, item.agentEmail, ...item.markets].filter(Boolean).join(" ").toLowerCase().includes(normalizedSearch);
  const upcoming = useMemo(() => overview.upcoming.filter(matches), [overview.upcoming, normalizedSearch]);
  const missingDates = useMemo(() => overview.missingDates.filter(matches), [overview.missingDates, normalizedSearch]);
  const history = useMemo(() => overview.history.filter(matches), [overview.history, normalizedSearch]);

  const openCompletion = (item: UpcomingItem) => {
    setCompletionItem(item);
    setAgreementFile(null);
    setForm({ meetingDate: localToday(), attendees: "", discussionSummary: "", productionReview: "", goalsAndCommitments: "", followUpItems: "", splitNotes: "" });
  };

  const submitCompletion = async () => {
    if (!completionItem) return;
    if (!form.discussionSummary.trim()) { toast.error("Please summarize what was covered in the renewal meeting."); return; }
    let agreement: { url: string; key: string; name: string; mimeType: string | null } | undefined;
    try {
      if (agreementFile) {
        setIsUploadingAgreement(true);
        const body = new FormData();
        body.append("file", agreementFile);
        const response = await fetch("/api/upload/agent-renewal-agreement", { method: "POST", body, credentials: "include" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Agreement upload failed");
        agreement = { url: payload.fileUrl, key: payload.fileKey, name: payload.fileName, mimeType: payload.mimeType ?? null };
      }
      complete.mutate({ renewalId: completionItem.renewal.id, ...form, agreement });
    } catch (error: any) {
      toast.error(error?.message ?? "Agreement upload failed");
    } finally {
      setIsUploadingAgreement(false);
    }
  };

  const isCompleting = complete.isPending || isUploadingAgreement;

  return (
    <main className="mx-auto max-w-[1500px] space-y-6 pb-10">
      <section className="rounded-2xl border bg-gradient-to-br from-sky-50 via-background to-background p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-primary"><CalendarCheck2 className="h-5 w-5" /><span className="text-sm font-semibold">Agent Success</span></div>
            <h1 className="text-3xl font-bold tracking-tight">Agent Renewals</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Keep annual agent renewals on track, review live T12 production and current splits, and retain a clear record of every completed meeting.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/agent-directory")} className="w-fit"><Users className="mr-2 h-4 w-4" />Agent Directory</Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-sky-100 p-2 text-sky-700"><CalendarClock className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{overview.summary.due}</p><p className="text-xs text-muted-foreground">Scheduled renewals</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-red-100 p-2 text-red-700"><TriangleAlert className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{overview.summary.overdue}</p><p className="text-xs text-muted-foreground">Overdue</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-amber-100 p-2 text-amber-700"><CalendarClock className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{overview.summary.missingDates}</p><p className="text-xs text-muted-foreground">Need a renewal date</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-emerald-100 p-2 text-emerald-700"><Check className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{overview.summary.completedLast12Months}</p><p className="text-xs text-muted-foreground">Completed in 12 months</p></div></CardContent></Card>
      </section>

      <Tabs defaultValue="upcoming" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="w-full sm:w-auto"><TabsTrigger value="upcoming" className="flex-1 sm:flex-none">Upcoming <span className="ml-1 text-xs text-muted-foreground">({overview.summary.due})</span></TabsTrigger><TabsTrigger value="missing" className="flex-1 sm:flex-none">No date <span className="ml-1 text-xs text-muted-foreground">({overview.summary.missingDates})</span></TabsTrigger><TabsTrigger value="history" className="flex-1 sm:flex-none">History <span className="ml-1 text-xs text-muted-foreground">({overview.summary.completedLast12Months})</span></TabsTrigger></TabsList>
          <SearchInput value={search} onChange={setSearch} placeholder="Search agent or market…" />
        </div>

        <TabsContent value="upcoming" className="mt-0">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Upcoming and overdue renewals</CardTitle><p className="text-sm text-muted-foreground">Overdue meetings stay here until an administrator completes the renewal form.</p></CardHeader>
            <CardContent className="p-0">
              {isLoading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading renewals…</div> : upcoming.length === 0 ? <div className="py-14 text-center text-sm text-muted-foreground"><CalendarCheck2 className="mx-auto mb-3 h-9 w-9 opacity-35" /><p>No scheduled renewals match the current search.</p></div> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>Renewal date</TableHead><TableHead>Market</TableHead><TableHead>T12 production / current under contract</TableHead><TableHead>Current splits</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>{upcoming.map((item) => <TableRow key={item.renewal.id} className={item.isOverdue ? "bg-red-50/45 hover:bg-red-50/65" : ""}>
                    <TableCell><div><p className="font-medium">{item.agentName}</p>{item.agentEmail && <p className="text-xs text-muted-foreground">{item.agentEmail}</p>}</div></TableCell>
                    <TableCell><div className="flex flex-col items-start gap-1"><span className="font-medium">{formatDate(item.renewal.renewalDate)}</span>{item.isOverdue ? <Badge variant="destructive">Overdue</Badge> : <Badge variant="outline">Scheduled</Badge>}</div></TableCell>
                    <TableCell className="max-w-[180px] whitespace-normal text-sm text-muted-foreground">{marketLabel(item.markets)}</TableCell>
                    <TableCell><ProductionCell production={item.production} /></TableCell>
                    <TableCell><SplitsCell splits={item.splits} /></TableCell>
                    <TableCell className="text-right"><Button size="sm" onClick={() => openCompletion(item)}><Check className="mr-1.5 h-4 w-4" />Done</Button></TableCell>
                  </TableRow>)}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="missing" className="mt-0">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Agents without a renewal date</CardTitle><p className="text-sm text-muted-foreground">Set the first renewal date for each agent listed here. Future annual renewals will be scheduled automatically once a meeting is completed.</p></CardHeader>
            <CardContent className="p-0">
              {isLoading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading agents…</div> : missingDates.length === 0 ? <div className="py-14 text-center text-sm text-muted-foreground"><Check className="mx-auto mb-3 h-9 w-9 opacity-35" /><p>Every active agent has a renewal date.</p></div> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>Market</TableHead><TableHead>T12 production / current under contract</TableHead><TableHead>Current splits</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>{missingDates.map((item) => <TableRow key={item.agentId}>
                    <TableCell><div><p className="font-medium">{item.agentName}</p>{item.agentEmail && <p className="text-xs text-muted-foreground">{item.agentEmail}</p>}</div></TableCell>
                    <TableCell className="max-w-[180px] whitespace-normal text-sm text-muted-foreground">{marketLabel(item.markets)}</TableCell>
                    <TableCell><ProductionCell production={item.production} /></TableCell>
                    <TableCell><SplitsCell splits={item.splits} /></TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => { setScheduleItem(item); setScheduleDate(addDays(30)); }}><Plus className="mr-1.5 h-4 w-4" />Set date</Button></TableCell>
                  </TableRow>)}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-0">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Completed renewal history</CardTitle><p className="text-sm text-muted-foreground">Renewals completed in the previous 12 months, including submitted meeting notes and any agreement.</p></CardHeader>
            <CardContent className="p-0">
              {isLoading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading history…</div> : history.length === 0 ? <div className="py-14 text-center text-sm text-muted-foreground"><FileText className="mx-auto mb-3 h-9 w-9 opacity-35" /><p>No renewals have been completed in the last 12 months.</p></div> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>Meeting date</TableHead><TableHead>Completed by</TableHead><TableHead>Market</TableHead><TableHead>Agreement</TableHead><TableHead className="text-right">Record</TableHead></TableRow></TableHeader>
                  <TableBody>{history.map((item) => <TableRow key={item.renewal.id}>
                    <TableCell><p className="font-medium">{item.agentName}</p></TableCell>
                    <TableCell>{formatDate(item.renewal.meetingDate ?? item.renewal.completedAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{item.renewal.completedBy ?? "—"}</TableCell>
                    <TableCell className="max-w-[220px] whitespace-normal text-sm text-muted-foreground">{marketLabel(item.markets)}</TableCell>
                    <TableCell>{item.renewal.agreementUrl ? <a className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" href={item.renewal.agreementUrl} target="_blank" rel="noreferrer"><LinkIcon className="h-3.5 w-3.5" />{item.renewal.agreementName ?? "View agreement"}</a> : <span className="text-muted-foreground">None</span>}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => setHistoryItem(item)}>View</Button></TableCell>
                  </TableRow>)}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={completionItem != null} onOpenChange={(open) => { if (!open && !isCompleting) setCompletionItem(null); }}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Complete renewal — {completionItem?.agentName}</DialogTitle><DialogDescription>Save the renewal conversation. This marks the meeting done and automatically adds the next annual renewal to the queue.</DialogDescription></DialogHeader>
          {completionItem && <div className="space-y-5">
            <RenewalContext item={completionItem} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="renewal-meeting-date">Meeting date *</Label><Input id="renewal-meeting-date" type="date" value={form.meetingDate} onChange={(event) => setForm((current) => ({ ...current, meetingDate: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="renewal-attendees">Attendees</Label><Input id="renewal-attendees" value={form.attendees} onChange={(event) => setForm((current) => ({ ...current, attendees: event.target.value }))} placeholder="e.g., Agent, team leader, coach" /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="renewal-summary">What was covered? *</Label><Textarea id="renewal-summary" value={form.discussionSummary} onChange={(event) => setForm((current) => ({ ...current, discussionSummary: event.target.value }))} placeholder="Summarize the renewal conversation, decisions, and important context." rows={4} /></div>
            <div className="space-y-2"><Label htmlFor="renewal-production">Production review</Label><Textarea id="renewal-production" value={form.productionReview} onChange={(event) => setForm((current) => ({ ...current, productionReview: event.target.value }))} placeholder="Performance trends, production discussion, and pipeline context." rows={3} /></div>
            <div className="space-y-2"><Label htmlFor="renewal-goals">Goals and commitments</Label><Textarea id="renewal-goals" value={form.goalsAndCommitments} onChange={(event) => setForm((current) => ({ ...current, goalsAndCommitments: event.target.value }))} placeholder="Agreed goals, targets, or commitments for the next renewal period." rows={3} /></div>
            <div className="space-y-2"><Label htmlFor="renewal-follow-up">Follow-up items</Label><Textarea id="renewal-follow-up" value={form.followUpItems} onChange={(event) => setForm((current) => ({ ...current, followUpItems: event.target.value }))} placeholder="Owners and deadlines for anything that needs follow-up." rows={3} /></div>
            <div className="space-y-2"><Label htmlFor="renewal-splits">Split notes</Label><Textarea id="renewal-splits" value={form.splitNotes} onChange={(event) => setForm((current) => ({ ...current, splitNotes: event.target.value }))} placeholder="Note any split review, changes, or confirmation." rows={2} /></div>
            <div className="space-y-2"><Label htmlFor="renewal-agreement">New agreement (optional)</Label><Input id="renewal-agreement" type="file" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp" onChange={(event) => setAgreementFile(event.target.files?.[0] ?? null)} />{agreementFile && <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm"><span className="truncate">{agreementFile.name}</span><Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAgreementFile(null)} aria-label="Remove agreement"><X className="h-4 w-4" /></Button></div>}<p className="text-xs text-muted-foreground">PDF, Word, text, or image files up to 16 MB.</p></div>
          </div>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setCompletionItem(null)} disabled={isCompleting}>Cancel</Button><Button type="button" onClick={() => void submitCompletion()} disabled={isCompleting}>{isCompleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Mark Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleItem != null} onOpenChange={(open) => { if (!open && !schedule.isPending) setScheduleItem(null); }}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Set renewal date — {scheduleItem?.agentName}</DialogTitle><DialogDescription>This creates the initial renewal record for this agent.</DialogDescription></DialogHeader>{scheduleItem && <div className="space-y-5"><RenewalContext item={scheduleItem} /><div className="space-y-2"><Label htmlFor="initial-renewal-date">Renewal date</Label><Input id="initial-renewal-date" type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} /></div></div>}<DialogFooter><Button type="button" variant="outline" onClick={() => setScheduleItem(null)} disabled={schedule.isPending}>Cancel</Button><Button type="button" disabled={schedule.isPending || !scheduleDate} onClick={() => scheduleItem && schedule.mutate({ agentId: scheduleItem.agentId, renewalDate: scheduleDate })}>{schedule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save date</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={historyItem != null} onOpenChange={(open) => !open && setHistoryItem(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Renewal record — {historyItem?.agentName}</DialogTitle><DialogDescription>Completed {formatDate(historyItem?.renewal.meetingDate ?? historyItem?.renewal.completedAt)}{historyItem?.renewal.completedBy ? ` by ${historyItem.renewal.completedBy}` : ""}.</DialogDescription></DialogHeader>{historyItem && <div className="space-y-5"><RenewalContext item={historyItem} /><DetailSection title="Attendees" value={historyItem.renewal.attendees} /><DetailSection title="What was covered" value={historyItem.renewal.discussionSummary} /><DetailSection title="Production review" value={historyItem.renewal.productionReview} /><DetailSection title="Goals and commitments" value={historyItem.renewal.goalsAndCommitments} /><DetailSection title="Follow-up items" value={historyItem.renewal.followUpItems} /><DetailSection title="Split notes" value={historyItem.renewal.splitNotes} />{historyItem.renewal.agreementUrl && <div><p className="mb-1 text-sm font-medium">Agreement</p><a className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" href={historyItem.renewal.agreementUrl} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" />{historyItem.renewal.agreementName ?? "Open agreement"}</a></div>}</div>}</DialogContent>
      </Dialog>
    </main>
  );
}

function DetailSection({ title, value }: { title: string; value: string | null | undefined }) {
  if (!value) return null;
  return <div><p className="mb-1 text-sm font-medium">{title}</p><p className="whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">{value}</p></div>;
}
