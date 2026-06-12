import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CheckCircle2, XCircle, AlertTriangle, Edit2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { safeFormat } from "@/lib/safeFormat";
import { useLocation } from "wouter";

export default function CommissionExceptionsPage() {
  const [, navigate] = useLocation();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editCommOpen, setEditCommOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [adminNote, setAdminNote] = useState("");
  const [editCommForm, setEditCommForm] = useState({
    agentSplitPct: "",
    brokerageSplitPct: "",
    teamLeaderSplitPct: "",
    referralSplitPct: "",
  });

  const { data: exceptions = [], refetch } = trpc.commissionExceptions.listAll.useQuery();

  const reviewMutation = trpc.commissionExceptions.review.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.status === "approved" ? "Exception approved" : "Exception denied");
      setReviewOpen(false);
      setSelected(null);
      setAdminNote("");
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const editCommMutation = trpc.commissionExceptions.applyToTransaction.useMutation({
    onSuccess: () => {
      toast.success("Commission splits updated on transaction");
      setEditCommOpen(false);
      setSelected(null);
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  function openReview(ex: any, action: "approve" | "deny") {
    setSelected({ ...ex, _action: action });
    setAdminNote("");
    setReviewOpen(true);
  }

  function openEditComm(ex: any) {
    setSelected(ex);
    setEditCommForm({
      agentSplitPct: String(ex.agentSplitPct ?? ""),
      brokerageSplitPct: String(ex.brokerageSplitPct ?? ""),
      teamLeaderSplitPct: String(ex.teamLeaderSplitPct ?? "0"),
      referralSplitPct: String(ex.referralSplitPct ?? "0"),
    });
    setEditCommOpen(true);
  }

  const pending = exceptions.filter((e: any) => e.status === "pending");
  const reviewed = exceptions.filter((e: any) => e.status !== "pending");

  function statusBadge(status: string) {
    if (status === "approved") return <Badge className="bg-green-100 text-green-700 border-green-200">Approved</Badge>;
    if (status === "denied") return <Badge className="bg-red-100 text-red-700 border-red-200">Denied</Badge>;
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Pending</Badge>;
  }

  function ExceptionCard({ ex }: { ex: any }) {
    const agentLow = Number(ex.agentSplitPct) > 0 && Number(ex.agentSplitPct) < 50;
    const brokerageLow = Number(ex.brokerageSplitPct) > 0 && Number(ex.brokerageSplitPct) < 20;
    return (
      <Card className="border">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">
                {ex.agentName ?? "Agent"} — Transaction #{ex.transactionNumber ?? ex.transactionId}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Submitted {safeFormat(ex.createdAt, "MMM d, yyyy h:mm a")}
              </p>
            </div>
            {statusBadge(ex.status)}
          </div>
          <div className="text-sm bg-muted/50 rounded p-2">
            <p className="font-medium mb-0.5">Reason:</p>
            <p className="text-muted-foreground">{ex.reason}</p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs text-center">
            <div className="bg-muted rounded p-1.5">
              <p className="text-muted-foreground">Agent</p>
              <p className={`font-semibold ${agentLow ? "text-amber-600" : ""}`}>{ex.agentSplitPct}%</p>
            </div>
            <div className="bg-muted rounded p-1.5">
              <p className="text-muted-foreground">Savvy</p>
              <p className={`font-semibold ${brokerageLow ? "text-amber-600" : ""}`}>{ex.brokerageSplitPct}%</p>
            </div>
            <div className="bg-muted rounded p-1.5">
              <p className="text-muted-foreground">Team Leader</p>
              <p className="font-semibold">{ex.teamLeaderSplitPct ?? 0}%</p>
            </div>
            <div className="bg-muted rounded p-1.5">
              <p className="text-muted-foreground">Referral</p>
              <p className="font-semibold">{ex.referralSplitPct ?? 0}%</p>
            </div>
          </div>
          {(agentLow || brokerageLow) && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              {agentLow && <span>Agent below 50%.</span>}
              {brokerageLow && <span>Savvy below 20%.</span>}
              <span>Email alert will be sent on approval.</span>
            </div>
          )}
          {ex.adminNote && (
            <p className="text-xs text-muted-foreground italic">Admin note: {ex.adminNote}</p>
          )}
          <div className="flex gap-2 pt-1">
            {ex.status === "pending" && (
              <>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => openReview(ex, "approve")}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                </Button>
                <Button size="sm" variant="destructive" onClick={() => openReview(ex, "deny")}>
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Deny
                </Button>
              </>
            )}
            {ex.status === "approved" && (
              <Button size="sm" variant="outline" onClick={() => openEditComm(ex)}>
                <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit Commission
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => navigate(`/transactions/${ex.transactionId}`)}>
              View Transaction
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title="Commission Exceptions"
        subtitle="Review agent requests to adjust commission splits"
      />
      <div className="space-y-8">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Pending ({pending.length})
          </h3>
          {pending.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No pending exception requests</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {pending.map((ex: any) => <ExceptionCard key={ex.id} ex={ex} />)}
            </div>
          )}
        </div>
        {reviewed.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Reviewed ({reviewed.length})
            </h3>
            <div className="space-y-3">
              {reviewed.map((ex: any) => <ExceptionCard key={ex.id} ex={ex} />)}
            </div>
          </div>
        )}
      </div>

      {/* Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selected?._action === "approve" ? "Approve Exception" : "Deny Exception"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {selected?._action === "approve"
                ? "Approving this exception will apply the requested commission splits to the transaction."
                : "Denying this exception will keep the original commission structure."}
            </p>
            <div>
              <Label>Admin Note (optional)</Label>
              <Textarea
                className="mt-1"
                rows={3}
                placeholder="Add a note for the agent..."
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button
              className={selected?._action === "approve" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
              variant={selected?._action === "deny" ? "destructive" : "default"}
              disabled={reviewMutation.isPending}
              onClick={() => {
                if (!selected) return;
                reviewMutation.mutate({
                  id: selected.id,
                  status: selected._action === "approve" ? "approved" : "denied",
                  adminNote: adminNote.trim() || undefined,
                  applyToTransaction: selected._action === "approve",
                });
              }}
            >
              {reviewMutation.isPending ? "Saving..." : selected?._action === "approve" ? "Confirm Approve" : "Confirm Deny"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Commission Dialog */}
      <Dialog open={editCommOpen} onOpenChange={setEditCommOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Commission Splits</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Directly edit the commission splits on this transaction. Must not exceed 100% total. An email alert will be sent if agent &lt; 50% or Savvy &lt; 20%.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(["agentSplitPct", "brokerageSplitPct", "teamLeaderSplitPct", "referralSplitPct"] as const).map((field) => (
                <div key={field}>
                  <Label>{field === "agentSplitPct" ? "Agent %" : field === "brokerageSplitPct" ? "Savvy %" : field === "teamLeaderSplitPct" ? "Team Leader %" : "Referral %"}</Label>
                  <Input
                    className="mt-1"
                    type="number" min="0" max="100" step="0.01"
                    value={editCommForm[field]}
                    onChange={(e) => setEditCommForm(f => ({ ...f, [field]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            {(() => {
              const total = ["agentSplitPct", "brokerageSplitPct", "teamLeaderSplitPct", "referralSplitPct"]
                .reduce((s, k) => s + parseFloat((editCommForm as any)[k] || "0"), 0);
              const agentLow = parseFloat(editCommForm.agentSplitPct || "0") < 50 && parseFloat(editCommForm.agentSplitPct || "0") > 0;
              const brokerageLow = parseFloat(editCommForm.brokerageSplitPct || "0") < 20 && parseFloat(editCommForm.brokerageSplitPct || "0") > 0;
              return (
                <div className="space-y-1">
                  <p className={`text-sm font-medium ${total > 100 ? "text-red-600" : "text-muted-foreground"}`}>
                    Total: {total.toFixed(2)}% {total > 100 ? "— exceeds 100%!" : ""}
                  </p>
                  {agentLow && <p className="text-sm text-amber-600">⚠️ Agent below 50% — email alert will be sent.</p>}
                  {brokerageLow && <p className="text-sm text-amber-600">⚠️ Savvy below 20% — email alert will be sent.</p>}
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCommOpen(false)}>Cancel</Button>
            <Button
              disabled={editCommMutation.isPending}
              onClick={() => {
                if (!selected) return;
                editCommMutation.mutate({
                  transactionId: selected.transactionId,
                  agentSplitPct: parseFloat(editCommForm.agentSplitPct),
                  brokerageSplitPct: parseFloat(editCommForm.brokerageSplitPct),
                  teamLeaderSplitPct: parseFloat(editCommForm.teamLeaderSplitPct || "0"),
                  referralSplitPct: parseFloat(editCommForm.referralSplitPct || "0"),
                });
              }}
            >
              {editCommMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
