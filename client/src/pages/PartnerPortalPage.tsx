import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, CheckCircle2, ExternalLink, Loader2, LogOut, Mail, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";

function date(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function money(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value));
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

  if (me.isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="h-7 w-7 animate-spin text-cyan-500" /></div>;
  }
  if (me.error || !me.data) return <PortalLogin />;

  const leads = dashboard.data?.leads ?? [];
  const transactions = dashboard.data?.transactions ?? [];
  const sources = dashboard.data?.sources ?? me.data.sources;
  const activeLeads = leads.filter((lead) => !["Closed", "Dead", "Do Not Contact"].includes(lead.status)).length;
  const closedTransactions = transactions.filter((transaction) => transaction.status === "Closed").length;

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
            <div className="grid gap-4 sm:grid-cols-3">
              <Card><CardContent className="flex items-center gap-3 p-5"><div className="rounded-lg bg-cyan-50 p-2.5 text-cyan-600"><Users className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{leads.length}</p><p className="text-xs text-slate-500">Leads introduced</p></div></CardContent></Card>
              <Card><CardContent className="flex items-center gap-3 p-5"><div className="rounded-lg bg-amber-50 p-2.5 text-amber-600"><Building2 className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{activeLeads}</p><p className="text-xs text-slate-500">Active leads</p></div></CardContent></Card>
              <Card><CardContent className="flex items-center gap-3 p-5"><div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{closedTransactions}</p><p className="text-xs text-slate-500">Closed transactions</p></div></CardContent></Card>
            </div>

            <Tabs defaultValue="leads" className="space-y-4">
              <TabsList className="bg-white"><TabsTrigger value="leads">Leads ({leads.length})</TabsTrigger><TabsTrigger value="transactions">Transactions ({transactions.length})</TabsTrigger></TabsList>
              <TabsContent value="leads">
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base">Lead progress</CardTitle><CardDescription>Current client stage, Savvy agent assignment, and source attribution.</CardDescription></CardHeader>
                  <CardContent className="p-0">
                    {leads.length === 0 ? <div className="px-6 py-14 text-center text-sm text-slate-500">No submitted leads are available yet.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-y border-slate-100 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500"><tr><th className="px-6 py-3">Lead</th><th className="px-4 py-3">Submitted</th><th className="px-4 py-3">Lead status</th><th className="px-4 py-3">Agent connection</th><th className="px-6 py-3">Assigned agent</th></tr></thead><tbody className="divide-y divide-slate-100">{leads.map((lead) => <tr key={lead.id} className="hover:bg-slate-50/70"><td className="px-6 py-4"><p className="font-medium text-slate-800">{lead.leadName}</p><p className="mt-0.5 text-xs text-slate-500">{lead.sourceName}</p></td><td className="px-4 py-4 text-slate-600">{date(lead.submittedAt)}</td><td className="px-4 py-4"><Badge variant="outline" className={statusClass(lead.status)}>{lead.status}</Badge></td><td className="px-4 py-4">{lead.connections.length ? <div className="space-y-1">{lead.connections.map((connection, index) => <Badge key={`${connection.agentName}-${index}`} variant="outline" className={statusClass(connection.status)}>{connection.status}</Badge>)}</div> : <span className="text-slate-400">Not connected yet</span>}</td><td className="px-6 py-4 text-slate-700">{lead.connections.length ? <div className="space-y-1">{lead.connections.map((connection, index) => <p key={`${connection.agentName}-${index}`}>{connection.agentName}</p>)}</div> : <span className="text-slate-400">—</span>}</td></tr>)}</tbody></table></div>}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="transactions">
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base">Transaction milestones</CardTitle><CardDescription>High-level deal status for your introduced leads.</CardDescription></CardHeader>
                  <CardContent className="p-0">
                    {transactions.length === 0 ? <div className="px-6 py-14 text-center text-sm text-slate-500">No transactions are associated with your leads yet.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[840px] text-left text-sm"><thead className="border-y border-slate-100 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500"><tr><th className="px-6 py-3">Lead</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Under contract</th><th className="px-4 py-3">Closing date</th><th className="px-4 py-3">Sales price</th><th className="px-6 py-3">Address</th></tr></thead><tbody className="divide-y divide-slate-100">{transactions.map((transaction) => <tr key={transaction.id} className="hover:bg-slate-50/70"><td className="px-6 py-4"><p className="font-medium text-slate-800">{transaction.leadName}</p><p className="mt-0.5 text-xs text-slate-500">{transaction.transactionType}{transaction.transactionNumber ? ` · ${transaction.transactionNumber}` : ""}</p></td><td className="px-4 py-4"><Badge variant="outline" className={statusClass(transaction.status)}>{transaction.status}</Badge></td><td className="px-4 py-4 text-slate-600">{date(transaction.underContractDate)}</td><td className="px-4 py-4 text-slate-600">{date(transaction.closingDate)}</td><td className="px-4 py-4 font-medium text-slate-700">{money(transaction.salesPrice)}</td><td className="px-6 py-4 text-slate-600">{transaction.address}</td></tr>)}</tbody></table></div>}
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
