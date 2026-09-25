import { CheckCircle2, Circle, Clock3, ListChecks, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeFormat } from "@/lib/safeFormat";

const CLOSED_STATUSES = new Set(["Completed", "Partially Completed", "Missed", "Waived", "No Longer Relevant"]);

export default function AgentCoachingChecklist() {
  const { data: commitments = [], isLoading: commitmentsLoading } = trpc.coaching.listMyCommitments.useQuery();
  const { data: followUps = [], isLoading: followUpsLoading } = trpc.operationsEscalations.listMine.useQuery();
  const openCommitments = (commitments as any[]).filter(item => !CLOSED_STATUSES.has(item.status));
  const recentFollowUps = (followUps as any[]).slice(0, 5);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><ListChecks className="h-4 w-4 text-primary" />My Coaching</CardTitle>
        <CardDescription>Your active commitments and Savvy follow-ups. Internal coaching and Operations notes stay private.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">My Commitments</p><Badge variant="secondary" className="text-[10px]">{openCommitments.length} active</Badge></div>
          {commitmentsLoading ? <p className="text-sm text-muted-foreground">Loading commitments…</p> : openCommitments.length === 0 ? <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">No active coaching commitments right now.</div> : <div className="space-y-2">{openCommitments.slice(0, 5).map((item: any) => {
            const overdue = item.dueDate && new Date(item.dueDate).getTime() < Date.now();
            return <div key={item.id} className={`flex items-start gap-2 rounded-md border p-3 ${overdue ? "border-amber-200 bg-amber-50/50" : ""}`}><Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-sm font-medium leading-snug">{item.description}</p>{item.expectedResult && <p className="mt-1 text-xs text-muted-foreground">Success: {item.expectedResult}</p>}<p className={`mt-1 text-[11px] ${overdue ? "font-medium text-amber-700" : "text-muted-foreground"}`}>{item.dueDate ? `${overdue ? "Overdue" : "Due"} ${safeFormat(item.dueDate, "MMM d, yyyy")}` : "No due date set"} · {item.status}</p></div></div>;
          })}</div>}
        </div>
        <div className="border-t pt-4">
          <div className="mb-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Savvy Follow-Ups</p></div>
          {followUpsLoading ? <p className="text-sm text-muted-foreground">Loading follow-ups…</p> : recentFollowUps.length === 0 ? <p className="text-sm text-muted-foreground">No Operations follow-ups are currently on file.</p> : <div className="space-y-2">{recentFollowUps.map((item: any) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><div className="flex min-w-0 items-center gap-2"><CheckCircle2 className={`h-4 w-4 shrink-0 ${item.status === "Resolved" ? "text-emerald-600" : "text-amber-500"}`} /><p className="text-sm">{item.status === "Resolved" ? "Savvy resolved a follow-up" : "Savvy is reviewing a follow-up"}</p></div><span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"><Clock3 className="h-3 w-3" />{safeFormat(item.resolvedAt ?? item.createdAt, "MMM d")}</span></div>)}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
