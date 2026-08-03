import { useState } from "react";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Users,
  Search,
  ChevronRight,
  Loader2,
  RefreshCw,
  Filter,
  AlertTriangle,
  ArrowUpDown,
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

// Column visibility groups for managing the wide table
type ColumnGroup = "core" | "production" | "pipeline" | "coaching" | "all";

const COLUMN_GROUPS: { id: ColumnGroup; label: string }[] = [
  { id: "all", label: "All Columns" },
  { id: "core", label: "Core Info" },
  { id: "production", label: "Production" },
  { id: "pipeline", label: "Pipeline & Leads" },
  { id: "coaching", label: "Coaching Activity" },
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
  const [columnGroup, setColumnGroup] = useState<ColumnGroup>("all");

  const { data, isLoading } = trpc.coaching.listPortfolio.useQuery({
    performanceStatus: statusFilter !== "all" ? statusFilter : undefined,
    retentionRiskStatus: riskFilter !== "all" ? riskFilter : undefined,
    coachOfRecordId: coachFilter !== "all" ? Number(coachFilter) : undefined,
    diagnosis: diagnosisFilter !== "all" ? diagnosisFilter : undefined,
    search: search || undefined,
    limit: 200,
  });

  const { data: coaches } = trpc.coaching.listCoaches.useQuery();

  const rows = data?.rows ?? [];

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

  // Column visibility based on group
  const showCol = (group: ColumnGroup) => columnGroup === "all" || columnGroup === group;

  const fmtMoney = (val: number) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
    return `$${val.toLocaleString()}`;
  };

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

        <Select value={columnGroup} onValueChange={(v) => setColumnGroup(v as ColumnGroup)}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Columns" />
          </SelectTrigger>
          <SelectContent>
            {COLUMN_GROUPS.map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>
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
            <TooltipProvider>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      {/* Always visible: Agent Name */}
                      <TableHead className="text-[10px] sticky left-0 bg-muted/30 z-10 min-w-[150px] font-semibold">Agent</TableHead>
                      {/* Core columns */}
                      {showCol("core") && <TableHead className="text-[10px] min-w-[70px] font-semibold">Status</TableHead>}
                      {showCol("core") && <TableHead className="text-[10px] min-w-[100px] font-semibold">Coach</TableHead>}
                      {showCol("core") && <TableHead className="text-[10px] min-w-[80px] font-semibold">Diagnosis</TableHead>}
                      {showCol("core") && <TableHead className="text-[10px] min-w-[70px] font-semibold">Risk</TableHead>}
                      {showCol("core") && <TableHead className="text-[10px] min-w-[80px] font-semibold">Next Session</TableHead>}
                      {showCol("core") && <TableHead className="text-[10px] min-w-[80px] font-semibold">Last Session</TableHead>}
                      {showCol("core") && <TableHead className="text-[10px] min-w-[80px] font-semibold">Priority</TableHead>}
                      {showCol("core") && <TableHead className="text-[10px] min-w-[70px] font-semibold">Launch</TableHead>}
                      {showCol("core") && <TableHead className="text-[10px] min-w-[90px] font-semibold">Market</TableHead>}
                      {showCol("core") && <TableHead className="text-[10px] min-w-[80px] font-semibold">Group</TableHead>}
                      {/* Production columns */}
                      {showCol("production") && <TableHead className="text-[10px] min-w-[60px] font-semibold text-right">YTD Units</TableHead>}
                      {showCol("production") && <TableHead className="text-[10px] min-w-[75px] font-semibold text-right">YTD Vol</TableHead>}
                      {showCol("production") && <TableHead className="text-[10px] min-w-[70px] font-semibold text-right">YTD GCI</TableHead>}
                      {showCol("production") && <TableHead className="text-[10px] min-w-[60px] font-semibold text-right">T90 Units</TableHead>}
                      {showCol("production") && <TableHead className="text-[10px] min-w-[70px] font-semibold text-right">T90 GCI</TableHead>}
                      {showCol("production") && <TableHead className="text-[10px] min-w-[55px] font-semibold text-right">UC</TableHead>}
                      {showCol("production") && <TableHead className="text-[10px] min-w-[70px] font-semibold text-right">UC Vol</TableHead>}
                      {showCol("production") && <TableHead className="text-[10px] min-w-[55px] font-semibold text-right">Term%</TableHead>}
                      {/* Pipeline columns */}
                      {showCol("pipeline") && <TableHead className="text-[10px] min-w-[55px] font-semibold text-right">Leads</TableHead>}
                      {showCol("pipeline") && <TableHead className="text-[10px] min-w-[55px] font-semibold text-right">Active</TableHead>}
                      {showCol("pipeline") && <TableHead className="text-[10px] min-w-[50px] font-semibold text-right">Stale</TableHead>}
                      {showCol("pipeline") && <TableHead className="text-[10px] min-w-[60px] font-semibold text-right">Avg Age</TableHead>}
                      {showCol("pipeline") && <TableHead className="text-[10px] min-w-[60px] font-semibold text-right">Overdue</TableHead>}
                      {/* Coaching activity columns */}
                      {showCol("coaching") && <TableHead className="text-[10px] min-w-[50px] font-semibold text-center">Goals</TableHead>}
                      {showCol("coaching") && <TableHead className="text-[10px] min-w-[55px] font-semibold text-right">Goal%</TableHead>}
                      {showCol("coaching") && <TableHead className="text-[10px] min-w-[60px] font-semibold text-right">Commit%</TableHead>}
                      {showCol("coaching") && <TableHead className="text-[10px] min-w-[60px] font-semibold text-right">Sess(30d)</TableHead>}
                      {showCol("coaching") && <TableHead className="text-[10px] min-w-[55px] font-semibold text-center">Assess</TableHead>}
                      {showCol("coaching") && <TableHead className="text-[10px] min-w-[50px] font-semibold text-center">Reset</TableHead>}
                      {showCol("coaching") && <TableHead className="text-[10px] min-w-[50px] font-semibold text-center">Esc.</TableHead>}
                      {showCol("coaching") && <TableHead className="text-[10px] min-w-[60px] font-semibold text-right">Days Since</TableHead>}
                      <TableHead className="w-6"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row: any) => {
                      const { agent, profile, coach, market, group } = row;
                      const noSession = !profile?.nextSessionDate;
                      const noCoach = !coach?.id;
                      return (
                        <TableRow
                          key={agent.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/coaching/agent/${agent.id}`)}
                        >
                          {/* Agent Name - always visible */}
                          <TableCell className="sticky left-0 bg-background z-10">
                            <div className="flex items-center gap-1.5">
                              <div>
                                <p className="font-medium text-[11px] leading-tight truncate max-w-[130px]">{agent.name ?? "—"}</p>
                              </div>
                              {(noSession || noCoach) && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent className="text-[10px]">
                                    {noCoach && "No coach assigned. "}
                                    {noSession && "No session scheduled."}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          {/* Core */}
                          {showCol("core") && (
                            <TableCell>
                              {profile?.performanceStatus ? (
                                <Badge className={`text-[9px] px-1.5 py-0 border ${PERF_STATUS_COLORS[profile.performanceStatus] ?? ""}`} variant="outline">
                                  {profile.performanceStatus}
                                </Badge>
                              ) : <span className="text-[10px] text-muted-foreground">—</span>}
                            </TableCell>
                          )}
                          {showCol("core") && (
                            <TableCell className="text-[11px] truncate max-w-[100px]">
                              {coach?.name ?? <span className="text-red-600 italic text-[10px]">None</span>}
                            </TableCell>
                          )}
                          {showCol("core") && (
                            <TableCell className="text-[11px] text-muted-foreground">
                              {profile?.currentPrimaryDiagnosis ?? "—"}
                            </TableCell>
                          )}
                          {showCol("core") && (
                            <TableCell>
                              <span className={`text-[11px] ${RISK_COLORS[profile?.retentionRiskStatus] ?? "text-muted-foreground"}`}>
                                {profile?.retentionRiskStatus ?? "—"}
                              </span>
                            </TableCell>
                          )}
                          {showCol("core") && (
                            <TableCell className="text-[11px]">
                              {profile?.nextSessionDate ? safeFormat(profile.nextSessionDate, "MMM d") : <span className="text-red-600 text-[10px]">None</span>}
                            </TableCell>
                          )}
                          {showCol("core") && (
                            <TableCell className="text-[11px] text-muted-foreground">
                              {row.lastSessionDate ? safeFormat(row.lastSessionDate, "MMM d") : "—"}
                            </TableCell>
                          )}
                          {showCol("core") && (
                            <TableCell className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                              {profile?.currentDevelopmentPriority ?? "—"}
                            </TableCell>
                          )}
                          {showCol("core") && (
                            <TableCell>
                              {profile?.performanceStatus === "Launch" && profile?.launchHealthStatus ? (
                                <Badge variant={profile.launchHealthStatus === "On Track" ? "secondary" : "destructive"} className="text-[9px] px-1">
                                  {profile.launchHealthStatus}
                                </Badge>
                              ) : <span className="text-[10px] text-muted-foreground">—</span>}
                            </TableCell>
                          )}
                          {showCol("core") && (
                            <TableCell className="text-[10px] text-muted-foreground truncate max-w-[90px]">
                              {market ?? "—"}
                            </TableCell>
                          )}
                          {showCol("core") && (
                            <TableCell className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                              {group ?? "—"}
                            </TableCell>
                          )}
                          {/* Production */}
                          {showCol("production") && <TableCell className="text-[11px] text-right font-medium">{row.ytdUnits}</TableCell>}
                          {showCol("production") && <TableCell className="text-[11px] text-right">{fmtMoney(row.ytdVolume)}</TableCell>}
                          {showCol("production") && <TableCell className="text-[11px] text-right">{fmtMoney(row.ytdGCI)}</TableCell>}
                          {showCol("production") && <TableCell className="text-[11px] text-right font-medium">{row.t90Units}</TableCell>}
                          {showCol("production") && <TableCell className="text-[11px] text-right">{fmtMoney(row.t90GCI)}</TableCell>}
                          {showCol("production") && <TableCell className="text-[11px] text-right">{row.ucUnits}</TableCell>}
                          {showCol("production") && <TableCell className="text-[11px] text-right">{fmtMoney(row.ucVolume)}</TableCell>}
                          {showCol("production") && (
                            <TableCell className={`text-[11px] text-right ${row.termRate > 20 ? "text-red-600 font-medium" : ""}`}>
                              {row.termRate ?? 0}%
                            </TableCell>
                          )}
                          {/* Pipeline */}
                          {showCol("pipeline") && <TableCell className="text-[11px] text-right">{row.totalLeads}</TableCell>}
                          {showCol("pipeline") && <TableCell className="text-[11px] text-right">{row.activeLeads}</TableCell>}
                          {showCol("pipeline") && (
                            <TableCell className={`text-[11px] text-right ${row.staleLeads > 10 ? "text-amber-600 font-medium" : ""}`}>
                              {row.staleLeads}
                            </TableCell>
                          )}
                          {showCol("pipeline") && (
                            <TableCell className={`text-[11px] text-right ${row.avgLeadAge > 60 ? "text-red-600" : ""}`}>
                              {row.avgLeadAge}d
                            </TableCell>
                          )}
                          {showCol("pipeline") && (
                            <TableCell className={`text-[11px] text-right ${row.overdueTasks > 5 ? "text-red-600 font-medium" : ""}`}>
                              {row.overdueTasks}
                            </TableCell>
                          )}
                          {/* Coaching */}
                          {showCol("coaching") && (
                            <TableCell className="text-[11px] text-center">
                              {row.goalsSet ? <span className="text-emerald-600">Yes</span> : <span className="text-red-600">No</span>}
                            </TableCell>
                          )}
                          {showCol("coaching") && (
                            <TableCell className={`text-[11px] text-right ${row.goalAttainment !== null && row.goalAttainment < 50 ? "text-red-600" : row.goalAttainment !== null && row.goalAttainment >= 80 ? "text-emerald-600" : ""}`}>
                              {row.goalAttainment !== null ? `${row.goalAttainment}%` : "—"}
                            </TableCell>
                          )}
                          {showCol("coaching") && (
                            <TableCell className={`text-[11px] text-right ${row.commitRate !== null && row.commitRate < 50 ? "text-red-600" : ""}`}>
                              {row.commitRate !== null ? `${row.commitRate}%` : "—"}
                            </TableCell>
                          )}
                          {showCol("coaching") && <TableCell className="text-[11px] text-right">{row.sessions30d}</TableCell>}
                          {showCol("coaching") && <TableCell className="text-[11px] text-center">{row.assessmentsUploaded}</TableCell>}
                          {showCol("coaching") && (
                            <TableCell className="text-center">
                              {row.resetActive ? <Badge variant="destructive" className="text-[8px] px-1 py-0">Yes</Badge> : <span className="text-[10px] text-muted-foreground">—</span>}
                            </TableCell>
                          )}
                          {showCol("coaching") && (
                            <TableCell className="text-center">
                              {row.escalationActive ? <Badge variant="destructive" className="text-[8px] px-1 py-0">Yes</Badge> : <span className="text-[10px] text-muted-foreground">—</span>}
                            </TableCell>
                          )}
                          {showCol("coaching") && (
                            <TableCell className={`text-[11px] text-right ${row.daysSinceLastSession !== null && row.daysSinceLastSession > 14 ? "text-amber-600 font-medium" : ""}`}>
                              {row.daysSinceLastSession !== null ? `${row.daysSinceLastSession}d` : "—"}
                            </TableCell>
                          )}
                          <TableCell>
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
