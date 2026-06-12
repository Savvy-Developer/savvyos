import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
import { DollarSign, TrendingUp, Clock, Users, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";


export default function GroupLeaderCommissionsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "unpaid">("all");

  // Server-side guard: verify user is actually a group leader
  const { data: leaderCheck, isLoading: leaderCheckLoading } = trpc.groups.isGroupLeader.useQuery();

  const filterParam = paidFilter === "all" ? undefined : paidFilter === "paid";
  const { data, isLoading } = trpc.payouts.groupLeaderPayouts.useQuery(
    filterParam !== undefined ? { paid: filterParam } : {}
  );

  const payouts = data?.payouts ?? [];
  const group = data?.group;
  const members = data?.members ?? [];

  const totalEarned = payouts.reduce((sum, r) => sum + Number(r.payout.amount ?? 0), 0);
  const paidPayouts = payouts.filter((r) => r.payout.isPaid);
  const unpaidPayouts = payouts.filter((r) => !r.payout.isPaid);
  const totalPaid = paidPayouts.reduce((sum, r) => sum + Number(r.payout.amount ?? 0), 0);
  const totalPending = totalEarned - totalPaid;

  // Guard: if the server confirms user is not a group leader, show access denied
  if (!leaderCheckLoading && leaderCheck && !leaderCheck.isLeader) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <PageHeader
          title="Group Leader Commissions"
          subtitle="Access restricted"
        />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">You do not have access to this page.</p>
            <p className="text-sm mt-1">This page is only available to group leaders.</p>
            <Button className="mt-4" variant="outline" onClick={() => navigate("/")}>Go to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!group && !isLoading && !leaderCheckLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <PageHeader
          title="Group Leader Commissions"
          subtitle="You are not currently a group leader"
        />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>You are not assigned as a leader of any group.</p>
            <p className="text-sm mt-1">Contact your admin if you believe this is an error.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Group Leader Commissions"
        subtitle={group ? `${group.name} — ${group.leaderCommissionSplit ?? 0}% leader split` : "Loading..."}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Earned</p>
                <p className="text-xl font-bold">${totalEarned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="text-xl font-bold">${totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-xl font-bold">${totalPending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <TrendingUp className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Transactions</p>
                <p className="text-xl font-bold">{payouts.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Group Members */}
      {members.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" /> Group Members ({members.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <Badge key={m.id} variant="secondary">{m.name ?? `User #${m.id}`}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payout Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Commission Payouts</CardTitle>
            <div className="flex gap-2">
              {(["all", "unpaid", "paid"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={paidFilter === f ? "default" : "outline"}
                  onClick={() => setPaidFilter(f)}
                >
                  {f === "all" ? "All" : f === "paid" ? "Paid" : "Unpaid"}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : payouts.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No group leader payouts found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Transaction</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Agent</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Contact</th>
                    <th className="text-right py-3 px-4 text-muted-foreground font-medium">GCI</th>
                    <th className="text-right py-3 px-4 text-muted-foreground font-medium">Split %</th>
                    <th className="text-right py-3 px-4 text-muted-foreground font-medium">Your Payout</th>
                    <th className="text-center py-3 px-4 text-muted-foreground font-medium">Status</th>
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Date</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((row) => {
                    const gci = Number(row.transaction?.grossCommissionIncome ?? 0);
                    const amount = Number(row.payout.amount ?? 0);
                    const contactName = row.contact
                      ? `${row.contact.firstName} ${row.contact.lastName}`.trim()
                      : "—";
                    return (
                      <tr key={row.payout.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4 font-mono text-xs">
                          {row.transaction?.transactionNumber ?? "—"}
                        </td>
                        <td className="py-3 px-4">{row.agent?.name ?? "—"}</td>
                        <td className="py-3 px-4 text-muted-foreground">{contactName}</td>
                        <td className="py-3 px-4 text-right">${gci.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-3 px-4 text-right">{row.payout.percentage}%</td>
                        <td className="py-3 px-4 text-right font-semibold">${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-3 px-4 text-center">
                          {row.payout.isPaid ? (
                            <Badge variant="default" className="bg-emerald-600 text-white text-xs">Paid</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Unpaid</Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {row.payout.paidDate
                            ? new Date(row.payout.paidDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                            : "—"}
                        </td>
                        <td className="py-3 px-4">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(`/transactions/${row.transaction?.id}`)}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
