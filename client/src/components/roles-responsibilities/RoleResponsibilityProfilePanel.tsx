import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Archive, ArrowDown, ArrowUp, BarChart3, CheckCircle2, ClipboardList, ExternalLink, FileText, Loader2, Plus, Send, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import RrEditorDialog from "./RrEditorDialog";

type Owner = { id: number; name: string | null; email: string | null; title: string | null; department?: string | null };

type Props = { ownerId: number; ownerName: string; isAdmin: boolean; showStaffContext?: boolean };

const cadenceLabels: Record<string, string> = { ongoing: "Ongoing", daily: "Daily", weekly: "Weekly", biweekly: "Every two weeks", monthly: "Monthly", quarterly: "Quarterly", annually: "Annually", as_needed: "As needed", custom: "Custom" };

function stripHtml(value?: string | null) {
  return (value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export default function RoleResponsibilityProfilePanel({ ownerId, ownerName, isAdmin }: Props) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [transferTarget, setTransferTarget] = useState<any>(null);
  const [newOwnerId, setNewOwnerId] = useState("");
  const [showDrafts, setShowDrafts] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [drafts, setDrafts] = useState<any[]>([]);

  const { data: capability, isLoading: capabilityLoading } = trpc.rolesResponsibilities.capability.useQuery(undefined, { retry: false });
  const { data: summary, isLoading } = trpc.rolesResponsibilities.profileSummary.useQuery({ ownerId, includeArchived }, { enabled: !!capability });
  const { data: owners = [] } = trpc.rolesResponsibilities.listAdmins.useQuery(undefined, { enabled: !!capability && isAdmin });
  const archiveMutation = trpc.rolesResponsibilities.archive.useMutation({ onSuccess: () => { void utils.rolesResponsibilities.profileSummary.invalidate({ ownerId }); void utils.rolesResponsibilities.list.invalidate(); toast.success("Responsibility updated"); }, onError: (error) => toast.error(error.message) });
  const reorderMutation = trpc.rolesResponsibilities.reorder.useMutation({ onSuccess: () => { void utils.rolesResponsibilities.profileSummary.invalidate({ ownerId }); }, onError: (error) => toast.error(error.message) });
  const transferMutation = trpc.rolesResponsibilities.transfer.useMutation({ onSuccess: (result) => { void utils.rolesResponsibilities.profileSummary.invalidate(); void utils.rolesResponsibilities.list.invalidate(); void utils.rolesResponsibilities.get.invalidate(); void utils.users.orgChart.invalidate(); toast.success(`Transferred to ${result.newOwner.name ?? "new owner"}`); setTransferTarget(null); }, onError: (error) => toast.error(error.message) });
  const draftMutation = trpc.rolesResponsibilities.aiDraftResponsibilities.useMutation({ onSuccess: (result) => { setDrafts(result.drafts ?? []); }, onError: (error) => toast.error(error.message) });

  const responsibilities = (summary?.responsibilities ?? []) as any[];
  const scorecard = (summary?.scorecard ?? []) as any[];
  const canView = !!capability;
  const ownerOptions = useMemo(() => (owners as Owner[]).filter((owner) => owner.id !== ownerId), [owners, ownerId]);

  if (!isAdmin) return null;
  if (capabilityLoading) return <Card><CardContent className="py-8 flex items-center justify-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading Roles & Responsibilities…</CardContent></Card>;
  if (!canView) return null;

  function move(id: number, direction: -1 | 1) {
    const ids = responsibilities.map((item) => item.id);
    const index = ids.indexOf(id);
    const destination = index + direction;
    if (destination < 0 || destination >= ids.length) return;
    [ids[index], ids[destination]] = [ids[destination], ids[index]];
    reorderMutation.mutate({ ownerId, ids });
  }

  function openTransfer(item: any) { setTransferTarget(item); setNewOwnerId(""); }
  function createFromDraft(draft: any) { setEditing({ ownerId, title: draft.title ?? "", description: draft.description ?? "", cadence: draft.cadence ?? "ongoing", cadenceDetails: draft.cadenceDetails ?? "" }); setShowDrafts(false); setEditorOpen(true); }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="font-semibold flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" />Roles & Responsibilities</h3><p className="text-sm text-muted-foreground">Current ownership and scorecard for {ownerName}.</p></div>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => navigate("/roles-responsibilities")}><ExternalLink className="h-3.5 w-3.5 mr-1.5" />Company directory</Button><Button size="sm" variant="outline" onClick={() => { setDraftPrompt(""); setDrafts([]); setShowDrafts(true); }}><Sparkles className="h-3.5 w-3.5 mr-1.5" />Draft with AI</Button><Button size="sm" onClick={() => { setEditing(null); setEditorOpen(true); }}><Plus className="h-3.5 w-3.5 mr-1.5" />Add R&R</Button></div>
      </div>
      <div className="flex items-center gap-2 text-sm"><Checkbox id={`include-archived-${ownerId}`} checked={includeArchived} onCheckedChange={(value) => setIncludeArchived(!!value)} /><Label htmlFor={`include-archived-${ownerId}`} className="cursor-pointer text-muted-foreground">Show archived responsibilities</Label></div>
      {isLoading ? <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading responsibilities…</CardContent></Card> : responsibilities.length === 0 ? <Card className="border-dashed"><CardContent className="py-10 text-center"><ClipboardList className="h-7 w-7 mx-auto text-muted-foreground mb-2" /><p className="font-medium">No {includeArchived ? "matching" : "active"} responsibilities yet</p><p className="text-sm text-muted-foreground mt-1">Add the work this staff member owns, then attach SOPs, resources, and scorecard metrics.</p><Button className="mt-4" size="sm" onClick={() => { setEditing(null); setEditorOpen(true); }}><Plus className="h-3.5 w-3.5 mr-1.5" />Add first R&R</Button></CardContent></Card> : <div className="space-y-3">{responsibilities.map((item, index) => <Card key={item.id} className={item.status === "archived" ? "opacity-70" : ""}><CardContent className="p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start"><div className="flex-1 min-w-0"><div className="flex flex-wrap items-center gap-2"><button className="font-semibold text-left hover:text-primary hover:underline" onClick={() => navigate(`/roles-responsibilities/${item.id}`)}>{item.title}</button><Badge variant="outline" className={item.status === "archived" ? "bg-muted" : "bg-emerald-50 text-emerald-700 border-emerald-200"}>{item.status}</Badge><Badge variant="outline">{cadenceLabels[item.cadence] ?? item.cadence}</Badge></div>{item.cadenceDetails && <p className="text-xs text-muted-foreground mt-1">{item.cadenceDetails}</p>}{stripHtml(item.description) && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{stripHtml(item.description)}</p>}</div><div className="flex items-center gap-1 shrink-0"><Button variant="ghost" size="icon" title="Move up" disabled={index === 0 || reorderMutation.isPending} onClick={() => move(item.id, -1)}><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Move down" disabled={index === responsibilities.length - 1 || reorderMutation.isPending} onClick={() => move(item.id, 1)}><ArrowDown className="h-4 w-4" /></Button><Button variant="outline" size="sm" onClick={() => navigate(`/roles-responsibilities/${item.id}`)}>Open</Button><Button variant="outline" size="sm" onClick={() => { setEditing(item); setEditorOpen(true); }}>Edit</Button><Button variant="outline" size="sm" onClick={() => openTransfer(item)}><Send className="h-3.5 w-3.5 mr-1" />Transfer</Button><Button variant="ghost" size="icon" title={item.status === "active" ? "Archive" : "Restore"} onClick={() => archiveMutation.mutate({ id: item.id, archived: item.status === "active" })}>{item.status === "active" ? <Archive className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}</Button></div></div></CardContent></Card>)}</div>}
      <Card><CardContent className="p-4"><div className="flex items-center justify-between mb-3"><div><h4 className="font-medium flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" />Scorecard summary</h4><p className="text-xs text-muted-foreground">Metrics from all active responsibilities.</p></div><Button size="sm" variant="outline" onClick={() => navigate(`/roles-responsibilities?view=scorecards&owner=${ownerId}`)}>Open scorecard</Button></div>{scorecard.length === 0 ? <p className="text-sm text-muted-foreground py-2">No active scorecard metrics are attached to this staff member’s R&Rs.</p> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{scorecard.map((metric) => <div key={metric.id} className="rounded-md border p-3"><p className="font-medium text-sm truncate">{metric.name}</p><p className="text-xs text-muted-foreground mt-0.5">{metric.actual == null ? "No current value" : metric.actual} / {metric.target ?? "—"}</p><p className={`text-xs mt-1 font-medium ${metric.onTarget === true ? "text-emerald-700" : metric.onTarget === false ? "text-red-700" : "text-muted-foreground"}`}>{metric.onTarget === true ? "On target" : metric.onTarget === false ? "Off target" : "Target not set"}</p></div>)}</div>}</CardContent></Card>
      <RrEditorDialog open={editorOpen} onOpenChange={setEditorOpen} owners={owners as Owner[]} responsibility={editing} defaultOwnerId={ownerId} onSaved={(id) => navigate(`/roles-responsibilities/${id}`)} />
      <Dialog open={!!transferTarget} onOpenChange={(open) => !open && setTransferTarget(null)}><DialogContent><DialogHeader><DialogTitle>Transfer individual R&R</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground"><strong className="text-foreground">{transferTarget?.title}</strong> will move from {ownerName}. Its SOPs, resources, metrics, values, and explicitly linked open tasks move with it immediately.</p><div className="space-y-1.5"><Label>New owner</Label><Select value={newOwnerId} onValueChange={setNewOwnerId}><SelectTrigger><SelectValue placeholder="Select an active admin" /></SelectTrigger><SelectContent>{ownerOptions.map((owner) => <SelectItem key={owner.id} value={String(owner.id)}>{owner.name ?? owner.email}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setTransferTarget(null)}>Cancel</Button><Button disabled={!newOwnerId || transferMutation.isPending} onClick={() => transferMutation.mutate({ id: transferTarget.id, newOwnerId: Number(newOwnerId) })}>{transferMutation.isPending ? "Transferring…" : "Confirm transfer"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={showDrafts} onOpenChange={setShowDrafts}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Draft responsibilities with AI</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-1.5"><Label>Optional guidance</Label><Input value={draftPrompt} onChange={(event) => setDraftPrompt(event.target.value)} placeholder="Focus on current operations and recurring work" /></div><Button disabled={draftMutation.isPending} onClick={() => draftMutation.mutate({ ownerId, prompt: draftPrompt || undefined })}>{draftMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Drafting…</> : <><Sparkles className="h-4 w-4 mr-2" />Generate proposals</>}</Button>{drafts.length > 0 && <div className="space-y-3">{drafts.map((draft, index) => <Card key={`${draft.title}-${index}`}><CardContent className="p-4"><div className="flex gap-3"><div className="flex-1"><p className="font-medium">{draft.title}</p><p className="text-sm text-muted-foreground mt-1">{draft.description}</p><p className="text-xs text-muted-foreground mt-2">{cadenceLabels[draft.cadence] ?? draft.cadence}{draft.cadenceDetails ? ` · ${draft.cadenceDetails}` : ""}</p></div><Button size="sm" onClick={() => createFromDraft(draft)}>Review & create</Button></div></CardContent></Card>)}</div>}</div><DialogFooter><Button variant="outline" onClick={() => setShowDrafts(false)}>Close</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
