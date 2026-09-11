import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Award,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Copy,
  ExternalLink,
  History,
  Loader2,
  Mail,
  PartyPopper,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Target,
  Trophy,
  Undo2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

type CelebrationCategory =
  | "personal"
  | "production"
  | "team"
  | "review"
  | "goal";
type CelebrationFilter = "all" | CelebrationCategory;
type StatusFilter = "open" | "celebrated" | "all";

type CelebrationEvent = {
  key: string;
  agentId: number;
  agentName: string;
  email: string | null;
  phone: string | null;
  profilePhotoUrl: string | null;
  category: CelebrationCategory;
  type: string;
  timeframe: "recent" | "today" | "upcoming";
  occurredAt: string;
  title: string;
  description: string;
  suggestedMessage: string;
  valueLabel: string | null;
  relatedUrl: string;
  priority: number;
  celebratedAt: string | null;
  celebratedById: number | null;
};

const categoryOptions: Array<{
  value: CelebrationFilter;
  label: string;
  icon: typeof PartyPopper;
}> = [
  { value: "all", label: "All opportunities", icon: Sparkles },
  { value: "personal", label: "Birthdays & anniversaries", icon: CalendarDays },
  { value: "production", label: "Personal production", icon: CircleDollarSign },
  { value: "team", label: "Team leaders", icon: Trophy },
  { value: "review", label: "Client praise", icon: Star },
  { value: "goal", label: "Goals", icon: Target },
];

const categoryStyle: Record<
  CelebrationCategory,
  { label: string; icon: typeof PartyPopper; badge: string; iconBox: string }
> = {
  personal: {
    label: "Personal milestone",
    icon: CalendarDays,
    badge: "border-violet-200 bg-violet-50 text-violet-700",
    iconBox: "bg-violet-100 text-violet-700",
  },
  production: {
    label: "Production milestone",
    icon: Award,
    badge: "border-cyan-200 bg-cyan-50 text-cyan-700",
    iconBox: "bg-cyan-100 text-cyan-700",
  },
  team: {
    label: "Team leader",
    icon: Trophy,
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    iconBox: "bg-amber-100 text-amber-700",
  },
  review: {
    label: "Client praise",
    icon: Star,
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    iconBox: "bg-emerald-100 text-emerald-700",
  },
  goal: {
    label: "Goal achieved",
    icon: Target,
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    iconBox: "bg-rose-100 text-rose-700",
  },
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatEventTiming(event: CelebrationEvent): string {
  const eventDate = new Date(event.occurredAt);
  const today = new Date();
  const eventDay = Date.UTC(
    eventDate.getUTCFullYear(),
    eventDate.getUTCMonth(),
    eventDate.getUTCDate()
  );
  const todayDay = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );
  const difference = Math.round((eventDay - todayDay) / 86_400_000);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year:
      eventDate.getUTCFullYear() === today.getUTCFullYear()
        ? undefined
        : "numeric",
    timeZone: "UTC",
  }).format(eventDate);
  if (difference === 0) return `Today · ${dateLabel}`;
  if (difference === 1) return `Tomorrow · ${dateLabel}`;
  if (difference > 1) return `In ${difference} days · ${dateLabel}`;
  if (difference === -1) return `Yesterday · ${dateLabel}`;
  return `${Math.abs(difference)} days ago · ${dateLabel}`;
}

function formatCelebratedAt(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof PartyPopper;
  label: string;
  value: number;
  note: string;
  tone: string;
}) {
  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-sm font-semibold">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{note}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingFeed() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map(index => (
        <Skeleton key={index} className="h-52 rounded-2xl" />
      ))}
    </div>
  );
}

