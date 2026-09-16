import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  UsersRound,
} from "lucide-react";

const PAGE_SIZE = 50;
const ALL = "all";

type AppointmentStatus = "scheduled" | "confirmed" | "canceled" | "completed" | "no_show";
type AppointmentSource = "savvyos" | "calendly";

function displayDateTime(value: Date | string, timezone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

function statusClass(status: string) {
  const classes: Record<string, string> = {
    scheduled: "border-sky-200 bg-sky-50 text-sky-800",
    confirmed: "border-emerald-200 bg-emerald-50 text-emerald-800",
    canceled: "border-slate-200 bg-slate-100 text-slate-700",
    completed: "border-violet-200 bg-violet-50 text-violet-800",
    no_show: "border-amber-200 bg-amber-50 text-amber-800",
  };
  return classes[status] ?? "border-muted bg-muted text-muted-foreground";
}

function AgentAppointmentsTableSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/20 pb-4">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="mt-2 h-4 w-80" />
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

export default function AgentAppointmentsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [agentId, setAgentId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const queryInput = useMemo(() => ({
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    agentId: agentId === ALL ? undefined : Number(agentId),
    status: status === ALL ? undefined : status as AppointmentStatus,
    source: source === ALL ? undefined : source as AppointmentSource,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }), [agentId, dateFrom, dateTo, page, search, source, status]);

  const { data, error, isLoading, isFetching, refetch } = trpc.appointments.directory.useQuery(queryInput, {
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const rows = data?.rows ?? [];
  const agents = data?.agents ?? [];
  const total = Number(data?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(page * PAGE_SIZE, total);
  const hasFilters = !!search || agentId !== ALL || status !== ALL || source !== ALL || !!dateFrom || !!dateTo;

  function resetFilters() {
    setSearchInput("");
    setSearch("");
    setAgentId(ALL);
    setStatus(ALL);
    setSource(ALL);
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.09] via-background to-sky-50/70 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">CRM</p>
              <Badge variant="secondary">Admin directory</Badge>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Agent Appointments</h1>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Search every client appointment hosted by a Savvy agent, including SavvyOS and Calendly bookings.
                </p>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Find appointments</CardTitle>
          <CardDescription>Filter by agent, status, booking source, appointment date, or contact details.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-1.5 xl:col-span-2">
            <Label htmlFor="agent-appointments-search" className="text-xs">Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="agent-appointments-search"
                value={searchInput}
                onChange={event => setSearchInput(event.target.value)}
                placeholder="Contact, agent, email, phone, or title…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Agent</Label>
            <Select value={agentId} onValueChange={value => { setAgentId(value); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="All agents" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All agents</SelectItem>
                {agents.map((agent: any) => (
                  <SelectItem key={agent.id} value={String(agent.id)}>
                    {agent.name || agent.email || `Agent #${agent.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={value => { setStatus(value); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="no_show">No show</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Source</Label>
            <Select value={source} onValueChange={value => { setSource(value); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="All sources" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sources</SelectItem>
                <SelectItem value="savvyos">SavvyOS</SelectItem>
                <SelectItem value="calendly">Calendly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={resetFilters} disabled={!hasFilters}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reset
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-appointments-from" className="text-xs">From</Label>
            <Input id="agent-appointments-from" type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setPage(1); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-appointments-to" className="text-xs">To</Label>
            <Input id="agent-appointments-to" type="date" min={dateFrom || undefined} value={dateTo} onChange={event => { setDateTo(event.target.value); setPage(1); }} />
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-rose-200">
          <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
            <CalendarDays className="mb-3 h-8 w-8 text-rose-600" />
            <p className="font-semibold">Unable to load Agent Appointments</p>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">{error.message}</p>
            <Button className="mt-4" variant="outline" onClick={() => void refetch()}>Try again</Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <AgentAppointmentsTableSkeleton />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Appointment directory</CardTitle>
                <CardDescription className="mt-1">Open a contact directly from the appointment record.</CardDescription>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <UsersRound className="h-4 w-4" />
                <span>{total.toLocaleString()} appointment{total === 1 ? "" : "s"} found</span>
                {isFetching && <span className="text-xs">Updating…</span>}
              </div>
            </div>
          </CardHeader>
          {rows.length === 0 ? (
            <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
              <CalendarDays className="mb-3 h-9 w-9 text-muted-foreground/60" />
              <p className="font-semibold">No appointments match those filters</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">Try another date range, agent, status, or search term.</p>
              {hasFilters && <Button className="mt-4" variant="outline" size="sm" onClick={resetFilters}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset filters</Button>}
            </CardContent>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-sm">
                  <thead className="bg-muted/40">
                    <tr className="border-y text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 text-left font-semibold">When</th>
                      <th className="px-3 py-3 text-left font-semibold">Agent</th>
                      <th className="px-3 py-3 text-left font-semibold">Contact</th>
                      <th className="px-3 py-3 text-left font-semibold">Appointment</th>
                      <th className="px-3 py-3 text-left font-semibold">Status</th>
                      <th className="px-3 py-3 text-left font-semibold">Source</th>
                      <th className="px-4 py-3 text-right font-semibold">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row: any) => {
                      const appointment = row.appointment;
                      const contactName = [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" ") || "Unnamed contact";
                      const agentName = row.agent.name || row.agent.email || `Agent #${row.agent.id}`;
                      const hasLocationLink = /^https?:\/\//i.test(appointment.location || "");
                      return (
                        <tr key={appointment.id} className="border-b align-top transition-colors hover:bg-muted/20">
                          <td className="whitespace-nowrap px-4 py-3.5">
                            <p className="font-medium">{displayDateTime(appointment.startAt, appointment.timezone)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{Math.max(0, Math.round((new Date(appointment.endAt).getTime() - new Date(appointment.startAt).getTime()) / 60_000))} minutes</p>
                          </td>
                          <td className="px-3 py-3.5">
                            <p className="font-medium">{agentName}</p>
                            {row.agent.email && <p className="mt-1 text-xs text-muted-foreground">{row.agent.email}</p>}
                          </td>
                          <td className="px-3 py-3.5">
                            <p className="font-medium">{contactName}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{row.contact.email || row.contact.phone || "No contact detail"}</p>
                          </td>
                          <td className="max-w-[330px] px-3 py-3.5">
                            <p className="font-medium">{appointment.title}</p>
                            {appointment.location && (
                              hasLocationLink ? (
                                <a href={appointment.location} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-primary hover:underline">
                                  <ExternalLink className="h-3 w-3 shrink-0" /> {appointment.location}
                                </a>
                              ) : <p className="mt-1 truncate text-xs text-muted-foreground">{appointment.location}</p>
                            )}
                            {!appointment.location && <p className="mt-1 text-xs text-muted-foreground">Appointment #{appointment.id}</p>}
                          </td>
                          <td className="px-3 py-3.5"><Badge variant="outline" className={statusClass(appointment.status)}>{titleCase(appointment.status)}</Badge></td>
                          <td className="px-3 py-3.5">
                            <Badge variant="outline" className="capitalize">{appointment.source}</Badge>
                            <p className="mt-1 text-xs text-muted-foreground">{appointment.calendarProvider === "none" ? "Email invitation" : titleCase(appointment.calendarProvider)}</p>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/contacts/${row.contact.id}`}><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Contact</Link>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">Showing {showingStart.toLocaleString()}–{showingEnd.toLocaleString()} of {total.toLocaleString()}</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage(current => Math.max(1, current - 1))}><ChevronLeft className="mr-1 h-4 w-4" /> Previous</Button>
                  <span className="min-w-20 text-center text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages || isFetching} onClick={() => setPage(current => Math.min(totalPages, current + 1))}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
                </div>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
