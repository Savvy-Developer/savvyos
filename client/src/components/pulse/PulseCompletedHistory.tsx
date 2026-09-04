import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardCheck, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { PulseInlineItemRow } from "@/components/pulse/PulseItemEditor";

type HistoryType = "all" | "todo" | "issue";

function dateTime(value?: string | Date | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Unknown date";
}

export function PulseCompletedHistory({ contextId, title = "Completed & Resolved", description, initialType = "all", onlyMine = false, sourceSessionId, onChanged }: { contextId?: string; title?: string; description?: string; initialType?: HistoryType; onlyMine?: boolean; sourceSessionId?: string | null; onChanged?: () => void }) {
  const utils = trpc.useUtils();
  const [type, setType] = useState<HistoryType>(initialType);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const query = useMemo(() => ({ contextId, type: type === "all" ? undefined : type, search: search.trim() || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, onlyMine }), [contextId, type, search, dateFrom, dateTo, onlyMine]);
  const history = trpc.pulse.workItems.history.useQuery(query);
  const changed = () => { void history.refetch(); void utils.pulse.personal.dashboard.invalidate(); void utils.pulse.l10.dashboard.invalidate(); void utils.pulse.workItems.invalidate(); onChanged?.(); };
  const items = history.data ?? [];
  return <Card className="border-emerald-200/80 bg-emerald-50/20"><CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-emerald-700" />{title}</CardTitle><CardDescription className="mt-1">{description ?? "Permanent records from this exact context. Search them, open the full history, or reopen the same item without rerouting it."}</CardDescription></div><span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" />Canonical history</span></div></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-2" role="group" aria-label="History type"><Button type="button" size="sm" variant={type === "all" ? "default" : "outline"} onClick={() => setType("all")}>All history</Button><Button type="button" size="sm" variant={type === "todo" ? "default" : "outline"} onClick={() => setType("todo")}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Completed To-Dos</Button><Button type="button" size="sm" variant={type === "issue" ? "default" : "outline"} onClick={() => setType("issue")}><ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />Resolved Issues</Button></div><div className="grid gap-2 md:grid-cols-[1fr_150px_150px]"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-9 pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search title, details, or completion note" /></div><div className="space-y-1"><Label className="text-xs" htmlFor={`history-from-${contextId ?? "all"}`}>Completed from</Label><Input id={`history-from-${contextId ?? "all"}`} className="h-9" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></div><div className="space-y-1"><Label className="text-xs" htmlFor={`history-to-${contextId ?? "all"}`}>Completed through</Label><Input id={`history-to-${contextId ?? "all"}`} className="h-9" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} /></div></div>{history.isLoading ? <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div> : history.error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">History could not be loaded: {history.error.message}</p> : items.length ? <div className="space-y-2">{items.map((item: any) => <div key={item.id}><PulseInlineItemRow item={item} defaultDestinationId={item.meetingId ?? null} sourceSessionId={sourceSessionId} onChanged={changed} /><p className="px-3 pt-1 text-xs text-muted-foreground">{item.type === "issue" ? "Resolved" : "Completed"} {dateTime(item.completedAt)}{item.solvedNote ? ` · ${item.solvedNote}` : ""}</p></div>)}</div> : <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground"><CalendarDays className="mx-auto mb-2 h-5 w-5 text-emerald-700" />No {type === "issue" ? "resolved Issues" : type === "todo" ? "completed To-Dos" : "completed or resolved work"} matches these filters.</div>}</CardContent></Card>;
}
