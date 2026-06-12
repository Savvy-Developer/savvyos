import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronRight,
  ChevronDown,
  Mail,
  Phone,
  MapPin,
  Users,
  Search,
  Expand,
  Minimize2,
  X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type OrgUser = {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  role: string;
  reportsToId: number | null;
  marketProfileId: number | null;
  marketName: string | null;
  groupName: string | null;
  openId: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const ROLE_ORDER = ["admin", "isa", "agent_support", "agent", "user"];

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  agent: "Agent",
  isa: "ISA",
  agent_support: "Agent Support",
  user: "User",
};

const ROLE_BADGE_COLORS: Record<string, string> = {
  admin: "bg-amber-100 text-amber-800 border-amber-200",
  agent: "bg-blue-100 text-blue-800 border-blue-200",
  isa: "bg-purple-100 text-purple-800 border-purple-200",
  agent_support: "bg-teal-100 text-teal-700 border-teal-200",
  user: "bg-gray-100 text-gray-700 border-gray-200",
};

const ROLE_LEFT_BORDER: Record<string, string> = {
  admin: "border-l-amber-400",
  agent: "border-l-blue-400",
  isa: "border-l-purple-400",
  agent_support: "border-l-teal-400",
  user: "border-l-gray-300",
};

const ROLE_AVATAR: Record<string, string> = {
  admin: "bg-amber-100 text-amber-700",
  agent: "bg-blue-100 text-blue-700",
  isa: "bg-purple-100 text-purple-700",
  agent_support: "bg-teal-100 text-teal-700",
  user: "bg-gray-100 text-gray-600",
};

function initials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

