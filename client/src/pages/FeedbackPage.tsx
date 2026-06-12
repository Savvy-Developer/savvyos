import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import { safeFormat } from "@/lib/safeFormat";
import { Bug, CheckCircle2, Clock, Lightbulb, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700", icon: Clock },
  approved: { label: "Approved", color: "bg-blue-100 text-blue-700", icon: CheckCircle2 },
  denied: { label: "Denied", color: "bg-red-100 text-red-700", icon: XCircle },
  in_progress: { label: "In Progress", color: "bg-purple-100 text-purple-700", icon: Loader2 },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
};

export default function FeedbackPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [newStatus, setNewStatus] = useState("");
  const [adminNotes, setAdminNotes] = useState("");

  const utils = trpc.useUtils();
  const { data: items = [], isLoading } = trpc.feedback.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    type: typeFilter === "all" ? undefined : typeFilter,
  });

  const updateStatus = trpc.feedback.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Feedback updated successfully.");
      utils.feedback.list.invalidate();
      utils.feedback.pendingCount.invalidate();
      setSelectedItem(null);
      setNewStatus("");
      setAdminNotes("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  function openReview(item: any) {
    setSelectedItem(item);
    setNewStatus(item.feedback.status);
    setAdminNotes(item.feedback.adminNotes || "");
  }

  function handleUpdate() {
    if (!selectedItem) return;
    updateStatus.mutate({
      id: selectedItem.feedback.id,
      status: newStatus as any,
      adminNotes: adminNotes || undefined,
    });
  }

  const pendingCount = (items as any[]).filter((i: any) => i.feedback.status === "pending").length;

  return (
    <div>
      <PageHeader
        title="Feedback & Requests"
        subtitle={`${pendingCount} pending review`}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        {["all", "pending", "approved", "denied", "in_progress", "completed"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {s === "all" ? "All" : STATUS_CONFIG[s]?.label || s}
          </button>
        ))}
        <div className="ml-auto">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="bug">Bug Reports</SelectItem>
              <SelectItem value="feature">Feature Requests</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">Loading...</div>
      ) : (items as any[]).length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No feedback items found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(items as any[]).map((item: any) => {
            const cfg = STATUS_CONFIG[item.feedback.status] || STATUS_CONFIG.pending;
            const StatusIcon = cfg.icon;
            return (
              <Card
                key={item.feedback.id}
                className="cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => openReview(item)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {item.feedback.type === "bug" ? (
                        <Bug className="h-5 w-5 text-red-500" />
                      ) : (
                        <Lightbulb className="h-5 w-5 text-amber-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm truncate">{item.feedback.title}</span>
                        <Badge variant="secondary" className={`${cfg.color} text-[10px] shrink-0`}>
                          <StatusIcon className="h-3 w-3 mr-0.5" />
                          {cfg.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{item.feedback.description}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                        <span>By {item.user?.name || "Unknown"}</span>
                        <span>{safeFormat(item.feedback.createdAt, "MMM d, yyyy h:mm a")}</span>
                        <span className="capitalize">{item.feedback.type}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={(o) => !o && setSelectedItem(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedItem?.feedback.type === "bug" ? (
                <Bug className="h-5 w-5 text-red-500" />
              ) : (
                <Lightbulb className="h-5 w-5 text-amber-500" />
              )}
              {selectedItem?.feedback.title}
            </DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Submitted by {selectedItem.user?.name || "Unknown"} on {safeFormat(selectedItem.feedback.createdAt, "MMM d, yyyy h:mm a")}</p>
                <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap">{selectedItem.feedback.description}</div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">Status</label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="denied">Denied</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">Admin Notes</label>
                <Textarea
                  placeholder="Add notes about this feedback..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedItem(null)}>Cancel</Button>
                <Button onClick={handleUpdate} disabled={updateStatus.isPending}>
                  {updateStatus.isPending ? "Saving..." : "Update"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
