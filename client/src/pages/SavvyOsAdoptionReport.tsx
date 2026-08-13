import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownUp,
  CheckCircle2,
  ClipboardCheck,
  LogIn,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AdoptionAgent = {
  agentId: number;
  agentName: string;
  agentEmail: string | null;
  accountType: "full_user" | "teammate";
  lastLoginAt: Date | string | null;
  daysSinceLogin: number | null;
  contactActivitiesWeek: number;
  notesWeek: number;
  tasksCompletedWeek: number;
  activePipelineLeads: number;
  newLeads: number;
  attemptedContact: number;
  nurture: number;
  activeClients: number;
  underContract: number;
  closedLeads: number;
  deadLeads: number;
  averageLeadAgeDays: number | null;
  activityScore: number;
  scoreBreakdown: {
    loginRecency: number;
    contactActivity: number;
    completedTasks: number;
    pipelineCoverage: number;
    leadFreshness: number;
  };
};

type AdoptionData = {
  generatedAt: Date | string;
  scoreDefinition: Array<{ label: string; maximum: number; detail: string }>;
  summary: {
    totalAgents: number;
    signInEnabledAgents: number;
    loggedInLast7Days: number;
    activeThisWeek: number;
    loginRisk: number;
    averageActivityScore: number;
  };
  agents: AdoptionAgent[];
};

type SortKey =
  | "activityScore"
  | "agentName"
  | "lastLoginAt"
  | "contactActivitiesWeek"
  | "tasksCompletedWeek"
  | "averageLeadAgeDays"
  | "activePipelineLeads"
  | "newLeads"
  | "attemptedContact"
  | "nurture"
  | "activeClients"
  | "underContract"
  | "closedLeads"
  | "deadLeads";

type SortState = { key: SortKey; direction: "asc" | "desc" };

function numeric(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString();
}

function days(value: number | null): string {
  return value === null ? "—" : `${Number(value).toFixed(1)}d`;
}

