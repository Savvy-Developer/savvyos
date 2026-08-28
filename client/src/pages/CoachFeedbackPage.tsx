import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, CalendarDays, LockKeyhole, Loader2, MessageSquareText, RotateCcw, Star, TableProperties } from "lucide-react";

const EASTERN_TIME_ZONE = "America/New_York";

function easternDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: EASTERN_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function mondayDateKey(date = new Date()) {
  const eastern = new Date(`${easternDateKey(date)}T12:00:00`);
  const day = eastern.getDay();
  eastern.setDate(eastern.getDate() - ((day + 6) % 7));
  return eastern.toISOString().slice(0, 10);
}

function formatSubmittedAt(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function formatWeek(value: string | Date | null | undefined) {
  if (!value) return "—";
  // `sessionWeekStart` is a calendar date rather than a moment in time, so format
  // it in UTC to avoid displaying the preceding day for Eastern-time viewers.
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function RatingValue({ value }: { value: number | null | undefined }) {
  return <span className="font-semibold text-slate-900">{value === null || value === undefined ? "—" : `${value.toFixed(1)} / 5`}</span>;
}

function Metric({ label, value }: { label: string; value: number | null | undefined }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center"><div className="text-lg font-bold text-slate-900">{value === null || value === undefined ? "—" : value.toFixed(1)}</div><div className="mt-1 text-[11px] font-medium leading-4 text-slate-500">{label}</div></div>;
}

function AnonymousComment({ label, value, isTest }: { label: string; value: string | null; isTest?: boolean }) {
  if (!value?.trim()) return null;
  return <div className="rounded-lg border-l-4 border-cyan-400 bg-slate-50 px-3 py-3"><div className="flex items-center gap-2"><p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700">{label}</p>{isTest && <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-[10px] text-cyan-800">Test</Badge>}</div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value}</p></div>;
}

function FilterBar({ fromDate, toDate, includeTest, onFromDateChange, onToDateChange, onIncludeTestChange, onReset }: {
  fromDate: string; toDate: string; includeTest: boolean;
  onFromDateChange: (value: string) => void; onToDateChange: (value: string) => void; onIncludeTestChange: (value: boolean) => void; onReset: () => void;
}) {
  return <Card><CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end"><div className="flex items-center gap-2 text-sm font-semibold text-slate-800 lg:mr-2"><CalendarDays className="h-4 w-4 text-cyan-700" />Reporting period</div><div className="space-y-1.5"><Label htmlFor="coach-feedback-from">From</Label><Input id="coach-feedback-from" type="date" value={fromDate} max={toDate} onChange={(event) => onFromDateChange(event.target.value)} className="w-full lg:w-44" /></div><div className="space-y-1.5"><Label htmlFor="coach-feedback-to">To</Label><Input id="coach-feedback-to" type="date" value={toDate} min={fromDate} max={easternDateKey()} onChange={(event) => onToDateChange(event.target.value)} className="w-full lg:w-44" /></div><label className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-700"><input type="checkbox" checked={includeTest} onChange={(event) => onIncludeTestChange(event.target.checked)} className="h-4 w-4 accent-cyan-600" />Include test feedback</label><Button type="button" variant="outline" onClick={onReset}><RotateCcw className="mr-2 h-4 w-4" />Current week</Button></CardContent></Card>;
}

