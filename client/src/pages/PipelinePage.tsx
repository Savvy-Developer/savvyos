import { useEffect, useState } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import PageHeader from "@/components/PageHeader";
import { PipelineStatusBadge, IsaStatusBadge } from "@/components/StatusBadge";
import LeadSourcePicker from "@/components/LeadSourcePicker";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Home, ChevronRight, ChevronDown, Edit2, UserPlus, Search, Clock, AlertTriangle, ArrowUpAZ, ArrowDownAZ, BarChart3, CalendarClock } from "lucide-react";
import { formatPhone, isValidPhone, isValidEmail } from "@/lib/inputFormatters";
import { formatEmail } from "@/lib/format";
import { safeFormat } from "@/lib/safeFormat";

const PIPELINE_STAGES = [
  { value: "new_lead", label: "New Lead" },
  { value: "attempted_contact", label: "Attempted Contact" },
  { value: "nurture", label: "Nurture" },
  { value: "active_client", label: "Active Client" },
  { value: "under_contract", label: "Under Contract" },
  { value: "closed", label: "Closed" },
  { value: "dead", label: "Dead" },
];

const STAGE_COLORS: Record<string, string> = {
  new_lead: "bg-blue-50 border-blue-200 text-blue-700",
  attempted_contact: "bg-yellow-50 border-yellow-200 text-yellow-700",
  nurture: "bg-orange-50 border-orange-200 text-orange-700",
  active_client: "bg-green-50 border-green-200 text-green-700",
  under_contract: "bg-indigo-50 border-indigo-200 text-indigo-700",
  closed: "bg-emerald-50 border-emerald-200 text-emerald-700",
  dead: "bg-red-50 border-red-200 text-red-700",
};

type BuyBoxForm = {
  propertyType: string;
  minPrice: string;
  maxPrice: string;
  minBeds: string;
  maxBeds: string;
  minBaths: string;
  minSqft: string;
  maxSqft: string;
  targetCities: string;
  targetZips: string;
  strRequirements: string;
  investmentNotes: string;
};

