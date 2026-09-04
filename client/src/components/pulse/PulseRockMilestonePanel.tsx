import { useRef } from "react";
import { CheckCircle2, Milestone } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Checkbox } from "@/components/ui/checkbox";
import { PulseCompletionCelebration, usePulseCompletionCelebration } from "@/components/pulse/PulseCompletionCelebration";

export function PulseRockMilestonePanel({ rockId, onChanged }: { rockId: string; onChanged: () => void }) {
  const detail = trpc.pulse.workItems.detail.useQuery({ workItemId: rockId });
  const anchor = useRef<HTMLDivElement>(null);
  const { celebration, celebrate } = usePulseCompletionCelebration();
  const update = trpc.pulse.workItems.setMilestoneComplete.useMutation({
    onSuccess: (result, variables) => {
      if (variables.isComplete && result.finalMilestoneCompleted) {
        celebrate(anchor.current, "milestone", "Final Rock milestone complete");
        toast.success("Final Rock milestone complete");
      } else toast.success(variables.isComplete ? "Milestone completed" : "Milestone reopened");
      void detail.refetch();
      onChanged();
    },
    onError: error => toast.error(error.message),
  });
  const milestones = detail.data?.milestones ?? [];
  if (!milestones.length) return null;
  const completed = milestones.filter((entry: any) => entry.isComplete).length;
  return <section ref={anchor} className="mt-3 rounded-md border border-amber-200 bg-amber-50/45 p-3"><PulseCompletionCelebration celebration={celebration} /><div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-950"><Milestone className="h-4 w-4 text-amber-700" />Milestones</h3><span className="text-xs font-medium text-amber-800">{completed}/{milestones.length} complete</span></div><div className="mt-2 space-y-1.5">{milestones.map((milestone: any) => <label key={milestone.id} className="flex items-center gap-2 rounded bg-background/70 px-2 py-1.5 text-sm"><Checkbox checked={milestone.isComplete} disabled={update.isPending} onCheckedChange={checked => update.mutate({ milestoneId: milestone.id, isComplete: Boolean(checked) })} /><span className={milestone.isComplete ? "line-through text-muted-foreground" : "font-medium"}>{milestone.title}</span>{milestone.dueDate ? <span className="ml-auto text-xs text-muted-foreground">Due {new Date(`${milestone.dueDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span> : null}</label>)}</div>{completed === milestones.length ? <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800"><CheckCircle2 className="h-3.5 w-3.5" />All milestones are complete.</p> : null}</section>;
}
