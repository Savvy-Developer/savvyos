import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, Check, CheckCircle2, Circle, ClipboardList, ExternalLink, UserRound } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

function plainText(value?: string | null) {
  return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function dueLabel(value?: Date | string | null) {
  if (!value) return "No due date";
  return format(new Date(value), "MMM d, yyyy");
}

export default function L10TodosProjectPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: todos = [], isLoading } = trpc.pm.l10Todos.listMine.useQuery();
  const [showResolved, setShowResolved] = useState(false);
  const [resolving, setResolving] = useState<any>(null);
  const [resolution, setResolution] = useState("");
  const resolve = trpc.pm.l10Todos.resolve.useMutation({
    onSuccess: () => {
      toast.success("Resolution saved. It is ready for acknowledgement in the next L10.");
      setResolving(null);
      setResolution("");
      void utils.pm.l10Todos.invalidate();
      void utils.pulse.workItems.invalidate();
      void utils.pulse.l10.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const visibleTodos = useMemo(() => (todos as any[]).filter(todo => showResolved || todo.status !== "completed"), [todos, showResolved]);
  const openCount = (todos as any[]).filter(todo => todo.status !== "completed").length;
  const awaitingAcknowledgement = (todos as any[]).filter(todo => todo.requiresL10Acknowledgement).length;

  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
    <button type="button" onClick={() => navigate("/projects")} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Back to Projects
    </button>
    <PageHeader
      title="L10 Todos"
      subtitle="Your protected live list of commitments from every L10. This is not a separate task list."
      actions={<div className="flex flex-wrap items-center gap-2 text-sm"><span className="rounded-full border bg-muted/40 px-2.5 py-1 font-medium">{openCount} open</span>{awaitingAcknowledgement ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-800">{awaitingAcknowledgement} awaiting acknowledgement</span> : null}</div>}
    />

    <section className="rounded-lg border border-primary/20 bg-primary/[0.025] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ClipboardList className="h-5 w-5" /></span>
          <div>
            <h2 className="font-semibold">How this works</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Resolve a To-Do here with a concise explanation of what happened. The resolution stays with its source L10 and appears there for the team to acknowledge. No one can add work to this list, delete it, or move it out of its L10.</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setShowResolved(current => !current)}>{showResolved ? "Hide resolved" : "Show resolved"}</Button>
      </div>
    </section>

    <section className="space-y-2">
      {isLoading ? <div className="rounded-lg border p-6 text-sm text-muted-foreground">Loading L10 To-Dos…</div> : null}
      {!isLoading && visibleTodos.length === 0 ? <div className="rounded-lg border border-dashed p-10 text-center"><CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-600" /><p className="font-medium">{showResolved ? "No L10 To-Dos found" : "No open L10 To-Dos"}</p><p className="mt-1 text-sm text-muted-foreground">{showResolved ? "There are no commitments to show from your L10 meetings." : "You are clear. New commitments from your L10s will appear here automatically."}</p></div> : null}
      {visibleTodos.map((todo: any) => {
        const completed = todo.status === "completed";
        const awaiting = completed && todo.requiresL10Acknowledgement;
        return <article key={todo.id} className={`rounded-lg border bg-card p-4 ${awaiting ? "border-amber-200 bg-amber-50/30" : ""}`}>
          <div className="flex gap-3">
            <button type="button" disabled={completed} onClick={() => { setResolving(todo); setResolution(""); }} className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${completed ? "cursor-default border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700"}`} aria-label={completed ? "Resolved" : `Resolve ${todo.title}`} title={completed ? "Resolved" : "Resolve with an explanation"}>{completed ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}</button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><h2 className={`font-semibold ${completed ? "text-muted-foreground line-through" : ""}`}>{todo.title}</h2><p className="mt-1 text-sm text-muted-foreground">{plainText(todo.description) || "No additional context provided."}</p></div>
                {awaiting ? <span className="shrink-0 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Awaiting L10 acknowledgement</span> : completed ? <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">Resolved & acknowledged</span> : <Button asChild size="sm" variant="outline" className="h-8"><a href={`/pulse/meetings/${todo.meetingId}`}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open L10</a></Button>}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">{todo.meetingName}</span><span>Due {dueLabel(todo.dueDate)}</span><span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />Assigned by {todo.assignedByName ?? "a teammate"}</span></div>
            </div>
          </div>
        </article>;
      })}
    </section>

    <Dialog open={Boolean(resolving)} onOpenChange={open => { if (!open) { setResolving(null); setResolution(""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Resolve L10 To-Do</DialogTitle><DialogDescription>This explanation will be shown in the source L10 for the team to acknowledge.</DialogDescription></DialogHeader>
        <div className="space-y-2"><Label htmlFor="l10-todo-resolution">How was this resolved?</Label><Textarea id="l10-todo-resolution" value={resolution} onChange={event => setResolution(event.target.value)} placeholder="State the outcome, deliverable, or action taken…" className="min-h-28" autoFocus /></div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => { setResolving(null); setResolution(""); }}>Cancel</Button><Button type="button" disabled={!resolution.trim() || resolve.isPending} onClick={() => resolving && resolve.mutate({ workItemId: resolving.id, resolution: resolution.trim() })}>{resolve.isPending ? "Saving…" : "Resolve & send to L10"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </main>;
}
