import { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Award,
  CalendarDays,
  Crown,
  Flame,
  Gem,
  Medal,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";

type LeaderboardPeriod = "this_week" | "this_month" | "this_quarter" | "ytd" | "all_time";
type DealType = "under_contract" | "closed";

type AgentEntry = {
  agentId: number;
  agentName: string;
  profilePhotoUrl: string | null;
  rank: number;
  units: number;
  volume: number;
  gci: number;
  averageDealSize: number;
};

type Milestone = {
  agentId: number;
  agentName: string;
  profilePhotoUrl: string | null;
  units: number;
  volume: number;
  periodStart?: string | null;
};

const PERIOD_OPTIONS: Array<{ value: LeaderboardPeriod; label: string }> = [
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "ytd", label: "YTD" },
  { value: "all_time", label: "All Time" },
];

function compactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value || 0);
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function unitLabel(units: number, dealType: DealType) {
  const noun = dealType === "closed" ? "closing" : "contract";
  return `${units} ${noun}${units === 1 ? "" : "s"}`;
}

function rankTreatment(rank: number) {
  if (rank === 1) return "bg-amber-400/20 text-amber-700 dark:text-amber-300 border-amber-400/30";
  if (rank === 2) return "bg-slate-300/25 text-slate-700 dark:text-slate-200 border-slate-300/30";
  if (rank === 3) return "bg-orange-400/15 text-orange-700 dark:text-orange-300 border-orange-400/30";
  return "bg-muted text-muted-foreground border-border";
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-4 w-4" />;
  if (rank <= 3) return <Medal className="h-4 w-4" />;
  return <span className="text-xs font-bold tabular-nums">#{rank}</span>;
}

function AgentAvatar({ entry, className = "h-9 w-9" }: { entry: Pick<AgentEntry, "agentName" | "profilePhotoUrl">; className?: string }) {
  return (
    <Avatar className={className}>
      {entry.profilePhotoUrl ? <AvatarImage src={entry.profilePhotoUrl} alt={entry.agentName} className="object-cover" /> : null}
      <AvatarFallback className="bg-primary/12 text-primary text-xs font-bold">{initials(entry.agentName)}</AvatarFallback>
    </Avatar>
  );
}

