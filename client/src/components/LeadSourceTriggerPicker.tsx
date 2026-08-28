import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type LeadSourceOption = {
  id: number;
  name: string;
  parentId: number | null;
};

export function formatLeadSourcePath(
  source: LeadSourceOption,
  sources: LeadSourceOption[]
): string {
  if (source.parentId === null) return source.name;
  const parent = sources.find(candidate => candidate.id === source.parentId);
  return parent ? `${parent.name} › ${source.name}` : source.name;
}

type LeadSourceTriggerPickerProps = {
  sources: LeadSourceOption[];
  selectedIds: number[];
  onAdd: (id: number) => void;
  disabled?: boolean;
};

/**
 * Adds Smart Plan trigger sources through the same parent → child hierarchy used
 * throughout SavvyOS. Categories with no active children can be selected directly.
 */
export default function LeadSourceTriggerPicker({
  sources,
  selectedIds,
  onAdd,
  disabled = false,
}: LeadSourceTriggerPickerProps) {
  const [parentId, setParentId] = useState<number | null>(null);
  const parents = useMemo(
    () =>
      sources
        .filter(source => source.parentId === null)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [sources]
  );
  const selectedParent = sources.find(source => source.id === parentId) ?? null;
  const children = useMemo(
    () =>
      parentId === null
        ? []
        : sources
            .filter(source => source.parentId === parentId)
            .sort((a, b) => a.name.localeCompare(b.name)),
    [parentId, sources]
  );
  const availableChildren = children.filter(
    source => !selectedIds.includes(source.id)
  );

  const reset = () => setParentId(null);

  const chooseParent = (value: string) => {
    const id = Number(value);
    const childSources = sources.filter(source => source.parentId === id);
    if (childSources.length === 0) {
      if (!selectedIds.includes(id)) onAdd(id);
      reset();
      return;
    }
    setParentId(id);
  };

  const chooseChild = (value: string) => {
    const id = Number(value);
    if (!selectedIds.includes(id)) onAdd(id);
    reset();
  };

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="space-y-2">
        <Label
          htmlFor="smart-plan-trigger-source"
          className="text-xs text-muted-foreground"
        >
          Lead source
        </Label>
        <Select
          value={parentId === null ? "" : String(parentId)}
          onValueChange={chooseParent}
          disabled={disabled}
        >
          <SelectTrigger id="smart-plan-trigger-source">
            <SelectValue placeholder="Choose a lead source..." />
          </SelectTrigger>
          <SelectContent>
            {parents.map(source => {
              const hasChildren = sources.some(
                candidate => candidate.parentId === source.id
              );
              return (
                <SelectItem
                  key={source.id}
                  value={String(source.id)}
                  disabled={!hasChildren && selectedIds.includes(source.id)}
                >
                  {source.name}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {selectedParent && children.length > 0 && (
        <div className="ml-4 mt-3 border-l pl-3">
          <div className="space-y-2">
            <Label
              htmlFor="smart-plan-trigger-sub-source"
              className="text-xs text-muted-foreground"
            >
              Sub-source under {selectedParent.name}
            </Label>
            {availableChildren.length > 0 ? (
              <Select value="" onValueChange={chooseChild} disabled={disabled}>
                <SelectTrigger id="smart-plan-trigger-sub-source">
                  <SelectValue placeholder="Choose a sub-source..." />
                </SelectTrigger>
                <SelectContent>
                  {availableChildren.map(source => (
                    <SelectItem key={source.id} value={String(source.id)}>
                      {source.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="py-2 text-xs text-muted-foreground">
                All active sub-sources under this lead source are already
                included.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
