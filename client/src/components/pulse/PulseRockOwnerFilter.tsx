import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const ALL_ROCK_OWNERS = "all";

export function rockOwnerKey(rock: { ownerId?: number | null }) {
  return rock.ownerId == null ? "unassigned" : String(rock.ownerId);
}

/** Keeps one L10 Rock review focused on one owner at a time. */
export function PulseRockOwnerFilter({
  rocks,
  value,
  onValueChange,
}: {
  rocks: Array<{ ownerId?: number | null; ownerName?: string | null }>;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const owners = useMemo(() => {
    const unique = new Map<string, string>();
    for (const rock of rocks) {
      const key = rockOwnerKey(rock);
      if (!unique.has(key))
        unique.set(key, rock.ownerName?.trim() || "Unassigned");
    }
    return Array.from(unique, ([id, name]) => ({ id, name })).sort(
      (left, right) => left.name.localeCompare(right.name)
    );
  }, [rocks]);

  if (!owners.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label htmlFor="l10-rock-owner-filter" className="text-sm font-medium">
        Review owner
      </Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger
          id="l10-rock-owner-filter"
          aria-label="Filter Rocks by owner"
          className="h-9 w-full min-w-40 sm:w-52"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_ROCK_OWNERS}>All owners</SelectItem>
          {owners.map(owner => (
            <SelectItem key={owner.id} value={owner.id}>
              {owner.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
