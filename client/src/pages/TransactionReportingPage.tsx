import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
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

type FilterOption = {
  value: string;
  label: string;
  parentId?: string | null;
};

function ReportingMultiSelect({
  options,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder,
  tree = false,
}: {
  options: FilterOption[];
  value: string[];
  onValueChange: (values: string[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  tree?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const selected = new Set(value);
  const optionValues = new Set(options.map((option) => option.value));
  const selectedOptions = options.filter((option) => selected.has(option.value));
  const normalizedSelection = (next: Iterable<string>) => {
    const nextSet = new Set(next);
    onValueChange(options.filter((option) => nextSet.has(option.value)).map((option) => option.value));
  };
  const toggleOption = (optionValue: string) => {
    const next = new Set(selected);
    if (next.has(optionValue)) next.delete(optionValue);
    else next.add(optionValue);
    normalizedSelection(next);
  };
  const removeOption = (optionValue: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const next = new Set(selected);
    next.delete(optionValue);
    normalizedSelection(next);
  };
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const matches = (option: FilterOption) => !normalizedSearch || option.label.toLowerCase().includes(normalizedSearch);
  const rootOptions = tree
    ? options.filter((option) => !option.parentId || !optionValues.has(option.parentId))
    : [];
  const childrenFor = (option: FilterOption) => options.filter((child) => child.parentId === option.value);
  const visibleOptions = options.filter(matches);

  const checkboxRow = (option: FilterOption, className = "", checked: boolean | "indeterminate" = selected.has(option.value), onCheckedChange?: (checked: boolean) => void) => (
    <label key={option.value} className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted/65", className)}>
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => onCheckedChange ? onCheckedChange(next === true) : toggleOption(option.value)}
        aria-label={option.label}
      />
      <span className="min-w-0 flex-1 break-words leading-snug">{option.label}</span>
    </label>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("min-h-10 h-auto w-full justify-between gap-2 px-3 py-1.5 text-left font-normal", selectedOptions.length === 0 && "text-muted-foreground")}
        >
          <span className="flex min-w-0 flex-1 flex-wrap gap-1">
            {selectedOptions.length === 0 ? <span className="truncate">{placeholder}</span> : selectedOptions.map((option) => (
              <Badge key={option.value} variant="secondary" className="max-w-[190px] gap-1 pr-1 text-xs font-normal">
                <span className="truncate">{option.label}</span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove ${option.label}`}
                  className="cursor-pointer rounded-sm opacity-60 hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring"
                  onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                  onClick={(event) => removeOption(option.value, event)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") removeOption(option.value, event as unknown as React.MouseEvent);
                  }}
                >
                  <X className="h-3 w-3" />
                </span>
              </Badge>
            ))}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(30rem,calc(100vw-2rem))] p-0">
        <div className="border-b p-2">
          <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={searchPlaceholder} className="h-8 text-sm" />
        </div>
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-xs text-muted-foreground">{selectedOptions.length} selected</span>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => normalizedSelection(options.map((option) => option.value))}>Select All</Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={selectedOptions.length === 0} onClick={() => onValueChange([])}>Clear All</Button>
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {!tree && (visibleOptions.length ? visibleOptions.map((option) => checkboxRow(option)) : <p className="px-3 py-8 text-center text-sm text-muted-foreground">No matches found.</p>)}
          {tree && (() => {
            const visibleRoots = rootOptions.filter((parent) => matches(parent) || childrenFor(parent).some(matches));
            if (!visibleRoots.length) return <p className="px-3 py-8 text-center text-sm text-muted-foreground">No sources match your search.</p>;
            return visibleRoots.map((parent) => {
              const branch = [parent, ...childrenFor(parent)];
              const matchedChildren = childrenFor(parent).filter((child) => matches(parent) || matches(child));
              const selectedCount = branch.filter((option) => selected.has(option.value)).length;
              const parentState: boolean | "indeterminate" = selectedCount === 0 ? false : selectedCount === branch.length ? true : "indeterminate";
              return <div key={parent.value} className="border-b last:border-0">
                {checkboxRow(parent, "font-medium", parentState, (checked) => {
                  const next = new Set(selected);
                  branch.forEach((option) => checked ? next.add(option.value) : next.delete(option.value));
                  normalizedSelection(next);
                })}
                {matchedChildren.map((child) => checkboxRow(child, "ml-6 text-muted-foreground"))}
              </div>;
            });
          })()}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function TransactionReportingPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [agentFilters, setAgentFilters] = useState<string[]>([]);
  const [marketFilter, setMarketFilter] = useState("all");
  const [leadSourceFilters, setLeadSourceFilters] = useState<string[]>([]);
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
    agentIds: agentFilters.length ? agentFilters.map(Number) : undefined,
    marketId: marketFilter === "all" ? undefined : Number(marketFilter),
    leadSourceIds: leadSourceFilters.length ? leadSourceFilters.map(Number) : undefined,
    contractDateFrom: contractDateFrom || undefined,
    contractDateTo: contractDateTo || undefined,
    closingDateFrom: closingDateFrom || undefined,
    closingDateTo: closingDateTo || undefined,
    flagNoClosingDate: flagNoClosingDate || undefined,
    flagPastClosingDate: flagPastClosingDate || undefined,
    flagPayoutIntegrity: flagPayoutIntegrity || undefined,
    sortOrder: "desc" as const,
    sortBy: "closing_date" as const,
  }), [search, statusFilter, typeFilter, agentFilters, marketFilter, leadSourceFilters, contractDateFrom, contractDateTo, closingDateFrom, closingDateTo, flagNoClosingDate, flagPastClosingDate, flagPayoutIntegrity]);

  const queryInput = useMemo(() => ({ ...exportInput, page, limit }), [exportInput, page]);
  const { data: txData, isLoading } = trpc.transactions.list.useQuery(queryInput);
  const rows = txData?.rows ?? [];
  const total = txData?.total ?? 0;
  const scopedTotals = txData?.totals ?? { purchasePrice: 0, grossCommission: 0 };
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

  const hasActiveFilters = statusFilter !== "all" || typeFilter !== "all" || agentFilters.length > 0 ||
    marketFilter !== "all" || leadSourceFilters.length > 0 || Boolean(contractDateFrom) || Boolean(contractDateTo) ||
    Boolean(closingDateFrom) || Boolean(closingDateTo) || flagNoClosingDate || flagPastClosingDate ||
    flagPayoutIntegrity || Boolean(search);

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
    setAgentFilters([]);
    setMarketFilter("all");
    setLeadSourceFilters([]);
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
        <TabsList className="flex overflow-x-auto h-auto gap-0 w-full" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          <TabsTrigger value="export" className="shrink-0 whitespace-nowrap gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Export Transactions
          </TabsTrigger>
          <TabsTrigger value="history" className="shrink-0 whitespace-nowrap gap-2">
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
                      <Label>Agents</Label>
                      <ReportingMultiSelect
                        options={(agents as any[]).map((agent: any) => ({ value: String(agent.id), label: agent.name }))}
                        value={agentFilters}
                        onValueChange={(values) => { setAgentFilters(values); resetPage(); }}
                        placeholder="All agents"
                        searchPlaceholder="Search agents…"
                      />
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
                      <Label>Lead sources</Label>
                      <ReportingMultiSelect
                        options={leadSources.map((source: any) => ({ value: String(source.id), label: source.name, parentId: source.parentId ? String(source.parentId) : null }))}
                        value={leadSourceFilters}
                        onValueChange={(values) => { setLeadSourceFilters(values); resetPage(); }}
                        placeholder="All lead sources"
                        searchPlaceholder="Search lead sources…"
                        tree
                      />
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
            <CardContent className="p-0 overflow-x-auto">
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
                  {!isLoading && total > 0 && (
                    <TableFooter>
                      <TableRow className="bg-muted/40 font-semibold">
                        <TableCell colSpan={6}>Total matching records ({total.toLocaleString()})</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(scopedTotals.purchasePrice)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(scopedTotals.grossCommission)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">All pages</TableCell>
                        <TableCell>—</TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
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
            <CardContent className="p-0 overflow-x-auto">
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
