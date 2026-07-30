import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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

export interface MultiSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  /** Max badges shown inline before collapsing to "+N more" */
  maxDisplay?: number;
}

export function MultiSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results found.",
  className,
  disabled = false,
  maxDisplay = 3,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  function toggle(optValue: string) {
    if (value.includes(optValue)) {
      onValueChange(value.filter((v) => v !== optValue));
    } else {
      onValueChange([...value, optValue]);
    }
  }

  function removeOne(optValue: string, e: React.MouseEvent) {
    e.stopPropagation();
    onValueChange(value.filter((v) => v !== optValue));
  }

  function clearAll(e: React.MouseEvent) {
    e.stopPropagation();
    onValueChange([]);
  }

  const selectedOptions = options.filter((o) => value.includes(o.value));
  const visibleBadges = selectedOptions.slice(0, maxDisplay);
  const overflowCount = selectedOptions.length - maxDisplay;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full min-h-9 h-auto justify-between font-normal py-1.5 px-3",
            value.length === 0 && "text-muted-foreground",
            className
          )}
        >
          <span className="flex flex-wrap gap-1 flex-1 min-w-0">
            {value.length === 0 ? (
              <span className="truncate">{placeholder}</span>
            ) : (
              <>
                {visibleBadges.map((opt) => (
                  <Badge
                    key={opt.value}
                    variant="secondary"
                    className="text-xs font-normal gap-1 pr-1 max-w-[160px]"
                  >
                    <span className="truncate">{opt.label}</span>
                    <X
                      className="h-3 w-3 shrink-0 opacity-60 hover:opacity-100 cursor-pointer"
                      onClick={(e) => removeOne(opt.value, e)}
                    />
                  </Badge>
                ))}
                {overflowCount > 0 && (
                  <Badge variant="secondary" className="text-xs font-normal">
                    +{overflowCount} more
                  </Badge>
                )}
              </>
            )}
          </span>
          <span className="ml-2 flex shrink-0 items-center gap-1">
            {value.length > 0 && (
              <X
                className="h-3.5 w-3.5 opacity-50 hover:opacity-100 transition-opacity"
                onClick={clearAll}
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
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = value.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggle(option.value)}
                    className="flex items-center gap-2"
                  >
                    <div
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible"
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </div>
                    <span className="flex flex-col min-w-0">
                      <span className="truncate">{option.label}</span>
                      {option.description && (
                        <span className="text-xs text-muted-foreground truncate">
                          {option.description}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        {value.length > 0 && (
          <div className="border-t p-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-muted-foreground"
              onClick={clearAll}
            >
              Clear all ({value.length})
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
