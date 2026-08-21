import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export function PulseMetricObservations({ meetingId, onChanged }: { meetingId: string; onChanged: () => void }) {
  const observations = trpc.pulse.observations.forMeeting.useQuery({ meetingId });
  const raise = trpc.pulse.observations.raiseAsIssue.useMutation({ onSuccess: onChanged });
  const active = (observations.data ?? []).filter((observation: any) => !observation.raisedAsIssueId && !observation.dismissedAt);
  if (!active.length) return null;
  return <div className="space-y-3 border-t border-border pt-4">{active.map((observation: any) => <article key={observation.id} className="rounded-lg border border-border bg-muted/30 p-3"><div className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="font-medium">{observation.metricName}</p><p className="mt-1 text-sm leading-5">{observation.observation}</p><p className="mt-2 text-xs text-muted-foreground">Generated {new Date(observation.generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p><Button type="button" size="sm" className="mt-3 min-h-11" onClick={() => raise.mutate({ observationId: observation.id, meetingId })} disabled={raise.isPending}>{raise.isPending ? "Creating…" : "Raise as an issue"}</Button></div></div></article>)}</div>;
}
