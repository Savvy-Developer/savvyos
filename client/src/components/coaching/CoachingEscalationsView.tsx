import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Shield, Plus, Download, Filter, ChevronRight, AlertTriangle } from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700",
  Submitted: "bg-blue-100 text-blue-800",
  Assigned: "bg-amber-100 text-amber-800",
  "In Progress": "bg-yellow-100 text-yellow-800",
  "Waiting for Information": "bg-slate-100 text-slate-700",
  Resolved: "bg-emerald-100 text-emerald-800",
  Closed: "bg-slate-50 text-slate-600",
  Declined: "bg-red-100 text-red-700",
};

const URGENCY_COLORS: Record<string, string> = {
  Low: "text-slate-600",
  Medium: "text-amber-700",
  High: "text-orange-700 font-medium",
  Critical: "text-red-700 font-semibold",
};

const ISSUE_CATEGORIES = [
  "Lead volume", "Lead quality", "Lead routing", "CRM defect",
  "Missing automation", "Operational bottleneck", "Market inventory",
  "Marketing issue", "Transaction support issue", "Training-resource gap",
  "Licensing issue", "Compliance issue", "Technology problem", "Other",
];

export default function CoachingEscalationsView() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState("open");
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, refetch } = trpc.coaching.listEscalations.useQuery({
    status: statusFilter === "open" ? "Submitted" : statusFilter === "all" ? undefined : statusFilter,
  });

  const createMutation = trpc.coaching.createEscalation.useMutation({
    onSuccess: () => { setShowCreate(false); refetch(); toast.success("Escalation created"); },
    onError: (e) => toast.error(e.message),
  });

  const rows = (data as any)?.rows ?? (Array.isArray(data) ? data : []);

  // KPI
  const openCount = rows.filter((r: any) => !["Resolved", "Closed", "Declined"].includes((r.escalation ?? r).status)).length;
  const overdueCount = rows.filter((r: any) => {
    const e = r.escalation ?? r;
    return e.dueDate && new Date(e.dueDate) < new Date() && !["Resolved", "Closed", "Declined"].includes(e.status);
  }).length;
  const criticalCount = rows.filter((r: any) => (r.escalation ?? r).urgency === "Critical").length;

  const [form, setForm] = useState({
    agentId: "",
    issueCategory: "Lead volume",
    description: "",
    evidence: "",
    estimatedProductionImpact: "",
    urgency: "Medium",
    dueDate: "",
  });

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="cursor-pointer hover:border-primary/30" onClick={() => setStatusFilter("open")}>
          <CardContent className="p-3 text-center"><p className="text-xl font-bold">{openCount}</p><p className="text-[10px] text-muted-foreground">Open</p></CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center"><p className={`text-xl font-bold ${overdueCount > 0 ? "text-red-600" : ""}`}>{overdueCount}</p><p className="text-[10px] text-muted-foreground">Overdue</p></CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center"><p className={`text-xl font-bold ${criticalCount > 0 ? "text-red-600" : ""}`}>{criticalCount}</p><p className="text-[10px] text-muted-foreground">Critical</p></CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center"><p className="text-xl font-bold">{rows.length}</p><p className="text-[10px] text-muted-foreground">Total</p></CardContent>
        </Card>
      </div>

      {/* Filters & Actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="Submitted">Submitted</SelectItem>
              <SelectItem value="Assigned">Assigned</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Waiting for Information">Waiting for Info</SelectItem>
              <SelectItem value="Resolved">Resolved</SelectItem>
              <SelectItem value="Closed">Closed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5 mr-1" />New Escalation</Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><Shield className="h-8 w-8 mx-auto mb-2 opacity-40" /><p className="text-sm">No escalations match this filter</p></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-[10px] min-w-[120px]">Agent</TableHead>
                  <TableHead className="text-[10px]">Category</TableHead>
                  <TableHead className="text-[10px]">Urgency</TableHead>
                  <TableHead className="text-[10px] min-w-[200px]">Description</TableHead>
                  <TableHead className="text-[10px]">Impact</TableHead>
                  <TableHead className="text-[10px]">Status</TableHead>
                  <TableHead className="text-[10px]">Owner</TableHead>
                  <TableHead className="text-[10px]">Due</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow></TableHeader>
                <TableBody>{rows.map((row: any) => {
                  const e = row.escalation ?? row;
                  const isOverdue = e.dueDate && new Date(e.dueDate) < new Date() && !["Resolved", "Closed", "Declined"].includes(e.status);
                  return (
                    <TableRow key={e.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/coaching/agent/${e.agentId}`)}>
                      <TableCell className="text-xs font-medium">{row.agent?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{e.issueCategory ?? "—"}</TableCell>
                      <TableCell><span className={`text-xs ${URGENCY_COLORS[e.urgency] ?? ""}`}>{e.urgency ?? "—"}</span></TableCell>
                      <TableCell className="text-xs max-w-[250px]"><span className="line-clamp-1">{e.description ?? "—"}</span></TableCell>
                      <TableCell className="text-xs">{e.estimatedProductionImpact ?? "—"}</TableCell>
                      <TableCell><Badge className={`text-[10px] ${STATUS_COLORS[e.status] ?? ""}`} variant="secondary">{e.status}</Badge></TableCell>
                      <TableCell className="text-xs">{row.owner?.name ?? "Unassigned"}</TableCell>
                      <TableCell className={`text-xs ${isOverdue ? "text-red-600 font-semibold" : ""}`}>{e.dueDate ? safeFormat(e.dueDate, "MMM d") : "—"}{isOverdue && " ⚠"}</TableCell>
                      <TableCell><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                    </TableRow>
                  );
                })}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Escalation Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Capacity Escalation</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Agent ID</Label>
                <Input value={form.agentId} onChange={(e) => setForm({ ...form, agentId: e.target.value })} placeholder="Agent user ID" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Issue Category</Label>
                <Select value={form.issueCategory} onValueChange={(v) => setForm({ ...form, issueCategory: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ISSUE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the capacity issue..." rows={3} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Evidence</Label>
              <Textarea value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} placeholder="Supporting evidence..." rows={2} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Est. Production Impact</Label>
                <Input value={form.estimatedProductionImpact} onChange={(e) => setForm({ ...form, estimatedProductionImpact: e.target.value })} placeholder="e.g. $50k/month" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Urgency</Label>
                <Select value={form.urgency} onValueChange={(v) => setForm({ ...form, urgency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Due Date</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate({
                agentId: Number(form.agentId),
                issueCategory: form.issueCategory,
                description: form.description,
                evidence: form.evidence || undefined,
                estimatedProductionImpact: form.estimatedProductionImpact || undefined,
                urgency: form.urgency as "Low" | "Medium" | "High" | "Critical",
                dueDate: form.dueDate || undefined,
              })}
              disabled={createMutation.isPending || !form.agentId || !form.description}
            >
              {createMutation.isPending ? "Creating..." : "Submit Escalation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
