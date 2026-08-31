/**
 * LeadSourcePicker — a searchable, hierarchy-aware source selector.
 * A source category with children is represented by its selectable sub-sources;
 * categories without children remain directly selectable.
 */
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";

interface LeadSourcePickerProps {
  value: number | null | undefined;
  onChange: (id: number) => void;
  className?: string;
}

type LeadSourceRow = {
  ls: { id: number; name: string; parentId: number | null; isActive: boolean };
};

const NON_MANUAL_SOURCE_NAMES = new Set([
  "unattributed",
  "unattributed (webhook)",
]);

function isManualSource(name: string): boolean {
  return !NON_MANUAL_SOURCE_NAMES.has(name.trim().toLowerCase());
}

export default function LeadSourcePicker({
  value,
  onChange,
  className,
}: LeadSourcePickerProps) {
  const { user } = useAuth();
  const { data: rawSources = [] } = trpc.leadSources.list.useQuery();

  const sourceOptions = useMemo<SearchableSelectOption[]>(() => {
    const allSources = rawSources as unknown as LeadSourceRow[];
    const byId = new Map(allSources.map(source => [source.ls.id, source]));
    const isVisibleSource = (source: LeadSourceRow): boolean => {
      let current: LeadSourceRow | undefined = source;
      const visited = new Set<number>();
      while (current && !visited.has(current.ls.id)) {
        visited.add(current.ls.id);
        if (!current.ls.isActive || !isManualSource(current.ls.name)) return false;
        if (user?.role !== "admin" && current.ls.name.trim().toLowerCase() === "soi list") return false;
        current = current.ls.parentId === null ? undefined : byId.get(current.ls.parentId);
      }
      return true;
    };
    const visibleSources = allSources.filter(isVisibleSource);
    const visibleIds = new Set(visibleSources.map(source => source.ls.id));
    const topLevel = visibleSources.filter(source => source.ls.parentId === null);
    const options: SearchableSelectOption[] = [];

    topLevel.forEach(parent => {
      const children = visibleSources.filter(source => source.ls.parentId === parent.ls.id);
      if (children.length === 0) {
        options.push({
          value: String(parent.ls.id),
          label: parent.ls.name,
          description: "Main source",
        });
        return;
      }

      children.forEach(child => {
        options.push({
          value: String(child.ls.id),
          label: child.ls.name,
          description: `Under ${parent.ls.name}`,
        });
      });
    });

    // A corrupted or legacy hierarchy should not hide an otherwise valid source.
    // Keep it discoverable with an explicit hierarchy label.
    visibleSources
      .filter(source => source.ls.parentId !== null && !visibleIds.has(source.ls.parentId))
      .forEach(source => {
        options.push({
          value: String(source.ls.id),
          label: source.ls.name,
          description: "Sub-source",
        });
      });

    return options;
  }, [rawSources, user?.role]);

  return (
    <div className={className}>
      <SearchableSelect
        options={sourceOptions}
        value={value ? String(value) : ""}
        onValueChange={selectedValue => onChange(Number(selectedValue))}
        placeholder="Choose a lead source…"
        searchPlaceholder="Search main sources and sub-sources…"
        emptyText="No selectable lead sources found."
        showSelectedDescription
        listClassName="!max-h-[min(28rem,calc(100vh-12rem))]"
      />
      <p className="mt-1.5 text-xs text-muted-foreground">
        Sub-sources show the main source they belong to. Unattributed sources are reserved for automated records.
      </p>
    </div>
  );
}
