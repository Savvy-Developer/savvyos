import { BarChart3, TrendingUp } from "lucide-react";

type RatingDistribution = { rating: number; count: number };
type RatingSummary = { average: number | null; count: number; distribution: RatingDistribution[] };
type RatingHistory = { date: string | Date | null; average: number | null; count: number; current?: boolean };

type Props = {
  summary?: RatingSummary | null;
  history?: RatingHistory[];
  title?: string;
  description?: string;
  showHistory?: boolean;
};

function ratingTone(average: number | null | undefined) {
  if (average == null) return { name: "No ratings yet", card: "border-border bg-muted/20", text: "text-muted-foreground", fill: "bg-muted-foreground/45" };
  if (average >= 8) return { name: "Strong", card: "border-emerald-200 bg-emerald-50/60", text: "text-emerald-700", fill: "bg-emerald-500" };
  if (average >= 6) return { name: "Mixed", card: "border-amber-200 bg-amber-50/65", text: "text-amber-700", fill: "bg-amber-500" };
  return { name: "Needs attention", card: "border-red-200 bg-red-50/65", text: "text-red-700", fill: "bg-red-500" };
}

function dateLabel(value: string | Date | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Undated";
}

export function PulseMeetingRatingSummary({ summary, history = [], title = "Overall meeting rating", description = "Average participant rating and the distribution of ratings saved for this meeting.", showHistory = false }: Props) {
  const distribution = Array.from({ length: 10 }, (_, index) => {
    const rating = 10 - index;
    return { rating, count: summary?.distribution?.find(entry => entry.rating === rating)?.count ?? 0 };
  });
  const maximum = Math.max(1, ...distribution.map(entry => entry.count));
  const tone = ratingTone(summary?.average);
  const orderedHistory = [...history].slice(0, 8).reverse();

  return <section className={`overflow-hidden rounded-lg border ${tone.card}`}>
    <div className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5">
      <div><h3 className="flex items-center gap-1.5 font-semibold"><BarChart3 className={`h-4 w-4 ${tone.text}`} />{title}</h3><p className="mt-0.5 max-w-2xl text-xs leading-4 text-muted-foreground">{description}</p></div>
      <div className={`min-w-[7.5rem] rounded-md border border-current/15 bg-background/65 px-3 py-2 text-right ${tone.text}`}><p className="text-[11px] font-semibold uppercase tracking-wide">{tone.name}</p><p className="mt-0.5 text-3xl font-semibold tracking-tight">{summary?.average == null ? "—" : summary.average.toFixed(1)}<span className="ml-0.5 text-sm font-medium">/10</span></p><p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{summary?.count ?? 0} rating{(summary?.count ?? 0) === 1 ? "" : "s"}</p></div>
    </div>
    <div className="border-t border-current/10 bg-background/55 px-3 py-2.5"><p className="mb-2 text-xs font-semibold text-muted-foreground">Rating distribution</p>{summary?.count ? <div className="space-y-1" role="img" aria-label={`Rating distribution across ${summary.count} saved ratings`}>
      {distribution.map(entry => <div key={entry.rating} className="grid grid-cols-[1.75rem_minmax(0,1fr)_1.5rem] items-center gap-2 text-xs"><span className="font-medium text-muted-foreground">{entry.rating}</span><div className="h-3 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${ratingTone(entry.rating).fill}`} style={{ width: entry.count ? `${Math.max(5, (entry.count / maximum) * 100)}%` : "0%" }} /></div><span className="text-right font-medium text-muted-foreground">{entry.count}</span></div>)}
    </div> : <p className="rounded border border-dashed bg-background/60 px-2 py-3 text-center text-xs text-muted-foreground">Ratings will appear here as meeting leaders save participant feedback.</p>}</div>
    {showHistory ? <div className="border-t border-current/10 bg-background/40 px-3 py-2.5"><p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" />Compare with prior meetings</p>{orderedHistory.length ? <div className="space-y-1.5">{orderedHistory.map((entry, index) => { const historyTone = ratingTone(entry.average); return <div key={`${entry.date}-${index}`} className="grid grid-cols-[3.8rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-xs"><span className="truncate text-muted-foreground">{entry.current ? "Current" : dateLabel(entry.date)}</span><div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${historyTone.fill}`} style={{ width: entry.average == null ? "0%" : `${Math.max(4, Math.min(100, entry.average * 10))}%` }} /></div><span className={`text-right font-semibold ${historyTone.text}`}>{entry.average == null ? "—" : `${entry.average.toFixed(1)}/10`}</span></div>; })}</div> : <p className="text-xs text-muted-foreground">Prior meeting ratings will appear here after sessions are closed.</p>}</div> : null}
  </section>;
}
