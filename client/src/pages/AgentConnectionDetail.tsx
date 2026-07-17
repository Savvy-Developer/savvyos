import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft, User, Phone, Mail, MapPin, DollarSign, Home, Edit2, Save, X,
  MessageSquare, CheckSquare, FileText, Plus, Calendar, Tag, Mic,
  PhoneCall, AtSign, Users, Building2, Star, Zap, ExternalLink
} from "lucide-react";
import SmartPlanContactTab from "@/components/SmartPlanContactTab";
import { safeFormat } from "@/lib/safeFormat";
import { useAppBack } from "@/lib/navigationHistory";
import PipelineEmailComposer from "@/components/PipelineEmailComposer";
import { isValidEmail } from "@/lib/inputFormatters";

const PIPELINE_STAGES = [
  { value: "new_lead", label: "New Lead", color: "bg-slate-100 text-slate-700" },
  { value: "attempted_contact", label: "Attempted Contact", color: "bg-yellow-100 text-yellow-700" },
  { value: "nurture", label: "Nurture", color: "bg-blue-100 text-blue-700" },
  { value: "active_client", label: "Active Client", color: "bg-green-100 text-green-700" },
  { value: "under_contract", label: "Under Contract", color: "bg-purple-100 text-purple-700" },
  { value: "closed", label: "Closed", color: "bg-emerald-100 text-emerald-700" },
  { value: "dead", label: "Dead", color: "bg-red-100 text-red-700" },
];

const COMM_TYPES = [
  { value: "note", label: "Note", icon: MessageSquare },
  { value: "call", label: "Call", icon: PhoneCall },
  { value: "email", label: "Email", icon: AtSign },
  { value: "sms", label: "SMS", icon: MessageSquare },
  { value: "meeting", label: "Meeting", icon: Users },
];

