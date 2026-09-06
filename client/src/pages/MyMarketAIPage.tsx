import { useRef, useState } from "react";
import { Bot, CheckCircle2, CircleAlert, FileText, Loader2, MapPinned, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
function profileStatus(status?: string | null) {
  if (status === "ready") return { label: "Current", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (status === "failed") return { label: "Needs attention", className: "border-rose-200 bg-rose-50 text-rose-700" };
  return { label: "Refreshing", className: "border-amber-200 bg-amber-50 text-amber-700" };
}
async function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.onload = () => { const data = String(reader.result ?? ""); resolve(data.includes(",") ? data.split(",", 2)[1] : data); };
    reader.readAsDataURL(file);
  });
}
function InsightList({ title, items, empty }: { title: string; items?: string[]; empty: string }) {
  return <section className="space-y-2"><h3 className="text-sm font-semibold">{title}</h3>{items?.length ? <ul className="space-y-2 text-sm text-muted-foreground">{items.map((item, index) => <li className="flex gap-2" key={`${item}-${index}`}><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{item}</li>)}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}</section>;
}

export default function MyMarketAIPage() {
  const utils = trpc.useUtils();
  const market = trpc.agentMarkets.myMarket.useQuery(undefined, { refetchInterval: query => query.state.data?.intelligence?.status === "refreshing" ? 5_000 : false });
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const addNote = trpc.agentMarkets.myMarketAddNote.useMutation({
    onSuccess: async () => { setNoteTitle(""); setNoteContent(""); await utils.agentMarkets.myMarket.invalidate(); toast.success("Research saved. My Market AI is updating your profile."); },
    onError: error => toast.error(error.message),
  });
  const upload = trpc.agentMarkets.myMarketUploadSource.useMutation({
    onSuccess: async ({ extractionStatus }) => { await utils.agentMarkets.myMarket.invalidate(); toast.success(extractionStatus === "ready" ? "File added. My Market AI is updating your profile." : "File saved. Add a note if the file text could not be extracted."); },
    onError: error => toast.error(error.message),
  });
  const refresh = trpc.agentMarkets.myMarketRefresh.useMutation({
    onSuccess: async () => { await utils.agentMarkets.myMarket.invalidate(); toast.success("Profile refresh requested."); },
    onError: error => toast.error(error.message),
  });
  async function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { toast.error("Files must be 12 MB or smaller."); return; }
    try { upload.mutate({ fileName: file.name, mimeType: file.type || "application/octet-stream", base64Data: await readAsBase64(file) }); }
    catch (error: any) { toast.error(error?.message ?? "Could not read the selected file."); }
  }
  function submitNote(event: React.FormEvent) {
    event.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim()) { toast.error("Add a title and research before saving."); return; }
    addNote.mutate({ title: noteTitle.trim(), content: noteContent.trim() });
  }
  if (market.isLoading) return <div className="flex min-h-[40vh] items-center justify-center gap-3"><Loader2 className="h-5 w-5 animate-spin text-primary" />Loading My Market AI…</div>;
  if (market.error) return <div className="mx-auto max-w-3xl px-4 py-8"><Card className="border-amber-200"><CardContent className="p-7"><MapPinned className="h-8 w-8 text-amber-600" /><h1 className="mt-4 text-xl font-semibold">Your market is not assigned yet</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{market.error.message}</p></CardContent></Card></div>;
  const detail: any = market.data;
  const intelligence: any = detail?.intelligence;
  const profile: any = intelligence?.profileJson;
  const status = profileStatus(intelligence?.status);
  const refreshing = intelligence?.status === "refreshing" || refresh.isPending || upload.isPending || addNote.isPending;
  return <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
    <PageHeader title="My Market AI" subtitle="Your evidence-backed market profile. Add current local research and My Market AI will use it in the next profile refresh." actions={<Button onClick={() => refresh.mutate()} disabled={refreshing}><RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Refreshing…" : "Refresh profile"}</Button>} />
    <Card><CardContent className="p-5"><div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><MapPinned className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold">{detail.market.name}, {detail.market.state}</h2><Badge variant="outline" className={status.className}>{refreshing && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}{status.label}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{detail.market.region ? `${detail.market.region} · ` : ""}Profile updated {relativeTime(intelligence?.generatedAt)}</p></div><div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">Your research is retained as a source and changes the AI profile only after a refresh.</div></div>{intelligence?.status === "failed" && <div className="mt-4 flex gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{intelligence.errorMessage || "The latest refresh could not complete. Try again after adding or checking your research."}</div>}</CardContent></Card>
    <Card><CardHeader><div className="flex gap-3"><div className="rounded-md bg-primary/10 p-2 text-primary"><Bot className="h-5 w-5" /></div><div><CardTitle>Current market profile</CardTitle><CardDescription>AI-generated from current, permitted Savvy evidence and the research you or the team contribute. It is not a guarantee or an instruction to clients.</CardDescription></div></div></CardHeader><CardContent>{profile ? <div className="grid gap-6 lg:grid-cols-2"><div className="lg:col-span-2 rounded-lg border bg-muted/25 p-4"><h3 className="text-sm font-semibold">Market read</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{profile.executiveSummary}</p></div><InsightList title="Best-fit investors" items={profile.bestFitInvestors} empty="More direct investor evidence is needed." /><InsightList title="Not ideal for" items={profile.notIdealFor} empty="No exclusions are established yet." /><section className="rounded-lg border p-4 lg:col-span-2"><h3 className="text-sm font-semibold">What to buy</h3><div className="mt-3 grid gap-4 text-sm sm:grid-cols-2"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Purchase-price guidance</p><p className="mt-1">{profile.buyBox?.purchasePriceGuidance || "Insufficient evidence"}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bedroom guidance</p><p className="mt-1">{profile.buyBox?.bedroomGuidance || "Insufficient evidence"}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Property types</p><p className="mt-1">{profile.buyBox?.propertyTypes?.join(" · ") || "Insufficient evidence"}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Locations</p><p className="mt-1">{profile.buyBox?.locations?.join(" · ") || "Insufficient evidence"}</p></div></div></section><InsightList title="Market dynamics" items={profile.marketDynamics} empty="More evidence is needed." /><InsightList title="Agent guidance" items={profile.agentGuidance} empty="More evidence is needed." /><InsightList title="Watchouts and diligence" items={profile.watchouts} empty="No specific watchouts are identified yet." /><InsightList title="Research gaps" items={profile.researchGaps} empty="No research gaps are currently identified." /><div className="lg:col-span-2 rounded-md border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-900"><strong>Evidence note:</strong> {profile.evidenceNotes?.join(" ")} <span className="ml-1 font-medium capitalize">Confidence: {profile.confidence}.</span></div></div> : <div className="rounded-lg border border-dashed p-8 text-center"><Bot className="mx-auto h-8 w-8 text-muted-foreground" /><h3 className="mt-3 font-semibold">Building your first profile</h3><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Add local research, call takeaways, inventory analysis, regulatory updates, or vendor insight to help build a useful market profile.</p></div>}</CardContent></Card>
    <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Add research</CardTitle><CardDescription>Paste sourced local information, call takeaways, regulatory updates, or agent observations.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={submitNote}><div><Label htmlFor="my-market-note-title">Title</Label><Input id="my-market-note-title" className="mt-1" value={noteTitle} onChange={event => setNoteTitle(event.target.value)} placeholder="e.g. September inventory update" /></div><div><Label htmlFor="my-market-note">Research or notes</Label><Textarea id="my-market-note" className="mt-1 min-h-44" value={noteContent} onChange={event => setNoteContent(event.target.value)} placeholder="Include source context, local operating information, trend observations, or direct market insight…" /></div><Button type="submit" disabled={addNote.isPending}>{addNote.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save research and refresh</Button></form></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Upload supporting material</CardTitle><CardDescription>Upload PDFs, Word documents, spreadsheets, CSVs, text files, or analysis exports up to 12 MB.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="rounded-lg border border-dashed bg-muted/20 p-7 text-center"><Upload className="mx-auto h-8 w-8 text-primary" /><p className="mt-3 text-sm font-semibold">Add a market research file</p><p className="mt-1 text-xs text-muted-foreground">Text-ready files are incorporated into the next profile refresh.</p><Button className="mt-4" variant="outline" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>{upload.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{upload.isPending ? "Uploading…" : "Choose file"}</Button><input ref={fileRef} className="hidden" type="file" onChange={chooseFile} /></div><p className="text-xs leading-5 text-muted-foreground">For files that cannot be read as text, add a companion research note with the relevant findings.</p></CardContent></Card></div>
    <Card><CardHeader><CardTitle className="text-base">Research sources</CardTitle><CardDescription>Sources below feed the living market profile. Your additions are kept as traceable evidence.</CardDescription></CardHeader><CardContent className="space-y-3">{detail.sources?.length ? detail.sources.map((source: any) => <div className="flex items-center gap-3 rounded-lg border p-3" key={source.id}><FileText className="h-5 w-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{source.title}</p><Badge variant="outline" className={source.extractionStatus === "ready" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>{source.sourceType === "note" ? "Research note" : source.extractionStatus === "ready" ? "Text ingested" : "Stored—text unavailable"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{source.fileName || "Freeform research"} · {source.contentLength.toLocaleString()} characters · Updated {relativeTime(source.updatedAt)}</p></div>{source.fileUrl && <a className="text-xs font-medium text-primary hover:underline" href={source.fileUrl} target="_blank" rel="noreferrer">Open</a>}</div>) : <p className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">No direct research has been added yet.</p>}</CardContent></Card>
  </div>;
}
