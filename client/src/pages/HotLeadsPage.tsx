import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import PageHeader from "@/components/PageHeader";
import {
  Eye,
  ChevronLeft,
  ChevronRight,
  Flame,
  ExternalLink,
  Loader2,
  CalendarDays,
  Mail,
  MousePointerClick,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

type DaysFilter = "7" | "14" | "30" | "90";
type SortDir = "asc" | "desc";

// Sort keys for each tab
type PVSortKey = "viewCount" | "lastViewed" | "contact" | "leadSource";
type RVSortKey = "distinctDays" | "totalViews" | "lastViewed" | "contact" | "leadSource";
type EESortKey = "clicks" | "opens" | "lastEngaged" | "contact" | "leadSource";

const PIPELINE_STATUSES = [
  { value: "new_lead", label: "New Lead" },
  { value: "attempted_contact", label: "Attempted Contact" },
  { value: "nurture", label: "Nurture" },
  { value: "active_client", label: "Active Client" },
  { value: "under_contract", label: "Under Contract" },
  { value: "closed", label: "Closed" },
  { value: "dead", label: "Dead" },
];

export default function HotLeadsPage() {
  const { user } = useAuth();
  const role = (user as any)?.role as string | undefined;
  const isAgent = role === "agent";
  const isAdminOrIsa = role === "admin" || role === "isa";

  const [activeTab, setActiveTab] = useState("property-views");
  const [pvPage, setPvPage] = useState(1);
  const [rvPage, setRvPage] = useState(1);
  const [eePage, setEePage] = useState(1);
  const [days, setDays] = useState<DaysFilter>("7");
  const [isaFilter, setIsaFilter] = useState<string>("");
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const limit = 50;

  // Sort state for each tab
  const [pvSortKey, setPvSortKey] = useState<PVSortKey>("viewCount");
  const [pvSortDir, setPvSortDir] = useState<SortDir>("desc");
  const [rvSortKey, setRvSortKey] = useState<RVSortKey>("distinctDays");
  const [rvSortDir, setRvSortDir] = useState<SortDir>("desc");
  const [eeSortKey, setEeSortKey] = useState<EESortKey>("clicks");
  const [eeSortDir, setEeSortDir] = useState<SortDir>("desc");

  // Fetch ISA and agent lists for filter dropdowns (admin/ISA only)
  const { data: usersList = [] } = trpc.users.list.useQuery(undefined, { enabled: isAdminOrIsa });
  const isas = usersList.filter((u: any) => u.role === "isa");
  const agents = usersList.filter((u: any) => u.role === "agent");

  // Build query params
  const baseParams = {
    days,
    limit,
    ...(isAdminOrIsa && isaFilter ? { isaId: parseInt(isaFilter) } : {}),
    ...(isAdminOrIsa && agentFilter ? { agentId: parseInt(agentFilter) } : {}),
    ...(isAgent && statusFilter ? { pipelineStatus: statusFilter } : {}),
  };

  // Queries for each tab
  const propertyViews = trpc.hotLeads.propertyViews.useQuery(
    { ...baseParams, page: pvPage },
    { enabled: activeTab === "property-views" }
  );
  const returnVisitors = trpc.hotLeads.returnVisitors.useQuery(
    { ...baseParams, page: rvPage },
    { enabled: activeTab === "return-visitors" }
  );
  const emailEngagement = trpc.hotLeads.emailEngagement.useQuery(
    { ...baseParams, page: eePage },
    { enabled: activeTab === "email-engagement" }
  );

  // Client-side sorting for Property Views
  const sortedPvItems = useMemo(() => {
    const items = propertyViews.data?.items ?? [];
    if (!items.length) return items;
    const sorted = [...items];
    sorted.sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      switch (pvSortKey) {
        case "viewCount": aVal = a.viewCount ?? 0; bVal = b.viewCount ?? 0; break;
        case "lastViewed": aVal = a.lastViewed ? new Date(a.lastViewed).getTime() : 0; bVal = b.lastViewed ? new Date(b.lastViewed).getTime() : 0; break;
        case "contact": aVal = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim().toLowerCase(); bVal = `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim().toLowerCase(); break;
        case "leadSource": aVal = (a.leadSource ?? "").toLowerCase(); bVal = (b.leadSource ?? "").toLowerCase(); break;
        default: aVal = a.viewCount ?? 0; bVal = b.viewCount ?? 0;
      }
      if (typeof aVal === "string") {
        const cmp = aVal.localeCompare(bVal);
        return pvSortDir === "asc" ? cmp : -cmp;
      }
      return pvSortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [propertyViews.data?.items, pvSortKey, pvSortDir]);

  // Client-side sorting for Return Visitors
  const sortedRvItems = useMemo(() => {
    const items = returnVisitors.data?.items ?? [];
    if (!items.length) return items;
    const sorted = [...items];
    sorted.sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      switch (rvSortKey) {
        case "distinctDays": aVal = a.distinctDays ?? 0; bVal = b.distinctDays ?? 0; break;
        case "totalViews": aVal = a.totalViews ?? 0; bVal = b.totalViews ?? 0; break;
        case "lastViewed": aVal = a.lastViewed ? new Date(a.lastViewed).getTime() : 0; bVal = b.lastViewed ? new Date(b.lastViewed).getTime() : 0; break;
        case "contact": aVal = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim().toLowerCase(); bVal = `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim().toLowerCase(); break;
        case "leadSource": aVal = (a.leadSource ?? "").toLowerCase(); bVal = (b.leadSource ?? "").toLowerCase(); break;
        default: aVal = a.distinctDays ?? 0; bVal = b.distinctDays ?? 0;
      }
      if (typeof aVal === "string") {
        const cmp = aVal.localeCompare(bVal);
        return rvSortDir === "asc" ? cmp : -cmp;
      }
      return rvSortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [returnVisitors.data?.items, rvSortKey, rvSortDir]);

  // Client-side sorting for Email Engagement
  const sortedEeItems = useMemo(() => {
    const items = emailEngagement.data?.items ?? [];
    if (!items.length) return items;
    const sorted = [...items];
    sorted.sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      switch (eeSortKey) {
        case "clicks": aVal = a.clicks ?? 0; bVal = b.clicks ?? 0; break;
        case "opens": aVal = a.opens ?? 0; bVal = b.opens ?? 0; break;
        case "lastEngaged": aVal = a.lastEngaged ? new Date(a.lastEngaged).getTime() : 0; bVal = b.lastEngaged ? new Date(b.lastEngaged).getTime() : 0; break;
        case "contact": aVal = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim().toLowerCase(); bVal = `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim().toLowerCase(); break;
        case "leadSource": aVal = (a.leadSource ?? "").toLowerCase(); bVal = (b.leadSource ?? "").toLowerCase(); break;
        default: aVal = a.clicks ?? 0; bVal = b.clicks ?? 0;
      }
      if (typeof aVal === "string") {
        const cmp = aVal.localeCompare(bVal);
        return eeSortDir === "asc" ? cmp : -cmp;
      }
      return eeSortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [emailEngagement.data?.items, eeSortKey, eeSortDir]);

  // Sort handlers
  const handlePvSort = (key: PVSortKey) => {
    if (pvSortKey === key) {
      setPvSortDir(pvSortDir === "asc" ? "desc" : "asc");
    } else {
      setPvSortKey(key);
      setPvSortDir("desc");
    }
  };

  const handleRvSort = (key: RVSortKey) => {
    if (rvSortKey === key) {
      setRvSortDir(rvSortDir === "asc" ? "desc" : "asc");
    } else {
      setRvSortKey(key);
      setRvSortDir("desc");
    }
  };

  const handleEeSort = (key: EESortKey) => {
    if (eeSortKey === key) {
      setEeSortDir(eeSortDir === "asc" ? "desc" : "asc");
    } else {
      setEeSortKey(key);
      setEeSortDir("desc");
    }
  };

  const handleDaysChange = (newDays: DaysFilter) => {
    setDays(newDays);
    resetPages();
  };

  const resetPages = () => {
    setPvPage(1);
    setRvPage(1);
    setEePage(1);
  };

  const handleIsaChange = (val: string) => {
    setIsaFilter(val === "all" ? "" : val);
    resetPages();
  };

  const handleAgentChange = (val: string) => {
    setAgentFilter(val === "all" ? "" : val);
    resetPages();
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val === "all" ? "" : val);
    resetPages();
  };

  // Sort icon component
  const SortIcon = ({ col, activeKey, activeDir }: { col: string; activeKey: string; activeDir: SortDir }) => {
    if (activeKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
    return activeDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <PageHeader
        title="Hot Leads"
        subtitle="Contacts showing high engagement signals — prioritize outreach to these leads"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4 flex overflow-x-auto h-auto gap-0 w-full" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          <TabsTrigger value="property-views" className="shrink-0 whitespace-nowrap gap-2">
            <Eye className="h-4 w-4" />
            Property Views
          </TabsTrigger>
          <TabsTrigger value="return-visitors" className="shrink-0 whitespace-nowrap gap-2">
            <CalendarDays className="h-4 w-4" />
            Return Visitors
          </TabsTrigger>
          <TabsTrigger value="email-engagement" className="shrink-0 whitespace-nowrap gap-2">
            <Mail className="h-4 w-4" />
            Email Engagement
          </TabsTrigger>
        </TabsList>

        {/* ─── Property Views Tab ─────────────────────────────────────────── */}
        <TabsContent value="property-views">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <FiltersBar
                days={days}
                onDaysChange={handleDaysChange}
                isAdminOrIsa={isAdminOrIsa}
                isAgent={isAgent}
                isas={isas}
                agents={agents}
                isaFilter={isaFilter}
                agentFilter={agentFilter}
                statusFilter={statusFilter}
                onIsaChange={handleIsaChange}
                onAgentChange={handleAgentChange}
                onStatusChange={handleStatusChange}
              />
              <DataTable
                isLoading={propertyViews.isLoading}
                emptyIcon={<Eye className="h-10 w-10 mb-3 opacity-40" />}
                emptyMessage={`No property views in the last ${days} days`}
                totalCount={propertyViews.data?.totalCount ?? 0}
                summaryText={`viewed properties in the last ${days} days`}
                page={pvPage}
                totalPages={propertyViews.data?.totalPages ?? 1}
                onPageChange={setPvPage}
                limit={limit}
                headers={
                  <>
                    <TableHead className="w-[50px] text-center">#</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handlePvSort("contact")}>
                      <span className="inline-flex items-center">Contact <SortIcon col="contact" activeKey={pvSortKey} activeDir={pvSortDir} /></span>
                    </TableHead>
                    <TableHead className="text-center cursor-pointer select-none" onClick={() => handlePvSort("viewCount")}>
                      <span className="inline-flex items-center justify-center w-full">Views <SortIcon col="viewCount" activeKey={pvSortKey} activeDir={pvSortDir} /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handlePvSort("lastViewed")}>
                      <span className="inline-flex items-center">Last Viewed <SortIcon col="lastViewed" activeKey={pvSortKey} activeDir={pvSortDir} /></span>
                    </TableHead>
                    <TableHead>Last Property</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handlePvSort("leadSource")}>
                      <span className="inline-flex items-center">Lead Source <SortIcon col="leadSource" activeKey={pvSortKey} activeDir={pvSortDir} /></span>
                    </TableHead>
                    {!isAgent && <TableHead>Assigned ISA</TableHead>}
                    {!isAgent && <TableHead>Connected Agents</TableHead>}
                  </>
                }
                rows={sortedPvItems.map((lead, idx) => (
                  <TableRow key={lead.contactId} className="hover:bg-muted/50">
                    <TableCell className="text-center text-muted-foreground text-xs">
                      {(pvPage - 1) * limit + idx + 1}
                    </TableCell>
                    <TableCell>
                      <ContactCell lead={lead} isAgent={isAgent} />
                    </TableCell>
                    <TableCell className="text-center">
                      <ViewCountBadge count={lead.viewCount} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatRelativeDate(lead.lastViewed)}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate" title={lead.lastPropertyAddress ?? ""}>
                      {lead.lastPropertyAddress || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.leadSource || "—"}
                    </TableCell>
                    {!isAgent && (
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.assignedIsa || "—"}
                      </TableCell>
                    )}
                    {!isAgent && (
                      <TableCell className="text-sm text-muted-foreground">
                        <AgentsList agents={lead.connectedAgents} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Return Visitors Tab ────────────────────────────────────────── */}
        <TabsContent value="return-visitors">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <FiltersBar
                days={days}
                onDaysChange={handleDaysChange}
                isAdminOrIsa={isAdminOrIsa}
                isAgent={isAgent}
                isas={isas}
                agents={agents}
                isaFilter={isaFilter}
                agentFilter={agentFilter}
                statusFilter={statusFilter}
                onIsaChange={handleIsaChange}
                onAgentChange={handleAgentChange}
                onStatusChange={handleStatusChange}
              />
              <DataTable
                isLoading={returnVisitors.isLoading}
                emptyIcon={<CalendarDays className="h-10 w-10 mb-3 opacity-40" />}
                emptyMessage={`No return visitors in the last ${days} days`}
                totalCount={returnVisitors.data?.totalCount ?? 0}
                summaryText={`came back on multiple days in the last ${days} days`}
                page={rvPage}
                totalPages={returnVisitors.data?.totalPages ?? 1}
                onPageChange={setRvPage}
                limit={limit}
                headers={
                  <>
                    <TableHead className="w-[50px] text-center">#</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleRvSort("contact")}>
                      <span className="inline-flex items-center">Contact <SortIcon col="contact" activeKey={rvSortKey} activeDir={rvSortDir} /></span>
                    </TableHead>
                    <TableHead className="text-center cursor-pointer select-none" onClick={() => handleRvSort("distinctDays")}>
                      <span className="inline-flex items-center justify-center w-full">Days Active <SortIcon col="distinctDays" activeKey={rvSortKey} activeDir={rvSortDir} /></span>
                    </TableHead>
                    <TableHead className="text-center cursor-pointer select-none" onClick={() => handleRvSort("totalViews")}>
                      <span className="inline-flex items-center justify-center w-full">Total Views <SortIcon col="totalViews" activeKey={rvSortKey} activeDir={rvSortDir} /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleRvSort("lastViewed")}>
                      <span className="inline-flex items-center">Last Viewed <SortIcon col="lastViewed" activeKey={rvSortKey} activeDir={rvSortDir} /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleRvSort("leadSource")}>
                      <span className="inline-flex items-center">Lead Source <SortIcon col="leadSource" activeKey={rvSortKey} activeDir={rvSortDir} /></span>
                    </TableHead>
                    {!isAgent && <TableHead>Assigned ISA</TableHead>}
                    {!isAgent && <TableHead>Connected Agents</TableHead>}
                  </>
                }
                rows={sortedRvItems.map((lead, idx) => (
                  <TableRow key={lead.contactId} className="hover:bg-muted/50">
                    <TableCell className="text-center text-muted-foreground text-xs">
                      {(rvPage - 1) * limit + idx + 1}
                    </TableCell>
                    <TableCell>
                      <ContactCell lead={lead} isAgent={isAgent} />
                    </TableCell>
                    <TableCell className="text-center">
                      <DaysBadge count={lead.distinctDays} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{lead.totalViews}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatRelativeDate(lead.lastViewed)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.leadSource || "—"}
                    </TableCell>
                    {!isAgent && (
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.assignedIsa || "—"}
                      </TableCell>
                    )}
                    {!isAgent && (
                      <TableCell className="text-sm text-muted-foreground">
                        <AgentsList agents={lead.connectedAgents} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Email Engagement Tab ───────────────────────────────────────── */}
        <TabsContent value="email-engagement">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <FiltersBar
                days={days}
                onDaysChange={handleDaysChange}
                isAdminOrIsa={isAdminOrIsa}
                isAgent={isAgent}
                isas={isas}
                agents={agents}
                isaFilter={isaFilter}
                agentFilter={agentFilter}
                statusFilter={statusFilter}
                onIsaChange={handleIsaChange}
                onAgentChange={handleAgentChange}
                onStatusChange={handleStatusChange}
              />
              <DataTable
                isLoading={emailEngagement.isLoading}
                emptyIcon={<Mail className="h-10 w-10 mb-3 opacity-40" />}
                emptyMessage={`No email engagement in the last ${days} days`}
                totalCount={emailEngagement.data?.totalCount ?? 0}
                summaryText={`engaged with emails in the last ${days} days`}
                page={eePage}
                totalPages={emailEngagement.data?.totalPages ?? 1}
                onPageChange={setEePage}
                limit={limit}
                headers={
                  <>
                    <TableHead className="w-[50px] text-center">#</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleEeSort("contact")}>
                      <span className="inline-flex items-center">Contact <SortIcon col="contact" activeKey={eeSortKey} activeDir={eeSortDir} /></span>
                    </TableHead>
                    <TableHead className="text-center cursor-pointer select-none" onClick={() => handleEeSort("clicks")}>
                      <span className="inline-flex items-center justify-center w-full">Clicks <SortIcon col="clicks" activeKey={eeSortKey} activeDir={eeSortDir} /></span>
                    </TableHead>
                    <TableHead className="text-center cursor-pointer select-none" onClick={() => handleEeSort("opens")}>
                      <span className="inline-flex items-center justify-center w-full">Opens <SortIcon col="opens" activeKey={eeSortKey} activeDir={eeSortDir} /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleEeSort("lastEngaged")}>
                      <span className="inline-flex items-center">Last Engaged <SortIcon col="lastEngaged" activeKey={eeSortKey} activeDir={eeSortDir} /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleEeSort("leadSource")}>
                      <span className="inline-flex items-center">Lead Source <SortIcon col="leadSource" activeKey={eeSortKey} activeDir={eeSortDir} /></span>
                    </TableHead>
                    {!isAgent && <TableHead>Assigned ISA</TableHead>}
                    {!isAgent && <TableHead>Connected Agents</TableHead>}
                  </>
                }
                rows={sortedEeItems.map((lead, idx) => (
                  <TableRow key={lead.contactId} className="hover:bg-muted/50">
                    <TableCell className="text-center text-muted-foreground text-xs">
                      {(eePage - 1) * limit + idx + 1}
                    </TableCell>
                    <TableCell>
                      <ContactCell lead={lead} isAgent={isAgent} />
                    </TableCell>
                    <TableCell className="text-center">
                      <ClicksBadge count={lead.clicks} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{lead.opens}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatRelativeDate(lead.lastEngaged)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.leadSource || "—"}
                    </TableCell>
                    {!isAgent && (
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.assignedIsa || "—"}
                      </TableCell>
                    )}
                    {!isAgent && (
                      <TableCell className="text-sm text-muted-foreground">
                        <AgentsList agents={lead.connectedAgents} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────

function FiltersBar({
  days,
  onDaysChange,
  isAdminOrIsa,
  isAgent,
  isas,
  agents,
  isaFilter,
  agentFilter,
  statusFilter,
  onIsaChange,
  onAgentChange,
  onStatusChange,
}: {
  days: DaysFilter;
  onDaysChange: (d: DaysFilter) => void;
  isAdminOrIsa: boolean;
  isAgent: boolean;
  isas: any[];
  agents: any[];
  isaFilter: string;
  agentFilter: string;
  statusFilter: string;
  onIsaChange: (v: string) => void;
  onAgentChange: (v: string) => void;
  onStatusChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b">
      {/* Time range */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Time:</span>
        <div className="flex items-center gap-1">
          {(["7", "14", "30", "90"] as DaysFilter[]).map((d) => (
            <Button
              key={d}
              variant={days === d ? "default" : "outline"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => onDaysChange(d)}
            >
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {/* Admin/ISA filters */}
      {isAdminOrIsa && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">ISA:</span>
            <Select value={isaFilter || "all"} onValueChange={onIsaChange}>
              <SelectTrigger className="h-7 w-[160px] text-xs">
                <SelectValue placeholder="All ISAs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ISAs</SelectItem>
                {isas.map((isa: any) => (
                  <SelectItem key={isa.id} value={String(isa.id)}>
                    {isa.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Agent:</span>
            <Select value={agentFilter || "all"} onValueChange={onAgentChange}>
              <SelectTrigger className="h-7 w-[160px] text-xs">
                <SelectValue placeholder="All Agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {agents
                  .sort((a: any, b: any) => (a.name ?? "").localeCompare(b.name ?? ""))
                  .map((agent: any) => (
                    <SelectItem key={agent.id} value={String(agent.id)}>
                      {agent.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {/* Agent filter: pipeline status */}
      {isAgent && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Status:</span>
          <Select value={statusFilter || "all"} onValueChange={onStatusChange}>
            <SelectTrigger className="h-7 w-[170px] text-xs">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {PIPELINE_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function AgentsList({ agents }: { agents: Array<{ name: string; connectionId: number }> }) {
  if (!agents || agents.length === 0) return <span>—</span>;
  if (agents.length === 1) return <span>{agents[0].name}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {agents.map((a, i) => (
        <Badge key={i} variant="secondary" className="text-xs font-normal">
          {a.name}
        </Badge>
      ))}
    </div>
  );
}

function ContactCell({ lead, isAgent }: { lead: { contactId: number; connectedAgents: Array<{ name: string; connectionId: number }>; firstName: string | null; lastName: string | null; email: string | null; phone: string | null }; isAgent: boolean }) {
  const link = isAgent && lead.connectedAgents.length > 0
    ? `/pipeline/${lead.connectedAgents[0].connectionId}`
    : `/contacts/${lead.contactId}`;

  return (
    <div className="flex flex-col">
      <a
        href={link}
        className="font-medium text-foreground hover:text-primary hover:underline flex items-center gap-1"
      >
        {lead.firstName} {lead.lastName}
        <ExternalLink className="h-3 w-3 opacity-50" />
      </a>
      <span className="text-xs text-muted-foreground">
        {lead.email || lead.phone || "—"}
      </span>
    </div>
  );
}

interface DataTableProps {
  isLoading: boolean;
  emptyIcon: React.ReactNode;
  emptyMessage: string;
  totalCount: number;
  summaryText: string;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  limit: number;
  headers: React.ReactNode;
  rows: React.ReactNode[] | undefined;
}

function DataTable({ isLoading, emptyIcon, emptyMessage, totalCount, summaryText, page, totalPages, onPageChange, limit, headers, rows }: DataTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading hot leads...</span>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        {emptyIcon}
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      {/* Summary bar */}
      <div className="flex items-center gap-4 px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-medium">
            {totalCount} contact{totalCount !== 1 ? "s" : ""} {summaryText}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>{headers}</TableRow>
          </TableHeader>
          <TableBody>{rows}</TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({totalCount} total)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Badge Components ─────────────────────────────────────────────────────────

function ViewCountBadge({ count }: { count: number }) {
  if (count >= 50) {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
        <Flame className="h-3 w-3 mr-1" />
        {count}
      </Badge>
    );
  }
  if (count >= 20) {
    return (
      <Badge className="bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800">
        <Eye className="h-3 w-3 mr-1" />
        {count}
      </Badge>
    );
  }
  if (count >= 10) {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
        {count}
      </Badge>
    );
  }
  return <Badge variant="secondary">{count}</Badge>;
}

function DaysBadge({ count }: { count: number }) {
  if (count >= 5) {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
        <CalendarDays className="h-3 w-3 mr-1" />
        {count} days
      </Badge>
    );
  }
  if (count >= 3) {
    return (
      <Badge className="bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800">
        <CalendarDays className="h-3 w-3 mr-1" />
        {count} days
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <CalendarDays className="h-3 w-3 mr-1" />
      {count} days
    </Badge>
  );
}

function ClicksBadge({ count }: { count: number }) {
  if (count >= 10) {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
        <MousePointerClick className="h-3 w-3 mr-1" />
        {count}
      </Badge>
    );
  }
  if (count >= 5) {
    return (
      <Badge className="bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800">
        <MousePointerClick className="h-3 w-3 mr-1" />
        {count}
      </Badge>
    );
  }
  if (count >= 1) {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
        <MousePointerClick className="h-3 w-3 mr-1" />
        {count}
      </Badge>
    );
  }
  return <Badge variant="secondary">0</Badge>;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "—";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  // Guard against negative values (clock skew or future timestamps)
  if (diffMs < 0) return "Just now";

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
