import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft,
  CalendarDays,
  Crown,
  Flame,
  Gem,
  Maximize2,
  Minimize2,
  MonitorUp,
  RefreshCw,
  Target,
  Trophy,
  Users,
} from "lucide-react";

type LeaderboardPeriod =
  | "this_week"
  | "this_month"
  | "this_quarter"
  | "ytd"
  | "all_time";
type DealType = "under_contract" | "closed";
type LeaderboardRankBy = "volume" | "units";

type AgentEntry = {
  agentId: number;
  agentName: string;
  profilePhotoUrl: string | null;
  rank: number;
  units: number;
  volume: number;
  marketName: string | null;
  marketState: string | null;
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

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(value?: string | null) {
  if (!value) return "upcoming";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function AgentAvatar({
  entry,
  size = "h-12 w-12",
}: {
  entry: Pick<AgentEntry, "agentName" | "profilePhotoUrl">;
  size?: string;
}) {
  return (
    <Avatar className={`${size} shrink-0 ring-2 ring-white/15`}>
      {entry.profilePhotoUrl ? (
        <AvatarImage
          src={entry.profilePhotoUrl}
          alt={entry.agentName}
          className="object-cover"
        />
      ) : null}
      <AvatarFallback className="bg-sky-500/25 text-sm font-bold text-sky-100">
        {initials(entry.agentName)}
      </AvatarFallback>
    </Avatar>
  );
}

function rankSurface(rank: number) {
  if (rank === 1) return "border-amber-300/45 bg-amber-300/[0.12]";
  if (rank === 2) return "border-slate-200/30 bg-slate-200/[0.10]";
  if (rank === 3) return "border-orange-300/35 bg-orange-300/[0.10]";
  return "border-white/10 bg-white/[0.055]";
}

function rankLabel(rank: number) {
  if (rank === 1) return "1ST";
  if (rank === 2) return "2ND";
  if (rank === 3) return "3RD";
  return `#${rank}`;
}

function PresentationLoading() {
  return (
    <div className="min-h-screen bg-[#071321] px-6 py-7 text-white sm:px-10 lg:px-14">
      <div className="mx-auto max-w-[1680px] animate-pulse space-y-6">
        <div className="h-16 rounded-2xl bg-white/10" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-72 rounded-3xl bg-white/10 lg:col-span-2" />
          <div className="h-72 rounded-3xl bg-white/10" />
        </div>
        <div className="h-80 rounded-3xl bg-white/10" />
      </div>
    </div>
  );
}

export default function AgentLeaderboardPresentationPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const initialPeriod = PERIOD_OPTIONS.some(
    option => option.value === searchParams.get("period")
  )
    ? (searchParams.get("period") as LeaderboardPeriod)
    : "this_month";
  const initialDealType =
    searchParams.get("dealType") === "under_contract"
      ? "under_contract"
      : "closed";
  const initialRankBy =
    searchParams.get("rankBy") === "units" ? "units" : "volume";
  const [period, setPeriod] = useState<LeaderboardPeriod>(initialPeriod);
  const [dealType, setDealType] = useState<DealType>(initialDealType);
  const [rankBy, setRankBy] = useState<LeaderboardRankBy>(initialRankBy);
  const [isFullscreen, setIsFullscreen] = useState(
    Boolean(document.fullscreenElement)
  );
  const [now, setNow] = useState(() => new Date());
  const queryInput = useMemo(
    () => ({ period, dealType, rankBy }),
    [period, dealType, rankBy]
  );
  const { data, isLoading, isError, refetch, isFetching } =
    trpc.analytics.agentLeaderboard.useQuery(queryInput, {
      staleTime: 60_000,
      refetchInterval: 60_000,
    });

  useEffect(() => {
    const updateFullscreen = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () =>
      document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const isClosed = dealType === "closed";
  const isUnitsRanked = rankBy === "units";
  const leaderboard = (data?.leaderboard ?? []) as AgentEntry[];
  const topThree = leaderboard.slice(0, 3);
  const remainingLeaders = leaderboard.slice(3, 8);
  const totalVolume = leaderboard.reduce((sum, entry) => sum + entry.volume, 0);
  const totalUnits = leaderboard.reduce((sum, entry) => sum + entry.units, 0);
  const activeAgentCount = data?.activeAgentCount ?? leaderboard.length;
  const periodLabel =
    data?.periodLabel ??
    PERIOD_OPTIONS.find(option => option.value === period)?.label ??
    "This Month";
  const hasDateFilters = data?.hasDateFilters ?? isClosed;
  const milestones = (data?.milestones ?? {}) as {
    largestTransaction?: Milestone | null;
    bestWeek?: Milestone | null;
    nextClosing?: Milestone | null;
  };
  const leader = topThree[0];
  const featuredMilestone = isUnitsRanked
    ? leader
    : milestones.largestTransaction;
  const highlightMilestone = isClosed
    ? milestones.bestWeek
    : isUnitsRanked
      ? leader
      : milestones.nextClosing;
  const updateTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(now);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Full-screen mode can be declined by a browser or device policy; the presentation view still works chrome-free.
    }
  };

  if (isLoading) return <PresentationLoading />;

  if (isError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#071321] px-6 text-center text-white">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.055] p-8">
          <Trophy className="mx-auto h-9 w-9 text-amber-300" />
          <h1 className="mt-4 text-2xl font-bold">
            The leaderboard could not load
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Refresh this presentation view or return to the leaderboard and try
            again.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => void refetch()}
              className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-400"
            >
              Refresh
            </button>
            <button
              onClick={() => navigate("/leaderboard")}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/10"
            >
              Back to board
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative h-[100dvh] overflow-x-hidden overflow-y-auto overscroll-contain bg-[#071321] text-white selection:bg-sky-400/35">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-32 h-[38rem] w-[38rem] rounded-full bg-sky-500/[0.10] blur-3xl" />
        <div className="absolute -right-28 top-20 h-[32rem] w-[32rem] rounded-full bg-amber-400/[0.09] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_92%)]" />
      </div>

      <div className="relative mx-auto flex min-h-full max-w-[1680px] flex-col px-5 py-5 sm:px-8 sm:py-7 lg:px-12">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2.5 py-1 text-[10px] font-black tracking-[0.18em] text-sky-100">
                SAVVY STR AGENTS
              </span>
              <span className="text-xs font-medium text-slate-400">
                TEAM PRODUCTION • LIVE PRESENTATION
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                Agent Leaderboard
              </h1>
              <span className="text-sm font-semibold text-sky-200">
                {isClosed
                  ? `${periodLabel} closed production`
                  : "Live under-contract pipeline"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDealType("closed")}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition ${isClosed ? "bg-white text-slate-950 shadow-lg shadow-white/10" : "border border-white/12 bg-white/[0.045] text-slate-300 hover:bg-white/10"}`}
            >
              Closed
            </button>
            <button
              type="button"
              onClick={() => setDealType("under_contract")}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition ${!isClosed ? "bg-white text-slate-950 shadow-lg shadow-white/10" : "border border-white/12 bg-white/[0.045] text-slate-300 hover:bg-white/10"}`}
            >
              Under Contract
            </button>
            <span className="mx-1 hidden h-7 w-px bg-white/10 sm:block" />
            <div
              className="inline-flex rounded-xl border border-white/12 bg-white/[0.045] p-1"
              role="group"
              aria-label="Leaderboard ranking metric"
            >
              <button
                type="button"
                onClick={() => setRankBy("volume")}
                aria-pressed={!isUnitsRanked}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${!isUnitsRanked ? "bg-white text-slate-950 shadow" : "text-slate-300 hover:bg-white/10"}`}
              >
                Volume
              </button>
              <button
                type="button"
                onClick={() => setRankBy("units")}
                aria-pressed={isUnitsRanked}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${isUnitsRanked ? "bg-amber-300 text-amber-950 shadow" : "text-slate-300 hover:bg-white/10"}`}
              >
                Units
              </button>
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.045] px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/10"
              aria-label="Refresh leaderboard"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
              />{" "}
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-xs font-black text-white shadow-lg shadow-sky-500/20 transition hover:bg-sky-400 active:scale-[0.98]"
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
              {isFullscreen ? "Exit full screen" : "Full screen"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/leaderboard")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.045] px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/10"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Exit
            </button>
          </div>
        </header>

        {hasDateFilters ? (
          <nav
            aria-label="Leaderboard period"
            className="mt-4 flex flex-wrap gap-1.5"
          >
            {PERIOD_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPeriod(option.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${period === option.value ? "bg-amber-300 text-amber-950 shadow-md shadow-amber-300/15" : "bg-white/[0.045] text-slate-300 hover:bg-white/10 hover:text-white"}`}
              >
                {option.label}
              </button>
            ))}
          </nav>
        ) : (
          <div className="mt-4 inline-flex w-fit items-center gap-2 rounded-lg border border-sky-300/20 bg-sky-300/[0.08] px-3 py-1.5 text-xs font-semibold text-sky-100">
            <Target className="h-3.5 w-3.5" /> Every active deal currently under
            contract
          </div>
        )}

        <section className="mt-5 grid flex-1 gap-4 xl:grid-cols-[1.45fr_0.95fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="relative overflow-hidden rounded-3xl border border-amber-300/25 bg-gradient-to-br from-amber-300/[0.18] via-[#14314b]/80 to-[#0c2033]/90 p-5 shadow-2xl shadow-black/15 sm:p-6">
              <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-amber-200/15 blur-2xl" />
              <div className="relative grid gap-5 md:grid-cols-[auto_1fr_auto] md:items-center">
                <div className="relative w-fit">
                  {leader ? (
                    <AgentAvatar
                      entry={leader}
                      size="h-20 w-20 sm:h-24 sm:w-24"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-full border border-white/15 bg-white/[0.07] sm:h-24 sm:w-24" />
                  )}
                  <span className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-amber-300 text-amber-950 shadow-lg shadow-black/20">
                    <Crown className="h-4 w-4" />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-black tracking-[0.17em] text-amber-100/85">
                    {isUnitsRanked
                      ? "CURRENT UNITS LEADER"
                      : "CURRENT PACE LEADER"}
                  </p>
                  {leader ? (
                    <>
                      <h2 className="mt-1 truncate text-3xl font-black tracking-tight sm:text-4xl">
                        {leader.agentName}
                      </h2>
                      <p className="mt-1 text-sm text-slate-200">
                        {leader.marketName
                          ? `${leader.marketName}${leader.marketState ? `, ${leader.marketState}` : ""}`
                          : "Savvy STR Agents"}{" "}
                        · #1 on the team
                      </p>
                    </>
                  ) : (
                    <h2 className="mt-2 text-2xl font-bold text-slate-200">
                      No production posted yet
                    </h2>
                  )}
                </div>
                {leader ? (
                  <div className="flex items-center gap-6 md:block md:text-right">
                    <div>
                      <p className="text-3xl font-black tabular-nums text-amber-200 sm:text-4xl">
                        {isUnitsRanked
                          ? `${leader.units} ${leader.units === 1 ? "UNIT" : "UNITS"}`
                          : compactCurrency(leader.volume)}
                      </p>
                      <p className="mt-0.5 text-[10px] font-black tracking-[0.14em] text-amber-100/75">
                        {isUnitsRanked
                          ? isClosed
                            ? "CLOSED THIS PERIOD"
                            : "IN PIPELINE"
                          : isClosed
                            ? "CLOSED VOLUME"
                            : "IN PIPELINE"}
                      </p>
                    </div>
                    <div className="md:mt-3">
                      <p className="text-lg font-bold tabular-nums text-white">
                        {isUnitsRanked
                          ? compactCurrency(leader.volume)
                          : `${leader.units} ${leader.units === 1 ? "deal" : "deals"}`}
                      </p>
                      <p className="text-[10px] font-bold text-slate-300">
                        {isUnitsRanked ? "in volume" : "on the board"}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-4 shadow-lg shadow-black/10">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black tracking-[0.15em] text-slate-400">
                    {isUnitsRanked ? "TEAM UNITS" : "TEAM VOLUME"}
                  </p>
                  <Trophy className="h-4 w-4 text-amber-300" />
                </div>
                <p className="mt-2 text-3xl font-black tabular-nums text-white">
                  {isUnitsRanked ? totalUnits : compactCurrency(totalVolume)}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {isClosed ? periodLabel : "current pipeline"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-4 shadow-lg shadow-black/10">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black tracking-[0.15em] text-slate-400">
                    {isUnitsRanked
                      ? "TEAM VOLUME"
                      : isClosed
                        ? "CLOSED DEALS"
                        : "LIVE DEALS"}
                  </p>
                  <Target className="h-4 w-4 text-sky-300" />
                </div>
                <p className="mt-2 text-3xl font-black tabular-nums text-white">
                  {isUnitsRanked ? compactCurrency(totalVolume) : totalUnits}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {isUnitsRanked
                    ? isClosed
                      ? periodLabel
                      : "current pipeline"
                    : `across ${activeAgentCount} active agents`}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-4 shadow-lg shadow-black/10">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black tracking-[0.15em] text-slate-400">
                    ACTIVE AGENTS
                  </p>
                  <Users className="h-4 w-4 text-violet-300" />
                </div>
                <p className="mt-2 text-3xl font-black tabular-nums text-white">
                  {activeAgentCount}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  competing on this board
                </p>
              </div>
            </section>

            <section className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-amber-300/20 bg-gradient-to-br from-amber-300/[0.10] to-transparent p-4">
                <div className="flex items-center gap-2 text-amber-100">
                  <Gem className="h-4 w-4 text-amber-300" />
                  <p className="text-[10px] font-black tracking-[0.15em]">
                    {isUnitsRanked
                      ? isClosed
                        ? "MOST UNITS"
                        : "MOST UNITS IN PLAY"
                      : isClosed
                        ? "LARGEST DEAL"
                        : "LARGEST DEAL IN PLAY"}
                  </p>
                </div>
                {featuredMilestone ? (
                  <>
                    <p className="mt-3 text-lg font-bold">
                      {featuredMilestone.agentName}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-300">
                      <span className="font-bold text-amber-200">
                        {isUnitsRanked
                          ? `${featuredMilestone.units} ${featuredMilestone.units === 1 ? "unit" : "units"}`
                          : compactCurrency(featuredMilestone.volume)}
                      </span>{" "}
                      {isUnitsRanked
                        ? isClosed
                          ? `closed in ${periodLabel}`
                          : "currently under contract"
                        : isClosed
                          ? "in closed production"
                          : "currently under contract"}
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">
                    No qualifying deal posted yet.
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-sky-300/20 bg-gradient-to-br from-sky-300/[0.10] to-transparent p-4">
                <div className="flex items-center gap-2 text-sky-100">
                  {isClosed ? (
                    <Flame className="h-4 w-4 text-sky-300" />
                  ) : (
                    <CalendarDays className="h-4 w-4 text-sky-300" />
                  )}
                  <p className="text-[10px] font-black tracking-[0.15em]">
                    {isUnitsRanked
                      ? isClosed
                        ? "UNIT HOT HAND"
                        : "UNIT PACE"
                      : isClosed
                        ? "HOT HAND"
                        : "NEXT CLOSING"}
                  </p>
                </div>
                {highlightMilestone ? (
                  <>
                    <p className="mt-3 text-lg font-bold">
                      {highlightMilestone.agentName}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-300">
                      {isClosed ? (
                        <>
                          <span className="font-bold text-sky-200">
                            {highlightMilestone.units}{" "}
                            {highlightMilestone.units === 1 ? "deal" : "deals"}{" "}
                            {!isUnitsRanked
                              ? `· ${compactCurrency(highlightMilestone.volume)}`
                              : null}
                          </span>{" "}
                          {isUnitsRanked
                            ? "closed in their biggest unit week"
                            : "in their best week"}
                        </>
                      ) : (
                        <>
                          <span className="font-bold text-sky-200">
                            {isUnitsRanked
                              ? `${highlightMilestone.units} ${highlightMilestone.units === 1 ? "unit" : "units"}`
                              : compactCurrency(highlightMilestone.volume)}
                          </span>{" "}
                          {isUnitsRanked
                            ? "currently under contract"
                            : `expected ${formatDate("date" in highlightMilestone ? highlightMilestone.date : undefined)}`}
                        </>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">
                    No highlight available yet.
                  </p>
                )}
              </div>
            </section>
          </div>

          <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0b1b2c]/85 shadow-2xl shadow-black/15">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-[10px] font-black tracking-[0.16em] text-slate-400">
                  TOP PERFORMERS
                </p>
                <h2 className="mt-0.5 text-lg font-bold">Team standings</h2>
              </div>
              <MonitorUp className="h-5 w-5 text-sky-300" />
            </div>
            <div className="space-y-2 p-3 sm:p-4">
              {topThree.map(entry => (
                <div
                  key={entry.agentId}
                  className={`flex items-center gap-3 rounded-2xl border p-3 ${rankSurface(entry.rank)}`}
                >
                  <span
                    className={`w-8 text-center text-[11px] font-black ${entry.rank === 1 ? "text-amber-200" : entry.rank === 2 ? "text-slate-100" : "text-orange-200"}`}
                  >
                    {rankLabel(entry.rank)}
                  </span>
                  <AgentAvatar entry={entry} size="h-10 w-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {entry.agentName}
                    </p>
                    <p className="text-xs text-slate-400">
                      {isUnitsRanked
                        ? `${compactCurrency(entry.volume)} in volume`
                        : `${entry.units} ${entry.units === 1 ? "deal" : "deals"}`}
                    </p>
                  </div>
                  <p className="text-right text-base font-black tabular-nums text-white">
                    {isUnitsRanked
                      ? `${entry.units} ${entry.units === 1 ? "unit" : "units"}`
                      : compactCurrency(entry.volume)}
                  </p>
                </div>
              ))}
              {remainingLeaders.length > 0 ? (
                <div className="my-2 border-t border-white/8" />
              ) : null}
              {remainingLeaders.map(entry => {
                const leaderMetric = isUnitsRanked
                  ? leader?.units
                  : leader?.volume;
                const entryMetric = isUnitsRanked ? entry.units : entry.volume;
                const share = leaderMetric
                  ? Math.max((entryMetric / leaderMetric) * 100, 2)
                  : 0;
                return (
                  <div
                    key={entry.agentId}
                    className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-2 py-2"
                  >
                    <span className="text-center text-xs font-bold text-slate-500">
                      #{entry.rank}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-slate-200">
                          {entry.agentName}
                        </p>
                        <span className="shrink-0 text-[11px] text-slate-500">
                          {isUnitsRanked
                            ? `${compactCurrency(entry.volume)} in volume`
                            : `${entry.units} ${entry.units === 1 ? "deal" : "deals"}`}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/8">
                        <div
                          className="h-full rounded-full bg-sky-400/75"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-right text-sm font-bold tabular-nums text-slate-100">
                      {isUnitsRanked
                        ? `${entry.units} ${entry.units === 1 ? "unit" : "units"}`
                        : compactCurrency(entry.volume)}
                    </p>
                  </div>
                );
              })}
              {leaderboard.length === 0 ? (
                <div className="flex min-h-60 flex-col items-center justify-center text-center">
                  <Trophy className="h-8 w-8 text-slate-600" />
                  <p className="mt-3 text-sm font-semibold text-slate-300">
                    No production has been posted yet.
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        </section>

        <footer className="mt-4 flex flex-col gap-1 border-t border-white/10 pt-3 text-[11px] font-medium text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Rankings prioritize{" "}
            {isUnitsRanked
              ? "units, then production volume"
              : "production volume, then units"}
            .
          </p>
          <p>
            Live data · Last checked {updateTime} · Select{" "}
            <span className="font-bold text-slate-300">Full screen</span> before
            sharing in Zoom.
          </p>
        </footer>
      </div>
    </main>
  );
}
