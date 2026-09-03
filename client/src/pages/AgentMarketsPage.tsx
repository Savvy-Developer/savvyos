import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, Bot, CheckCircle2, ChevronRight, CircleAlert, FileText, Loader2, MapPinned, Plus, RefreshCw, Trash2, Upload, Users } from "lucide-react";

const EMPTY = "__empty__";

type MarketForm = {
  name: string;
  state: string;
  region: string;
  status: "active" | "recruiting" | "paused" | "future";
  annualGciGoal: string;
};

const blankMarket: MarketForm = { name: "", state: "", region: "", status: "active", annualGciGoal: "" };

function asMarketForm(market: any): MarketForm {
  return {
    name: market?.name ?? "",
    state: market?.state ?? "",
    region: market?.region ?? "",
    status: market?.status ?? "active",
    annualGciGoal: market?.annualGciGoal == null ? "" : String(market.annualGciGoal),
  };
}

function relativeTime(value?: string | Date | null) {
  if (!value) return "Not generated yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not generated yet";
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;
  return date.toLocaleDateString();
}

function amount(value: string | number | null | undefined) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "No goal set";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(numeric);
}

function statusStyle(status?: string | null) {
  if (status === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function statusLabel(status?: string | null) {
  if (status === "ready") return "Current";
  if (status === "failed") return "Needs attention";
  return "Refreshing";
}

async function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",", 2)[1] : result);
    };
    reader.readAsDataURL(file);
  });
}

