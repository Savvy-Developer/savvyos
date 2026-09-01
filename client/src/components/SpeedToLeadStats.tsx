import { Timer } from "lucide-react";

type SpeedToLeadWindow = {
  key: string;
  label: string;
  averageMinutes: number | null;
  respondedCount: number;
  incomingCount: number;
};

function formatDuration(minutes: number | null) {
  if (minutes === null || !Number.isFinite(minutes)) return "—";
  if (minutes < 1) return "< 1m";
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainingMinutes = rounded % 60;
  if (!hours) return `${remainingMinutes}m`;
  if (!remainingMinutes) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

export function SpeedToLeadStats({
  windows,
  channel,
}: {
  windows?: SpeedToLeadWindow[];
  channel: "text" | "email";
}) {
  const isText = channel === "text";
  const readyWindows = windows ?? [];

  return (
    <section
      aria-label={`Speed to lead for ${channel} replies`}
      className="rounded-xl border bg-card shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Timer className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Speed to lead</h2>
            <p className="text-xs text-muted-foreground">
              Average time to the first SavvyOS{" "}
              {isText ? "text reply" : "email reply"} after an inbound {channel}
              .
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Responded conversations only
        </p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
        {readyWindows.map(window => (
          <div key={window.key} className="min-w-0 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {window.label}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatDuration(window.averageMinutes)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {window.respondedCount}/{window.incomingCount} replied
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
