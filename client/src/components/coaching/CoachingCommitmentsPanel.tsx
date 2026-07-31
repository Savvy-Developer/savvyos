import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ClipboardList,
  Plus,
  Loader2,
  Edit2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  "AI Suggested": "bg-violet-100 text-violet-700",
  "Not Started": "bg-gray-100 text-gray-600",
  "In Progress": "bg-blue-100 text-blue-700",
  "Submitted for Verification": "bg-amber-100 text-amber-700",
  "Completed": "bg-emerald-100 text-emerald-700",
  "Partially Completed": "bg-teal-100 text-teal-700",
  "Missed": "bg-red-100 text-red-700",
  "Waived": "bg-gray-100 text-gray-400",
  "No Longer Relevant": "bg-gray-100 text-gray-400",
};

export default function CoachingCommitmentsPanel({ agentId }: { agentId: number }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>("open");

  const utils = trpc.useUtils();

  const { data: commitments, isLoading } = trpc.coaching.listCommitments.useQuery({ agentId });

  const createCommitment = trpc.coaching.createCommitment.useMutation({
    onSuccess: () => {
      toast.success("Commitment added");
      utils.coaching.listCommitments.invalidate({ agentId });
      setAddOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateCommitment = trpc.coaching.updateCommitment.useMutation({
    onSuccess: () => {
      toast.success("Commitment updated");
      utils.coaching.listCommitments.invalidate({ agentId });
      setEditItem(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteCommitment = trpc.coaching.deleteCommitment.useMutation({
    onSuccess: () => {
      toast.success("Commitment removed");
      utils.coaching.listCommitments.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = (commitments as any)?.rows ?? (Array.isArray(commitments) ? commitments : []);
  const items = rows.map((r: any) => r.commitment ?? r);
  const filtered = items.filter((c: any) => {
    if (statusFilter === "open") {
      return ["AI Suggested", "Not Started", "In Progress", "Submitted for Verification"].includes(c.status);
    }
    if (statusFilter === "closed") {
      return ["Completed", "Partially Completed", "Missed", "Waived", "No Longer Relevant"].includes(c.status);
    }
    return true;
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Commitments ({filtered.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <ClipboardList className="h-7 w-7 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No commitments found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Commitment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="max-w-xs">
                      <p className="text-sm font-medium line-clamp-2">{c.description}</p>
                      {c.expectedResult && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{c.expectedResult}</p>
                      )}
                      {c.isAiExtracted && (
                        <span className="inline-flex items-center gap-1 text-xs text-violet-600 mt-0.5">
                          <Sparkles className="h-3 w-3" />
                          AI extracted
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`text-xs gap-1 ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600"}`}
                      variant="secondary"
                    >
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {c.dueDate ? safeFormat(c.dueDate, "MMM d, yyyy") : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{c.relatedMetric ?? "—"}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{c.visibilityLabel ?? "—"}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditItem(c)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm("Delete this commitment?")) {
                            deleteCommitment.mutate({ commitmentId: c.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Add Dialog */}
      {addOpen && (
        <CommitmentAddDialog
          agentId={agentId}
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSave={(data) => createCommitment.mutate(data)}
          saving={createCommitment.isPending}
        />
      )}

      {/* Edit Dialog */}
      {editItem && (
        <CommitmentEditDialog
          item={editItem}
          open={!!editItem}
          onClose={() => setEditItem(null)}
          onSave={(data) => updateCommitment.mutate(data)}
          saving={updateCommitment.isPending}
        />
      )}
    </Card>
  );
}

function CommitmentAddDialog({
  agentId,
  open,
  onClose,
  onSave,
  saving,
}: {
  agentId: number;
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    agentId,
    description: "",
    dueDate: "",
    expectedResult: "",
    relatedMetric: "",
    visibilityLabel: "Agent Visible" as const,
    consequence: "",
  });

  function handleSave() {
    if (!form.description.trim()) { toast.error("Description is required"); return; }
    onSave({ ...form, dueDate: form.dueDate || undefined });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Commitment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Commitment *</Label>
            <Textarea
              placeholder="What is the agent committing to?"
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Related Metric</Label>
              <Select value={form.relatedMetric || "none"} onValueChange={(v) => setForm(f => ({ ...f, relatedMetric: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select metric" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {["GCI", "Closings", "Pipeline", "Activity"].map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Expected Result</Label>
            <Input
              placeholder="What does success look like?"
              value={form.expectedResult}
              onChange={(e) => setForm(f => ({ ...f, expectedResult: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Visibility</Label>
            <Select value={form.visibilityLabel} onValueChange={(v: any) => setForm(f => ({ ...f, visibilityLabel: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Agent Visible">Agent Visible</SelectItem>
                <SelectItem value="Internal">Internal</SelectItem>
                <SelectItem value="Leadership">Leadership</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Consequence (if missed)</Label>
            <Textarea
              placeholder="What happens if this is not completed?"
              value={form.consequence}
              onChange={(e) => setForm(f => ({ ...f, consequence: e.target.value }))}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Commitment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommitmentEditDialog({
  item,
  open,
  onClose,
  onSave,
  saving,
}: {
  item: any;
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    commitmentId: item.id,
    description: item.description ?? "",
    status: item.status ?? "Not Started",
    dueDate: item.dueDate ? safeFormat(item.dueDate, "yyyy-MM-dd") : "",
    expectedResult: item.expectedResult ?? "",
    completionEvidence: item.completionEvidence ?? "",
    coachVerificationStatus: item.coachVerificationStatus ?? "Pending",
    consequence: item.consequence ?? "",
    visibilityLabel: item.visibilityLabel ?? "Agent Visible",
  });

  function handleSave() {
    if (!form.description.trim()) { toast.error("Description is required"); return; }
    onSave({ ...form, dueDate: form.dueDate || undefined });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Commitment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Commitment *</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["AI Suggested", "Not Started", "In Progress", "Submitted for Verification", "Completed", "Partially Completed", "Missed", "Waived", "No Longer Relevant"].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Expected Result</Label>
            <Input
              value={form.expectedResult}
              onChange={(e) => setForm(f => ({ ...f, expectedResult: e.target.value }))}
              placeholder="What does success look like?"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Completion Evidence</Label>
            <Textarea
              value={form.completionEvidence}
              onChange={(e) => setForm(f => ({ ...f, completionEvidence: e.target.value }))}
              placeholder="Evidence that this was completed..."
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Coach Verification</Label>
              <Select value={form.coachVerificationStatus} onValueChange={(v) => setForm(f => ({ ...f, coachVerificationStatus: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Verified">Verified</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <Select value={form.visibilityLabel} onValueChange={(v) => setForm(f => ({ ...f, visibilityLabel: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Agent Visible">Agent Visible</SelectItem>
                  <SelectItem value="Internal">Internal</SelectItem>
                  <SelectItem value="Leadership">Leadership</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
