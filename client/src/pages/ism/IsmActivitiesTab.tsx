import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Info,
  Link2,
  Loader2,
  RotateCcw,
  Search,
  UserRound,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatActivityEntry } from "@/lib/activityFormatter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type ActivityType =
  | "all"
  | "page_open"
  | "contact_open"
  | "contact"
  | "communication"
  | "task"
  | "agent_connection"
  | "auth";

const ACTIVITY_TYPE_OPTIONS: Array<{ value: ActivityType; label: string }> = [
  { value: "all", label: "All activity" },
  { value: "page_open", label: "Pages opened" },
  { value: "contact_open", label: "Contacts opened" },
  { value: "contact", label: "Contact activity" },
  { value: "communication", label: "Notes & communications" },
  { value: "task", label: "Tasks" },
  { value: "agent_connection", label: "Pipeline & connections" },
  { value: "auth", label: "Sign-ins" },
];

const ICONS = {
  plus: CheckCircle2,
  edit: Activity,
  check: CheckCircle2,
  link: Link2,
  dollar: Activity,
  alert: AlertTriangle,
  info: Info,
};

const ICON_CLASSES: Record<string, string> = {
  plus: "bg-emerald-100 text-emerald-700",
  edit: "bg-blue-100 text-blue-700",
  check: "bg-teal-100 text-teal-700",
  link: "bg-violet-100 text-violet-700",
  dollar: "bg-amber-100 text-amber-700",
  alert: "bg-rose-100 text-rose-700",
  info: "bg-slate-100 text-slate-700",
};

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

function displayTimestamp(value: Date | string | null | undefined) {
  if (!value) return "Unknown time";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function displayEntityType(value: string | null | undefined) {
  if (!value) return "Activity";
  return value.replace(/_/g, " ");
}

function activityFilters(type: ActivityType) {
  if (type === "page_open") return { actions: ["page_opened"] };
  if (type === "contact_open") return { actions: ["contact_opened"] };
  if (type === "auth") return { actions: ["user_login"] };
  if (type === "all") return {};
  return { entityTypes: [type] };
}

export default function IsmActivitiesTab() {
  const defaultRange = initialRange();
  const [selectedIsaIds, setSelectedIsaIds] = useState<string[]>([]);
  const [activityType, setActivityType] = useState<ActivityType>("all");
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom);
  const [dateTo, setDateTo] = useState(defaultRange.dateTo);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const typeFilters = useMemo(() => activityFilters(activityType), [activityType]);
  const queryInput = useMemo(
    () => ({
      page,
      limit: pageSize,
      isaIds: selectedIsaIds.length ? selectedIsaIds.map(Number) : undefined,
      entityTypes: typeFilters.entityTypes,
      actions: typeFilters.actions,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [dateFrom, dateTo, page, selectedIsaIds, typeFilters.actions, typeFilters.entityTypes]
  );

  const { data, isLoading, isFetching, error, refetch } = trpc.analytics.ismActivityLog.useQuery(queryInput, {
    staleTime: 20_000,
    refetchOnWindowFocus: false,
  });
  const rows = (data?.rows ?? []) as Array<{
    log: any;
    user: any;
    recordLinks?: Array<{ entityType: string; entityId: number; label: string; href: string }>;
  }>;
  const total = Number(data?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isaOptions = (data?.isas ?? []).map((isa: any) => ({
    value: String(isa.id),
    label: isa.name ?? isa.email ?? "Unnamed ISA",
    description: isa.title ?? (isa.isActive ? "Active" : "Inactive"),
  }));
  const hasFilters = selectedIsaIds.length > 0 || activityType !== "all" || !!dateFrom || !!dateTo;

  const updateIsaIds = (value: string[]) => {
    setSelectedIsaIds(value);
    setPage(1);
  };

  const resetFilters = () => {
    const range = initialRange();
    setSelectedIsaIds([]);
    setActivityType("all");
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.09] via-background to-cyan-50/60 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">ISA audit trail</p>
              <Badge variant="secondary">Live activity history</Badge>
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">See how ISAs are working across SavvyOS.</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Review successful recorded work alongside ISA page and contact openings. New navigation events are captured from this release forward; existing notes, tasks, connections, and other actions remain available in the history.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter activity</CardTitle>
          <CardDescription>Choose one or more ISAs, an activity type, and a date range.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1.5 xl:col-span-2">
            <Label className="text-xs">ISAs</Label>
            <MultiSelect
              options={isaOptions}
              value={selectedIsaIds}
              onValueChange={updateIsaIds}
              placeholder="All ISAs"
              searchPlaceholder="Search ISAs…"
              maxDisplay={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Activity type</Label>
            <Select value={activityType} onValueChange={(value) => { setActivityType(value as ActivityType); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="All activity" /></SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ism-activity-from" className="text-xs">From</Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="ism-activity-from" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} className="pl-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ism-activity-to" className="text-xs">To</Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="ism-activity-to" type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} className="pl-9" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Search className="h-4 w-4" />
          <span>{total.toLocaleString()} activit{total === 1 ? "y" : "ies"} found</span>
          {isFetching && !isLoading && <span className="text-xs">Updating…</span>}
        </div>
        {hasFilters && (
          <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset filters
          </Button>
        )}
      </div>

      {error ? (
        <Card className="border-rose-200">
          <CardContent className="flex min-h-56 flex-col items-center justify-center p-8 text-center">
            <AlertTriangle className="mb-3 h-8 w-8 text-rose-600" />
            <p className="font-semibold">Unable to load ISA activity</p>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">{error.message}</p>
            <Button className="mt-4" variant="outline" onClick={() => void refetch()}>Try again</Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
            <UserRound className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-semibold">No ISA activity matches these filters</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">Try a wider date range or another activity type.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map(({ log, user, recordLinks = [] }) => {
            const formatted = formatActivityEntry({ log, user });
            const Icon = ICONS[formatted.icon] ?? Info;
            const details = (log.details ?? {}) as Record<string, unknown>;
            const isFileActivity = log.entityType === "file" || log.action === "downloaded_file" || log.action === "opened_file";
            const fileName = typeof details.fileName === "string" ? details.fileName : null;
            const actorName = user?.name ?? user?.email ?? "Unnamed ISA";

            return (
              <Card key={log.id} className="border-border/80 shadow-sm">
                <CardContent className="flex gap-3 p-4">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ICON_CLASSES[formatted.icon] ?? ICON_CLASSES.info}`}>
                    {isFileActivity ? <FileText className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="font-medium text-sm">{isFileActivity ? (log.action === "opened_file" ? "Opened a file" : "Downloaded a file") : formatted.title}</p>
                      <Badge variant="secondary" className="capitalize text-[10px]">{displayEntityType(log.entityType)}</Badge>
                    </div>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">{actorName}</p>
                    {recordLinks.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {recordLinks.map((recordLink) => (
                          <Link
                            key={`${recordLink.href}-${recordLink.entityType}`}
                            href={recordLink.href}
                            className="inline-flex max-w-full items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            title={`Open ${recordLink.label}`}
                          >
                            <Link2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="max-w-[30rem] truncate">{recordLink.label}</span>
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                          </Link>
                        ))}
                      </div>
                    )}
                    {fileName ? (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><FileText className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{fileName}</span></p>
                    ) : formatted.lines.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {formatted.lines.slice(0, 4).map((line, index) => <span key={index} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{line}</span>)}
                      </div>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">{displayTimestamp(log.createdAt)}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {total > pageSize && (
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || isFetching}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || isFetching}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
