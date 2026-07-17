import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Target, TrendingUp, Users, DollarSign, Pencil, Check, X } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useAppBack } from "@/lib/navigationHistory";

const fmt$ = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function GciProgressBar({ current, goal }: { current: number; goal: number | null }) {
  if (!goal || goal <= 0) return null;
  const pct = Math.min(Math.round((current / goal) * 100), 100);
  const color = pct >= 100 ? "bg-green-500" : pct >= 70 ? "bg-blue-500" : pct >= 40 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Annual GCI Goal Progress</span>
        <span>{pct}% — {fmt$(current)} / {fmt$(goal)}</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function MarketDrillDownPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const goBack = useAppBack("/analytics?tab=markets");
  const marketId = Number(id);

  const { data, isLoading, refetch } = trpc.analytics.marketDrillDown.useQuery({ marketId });
  const setGoalMutation = trpc.analytics.setMarketGoal.useMutation({
    onSuccess: () => { toast.success("Goal updated"); refetch(); setEditingGoal(false); },
    onError: (e) => toast.error(e.message),
  });

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");

  const market = data?.market;
  const agents = data?.agents ?? [];
  const deals = data?.deals ?? [];
  const trend = data?.trend ?? [];

  const totalGci = useMemo(() => agents.reduce((s, a) => s + a.totalGci, 0), [agents]);
  const totalClosed = useMemo(() => agents.reduce((s, a) => s + a.closedDeals, 0), [agents]);
  const totalActive = useMemo(() => agents.reduce((s, a) => s + a.activeDeals, 0), [agents]);
  const annualGoal = market?.annualGciGoal ? Number(market.annualGciGoal) : null;

  function startEditGoal() {
    setGoalInput(annualGoal?.toString() ?? "");
    setEditingGoal(true);
  }

  function saveGoal() {
    const val = goalInput.trim() === "" ? null : Number(goalInput);
    if (val !== null && (isNaN(val) || val < 0)) { toast.error("Enter a valid positive number"); return; }
    setGoalMutation.mutate({ marketId, annualGciGoal: val });
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">Loading market data…</div>
    );
  }

  if (!market) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Market not found.
        <Button variant="link" onClick={goBack}>Back</Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{market.name}</h1>
          <p className="text-sm text-muted-foreground">Market performance drill-down</p>
        </div>
      </div>

      {/* GCI Goal Banner */}
      <Card>
        <CardContent className="pt-5 pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Annual GCI Goal</span>
            </div>
            {!editingGoal ? (
              <Button variant="ghost" size="sm" onClick={startEditGoal} className="gap-1 text-xs">
                <Pencil className="h-3 w-3" /> {annualGoal ? "Edit Goal" : "Set Goal"}
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  className="h-7 w-36 text-sm"
                  value={goalInput}
                  onChange={e => setGoalInput(e.target.value)}
                  placeholder="e.g. 500000"
                  autoFocus
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveGoal} disabled={setGoalMutation.isPending}>
                  <Check className="h-3.5 w-3.5 text-green-600" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingGoal(false)}>
                  <X className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            )}
          </div>
          {annualGoal ? (
            <GciProgressBar current={totalGci} goal={annualGoal} />
          ) : (
            <p className="text-xs text-muted-foreground">No annual GCI goal set. Click "Set Goal" to add one.</p>
          )}
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total GCI" value={fmt$(totalGci)} />
        <KpiCard label="Closed Deals" value={totalClosed} />
        <KpiCard label="Active Pipeline" value={totalActive} />
        <KpiCard label="Agents" value={agents.length} />
      </div>

      {/* Monthly Trend Chart */}
      {trend.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Monthly GCI &amp; Deals (Last 12 Months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="gci" tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="deals" orientation="right" tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  formatter={(v: number, name: string) =>
                    name === "GCI" ? [fmt$(v), "GCI"] : [v, "Deals"]
                  }
                />
                <Legend />
                <Bar yAxisId="gci" dataKey="gci" name="GCI" fill="#6366f1" opacity={0.85} radius={[3, 3, 0, 0]} />
                <Line yAxisId="deals" type="monotone" dataKey="deals" name="Deals" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Agents Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Agents in this Market
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No agents assigned to this market.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">Agent</th>
                    <th className="text-right py-2 px-2 font-medium">Active</th>
                    <th className="text-right py-2 px-2 font-medium">Closed</th>
                    <th className="text-right py-2 px-2 font-medium">GCI</th>
                    <th className="text-right py-2 pl-2 font-medium">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map(a => (
                    <tr key={a.agentId} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/agents/${a.agentId}`)}>
                      <td className="py-2 pr-4 font-medium">
                        <button
                          className="text-primary hover:underline font-medium text-left"
                          onClick={(e) => { e.stopPropagation(); navigate(`/agents/${a.agentId}`); }}
                        >
                          {a.agentName}
                        </button>
                      </td>
                      <td className="text-right py-2 px-2">{a.activeDeals}</td>
                      <td className="text-right py-2 px-2">{a.closedDeals}</td>
                      <td className="text-right py-2 px-2 font-semibold text-primary">{fmt$(a.totalGci)}</td>
                      <td className="text-right py-2 pl-2">{fmt$(a.totalVolume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deal History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" /> Deal History (Last 50)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {deals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No deals recorded for this market yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">Tx #</th>
                    <th className="text-left py-2 px-2 font-medium">Agent</th>
                    <th className="text-left py-2 px-2 font-medium">Type</th>
                    <th className="text-left py-2 px-2 font-medium">Status</th>
                    <th className="text-right py-2 px-2 font-medium">Price</th>
                    <th className="text-right py-2 px-2 font-medium">GCI</th>
                    <th className="text-right py-2 pl-2 font-medium">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map(d => (
                    <tr key={d.txId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{d.txNumber || `#${d.txId}`}</td>
                      <td className="py-2 px-2">{d.agentName}</td>
                      <td className="py-2 px-2 capitalize">{d.transactionType}</td>
                      <td className="py-2 px-2">
                        <Badge variant={d.status === "closed" ? "default" : d.status === "under_contract" ? "secondary" : "destructive"} className="text-xs capitalize">
                          {d.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="text-right py-2 px-2">{d.purchasePrice ? fmt$(d.purchasePrice) : "—"}</td>
                      <td className="text-right py-2 px-2 font-semibold">{d.gci ? fmt$(d.gci) : "—"}</td>
                      <td className="text-right py-2 pl-2 text-xs text-muted-foreground">
                        {d.closingDate ? new Date(d.closingDate).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