export default function AgentConnectionDetail() {
  const [, params] = useRoute("/pipeline/:id");
  const [, navigate] = useLocation();
  const goBack = useAppBack("/pipeline");
  const { user } = useAuth();
  const id = parseInt(params?.id ?? "0");

  const [editingBuyBox, setEditingBuyBox] = useState(false);
  const [editingStage, setEditingStage] = useState(false);
  const [addCommDialog, setAddCommDialog] = useState(false);
  const [addTaskDialog, setAddTaskDialog] = useState(false);
  const [emailComposerOpen, setEmailComposerOpen] = useState(false);

  const [buyBoxForm, setBuyBoxForm] = useState<Record<string, any>>({});
  const [stageForm, setStageForm] = useState({ pipelineStatus: "", followUpDate: "", agentNotes: "" });
  const [commForm, setCommForm] = useState({ type: "note" as const, subject: "", body: "", direction: "outbound" as const });
  const [taskForm, setTaskForm] = useState({ title: "", taskType: "follow_up", priority: "medium", dueDate: "", notes: "" });

  const utils = trpc.useUtils();

  const { data: conn, isLoading } = trpc.agentConnections.get.useQuery({ id }, { enabled: !!id });
  const { data: comms } = trpc.communications.list.useQuery({ agentConnectionId: id }, { enabled: !!id });
  const { data: tasksData } = trpc.tasks.list.useQuery({ relatedContactId: conn?.connection?.contactId }, { enabled: !!conn?.connection?.contactId });
  const tasks = tasksData?.rows ?? [];
  const { data: docs } = trpc.documents.list.useQuery({ contactId: conn?.connection?.contactId }, { enabled: !!conn?.connection?.contactId });
  const { data: txnsData } = trpc.transactions.list.useQuery({}, { enabled: !!conn?.connection?.contactId });
  const txns = txnsData?.rows ?? [];

  const updateConn = trpc.agentConnections.update.useMutation({
    onSuccess: () => {
      utils.agentConnections.get.invalidate({ id });
      utils.agentConnections.list.invalidate();
      toast.success("Updated successfully");
      setEditingBuyBox(false);
      setEditingStage(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const addComm = trpc.communications.create.useMutation({
    onSuccess: () => {
      utils.communications.list.invalidate({ agentConnectionId: id });
      toast.success("Communication logged");
      setAddCommDialog(false);
      setCommForm({ type: "note", subject: "", body: "", direction: "outbound" });
    },
    onError: (e) => toast.error(e.message),
  });

  const addTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      toast.success("Task created");
      setAddTaskDialog(false);
      setTaskForm({ title: "", taskType: "follow_up", priority: "medium", dueDate: "", notes: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const completeTask = trpc.tasks.complete.useMutation({
    onSuccess: () => { utils.tasks.list.invalidate(); toast.success("Task completed"); },
  });

  if (isLoading) return (
    <div className="p-8 flex items-center justify-center min-h-[400px]">
      <div className="text-muted-foreground">Loading...</div>
    </div>
  );

  if (!conn) return (
    <div className="p-8 text-center">
      <p className="text-muted-foreground">Connection not found.</p>
      <Button variant="outline" className="mt-4" onClick={goBack}>Back</Button>
    </div>
  );

  const { connection, contact, agent, isa, leadSource, parentLeadSource } = conn as any;
  const contactTransactions = txns?.filter((t: any) => t.transaction?.primaryContactId === contact?.id || t.contact?.id === contact?.id) ?? [];
  const stage = PIPELINE_STAGES.find(s => s.value === connection.pipelineStatus);
  const emailEligible = connection.pipelineStatus !== "new_lead" && connection.pipelineStatus !== "dead" && isValidEmail(contact?.email ?? "");

  const handleSaveBuyBox = () => {
    // Empty form fields come through as "" — convert to null, and parse the
    // numeric fields, so we never send "" to a number/decimal column or to a
    // z.number() input (which would fail validation / the DB insert).
    const intOrNull = (v: any) => {
      if (v === "" || v == null) return null;
      const n = parseInt(String(v), 10);
      return Number.isNaN(n) ? null : n;
    };
    const strOrNull = (v: any) => (v === "" || v == null ? null : String(v));
    const csvToArr = (v: any) =>
      typeof v === "string"
        ? v.split(",").map((s: string) => s.trim()).filter(Boolean)
        : (v ?? []);
    const sanitized = {
      propertyType: strOrNull(buyBoxForm.propertyType),
      minPrice: strOrNull(buyBoxForm.minPrice),
      maxPrice: strOrNull(buyBoxForm.maxPrice),
      minBeds: intOrNull(buyBoxForm.minBeds),
      maxBeds: intOrNull(buyBoxForm.maxBeds),
      minBaths: strOrNull(buyBoxForm.minBaths),
      minSqft: intOrNull(buyBoxForm.minSqft),
      maxSqft: intOrNull(buyBoxForm.maxSqft),
      targetCities: csvToArr(buyBoxForm.targetCities),
      targetZips: csvToArr(buyBoxForm.targetZips),
      strRequirements: strOrNull(buyBoxForm.strRequirements),
      investmentNotes: strOrNull(buyBoxForm.investmentNotes),
    };
    updateConn.mutate({ id, data: { buyBox: sanitized } });
  };

  const handleSaveStage = () => {
    updateConn.mutate({
      id,
      data: {
        pipelineStatus: stageForm.pipelineStatus as any || connection.pipelineStatus as any,
        followUpDate: stageForm.followUpDate || null,
        agentNotes: stageForm.agentNotes || connection.agentNotes,
      },
    });
  };

  const startEditBuyBox = () => {
    setBuyBoxForm({
      propertyType: connection.propertyType ?? "",
      minPrice: connection.minPrice ?? "",
      maxPrice: connection.maxPrice ?? "",
      minBeds: connection.minBeds ?? "",
      maxBeds: connection.maxBeds ?? "",
      minBaths: connection.minBaths ?? "",
      minSqft: connection.minSqft ?? "",
      maxSqft: connection.maxSqft ?? "",
      targetCities: (connection.targetCities as string[] | null)?.join(", ") ?? "",
      targetZips: (connection.targetZips as string[] | null)?.join(", ") ?? "",
      strRequirements: connection.strRequirements ?? "",
      investmentNotes: connection.investmentNotes ?? "",
    });
    setEditingBuyBox(true);
  };

  const startEditStage = () => {
    setStageForm({
      pipelineStatus: connection.pipelineStatus ?? "new_lead",
      followUpDate: connection.followUpDate ? safeFormat(connection.followUpDate, "yyyy-MM-dd") : "",
      agentNotes: connection.agentNotes ?? "",
    });
    setEditingStage(true);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Pipeline
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">
            {contact?.firstName} {contact?.lastName}
          </h1>
          <p className="text-muted-foreground text-sm">
            Agent: {agent?.name ?? "Unassigned"}{isa?.name ? ` · ISA: ${isa.name}` : ""} · Connection #{connection.id}
          </p>
        </div>
        <Badge className={`${stage?.color} border-0 text-sm px-3 py-1`}>{stage?.label ?? connection.pipelineStatus}</Badge>
        <Button
          variant="outline"
          size="sm"
          disabled={!emailEligible}
          title={emailEligible ? "Send Email" : "Email is unavailable for New/Dead contacts or contacts without a valid email address"}
          onClick={() => setEmailComposerOpen(true)}
        >
          <Mail className="h-4 w-4 mr-1" /> Send Email
        </Button>
        <Button variant="outline" size="sm" onClick={startEditStage}>
          <Edit2 className="h-4 w-4 mr-1" /> Update Stage
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Contact Info */}
        <div className="space-y-4">
          {/* Contact Card */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><User className="h-4 w-4" /> Contact</h3>
              {user?.role !== "agent" && (
                <Button variant="ghost" size="sm" onClick={() => navigate(`/contacts/${contact?.id}`)}>View Full</Button>
              )}
            </div>
            <div className="space-y-2 text-sm">
              {contact?.email && <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" />{contact.email}</div>}
              {contact?.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" />{contact.phone}</div>}
              {contact?.city && <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{contact.city}{contact.state ? `, ${contact.state}` : ""}</div>}
              {(contact?.spouseFirstName || contact?.spouseLastName) && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span>Spouse/Partner: {contact.spouseFirstName} {contact.spouseLastName}</span>
                  </div>
                  {(contact as any)?.spousePhone && (
                    <div className="flex items-center gap-2 text-muted-foreground ml-5">
                      <Phone className="h-3 w-3" />
                      <span className="text-xs">{(contact as any).spousePhone}</span>
                    </div>
                  )}
                  {(contact as any)?.spouseEmail && (
                    <div className="flex items-center gap-2 text-muted-foreground ml-5">
                      <Mail className="h-3 w-3" />
                      <span className="text-xs">{(contact as any).spouseEmail}</span>
                    </div>
                  )}
                </div>
              )}
              {isa?.name && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Star className="h-3.5 w-3.5" />
                  <span>Assigned ISA: {isa.name}</span>
                </div>
              )}
              {(agent as any)?.callBookingLink && (
                <div className="pt-1">
                  <a
                    href={(agent as any).callBookingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Book a Call with {agent?.name?.split(" ")[0] ?? "Agent"}
                  </a>
                </div>
              )}
              {leadSource?.name && (
                <div className="flex items-center gap-1 flex-wrap pt-1">
                  {parentLeadSource?.name && (
                    <>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground font-medium whitespace-nowrap">
                        {parentLeadSource.name}
                      </span>
                      <span className="text-muted-foreground text-[10px]">›</span>
                    </>
                  )}
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary font-semibold whitespace-nowrap">
                    {leadSource.name}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Pipeline Stage Card */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2"><Star className="h-4 w-4" /> Pipeline Info</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stage</span>
                <Badge className={`${stage?.color} border-0 text-xs`}>{stage?.label}</Badge>
              </div>
              {connection.followUpDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Follow-up</span>
                  <span className="font-medium">{safeFormat(connection.followUpDate, "MMM d, yyyy")}</span>
                </div>
              )}
              {connection.agentNotes && (
                <div className="pt-2 border-t">
                  <p className="text-muted-foreground text-xs mb-1">Agent Notes</p>
                  <p className="text-sm">{connection.agentNotes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Buy Box Card */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><Home className="h-4 w-4" /> Buy Box</h3>
              {!editingBuyBox
                ? <Button variant="ghost" size="sm" onClick={startEditBuyBox}><Edit2 className="h-3.5 w-3.5" /></Button>
                : <div className="flex gap-1">
                    <Button size="sm" onClick={handleSaveBuyBox} disabled={updateConn.isPending}><Save className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingBuyBox(false)}><X className="h-3.5 w-3.5" /></Button>
                  </div>
              }
            </div>
            {!editingBuyBox ? (
              <div className="space-y-2 text-sm">
                {connection.propertyType && <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{connection.propertyType}</span></div>}
                {(connection.minPrice || connection.maxPrice) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price Range</span>
                    <span className="font-medium">
                      {connection.minPrice ? `$${Number(connection.minPrice).toLocaleString()}` : "Any"} –{" "}
                      {connection.maxPrice ? `$${Number(connection.maxPrice).toLocaleString()}` : "Any"}
                    </span>
                  </div>
                )}
                {(connection.minBeds || connection.maxBeds) && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Beds</span><span>{connection.minBeds ?? "Any"} – {connection.maxBeds ?? "Any"}</span></div>
                )}
                {connection.minBaths && <div className="flex justify-between"><span className="text-muted-foreground">Min Baths</span><span>{connection.minBaths}</span></div>}
                {(connection.minSqft || connection.maxSqft) && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Sqft</span><span>{connection.minSqft ?? "Any"} – {connection.maxSqft ?? "Any"}</span></div>
                )}
                {connection.targetCities && (connection.targetCities as string[]).length > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Cities</span><span className="text-right max-w-[60%]">{(connection.targetCities as string[]).join(", ")}</span></div>
                )}
                {connection.strRequirements && (
                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground text-xs mb-1">STR Requirements</p>
                    <p>{connection.strRequirements}</p>
                  </div>
                )}
                {connection.investmentNotes && (
                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground text-xs mb-1">Investment Notes</p>
                    <p>{connection.investmentNotes}</p>
                  </div>
                )}
                {!connection.propertyType && !connection.minPrice && !connection.minBeds && (
                  <p className="text-muted-foreground text-xs italic">No buy box set yet. Click edit to add criteria.</p>
                )}
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <Label className="text-xs">Property Type</Label>
                  <Input value={buyBoxForm.propertyType} onChange={e => setBuyBoxForm({ ...buyBoxForm, propertyType: e.target.value })} placeholder="e.g. Single Family, STR, Condo" className="h-8 mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Min Price</Label><Input value={buyBoxForm.minPrice} onChange={e => setBuyBoxForm({ ...buyBoxForm, minPrice: e.target.value })} placeholder="e.g. 300000" className="h-8 mt-1" /></div>
                  <div><Label className="text-xs">Max Price</Label><Input value={buyBoxForm.maxPrice} onChange={e => setBuyBoxForm({ ...buyBoxForm, maxPrice: e.target.value })} placeholder="e.g. 600000" className="h-8 mt-1" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Min Beds</Label><Input type="number" value={buyBoxForm.minBeds} onChange={e => setBuyBoxForm({ ...buyBoxForm, minBeds: parseInt(e.target.value) || "" })} className="h-8 mt-1" /></div>
                  <div><Label className="text-xs">Max Beds</Label><Input type="number" value={buyBoxForm.maxBeds} onChange={e => setBuyBoxForm({ ...buyBoxForm, maxBeds: parseInt(e.target.value) || "" })} className="h-8 mt-1" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Min Baths</Label><Input value={buyBoxForm.minBaths} onChange={e => setBuyBoxForm({ ...buyBoxForm, minBaths: e.target.value })} className="h-8 mt-1" /></div>
                  <div><Label className="text-xs">Min Sqft</Label><Input type="number" value={buyBoxForm.minSqft} onChange={e => setBuyBoxForm({ ...buyBoxForm, minSqft: parseInt(e.target.value) || "" })} className="h-8 mt-1" /></div>
                </div>
                <div>
                  <Label className="text-xs">Target Cities (comma-separated)</Label>
                  <Input value={buyBoxForm.targetCities} onChange={e => setBuyBoxForm({ ...buyBoxForm, targetCities: e.target.value })} placeholder="e.g. Austin, Nashville" className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Target Zip Codes (comma-separated)</Label>
                  <Input value={buyBoxForm.targetZips} onChange={e => setBuyBoxForm({ ...buyBoxForm, targetZips: e.target.value })} placeholder="e.g. 78701, 78702" className="h-8 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">STR Requirements</Label>
                  <Textarea value={buyBoxForm.strRequirements} onChange={e => setBuyBoxForm({ ...buyBoxForm, strRequirements: e.target.value })} rows={2} className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Investment Notes</Label>
                  <Textarea value={buyBoxForm.investmentNotes} onChange={e => setBuyBoxForm({ ...buyBoxForm, investmentNotes: e.target.value })} rows={2} className="mt-1 text-sm" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Tabs for Communications, Tasks, Documents */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="communications">
            <TabsList className="mb-4 flex-wrap">
              <TabsTrigger value="communications">Communications ({comms?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="tasks">Tasks ({tasks?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="transactions">Transactions ({contactTransactions?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="documents">Documents ({docs?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="smart-plans"><Zap className="h-3.5 w-3.5 mr-1 inline" />Smart Plans</TabsTrigger>
            </TabsList>

            {/* Communications Tab */}
            <TabsContent value="communications" className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setAddCommDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Log Communication
                </Button>
              </div>
              {!comms?.length ? (
                <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No communications yet. Log a note, call, or email to get started.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {comms.map((c: any) => {
                    const comm = c.communication ?? c.comm ?? c;
                    const author = c.author ?? null;
                    const isIsaNote = author?.role === "isa";
                    const TypeIcon = COMM_TYPES.find(t => t.value === comm.type)?.icon ?? MessageSquare;
                    return (
                      <div key={comm.id} className={`rounded-xl border bg-card p-4 ${isIsaNote ? "border-l-2 border-l-blue-500/60" : ""}`}>
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 p-1.5 rounded-lg bg-muted">
                            <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{comm.type}</span>
                              {comm.subject && <span className="font-medium text-sm truncate">{comm.subject}</span>}
                              {author?.name && (
                                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                  isIsaNote
                                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                    : "bg-muted text-muted-foreground"
                                }`}>
                                  {author.name}{isIsaNote ? " · ISA" : ""}
                                </span>
                              )}
                              <span className="ml-auto text-xs text-muted-foreground">
                                {comm.communicatedAt ? safeFormat(comm.communicatedAt, "MMM d, h:mm a") : comm.createdAt ? safeFormat(comm.createdAt, "MMM d, h:mm a") : ""}
                              </span>
                            </div>
                            <p className="text-sm text-foreground whitespace-pre-wrap">{comm.body}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Tasks Tab */}
            <TabsContent value="tasks" className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setAddTaskDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Task
                </Button>
              </div>
              {!tasks?.length ? (
                <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
                  <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No tasks yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tasks.map((t: any) => {
                    const task = t.task ?? t;
                    const isDone = task.status === "completed";
                    return (
                      <div key={task.id} className={`rounded-xl border bg-card p-4 flex items-start gap-3 ${isDone ? "opacity-60" : ""}`}>
                        <button
                          onClick={() => !isDone && completeTask.mutate({ id: task.id })}
                          className={`mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isDone ? "bg-green-500 border-green-500 text-white" : "border-muted-foreground hover:border-primary"}`}
                        >
                          {isDone && <span className="text-xs">✓</span>}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm ${isDone ? "line-through" : ""}`}>{task.title}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <Badge variant="outline" className="text-xs">{task.taskType}</Badge>
                            <Badge variant="outline" className={`text-xs ${task.priority === "high" || task.priority === "urgent" ? "border-red-300 text-red-600" : ""}`}>{task.priority}</Badge>
                            {task.dueDate && <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />{safeFormat(task.dueDate, "MMM d")}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Transactions Tab */}
            <TabsContent value="transactions" className="space-y-3">
              {!contactTransactions.length ? (
                <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
                  <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No transactions for this contact yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {contactTransactions.map((t: any) => {
                    const tx = t.transaction;
                    return (
                      <div key={tx.id} className="rounded-xl border bg-card p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">{tx.transactionName || `Transaction #${tx.id}`}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">{tx.transactionType}</Badge>
                              <Badge variant="outline" className="text-xs">{tx.status}</Badge>
                              {tx.purchasePrice && <span className="text-xs text-muted-foreground">${Number(tx.purchasePrice).toLocaleString()}</span>}
                            </div>
                          </div>
                          {tx.closingDate && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Closing: {safeFormat(tx.closingDate, "MMM d, yyyy")}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents" className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => navigate("/documents")}>
                  <Plus className="h-4 w-4 mr-1" /> Upload Document
                </Button>
              </div>
              {!docs?.length ? (
                <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No documents yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {docs.map((d: any) => {
                    const doc = d.doc ?? d;
                    return (
                      <div key={doc.id} className="rounded-xl border bg-card p-4 flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{doc.fileName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-xs">{doc.documentType}</Badge>
                            <span className="text-xs text-muted-foreground">{doc.createdAt ? safeFormat(doc.createdAt, "MMM d, yyyy") : ""}</span>
                          </div>
                        </div>
                        {doc.fileUrl && (
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm">View</Button>
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Smart Plans Tab */}
            <TabsContent value="smart-plans">
              {conn?.connection?.contactId ? (
                <SmartPlanContactTab contactId={conn.connection.contactId} />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No contact linked.</p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Update Stage Dialog */}
      <Dialog open={editingStage} onOpenChange={setEditingStage}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Update Pipeline Stage</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Pipeline Stage</Label>
              <Select value={stageForm.pipelineStatus} onValueChange={v => setStageForm({ ...stageForm, pipelineStatus: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PIPELINE_STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Follow-up Date</Label>
              <Input type="date" value={stageForm.followUpDate} onChange={e => setStageForm({ ...stageForm, followUpDate: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Agent Notes</Label>
              <Textarea value={stageForm.agentNotes} onChange={e => setStageForm({ ...stageForm, agentNotes: e.target.value })} rows={3} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStage(false)}>Cancel</Button>
            <Button onClick={handleSaveStage} disabled={updateConn.isPending}>
              {updateConn.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PipelineEmailComposer
        open={emailComposerOpen}
        onOpenChange={setEmailComposerOpen}
        recipients={[{
          connectionId: connection.id,
          name: `${contact?.firstName ?? ""} ${contact?.lastName ?? ""}`.trim() || "Contact",
        }]}
        onSent={() => {
          void utils.communications.list.invalidate({ agentConnectionId: id });
          void utils.agentConnections.get.invalidate({ id });
        }}
      />

      {/* Add Communication Dialog */}
      <Dialog open={addCommDialog} onOpenChange={setAddCommDialog}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Log Communication</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={commForm.type} onValueChange={v => setCommForm({ ...commForm, type: v as any })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMM_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Direction</Label>
                <Select value={commForm.direction} onValueChange={v => setCommForm({ ...commForm, direction: v as any })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outbound">Outbound</SelectItem>
                    <SelectItem value="inbound">Inbound</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Subject (optional)</Label>
              <Input value={commForm.subject} onChange={e => setCommForm({ ...commForm, subject: e.target.value })} placeholder="e.g. Follow-up call" className="mt-1" />
            </div>
            <div>
              <Label>Notes / Body</Label>
              <Textarea value={commForm.body} onChange={e => setCommForm({ ...commForm, body: e.target.value })} rows={4} placeholder="What happened? What was discussed?" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCommDialog(false)}>Cancel</Button>
            <Button
              onClick={() => addComm.mutate({
                type: commForm.type,
                subject: commForm.subject || null,
                body: commForm.body,
                direction: commForm.direction,
                relatedContactId: conn.connection.contactId,
                relatedAgentConnectionId: id,
              })}
              disabled={!commForm.body || addComm.isPending}
            >
              {addComm.isPending ? "Logging..." : "Log Communication"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Task Dialog */}
      <Dialog open={addTaskDialog} onOpenChange={setAddTaskDialog}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Task Title</Label>
              <Input value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="e.g. Send property listings" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={taskForm.taskType} onValueChange={v => setTaskForm({ ...taskForm, taskType: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="follow_up">Follow Up</SelectItem>
                    <SelectItem value="outreach">Outreach</SelectItem>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="document">Document</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="payout">Payout</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={taskForm.priority} onValueChange={v => setTaskForm({ ...taskForm, priority: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={taskForm.dueDate} onChange={e => setTaskForm({ ...taskForm, dueDate: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={taskForm.notes} onChange={e => setTaskForm({ ...taskForm, notes: e.target.value })} rows={2} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTaskDialog(false)}>Cancel</Button>
            <Button
              onClick={() => addTask.mutate({
                title: taskForm.title,
                taskType: taskForm.taskType as any,
                priority: taskForm.priority as any,
                dueDate: taskForm.dueDate ? taskForm.dueDate : undefined,
                description: taskForm.notes || null,
                assignedToId: user?.id,
                relatedContactId: conn.connection.contactId,
                relatedAgentConnectionId: id,
              })}
              disabled={!taskForm.title || addTask.isPending}
            >
              {addTask.isPending ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
