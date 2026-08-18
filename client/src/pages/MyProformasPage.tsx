import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Building2, Calendar, ChevronRight, FileText, Loader2, Search, User } from "lucide-react";

type ProformaListItem = {
  id: number;
  propertyId: number;
  createdByUserId: number;
  title: string | null;
  purchasePrice: string | null;
  grossRevenue: string | null;
  noiAnnual: string | null;
  cashFlowAnnual: string | null;
  cashOnCash: string | null;
  capRate: string | null;
  createdAt: Date;
  updatedAt: Date;
  creatorName: string | null;
  propertyAddress: string | null;
  propertyCity: string | null;
  propertyState: string | null;
};

const formatCurrency = (value: string | null) => {
  if (value === null || value === undefined || value === "") return "—";
  return `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const formatPercent = (value: string | null) => {
  if (value === null || value === undefined || value === "") return "—";
  return `${(Number(value) * 100).toFixed(1)}%`;
};

const formatPropertyAddress = (proforma: ProformaListItem) => {
  const locality = [proforma.propertyCity, proforma.propertyState].filter(Boolean).join(", ");
  return [proforma.propertyAddress, locality].filter(Boolean).join(" · ") || "Property unavailable";
};

export default function MyProformasPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [selectedAgentId, setSelectedAgentId] = useState("all");
  const [search, setSearch] = useState("");

  const listInput = useMemo(
    () => (isAdmin && selectedAgentId !== "all" ? { agentId: Number(selectedAgentId) } : undefined),
    [isAdmin, selectedAgentId],
  );
  const { data, isLoading, isError, error, refetch } = trpc.properties.listAllProformas.useQuery(listInput);
  const { data: agents = [] } = trpc.users.list.useQuery({ role: "agent" }, { enabled: isAdmin });

  const proformas = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const items = (data ?? []) as ProformaListItem[];
    if (!normalizedSearch) return items;

    return items.filter((proforma) =>
      [proforma.title, proforma.creatorName, proforma.propertyAddress, proforma.propertyCity, proforma.propertyState]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedSearch)),
    );
  }, [data, search]);

  return (
    <div>
      <PageHeader
        title="My Pro-formas"
        subtitle={isAdmin ? "Review saved property analyses across the team, or filter by an agent." : "Review the property analyses you have created."}
        actions={
          isAdmin ? (
            <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
              <SelectTrigger className="w-[190px]" aria-label="Filter pro-formas by agent">
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agents.map((agent: any) => (
                  <SelectItem key={agent.id} value={String(agent.id)}>
                    {agent.name || agent.email || `Agent #${agent.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />

      <div className="relative mb-4 max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by property, title, or agent..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
              <p>Loading pro-formas…</p>
            </div>
          ) : isError ? (
            <div className="py-16 text-center">
              <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-destructive opacity-70" />
              <p className="text-destructive">Failed to load pro-formas.</p>
              {error?.message && <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>}
              <Button className="mt-3" size="sm" variant="outline" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : proformas.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <FileText className="mx-auto mb-3 h-9 w-9 opacity-30" />
              <p className="font-medium text-foreground">{search ? "No pro-formas match your search" : "No pro-formas yet"}</p>
              <p className="mt-1 text-sm">
                {isAdmin && selectedAgentId === "all"
                  ? "Saved property analyses from the team will appear here."
                  : "Create a pro-forma from a property to see it here."}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {proformas.map((proforma) => (
                <button
                  key={proforma.id}
                  type="button"
                  className="group flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  onClick={() => navigate(`/properties/${proforma.propertyId}/proforma?load=${proforma.id}`)}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{proforma.title || "Untitled Pro-forma"}</p>
                      {proforma.purchasePrice && <Badge variant="outline">{formatCurrency(proforma.purchasePrice)}</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />
                        {formatPropertyAddress(proforma)}
                      </span>
                      {isAdmin && (
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          {proforma.creatorName || "Unknown agent"}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        Updated {new Date(proforma.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <span className="text-muted-foreground">Revenue: <span className="font-medium text-foreground">{formatCurrency(proforma.grossRevenue)}</span></span>
                      <span className="text-muted-foreground">NOI: <span className="font-medium text-foreground">{formatCurrency(proforma.noiAnnual)}</span></span>
                      <span className="text-muted-foreground">Cash Flow: <span className={Number(proforma.cashFlowAnnual ?? 0) < 0 ? "font-medium text-red-600" : "font-medium text-emerald-600"}>{formatCurrency(proforma.cashFlowAnnual)}</span></span>
                      <span className="text-muted-foreground">CoC: <span className="font-medium text-foreground">{formatPercent(proforma.cashOnCash)}</span></span>
                      <span className="text-muted-foreground">Cap Rate: <span className="font-medium text-foreground">{formatPercent(proforma.capRate)}</span></span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
