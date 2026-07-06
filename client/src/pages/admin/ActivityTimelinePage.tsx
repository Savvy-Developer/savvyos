import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { formatActivityEntry } from "@/lib/activityFormatter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Plus,
  Edit3,
  CheckCircle2,
  Link2,
  DollarSign,
  AlertTriangle,
  Info,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useLocation } from "wouter";

// ─── Entity type options ──────────────────────────────────────────────────────
const ENTITY_TYPE_OPTIONS = [
  { value: "contact", label: "Contacts" },
  { value: "transaction", label: "Transactions" },
  { value: "listing", label: "Listings" },
  { value: "task", label: "Tasks" },
  { value: "property", label: "Properties" },
  { value: "smart_plan", label: "Smart Plans" },
  { value: "user", label: "Users / Logins" },
  { value: "payout", label: "Payouts" },
  { value: "agent_connection", label: "Agent Connections" },
];

// ─── Entity link builder ──────────────────────────────────────────────────────
function getEntityLink(entityType?: string, entityId?: number): string | null {
  if (!entityType || !entityId) return null;
  switch (entityType) {
    case "contact": return `/contacts/${entityId}`;
    case "transaction": return `/transactions/${entityId}`;
    case "listing": return `/listings/${entityId}`;
    case "task": return `/tasks/${entityId}`;
    case "property": return `/properties/${entityId}`;
    case "smart_plan": return `/smart-plans`;
    case "user": return `/users`;
    default: return null;
  }
}

function getEntityLabel(entityType?: string, entityId?: number): string | null {
  if (!entityType || !entityId) return null;
  const labels: Record<string, string> = {
    contact: "Contact",
    transaction: "Transaction",
    listing: "Listing",
    task: "Task",
    property: "Property",
    smart_plan: "Smart Plan",
    user: "User",
    payout: "Payout",
    agent_connection: "Connection",
  };
  const label = labels[entityType] ?? entityType;
  return `${label} #${entityId}`;
}

// ─── Relative time ────────────────────────────────────────────────────────────
function relativeTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function exactTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

// ─── Icon map ─────────────────────────────────────────────────────────────────
const ICON_MAP = {
  plus: Plus,
  edit: Edit3,
  check: CheckCircle2,
  link: Link2,
  dollar: DollarSign,
  alert: AlertTriangle,
  info: Info,
};

const ICON_COLOR_MAP: Record<string, string> = {
  plus: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
  edit: "text-blue-500 bg-blue-50 dark:bg-blue-950/30",
  check: "text-teal-500 bg-teal-50 dark:bg-teal-950/30",
  link: "text-violet-500 bg-violet-50 dark:bg-violet-950/30",
  dollar: "text-amber-500 bg-amber-50 dark:bg-amber-950/30",
  alert: "text-red-500 bg-red-50 dark:bg-red-950/30",
  info: "text-slate-400 bg-slate-100 dark:bg-slate-800",
};

