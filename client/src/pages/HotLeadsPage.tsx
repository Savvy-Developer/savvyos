import { useState } from "react";
import { trpc } from "@/lib/trpc";
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
} from "lucide-react";

export default function HotLeadsPage() {
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data, isLoading } = trpc.hotLeads.propertyViews.useQuery(
    { page, limit }
  );

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <PageHeader
        title="Hot Leads"
        subtitle="Contacts showing high engagement signals — prioritize outreach to these leads"
      />

      <Tabs defaultValue="property-views" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="property-views" className="gap-2">
            <Eye className="h-4 w-4" />
            Property Views
          </TabsTrigger>
          {/* Future tabs will go here */}
        </TabsList>

        <TabsContent value="property-views">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">Loading hot leads...</span>
                </div>
              ) : !data || data.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Eye className="h-10 w-10 mb-3 opacity-40" />
                  <p className="text-sm">No property views in the last 7 days</p>
                </div>
              ) : (
                <>
                  {/* Summary bar */}
                  <div className="flex items-center gap-4 px-4 py-3 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Flame className="h-4 w-4 text-orange-500" />
                      <span className="text-sm font-medium">
                        {data.totalCount} contacts viewed properties in the last 7 days
                      </span>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px] text-center">#</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead className="text-center">Views</TableHead>
                          <TableHead>Last Viewed</TableHead>
                          <TableHead>Last Property</TableHead>
                          <TableHead>Lead Source</TableHead>
                          <TableHead>Assigned ISA</TableHead>
                          <TableHead>Connected Agent</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.items.map((lead, idx) => (
                          <TableRow key={lead.contactId} className="hover:bg-muted/50">
                            <TableCell className="text-center text-muted-foreground text-xs">
                              {(page - 1) * limit + idx + 1}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <a
                                  href={`/contacts/${lead.contactId}`}
                                  className="font-medium text-foreground hover:text-primary hover:underline flex items-center gap-1"
                                >
                                  {lead.firstName} {lead.lastName}
                                  <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                                </a>
                                <span className="text-xs text-muted-foreground">
                                  {lead.email || lead.phone || "—"}
                                </span>
                              </div>
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
                            <TableCell className="text-sm text-muted-foreground">
                              {lead.assignedIsa || "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {lead.connectedAgent || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {data.totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t">
                      <span className="text-sm text-muted-foreground">
                        Page {data.page} of {data.totalPages} ({data.totalCount} total)
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page <= 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                          disabled={page >= data.totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Helper Components ────────────────────────────────────────────────────────

function ViewCountBadge({ count }: { count: number }) {
  // Color intensity based on view count
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
  return (
    <Badge variant="secondary">
      {count}
    </Badge>
  );
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
