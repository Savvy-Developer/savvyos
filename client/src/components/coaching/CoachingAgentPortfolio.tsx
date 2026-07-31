import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  Search,
  ChevronRight,
  Loader2,
  RefreshCw,
  Filter,
  Download,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";

const PERF_STATUS_COLORS: Record<string, string> = {
  Launch: "bg-blue-100 text-blue-800 border-blue-200",
  Red: "bg-red-100 text-red-800 border-red-200",
  Yellow: "bg-amber-100 text-amber-800 border-amber-200",
  Green: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Elite: "bg-violet-100 text-violet-800 border-violet-200",
};

const RISK_COLORS: Record<string, string> = {
  Low: "text-emerald-700",
  Watch: "text-amber-700",
  Elevated: "text-orange-700",
  Critical: "text-red-700 font-semibold",
};

type SavedView = {
  id: string;
  label: string;
  filters: Record<string, string>;
};

const SAVED_VIEWS: SavedView[] = [
  { id: "all", label: "All Agents", filters: {} },
  { id: "red", label: "All Red Agents", filters: { performanceStatus: "Red" } },
  { id: "yellow-below", label: "Yellow Below Pace", filters: { performanceStatus: "Yellow" } },
  { id: "launch", label: "Launch Agents", filters: { performanceStatus: "Launch" } },
  { id: "elite", label: "Elite Agents", filters: { performanceStatus: "Elite" } },
  { id: "no-coach", label: "No Coach Assigned", filters: { noCoach: "true" } },
  { id: "setup-required", label: "New Agent Setup Required", filters: { setupRequired: "true" } },
  { id: "resets", label: "Active Performance Resets", filters: { hasActiveReset: "true" } },
  { id: "retention-risk", label: "Green/Elite Retention Risks", filters: { retentionRisk: "true" } },
];

export default function CoachingAgentPortfolio() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [coachFilter, setCoachFilter] = useState<string>("all");
  const [diagnosisFilter, setDiagnosisFilter] = useState<string>("all");
  const [savedView, setSavedView] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const { data: agents, isLoading } = trpc.coaching.listProfiles.useQuery({
    performanceStatus: statusFilter !== "all" ? statusFilter : undefined,
    retentionRiskStatus: riskFilter !== "all" ? riskFilter : undefined,
    coachOfRecordId: coachFilter !== "all" ? Number(coachFilter) : undefined,
    diagnosis: diagnosisFilter !== "all" ? diagnosisFilter : undefined,
    search: search || undefined,
    limit: 200,
  });

  const { data: coaches } = trpc.coaching.listCoaches.useQuery();

  const rows = agents?.rows ?? [];

  const handleSavedView = (viewId: string) => {
    setSavedView(viewId);
    const view = SAVED_VIEWS.find((v) => v.id === viewId);
    if (!view) return;
    setStatusFilter(view.filters.performanceStatus ?? "all");
    setRiskFilter("all");
    setCoachFilter("all");
    setDiagnosisFilter("all");
    setSearch("");
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setRiskFilter("all");
    setCoachFilter("all");
    setDiagnosisFilter("all");
    setSearch("");
    setSavedView("all");
  };

  const hasFilters = statusFilter !== "all" || riskFilter !== "all" || coachFilter !== "all" || diagnosisFilter !== "all" || search;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Select value={savedView} onValueChange={handleSavedView}>
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder="Saved Views" />
          </SelectTrigger>
          <SelectContent>
            {SAVED_VIEWS.map((view) => (
              <SelectItem key={view.id} value={view.id}>{view.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="h-9">
          <Filter className="h-3.5 w-3.5 mr-1.5" />
          Filters
          {hasFilters && <Badge variant="destructive" className="ml-1.5 h-4 min-w-4 text-[9px] px-1">{[statusFilter !== "all", riskFilter !== "all", coachFilter !== "all", diagnosisFilter !== "all", !!search].filter(Boolean).length}</Badge>}
        </Button>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
            <RefreshCw className="h-3.5 w-3.5 mr-1" />Clear
          </Button>
        )}

        <div className="ml-auto text-xs text-muted-foreground">
          {rows.length} agent{rows.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Status" />
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
                <SelectTrigger className="w-[150px] h-8 text-xs">
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
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="Coach of Record" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Coaches</SelectItem>
                  {(coaches ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={diagnosisFilter} onValueChange={setDiagnosisFilter}>
                <SelectTrigger className="w-[150px] h-8 text-xs">
                  <SelectValue placeholder="Diagnosis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Diagnoses</SelectItem>
                  <SelectItem value="Commitment">Commitment</SelectItem>
                  <SelectItem value="Capability">Capability</SelectItem>
                  <SelectItem value="Cadence">Cadence</SelectItem>
                  <SelectItem value="Capacity">Capacity</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No agents match the current filters</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] sticky left-0 bg-background z-10 min-w-[160px]">Agent</TableHead>
                    <TableHead className="text-[11px] min-w-[100px]">Status</TableHead>
                    <TableHead className="text-[11px] min-w-[120px]">Coach of Record</TableHead>
                    <TableHead className="text-[11px] min-w-[100px]">Diagnosis</TableHead>
                    <TableHead className="text-[11px] min-w-[90px]">Retention</TableHead>
                    <TableHead className="text-[11px] min-w-[100px]">Next Session</TableHead>
                    <TableHead className="text-[11px] min-w-[100px]">Last Session</TableHead>
                    <TableHead className="text-[11px] min-w-[80px]">Priority</TableHead>
                    <TableHead className="text-[11px] min-w-[80px]">Launch</TableHead>
                    <TableHead className="text-[11px] min-w-[90px]">Market</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row: any) => {
                    const profile = row.profile;
                    const agent = row.agent;
                    const coach = row.coach;
                    const noSession = !profile?.nextSessionDate;
                    const noCoach = !coach?.id;
                    return (
                      <TableRow
                        key={agent.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/coaching/agent/${agent.id}`)}
                      >
                        <TableCell className="sticky left-0 bg-background z-10">
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-medium text-xs leading-tight">{agent.name ?? "—"}</p>
                              <p className="text-[10px] text-muted-foreground">{agent.email}</p>
                            </div>
                            {(noSession || noCoach) && (
                              <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {profile?.performanceStatus ? (
                            <Badge className={`text-[10px] border ${PERF_STATUS_COLORS[profile.performanceStatus] ?? ""}`} variant="outline">
                              {profile.performanceStatus}
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {coach?.name ?? <span className="text-red-600 italic text-[10px]">Unassigned</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {profile?.currentPrimaryDiagnosis ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs ${RISK_COLORS[profile?.retentionRiskStatus] ?? "text-muted-foreground"}`}>
                            {profile?.retentionRiskStatus ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          {profile?.nextSessionDate ? (
                            <span>{safeFormat(profile.nextSessionDate, "MMM d")}</span>
                          ) : (
                            <span className="text-red-600 font-medium text-[10px]">Not scheduled</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {profile?.updatedAt ? safeFormat(profile.updatedAt, "MMM d") : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {profile?.currentDevelopmentPriority ?? "—"}
                        </TableCell>
                        <TableCell>
                          {profile?.performanceStatus === "Launch" && profile?.launchHealthStatus ? (
                            <Badge variant={profile.launchHealthStatus === "On Track" ? "secondary" : "destructive"} className="text-[10px]">
                              {profile.launchHealthStatus}
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {profile?.marketProtectionStatus ?? "—"}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
