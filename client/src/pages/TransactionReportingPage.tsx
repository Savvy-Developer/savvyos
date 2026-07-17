import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import { useLocation } from "wouter";
import { safeFormat } from "@/lib/safeFormat";
import { toast } from "sonner";
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
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Filter,
  History,
  Loader2,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  under_contract: "bg-amber-100 text-amber-700",
  closed: "bg-emerald-100 text-emerald-700",
  terminated: "bg-red-100 text-red-700",
};

type StatusFilter = "all" | "under_contract" | "closed" | "terminated";
type TypeFilter = "all" | "buyer" | "seller" | "dual";

const formatCurrency = (value: string | number | null | undefined) => {
  if (!value) return "—";
  const amount = typeof value === "string" ? Number.parseFloat(value) : value;
  if (Number.isNaN(amount)) return "—";
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
};

function triggerCsvDownload(csv: string, fileName: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function TransactionReportingPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState("all");
  const [leadSourceFilter, setLeadSourceFilter] = useState("all");
  const [contractDateFrom, setContractDateFrom] = useState("");
  const [contractDateTo, setContractDateTo] = useState("");
  const [closingDateFrom, setClosingDateFrom] = useState("");
  const [closingDateTo, setClosingDateTo] = useState("");
  const [flagNoClosingDate, setFlagNoClosingDate] = useState(false);
  const [flagPastClosingDate, setFlagPastClosingDate] = useState(false);
  const [flagPayoutIntegrity, setFlagPayoutIntegrity] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const limit = 50;
  const historyLimit = 15;

  const { data: agents = [] } = trpc.users.list.useQuery({ role: "agent" });
  const { data: markets = [] } = trpc.markets.list.useQuery();
  const { data: leadSourcesData = [] } = trpc.leadSources.list.useQuery();
  const leadSources = (leadSourcesData as any[]).map((row: any) => row.ls ?? row);

  const exportInput = useMemo(() => ({
    search: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    transactionType: typeFilter === "all" ? undefined : typeFilter,
    agentId: agentFilter === "all" ? undefined : Number(agentFilter),
    marketId: marketFilter === "all" ? undefined : Number(marketFilter),
    leadSourceId: leadSourceFilter === "all" ? undefined : Number(leadSourceFilter),
    contractDateFrom: contractDateFrom || undefined,
    contractDateTo: contractDateTo || undefined,
    closingDateFrom: closingDateFrom || undefined,
    closingDateTo: closingDateTo || undefined,
    flagNoClosingDate: flagNoClosingDate || undefined,
    flagPastClosingDate: flagPastClosingDate || undefined,
    flagPayoutIntegrity: flagPayoutIntegrity || undefined,
    sortOrder: "desc" as const,
    sortBy: "closing_date" as const,
  }), [search, statusFilter, typeFilter, agentFilter, marketFilter, leadSourceFilter, contractDateFrom, contractDateTo, closingDateFrom, closingDateTo, flagNoClosingDate, flagPastClosingDate, flagPayoutIntegrity]);

  const queryInput = useMemo(() => ({ ...exportInput, page, limit }), [exportInput, page]);
  const { data: txData, isLoading } = trpc.transactions.list.useQuery(queryInput);
  const rows = txData?.rows ?? [];
  const total = txData?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const { data: historyData, isLoading: historyLoading } = trpc.transactions.exportHistory.useQuery({
    page: historyPage,
    limit: historyLimit,
  });
  const historyRows = historyData?.rows ?? [];
  const historyTotal = historyData?.total ?? 0;
  const historyPages = Math.ceil(historyTotal / historyLimit);

  const exportCsv = trpc.transactions.exportCsv.useMutation({
    onSuccess: async (result) => {
      triggerCsvDownload(result.csv, result.fileName);
      await utils.transactions.exportHistory.invalidate();
      toast.success(`${result.rowCount.toLocaleString()} transaction${result.rowCount === 1 ? "" : "s"} exported`);
    },
    onError: (error) => toast.error(error.message || "Transaction export failed"),
  });

  const hasActiveFilters = statusFilter !== "all" || typeFilter !== "all" || agentFilter !== "all" ||
    marketFilter !== "all" || leadSourceFilter !== "all" || Boolean(contractDateFrom) || Boolean(contractDateTo) ||
    Boolean(closingDateFrom) || Boolean(closingDateTo) || flagNoClosingDate || flagPastClosingDate ||
    flagPayoutIntegrity || Boolean(search);

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
    setAgentFilter("all");
    setMarketFilter("all");
    setLeadSourceFilter("all");
    setContractDateFrom("");
    setContractDateTo("");
    setClosingDateFrom("");
    setClosingDateTo("");
    setFlagNoClosingDate(false);
    setFlagPastClosingDate(false);
    setFlagPayoutIntegrity(false);
    setPage(1);
  }

  const resetPage = () => setPage(1);

  return (
    <div>
      <PageHeader
        title="Transaction Export Center"
        subtitle="Filter, review, and export transaction records with a complete admin audit trail."
      />

      <Tabs defaultValue="export" className="space-y-5">
        <TabsList>
          <TabsTrigger value="export" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Export Transactions
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" /> Export History
            {historyTotal > 0 && <Badge variant="secondary" className="ml-1">{historyTotal}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="export" className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">1</span>
                      Filter the transaction dataset
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">The preview and downloaded file use the same filters.</p>
                  </div>
                  <div className="flex gap-2">
                    {hasActiveFilters && (
                      <Button variant="ghost" size="sm" onClick={clearFilters}>
                        <X className="mr-1 h-4 w-4" /> Clear
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setShowFilters((value) => !value)}>
                      <Filter className="mr-1 h-4 w-4" /> {showFilters ? "Hide" : "Show"} filters
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {showFilters && (
                <CardContent className="space-y-5 border-t pt-5">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => { setSearch(event.target.value); resetPage(); }}
                      placeholder="Search transaction number, contact, city, or property address"
                      className="pl-9"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value as StatusFilter); resetPage(); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All statuses</SelectItem>
                          <SelectItem value="under_contract">Under Contract</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                          <SelectItem value="terminated">Terminated</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Transaction type</Label>
                      <Select value={typeFilter} onValueChange={(value) => { setTypeFilter(value as TypeFilter); resetPage(); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All types</SelectItem>
                          <SelectItem value="buyer">Buyer</SelectItem>
                          <SelectItem value="seller">Seller</SelectItem>
                          <SelectItem value="dual">Dual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Agent</Label>
                      <Select value={agentFilter} onValueChange={(value) => { setAgentFilter(value); resetPage(); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All agents</SelectItem>
                          {(agents as any[]).map((agent: any) => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Market</Label>
                      <Select value={marketFilter} onValueChange={(value) => { setMarketFilter(value); resetPage(); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All markets</SelectItem>
                          {(markets as any[]).map((market: any) => <SelectItem key={market.id} value={String(market.id)}>{market.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Lead source</Label>
                      <Select value={leadSourceFilter} onValueChange={(value) => { setLeadSourceFilter(value); resetPage(); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All lead sources</SelectItem>
                          {leadSources.map((source: any) => (
                            <SelectItem key={source.id} value={String(source.id)}>
                              {source.parentId ? `↳ ${source.name}` : source.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label>Contract date from</Label>
                      <Input type="date" value={contractDateFrom} onChange={(event) => { setContractDateFrom(event.target.value); resetPage(); }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Contract date to</Label>
                      <Input type="date" value={contractDateTo} onChange={(event) => { setContractDateTo(event.target.value); resetPage(); }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Closing date from</Label>
                      <Input type="date" value={closingDateFrom} onChange={(event) => { setClosingDateFrom(event.target.value); resetPage(); }} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Closing date to</Label>
                      <Input type="date" value={closingDateTo} onChange={(event) => { setClosingDateTo(event.target.value); resetPage(); }} />
                    </div>
                  </div>

                  <div className="grid gap-3 rounded-lg bg-muted/40 p-4 sm:grid-cols-3">
                    <Label className="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-background px-3 py-2.5 shadow-sm">
                      <span className="text-sm">Missing closing date</span>
                      <Switch checked={flagNoClosingDate} onCheckedChange={(checked) => { setFlagNoClosingDate(checked); resetPage(); }} />
                    </Label>
                    <Label className="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-background px-3 py-2.5 shadow-sm">
                      <span className="text-sm">Past-due closing date</span>
                      <Switch checked={flagPastClosingDate} onCheckedChange={(checked) => { setFlagPastClosingDate(checked); resetPage(); }} />
                    </Label>
                    <Label className="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-background px-3 py-2.5 shadow-sm">
                      <span className="text-sm">Payout integrity issue</span>
                      <Switch checked={flagPayoutIntegrity} onCheckedChange={(checked) => { setFlagPayoutIntegrity(checked); resetPage(); }} />
                    </Label>
                  </div>
                </CardContent>
              )}
            </Card>

            <Card className="h-fit border-primary/20 bg-primary/[0.03]">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">2</span>
                  Export filtered records
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-background p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ready to export</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">{isLoading ? "—" : total.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">matching transaction{total === 1 ? "" : "s"}</p>
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Exports every matching record, not only this preview page.</p>
                  <p className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Exporter, filters, exact transaction IDs, and record count are audited.</p>
                </div>
                <Button className="w-full" disabled={isLoading || total === 0 || exportCsv.isPending} onClick={() => exportCsv.mutate(exportInput)}>
                  {exportCsv.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  {exportCsv.isPending ? "Preparing CSV…" : `Export ${total.toLocaleString()} to CSV`}
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Filtered preview</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Review up to 50 records per page before exporting the full result set.</p>
                </div>
                {hasActiveFilters && <Badge variant="secondary">Filters applied</Badge>}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transaction</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">GCI</TableHead>
                      <TableHead>Closing Date</TableHead>
                      <TableHead>Flags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={10} className="py-12 text-center text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading preview…</TableCell></TableRow>
                    ) : rows.length === 0 ? (
                      <TableRow><TableCell colSpan={10} className="py-12 text-center text-muted-foreground">No transactions match the selected filters.</TableCell></TableRow>
                    ) : rows.map((row: any) => {
                      const missingClosing = !row.transaction.closingDate;
                      const pastClosing = row.transaction.closingDate && new Date(row.transaction.closingDate) < new Date() && !["closed", "terminated"].includes(row.transaction.status);
                      return (
                        <TableRow key={row.transaction.id} className="cursor-pointer" onClick={() => navigate(`/transactions/${row.transaction.id}`)}>
                          <TableCell className="font-medium">{row.transaction.transactionNumber || `#${row.transaction.id}`}</TableCell>
                          <TableCell>{row.property?.address || "—"}</TableCell>
                          <TableCell><Badge variant="secondary" className={STATUS_COLORS[row.transaction.status] || ""}>{row.transaction.status.replace(/_/g, " ")}</Badge></TableCell>
                          <TableCell className="capitalize">{row.transaction.transactionType}</TableCell>
                          <TableCell>{row.agent?.name || "—"}</TableCell>
                          <TableCell>{row.contact ? `${row.contact.firstName} ${row.contact.lastName}` : "—"}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.transaction.purchasePrice)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(row.transaction.grossCommissionIncome)}</TableCell>
                          <TableCell>{safeFormat(row.transaction.closingDate, "MMM d, yyyy")}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {missingClosing && <Badge variant="outline" className="border-amber-300 text-amber-700"><AlertTriangle className="mr-1 h-3 w-3" />No close</Badge>}
                              {pastClosing && <Badge variant="outline" className="border-red-300 text-red-700"><AlertTriangle className="mr-1 h-3 w-3" />Overdue</Badge>}
                              {row.transaction.payoutIntegrityFlag && <Badge variant="outline" className="border-purple-300 text-purple-700">Payout</Badge>}
                              {!missingClosing && !pastClosing && !row.transaction.payoutIntegrityFlag && "—"}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <span className="text-xs text-muted-foreground">Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="px-3 text-sm">{page} / {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transaction export audit history</CardTitle>
              <p className="text-sm text-muted-foreground">A permanent record of who exported which filtered transaction set and how many records were included.</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exported</TableHead>
                      <TableHead>Exported by</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Applied filters</TableHead>
                      <TableHead className="text-right">Transactions</TableHead>
                      <TableHead>Format</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyLoading ? (
                      <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading export history…</TableCell></TableRow>
                    ) : historyRows.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">No transaction exports have been created yet.</TableCell></TableRow>
                    ) : historyRows.map((row: any) => (
                      <TableRow key={row.export.id}>
                        <TableCell className="whitespace-nowrap">
                          <div className="font-medium">{safeFormat(row.export.createdAt, "MMM d, yyyy")}</div>
                          <div className="text-xs text-muted-foreground">{safeFormat(row.export.createdAt, "h:mm a")}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{row.exportedBy?.name || "Unknown admin"}</div>
                          <div className="text-xs text-muted-foreground">{row.exportedBy?.email || "—"}</div>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate font-mono text-xs">{row.export.fileName}</TableCell>
                        <TableCell className="min-w-[320px] max-w-[520px] text-sm text-muted-foreground">{row.export.filterSummary}</TableCell>
                        <TableCell className="text-right text-base font-semibold tabular-nums">{Number(row.export.rowCount).toLocaleString()}</TableCell>
                        <TableCell><Badge variant="outline" className="uppercase">{row.export.format}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {historyPages > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <span className="text-xs text-muted-foreground">Showing {(historyPage - 1) * historyLimit + 1}–{Math.min(historyPage * historyLimit, historyTotal)} of {historyTotal}</span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="px-3 text-sm">{historyPage} / {historyPages}</span>
                    <Button variant="outline" size="sm" disabled={historyPage >= historyPages} onClick={() => setHistoryPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