export default function CoachFeedbackPage() {
  const [tab, setTab] = useState("aggregate");
  const [fromDate, setFromDate] = useState(mondayDateKey());
  const [toDate, setToDate] = useState(easternDateKey());
  const [includeTest, setIncludeTest] = useState(true);
  const filter = useMemo(() => ({ fromDate, toDate, includeTest }), [fromDate, toDate, includeTest]);
  const aggregateQuery = trpc.coachFeedback.getDashboard.useQuery(filter, { retry: false });
  const historyQuery = trpc.coachFeedback.getHistory.useQuery(filter, { retry: false });

  const resetToCurrentWeek = () => { setFromDate(mondayDateKey()); setToDate(easternDateKey()); };
  const isLoading = aggregateQuery.isLoading || historyQuery.isLoading;
  const error = aggregateQuery.error ?? historyQuery.error;

  if (isLoading) return <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-cyan-600" /></div>;
  if (error || !aggregateQuery.data || !historyQuery.data) return <div className="mx-auto max-w-3xl px-4 py-10"><Card><CardContent className="py-10 text-center text-sm text-slate-600">Coach feedback is unavailable for this account.</CardContent></Card></div>;

  const report = aggregateQuery.data;
  const feedbackItems = historyQuery.data.items;
  return <div className="mx-auto max-w-7xl space-y-6 px-4 py-7 md:px-7">
    <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="flex items-center gap-2 text-sm font-semibold text-cyan-700"><LockKeyhole className="h-4 w-4" />Restricted Coach feedback administration</div><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Coach feedback</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Review anonymous coaching feedback for <strong>{report.periodLabel}</strong>. This page never displays agent names, emails, session details, response tokens, or invitation identifiers.</p></div></header>

    <Card className="border-amber-200 bg-amber-50/70"><CardContent className="flex gap-3 pt-6 text-sm leading-6 text-slate-700"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><p><strong className="text-slate-900">Restricted timestamp access.</strong> At leadership’s direction, exact submission dates and times are visible only to accounts with the Coach feedback Super Permission. They are not included in coach weekly emails.</p></CardContent></Card>

    <FilterBar fromDate={fromDate} toDate={toDate} includeTest={includeTest} onFromDateChange={setFromDate} onToDateChange={setToDate} onIncludeTestChange={setIncludeTest} onReset={resetToCurrentWeek} />

    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="grid w-full grid-cols-2 sm:w-[380px]"><TabsTrigger value="aggregate"><BarChart3 className="mr-2 h-4 w-4" />Aggregate view</TabsTrigger><TabsTrigger value="all-feedback"><TableProperties className="mr-2 h-4 w-4" />All feedback</TabsTrigger></TabsList>
      <TabsContent value="aggregate" className="space-y-6 pt-5">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><Card><CardHeader className="pb-2"><CardDescription>Responses</CardDescription><CardTitle className="text-3xl">{report.overall.responseCount}</CardTitle></CardHeader><CardContent className="text-xs text-slate-500">Selected period</CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>Overall value</CardDescription><CardTitle className="flex items-center gap-1 text-3xl"><Star className="h-5 w-5 fill-amber-400 text-amber-400" />{report.overall.overallAverage ?? "—"}</CardTitle></CardHeader><CardContent className="text-xs text-slate-500">Out of 5</CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>Business priorities</CardDescription><CardTitle className="text-3xl">{report.overall.prioritiesAverage ?? "—"}</CardTitle></CardHeader><CardContent className="text-xs text-slate-500">Out of 5</CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>Next-step clarity</CardDescription><CardTitle className="text-3xl">{report.overall.clarityAverage ?? "—"}</CardTitle></CardHeader><CardContent className="text-xs text-slate-500">Out of 5</CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>Felt supported</CardDescription><CardTitle className="text-3xl">{report.overall.supportAverage ?? "—"}</CardTitle></CardHeader><CardContent className="text-xs text-slate-500">Out of 5</CardContent></Card></section>
        <section className="space-y-4"><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-cyan-700" /><h2 className="text-xl font-bold text-slate-900">Aggregate by coach</h2></div>{report.aggregates.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-slate-600">No coaching feedback matches this reporting period yet.</CardContent></Card> : <div className="grid gap-5 lg:grid-cols-2">{report.aggregates.map((aggregate) => <Card key={aggregate.coachId} className="overflow-hidden"><CardHeader className="border-b border-slate-100 bg-slate-50/80"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">{aggregate.coachName}</CardTitle><CardDescription className="mt-1">{aggregate.responseCount} anonymous response{aggregate.responseCount === 1 ? "" : "s"} in this period</CardDescription></div><div className="rounded-lg bg-cyan-50 px-3 py-2 text-center"><div className="text-lg font-bold text-slate-900"><RatingValue value={aggregate.overallAverage} /></div><div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Overall value</div></div></div></CardHeader><CardContent className="space-y-5 pt-5"><div className="grid grid-cols-3 gap-3"><Metric label="Priorities" value={aggregate.prioritiesAverage} /><Metric label="Clarity" value={aggregate.clarityAverage} /><Metric label="Support" value={aggregate.supportAverage} /></div><div className="space-y-3"><div className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-cyan-700" /><h3 className="text-sm font-semibold text-slate-800">Anonymous written feedback</h3></div>{aggregate.comments.length ? aggregate.comments.map((comment, index) => <div key={index} className="space-y-2"><AnonymousComment label="Most helpful" value={comment.helpful} isTest={comment.isTest} /><AnonymousComment label="Would make coaching more valuable" value={comment.improvement} isTest={comment.isTest} /><AnonymousComment label="Additional context" value={comment.additional} isTest={comment.isTest} /></div>) : <p className="text-sm text-slate-500">No written feedback was submitted for this coach in this period.</p>}</div></CardContent></Card>)}</div>}</section>
      </TabsContent>
      <TabsContent value="all-feedback" className="pt-5"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><TableProperties className="h-5 w-5 text-cyan-700" />All anonymous feedback</CardTitle><CardDescription>{feedbackItems.length} response{feedbackItems.length === 1 ? "" : "s"} in the selected period. Submission time is restricted to Coach feedback administrators.</CardDescription></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1260px] text-sm"><thead className="border-y bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-medium">Submitted</th><th className="px-4 py-3 font-medium">Coach</th><th className="px-4 py-3 font-medium">Feedback week</th><th className="px-4 py-3 text-center font-medium">Value</th><th className="px-4 py-3 text-center font-medium">Priorities</th><th className="px-4 py-3 text-center font-medium">Clarity</th><th className="px-4 py-3 text-center font-medium">Support</th><th className="px-4 py-3 font-medium">Anonymous comments</th></tr></thead><tbody>{feedbackItems.length === 0 ? <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">No feedback matches these filters.</td></tr> : feedbackItems.map((item) => <tr key={item.id} className="border-b align-top transition-colors hover:bg-slate-50/70"><td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">{formatSubmittedAt(item.submittedAt)}</td><td className="px-4 py-4 font-medium text-slate-900"><div className="flex items-center gap-2">{item.coachName}{item.isTest && <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-[10px] text-cyan-800">Test</Badge>}</div></td><td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">Week of {formatWeek(item.sessionWeekStart)}</td><td className="px-4 py-4 text-center font-semibold">{item.overallRating}/5</td><td className="px-4 py-4 text-center font-semibold">{item.prioritiesRating}/5</td><td className="px-4 py-4 text-center font-semibold">{item.clarityRating}/5</td><td className="px-4 py-4 text-center font-semibold">{item.supportRating}/5</td><td className="max-w-md px-4 py-4"><div className="space-y-2 text-xs leading-5 text-slate-700">{item.helpfulComment && <p><span className="font-semibold text-slate-900">Most helpful:</span> {item.helpfulComment}</p>}{item.improvementComment && <p><span className="font-semibold text-slate-900">More valuable if:</span> {item.improvementComment}</p>}{item.additionalComment && <p><span className="font-semibold text-slate-900">Additional:</span> {item.additionalComment}</p>}{!item.helpfulComment && !item.improvementComment && !item.additionalComment && <span className="text-slate-400">No written comment</span>}</div></td></tr>)}</tbody></table></div></CardContent></Card></TabsContent>
    </Tabs>
    <p className="pb-6 text-center text-xs leading-5 text-slate-500">Treat this as a learning signal. Do not attempt to identify a respondent from their feedback.</p>
  </div>;
}
