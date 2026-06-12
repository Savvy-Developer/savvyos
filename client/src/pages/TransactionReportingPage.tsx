import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import PageHeader from "@/components/PageHeader";
import { useLocation } from "wouter";
import { safeFormat } from "@/lib/safeFormat";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Search,
  X,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-100 text-blue-700",
  under_contract: "bg-amber-100 text-amber-700",
  closed: "bg-emerald-100 text-emerald-700",
  terminated: "bg-red-100 text-red-700",
};

const formatCurrency = (val: string | number | null | undefined) => {
  if (!val) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export default function TransactionReportingPage() {
  const [, navigate] = useLocation();

  // Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState("all");
  const [contractDateFrom, setContractDateFrom] = useState("");
  const [contractDateTo, setContractDateTo] = useState("");
  const [closingDateFrom, setClosingDateFrom] = useState("");
  const [closingDateTo, setClosingDateTo] = useState("");
  const [flagNoClosingDate, setFlagNoClosingDate] = useState(false);
  const [flagPastClosingDate, setFlagPastClosingDate] = useState(false);
  const [flagPayoutIntegrity, setFlagPayoutIntegrity] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  // Pre-apply payout integrity filter if navigated from nav badge
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("flagged") === "1") {
      setFlagPayoutIntegrity(true);
    }
  }, []);
  const limit = 50;

  // Data queries
  const { data: agents = [] } = trpc.users.list.useQuery({ role: "agent" });
  const { data: markets = [] } = trpc.markets.list.useQuery();

  const queryInput = useMemo(() => ({
    page,
    limit,
    search: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    agentId: agentFilter === "all" ? undefined : Number(agentFilter),
    marketId: marketFilter === "all" ? undefined : Number(marketFilter),
    contractDateFrom: contractDateFrom || undefined,
    contractDateTo: contractDateTo || undefined,
    closingDateFrom: closingDateFrom || undefined,
    closingDateTo: closingDateTo || undefined,
    flagNoClosingDate: flagNoClosingDate || undefined,
    flagPastClosingDate: flagPastClosingDate || undefined,
    flagPayoutIntegrity: flagPayoutIntegrity || undefined,
  }), [page, search, statusFilter, agentFilter, marketFilter, contractDateFrom, contractDateTo, closingDateFrom, closingDateTo, flagNoClosingDate, flagPastClosingDate, flagPayoutIntegrity]);

  const { data: txData, isLoading } = trpc.transactions.list.useQuery(queryInput);
  const rows = txData?.rows ?? [];
  const total = txData?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  // Count flags
  const noClosingDateCount = rows.filter((r: any) => !r.transaction.closingDate).length;
  const pastClosingDateCount = rows.filter((r: any) => {
    if (!r.transaction.closingDate) return false;
    const cd = new Date(r.transaction.closingDate);
    return cd < new Date() && !["closed", "terminated"].includes(r.transaction.status);
  }).length;

  const hasActiveFilters = statusFilter !== "all" || agentFilter !== "all" || marketFilter !== "all" ||
    contractDateFrom || contractDateTo || closingDateFrom || closingDateTo || flagNoClosingDate || flagPastClosingDate || flagPayoutIntegrity || search;

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setAgentFilter("all");
    setMarketFilter("all");
    setContractDateFrom("");
    setContractDateTo("");
    setClosingDateFrom("");
    setClosingDateTo("");
    setFlagNoClosingDate(false);
    setFlagPastClosingDate(false);
    setFlagPayoutIntegrity(false);
    setPage(1);
  }

  function exportCsv() {
    const headers = ["Property Address", "Status", "Type", "Agent", "Contact", "Purchase Price", "GCI", "Contract Date", "Closing Date", "Lead Source", "Flags"];
    const csvRows = rows.map((r: any) => {
      const flags = [];
      if (!r.transaction.closingDate) flags.push("No Closing Date");
      if (r.transaction.closingDate && new Date(r.transaction.closingDate) < new Date() && !["closed", "terminated"].includes(r.transaction.status)) flags.push("Past Closing Date");
      return [
        r.property?.address ? `${r.property.address}${r.property.city ? `, ${r.property.city}` : ""}` : "",
        r.transaction.status,
        r.transaction.transactionType,
        r.agent?.name || "—",
        r.contact ? `${r.contact.firstName || ""} ${r.contact.lastName || ""}`.trim() : "—",
        r.transaction.purchasePrice || "",
        r.transaction.grossCommissionIncome || "",
        r.transaction.contractDate ? safeFormat(r.transaction.contractDate, "yyyy-MM-dd") : "",
        r.transaction.closingDate ? safeFormat(r.transaction.closingDate, "yyyy-MM-dd") : "",
        flags.join("; "),
        r.parentLeadSource?.name ? `${r.parentLeadSource.name} › ${r.leadSource?.name || ""}` : (r.leadSource?.name || r.contact?.leadSourceType || ""),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transaction-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Transaction Reporting"
        subtitle={`${total} transaction${total !== 1 ? "s" : ""} found`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4 mr-1" /> {showFilters ? "Hide Filters" : "Filters"}
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
          </div>
        }
      />

      {/* Flag Quick Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <button
          onClick={() => { setFlagNoClosingDate(!flagNoClosingDate); setFlagPastClosingDate(false); setPage(1); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
            flagNoClosingDate ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          No Closing Date
        </button>
        <button
          onClick={() => { setFlagPastClosingDate(!flagPastClosingDate); setFlagNoClosingDate(false); setPage(1); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
            flagPastClosingDate ? "bg-red-100 text-red-800 border-red-300" : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Past Closing Date
        </button>
        <button
          onClick={() => { setFlagPayoutIntegrity(!flagPayoutIntegrity); setFlagNoClosingDate(false); setFlagPastClosingDate(false); setPage(1); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
            flagPayoutIntegrity ? "bg-purple-100 text-purple-800 border-purple-300" : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Payout Integrity Issues
        </button>
        {["all", "under_contract", "closed", "terminated"].map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {s === "all" ? "All Statuses" : s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </button>
        ))}
        {hasActiveFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
            <X className="h-3.5 w-3.5" /> Clear All
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by transaction number, contact name..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <Card className="mb-4">
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs mb-1.5 block">Agent</Label>
                <Select value={agentFilter} onValueChange={(v) => { setAgentFilter(v); setPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="All Agents" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Agents</SelectItem>
                    {(agents as any[]).map((a: any) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Market</Label>
                <Select value={marketFilter} onValueChange={(v) => { setMarketFilter(v); setPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="All Markets" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Markets</SelectItem>
                    {(markets as any[]).map((m: any) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Contract Date From</Label>
                <Input type="date" value={contractDateFrom} onChange={(e) => { setContractDateFrom(e.target.value); setPage(1); }} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Contract Date To</Label>
                <Input type="date" value={contractDateTo} onChange={(e) => { setContractDateTo(e.target.value); setPage(1); }} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Closing Date From</Label>
                <Input type="date" value={closingDateFrom} onChange={(e) => { setClosingDateFrom(e.target.value); setPage(1); }} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Closing Date To</Label>
                <Input type="date" value={closingDateTo} onChange={(e) => { setClosingDateTo(e.target.value); setPage(1); }} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">GCI</TableHead>
                  <TableHead>Contract Date</TableHead>
                  <TableHead>Closing Date</TableHead>
                  <TableHead>Lead Source</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                      No transactions match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r: any) => {
                    const hasNoClosing = !r.transaction.closingDate;
                    const isPastClosing = r.transaction.closingDate &&
                      new Date(r.transaction.closingDate) < new Date() &&
                      !["closed", "terminated"].includes(r.transaction.status);
                    return (
                      <TableRow
                        key={r.transaction.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/transactions/${r.transaction.id}`)}
                      >
                        <TableCell className="font-medium">
                          {r.property?.address
                            ? <span>{r.property.address}{r.property.city ? <span className="text-muted-foreground text-xs">, {r.property.city}</span> : null}</span>
                            : <span className="text-muted-foreground text-xs">No address</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_COLORS[r.transaction.status] || ""}>
                            {r.transaction.status.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                          </Badge>
                        </TableCell>
                        <TableCell className="capitalize">{r.transaction.transactionType}</TableCell>
                        <TableCell>
                          {r.agent ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/agents/${r.agent.id}`); }}
                              className="text-primary hover:underline text-left"
                            >
                              {r.agent.name}
                            </button>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {r.contact ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/contacts/${r.contact.id}`); }}
                              className="text-primary hover:underline text-left"
                            >
                              {r.contact.firstName} {r.contact.lastName}
                            </button>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(r.transaction.purchasePrice)}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          {formatCurrency(r.transaction.grossCommissionIncome)}
                        </TableCell>
                        <TableCell>{safeFormat(r.transaction.contractDate, "MMM d, yyyy")}</TableCell>
                        <TableCell>{safeFormat(r.transaction.closingDate, "MMM d, yyyy")}</TableCell>
                        <TableCell>
                          {r.leadSource?.name ? (
                            <div className="flex items-center gap-1 flex-wrap">
                              {r.parentLeadSource?.name && (
                                <>
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-medium whitespace-nowrap">
                                    {r.parentLeadSource.name}
                                  </span>
                                  <span className="text-muted-foreground text-xs">›</span>
                                </>
                              )}
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-semibold whitespace-nowrap">
                                {r.leadSource.name}
                              </span>
                            </div>
                          ) : r.contact?.leadSourceType ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-medium">
                              {r.contact.leadSourceType.replace(/_/g, ' ')}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {hasNoClosing && (
                              <Badge variant="outline" className="border-amber-300 text-amber-700 text-[10px]">
                                <AlertTriangle className="h-3 w-3 mr-0.5" /> No Close
                              </Badge>
                            )}
                            {isPastClosing && (
                              <Badge variant="outline" className="border-red-300 text-red-700 text-[10px]">
                                <AlertTriangle className="h-3 w-3 mr-0.5" /> Overdue
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-xs text-muted-foreground">
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="flex items-center px-3 text-sm">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
