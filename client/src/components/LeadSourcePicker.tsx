/**
 * LeadSourcePicker — hierarchical lead source selector (supports up to 3 levels).
 * Step 1: Pick a top-level category.
 * Step 2: If the category has children, pick a sub-source.
 * Step 3: If the sub-source has its own children, pick a 3rd-level source.
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

  // Resolve the initial selection state
  const selectedSource = sources.find(s => s.ls.id === value);
  let initParentId: number | null = null;
  let initMidId: number | null = null;
  if (selectedSource) {
    if (selectedSource.ls.parentId === null) {
      initParentId = selectedSource.ls.id;
    } else {
      const parent = sources.find(s => s.ls.id === selectedSource.ls.parentId);
      if (parent && parent.ls.parentId === null) {
        // Selected is a 2nd-level source (or a mid-level group)
        initParentId = parent.ls.id;
      } else if (parent && parent.ls.parentId !== null) {
        // Selected is a 3rd-level source
        const grandparent = sources.find(s => s.ls.id === parent.ls.parentId);
        if (grandparent) initParentId = grandparent.ls.id;
        initMidId = parent.ls.id;
      }
    }
  }

  const [parentId, setParentId] = useState<number | null>(initParentId);
  const [midId, setMidId] = useState<number | null>(initMidId);

  const level2 = parentId ? childrenOf(parentId) : [];
  const level3 = midId ? childrenOf(midId) : [];

  function handleParentChange(val: string) {
    const pid = Number(val);
    setParentId(pid);
    setMidId(null);
    const kids = childrenOf(pid);
    if (kids.length === 0) {
      onChange(pid);
    } else {
      onChange(null);
    }
  }

  function handleMidChange(val: string) {
    const mid = Number(val);
    const kids = childrenOf(mid);
    if (kids.length > 0) {
      // This 2nd-level source has children — show a 3rd level
      setMidId(mid);
      onChange(null);
    } else {
      // Leaf node at level 2
      setMidId(null);
      onChange(mid);
    }
  }

  function handleLeafChange(val: string) {
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
              value={
                midId
                  ? String(midId)
                  : (value && selectedSource?.ls.parentId === parentId ? String(value) : "")
              }
              onValueChange={handleMidChange}
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

        {midId && level3.length > 0 && (
          <div>
            <Label className="text-xs text-muted-foreground">Specific Source</Label>
            <Select
              value={value && selectedSource?.ls.parentId === midId ? String(value) : ""}
              onValueChange={handleLeafChange}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select specific source..." />
              </SelectTrigger>
              <SelectContent>
                {level3.map(g => (
                  <SelectItem key={g.ls.id} value={String(g.ls.id)}>
                    {g.ls.name}
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
