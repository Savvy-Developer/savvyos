import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ArrowDownRight, Minus, Download } from "lucide-react";

// ─── Color palette ────────────────────────────────────────────────────────────
export const CHART_COLORS = ["#1e3a5f", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#dc2626", "#0891b2", "#be185d", "#059669", "#b45309"];

export const PIPELINE_LABELS: Record<string, string> = {
  new_lead: "New Lead", attempted_contact: "Attempted", nurture: "Nurture",
  active_client: "Active Client", under_contract: "Under Contract", closed: "Closed", dead: "Dead",
};

// ─── Formatters ───────────────────────────────────────────────────────────────
export function fmt$(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toLocaleString()}`;
}
export function fmtPct(v: number) { return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`; }
export function fmtNum(v: number) { return v.toLocaleString(); }

// ─── Date range hook ──────────────────────────────────────────────────────────
export function useDateRange(range: string) {
  return useMemo(() => {
    const now = new Date();
    if (range === "all") return {};
    const from = new Date(now);
    if (range === "ytd") { from.setMonth(0); from.setDate(1); }
    else if (range === "last12") from.setMonth(from.getMonth() - 12);
    else if (range === "last6") from.setMonth(from.getMonth() - 6);
    else if (range === "last3") from.setMonth(from.getMonth() - 3);
    else if (range === "last30") from.setDate(from.getDate() - 30);
    return { dateFrom: from.toISOString(), dateTo: now.toISOString() };
  }, [range]);
}

// ─── Shared components ────────────────────────────────────────────────────────
export function DateRangeFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-36 h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Time</SelectItem>
        <SelectItem value="ytd">Year to Date</SelectItem>
        <SelectItem value="last12">Last 12 Months</SelectItem>
        <SelectItem value="last6">Last 6 Months</SelectItem>
        <SelectItem value="last3">Last 3 Months</SelectItem>
        <SelectItem value="last30">Last 30 Days</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function KpiCard({ label, value, sub, trend, icon, highlight }: {
  label: string; value: string | number; sub?: string;
  trend?: "up" | "down" | "flat"; icon?: React.ReactNode; highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary/40 bg-primary/5" : ""}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium mb-1">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {trend === "up" && <ArrowUpRight className="h-3 w-3 text-green-500" />}
                {trend === "down" && <ArrowDownRight className="h-3 w-3 text-red-500" />}
                {trend === "flat" && <Minus className="h-3 w-3 text-muted-foreground" />}
                {sub}
              </p>
            )}
          </div>
          {icon && <div className="text-muted-foreground/40 ml-2">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export function TrendBadge({ value, suffix = "%" }: { value: number; suffix?: string }) {
  if (Math.abs(value) < 0.5) return <Badge variant="secondary" className="text-xs">Flat</Badge>;
  if (value > 0) return <Badge className="text-xs bg-green-100 text-green-700 border-green-200">{`+${value.toFixed(1)}${suffix}`}</Badge>;
  return <Badge className="text-xs bg-red-100 text-red-700 border-red-200">{`${value.toFixed(1)}${suffix}`}</Badge>;
}

export function EmptyState({ message = "No data available for the selected filters." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
      <span className="text-2xl">📊</span>
      <span>{message}</span>
    </div>
  );
}

export function SectionHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
      {actions}
    </div>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
export function exportToCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function ExportButton({ data, filename }: { data: Record<string, unknown>[]; filename: string }) {
  return (
    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => exportToCsv(filename, data)}>
      <Download className="h-3 w-3" />
      Export CSV
    </Button>
  );
}

// ─── Sortable table header ────────────────────────────────────────────────────
export function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide ${className}`}>{children}</th>;
}
export function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 text-sm ${className}`}>{children}</td>;
}
