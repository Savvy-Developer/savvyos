import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { DollarSign, CheckCircle2, Clock, TrendingUp, ArrowUpAZ, ArrowDownAZ } from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  AggregateMode,
  AggregateModeSelector,
  calculateTableAggregate,
  TablePaginationControls,
} from "@/components/TableControls";

const PAYEE_TYPE_LABELS: Record<string, string> = {
  agent: "Agent",
  savvy_str_agents: "Savvy STR Agents",
  group_leader: "Group Leader",
  referral_partner: "Referral Partner",
  isa_bonus: "ISA Bonus",
  other: "Other",
};

const PAYEE_TYPE_COLORS: Record<string, string> = {
  agent: "bg-blue-100 text-blue-800",
  savvy_str_agents: "bg-amber-100 text-amber-800",
  group_leader: "bg-purple-100 text-purple-800",
  referral_partner: "bg-teal-100 text-teal-800",
  isa_bonus: "bg-pink-100 text-pink-800",
  other: "bg-gray-100 text-gray-700",
};

type PayoutRow = {
  payout: {
    id: number;
    transactionId: number;
    payeeType: string;
    payeeUserId: number | null;
    payeeName: string | null;
    percentage: string;
    amount: string | null;
    isPaid: boolean;
    paidDate: Date | null;
    notes: string | null;
  };
  transaction: {
    id: number;
    transactionNumber: string | null;
    status: string;
    closingDate: Date | null;
    salePrice: string | null;
    agentId: number | null;
  } | null;
  contact: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
  property: {
    id: number;
    address: string;
    city: string | null;
    state: string | null;
  } | null;
  payeeUser: {
    id: number;
    name: string | null;
  } | null;
  txAgent: {
    id: number;
    name: string | null;
  } | null;
};

