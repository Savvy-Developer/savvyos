import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { RefreshCw, AlertTriangle, CheckCircle, Users, Database, ClipboardList, TrendingUp, Building2, MapPin, Link2 } from "lucide-react";
import { fmt$, fmtNum, KpiCard, EmptyState, CHART_COLORS } from "./shared";

function QualityRow({ label, value, total, warn }: { label: string; value: number; total: number; warn?: boolean }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${warn && value > 0 ? "bg-amber-400" : "bg-primary/40"}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-sm font-medium w-10 text-right ${warn && value > 0 ? "text-amber-600" : "text-foreground"}`}>{fmtNum(value)}</span>
        <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
      </div>
    </div>
  );
}

export default function DatabaseHealthTab() {
  const { data: report, isLoading, refetch } = trpc.analytics.databaseHealthReport.useQuery();

  if (isLoading) return <div className="p-8 text-center text-muted-foreground text-sm">Loading database health...</div>;
  if (!report) return <EmptyState />;

  const isaDistData = (report.isaStatusDistribution ?? []).map((s: any, i: number) => ({
    name: s.status.replace(/_/g, " "),
    value: s.count,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const growthData = (report.monthlyGrowth ?? []).map((m: any) => ({ month: m.month, Contacts: m.newContacts }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Database Health Overview</h3>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8 text-xs gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Contacts" value={fmtNum(report.contacts?.total ?? 0)} icon={<Users className="h-5 w-5" />} highlight />
        <KpiCard label="Total Transactions" value={fmtNum(report.transactions?.total ?? 0)} icon={<TrendingUp className="h-5 w-5" />} />
        <KpiCard label="Pipeline Connections" value={fmtNum(report.pipeline?.total ?? 0)} icon={<Link2 className="h-5 w-5" />} />
        <KpiCard label="Total Tasks" value={fmtNum(report.tasks?.total ?? 0)} icon={<ClipboardList className="h-5 w-5" />} />
      </div>

      {/* Team & Infrastructure */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Agents" value={fmtNum(report.users?.agents ?? 0)} icon={<Users className="h-5 w-5" />} />
        <KpiCard label="ISAs" value={fmtNum(report.users?.isas ?? 0)} icon={<Users className="h-5 w-5" />} />
        <KpiCard label="Groups" value={fmtNum(report.counts?.groups ?? 0)} icon={<Database className="h-5 w-5" />} />
        <KpiCard label="Markets" value={fmtNum(report.counts?.markets ?? 0)} icon={<MapPin className="h-5 w-5" />} />
      </div>

      {/* Transaction Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Transaction Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-center">
                <p className="text-lg font-bold text-emerald-700">{fmtNum(report.transactions?.closed ?? 0)}</p>
                <p className="text-xs text-emerald-600">Closed</p>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-center">
                <p className="text-lg font-bold text-blue-700">{fmtNum(report.transactions?.underContract ?? 0)}</p>
                <p className="text-xs text-blue-600">Under Contract</p>
              </div>
              <div className="rounded-lg bg-muted p-3 text-center">
                <p className="text-lg font-bold text-foreground">{fmt$(report.transactions?.totalGci ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Total GCI</p>
              </div>
              <div className="rounded-lg bg-muted p-3 text-center">
                <p className="text-lg font-bold text-foreground">{fmt$(report.transactions?.totalVolume ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Total Volume</p>
              </div>
            </div>
            <QualityRow label="Missing GCI" value={report.transactions?.noGci ?? 0} total={report.transactions?.total ?? 1} warn />
            <QualityRow label="Integrity Flags" value={report.transactions?.integrityFlags ?? 0} total={report.transactions?.total ?? 1} warn />
            <QualityRow label="Terminated" value={report.transactions?.terminated ?? 0} total={report.transactions?.total ?? 1} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              Task Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-center">
                <p className="text-lg font-bold text-emerald-700">{fmtNum(report.tasks?.completed ?? 0)}</p>
                <p className="text-xs text-emerald-600">Completed</p>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-center">
                <p className="text-lg font-bold text-amber-700">{fmtNum(report.tasks?.overdue ?? 0)}</p>
                <p className="text-xs text-amber-600">Overdue</p>
              </div>
            </div>
            <QualityRow label="Pending" value={report.tasks?.pending ?? 0} total={report.tasks?.total ?? 1} />
            <QualityRow label="Overdue" value={report.tasks?.overdue ?? 0} total={report.tasks?.total ?? 1} warn />
            <div className="mt-3 pt-3 border-t border-border/40">
              <p className="text-xs text-muted-foreground">Pipeline connections without follow-up date</p>
              <div className="flex items-center justify-between mt-1">
                <span className={`text-sm font-semibold ${(report.pipeline?.noFollowUp ?? 0) > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {fmtNum(report.pipeline?.noFollowUp ?? 0)} contacts
                </span>
                {(report.pipeline?.noFollowUp ?? 0) === 0
                  ? <CheckCircle className="h-4 w-4 text-emerald-500" />
                  : <AlertTriangle className="h-4 w-4 text-amber-500" />}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contact Quality */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Contact Data Quality
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-3">
              <div className="text-2xl font-bold text-foreground">{fmtNum(report.contacts?.total ?? 0)}</div>
              <div className="flex gap-1 flex-wrap">
                <Badge variant="secondary" className="text-xs">{fmtNum(report.contacts?.active ?? 0)} active</Badge>
                {(report.contacts?.archived ?? 0) > 0 && <Badge variant="outline" className="text-xs">{fmtNum(report.contacts?.archived ?? 0)} archived</Badge>}
              </div>
            </div>
            <QualityRow label="No Email" value={report.contacts?.noEmail ?? 0} total={report.contacts?.total ?? 1} warn />
            <QualityRow label="No Phone" value={report.contacts?.noPhone ?? 0} total={report.contacts?.total ?? 1} warn />
            <QualityRow label="No Lead Source" value={report.contacts?.noLeadSource ?? 0} total={report.contacts?.total ?? 1} warn />
            <QualityRow label="Bounced Email" value={report.contacts?.bounced ?? 0} total={report.contacts?.total ?? 1} warn />
            <QualityRow label="Unsubscribed" value={report.contacts?.unsubscribed ?? 0} total={report.contacts?.total ?? 1} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Duplicate Contacts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className={`rounded-lg p-3 text-center border ${(report.duplicates?.pending ?? 0) > 0 ? "bg-amber-50 border-amber-100" : "bg-muted border-border"}`}>
                <p className={`text-2xl font-bold ${(report.duplicates?.pending ?? 0) > 0 ? "text-amber-700" : "text-foreground"}`}>{fmtNum(report.duplicates?.pending ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Pending Review</p>
              </div>
              <div className="rounded-lg bg-muted p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{fmtNum(report.duplicates?.total ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Total Flagged</p>
              </div>
            </div>
            <QualityRow label="Merged" value={report.duplicates?.merged ?? 0} total={Math.max(report.duplicates?.total ?? 1, 1)} />
            <QualityRow label="Dismissed" value={report.duplicates?.dismissed ?? 0} total={Math.max(report.duplicates?.total ?? 1, 1)} />
            <div className="mt-3 pt-3 border-t border-border/40">
              <p className="text-xs text-muted-foreground">Lead sources configured</p>
              <p className="text-sm font-semibold mt-0.5">{fmtNum(report.counts?.leadSources ?? 0)} sources</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {growthData.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Monthly Contact Growth (12 mo)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={growthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="Contacts" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {isaDistData.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Contact ISA Status Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={isaDistData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : ""}>
                    {isaDistData.map((p: any) => <Cell key={p.name} fill={p.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [fmtNum(v), "Contacts"]} />
                  <Legend iconSize={10} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
