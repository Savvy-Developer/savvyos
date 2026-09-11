import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
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
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  PartyPopper,
  RefreshCw,
  Search,
  Star,
  Target,
  Trophy,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

type CelebrationCategory =
  | "personal"
  | "production"
  | "team"
  | "review"
  | "goal";

type CelebrationAcknowledgement = {
  adminId: number;
  adminName: string;
  profilePhotoUrl: string | null;
  celebratedAt: string;
};

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
  celebrations: CelebrationAcknowledgement[];
};

const categoryStyle: Record<
  CelebrationCategory,
  { label: string; icon: typeof PartyPopper; badge: string; iconBox: string }
> = {
  personal: {
    label: "Milestone",
    icon: CalendarDays,
    badge: "border-violet-200 bg-violet-50 text-violet-700",
    iconBox: "bg-violet-100 text-violet-700",
  },
  production: {
    label: "Production",
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
    label: "Goal",
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

function eventTimestamp(event: CelebrationEvent): number {
  return new Date(event.occurredAt).getTime();
}

function newestFirst(left: CelebrationEvent, right: CelebrationEvent): number {
  return (
    eventTimestamp(right) - eventTimestamp(left) ||
    right.priority - left.priority
  );
}

function nearestFirst(left: CelebrationEvent, right: CelebrationEvent): number {
  return (
    eventTimestamp(left) - eventTimestamp(right) ||
    right.priority - left.priority
  );
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

function formatAcknowledgedAt(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function CompactSkeletons() {
  return (
    <div className="space-y-2 p-3">
      {[0, 1, 2, 3, 4].map(index => (
        <Skeleton key={index} className="h-36 rounded-xl" />
      ))}
    </div>
  );
}

function EmptySection({ children }: { children: string }) {
  return (
    <div className="rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function ColumnHeader({
  icon: Icon,
  title,
  description,
  count,
  tone,
}: {
  icon: typeof PartyPopper;
  title: string;
  description: string;
  count: number;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b bg-muted/20 px-4 py-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="font-bold tracking-tight">{title}</h2>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>
      <Badge variant="secondary" className="tabular-nums">
        {count}
      </Badge>
    </div>
  );
}

function EventCard({
  event,
  currentAdminId,
  onCopy,
  onEmail,
  onNavigate,
  onCelebrate,
  onUndo,
  pendingKey,
}: {
  event: CelebrationEvent;
  currentAdminId: number | null;
  onCopy: (event: CelebrationEvent) => void;
  onEmail: (event: CelebrationEvent) => void;
  onNavigate: (path: string) => void;
  onCelebrate: (event: CelebrationEvent) => void;
  onUndo: (eventKey: string) => void;
  pendingKey: string | null;
}) {
  const style = categoryStyle[event.category];
  const Icon = style.icon;
  const mine = event.celebrations.find(
    entry => entry.adminId === currentAdminId
  );
  const pending = pendingKey === event.key;

  return (
    <article className="rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-2.5">
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.iconBox}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={`h-5 px-1.5 text-[10px] ${style.badge}`}
                >
                  {style.label}
                </Badge>
                {event.timeframe === "today" && (
                  <Badge className="h-5 border-0 bg-amber-500 px-1.5 text-[10px] text-white">
                    Today
                  </Badge>
                )}
              </div>
              <h3 className="mt-1.5 text-sm font-bold leading-tight">
                {event.title}
              </h3>
            </div>
            <div className="shrink-0 text-right">
              {event.valueLabel && (
                <p className="text-xs font-bold text-primary">
                  {event.valueLabel}
                </p>
              )}
              <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">
                {formatEventTiming(event)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate(`/agents/${event.agentId}`)}
            className="mt-1.5 inline-flex items-center gap-1.5 text-left group"
          >
            <Avatar className="h-6 w-6">
              {event.profilePhotoUrl && (
                <AvatarImage
                  src={event.profilePhotoUrl}
                  alt={event.agentName}
                  className="object-cover"
                />
              )}
              <AvatarFallback className="bg-primary/10 text-[9px] font-bold text-primary">
                {initials(event.agentName)}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-semibold group-hover:text-primary group-hover:underline">
              {event.agentName}
            </span>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          </button>

          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {event.description}
          </p>

          {event.celebrations.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {event.celebrations.map(acknowledgement => (
                <span
                  key={acknowledgement.adminId}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 py-0.5 pl-0.5 pr-2 text-[10px] font-medium text-emerald-800"
                  title={`Celebrated ${formatAcknowledgedAt(acknowledgement.celebratedAt)}`}
                >
                  <Avatar className="h-4 w-4">
                    {acknowledgement.profilePhotoUrl && (
                      <AvatarImage
                        src={acknowledgement.profilePhotoUrl}
                        alt={acknowledgement.adminName}
                        className="object-cover"
                      />
                    )}
                    <AvatarFallback className="bg-emerald-200 text-[7px] text-emerald-900">
                      {initials(acknowledgement.adminName)}
                    </AvatarFallback>
                  </Avatar>
                  <Check className="h-2.5 w-2.5" />
                  Celebrated by {acknowledgement.adminName}
                </span>
              ))}
            </div>
          )}

          <details className="group mt-2 rounded-lg border border-amber-200/70 bg-amber-50/50">
            <summary className="flex cursor-pointer list-none items-center justify-between px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
              Suggested note
              <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-amber-200/70 px-2.5 py-2">
              <p className="text-xs leading-relaxed text-foreground">
                {event.suggestedMessage}
              </p>
            </div>
          </details>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => onCopy(event)}
            >
              <Copy className="mr-1 h-3 w-3" /> Copy
            </Button>
            {event.email && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => onEmail(event)}
              >
                <Mail className="mr-1 h-3 w-3" /> Email
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => onNavigate(event.relatedUrl)}
            >
              <ExternalLink className="mr-1 h-3 w-3" /> Context
            </Button>
            <div className="grow" />
            {mine ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-emerald-700"
                disabled={pending}
                onClick={() => onUndo(event.key)}
              >
                {pending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Undo2 className="mr-1 h-3 w-3" />
                )}
                Undo mine
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={pending}
                onClick={() => onCelebrate(event)}
              >
                {pending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <PartyPopper className="mr-1 h-3 w-3" />
                )}
                Mark celebrated
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function MilestoneSection({
  title,
  count,
  events,
  empty,
  cardProps,
}: {
  title: string;
  count: number;
  events: CelebrationEvent[];
  empty: string;
  cardProps: Omit<React.ComponentProps<typeof EventCard>, "event">;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </h3>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {count}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      {events.length === 0 ? (
        <EmptySection>{empty}</EmptySection>
      ) : (
        <div className="space-y-2">
          {events.map(event => (
            <EventCard key={event.key} event={event} {...cardProps} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function AgentCelebrationPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [daysBack, setDaysBack] = useState(30);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const queryInput = useMemo(() => ({ daysBack, daysForward: 30 }), [daysBack]);
  const { data, isLoading, isFetching, error, refetch } =
    trpc.agentCelebrations.feed.useQuery(queryInput, { staleTime: 60_000 });

  const markCelebrated = trpc.agentCelebrations.markCelebrated.useMutation({
    onMutate: event => setPendingKey(event.key),
    onSuccess: () => {
      toast.success("Your celebration was added");
      void utils.agentCelebrations.feed.invalidate();
    },
    onError: mutationError =>
      toast.error(mutationError.message || "Unable to mark celebrated"),
    onSettled: () => setPendingKey(null),
  });
  const reopen = trpc.agentCelebrations.reopen.useMutation({
    onMutate: input => setPendingKey(input.eventKey),
    onSuccess: () => {
      toast.success("Your celebration tag was removed");
      void utils.agentCelebrations.feed.invalidate();
    },
    onError: mutationError =>
      toast.error(mutationError.message || "Unable to remove celebration tag"),
    onSettled: () => setPendingKey(null),
  });

  const events = (data?.events ?? []) as CelebrationEvent[];
  const normalizedSearch = search.trim().toLowerCase();
  const searchedEvents = useMemo(
    () =>
      events.filter(event => {
        if (!normalizedSearch) return true;
        const acknowledgementNames = event.celebrations
          .map(entry => entry.adminName)
          .join(" ");
        return `${event.agentName} ${event.title} ${event.description} ${event.valueLabel ?? ""} ${acknowledgementNames}`
          .toLowerCase()
          .includes(normalizedSearch);
      }),
    [events, normalizedSearch]
  );

  const milestones = searchedEvents.filter(
    event => event.category === "personal"
  );
  const upcomingMilestones = milestones
    .filter(event => event.timeframe === "upcoming")
    .sort(nearestFirst);
  const todayMilestones = milestones
    .filter(event => event.timeframe === "today")
    .sort(newestFirst);
  const pastMilestones = milestones
    .filter(event => event.timeframe === "recent")
    .sort(newestFirst);
  const celebrations = searchedEvents
    .filter(event => event.category !== "personal")
    .sort(newestFirst);
  const celebrationTagCount = events.reduce(
    (total, event) => total + event.celebrations.length,
    0
  );

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

  const cardProps = {
    currentAdminId: Number((user as any)?.id) || null,
    onCopy: (event: CelebrationEvent) => void copyMessage(event),
    onEmail: emailAgent,
    onNavigate: navigate,
    onCelebrate: (event: CelebrationEvent) => markCelebrated.mutate(event),
    onUndo: (eventKey: string) => reopen.mutate({ eventKey }),
    pendingKey,
  };

  return (
    <main className="mx-auto max-w-[1500px] space-y-4 pb-6">
      <section className="flex flex-col gap-3 rounded-xl border border-amber-200/70 bg-gradient-to-r from-amber-50 via-background to-cyan-50 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-amber-600" />
            <h1 className="text-2xl font-bold tracking-tight">
              Agent Celebration
            </h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Date milestones on the left. Every other reason to celebrate on the
            right. Newest wins are always first.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="bg-white/75">
            {events.length} opportunities
          </Badge>
          <Badge
            variant="outline"
            className="border-emerald-200 bg-emerald-50 text-emerald-700"
          >
            {celebrationTagCount} celebration{" "}
            {celebrationTagCount === 1 ? "tag" : "tags"}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="bg-white/75"
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
            />{" "}
            Refresh
          </Button>
        </div>
      </section>

      <Card className="border-border/70 shadow-sm">
        <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search agent, milestone, or celebration…"
              className="h-9 pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Show</span>
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
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/30">
          <CardContent className="py-12 text-center">
            <p className="font-semibold text-destructive">
              Celebration opportunities could not be loaded.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {error.message}
            </p>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <section className="grid items-start gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden border-border/70 shadow-sm">
            <ColumnHeader
              icon={CalendarDays}
              title="Milestones"
              description="Birthdays and Savvy anniversaries"
              count={milestones.length}
              tone="bg-violet-100 text-violet-700"
            />
            <CardContent className="p-0">
              {isLoading ? (
                <CompactSkeletons />
              ) : (
                <div className="space-y-5 p-3 lg:max-h-[calc(100vh-245px)] lg:overflow-y-auto">
                  <MilestoneSection
                    title="Upcoming"
                    count={upcomingMilestones.length}
                    events={upcomingMilestones}
                    empty="No upcoming milestones in the next 30 days."
                    cardProps={cardProps}
                  />
                  <MilestoneSection
                    title="Today"
                    count={todayMilestones.length}
                    events={todayMilestones}
                    empty="No milestones today."
                    cardProps={cardProps}
                  />
                  <MilestoneSection
                    title="Past"
                    count={pastMilestones.length}
                    events={pastMilestones}
                    empty={`No milestones in the past ${daysBack} days.`}
                    cardProps={cardProps}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/70 shadow-sm">
            <ColumnHeader
              icon={Trophy}
              title="Celebrations"
              description="Production, goals, client praise, and team wins"
              count={celebrations.length}
              tone="bg-amber-100 text-amber-700"
            />
            <CardContent className="p-0">
              {isLoading ? (
                <CompactSkeletons />
              ) : celebrations.length === 0 ? (
                <div className="p-3">
                  <EmptySection>
                    No celebrations match this search.
                  </EmptySection>
                </div>
              ) : (
                <div className="space-y-2 p-3 lg:max-h-[calc(100vh-245px)] lg:overflow-y-auto">
                  {celebrations.map(event => (
                    <EventCard key={event.key} event={event} {...cardProps} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}
    </main>
  );
}
