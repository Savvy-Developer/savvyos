import { CheckCircle2, ClipboardCheck, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { formatEasternDateTime } from "@/lib/format";

type Props = {
  meetingId: string;
  type: "todo" | "issue";
  canRecall: boolean;
  onChanged: () => void;
};

export function PulseMeetingCompletionRail({ meetingId, type, canRecall, onChanged }: Props) {
  const utils = trpc.useUtils();
  const history = trpc.pulse.workItems.history.useQuery({ contextId: meetingId, type });
  const recall = trpc.pulse.workItems.reopen.useMutation({
    onSuccess: (_result, variables) => {
      void history.refetch();
      void utils.pulse.workItems.invalidate();
      void utils.pulse.personal.invalidate();
      void utils.pulse.l10.invalidate();
      onChanged();
      toast.success(type === "issue" ? "Issue recalled to IDS." : "To-Do recalled to the active list.");
    },
    onError: error => toast.error(error.message),
  });
  const noun = type === "issue" ? "Resolved Issues" : "Completed To-Dos";
  const Icon = type === "issue" ? ClipboardCheck : CheckCircle2;
  const items = history.data ?? [];

  return <aside className="rounded-md border border-emerald-200/80 bg-emerald-50/25 xl:sticky xl:top-3">
    <div className="border-b border-emerald-200/70 px-3 py-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-emerald-950"><Icon className="h-4 w-4 text-emerald-700" />{noun}</h3>
      <p className="mt-0.5 text-xs leading-4 text-emerald-900/70">Live completed work in this L10. Recall the same record instantly when needed.</p>
    </div>
    <div className="max-h-[50vh] space-y-1.5 overflow-y-auto p-2">
      {history.isLoading ? <div className="flex items-center justify-center py-5 text-xs text-muted-foreground"><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Loading live work…</div> : history.error ? <p className="rounded border border-destructive/25 bg-background px-2 py-2 text-xs text-destructive">Completed work could not be loaded.</p> : items.length ? items.map((item: any) => <article key={item.id} className="rounded border border-emerald-100 bg-background px-2 py-1.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={item.title}>{item.title}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{type === "issue" ? "Resolved" : "Completed"} {formatEasternDateTime(item.completedAt)}</p>{item.solvedNote ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.solvedNote}</p> : null}</div>
          {canRecall ? <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" disabled={recall.isPending} onClick={() => recall.mutate({ workItemId: item.id, reason: `Recalled from this meeting’s live ${type === "issue" ? "resolved Issues" : "completed To-Dos"} panel.` })}><RotateCcw className="mr-1 h-3 w-3" />Recall</Button> : null}
        </div>
      </article>) : <p className="rounded border border-dashed border-emerald-200 bg-background/60 px-2 py-4 text-center text-xs leading-4 text-muted-foreground">{type === "issue" ? "Resolved Issues" : "Completed To-Dos"} will appear here as soon as they are checked off.</p>}
    </div>
    {!canRecall ? <p className="border-t border-emerald-200/70 px-3 py-1.5 text-[11px] text-muted-foreground">The designated L10 Administrator can recall work during the meeting.</p> : null}
  </aside>;
}
