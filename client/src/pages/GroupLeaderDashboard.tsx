import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp, Users, CheckCircle2, GitBranch, Crown, ChevronRight, DollarSign
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useLocation } from "wouter";

const currentYear = new Date().getFullYear();
const YEARS = [currentYear, currentYear - 1, currentYear - 2];

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GroupLeaderDashboard() {
  const [year, setYear] = useState(currentYear);
  const [, navigate] = useLocation();
  const { data, isLoading, error } = trpc.groups.teamDashboard.useQuery({ year });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading team data…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="text-sm">
          {error?.message === "Not a group leader"
            ? "You are not currently assigned as a group leader."
            : "Unable to load team dashboard."}
        </p>
      </div>
    );
  }

  const { group, members, teamStats } = data;

  // Sort: leader first, then by GCI desc
  const sorted = [...members].sort((a, b) => {
    if (a.isLeader && !b.isLeader) return -1;
    if (!a.isLeader && b.isLeader) return 1;
    return b.gci - a.gci;
  });

  const teamGciTarget = members.reduce((s, m) => s + m.gciTarget, 0);
  const teamGciPct = teamGciTarget > 0 ? Math.min(Math.round((teamStats.totalGCI / teamGciTarget) * 100), 100) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${group.name} — Team Dashboard`}
        subtitle={`${members.length} team member${members.length !== 1 ? "s" : ""} · ${year} performance`}
        actions={
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* Team KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={DollarSign}
          label="Team YTD GCI"
          value={fmt(teamStats.totalGCI)}
          sub={teamGciTarget > 0 ? `${teamGciPct}% of ${fmt(teamGciTarget)} goal` : "No goal set"}
          color="bg-emerald-500"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Closed Deals"
          value={String(teamStats.closedDeals)}
          sub={`${year} YTD`}
          color="bg-blue-500"
        />
        <KpiCard
          icon={TrendingUp}
          label="Under Contract"
          value={String(teamStats.activeDeals)}
          sub="Active closings"
          color="bg-amber-500"
        />
        <KpiCard
          icon={GitBranch}
          label="Total Pipeline"
          value={String(teamStats.totalPipeline)}
          sub="Active contacts"
          color="bg-purple-500"
        />
      </div>

      {/* Team GCI Progress */}
      {teamGciTarget > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Team GCI Progress — {year}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>{fmt(teamStats.totalGCI)} earned</span>
              <span>{fmt(teamGciTarget)} goal</span>
            </div>
            <Progress value={teamGciPct ?? 0} className="h-3" />
            <p className="text-xs text-muted-foreground mt-1.5">
              {teamGciPct !== null ? `${teamGciPct}% of annual goal` : "No goal set for this year"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Per-Member Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            Agent Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Agent</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">YTD GCI</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Goal</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground w-40">Progress</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Closed</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">UC</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Pipeline</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => (
                  <tr key={m.agentId} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {initials(m.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm leading-tight">{m.name}</p>
                          {m.isLeader && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 mt-0.5 border-amber-400 text-amber-600 gap-0.5">
                              <Crown className="h-2.5 w-2.5" />
                              Leader
                            </Badge>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                      {fmt(m.gci)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                      {m.gciTarget > 0 ? fmt(m.gciTarget) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {m.gciPct !== null ? (
                        <div className="flex items-center gap-2">
                          <Progress value={m.gciPct} className="h-1.5 flex-1" />
                          <span className="text-xs text-muted-foreground w-8 text-right">{m.gciPct}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No goal</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{m.closedDeals}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{m.activeDeals}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{m.pipeline}</td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => navigate(`/transactions?agentId=${m.agentId}`)}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
