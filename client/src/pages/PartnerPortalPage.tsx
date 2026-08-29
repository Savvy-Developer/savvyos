import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowDownUp, Building2, CheckCircle2, ExternalLink, Filter, Link2, Loader2, LogOut, Mail, RotateCcw, ShieldCheck, Users } from "lucide-react";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";

type LeadSort = "newest" | "oldest" | "name" | "connection";
type TransactionSort = "recent-contract" | "closing-soon" | "closing-latest" | "price-high";

const LEADS_PER_PAGE = 12;

function date(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function money(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value));
}

function time(value: Date | string | null | undefined) {
  if (!value) return 0;
  const result = new Date(value).getTime();
  return Number.isNaN(result) ? 0 : result;
}

function statusClass(status: string) {
  const lower = status.toLowerCase();
  if (lower === "closed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (lower === "under contract" || lower === "active client") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  if (lower === "terminated" || lower === "dead" || lower === "do not contact") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function PortalLogin() {
  const [email, setEmail] = useState("");
  const [requested, setRequested] = useState(false);
  const requestLogin = trpc.partnerPortal.requestLogin.useMutation({
    onSuccess: () => setRequested(true),
    onError: () => {
      // Preserve non-enumerating behavior while still giving a safe response.
      setRequested(true);
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    requestLogin.mutate({ email: email.trim() });
  };

  return (
    <div className="h-[100dvh] overflow-y-auto overscroll-y-contain bg-gradient-to-br from-slate-50 via-white to-cyan-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <img src={LOGO_URL} alt="Savvy STR Agents" className="h-10 object-contain" />
        </div>
        <Card className="border-slate-200 bg-white shadow-xl">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-cyan-50 text-cyan-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <CardTitle className="text-xl text-slate-900">Partner Portal</CardTitle>
            <CardDescription className="text-slate-500">
              Sign in securely to follow the progress of your Savvy STR Agents leads.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {requested ? (
              <div className="space-y-5 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900">Check your inbox</h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">
                    If this email has Partner Portal access, a secure sign-in link is on its way. The link expires after 15 minutes.
                  </p>
                </div>
                <Button variant="outline" className="w-full" onClick={() => { setRequested(false); setEmail(""); }}>
                  Use a different email
                </Button>
              </div>
            ) : (
              <form className="space-y-5" onSubmit={submit}>
                <div className="space-y-1.5">
                  <Label htmlFor="partner-email" className="text-slate-700">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="partner-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      required
                      disabled={requestLogin.isPending}
                      className="h-10 border-slate-300 pl-9 focus-visible:ring-cyan-500"
                    />
                  </div>
                </div>
                <Button type="submit" className="h-10 w-full bg-cyan-500 font-semibold text-white hover:bg-cyan-600" disabled={requestLogin.isPending || !email.trim()}>
                  {requestLogin.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending secure link…</> : "Email me a secure sign-in link"}
                </Button>
                <p className="text-center text-xs leading-relaxed text-slate-400">
                  Partners sign in with an email link only. No password is required.
                </p>
              </form>
            )}
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-slate-400">
          Need access? Contact your Savvy STR Agents representative.
        </p>
      </div>
    </div>
  );
}

export default function PartnerPortalPage() {
  const me = trpc.partnerPortal.me.useQuery(undefined, { retry: false });
  const dashboard = trpc.partnerPortal.dashboard.useQuery(undefined, { enabled: !!me.data, retry: false });
  const logout = trpc.partnerPortal.logout.useMutation({
    onSuccess: () => {
      void me.refetch();
      void dashboard.refetch();
    },
  });

  const [leadSourceFilter, setLeadSourceFilter] = useState("all");
  const [leadConnectionFilter, setLeadConnectionFilter] = useState("all");
  const [leadPipelineFilter, setLeadPipelineFilter] = useState("all");
  const [leadDateFilter, setLeadDateFilter] = useState("all");
  const [leadSort, setLeadSort] = useState<LeadSort>("newest");
  const [leadPage, setLeadPage] = useState(1);
  const [transactionStatusFilter, setTransactionStatusFilter] = useState("all");
  const [transactionSort, setTransactionSort] = useState<TransactionSort>("recent-contract");

  const leads = dashboard.data?.leads ?? [];
  const transactions = dashboard.data?.transactions ?? [];
  const sources = dashboard.data?.sources ?? me.data?.sources ?? [];
  const connectedLeads = leads.filter((lead) => lead.connections.length > 0).length;
  const unassignedLeads = leads.length - connectedLeads;
  const underContractTransactions = transactions.filter((transaction) => transaction.status === "Under Contract").length;
  const closedTransactions = transactions.filter((transaction) => transaction.status === "Closed").length;

  const sourceOptions = useMemo(() => Array.from(new Set(leads.map((lead) => lead.sourceName))).sort(), [leads]);
  const pipelineOptions = useMemo(() => Array.from(new Set(leads.flatMap((lead) => lead.connections.map((connection) => connection.status)))).sort(), [leads]);
  const transactionStatusOptions = useMemo(() => Array.from(new Set(transactions.map((transaction) => transaction.status))).sort(), [transactions]);

  const filteredLeads = useMemo(() => {
    const cutoff = new Date();
    if (leadDateFilter === "30d") cutoff.setDate(cutoff.getDate() - 30);
    if (leadDateFilter === "90d") cutoff.setDate(cutoff.getDate() - 90);
    if (leadDateFilter === "year") cutoff.setMonth(0, 1);

    const filtered = leads.filter((lead) => {
      if (leadSourceFilter !== "all" && lead.sourceName !== leadSourceFilter) return false;
      if (leadConnectionFilter === "connected" && lead.connections.length === 0) return false;
      if (leadConnectionFilter === "unassigned" && lead.connections.length > 0) return false;
      if (leadPipelineFilter !== "all" && !lead.connections.some((connection) => connection.status === leadPipelineFilter)) return false;
      if (leadDateFilter !== "all" && time(lead.submittedAt) < cutoff.getTime()) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (leadSort === "oldest") return time(a.submittedAt) - time(b.submittedAt);
      if (leadSort === "name") return a.leadName.localeCompare(b.leadName);
      if (leadSort === "connection") return b.connections.length - a.connections.length || time(b.submittedAt) - time(a.submittedAt);
      return time(b.submittedAt) - time(a.submittedAt);
    });
  }, [leads, leadSourceFilter, leadConnectionFilter, leadPipelineFilter, leadDateFilter, leadSort]);

  const filteredTransactions = useMemo(() => {
    const filtered = transactions.filter((transaction) => transactionStatusFilter === "all" || transaction.status === transactionStatusFilter);
    return filtered.sort((a, b) => {
      if (transactionSort === "closing-soon") return (time(a.closingDate) || Number.MAX_SAFE_INTEGER) - (time(b.closingDate) || Number.MAX_SAFE_INTEGER);
      if (transactionSort === "closing-latest") return time(b.closingDate) - time(a.closingDate);
      if (transactionSort === "price-high") return Number(b.salesPrice ?? 0) - Number(a.salesPrice ?? 0);
      return time(b.underContractDate) - time(a.underContractDate);
    });
  }, [transactions, transactionStatusFilter, transactionSort]);

  const leadPageCount = Math.max(1, Math.ceil(filteredLeads.length / LEADS_PER_PAGE));
  const currentLeadPage = Math.min(leadPage, leadPageCount);
  const pagedLeads = filteredLeads.slice((currentLeadPage - 1) * LEADS_PER_PAGE, currentLeadPage * LEADS_PER_PAGE);

  const hasLeadFilters = leadSourceFilter !== "all" || leadConnectionFilter !== "all" || leadPipelineFilter !== "all" || leadDateFilter !== "all" || leadSort !== "newest";
  const hasTransactionFilters = transactionStatusFilter !== "all" || transactionSort !== "recent-contract";

  const resetLeadFilters = () => {
    setLeadSourceFilter("all");
    setLeadConnectionFilter("all");
    setLeadPipelineFilter("all");
    setLeadDateFilter("all");
    setLeadSort("newest");
    setLeadPage(1);
  };

  const resetTransactionFilters = () => {
    setTransactionStatusFilter("all");
    setTransactionSort("recent-contract");
  };

  if (me.isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="h-7 w-7 animate-spin text-cyan-500" /></div>;
  }
  if (me.error || !me.data) return <PortalLogin />;

  return (
    <div className="h-[100dvh] overflow-y-auto overscroll-y-contain bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <img src={LOGO_URL} alt="Savvy STR Agents" className="h-8 shrink-0 object-contain" />
            <div className="hidden border-l border-slate-200 pl-3 sm:block">
              <p className="text-sm font-semibold">Partner Portal</p>
              <p className="text-xs text-slate-500">Lead progress at a glance</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0 text-slate-600" disabled={logout.isPending} onClick={() => logout.mutate()}>
            {logout.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <LogOut className="mr-1.5 h-4 w-4" />}
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-cyan-600">Savvy STR Agents</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Your lead activity</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">Track high-level progress for leads you have introduced. Client contact details and internal notes remain private.</p>
          </div>
          <div className="text-sm text-slate-500">Signed in as <span className="font-medium text-slate-700">{me.data.email}</span></div>
        </div>

        {dashboard.isLoading ? (
          <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-cyan-500" /></div>
        ) : dashboard.error ? (
          <Alert variant="destructive"><AlertDescription>We could not load your partner data. Please refresh the page or request a new secure link.</AlertDescription></Alert>
        ) : (
          <>
            <section aria-labelledby="partner-summary">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="partner-summary" className="text-base font-semibold text-slate-800">Summary</h2>
                <p className="text-xs text-slate-500">A snapshot of your introduced business</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card><CardContent className="flex items-center gap-3 p-5"><div className="rounded-lg bg-cyan-50 p-2.5 text-cyan-600"><Users className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{leads.length}</p><p className="text-xs text-slate-500">Leads introduced</p></div></CardContent></Card>
                <Card><CardContent className="flex items-center gap-3 p-5"><div className="rounded-lg bg-violet-50 p-2.5 text-violet-600"><Link2 className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{connectedLeads}</p><p className="text-xs text-slate-500">Connected to an agent</p>{unassignedLeads > 0 && <p className="mt-0.5 text-xs text-slate-400">{unassignedLeads} awaiting connection</p>}</div></CardContent></Card>
                <Card><CardContent className="flex items-center gap-3 p-5"><div className="rounded-lg bg-amber-50 p-2.5 text-amber-600"><Building2 className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{underContractTransactions}</p><p className="text-xs text-slate-500">Under contract</p></div></CardContent></Card>
                <Card><CardContent className="flex items-center gap-3 p-5"><div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{closedTransactions}</p><p className="text-xs text-slate-500">Closed transactions</p></div></CardContent></Card>
              </div>
            </section>

            <Tabs defaultValue="leads" className="space-y-4">
              <TabsList className="bg-white"><TabsTrigger value="leads">Leads ({filteredLeads.length}{filteredLeads.length !== leads.length ? ` of ${leads.length}` : ""})</TabsTrigger><TabsTrigger value="transactions">Transactions ({filteredTransactions.length}{filteredTransactions.length !== transactions.length ? ` of ${transactions.length}` : ""})</TabsTrigger></TabsList>
              <TabsContent value="leads">
                <Card>
                  <CardHeader className="space-y-4 pb-4">
                    <div>
                      <CardTitle className="text-base">Lead progress</CardTitle>
                      <CardDescription className="mt-1">See when a Savvy agent is connected and their current pipeline status for each lead.</CardDescription>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                      <div className="mb-3 flex items-center justify-between gap-3"><p className="flex items-center gap-1.5 text-sm font-medium text-slate-700"><Filter className="h-4 w-4 text-cyan-600" />Filter leads</p>{hasLeadFilters && <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-600" onClick={resetLeadFilters}><RotateCcw className="mr-1 h-3.5 w-3.5" />Reset</Button>}</div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                        <Select value={leadSourceFilter} onValueChange={(value) => { setLeadSourceFilter(value); setLeadPage(1); }}><SelectTrigger aria-label="Filter leads by source" className="w-full bg-white"><SelectValue placeholder="All sources" /></SelectTrigger><SelectContent><SelectItem value="all">All sources</SelectItem>{sourceOptions.map((source) => <SelectItem key={source} value={source}>{source}</SelectItem>)}</SelectContent></Select>
                        <Select value={leadConnectionFilter} onValueChange={(value) => { setLeadConnectionFilter(value); setLeadPage(1); }}><SelectTrigger aria-label="Filter leads by agent connection" className="w-full bg-white"><SelectValue placeholder="All connections" /></SelectTrigger><SelectContent><SelectItem value="all">All connections</SelectItem><SelectItem value="connected">Connected to agent</SelectItem><SelectItem value="unassigned">Awaiting connection</SelectItem></SelectContent></Select>
                        <Select value={leadPipelineFilter} onValueChange={(value) => { setLeadPipelineFilter(value); setLeadPage(1); }}><SelectTrigger aria-label="Filter leads by pipeline status" className="w-full bg-white"><SelectValue placeholder="All pipeline stages" /></SelectTrigger><SelectContent><SelectItem value="all">All pipeline stages</SelectItem>{pipelineOptions.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select>
                        <Select value={leadDateFilter} onValueChange={(value) => { setLeadDateFilter(value); setLeadPage(1); }}><SelectTrigger aria-label="Filter leads by submitted date" className="w-full bg-white"><SelectValue placeholder="Any submitted date" /></SelectTrigger><SelectContent><SelectItem value="all">Any submitted date</SelectItem><SelectItem value="30d">Last 30 days</SelectItem><SelectItem value="90d">Last 90 days</SelectItem><SelectItem value="year">This year</SelectItem></SelectContent></Select>
                        <Select value={leadSort} onValueChange={(value) => { setLeadSort(value as LeadSort); setLeadPage(1); }}><SelectTrigger aria-label="Sort leads" className="w-full bg-white"><ArrowDownUp className="mr-1.5 h-3.5 w-3.5 text-slate-400" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="newest">Newest submitted</SelectItem><SelectItem value="oldest">Oldest submitted</SelectItem><SelectItem value="name">Lead name A–Z</SelectItem><SelectItem value="connection">Agent connected first</SelectItem></SelectContent></Select>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {leads.length === 0 ? (
                      <div className="px-6 py-14 text-center text-sm text-slate-500">No submitted leads are available yet.</div>
                    ) : filteredLeads.length === 0 ? (
                      <div className="px-6 py-14 text-center"><p className="text-sm font-medium text-slate-700">No leads match these filters.</p><Button variant="link" className="mt-1 h-auto p-0 text-cyan-700" onClick={resetLeadFilters}>Clear lead filters</Button></div>
                    ) : (
                      <div className="space-y-4 px-4 pb-4 sm:px-6 sm:pb-6">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {pagedLeads.map((lead) => (
                            <article key={lead.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3.5 shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50/20">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-slate-800">{lead.leadName}</p>
                                  <p className="mt-0.5 truncate text-xs text-slate-500">{lead.sourceName}</p>
                                </div>
                                <span className="shrink-0 text-xs text-slate-400">{date(lead.submittedAt)}</span>
                              </div>
                              <div className="mt-3 border-t border-slate-100 pt-3">
                                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">Agent connection</p>
                                {lead.connections.length ? (
                                  <div className="space-y-1.5">
                                    {lead.connections.map((connection, index) => (
                                      <div key={`${connection.agentName}-${index}`} className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-slate-700">{connection.agentName}</span>
                                        <Badge variant="outline" className={statusClass(connection.status)}>{connection.status}</Badge>
                                      </div>
                                    ))}
                                  </div>
                                ) : <span className="text-sm text-slate-400">Not assigned yet</span>}
                              </div>
                            </article>
                          ))}
                        </div>
                        {leadPageCount > 1 && (
                          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row">
                            <p className="text-xs text-slate-500">Showing {(currentLeadPage - 1) * LEADS_PER_PAGE + 1}–{Math.min(currentLeadPage * LEADS_PER_PAGE, filteredLeads.length)} of {filteredLeads.length} leads</p>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" disabled={currentLeadPage === 1} onClick={() => setLeadPage((page) => Math.max(1, page - 1))}>Previous</Button>
                              <span className="text-xs font-medium text-slate-600">Page {currentLeadPage} of {leadPageCount}</span>
                              <Button variant="outline" size="sm" disabled={currentLeadPage === leadPageCount} onClick={() => setLeadPage((page) => Math.min(leadPageCount, page + 1))}>Next</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="transactions">
                <Card>
                  <CardHeader className="space-y-4 pb-4">
                    <div><CardTitle className="text-base">Transaction milestones</CardTitle><CardDescription className="mt-1">High-level deal status for your introduced leads.</CardDescription></div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                      <div className="mb-3 flex items-center justify-between gap-3"><p className="flex items-center gap-1.5 text-sm font-medium text-slate-700"><Filter className="h-4 w-4 text-cyan-600" />Filter transactions</p>{hasTransactionFilters && <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-600" onClick={resetTransactionFilters}><RotateCcw className="mr-1 h-3.5 w-3.5" />Reset</Button>}</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Select value={transactionStatusFilter} onValueChange={setTransactionStatusFilter}><SelectTrigger aria-label="Filter transactions by status" className="w-full bg-white"><SelectValue placeholder="All transaction statuses" /></SelectTrigger><SelectContent><SelectItem value="all">All transaction statuses</SelectItem>{transactionStatusOptions.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select>
                        <Select value={transactionSort} onValueChange={(value) => setTransactionSort(value as TransactionSort)}><SelectTrigger aria-label="Sort transactions" className="w-full bg-white"><ArrowDownUp className="mr-1.5 h-3.5 w-3.5 text-slate-400" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="recent-contract">Most recently under contract</SelectItem><SelectItem value="closing-soon">Closing date: soonest</SelectItem><SelectItem value="closing-latest">Closing date: latest</SelectItem><SelectItem value="price-high">Sales price: highest</SelectItem></SelectContent></Select>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {transactions.length === 0 ? <div className="px-6 py-14 text-center text-sm text-slate-500">No transactions are associated with your leads yet.</div> : filteredTransactions.length === 0 ? <div className="px-6 py-14 text-center"><p className="text-sm font-medium text-slate-700">No transactions match this status.</p><Button variant="link" className="mt-1 h-auto p-0 text-cyan-700" onClick={resetTransactionFilters}>Clear transaction filters</Button></div> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="border-y border-slate-100 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500"><tr><th className="px-6 py-3">Lead</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Savvy agent</th><th className="px-4 py-3">Under contract</th><th className="px-4 py-3">Closing date</th><th className="px-4 py-3">Sales price</th><th className="px-6 py-3">Address</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredTransactions.map((transaction) => <tr key={transaction.id} className="hover:bg-slate-50/70"><td className="px-6 py-4"><p className="font-medium text-slate-800">{transaction.leadName}</p><p className="mt-0.5 text-xs text-slate-500">{transaction.transactionType}{transaction.transactionNumber ? ` · ${transaction.transactionNumber}` : ""}</p></td><td className="px-4 py-4"><Badge variant="outline" className={statusClass(transaction.status)}>{transaction.status}</Badge></td><td className="px-4 py-4 font-medium text-slate-700">{transaction.agentName}</td><td className="px-4 py-4 text-slate-600">{date(transaction.underContractDate)}</td><td className="px-4 py-4 text-slate-600">{date(transaction.closingDate)}</td><td className="px-4 py-4 font-medium text-slate-700">{money(transaction.salesPrice)}</td><td className="px-6 py-4 text-slate-600">{transaction.address}</td></tr>)}</tbody></table></div>}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {sources.length > 0 && <Card className="border-cyan-100 bg-cyan-50/30"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-slate-800">Submit another lead</p><p className="mt-0.5 text-xs text-slate-500">Use your dedicated partner intake link to introduce another client.</p></div>{sources.length === 1 ? <a href={`/partner-lead?partner=${encodeURIComponent(sources[0].name)}`} target="_blank" rel="noreferrer"><Button variant="outline" size="sm" className="border-cyan-200 text-cyan-700 hover:bg-cyan-100"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open intake form</Button></a> : <p className="text-xs text-slate-500">Use the lead intake link provided by your Savvy representative.</p>}</CardContent></Card>}
          </>
        )}
      </main>
      <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">© {new Date().getFullYear()} Savvy STR Agents · Partner Portal</footer>
    </div>
  );
}
