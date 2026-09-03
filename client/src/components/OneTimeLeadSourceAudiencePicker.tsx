import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";

export type OneTimeLeadSourceOption = {
  id: number;
  name: string;
  parentId: number | null;
};

type SourceGroup = {
  parent: OneTimeLeadSourceOption;
  children: OneTimeLeadSourceOption[];
  totalChildCount: number;
};

export function sourceIdsForTopLevel(
  parent: OneTimeLeadSourceOption,
  sources: OneTimeLeadSourceOption[]
): number[] {
  return [
    parent.id,
    ...sources
      .filter(source => source.parentId === parent.id)
      .map(source => source.id),
  ];
}

export function toggleSelectedSourceIds(
  selectedIds: number[],
  sourceIds: number[]
): number[] {
  const selected = new Set(selectedIds);
  const everySourceIsSelected = sourceIds.every(id => selected.has(id));
  if (everySourceIsSelected) {
    sourceIds.forEach(id => selected.delete(id));
  } else {
    sourceIds.forEach(id => selected.add(id));
  }
  return Array.from(selected);
}

function matchesSearch(value: string, search: string): boolean {
  return value.toLocaleLowerCase().includes(search);
}

function groupSelectionLabel(
  selectedCount: number,
  totalCount: number
): string {
  if (selectedCount === 0) return "Not selected";
  if (selectedCount === totalCount) return "All selected";
  return `${selectedCount} of ${totalCount} selected`;
}

export default function OneTimeLeadSourceAudiencePicker({
  sources,
  selectedIds,
  onSelectedIdsChange,
  disabled = false,
}: {
  sources: OneTimeLeadSourceOption[];
  selectedIds: number[];
  onSelectedIdsChange: (ids: number[]) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<number>>(
    () => new Set()
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const visibleGroups = useMemo<SourceGroup[]>(() => {
    const topLevelSources = sources
      .filter(source => source.parentId === null)
      .sort((a, b) => a.name.localeCompare(b.name));

    return topLevelSources.flatMap(parent => {
      const allChildren = sources
        .filter(source => source.parentId === parent.id)
        .sort((a, b) => a.name.localeCompare(b.name));
      const parentMatches =
        !normalizedSearch || matchesSearch(parent.name, normalizedSearch);
      const children = parentMatches
        ? allChildren
        : allChildren.filter(child =>
            matchesSearch(child.name, normalizedSearch)
          );
      return parentMatches || children.length
        ? [{ parent, children, totalChildCount: allChildren.length }]
        : [];
    });
  }, [normalizedSearch, sources]);

  const selectableIds = useMemo(
    () => new Set(sources.map(source => source.id)),
    [sources]
  );
  const selectedVisibleCount = selectedIds.filter(id => selectableIds.has(id)).length;

  const updateSourceSelection = (sourceIds: number[]) => {
    onSelectedIdsChange(toggleSelectedSourceIds(selectedIds, sourceIds));
  };

  const toggleGroupExpanded = (id: number) => {
    setCollapsedGroupIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => onSelectedIdsChange([]);

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {selectedVisibleCount
            ? `${selectedVisibleCount} source${selectedVisibleCount === 1 ? "" : "s"} selected`
            : "Select one or more lead sources"}
        </p>
        {selectedVisibleCount > 0 && (
          <button
            type="button"
            onClick={clearSelection}
            disabled={disabled}
            className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" /> Clear selection
          </button>
        )}
      </div>

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search lead sources"
          className="pl-9"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search lead sources or sub-sources..."
          disabled={disabled}
        />
      </div>

      <div className="mt-3 max-h-80 divide-y overflow-y-auto rounded-md border">
        {visibleGroups.map(({ parent, children, totalChildCount }) => {
          const groupSourceIds = sourceIdsForTopLevel(parent, sources);
          const selectedCount = groupSourceIds.filter(id => selectedIdSet.has(id)).length;
          const groupChecked =
            selectedCount === 0
              ? false
              : selectedCount === groupSourceIds.length
                ? true
                : "indeterminate";
          const expanded = normalizedSearch.length > 0 || !collapsedGroupIds.has(parent.id);

          return (
            <div key={parent.id} className="bg-background">
              <div className="flex min-h-11 items-center gap-2 px-3 py-2">
                <Checkbox
                  id={`one-time-source-group-${parent.id}`}
                  checked={groupChecked}
                  onCheckedChange={() => updateSourceSelection(groupSourceIds)}
                  disabled={disabled}
                  aria-label={`Select all sources under ${parent.name}`}
                />
                <label
                  htmlFor={`one-time-source-group-${parent.id}`}
                  className="min-w-0 flex-1 cursor-pointer text-sm font-medium"
                >
                  <span className="block truncate">{parent.name}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {totalChildCount
                      ? `${totalChildCount} sub-source${totalChildCount === 1 ? "" : "s"} · ${groupSelectionLabel(selectedCount, groupSourceIds.length)}`
                      : groupSelectionLabel(selectedCount, groupSourceIds.length)}
                  </span>
                </label>
                {children.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleGroupExpanded(parent.id)}
                    aria-label={`${expanded ? "Collapse" : "Expand"} ${parent.name} sub-sources`}
                    aria-expanded={expanded}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
              {expanded && children.length > 0 && (
                <div className="border-t bg-muted/20 px-3 py-1.5">
                  {children.map(child => (
                    <label
                      key={child.id}
                      htmlFor={`one-time-source-${child.id}`}
                      className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        id={`one-time-source-${child.id}`}
                        checked={selectedIdSet.has(child.id)}
                        onCheckedChange={() => updateSourceSelection([child.id])}
                        disabled={disabled}
                      />
                      <span className="min-w-0 flex-1 truncate">{child.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {visibleGroups.length === 0 && (
          <p className="px-3 py-7 text-center text-sm text-muted-foreground">
            No lead sources match “{search.trim()}”.
          </p>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Selecting a top-level source includes that source and all of its sub-sources. Select individual sub-sources to target only part of a group.
      </p>
    </div>
  );
}
