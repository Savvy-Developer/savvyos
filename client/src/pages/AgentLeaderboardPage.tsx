import { useMemo, useState, type ElementType } from "react";
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
  buyerSides: number;
  sellerSides: number;
  buyerCommissionCharged: number;
  sellerCommissionCharged: number;
};

type Milestone = {
  agentId: number;
  agentName: string;
  profilePhotoUrl: string | null;
  units: number;
  volume: number;
  periodStart?: string | null;
  date?: string | null;
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

function formatMonth(value?: string | null) {
  if (!value) return "this year";
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}-01T12:00:00.000Z`));
}

function formatDate(value?: string | null) {
  if (!value) return "soon";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00.000Z`));
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
  icon: ElementType;
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
                <div className="mt-1 flex items-start gap-2">
                  <AgentAvatar entry={entry} className="mt-0.5 h-6 w-6 shrink-0" />
                  <p className="min-w-0 text-sm font-semibold leading-snug break-words">{headline}</p>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground break-words">{detail}</p>
              </>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">No qualifying production has been posted yet.</p>
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

  const isClosed = dealType === "closed";
  const leaderboard = (data?.leaderboard ?? []) as AgentEntry[];
  const myEntry = (data?.myEntry ?? null) as AgentEntry | null;
  const topAgent = leaderboard.find((entry) => entry.volume > 0) ?? null;
  const milestones = (data?.milestones ?? {}) as {
    largestTransaction?: Milestone | null;
    bestWeek?: Milestone | null;
    powerMonth?: Milestone | null;
    nextClosing?: Milestone | null;
  };
  const periodLabel = data?.periodLabel ?? PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? "This Month";
  const activeAgentCount = data?.activeAgentCount ?? leaderboard.length;
  const powerMonthYear = data?.powerMonthYear ?? new Date().getFullYear();
  const hasDateFilters = data?.hasDateFilters ?? isClosed;
  const aboveMe = myEntry && myEntry.rank > 1 ? leaderboard[myEntry.rank - 2] : null;

  const standingMessage = !myEntry
    ? null
    : myEntry.rank === 1
      ? `You are leading the team in production volume. Keep the crown.`
      : aboveMe && aboveMe.volume > myEntry.volume
        ? `You are ${currency(aboveMe.volume - myEntry.volume)} in volume from #${aboveMe.rank}.`
        : aboveMe && aboveMe.units > myEntry.units
          ? `You are one deal count step from #${aboveMe.rank}.`
          : "Every deal moves the board. Build your next win.";

  const boardTitle = isClosed ? "Closed standings" : "Under Contract standings";
  const boardDescriptor = isClosed
    ? `${periodLabel} · ordered by production volume, then units`
    : "Live view of every active deal currently under contract · ordered by production volume, then units";

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
              Benchmark your momentum against <span className="font-semibold text-foreground">{activeAgentCount} active Savvy agents</span>. Rankings prioritize total production volume, with units as the tie-breaker.
            </p>
          </div>
          {hasDateFilters ? (
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
          ) : (
            <Badge variant="outline" className="w-fit border-primary/25 bg-background/75 px-3 py-2 text-primary">
              <Target className="mr-1.5 h-3.5 w-3.5" /> Live pipeline · all active contracts
            </Badge>
          )}
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
            {isClosed ? "Closed production" : "Current under-contract pipeline"} · <span className="font-medium text-foreground">{periodLabel}</span>
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
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{isClosed ? "Current pace leader" : "Live pipeline leader"}</p>
                    {topAgent ? (
                      <div className="mt-2 flex items-center gap-2.5">
                        <div className="relative shrink-0">
                          <AgentAvatar entry={topAgent} className="h-10 w-10" />
                          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[9px] text-amber-950 shadow-sm">1</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-base font-bold leading-snug break-words">{topAgent.agentName}</p>
                          <p className="text-xs leading-relaxed text-muted-foreground">{compactCurrency(topAgent.volume)} {isClosed ? "closed" : "under contract"} · {topAgent.units} {topAgent.units === 1 ? "deal" : "deals"}</p>
                        </div>
                      </div>
                    ) : <p className="mt-3 text-sm text-muted-foreground">No qualifying production posted yet.</p>}
                  </div>
                  <Crown className="h-7 w-7 shrink-0 text-amber-500" />
                </div>
                {myEntry ? (
                  <div className="mt-4 rounded-lg border border-primary/15 bg-background/65 px-3 py-2">
                    <div className="flex items-start gap-2">
                      <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <p className="text-xs leading-relaxed"><span className="font-bold text-primary">You are #{myEntry.rank}</span><span className="text-muted-foreground"> of {activeAgentCount}. {standingMessage}</span></p>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <MilestoneCard
              icon={Gem}
              eyebrow={isClosed ? "Big deal energy" : "Big deal in play"}
              headline={milestones.largestTransaction ? `${milestones.largestTransaction.agentName} ${isClosed ? "closed the largest deal" : "has the largest deal under contract"}` : ""}
              detail={milestones.largestTransaction ? `${compactCurrency(milestones.largestTransaction.volume)} in ${isClosed ? `closed production during ${periodLabel}` : "current under-contract volume"}.` : ""}
              entry={milestones.largestTransaction}
              tone="warm"
            />

            <MilestoneCard
              icon={isClosed ? Flame : CalendarDays}
              eyebrow={isClosed ? "Hot hand" : "Next closing"}
              headline={isClosed
                ? (milestones.bestWeek ? `${milestones.bestWeek.agentName} had the hottest week` : "")
                : (milestones.nextClosing ? `${milestones.nextClosing.agentName}'s deal is closing next` : "")}
              detail={isClosed
                ? (milestones.bestWeek ? `${milestones.bestWeek.units} ${milestones.bestWeek.units === 1 ? "deal" : "deals"} and ${compactCurrency(milestones.bestWeek.volume)} of production closed in one week.` : "")
                : (milestones.nextClosing ? `${compactCurrency(milestones.nextClosing.volume)} is expected to close ${formatDate(milestones.nextClosing.date)}.` : "")}
              entry={isClosed ? milestones.bestWeek : milestones.nextClosing}
              tone="cool"
            />
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            {isClosed ? (
              <MilestoneCard
                icon={CalendarDays}
                eyebrow={`Power month ${powerMonthYear}`}
                headline={milestones.powerMonth ? `${milestones.powerMonth.agentName} posted the strongest month` : ""}
                detail={milestones.powerMonth ? `${milestones.powerMonth.units} ${milestones.powerMonth.units === 1 ? "deal" : "deals"} and ${compactCurrency(milestones.powerMonth.volume)} closed in ${formatMonth(milestones.powerMonth.periodStart)}.` : ""}
                entry={milestones.powerMonth}
              />
            ) : (
              <MilestoneCard
                icon={Flame}
                eyebrow="Pipeline pulse"
                headline={topAgent ? `${topAgent.agentName} is carrying the most live volume` : ""}
                detail={topAgent ? `${compactCurrency(topAgent.volume)} is currently under contract across ${topAgent.units} ${topAgent.units === 1 ? "deal" : "deals"}.` : ""}
                entry={topAgent}
              />
            )}
            <Card className="border-dashed">
              <CardContent className="flex h-full min-h-[112px] items-start gap-3 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Award className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold">How this board works</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {isClosed
                      ? "Every active agent is included. Closed rankings use production volume first, then units. The Power Month headline always finds the strongest single closed month in the current calendar year."
                      : "Every active agent is included. This is a live view of all current under-contract deals, so it has no date filters. Rankings use under-contract volume first, then units."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-1 border-b bg-muted/25 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="font-semibold">{boardTitle}</h2>
                <p className="text-xs leading-relaxed text-muted-foreground">{boardDescriptor}</p>
              </div>
              <Badge variant="secondary" className="w-fit">{leaderboard.length} agents</Badge>
            </div>
            <Table className="min-w-[1160px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[68px] px-4 sm:px-5">Rank</TableHead>
                  <TableHead className="min-w-[220px]">Agent</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Buyers</TableHead>
                  <TableHead className="text-right">Sellers</TableHead>
                  <TableHead className="text-right">Buyer Comm.</TableHead>
                  <TableHead className="text-right">Seller Comm.</TableHead>
                  <TableHead className="text-right">Total GCI</TableHead>
                  <TableHead className="px-4 text-right">Avg. Deal</TableHead>
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
                        <div className="flex items-center gap-2.5">
                          <AgentAvatar entry={entry} />
                          <p className="min-w-0 text-sm font-semibold leading-snug break-words">{entry.agentName} {isMe ? <span className="font-medium text-primary">(You)</span> : null}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{compactCurrency(entry.volume)}</TableCell>
                      <TableCell className="text-right tabular-nums">{entry.units}</TableCell>
                      <TableCell className="text-right tabular-nums">{entry.buyerSides}</TableCell>
                      <TableCell className="text-right tabular-nums">{entry.sellerSides}</TableCell>
                      <TableCell className="text-right tabular-nums">{compactCurrency(entry.buyerCommissionCharged)}</TableCell>
                      <TableCell className="text-right tabular-nums">{compactCurrency(entry.sellerCommissionCharged)}</TableCell>
                      <TableCell className="text-right tabular-nums">{compactCurrency(entry.gci)}</TableCell>
                      <TableCell className="px-4 text-right tabular-nums">{compactCurrency(entry.averageDealSize)}</TableCell>
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
