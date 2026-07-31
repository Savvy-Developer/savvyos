import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Search,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Loader2,
  CalendarDays,
  Target,
  Activity,
  RefreshCw,
  UserCheck,
  Zap,
  Brain,
  BarChart3,
  ListChecks,
  Shield,
  MapPin,
  ArrowUpRight,
  ArrowDownRight,
  Play,
  FileText,
  Settings,
  DollarSign,
  Building2,
  ClipboardCheck,
  CalendarClock,
  Gauge,
  HelpCircle,
} from "lucide-react";
import { safeFormat, safeFormatET } from "@/lib/safeFormat";

// ─── Sub-views ─────────────────────────────────────────────────────────────
import CoachingCommandCenter from "@/components/coaching/CoachingCommandCenter";
import CoachingAgentPortfolio from "@/components/coaching/CoachingAgentPortfolio";
import CoachingCommitmentsView from "@/components/coaching/CoachingCommitmentsView";
import CoachingResetsView from "@/components/coaching/CoachingResetsView";
import CoachingMarketCoverage from "@/components/coaching/CoachingMarketCoverage";
import CoachingEscalationsView from "@/components/coaching/CoachingEscalationsView";
import CoachingReportsView from "@/components/coaching/CoachingReportsView";
import CoachingSettingsView from "@/components/coaching/CoachingSettingsView";
import CoachingHelpView from "@/components/coaching/CoachingHelpView";

type ViewId = "command" | "portfolio" | "sessions" | "commitments" | "resets" | "markets" | "escalations" | "reports" | "settings" | "help";

const VIEWS: { id: ViewId; label: string; shortLabel: string; icon: any }[] = [
  { id: "command", label: "Command Center", shortLabel: "Command", icon: BarChart3 },
  { id: "portfolio", label: "Agent Portfolio", shortLabel: "Portfolio", icon: Users },
  { id: "sessions", label: "Sessions", shortLabel: "Sessions", icon: CalendarDays },
  { id: "commitments", label: "Commitments", shortLabel: "Commits", icon: ListChecks },
  { id: "resets", label: "Performance Resets", shortLabel: "Resets", icon: AlertTriangle },
  { id: "markets", label: "Market Coverage", shortLabel: "Markets", icon: MapPin },
  { id: "escalations", label: "Escalations", shortLabel: "Escalate", icon: Shield },
  { id: "reports", label: "Reports", shortLabel: "Reports", icon: FileText },
  { id: "settings", label: "Settings", shortLabel: "Settings", icon: Settings },
  { id: "help", label: "Help & Definitions", shortLabel: "Help", icon: HelpCircle },
];

export default function CoachingHubPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [activeView, setActiveView] = useState<ViewId>("command");

  // Get command center data for badge counts
  const { data: commandData } = trpc.coaching.getCommandCenter.useQuery(undefined, {
    staleTime: 60_000,
  });

  const metrics = commandData?.metrics;
  const totalActions = (metrics?.overdueCommitments ?? 0) + (metrics?.noSessionIn14Days ?? 0) + (metrics?.unassignedCoachAgents ?? 0) + (metrics?.activeResets ?? 0);

  return (
    <div className="p-6 max-w-screen-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            Coaching Hub
            {totalActions > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">{totalActions} actions</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            The operating system for agent success at Savvy
          </p>
        </div>
      </div>

      {/* Sub-Navigation */}
      <div className="border-b">
        <nav className="flex gap-1 overflow-x-auto pb-px -mb-px">
          {VIEWS.map((view) => {
            const isActive = activeView === view.id;
            // Badge counts for specific views
            let badge: number | null = null;
            if (view.id === "commitments" && metrics?.overdueCommitments) badge = metrics.overdueCommitments;
            if (view.id === "resets" && metrics?.activeResets) badge = metrics.activeResets;
            if (view.id === "escalations" && metrics?.openEscalations) badge = metrics.openEscalations;
            return (
              <button
                key={view.id}
                onClick={() => setActiveView(view.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                }`}
              >
                <view.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{view.label}</span>
                <span className="sm:hidden">{view.shortLabel}</span>
                {badge !== null && badge > 0 && (
                  <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Active View */}
      {activeView === "command" && <CoachingCommandCenter />}
      {activeView === "portfolio" && <CoachingAgentPortfolio />}
      {activeView === "sessions" && <CoachingSessionsInline />}
      {activeView === "commitments" && <CoachingCommitmentsView />}
      {activeView === "resets" && <CoachingResetsView />}
      {activeView === "markets" && <CoachingMarketCoverage />}
      {activeView === "escalations" && <CoachingEscalationsView />}
      {activeView === "reports" && <CoachingReportsView />}
      {activeView === "settings" && <CoachingSettingsView />}
      {activeView === "help" && <CoachingHelpView />}
    </div>
  );
}

// ─── Inline Sessions View (reuses the existing sessions page logic) ────────
function CoachingSessionsInline() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data, isLoading } = trpc.coaching.listSessions.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    limit: 50,
  });

  const sessions = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Coaching Sessions</h2>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Scheduled">Scheduled</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Canceled">Canceled</SelectItem>
              <SelectItem value="No Show">No Show</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No sessions found</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Coach</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((row: any) => (
                  <TableRow
                    key={row.session.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/coaching/session/${row.session.id}`)}
                  >
                    <TableCell className="font-medium text-sm">{row.agentName ?? "—"}</TableCell>
                    <TableCell className="text-sm">{row.coachName ?? "—"}</TableCell>
                    <TableCell className="text-sm">{safeFormat(row.session.sessionDate, "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-sm">{row.session.sessionType ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={row.session.status === "Completed" ? "default" : row.session.status === "Scheduled" ? "secondary" : "outline"} className="text-xs">
                        {row.session.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.session.durationMinutes ? `${row.session.durationMinutes}m` : "—"}</TableCell>
                    <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