function dateTime(value: Date | string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function loginLabel(agent: AdoptionAgent): string {
  if (agent.accountType === "teammate") return "Directory only";
  if (agent.daysSinceLogin === null) return "No recorded login";
  if (agent.daysSinceLogin === 0) return "Today";
  if (agent.daysSinceLogin === 1) return "Yesterday";
  return `${numeric(agent.daysSinceLogin)}d ago`;
}

function scoreTone(score: number): string {
  if (score >= 70) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (score >= 40) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function scoreTitle(agent: AdoptionAgent): string {
  const score = agent.scoreBreakdown;
  return `Login recency: ${score.loginRecency}/30 · Contact activity: ${score.contactActivity}/25 · Completed tasks: ${score.completedTasks}/15 · Active pipeline: ${score.pipelineCoverage}/15 · Lead freshness: ${score.leadFreshness}/15`;
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  tone: string;
}) {
  return <Card className="border-border/80 shadow-sm"><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div><span className={`rounded-xl bg-muted p-2.5 ${tone}`}><Icon className="h-4 w-4" /></span></div></CardContent></Card>;
}

function SortHeader({
  label,
  column,
  sort,
  onSort,
  align = "right",
  title,
}: {
  label: string;
  column: SortKey;
  sort: SortState;
  onSort: (column: SortKey) => void;
  align?: "left" | "right";
  title?: string;
}) {
  const selected = sort.key === column;
  return <th className={`px-3 py-3 ${align === "left" ? "text-left" : "text-right"} font-semibold`} title={title}><button type="button" onClick={() => onSort(column)} className={`inline-flex items-center gap-1 transition hover:text-foreground ${align === "right" ? "ml-auto" : ""} ${selected ? "text-foreground" : ""}`}><span>{label}</span><ArrowDownUp className={`h-3.5 w-3.5 ${selected ? "text-primary" : "opacity-50"}`} /></button></th>;
}

export function SavvyOsAdoptionReport({ data }: { data: AdoptionData }) {
  const [sort, setSort] = useState<SortState>({ key: "activityScore", direction: "desc" });

  const agents = useMemo(() => {
    const valueFor = (agent: AdoptionAgent, key: SortKey): string | number => {
      if (key === "agentName") return agent.agentName;
      if (key === "lastLoginAt") return agent.lastLoginAt ? new Date(agent.lastLoginAt).getTime() : -1;
      if (key === "averageLeadAgeDays") return agent.averageLeadAgeDays ?? Number.POSITIVE_INFINITY;
      return agent[key] as number;
    };
    return [...data.agents].sort((left, right) => {
      const leftValue = valueFor(left, sort.key);
      const rightValue = valueFor(right, sort.key);
      const comparison = typeof leftValue === "string" && typeof rightValue === "string"
        ? leftValue.localeCompare(rightValue)
        : Number(leftValue) - Number(rightValue);
      if (comparison !== 0) return sort.direction === "asc" ? comparison : -comparison;
      return left.agentName.localeCompare(right.agentName);
    });
  }, [data.agents, sort]);

  const updateSort = (key: SortKey) => {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "agentName" ? "asc" : "desc" });
  };

  return <div className="space-y-6">
    <section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] via-background to-emerald-50/60 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Platform adoption</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">SavvyOS Adoption</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">A current operating view of whether each agent is signing in, working leads, logging contact activity, completing work, and keeping their active pipeline fresh. The default ranking is the Activity Score; every column is sortable for targeted follow-up.</p>
        </div>
        <Badge variant="secondary" className="h-7 w-fit gap-1"><UsersRound className="h-3.5 w-3.5" />{numeric(data.summary.totalAgents)} active agents</Badge>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <SummaryCard label="Average Activity Score" value={`${numeric(data.summary.averageActivityScore)} / 100`} detail="Across all active agents" icon={Activity} tone="text-primary" />
      <SummaryCard label="Logged in this week" value={`${numeric(data.summary.loggedInLast7Days)} / ${numeric(data.summary.signInEnabledAgents)}`} detail="Full users with a login in the last 7 days" icon={LogIn} tone="text-emerald-700" />
      <SummaryCard label="Active this week" value={numeric(data.summary.activeThisWeek)} detail="Logged contact activity or completed a task" icon={ClipboardCheck} tone="text-sky-700" />
      <SummaryCard label="Login risk" value={numeric(data.summary.loginRisk)} detail="No login recorded or last login over 30 days ago" icon={ShieldAlert} tone="text-rose-700" />
      <SummaryCard label="Sign-in enabled" value={numeric(data.summary.signInEnabledAgents)} detail="Directory-only teammates remain visible but are not scored" icon={CheckCircle2} tone="text-violet-700" />
    </section>

    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Activity Score methodology</CardTitle>
        <CardDescription>The 100-point score intentionally measures SavvyOS engagement and pipeline stewardship, not sales production. Contact activity is limited to notes, calls, emails, SMS, meetings, and voice notes logged against a contact or lead. The current week begins Monday.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {data.scoreDefinition.map((item) => <div key={item.label} className="rounded-lg border bg-muted/20 p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{item.label}</p><Badge variant="secondary">{item.maximum} pts</Badge></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</p></div>)}
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Agent adoption detail</CardTitle>
        <CardDescription>Click any table heading to sort. Hover an Activity Score for its exact point breakdown.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1740px] text-sm">
            <thead>
              <tr className="border-y bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <SortHeader label="Activity Score" column="activityScore" sort={sort} onSort={updateSort} title="Sorted by adoption score by default" />
                <SortHeader label="Agent" column="agentName" sort={sort} onSort={updateSort} align="left" />
                <SortHeader label="Last Login" column="lastLoginAt" sort={sort} onSort={updateSort} title="Most recent recorded sign-in" />
                <SortHeader label="Contact Activity" column="contactActivitiesWeek" sort={sort} onSort={updateSort} title="This week: notes, calls, emails, SMS, meetings, and voice notes on a contact or lead" />
                <SortHeader label="Tasks Done" column="tasksCompletedWeek" sort={sort} onSort={updateSort} title="Tasks completed this week" />
                <SortHeader label="Avg. Lead Age" column="averageLeadAgeDays" sort={sort} onSort={updateSort} title="Average days since qualifying activity across active pipeline leads" />
                <SortHeader label="Active" column="activePipelineLeads" sort={sort} onSort={updateSort} title="New, attempted contact, nurture, active client, and under-contract leads" />
                <SortHeader label="New" column="newLeads" sort={sort} onSort={updateSort} />
                <SortHeader label="Attempted" column="attemptedContact" sort={sort} onSort={updateSort} />
                <SortHeader label="Nurture" column="nurture" sort={sort} onSort={updateSort} />
                <SortHeader label="Active Client" column="activeClients" sort={sort} onSort={updateSort} />
                <SortHeader label="UC" column="underContract" sort={sort} onSort={updateSort} title="Under-contract leads" />
                <SortHeader label="Closed" column="closedLeads" sort={sort} onSort={updateSort} />
                <SortHeader label="Dead" column="deadLeads" sort={sort} onSort={updateSort} />
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => <tr key={agent.agentId} className="border-b last:border-0 hover:bg-muted/25">
                <td className="px-3 py-3 text-right"><Badge variant="outline" className={`min-w-14 justify-center tabular-nums ${scoreTone(agent.activityScore)}`} title={scoreTitle(agent)}>{numeric(agent.activityScore)}</Badge></td>
                <td className="px-3 py-3"><p className="font-medium">{agent.agentName}</p><p className="mt-0.5 text-xs text-muted-foreground">{agent.accountType === "teammate" ? "Directory-only teammate" : agent.agentEmail ?? "No email"}</p></td>
                <td className="px-3 py-3 text-right"><p className="font-medium tabular-nums">{loginLabel(agent)}</p><p className="mt-0.5 text-xs text-muted-foreground">{agent.accountType === "full_user" ? dateTime(agent.lastLoginAt) : "Sign-in not enabled"}</p></td>
                <td className="px-3 py-3 text-right"><p className="font-medium tabular-nums">{numeric(agent.contactActivitiesWeek)}</p><p className="mt-0.5 text-xs text-muted-foreground">{numeric(agent.notesWeek)} note{agent.notesWeek === 1 ? "" : "s"}</p></td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">{numeric(agent.tasksCompletedWeek)}</td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">{days(agent.averageLeadAgeDays)}</td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">{numeric(agent.activePipelineLeads)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{numeric(agent.newLeads)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{numeric(agent.attemptedContact)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{numeric(agent.nurture)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{numeric(agent.activeClients)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{numeric(agent.underContract)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{numeric(agent.closedLeads)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{numeric(agent.deadLeads)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </div>;
}
