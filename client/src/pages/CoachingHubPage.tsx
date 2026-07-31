import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { format } from "date-fns";
import { safeFormat } from "@/lib/safeFormat";

const PERF_STATUS_COLORS: Record<string, string> = {
  Launch: "bg-blue-100 text-blue-800 border-blue-200",
  Red: "bg-red-100 text-red-800 border-red-200",
  Yellow: "bg-amber-100 text-amber-800 border-amber-200",
  Green: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Elite: "bg-violet-100 text-violet-800 border-violet-200",
};

const RETENTION_RISK_COLORS: Record<string, string> = {
  Low: "bg-emerald-100 text-emerald-700",
  Watch: "bg-amber-100 text-amber-700",
  Elevated: "bg-orange-100 text-orange-700",
  Critical: "bg-red-100 text-red-700",
};

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  tone?: "default" | "green" | "amber" | "red" | "blue" | "violet";
}) {
  const tones: Record<string, string> = {
    default: "bg-primary/10 text-primary",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
    violet: "bg-violet-100 text-violet-700",
  };
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
          </div>
          <div className={`rounded-lg p-2.5 ${tones[tone]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CoachingHubPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [coachFilter, setCoachFilter] = useState<string>("all");

  const { data: agents, isLoading } = trpc.coaching.listProfiles.useQuery({
    performanceStatus: statusFilter !== "all" ? (statusFilter as any) : undefined,
    retentionRiskStatus: riskFilter !== "all" ? (riskFilter as any) : undefined,
    coachOfRecordId: coachFilter !== "all" ? Number(coachFilter) : undefined,
  });

  const { data: coaches } = trpc.coaching.listCoaches.useQuery();

  const filtered = (agents ?? []).filter((row: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      row.agent?.name?.toLowerCase().includes(q) ||
      row.agent?.email?.toLowerCase().includes(q) ||
      row.coach?.name?.toLowerCase().includes(q)
    );
  });

  // Summary stats
  const total = filtered.length;
  const launch = filtered.filter((r: any) => r.profile?.performanceStatus === "Launch").length;
  const red = filtered.filter((r: any) => r.profile?.performanceStatus === "Red").length;
  const critical = filtered.filter((r: any) => r.profile?.retentionRiskStatus === "Critical" || r.profile?.retentionRiskStatus === "Elevated").length;
  const elite = filtered.filter((r: any) => r.profile?.performanceStatus === "Elite").length;

  return (
    <div className="p-6 max-w-screen-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            Coaching Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Agent coaching profiles, session management, and performance tracking
          </p>
        </div>
        <Button onClick={() => navigate("/coaching/sessions")} variant="outline" size="sm">
          <CalendarDays className="h-4 w-4 mr-2" />
          All Sessions
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <SummaryCard label="Total Agents" value={total} icon={Users} />
        <SummaryCard label="Launch Phase" value={launch} icon={Activity} tone="blue" />
        <SummaryCard label="Red Status" value={red} icon={AlertTriangle} tone="red" />
        <SummaryCard label="At-Risk / Critical" value={critical} icon={AlertTriangle} tone="amber" />
        <SummaryCard label="Elite Agents" value={elite} icon={CheckCircle2} tone="violet" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search agents or coaches..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Performance Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Launch">Launch</SelectItem>
                <SelectItem value="Red">Red</SelectItem>
                <SelectItem value="Yellow">Yellow</SelectItem>
                <SelectItem value="Green">Green</SelectItem>
                <SelectItem value="Elite">Elite</SelectItem>
              </SelectContent>
            </Select>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Retention Risk" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risk Levels</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Watch">Watch</SelectItem>
                <SelectItem value="Elevated">Elevated</SelectItem>
                <SelectItem value="Critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Select value={coachFilter} onValueChange={setCoachFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Coach of Record" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Coaches</SelectItem>
                {(coaches ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(statusFilter !== "all" || riskFilter !== "all" || coachFilter !== "all" || search) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setStatusFilter("all"); setRiskFilter("all"); setCoachFilter("all"); setSearch(""); }}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Agent Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            Agents ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No agents found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Coach of Record</TableHead>
                  <TableHead>Performance</TableHead>
                  <TableHead>Retention Risk</TableHead>
                  <TableHead>Diagnosis</TableHead>
                  <TableHead>Next Session</TableHead>
                  <TableHead>Last Session</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row: any) => {
                  const profile = row.profile;
                  const agent = row.agent;
                  const coach = row.coach;
                  return (
                    <TableRow
                      key={agent.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/coaching/agent/${agent.id}`)}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{agent.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{agent.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{coach?.name ?? <span className="text-muted-foreground italic">Unassigned</span>}</span>
                      </TableCell>
                      <TableCell>
                        {profile?.performanceStatus ? (
                          <Badge className={`text-xs border ${PERF_STATUS_COLORS[profile.performanceStatus] ?? ""}`} variant="outline">
                            {profile.performanceStatus}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {profile?.retentionRiskStatus ? (
                          <Badge className={`text-xs ${RETENTION_RISK_COLORS[profile.retentionRiskStatus] ?? ""}`} variant="secondary">
                            {profile.retentionRiskStatus}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {profile?.currentPrimaryDiagnosis ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {profile?.nextSessionDate
                            ? safeFormat(profile.nextSessionDate, "MMM d, yyyy")
                            : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {profile?.updatedAt
                            ? safeFormat(profile.updatedAt, "MMM d")
                            : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
