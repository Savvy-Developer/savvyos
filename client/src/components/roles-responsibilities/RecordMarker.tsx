import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function RecordMarker({ performance }: { performance?: { kind?: string; label?: string; comparedPeriods?: number } | null }) {
  if (!performance || (performance.kind !== "best" && performance.kind !== "worst")) return null;
  const best = performance.kind === "best";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex h-4 w-4 items-center justify-center text-[11px] leading-none ${best ? "" : "text-muted-foreground/70"}`}
          aria-label={performance.label}
        >
          {best ? "🏆" : "▾"}
        </span>
      </TooltipTrigger>
      <TooltipContent>{performance.label}{performance.comparedPeriods ? ` · ${performance.comparedPeriods} reported weeks` : ""}</TooltipContent>
    </Tooltip>
  );
}
