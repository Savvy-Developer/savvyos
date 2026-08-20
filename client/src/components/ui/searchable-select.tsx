import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Optional secondary text shown below the label */
  description?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Optional controlled search text for server-backed result lists. */
  searchValue?: string;
  /** Called whenever the user changes the search text. */
  onSearchChange?: (value: string) => void;
  emptyText?: string;
  /** Extra classes on the trigger button */
  className?: string;
  disabled?: boolean;
  /** Allow clearing the selection */
  clearable?: boolean;
  /** Value that represents "no selection" (e.g. "all", "none", "") */
  clearValue?: string;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  searchValue,
  onSearchChange,
  emptyText = "No results found.",
  className,
  disabled = false,
  clearable = false,
  clearValue = "",
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);

  const selected = options.find((o) => o.value === value);

  function handleSelect(optValue: string) {
    onValueChange(optValue);
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onValueChange(clearValue);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">
            {selected ? selected.label : placeholder}
          </span>
          <span className="ml-2 flex shrink-0 items-center gap-1">
            {clearable && selected && value !== clearValue && (
              <X
                className="h-3.5 w-3.5 opacity-50 hover:opacity-100 transition-opacity"
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{ width: "var(--radix-popover-trigger-width)", minWidth: "220px" }}
        align="start"
      >
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={searchValue}
            onValueChange={onSearchChange}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => handleSelect(option.value)}
                  className="flex items-center gap-2"
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex flex-col min-w-0">
                    <span className="truncate">{option.label}</span>
                    {option.description && (
                      <span className="text-xs text-muted-foreground truncate">
                        {option.description}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
