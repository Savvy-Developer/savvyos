import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { CheckCircle, XCircle, User, Users, Clock, ArrowUpAZ, ArrowDownAZ } from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";

const PIPELINE_STATUS_LABELS: Record<string, string> = {
  new_lead: "New Lead",
  attempted_contact: "Attempted Contact",
  nurture: "Nurture",
  active_client: "Active Client",
  under_contract: "Under Contract",
  closed: "Closed",
  dead: "Dead",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  denied: "bg-red-100 text-red-800 border-red-200",
};

export default function ConnectionRequestsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "denied" | "all">("pending");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const utils = trpc.useUtils();

  const { data: requests = [], isLoading } = trpc.connectionRequests.list.useQuery({ status: statusFilter, sortOrder });

  const approveMut = trpc.connectionRequests.approve.useMutation({
    onSuccess: () => {
      toast.success("Connection approved — agent has been notified by email");
      utils.connectionRequests.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const denyMut = trpc.connectionRequests.deny.useMutation({
    onSuccess: () => {
      toast.success("Connection request denied");
      utils.connectionRequests.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (user?.role === "agent") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  const pendingCount = (requests as any[]).filter((r: any) => r.request.status === "pending").length;

  return (
    <div>
      <PageHeader
        title="Connection Requests"
        subtitle="Review and approve agent requests to connect with existing contacts"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setSortOrder(o => o === "asc" ? "desc" : "asc")}
              title={sortOrder === "asc" ? "Sorted A → Z" : "Sorted Z → A"}
            >
              {sortOrder === "asc" ? <><ArrowUpAZ className="h-4 w-4" /><span className="hidden sm:inline">A → Z</span></> : <><ArrowDownAZ className="h-4 w-4" /><span className="hidden sm:inline">Z → A</span></>}
            </Button>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4 h-20" />
            </Card>
          ))}
        </div>
      ) : (requests as any[]).length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground font-medium">
              {statusFilter === "pending" ? "No pending connection requests" : `No ${statusFilter} requests`}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              When agents request connections to existing contacts, they will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(requests as any[]).map((row: any) => {
            const req = row.request;
            const agent = row.agent;
            const contact = row.contact;
            const isPending = req.status === "pending";

            return (
              <Card key={req.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <span className="font-semibold text-sm">{agent?.name ?? "Unknown Agent"}</span>
                          <span className="text-muted-foreground text-xs">→</span>
                          <button
                            className="font-medium text-sm text-primary hover:underline"
                            onClick={() => navigate(`/contacts/${contact?.id}`)}
                          >
                            {contact?.firstName} {contact?.lastName}
                          </button>
                          <Badge
                            variant="outline"
                            className={`text-xs ${STATUS_COLORS[req.status] ?? ""}`}
                          >
                            {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {contact?.email && <span>{contact.email}</span>}
                          {contact?.phone && <span>{contact.phone}</span>}
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Requested {safeFormat(req.createdAt, "MMM d, yyyy")}
                          </span>
                        </div>
                        <div className="mt-1 text-xs">
                          <span className="text-muted-foreground">Requested stage: </span>
                          <span className="font-medium">
                            {PIPELINE_STATUS_LABELS[req.requestedPipelineStatus] ?? req.requestedPipelineStatus}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isPending && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 h-8"
                          onClick={() => denyMut.mutate({ id: req.id })}
                          disabled={denyMut.isPending}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Deny
                        </Button>
                        <Button
                          size="sm"
                          className="h-8"
                          onClick={() => approveMut.mutate({ id: req.id })}
                          disabled={approveMut.isPending}
                        >
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />
                          Approve
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