function SectionList({ title, items, empty }: { title: string; items?: string[]; empty: string }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {items?.length ? <ul className="space-y-2 text-sm text-muted-foreground">{items.map((item, index) => <li className="flex gap-2" key={`${item}-${index}`}><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{item}</li>)}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
}

export default function AgentMarketsPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: markets = [], isLoading: marketsLoading } = trpc.agentMarkets.list.useQuery();
  const { data: assignableAgents = [] } = trpc.agentMarkets.listAssignableAgents.useQuery();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [marketDialogOpen, setMarketDialogOpen] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [marketForm, setMarketForm] = useState<MarketForm>(blankMarket);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [agentToAssign, setAgentToAssign] = useState(EMPTY);
  const [assignmentPrimary, setAssignmentPrimary] = useState(false);
  const [assignmentAvailable, setAssignmentAvailable] = useState(true);
  const [assignmentNotes, setAssignmentNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedId && markets.length) setSelectedId(markets[0].id);
    if (selectedId && !markets.some((market: any) => market.id === selectedId)) setSelectedId(markets[0]?.id ?? null);
  }, [markets, selectedId]);

  const selectedMarket = useMemo(() => markets.find((market: any) => market.id === selectedId) ?? null, [markets, selectedId]);
  const detail = trpc.agentMarkets.get.useQuery({ marketId: selectedId ?? 0 }, {
    enabled: Boolean(selectedId),
    refetchInterval: selectedMarket?.intelligenceStatus === "refreshing" ? 5_000 : false,
  });

  const createMarket = trpc.agentMarkets.create.useMutation({
    onSuccess: async ({ id }) => {
      await utils.agentMarkets.list.invalidate();
      setSelectedId(id);
      setMarketDialogOpen(false);
      toast.success("Agent Market created. Its first profile is being built.");
    },
    onError: error => toast.error(error.message),
  });
  const updateMarket = trpc.agentMarkets.update.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.agentMarkets.list.invalidate(), detail.refetch()]);
      toast.success("Market details saved and its profile is refreshing.");
    },
    onError: error => toast.error(error.message),
  });
  const addNote = trpc.agentMarkets.addNote.useMutation({
    onSuccess: async () => {
      setNoteDialogOpen(false); setNoteTitle(""); setNoteContent("");
      await Promise.all([utils.agentMarkets.list.invalidate(), detail.refetch()]);
      toast.success("Research note added. The market profile is refreshing.");
    },
    onError: error => toast.error(error.message),
  });
  const uploadSource = trpc.agentMarkets.uploadSource.useMutation({
    onSuccess: async ({ extractionStatus }) => {
      await Promise.all([utils.agentMarkets.list.invalidate(), detail.refetch()]);
      toast.success(extractionStatus === "ready" ? "Source added and profile refresh started." : "Source saved. Add a research note for text the file could not extract.");
    },
    onError: error => toast.error(error.message),
  });
  const deleteSource = trpc.agentMarkets.deleteSource.useMutation({
    onSuccess: async () => { await Promise.all([utils.agentMarkets.list.invalidate(), detail.refetch()]); toast.success("Source removed and profile refresh started."); },
    onError: error => toast.error(error.message),
  });
  const refresh = trpc.agentMarkets.refresh.useMutation({
    onSuccess: async () => { await Promise.all([utils.agentMarkets.list.invalidate(), detail.refetch()]); toast.success("Profile refresh requested."); },
    onError: error => toast.error(error.message),
  });
  const upsertAssignment = trpc.agentMarkets.upsertAssignment.useMutation({
    onSuccess: async () => {
      setAgentToAssign(EMPTY); setAssignmentNotes(""); setAssignmentPrimary(false); setAssignmentAvailable(true);
      await Promise.all([utils.agentMarkets.list.invalidate(), detail.refetch()]);
      toast.success("Agent assignment saved.");
    },
    onError: error => toast.error(error.message),
  });
  const removeAssignment = trpc.agentMarkets.removeAssignment.useMutation({
    onSuccess: async () => { await Promise.all([utils.agentMarkets.list.invalidate(), detail.refetch()]); toast.success("Agent assignment removed."); },
    onError: error => toast.error(error.message),
  });

  function openCreateDialog() { setMarketForm(blankMarket); setMarketDialogOpen(true); }
  function submitMarket() {
    if (!marketForm.name.trim() || !marketForm.state.trim()) return toast.error("Market name and state are required.");
    const annualGciGoal = marketForm.annualGciGoal.trim() ? Number(marketForm.annualGciGoal) : null;
    if (annualGciGoal !== null && (!Number.isFinite(annualGciGoal) || annualGciGoal < 0)) return toast.error("Enter a valid annual GCI goal.");
    createMarket.mutate({ name: marketForm.name.trim(), state: marketForm.state.trim(), region: marketForm.region.trim() || null, status: marketForm.status, annualGciGoal });
  }
  function saveMarketDetails() {
    if (!selectedMarket || !marketForm.name.trim() || !marketForm.state.trim()) return toast.error("Market name and state are required.");
    const annualGciGoal = marketForm.annualGciGoal.trim() ? Number(marketForm.annualGciGoal) : null;
    if (annualGciGoal !== null && (!Number.isFinite(annualGciGoal) || annualGciGoal < 0)) return toast.error("Enter a valid annual GCI goal.");
    updateMarket.mutate({ marketId: selectedMarket.id, name: marketForm.name.trim(), state: marketForm.state.trim(), region: marketForm.region.trim() || null, status: marketForm.status, annualGciGoal });
  }
  function submitNote() {
    if (!selectedId || !noteTitle.trim() || !noteContent.trim()) return toast.error("Add a title and research text.");
    addNote.mutate({ marketId: selectedId, title: noteTitle.trim(), content: noteContent.trim() });
  }
  async function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedId) return;
    if (file.size > 12 * 1024 * 1024) return toast.error("Files must be 12 MB or smaller.");
    try {
      uploadSource.mutate({ marketId: selectedId, fileName: file.name, mimeType: file.type || "application/octet-stream", base64Data: await readAsBase64(file) });
    } catch (error: any) { toast.error(error?.message ?? "Could not read the selected file."); }
  }
  function addAssignment() {
    if (!selectedId || agentToAssign === EMPTY) return toast.error("Select an agent to assign.");
    upsertAssignment.mutate({ marketId: selectedId, agentId: Number(agentToAssign), isPrimary: assignmentPrimary, isAvailable: assignmentAvailable, notes: assignmentNotes.trim() || null });
  }

  useEffect(() => { if (detail.data?.market) setMarketForm(asMarketForm(detail.data.market)); }, [detail.data?.market?.id, detail.data?.market?.updatedAt]);

  if (marketsLoading) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const intelligence: any = detail.data?.intelligence;
  const profile: any = intelligence?.profileJson ?? null;
  const snapshot: any = intelligence?.sourceSnapshot ?? detail.data?.liveEvidence?.sourceSnapshot ?? {};
  const sourceCounts: any = snapshot.generatedFrom ?? {};
  const refreshInProgress = intelligence?.status === "refreshing" || refresh.isPending || createMarket.isPending;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => navigate("/")} aria-label="Back to dashboard"><ArrowLeft className="h-4 w-4" /></Button><div><h1 className="text-2xl font-bold tracking-tight">Agent Markets</h1><p className="mt-1 text-sm text-muted-foreground">Build a living, evidence-backed intelligence profile for each market and manage its agent coverage.</p></div></div>
        <Button onClick={openCreateDialog}><Plus className="mr-2 h-4 w-4" />New market</Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="lg:sticky lg:top-4"><CardHeader className="pb-3"><CardTitle className="text-base">Markets</CardTitle><CardDescription>{markets.length} market{markets.length === 1 ? "" : "s"} in SavvyOS</CardDescription></CardHeader><CardContent className="space-y-1">
          {markets.map((market: any) => <button key={market.id} type="button" onClick={() => setSelectedId(market.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${selectedId === market.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
            <MapPinned className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{market.name}</span><span className={`block text-xs ${selectedId === market.id ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{market.state} · {market.agentCount} agent{market.agentCount === 1 ? "" : "s"}</span></span><ChevronRight className="h-4 w-4 shrink-0" />
          </button>)}
          {!markets.length && <p className="px-3 py-8 text-center text-sm text-muted-foreground">Create the first market to begin.</p>}
        </CardContent></Card>

        {!selectedMarket ? <Card><CardContent className="flex min-h-[380px] flex-col items-center justify-center text-center"><MapPinned className="mb-4 h-10 w-10 text-muted-foreground" /><h2 className="font-semibold">No market selected</h2><p className="mt-2 max-w-sm text-sm text-muted-foreground">Create an Agent Market to combine research, sales outcomes, investor signals, and agent observations into a current profile.</p></CardContent></Card> : detail.isLoading ? <Card><CardContent className="flex min-h-[380px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent></Card> : (
          <div className="space-y-6">
            <Card><CardContent className="p-5"><div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold">{selectedMarket.name}</h2><Badge variant="outline" className={statusStyle(intelligence?.status)}>{refreshInProgress && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}{statusLabel(intelligence?.status)}</Badge><Badge variant="secondary" className="capitalize">{selectedMarket.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{selectedMarket.state}{selectedMarket.region ? ` · ${selectedMarket.region}` : ""} · Profile {relativeTime(intelligence?.generatedAt)}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setNoteDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Add research</Button><Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadSource.isPending}><Upload className="mr-2 h-4 w-4" />{uploadSource.isPending ? "Uploading…" : "Upload file"}</Button><Button onClick={() => refresh.mutate({ marketId: selectedMarket.id })} disabled={refreshInProgress}><RefreshCw className={`mr-2 h-4 w-4 ${refreshInProgress ? "animate-spin" : ""}`} />Refresh profile</Button><input ref={fileInputRef} className="hidden" type="file" onChange={chooseFile} /></div></div>
              {intelligence?.status === "failed" && <div className="mt-4 flex gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>Profile refresh could not complete: {intelligence.errorMessage || "Please try refreshing again."}</span></div>}
            </CardContent></Card>

            <Card><CardHeader className="pb-3"><div className="flex items-start gap-3"><div className="rounded-md bg-primary/10 p-2 text-primary"><Bot className="h-5 w-5" /></div><div><CardTitle>Living market profile</CardTitle><CardDescription>Generated from administrator research plus the current SavvyOS evidence for agents assigned to this market. It refreshes automatically when its source data changes.</CardDescription></div></div></CardHeader><CardContent>
              {profile ? <div className="grid gap-6 lg:grid-cols-2"><div className="lg:col-span-2 rounded-lg border bg-muted/25 p-4"><h3 className="text-sm font-semibold">Market read</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{profile.executiveSummary}</p></div><SectionList title="Best-fit investors" items={profile.bestFitInvestors} empty="More direct investor evidence is needed." /><SectionList title="Not ideal for" items={profile.notIdealFor} empty="No exclusions are established yet." /><section className="rounded-lg border p-4 lg:col-span-2"><h3 className="text-sm font-semibold">What to buy</h3><div className="mt-3 grid gap-4 text-sm sm:grid-cols-2"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Purchase-price guidance</p><p className="mt-1">{profile.buyBox?.purchasePriceGuidance || "Insufficient evidence"}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bedroom guidance</p><p className="mt-1">{profile.buyBox?.bedroomGuidance || "Insufficient evidence"}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Property types</p><p className="mt-1">{profile.buyBox?.propertyTypes?.join(" · ") || "Insufficient evidence"}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Locations</p><p className="mt-1">{profile.buyBox?.locations?.join(" · ") || "Insufficient evidence"}</p></div></div>{profile.buyBox?.propertyCharacteristics?.length ? <div className="mt-4 border-t pt-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Property characteristics</p><p className="mt-1 text-sm">{profile.buyBox.propertyCharacteristics.join(" · ")}</p></div> : null}</section><SectionList title="Market dynamics" items={profile.marketDynamics} empty="More evidence is needed." /><SectionList title="Agent guidance" items={profile.agentGuidance} empty="More evidence is needed." /><SectionList title="Watchouts and diligence" items={profile.watchouts} empty="No specific watchouts have been identified." /><SectionList title="Research gaps" items={profile.researchGaps} empty="No research gaps are currently identified." /><div className="lg:col-span-2 rounded-md border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-900"><strong>Evidence note:</strong> {profile.evidenceNotes?.join(" ")} <span className="ml-1 font-medium capitalize">Confidence: {profile.confidence}.</span></div></div> : <div className="rounded-lg border border-dashed p-8 text-center"><Bot className="mx-auto h-8 w-8 text-muted-foreground" /><h3 className="mt-3 font-semibold">Building the first profile</h3><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Add market research, call transcripts, analysis exports, or notes. SavvyOS will combine them with permitted internal market signals to build a usable profile.</p></div>}
            </CardContent></Card>

            <div className="grid gap-6 xl:grid-cols-2"><Card><CardHeader className="pb-3"><CardTitle className="text-base">Evidence feeding this profile</CardTitle><CardDescription>{detail.data?.liveEvidence?.evidenceSnapshot || "Live CRM evidence will appear when agents are assigned."}</CardDescription></CardHeader><CardContent><div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">{[["Assigned agents", sourceCounts.assignedAgents], ["Research sources", sourceCounts.manualSources], ["Transactions", sourceCounts.transactions], ["Connected contacts", sourceCounts.connectedContacts], ["Call transcripts", sourceCounts.callTranscripts], ["Agent task notes", sourceCounts.agentTaskNotes], ["Website behaviors", sourceCounts.websiteBehaviors], ["Email behaviors", sourceCounts.emailBehaviors]].map(([label, value]) => <div className="rounded-md border bg-muted/20 p-3" key={String(label)}><p className="text-xl font-bold">{Number(value ?? 0).toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>)}</div><p className="mt-4 text-xs leading-5 text-muted-foreground">Profiles are generated from bounded, current evidence. Individual contact identities, addresses, email addresses, and phone numbers are not retained in the generated market profile.</p></CardContent></Card>
              <Card><CardHeader className="pb-3"><CardTitle className="text-base">Market details</CardTitle><CardDescription>Keep the market’s reporting identity and annual goal accurate. Investment fit fields are intentionally replaced by the living profile above.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="market-name">Market name</Label><Input id="market-name" className="mt-1" value={marketForm.name} onChange={event => setMarketForm(form => ({ ...form, name: event.target.value }))} /></div><div><Label htmlFor="market-state">State</Label><Input id="market-state" className="mt-1" value={marketForm.state} onChange={event => setMarketForm(form => ({ ...form, state: event.target.value }))} /></div><div><Label htmlFor="market-region">Region (optional)</Label><Input id="market-region" className="mt-1" value={marketForm.region} onChange={event => setMarketForm(form => ({ ...form, region: event.target.value }))} /></div><div><Label htmlFor="market-goal">Annual GCI goal</Label><Input id="market-goal" type="number" min="0" className="mt-1" placeholder="e.g. 500000" value={marketForm.annualGciGoal} onChange={event => setMarketForm(form => ({ ...form, annualGciGoal: event.target.value }))} /></div></div><div><Label>Market status</Label><Select value={marketForm.status} onValueChange={(value: MarketForm["status"]) => setMarketForm(form => ({ ...form, status: value }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="recruiting">Recruiting</SelectItem><SelectItem value="paused">Paused</SelectItem><SelectItem value="future">Future</SelectItem></SelectContent></Select></div><div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2"><span className="text-sm">Current annual goal</span><span className="text-sm font-semibold">{amount(selectedMarket.annualGciGoal)}</span></div><Button className="w-full" variant="outline" onClick={saveMarketDetails} disabled={updateMarket.isPending}>{updateMarket.isPending ? "Saving…" : "Save market details"}</Button></CardContent></Card></div>

            <Card><CardHeader className="pb-3"><CardTitle className="text-base">Research sources</CardTitle><CardDescription>Upload PDFs, Word documents, spreadsheets, CSVs, JSON, text files, and other supporting material—or paste research and call transcripts directly. Text-ready sources are included at the next refresh.</CardDescription></CardHeader><CardContent className="space-y-3">{detail.data?.sources?.length ? detail.data.sources.map((source: any) => <div key={source.id} className="flex items-center gap-3 rounded-lg border p-3"><FileText className="h-5 w-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{source.title}</p><Badge variant="outline" className={source.extractionStatus === "ready" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>{source.sourceType === "note" ? "Research note" : source.extractionStatus === "ready" ? "Text ingested" : "Stored—text unavailable"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{source.fileName || "Freeform research"} · {source.contentLength.toLocaleString()} characters · Updated {relativeTime(source.updatedAt)}</p></div>{source.fileUrl && <a className="text-xs font-medium text-primary hover:underline" href={source.fileUrl} target="_blank" rel="noreferrer">Open</a>}<Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => deleteSource.mutate({ sourceId: source.id })} disabled={deleteSource.isPending} aria-label={`Remove ${source.title}`}><Trash2 className="h-4 w-4" /></Button></div>) : <p className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">No direct research added yet. Use a research note for call transcripts, takeaways, and researched data.</p>}</CardContent></Card>

            <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" />Agent coverage</CardTitle><CardDescription>Assignments are the reporting relationship for this market. Mark one assigned market as an agent’s primary market when appropriate.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid gap-3 rounded-lg border bg-muted/20 p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto_minmax(0,1fr)_auto]"><Select value={agentToAssign} onValueChange={setAgentToAssign}><SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger><SelectContent><SelectItem value={EMPTY}>Select agent</SelectItem>{assignableAgents.map((agent: any) => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name || agent.email || `Agent #${agent.id}`}</SelectItem>)}</SelectContent></Select><label className="flex items-center gap-2 whitespace-nowrap text-sm"><Checkbox checked={assignmentPrimary} onCheckedChange={checked => setAssignmentPrimary(Boolean(checked))} />Primary market</label><label className="flex items-center gap-2 whitespace-nowrap text-sm"><Checkbox checked={assignmentAvailable} onCheckedChange={checked => setAssignmentAvailable(Boolean(checked))} />Available</label><Input placeholder="Optional internal assignment note" value={assignmentNotes} onChange={event => setAssignmentNotes(event.target.value)} /><Button onClick={addAssignment} disabled={upsertAssignment.isPending}>{upsertAssignment.isPending ? "Saving…" : "Assign"}</Button></div>{detail.data?.assignments?.length ? <div className="divide-y rounded-lg border">{detail.data.assignments.map((assignment: any) => <div className="flex flex-wrap items-center gap-3 p-3" key={assignment.id}><div className="min-w-[180px] flex-1"><p className="text-sm font-semibold">{assignment.agentName || assignment.agentEmail || `Agent #${assignment.agentId}`}</p>{assignment.notes && <p className="mt-1 text-xs text-muted-foreground">{assignment.notes}</p>}</div>{assignment.isPrimary && <Badge>Primary</Badge>}<Badge variant="outline" className={assignment.isAvailable ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-700"}>{assignment.isAvailable ? "Available" : "Unavailable"}</Badge><Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => removeAssignment.mutate({ assignmentId: assignment.id })} disabled={removeAssignment.isPending}>Remove</Button></div>)}</div> : <p className="text-sm text-muted-foreground">No agents assigned. Assign agents to preserve coverage and enable market-specific internal context.</p>}</CardContent></Card>
          </div>
        )}
      </div>

      <Dialog open={marketDialogOpen} onOpenChange={setMarketDialogOpen}><DialogContent><DialogHeader><DialogTitle>Create Agent Market</DialogTitle><DialogDescription>This preserves a market identity for reporting while its intelligence profile is built from sources and internal signals.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div><Label htmlFor="new-market-name">Market name</Label><Input id="new-market-name" className="mt-1" value={marketForm.name} onChange={event => setMarketForm(form => ({ ...form, name: event.target.value }))} placeholder="e.g. Smoky Mountains" /></div><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="new-market-state">State</Label><Input id="new-market-state" className="mt-1" value={marketForm.state} onChange={event => setMarketForm(form => ({ ...form, state: event.target.value }))} placeholder="TN" /></div><div><Label htmlFor="new-market-region">Region (optional)</Label><Input id="new-market-region" className="mt-1" value={marketForm.region} onChange={event => setMarketForm(form => ({ ...form, region: event.target.value }))} /></div></div><div><Label>Status</Label><Select value={marketForm.status} onValueChange={(value: MarketForm["status"]) => setMarketForm(form => ({ ...form, status: value }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="recruiting">Recruiting</SelectItem><SelectItem value="paused">Paused</SelectItem><SelectItem value="future">Future</SelectItem></SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setMarketDialogOpen(false)}>Cancel</Button><Button onClick={submitMarket} disabled={createMarket.isPending}>{createMarket.isPending ? "Creating…" : "Create market"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Add market research</DialogTitle><DialogDescription>Paste market research, call transcripts, property-manager insight, regulatory notes, or other context. It will be ingested into this market’s next profile refresh.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div><Label htmlFor="research-title">Title</Label><Input id="research-title" className="mt-1" value={noteTitle} onChange={event => setNoteTitle(event.target.value)} placeholder="e.g. August investor call themes" /></div><div><Label htmlFor="research-content">Research or transcript</Label><Textarea id="research-content" className="mt-1 min-h-56" value={noteContent} onChange={event => setNoteContent(event.target.value)} placeholder="Paste sourced research, agent feedback, or a call transcript…" /></div></div><DialogFooter><Button variant="outline" onClick={() => setNoteDialogOpen(false)}>Cancel</Button><Button onClick={submitNote} disabled={addNote.isPending}>{addNote.isPending ? "Adding…" : "Add and refresh"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
