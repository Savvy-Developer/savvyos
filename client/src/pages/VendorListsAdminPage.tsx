import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Copy, ExternalLink, Loader2, Pencil, Search, UsersRound, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import VendorListManagementPage from "./VendorListManagementPage";

export default function VendorListsAdminPage() {
  const [, navigate] = useLocation();
  const listQuery = trpc.vendors.adminList.useQuery();
  const [search, setSearch] = useState("");
  const [editingAgentId, setEditingAgentId] = useState<number | null>(null);
  const rows = useMemo(() => (listQuery.data ?? []).filter((row: any) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [row.agentName, row.agentEmail, row.displayName, row.publicSlug].some((value) => String(value ?? "").toLowerCase().includes(needle));
  }), [listQuery.data, search]);

  if (editingAgentId) {
    return (
      <div className="space-y-5 pb-10">
        <Button variant="ghost" className="-ml-3" onClick={() => setEditingAgentId(null)}><ArrowLeft className="mr-2 h-4 w-4" /> Back to Vendors</Button>
        <VendorListManagementPage agentId={editingAgentId} />
      </div>
    );
  }

  if (listQuery.isLoading) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-cyan-600" /></div>;
  if (listQuery.error) return <Card className="mx-auto mt-10 max-w-xl"><CardContent className="p-8 text-center"><h1 className="text-lg font-semibold">Vendor Lists unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{listQuery.error.message}</p></CardContent></Card>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-700"><UsersRound className="h-4 w-4" /> Agent-managed resource</div><h1 className="text-3xl font-bold tracking-tight">Vendors</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Review and edit the personal Vendor Lists agents have created for their clients. Each list, category, and vendor is unique to that agent.</p></div>
        <Button variant="outline" onClick={() => navigate("/users")}><UsersRound className="mr-2 h-4 w-4" /> Manage users</Button>
      </header>
      <Card className="border-cyan-100 bg-cyan-50/40"><CardContent className="p-4 text-sm leading-6 text-cyan-950"><strong>Admin access.</strong> Select any agent below to manage the same list settings, categories, vendors, visibility controls, order, and publishing status available to the agent. Only agents with a created Vendor List appear here.</CardContent></Card>
      <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search agent or Vendor List" className="pl-9" /></div>
      {rows.length === 0 ? <Card className="border-dashed"><CardContent className="py-16 text-center"><Wrench className="mx-auto h-9 w-9 text-slate-400" /><h2 className="mt-4 text-lg font-semibold">{search ? "No matching Vendor Lists" : "No Vendor Lists yet"}</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{search ? "Try another agent, list name, or public URL slug." : "An agent appears here once they create their personal Vendor List."}</p></CardContent></Card> : <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">Agent</th><th className="px-5 py-3 font-semibold">Vendor List</th><th className="px-5 py-3 text-center font-semibold">Categories</th><th className="px-5 py-3 text-center font-semibold">Vendors</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 text-right font-semibold">Actions</th></tr></thead><tbody>{rows.map((row: any) => { const publicUrl = `${window.location.origin}/vendors/${row.publicSlug}`; return <tr key={row.id} className="border-b last:border-0 hover:bg-slate-50/70"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{row.agentName || "Unnamed agent"}</p><p className="mt-0.5 text-xs text-slate-500">{row.agentEmail || "No email"}</p></td><td className="px-5 py-4"><p className="font-medium text-slate-800">{row.displayName}</p><p className="mt-0.5 text-xs text-slate-500">/vendors/{row.publicSlug}</p></td><td className="px-5 py-4 text-center tabular-nums">{Number(row.categoryCount)}</td><td className="px-5 py-4 text-center tabular-nums">{Number(row.vendorCount)}</td><td className="px-5 py-4"><Badge variant={row.isPublished ? "default" : "secondary"}>{row.isPublished ? "Published" : "Draft"}</Badge></td><td className="px-5 py-4"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="Copy public URL" disabled={!row.isPublished} onClick={async () => { try { await navigator.clipboard.writeText(publicUrl); } catch { /* noop: user can use the URL shown in editor */ } }}><Copy className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Open public list" disabled={!row.isPublished} onClick={() => window.open(publicUrl, "_blank", "noopener,noreferrer")}><ExternalLink className="h-4 w-4" /></Button><Button size="sm" onClick={() => setEditingAgentId(row.agentId)}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit</Button></div></td></tr>; })}</tbody></table></div></Card>}
    </div>
  );
}
