import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";

/**
 * Pick the tags a One Time Send goes to.
 *
 * Only tags already in use are offered. A typed tag that matches nothing sends
 * to nobody, and there is no moment later where that becomes visible — the
 * send simply reports zero recipients — so the list is the source of truth.
 */
export default function OneTimeTagAudiencePicker({
  options,
  selectedTags,
  onSelectedTagsChange,
  isLoading = false,
  disabled = false,
}: {
  options: string[];
  selectedTags: string[];
  onSelectedTagsChange: (tags: string[]) => void;
  isLoading?: boolean;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const selected = useMemo(() => new Set(selectedTags), [selectedTags]);

  const visibleTags = useMemo(
    () =>
      normalizedSearch
        ? options.filter(tag => tag.toLocaleLowerCase().includes(normalizedSearch))
        : options,
    [normalizedSearch, options]
  );

  const toggleTag = (tag: string) => {
    onSelectedTagsChange(
      selected.has(tag)
        ? selectedTags.filter(current => current !== tag)
        : [...selectedTags, tag]
    );
  };

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {selectedTags.length
            ? `${selectedTags.length} tag${selectedTags.length === 1 ? "" : "s"} selected`
            : "Select one or more tags"}
        </p>
        {selectedTags.length > 0 && (
          <button
            type="button"
            onClick={() => onSelectedTagsChange([])}
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
          aria-label="Search tags"
          className="pl-9"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search tags..."
          disabled={disabled}
        />
      </div>

      <div className="mt-3 max-h-72 divide-y overflow-y-auto rounded-md border">
        {visibleTags.map(tag => (
          <label
            key={tag}
            htmlFor={`one-time-tag-${tag}`}
            className="flex min-h-10 cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
          >
            <Checkbox
              id={`one-time-tag-${tag}`}
              checked={selected.has(tag)}
              onCheckedChange={() => toggleTag(tag)}
              disabled={disabled}
            />
            <span className="min-w-0 flex-1 truncate">{tag}</span>
          </label>
        ))}
        {!visibleTags.length && (
          <p className="px-3 py-7 text-center text-sm text-muted-foreground">
            {isLoading
              ? "Loading tags..."
              : options.length
                ? `No tags match “${search.trim()}”.`
                : "No contact is tagged yet. Add tags on a contact first."}
          </p>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        A contact carrying any one of the selected tags is included.
      </p>
    </div>
  );
}