// ─── Timeline Entry Card ──────────────────────────────────────────────────────
function TimelineEntry({
  log,
  user,
  onNavigate,
}: {
  log: {
    id: number;
    action: string;
    details?: unknown;
    createdAt?: string | Date | null;
    entityType?: string;
    entityId?: number;
    userId?: number;
  };
  user?: {
    id?: number;
    name?: string | null;
    email?: string | null;
    profilePhotoUrl?: string | null;
  } | null;
  onNavigate: (path: string) => void;
}) {
  const formatted = formatActivityEntry({ log, user });
  const IconComp = ICON_MAP[formatted.icon] ?? Info;
  const iconColorClass = ICON_COLOR_MAP[formatted.icon] ?? ICON_COLOR_MAP.info;
  const entityLink = getEntityLink(log.entityType, log.entityId);
  const entityLabel = getEntityLabel(log.entityType, log.entityId);
  const initials = user?.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <div className="relative flex gap-4 pb-6 group">
      {/* Timeline spine */}
      <div className="absolute left-[19px] top-10 bottom-0 w-px bg-border group-last:hidden" />

      {/* Action icon bubble */}
      <div className={`relative z-10 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${iconColorClass} ring-2 ring-background`}>
        <IconComp className="h-4 w-4" />
      </div>

      {/* Card */}
      <div className="flex-1 min-w-0 bg-card border border-border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start gap-3">
          {/* User avatar */}
          <Avatar className="h-8 w-8 shrink-0 mt-0.5">
            {user?.profilePhotoUrl && (
              <AvatarImage src={user.profilePhotoUrl} alt={user.name ?? ""} className="object-cover" />
            )}
            <AvatarFallback className="bg-[oklch(0.74_0.14_200)] text-[oklch(0.08_0_0)] text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-foreground">
                {user?.name ?? "System"}
              </span>
              <span className="text-sm text-muted-foreground">{formatted.title}</span>
              {entityLink && entityLabel && (
                <button
                  type="button"
                  onClick={() => onNavigate(entityLink)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[oklch(0.60_0.14_200)] hover:text-[oklch(0.50_0.14_200)] hover:underline transition-colors"
                >
                  <Link2 className="h-3 w-3" />
                  {entityLabel}
                </button>
              )}
            </div>

            {/* Change snippet */}
            {formatted.lines.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {formatted.lines.slice(0, 4).map((line, i) => (
                  <p key={i} className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-0.5 inline-block mr-1.5">
                    {line}
                  </p>
                ))}
                {formatted.lines.length > 4 && (
                  <span className="text-xs text-muted-foreground">+{formatted.lines.length - 4} more</span>
                )}
              </div>
            )}

            {/* Entity type badge + timestamp */}
            <div className="mt-2 flex items-center gap-2">
              {log.entityType && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 capitalize">
                  {log.entityType.replace(/_/g, " ")}
                </Badge>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground cursor-default">
                    {relativeTime(log.createdAt)}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {exactTime(log.createdAt)}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function TimelineSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="relative flex gap-4 pb-6">
          <div className="absolute left-[19px] top-10 bottom-0 w-px bg-border" />
          <Skeleton className="relative z-10 flex-shrink-0 w-10 h-10 rounded-full" />
          <div className="flex-1 bg-card border border-border rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ActivityTimelinePage() {
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);
  const [selectedEntityTypes, setSelectedEntityTypes] = useState<string[]>([]);
  const [liveMode, setLiveMode] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const LIMIT = 50;

  // Fetch users for filter dropdown
  const { data: usersData } = trpc.users.listWithPhotos.useQuery(undefined, {
    staleTime: 60_000,
  });

  // Fetch activity log
  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = trpc.analytics.globalActivityLog.useQuery(
    {
      page,
      limit: LIMIT,
      userId: selectedUserId,
      entityTypes: selectedEntityTypes.length > 0 ? selectedEntityTypes : undefined,
    },
    {
      refetchInterval: liveMode ? 10_000 : false,
    }
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  // Build user photo map from activity log rows for quick lookup
  const userPhotoMap = new Map<number, string | null>();
  if (usersData) {
    for (const u of usersData) {
      userPhotoMap.set(u.id, u.profilePhotoUrl ?? null);
    }
  }

  const handleRefresh = useCallback(() => {
    refetch();
    setLastRefresh(new Date());
  }, [refetch]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [selectedUserId, selectedEntityTypes]);

  // Entity type multi-select toggle
  const toggleEntityType = (value: string) => {
    setSelectedEntityTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[oklch(0.74_0.14_200)]/15 flex items-center justify-center">
            <Activity className="h-5 w-5 text-[oklch(0.60_0.14_200)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Activity Log</h1>
            <p className="text-sm text-muted-foreground">
              {total > 0 ? `${total.toLocaleString()} total events` : "System-wide audit trail"}
            </p>
          </div>
        </div>

        {/* Live toggle + refresh */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            {liveMode ? (
              <Wifi className="h-4 w-4 text-emerald-500 animate-pulse" />
            ) : (
              <WifiOff className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-muted-foreground font-medium">Live</span>
            <Switch
              checked={liveMode}
              onCheckedChange={setLiveMode}
              className="data-[state=checked]:bg-emerald-500"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6 space-y-4">
        <div className="flex flex-wrap gap-3">
          {/* User filter */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Filter by User</label>
            <Select
              value={selectedUserId ? String(selectedUserId) : "all"}
              onValueChange={(v) => setSelectedUserId(v === "all" ? undefined : Number(v))}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {usersData?.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        {u.profilePhotoUrl && <AvatarImage src={u.profilePhotoUrl} alt={u.name ?? ""} className="object-cover" />}
                        <AvatarFallback className="text-[8px] bg-[oklch(0.74_0.14_200)] text-[oklch(0.08_0_0)]">
                          {u.name?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span>{u.name}</span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 capitalize">{u.role}</Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Entity type filter (multi-select via pill toggles) */}
          <div className="flex-[2] min-w-[300px]">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Filter by Type</label>
            <div className="flex flex-wrap gap-1.5">
              {ENTITY_TYPE_OPTIONS.map((opt) => {
                const active = selectedEntityTypes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleEntityType(opt.value)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      active
                        ? "bg-[oklch(0.74_0.14_200)]/15 border-[oklch(0.74_0.14_200)]/40 text-[oklch(0.50_0.14_200)] font-medium"
                        : "border-border text-muted-foreground hover:border-[oklch(0.74_0.14_200)]/40 hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
              {selectedEntityTypes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedEntityTypes([])}
                  className="text-xs px-2.5 py-1 rounded-full border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Active filters summary */}
        {(selectedUserId || selectedEntityTypes.length > 0) && (
          <div className="flex items-center gap-2 pt-1 border-t border-border">
            <span className="text-xs text-muted-foreground">Active filters:</span>
            {selectedUserId && usersData && (
              <Badge variant="secondary" className="text-xs gap-1">
                User: {usersData.find((u) => u.id === selectedUserId)?.name ?? `#${selectedUserId}`}
                <button type="button" onClick={() => setSelectedUserId(undefined)} className="ml-1 hover:text-foreground">×</button>
              </Badge>
            )}
            {selectedEntityTypes.map((t) => (
              <Badge key={t} variant="secondary" className="text-xs gap-1 capitalize">
                {t.replace(/_/g, " ")}
                <button type="button" onClick={() => toggleEntityType(t)} className="ml-1 hover:text-foreground">×</button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Live mode indicator */}
      {liveMode && (
        <div className="flex items-center gap-2 mb-4 text-sm text-emerald-600 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Live — refreshing every 10 seconds
        </div>
      )}

      {/* Timeline */}
      {isLoading ? (
        <TimelineSkeleton count={8} />
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No activity found</p>
          <p className="text-xs mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="relative">
          {rows.map(({ log, user }: any) => {
            // Merge profilePhotoUrl from usersData if not on the log's user
            const enrichedUser = user
              ? { ...user, profilePhotoUrl: user.profilePhotoUrl ?? userPhotoMap.get(user.id) ?? null }
              : null;
            return (
              <TimelineEntry
                key={log.id}
                log={log}
                user={enrichedUser}
                onNavigate={navigate}
              />
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total.toLocaleString()} events)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isFetching}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || isFetching}
              className="gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Last refresh */}
      <p className="text-center text-xs text-muted-foreground mt-4">
        Last refreshed: {relativeTime(lastRefresh)}
      </p>
    </div>
  );
}
