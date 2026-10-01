import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { CustomField } from "./CustomFieldInput";

const types = ["date", "money", "number", "percent", "checkbox", "select"] as const;
export function CustomFieldManager({ fields, open, onOpenChange, onChanged }: {
  fields: CustomField[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<typeof types[number]>("date");
  const [choices, setChoices] = useState("");
  const create = trpc.transactions.customFields.create.useMutation({
    onSuccess: () => { setName(""); setChoices(""); onChanged(); toast.success("Custom field added"); },
    onError: e => toast.error(e.message),
  });
  const remove = trpc.transactions.customFields.remove.useMutation({
    onSuccess: () => { onChanged(); toast.success("Custom field removed"); },
    onError: e => toast.error(e.message),
  });
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>My transaction fields</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Only you can use these fields on your transactions. Admins can view their values.</p>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {fields.length === 0 && <p className="text-sm text-muted-foreground">No custom fields yet.</p>}
        {fields.map(field => <div key={field.id} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
          <div className="min-w-0"><span className="font-medium break-words">{field.name}</span><span className="ml-2 text-xs text-muted-foreground">{field.type === "select" ? "Single select" : field.type}</span></div>
          <Button variant="ghost" size="sm" disabled={remove.isPending} className="text-destructive" onClick={() => {
            if (window.confirm(`Delete “${field.name}” and all its saved values? This cannot be undone.`)) remove.mutate({ fieldId: field.id });
          }}>Delete</Button>
        </div>)}
      </div>
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-medium">Add a field</p>
        <div><Label htmlFor="custom-field-name">Field name</Label><Input id="custom-field-name" maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="Example: Inspection deadline" /></div>
        <div><Label>Field type</Label><Select value={type} onValueChange={v => setType(v as typeof type)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
          {types.map(t => <SelectItem key={t} value={t}>{t === "select" ? "Dropdown (single select)" : t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
        </SelectContent></Select></div>
        {type === "select" && <div><Label htmlFor="custom-field-options">Choices, one per line</Label><Textarea id="custom-field-options" value={choices} onChange={e => setChoices(e.target.value)} placeholder={"Pending\nReceived\nComplete"} rows={4} /></div>}
      </div>
      <DialogFooter><Button onClick={() => create.mutate({ name: name.trim(), type, options: type === "select" ? choices.split("\n").map(c => c.trim()).filter(Boolean) : undefined })} disabled={create.isPending || !name.trim() || (type === "select" && !choices.trim())}>Add field</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
