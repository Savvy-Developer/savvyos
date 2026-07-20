import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import { TransactionStatusBadge } from "@/components/StatusBadge";
import { AlertTriangle, CheckCircle2, DollarSign, TrendingUp, Clock, Wallet, Users } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { safeFormat } from "@/lib/safeFormat";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  AggregateMode,
  AggregateModeSelector,
  calculateTableAggregate,
  TablePaginationControls,
} from "@/components/TableControls";
import PayoutReportPage from "./PayoutReportPage";
import TransactionReportingPage from "./TransactionReportingPage";
import CommissionExceptionsPage from "./CommissionExceptionsPage";

function formatAggregateCurrency(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatAggregatePercentage(value: number) {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

// ─── Agent View ───────────────────────────────────────────────────────────────
function AgentCommissionView({ hideHeader }: { hideHeader?: boolean } = {}) {
  const [, navigate] = useLocation();
  const [paidFilter, setPaidFilter] = useState<boolean | undefined>(undefined);
  const currentYear = new Date().getFullYear();
  const [yearFilter, setYearFilter] = useState<string>(String(currentYear));
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [myPayoutAggregateMode, setMyPayoutAggregateMode] = usePersistentState<AggregateMode>("commissions.myPayouts.aggregateMode", "sum");
  const [myPayoutPage, setMyPayoutPage] = usePersistentState("commissions.myPayouts.page", 1);
  const [myPayoutLimit, setMyPayoutLimit] = usePersistentState<number>("commissions.myPayouts.limit", 25);
  const [myTransactionAggregateMode, setMyTransactionAggregateMode] = usePersistentState<AggregateMode>("commissions.myTransactions.aggregateMode", "sum");
  const [myTransactionPage, setMyTransactionPage] = usePersistentState("commissions.myTransactions.page", 1);
  const [myTransactionLimit, setMyTransactionLimit] = usePersistentState<number>("commissions.myTransactions.limit", 25);

  // Build year options: current year back 5 years + "All Time"
  const yearOptions = ["all", ...Array.from({ length: 6 }, (_, i) => String(currentYear - i))];

  // When year filter changes, reset custom date range
  function handleYearChange(y: string) {
    setYearFilter(y);
    setDateFrom("");
    setDateTo("");
    setMyPayoutPage(1);
  }

  const { data: transactionsData } = trpc.transactions.list.useQuery({ limit: 100 });
  const { data: myTransactionsData } = trpc.transactions.list.useQuery({
    page: myTransactionPage,
    limit: myTransactionLimit,
  });
  const transactions = transactionsData?.rows ?? [];
  const myTransactions = myTransactionsData?.rows ?? [];
  const myTransactionsTotal = myTransactionsData?.total ?? 0;
  const { data: myPayouts } = trpc.payouts.myPayouts.useQuery(
    paidFilter !== undefined ? { paid: paidFilter } : {}
  );

  // Filter payouts by year or custom date range (closing date on the transaction)
  const filteredPayouts = (myPayouts ?? []).filter((r) => {
    const closingDate = r.transaction?.closingDate;
    if (!closingDate) return yearFilter === "all" && !dateFrom && !dateTo;
    const d = new Date(closingDate);
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
    if (!dateFrom && !dateTo && yearFilter !== "all") {
      return d.getFullYear() === Number(yearFilter);
    }
    return true;
  });

  const closedTx = (transactions ?? []).filter((r) => {
    if (r.transaction.status !== "closed") return false;
    const closingDate = r.transaction.closingDate;
    if (!closingDate) return yearFilter === "all" && !dateFrom && !dateTo;
    const d = new Date(closingDate);
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
    if (!dateFrom && !dateTo && yearFilter !== "all") {
      return d.getFullYear() === Number(yearFilter);
    }
    return true;
  });
  const totalGCI = closedTx.reduce((sum, r) => sum + Number(r.transaction.grossCommissionIncome ?? 0), 0);

  const totalEarned = filteredPayouts.reduce((sum, r) => {
    if (!r.transaction?.grossCommissionIncome || !r.payout.percentage) return sum;
    return sum + (Number(r.transaction.grossCommissionIncome) * Number(r.payout.percentage) / 100);
  }, 0);

  const paidPayouts = filteredPayouts.filter((r) => r.payout.isPaid);
  const unpaidPayouts = filteredPayouts.filter((r) => !r.payout.isPaid);
  const totalPaid = paidPayouts.reduce((sum, r) => {
    if (!r.transaction?.grossCommissionIncome || !r.payout.percentage) return sum;
    return sum + (Number(r.transaction.grossCommissionIncome) * Number(r.payout.percentage) / 100);
  }, 0);
  const totalPending = totalEarned - totalPaid;
  const myPayoutTotalPages = Math.max(1, Math.ceil(filteredPayouts.length / myPayoutLimit));
  const currentMyPayoutPage = Math.min(Math.max(myPayoutPage, 1), myPayoutTotalPages);
  const visibleMyPayouts = filteredPayouts.slice(
    (currentMyPayoutPage - 1) * myPayoutLimit,
    currentMyPayoutPage * myPayoutLimit,
  );

  return (
    <div>
      {!hideHeader && (
        <PageHeader
          title="My Commission"
          subtitle="Your personal earnings, payout splits, and payment status"
        />
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Earned to Date</p>
                <p className="text-2xl font-bold text-foreground mt-1">${totalEarned.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                <p className="text-xs text-muted-foreground mt-0.5">GCI × split % across {myPayouts?.length ?? 0} transactions</p>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-50">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Paid Out</p>
                <p className="text-2xl font-bold text-foreground mt-1">${totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{paidPayouts.length} payments received</p>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-50">
                <Wallet className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={totalPending > 0 ? "border-amber-200" : ""}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Payment</p>
                <p className={`text-2xl font-bold mt-1 ${totalPending > 0 ? "text-amber-600" : "text-foreground"}`}>
                  ${totalPending.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{unpaidPayouts.length} awaiting payment</p>
              </div>
              <div className={`p-2.5 rounded-lg ${totalPending > 0 ? "bg-amber-50" : "bg-gray-50"}`}>
                <Clock className={`h-5 w-5 ${totalPending > 0 ? "text-amber-600" : "text-gray-400"}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Year filter */}
        <select
          value={yearFilter}
          onChange={(e) => handleYearChange(e.target.value)}
          className="h-8 rounded-full border border-input bg-background px-3 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y === "all" ? "All Time" : y}</option>
          ))}
        </select>

        <div className="h-4 w-px bg-border" />

        {/* Custom date range */}
        <span className="text-xs text-muted-foreground">or custom range:</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setYearFilter("all"); setMyPayoutPage(1); }}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          title="Closing date from"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setYearFilter("all"); setMyPayoutPage(1); }}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          title="Closing date to"
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); setYearFilter(String(currentYear)); setMyPayoutPage(1); }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear
          </button>
        )}

        <div className="h-4 w-px bg-border" />

        {/* Paid/Pending pills */}
        {[
          { label: "All Payouts", value: undefined },
          { label: "Paid", value: true },
          { label: "Pending", value: false },
        ].map((opt) => (
          <button
            key={String(opt.value)}
            onClick={() => { setPaidFilter(opt.value); setMyPayoutPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              paidFilter === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* My Payout Items Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">My Payout Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Transaction</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Contact</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Role / Description</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Split %</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Amount</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {!filteredPayouts || filteredPayouts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground">
                      <Wallet className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>No payout records found</p>
                      <p className="text-xs mt-1">Your commission splits will appear here once transactions are created</p>
                    </td>
                  </tr>
                ) : (
                  visibleMyPayouts.map(({ payout, transaction, contact }) => {
                    const amount = transaction?.grossCommissionIncome && payout.percentage
                      ? Number(transaction.grossCommissionIncome) * Number(payout.percentage) / 100
                      : null;
                    return (
                      <tr key={payout.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="py-3 px-4">
                          <p className="font-medium text-foreground">{transaction?.transactionNumber ?? "—"}</p>
                          <p className="text-xs text-muted-foreground capitalize">{transaction?.transactionType}</p>
                        </td>
                        <td className="py-3 px-4">{contact?.firstName} {contact?.lastName}</td>
                        <td className="py-3 px-4 text-muted-foreground">{payout.notes ?? payout.payeeName ?? payout.payeeType ?? "—"}</td>
                        <td className="py-3 px-4 text-right font-medium">{payout.percentage ? `${Number(payout.percentage).toFixed(2)}%` : "—"}</td>
                        <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                          {amount != null ? `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                        </td>
                        <td className="py-3 px-4">
                          {payout.isPaid ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Paid
                              {payout.paidDate && (
                                <span className="text-muted-foreground font-normal ml-1">
                                  {safeFormat(payout.paidDate, "MMM d")}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                              <Clock className="h-3.5 w-3.5" />
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {transaction?.id && (
                            <Button size="sm" variant="ghost" onClick={() => navigate(`/transactions/${transaction.id}`)}>
                              View
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {visibleMyPayouts.length > 0 && (
                <tfoot className="border-t bg-muted/50">
                  <tr>
                    <td colSpan={3} className="py-2 px-4">
                      <AggregateModeSelector
                        mode={myPayoutAggregateMode}
                        onModeChange={setMyPayoutAggregateMode}
                      />
                    </td>
                    <td className="py-2 px-4 text-right font-semibold text-sm">
                      {calculateTableAggregate(
                        visibleMyPayouts.map(({ payout }) => Number(payout.percentage ?? 0)),
                        myPayoutAggregateMode,
                        formatAggregatePercentage,
                      )}
                    </td>
                    <td className="py-2 px-4 text-right font-semibold text-sm text-emerald-700">
                      {calculateTableAggregate(
                        visibleMyPayouts.map(({ payout, transaction }) => (
                          Number(transaction?.grossCommissionIncome ?? 0) * Number(payout.percentage ?? 0) / 100
                        )),
                        myPayoutAggregateMode,
                        formatAggregateCurrency,
                      )}
                    </td>
                    <td colSpan={2} className="py-2 px-4 text-xs text-muted-foreground">
                      {visibleMyPayouts.length} row{visibleMyPayouts.length !== 1 ? "s" : ""} (this page)
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      <TablePaginationControls
        totalRows={filteredPayouts.length}
        page={currentMyPayoutPage}
        pageSize={myPayoutLimit}
        itemLabel="payout"
        onPageChange={setMyPayoutPage}
        onPageSizeChange={(pageSize) => { setMyPayoutLimit(pageSize); setMyPayoutPage(1); }}
      />

      {/* My Transactions Summary */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">My Transactions</h3>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Transaction</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Contact</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">GCI</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Closing</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {myTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">No transactions yet</td>
                  </tr>
                ) : (
                  myTransactions.map(({ transaction, contact }) => (
                    <tr key={transaction.id} className="border-b last:border-0 hover:bg-muted/20 cursor-pointer" onClick={() => navigate(`/transactions/${transaction.id}`)}>
                      <td className="py-3 px-4">
                        <p className="font-medium text-foreground">{transaction.transactionNumber}</p>
                        <p className="text-xs text-muted-foreground capitalize">{transaction.transactionType}</p>
                      </td>
                      <td className="py-3 px-4">{contact?.firstName} {contact?.lastName}</td>
                      <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                        {transaction.grossCommissionIncome ? `$${Number(transaction.grossCommissionIncome).toLocaleString()}` : "—"}
                      </td>
                      <td className="py-3 px-4"><TransactionStatusBadge status={transaction.status} /></td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {transaction.closingDate ? safeFormat(transaction.closingDate, "MMM d, yyyy") : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/transactions/${transaction.id}`); }}>View</Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {myTransactions.length > 0 && (
                <tfoot className="border-t bg-muted/50">
                  <tr>
                    <td colSpan={2} className="py-2 px-4">
                      <AggregateModeSelector
                        mode={myTransactionAggregateMode}
                        onModeChange={setMyTransactionAggregateMode}
                      />
                    </td>
                    <td className="py-2 px-4 text-right font-semibold text-sm text-emerald-700">
                      {calculateTableAggregate(
                        myTransactions.map(({ transaction }) => Number(transaction.grossCommissionIncome ?? 0)),
                        myTransactionAggregateMode,
                        formatAggregateCurrency,
                      )}
                    </td>
                    <td colSpan={3} className="py-2 px-4 text-xs text-muted-foreground">
                      {myTransactions.length} row{myTransactions.length !== 1 ? "s" : ""} (this page)
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </CardContent>
        </Card>
        <TablePaginationControls
          totalRows={myTransactionsTotal}
          page={myTransactionPage}
          pageSize={myTransactionLimit}
          itemLabel="transaction"
          onPageChange={setMyTransactionPage}
          onPageSizeChange={(pageSize) => { setMyTransactionLimit(pageSize); setMyTransactionPage(1); }}
        />
      </div>
    </div>
  );
}

// ─── Admin / ISA View ─────────────────────────────────────────────────────────
function AdminCommissionView() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const defaultTab = params.get("tab") ?? "accounting";
  const { data: transactionsData } = trpc.transactions.list.useQuery({ limit: 100 });
  const transactions = transactionsData?.rows ?? [];

  const flagged = (transactions ?? []).filter((r) => r.transaction.payoutIntegrityFlag);
  const closed = (transactions ?? []).filter((r) => r.transaction.status === "closed");
  const totalGCI = closed.reduce((sum, r) => sum + Number(r.transaction.grossCommissionIncome ?? 0), 0);

  // Badge counts
  const { data: exceptionsData } = trpc.commissionExceptions.listAll.useQuery();
  const pendingExceptionsCount = (exceptionsData ?? []).filter((e: any) => e.status === "pending").length;
  const { data: payoutsData } = trpc.payouts.listAll.useQuery({ paid: false });
  const unpaidPayoutsCount = (payoutsData ?? []).length;
  const flaggedTxCount = flagged.length;

  return (
    <div>
      <PageHeader
        title="Commission & Payouts"
        subtitle="Commission accounting, payout reports, transaction reporting, and exceptions"
      />
      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="accounting">Commission Accounting</TabsTrigger>
          <TabsTrigger value="payouts" className="gap-1.5">
            Payout Report
            {unpaidPayoutsCount > 0 && (
              <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">{unpaidPayoutsCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="reporting" className="gap-1.5">
            Transaction Reporting
            {flaggedTxCount > 0 && (
              <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">{flaggedTxCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="exceptions" className="gap-1.5">
            Exceptions
            {pendingExceptionsCount > 0 && (
              <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">{pendingExceptionsCount}</span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="payouts"><PayoutReportPage /></TabsContent>
        <TabsContent value="reporting"><TransactionReportingPage /></TabsContent>
        <TabsContent value="exceptions"><CommissionExceptionsPage /></TabsContent>
        <TabsContent value="accounting">

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total GCI (Closed)</p>
                <p className="text-2xl font-bold text-foreground mt-1">${totalGCI.toLocaleString()}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-50">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Closed Transactions</p>
                <p className="text-2xl font-bold text-foreground mt-1">{closed.length}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-50">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={flagged.length > 0 ? "border-red-300" : ""}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Integrity Flags</p>
                <p className={`text-2xl font-bold mt-1 ${flagged.length > 0 ? "text-red-600" : "text-foreground"}`}>{flagged.length}</p>
              </div>
              <div className={`p-2.5 rounded-lg ${flagged.length > 0 ? "bg-red-50" : "bg-gray-50"}`}>
                <AlertTriangle className={`h-5 w-5 ${flagged.length > 0 ? "text-red-600" : "text-gray-400"}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Flagged Transactions */}
      {flagged.length > 0 && (
        <Card className="border-red-200 bg-red-50 mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Commission Integrity Issues
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {flagged.map(({ transaction, contact }) => (
                <div key={transaction.id} className="flex items-center justify-between p-2 bg-white rounded border border-red-200">
                  <div>
                    <p className="text-sm font-medium text-red-800">{transaction.transactionNumber}</p>
                    <p className="text-xs text-red-600">{transaction.payoutIntegrityNote}</p>
                    <p className="text-xs text-muted-foreground">{contact?.firstName} {contact?.lastName}</p>
                  </div>
                  <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100" onClick={() => navigate(`/transactions/${transaction.id}`)}>
                    Fix
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No flagged transactions — show a clean state message */}
      {flagged.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
            <p className="text-sm font-medium">No integrity issues found</p>
            <p className="text-xs mt-1">All commission splits are valid. Use the Payout Report for a full payout listing.</p>
          </CardContent>
        </Card>
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Group Leader Tab (embedded in CommissionPage) ──────────────────────────────────────────
function GroupLeaderTab() {
  const [, navigate] = useLocation();
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [groupPayoutAggregateMode, setGroupPayoutAggregateMode] = usePersistentState<AggregateMode>("commissions.groupPayouts.aggregateMode", "sum");
  const [groupPayoutPage, setGroupPayoutPage] = usePersistentState("commissions.groupPayouts.page", 1);
  const [groupPayoutLimit, setGroupPayoutLimit] = usePersistentState<number>("commissions.groupPayouts.limit", 25);
  const filterParam = paidFilter === "all" ? undefined : paidFilter === "paid";
  const { data, isLoading } = trpc.payouts.groupLeaderPayouts.useQuery(
    filterParam !== undefined ? { paid: filterParam } : {}
  );
  const payouts = data?.payouts ?? [];
  const groupPayoutTotalPages = Math.max(1, Math.ceil(payouts.length / groupPayoutLimit));
  const currentGroupPayoutPage = Math.min(Math.max(groupPayoutPage, 1), groupPayoutTotalPages);
  const visibleGroupPayouts = payouts.slice(
    (currentGroupPayoutPage - 1) * groupPayoutLimit,
    currentGroupPayoutPage * groupPayoutLimit,
  );
  const group = data?.group;
  const members = data?.members ?? [];
  const totalEarned = payouts.reduce((sum, r) => sum + Number(r.payout.amount ?? 0), 0);
  const paidPayouts = payouts.filter((r) => r.payout.isPaid);
  const unpaidPayouts = payouts.filter((r) => !r.payout.isPaid);
  const totalPaid = paidPayouts.reduce((sum, r) => sum + Number(r.payout.amount ?? 0), 0);
  const totalPending = totalEarned - totalPaid;

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading group leader commissions...</div>;
  if (!group) return (
    <Card><CardContent className="py-10 text-center text-muted-foreground">
      <p className="text-sm">You are not assigned as a leader of any group.</p>
      <p className="text-xs mt-1">Contact your admin if you believe this is an error.</p>
    </CardContent></Card>
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{group.name} — {group.leaderCommissionSplit ?? 0}% leader split</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-5">
          <p className="text-sm text-muted-foreground">Total Earned</p>
          <p className="text-2xl font-bold mt-1">${totalEarned.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{payouts.length} payouts</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm text-muted-foreground">Paid Out</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600">${totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{paidPayouts.length} transactions</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-sm text-muted-foreground">Pending</p>
          <p className="text-2xl font-bold mt-1 text-amber-600">${totalPending.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{unpaidPayouts.length} pending</p>
        </CardContent></Card>
      </div>

      <div className="flex items-center gap-2">
        {(["all", "paid", "unpaid"] as const).map((f) => (
          <button key={f} onClick={() => { setPaidFilter(f); setGroupPayoutPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              paidFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}>
            {f === "all" ? `All (${payouts.length})` : f === "paid" ? `Paid (${paidPayouts.length})` : `Pending (${unpaidPayouts.length})`}
          </button>
        ))}
      </div>

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="border-b bg-muted/30"><tr>
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">Transaction</th>
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">Agent</th>
            <th className="text-right py-3 px-4 text-muted-foreground font-medium">Amount</th>
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
            <th className="py-3 px-4"></th>
          </tr></thead>
          <tbody>
            {payouts.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">No group leader payouts found</td></tr>
            ) : (
              visibleGroupPayouts.map(({ payout, transaction, agent }) => (
                <tr key={payout.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="py-3 px-4">
                    <p className="font-medium">{(transaction as any)?.transactionNumber ?? "—"}</p>
                    <p className="text-xs text-muted-foreground capitalize">{(transaction as any)?.transactionType}</p>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{(agent as any)?.firstName} {(agent as any)?.lastName}</td>
                  <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                    {payout.amount != null ? `$${Number(payout.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                  </td>
                  <td className="py-3 px-4">
                    {payout.isPaid
                      ? <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium"><CheckCircle2 className="h-3.5 w-3.5" />Paid</span>
                      : <span className="flex items-center gap-1 text-xs text-amber-600 font-medium"><Clock className="h-3.5 w-3.5" />Pending</span>}
                  </td>
                  <td className="py-3 px-4">
                    {(transaction as any)?.id && (
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/transactions/${(transaction as any).id}`)}>View</Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {visibleGroupPayouts.length > 0 && (
            <tfoot className="border-t bg-muted/50">
              <tr>
                <td colSpan={2} className="py-2 px-4">
                  <AggregateModeSelector
                    mode={groupPayoutAggregateMode}
                    onModeChange={setGroupPayoutAggregateMode}
                  />
                </td>
                <td className="py-2 px-4 text-right font-semibold text-sm text-emerald-700">
                  {calculateTableAggregate(
                    visibleGroupPayouts.map(({ payout }) => Number(payout.amount ?? 0)),
                    groupPayoutAggregateMode,
                    formatAggregateCurrency,
                  )}
                </td>
                <td colSpan={2} className="py-2 px-4 text-xs text-muted-foreground">
                  {visibleGroupPayouts.length} row{visibleGroupPayouts.length !== 1 ? "s" : ""} (this page)
                </td>
              </tr>
            </tfoot>
          )}
        </table></div>
      </CardContent></Card>

      <TablePaginationControls
        totalRows={payouts.length}
        page={currentGroupPayoutPage}
        pageSize={groupPayoutLimit}
        itemLabel="payout"
        onPageChange={setGroupPayoutPage}
        onPageSizeChange={(pageSize) => { setGroupPayoutLimit(pageSize); setGroupPayoutPage(1); }}
      />

      <div>
        <h3 className="text-sm font-semibold mb-3">Group Members ({members.length})</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {members.map((m: any) => (
            <Card key={m.id}><CardContent className="p-4">
              <p className="font-medium text-sm">{m.firstName} {m.lastName}</p>
              <p className="text-xs text-muted-foreground">{m.email}</p>
            </CardContent></Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Root export: role-aware switch ──────────────────────────────────────────────
export default function CommissionPage() {
  const { user } = useAuth();
  const { data: leaderCheck } = trpc.groups.isGroupLeader.useQuery(
    undefined,
    { enabled: (user as any)?.role === "agent" }
  );
  const isAgent = (user as any)?.role === "agent";
  const isGroupLeader = isAgent && leaderCheck?.isLeader;

  if (isAgent) {
    if (!isGroupLeader) return <AgentCommissionView />;
    // Agent who is also a group leader: show tabs
    return (
      <div>
        <PageHeader
          title="My Commission"
          subtitle="Your personal earnings and group leader payouts"
        />
        <Tabs defaultValue="my-commission" className="space-y-6">
          <TabsList>
            <TabsTrigger value="my-commission">My Commission</TabsTrigger>
            <TabsTrigger value="group-leader">Group Leader</TabsTrigger>
          </TabsList>
          <TabsContent value="my-commission"><AgentCommissionView hideHeader /></TabsContent>
          <TabsContent value="group-leader"><GroupLeaderTab /></TabsContent>
        </Tabs>
      </div>
    );
  }
  return <AdminCommissionView />;
}