import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { safeFormat } from "@/lib/safeFormat";

export default function CoachingProfileEditDialog({
  agentId,
  profile,
  coaches,
  open,
  onClose,
  onSaved,
}: {
  agentId: number;
  profile?: any;
  coaches?: any[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: coachList } = trpc.coaching.listCoaches.useQuery();

  const [form, setForm] = useState({
    agentId,
    coachOfRecordId: profile?.coachOfRecordId ? String(profile.coachOfRecordId) : "none",
    performanceStatus: profile?.performanceStatus ?? "Launch",
    marketProtectionStatus: profile?.marketProtectionStatus ?? "Protected",
    retentionRiskStatus: profile?.retentionRiskStatus ?? "Low",
    currentPrimaryDiagnosis: profile?.currentPrimaryDiagnosis ?? "",
    currentDevelopmentPriority: profile?.currentDevelopmentPriority ?? "",
    nextSessionCoachId: profile?.nextSessionCoachId ? String(profile.nextSessionCoachId) : "none",
    nextSessionDate: profile?.nextSessionDate ? safeFormat(profile.nextSessionDate, "yyyy-MM-dd'T'HH:mm") : "",
    coachingSetupRequired: profile?.coachingSetupRequired ?? true,
    launchStartDate: profile?.launchStartDate ? safeFormat(profile.launchStartDate, "yyyy-MM-dd") : "",
    launchHealthStatus: profile?.launchHealthStatus ?? "On Track",
  });

  const upsertProfile = trpc.coaching.upsertProfile.useMutation({
    onSuccess: () => {
      toast.success("Coaching profile saved");
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSave() {
    upsertProfile.mutate({
      agentId,
      coachOfRecordId: (form.coachOfRecordId && form.coachOfRecordId !== "none") ? Number(form.coachOfRecordId) : null,
      performanceStatus: form.performanceStatus as any,
      marketProtectionStatus: form.marketProtectionStatus as any,
      retentionRiskStatus: form.retentionRiskStatus as any,
      currentPrimaryDiagnosis: form.currentPrimaryDiagnosis as any || null,
      currentDevelopmentPriority: form.currentDevelopmentPriority || null,
      nextSessionCoachId: (form.nextSessionCoachId && form.nextSessionCoachId !== "none") ? Number(form.nextSessionCoachId) : null,
      nextSessionDate: form.nextSessionDate || null,
      coachingSetupRequired: form.coachingSetupRequired,
      launchStartDate: form.launchStartDate || null,
      launchHealthStatus: form.launchHealthStatus as any,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Coaching Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {/* Coach Assignment */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Coach Assignment</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Coach of Record</Label>
                <Select value={form.coachOfRecordId} onValueChange={(v) => setForm(f => ({ ...f, coachOfRecordId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select coach" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {(coachList ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Next Session Coach</Label>
                <Select value={form.nextSessionCoachId} onValueChange={(v) => setForm(f => ({ ...f, nextSessionCoachId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select coach" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {(coachList ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Next Session Date</Label>
              <Input
                type="datetime-local"
                value={form.nextSessionDate}
                onChange={(e) => setForm(f => ({ ...f, nextSessionDate: e.target.value }))}
              />
            </div>
          </div>

          {/* Performance Status */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Performance Status</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Performance Status</Label>
                <Select value={form.performanceStatus} onValueChange={(v) => setForm(f => ({ ...f, performanceStatus: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Launch", "Red", "Yellow", "Green", "Elite"].map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Retention Risk</Label>
                <Select value={form.retentionRiskStatus} onValueChange={(v) => setForm(f => ({ ...f, retentionRiskStatus: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Low", "Watch", "Elevated", "Critical"].map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Market Protection Status</Label>
                <Select value={form.marketProtectionStatus} onValueChange={(v) => setForm(f => ({ ...f, marketProtectionStatus: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Protected", "Conditional", "Open for Additional Coverage", "Recruiting Active", "Exit Pending", "Unassigned", "Leadership Review"].map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Primary Diagnosis</Label>
                <Select
                  value={form.currentPrimaryDiagnosis || "none"}
                  onValueChange={(v) => setForm(f => ({ ...f, currentPrimaryDiagnosis: v === "none" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select diagnosis" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {["Commitment", "Capability", "Cadence", "Capacity"].map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Current Development Priority</Label>
              <Textarea
                placeholder="What is the primary focus for this agent's development?"
                value={form.currentDevelopmentPriority}
                onChange={(e) => setForm(f => ({ ...f, currentDevelopmentPriority: e.target.value }))}
                rows={2}
              />
            </div>
          </div>

          {/* Launch Phase */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Launch Phase</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Launch Start Date</Label>
                <Input
                  type="date"
                  value={form.launchStartDate}
                  onChange={(e) => setForm(f => ({ ...f, launchStartDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Launch Health Status</Label>
                <Select value={form.launchHealthStatus} onValueChange={(v) => setForm(f => ({ ...f, launchHealthStatus: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["On Track", "At Risk", "Critical"].map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Setup Flag */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="coachingSetupRequired"
              checked={form.coachingSetupRequired}
              onChange={(e) => setForm(f => ({ ...f, coachingSetupRequired: e.target.checked }))}
              className="h-4 w-4"
            />
            <Label htmlFor="coachingSetupRequired" className="cursor-pointer">
              Coaching setup required (flag this agent for initial setup)
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={upsertProfile.isPending}>
            {upsertProfile.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
