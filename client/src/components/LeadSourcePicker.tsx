/**
 * LeadSourcePicker — two-level hierarchical lead source selector.
 * Step 1: Pick a top-level category.
 * Step 2: If the category has children, pick a sub-source.
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

  const topLevel = sources.filter(s => s.ls.parentId === null && s.ls.isActive);
  const childrenOf = (pid: number) => sources.filter(s => s.ls.parentId === pid && s.ls.isActive);

  // Resolve the initial selection state (two levels only)
  const selectedSource = sources.find(s => s.ls.id === value);
  let initParentId: number | null = null;
  if (selectedSource) {
    if (selectedSource.ls.parentId === null) {
      // Selected is a top-level category
      initParentId = selectedSource.ls.id;
    } else {
      // Selected is a 2nd-level sub-source — its parent is the top-level category
      initParentId = selectedSource.ls.parentId;
    }
  }

  const [parentId, setParentId] = useState<number | null>(initParentId);

  const level2 = parentId ? childrenOf(parentId) : [];

  function handleParentChange(val: string) {
    const pid = Number(val);
    setParentId(pid);
    const kids = childrenOf(pid);
    if (kids.length === 0) {
      // No sub-sources — the category itself is the selection
      onChange(pid);
    } else {
      // Has sub-sources — clear selection until user picks one
      onChange(null);
    }
  }

  function handleSubChange(val: string) {
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
              {topLevel.map(p => (
                <SelectItem key={p.ls.id} value={String(p.ls.id)}>{p.ls.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {parentId && level2.length > 0 && (
          <div>
            <Label className="text-xs text-muted-foreground">Sub-Source</Label>
            <Select
              value={value && selectedSource?.ls.parentId === parentId ? String(value) : ""}
              onValueChange={handleSubChange}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select sub-source..." />
              </SelectTrigger>
              <SelectContent>
                {level2.map(c => (
                  <SelectItem key={c.ls.id} value={String(c.ls.id)}>
                    {c.ls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {parentId && level2.length === 0 && (
          <p className="text-xs text-muted-foreground">Using category directly (no sub-sources)</p>
        )}
      </div>
    </div>
  );
}
