import { useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatTodoDueMonthDay } from "@shared/todoDueDate";

type DueDateValue = Date | string | null | undefined;

function asValidDate(value: DueDateValue) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function atNoon(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

/** A compact inline trigger with a full calendar for choosing the real due date. */
export function ProjectTodoDueDateControl({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: DueDateValue;
  onChange: (value: Date | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const valueDate = useMemo(() => asValidDate(value), [value]);
  const [optimisticDate, setOptimisticDate] = useState<Date | null | undefined>(
    undefined
  );
  const currentDate = optimisticDate === undefined ? valueDate : optimisticDate;
  const [open, setOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(
    () => currentDate ?? new Date()
  );

  useEffect(() => {
    setOptimisticDate(undefined);
  }, [value]);

  useEffect(() => {
    if (open) setCalendarMonth(currentDate ?? new Date());
  }, [open, currentDate]);

  function selectDate(date: Date | undefined) {
    if (!date) return;
    const dueDate = atNoon(date);
    setOptimisticDate(dueDate);
    onChange(dueDate);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label="Project To-Do due date"
          className={cn(
            "h-7 w-[5.75rem] shrink-0 justify-start gap-1 px-1.5 text-xs font-normal",
            className
          )}
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {currentDate ? formatTodoDueMonthDay(currentDate) : "Set date"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={currentDate ?? undefined}
          month={calendarMonth}
          onMonthChange={setCalendarMonth}
          onSelect={selectDate}
          captionLayout="dropdown"
          aria-label="Choose Project To-Do due date"
          initialFocus
          className="p-2"
        />
        {currentDate ? (
          <div className="flex justify-end border-t px-2 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => {
                setOptimisticDate(null);
                onChange(null);
                setOpen(false);
              }}
            >
              Clear due date
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
