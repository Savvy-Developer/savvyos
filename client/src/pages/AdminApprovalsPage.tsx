import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock, AlertTriangle, Users } from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";

const STATUS_CONFIG = {
  pending: { label: "Pending", icon: Clock, className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  approved: { label: "Approved", icon: CheckCircle2, className: "bg-green-100 text-green-700 border-green-200" },
  rejected: { label: "Rejected", icon: XCircle, className: "bg-red-100 text-red-700 border-red-200" },
};

export default function AdminApprovalsPage() {
  const [statusFilter, setStatusFilter] = useState<"pending" | "all" | "approved" | "rejected">("pending");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [adminNote, setAdminNote] = useState("");
  const [reviewDecision, setReviewDecision] = useState<"approved" | "rejected">("approved");

  const utils = trpc.useUtils();
  const { data: requests = [], isLoading } = trpc.approvalRequests.list.useQuery(
    { status: statusFilter },
    { refetchInterval: 30_000 }
  );

  const { data: users = [] } = trpc.users.list.useQuery({});
  const { data: connections = [] } = trpc.agentConnections.list.useQuery({});

  const review = trpc.approvalRequests.review.useMutation({
    onSuccess: () => {
      toast.success(`Request ${reviewDecision === "approved" ? "approved" : "rejected"}`);
      setReviewOpen(false);
      setSelectedRequest(null);
      setAdminNote("");
      utils.approvalRequests.list.invalidate();
      utils.approvalRequests.pendingCount.invalidate();
      utils.agentConnections.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function getUserName(id: number) {
    return (users as any[]).find((u: any) => u.id === id)?.name ?? `User #${id}`;
  }

  function getConnectionSummary(targetId: number) {
    const conn = (connections as any[]).find((c: any) => c.connection.id === targetId);
    if (!conn) return `Connection #${targetId}`;
    return `${conn.contact?.firstName ?? ""} ${conn.contact?.lastName ?? ""} → ${conn.agent?.name ?? "Unknown Agent"}`;
  }

  function openReview(req: any, action: "approved" | "rejected") {
    setSelectedRequest(req);
    setReviewDecision(action);
    setAdminNote("");
    setReviewOpen(true);
  }

  const pendingCount = (requests as any[]).filter((r: any) => r.status === "pending").length;

  return (
    <div>
      <PageHeader
        title="Admin Approvals"
        subtitle="Review and action requests submitted by team members"
      />

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {(["pending", "approved", "rejected"] as const).map((s) => {
          const cfg = STATUS_CONFIG[s];
          const Icon = cfg.icon;
          const count = (requests as any[]).filter((r: any) => r.status === s).length;
          return (
            <Card key={s} className={`border ${s === "pending" && pendingCount > 0 ? "border-yellow-300 bg-yellow-50/50" : ""}`}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg border ${cfg.className}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground">{cfg.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filter tabs */}
      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)} className="mb-4">
        <TabsList>
          <TabsTrigger value="pending">
            Pending {pendingCount > 0 && <span className="ml-1.5 bg-yellow-500 text-white text-xs rounded-full px-1.5">{pendingCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Loading requests...</CardContent></Card>
      ) : (requests as any[]).length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-400" />
            <p className="text-muted-foreground font-medium">No {statusFilter !== "all" ? statusFilter : ""} requests</p>
            <p className="text-sm text-muted-foreground mt-1">All caught up!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(requests as any[]).map((req: any) => {
            const cfg = STATUS_CONFIG[req.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
            const Icon = cfg.icon;
            return (
              <Card key={req.id} className={`${req.status === "pending" ? "border-yellow-200" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`p-2 rounded-lg border shrink-0 ${cfg.className}`}>
                        {req.type === "delete_agent_connection" ? (
                          <Users className="h-4 w-4" />
                        ) : (
                          <AlertTriangle className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-medium text-sm">
                            {req.type === "delete_agent_connection" ? "Delete Agent Connection" : req.type}
                          </span>
                          <Badge variant="outline" className={`text-xs ${cfg.className}`}>
                            <Icon className="h-3 w-3 mr-1" />
                            {cfg.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">
                          <span className="font-medium text-foreground">{getUserName(req.requestedById)}</span>
                          {" "}&rarr; {getConnectionSummary(req.targetId)}
                        </p>
                        <div className="bg-muted/50 rounded-md p-2 mt-2">
                          <p className="text-xs text-muted-foreground font-medium mb-0.5">Reason:</p>
                          <p className="text-sm">{req.reason}</p>
                        </div>
                        {req.adminNote && (
                          <div className="bg-blue-50 rounded-md p-2 mt-2">
                            <p className="text-xs text-blue-600 font-medium mb-0.5">Admin note:</p>
                            <p className="text-sm text-blue-800">{req.adminNote}</p>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          Submitted {safeFormat(req.createdAt, "MMM d, yyyy 'at' h:mm a")}
                          {req.reviewedAt && ` · Reviewed ${safeFormat(req.reviewedAt, "MMM d, yyyy")}`}
                        </p>
                      </div>
                    </div>
                    {req.status === "pending" && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/30 hover:bg-destructive/5"
                          onClick={() => openReview(req, "rejected" as const)}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => openReview(req, "approved" as const)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
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

      {/* Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${reviewDecision === "approved" ? "text-green-700" : "text-destructive"}`}>
              {reviewDecision === "approved" ? (
                <><CheckCircle2 className="h-4 w-4" /> Approve Request</>
              ) : (
                <><XCircle className="h-4 w-4" /> Reject Request</>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {reviewDecision === "approved" && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-800">
                  Approving will permanently delete the agent connection. This cannot be undone.
                </p>
              </div>
            )}
            <div>
              <Label>Admin Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                className="mt-1"
                rows={3}
                placeholder="Add a note for the ISA..."
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button
              variant={reviewDecision === "approved" ? "default" : "destructive"}
              className={reviewDecision === "approved" ? "bg-green-600 hover:bg-green-700" : ""}
              disabled={review.isPending}
              onClick={() => {
                if (!selectedRequest) return;
                review.mutate({
                  id: selectedRequest.id,
                  decision: reviewDecision,
                  reviewNote: adminNote || null,
                });
              }}
            >
              {review.isPending ? "Processing..." : reviewDecision === "approved" ? "Confirm Approval" : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
