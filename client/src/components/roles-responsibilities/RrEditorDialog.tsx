import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import RichEmailEditor from "@/components/RichEmailEditor";
import { toast } from "sonner";

type Owner = { id: number; name: string | null; email: string | null; title: string | null; department?: string | null };
type Responsibility = { id: number; title: string; ownerId: number; description?: string | null; cadence: string; cadenceDetails?: string | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owners: Owner[];
  responsibility?: Responsibility | null;
  defaultOwnerId?: number;
  onSaved?: (id: number) => void;
};

const cadenceOptions = [
  ["ongoing", "Ongoing"], ["daily", "Daily"], ["weekly", "Weekly"], ["biweekly", "Every two weeks"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["annually", "Annually"], ["as_needed", "As needed"], ["custom", "Custom"],
] as const;

export default function RrEditorDialog({ open, onOpenChange, owners, responsibility, defaultOwnerId, onSaved }: Props) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [description, setDescription] = useState("");
  const [cadence, setCadence] = useState<string>("ongoing");
  const [cadenceDetails, setCadenceDetails] = useState("");
  const editing = !!responsibility?.id;

  useEffect(() => {
    if (!open) return;
    setTitle(responsibility?.title ?? "");
    setOwnerId(String(responsibility?.ownerId ?? defaultOwnerId ?? owners[0]?.id ?? ""));
    setDescription(responsibility?.description ?? "");
    setCadence(responsibility?.cadence ?? "ongoing");
    setCadenceDetails(responsibility?.cadenceDetails ?? "");
  }, [open, responsibility, defaultOwnerId, owners]);

  const createMutation = trpc.rolesResponsibilities.create.useMutation({
    onSuccess: ({ id }) => {
      void utils.rolesResponsibilities.list.invalidate();
      void utils.rolesResponsibilities.profileSummary.invalidate();
      void utils.users.orgChart.invalidate();
      toast.success("Responsibility created");
      onSaved?.(id);
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });
  const updateMutation = trpc.rolesResponsibilities.update.useMutation({
    onSuccess: () => {
      void utils.rolesResponsibilities.list.invalidate();
      void utils.rolesResponsibilities.get.invalidate();
      void utils.rolesResponsibilities.profileSummary.invalidate();
      void utils.users.orgChart.invalidate();
      toast.success("Responsibility saved");
      onSaved?.(responsibility!.id);
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const ownerOptions = useMemo(() => owners.map((owner) => ({ value: String(owner.id), label: `${owner.name ?? owner.email ?? "Unnamed admin"}${owner.title ? ` — ${owner.title}` : ""}` })), [owners]);
  const saving = createMutation.isPending || updateMutation.isPending;

  function save() {
    if (!title.trim()) return toast.error("Enter a clear responsibility title.");
    if (!ownerId) return toast.error("Select an admin owner.");
    const payload = { title: title.trim(), ownerId: Number(ownerId), description: description || null, cadence: cadence as any, cadenceDetails: cadenceDetails.trim() || null };
    if (editing) updateMutation.mutate({ id: responsibility!.id, ...payload });
    else createMutation.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit Responsibility" : "Add Role & Responsibility"}</DialogTitle></DialogHeader>
        <div className="space-y-5 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="rr-title">R&R title *</Label><Input id="rr-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Manage weekly agent productivity review" autoFocus /></div>
            <div className="space-y-1.5"><Label>Owner *</Label><Select value={ownerId} onValueChange={setOwnerId}><SelectTrigger><SelectValue placeholder="Select an admin" /></SelectTrigger><SelectContent>{ownerOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="space-y-1.5"><Label>Description</Label><p className="text-xs text-muted-foreground">Explain what this person owns, what it includes, and what success looks like.</p><RichEmailEditor value={description} onChange={setDescription} placeholder="Describe the responsibility and a successful result…" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Recurring cadence *</Label><Select value={cadence} onValueChange={setCadence}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{cadenceOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="rr-cadence-details">Cadence details</Label><Input id="rr-cadence-details" value={cadenceDetails} onChange={(event) => setCadenceDetails(event.target.value)} placeholder="Every Monday by noon" /></div>
          </div>
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" disabled={saving} onClick={save}>{saving ? "Saving…" : editing ? "Save changes" : "Create responsibility"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
