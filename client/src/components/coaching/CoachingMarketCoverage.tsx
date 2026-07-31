import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, MapPin, ChevronRight, AlertTriangle, Users, Download, Filter } from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";

const MARKET_STATUS_COLORS: Record<string, string> = {
  Protected: "bg-emerald-100 text-emerald-800",
  Conditional: "bg-amber-100 text-amber-800",
  "Open for Additional Coverage": "bg-blue-100 text-blue-800",
  "Recruiting Active": "bg-purple-100 text-purple-800",
  "Exit Pending": "bg-red-100 text-red-800",
  Unassigned: "bg-slate-100 text-slate-700",
  "Leadership Review": "bg-orange-100 text-orange-800",
};

const PERF_STATUS_COLORS: Record<string, string> = {
  Elite: "bg-purple-100 text-purple-700",
  Green: "bg-emerald-100 text-emerald-700",
  Yellow: "bg-amber-100 text-amber-700",
  Red: "bg-red-100 text-red-700",
  Launch: "bg-blue-100 text-blue-700",
};

export default function CoachingMarketCoverage() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null);

  const { data, isLoading } = trpc.coaching.getMarketCoverage.useQuery();
  const { data: marketAgents, isLoading: loadingAgents } = trpc.coaching.getMarketAgents.useQuery(
    { marketProfileId: selectedMarketId! },
    { enabled: !!selectedMarketId }
  );

  const markets = (data as any)?.markets ?? (Array.isArray(data) ? data : []);
  const filteredMarkets = statusFilter === "all" ? markets : markets.filter((m: any) => m.market?.marketStatus === statusFilter);

  // KPI calculations
  const totalMarkets = markets.length;
  const protectedCount = markets.filter((m: any) => m.market?.marketStatus === "Protected").length;
  const atRiskCount = markets.filter((m: any) => ["Conditional", "Exit Pending", "Leadership Review"].includes(m.market?.marketStatus)).length;
  const unassignedCount = markets.filter((m: any) => m.market?.marketStatus === "Unassigned" || m.agentCount === 0).length;
  const recruitingCount = markets.filter((m: any) => ["Open for Additional Coverage", "Recruiting Active"].includes(m.market?.marketStatus)).length;

  const agents = (marketAgents as any)?.agents ?? (Array.isArray(marketAgents) ? marketAgents : []);

  function exportCSV() {
    const headers = ["Market", "Status", "Agents", "State", "City"];
    const csvRows = filteredMarkets.map((m: any) => [
      m.market?.name ?? "",
      m.market?.marketStatus ?? "",
      m.agentCount ?? 0,
      m.market?.state ?? "",
      m.market?.city ?? "",
    ]);
    const csv = [headers, ...csvRows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "market_coverage.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="cursor-pointer hover:border-primary/30" onClick={() => setStatusFilter("all")}>
          <CardContent className="p-3 text-center"><p className="text-xl font-bold">{totalMarkets}</p><p className="text-[10px] text-muted-foreground">Total Markets</p></CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/30" onClick={() => setStatusFilter("Protected")}>
          <CardContent className="p-3 text-center"><p className="text-xl font-bold text-emerald-700">{protectedCount}</p><p className="text-[10px] text-muted-foreground">Protected</p></CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/30" onClick={() => setStatusFilter("Conditional")}>
          <CardContent className="p-3 text-center"><p className={`text-xl font-bold ${atRiskCount > 0 ? "text-amber-600" : ""}`}>{atRiskCount}</p><p className="text-[10px] text-muted-foreground">At Risk</p></CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/30" onClick={() => setStatusFilter("Unassigned")}>
          <CardContent className="p-3 text-center"><p className={`text-xl font-bold ${unassignedCount > 0 ? "text-red-600" : ""}`}>{unassignedCount}</p><p className="text-[10px] text-muted-foreground">Unassigned</p></CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/30" onClick={() => setStatusFilter("Recruiting Active")}>
          <CardContent className="p-3 text-center"><p className="text-xl font-bold text-purple-700">{recruitingCount}</p><p className="text-[10px] text-muted-foreground">Recruiting</p></CardContent>
        </Card>
      </div>

      {/* Filters & Export */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-56 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Markets</SelectItem>
              <SelectItem value="Protected">Protected</SelectItem>
              <SelectItem value="Conditional">Conditional</SelectItem>
              <SelectItem value="Open for Additional Coverage">Open for Additional Coverage</SelectItem>
              <SelectItem value="Recruiting Active">Recruiting Active</SelectItem>
              <SelectItem value="Exit Pending">Exit Pending</SelectItem>
              <SelectItem value="Unassigned">Unassigned</SelectItem>
              <SelectItem value="Leadership Review">Leadership Review</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={exportCSV}><Download className="h-3.5 w-3.5 mr-1" />Export</Button>
      </div>

      {/* Market Table */}
      <Card>
        <CardContent className="p-0">
          {filteredMarkets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><MapPin className="h-8 w-8 mx-auto mb-2 opacity-40" /><p className="text-sm">No markets match this filter</p></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-[10px] min-w-[160px]">Market</TableHead>
                  <TableHead className="text-[10px]">State</TableHead>
                  <TableHead className="text-[10px]">Agents</TableHead>
                  <TableHead className="text-[10px]">Market Status</TableHead>
                  <TableHead className="text-[10px]">Anchor</TableHead>
                  <TableHead className="text-[10px]">Group Leader</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow></TableHeader>
                <TableBody>{filteredMarkets.map((m: any) => {
                  const market = m.market ?? m;
                  return (
                    <TableRow key={market.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedMarketId(market.id)}>
                      <TableCell className="text-xs font-medium">{market.name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{market.state ?? "—"}</TableCell>
                      <TableCell className="text-xs font-semibold">{m.agentCount ?? 0}</TableCell>
                      <TableCell><Badge className={`text-[10px] ${MARKET_STATUS_COLORS[market.marketStatus] ?? "bg-gray-100"}`} variant="secondary">{market.marketStatus ?? "Unknown"}</Badge></TableCell>
                      <TableCell className="text-xs">{market.anchorAgent ?? "—"}</TableCell>
                      <TableCell className="text-xs">{market.groupLeader ?? "—"}</TableCell>
                      <TableCell><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                    </TableRow>
                  );
                })}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Market Detail Dialog */}
      <Dialog open={!!selectedMarketId} onOpenChange={() => setSelectedMarketId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MapPin className="h-4 w-4" />Market Agents</DialogTitle>
          </DialogHeader>
          {loadingAgents ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : agents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground"><Users className="h-6 w-6 mx-auto mb-2 opacity-40" /><p className="text-sm">No agents assigned to this market</p></div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-[10px]">Agent</TableHead>
                <TableHead className="text-[10px]">Role</TableHead>
                <TableHead className="text-[10px]">Performance Status</TableHead>
                <TableHead className="text-[10px]">Coach</TableHead>
              </TableRow></TableHeader>
              <TableBody>{agents.map((a: any) => {
                const agent = a.agent ?? a;
                const profile = a.profile;
                const assignment = a.assignment;
                return (
                  <TableRow key={agent.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedMarketId(null); navigate(`/coaching/agent/${agent.id}`); }}>
                    <TableCell className="text-xs font-medium">{agent.name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{assignment?.role ?? "Agent"}</TableCell>
                    <TableCell>{profile?.performanceStatus ? <Badge className={`text-[10px] ${PERF_STATUS_COLORS[profile.performanceStatus] ?? ""}`} variant="secondary">{profile.performanceStatus}</Badge> : "—"}</TableCell>
                    <TableCell className="text-xs">{profile?.coachName ?? "—"}</TableCell>
                  </TableRow>
                );
              })}</TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
