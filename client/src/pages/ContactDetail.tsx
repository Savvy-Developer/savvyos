import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import PageHeader from "@/components/PageHeader";
import LeadSourcePicker from "@/components/LeadSourcePicker";
import { PipelineStatusBadge, TransactionStatusBadge, PriorityBadge, IsaStatusBadge, PIPELINE_STAGE_OPTIONS } from "@/components/StatusBadge";
import { toast } from "sonner";
import { ArrowLeft, MessageSquare, Plus, Phone, Mail, Edit2, Link2, Users, Home, Trash2, AlertTriangle, CheckCircle2, DollarSign, Info, Circle, Zap, Archive, MoreVertical, Sparkles, RefreshCw, Clock, History, TrendingUp, Building2, Calendar, ArrowRight, Globe, Inbox } from "lucide-react";
import EmailBehaviorsTab from "@/components/EmailBehaviorsTab";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLocation, useParams, Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { formatActivityEntry } from "@/lib/activityFormatter";
import SmartPlanContactTab from "@/components/SmartPlanContactTab";
import AiSummaryTab from "@/components/AiSummaryTab";
import { safeFormat } from "@/lib/safeFormat";
import { useCelebration } from "@/hooks/useCelebration";
import { formatPhone, isValidEmail, isValidPhone } from "@/lib/inputFormatters";
import { formatEmail, formatStreet, formatCityStateZip } from "@/lib/format";
import { useAppBack } from "@/lib/navigationHistory";

// ─── US Timezone Options ─────────────────────────────────────────────────────
const US_TIMEZONES = [
  { value: "America/New_York",    label: "Eastern Time (ET)" },
  { value: "America/Chicago",     label: "Central Time (CT)" },
  { value: "America/Denver",      label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage",   label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu",    label: "Hawaii-Aleutian Time (HAT)" },
] as const;

function getContactLocalTime(tz: string | null | undefined): string | null {
  if (!tz) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      weekday: "short",
    }).format(new Date());
  } catch {
    return null;
  }
}

// ─── Contact History Timeline ─────────────────────────────────────────────────────────
const CONTACT_OUTCOME_COLORS: Record<string, string> = {
  green: "bg-green-100 text-green-700",
  blue: "bg-blue-100 text-blue-700",
  red: "bg-red-100 text-red-700",
  orange: "bg-orange-100 text-orange-700",
  gray: "bg-gray-100 text-gray-700",
};

type ContactHistoryEvent = {
  id: string;
  type: "transaction" | "listing" | "property_linked" | "communication" | "activity";
  date: Date | null;
  title: string;
  subtitle: string;
  outcome?: string;
  outcomeColor?: string;
  transactionId?: number;
  listingId?: number;
  propertyId?: number;
  linkedTransactionId?: number;
  meta?: Record<string, string | number | null>;
};

function ContactEventIcon({ type }: { type: ContactHistoryEvent["type"] }) {
  const cls = "h-3.5 w-3.5";
  if (type === "transaction") return <TrendingUp className={cls} />;
  if (type === "listing") return <Home className={cls} />;
  if (type === "property_linked") return <Building2 className={cls} />;
  if (type === "communication") return <MessageSquare className={cls} />;
  return <Info className={cls} />;
}

function contactEventDotColor(type: ContactHistoryEvent["type"]): string {
  if (type === "transaction") return "bg-emerald-500";
  if (type === "listing") return "bg-amber-500";
  if (type === "property_linked") return "bg-indigo-500";
  if (type === "communication") return "bg-violet-500";
  return "bg-slate-400";
}

