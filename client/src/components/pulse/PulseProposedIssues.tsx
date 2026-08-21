import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

export function PulseProposedIssues({ proposals, onChanged }: { proposals: any[]; onChanged: () => void }) {
  const [reasonFor, setReasonFor] = useState<string | null>(null); const [reason, setReason] = useState("");
  const accept = trpc.pulse.observations.acceptProposal.useMutation({ onSuccess: onChanged });
  const dismiss = trpc.pulse.observations.dismissProposal.useMutation({ onSuccess: () => { setReasonFor(null); setReason(""); onChanged(); } });
  if (!proposals.length) return null;
  return <div className="mt-4 space-y-3 border-t border-dashed border-border pt-4"><p className="text-sm font-medium">Proposed issues <span className="font-normal text-muted-foreground">(not on the agenda yet)</span></p>{proposals.map((proposal: any) => <article key={proposal.id} className="rounded-lg border border-dashed border-border bg-muted/30 p-3"><div className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><div className="min-w-0 flex-1"><span className="inline-flex rounded bg-muted px-2 py-0.5 text-xs font-medium">Proposed</span><p className="mt-2 font-medium">{proposal.title}</p>{proposal.description && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{proposal.description}</p>}<div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" className="min-h-11" onClick={() => accept.mutate({ workItemId: proposal.id })} disabled={accept.isPending}>Accept onto agenda</Button><Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setReasonFor(reasonFor === proposal.id ? null : proposal.id)}>Dismiss</Button></div>{reasonFor === proposal.id && <div className="mt-3 flex gap-2"><Input aria-label={`Dismissal reason for ${proposal.title}`} className="min-h-11" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional reason" /><Button type="button" variant="outline" className="min-h-11" onClick={() => dismiss.mutate({ workItemId: proposal.id, reason: reason.trim() || undefined })} disabled={dismiss.isPending}>Confirm</Button></div>}</div></div></article>)}</div>;
}
