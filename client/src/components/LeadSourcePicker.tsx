/**
 * LeadSourcePicker — two-level hierarchical lead source selector.
 * Step 1: Pick a parent category.
 * Step 2: If the category has children, pick a sub-source (or use the parent directly).
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LeadSourcePickerProps {
  value: number | null | undefined;
  onChange: (id: number | null) => void;
  className?: string;
}

export default function LeadSourcePicker({ value, onChange, className }: LeadSourcePickerProps) {
  const { data: rawSources = [] } = trpc.leadSources.list.useQuery();

  const sources = rawSources as unknown as Array<{
    ls: { id: number; name: string; parentId: number | null; isActive: boolean };
  }>;

  const parents = sources.filter(s => s.ls.parentId === null && s.ls.isActive);
  const childrenOf = (pid: number) => sources.filter(s => s.ls.parentId === pid && s.ls.isActive);

  const selectedSource = sources.find(s => s.ls.id === value);
  const selectedParentId = selectedSource
    ? (selectedSource.ls.parentId ?? selectedSource.ls.id)
    : null;

  const [parentId, setParentId] = useState<number | null>(selectedParentId);
  const children = parentId ? childrenOf(parentId) : [];

  function handleParentChange(val: string) {
    const pid = Number(val);
    setParentId(pid);
    const kids = childrenOf(pid);
    if (kids.length === 0) {
      onChange(pid);
    } else {
      onChange(null);
    }
  }

  function handleChildChange(val: string) {
    onChange(Number(val));
  }

  return (
    <div className={className}>
      <div className="space-y-2">
        <div>
          <Label className="text-xs text-muted-foreground">Lead Source Category</Label>
          <Select
            value={parentId ? String(parentId) : ""}
            onValueChange={handleParentChange}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select category..." />
            </SelectTrigger>
            <SelectContent>
              {parents.map(p => (
                <SelectItem key={p.ls.id} value={String(p.ls.id)}>{p.ls.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {parentId && children.length > 0 && (
          <div>
            <Label className="text-xs text-muted-foreground">Sub-Source</Label>
            <Select
              value={value && selectedSource?.ls.parentId === parentId ? String(value) : ""}
              onValueChange={handleChildChange}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select sub-source..." />
              </SelectTrigger>
              <SelectContent>
                {children.map(c => (
                  <SelectItem key={c.ls.id} value={String(c.ls.id)}>
                    {c.ls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {parentId && children.length === 0 && (
          <p className="text-xs text-muted-foreground">Using category directly (no sub-sources)</p>
        )}
      </div>
    </div>
  );
}
