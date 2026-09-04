import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Copy, ExternalLink, Loader2, Pencil, Search, UsersRound, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import VendorListManagementPage from "./VendorListManagementPage";

type BillingMetric = "invitedVendorCount" | "pendingInviteCount" | "activeSubscriptionCount" | "activeMonthlyRevenueCents" | "activeAgentShareCents" | "collectedRevenueCents" | "agentEarningsCents";

function metric(row: Record<string, unknown>, key: BillingMetric): number {
  return Number(row[key] ?? 0);
}

function currency(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></CardContent></Card>;
}

export default function VendorListsAdminPage() {
  const [, navigate] = useLocation();
  const listQuery = trpc.vendors.adminList.useQuery();
  const statsQuery = trpc.vendors.adminStats.useQuery();
  const [search, setSearch] = useState("");
  const [editingAgentId, setEditingAgentId] = useState<number | null>(null);
  const rows = useMemo(() => (listQuery.data ?? []).filter((row: any) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [row.agentName, row.agentEmail, row.displayName, row.publicSlug].some((value) => String(value ?? "").toLowerCase().includes(needle));
  }), [listQuery.data, search]);
  const totals = useMemo(() => rows.reduce((result: Record<BillingMetric, number>, row: any) => ({
    invitedVendorCount: result.invitedVendorCount + metric(row, "invitedVendorCount"),
    pendingInviteCount: result.pendingInviteCount + metric(row, "pendingInviteCount"),
    activeSubscriptionCount: result.activeSubscriptionCount + metric(row, "activeSubscriptionCount"),
    activeMonthlyRevenueCents: result.activeMonthlyRevenueCents + metric(row, "activeMonthlyRevenueCents"),
    activeAgentShareCents: result.activeAgentShareCents + metric(row, "activeAgentShareCents"),
    collectedRevenueCents: result.collectedRevenueCents + metric(row, "collectedRevenueCents"),
    agentEarningsCents: result.agentEarningsCents + metric(row, "agentEarningsCents"),
  }), {
    invitedVendorCount: 0,
    pendingInviteCount: 0,
    activeSubscriptionCount: 0,
    activeMonthlyRevenueCents: 0,
    activeAgentShareCents: 0,
    collectedRevenueCents: 0,
    agentEarningsCents: 0,
  }), [rows]);
  const stats = statsQuery.data ?? {
    activeAgentCount: 0,
    activeAgentWithListCount: 0,
    activeAgentWithoutListCount: 0,
    publishedListCount: 0,
    draftListCount: 0,
  };
  const adoptionRate = stats.activeAgentCount > 0
    ? Math.round((stats.activeAgentWithListCount / stats.activeAgentCount) * 100)
    : 0;

  if (editingAgentId) {
    return <div className="space-y-5 pb-10"><Button variant="ghost" className="-ml-3" onClick={() => setEditingAgentId(null)}><ArrowLeft className="mr-2 h-4 w-4" /> Back to Vendors</Button><VendorListManagementPage agentId={editingAgentId} /></div>;
  }
  if (listQuery.isLoading || statsQuery.isLoading) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-cyan-600" /></div>;
  const loadError = listQuery.error || statsQuery.error;
  if (loadError) return <Card className="mx-auto mt-10 max-w-xl"><CardContent className="p-8 text-center"><h1 className="text-lg font-semibold">Vendor Lists unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{loadError.message}</p></CardContent></Card>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-700"><UsersRound className="h-4 w-4" /> Agent-managed resource</div><h1 className="text-3xl font-bold tracking-tight">Vendors</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Review each agent’s Vendor List and the Featured Vendor subscription revenue it produces.</p></div>
        <Button variant="outline" onClick={() => navigate("/users")}><UsersRound className="mr-2 h-4 w-4" /> Manage users</Button>
      </header>

      <Card className="border-cyan-100 bg-cyan-50/40"><CardContent className="p-4 text-sm leading-6 text-cyan-950"><strong>Featured Vendor billing.</strong> Current monthly values reflect active Stripe subscriptions. Collected and agent-earned values reflect all successful Stripe invoices to date; agent earnings are the 75% share due to the agent.</CardContent></Card>

      <section className="space-y-3">
        <div><h2 className="text-lg font-semibold tracking-tight text-slate-900">Vendor List adoption</h2><p className="mt-1 text-sm text-muted-foreground">Current progress across active agent accounts. These totals do not change when you search the table below.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCard label="Active agents" value={String(stats.activeAgentCount)} detail="Enabled agent accounts" />
          <SummaryCard label="Lists created" value={String(stats.activeAgentWithListCount)} detail={`${adoptionRate}% of active agents`} />
          <SummaryCard label="No list yet" value={String(stats.activeAgentWithoutListCount)} detail="Active agents without a Vendor List" />
          <SummaryCard label="Published lists" value={String(stats.publishedListCount)} detail="Live client resources" />
          <SummaryCard label="Draft lists" value={String(stats.draftListCount)} detail="Need a final review and publish" />
        </div>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-lg font-semibold tracking-tight text-slate-900">Featured Vendor billing</h2><p className="mt-1 text-sm text-muted-foreground">Billing totals reflect the Vendor Lists currently shown in the table below.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <SummaryCard label="Invited to pay" value={String(totals.invitedVendorCount)} detail={`${totals.pendingInviteCount} pending checkout`} />
          <SummaryCard label="Current subscriptions" value={String(totals.activeSubscriptionCount)} detail="Active, successfully paid Stripe subscriptions" />
          <SummaryCard label="Current MRR" value={currency(totals.activeMonthlyRevenueCents)} detail="Gross monthly recurring vendor payments" />
          <SummaryCard label="Agent share / mo" value={currency(totals.activeAgentShareCents)} detail="75% due from active subscriptions" />
          <SummaryCard label="Collected to date" value={currency(totals.collectedRevenueCents)} detail="Successful Featured Vendor payments" />
          <SummaryCard label="Agent earned to date" value={currency(totals.agentEarningsCents)} detail="75% of successful payments" />
        </div>
      </section>

      <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search agent or Vendor List" className="pl-9" /></div>

      {rows.length === 0 ? <Card className="border-dashed"><CardContent className="py-16 text-center"><Wrench className="mx-auto h-9 w-9 text-slate-400" /><h2 className="mt-4 text-lg font-semibold">{search ? "No matching Vendor Lists" : "No Vendor Lists yet"}</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{search ? "Try another agent, list name, or public URL slug." : "An agent appears here once they create their personal Vendor List."}</p></CardContent></Card> : <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-sm"><thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">Agent</th><th className="px-5 py-3 font-semibold">Vendor List</th><th className="px-5 py-3 text-center font-semibold">Vendors</th><th className="px-5 py-3 text-center font-semibold">Invited</th><th className="px-5 py-3 text-center font-semibold">Current</th><th className="px-5 py-3 text-right font-semibold">Monthly revenue</th><th className="px-5 py-3 text-right font-semibold">Agent share / mo</th><th className="px-5 py-3 text-right font-semibold">Agent earned</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 text-right font-semibold">Actions</th></tr></thead><tbody>{rows.map((row: any) => {
        const publicUrl = `${window.location.origin}/vendors/${row.publicSlug}`;
        const invited = metric(row, "invitedVendorCount");
        const pending = metric(row, "pendingInviteCount");
        const active = metric(row, "activeSubscriptionCount");
        return <tr key={row.id} className="border-b last:border-0 hover:bg-slate-50/70"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{row.agentName || "Unnamed agent"}</p><p className="mt-0.5 text-xs text-slate-500">{row.agentEmail || "No email"}</p></td><td className="px-5 py-4"><p className="font-medium text-slate-800">{row.displayName}</p><p className="mt-0.5 text-xs text-slate-500">/vendors/{row.publicSlug}</p></td><td className="px-5 py-4 text-center tabular-nums">{Number(row.vendorCount)}</td><td className="px-5 py-4 text-center tabular-nums"><p className="font-medium text-slate-800">{invited}</p><p className="mt-0.5 text-xs text-slate-500">{pending} pending</p></td><td className="px-5 py-4 text-center"><Badge variant={active ? "default" : "secondary"}>{active} active</Badge></td><td className="px-5 py-4 text-right font-medium tabular-nums text-slate-800">{currency(metric(row, "activeMonthlyRevenueCents"))}</td><td className="px-5 py-4 text-right font-semibold tabular-nums text-emerald-700">{currency(metric(row, "activeAgentShareCents"))}</td><td className="px-5 py-4 text-right"><p className="font-semibold tabular-nums text-emerald-700">{currency(metric(row, "agentEarningsCents"))}</p><p className="mt-0.5 text-xs tabular-nums text-slate-500">{currency(metric(row, "collectedRevenueCents"))} collected</p></td><td className="px-5 py-4"><Badge variant={row.isPublished ? "default" : "secondary"}>{row.isPublished ? "Published" : "Draft"}</Badge></td><td className="px-5 py-4"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="Copy public URL" disabled={!row.isPublished} onClick={async () => { try { await navigator.clipboard.writeText(publicUrl); } catch { /* The URL remains visible in the editor. */ } }}><Copy className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Open public list" disabled={!row.isPublished} onClick={() => window.open(publicUrl, "_blank", "noopener,noreferrer")}><ExternalLink className="h-4 w-4" /></Button><Button size="sm" onClick={() => setEditingAgentId(row.agentId)}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit</Button></div></td></tr>;
      })}</tbody></table></div></Card>}
    </div>
  );
}