export default function PipelinePage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [selectedStage, setSelectedStage] = usePersistentState("pipeline.selectedStage", "all");
  const [selectedAgentId, setSelectedAgentId] = usePersistentState("pipeline.selectedAgentId", "all");
  const [selectedIsaId, setSelectedIsaId] = usePersistentState<string>("pipeline.selectedIsaId", (user as any)?.role === "isa" ? String((user as any)?.id) : "all");
  const [selectedLeadSourceId, setSelectedLeadSourceId] = usePersistentState<string>("pipeline.selectedLeadSourceId", "all");
  const [pipelineSearch, setPipelineSearch] = usePersistentState("pipeline.search", "");
  const [followUpFrom, setFollowUpFrom] = usePersistentState("pipeline.followUpFrom", "");
  const [followUpTo, setFollowUpTo] = usePersistentState("pipeline.followUpTo", "");
  const [sortOrder, setSortOrder] = usePersistentState<"asc" | "desc">("pipeline.sortOrder", "desc");
  const [statsOpen, setStatsOpen] = usePersistentState("pipeline.statsOpen", false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;
  const [editOpen, setEditOpen] = useState(false);
  const [buyBoxOpen, setBuyBoxOpen] = useState(false);
  const [editConn, setEditConn] = useState<any>(null);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addContactForm, setAddContactForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", pipelineStatus: "new_lead", leadSourceId: "",
  });
  const [addDupMatches, setAddDupMatches] = useState<any[]>([]);
  const [addDupNameMatches, setAddDupNameMatches] = useState<any[]>([]);
  const checkDup = trpc.contacts.checkDuplicate.useMutation();
  const requestConn = trpc.connectionRequests.create.useMutation();
  const [newStage, setNewStage] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [agentNotes, setAgentNotes] = useState("");
  const [buyBoxForm, setBuyBoxForm] = useState<BuyBoxForm>({
    propertyType: "", minPrice: "", maxPrice: "",
    minBeds: "", maxBeds: "", minBaths: "",
    minSqft: "", maxSqft: "",
    targetCities: "", targetZips: "",
    strRequirements: "", investmentNotes: "",
  });

  const isaIdParam = selectedIsaId === "all" ? undefined : selectedIsaId === "unassigned" ? -1 : Number(selectedIsaId);
  const statusParam = selectedStage === "all" ? undefined : selectedStage;
  const agentIdParam = selectedAgentId === "all" ? undefined : Number(selectedAgentId);
  const leadSourceIdParam = selectedLeadSourceId === "all" ? undefined : selectedLeadSourceId === "unassigned" ? -1 : Number(selectedLeadSourceId);
  const { data: connectionsData, refetch } = trpc.agentConnections.list.useQuery({
    agentId: (user as any)?.role === "agent" ? (user as any)?.id : agentIdParam,
    isaId: isaIdParam,
    leadSourceId: leadSourceIdParam,
    status: statusParam,
    search: pipelineSearch.trim() || undefined,
    followUpDateFrom: followUpFrom || undefined,
    followUpDateTo: followUpTo || undefined,
    sortOrder,
    page: currentPage,
    limit: PAGE_SIZE,
  });
  const connections = connectionsData?.rows ?? [];
  const totalConnections = connectionsData?.total ?? 0;
  const totalPages = Math.ceil(totalConnections / PAGE_SIZE);
  const { data: agents = [] } = trpc.users.list.useQuery(
    { role: "agent" },
    { enabled: (user as any)?.role !== "agent" }
  );
  const { data: isas = [] } = trpc.users.list.useQuery(
    { role: "isa" },
    { enabled: (user as any)?.role !== "agent" }
  );
  const { data: leadSourcesData = [] } = trpc.leadSources.listFlat.useQuery();
  const stageCounts = connectionsData?.stageCounts ?? {};
  const agentCounts = connectionsData?.agentCounts ?? {};
  const isaCounts = connectionsData?.isaCounts ?? {};
  const leadSourceCounts = connectionsData?.leadSourceCounts ?? {};
  const fullPipelineTotal = connectionsData?.fullPipelineTotal ?? 0;
  const pipelineStats = connectionsData?.stats;

  const createContact = trpc.contacts.create.useMutation();
  const createConnection = trpc.agentConnections.create.useMutation();

  async function handleAddContact(forceCreate = false) {
    const f = addContactForm;
    if (!f.firstName.trim() || !f.lastName.trim()) { toast.error("First and last name are required"); return; }
    if (f.email && !isValidEmail(f.email)) { toast.error("Please enter a valid email address"); return; }
    if (f.phone && !isValidPhone(f.phone)) { toast.error("Please enter a valid phone number (9+ digits)"); return; }
    if ((user as any)?.role === "agent" && !f.email.trim() && !f.phone.trim()) { toast.error("Please provide at least an email address or phone number"); return; }
    if (!forceCreate) {
      try {
        const dupResult = await checkDup.mutateAsync({ email: f.email || undefined, phone: f.phone || undefined, firstName: f.firstName.trim(), lastName: f.lastName.trim() });
        const emailPhoneHits = (dupResult as any).emailPhoneMatches ?? [];
        const nameHits = (dupResult as any).nameMatches ?? [];
        if (emailPhoneHits.length > 0) { setAddDupMatches(emailPhoneHits); setAddDupNameMatches([]); return; }
        if (nameHits.length > 0) { setAddDupNameMatches(nameHits); setAddDupMatches([]); return; }
      } catch { /* ignore dup check errors */ }
    }
    try {
      const contact = await createContact.mutateAsync({
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        email: f.email || undefined,
        phone: f.phone || undefined,
        leadSourceId: f.leadSourceId ? Number(f.leadSourceId) : undefined,
      });
      await createConnection.mutateAsync({
        agentId: (user as any).id,
        contactId: contact.id,
        pipelineStatus: f.pipelineStatus as any,
      });
      toast.success(`${f.firstName} ${f.lastName} added to your pipeline`);
      setAddContactOpen(false);
      setAddContactForm({ firstName: "", lastName: "", email: "", phone: "", pipelineStatus: "new_lead", leadSourceId: "" });
      setAddDupMatches([]); setAddDupNameMatches([]);
      refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add contact");
    }
  }

  async function handleRequestConnection(contactId: number) {
    const f = addContactForm;
    try {
      await requestConn.mutateAsync({ contactId, requestedPipelineStatus: f.pipelineStatus as any });
      toast.success("Connection request submitted — an ISA or admin will review it shortly");
      setAddContactOpen(false);
      setAddContactForm({ firstName: "", lastName: "", email: "", phone: "", pipelineStatus: "new_lead", leadSourceId: "" });
      setAddDupMatches([]); setAddDupNameMatches([]);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit request");
    }
  }

  const update = trpc.agentConnections.update.useMutation({
    onSuccess: () => { toast.success("Pipeline updated"); setEditOpen(false); setBuyBoxOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // Reset pagination whenever the result scope changes so a prior page number
  // cannot make a valid filtered result look empty.
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedStage, selectedAgentId, selectedIsaId, selectedLeadSourceId, pipelineSearch, followUpFrom, followUpTo, sortOrder]);

  function resetPage() { setCurrentPage(1); }

  function openEdit(conn: any) {
    setEditConn(conn);
    setNewStage(conn.connection.pipelineStatus ?? "new_lead");
    setFollowUpDate(conn.connection.followUpDate ? safeFormat(conn.connection.followUpDate, "yyyy-MM-dd") : "");
    setAgentNotes(conn.connection.agentNotes ?? "");
    setEditOpen(true);
  }

  function openBuyBox(conn: any) {
    setEditConn(conn);
    const c = conn.connection;
    setBuyBoxForm({
      propertyType: c.propertyType ?? "",
      minPrice: c.minPrice ?? "",
      maxPrice: c.maxPrice ?? "",
      minBeds: c.minBeds != null ? String(c.minBeds) : "",
      maxBeds: c.maxBeds != null ? String(c.maxBeds) : "",
      minBaths: c.minBaths ?? "",
      minSqft: c.minSqft != null ? String(c.minSqft) : "",
      maxSqft: c.maxSqft != null ? String(c.maxSqft) : "",
      targetCities: (c.targetCities ?? []).join(", "),
      targetZips: (c.targetZips ?? []).join(", "),
      strRequirements: c.strRequirements ?? "",
      investmentNotes: c.investmentNotes ?? "",
    });
    setBuyBoxOpen(true);
  }

  function saveBuyBox() {
    update.mutate({
      id: editConn.connection.id,
      data: {
        buyBox: {
          propertyType: buyBoxForm.propertyType || null,
          minPrice: buyBoxForm.minPrice || null,
          maxPrice: buyBoxForm.maxPrice || null,
          minBeds: buyBoxForm.minBeds ? parseInt(buyBoxForm.minBeds) : null,
          maxBeds: buyBoxForm.maxBeds ? parseInt(buyBoxForm.maxBeds) : null,
          minBaths: buyBoxForm.minBaths || null,
          minSqft: buyBoxForm.minSqft ? parseInt(buyBoxForm.minSqft) : null,
          maxSqft: buyBoxForm.maxSqft ? parseInt(buyBoxForm.maxSqft) : null,
          targetCities: buyBoxForm.targetCities ? buyBoxForm.targetCities.split(",").map(s => s.trim()).filter(Boolean) : null,
          targetZips: buyBoxForm.targetZips ? buyBoxForm.targetZips.split(",").map(s => s.trim()).filter(Boolean) : null,
          strRequirements: buyBoxForm.strRequirements || null,
          investmentNotes: buyBoxForm.investmentNotes || null,
        },
      },
    });
  }

  function hasBuyBox(conn: any) {
    const c = conn.connection;
    return c.minPrice || c.maxPrice || c.propertyType || (c.targetCities && c.targetCities.length > 0);
  }

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle="Track and manage leads through every stage of the agent pipeline"
        actions={
          (user as any)?.role === "agent" ? (
            <Button size="sm" onClick={() => setAddContactOpen(true)}>
              <UserPlus className="h-4 w-4 mr-1.5" /> Add Contact
            </Button>
          ) : undefined
        }
      />

      {/* Stage Summary Cards */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-5">
        {PIPELINE_STAGES.map((s) => (
          <button
            key={s.value}
            onClick={() => { setSelectedStage(selectedStage === s.value ? "all" : s.value); resetPage(); }}
            className={`p-3 rounded-lg border text-left transition-all ${
              selectedStage === s.value
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border bg-card hover:bg-muted/30"
            }`}
          >
            <p className="text-lg font-bold text-foreground">{stageCounts[s.value] ?? 0}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Filters — visible to admin and ISA only */}
      {(user as any)?.role !== "agent" && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Agent:</span>
            <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents ({fullPipelineTotal.toLocaleString()})</SelectItem>
                {(agents as any[]).map((a: any) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name} ({Number(agentCounts[String(a.id)] ?? 0).toLocaleString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">ISA:</span>
            <Select value={selectedIsaId} onValueChange={setSelectedIsaId}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="All ISAs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ISAs ({fullPipelineTotal.toLocaleString()})</SelectItem>
                <SelectItem value="unassigned">Unassigned ({Number(isaCounts.unassigned ?? 0).toLocaleString()})</SelectItem>
                {(isas as any[]).map((u: any) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name ?? `ISA #${u.id}`} ({Number(isaCounts[String(u.id)] ?? 0).toLocaleString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Lead Source:</span>
            <Select value={selectedLeadSourceId} onValueChange={setSelectedLeadSourceId}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="All Lead Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Lead Sources ({fullPipelineTotal.toLocaleString()})</SelectItem>
                <SelectItem value="unassigned">Unassigned ({Number(leadSourceCounts.unassigned ?? 0).toLocaleString()})</SelectItem>
                {(() => {
                  const allSources = leadSourcesData as any[];
                  const parents = allSources.filter((ls) => !ls.ls.parentId);
                  const children = allSources.filter((ls) => ls.ls.parentId);
                  const orphans = children.filter((ls) => !allSources.find((p) => p.ls.id === ls.ls.parentId));
                  return (
                    <>
                      {parents.map((parent) => {
                        const subs = children.filter((c) => c.ls.parentId === parent.ls.id);
                        return subs.length > 0 ? (
                          <SelectGroup key={parent.ls.id}>
                            <SelectLabel className="text-xs font-semibold text-foreground px-2 py-1">
                              {parent.ls.name} ({(
                                Number(leadSourceCounts[String(parent.ls.id)] ?? 0)
                                + subs.reduce((sum, sub) => sum + Number(leadSourceCounts[String(sub.ls.id)] ?? 0), 0)
                              ).toLocaleString()})
                            </SelectLabel>
                            {subs.map((sub) => (
                              <SelectItem key={sub.ls.id} value={String(sub.ls.id)} className="pl-5">
                                {sub.ls.name} ({Number(leadSourceCounts[String(sub.ls.id)] ?? 0).toLocaleString()})
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ) : (
                          <SelectItem key={parent.ls.id} value={String(parent.ls.id)}>
                            {parent.ls.name} ({Number(leadSourceCounts[String(parent.ls.id)] ?? 0).toLocaleString()})
                          </SelectItem>
                        );
                      })}
                      {orphans.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="text-xs font-semibold text-foreground px-2 py-1">Other</SelectLabel>
                          {orphans.map((ls) => (
                            <SelectItem key={ls.ls.id} value={String(ls.ls.id)}>
                              {ls.ls.name} ({Number(leadSourceCounts[String(ls.ls.id)] ?? 0).toLocaleString()})
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </>
                  );
                })()}
              </SelectContent>
            </Select>
          </div>
          {(selectedAgentId !== "all" || selectedIsaId !== "all" || selectedLeadSourceId !== "all" || pipelineSearch || followUpFrom || followUpTo || selectedStage !== "all") && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => { setSelectedAgentId("all"); setSelectedIsaId("all"); setSelectedLeadSourceId("all"); setPipelineSearch(""); setFollowUpFrom(""); setFollowUpTo(""); setSelectedStage("all"); resetPage(); }}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Search + Follow-up date range — visible to all roles */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => setSortOrder(o => o === "asc" ? "desc" : "asc")}
          title={sortOrder === "asc" ? "Sorted A → Z" : "Sorted Z → A"}
        >
          {sortOrder === "asc" ? <><ArrowUpAZ className="h-3.5 w-3.5" /><span className="hidden sm:inline">A → Z</span></> : <><ArrowDownAZ className="h-3.5 w-3.5" /><span className="hidden sm:inline">Z → A</span></>}
        </Button>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, email..."
            value={pipelineSearch}
            onChange={(e) => setPipelineSearch(e.target.value)}
            className="pl-9 h-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Follow-up:</span>
          <input
            type="date"
            value={followUpFrom}
            onChange={(e) => setFollowUpFrom(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            title="Follow-up from"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="date"
            value={followUpTo}
            onChange={(e) => setFollowUpTo(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            title="Follow-up to"
          />
        </div>
      </div>


      {/* Filter-aware insights — collapsed by default to preserve page density */}
      <Collapsible open={statsOpen} onOpenChange={setStatsOpen} className="mb-3">
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 w-full justify-between px-3 text-xs">
            <span className="flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
              Pipeline insights
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {(pipelineStats?.total ?? totalConnections).toLocaleString()} in current view
              </Badge>
            </span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${statsOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2 border-primary/15 bg-muted/10">
            <CardContent className="p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                {[
                  { label: "Total", value: pipelineStats?.total ?? 0 },
                  { label: "Open", value: pipelineStats?.openCount ?? 0 },
                  { label: "Avg. age", value: `${Math.round(pipelineStats?.avgAgeDays ?? 0)}d` },
                  { label: "Oldest", value: `${pipelineStats?.oldestAgeDays ?? 0}d` },
                  { label: "Stale 7+d", value: pipelineStats?.staleCount ?? 0, warn: (pipelineStats?.staleCount ?? 0) > 0 },
                  { label: "Overdue", value: pipelineStats?.overdueFollowUps ?? 0, warn: (pipelineStats?.overdueFollowUps ?? 0) > 0 },
                  { label: "Due today", value: pipelineStats?.dueToday ?? 0 },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-md border bg-background px-3 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                    <p className={`mt-0.5 text-lg font-bold ${metric.warn ? "text-orange-600 dark:text-orange-400" : "text-foreground"}`}>
                      {typeof metric.value === "number" ? metric.value.toLocaleString() : metric.value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground lg:w-32">
                  <CalendarClock className="h-3.5 w-3.5" /> Aging of open leads
                </div>
                <div className="grid flex-1 grid-cols-5 gap-1.5">
                  {[
                    { key: "fresh", label: "0–2d", tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
                    { key: "idle", label: "3–6d", tone: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
                    { key: "stale", label: "7–13d", tone: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
                    { key: "aging", label: "14–29d", tone: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
                    { key: "critical", label: "30+d", tone: "bg-rose-200 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300" },
                  ].map((bucket) => {
                    const value = Number(pipelineStats?.agingBuckets?.[bucket.key as keyof typeof pipelineStats.agingBuckets] ?? 0);
                    const openCount = Math.max(pipelineStats?.openCount ?? 0, 1);
                    return (
                      <div key={bucket.key} className={`rounded-md px-2 py-1.5 text-center ${bucket.tone}`} title={`${Math.round((value / openCount) * 100)}% of open leads`}>
                        <p className="text-sm font-bold">{value.toLocaleString()}</p>
                        <p className="text-[10px] font-medium">{bucket.label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">Age is measured from the lead’s most recent pipeline update. Terminal stages are excluded from aging and follow-up alerts.</p>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Pipeline Table */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">
          {totalConnections > 0 ? (
            <>Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalConnections)} of <strong>{totalConnections.toLocaleString()}</strong> entries{selectedStage !== "all" ? ` in "${PIPELINE_STAGES.find(s => s.value === selectedStage)?.label}"` : ""}</>
          ) : "No entries found"}
        </p>
      </div>
      <Card>
        <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Contact</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Agent</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Stage</th>
                {(user as any)?.role !== "agent" && (
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">ISA Status</th>
                )}
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">
                  <span title="Buy Box: the buyer's preferred property criteria — price range, location, type, and size.">Buy Box ⓘ</span>
                </th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Follow-up</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Aging</th>
                <th className="py-3 px-4 text-muted-foreground font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {connections.length === 0 ? (
                <tr>
                  <td colSpan={(user as any)?.role === "agent" ? 7 : 8} className="text-center py-10 text-muted-foreground">
                    No pipeline entries found
                  </td>
                </tr>
              ) : (
                connections.map((row) => {
                  const { connection, contact, agent } = row;
                  // Aging indicator
                  const now = Date.now();
                  const lastTouched = connection.updatedAt
                    ? new Date(connection.updatedAt).getTime()
                    : new Date(connection.createdAt).getTime();
                  const daysSinceTouch = Math.floor((now - lastTouched) / (1000 * 60 * 60 * 24));
                  const isTerminal = ['closed', 'dead'].includes(connection.pipelineStatus ?? '');
                  const isUnassigned = !connection.agentId;
                  const isUntouched = !isTerminal && !isUnassigned && daysSinceTouch >= 3;
                  const isStale = !isTerminal && !isUnassigned && daysSinceTouch >= 7;

                  const buyBoxSummary = connection.minPrice || connection.maxPrice
                    ? `$${Number(connection.minPrice ?? 0).toLocaleString()}–$${Number(connection.maxPrice ?? 0).toLocaleString()}`
                    : connection.propertyType ?? null;
                  return (
                    <tr key={connection.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="py-3 px-4">
                        <button
                          className="font-medium hover:text-primary text-left"
                          onClick={() => navigate(`/pipeline/${connection.id}`)}
                        >
                          {contact?.firstName} {contact?.lastName}
                        </button>
                        {contact?.email && (
                          <p className="text-xs text-muted-foreground">{formatEmail(contact.email)}</p>
                        )}
                        {((row as any).leadSource?.name || contact?.leadSourceType) && (
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {(row as any).parentLeadSource?.name && (
                              <>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground font-medium whitespace-nowrap">
                                  {(row as any).parentLeadSource.name}
                                </span>
                                <span className="text-muted-foreground text-[10px]">›</span>
                              </>
                            )}
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary font-semibold whitespace-nowrap">
                              {(row as any).leadSource?.name || contact?.leadSourceType?.replace(/_/g, ' ')}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-sm">
                        {agent?.name ?? "—"}
                      </td>
                      <td className="py-3 px-4">
                        <PipelineStatusBadge status={connection.pipelineStatus} />
                      </td>
                      {(user as any)?.role !== "agent" && (
                        <td className="py-3 px-4">
                          {contact?.isaStatus ? (
                            <IsaStatusBadge status={contact.isaStatus} />
                          ) : (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                        </td>
                      )}
                      <td className="py-3 px-4">
                        {buyBoxSummary ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-foreground font-medium">{buyBoxSummary}</span>
                            {connection.propertyType && (
                              <Badge variant="secondary" className="text-xs">{connection.propertyType}</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Not set</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {connection.followUpDate
                          ? safeFormat(connection.followUpDate, "MMM d, yyyy")
                          : "—"}
                      </td>
                      <td className="py-3 px-4">
                        {isTerminal ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : isUnassigned ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            <AlertTriangle className="h-3 w-3" /> Unassigned
                          </span>
                        ) : isStale ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" title={`${daysSinceTouch} days since last activity`}>
                            <AlertTriangle className="h-3 w-3" /> {daysSinceTouch}d stale
                          </span>
                        ) : isUntouched ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" title={`${daysSinceTouch} days since last activity`}>
                            <Clock className="h-3 w-3" /> {daysSinceTouch}d idle
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{daysSinceTouch}d ago</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => openBuyBox(row)}
                            title="Edit Buy Box"
                          >
                            <Home className="h-3.5 w-3.5 mr-1" />
                            Buy Box
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => openEdit(row)}
                            title="Update Stage"
                          >
                            <Edit2 className="h-3.5 w-3.5 mr-1" />
                            Stage
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => navigate(`/pipeline/${connection.id}`)}
                            title="View Detail"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table></div></CardContent>
      </Card>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              «
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              ‹ Prev
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                const page = start + i;
                return (
                  <Button
                    key={page}
                    variant={page === currentPage ? "default" : "outline"}
                    size="sm"
                    className="w-8 h-8 p-0"
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next ›
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              »
            </Button>
          </div>
        </div>
      )}

      {/* Edit Stage Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update Pipeline Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Pipeline Stage</Label>
              <Select value={newStage} onValueChange={setNewStage}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIPELINE_STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Follow-up Date</Label>
              <Input
                type="date"
                className="mt-1"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Agent Notes</Label>
              <Textarea
                className="mt-1"
                rows={3}
                value={agentNotes}
                onChange={(e) => setAgentNotes(e.target.value)}
                placeholder="Notes about this lead..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={() => update.mutate({
                id: editConn.connection.id,
                data: {
                  pipelineStatus: newStage as any,
                  followUpDate: followUpDate || null,
                  agentNotes: agentNotes || null,
                },
              })}
              disabled={update.isPending}
            >
              {update.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Buy Box Dialog */}
      <Dialog open={buyBoxOpen} onOpenChange={setBuyBoxOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Home className="h-4 w-4" />
              Edit Buy Box — {editConn?.contact?.firstName} {editConn?.contact?.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Property Type</Label>
              <Input
                className="mt-1"
                placeholder="e.g. Single Family, Condo, STR, Multi-family"
                value={buyBoxForm.propertyType}
                onChange={(e) => setBuyBoxForm(f => ({ ...f, propertyType: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Min Price</Label>
                <Input
                  className="mt-1"
                  placeholder="e.g. 300000"
                  value={buyBoxForm.minPrice}
                  onChange={(e) => setBuyBoxForm(f => ({ ...f, minPrice: e.target.value }))}
                />
              </div>
              <div>
                <Label>Max Price</Label>
                <Input
                  className="mt-1"
                  placeholder="e.g. 800000"
                  value={buyBoxForm.maxPrice}
                  onChange={(e) => setBuyBoxForm(f => ({ ...f, maxPrice: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Min Beds</Label>
                <Input
                  className="mt-1"
                  type="number"
                  placeholder="e.g. 3"
                  value={buyBoxForm.minBeds}
                  onChange={(e) => setBuyBoxForm(f => ({ ...f, minBeds: e.target.value }))}
                />
              </div>
              <div>
                <Label>Max Beds</Label>
                <Input
                  className="mt-1"
                  type="number"
                  placeholder="e.g. 5"
                  value={buyBoxForm.maxBeds}
                  onChange={(e) => setBuyBoxForm(f => ({ ...f, maxBeds: e.target.value }))}
                />
              </div>
              <div>
                <Label>Min Baths</Label>
                <Input
                  className="mt-1"
                  placeholder="e.g. 2"
                  value={buyBoxForm.minBaths}
                  onChange={(e) => setBuyBoxForm(f => ({ ...f, minBaths: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Min Sqft</Label>
                <Input
                  className="mt-1"
                  type="number"
                  placeholder="e.g. 1500"
                  value={buyBoxForm.minSqft}
                  onChange={(e) => setBuyBoxForm(f => ({ ...f, minSqft: e.target.value }))}
                />
              </div>
              <div>
                <Label>Max Sqft</Label>
                <Input
                  className="mt-1"
                  type="number"
                  placeholder="e.g. 3500"
                  value={buyBoxForm.maxSqft}
                  onChange={(e) => setBuyBoxForm(f => ({ ...f, maxSqft: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Target Cities <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
              <Input
                className="mt-1"
                placeholder="e.g. Scottsdale, Phoenix, Tempe"
                value={buyBoxForm.targetCities}
                onChange={(e) => setBuyBoxForm(f => ({ ...f, targetCities: e.target.value }))}
              />
            </div>
            <div>
              <Label>Target Zip Codes <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
              <Input
                className="mt-1"
                placeholder="e.g. 85251, 85254, 85260"
                value={buyBoxForm.targetZips}
                onChange={(e) => setBuyBoxForm(f => ({ ...f, targetZips: e.target.value }))}
              />
            </div>
            <div>
              <Label>STR Requirements</Label>
              <Textarea
                className="mt-1"
                rows={2}
                placeholder="Short-term rental requirements, HOA restrictions, etc."
                value={buyBoxForm.strRequirements}
                onChange={(e) => setBuyBoxForm(f => ({ ...f, strRequirements: e.target.value }))}
              />
            </div>
            <div>
              <Label>Investment Notes</Label>
              <Textarea
                className="mt-1"
                rows={2}
                placeholder="Investment goals, cap rate targets, financing notes..."
                value={buyBoxForm.investmentNotes}
                onChange={(e) => setBuyBoxForm(f => ({ ...f, investmentNotes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBuyBoxOpen(false)}>Cancel</Button>
            <Button onClick={saveBuyBox} disabled={update.isPending}>
              {update.isPending ? "Saving..." : "Save Buy Box"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Contact Dialog */}
      <Dialog open={addContactOpen} onOpenChange={(open) => { setAddContactOpen(open); if (!open) { setAddDupMatches([]); setAddDupNameMatches([]); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Contact to Pipeline</DialogTitle>
          </DialogHeader>
          {/* Hard block: email/phone duplicate */}
          {addDupMatches.length > 0 ? (
            <div className="space-y-3 py-2">
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive mb-2">A contact with this email or phone already exists:</p>
                {addDupMatches.map((m: any) => (
                  <div key={m.id} className="text-sm text-foreground mb-1">
                    <span className="font-medium">{m.firstName} {m.lastName}</span>
                    {m.email && <span className="text-muted-foreground ml-2">{m.email}</span>}
                    {m.phone && <span className="text-muted-foreground ml-2">{m.phone}</span>}
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">You cannot create a duplicate contact. Would you like to request a connection to this existing contact instead?</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setAddDupMatches([]); }}>Go Back</Button>
                <Button onClick={() => handleRequestConnection(addDupMatches[0].id)} disabled={requestConn.isPending}>
                  {requestConn.isPending ? "Submitting..." : "Request Connection"}
                </Button>
              </DialogFooter>
            </div>
          ) : addDupNameMatches.length > 0 ? (
            <div className="space-y-3 py-2">
              <div className="rounded-md border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 p-3">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">A contact with a similar name might already exist:</p>
                {addDupNameMatches.map((m: any) => (
                  <div key={m.id} className="text-sm text-foreground mb-1">
                    <span className="font-medium">{m.firstName} {m.lastName}</span>
                    {m.email && <span className="text-muted-foreground ml-2">{m.email}</span>}
                    {m.phone && <span className="text-muted-foreground ml-2">{m.phone}</span>}
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">Are you sure you want to add this as a new contact, or would you like to request a connection to the existing one?</p>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => { setAddDupNameMatches([]); }}>Go Back</Button>
                <Button variant="outline" onClick={() => handleRequestConnection(addDupNameMatches[0].id)} disabled={requestConn.isPending}>
                  Request Connection
                </Button>
                <Button onClick={() => { setAddDupNameMatches([]); handleAddContact(true); }} disabled={createContact.isPending || createConnection.isPending}>
                  {(createContact.isPending || createConnection.isPending) ? "Adding..." : "Yes, Add as New"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>First Name <span className="text-destructive">*</span></Label>
                    <Input className="mt-1" placeholder="Jane" value={addContactForm.firstName} onChange={(e) => setAddContactForm(f => ({ ...f, firstName: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Last Name <span className="text-destructive">*</span></Label>
                    <Input className="mt-1" placeholder="Smith" value={addContactForm.lastName} onChange={(e) => setAddContactForm(f => ({ ...f, lastName: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Email {(user as any)?.role === "agent" && <span className="text-destructive">*</span>}</Label>
                  <Input className="mt-1" type="email" placeholder="jane@example.com" value={addContactForm.email} onChange={(e) => setAddContactForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <Label>Phone {(user as any)?.role === "agent" && <span className="text-destructive">*</span>}</Label>
                  <Input className="mt-1" placeholder="(555) 000-0000" value={addContactForm.phone} onChange={(e) => setAddContactForm(f => ({ ...f, phone: formatPhone(e.target.value) }))} />
                </div>
                {(user as any)?.role === "agent" && !addContactForm.email.trim() && !addContactForm.phone.trim() && (
                  <p className="text-xs text-muted-foreground">At least one of email or phone is required.</p>
                )}
                <div>
                  <Label>Lead Source</Label>
                  <LeadSourcePicker
                    className="mt-1"
                    value={addContactForm.leadSourceId ? Number(addContactForm.leadSourceId) : null}
                    onChange={(id) => setAddContactForm(f => ({ ...f, leadSourceId: id ? String(id) : "" }))}
                  />
                </div>
                <div>
                  <Label>Pipeline Stage</Label>
                  <Select value={addContactForm.pipelineStatus} onValueChange={(v) => setAddContactForm(f => ({ ...f, pipelineStatus: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PIPELINE_STAGES.map((s) => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddContactOpen(false)}>Cancel</Button>
                <Button onClick={() => handleAddContact(false)} disabled={createContact.isPending || createConnection.isPending || checkDup.isPending}>
                  {(createContact.isPending || createConnection.isPending || checkDup.isPending) ? "Checking..." : "Add to Pipeline"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
