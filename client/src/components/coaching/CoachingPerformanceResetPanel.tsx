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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  RefreshCw,
  Plus,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";
import { toast } from "sonner";

const RESET_STATUS_COLORS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-600",
  "Pending Review": "bg-blue-100 text-blue-700",
  Active: "bg-amber-100 text-amber-800",
  Improving: "bg-teal-100 text-teal-700",
  Recovered: "bg-emerald-100 text-emerald-700",
  "Extension Requested": "bg-orange-100 text-orange-700",
  Extended: "bg-orange-100 text-orange-800",
  "Coach-Out Recommended": "bg-red-100 text-red-800",
  Exited: "bg-red-100 text-red-700",
  Canceled: "bg-gray-100 text-gray-500",
};

export default function CoachingPerformanceResetPanel({
  agentId,
  agentName,
  activeReset,
}: {
  agentId: number;
  agentName?: string;
  activeReset?: any;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(activeReset?.id ?? null);

  const utils = trpc.useUtils();

  // Use listResets (not listPerformanceResets)
  const { data: resets, isLoading } = trpc.coaching.listResets.useQuery({ agentId });

  // Use createReset (not createPerformanceReset)
  const createReset = trpc.coaching.createReset.useMutation({
    onSuccess: () => {
      toast.success("Performance reset created");
      utils.coaching.listResets.invalidate({ agentId });
      utils.coaching.getProfile.invalidate({ agentId });
      setAddOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  // Use updateReset (not updatePerformanceReset)
  const updateReset = trpc.coaching.updateReset.useMutation({
    onSuccess: () => {
      toast.success("Reset updated");
      utils.coaching.listResets.invalidate({ agentId });
      utils.coaching.getProfile.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Performance Resets ({(resets ?? []).length})
          </CardTitle>
          {!activeReset && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Initiate Reset
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (resets ?? []).length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <RefreshCw className="h-7 w-7 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No performance resets on record</p>
            <p className="text-xs mt-1">Initiate a reset when an agent needs a structured improvement plan</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(resets ?? []).map((r: any) => {
              const isExpanded = expandedId === r.id;
              return (
                <div key={r.id} className="border rounded-lg overflow-hidden">
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  >
                    <div className="flex items-center gap-3">
                      <RefreshCw className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">
                            {r.startDate ? safeFormat(r.startDate, "MMM d, yyyy") : "Draft"}
                            {r.endDate ? ` – ${safeFormat(r.endDate, "MMM d, yyyy")}` : ""}
                          </p>
                          <Badge className={`text-xs ${RESET_STATUS_COLORS[r.status] ?? ""}`} variant="secondary">
                            {r.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {r.requiredStandard ?? "No standard specified"}
                        </p>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  {isExpanded && (
                    <div className="border-t p-4 bg-muted/20 space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {r.requiredStandard && (
                          <div className="col-span-2">
                            <p className="text-xs font-medium text-muted-foreground">Required Standard</p>
                            <p className="whitespace-pre-wrap">{r.requiredStandard}</p>
                          </div>
                        )}
                        {r.currentResult && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Current Result</p>
                            <p>{r.currentResult}</p>
                          </div>
                        )}
                        {r.goalGap && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Goal Gap</p>
                            <p>{r.goalGap}</p>
                          </div>
                        )}
                        {r.evidenceSummary && (
                          <div className="col-span-2">
                            <p className="text-xs font-medium text-muted-foreground">Evidence Summary</p>
                            <p className="whitespace-pre-wrap">{r.evidenceSummary}</p>
                          </div>
                        )}
                        {r.consequence && (
                          <div className="col-span-2">
                            <p className="text-xs font-medium text-muted-foreground">Consequence</p>
                            <p className="whitespace-pre-wrap">{r.consequence}</p>
                          </div>
                        )}
                      </div>
                      {["Draft", "Pending Review", "Active", "Improving", "Extension Requested"].includes(r.status) && (
                        <div className="flex gap-2 flex-wrap pt-2 border-t">
                          {r.status === "Draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateReset.mutate({ resetId: r.id, status: "Pending Review" })}
                              disabled={updateReset.isPending}
                            >
                              Submit for Review
                            </Button>
                          )}
                          {r.status === "Pending Review" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateReset.mutate({ resetId: r.id, status: "Active" })}
                              disabled={updateReset.isPending}
                            >
                              Activate
                            </Button>
                          )}
                          {r.status === "Active" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateReset.mutate({ resetId: r.id, status: "Improving" })}
                              disabled={updateReset.isPending}
                            >
                              Mark Improving
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                            onClick={() => updateReset.mutate({ resetId: r.id, status: "Recovered" })}
                            disabled={updateReset.isPending}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            Mark Recovered
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-700 border-red-300 hover:bg-red-50"
                            onClick={() => updateReset.mutate({ resetId: r.id, status: "Coach-Out Recommended" })}
                            disabled={updateReset.isPending}
                          >
                            Coach-Out Recommended
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {addOpen && (
        <InitiateResetDialog
          agentId={agentId}
          agentName={agentName}
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSave={(data) => createReset.mutate(data)}
          saving={createReset.isPending}
        />
      )}
    </Card>
  );
}

function InitiateResetDialog({
  agentId,
  agentName,
  open,
  onClose,
  onSave,
  saving,
}: {
  agentId: number;
  agentName?: string;
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    agentId,
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    requiredStandard: "",
    currentResult: "",
    goalGap: "",
    evidenceSummary: "",
    consequence: "",
    requirements: [] as { description: string }[],
    newRequirement: "",
  });

  function addRequirement() {
    if (!form.newRequirement.trim()) return;
    setForm(f => ({
      ...f,
      requirements: [...f.requirements, { description: f.newRequirement.trim() }],
      newRequirement: "",
    }));
  }

  function removeRequirement(idx: number) {
    setForm(f => ({ ...f, requirements: f.requirements.filter((_, i) => i !== idx) }));
  }

  function handleSave() {
    if (!form.requiredStandard.trim()) { toast.error("Required standard is needed"); return; }
    const { newRequirement, ...rest } = form;
    onSave({
      ...rest,
      endDate: form.endDate || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Initiate Performance Reset{agentName ? ` — ${agentName}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date (30 days)</Label>
              <Input type="date" value={form.endDate} onChange={(e) => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Required Standard *</Label>
            <Textarea
              placeholder="What standard must the agent meet to exit the reset?"
              value={form.requiredStandard}
              onChange={(e) => setForm(f => ({ ...f, requiredStandard: e.target.value }))}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Current Result</Label>
            <Input
              placeholder="Where the agent is now..."
              value={form.currentResult}
              onChange={(e) => setForm(f => ({ ...f, currentResult: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Goal Gap</Label>
            <Input
              placeholder="The gap between current and required..."
              value={form.goalGap}
              onChange={(e) => setForm(f => ({ ...f, goalGap: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Evidence Summary</Label>
            <Textarea
              placeholder="Evidence supporting this reset..."
              value={form.evidenceSummary}
              onChange={(e) => setForm(f => ({ ...f, evidenceSummary: e.target.value }))}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Consequence (if not met)</Label>
            <Textarea
              placeholder="What happens if requirements are not met..."
              value={form.consequence}
              onChange={(e) => setForm(f => ({ ...f, consequence: e.target.value }))}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Measurable Requirements</Label>
            {form.requirements.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sm flex-1 bg-muted px-2 py-1 rounded">{r.description}</span>
                <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => removeRequirement(i)}>×</Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                placeholder="Add a measurable requirement..."
                value={form.newRequirement}
                onChange={(e) => setForm(f => ({ ...f, newRequirement: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRequirement(); } }}
              />
              <Button variant="outline" size="sm" onClick={addRequirement}>Add</Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Initiate Reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
