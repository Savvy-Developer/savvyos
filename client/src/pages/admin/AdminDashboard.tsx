import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  TrendingUp,
  Users,
  UserCheck,
  Tag,
} from "lucide-react";
import { useLocation } from "wouter";
import { TransactionStatusBadge, IsaStatusBadge } from "@/components/StatusBadge";
import { safeFormat } from "@/lib/safeFormat";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  color = "primary",
  onClick,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  subtitle?: string;
  color?: "primary" | "green" | "amber" | "red" | "purple";
  onClick?: () => void;
}) {
  const colorMap = {
    primary: "text-primary bg-primary/10",
    green: "text-emerald-600 bg-emerald-50",
    amber: "text-amber-600 bg-amber-50",
    red: "text-red-600 bg-red-50",
    purple: "text-purple-600 bg-purple-50",
  };
  return (
    <Card
      className={onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className={`p-2.5 rounded-lg ${colorMap[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: overview } = trpc.analytics.overview.useQuery();
  const { data: agentPerf } = trpc.analytics.agentPerformance.useQuery();
  const { data: pipelineByStatus } = trpc.analytics.pipelineByStatus.useQuery();
  const { data: recentTransactionsData } = trpc.transactions.list.useQuery({ limit: 5 });
  const recentTransactions = recentTransactionsData?.rows ?? [];
  const { data: pendingTasksData } = trpc.tasks.listAll.useQuery({ status: "pending", limit: 10 });
  const pendingTasks = pendingTasksData?.rows;
  const { data: teamMembers } = trpc.users.list.useQuery({});
  const { data: recentContactsData } = trpc.contacts.list.useQuery({ limit: 8, page: 1 });
  const recentContacts = recentContactsData?.rows ?? [];

  const flagged = (recentTransactions ?? []).filter(
    (r) => r.transaction.payoutIntegrityFlag
  );

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const agentCount = (teamMembers ?? []).filter((u) => u.role === "agent").length;
  const isaCount = (teamMembers ?? []).filter((u) => u.role === "isa").length;

  // Format pipeline data for chart
  const pipelineChartData = (pipelineByStatus ?? []).map((p) => ({
    name: (p.status ?? "unknown").replace(/_/g, " "),
    count: p.count,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {greeting}, {user?.name?.split(" ")[0] ?? "Admin"} 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Brokerage overview — here's your operation at a glance.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/analytics")}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Full Reports
          </Button>
          <Button size="sm" onClick={() => navigate("/transactions")}>
            <Building2 className="h-4 w-4 mr-2" />
            All Transactions
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Contacts"
          value={overview?.totalContacts ?? 0}
          icon={Users}
          subtitle="In brokerage CRM"
          onClick={() => navigate("/contacts")}
        />
        <StatCard
          title="Active Pipeline"
          value={overview?.activePipeline ?? 0}
          icon={TrendingUp}
          subtitle="Open transactions"
          color="primary"
          onClick={() => navigate("/transactions")}
        />
        <StatCard
          title="Closed Deals"
          value={overview?.closedTransactions ?? 0}
          icon={CheckCircle2}
          subtitle="All time"
          color="green"
          onClick={() => navigate("/transactions?status=closed")}
        />
        <StatCard
          title="Total GCI"
          value={`$${Number(overview?.totalRevenue ?? 0).toLocaleString()}`}
          icon={DollarSign}
          subtitle="Gross commission income"
          color="amber"
          onClick={() => navigate("/commission")}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Agents"
          value={agentCount}
          icon={UserCheck}
          subtitle="Active agents"
          color="purple"
          onClick={() => navigate("/users")}
        />
        <StatCard
          title="ISAs"
          value={isaCount}
          icon={Users}
          subtitle="Inside sales agents"
          color="purple"
          onClick={() => navigate("/users")}
        />
        <StatCard
          title="Pending Tasks"
          value={overview?.pendingTasks ?? 0}
          icon={ClipboardList}
          subtitle="Across all agents"
          color="amber"
          onClick={() => navigate("/tasks")}
        />
        <StatCard
          title="Commission Flags"
          value={flagged.length}
          icon={AlertTriangle}
          subtitle={flagged.length > 0 ? "Needs attention" : "All clear"}
          color={flagged.length > 0 ? "red" : "green"}
          onClick={() => navigate("/commission")}
        />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Performance */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary" />
                  Agent Performance
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/analytics")}
                  className="text-xs h-7"
                >
                  Full report <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!agentPerf || agentPerf.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <UserCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No agents yet. Add team members to see performance.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate("/users")}
                  >
                    Manage Team
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 text-muted-foreground font-medium">Agent</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Pipeline</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Active</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">Closed</th>
                        <th className="text-right py-2 px-2 text-muted-foreground font-medium">GCI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentPerf.slice(0, 8).map((row: any) => (
                        <tr key={row.agent.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2.5 px-2">
                            <div
                              className="flex items-center gap-2 cursor-pointer group"
                              onClick={() => navigate(`/agents/${row.agent.id}`)}
                            >
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                                {(row.agent.name ?? "?").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                              </div>
                              <span className="font-medium text-primary group-hover:underline">{row.agent.name ?? "Unknown"}</span>
                            </div>
                          </td>
                          <td className="text-right py-2.5 px-2 text-muted-foreground">{row.pipelineContacts ?? 0}</td>
                          <td className="text-right py-2.5 px-2 text-muted-foreground">{row.activeCount}</td>
                          <td className="text-right py-2.5 px-2">
                            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 text-xs">
                              {row.closedCount}
                            </Badge>
                          </td>
                          <td className="text-right py-2.5 px-2 font-semibold text-foreground">
                            ${Number(row.totalGCI ?? 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pipeline by Status Chart */}
          {pipelineChartData.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Pipeline by Stage
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={pipelineChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Commission Flags */}
          {flagged.length > 0 && (
            <Card className="border-red-200 bg-red-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-red-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Commission Alerts ({flagged.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                {flagged.slice(0, 4).map(({ transaction }) => (
                  <div
                    key={transaction.id}
                    className="text-xs text-red-600 cursor-pointer hover:underline py-0.5 flex items-center gap-1"
                    onClick={() => navigate(`/transactions/${transaction.id}`)}
                  >
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {transaction.transactionNumber}: {transaction.payoutIntegrityNote}
                    </span>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2 text-xs h-7 border-red-200 text-red-700 hover:bg-red-100"
                  onClick={() => navigate("/commission")}
                >
                  Review All
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Recent Contacts with ISA Status */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Recent Contacts
                </CardTitle>
                <button
                  onClick={() => navigate("/contacts")}
                  className="text-xs text-primary hover:underline"
                >
                  View all
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {recentContacts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No contacts yet</p>
              ) : (
                <div className="space-y-1">
                  {recentContacts.map(({ contact }: any) => (
                    <div
                      key={contact.id}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/contacts/${contact.id}`)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {contact.firstName} {contact.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {contact.email ?? "No email"}
                        </p>
                      </div>
                      <IsaStatusBadge status={contact.isaStatus} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Transactions */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Recent Transactions
                </CardTitle>
                <button
                  onClick={() => navigate("/transactions")}
                  className="text-xs text-primary hover:underline"
                >
                  View all
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!recentTransactions || recentTransactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No transactions yet
                </p>
              ) : (
                <div className="space-y-2">
                  {recentTransactions.slice(0, 5).map(({ transaction, contact, property }) => (
                    <div
                      key={transaction.id}
                      className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/transactions/${transaction.id}`)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {contact?.firstName} {contact?.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {property?.address ?? "No property linked"}
                        </p>
                      </div>
                      <TransactionStatusBadge status={transaction.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
