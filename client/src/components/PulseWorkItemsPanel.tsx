import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { BellRing, CheckSquare2, CircleAlert, Clock3, Loader2, Plus, UserRound } from "lucide-react";

type ViewMode = "personal" | "scope" | "notifications";

function statusLabel(status: string) { return status.replaceAll("_", " "); }
function typeIcon(type: string) { return type === "issue" ? <CircleAlert className="h-4 w-4" /> : <CheckSquare2 className="h-4 w-4" />; }

export function PulseWorkItemsPanel() {
  const utils = trpc.useUtils();
  const { data: scopes = [] } = trpc.pulse.visibleScopes.useQuery(undefined, { staleTime: 15000 });
  const { data: personal = [], isLoading: loadingPersonal } = trpc.pulse.myWork.useQuery(undefined, { staleTime: 10000 });
  const { data: notifications = [] } = trpc.pulse.notificationWork.useQuery(undefined, { staleTime: 10000 });
  const [view, setView] = useState<ViewMode>("personal");
  const [scopeId, setScopeId] = useState("");
  const { data: scoped = [], isLoading: loadingScoped } = trpc.pulse.scopeWork.useQuery({ scopeId: Number(scopeId || 1) }, { enabled: view === "scope" && !!scopeId, staleTime: 10000 });
  const [open, setOpen] = useState(false);
  const [itemType, setItemType] = useState<"todo" | "issue">("todo");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [primaryScopeId, setPrimaryScopeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [timeframe, setTimeframe] = useState("unscheduled");

  const invalidate = () => { utils.pulse.myWork.invalidate(); utils.pulse.scopeWork.invalidate(); utils.pulse.notificationWork.invalidate(); utils.pulse.getFoundation.invalidate(); };
  const createItem = trpc.pulse.createWorkItem.useMutation({
    onSuccess: () => { toast.success("Work item saved with immutable provenance and canonical activity"); setOpen(false); setTitle(""); setDescription(""); setDueDate(""); invalidate(); },
    onError: (error) => toast.error(error.message),
  });

  const items = useMemo(() => view === "personal" ? personal : view === "notifications" ? notifications : scoped, [view, personal, notifications, scoped]);
  const loading = view === "personal" ? loadingPersonal : view === "scope" ? loadingScoped : false;

  return <div className="space-y-4">
    <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent"><CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle>Canonical work items</CardTitle><CardDescription className="mt-1 max-w-3xl">Todos and issues share one Scope-aware base. Every view uses the same owner, source label, activity, normalized placement, and policy decision. Private work always lives in an explicit private Scope.</CardDescription></div><Button onClick={() => setOpen(true)} disabled={scopes.length === 0}><Plus className="mr-2 h-4 w-4" />New item</Button></CardHeader><CardContent className="flex flex-wrap gap-2"><Button size="sm" variant={view === "personal" ? "default" : "outline"} onClick={() => setView("personal")}><UserRound className="mr-1.5 h-3.5 w-3.5" />Personal</Button><Button size="sm" variant={view === "scope" ? "default" : "outline"} onClick={() => setView("scope")}><CheckSquare2 className="mr-1.5 h-3.5 w-3.5" />Scope</Button><Button size="sm" variant={view === "notifications" ? "default" : "outline"} onClick={() => setView("notifications")}><BellRing className="mr-1.5 h-3.5 w-3.5" />Notifications <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{notifications.length}</Badge></Button>{view === "scope" && <Select value={scopeId} onValueChange={setScopeId}><SelectTrigger className="h-8 w-[220px]"><SelectValue placeholder="Choose visible scope" /></SelectTrigger><SelectContent>{scopes.map((scope: any) => <SelectItem key={scope.id} value={String(scope.id)}>{scope.name}</SelectItem>)}</SelectContent></Select>}</CardContent></Card>

    {loading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div> : items.length === 0 ? <Card className="border-dashed"><CardContent className="py-12 text-center"><CheckSquare2 className="mx-auto h-8 w-8 text-muted-foreground/60" /><p className="mt-3 font-medium">No canonical work items in this view</p><p className="mt-1 text-sm text-muted-foreground">Create a Todo or Issue in a visible Scope. Secondary Scope placements are explicit relations, not routing text.</p></CardContent></Card> : <div className="grid gap-3 lg:grid-cols-2">{items.map((item: any) => <Card key={item.id}><CardHeader className="space-y-2 pb-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className="text-primary">{typeIcon(item.itemType)}</span><CardTitle className="truncate text-base">{item.title}</CardTitle></div><CardDescription className="mt-1 line-clamp-2">{item.description || "No description"}</CardDescription></div><Badge variant={item.status === "blocked" ? "destructive" : item.status === "complete" ? "default" : "secondary"}>{statusLabel(item.status)}</Badge></div></CardHeader><CardContent className="space-y-2 border-t pt-3 text-xs"><div className="grid grid-cols-[95px_1fr] gap-x-2 gap-y-1.5"><span className="text-muted-foreground">Source</span><span className="font-medium">{item.sourceLabel}</span><span className="text-muted-foreground">Current scope</span><span>{item.currentScope?.name || "Data quality: unresolved current scope"}</span><span className="text-muted-foreground">Owner</span><span>{item.owner?.displayName || "Unassigned"}</span><span className="text-muted-foreground">Access</span><span>{item.access.viaPlacement ? "Allowed via placement" : "Allowed via primary Scope"}</span></div><div className="flex items-center gap-1 border-t pt-2 text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{item.activity.length} activity events · Created {new Date(item.createdAt).toLocaleDateString()}</div></CardContent></Card>)}</div>}

    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>New canonical work item</DialogTitle><DialogDescription>Creation records immutable actor, time, session, and Scope provenance. Changing Scope later is a separate move that writes activity and never rewrites provenance.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Type</Label><Select value={itemType} onValueChange={(value) => setItemType(value as "todo" | "issue")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todo">Todo</SelectItem><SelectItem value="issue">Issue</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Primary Scope</Label><Select value={primaryScopeId} onValueChange={setPrimaryScopeId}><SelectTrigger><SelectValue placeholder="Choose active Scope" /></SelectTrigger><SelectContent>{scopes.map((scope: any) => <SelectItem key={scope.id} value={String(scope.id)}>{scope.name} · {scope.scopeType}</SelectItem>)}</SelectContent></Select></div></div><div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={itemType === "todo" ? "Follow up with the team" : "Resolve owner decision"} /></div><div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional operating context" /></div>{itemType === "todo" ? <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Due date</Label><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div><div className="space-y-2"><Label>Priority</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["low", "medium", "high", "urgent"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div></div> : <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Priority</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["low", "medium", "high", "critical"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Timeframe</Label><Select value={timeframe} onValueChange={setTimeframe}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["this_week", "this_quarter", "this_year", "someday", "unscheduled"].map((value) => <SelectItem key={value} value={value}>{value.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></div></div>}</div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => createItem.mutate({ itemType, title, description: description || undefined, primaryScopeId: Number(primaryScopeId), todo: itemType === "todo" ? { dueDate: dueDate ? new Date(`${dueDate}T00:00:00.000Z`) : undefined, priority: priority as any } : undefined, issue: itemType === "issue" ? { priority: priority as any, timeframe: timeframe as any } : undefined })} disabled={createItem.isPending || title.trim().length < 2 || !primaryScopeId}>{createItem.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create {itemType === "todo" ? "Todo" : "Issue"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
