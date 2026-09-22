import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Megaphone, PhoneCall, RefreshCw, Target, TrendingUp, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Level = "campaign" | "adSet" | "ad";
type Preset = "last30" | "mtd" | "qtd" | "ytd" | "all" | "custom";

function localDay(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function presetRange(preset: Preset): { from?: string; to?: string } {
  const now = new Date();
  const to = localDay(now);
  if (preset === "all") return {};
  if (preset === "last30") return { from: localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)), to };
  if (preset === "mtd") return { from: localDay(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  if (preset === "qtd") return { from: localDay(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), to };
  return { from: localDay(new Date(now.getFullYear(), 0, 1)), to };
}

function integer(value: unknown): string {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount).toLocaleString() : "—";
}

function percent(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toFixed(1)}%` : "—";
}

function dateLabel(value: unknown): string {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function titleCase(value: string | null): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

const LEVEL_LABEL: Record<Level, string> = { campaign: "Campaign", adSet: "Ad set", ad: "Ad" };

function Metric({ title, value, detail, icon: Icon }: { title: string; value: string; detail: string; icon: typeof Users }) {
  return <Card className="h-full"><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p><p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div><span className="rounded-lg bg-muted p-2 text-primary"><Icon className="h-4 w-4" /></span></div></CardContent></Card>;
}

/**
 * Leads per ad and what happened to them. Built for the question "which ads
 * bring people who actually book and buy", which lead-source reporting cannot
 * answer because every paid lead shares one lead source.
 */
export default function LeadFlowByAdPage() {
  const [location, navigate] = useLocation();
  const [preset, setPreset] = useState<Preset>("last30");
  const [custom, setCustom] = useState(presetRange("last30"));
  const [level, setLevel] = useState<Level>("campaign");
  const [source, setSource] = useState("all");
  const [open, setOpen] = useState<string | null>(null);

  const range = preset === "custom" ? custom : presetRange(preset);
  const input = useMemo(() => ({
    dateFrom: range.from,
    dateTo: range.to,
    level,
    utmSource: source === "all" ? undefined : source,
  }), [range.from, range.to, level, source]);
  const query = trpc.analytics.leadFlowByAd.useQuery(input, { staleTime: 30_000 });
  // The source list comes from an unfiltered load, so picking one source does
  // not remove the others from the menu.
  const sourcesQuery = trpc.analytics.leadFlowByAd.useQuery({ ...input, utmSource: undefined, level: "campaign" }, { staleTime: 60_000 });
  const report = query.data;
  const totals = report?.totals;
  const openContact = (contactId: number) => navigate(`/contacts/${contactId}?analytics=1&report=lead-flow-by-ad&returnTo=${encodeURIComponent(location)}`);

  return <div className="space-y-5">
    <PageHeader
      title="Lead Flow by Ad"
      subtitle="Every lead that came in from an ad, grouped by campaign, ad set or ad, and what has happened to them since: booked calls, contracts and closes."
      actions={<Button size="sm" variant="outline" onClick={() => navigate("/analytics")}>Analytics report library</Button>}
    />
    <nav aria-label="Analytics report library" className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-2 text-sm">
      <Button size="sm" variant="ghost" onClick={() => navigate("/analytics?report=transactions")}>01 · Transaction Intelligence</Button>
      <Button size="sm" variant="ghost" onClick={() => navigate("/analytics/lead-cohorts")}>02 · Lead Cohort Conversion</Button>
      <span className="rounded-md bg-background px-3 py-1.5 font-medium shadow-sm">03 · Lead Flow by Ad</span>
    </nav>

    <Card className="border-primary/15"><CardContent className="p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1"><Label className="text-xs">Leads that came in</Label><Select value={preset} onValueChange={value => { setPreset(value as Preset); setOpen(null); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="last30">Last 30 days</SelectItem><SelectItem value="mtd">Month to date</SelectItem><SelectItem value="qtd">Quarter to date</SelectItem><SelectItem value="ytd">Year to date</SelectItem><SelectItem value="all">All time</SelectItem><SelectItem value="custom">Custom range</SelectItem></SelectContent></Select></div>
        <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={range.from ?? ""} disabled={preset === "all"} onChange={event => { setPreset("custom"); setCustom({ ...range, from: event.target.value || undefined }); }} /></div>
        <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={range.to ?? ""} disabled={preset === "all"} onChange={event => { setPreset("custom"); setCustom({ ...range, to: event.target.value || undefined }); }} /></div>
        <div className="space-y-1"><Label className="text-xs">Group by</Label><Select value={level} onValueChange={value => { setLevel(value as Level); setOpen(null); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="campaign">Campaign</SelectItem><SelectItem value="adSet">Campaign › ad set</SelectItem><SelectItem value="ad">Campaign › ad set › ad</SelectItem></SelectContent></Select></div>
        <div className="space-y-1"><Label className="text-xs">Platform (utm_source)</Label><Select value={source} onValueChange={value => { setSource(value); setOpen(null); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All platforms</SelectItem>{(sourcesQuery.data?.sources ?? []).map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">Leads are contacts created in the range that carry an ad tracking tag (utm_campaign, utm_term or utm_content). The campaign is utm_campaign, the ad set utm_term and the ad utm_content, which is how Meta and Google Ads fill them in. Each contact shows under the last ad they came through. A booked call, contract or close counts only if it happened after the lead came in. Ad spend is not in SavvyOS, so there are no cost figures here.</p>
    </CardContent></Card>

    {query.isLoading ? <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading leads…</div>
      : query.error ? <div className="rounded-lg border border-destructive/35 bg-destructive/5 p-5"><p className="font-semibold">Lead Flow by Ad could not load</p><p className="mt-1 text-sm text-muted-foreground">{query.error.message}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => query.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry</Button></div>
      : <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric title="Leads from ads" value={integer(totals?.leads)} detail={`Across ${integer(report?.groups.length)} ${LEVEL_LABEL[level].toLowerCase()}${report?.groups.length === 1 ? "" : "s"}`} icon={Users} />
          <Metric title="Booked a call" value={integer(totals?.bookedCalls)} detail={`${percent(totals?.bookedPct)} of leads`} icon={PhoneCall} />
          <Metric title="Went under contract" value={integer(totals?.underContract)} detail={`${percent(totals?.contractPct)} of leads`} icon={Target} />
          <Metric title="Closed" value={integer(totals?.closed)} detail={`${percent(totals?.closePct)} of leads`} icon={TrendingUp} />
        </section>
        {report?.truncated && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">This range has more than 5,000 ad leads, so only the newest 5,000 are counted. Narrow the dates for exact figures.</p>}
        <Card><CardHeader><CardTitle className="text-base">Leads by {LEVEL_LABEL[level].toLowerCase()}</CardTitle><CardDescription>Click a row to see the people behind it and where each one is now.</CardDescription></CardHeader><CardContent>
          {!report?.groups.length ? <div className="rounded-lg border border-dashed p-8 text-center"><Megaphone className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 font-medium">No ad leads in this range</p><p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">Leads appear here once they arrive with ad tracking tags, from Calendly bookings or the website forms. Try a wider date range.</p></div>
            : <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">{level === "campaign" ? "Campaign" : level === "adSet" ? "Campaign › ad set" : "Campaign › ad set › ad"}</th><th className="px-3 py-3">Platform</th><th className="px-3 py-3 text-right">Leads</th><th className="px-3 py-3 text-right">Booked call</th><th className="px-3 py-3 text-right">Under contract</th><th className="px-3 py-3 text-right">Closed</th></tr></thead>
              <tbody>{report.groups.map((group: any) => {
                const expanded = open === group.key;
                return [
                  <tr key={group.key} className="cursor-pointer border-t hover:bg-muted/25" onClick={() => setOpen(expanded ? null : group.key)}>
                    <td className="px-3 py-3 font-medium"><span className="inline-flex items-center gap-1.5">{expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}<span className="break-all">{group.key}</span></span></td>
                    <td className="px-3 py-3 text-muted-foreground">{group.sources.join(", ")}</td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">{integer(group.leads)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{integer(group.bookedCalls)} <span className="text-xs text-muted-foreground">({percent(group.bookedPct)})</span></td>
                    <td className="px-3 py-3 text-right tabular-nums">{integer(group.underContract)} <span className="text-xs text-muted-foreground">({percent(group.contractPct)})</span></td>
                    <td className="px-3 py-3 text-right tabular-nums">{integer(group.closed)} <span className="text-xs text-muted-foreground">({percent(group.closePct)})</span></td>
                  </tr>,
                  expanded && <tr key={`${group.key}-people`} className="border-t bg-muted/15"><td colSpan={6} className="px-3 py-3">
                    <table className="w-full text-sm"><thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="py-2 pr-3">Lead</th><th className="py-2 pr-3">Came in</th>{level !== "ad" && <th className="py-2 pr-3">Ad</th>}<th className="py-2 pr-3">Where they are now</th><th className="py-2 pr-3">Booked call</th><th className="py-2 pr-3">Outcome</th></tr></thead>
                      <tbody>{group.contacts.map((contact: any) => <tr key={contact.contactId} className="border-t">
                        <td className="py-2 pr-3"><button type="button" onClick={() => openContact(contact.contactId)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">{contact.contactName}<ExternalLink className="h-3.5 w-3.5" /></button></td>
                        <td className="py-2 pr-3">{dateLabel(contact.createdAt)}</td>
                        {level !== "ad" && <td className="py-2 pr-3 text-muted-foreground">{[contact.utmTerm, contact.utmContent].filter(Boolean).join(" › ") || "—"}</td>}
                        <td className="py-2 pr-3"><Badge variant="outline">{titleCase(contact.stage)}</Badge></td>
                        <td className="py-2 pr-3">{contact.booked ? dateLabel(contact.firstBookedAt) : "—"}</td>
                        <td className="py-2 pr-3 font-medium">{contact.closed ? `Closed ${dateLabel(contact.firstClosingDate)}` : contact.contracted ? `Under contract ${contact.firstContractDate ? dateLabel(contact.firstContractDate) : ""}` : "—"}</td>
                      </tr>)}</tbody></table>
                  </td></tr>,
                ];
              })}</tbody>
            </table></div>}
        </CardContent></Card>
      </>}
  </div>;
}