// ─── Single node card ─────────────────────────────────────────────────────────
function OrgNode({
  user,
  directChildren,
  allUsers,
  depth,
  expandedSet,
  toggleExpand,
  detailSet,
  toggleDetail,
  searchQuery,
}: {
  user: OrgUser;
  directChildren: OrgUser[];
  allUsers: OrgUser[];
  depth: number;
  expandedSet: Set<number>;
  toggleExpand: (id: number) => void;
  detailSet: Set<number>;
  toggleDetail: (id: number) => void;
  searchQuery: string;
}) {
  const isExpanded = expandedSet.has(user.id);
  const isDetailOpen = detailSet.has(user.id);
  const hasChildren = directChildren.length > 0;

  // Group children by role for display
  const childrenByRole = useMemo(() => {
    const map: Record<string, OrgUser[]> = {};
    for (const child of directChildren) {
      if (!map[child.role]) map[child.role] = [];
      map[child.role].push(child);
    }
    return map;
  }, [directChildren]);

  const isHighlighted =
    searchQuery.trim() &&
    ((user.name ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.email ?? "").toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className={depth > 0 ? "ml-6 border-l-2 border-border/50 pl-4" : ""}>
      {/* ── Card ── */}
      <div
        className={`
          relative flex items-start gap-3 p-3 rounded-lg border border-border border-l-4
          bg-card shadow-sm mb-2 transition-all duration-150
          ${ROLE_LEFT_BORDER[user.role] ?? "border-l-gray-300"}
          ${isHighlighted ? "ring-2 ring-primary/40 bg-primary/5" : ""}
        `}
      >
        {/* Avatar */}
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
            ROLE_AVATAR[user.role] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          {initials(user.name)}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground">
              {user.name ?? user.email ?? "Unknown"}
            </span>
            <Badge
              variant="outline"
              className={`text-xs px-1.5 py-0 ${ROLE_BADGE_COLORS[user.role] ?? ""}`}
            >
              {ROLE_LABELS[user.role] ?? user.role}
            </Badge>
            {user.title && (
              <span className="text-xs text-muted-foreground">{user.title}</span>
            )}
          </div>

          {/* Market / Group tags */}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {user.marketName && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                {user.marketName}
              </span>
            )}
            {user.groupName && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3 shrink-0" />
                {user.groupName}
              </span>
            )}
          </div>

          {/* Collapsible contact info */}
          {isDetailOpen && (
            <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
              {user.email && (
                <a
                  href={`mailto:${user.email}`}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <Mail className="h-3 w-3 shrink-0" />
                  {user.email}
                </a>
              )}
              {user.phone && (
                <a
                  href={`tel:${user.phone}`}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <Phone className="h-3 w-3 shrink-0" />
                  {user.phone}
                </a>
              )}
              {!user.email && !user.phone && (
                <p className="text-xs text-muted-foreground italic">No contact info on file</p>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Toggle contact info */}
          <button
            onClick={() => toggleDetail(user.id)}
            className={`p-1 rounded hover:bg-muted transition-colors ${
              isDetailOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
            title={isDetailOpen ? "Hide contact info" : "Show contact info"}
          >
            <Mail className="h-3.5 w-3.5" />
          </button>

          {/* Toggle children */}
          {hasChildren && (
            <button
              onClick={() => toggleExpand(user.id)}
              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex items-center gap-0.5"
              title={isExpanded ? "Collapse" : `Expand (${directChildren.length})`}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <>
                  <ChevronRight className="h-4 w-4" />
                  <span className="text-xs font-medium bg-muted rounded-full px-1.5 py-0.5 leading-none">
                    {directChildren.length}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Children grouped by role ── */}
      {isExpanded && hasChildren && (
        <div className="ml-2 mb-2">
          {ROLE_ORDER.filter((r) => childrenByRole[r]?.length).map((role) => (
            <div key={role} className="mb-3">
              {/* Role group header */}
              <div className="flex items-center gap-2 mb-1.5 ml-2">
                <div className="h-px flex-1 bg-border/60" />
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    ROLE_BADGE_COLORS[role] ?? "bg-gray-100 text-gray-700 border-gray-200"
                  }`}
                >
                  {ROLE_LABELS[role] ?? role}s ({childrenByRole[role].length})
                </span>
                <div className="h-px flex-1 bg-border/60" />
              </div>
              {childrenByRole[role].map((child) => (
                <OrgNode
                  key={child.id}
                  user={child}
                  directChildren={allUsers.filter((u) => u.reportsToId === child.id && u.id !== child.id)}
                  allUsers={allUsers}
                  depth={depth + 1}
                  expandedSet={expandedSet}
                  toggleExpand={toggleExpand}
                  detailSet={detailSet}
                  toggleDetail={toggleDetail}
                  searchQuery={searchQuery}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function OrgChartPage() {
  const { data: rawUsers = [], isLoading } = trpc.users.orgChart.useQuery(undefined, {
    staleTime: 60_000,
  });
  const users = rawUsers as OrgUser[];

  // All expanded node IDs — starts empty (collapsed by default)
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());
  const [detailSet, setDetailSet] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  function toggleExpand(id: number) {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleDetail(id: number) {
    setDetailSet((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpandedSet(new Set(users.map((u) => u.id)));
  }

  function collapseAll() {
    setExpandedSet(new Set());
  }

  // Root nodes: no reportsToId, self-referencing (reportsToId === own id), or reportsToId not in the list
  const idSet = useMemo(() => new Set(users.map((u) => u.id)), [users]);
  const roots = useMemo(
    () => users.filter((u) => !u.reportsToId || u.reportsToId === u.id || !idSet.has(u.reportsToId)),
    [users, idSet]
  );

  // When search changes, auto-expand ancestors of matches
  const matchedIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<number>();
    const q = searchQuery.toLowerCase();
    return new Set(
      users
        .filter(
          (u) =>
            (u.name ?? "").toLowerCase().includes(q) ||
            (u.email ?? "").toLowerCase().includes(q)
        )
        .map((u) => u.id)
    );
  }, [users, searchQuery]);

  // Auto-expand ancestors when searching
  useMemo(() => {
    if (!matchedIds.size) return;
    const toExpand = new Set<number>();
    const userMap = new Map(users.map((u) => [u.id, u]));
    for (const id of Array.from(matchedIds)) {
      let cur = userMap.get(id);
      while (cur?.reportsToId) {
        toExpand.add(cur.reportsToId);
        cur = userMap.get(cur.reportsToId);
      }
    }
    setExpandedSet((prev) => new Set(Array.from(prev).concat(Array.from(toExpand))));
  }, [matchedIds]);

  const totalCount = users.length;
  const adminCount = users.filter((u) => u.role === "admin").length;
  const agentCount = users.filter((u) => u.role === "agent").length;
  const isaCount = users.filter((u) => u.role === "isa").length;

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6" /> Org Chart
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {totalCount} team members &mdash; {adminCount} admin{adminCount !== 1 ? "s" : ""},{" "}
          {agentCount} agent{agentCount !== 1 ? "s" : ""}, {isaCount} ISA{isaCount !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-8"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={expandAll}>
          <Expand className="h-4 w-4 mr-1.5" /> Expand All
        </Button>
        <Button variant="outline" size="sm" onClick={collapseAll}>
          <Minimize2 className="h-4 w-4 mr-1.5" /> Collapse All
        </Button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        {Object.entries(ROLE_LABELS).map(([role, label]) => (
          <span
            key={role}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-medium ${
              ROLE_BADGE_COLORS[role] ?? ""
            }`}
          >
            {label}
          </span>
        ))}
        <span className="text-muted-foreground ml-1">
          &bull; Click <Mail className="h-3 w-3 inline" /> for contact info &bull; Click{" "}
          <ChevronRight className="h-3 w-3 inline" /> to expand
        </span>
      </div>

      {/* Tree */}
      <div className="space-y-1">
        {roots.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-10">
            No users found. Add team members and assign "Reports To" to build the chart.
          </p>
        ) : (
          roots.map((root) => (
            <OrgNode
              key={root.id}
              user={root}
              directChildren={users.filter((u) => u.reportsToId === root.id && u.id !== root.id)}
              allUsers={users}
              depth={0}
              expandedSet={expandedSet}
              toggleExpand={toggleExpand}
              detailSet={detailSet}
              toggleDetail={toggleDetail}
              searchQuery={searchQuery}
            />
          ))
        )}
      </div>
    </div>
  );
}
