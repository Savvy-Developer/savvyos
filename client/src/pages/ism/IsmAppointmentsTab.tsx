import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GitMerge,
  Loader2,
  PhoneCall,
  RefreshCw,
  RotateCcw,
  Search,
  UserRound,
  UsersRound,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 50;

type EventType = "all" | "appointments" | "connections";

function localDay(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function initialRange() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 29);
  return { dateFrom: localDay(from), dateTo: localDay(today) };
}

function displayDateTime(value: Date | string | null | undefined) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function displayDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function titleCase(value: string | null | undefined) {
  return (value ?? "Unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function EventBadge({
  eventType,
}: {
  eventType: "appointment" | "connection";
}) {
  const isAppointment = eventType === "appointment";
  return (
    <Badge
      variant="outline"
      className={
        isAppointment
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-violet-200 bg-violet-50 text-violet-700"
      }
    >
      {isAppointment ? (
        <CalendarDays className="mr-1 h-3.5 w-3.5" />
      ) : (
        <GitMerge className="mr-1 h-3.5 w-3.5" />
      )}
      {isAppointment ? "Appointment set" : "Connection made"}
    </Badge>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof CalendarDays;
  tone: string;
  onClick?: () => void;
}) {
  const card = (
    <Card className="h-full border-border/80 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
              {value.toLocaleString()}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {detail}
            </p>
          </div>
          <span className={`rounded-xl bg-muted p-2.5 ${tone}`}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
      </CardContent>
    </Card>
  );

  return onClick ? (
    <button
      type="button"
      className="rounded-xl text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
    >
      {card}
    </button>
  ) : (
    card
  );
}

