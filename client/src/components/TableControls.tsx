import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type AggregateMode = "sum" | "avg" | "median" | "count";

export const ROWS_PER_PAGE_OPTIONS = [25, 75, 100] as const;

export function calculateTableAggregate(
  values: number[],
  mode: AggregateMode,
  formatValue: (value: number) => string,
): string {
  const numbers = values.filter((value) => Number.isFinite(value));

  if (numbers.length === 0) return "—";
  if (mode === "count") return numbers.length.toLocaleString();

  if (mode === "sum") {
    return formatValue(numbers.reduce((total, value) => total + value, 0));
  }

  if (mode === "avg") {
    return formatValue(numbers.reduce((total, value) => total + value, 0) / numbers.length);
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];

  return formatValue(median);
}

export function AggregateModeSelector({
  mode,
  onModeChange,
}: {
  mode: AggregateMode;
  onModeChange: (mode: AggregateMode) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground font-medium">
        Page {mode === "count" ? "count" : mode}:
      </span>
      <div className="flex gap-1">
        {(["sum", "avg", "median", "count"] as const).map((nextMode) => (
          <button
            key={nextMode}
            type="button"
            onClick={() => onModeChange(nextMode)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              mode === nextMode
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {nextMode.charAt(0).toUpperCase() + nextMode.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TablePaginationControls({
  totalRows,
  page,
  pageSize,
  itemLabel,
  onPageChange,
  onPageSizeChange,
}: {
  totalRows: number;
  page: number;
  pageSize: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  if (totalRows === 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const firstRow = ((currentPage - 1) * pageSize) + 1;
  const lastRow = Math.min(currentPage * pageSize, totalRows);
  const itemLabelWithCount = totalRows === 1 ? itemLabel : `${itemLabel}s`;

  return (
    <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
      <p className="text-sm text-muted-foreground">
        {totalRows > pageSize
          ? `Showing ${firstRow}–${lastRow} of ${totalRows} ${itemLabelWithCount}`
          : `${totalRows} ${itemLabelWithCount}`}
      </p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="h-8 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROWS_PER_PAGE_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)} className="text-xs">
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {totalPages > 1 && (
          <div className="flex gap-2 items-center">
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
