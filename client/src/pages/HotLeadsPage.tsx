import { useState } from "react";
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
} from "lucide-react";

type DaysFilter = "7" | "14" | "30" | "90";

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

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <PageHeader
        title="Hot Leads"
        subtitle="Contacts showing high engagement signals — prioritize outreach to these leads"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="property-views" className="gap-2">
            <Eye className="h-4 w-4" />
            Property Views
          </TabsTrigger>
          <TabsTrigger value="return-visitors" className="gap-2">
            <CalendarDays className="h-4 w-4" />
            Return Visitors
          </TabsTrigger>
          <TabsTrigger value="email-engagement" className="gap-2">
            <Mail className="h-4 w-4" />
            Email Engagement
          </TabsTrigger>
        </TabsList>

        {/* ─── Property Views Tab ─────────────────────────────────────────── */}
        <TabsContent value="property-views">
          <Card>
            <CardContent className="p-0">
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
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-center">Views</TableHead>
                    <TableHead>Last Viewed</TableHead>
                    <TableHead>Last Property</TableHead>
                    <TableHead>Lead Source</TableHead>
                    {!isAgent && <TableHead>Assigned ISA</TableHead>}
                    {!isAgent && <TableHead>Connected Agents</TableHead>}
                  </>
                }
                rows={propertyViews.data?.items.map((lead, idx) => (
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
            <CardContent className="p-0">
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
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-center">Days Active</TableHead>
                    <TableHead className="text-center">Total Views</TableHead>
                    <TableHead>Last Viewed</TableHead>
                    <TableHead>Lead Source</TableHead>
                    {!isAgent && <TableHead>Assigned ISA</TableHead>}
                    {!isAgent && <TableHead>Connected Agents</TableHead>}
                  </>
                }
                rows={returnVisitors.data?.items.map((lead, idx) => (
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
            <CardContent className="p-0">
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
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-center">Clicks</TableHead>
                    <TableHead className="text-center">Opens</TableHead>
                    <TableHead>Last Engaged</TableHead>
                    <TableHead>Lead Source</TableHead>
                    {!isAgent && <TableHead>Assigned ISA</TableHead>}
                    {!isAgent && <TableHead>Connected Agents</TableHead>}
                  </>
                }
                rows={emailEngagement.data?.items.map((lead, idx) => (
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
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
