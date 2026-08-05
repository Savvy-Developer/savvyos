import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export default function HotLeadsPage() {
  const { user } = useAuth();
  const role = (user as any)?.role as string | undefined;
  const isAgent = role === "agent";

  const [activeTab, setActiveTab] = useState("property-views");
  const [pvPage, setPvPage] = useState(1);
  const [rvPage, setRvPage] = useState(1);
  const [eePage, setEePage] = useState(1);
  const [days, setDays] = useState<DaysFilter>("7");
  const limit = 50;

  // Queries for each tab
  const propertyViews = trpc.hotLeads.propertyViews.useQuery(
    { page: pvPage, limit, days },
    { enabled: activeTab === "property-views" }
  );
  const returnVisitors = trpc.hotLeads.returnVisitors.useQuery(
    { page: rvPage, limit, days },
    { enabled: activeTab === "return-visitors" }
  );
  const emailEngagement = trpc.hotLeads.emailEngagement.useQuery(
    { page: eePage, limit, days },
    { enabled: activeTab === "email-engagement" }
  );

  const handleDaysChange = (newDays: DaysFilter) => {
    setDays(newDays);
    setPvPage(1);
    setRvPage(1);
    setEePage(1);
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
              <DaysToggle days={days} onChange={handleDaysChange} />
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
                    {!isAgent && <TableHead>Connected Agent</TableHead>}
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
                        {lead.connectedAgent || "—"}
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
              <DaysToggle days={days} onChange={handleDaysChange} />
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
                    {!isAgent && <TableHead>Connected Agent</TableHead>}
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
                        {lead.connectedAgent || "—"}
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
              <DaysToggle days={days} onChange={handleDaysChange} />
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
                    {!isAgent && <TableHead>Connected Agent</TableHead>}
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
                        {lead.connectedAgent || "—"}
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

function DaysToggle({ days, onChange }: { days: DaysFilter; onChange: (d: DaysFilter) => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b">
      <span className="text-sm font-medium text-muted-foreground">Time range:</span>
      <div className="flex items-center gap-1">
        {(["7", "14", "30", "90"] as DaysFilter[]).map((d) => (
          <Button
            key={d}
            variant={days === d ? "default" : "outline"}
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => onChange(d)}
          >
            {d}d
          </Button>
        ))}
      </div>
    </div>
  );
}

function ContactCell({ lead, isAgent }: { lead: { contactId: number; connectionId: number | null; firstName: string | null; lastName: string | null; email: string | null; phone: string | null }; isAgent: boolean }) {
  return (
    <div className="flex flex-col">
      <a
        href={getContactLink(lead, isAgent)}
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

function getContactLink(lead: { contactId: number; connectionId: number | null }, isAgent: boolean): string {
  if (isAgent && lead.connectionId) {
    return `/pipeline/${lead.connectionId}`;
  }
  return `/contacts/${lead.contactId}`;
}

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
