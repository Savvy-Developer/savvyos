import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays, CheckCircle2, Clock3, Eye, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";

function toIsoDate(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return new Date(value as string | number | Date).toISOString().slice(0, 10);
}

function formatDate(value: unknown) {
  const iso = toIsoDate(value);
  return iso ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00.000Z`)) : "—";
}

function pluralDays(value: number) {
  return `${Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 2)} day${Number(value) === 1 ? "" : "s"}`;
}

function statusStyle(status: string) {
  if (status === "approved") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (status === "declined") return "bg-rose-100 text-rose-800 border-rose-200";
  if (status === "withdrawn") return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-amber-100 text-amber-800 border-amber-200";
}

function BalanceSummary({ balances, requestType }: { balances: any[]; requestType: string }) {
  const selected = balances.find((balance) => balance.ptoType === requestType);
  if (!selected) return null;
  return <div className="rounded-lg border border-teal-100 bg-teal-50/60 p-3"><div className="flex items-baseline justify-between gap-3"><span className="text-sm font-medium text-teal-950">{selected.label} balance</span><span className="text-lg font-semibold tabular-nums text-teal-900">{selected.remaining} days</span></div><div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs text-teal-900/70"><div><p className="font-medium text-teal-950">{selected.accrued}</p><p>accrued</p></div><div><p className="font-medium text-teal-950">{selected.used}</p><p>used</p></div><div><p className="font-medium text-teal-950">{selected.scheduled}</p><p>scheduled</p></div></div></div>;
}

export default function PtoManagerQueuePage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: queue = [], isLoading, error } = trpc.pto.managerQueue.useQuery();
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [decision, setDecision] = useState<"approved" | "declined" | null>(null);
  const [reason, setReason] = useState("");
  const selectedRequest = useMemo(() => queue.find((request: any) => request.id === selectedRequestId) as any | undefined, [queue, selectedRequestId]);
  const detailQuery = trpc.pto.managerRequestDetails.useQuery({ requestId: selectedRequestId ?? 1 }, { enabled: selectedRequestId !== null });
  const decideMutation = trpc.pto.decideRequest.useMutation({
    onSuccess: (result) => {
      toast.success(`PTO request ${result.status}.`);
      setDecision(null);
      setReason("");
      setSelectedRequestId(null);
      utils.pto.managerQueue.invalidate();
      utils.pto.pendingCount.invalidate();
    },
    onError: (mutationError) => toast.error(mutationError.message),
  });

  function closeDetail() {
    setSelectedRequestId(null);
    setDecision(null);
    setReason("");
  }

  function decide() {
    if (!selectedRequestId || !decision) return;
    decideMutation.mutate({ requestId: selectedRequestId, decision, reason: reason.trim() || null });
  }

  if (isLoading) return <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="mx-auto max-w-xl py-16 text-center"><ShieldAlert className="mx-auto h-10 w-10 text-destructive" /><h1 className="mt-3 text-lg font-semibold">PTO approvals restricted</h1><p className="mt-1 text-sm text-muted-foreground">{error.message}</p><Button className="mt-4" variant="outline" onClick={() => navigate("/pto")}>Return to My PTO</Button></div>;

  const pending = queue.filter((request: any) => request.status === "pending");
  const past = queue.filter((request: any) => request.status !== "pending");

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <section className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white px-6 py-6 md:flex-row md:items-center md:justify-between">
        <div><div className="flex items-center gap-2 text-amber-800"><ClipboardCheckIcon /><span className="text-sm font-medium">Direct-report workflow</span></div><h1 className="mt-1 text-3xl font-semibold tracking-tight">PTO Approvals</h1><p className="mt-2 text-sm text-muted-foreground">Review requests only from your current direct reports. The oldest requests appear first.</p></div>
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3"><Clock3 className="h-5 w-5 text-amber-600" /><div><p className="text-2xl font-semibold leading-none">{pending.length}</p><p className="mt-1 text-xs text-muted-foreground">awaiting your decision</p></div></div>
      </section>

      <Card>
        <CardHeader><CardTitle className="text-lg">Pending queue</CardTitle><CardDescription>Balances include approved future PTO that is already reserved. Open a request to inspect its full history and approved overlaps.</CardDescription></CardHeader>
        <CardContent>
          {pending.length === 0 ? <div className="py-12 text-center text-muted-foreground"><CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" /><p className="font-medium text-foreground">You are all caught up.</p><p className="mt-1 text-sm">There are no pending PTO requests from your direct reports.</p></div> : <QueueTable rows={pending} onOpen={setSelectedRequestId} />}
        </CardContent>
      </Card>

      {past.length > 0 ? <Card><CardHeader><CardTitle className="text-lg">Recent decisions</CardTitle><CardDescription>Only requests from your current direct reports are shown.</CardDescription></CardHeader><CardContent><QueueTable rows={past} onOpen={setSelectedRequestId} /></CardContent></Card> : null}

      <Dialog open={selectedRequestId !== null} onOpenChange={(open) => { if (!open) closeDetail(); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {detailQuery.isLoading ? <div className="flex min-h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : detailQuery.error ? <div className="py-8 text-center"><ShieldAlert className="mx-auto h-8 w-8 text-destructive" /><p className="mt-2 text-sm">{detailQuery.error.message}</p></div> : detailQuery.data ? <>
            <DialogHeader><div className="flex flex-wrap items-center gap-2"><DialogTitle>{detailQuery.data.employee.name ?? detailQuery.data.employee.email}</DialogTitle><Badge variant="outline" className={statusStyle(detailQuery.data.request.status)}>{detailQuery.data.request.status}</Badge></div><DialogDescription>{detailQuery.data.request.ptoType.charAt(0).toUpperCase() + detailQuery.data.request.ptoType.slice(1)} PTO request submitted {formatDate(detailQuery.data.request.createdAt)}.</DialogDescription></DialogHeader>
            <div className="space-y-5 py-2">
              <div className="grid gap-3 sm:grid-cols-3"><InfoCell label="Dates" value={`${formatDate(detailQuery.data.request.startDate)} – ${formatDate(detailQuery.data.request.endDate)}`} /><InfoCell label="Duration" value={pluralDays(detailQuery.data.request.requestedDays)} /><InfoCell label="Current balance" value={`${detailQuery.data.balances.find((balance: any) => balance.ptoType === detailQuery.data.request.ptoType)?.remaining ?? 0} days`} /></div>
              <BalanceSummary balances={detailQuery.data.balances} requestType={detailQuery.data.request.ptoType} />
              <div><p className="mb-1.5 text-sm font-medium">Coverage notes</p><div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{detailQuery.data.request.coverageNotes || "No coverage notes were provided."}</div></div>
              <Separator />
              <div><p className="mb-2 text-sm font-medium">Approved PTO overlap</p>{detailQuery.data.overlappingApprovedRequests.length === 0 ? <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No other approved PTO from your direct reports overlaps these dates.</p> : <div className="space-y-2">{detailQuery.data.overlappingApprovedRequests.map((overlap: any) => <div key={overlap.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"><div><span className="font-medium">{overlap.employeeName}</span><span className="text-muted-foreground"> · {overlap.ptoType} · {formatDate(overlap.startDate)} – {formatDate(overlap.endDate)}</span></div><Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{pluralDays(overlap.requestedDays)}</Badge></div>)}</div>}</div>
              <div><p className="mb-2 text-sm font-medium">Request history</p><div className="space-y-2">{detailQuery.data.history.map((entry: any) => <div key={entry.id} className="flex gap-3 text-sm"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-cyan-500" /><div><p><span className="font-medium">{entry.actorName}</span> {entry.eventType} this request.</p>{entry.reason ? <p className="mt-0.5 text-xs text-muted-foreground">{entry.reason}</p> : null}<p className="mt-0.5 text-xs text-muted-foreground">{formatDate(entry.createdAt)}</p></div></div>)}</div></div>
              {detailQuery.data.request.status === "pending" ? <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4"><Label htmlFor="pto-decision-note">Decision note {decision === "declined" ? <span className="text-destructive">(required to decline)</span> : <span className="text-muted-foreground">(optional for approval)</span>}</Label><Textarea id="pto-decision-note" className="mt-2 min-h-24 bg-white" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Provide context for the employee." maxLength={5000} /><div className="mt-3 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setDecision("declined")} disabled={decideMutation.isPending}><XCircle className="mr-1.5 h-4 w-4 text-rose-600" />Decline</Button><Button onClick={() => setDecision("approved")} disabled={decideMutation.isPending}><CheckCircle2 className="mr-1.5 h-4 w-4" />Approve</Button></div></div> : null}
            </div>
            <DialogFooter><Button variant="outline" onClick={closeDetail}>Close</Button></DialogFooter>
          </> : selectedRequest ? <p className="py-8 text-center text-sm text-muted-foreground">Loading request details…</p> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={decision !== null} onOpenChange={(open) => { if (!open) setDecision(null); }}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>{decision === "approved" ? "Approve PTO request" : "Decline PTO request"}</DialogTitle><DialogDescription>{decision === "approved" ? "Approval creates an immutable PTO ledger deduction and notifies the employee." : "A decline reason is required and will be included in the employee notification."}</DialogDescription></DialogHeader>{decision === "declined" && !reason.trim() ? <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">Add a reason before declining this request.</p> : null}<DialogFooter><Button variant="outline" onClick={() => setDecision(null)} disabled={decideMutation.isPending}>Cancel</Button><Button variant={decision === "declined" ? "destructive" : "default"} onClick={decide} disabled={decideMutation.isPending || (decision === "declined" && !reason.trim())}>{decideMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Confirm {decision === "approved" ? "approval" : "decline"}</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}

function QueueTable({ rows, onOpen }: { rows: any[]; onOpen: (requestId: number) => void }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-2 py-3 font-medium">Employee</th><th className="px-2 py-3 font-medium">Dates</th><th className="px-2 py-3 font-medium">Duration</th><th className="px-2 py-3 font-medium">Type</th><th className="px-2 py-3 font-medium">Remaining</th><th className="px-2 py-3 font-medium">Status</th><th className="px-2 py-3" /></tr></thead><tbody>{rows.map((request) => <tr key={request.id} className="border-b last:border-0"><td className="px-2 py-3 font-medium">{request.employee.name ?? request.employee.email}</td><td className="px-2 py-3 text-muted-foreground">{formatDate(request.startDate)} – {formatDate(request.endDate)}</td><td className="px-2 py-3">{pluralDays(request.requestedDays)}</td><td className="px-2 py-3 capitalize">{request.ptoType}</td><td className="px-2 py-3 font-medium tabular-nums">{request.remainingBalance} days</td><td className="px-2 py-3"><Badge variant="outline" className={statusStyle(request.status)}>{request.status}</Badge></td><td className="px-2 py-3 text-right"><Button variant="outline" size="sm" onClick={() => onOpen(request.id)}><Eye className="mr-1.5 h-3.5 w-3.5" />Inspect</Button></td></tr>)}</tbody></table></div>;
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium leading-snug">{value}</p></div>;
}

function ClipboardCheckIcon() {
  return <CalendarDays className="h-5 w-5" />;
}
