import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { formatActivityEntry } from "@/lib/activityFormatter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  FileText,
  Info,
  Link2,
  ExternalLink,
  Plus,
  RotateCcw,
  UserRound,
} from "lucide-react";

const ACTIVITY_TYPE_OPTIONS = [
  { value: "contact", label: "Contacts" },
  { value: "agent_connection", label: "Pipeline & Connections" },
  { value: "transaction", label: "Transactions" },
  { value: "task", label: "Tasks" },
  { value: "communication", label: "Notes & Communications" },
  { value: "document", label: "Documents" },
  { value: "file", label: "Downloads & File Opens" },
  { value: "listing", label: "Listings" },
  { value: "property", label: "Properties & Proformas" },
  { value: "smart_plan", label: "Smart Plans" },
  { value: "user", label: "User & Profile" },
  { value: "group", label: "Groups" },
  { value: "approval_request", label: "Approvals" },
  { value: "onboarding", label: "Onboarding" },
  { value: "auth", label: "Authentication" },
  { value: "coaching", label: "Coaching" },
  { value: "project", label: "Projects & Work" },
];

const ICONS = {
  plus: Plus,
  edit: Edit3,
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
  alert: "bg-red-100 text-red-700",
  info: "bg-slate-100 text-slate-700",
};

type UserActivityTabProps = {
  user: {
    id: number;
    name: string | null;
    email: string | null;
    profilePhotoUrl?: string | null;
  };
};

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

export default function UserActivityTab({ user }: UserActivityTabProps) {
  const [activityType, setActivityType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const queryInput = useMemo(() => ({
    userId: user.id,
    page,
    limit: pageSize,
    entityTypes: activityType === "all" ? undefined : [activityType],
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }), [activityType, dateFrom, dateTo, page, user.id]);

  const { data, isLoading, isFetching, refetch } = trpc.users.activityForUser.useQuery(queryInput);
  const rows = (data?.rows ?? []) as Array<{
    log: any;
    user: any;
    recordLinks?: Array<{ entityType: string; entityId: number; label: string; href: string }>;
  }>;
  const total = Number(data?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const initials = user.name
    ? user.name.split(" ").map((name) => name[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const resetFilters = () => {
    setActivityType("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const hasFilters = activityType !== "all" || !!dateFrom || !!dateTo;

  return (
    <div className="space-y-5 py-1">
      <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4">
        <Avatar className="h-10 w-10 shrink-0">
          {user.profilePhotoUrl && <AvatarImage src={user.profilePhotoUrl} alt={user.name ?? ""} className="object-cover" />}
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-semibold">{user.name ?? "Unnamed team member"}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email ?? "No email on file"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Every successful SavvyOS action is retained here, including records created or changed, notes, task work, profile changes, and file activity.
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4 text-primary" />
          Filter activity
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Activity type</Label>
            <Select value={activityType} onValueChange={(value) => { setActivityType(value); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="All activity types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All activity types</SelectItem>
                {ACTIVITY_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="activity-date-from" className="text-xs">From date</Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="activity-date-from" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} className="pl-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="activity-date-to" className="text-xs">To date</Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="activity-date-to" type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} className="pl-9" />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => void refetch()} disabled={isFetching}>
              <RotateCcw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            {hasFilters && (
              <Button type="button" variant="ghost" size="icon" title="Clear filters" onClick={resetFilters}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {total.toLocaleString()} activit{total === 1 ? "y" : "ies"} found
        </div>
        {isFetching && !isLoading && <span className="text-xs text-muted-foreground">Updating…</span>}
      </div>

      <div className="max-h-[52vh] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed py-14 text-center">
            <UserRound className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
            <p className="font-medium">No activity matches these filters</p>
            <p className="mt-1 text-sm text-muted-foreground">Try another activity type or date range.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map(({ log, user: actor, recordLinks = [] }) => {
              const formatted = formatActivityEntry({ log, user: actor });
              const Icon = ICONS[formatted.icon] ?? Info;
              const details = (log.details ?? {}) as Record<string, unknown>;
              const isDownload = log.entityType === "file" || log.action === "downloaded_file" || log.action === "opened_file";
              const fileName = typeof details.fileName === "string" ? details.fileName : null;

              return (
                <div key={log.id} className="flex gap-3 rounded-xl border bg-card p-4 shadow-sm">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ICON_CLASSES[formatted.icon] ?? ICON_CLASSES.info}`}>
                    {isDownload ? <Download className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="font-medium text-sm">{isDownload ? (log.action === "opened_file" ? "Opened a file" : "Downloaded a file") : formatted.title}</p>
                      <Badge variant="secondary" className="capitalize text-[10px]">{displayEntityType(log.entityType)}</Badge>
                    </div>
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
                </div>
              );
            })}
          </div>
        )}
      </div>

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
