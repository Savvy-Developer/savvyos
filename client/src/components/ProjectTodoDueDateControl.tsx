import { useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  formatTodoDueMonthDay,
  inferTodoDueDate,
  maxTodoDueDay,
  TODO_DUE_MONTHS,
} from "@shared/todoDueDate";

type DueDateValue = Date | string | null | undefined;

function asValidDate(value: DueDateValue) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A compact picker for inline Project to-do rows. The selected month and day
 * resolve to the next matching date, so the row never needs to display a year.
 */
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
  const [month, setMonth] = useState(() =>
    String(currentDate?.getMonth() ?? new Date().getMonth())
  );
  const [day, setDay] = useState(() =>
    String(currentDate?.getDate() ?? new Date().getDate())
  );
  const selectedMonth = Number(month);
  const selectedDay = Number(day);
  const maxDay = maxTodoDueDay(selectedMonth);
  const availableDays = Array.from({ length: maxDay }, (_, index) => index + 1);

  useEffect(() => {
    setOptimisticDate(undefined);
  }, [value]);

  function syncDraft() {
    const date = asValidDate(value);
    setMonth(String(date?.getMonth() ?? new Date().getMonth()));
    setDay(String(date?.getDate() ?? new Date().getDate()));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) syncDraft();
    setOpen(nextOpen);
  }

  function handleMonthChange(nextMonth: string) {
    const nextMaximumDay = maxTodoDueDay(Number(nextMonth));
    setMonth(nextMonth);
    if (Number(day) > nextMaximumDay) setDay(String(nextMaximumDay));
  }

  function save() {
    const nextDate = inferTodoDueDate(selectedMonth, selectedDay);
    setOptimisticDate(nextDate);
    onChange(nextDate);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
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
      <PopoverContent align="end" className="w-64 p-3">
        <p className="text-sm font-semibold">Due date</p>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_4.5rem] gap-2">
          <Select value={month} onValueChange={handleMonthChange}>
            <SelectTrigger aria-label="Due month" className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TODO_DUE_MONTHS.map((label, index) => (
                <SelectItem key={label} value={String(index)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={day} onValueChange={setDay}>
            <SelectTrigger aria-label="Due day" className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableDays.map(value => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          The year is inferred: dates already passed this year are scheduled for
          next year.
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          {currentDate ? (
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
              Clear
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={save}
          >
            Set due date
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
