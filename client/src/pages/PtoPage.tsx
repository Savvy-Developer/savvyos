import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays, Clock3, Loader2, Send, XCircle } from "lucide-react";
import { toast } from "sonner";

const PTO_TYPES = ["vacation", "sick", "personal", "bereavement", "other"] as const;
type PtoType = typeof PTO_TYPES[number];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toIsoDate(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return new Date(value as string | number | Date).toISOString().slice(0, 10);
}

function formatDate(value: unknown) {
  const iso = toIsoDate(value);
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00.000Z`));
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

function calendarDays(startDate: string, endDate: string) {
  if (!startDate || !endDate || endDate < startDate) return 0;
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

function RequestTable({ requests, onWithdraw, withdrawingId }: { requests: any[]; onWithdraw?: (id: number) => void; withdrawingId?: number | null }) {
  if (requests.length === 0) {
    return <p className="py-5 text-sm text-muted-foreground">No PTO requests in this section.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr><th className="px-2 py-3 font-medium">Type</th><th className="px-2 py-3 font-medium">Dates</th><th className="px-2 py-3 font-medium">Duration</th><th className="px-2 py-3 font-medium">Status</th><th className="px-2 py-3 font-medium">Notes</th><th className="px-2 py-3" /></tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id} className="border-b last:border-0">
              <td className="px-2 py-3 font-medium capitalize">{request.ptoType}</td>
              <td className="px-2 py-3 text-muted-foreground">{formatDate(request.startDate)} – {formatDate(request.endDate)}</td>
              <td className="px-2 py-3">{pluralDays(request.requestedDays)}</td>
              <td className="px-2 py-3"><Badge variant="outline" className={statusStyle(request.status)}>{request.status}</Badge></td>
              <td className="max-w-[230px] px-2 py-3 text-xs text-muted-foreground"><span className="line-clamp-2">{request.decisionReason || request.coverageNotes || "—"}</span></td>
              <td className="px-2 py-3 text-right">
                {request.status === "pending" && onWithdraw ? <Button variant="outline" size="sm" onClick={() => onWithdraw(request.id)} disabled={withdrawingId === request.id}>{withdrawingId === request.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Withdraw"}</Button> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PtoPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.pto.myDashboard.useQuery();
  const [ptoType, setPtoType] = useState<PtoType>("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [requestedDays, setRequestedDays] = useState<number>(1);
  const [coverageNotes, setCoverageNotes] = useState("");
  const [withdrawalTarget, setWithdrawalTarget] = useState<number | null>(null);

  useEffect(() => {
    const calculated = calendarDays(startDate, endDate);
    if (calculated > 0) setRequestedDays(calculated);
  }, [startDate, endDate]);

  const submitMutation = trpc.pto.submitRequest.useMutation({
    onSuccess: () => {
      toast.success("PTO request submitted to your reporting manager.");
      setStartDate("");
      setEndDate("");
      setRequestedDays(1);
      setCoverageNotes("");
      utils.pto.myDashboard.invalidate();
    },
    onError: (mutationError) => toast.error(mutationError.message),
  });
  const withdrawMutation = trpc.pto.withdrawRequest.useMutation({
    onSuccess: () => {
      toast.success("Your PTO request was withdrawn.");
      setWithdrawalTarget(null);
      utils.pto.myDashboard.invalidate();
    },
    onError: (mutationError) => {
      setWithdrawalTarget(null);
      toast.error(mutationError.message);
    },
  });

  const requests = (data?.requests ?? []) as any[];
  const now = todayIso();
  const pending = useMemo(() => requests.filter((request) => request.status === "pending"), [requests]);
  const upcoming = useMemo(() => requests.filter((request) => request.status === "approved" && toIsoDate(request.endDate) >= now), [requests, now]);
  const past = useMemo(() => requests.filter((request) => request.status !== "pending" && !(request.status === "approved" && toIsoDate(request.endDate) >= now)), [requests, now]);
  const selectedBalance = (data?.balances ?? []).find((balance: any) => balance.ptoType === ptoType);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    submitMutation.mutate({ ptoType, startDate, endDate, requestedDays: Number(requestedDays), coverageNotes: coverageNotes.trim() || null });
  }

  function withdraw(requestId: number) {
    setWithdrawalTarget(requestId);
    withdrawMutation.mutate({ requestId });
  }

  if (isLoading) return <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="mx-auto max-w-xl py-16 text-center"><XCircle className="mx-auto h-10 w-10 text-destructive" /><h1 className="mt-3 text-lg font-semibold">PTO unavailable</h1><p className="mt-1 text-sm text-muted-foreground">{error.message}</p></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <section className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-cyan-950 via-slate-900 to-cyan-900 px-6 py-7 text-white shadow-sm md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-cyan-100"><CalendarDays className="h-5 w-5" /><span className="text-sm font-medium">Personal time off</span></div>
          <h1 className="text-3xl font-semibold tracking-tight">My PTO</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-cyan-50/80">Review your available time, request time away, and keep your coverage plan together in one place.</p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {(data?.balances ?? []).map((balance: any) => (
          <Card key={balance.ptoType} className="overflow-hidden">
            <CardHeader className="space-y-0 border-b bg-muted/30 px-4 py-3"><CardTitle className="text-sm font-semibold">{balance.label}</CardTitle><CardDescription className="text-xs">{balance.annualAccrualDays} days/year</CardDescription></CardHeader>
            <CardContent className="p-4">
              <div className="text-2xl font-semibold tabular-nums">{balance.remaining}</div><p className="text-xs text-muted-foreground">remaining</p>
              <div className="mt-3 grid grid-cols-3 gap-1 border-t pt-3 text-center text-xs"><div><p className="font-medium">{balance.accrued}</p><p className="text-muted-foreground">accrued</p></div><div><p className="font-medium">{balance.used}</p><p className="text-muted-foreground">used</p></div><div><p className="font-medium">{balance.scheduled}</p><p className="text-muted-foreground">scheduled</p></div></div>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4 text-amber-600" />Pending requests</CardTitle><CardDescription>Pending requests can be withdrawn until your manager decides.</CardDescription></CardHeader>
            <CardContent><RequestTable requests={pending} onWithdraw={withdraw} withdrawingId={withdrawalTarget} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-emerald-600" />Approved and upcoming</CardTitle><CardDescription>Approved future time is already reserved from your remaining balance.</CardDescription></CardHeader>
            <CardContent><RequestTable requests={upcoming} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Request history</CardTitle><CardDescription>Completed, declined, and withdrawn requests remain visible for your records.</CardDescription></CardHeader>
            <CardContent><RequestTable requests={past} /></CardContent>
          </Card>
        </div>

        <Card className="h-fit xl:sticky xl:top-5">
          <CardHeader><CardTitle className="text-lg">Request PTO</CardTitle><CardDescription>Requests are sent to the manager assigned in your SavvyOS reporting line.</CardDescription></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div><Label>Employee</Label><Input className="mt-1.5 bg-muted" value={(user as any)?.name ?? (user as any)?.email ?? "Current user"} readOnly /></div>
                <div><Label>Manager</Label><Input className="mt-1.5 bg-muted" value={data?.manager?.name ?? data?.manager?.email ?? "Not configured"} readOnly /></div>
              </div>
              <div><Label htmlFor="pto-type">PTO type</Label><Select value={ptoType} onValueChange={(value) => setPtoType(value as PtoType)}><SelectTrigger id="pto-type" className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{PTO_TYPES.map((type) => <SelectItem key={type} value={type} className="capitalize">{type.charAt(0).toUpperCase() + type.slice(1)}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="pto-start">Start date</Label><Input id="pto-start" className="mt-1.5" type="date" min={todayIso()} value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></div><div><Label htmlFor="pto-end">End date</Label><Input id="pto-end" className="mt-1.5" type="date" min={startDate || todayIso()} value={endDate} onChange={(event) => setEndDate(event.target.value)} required /></div></div>
              <div><div className="flex items-end justify-between gap-3"><Label htmlFor="pto-days">Requested days</Label>{startDate && endDate ? <span className="text-xs text-muted-foreground">Calculated: {calendarDays(startDate, endDate)} calendar days</span> : null}</div><Input id="pto-days" className="mt-1.5" type="number" step="0.25" min="0.25" max={calendarDays(startDate, endDate) || undefined} value={requestedDays} onChange={(event) => setRequestedDays(Number(event.target.value))} required /><p className="mt-1.5 text-xs text-muted-foreground">{selectedBalance ? `${selectedBalance.remaining} ${selectedBalance.label.toLowerCase()} days currently available.` : ""}</p></div>
              <div><Label htmlFor="pto-coverage">Coverage notes <span className="text-muted-foreground">(optional)</span></Label><Textarea id="pto-coverage" className="mt-1.5 min-h-24" maxLength={5000} value={coverageNotes} onChange={(event) => setCoverageNotes(event.target.value)} placeholder="Share handoff details, coverage plan, or other context for your manager." /></div>
              <Button className="w-full" type="submit" disabled={submitMutation.isPending || !data?.manager || !startDate || !endDate}>{submitMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Submit request</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
