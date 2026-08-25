import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Flame,
  Handshake,
  History,
  Link2,
  Loader2,
  PhoneCall,
  ShieldCheck,
  Target,
  TrendingUp,
  Trophy,
  Users,
  UserRoundCheck,
} from "lucide-react";

const STATUSES = [
  { value: "new_lead", label: "New Lead" },
  { value: "attempted_contact", label: "Attempted Contact" },
  { value: "nurture", label: "Nurture" },
  { value: "active_client", label: "Active Client" },
  { value: "under_contract", label: "Under Contract" },
  { value: "closed", label: "Closed" },
  { value: "dead", label: "Dead" },
] as const;

type Status = (typeof STATUSES)[number]["value"];

type RangePreset = "week" | "month" | "quarter" | "year" | "custom";

function dayString(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function getRange(preset: Exclude<RangePreset, "custom">) {
  const today = new Date();
  const end = dayString(today);
  const start = new Date(today);
  if (preset === "week") start.setDate(today.getDate() - 6);
  if (preset === "month") start.setDate(1);
  if (preset === "quarter") start.setMonth(today.getMonth() - 2, 1);
  if (preset === "year") start.setMonth(0, 1);
  return { dateFrom: dayString(start), dateTo: end };
}

function formatPct(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${Math.round(value)}%`;
}

function monthLabel(value: string) {
  if (!value) return "";
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleString("en-US", { month: "short" });
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function attributionLabel(value: string) {
  if (value === "appointment_setter") return "Appointment setter";
  if (value === "manual") return "Manual attribution";
  return "Assigned ISA at transaction";
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  description: string;
  icon: React.ElementType;
  tone?: "blue" | "indigo" | "emerald" | "amber" | "rose" | "violet";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    indigo: "bg-indigo-50 text-indigo-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          </div>
          <div className={`shrink-0 rounded-xl p-2.5 ${tones[tone]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function IsaStatsPage() {
  const { user } = useAuth() as any;
  const [, navigate] = useLocation();
  const isAdmin = user?.role === "admin";
  const [preset, setPreset] = useState<RangePreset>("month");
  const initialRange = getRange("month");
  const [dateFrom, setDateFrom] = useState(initialRange.dateFrom);
  const [dateTo, setDateTo] = useState(initialRange.dateTo);
  const [selectedStatuses, setSelectedStatuses] = useState<Status[]>([]);
  const [selectedIsaId, setSelectedIsaId] = useState<string>("");
  const [benchmarkPeriod, setBenchmarkPeriod] = useState<"week" | "month">("month");

  const { data: teamMembers } = trpc.users.list.useQuery({}, { enabled: isAdmin });
  const isas = (teamMembers ?? []).filter((member: any) => member.role === "isa");
  const effectiveIsaId = isAdmin ? (selectedIsaId ? Number(selectedIsaId) : isas[0]?.id) : undefined;

  const statsQuery = trpc.analytics.isaDashboard.useQuery(
    {
      dateFrom,
      dateTo,
      ...(isAdmin && effectiveIsaId ? { isaId: effectiveIsaId } : {}),
      ...(selectedStatuses.length ? { statuses: selectedStatuses } : {}),
    },
    { enabled: !isAdmin || Boolean(effectiveIsaId) },
  );

  const benchmarkQuery = trpc.analytics.isaTeamBenchmark.useQuery({
    period: benchmarkPeriod,
    ...(isAdmin && effectiveIsaId ? { viewerIsaId: effectiveIsaId } : {}),
  });
  const benchmark = benchmarkQuery.data;
  const benchmarkViewer = benchmark?.leaderboard.find((row) => row.isViewer);

  const summary = statsQuery.data?.summary;
  const attributedOutcomes = statsQuery.data?.attributedOutcomes ?? [];
  const trend = useMemo(
    () => (statsQuery.data?.trend ?? []).map((row) => ({
      ...row,
      label: monthLabel(row.month),
    })),
    [statsQuery.data?.trend],
  );

  const applyPreset = (nextPreset: Exclude<RangePreset, "custom">) => {
    const range = getRange(nextPreset);
    setPreset(nextPreset);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
  };

  const updateDate = (field: "from" | "to", value: string) => {
    setPreset("custom");
    if (field === "from") setDateFrom(value);
    else setDateTo(value);
  };

  const toggleStatus = (status: Status) => {
    setSelectedStatuses((current) => current.includes(status)
      ? current.filter((value) => value !== status)
      : [...current, status]);
  };

  if ((statsQuery.isLoading && !statsQuery.data) || (isAdmin && !effectiveIsaId && teamMembers === undefined)) {
    return (
      <div className="flex min-h-[58vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm">Loading performance data…</p>
        </div>
      </div>
    );
  }

  if (isAdmin && !effectiveIsaId) {
    return (
      <div className="space-y-6">
        <PageHeader title="ISA Performance" subtitle="Select an ISA to review individual activity and appointment outcomes." />
        <Card className="border-dashed">
          <CardContent className="flex min-h-52 flex-col items-center justify-center text-center">
            <Users className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="font-medium">No active ISA profile is available</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">Create or activate an ISA profile before reviewing a personal performance dashboard.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const focus = summary?.overdueFollowUps
    ? {
        title: `Clear ${summary.overdueFollowUps} overdue follow-up${summary.overdueFollowUps === 1 ? "" : "s"}`,
        description: "Timely follow-up is the fastest way to protect active conversations and keep appointment opportunities moving.",
        action: "Open tasks",
        onClick: () => navigate("/tasks"),
        icon: Clock3,
        tone: "rose",
      }
    : summary?.untouchedLeads
      ? {
          title: `Start with ${summary.untouchedLeads} untouched lead${summary.untouchedLeads === 1 ? "" : "s"}`,
          description: "Every first conversation creates an opportunity to earn trust, qualify the lead, and set the next appointment.",
          action: "Open leads",
          onClick: () => navigate("/contacts"),
          icon: PhoneCall,
          tone: "amber",
        }
      : {
          title: "Keep your appointment momentum going",
          description: "Your next best action is to create a meaningful next step for every active lead, then document the follow-up while the conversation is fresh.",
          action: "View lead queue",
          onClick: () => navigate("/contacts"),
          icon: Flame,
          tone: "emerald",
        };
  const FocusIcon = focus.icon;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title={isAdmin ? "ISA Performance" : "My Performance"}
        subtitle="Appointments, downstream outcomes, and the activity that keeps your lead pipeline moving."
        actions={
          <Button variant="outline" size="sm" onClick={() => statsQuery.refetch()} disabled={statsQuery.isFetching}>
            {statsQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrendingUp className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:flex xl:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="isa-stats-from" className="text-xs">From</Label>
                <Input id="isa-stats-from" type="date" value={dateFrom} onChange={(event) => updateDate("from", event.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="isa-stats-to" className="text-xs">To</Label>
                <Input id="isa-stats-to" type="date" value={dateTo} onChange={(event) => updateDate("to", event.target.value)} className="h-9" />
              </div>
              {isAdmin && (
                <div className="col-span-2 space-y-1.5 xl:w-52">
                  <Label className="text-xs">ISA</Label>
                  <Select value={selectedIsaId || String(effectiveIsaId ?? "")} onValueChange={setSelectedIsaId}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select ISA" /></SelectTrigger>
                    <SelectContent>
                      {isas.map((isa: any) => <SelectItem key={isa.id} value={String(isa.id)}>{isa.name ?? `ISA #${isa.id}`}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="col-span-2 space-y-1.5 xl:w-52">
                <Label className="text-xs">Lead status</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-9 w-full justify-between font-normal">
                      <span className="truncate">{selectedStatuses.length ? `${selectedStatuses.length} status${selectedStatuses.length === 1 ? "" : "es"} selected` : "All statuses"}</span>
                      <ArrowRight className="h-3.5 w-3.5 rotate-90 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium">Filter lead status</p>
                      {selectedStatuses.length > 0 && <button className="text-xs font-medium text-primary hover:underline" onClick={() => setSelectedStatuses([])}>Clear</button>}
                    </div>
                    <div className="space-y-2">
                      {STATUSES.map((status) => (
                        <label key={status.value} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted/60">
                          <Checkbox checked={selectedStatuses.includes(status.value)} onCheckedChange={() => toggleStatus(status.value)} />
                          {status.label}
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([
                ["week", "Last 7 days"],
                ["month", "This month"],
                ["quarter", "Last 90 days"],
                ["year", "YTD"],
              ] as const).map(([value, label]) => (
                <Button key={value} type="button" size="sm" variant={preset === value ? "default" : "outline"} onClick={() => applyPreset(value)}>{label}</Button>
              ))}
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-xs leading-5 text-blue-900">
            <strong>Activity window:</strong> lead, appointment, completed-task, Market Match, and Closed-in-period metrics follow the selected dates. <strong>Current Under Contract</strong> ignores the date range, and <strong>Lifetime Closed</strong> is always all-time. The lead-status filter affects lead and appointment activity only; it does not remove attributed transaction outcomes.
          </div>
        </CardContent>
      </Card>

      <section>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h2 className="text-base font-semibold">Team Benchmark</h2>
            <Badge variant="secondary">Current {benchmarkPeriod}</Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant={benchmarkPeriod === "week" ? "default" : "outline"} onClick={() => setBenchmarkPeriod("week")}>This week</Button>
            <Button size="sm" variant={benchmarkPeriod === "month" ? "default" : "outline"} onClick={() => setBenchmarkPeriod("month")}>This month</Button>
          </div>
        </div>
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-4 w-4 text-amber-500" />Where you stand</CardTitle>
            <CardDescription>Compare the same activity period across active ISAs. Current Under Contract is always current inventory; Closed uses the selected benchmark period.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {benchmarkQuery.isLoading ? (
              <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading team benchmark…</div>
            ) : !benchmark?.leaderboard.length ? (
              <div className="flex h-48 flex-col items-center justify-center px-6 text-center text-muted-foreground"><Users className="mb-3 h-7 w-7 opacity-35" /><p className="text-sm font-medium">No active ISA benchmark data yet</p><p className="mt-1 text-xs">The leaderboard will populate as active ISA profiles and activity records are available.</p></div>
            ) : (
              <>
                <div className="grid gap-3 border-b p-4 sm:grid-cols-3">
                  <div className="rounded-lg bg-amber-50 p-3">
                    <p className="text-xs font-medium text-amber-700">{isAdmin ? "Selected ISA rank" : "Your appointment rank"}</p>
                    <p className="mt-1 text-2xl font-semibold text-amber-800">{benchmarkViewer ? `#${benchmarkViewer.rank}` : "—"}<span className="ml-1 text-sm font-medium text-amber-700">of {benchmark.teamSize}</span></p>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3">
                    <p className="text-xs font-medium text-blue-700">Team average appointments</p>
                    <p className="mt-1 text-2xl font-semibold text-blue-800">{Math.round(benchmark.averages.appointmentsSet * 10) / 10}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-3">
                    <p className="text-xs font-medium text-emerald-700">Team average follow-ups</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-800">{Math.round(benchmark.averages.completedFollowUps * 10) / 10}</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Rank</th>
                        <th className="px-4 py-3 text-left font-medium">ISA</th>
                        <th className="px-4 py-3 text-right font-medium">Appointments</th>
                        <th className="px-4 py-3 text-right font-medium">Engaged leads</th>
                        <th className="px-4 py-3 text-right font-medium">Current UC</th>
                        <th className="px-4 py-3 text-right font-medium">Closed in period</th>
                        <th className="px-4 py-3 text-right font-medium">Follow-ups</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {benchmark.leaderboard.map((row) => (
                        <tr key={row.isaId} className={row.isViewer ? "bg-primary/[0.06]" : "hover:bg-muted/30"}>
                          <td className="px-4 py-3 font-semibold">{row.rank === 1 ? <span className="inline-flex items-center gap-1 text-amber-600"><Trophy className="h-3.5 w-3.5" />1</span> : `#${row.rank}`}</td>
                          <td className="px-4 py-3 font-medium">{row.isaName}{row.isViewer && <Badge variant="secondary" className="ml-2 text-[10px]">{isAdmin ? "Selected" : "You"}</Badge>}</td>
                          <td className="px-4 py-3 text-right font-semibold text-primary">{row.appointmentsSet}</td>
                          <td className="px-4 py-3 text-right">{row.engagedLeads}</td>
                          <td className="px-4 py-3 text-right">{row.underContract}</td>
                          <td className="px-4 py-3 text-right">{row.closed}</td>
                          <td className="px-4 py-3 text-right">{row.completedFollowUps}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Attributed Transaction Outcomes</h2>
          <Badge variant="secondary">Stable ISA credit</Badge>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Appointments Set" value={summary?.appointmentsSet ?? 0} description="Recorded by you in the selected period" icon={CalendarDays} tone="blue" />
          <MetricCard label="Current Under Contract" value={summary?.underContract ?? 0} description="All current attributed deals; date filter does not apply" icon={Handshake} tone="amber" />
          <MetricCard label="Closed in Period" value={summary?.closed ?? 0} description="Attributed closings whose closing date is in the selected period" icon={CheckCircle2} tone="emerald" />
          <MetricCard label="Lifetime Closed" value={summary?.lifetimeClosed ?? 0} description="All attributed closed transactions in SavvyOS" icon={History} tone="violet" />
        </div>
      </section>

      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />How SavvyOS gives you outcome credit</CardTitle>
          <CardDescription>Credit is saved separately from daily activity so a later reassignment or date filter cannot silently erase it.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-blue-600" />1. Appointment setter</div>
              <p className="text-xs leading-5 text-muted-foreground">When an ISA records an appointment while connecting a contact to an agent, SavvyOS saves that ISA on the appointment.</p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-amber-600" />2. Transaction attribution</div>
              <p className="text-xs leading-5 text-muted-foreground">When a transaction is recorded, credit goes to the recorded appointment setter for that contact and agent. If no recorded appointment exists, credit falls back to the contact’s assigned ISA at that time.</p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-600" />3. Credit stays put</div>
              <p className="text-xs leading-5 text-muted-foreground">Later contact reassignment does not move the outcome. Under Contract reflects current transaction status; Closed-in-period follows the transaction closing date.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <CardTitle className="flex items-center gap-2 text-base"><Handshake className="h-4 w-4 text-primary" />Your attributed deals</CardTitle>
          <CardDescription>The latest Under Contract and Closed transactions credited to this ISA, with the attribution method shown.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {attributedOutcomes.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Transaction</th>
                    <th className="px-4 py-3 text-left font-medium">Contact</th>
                    <th className="px-4 py-3 text-left font-medium">Agent</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Outcome date</th>
                    <th className="px-4 py-3 text-left font-medium">Credit source</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {attributedOutcomes.map((row) => (
                    <tr key={row.transactionId} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Button variant="link" className="h-auto p-0 font-semibold" onClick={() => navigate(`/transactions/${row.transactionId}`)}>
                          {row.transactionNumber || `Transaction #${row.transactionId}`}
                        </Button>
                      </td>
                      <td className="px-4 py-3 font-medium">{row.contactName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.agentName ?? "—"}</td>
                      <td className="px-4 py-3"><Badge variant={row.status === "closed" ? "default" : "secondary"}>{row.status === "closed" ? "Closed" : "Under Contract"}</Badge></td>
                      <td className="px-4 py-3">{formatDate(row.status === "closed" ? row.closedAt : row.underContractAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{attributionLabel(row.attributionBasis)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center px-6 text-center text-muted-foreground">
              <Handshake className="mb-3 h-8 w-8 opacity-35" />
              <p className="text-sm font-medium">No attributed transactions yet</p>
              <p className="mt-1 max-w-lg text-xs">When an assigned or appointment-linked contact reaches Under Contract or Closed in SavvyOS, the transaction will appear here automatically.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <UserRoundCheck className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Lead Engagement & Activity</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Engaged Leads" value={summary?.engagedLeads ?? 0} description={`${formatPct(summary?.engagementRate)} of leads moved beyond new`} icon={Users} tone="violet" />
          <MetricCard label="Completed Follow-ups" value={summary?.completedFollowUps ?? 0} description={`${summary?.overdueFollowUps ?? 0} overdue follow-up${summary?.overdueFollowUps === 1 ? "" : "s"}`} icon={ClipboardCheck} tone={summary?.overdueFollowUps ? "rose" : "emerald"} />
          <MetricCard label="Market Match Sessions" value={summary?.completedMarketMatchSessions ?? 0} description={`${summary?.marketMatchSessions ?? 0} total session${summary?.marketMatchSessions === 1 ? "" : "s"} started`} icon={PhoneCall} tone="indigo" />
          <MetricCard label="Active Lead Conversations" value={summary?.activeLeads ?? 0} description={`${summary?.untouchedLeads ?? 0} leads still need a first touch`} icon={Flame} tone="amber" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-primary" />Appointment Momentum</CardTitle>
            <CardDescription>Appointments set over the selected period.</CardDescription>
          </CardHeader>
          <CardContent>
            {trend.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={trend} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "rgba(99, 102, 241, 0.06)" }} formatter={(value: number) => [value, "Appointments"]} labelFormatter={(label) => `${label} appointments`} />
                  <Bar dataKey="appointmentsSet" fill="#4f46e5" radius={[5, 5, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[250px] flex-col items-center justify-center text-center text-muted-foreground">
                <CalendarDays className="mb-3 h-8 w-8 opacity-35" />
                <p className="text-sm font-medium">No appointments in this period</p>
                <p className="mt-1 max-w-sm text-xs">Start a conversation with an assigned lead and record the appointment to build momentum here.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.07] via-background to-background lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><FocusIcon className="h-4 w-4 text-primary" />Your next best focus</CardTitle>
            <CardDescription>A practical prompt based on your current workload.</CardDescription>
          </CardHeader>
          <CardContent className="flex h-[calc(100%-5rem)] flex-col">
            <h3 className="text-lg font-semibold tracking-tight">{focus.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{focus.description}</p>
            <Button className="mt-auto w-full sm:w-auto" onClick={focus.onClick}>{focus.action}<ArrowRight className="ml-2 h-4 w-4" /></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