function fmt(val: string | null | undefined) {
  if (!val) return "—";
  const n = parseFloat(val);
  return isNaN(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAggregateCurrency(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAggregatePercentage(value: number) {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

export default function PayoutReportPage() {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [payeeTypeFilter, setPayeeTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [payoutAggregateMode, setPayoutAggregateMode] = usePersistentState<AggregateMode>("payouts.aggregateMode", "sum");
  const [payoutPage, setPayoutPage] = usePersistentState("payouts.page", 1);
  const [payoutLimit, setPayoutLimit] = usePersistentState<number>("payouts.limit", 25);

  const { data: agentList = [] } = trpc.users.list.useQuery({ role: "agent" });

  const queryInput = useMemo(() => ({
    ...(paidFilter !== "all" ? { paid: paidFilter === "paid" } : {}),
    ...(agentFilter !== "all" ? { agentId: Number(agentFilter) } : {}),
    ...(payeeTypeFilter !== "all" ? { payeeType: payeeTypeFilter } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    sortOrder,
  }), [paidFilter, agentFilter, payeeTypeFilter, dateFrom, dateTo, sortOrder]);

  const { data: payouts = [], isLoading } = trpc.payouts.listAll.useQuery(queryInput);

  const markPaidMutation = trpc.payouts.markPaid.useMutation({
    onSuccess: () => {
      toast.success("Payout status updated");
      utils.payouts.listAll.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const activeFilterCount = [agentFilter !== "all", payeeTypeFilter !== "all", dateFrom, dateTo, paidFilter !== "all"].filter(Boolean).length;

  const rows = payouts as PayoutRow[];
  const payoutTotalPages = Math.max(1, Math.ceil(rows.length / payoutLimit));
  const currentPayoutPage = Math.min(Math.max(payoutPage, 1), payoutTotalPages);
  const pageRows = rows.slice((currentPayoutPage - 1) * payoutLimit, currentPayoutPage * payoutLimit);
  const totalAmount = rows.reduce((sum, r) => sum + parseFloat(r.payout.amount ?? "0"), 0);
  const paidAmount = rows.filter((r) => r.payout.isPaid).reduce((sum, r) => sum + parseFloat(r.payout.amount ?? "0"), 0);
  const unpaidAmount = totalAmount - paidAmount;
  const paidCount = rows.filter((r) => r.payout.isPaid).length;
  const unpaidCount = rows.filter((r) => !r.payout.isPaid).length;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <DollarSign className="h-6 w-6" /> Payout Report
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Track all commission payouts across every transaction.
            </p>
          </div>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
            </Badge>
          )}
        </div>

        {/* Filter bar */}
        <div className="mt-4 flex flex-wrap gap-2 items-end">
          {/* Sort toggle */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-9"
            onClick={() => { setSortOrder(o => o === "asc" ? "desc" : "asc"); setPayoutPage(1); }}
            title={sortOrder === "asc" ? "Sorted A → Z" : "Sorted Z → A"}
          >
            {sortOrder === "asc" ? <><ArrowUpAZ className="h-4 w-4" /><span className="hidden sm:inline">A → Z</span></> : <><ArrowDownAZ className="h-4 w-4" /><span className="hidden sm:inline">Z → A</span></>}
          </Button>
          {/* Paid/Unpaid */}
          <Select value={paidFilter} onValueChange={(v) => { setPaidFilter(v as "all" | "paid" | "unpaid"); setPayoutPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payouts</SelectItem>
              <SelectItem value="unpaid">Unpaid Only</SelectItem>
              <SelectItem value="paid">Paid Only</SelectItem>
            </SelectContent>
          </Select>

          {/* Agent filter */}
          <Select value={agentFilter} onValueChange={(value) => { setAgentFilter(value); setPayoutPage(1); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {(agentList as any[]).map((a: any) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.name ?? `Agent #${a.id}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Payee type filter */}
          <Select value={payeeTypeFilter} onValueChange={(value) => { setPayeeTypeFilter(value); setPayoutPage(1); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(PAYEE_TYPE_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date range */}
          <div className="flex items-center gap-1">
            <Input
              type="date"
              className="w-36 h-9 text-sm"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPayoutPage(1); }}
              placeholder="From"
            />
            <span className="text-muted-foreground text-xs">–</span>
            <Input
              type="date"
              className="w-36 h-9 text-sm"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPayoutPage(1); }}
              placeholder="To"
            />
          </div>

          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-9"
              onClick={() => { setPaidFilter("all"); setAgentFilter("all"); setPayeeTypeFilter("all"); setDateFrom(""); setDateTo(""); setPayoutPage(1); }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Payouts</p>
                <p className="text-xl font-bold">{fmt(totalAmount.toString())}</p>
                <p className="text-xs text-muted-foreground">{rows.length} line items</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Paid Out</p>
                <p className="text-xl font-bold text-green-700">{fmt(paidAmount.toString())}</p>
                <p className="text-xs text-muted-foreground">{paidCount} items</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-xl font-bold text-amber-700">{fmt(unpaidAmount.toString())}</p>
                <p className="text-xs text-muted-foreground">{unpaidCount} items</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <DollarSign className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg Payout</p>
                <p className="text-xl font-bold text-blue-700">
                  {rows.length > 0 ? fmt((totalAmount / rows.length).toString()) : "—"}
                </p>
                <p className="text-xs text-muted-foreground">per line item</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transaction</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Payee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Paid Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  Loading payouts...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  No payout records found.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((r) => (
                <TableRow key={r.payout.id}>
                  <TableCell className="font-medium text-sm">
                    {r.property?.address ? (
                      <button
                        onClick={() => r.transaction && navigate(`/transactions/${r.transaction.id}`)}
                        className="text-left hover:underline text-primary"
                      >
                        {r.property.address}
                        {r.property.city && <span className="text-muted-foreground text-xs">, {r.property.city}</span>}
                      </button>
                    ) : r.transaction ? (
                      <button
                        onClick={() => navigate(`/transactions/${r.transaction!.id}`)}
                        className="text-left hover:underline text-primary text-xs"
                      >
                        View Transaction
                      </button>
                    ) : <span className="text-muted-foreground text-xs">No address</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.contact ? (
                      <button
                        onClick={() => navigate(`/contacts/${r.contact!.id}`)}
                        className="text-left hover:underline text-primary"
                      >
                        {r.contact.firstName} {r.contact.lastName}
                      </button>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {r.payout.payeeType === "agent" && r.payeeUser?.id ? (
                      <button
                        onClick={() => navigate(`/agents/${r.payeeUser!.id}`)}
                        className="text-left hover:underline text-primary"
                      >
                        {r.payeeUser.name ?? r.payout.payeeName ?? "—"}
                      </button>
                    ) : (
                      r.payout.payeeName ?? "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PAYEE_TYPE_COLORS[r.payout.payeeType] ?? "bg-gray-100 text-gray-700"}`}>
                      {PAYEE_TYPE_LABELS[r.payout.payeeType] ?? r.payout.payeeType}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {r.payout.percentage}%
                  </TableCell>
                  <TableCell className="text-right font-semibold text-sm">
                    {fmt(r.payout.amount)}
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.payout.isPaid ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                      {r.payout.isPaid ? "Paid" : "Not Paid"}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {r.payout.paidDate ? safeFormat(r.payout.paidDate, "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">

                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => markPaidMutation.mutate({
                          id: r.payout.id,
                          paid: !r.payout.isPaid,
                        })}
                        disabled={markPaidMutation.isPending}
                      >
                        {r.payout.isPaid ? "Mark Unpaid" : "Mark Paid"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {pageRows.length > 0 && (
            <tfoot className="border-t bg-muted/50">
              <tr>
                <td colSpan={4} className="py-2 px-4">
                  <AggregateModeSelector
                    mode={payoutAggregateMode}
                    onModeChange={setPayoutAggregateMode}
                  />
                </td>
                <td className="py-2 px-4 text-right font-semibold text-sm">
                  {calculateTableAggregate(
                    pageRows.map((row) => parseFloat(row.payout.percentage ?? "0")),
                    payoutAggregateMode,
                    formatAggregatePercentage,
                  )}
                </td>
                <td className="py-2 px-4 text-right font-semibold text-sm">
                  {calculateTableAggregate(
                    pageRows.map((row) => parseFloat(row.payout.amount ?? "0")),
                    payoutAggregateMode,
                    formatAggregateCurrency,
                  )}
                </td>
                <td colSpan={3} className="py-2 px-4 text-xs text-muted-foreground">
                  {pageRows.length} row{pageRows.length !== 1 ? "s" : ""} (this page)
                </td>
              </tr>
            </tfoot>
          )}
        </Table>
      </div>

      <TablePaginationControls
        totalRows={rows.length}
        page={currentPayoutPage}
        pageSize={payoutLimit}
        itemLabel="payout"
        onPageChange={setPayoutPage}
        onPageSizeChange={(pageSize) => { setPayoutLimit(pageSize); setPayoutPage(1); }}
      />
    </div>
  );
}
