import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";
import {
  DollarSign, TrendingUp, Building2, Users, ArrowUpDown, ChevronUp, ChevronDown,
} from "lucide-react";
import {
  fmt$, fmtNum, DateRangeFilter, useDateRange, KpiCard, EmptyState, ExportButton, CHART_COLORS, Th, Td,
} from "./shared";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtFull(v: number) {
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_LABEL: Record<string, string> = {
  closed: "Closed",
  under_contract: "Under Contract",
};

const STATUS_COLORS: Record<string, string> = {
  closed: "bg-green-100 text-green-800",
  under_contract: "bg-blue-100 text-blue-800",
};

type SortKey = "closingDate" | "purchasePrice" | "gci" | "companyDollars";

// ─── Component ───────────────────────────────────────────────────────────────
export default function FinancialPerformanceTab() {
  const [range, setRange] = useState("ytd");
  const [agentId, setAgentId] = useState<number | undefined>();
  const [groupId, setGroupId] = useState<number | undefined>();
  const [marketId, setMarketId] = useState<number | undefined>();
  const [statusFilter, setStatusFilter] = useState<"all" | "closed" | "under_contract">("all");
  const [sortBy, setSortBy] = useState<SortKey>("closingDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const dates = useDateRange(range);

  const { data: agents } = trpc.users.list.useQuery({ role: "agent" });
  const { data: groups } = trpc.groups.list.useQuery();
  const { data: markets } = trpc.markets.list.useQuery();

  const summaryInput = useMemo(() => ({
    ...dates, agentId, groupId, marketProfileId: marketId,
  }), [dates, agentId, groupId, marketId]);

  const tableInput = useMemo(() => ({
    ...dates,
    agentId,
    groupId,
    marketProfileId: marketId,
    status: statusFilter === "all" ? undefined : statusFilter,
    sortBy,
    sortOrder,
  }), [dates, agentId, groupId, marketId, statusFilter, sortBy, sortOrder]);

  const { data: summary, isLoading: summaryLoading } = trpc.analytics.financialPerformanceSummary.useQuery(summaryInput);
  const { data: rows, isLoading: tableLoading } = trpc.analytics.masterMetrics.useQuery(tableInput);

  // ─── Derived chart data ────────────────────────────────────────────────────
  const commissionBreakdownData = useMemo(() => {
    if (!summary) return [];
    return [
      { name: "Agent Payouts", value: summary.agentPayouts, fill: CHART_COLORS[1] },
      { name: "Company Dollars", value: summary.companyDollars, fill: CHART_COLORS[0] },
      { name: "Group Leader Splits", value: summary.groupLeaderSplits, fill: CHART_COLORS[4] },
      { name: "Referral Payouts", value: summary.referralPayouts, fill: CHART_COLORS[3] },
    ].filter((d) => d.value > 0);
  }, [summary]);

  const volumeComparisonData = useMemo(() => {
    if (!summary) return [];
    return [
      { name: "Closed", count: summary.closed.count, volume: summary.closed.totalVolume },
      { name: "Under Contract", count: summary.underContract.count, volume: summary.underContract.totalVolume },
    ];
  }, [summary]);

  // ─── Sort toggle ──────────────────────────────────────────────────────────
  function handleSort(key: SortKey) {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("desc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 inline ml-1 opacity-40" />;
    return sortOrder === "asc"
      ? <ChevronUp className="h-3 w-3 inline ml-1 text-primary" />
      : <ChevronDown className="h-3 w-3 inline ml-1 text-primary" />;
  }

  // ─── Export data ──────────────────────────────────────────────────────────
  const exportData = useMemo(() =>
    (rows ?? []).map((r: any) => ({
      "Tx ID": r.txNumber,
      "Address": r.address,
      "Contact": r.contactName,
      "Agent": r.agentName,
      "Status": STATUS_LABEL[r.status] ?? r.status,
      "Close Date": r.closingDate ? new Date(r.closingDate).toLocaleDateString() : "—",
      "Purchase Price": r.purchasePrice,
      "GCI": r.gci,
      "Referral Payouts": r.referralPayouts,
      "Group Leader Splits": r.groupLeaderSplits,
      "Agent Payouts": r.agentPayouts,
      "Company Dollars": r.companyDollars,
      "Lead Source": r.leadSource,
    })),
    [rows]
  );

  return (
    <div className="space-y-6">
      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground font-medium">Period:</span>
        <DateRangeFilter value={range} onChange={setRange} />

        <span className="text-sm text-muted-foreground font-medium">Agent:</span>
        <Select value={agentId !== undefined ? String(agentId) : "all"} onValueChange={(v) => setAgentId(v === "all" ? undefined : Number(v))}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="All Agents" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {(agents ?? []).map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground font-medium">Group:</span>
        <Select value={groupId !== undefined ? String(groupId) : "all"} onValueChange={(v) => setGroupId(v === "all" ? undefined : Number(v))}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All Groups" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Groups</SelectItem>
            {(groups ?? []).map((g: any) => <SelectItem key={g.group.id} value={String(g.group.id)}>{g.group.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground font-medium">Market:</span>
        <Select value={marketId !== undefined ? String(marketId) : "all"} onValueChange={(v) => setMarketId(v === "all" ? undefined : Number(v))}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All Markets" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Markets</SelectItem>
            {(markets ?? []).map((m: any) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* ── Section 1: Transaction Volume & Status ──────────────────────────── */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Transaction Volume &amp; Status</h3>
        {summaryLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Closed Transactions"
              value={fmtNum(summary?.closed.count ?? 0)}
              sub={`${fmt$(summary?.closed.totalVolume ?? 0)} volume`}
              icon={<Building2 className="h-5 w-5" />}
              highlight
            />
            <KpiCard
              label="Under Contract (UC)"
              value={fmtNum(summary?.underContract.count ?? 0)}
              sub={`${fmt$(summary?.underContract.totalVolume ?? 0)} volume`}
              icon={<TrendingUp className="h-5 w-5" />}
            />
            <KpiCard
              label="Total GCI"
              value={fmt$(summary?.totalGci ?? 0)}
              sub="gross commission income"
              icon={<DollarSign className="h-5 w-5" />}
              highlight
            />
            <KpiCard
              label="Company Dollars"
              value={fmt$(summary?.companyDollars ?? 0)}
              sub="Savvy's retained share"
              icon={<Building2 className="h-5 w-5" />}
            />
          </div>
        )}
      </div>

      {/* ── Section 2: Financial Performance Metrics ────────────────────────── */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Financial Performance Metrics</h3>
        {summaryLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Gross Commission"
              value={fmt$(summary?.grossCommission ?? 0)}
              sub="GCI minus referral payouts"
              icon={<DollarSign className="h-5 w-5" />}
            />
            <KpiCard
              label="Net Commission (Agent)"
              value={fmt$(summary?.netCommission ?? 0)}
              sub="final agent payout"
              icon={<Users className="h-5 w-5" />}
            />
            <KpiCard
              label="Group Leader Splits"
              value={fmt$(summary?.groupLeaderSplits ?? 0)}
              sub="total group leader payouts"
              icon={<Users className="h-5 w-5" />}
            />
            <KpiCard
              label="Referral Payouts"
              value={fmt$(summary?.referralPayouts ?? 0)}
              sub="referral partner fees"
              icon={<DollarSign className="h-5 w-5" />}
            />
          </div>
        )}
      </div>

      {/* ── Section 3: Visualizations ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Commission Breakdown Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Commission Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {commissionBreakdownData.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={commissionBreakdownData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {commissionBreakdownData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [fmtFull(v), ""]} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Volume Comparison Bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Closed vs Under Contract Volume</CardTitle>
          </CardHeader>
          <CardContent>
            {volumeComparisonData.every((d) => d.volume === 0) ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={volumeComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => fmt$(v)} tick={{ fontSize: 11 }} width={60} />
                  <Tooltip formatter={(v: number, name: string) => [name === "volume" ? fmtFull(v) : fmtNum(v), name === "volume" ? "Volume" : "Count"]} />
                  <Bar dataKey="volume" name="Volume" fill={CHART_COLORS[1]} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Section 4: Master Metrics Table ─────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <CardTitle className="text-sm font-semibold">Master Metrics Table</CardTitle>
              {rows && rows.length > 0 && (
                <Badge variant="secondary" className="text-xs">{rows.length} transactions</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Status filter */}
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-40 h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="closed">Closed Only</SelectItem>
                  <SelectItem value="under_contract">Under Contract Only</SelectItem>
                </SelectContent>
              </Select>
              <ExportButton data={exportData} filename="master-metrics.csv" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {tableLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading transactions...</div>
          ) : (rows ?? []).length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30">
                  <tr>
                    {([
                      { label: "Tx / Address", col: null, align: "left" },
                      { label: "Contact", col: null, align: "left" },
                      { label: "Agent", col: null, align: "left" },
                      { label: "Status", col: null, align: "left" },
                      { label: "Close Date", col: "closingDate", align: "right" },
                      { label: "Purchase Price", col: "purchasePrice", align: "right" },
                      { label: "GCI", col: "gci", align: "right" },
                      { label: "Referral Payouts", col: null, align: "right" },
                      { label: "Group Leader Splits", col: null, align: "right" },
                      { label: "Agent Payouts", col: null, align: "right" },
                      { label: "Company Dollars", col: "companyDollars", align: "right" },
                      { label: "Lead Source", col: null, align: "left" },
                    ] as { label: string; col: SortKey | null; align: string }[]).map(({ label, col, align }) => (
                      <th
                        key={label}
                        onClick={col ? () => handleSort(col) : undefined}
                        className={`px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${align === "right" ? "text-right" : "text-left"} ${col ? "cursor-pointer select-none" : ""}`}
                      >
                        {label}{col && <SortIcon col={col} />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(rows ?? []).map((r: any) => (
                    <tr key={r.txId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <Td>
                        <div className="font-medium text-xs">{r.txNumber}</div>
                        <div className="text-muted-foreground text-xs truncate max-w-[160px]">{r.address}</div>
                      </Td>
                      <Td className="text-xs text-muted-foreground">{r.contactName}</Td>
                      <Td className="text-xs">{r.agentName}</Td>
                      <Td>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-700"}`}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </Td>
                      <Td className="text-right text-xs whitespace-nowrap">
                        {r.closingDate ? new Date(r.closingDate).toLocaleDateString() : "—"}
                      </Td>
                      <Td className="text-right font-medium">{r.purchasePrice > 0 ? fmtFull(r.purchasePrice) : "—"}</Td>
                      <Td className="text-right font-semibold text-primary">{r.gci > 0 ? fmtFull(r.gci) : "—"}</Td>
                      <Td className="text-right text-muted-foreground">{r.referralPayouts > 0 ? fmtFull(r.referralPayouts) : "—"}</Td>
                      <Td className="text-right text-muted-foreground">{r.groupLeaderSplits > 0 ? fmtFull(r.groupLeaderSplits) : "—"}</Td>
                      <Td className="text-right">{r.agentPayouts > 0 ? fmtFull(r.agentPayouts) : "—"}</Td>
                      <Td className="text-right font-medium text-amber-700">{r.companyDollars > 0 ? fmtFull(r.companyDollars) : "—"}</Td>
                      <Td className="text-xs text-muted-foreground">{r.leadSource}</Td>
                    </tr>
                  ))}
                </tbody>
                {/* Totals row */}
                {(rows ?? []).length > 0 && (() => {
                  const totals = (rows ?? []).reduce(
                    (acc: any, r: any) => ({
                      purchasePrice: acc.purchasePrice + r.purchasePrice,
                      gci: acc.gci + r.gci,
                      referralPayouts: acc.referralPayouts + r.referralPayouts,
                      groupLeaderSplits: acc.groupLeaderSplits + r.groupLeaderSplits,
                      agentPayouts: acc.agentPayouts + r.agentPayouts,
                      companyDollars: acc.companyDollars + r.companyDollars,
                    }),
                    { purchasePrice: 0, gci: 0, referralPayouts: 0, groupLeaderSplits: 0, agentPayouts: 0, companyDollars: 0 }
                  );
                  return (
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                        <td colSpan={5} className="px-3 py-2 text-xs text-muted-foreground uppercase tracking-wide">Totals ({(rows ?? []).length} rows)</td>
                        <Td className="text-right">{fmtFull(totals.purchasePrice)}</Td>
                        <Td className="text-right text-primary">{fmtFull(totals.gci)}</Td>
                        <Td className="text-right text-muted-foreground">{totals.referralPayouts > 0 ? fmtFull(totals.referralPayouts) : "—"}</Td>
                        <Td className="text-right text-muted-foreground">{totals.groupLeaderSplits > 0 ? fmtFull(totals.groupLeaderSplits) : "—"}</Td>
                        <Td className="text-right">{fmtFull(totals.agentPayouts)}</Td>
                        <Td className="text-right text-amber-700">{fmtFull(totals.companyDollars)}</Td>
                        <Td>{" "}</Td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
