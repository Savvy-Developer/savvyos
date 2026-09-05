import type { ReactNode } from "react";
import { ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Standard interactive treatment for a reported number that has underlying
 * SavvyOS records. Use this rather than a static metric value when a report can
 * provide a scoped, permission-checked record drill-down.
 */
export function DrilldownValue({
  children,
  onClick,
  label,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`View underlying ${label}`}
      aria-label={`View underlying ${label}`}
      className={cn(
        "group inline-flex items-center gap-1 rounded-sm text-left underline decoration-primary/35 underline-offset-4 transition hover:text-primary hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span>{children}</span>
      <ListFilter className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70" />
    </button>
  );
}
