import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Target, Users, MapPin, TrendingUp, Edit2, Loader2, DollarSign,
  Home, BarChart3, CheckCircle2, ArrowUpDown, ChevronRight,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, type: "currency" | "number" = "currency") {
  if (n == null) return "—";
  if (type === "currency") {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
    return `$${n.toLocaleString()}`;
  }
  return n.toLocaleString();
}

function GoalProgress({ actual, target, label }: { actual: number; target: number | null; label: string }) {
  if (!target) return <span className="text-xs text-muted-foreground">No goal set</span>;
  const pct = Math.min(100, Math.round((actual / target) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={pct >= 100 ? "text-green-600 font-medium" : "text-foreground"}>{pct}%</span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i);
const MONTHS = [
  { value: "0", label: "Annual" },
  { value: "1", label: "January" }, { value: "2", label: "February" },
  { value: "3", label: "March" }, { value: "4", label: "April" },
  { value: "5", label: "May" }, { value: "6", label: "June" },
  { value: "7", label: "July" }, { value: "8", label: "August" },
  { value: "9", label: "September" }, { value: "10", label: "October" },
  { value: "11", label: "November" }, { value: "12", label: "December" },
];

// ─── Sparkline Bar Chart ─────────────────────────────────────────────────────
function SparklineChart({ data, goal }: { data: { month: number; gci: number }[]; goal: number | null }) {
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const monthlyPace = goal ? goal / 12 : null;
  const maxGci = Math.max(...data.map(d => Number(d.gci)), monthlyPace ?? 0, 1);
  const monthMap = new Map(data.map(d => [d.month, Number(d.gci)]));
  const currentMonth = new Date().getMonth() + 1;
  // Pace line position as % from bottom (relative to maxGci)
  const paceLinePct = monthlyPace ? Math.round((monthlyPace / maxGci) * 100) : null;
  return (
    <div className="relative flex items-end gap-px h-10 mt-2" title="Monthly GCI">
      {/* Dashed pace line */}
      {paceLinePct !== null && (
        <div
          className="absolute left-0 right-0 border-t border-dashed border-amber-400/70 pointer-events-none z-10"
          style={{ bottom: `${paceLinePct}%` }}
          title={`Monthly pace target: $${Math.round(monthlyPace!).toLocaleString()}`}
        />
      )}
      {months.map(m => {
        const gci = monthMap.get(m) ?? 0;
        const heightPct = Math.round((gci / maxGci) * 100);
        const isFuture = m > currentMonth;
        const isCurrentMonth = m === currentMonth;
        return (
          <div
            key={m}
            className="flex-1 group relative"
            title={`${new Date(2000, m - 1).toLocaleString('default', { month: 'short' })}: $${gci.toLocaleString()}`}
          >
            <div
              className={`w-full rounded-sm ${
                isFuture ? 'bg-muted/50' :
                isCurrentMonth && gci > 0 ? 'bg-primary/70' :
                gci === 0 ? 'bg-muted' :
                'bg-primary'
              }`}
              style={{ height: `${Math.max(isFuture ? 0 : gci > 0 ? heightPct : 0, gci > 0 ? 8 : 0)}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Agent Drill-Down Dialog ─────────────────────────────────────────────────

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function AgentDrillDownDialog({
  agent,
  year,
  monthlyData,
  onClose,
}: {
  agent: any;
  year: number;
  monthlyData: { month: number; gci: number }[];
  onClose: () => void;
}) {
  const monthlyPace = agent.gciTarget ? Number(agent.gciTarget) / 12 : null;
  const monthMap = new Map(monthlyData.map(d => [d.month, d.gci]));
  const rows = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: MONTH_NAMES[i],
    gci: monthMap.get(i + 1) ?? 0,
  }));
  const totalGci = rows.reduce((s, r) => s + r.gci, 0);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            {agent.agentName} — {year} Monthly Breakdown
          </DialogTitle>
          {agent.gciTarget && (
            <p className="text-sm text-muted-foreground">
              Annual goal: {fmt(Number(agent.gciTarget))} &bull; Monthly pace: {fmt(monthlyPace)}
            </p>
          )}
        </DialogHeader>
        <ScrollArea className="max-h-[400px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 font-medium text-muted-foreground">Month</th>
                <th className="text-right py-2 font-medium text-muted-foreground">GCI</th>
                {monthlyPace && <th className="text-right py-2 font-medium text-muted-foreground">vs Pace</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const diff = monthlyPace != null ? r.gci - monthlyPace : null;
                const isPast = r.month <= new Date().getMonth() + 1;
                return (
                  <tr key={r.month} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 text-muted-foreground">{r.label}</td>
                    <td className={`py-2 text-right font-medium ${!isPast ? 'text-muted-foreground' : ''}`}>
                      {r.gci > 0 ? fmt(r.gci) : isPast ? <span className="text-muted-foreground text-xs">$0</span> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    {diff != null && (
                      <td className={`py-2 text-right text-xs ${
                        !isPast ? 'text-muted-foreground' :
                        diff >= 0 ? 'text-green-600 font-medium' : 'text-red-500'
                      }`}>
                        {!isPast ? '—' : diff >= 0 ? `+${fmt(diff)}` : fmt(diff)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t">
                <td className="py-2 font-semibold">YTD Total</td>
                <td className="py-2 text-right font-semibold">{fmt(totalGci)}</td>
                {monthlyPace && (
                  <td className={`py-2 text-right text-xs font-semibold ${
                    totalGci >= Number(agent.gciTarget) * (new Date().getMonth() + 1) / 12 ? 'text-green-600' : 'text-red-500'
                  }`}>
                    {totalGci >= Number(agent.gciTarget) * (new Date().getMonth() + 1) / 12 ? 'On pace' : 'Behind pace'}
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Agent Goals Tab ──────────────────────────────────────────────────────────

interface AgentGoalDialogProps {
  agent: { agentId: number; agentName: string; gciTarget?: number | null; closingsTarget?: number | null; volumeTarget?: number | null } | null;
  year: number;
  month: number;
  onClose: () => void;
}

function AgentGoalDialog({ agent, year, month, onClose }: AgentGoalDialogProps) {
  const utils = trpc.useUtils();
  const [gci, setGci] = useState(agent?.gciTarget != null ? String(agent.gciTarget) : "");
  const [closings, setClosings] = useState(agent?.closingsTarget != null ? String(agent.closingsTarget) : "");
  const [volume, setVolume] = useState(agent?.volumeTarget != null ? String(agent.volumeTarget) : "");

  const setGoal = trpc.analytics.setGoal.useMutation({
    onSuccess: () => {
      toast.success("Goals saved");
      utils.analytics.agentProductionWithGoals.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!agent) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Goals — {agent.agentName}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {MONTHS.find(m => m.value === String(month))?.label} {year}
          </p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>GCI Target</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="e.g. 50000" value={gci} onChange={e => setGci(e.target.value)} type="number" min={0} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Closings Target</Label>
            <div className="relative">
              <Home className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="e.g. 6" value={closings} onChange={e => setClosings(e.target.value)} type="number" min={0} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Volume Target</Label>
            <div className="relative">
              <BarChart3 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="e.g. 2000000" value={volume} onChange={e => setVolume(e.target.value)} type="number" min={0} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => setGoal.mutate({
              agentId: agent.agentId,
              year,
              month,
              gciTarget: gci ? Number(gci) : null,
              closingsTarget: closings ? Number(closings) : null,
              volumeTarget: volume ? Number(volume) : null,
            })}
            disabled={setGoal.isPending}
          >
            {setGoal.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save Goals
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AgentGoalsTab() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(0);
  const [editAgent, setEditAgent] = useState<any | null>(null);
  const [drillDownAgent, setDrillDownAgent] = useState<any | null>(null);

  const [sortBy, setSortBy] = useState<"name" | "gci_pct_asc" | "gci_pct_desc" | "no_goal">("gci_pct_asc");
  const utils = trpc.useUtils();

  const { data: rawAgents = [], isLoading } = trpc.analytics.agentProductionWithGoals.useQuery({ year, month });
  // Monthly GCI data for sparklines — only fetch when in Annual view
  const { data: monthlyGciData = [] } = trpc.analytics.agentMonthlyGci.useQuery(
    { year },
    { enabled: month === 0 }
  );
  // Build a map: agentId -> array of { month, gci }
  const monthlyByAgent = useMemo(() => {
    const map = new Map<number, { month: number; gci: number }[]>();
    for (const row of monthlyGciData as { agentId: number | null; month: number; gci: number }[]) {
      if (row.agentId == null) continue;
      if (!map.has(row.agentId)) map.set(row.agentId, []);
      map.get(row.agentId)!.push({ month: row.month, gci: Number(row.gci) });
    }
    return map;
  }, [monthlyGciData]);

  const agents = [...rawAgents].sort((a: any, b: any) => {
    if (sortBy === "name") return (a.agentName ?? "").localeCompare(b.agentName ?? "");
    if (sortBy === "no_goal") {
      const aHas = a.gciTarget || a.closingsTarget ? 1 : 0;
      const bHas = b.gciTarget || b.closingsTarget ? 1 : 0;
      return aHas - bHas;
    }
    // gci_pct_asc / gci_pct_desc: agents with no goal go to the end
    const aPct = a.gciTarget ? (Number(a.gci) / Number(a.gciTarget)) * 100 : (sortBy === "gci_pct_asc" ? 999 : -1);
    const bPct = b.gciTarget ? (Number(b.gci) / Number(b.gciTarget)) * 100 : (sortBy === "gci_pct_asc" ? 999 : -1);
    return sortBy === "gci_pct_asc" ? aPct - bPct : bPct - aPct;
  });

  const _setBulk = trpc.analytics.setBulkGoals.useMutation({
    onSuccess: () => {
      toast.success(`Goals set for all ${agents.length} agents`);
      utils.analytics.agentProductionWithGoals.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const agentsWithGoals = agents.filter((a: any) => a.gciTarget || a.closingsTarget).length;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-48">
            <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gci_pct_asc">% to Goal — Lowest First</SelectItem>
            <SelectItem value="gci_pct_desc">% to Goal — Highest First</SelectItem>
            <SelectItem value="no_goal">No Goal Set First</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          {agentsWithGoals} of {agents.length} agents have goals set
        </div>
      </div>

      {/* Agent Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Agent</th>
                    <th className="text-right py-3 px-3 font-medium text-muted-foreground">YTD GCI</th>
                    <th className="text-right py-3 px-3 font-medium text-muted-foreground">GCI Goal</th>
                    <th className="text-right py-3 px-3 font-medium text-muted-foreground">GCI %</th>
                    <th className="text-right py-3 px-3 font-medium text-muted-foreground">Closings</th>
                    <th className="text-right py-3 px-3 font-medium text-muted-foreground">Closings Goal</th>
                    <th className="text-right py-3 px-3 font-medium text-muted-foreground">Closings %</th>
                    <th className="py-3 px-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent: any) => {
                    const gciPct = agent.gciTarget ? Math.round((Number(agent.gci) / Number(agent.gciTarget)) * 100) : null;
                    const closingsPct = agent.closingsTarget ? Math.round((agent.closings / agent.closingsTarget) * 100) : null;
                    return (
                      <tr
                        key={agent.agentId}
                        className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                        onClick={() => setDrillDownAgent(agent)}
                      >
                        <td className="py-3 px-4 font-medium">{agent.agentName}</td>
                        <td className="text-right py-3 px-3">{fmt(agent.gci)}</td>
                        <td className="text-right py-3 px-3 text-muted-foreground">{agent.gciTarget ? fmt(agent.gciTarget) : <span className="text-xs text-muted-foreground/60">—</span>}</td>
                        <td className="text-right py-3 px-3">
                          {gciPct != null ? (
                            <span className={`font-semibold text-xs ${gciPct >= 100 ? "text-green-600" : gciPct >= 75 ? "text-primary" : "text-amber-600"}`}>{gciPct}%</span>
                          ) : <span className="text-xs text-muted-foreground/60">—</span>}
                        </td>
                        <td className="text-right py-3 px-3">{agent.closings}</td>
                        <td className="text-right py-3 px-3 text-muted-foreground">{agent.closingsTarget ?? <span className="text-xs text-muted-foreground/60">—</span>}</td>
                        <td className="text-right py-3 px-3">
                          {closingsPct != null ? (
                            <span className={`font-semibold text-xs ${closingsPct >= 100 ? "text-green-600" : closingsPct >= 75 ? "text-primary" : "text-amber-600"}`}>{closingsPct}%</span>
                          ) : <span className="text-xs text-muted-foreground/60">—</span>}
                        </td>
                        <td className="py-3 px-3">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); setEditAgent(agent); }}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {editAgent && (
        <AgentGoalDialog agent={editAgent} year={year} month={month} onClose={() => setEditAgent(null)} />
      )}
      {drillDownAgent && (
        <AgentDrillDownDialog
          agent={drillDownAgent}
          year={year}
          monthlyData={monthlyByAgent.get(drillDownAgent.agentId) ?? []}
          onClose={() => setDrillDownAgent(null)}
        />
      )}
    </div>
  );
}

// ─── Market Goals Tab ─────────────────────────────────────────────────────────

function MarketGoalsTab() {
  const utils = trpc.useUtils();
  const { data: rawMarkets = [], isLoading } = trpc.analytics.marketPerformance.useQuery();
  const [editMarket, setEditMarket] = useState<{ id: number; name: string; goal: number | null } | null>(null);
  const [goalInput, setGoalInput] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "gci_pct_asc" | "gci_pct_desc" | "no_goal" | "gci_desc">("gci_pct_asc");

  const setMarketGoal = trpc.analytics.setMarketGoal.useMutation({
    onSuccess: () => {
      toast.success("Market goal saved");
      utils.analytics.marketPerformance.invalidate();
      setEditMarket(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const markets = [...rawMarkets].sort((a: any, b: any) => {
    if (sortBy === "name") return (a.marketName ?? "").localeCompare(b.marketName ?? "");
    if (sortBy === "no_goal") {
      const aHas = a.annualGciGoal ? 1 : 0;
      const bHas = b.annualGciGoal ? 1 : 0;
      return aHas - bHas;
    }
    if (sortBy === "gci_desc") return Number(b.totalGci || 0) - Number(a.totalGci || 0);
    // gci_pct_asc / gci_pct_desc: markets with no goal go to the end
    const aPct = a.annualGciGoal ? (Number(a.totalGci) / Number(a.annualGciGoal)) * 100 : (sortBy === "gci_pct_asc" ? 999 : -1);
    const bPct = b.annualGciGoal ? (Number(b.totalGci) / Number(b.annualGciGoal)) * 100 : (sortBy === "gci_pct_asc" ? 999 : -1);
    return sortBy === "gci_pct_asc" ? aPct - bPct : bPct - aPct;
  });

  const marketsWithGoals = markets.filter((m: any) => m.annualGciGoal).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-52">
            <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gci_pct_asc">% to Goal — Lowest First</SelectItem>
            <SelectItem value="gci_pct_desc">% to Goal — Highest First</SelectItem>
            <SelectItem value="no_goal">No Goal Set First</SelectItem>
            <SelectItem value="gci_desc">YTD GCI — Highest First</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          {marketsWithGoals} of {markets.length} markets have annual GCI goals set
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Market</th>
                    <th className="text-right py-3 px-3 font-medium text-muted-foreground">Agents</th>
                    <th className="text-right py-3 px-3 font-medium text-muted-foreground">Closings</th>
                    <th className="text-right py-3 px-3 font-medium text-muted-foreground">YTD GCI</th>
                    <th className="text-right py-3 px-3 font-medium text-muted-foreground">Annual Goal</th>
                    <th className="text-right py-3 px-3 font-medium text-muted-foreground">% to Goal</th>
                    <th className="py-3 px-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {markets.map((market: any) => {
                    const pct = market.annualGciGoal ? Math.min(100, Math.round((Number(market.totalGci) / Number(market.annualGciGoal)) * 100)) : null;
                    return (
                      <tr key={market.marketId} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-3 px-4 font-medium">{market.marketName}</td>
                        <td className="text-right py-3 px-3 text-muted-foreground">{market.agentCount}</td>
                        <td className="text-right py-3 px-3 text-muted-foreground">{market.closedDeals}</td>
                        <td className="text-right py-3 px-3 font-semibold">{fmt(Number(market.totalGci))}</td>
                        <td className="text-right py-3 px-3 text-muted-foreground">
                          {market.annualGciGoal ? fmt(Number(market.annualGciGoal)) : (
                            <button
                              className="text-xs text-primary hover:underline"
                              onClick={() => { setEditMarket({ id: market.marketId, name: market.marketName, goal: null }); setGoalInput(""); }}
                            >Set goal</button>
                          )}
                        </td>
                        <td className="text-right py-3 px-3">
                          {pct != null ? (
                            <span className={`font-semibold text-xs ${pct >= 100 ? "text-green-600" : pct >= 75 ? "text-primary" : "text-amber-600"}`}>{pct}%</span>
                          ) : <span className="text-xs text-muted-foreground/60">—</span>}
                        </td>
                        <td className="py-3 px-3">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => { setEditMarket({ id: market.marketId, name: market.marketName, goal: market.annualGciGoal }); setGoalInput(market.annualGciGoal ? String(market.annualGciGoal) : ""); }}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Market Goal Dialog */}
      {editMarket && (
        <Dialog open onOpenChange={() => setEditMarket(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Set Annual GCI Goal — {editMarket.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>Annual GCI Goal</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="e.g. 500000"
                    value={goalInput}
                    onChange={e => setGoalInput(e.target.value)}
                    type="number"
                    min={0}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditMarket(null)}>Cancel</Button>
              <Button
                onClick={() => setMarketGoal.mutate({
                  marketId: editMarket.id,
                  annualGciGoal: goalInput ? Number(goalInput) : null,
                })}
                disabled={setMarketGoal.isPending}
              >
                {setMarketGoal.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save Goal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const { data: agents = [] } = trpc.analytics.agentProductionWithGoals.useQuery({ year: CURRENT_YEAR, month: 0 });
  const { data: markets = [] } = trpc.analytics.marketPerformance.useQuery();

  const agentsWithGoals = agents.filter((a: any) => a.gciTarget || a.closingsTarget).length;
  const marketsWithGoals = markets.filter((m: any) => m.annualGciGoal).length;

  const totalAgentGciGoal = agents.reduce((sum: number, a: any) => sum + (a.gciTarget ? Number(a.gciTarget) : 0), 0);
  const totalAgentGciActual = agents.reduce((sum: number, a: any) => sum + Number(a.gci || 0), 0);
  const totalMarketGciGoal = markets.reduce((sum: number, m: any) => sum + (m.annualGciGoal ? Number(m.annualGciGoal) : 0), 0);
  const totalMarketGciActual = markets.reduce((sum: number, m: any) => sum + Number(m.totalGci || 0), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Target className="h-6 w-6 text-primary" />
          Goals
        </h1>
        <p className="text-muted-foreground mt-1">Manage annual and monthly production goals for agents and markets.</p>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Agent Goals</span>
            </div>
            <p className="text-2xl font-bold">{agentsWithGoals}<span className="text-sm font-normal text-muted-foreground"> / {agents.length}</span></p>
            <p className="text-xs text-muted-foreground mt-0.5">agents with goals set</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Agent GCI Progress</span>
            </div>
            <p className="text-2xl font-bold">{fmt(totalAgentGciActual)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">of {fmt(totalAgentGciGoal)} goal</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Market Goals</span>
            </div>
            <p className="text-2xl font-bold">{marketsWithGoals}<span className="text-sm font-normal text-muted-foreground"> / {markets.length}</span></p>
            <p className="text-xs text-muted-foreground mt-0.5">markets with goals set</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Market GCI Progress</span>
            </div>
            <p className="text-2xl font-bold">{fmt(totalMarketGciActual)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">of {fmt(totalMarketGciGoal)} goal</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="agents">
        <TabsList>
          <TabsTrigger value="agents" className="gap-1.5">
            <Users className="h-4 w-4" /> Agent Goals
          </TabsTrigger>
          <TabsTrigger value="markets" className="gap-1.5">
            <MapPin className="h-4 w-4" /> Market Goals
          </TabsTrigger>
        </TabsList>
        <TabsContent value="agents" className="mt-6">
          <AgentGoalsTab />
        </TabsContent>
        <TabsContent value="markets" className="mt-6">
          <MarketGoalsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
