import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Building2, CalendarDays, History, Loader2, PencilLine, Plus, Settings2, ShieldAlert, UsersRound } from "lucide-react";
import { toast } from "sonner";

const PTO_TYPES = ["vacation", "sick", "personal", "bereavement", "other"] as const;
type PtoType = typeof PTO_TYPES[number];
type PolicyDraft = { ptoType: PtoType; annualAccrualDays: number; carryoverCapDays: number; waitingPeriodDays: number; effectiveDate: string; isActive: boolean };

function todayIso() { return new Date().toISOString().slice(0, 10); }
function toIsoDate(value: unknown): string { if (!value) return ""; return typeof value === "string" ? value.slice(0, 10) : new Date(value as string | number | Date).toISOString().slice(0, 10); }
function formatDate(value: unknown) { const iso = toIsoDate(value); return iso ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00.000Z`)) : "—"; }
function typeLabel(type: string) { return type.charAt(0).toUpperCase() + type.slice(1); }
function formatSignedDays(value: number) { return `${value > 0 ? "+" : ""}${Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 2)}`; }

export default function PtoAdministrationPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.pto.adminOverview.useQuery();
  const [drafts, setDrafts] = useState<PolicyDraft[]>([]);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [ptoType, setPtoType] = useState<PtoType>("vacation");
  const [amountDays, setAmountDays] = useState("1");
  const [effectiveDate, setEffectiveDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [newDepartmentName, setNewDepartmentName] = useState("");

  const currentPolicies = useMemo(() => {
    const values = (data?.policies ?? []) as any[];
    return PTO_TYPES.map((ptoType) => values.find((policy) => policy.ptoType === ptoType) ?? { ptoType, annualAccrualDays: 0, carryoverCapDays: 0, waitingPeriodDays: 0, effectiveDate: "2026-01-01", isActive: true });
  }, [data?.policies]);

  useEffect(() => {
    setDrafts(currentPolicies.map((policy: any) => ({ ptoType: policy.ptoType, annualAccrualDays: Number(policy.annualAccrualDays), carryoverCapDays: Number(policy.carryoverCapDays), waitingPeriodDays: Number(policy.waitingPeriodDays), effectiveDate: toIsoDate(policy.effectiveDate), isActive: Boolean(policy.isActive) })));
  }, [currentPolicies]);

  const savePoliciesMutation = trpc.pto.savePolicies.useMutation({
    onSuccess: () => { toast.success("PTO accrual policy saved."); utils.pto.adminOverview.invalidate(); },
    onError: (mutationError) => toast.error(mutationError.message),
  });
  const adjustmentMutation = trpc.pto.recordAdjustment.useMutation({
    onSuccess: () => {
      toast.success("PTO balance adjustment recorded.");
      setAdjustmentOpen(false); setEmployeeId(""); setPtoType("vacation"); setAmountDays("1"); setEffectiveDate(todayIso()); setReason("");
      utils.pto.adminOverview.invalidate();
    },
    onError: (mutationError) => toast.error(mutationError.message),
  });
  const createDepartmentMutation = trpc.pto.createDepartment.useMutation({
    onSuccess: () => { toast.success("PTO department created."); setNewDepartmentName(""); utils.pto.adminOverview.invalidate(); },
    onError: (mutationError) => toast.error(mutationError.message),
  });
  const assignDepartmentMutation = trpc.pto.assignEmployeeDepartment.useMutation({
    onSuccess: () => { toast.success("PTO department assignment updated."); utils.pto.adminOverview.invalidate(); },
    onError: (mutationError) => toast.error(mutationError.message),
  });

  function updateDraft(type: PtoType, field: keyof PolicyDraft, value: number | string | boolean) {
    setDrafts((current) => current.map((draft) => draft.ptoType === type ? { ...draft, [field]: value } : draft));
  }

  function savePolicies() {
    savePoliciesMutation.mutate(drafts);
  }

  function recordAdjustment() {
    if (!employeeId) { toast.error("Choose an employee for this adjustment."); return; }
    adjustmentMutation.mutate({ employeeId: Number(employeeId), ptoType, amountDays: Number(amountDays), effectiveDate, reason: reason.trim() });
  }

  function createDepartment() {
    if (!newDepartmentName.trim()) return;
    createDepartmentMutation.mutate({ name: newDepartmentName.trim() });
  }

  if (isLoading) return <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="mx-auto max-w-xl py-16 text-center"><ShieldAlert className="mx-auto h-10 w-10 text-destructive" /><h1 className="mt-3 text-lg font-semibold">PTO administration restricted</h1><p className="mt-1 text-sm text-muted-foreground">{error.message}</p><Button className="mt-4" variant="outline" onClick={() => navigate("/pto")}>Return to My PTO</Button></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <section className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 px-6 py-7 text-white md:flex-row md:items-end md:justify-between">
        <div><div className="mb-2 flex items-center gap-2 text-teal-100"><Settings2 className="h-5 w-5" /><span className="text-sm font-medium">PTO controls</span></div><h1 className="text-3xl font-semibold tracking-tight">PTO Administration</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-teal-50/80">Configure accrual policy, review every active employee’s balances, and record fully traceable corrections.</p></div>
        <Button variant="secondary" onClick={() => setAdjustmentOpen(true)}><PencilLine className="mr-2 h-4 w-4" />Record adjustment</Button>
      </section>

      <Tabs defaultValue="policy" className="space-y-6">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto"><TabsTrigger value="policy"><Settings2 className="mr-1.5 h-4 w-4" />Policy</TabsTrigger><TabsTrigger value="balances"><UsersRound className="mr-1.5 h-4 w-4" />Everyone’s balances</TabsTrigger><TabsTrigger value="ledger"><History className="mr-1.5 h-4 w-4" />Adjustment ledger</TabsTrigger></TabsList>
        <TabsContent value="policy" className="space-y-5">
          <Card><CardHeader><CardTitle>Policy guardrails</CardTitle><CardDescription>These settings define the current PTO operating model. The reporting line is read solely from the standard SavvyOS user relationship.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-3"><Guardrail label="Reporting-line source" value={data?.settings?.reportingLineSource || "users.reportsToId"} /><Guardrail label="Negative balance" value={data?.settings?.negativeBalanceAllowed ? "Allowed" : "Not allowed"} tone={data?.settings?.negativeBalanceAllowed ? "warning" : "good"} /><Guardrail label="PTO payout" value={data?.settings?.payoutAllowed ? "Allowed" : "Not allowed"} tone={data?.settings?.payoutAllowed ? "warning" : "good"} /></CardContent></Card>
          <Card><CardHeader className="flex-row items-start justify-between gap-4 space-y-0"><div><CardTitle>Accrual schedule</CardTitle><CardDescription>Rates are calendar-year annual amounts, prorated by calendar day after the type’s waiting period. Policy records take effect on their stated date.</CardDescription></div><Button size="sm" onClick={savePolicies} disabled={savePoliciesMutation.isPending}>{savePoliciesMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save policy</Button></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-2 py-3">PTO type</th><th className="px-2 py-3">Annual days</th><th className="px-2 py-3">Carryover cap</th><th className="px-2 py-3">Waiting period</th><th className="px-2 py-3">Effective date</th></tr></thead><tbody>{drafts.map((draft) => <tr key={draft.ptoType} className="border-b last:border-0"><td className="px-2 py-3 font-medium">{typeLabel(draft.ptoType)}</td><td className="px-2 py-3"><Input aria-label={`${draft.ptoType} annual days`} className="h-9 w-28" type="number" min="0" max="366" step="0.25" value={draft.annualAccrualDays} onChange={(event) => updateDraft(draft.ptoType, "annualAccrualDays", Number(event.target.value))} /></td><td className="px-2 py-3"><Input aria-label={`${draft.ptoType} carryover cap`} className="h-9 w-28" type="number" min="0" max="366" step="0.25" value={draft.carryoverCapDays} onChange={(event) => updateDraft(draft.ptoType, "carryoverCapDays", Number(event.target.value))} /></td><td className="px-2 py-3"><div className="flex items-center gap-2"><Input aria-label={`${draft.ptoType} waiting period`} className="h-9 w-24" type="number" min="0" max="365" step="1" value={draft.waitingPeriodDays} onChange={(event) => updateDraft(draft.ptoType, "waitingPeriodDays", Number(event.target.value))} /><span className="text-xs text-muted-foreground">days</span></div></td><td className="px-2 py-3"><Input aria-label={`${draft.ptoType} effective date`} className="h-9 w-40" type="date" value={draft.effectiveDate} onChange={(event) => updateDraft(draft.ptoType, "effectiveDate", event.target.value)} /></td></tr>)}</tbody></table></div></CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" />PTO department buckets</CardTitle><CardDescription>Red PTO conflicts use these employee buckets. Existing admin profiles are placed in their matching department; all other active PTO users start in Other until reassigned.</CardDescription></CardHeader><CardContent><div className="flex flex-wrap gap-2">{(data?.departments ?? []).map((department: any) => <Badge key={department.id} variant="secondary">{department.name}</Badge>)}</div><div className="mt-4 flex max-w-md gap-2"><Input value={newDepartmentName} onChange={(event) => setNewDepartmentName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); createDepartment(); } }} placeholder="Add a PTO department" maxLength={128} /><Button onClick={createDepartment} disabled={createDepartmentMutation.isPending || !newDepartmentName.trim()}>{createDepartmentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}<span className="sr-only">Add department</span></Button></div></CardContent></Card>
        </TabsContent>
        <TabsContent value="balances"><Card><CardHeader><CardTitle>Everyone’s PTO balances</CardTitle><CardDescription>Balances combine accrued time, carryover, approved use, scheduled time, and named adjustments. Assign each employee to the bucket used for same-department coverage safeguards.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[1140px] text-sm"><thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-2 py-3">Employee</th><th className="px-2 py-3">PTO department</th>{PTO_TYPES.map((type) => <th key={type} className="px-2 py-3">{typeLabel(type)}</th>)}</tr></thead><tbody>{(data?.employees ?? []).map((entry: any) => <tr key={entry.employee.id} className="border-b last:border-0"><td className="px-2 py-3"><p className="font-medium">{entry.employee.name ?? entry.employee.email}</p><p className="text-xs text-muted-foreground">{entry.employee.email}</p></td><td className="px-2 py-3"><Select value={String(entry.employee.ptoDepartmentId ?? "")} onValueChange={(value) => assignDepartmentMutation.mutate({ employeeId: entry.employee.id, departmentId: Number(value) })}><SelectTrigger className="h-9 w-40"><SelectValue placeholder="Assign department" /></SelectTrigger><SelectContent>{(data?.departments ?? []).map((department: any) => <SelectItem key={department.id} value={String(department.id)}>{department.name}</SelectItem>)}</SelectContent></Select></td>{PTO_TYPES.map((type) => { const balance = entry.balances.find((item: any) => item.ptoType === type); return <td key={type} className="px-2 py-3"><p className="font-semibold tabular-nums">{balance?.remaining ?? 0} days</p><p className="text-xs text-muted-foreground">{balance?.accrued ?? 0} accrued · {balance?.used ?? 0} used</p></td>; })}</tr>)}</tbody></table></div></CardContent></Card></TabsContent>
        <TabsContent value="ledger"><Card><CardHeader><CardTitle>Balance adjustment ledger</CardTitle><CardDescription>Approved requests create their own traceable deductions. This ledger lists the most recent named administrator adjustments.</CardDescription></CardHeader><CardContent>{(data?.adjustments ?? []).length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No balance adjustments have been recorded.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-2 py-3">Effective</th><th className="px-2 py-3">Employee</th><th className="px-2 py-3">Type</th><th className="px-2 py-3">Change</th><th className="px-2 py-3">Reason</th><th className="px-2 py-3">Recorded by</th></tr></thead><tbody>{(data?.adjustments ?? []).map((adjustment: any) => <tr key={adjustment.id} className="border-b last:border-0"><td className="px-2 py-3 text-muted-foreground">{formatDate(adjustment.effectiveDate)}</td><td className="px-2 py-3 font-medium">{adjustment.employeeName}</td><td className="px-2 py-3 capitalize">{adjustment.ptoType}</td><td className={`px-2 py-3 font-semibold tabular-nums ${adjustment.amountDays > 0 ? "text-emerald-700" : "text-rose-700"}`}>{formatSignedDays(adjustment.amountDays)} days</td><td className="max-w-[300px] px-2 py-3 text-muted-foreground"><span className="line-clamp-2">{adjustment.reason}</span></td><td className="px-2 py-3 text-muted-foreground">{adjustment.recordedByName}</td></tr>)}</tbody></table></div>}</CardContent></Card></TabsContent>
      </Tabs>

      <Dialog open={adjustmentOpen} onOpenChange={setAdjustmentOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Record PTO balance adjustment</DialogTitle><DialogDescription>Every adjustment names the administrator, carries a reason, and remains in the PTO ledger.</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div><Label htmlFor="pto-adjustment-employee">Employee</Label><Select value={employeeId} onValueChange={setEmployeeId}><SelectTrigger id="pto-adjustment-employee" className="mt-1.5"><SelectValue placeholder="Select employee" /></SelectTrigger><SelectContent>{(data?.employees ?? []).map((entry: any) => <SelectItem key={entry.employee.id} value={String(entry.employee.id)}>{entry.employee.name ?? entry.employee.email}</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-2 gap-3"><div><Label htmlFor="pto-adjustment-type">PTO type</Label><Select value={ptoType} onValueChange={(value) => setPtoType(value as PtoType)}><SelectTrigger id="pto-adjustment-type" className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{PTO_TYPES.map((type) => <SelectItem key={type} value={type}>{typeLabel(type)}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="pto-adjustment-days">Adjustment days</Label><Input id="pto-adjustment-days" className="mt-1.5" type="number" step="0.25" min="-366" max="366" value={amountDays} onChange={(event) => setAmountDays(event.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Use a positive or negative amount.</p></div></div><div><Label htmlFor="pto-adjustment-effective">Effective date</Label><Input id="pto-adjustment-effective" className="mt-1.5" type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} /></div><div><Label htmlFor="pto-adjustment-reason">Reason</Label><Textarea id="pto-adjustment-reason" className="mt-1.5 min-h-24" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={5000} placeholder="Explain the balance correction or grant." /></div></div><DialogFooter><Button variant="outline" onClick={() => setAdjustmentOpen(false)} disabled={adjustmentMutation.isPending}>Cancel</Button><Button onClick={recordAdjustment} disabled={adjustmentMutation.isPending || !employeeId || !reason.trim() || !amountDays || Number(amountDays) === 0}>{adjustmentMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Record adjustment</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function Guardrail({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warning" }) {
  const className = tone === "good" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-800";
  return <div className={`rounded-lg border p-3 ${className}`}><p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}