export default function IsmAppointmentsTab() {
  const range = initialRange();
  const [selectedIsaIds, setSelectedIsaIds] = useState<string[]>([]);
  const [eventType, setEventType] = useState<EventType>("all");
  const [dateFrom, setDateFrom] = useState(range.dateFrom);
  const [dateTo, setDateTo] = useState(range.dateTo);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const queryInput = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      isaIds: selectedIsaIds.length ? selectedIsaIds.map(Number) : undefined,
      eventType,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: search || undefined,
    }),
    [dateFrom, dateTo, eventType, page, search, selectedIsaIds]
  );
  const { data, error, isLoading, isFetching, refetch } =
    trpc.analytics.ismAppointmentActivity.useQuery(queryInput, {
      staleTime: 15_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: false,
    });

  const rows = data?.rows ?? [];
  const summary = data?.summary ?? { appointments: 0, connections: 0 };
  const total = Number(data?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isaOptions = (data?.isas ?? []).map((isa: any) => ({
    value: String(isa.id),
    label: isa.name ?? isa.email ?? "Unnamed ISA",
    description: isa.title ?? (isa.isActive ? "Active" : "Inactive"),
  }));
  const hasFilters =
    selectedIsaIds.length > 0 ||
    eventType !== "all" ||
    !!search ||
    dateFrom !== range.dateFrom ||
    dateTo !== range.dateTo;

  const resetFilters = () => {
    const resetRange = initialRange();
    setSelectedIsaIds([]);
    setEventType("all");
    setDateFrom(resetRange.dateFrom);
    setDateTo(resetRange.dateTo);
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.09] via-background to-emerald-50/60 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                ISA conversion activity
              </p>
              <Badge variant="secondary">Live every 30 seconds</Badge>
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              See every recent appointment and agent connection by ISA.
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Appointments use the recorded appointment setter when available.
              Other connections are attributed to the ISA who created the
              connection, so managers can see exactly who connected each contact
              with which agent.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Focus the activity feed</CardTitle>
          <CardDescription>
            Filter appointments and connections by ISA, activity type, date, or
            a contact, agent, phone number, email, or connection ID.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-1.5 xl:col-span-2">
            <Label className="text-xs">ISAs</Label>
            <MultiSelect
              options={isaOptions}
              value={selectedIsaIds}
              onValueChange={value => {
                setSelectedIsaIds(value);
                setPage(1);
              }}
              placeholder="All ISAs"
              searchPlaceholder="Search ISAs…"
              maxDisplay={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Activity</Label>
            <Select
              value={eventType}
              onValueChange={value => {
                setEventType(value as EventType);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All activity</SelectItem>
                <SelectItem value="appointments">Appointments set</SelectItem>
                <SelectItem value="connections">Connections made</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ism-appts-from" className="text-xs">
              From
            </Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="ism-appts-from"
                type="date"
                value={dateFrom}
                onChange={event => {
                  setDateFrom(event.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ism-appts-to" className="text-xs">
              To
            </Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="ism-appts-to"
                type="date"
                value={dateTo}
                onChange={event => {
                  setDateTo(event.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ism-appts-search" className="text-xs">
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="ism-appts-search"
                value={searchInput}
                onChange={event => setSearchInput(event.target.value)}
                placeholder="Contact, agent, or ID…"
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-rose-200">
          <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
            <PhoneCall className="mb-3 h-8 w-8 text-rose-600" />
            <p className="font-semibold">
              Unable to load ISA appointment activity
            </p>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">
              {error.message}
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-xl" />
        </>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label="Appointments set"
              value={Number(summary.appointments ?? 0)}
              detail="Recorded appointment setter activity in this view"
              icon={CalendarDays}
              tone="text-emerald-700"
              onClick={() => {
                setEventType("appointments");
                setPage(1);
              }}
            />
            <MetricCard
              label="Connections made"
              value={Number(summary.connections ?? 0)}
              detail="ISA-created connections without an appointment flag"
              icon={GitMerge}
              tone="text-violet-700"
              onClick={() => {
                setEventType("connections");
                setPage(1);
              }}
            />
            <MetricCard
              label="Total activity"
              value={total}
              detail="Every matching record, ordered most recent first"
              icon={UsersRound}
              tone="text-primary"
              onClick={() => {
                setEventType("all");
                setPage(1);
              }}
            />
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">
                    Recent ISA appointments & connections
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Appointment records are credited to their saved ISA setter;
                    connection records use the ISA who recorded the connection.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Search className="h-4 w-4" />
                  <span>
                    {total.toLocaleString()} record{total === 1 ? "" : "s"}{" "}
                    found
                  </span>
                  {isFetching && <span className="text-xs">Updating…</span>}
                  {hasFilters && (
                    <Button variant="ghost" size="sm" onClick={resetFilters}>
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            {rows.length === 0 ? (
              <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
                <CheckCircle2 className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="font-semibold">
                  No appointment or connection activity matches
                </p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Try another ISA, activity type, date range, or search term.
                </p>
                {hasFilters && (
                  <Button
                    className="mt-4"
                    variant="outline"
                    size="sm"
                    onClick={resetFilters}
                  >
                    Reset filters
                  </Button>
                )}
              </CardContent>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1160px] text-sm">
                  <thead className="bg-muted/40">
                    <tr className="border-y text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 text-left font-semibold">
                        When
                      </th>
                      <th className="px-3 py-3 text-left font-semibold">
                        Activity
                      </th>
                      <th className="px-3 py-3 text-left font-semibold">ISA</th>
                      <th className="px-3 py-3 text-left font-semibold">
                        Agent
                      </th>
                      <th className="px-3 py-3 text-left font-semibold">
                        Contact
                      </th>
                      <th className="px-3 py-3 text-left font-semibold">
                        Pipeline & follow-up
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Open
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row: any) => {
                      const followUp = displayDate(row.followUpDate);
                      return (
                        <tr
                          key={`${row.eventType}-${row.connectionId}-${row.isa.id}`}
                          className="border-b last:border-0 hover:bg-muted/25"
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {displayDateTime(row.eventAt)}
                          </td>
                          <td className="px-3 py-3">
                            <EventBadge eventType={row.eventType} />
                            <p className="mt-1 text-xs text-muted-foreground">
                              Connection #{row.connectionId}
                            </p>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                {(row.isa.name ?? "I")
                                  .slice(0, 1)
                                  .toUpperCase()}
                              </span>
                              <div>
                                <p className="font-medium">{row.isa.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {row.isa.title ?? row.isa.email ?? "ISA"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            {row.agent.id ? (
                              <Link
                                href={`/agents/${row.agent.id}`}
                                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                              >
                                <UserRound className="h-3.5 w-3.5" />
                                {row.agent.name}
                              </Link>
                            ) : (
                              <p className="font-medium">{row.agent.name}</p>
                            )}
                            {row.agent.email && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {row.agent.email}
                              </p>
                            )}
                          </td>
                          <td className="max-w-[260px] px-3 py-3">
                            {row.contact.id ? (
                              <Link
                                href={`/contacts/${row.contact.id}`}
                                className="inline-flex max-w-full items-center gap-1 font-semibold text-primary hover:underline"
                              >
                                <UserRound className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">
                                  {row.contact.name}
                                </span>
                              </Link>
                            ) : (
                              <p className="font-semibold">
                                {row.contact.name}
                              </p>
                            )}
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {row.contact.email ??
                                row.contact.phone ??
                                "No contact detail"}
                            </p>
                          </td>
                          <td className="px-3 py-3">
                            {row.pipelineStatus ? (
                              <Badge variant="secondary">
                                {titleCase(row.pipelineStatus)}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                No status
                              </span>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">
                              {followUp
                                ? `Follow-up ${followUp}`
                                : "No follow-up date"}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/pipeline/${row.connectionId}`}
                              className="inline-flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
                            >
                              Details <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {total > PAGE_SIZE && (
              <CardContent className="flex items-center justify-between border-t py-4">
                <p className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1 || isFetching}
                    onClick={() => setPage(current => Math.max(1, current - 1))}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= totalPages || isFetching}
                    onClick={() => setPage(current => current + 1)}
                  >
                    Next <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