function ContactHistoryTabContent({ contactId }: { contactId: number }) {
  const { data: historyData, isLoading } = trpc.contacts.getHistory.useQuery(
    { contactId },
    { enabled: !!contactId }
  );
  const events = (historyData?.events ?? []) as ContactHistoryEvent[];

  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <RefreshCw className="h-6 w-6 mx-auto mb-2 animate-spin opacity-40" />
        <p className="text-sm">Loading history…</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No history recorded yet for this contact.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-0">
            {events.map((event, idx) => {
              const isLast = idx === events.length - 1;
              const dotColor = contactEventDotColor(event.type);
              const eventDate = event.date ? new Date(event.date) : null;
              const isNavigable = !!(event.transactionId || event.listingId || event.propertyId);
              const content = (
                <div
                  className={`relative pl-14 pr-4 py-4 ${
                    !isLast ? "border-b border-border/50" : ""
                  } ${isNavigable ? "hover:bg-muted/40 cursor-pointer transition-colors" : ""}`}
                >
                  <div className={`absolute left-3.5 top-5 h-3 w-3 rounded-full border-2 border-background ${dotColor} shadow-sm`} />
                  <div className="absolute left-8 top-4 text-muted-foreground">
                    <ContactEventIcon type={event.type} />
                  </div>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug">{event.title}</p>
                      {event.subtitle && (
                        <p className="text-xs text-muted-foreground mt-0.5">{event.subtitle}</p>
                      )}
                      {event.meta && Object.keys(event.meta).length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                          {Object.entries(event.meta).map(([k, v]) => {
                            if (!v || k === "fromListingId") return null;
                            const label = k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
                            return (
                              <span key={k} className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground/70">{label}:</span> {String(v)}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {event.type === "listing" && event.linkedTransactionId && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
                          <ArrowRight className="h-3 w-3" />
                          <Link href={`/transactions/${event.linkedTransactionId}`} className="hover:underline font-medium">
                            Converted to Transaction #{event.linkedTransactionId}
                          </Link>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {event.outcome && (
                        <Badge className={`text-xs ${CONTACT_OUTCOME_COLORS[event.outcomeColor ?? "gray"] ?? "bg-gray-100 text-gray-700"}`}>
                          {event.outcome}
                        </Badge>
                      )}
                      {eventDate && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {safeFormat(eventDate, "MMM d, yyyy")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
              if (event.transactionId) return <Link key={event.id} href={`/transactions/${event.transactionId}`}>{content}</Link>;
              if (event.listingId) return <Link key={event.id} href={`/listings/${event.listingId}`}>{content}</Link>;
              if (event.propertyId) return <Link key={event.id} href={`/properties/${event.propertyId}`}>{content}</Link>;
              return <div key={event.id}>{content}</div>;
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type AssignForm = {
  agentId: string;
  pipelineStatus: string;
  agentNotes: string;
  isaFollowUpDate: string;
  isaTaskAssigneeId: string;
  introduceClient: boolean;
  appointmentSet: boolean;
};

const PIPELINE_STAGES = [
  { value: "new_lead", label: "New Lead" },
  { value: "attempted_contact", label: "Attempted Contact" },
  { value: "nurture", label: "Nurture" },
  { value: "active_client", label: "Active Client" },
  { value: "under_contract", label: "Under Contract" },
  { value: "closed", label: "Closed" },
  { value: "dead", label: "Dead" },
];

const PROPERTY_TYPES = [
  "single_family", "multi_family", "condo", "townhouse", "cabin",
  "vacation_rental", "commercial", "land", "other",
];

// ─── AgentConnectionCard ─────────────────────────────────────────────────────
function AgentConnectionCard({
  connection, agent, contactId, canDelete, isPendingDelete, onView, onDelete,
}: {
  connection: any; agent: any; contactId: number;
  canDelete: boolean; isPendingDelete: boolean;
  onView: () => void; onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: summaryData, isFetching, refetch } = trpc.contacts.getAiSummary.useQuery(
    { id: contactId, forceRefresh: false },
    { enabled: expanded, staleTime: 1000 * 60 * 60 * 24 * 7, retry: 1 }
  );
  return (
    <div className="rounded-md border overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1.5">
        <div>
          <p className="text-sm font-medium leading-tight">{agent?.name ?? "Unknown Agent"}</p>
          <PipelineStatusBadge status={connection.pipelineStatus ?? "new_lead"} />
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setExpanded(v => !v)} title="Show AI Summary">
            <Sparkles className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onView}>
            View
          </Button>
          {canDelete && (
            isPendingDelete ? (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground cursor-not-allowed opacity-50" disabled title="Deletion already requested">
                <Trash2 className="h-3 w-3" />
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive hover:text-destructive" onClick={onDelete}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )
          )}
        </div>
      </div>
      {expanded && (
        <div className="border-t bg-muted/30 px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-violet-500" /> AI Summary
            </span>
            <Button size="sm" variant="ghost" className="h-5 px-1.5 text-xs" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {isFetching ? (
            <div className="space-y-1.5">
              <div className="h-3 bg-muted rounded animate-pulse w-full" />
              <div className="h-3 bg-muted rounded animate-pulse w-4/5" />
              <div className="h-3 bg-muted rounded animate-pulse w-3/5" />
            </div>
          ) : summaryData?.summary ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{summaryData.summary.split("\n\n")[0]}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">No summary yet. Click refresh to generate.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ActivityTabAiSummary ─────────────────────────────────────────────────────
// Collapsible AI Summary pinned at the top of the Activity tab.
function ActivityTabAiSummary({ contactId }: { contactId: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);
  const { data, isLoading, isFetching, error, refetch } = trpc.contacts.getAiSummary.useQuery(
    { id: contactId, forceRefresh },
    { staleTime: 1000 * 60 * 60 * 24 * 7, retry: 1 }
  );
  function handleRefresh() {
    setForceRefresh(true);
    setTimeout(() => setForceRefresh(false), 500);
    refetch();
  }
  const updatedAt = data?.updatedAt ? new Date(data.updatedAt) : null;
  return (
    <Card className="mb-3 border-violet-200/60 bg-violet-50/30 dark:bg-violet-950/10">
      <CardContent className="p-0 overflow-x-auto">
        {/* Header row — always visible */}
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-colors rounded-t-lg"
          onClick={() => setCollapsed(v => !v)}
          aria-expanded={!collapsed}
        >
          <span className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            AI Summary
            {data?.cached && (
              <span className="text-[10px] font-normal text-muted-foreground flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" /> Cached
              </span>
            )}
          </span>
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            {updatedAt && (
              <span className="text-[10px] text-muted-foreground">
                Updated {updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={handleRefresh} disabled={isFetching || isLoading} title="Regenerate summary">
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
            <span className="text-muted-foreground text-xs">{collapsed ? "▼" : "▲"}</span>
          </div>
        </button>
        {/* Collapsible body */}
        {!collapsed && (
          <div className="px-4 pb-4 pt-1 border-t border-violet-100/60">
            {isLoading || isFetching ? (
              <div className="space-y-2 pt-1">
                <div className="h-3 bg-violet-100 rounded animate-pulse w-full" />
                <div className="h-3 bg-violet-100 rounded animate-pulse w-5/6" />
                <div className="h-3 bg-violet-100 rounded animate-pulse w-4/6" />
                <div className="h-3 bg-violet-100 rounded animate-pulse w-full" />
                <div className="h-3 bg-violet-100 rounded animate-pulse w-3/4" />
              </div>
            ) : error ? (
              <p className="text-sm text-destructive pt-1">Failed to load summary. <button className="underline" onClick={handleRefresh}>Retry</button></p>
            ) : data?.summary ? (
              <div className="space-y-2 pt-1">
                {data.summary.split("\n\n").map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-foreground/80">{p}</p>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <Sparkles className="h-7 w-7 mx-auto mb-2 text-violet-300" />
                <p className="text-sm text-muted-foreground mb-3">No AI summary yet for this contact.</p>
                <Button size="sm" variant="outline" className="h-8 text-sm border-violet-300 text-violet-700 hover:bg-violet-50" onClick={handleRefresh} disabled={isFetching}>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Generate Summary
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const goBack = useAppBack("/contacts");
  const analyticsReturnTo = (() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    if (params.get("analytics") !== "1") return null;
    const candidate = params.get("returnTo");
    return candidate?.startsWith("/analytics") ? candidate : null;
  })();
  const { user } = useAuth();
  const contactId = parseInt(id ?? "0");

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState<"note" | "call" | "email" | "meeting">("note");
  // Note editing state
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const { celebrate } = useCelebration();
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteConnOpen, setDeleteConnOpen] = useState(false);
  const [deleteConnId, setDeleteConnId] = useState<number | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBlockReasons, setDeleteBlockReasons] = useState<string[]>([]);
  const [archiveContactOpen, setArchiveContactOpen] = useState(false);
  const [deleteContactOpen, setDeleteContactOpen] = useState(false);
  const [addPropertyOpen, setAddPropertyOpen] = useState(false);
  const [linkPropertyOpen, setLinkPropertyOpen] = useState(false);
  const [propertyLabel, setPropertyLabel] = useState("Primary home");
  const [linkPropertyId, setLinkPropertyId] = useState<string>("");
  const [newPropertyForm, setNewPropertyForm] = useState({
    address: "", city: "", state: "", zip: "",
    propertyType: "single_family", beds: "", baths: "", sqft: "",
    label: "Primary home",
  });

const [assignForm, setAssignForm] = useState<AssignForm>({
    agentId: "", pipelineStatus: "new_lead", agentNotes: "",
    isaFollowUpDate: "", isaTaskAssigneeId: user?.id ? String(user.id) : "",
    introduceClient: false, appointmentSet: false,
  });

  // Task editing state
  const [editTaskOpen, setEditTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [editTaskForm, setEditTaskForm] = useState({
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
    status: "pending" as "pending" | "in_progress" | "completed" | "cancelled",
    dueDate: "",
    assignedToId: "",
  });

  // Add Task dialog state
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [addTaskForm, setAddTaskForm] = useState({
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
    dueDate: "",
    assignedToId: user?.id ? String(user.id) : "",
  });
  const [editForm, setEditForm] = useState<any>(null);
  const [editLeadSourceId, setEditLeadSourceId] = useState<number | null>(null);
  const [editIsaId, setEditIsaId] = useState<string>("");
  const [editIsaStatus, setEditIsaStatus] = useState<string>("none");

  // Live local time ticker for contact timezone
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const utils = trpc.useUtils();
  const { data: contactData, refetch } = trpc.contacts.get.useQuery({ id: contactId });
  const { data: connectionsData } = trpc.agentConnections.list.useQuery({ contactId, limit: 50 });
  const connections = connectionsData?.rows;
  const { data: contactTxData } = trpc.transactions.byContact.useQuery({ contactId });
  const transactions = contactTxData?.rows ?? [];
  const { data: comms, refetch: refetchComms } = trpc.communications.list.useQuery({ contactId });
  const { data: tasksData } = trpc.tasks.list.useQuery({ relatedContactId: contactId });
  const tasks = tasksData?.rows ?? [];
  const { data: agents = [] } = trpc.users.list.useQuery({ role: "agent" });
  const { data: isas = [] } = trpc.users.list.useQuery({ role: "isa" });
  const { data: contactProps, refetch: refetchProps } = trpc.contactProperties.list.useQuery({ contactId });
  const { data: allProperties = [] } = trpc.properties.list.useQuery({});
  const { data: activityLog } = trpc.analytics.activityLog.useQuery({ contactId });
  // Format system activity-log entries (e.g. property views logged via webhook)
  // so they can be shown in the Activity tab alongside communications.
  const activityEntries = (activityLog ?? []).map((entry) => formatActivityEntry(entry as any));

  const contactTransactions = transactions;

  const updateNote = trpc.communications.update.useMutation({
    onSuccess: () => { toast.success("Note updated"); setEditingNoteId(null); refetchComms(); },
    onError: (e) => toast.error(e.message),
  });

  const addNote = trpc.communications.create.useMutation({
    onSuccess: () => { toast.success("Note added"); setNoteOpen(false); setNoteText(""); refetchComms(); },
    onError: (e) => toast.error(e.message),
  });

  const updateContact = trpc.contacts.update.useMutation({
    onSuccess: () => { toast.success("Contact updated"); setEditOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const checkDupMut = trpc.contacts.checkDuplicate.useMutation();

  async function handleSaveContactEdit() {
    if (editForm.email && !isValidEmail(editForm.email)) { toast.error("Please enter a valid email address (e.g. name@example.com)"); return; }
    if (editForm.secondaryEmail && !isValidEmail(editForm.secondaryEmail)) { toast.error("Please enter a valid secondary email address"); return; }
    if (editForm.spouseEmail && !isValidEmail(editForm.spouseEmail)) { toast.error("Please enter a valid spouse email address"); return; }
    if (editForm.phone && !isValidPhone(editForm.phone)) { toast.error("Please enter a valid phone number (9+ digits)"); return; }
    if (editForm.secondaryPhone && !isValidPhone(editForm.secondaryPhone)) { toast.error("Please enter a valid secondary phone number (9+ digits)"); return; }
    if (editForm.spousePhone && !isValidPhone(editForm.spousePhone)) { toast.error("Please enter a valid spouse phone number (9+ digits)"); return; }
    // Hard block: email or phone matches a DIFFERENT contact.
    // Only check fields that actually changed — if the user didn't edit the
    // email or phone, there is no need to re-validate them (and doing so would
    // incorrectly block saves when a known duplicate shares the same digits).
    const emailChanged = editForm.email !== (contact.email ?? "");
    const phoneChanged = editForm.phone !== (contact.phone ?? "");
    if (emailChanged || phoneChanged) {
      try {
        const dup = await checkDupMut.mutateAsync({
          email: emailChanged ? (editForm.email || undefined) : undefined,
          phone: phoneChanged ? (editForm.phone || undefined) : undefined,
          excludeId: contactId,
        });
        if (dup.emailPhoneMatches && dup.emailPhoneMatches.length > 0) {
          const m = dup.emailPhoneMatches[0];
          toast.error(`This email or phone already belongs to ${m.firstName} ${m.lastName}. Please use a unique email and phone.`);
          return;
        }
      } catch { /* non-blocking — proceed if check fails */ }
    }
    updateContact.mutate({
      id: contactId,
      data: {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        email: editForm.email,
        phone: editForm.phone || null,
        secondaryEmail: editForm.secondaryEmail || null,
        secondaryPhone: editForm.secondaryPhone || null,
        spouseFirstName: editForm.spouseFirstName || null,
        spouseLastName: editForm.spouseLastName || null,
        spouseEmail: editForm.spouseEmail || null,
        spousePhone: editForm.spousePhone || null,
        notes: editForm.notes || null,
        leadSourceId: editLeadSourceId,
        assignedIsaId: editIsaId ? Number(editIsaId) : null,
        isaStatus: (editIsaId && editIsaStatus && editIsaStatus !== "none") ? editIsaStatus as any : null,
        timezone: editForm.timezone || null,
      }
    });
  }

  const createConnection = trpc.agentConnections.create.useMutation({
    onSuccess: () => {
      toast.success("Agent connection created 🎉");
      setAssignOpen(false);
      setAssignForm({ agentId: "", pipelineStatus: "new_lead", agentNotes: "", isaFollowUpDate: "", isaTaskAssigneeId: user?.id ? String(user.id) : "", introduceClient: false, appointmentSet: false });
      utils.agentConnections.list.invalidate();
      utils.contacts.list.invalidate();
      celebrate("connection_made");
    },
    onError: (e) => toast.error(e.message),
  });

  // Fetch pending deletion requests to grey out buttons
  const { data: pendingDeletions } = trpc.approvalRequests.list.useQuery({ status: "pending" });
  const pendingTargetIds = new Set((pendingDeletions ?? []).map((r) => r.targetId));

  const requestDeletion = trpc.approvalRequests.create.useMutation({
    onSuccess: () => {
      toast.success("Deletion request submitted — awaiting admin approval");
      setDeleteConnOpen(false);
      setDeleteReason("");
      setDeleteConnId(null);
      utils.approvalRequests.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const createProperty = trpc.properties.create.useMutation({
    onSuccess: async (prop) => {
      await trpc.useUtils().contactProperties.list.invalidate();
      await linkProperty.mutateAsync({ contactId, propertyId: prop.id, label: newPropertyForm.label });
    },
    onError: (e) => toast.error(e.message),
  });

  const linkProperty = trpc.contactProperties.link.useMutation({
    onSuccess: () => {
      toast.success("Property linked");
      setAddPropertyOpen(false);
      setLinkPropertyOpen(false);
      setNewPropertyForm({ address: "", city: "", state: "", zip: "", propertyType: "single_family", beds: "", baths: "", sqft: "", label: "Primary home" });
      setLinkPropertyId("");
      setPropertyLabel("Primary home");
      refetchProps();
    },
    onError: (e) => toast.error(e.message),
  });

  const unlinkProperty = trpc.contactProperties.unlink.useMutation({
    onSuccess: () => { toast.success("Property removed"); refetchProps(); },
    onError: (e) => toast.error(e.message),
  });

  const updateTaskMutation = trpc.tasks.update.useMutation({
    onSuccess: () => {
      toast.success("Task updated");
      setEditTaskOpen(false);
      setEditingTask(null);
      utils.tasks.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const completeTaskMutation = trpc.tasks.complete.useMutation({
    onSuccess: () => { toast.success("Task marked complete 🎉"); utils.tasks.list.invalidate(); celebrate("task_done"); },
    onError: (e) => toast.error(e.message),
  });

  const createTaskMutation = trpc.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("Task created");
      setAddTaskOpen(false);
      setAddTaskForm({ title: "", description: "", priority: "medium", dueDate: "", assignedToId: "" });
      utils.tasks.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const archiveContactMutation = trpc.contacts.archive.useMutation({
    onSuccess: () => { toast.success("Contact archived"); navigate("/contacts"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteContactMutation = trpc.contacts.delete.useMutation({
    onSuccess: () => { toast.success("Contact deleted"); navigate("/contacts"); },
    onError: (e) => toast.error(e.message),
  });

  function openEditTask(taskRow: any) {
    const t = taskRow.task;
    setEditingTask(taskRow);
    setEditTaskForm({
      title: t.title ?? "",
      description: t.description ?? "",
      priority: t.priority ?? "medium",
      status: t.status ?? "pending",
      dueDate: t.dueDate ? new Date(t.dueDate).toISOString().split("T")[0] : "",
      assignedToId: t.assignedToId ? String(t.assignedToId) : "",
    });
    setEditTaskOpen(true);
  }

  function handleSaveTask() {
    if (!editingTask) return;
    updateTaskMutation.mutate({
      id: editingTask.task.id,
      data: {
        title: editTaskForm.title,
        description: editTaskForm.description || null,
        priority: editTaskForm.priority,
        status: editTaskForm.status,
        dueDate: editTaskForm.dueDate || null,
        assignedToId: editTaskForm.assignedToId ? Number(editTaskForm.assignedToId) : null,
      },
    });
  }

  const contact = contactData?.contact;
  const leadSource = (contactData as any)?.leadSource;

  // Agents must never access the full contact page
  if (user?.role === "agent") {
    navigate("/pipeline");
    return null;
  }

  if (!contact) {
    return <div className="p-6 text-muted-foreground">Loading...</div>;
  }

  const openEdit = () => {
    setEditForm({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      secondaryEmail: (contact as any).secondaryEmail ?? "",
      secondaryPhone: (contact as any).secondaryPhone ?? "",
      spouseFirstName: (contact as any).spouseFirstName ?? "",
      spouseLastName: (contact as any).spouseLastName ?? "",
      spouseEmail: (contact as any).spouseEmail ?? "",
      spousePhone: (contact as any).spousePhone ?? "",
      notes: contact.notes ?? "",
      timezone: (contact as any).timezone ?? "",
    });
    setEditLeadSourceId((contact as any).leadSourceId ?? null);
    setEditIsaId(String((contact as any).assignedIsaId ?? ""));
    setEditIsaStatus((contact as any).isaStatus ?? "none");
    setEditOpen(true);
  };

  const canAssign = user?.role === "admin" || user?.role === "isa";
  const isAdmin = user?.role === "admin";
  const isIsa = user?.role === "isa";

  function handleAssign() {
    if (!assignForm.agentId) { toast.error("Please select an agent"); return; }
    createConnection.mutate({
      agentId: Number(assignForm.agentId),
      contactId,
      pipelineStatus: assignForm.pipelineStatus as any,
      agentNotes: assignForm.agentNotes || null,
      isaFollowUpDate: assignForm.isaFollowUpDate || null,
      isaTaskAssigneeId: assignForm.isaTaskAssigneeId ? Number(assignForm.isaTaskAssigneeId) : null,
      introduceClient: assignForm.introduceClient,
      appointmentSet: assignForm.appointmentSet,
    });
  }

  function handleRequestDelete(connId: number) {
    const conn = (connections as any[] | undefined)?.find(({ connection }) => connection.id === connId)?.connection;
    const blockReasons: string[] = [];

    if (conn?.pipelineStatus === "closed") {
      blockReasons.push("This connection is marked as Closed. Closed connections must be retained for record-keeping.");
    }
    if (conn?.pipelineStatus === "under_contract") {
      blockReasons.push("This connection is currently Under Contract. Resolve or close the contract before requesting removal.");
    }

    // Outstanding tasks linked to this connection
    const outstandingTasks = (tasks as any[]).filter(
      (row) => row.task.relatedAgentConnectionId === connId &&
        (row.task.status === "pending" || row.task.status === "in_progress")
    );
    if (outstandingTasks.length > 0) {
      blockReasons.push(
        `There ${outstandingTasks.length === 1 ? "is" : "are"} ${outstandingTasks.length} outstanding task${outstandingTasks.length === 1 ? "" : "s"} linked to this connection that must be completed or cancelled first.`
      );
    }

    // Active under_contract transaction between this agent and this contact
    const agentId = conn?.agentId;
    const hasActiveTransaction = (transactions as any[]).some(
      (row) => row.transaction.agentId === agentId &&
        row.transaction.primaryContactId === contactId &&
        row.transaction.status === "under_contract"
    );
    if (hasActiveTransaction) {
      blockReasons.push("There is an active Under Contract transaction between this agent and client.");
    }

    setDeleteBlockReasons(blockReasons);
    setDeleteConnId(connId);
    setDeleteReason("");
    setDeleteConnOpen(true);
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => analyticsReturnTo ? navigate(analyticsReturnTo) : goBack()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {analyticsReturnTo ? "Back to report" : "Back"}
        </Button>
      </div>

      <PageHeader
        title={`${contact.firstName} ${contact.lastName}`}
        subtitle="Contact profile and relationship history"
        actions={
          <div className="flex gap-2">
            {(isIsa || isAdmin) && (
              <Button
                variant="outline"
                size="sm"
                className="text-primary border-primary/40 hover:bg-primary/10"
                onClick={() => navigate(`/market-match-call?contactId=${contactId}`)}
              >
                <Zap className="h-4 w-4 mr-1" /> Market Match Call
              </Button>
            )}
            {canAssign && (
              <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
                <Link2 className="h-4 w-4 mr-1" /> Assign to Agent
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={openEdit}>
              <Edit2 className="h-4 w-4 mr-1" /> Edit
            </Button>
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm"><MoreVertical className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setArchiveContactOpen(true)}>
                    <Archive className="h-4 w-4 mr-2" /> Archive Contact
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => setDeleteContactOpen(true)}>
                    <Trash2 className="h-4 w-4 mr-2" /> Delete Contact
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="space-y-3">
           {/* Contact Info card — includes ISA status when applicable */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Contact Info</p>
              {/* ISA Pipeline Status inline row */}
              {(isAdmin || isIsa) && (
                <div className="flex items-center justify-between pb-2 mb-1 border-b">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-medium">ISA Status</span>
                    {(contact as any).assignedIsaId
                      ? <IsaStatusBadge status={(contact as any).isaStatus} />
                      : <span className="text-xs text-muted-foreground italic">No ISA assigned</span>
                    }
                  </div>
                  {canAssign && (contact as any).assignedIsaId && (
                    <Select
                      value={(contact as any).isaStatus ?? "none"}
                      onValueChange={(v) => updateContact.mutate({ id: contactId, data: { isaStatus: v === "none" ? null : v as any } })}
                    >
                      <SelectTrigger className="h-7 text-xs w-32">
                        <SelectValue placeholder="Set status..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Clear —</SelectItem>
                        {PIPELINE_STAGE_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              {contact.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <a href={`mailto:${contact.email}`} className="truncate hover:underline text-primary">{formatEmail(contact.email)}</a>
                </div>
              )}
              {(contact as any).secondaryEmail && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-50" />
                  <a href={`mailto:${(contact as any).secondaryEmail}`} className="truncate text-muted-foreground hover:underline">{formatEmail((contact as any).secondaryEmail)}</a>
                </div>
              )}
              {contact.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <a href={`tel:${contact.phone}`} className="hover:underline text-primary">{formatPhone(contact.phone)}</a>
                </div>
              )}
              {(contact as any).secondaryPhone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-50" />
                  <a href={`tel:${(contact as any).secondaryPhone}`} className="text-muted-foreground hover:underline">{formatPhone((contact as any).secondaryPhone)}</a>
                </div>
              )}
              {/* Timezone + live local time */}
              {(contact as any).timezone ? (
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">
                    {US_TIMEZONES.find(z => z.value === (contact as any).timezone)?.label ?? (contact as any).timezone}
                  </span>
                  {(() => {
                    void nowTick; // reactive tick
                    const localTime = getContactLocalTime((contact as any).timezone);
                    return localTime ? (
                      <span className="ml-auto text-xs font-medium text-foreground bg-muted px-2 py-0.5 rounded-full">
                        {localTime}
                      </span>
                    ) : null;
                  })()}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-30" />
                  <span className="text-xs text-muted-foreground italic">No time zone set</span>
                </div>
              )}
              {(leadSource?.name || contact.leadSourceType) && (
                <div className="pt-1.5 flex items-center gap-1 flex-wrap">
                  {leadSource?.parentName ? (
                    <>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-medium">
                        {leadSource.parentName}
                      </span>
                      <span className="text-muted-foreground text-xs">›</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-semibold">
                        {leadSource.name}
                      </span>
                    </>
                  ) : leadSource?.name ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-semibold">
                      {leadSource.name}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-medium">
                      {contact.leadSourceType?.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              )}
              {/* Spouse / Partner inline */}
              {(contact as any).spouseFirstName && (
                <div className="pt-2 mt-2 border-t space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> Spouse / Partner
                  </p>
                  <p className="text-sm font-medium">{(contact as any).spouseFirstName} {(contact as any).spouseLastName}</p>
                  {(contact as any).spouseEmail && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{(contact as any).spouseEmail}</span>
                    </div>
                  )}
                  {(contact as any).spousePhone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>{(contact as any).spousePhone}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="text-xs text-muted-foreground pt-1 border-t">
                Added {safeFormat(contact.createdAt, "MMM d, yyyy")}
              </div>
            </CardContent>
          </Card>

          {/* Agent Connections */}
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agent Connections</span>
                {canAssign && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setAssignOpen(true)}>
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                )}
              </div>
              {!connections || (connections as any[]).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No agent connections yet.{canAssign ? " Use 'Assign to Agent' to add one." : ""}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {(connections as any[]).map(({ connection, agent }) => (
                    <AgentConnectionCard
                      key={connection.id}
                      connection={connection}
                      agent={agent}
                      contactId={contactId}
                      canDelete={isIsa || isAdmin}
                      isPendingDelete={pendingTargetIds.has(connection.id)}
                      onView={() => navigate(`/pipeline/${connection.id}`)}
                      onDelete={() => handleRequestDelete(connection.id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {contact.notes && (
            <Card>
              <CardContent className="p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm whitespace-pre-wrap break-words max-h-48 overflow-y-auto">{contact.notes}</p>
              </CardContent>
            </Card>
          )}


        </div>

        {/* Right: Tabs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="activity">
            <div className="mb-4 space-y-2">
              <TabsList className="flex overflow-x-auto h-auto gap-0 w-full" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                <TabsTrigger value="activity" className="shrink-0 whitespace-nowrap">Activity</TabsTrigger>
                <TabsTrigger value="properties" className="shrink-0 whitespace-nowrap">Properties ({contactProps?.length ?? 0})</TabsTrigger>
                <TabsTrigger value="transactions" className="shrink-0 whitespace-nowrap">Transactions ({contactTransactions.length})</TabsTrigger>
                <TabsTrigger value="tasks" className="shrink-0 whitespace-nowrap">Tasks ({(tasks ?? []).filter(t => t.task.status !== "completed" && t.task.status !== "cancelled").length})</TabsTrigger>
                <TabsTrigger value="history" className="shrink-0 whitespace-nowrap">History</TabsTrigger>
                <TabsTrigger value="smart-plans" className="shrink-0 whitespace-nowrap"><Zap className="h-3.5 w-3.5 mr-1 inline shrink-0" />Smart Plans</TabsTrigger>
                <TabsTrigger value="email-behaviors" className="shrink-0 whitespace-nowrap"><Inbox className="h-3.5 w-3.5 mr-1 inline shrink-0" />Email Behaviors</TabsTrigger>
              </TabsList>
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setNoteOpen(true)}>
                  <MessageSquare className="h-4 w-4 mr-1" /> Add Note
                </Button>
              </div>
            </div>

            <TabsContent value="activity">
              {/* AI Summary — always pinned at top, collapsible */}
              <ActivityTabAiSummary contactId={contactId} />
              {(!comms || comms.length === 0) && activityEntries.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No activity yet. Add a note to get started.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {/* System activity-log entries (e.g. property views) */}
                  {activityEntries.map((entry) => (
                    <Card key={`activity-${entry.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{entry.title}</Badge>
                            <span className="text-xs text-muted-foreground">{entry.actor}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{entry.timestamp}</span>
                        </div>
                        {entry.lines.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {entry.lines.map((line, i) => (
                              <p key={i} className="text-sm text-muted-foreground">{line}</p>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {(comms ?? []).map(({ communication, author }) => (
                    <Card key={communication.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs capitalize">{communication.type}</Badge>
                            <span className="text-xs text-muted-foreground">{author?.name ?? "System"}</span>
                            {communication.editedAt && (
                              <span className="text-xs text-muted-foreground italic">(edited)</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {safeFormat(communication.communicatedAt, "MMM d, yyyy h:mm a")}
                            </span>
                            {/* Edit button — only visible to the note author */}
                            {communication.type === "note" && communication.authorId === user?.id && editingNoteId !== communication.id && (
                              <button
                                className="text-xs text-primary hover:underline flex items-center gap-0.5"
                                onClick={() => { setEditingNoteId(communication.id); setEditingNoteText(communication.body ?? ""); }}
                              >
                                <Edit2 className="h-3 w-3" /> Edit
                              </button>
                            )}
                          </div>
                        </div>
                        {communication.subject && <p className="text-sm font-medium mb-1">{communication.subject}</p>}
                        {/* Inline edit form */}
                        {editingNoteId === communication.id ? (
                          <div className="space-y-2 mt-1">
                            <textarea
                              className="w-full text-sm border rounded-md p-2 min-h-[80px] max-h-[200px] overflow-y-auto bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                              value={editingNoteText}
                              onChange={(e) => setEditingNoteText(e.target.value)}
                            />
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingNoteId(null)}>Cancel</Button>
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                disabled={updateNote.isPending || !editingNoteText.trim()}
                                onClick={() => updateNote.mutate({ id: communication.id, body: editingNoteText.trim() })}
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">{communication.body}</p>
                        )}
                        {/* Call recording audio player */}
                        {communication.type === "call" && communication.audioFileUrl && (
                          <div className="mt-3">
                            <p className="text-xs text-muted-foreground mb-1 font-medium">Recording</p>
                            <audio
                              controls
                              className="w-full h-9"
                              style={{ borderRadius: '6px' }}
                              src={communication.audioFileUrl}
                              preload="none"
                            >
                              Your browser does not support audio playback.
                            </audio>
                          </div>
                        )}
                        {/* AI Transcript */}
                        {communication.type === "call" && communication.transcription && (
                          <details className="mt-3">
                            <summary className="text-xs font-medium text-primary cursor-pointer hover:underline select-none">
                              View Transcript
                            </summary>
                            <div className="mt-2 p-3 bg-muted rounded-md text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                              {communication.transcription}
                            </div>
                          </details>
                        )}
                        {/* Audit trail: show original text if note was edited */}
                        {communication.editedAt && communication.originalBody && (
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
                              <History className="h-3 w-3 inline mr-1" />
                              Edited {safeFormat(communication.editedAt, "MMM d, yyyy h:mm a")}
                            </summary>
                            <div className="mt-1 pl-3 border-l-2 border-muted text-xs text-muted-foreground">
                              <p className="font-medium mb-0.5">Original:</p>
                              <p className="whitespace-pre-wrap">{communication.originalBody}</p>
                            </div>
                          </details>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="properties">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">Properties associated with this contact</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setLinkPropertyOpen(true)}>
                    <Link2 className="h-4 w-4 mr-1" /> Link Existing
                  </Button>
                  <Button size="sm" onClick={() => setAddPropertyOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Add Property
                  </Button>
                </div>
              </div>
              {!contactProps || contactProps.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground">
                    <Home className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No properties linked yet.</p>
                    <p className="text-xs mt-1">Add a mailing address, primary home, or investment property.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {contactProps.map((cp) => (
                    <Card key={cp.id}>
                      <CardContent className="p-4 flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                            <Home className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-sm font-medium">{formatStreet(cp.address)}</p>
                              <Badge variant="outline" className="text-xs">{cp.label}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {formatCityStateZip(cp.city, cp.state, cp.zip)}
                            </p>
                            {(cp.beds || cp.baths || cp.sqft) && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {cp.beds && `${cp.beds} bd`}{cp.baths && ` · ${cp.baths} ba`}{cp.sqft && ` · ${Number(cp.sqft).toLocaleString()} sqft`}
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive shrink-0"
                          onClick={() => unlinkProperty.mutate({ id: cp.id })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="transactions">
              {contactTransactions.length === 0 ? (
                <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">No transactions linked to this contact</CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {contactTransactions.map(({ transaction, property }) => (
                    <Card
                      key={transaction.id}
                      className={isIsa ? "" : "cursor-pointer hover:bg-muted/20"}
                      onClick={isIsa ? undefined : () => navigate(`/transactions/${transaction.id}`)}
                    >
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{transaction.transactionNumber ?? `TXN-${transaction.id}`}</p>
                          <p className="text-xs text-muted-foreground">{(property as any)?.address ? formatStreet((property as any).address) : "No property"}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {transaction.grossCommissionIncome && (
                            <span className="text-sm font-semibold text-emerald-700">${Number(transaction.grossCommissionIncome).toLocaleString()}</span>
                          )}
                          <TransactionStatusBadge status={transaction.status} />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="tasks">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">Tasks linked to this contact</p>
                <Button size="sm" onClick={() => {
                  setAddTaskForm({ title: "", description: "", priority: "medium", dueDate: "", assignedToId: user?.id ? String(user.id) : "" });
                  setAddTaskOpen(true);
                }}>
                  <Plus className="h-4 w-4 mr-1" /> Add Task
                </Button>
              </div>
              {!tasks || tasks.length === 0 ? (
                <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">No tasks for this contact</CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {tasks.map((row) => (
                    <Card key={row.task.id} className={row.task.status === "completed" || row.task.status === "cancelled" ? "opacity-60" : ""}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{row.task.title}</p>
                            {row.task.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{row.task.description}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                              {row.task.dueDate && (
                                <span className="text-xs text-muted-foreground">Due {safeFormat(row.task.dueDate, "MMM d, yyyy")}</span>
                              )}
                              {row.assignedTo && (
                                <span className="text-xs text-muted-foreground">Assigned to <span className="font-medium text-foreground">{(row.assignedTo as any).name}</span></span>
                              )}
                              {row.task.createdAt && (
                                <span className="text-xs text-muted-foreground">Created {safeFormat(row.task.createdAt, "MMM d, yyyy")}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <PriorityBadge priority={row.task.priority} />
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              row.task.status === "completed" ? "bg-green-100 text-green-700" :
                              row.task.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                              row.task.status === "cancelled" ? "bg-gray-100 text-gray-500" :
                              "bg-yellow-100 text-yellow-700"
                            }`}>{row.task.status?.replace("_", " ")}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => openEditTask(row)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            {row.task.status !== "completed" && row.task.status !== "cancelled" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-green-600 hover:text-green-700"
                                onClick={() => completeTaskMutation.mutate({ id: row.task.id })}
                                disabled={completeTaskMutation.isPending}
                              >
                                ✓
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history">
              <ContactHistoryTabContent contactId={contactId} />
            </TabsContent>

            {/* Smart Plans Tab */}
            <TabsContent value="smart-plans">
              <SmartPlanContactTab contactId={contactId} />
            </TabsContent>

            {/* Email Behaviors Tab */}
            <TabsContent value="email-behaviors">
              <EmailBehaviorsTab contactId={contactId} />
            </TabsContent>

          </Tabs>
        </div>
      </div>

      {/* ── Add Note Dialog ── */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Communication Note</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Type</Label>
              <Select value={noteType} onValueChange={(v) => setNoteType(v as any)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Note *</Label>
              <Textarea className="mt-1 max-h-[200px] overflow-y-auto" value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4} placeholder="Enter your note..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addNote.mutate({ type: noteType, body: noteText, relatedContactId: contactId, direction: "internal" })}
              disabled={!noteText || addNote.isPending}
            >
              {addNote.isPending ? "Saving..." : "Save Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Contact Dialog ── */}
      {editForm && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit Contact</DialogTitle></DialogHeader>
            <Tabs defaultValue="primary">
              <TabsList className="mb-4 flex overflow-x-auto h-auto gap-0 w-full" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                <TabsTrigger value="primary" className="shrink-0 whitespace-nowrap">Primary</TabsTrigger>
                <TabsTrigger value="spouse" className="shrink-0 whitespace-nowrap">Spouse / Partner</TabsTrigger>
                <TabsTrigger value="details" className="shrink-0 whitespace-nowrap">Details & Source</TabsTrigger>
              </TabsList>

              <TabsContent value="primary" className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>First Name</Label><Input className="mt-1" value={editForm.firstName} onChange={e => setEditForm({ ...editForm, firstName: e.target.value })} /></div>
                  <div><Label>Last Name</Label><Input className="mt-1" value={editForm.lastName} onChange={e => setEditForm({ ...editForm, lastName: e.target.value })} /></div>
                  <div>
                    <Label>Email *</Label>
                    <Input className="mt-1" type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} placeholder="required" />
                  </div>
                  <div><Label>Phone</Label><Input className="mt-1" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: formatPhone(e.target.value) })} placeholder="e.g. 5551234567" /></div>
                  <div><Label>Secondary Email</Label><Input className="mt-1" type="email" value={editForm.secondaryEmail} onChange={e => setEditForm({ ...editForm, secondaryEmail: e.target.value })} /></div>
                  <div><Label>Secondary Phone</Label><Input className="mt-1" value={editForm.secondaryPhone} onChange={e => setEditForm({ ...editForm, secondaryPhone: formatPhone(e.target.value) })} placeholder="e.g. 5551234567" /></div>
                  <div className="sm:col-span-2">
                    <Label>Time Zone</Label>
                    <Select value={editForm.timezone || "none"} onValueChange={v => setEditForm({ ...editForm, timezone: v === "none" ? "" : v })}>
                      <SelectTrigger className="mt-1">
                        <Globe className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                        <SelectValue placeholder="Select time zone..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Not set —</SelectItem>
                        {US_TIMEZONES.map(tz => (
                          <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* ISA assignment — visible to admins and ISAs */}
                {canAssign && (
                  <div>
                    <Label>Assigned ISA</Label>
                    <SearchableSelect
                      className="mt-1 w-full"
                      options={[
                        { value: "none", label: "Unassigned" },
                        ...(isas as any[]).map((isa: any) => ({ value: String(isa.id), label: isa.name ?? `ISA #${isa.id}` }))
                      ]}
                      value={editIsaId || "none"}
                      onValueChange={v => setEditIsaId(v === "none" ? "" : v)}
                      placeholder="Unassigned"
                      searchPlaceholder="Search ISAs…"
                    />
                  </div>
                )}
                {/* ISA pipeline status — only editable when an ISA is assigned */}
                {canAssign && (
                  <div>
                    <Label>ISA Pipeline Status</Label>
                    <Select
                      value={editIsaStatus}
                      onValueChange={v => setEditIsaStatus(v)}
                      disabled={!editIsaId}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={editIsaId ? "Select status..." : "Assign an ISA first"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        {PIPELINE_STAGE_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!editIsaId && <p className="text-xs text-muted-foreground mt-1">Assign an ISA to enable this field.</p>}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="spouse" className="space-y-3">
                <p className="text-sm text-muted-foreground mb-2">Spouse, business partner, or co-buyer associated with this contact.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>First Name</Label><Input className="mt-1" value={editForm.spouseFirstName} onChange={e => setEditForm({ ...editForm, spouseFirstName: e.target.value })} /></div>
                  <div><Label>Last Name</Label><Input className="mt-1" value={editForm.spouseLastName} onChange={e => setEditForm({ ...editForm, spouseLastName: e.target.value })} /></div>
                  <div><Label>Email</Label><Input className="mt-1" type="email" value={editForm.spouseEmail} onChange={e => setEditForm({ ...editForm, spouseEmail: e.target.value })} /></div>
                  <div><Label>Phone</Label><Input className="mt-1" value={editForm.spousePhone} onChange={e => setEditForm({ ...editForm, spousePhone: formatPhone(e.target.value) })} placeholder="e.g. 5551234567" /></div>
                </div>
              </TabsContent>

              <TabsContent value="details" className="space-y-4">
                <div>
                  <Label>Lead Source</Label>
                  <LeadSourcePicker className="mt-1" value={editLeadSourceId} onChange={setEditLeadSourceId} />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea className="mt-1 max-h-[200px] overflow-y-auto" rows={3} value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
                </div>
              </TabsContent>
            </Tabs>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button
                disabled={updateContact.isPending || checkDupMut.isPending}
                onClick={handleSaveContactEdit}
              >
                {(updateContact.isPending || checkDupMut.isPending) ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Assign to Agent Dialog ── */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Contact to Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Agent *</Label>
              <SearchableSelect
                className="mt-1 w-full"
                options={(agents as any[]).map((a: any) => ({ value: String(a.id), label: a.name ?? `Agent #${a.id}` }))}
                value={assignForm.agentId || ""}
                onValueChange={v => setAssignForm(f => ({ ...f, agentId: v }))}
                placeholder="Select agent…"
                searchPlaceholder="Search agents…"
              />
            </div>
            <div>
              <Label>Pipeline Stage</Label>
              <Select value={assignForm.pipelineStatus} onValueChange={v => setAssignForm(f => ({ ...f, pipelineStatus: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PIPELINE_STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* ISA follow-up date and assigned ISA */}
            <div>
              <Label>Follow up date <span className="text-muted-foreground font-normal">(creates a task for the assigned ISA - optional)</span></Label>
              <Input type="date" className="mt-1" value={assignForm.isaFollowUpDate} onChange={e => setAssignForm(f => ({ ...f, isaFollowUpDate: e.target.value }))} />
            </div>
            <div>
              <Label>Assigned ISA <span className="text-muted-foreground font-normal">(who should follow up on this connection)</span></Label>
              <SearchableSelect
                className="mt-1 w-full"
                options={(isas as any[]).map((isa: any) => ({ value: String(isa.id), label: isa.name ?? `ISA #${isa.id}` }))}
                value={assignForm.isaTaskAssigneeId || ""}
                onValueChange={v => setAssignForm(f => ({ ...f, isaTaskAssigneeId: v }))}
                placeholder="Select ISA…"
                searchPlaceholder="Search ISAs…"
              />
            </div>
            <div>
              <Label>Notes for Agent <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                className="mt-1 max-h-[150px] overflow-y-auto"
                rows={2}
                placeholder="Any context to pass to the agent..."
                value={assignForm.agentNotes}
                onChange={e => setAssignForm(f => ({ ...f, agentNotes: e.target.value }))}
              />
            </div>
            {/* Agent booking link — shown when an agent is selected */}
            {assignForm.agentId && (() => {
              const selectedAgent = (agents as any[]).find((a: any) => String(a.id) === assignForm.agentId);
              return selectedAgent?.callBookingLink ? (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Agent's Call Booking Link</p>
                  <a
                    href={selectedAgent.callBookingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline break-all"
                  >
                    {selectedAgent.callBookingLink}
                  </a>
                </div>
              ) : null;
            })()}
            {/* Set an appointment */}
            <div className="flex items-start gap-2">
              <Checkbox
                id="appointmentSet"
                checked={assignForm.appointmentSet}
                onCheckedChange={(v) => setAssignForm(f => ({ ...f, appointmentSet: !!v }))}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="appointmentSet" className="cursor-pointer">Set an appointment</Label>
                {assignForm.appointmentSet && (
                  <p className="text-xs text-muted-foreground mt-0.5">This will be tracked for ISA appointment-setting statistics.</p>
                )}
              </div>
            </div>
            {/* Introduce client to agent */}
            <div className="flex items-start gap-2">
              <Checkbox
                id="introduceClient"
                checked={assignForm.introduceClient}
                onCheckedChange={(v) => setAssignForm(f => ({ ...f, introduceClient: !!v }))}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="introduceClient" className="cursor-pointer">Introduce client to agent</Label>
                {assignForm.introduceClient && (
                  <p className="text-xs text-muted-foreground mt-0.5">An email will be sent to the client introducing them to the agent, with the agent CC'd.</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={!assignForm.agentId || createConnection.isPending}>
              {createConnection.isPending ? "Assigning..." : "Assign to Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Connection Request Dialog ── */}
      <Dialog open={deleteConnOpen} onOpenChange={setDeleteConnOpen}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> Request Agent Connection Removal
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {deleteBlockReasons.length > 0 ? (
              <div className="space-y-2">
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> This connection cannot be deleted
                  </p>
                  <ul className="space-y-1.5">
                    {deleteBlockReasons.map((reason, i) => (
                      <li key={i} className="text-sm text-red-700 flex items-start gap-1.5">
                        <span className="mt-0.5 shrink-0">•</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs text-muted-foreground">Resolve the issue(s) above before submitting a deletion request.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  This will submit a deletion request to an admin for approval. The connection will remain active until approved.
                </p>
                <div>
                  <Label>Reason for removal *</Label>
                  <Textarea
                    className="mt-1"
                    rows={3}
                    placeholder="Explain why this agent connection should be removed..."
                    value={deleteReason}
                    onChange={e => setDeleteReason(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Minimum 10 characters required.</p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConnOpen(false)}>Close</Button>
            {deleteBlockReasons.length === 0 && (
              <Button
                variant="destructive"
                disabled={deleteReason.length < 10 || requestDeletion.isPending || !deleteConnId}
                onClick={() => {
                  if (!deleteConnId) return;
                  requestDeletion.mutate({
                    type: "delete_agent_connection",
                    targetId: deleteConnId,
                    reason: deleteReason,
                  });
                }}
              >
                {requestDeletion.isPending ? "Submitting..." : "Submit Request"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add New Property Dialog ── */}
      <Dialog open={addPropertyOpen} onOpenChange={setAddPropertyOpen}>
        <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Property</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Label</Label>
              <Input className="mt-1" value={newPropertyForm.label} onChange={e => setNewPropertyForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Primary home, Investment property" />
            </div>
            <div>
              <Label>Street Address *</Label>
              <Input className="mt-1" value={newPropertyForm.address} onChange={e => setNewPropertyForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><Label>City *</Label><Input className="mt-1" value={newPropertyForm.city} onChange={e => setNewPropertyForm(f => ({ ...f, city: e.target.value }))} placeholder="e.g. Glendale" /></div>
              <div><Label>State *</Label><Input className="mt-1" value={newPropertyForm.state} onChange={e => setNewPropertyForm(f => ({ ...f, state: e.target.value }))} placeholder="e.g. UT" maxLength={2} /></div>
              <div><Label>ZIP *</Label><Input className="mt-1" value={newPropertyForm.zip} onChange={e => setNewPropertyForm(f => ({ ...f, zip: e.target.value }))} placeholder="e.g. 84729" /></div>
            </div>
            <div>
              <Label>Property Type</Label>
              <Select value={newPropertyForm.propertyType} onValueChange={v => setNewPropertyForm(f => ({ ...f, propertyType: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><Label>Beds</Label><Input className="mt-1" type="number" value={newPropertyForm.beds} onChange={e => setNewPropertyForm(f => ({ ...f, beds: e.target.value }))} /></div>
              <div><Label>Baths</Label><Input className="mt-1" type="number" value={newPropertyForm.baths} onChange={e => setNewPropertyForm(f => ({ ...f, baths: e.target.value }))} /></div>
              <div><Label>Sqft</Label><Input className="mt-1" type="number" value={newPropertyForm.sqft} onChange={e => setNewPropertyForm(f => ({ ...f, sqft: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPropertyOpen(false)}>Cancel</Button>
            <Button
              disabled={!newPropertyForm.address || !newPropertyForm.city || !newPropertyForm.state || !newPropertyForm.zip || createProperty.isPending || linkProperty.isPending}
              onClick={() => createProperty.mutate({
                address: newPropertyForm.address,
                city: newPropertyForm.city,
                state: newPropertyForm.state,
                zip: newPropertyForm.zip,
                propertyType: newPropertyForm.propertyType as any,
                beds: newPropertyForm.beds ? newPropertyForm.beds : null,
                baths: newPropertyForm.baths ? newPropertyForm.baths : null,
                sqft: newPropertyForm.sqft ? parseInt(newPropertyForm.sqft) : null,
              })}
            >
              {(createProperty.isPending || linkProperty.isPending) ? "Saving..." : "Add Property"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Task Dialog ── */}
      <Dialog open={addTaskOpen} onOpenChange={setAddTaskOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Title *</Label>
              <Input
                className="mt-1"
                value={addTaskForm.title}
                onChange={e => setAddTaskForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Task title..."
              />
            </div>
            <div>
              <Label>Description / Notes</Label>
              <Textarea
                className="mt-1"
                rows={3}
                value={addTaskForm.description}
                onChange={e => setAddTaskForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional notes..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={addTaskForm.priority} onValueChange={v => setAddTaskForm(f => ({ ...f, priority: v as any }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Due Date</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={addTaskForm.dueDate}
                  onChange={e => setAddTaskForm(f => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Assigned To</Label>
              <Select
                value={addTaskForm.assignedToId || "unassigned"}
                onValueChange={v => setAddTaskForm(f => ({ ...f, assignedToId: v === "unassigned" ? "" : v }))}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select person..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {([...(agents as any[]), ...(isas as any[])]).map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTaskOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createTaskMutation.mutate({
                title: addTaskForm.title,
                description: addTaskForm.description || null,
                priority: addTaskForm.priority,
                dueDate: addTaskForm.dueDate || null,
                assignedToId: addTaskForm.assignedToId ? Number(addTaskForm.assignedToId) : null,
                relatedContactId: contactId,
              })}
              disabled={!addTaskForm.title || createTaskMutation.isPending}
            >
              {createTaskMutation.isPending ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Task Dialog ── */}
      <Dialog open={editTaskOpen} onOpenChange={setEditTaskOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Title</Label>
              <Input
                className="mt-1"
                value={editTaskForm.title}
                onChange={e => setEditTaskForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <Label>Description / Notes</Label>
              <Textarea
                className="mt-1"
                rows={3}
                value={editTaskForm.description}
                onChange={e => setEditTaskForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional notes..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={editTaskForm.priority} onValueChange={v => setEditTaskForm(f => ({ ...f, priority: v as any }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editTaskForm.status} onValueChange={v => setEditTaskForm(f => ({ ...f, status: v as any }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input
                type="date"
                className="mt-1"
                value={editTaskForm.dueDate}
                onChange={e => setEditTaskForm(f => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
            <div>
              <Label>Assigned To</Label>
              <Select
                value={editTaskForm.assignedToId || "unassigned"}
                onValueChange={v => setEditTaskForm(f => ({ ...f, assignedToId: v === "unassigned" ? "" : v }))}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select person..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {([...(agents as any[]), ...(isas as any[])]).map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editingTask?.task?.createdAt && (
              <p className="text-xs text-muted-foreground">
                Created {safeFormat(editingTask.task.createdAt, "MMM d, yyyy h:mm a")}
                {editingTask?.task?.updatedAt && editingTask.task.updatedAt !== editingTask.task.createdAt && (
                  <> &middot; Updated {safeFormat(editingTask.task.updatedAt, "MMM d, yyyy h:mm a")}</>
                )}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTaskOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTask} disabled={updateTaskMutation.isPending || !editTaskForm.title}>
              {updateTaskMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Link Existing Property Dialog ── */}
      <Dialog open={linkPropertyOpen} onOpenChange={setLinkPropertyOpen}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
          <DialogHeader><DialogTitle>Link Existing Property</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Property</Label>
              <Select value={linkPropertyId || "none"} onValueChange={v => setLinkPropertyId(v === "none" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select property..." /></SelectTrigger>
                <SelectContent>
                  {(allProperties as any[]).map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.address}{p.city ? `, ${p.city}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Label</Label>
              <Input className="mt-1" value={propertyLabel} onChange={e => setPropertyLabel(e.target.value)} placeholder="e.g. Primary home" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkPropertyOpen(false)}>Cancel</Button>
            <Button
              disabled={!linkPropertyId || linkProperty.isPending}
              onClick={() => linkProperty.mutate({ contactId, propertyId: Number(linkPropertyId), label: propertyLabel })}
            >
              {linkProperty.isPending ? "Linking..." : "Link Property"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Archive Contact Dialog ── */}
      <Dialog open={archiveContactOpen} onOpenChange={setArchiveContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-muted-foreground" /> Archive Contact
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Archiving <strong>{contact.firstName} {contact.lastName}</strong> will hide them from active lists. They can be restored later. This does not delete any data.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveContactOpen(false)}>Cancel</Button>
            <Button
              variant="secondary"
              disabled={archiveContactMutation.isPending}
              onClick={() => archiveContactMutation.mutate({ id: contactId })}
            >
              {archiveContactMutation.isPending ? "Archiving..." : "Archive Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Contact Dialog ── */}
      <Dialog open={deleteContactOpen} onOpenChange={setDeleteContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Delete Contact
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will <strong>permanently delete</strong> {contact.firstName} {contact.lastName} and all associated data. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteContactOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteContactMutation.isPending}
              onClick={() => deleteContactMutation.mutate({ id: contactId })}
            >
              {deleteContactMutation.isPending ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
