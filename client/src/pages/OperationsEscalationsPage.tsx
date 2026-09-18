import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { safeFormat } from "@/lib/safeFormat";

type StatusFilter = "open" | "resolved" | "all";

function formatElapsed(start?: string | Date | null, end?: string | Date | null) {
  if (!start) return "—";
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "—";
  const totalMinutes = Math.max(0, Math.floor((endMs - startMs) / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

export default function OperationsEscalationsPage() {
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [selected, setSelected] = useState<any | null>(null);
  const [resolution, setResolution] = useState("");
  const { data, isLoading, refetch } = trpc.operationsEscalations.list.useQuery({ status: filter });
  const resolve = trpc.operationsEscalations.resolve.useMutation({
    onSuccess: (result) => {
      setSelected(null);
      setResolution("");
      void refetch();
      toast.success(result.emailSent
        ? "Operations Escalation resolved and the submitting coach was notified."
        : "Operations Escalation resolved. The submitting coach could not be emailed.");
    },
    onError: (error) => toast.error(error.message),
  });

  const rows = data ?? [];
  const metrics = useMemo(() => ({
    visible: rows.length,
    open: rows.filter((row: any) => row.escalation.status === "Open").length,
    resolved: rows.filter((row: any) => row.escalation.status === "Resolved").length,
    overSevenDays: rows.filter((row: any) => row.escalation.status === "Open" && Date.now() - new Date(row.escalation.createdAt).getTime() >= 7 * 86_400_000).length,
  }), [rows]);

  return (
    <div className="mx-auto max-w-screen-2xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl"><ShieldCheck className="h-5 w-5 text-primary sm:h-6 sm:w-6" />Operations Escalations</h1>
          <p className="mt-1 text-sm text-muted-foreground">Operational blockers submitted by coaches during Coaching Hub sessions.</p>
        </div>
        <Select value={filter} onValueChange={(value) => setFilter(value as StatusFilter)}>
          <SelectTrigger className="w-full sm:w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="all">All escalations</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{metrics.visible}</p><p className="text-xs text-muted-foreground">Visible in this view</p></CardContent></Card>
        <Card className={metrics.open ? "border-amber-200 bg-amber-50/30" : ""}><CardContent className="p-4"><p className="text-2xl font-bold">{metrics.open}</p><p className="text-xs text-muted-foreground">Open</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{metrics.resolved}</p><p className="text-xs text-muted-foreground">Resolved</p></CardContent></Card>
        <Card className={metrics.overSevenDays ? "border-red-200 bg-red-50/30" : ""}><CardContent className="p-4"><p className="text-2xl font-bold">{metrics.overSevenDays}</p><p className="text-xs text-muted-foreground">Open 7+ days</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Escalation Queue</CardTitle>
          <CardDescription>Open items show their live age. Resolved items preserve the resolution and the administrator who closed the loop.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground"><CheckCircle2 className="mx-auto mb-2 h-8 w-8 opacity-40" /><p className="text-sm">No Operations Escalations match this view.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Coach</TableHead>
                  <TableHead className="min-w-[260px]">Escalation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead className="min-w-[250px]">Resolution</TableHead>
                  <TableHead>Resolved by</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow></TableHeader>
                <TableBody>
                  {rows.map((row: any) => {
                    const escalation = row.escalation;
                    const isOpen = escalation.status === "Open";
                    const age = formatElapsed(escalation.createdAt, escalation.resolvedAt);
                    return <TableRow key={escalation.id} className={isOpen ? "bg-amber-50/[0.18]" : ""}>
                      <TableCell className="text-sm font-medium">{row.agent?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{row.submittedBy?.name ?? "—"}<p className="mt-0.5 text-[11px] text-muted-foreground">{safeFormat(escalation.createdAt, "MMM d, yyyy h:mm a")}</p></TableCell>
                      <TableCell className="whitespace-normal text-sm leading-relaxed">{escalation.description}</TableCell>
                      <TableCell><Badge className={isOpen ? "bg-amber-100 text-amber-800 hover:bg-amber-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}>{escalation.status}</Badge></TableCell>
                      <TableCell><span className={`inline-flex items-center gap-1 text-sm ${isOpen ? "font-medium text-amber-800" : "text-muted-foreground"}`}><Clock className="h-3.5 w-3.5" />{isOpen ? `${age} open` : `Resolved in ${age}`}</span></TableCell>
                      <TableCell className="whitespace-normal text-sm leading-relaxed">{escalation.resolution ?? <span className="text-muted-foreground">Awaiting resolution</span>}</TableCell>
                      <TableCell className="text-sm">{row.resolvedBy?.name ?? "—"}{escalation.resolvedAt && <p className="mt-0.5 text-[11px] text-muted-foreground">{safeFormat(escalation.resolvedAt, "MMM d, yyyy")}</p>}</TableCell>
                      <TableCell>{isOpen ? <Button size="sm" onClick={() => { setSelected(row); setResolution(""); }}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Resolve</Button> : <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Closed</span>}</TableCell>
                    </TableRow>;
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) { setSelected(null); setResolution(""); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Resolve Operations Escalation</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Escalation</p><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{selected?.escalation.description}</p></div>
            <div className="space-y-2"><Label htmlFor="operations-escalation-resolution">Resolution <span className="text-destructive">*</span></Label><Textarea id="operations-escalation-resolution" value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="State what was done, who owns any remaining follow-up, and any key context for the coach." rows={6} /></div>
            <div className="flex gap-2 rounded-md border border-sky-100 bg-sky-50 p-3 text-xs text-sky-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>Saving will mark this escalation resolved and email the submitting coach with this resolution.</p></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setSelected(null); setResolution(""); }}>Cancel</Button><Button onClick={() => selected && resolve.mutate({ escalationId: selected.escalation.id, resolution })} disabled={!resolution.trim() || resolve.isPending}>{resolve.isPending ? "Resolving..." : "Resolve & Notify Coach"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
