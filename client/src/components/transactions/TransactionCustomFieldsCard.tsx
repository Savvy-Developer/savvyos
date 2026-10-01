import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CustomFieldInput, formatCustomFieldValue, type CustomField } from "./CustomFieldInput";
import { CustomFieldManager } from "./CustomFieldManager";

export function TransactionCustomFieldsCard({ transactionId, isAgent, viewerId }: { transactionId: number; isAgent: boolean; viewerId: number }) {
  const utils = trpc.useUtils();
  const [managerOpen, setManagerOpen] = useState(false);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const { data: rows = [], refetch } = trpc.transactions.customFields.forTransaction.useQuery({ transactionId, viewerId, viewerRole: isAgent ? "agent" : "admin" });
  const save = trpc.transactions.customFields.setValue.useMutation({
    onSuccess: async () => { await refetch(); await utils.transactions.list.invalidate(); toast.success("Field saved"); },
    onError: error => toast.error(error.message),
  });
  useEffect(() => {
    setDraft(Object.fromEntries(rows.map(row => [row.field.id, row.value ?? ""])));
  }, [rows]);
  const fields = rows.map(row => row.field) as CustomField[];
  if (!isAgent && rows.length === 0) return null;
  return <Card className="mb-4">
    <CardHeader className="flex flex-row items-center justify-between gap-3">
      <CardTitle className="text-base">Custom fields</CardTitle>
      {isAgent && <Button size="sm" variant="outline" onClick={() => setManagerOpen(true)}>Manage fields</Button>}
    </CardHeader>
    <CardContent>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Add a custom field to track information only you can see. Admins can inspect it on this transaction.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ field, value }) => <div key={field.id} className="space-y-1.5 min-w-0">
          <Label>{field.name}{!isAgent && <span className="ml-1 font-normal text-muted-foreground">(Agent #{field.agentId})</span>}</Label>
          {isAgent ? <div className="flex gap-2">
            <div className="flex-1 min-w-0"><CustomFieldInput field={field} value={draft[field.id] ?? ""} onChange={next => setDraft(prev => ({ ...prev, [field.id]: next }))} /></div>
            <Button size="sm" variant="outline" disabled={save.isPending || (draft[field.id] ?? "") === (value ?? "")} onClick={() => save.mutate({ transactionId, fieldId: field.id, value: draft[field.id] || null })}>Save</Button>
          </div> : <p className="text-sm break-words">{formatCustomFieldValue(field, value)}</p>}
        </div>)}
      </div>
    </CardContent>
    {isAgent && <CustomFieldManager fields={fields} open={managerOpen} onOpenChange={setManagerOpen} onChanged={() => { refetch(); utils.transactions.customFields.definitions.invalidate(); utils.transactions.list.invalidate(); }} />}
  </Card>;
}
