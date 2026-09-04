import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, ClipboardCheck, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { PulseInlineItemRow } from "@/components/pulse/PulseItemEditor";

type HistoryType = "all" | "todo" | "issue";

type Props = {
  contextId?: string;
  title?: string;
  description?: string;
  initialType?: HistoryType;
  onlyMine?: boolean;
  sourceSessionId?: string | null;
  canReopen?: boolean;
  onChanged?: () => void;
  compact?: boolean;
};

function dateTime(value?: string | Date | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Unknown date";
}

export function PulseCompletedHistory({ contextId, title = "Completed & Resolved", description, initialType = "all", onlyMine = false, sourceSessionId, canReopen = true, onChanged, compact = false }: Props) {
  const utils = trpc.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<HistoryType>(initialType);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const query = useMemo(() => ({ contextId, type: type === "all" ? undefined : type, search: search.trim() || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, onlyMine }), [contextId, type, search, dateFrom, dateTo, onlyMine]);
  const history = trpc.pulse.workItems.history.useQuery(query, { enabled: isOpen });
  const changed = () => {
    void history.refetch();
    void utils.pulse.personal.dashboard.invalidate();
    void utils.pulse.l10.dashboard.invalidate();
    void utils.pulse.l10.runner.invalidate();
    void utils.pulse.workItems.invalidate();
    onChanged?.();
  };
  const items = history.data ?? [];
  const currentLabel = initialType === "todo" ? "completed To-Dos" : initialType === "issue" ? "resolved Issues" : "completed and resolved work";

  return <Card className="border-emerald-200/80 bg-emerald-50/20">
    <CardHeader className={compact ? "py-2" : "py-3"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-sm"><ClipboardCheck className="h-4 w-4 text-emerald-700" />{title}</CardTitle>
          <CardDescription className="mt-0.5 text-xs">{description ?? "Permanent context-scoped records. Open only when you need to review, search, or reopen work."}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 sm:inline-flex"><ShieldCheck className="h-3.5 w-3.5" />Canonical history</span>
          <Button type="button" size="sm" variant={isOpen ? "secondary" : "outline"} className="h-8" aria-expanded={isOpen} onClick={() => setIsOpen(value => !value)}>{isOpen ? "Collapse history" : `View ${initialType === "todo" ? "completed" : initialType === "issue" ? "resolved" : "history"}`}<ChevronDown className={`ml-1.5 h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} /></Button>
        </div>
      </div>
    </CardHeader>
    {isOpen ? <CardContent className={compact ? "space-y-2 border-t border-emerald-200/70 py-2" : "space-y-3 border-t border-emerald-200/70 pt-3"}>
      <div className={compact ? "flex flex-wrap gap-1.5" : "flex flex-wrap gap-2"} role="group" aria-label="History type">
        <Button type="button" size="sm" variant={type === "all" ? "default" : "outline"} onClick={() => setType("all")}>All history</Button>
        <Button type="button" size="sm" variant={type === "todo" ? "default" : "outline"} onClick={() => setType("todo")}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Completed To-Dos</Button>
        <Button type="button" size="sm" variant={type === "issue" ? "default" : "outline"} onClick={() => setType("issue")}><ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />Resolved Issues</Button>
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_150px_150px]">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-9 pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search title, details, or outcome note" /></div>
        <div className="space-y-1"><Label className="text-xs" htmlFor={`history-from-${contextId ?? "all"}`}>Completed from</Label><Input id={`history-from-${contextId ?? "all"}`} className="h-9" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs" htmlFor={`history-to-${contextId ?? "all"}`}>Completed through</Label><Input id={`history-to-${contextId ?? "all"}`} className="h-9" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} /></div>
      </div>
      {history.isLoading ? <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div> : history.error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">History could not be loaded: {history.error.message}</p> : items.length ? <div className={compact ? "space-y-1" : "space-y-2"}>{items.map((item: any) => <div key={item.id}><PulseInlineItemRow item={item} defaultDestinationId={item.meetingId ?? null} sourceSessionId={sourceSessionId} canReopen={canReopen} onChanged={changed} /><p className="px-2 pt-0.5 text-xs text-muted-foreground">{item.type === "issue" ? "Resolved" : "Completed"} {dateTime(item.completedAt)}{item.solvedNote ? ` · ${item.solvedNote}` : ""}</p></div>)}</div> : <div className={compact ? "rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground" : "rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground"}><CalendarDays className="mx-auto mb-2 h-5 w-5 text-emerald-700" />No {type === "issue" ? "resolved Issues" : type === "todo" ? "completed To-Dos" : "completed or resolved work"} matches these filters.</div>}
    </CardContent> : <CardContent className={compact ? "border-t border-emerald-200/70 py-1.5 text-xs text-muted-foreground" : "border-t border-emerald-200/70 py-2.5 text-xs text-muted-foreground"}>{currentLabel.charAt(0).toUpperCase() + currentLabel.slice(1)} are retained here in the same permanent record and stay collapsed until recalled.</CardContent>}
  </Card>;
}
