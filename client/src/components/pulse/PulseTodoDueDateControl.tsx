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
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** Compact Pulse date trigger with a calendar for choosing the stored due date. */
export function PulseTodoDueDateControl({
  value,
  onChange,
  disabled = false,
  allowClear = true,
  className,
}: {
  value: DueDateValue;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  allowClear?: boolean;
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
    const selected = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      12
    );
    setOptimisticDate(selected);
    onChange(dateOnly(selected));
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
          aria-label="To-Do due date"
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
          aria-label="Choose To-Do due date"
          initialFocus
          className="p-2"
        />
        {allowClear && currentDate ? (
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