export default function AgentCelebrationPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [category, setCategory] = useState<CelebrationFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [search, setSearch] = useState("");
  const [daysBack, setDaysBack] = useState(30);
  const queryInput = useMemo(() => ({ daysBack, daysForward: 30 }), [daysBack]);
  const { data, isLoading, isFetching, error, refetch } =
    trpc.agentCelebrations.feed.useQuery(queryInput, {
      staleTime: 60_000,
    });

  const markCelebrated = trpc.agentCelebrations.markCelebrated.useMutation({
    onSuccess: () => {
      toast.success("Marked celebrated");
      void utils.agentCelebrations.feed.invalidate();
    },
    onError: mutationError =>
      toast.error(mutationError.message || "Unable to mark celebrated"),
  });
  const reopen = trpc.agentCelebrations.reopen.useMutation({
    onSuccess: () => {
      toast.success("Returned to the celebration queue");
      void utils.agentCelebrations.feed.invalidate();
    },
    onError: mutationError =>
      toast.error(mutationError.message || "Unable to reopen celebration"),
  });

  const events = (data?.events ?? []) as CelebrationEvent[];
  const normalizedSearch = search.trim().toLowerCase();
  const filteredEvents = useMemo(
    () =>
      events.filter(event => {
        const categoryMatches =
          category === "all" || event.category === category;
        const statusMatches =
          status === "all" ||
          (status === "celebrated"
            ? Boolean(event.celebratedAt)
            : !event.celebratedAt);
        const searchMatches =
          !normalizedSearch ||
          `${event.agentName} ${event.title} ${event.description} ${event.valueLabel ?? ""}`
            .toLowerCase()
            .includes(normalizedSearch);
        return categoryMatches && statusMatches && searchMatches;
      }),
    [category, events, normalizedSearch, status]
  );

  const summary = data?.summary ?? {
    readyNow: 0,
    today: 0,
    comingUp: 0,
    celebrated: 0,
  };

  const copyMessage = async (event: CelebrationEvent) => {
    try {
      await navigator.clipboard.writeText(event.suggestedMessage);
      toast.success("Congratulations message copied");
    } catch {
      toast.error("Unable to copy the message");
    }
  };

  const emailAgent = (event: CelebrationEvent) => {
    if (!event.email) return;
    const subject = `Congratulations, ${event.agentName.split(" ")[0]}!`;
    window.location.href = `mailto:${event.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(event.suggestedMessage)}`;
  };

  return (
    <main className="mx-auto max-w-[1500px] space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-background to-cyan-50 p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-8 -top-12 h-44 w-44 rounded-full bg-amber-300/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-40 h-32 w-32 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Badge
              variant="outline"
              className="border-amber-300 bg-white/70 text-amber-800"
            >
              <PartyPopper className="mr-1.5 h-3.5 w-3.5" /> Agent Success Team
            </Badge>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">
              Agent Celebration
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              A living queue of moments worth recognizing—from birthdays and
              Savvy anniversaries to first closings, personal records, goal
              attainment, five-star feedback, and team-leading weeks.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="bg-white/75"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
              />{" "}
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/leaderboard")}
              className="bg-white/75"
            >
              <Trophy className="mr-2 h-4 w-4" /> Leaderboard
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={Sparkles}
          label="Ready now"
          value={summary.readyNow}
          note="Recent moments awaiting outreach"
          tone="bg-cyan-100 text-cyan-700"
        />
        <SummaryCard
          icon={PartyPopper}
          label="Happening today"
          value={summary.today}
          note="Time-sensitive celebrations"
          tone="bg-amber-100 text-amber-700"
        />
        <SummaryCard
          icon={CalendarDays}
          label="Coming up"
          value={summary.comingUp}
          note="Next 30 days"
          tone="bg-violet-100 text-violet-700"
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Celebrated"
          value={summary.celebrated}
          note={`Within this ${daysBack}-day view`}
          tone="bg-emerald-100 text-emerald-700"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Search agent or celebration…"
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["open", "celebrated", "all"] as StatusFilter[]).map(
                    value => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setStatus(value)}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize transition-all duration-150 active:scale-[0.97] ${status === value ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                      >
                        {value === "open" ? "Needs outreach" : value}
                      </button>
                    )
                  )}
                  <select
                    value={daysBack}
                    onChange={event => setDaysBack(Number(event.target.value))}
                    className="h-9 rounded-lg border bg-background px-3 text-xs font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring"
                    aria-label="Celebration history window"
                  >
                    <option value={14}>Past 14 days</option>
                    <option value={30}>Past 30 days</option>
                    <option value={60}>Past 60 days</option>
                    <option value={90}>Past 90 days</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {categoryOptions.map(option => {
                  const Icon = option.icon;
                  const active = category === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCategory(option.value)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-[0.97] ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                    >
                      <Icon className="h-3.5 w-3.5" /> {option.label}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <LoadingFeed />
          ) : error ? (
            <Card className="border-destructive/30">
              <CardContent className="py-14 text-center">
                <p className="font-semibold text-destructive">
                  Celebration opportunities could not be loaded.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {error.message}
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => void refetch()}
                >
                  Try again
                </Button>
              </CardContent>
            </Card>
          ) : filteredEvents.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <PartyPopper className="mx-auto h-10 w-10 text-muted-foreground/35" />
                <p className="mt-4 font-semibold">
                  No celebrations match these filters
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try another category, search, status, or history window.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredEvents.map(event => {
                const style = categoryStyle[event.category];
                const Icon = style.icon;
                const isMutating = markCelebrated.isPending || reopen.isPending;
                return (
                  <Card
                    key={event.key}
                    className={`overflow-hidden border-border/70 shadow-sm transition-all duration-200 ${event.celebratedAt ? "bg-muted/20 opacity-80" : "hover:-translate-y-0.5 hover:shadow-md"}`}
                  >
                    <CardContent className="p-0">
                      <div className="flex flex-col gap-4 p-4 sm:p-5">
                        <div className="flex items-start gap-3 sm:gap-4">
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${style.iconBox}`}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className={style.badge}>
                                {style.label}
                              </Badge>
                              {event.timeframe === "today" &&
                                !event.celebratedAt && (
                                  <Badge className="border-0 bg-amber-500 text-white">
                                    Today
                                  </Badge>
                                )}
                              {event.timeframe === "upcoming" &&
                                !event.celebratedAt && (
                                  <Badge
                                    variant="outline"
                                    className="border-violet-200 bg-violet-50 text-violet-700"
                                  >
                                    Coming up
                                  </Badge>
                                )}
                              {event.celebratedAt && (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-200 bg-emerald-50 text-emerald-700"
                                >
                                  <Check className="mr-1 h-3 w-3" />
                                  Celebrated
                                </Badge>
                              )}
                            </div>
                            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <h2 className="text-lg font-bold tracking-tight">
                                  {event.title}
                                </h2>
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(`/agents/${event.agentId}`)
                                  }
                                  className="mt-1 inline-flex items-center gap-2 text-left group"
                                >
                                  <Avatar className="h-7 w-7">
                                    {event.profilePhotoUrl && (
                                      <AvatarImage
                                        src={event.profilePhotoUrl}
                                        alt={event.agentName}
                                        className="object-cover"
                                      />
                                    )}
                                    <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                                      {initials(event.agentName)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm font-semibold group-hover:text-primary group-hover:underline">
                                    {event.agentName}
                                  </span>
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                              </div>
                              <div className="sm:text-right">
                                {event.valueLabel && (
                                  <p className="text-base font-bold text-primary">
                                    {event.valueLabel}
                                  </p>
                                )}
                                <p className="text-xs font-medium text-muted-foreground">
                                  {formatEventTiming(event)}
                                </p>
                              </div>
                            </div>
                            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                              {event.description}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-xl border border-amber-200/70 bg-amber-50/65 p-3 sm:ml-[60px]">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800">
                            Suggested congratulations
                          </p>
                          <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                            {event.suggestedMessage}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 sm:ml-[60px]">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void copyMessage(event)}
                          >
                            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy message
                          </Button>
                          {event.email && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => emailAgent(event)}
                            >
                              <Mail className="mr-1.5 h-3.5 w-3.5" /> Email
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(event.relatedUrl)}
                          >
                            <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> View
                            context
                          </Button>
                          <div className="grow" />
                          {event.celebratedAt ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isMutating}
                              onClick={() =>
                                reopen.mutate({ eventKey: event.key })
                              }
                            >
                              {reopen.isPending ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              Reopen
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              disabled={isMutating}
                              onClick={() => markCelebrated.mutate(event)}
                            >
                              {markCelebrated.isPending ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              Mark celebrated
                            </Button>
                          )}
                        </div>
                        {event.celebratedAt && (
                          <p className="text-right text-[11px] text-muted-foreground">
                            Marked celebrated{" "}
                            {formatCelebratedAt(event.celebratedAt)}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">What SavvyOS watches</h2>
              </div>
              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <p className="font-medium">Personal moments</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Opted-in birthdays plus first and recurring Savvy
                    anniversaries.
                  </p>
                </div>
                <div>
                  <p className="font-medium">Career firsts & landmarks</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    First contract, first closing, and major cumulative closing
                    counts.
                  </p>
                </div>
                <div>
                  <p className="font-medium">Personal records</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Largest contract or closing and record-setting closed weeks
                    or months.
                  </p>
                </div>
                <div>
                  <p className="font-medium">Team wins</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Completed weekly and monthly leaders by units and production
                    volume.
                  </p>
                </div>
                <div>
                  <p className="font-medium">Client delight & goals</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    New five-star reviews and annual closing, volume, or GCI
                    goals reached.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-cyan-200/70 bg-cyan-50/50 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-cyan-800">
                <Users className="h-4 w-4" />
                <h2 className="font-semibold">Built for outreach</h2>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Copy the suggested message, personalize it, and reach out in the
                channel that fits the relationship. Marking a moment celebrated
                keeps the whole team coordinated.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold">Recognition window</h2>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Past events follow the selected history window. Upcoming
                birthdays and anniversaries always look 30 days ahead.
              </p>
            </CardContent>
          </Card>
        </aside>
      </section>
    </main>
  );
}