function MilestoneCard({
  icon: Icon,
  eyebrow,
  headline,
  detail,
  entry,
  tone = "default",
}: {
  icon: typeof Trophy;
  eyebrow: string;
  headline: string;
  detail: string;
  entry: Milestone | null | undefined;
  tone?: "default" | "warm" | "cool";
}) {
  const toneClass = tone === "warm"
    ? "from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/20"
    : tone === "cool"
      ? "from-cyan-500/10 via-cyan-500/5 to-transparent border-cyan-500/20"
      : "from-primary/10 via-primary/5 to-transparent border-primary/15";

  return (
    <Card className={`overflow-hidden border bg-gradient-to-br ${toneClass}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/75 shadow-sm">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p>
            {entry ? (
              <>
                <div className="mt-1 flex items-center gap-2">
                  <AgentAvatar entry={entry} className="h-6 w-6" />
                  <p className="truncate text-sm font-semibold">{headline.replace("{agent}", entry.agentName)}</p>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail.replace("{units}", String(entry.units)).replace("{volume}", compactCurrency(entry.volume))}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No qualifying production in this period yet.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LeaderboardLoading() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
      </div>
      <Skeleton className="h-[430px] rounded-xl" />
    </div>
  );
}

export default function AgentLeaderboardPage() {
  const { user } = useAuth() as any;
  const [period, setPeriod] = useState<LeaderboardPeriod>("this_month");
  const [dealType, setDealType] = useState<DealType>("closed");
  const queryInput = useMemo(() => ({ period, dealType }), [period, dealType]);
  const { data, isLoading, isError } = trpc.analytics.agentLeaderboard.useQuery(queryInput, {
    staleTime: 60_000,
  });

  const leaderboard = (data?.leaderboard ?? []) as AgentEntry[];
  const myEntry = (data?.myEntry ?? null) as AgentEntry | null;
  const topAgent = leaderboard.find((entry) => entry.units > 0) ?? null;
  const milestones = (data?.milestones ?? {}) as {
    largestTransaction?: Milestone | null;
    bestWeek?: Milestone | null;
    bestMonth?: Milestone | null;
  };
  const periodLabel = data?.periodLabel ?? PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? "This Month";
  const typeLabel = dealType === "closed" ? "Closed" : "Under Contract";
  const activeAgentCount = data?.activeAgentCount ?? leaderboard.length;
  const aboveMe = myEntry && myEntry.rank > 1 ? leaderboard[myEntry.rank - 2] : null;

  const standingMessage = !myEntry
    ? null
    : myEntry.rank === 1
      ? `You are leading ${typeLabel.toLowerCase()} production. Keep the crown.`
      : aboveMe && aboveMe.units > myEntry.units
        ? `Only ${aboveMe.units - myEntry.units} ${aboveMe.units - myEntry.units === 1 ? "deal" : "deals"} away from #${aboveMe.rank}.`
        : aboveMe
          ? `You are ${currency(Math.max(0, aboveMe.volume - myEntry.volume))} in volume from #${aboveMe.rank}.`
          : "Every deal moves the board. Build your next win.";

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-8">
      <section className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/12 via-background to-amber-500/10 px-5 py-6 sm:px-7">
        <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-amber-400/15 blur-3xl" />
        <div className="pointer-events-none absolute right-24 bottom-0 h-24 w-24 rounded-full bg-primary/15 blur-2xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <Badge variant="outline" className="border-primary/25 bg-background/65 text-primary">
              <Trophy className="mr-1.5 h-3.5 w-3.5" /> Team production board
            </Badge>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Agent Leaderboard</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Benchmark your momentum against <span className="font-semibold text-foreground">{activeAgentCount} active Savvy agents</span>. Rankings are decided by units first, then transaction volume.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 rounded-xl border bg-background/75 p-1.5 shadow-sm">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPeriod(option.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-[0.97] ${
                  period === option.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <Tabs value={dealType} onValueChange={(value) => setDealType(value as DealType)} className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="closed" className="gap-1.5 px-4">
              <Trophy className="h-3.5 w-3.5" /> Closed
            </TabsTrigger>
            <TabsTrigger value="under_contract" className="gap-1.5 px-4">
              <Target className="h-3.5 w-3.5" /> Under Contract
            </TabsTrigger>
          </TabsList>
          <p className="text-xs text-muted-foreground">
            {typeLabel} production · <span className="font-medium text-foreground">{periodLabel}</span>
          </p>
        </div>
      </Tabs>

      {isLoading ? <LeaderboardLoading /> : isError ? (
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
            <Trophy className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <h2 className="font-semibold">The leaderboard could not load</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">Please refresh the page. If the issue continues, let the Savvy team know.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid gap-3 lg:grid-cols-[1.15fr_1fr_1fr]">
            <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/13 via-primary/5 to-transparent">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Current pace leader</p>
                    {topAgent ? (
                      <>
                        <div className="mt-2 flex items-center gap-2.5">
                          <div className="relative">
                            <AgentAvatar entry={topAgent} className="h-10 w-10" />
                            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[9px] text-amber-950 shadow-sm">1</span>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-base font-bold">{topAgent.agentName}</p>
                            <p className="text-xs text-muted-foreground">{unitLabel(topAgent.units, dealType)} · {compactCurrency(topAgent.volume)}</p>
                          </div>
                        </div>
                      </>
                    ) : <p className="mt-3 text-sm text-muted-foreground">No production posted yet.</p>}
                  </div>
                  <Crown className="h-7 w-7 shrink-0 text-amber-500" />
                </div>
                {myEntry ? (
                  <div className="mt-4 rounded-lg border border-primary/15 bg-background/65 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-3.5 w-3.5 text-primary" />
                      <p className="text-xs"><span className="font-bold text-primary">You are #{myEntry.rank}</span><span className="text-muted-foreground"> of {activeAgentCount}. {standingMessage}</span></p>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <MilestoneCard
              icon={Gem}
              eyebrow="Big deal energy"
              headline="{agent} landed the largest deal"
              detail="A {volume} transaction is setting the pace for this period."
              entry={milestones.largestTransaction}
              tone="warm"
            />
            <MilestoneCard
              icon={Flame}
              eyebrow="Hot hand"
              headline="{agent} owns the best week"
              detail="{units} deals and {volume} of production in one week."
              entry={milestones.bestWeek}
              tone="cool"
            />
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <MilestoneCard
              icon={CalendarDays}
              eyebrow="Power month"
              headline="{agent} posted the strongest month"
              detail="{units} deals and {volume} in a single month within this view."
              entry={milestones.bestMonth}
            />
            <Card className="border-dashed">
              <CardContent className="flex h-full min-h-[112px] items-center gap-3 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Award className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold">How the board works</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Every active agent is included. Rankings use deal count first, then total volume as the tie-breaker. Milestones are recalculated for the selected time period and deal type.</p>
                </div>
              </CardContent>
            </Card>
          </section>

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-1 border-b bg-muted/25 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="font-semibold">{typeLabel} standings</h2>
                <p className="text-xs text-muted-foreground">{periodLabel} · ordered by units, then volume</p>
              </div>
              <Badge variant="secondary" className="w-fit">{leaderboard.length} agents</Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[68px] px-4 sm:px-5">Rank</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Volume</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">GCI</TableHead>
                  <TableHead className="hidden px-4 text-right xl:table-cell">Avg. Deal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.map((entry) => {
                  const isMe = Number(user?.id) === entry.agentId;
                  return (
                    <TableRow key={entry.agentId} className={isMe ? "bg-primary/[0.055] hover:bg-primary/[0.075]" : ""}>
                      <TableCell className="px-4 sm:px-5">
                        <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-1.5 ${rankTreatment(entry.rank)}`}>
                          <RankIcon rank={entry.rank} />
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-[170px] items-center gap-2.5">
                          <AgentAvatar entry={entry} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{entry.agentName} {isMe ? <span className="font-medium text-primary">(You)</span> : null}</p>
                            <p className="text-xs text-muted-foreground sm:hidden">{compactCurrency(entry.volume)} volume</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{entry.units}</TableCell>
                      <TableCell className="hidden text-right font-medium tabular-nums sm:table-cell">{compactCurrency(entry.volume)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums lg:table-cell">{compactCurrency(entry.gci)}</TableCell>
                      <TableCell className="hidden px-4 text-right tabular-nums xl:table-cell">{compactCurrency(entry.averageDealSize)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
