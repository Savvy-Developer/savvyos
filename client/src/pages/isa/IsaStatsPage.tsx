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
  Loader2,
  PhoneCall,
  Target,
  TrendingUp,
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

function OutcomeStep({
  label,
  value,
  rate,
  tone,
}: {
  label: string;
  value: number;
  rate?: number | null;
  tone: "blue" | "amber" | "emerald";
}) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-75">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      {rate !== undefined && <p className="mt-1 text-xs font-medium">{formatPct(rate)} of appointments</p>}
    </div>
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

  const summary = statsQuery.data?.summary;
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
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Lead metrics reflect contacts created in the selected period. Appointment results reflect appointments set in the selected period and their current lead outcome. Task and Market Match metrics are measured by activity date.
          </p>
        </CardContent>
      </Card>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Appointment Outcomes</h2>
          <Badge variant="secondary">Selected period</Badge>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard label="Appointments Set" value={summary?.appointmentsSet ?? 0} description="Appointments generated by you" icon={CalendarDays} tone="blue" />
          <MetricCard label="Under Contract" value={summary?.underContract ?? 0} description={`${formatPct(summary?.appointmentToContractRate)} of selected appointments`} icon={Handshake} tone="amber" />
          <MetricCard label="Closed" value={summary?.closed ?? 0} description={`${formatPct(summary?.appointmentToCloseRate)} of selected appointments`} icon={CheckCircle2} tone="emerald" />
        </div>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-primary" />Appointment-to-Outcome Funnel</CardTitle>
          <CardDescription>Track the downstream impact of the appointments you created during the selected period.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <OutcomeStep label="Appointments Set" value={summary?.appointmentsSet ?? 0} tone="blue" />
            <OutcomeStep label="Under Contract" value={summary?.underContract ?? 0} rate={summary?.appointmentToContractRate} tone="amber" />
            <OutcomeStep label="Closed" value={summary?.closed ?? 0} rate={summary?.appointmentToCloseRate} tone="emerald" />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">An appointment is counted from an assigned lead’s recorded appointment. Outcome status is evaluated as of today, so the funnel preserves long-term attribution to your work.</p>
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
