import { useState, useRef, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
import { TransactionStatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle, CheckCircle2, Plus, DollarSign, Edit2, Link2, Info, Upload, FileText, Trash2, Send, MessageSquare, Pencil, Search, Loader2, Download, Eye, MoreHorizontal, History, TrendingUp, Home, Building2, Calendar, ArrowRight, RefreshCw, Users, X, FolderOpen } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatActivityEntry } from "@/lib/activityFormatter";
import { useLocation, useParams, Link } from "wouter";
import { safeFormat } from "@/lib/safeFormat";
import { formatPhone as _formatPhone, parseCurrencyInput, isValidEmail } from "@/lib/inputFormatters";
import { formatStreet, formatCityStateZip, formatEmail } from "@/lib/format";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCelebration } from "@/hooks/useCelebration";

// ─── Transaction History Timeline ─────────────────────────────────────────────────────────
const TX_HISTORY_OUTCOME_COLORS: Record<string, string> = {
  green: "bg-green-100 text-green-700",
  blue: "bg-blue-100 text-blue-700",
  red: "bg-red-100 text-red-700",
  orange: "bg-orange-100 text-orange-700",
  gray: "bg-gray-100 text-gray-700",
};

type TxHistoryEvent = {
  id: string;
  type: "transaction_opened" | "listing_converted" | "status_change" | "communication" | "note" | "activity";
  date: Date | null;
  title: string;
  subtitle: string;
  outcome?: string;
  outcomeColor?: string;
  contactId?: number;
  listingId?: number;
  propertyId?: number;
  meta?: Record<string, string | number | null>;
};

function TxEventIcon({ type }: { type: TxHistoryEvent["type"] }) {
  const cls = "h-3.5 w-3.5";
  if (type === "transaction_opened") return <TrendingUp className={cls} />;
  if (type === "listing_converted") return <Home className={cls} />;
  if (type === "status_change") return <CheckCircle2 className={cls} />;
  if (type === "communication") return <MessageSquare className={cls} />;
  if (type === "note") return <FileText className={cls} />;
  return <Info className={cls} />;
}

function txEventDotColor(type: TxHistoryEvent["type"]): string {
  if (type === "transaction_opened") return "bg-emerald-500";
  if (type === "listing_converted") return "bg-amber-500";
  if (type === "status_change") return "bg-blue-500";
  if (type === "communication") return "bg-violet-500";
  if (type === "note") return "bg-indigo-400";
  return "bg-slate-400";
}

function TransactionHistoryTabContent({ transactionId }: { transactionId: number }) {
  const { data: historyData, isLoading } = trpc.transactions.getHistory.useQuery(
    { transactionId },
    { enabled: !!transactionId }
  );
  const events = (historyData?.events ?? []) as TxHistoryEvent[];

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
        <p className="text-sm">No history recorded yet for this transaction.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-0">
            {events.map((event, idx) => {
              const isLast = idx === events.length - 1;
              const dotColor = txEventDotColor(event.type);
              const eventDate = event.date ? new Date(event.date) : null;
              const isNavigable = !!(event.contactId || event.listingId || event.propertyId);
              const content = (
                <div
                  className={`relative pl-14 pr-4 py-4 ${
                    !isLast ? "border-b border-border/50" : ""
                  } ${isNavigable ? "hover:bg-muted/40 cursor-pointer transition-colors" : ""}`}
                >
                  <div className={`absolute left-3.5 top-5 h-3 w-3 rounded-full border-2 border-background ${dotColor} shadow-sm`} />
                  <div className="absolute left-8 top-4 text-muted-foreground">
                    <TxEventIcon type={event.type} />
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
                            if (!v) return null;
                            const label = k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
                            return (
                              <span key={k} className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground/70">{label}:</span> {String(v)}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {/* Visual connector: listing → this transaction */}
                      {event.type === "listing_converted" && event.listingId && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
                          <ArrowRight className="h-3 w-3" />
                          <Link href={`/listings/${event.listingId}`} className="hover:underline font-medium">
                            View original listing #{event.listingId}
                          </Link>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {event.outcome && (
                        <Badge className={`text-xs ${TX_HISTORY_OUTCOME_COLORS[event.outcomeColor ?? "gray"] ?? "bg-gray-100 text-gray-700"}`}>
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
              if (event.contactId) return <Link key={event.id} href={`/contacts/${event.contactId}`}>{content}</Link>;
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

const DOCUMENT_LABELS = [
  { value: "appraisal", label: "Appraisal" },
  { value: "closing_disclosure", label: "Closing Disclosure" },
  { value: "home_inspection", label: "Home Inspection" },
  { value: "other", label: "Other (custom)" },
];

function parsePriceInput(value: string) {
  return parseCurrencyInput(value);
}
const formatPhone = _formatPhone;

function toDateInputValue(d: any): string {
  if (!d) return "";
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return "";
    return date.toISOString().split("T")[0];
  } catch {
    return "";
  }
}

export default function TransactionDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const txId = parseInt(id ?? "0");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isAgent = user?.role === "agent";

  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteMutation = trpc.transactions.delete.useMutation({
    onSuccess: () => {
      toast.success("Transaction deleted.");
      navigate("/transactions");
    },
    onError: (e) => toast.error(e.message),
  });

  const [payoutOpen, setPayoutOpen] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [exceptionForm, setExceptionForm] = useState({
    reason: "",
    agentSplitPct: "",
    brokerageSplitPct: "",
    teamLeaderSplitPct: "0",
    referralSplitPct: "0",
  });
  const [statusOpen, setStatusOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");
  const [terminationReasonOpen, setTerminationReasonOpen] = useState(false);
  const [terminationReason, setTerminationReason] = useState("");
  const [payoutForm, setPayoutForm] = useState({
    payeeType: "agent" as const,
    payeeUserId: "",
    payeeReferralPartnerId: "",
    payeeName: "",
    percentage: "",
    amount: "",
    notes: "",
  });
  const [payoutCommissionType, setPayoutCommissionType] = useState<"percentage" | "flat">("percentage");

  // Document upload state
  const [docLabel, setDocLabel] = useState<string>("appraisal");
  const [docCustomLabel, setDocCustomLabel] = useState("");
  const [docUploading, setDocUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [renameDocId, setRenameDocId] = useState<number | null>(null);
  const [renameDocName, setRenameDocName] = useState("");
  // Bulk upload state
  type BulkFile = {
    id: string;
    file: File;
    label: "appraisal" | "closing_disclosure" | "home_inspection" | "other";
    customLabel: string;
    status: "pending" | "uploading" | "done" | "error";
    error?: string;
  };
  const [bulkFiles, setBulkFiles] = useState<BulkFile[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkDragOver, setBulkDragOver] = useState(false);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  // Notes state
  const [noteContent, setNoteContent] = useState("");

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [gciManuallyEdited, setGciManuallyEdited] = useState(false);
  const [editContactSearch, setEditContactSearch] = useState("");
  const [editPropertySearch, setEditPropertySearch] = useState("");

  // Buyer-side edit dialog state
  const [buyerEditOpen, setBuyerEditOpen] = useState(false);
  const [buyerEditForm, setBuyerEditForm] = useState({
    buyerContactId: null as number | null,
    buyerContactName: "",
    buyerCommissionRate: "",
    buyerCommissionType: "percentage" as "percentage" | "flat",
    buyerGci: "",
    buyerGciManuallyEdited: false,
    buyerNotes: "",
  });
  const [buyerContactSearch, setBuyerContactSearch] = useState("");

  // Commission split preview state
  const [splitPreviewOpen, setSplitPreviewOpen] = useState(false);

  const { data: txData, refetch } = trpc.transactions.get.useQuery({ id: txId });
  const { data: payouts, refetch: refetchPayouts } = trpc.transactions.getPayouts.useQuery({ transactionId: txId });
  const { data: tasksData } = trpc.tasks.list.useQuery({ relatedTransactionId: txId });
  const tasks = tasksData?.rows ?? [];
  const { data: comms } = trpc.communications.list.useQuery({ transactionId: txId });
  const { data: agents } = trpc.users.list.useQuery({ role: "agent" });
  const { data: allAgents } = trpc.users.list.useQuery({});
  const { data: activityLog } = trpc.analytics.activityLog.useQuery({ entityType: "transaction", entityId: txId });
  const { data: documents, refetch: refetchDocs } = trpc.transactions.getDocuments.useQuery({ transactionId: txId });
  const { data: notes, refetch: refetchNotes } = trpc.transactions.getNotes.useQuery({ transactionId: txId });
  const { data: exceptions, refetch: refetchExceptions } = trpc.commissionExceptions.listForTransaction.useQuery(
    { transactionId: txId },
    { enabled: !!txId }
  );

  // Contact search for edit dialog
  const { data: editContactsData } = trpc.contacts.list.useQuery(
    { search: editContactSearch || undefined },
    { enabled: editContactSearch.length > 1 }
  );
  const editContacts = editContactsData?.rows ?? [];

  // Contact search for buyer edit dialog
  const { data: buyerContactsData } = trpc.contacts.list.useQuery(
    { search: buyerContactSearch || undefined },
    { enabled: buyerContactSearch.length > 1 }
  );
  const buyerContactResults = buyerContactsData?.rows ?? [];

  // Property search for edit dialog
  const { data: editProperties = [] } = trpc.properties.list.useQuery(
    { search: editPropertySearch || undefined },
    { enabled: editPropertySearch.length > 1 }
  );

  const { celebrate } = useCelebration();

  const updateStatus = trpc.transactions.update.useMutation({
    onSuccess: (_data, variables) => {
      toast.success("Status updated");
      setStatusOpen(false);
      refetch();
      const newSt = (variables as any)?.data?.status;
      if (newSt === "closed") celebrate("deal_closed");
      else if (newSt === "under_contract") celebrate("under_contract");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateTransaction = trpc.transactions.update.useMutation({
    onSuccess: () => { toast.success("Transaction updated"); setEditOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateBuyerSide = trpc.transactions.update.useMutation({
    onSuccess: () => { toast.success("Buyer side updated"); setBuyerEditOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  function openBuyerEditDialog() {
    if (!tx) return;
    const displayRate = tx.buyerCommissionRate
      ? (Number(tx.buyerCommissionRate) < 1
          ? (Number(tx.buyerCommissionRate) * 100).toFixed(2)
          : Number(tx.buyerCommissionRate).toFixed(2))
      : "";
    // Compute buyer GCI from purchase price × buyer commission rate
    const buyerPrice = tx.purchasePrice ? Number(tx.purchasePrice) : 0;
    const buyerRateDecimal = tx.buyerCommissionRate ? Number(tx.buyerCommissionRate) : 0;
    const computedBuyerGci = buyerPrice > 0 && buyerRateDecimal > 0
      ? (buyerPrice * buyerRateDecimal).toLocaleString("en-US", { maximumFractionDigits: 2 })
      : "";
    setBuyerEditForm({
      buyerContactId: tx.buyerContactId ?? null,
      buyerContactName: buyerContact ? `${buyerContact.firstName} ${buyerContact.lastName}` : "",
      buyerCommissionRate: displayRate,
      buyerCommissionType: (tx.buyerCommissionType as "percentage" | "flat") ?? "percentage",
      buyerGci: computedBuyerGci,
      buyerGciManuallyEdited: false,
      buyerNotes: tx.buyerNotes ?? "",
    });
    setBuyerContactSearch("");
    setBuyerEditOpen(true);
  }

  function handleBuyerEditSave() {
    if (!tx) return;
    const data: Record<string, any> = {};

    // Buyer contact
    const newBuyerContactId = buyerEditForm.buyerContactId;
    if (newBuyerContactId !== (tx.buyerContactId ?? null)) {
      data.buyerContactId = newBuyerContactId;
    }

    // Buyer commission rate (convert % to decimal)
    const rawRate = buyerEditForm.buyerCommissionRate
      ? String(parseFloat(buyerEditForm.buyerCommissionRate) / 100)
      : null;
    const currentRate = tx.buyerCommissionRate ? String(Number(tx.buyerCommissionRate)) : null;
    if (rawRate !== currentRate) data.buyerCommissionRate = rawRate;

    // Buyer commission type
    if (buyerEditForm.buyerCommissionType !== (tx.buyerCommissionType ?? "percentage")) {
      data.buyerCommissionType = buyerEditForm.buyerCommissionType;
    }

    // Buyer notes
    if (buyerEditForm.buyerNotes !== (tx.buyerNotes ?? "")) {
      data.buyerNotes = buyerEditForm.buyerNotes || null;
    }

    if (Object.keys(data).length === 0) {
      toast.info("No changes to save");
      setBuyerEditOpen(false);
      return;
    }

    updateBuyerSide.mutate({ id: txId, data });
  }

  const addTerminationNote = trpc.transactions.addNote.useMutation({
    onSuccess: () => { refetchNotes(); },
  });

  function handleStatusUpdate() {
    if (newStatus === "terminated") {
      setStatusOpen(false);
      setTerminationReasonOpen(true);
    } else {
      updateStatus.mutate({ id: txId, data: { status: newStatus as any } });
    }
  }

  async function handleTerminationConfirm() {
    await updateStatus.mutateAsync({
      id: txId,
      data: {
        status: "terminated" as any,
        terminationReason: terminationReason.trim() || null,
      },
    });
    if (terminationReason.trim()) {
      addTerminationNote.mutate({
        transactionId: txId,
        content: `Termination reason: ${terminationReason.trim()}`,
      });
    }
    setTerminationReasonOpen(false);
    setTerminationReason("");
  }

  const addPayout = trpc.transactions.addPayout.useMutation({
    onSuccess: (data) => {
      toast.success("Payout added");
      if (!data.valid && data.total > 100) toast.warning(`Payout total is ${data.total.toFixed(1)}% — exceeds 100%`);
      setPayoutOpen(false);
      setPayoutForm({ payeeType: "agent", payeeUserId: "", payeeReferralPartnerId: "", payeeName: "", percentage: "", amount: "", notes: "" });
      refetchPayouts();
      refetch(); // refresh transaction to reflect any flag changes
    },
    onError: (e) => toast.error(e.message),
  });

  const markPaid = trpc.transactions.updatePayout.useMutation({
    onSuccess: () => { toast.success("Marked as paid"); refetchPayouts(); },
    onError: (e) => toast.error(e.message),
  });

  const uploadDoc = trpc.transactions.uploadDocument.useMutation({
    onSuccess: () => { toast.success("Document uploaded"); refetchDocs(); setDocCustomLabel(""); },
    onError: (e) => toast.error(e.message),
  });

  const bulkUploadDocs = trpc.transactions.bulkUploadDocuments.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} document${data.count === 1 ? "" : "s"} uploaded successfully`);
      refetchDocs();
      setBulkFiles([]);
    },
    onError: (err) => toast.error(err.message ?? "Bulk upload failed"),
  });
  const renameDoc = trpc.transactions.renameDocument.useMutation({
    onSuccess: () => { toast.success("Document renamed"); refetchDocs(); setRenameDocId(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteDoc = trpc.transactions.deleteDocument.useMutation({
    onSuccess: () => { toast.success("Document deleted"); refetchDocs(); },
    onError: (e) => toast.error(e.message),
  });

  const requestException = trpc.commissionExceptions.request.useMutation({
    onSuccess: () => {
      toast.success("Exception request submitted — an admin will review it shortly");
      setExceptionOpen(false);
      setExceptionForm({ reason: "", agentSplitPct: "", brokerageSplitPct: "", teamLeaderSplitPct: "0", referralSplitPct: "0" });
      refetchExceptions();
    },
    onError: (e) => toast.error(e.message),
  });

  const addNote = trpc.transactions.addNote.useMutation({
    onSuccess: () => { toast.success("Note added"); refetchNotes(); setNoteContent(""); },
    onError: (e) => toast.error(e.message),
  });

  const recalculateSplits = trpc.transactions.recalculateSplits.useMutation({
    onSuccess: (data) => {
      if ((data as any).skipped) {
        toast.warning(`Splits not recalculated: ${(data as any).skipReason}`);
      } else if ((data as any).flagResolved) {
        toast.success("Commission splits recalculated — integrity alert cleared");
      } else {
        toast.success("Commission splits recalculated");
      }
      refetchPayouts();
      refetch(); // refresh transaction to clear integrity flag banner
    },
    onError: (e) => toast.error(e.message),
  });

  const updatePayoutOverride = trpc.transactions.updatePayoutOverride.useMutation({
    onSuccess: (data) => {
      if ((data as any).flagResolved) {
        toast.success("Payout item updated — integrity alert cleared");
      } else {
        toast.success("Payout item updated");
      }
      refetchPayouts();
      refetch(); // refresh transaction to clear integrity flag banner
      setOverrideOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideItem, setOverrideItem] = useState<{ id: number; payeeName: string; percentage: string; amount: string; notes: string } | null>(null);
  const [overrideForm, setOverrideForm] = useState({ percentage: "", amount: "", note: "" });

  const tx = txData?.transaction;
  const gci = tx ? Number(tx.grossCommissionIncome ?? 0) : 0;

  // Commission split preview — computed from current edit form values
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const previewAgentId = editForm.agentId ? Number(editForm.agentId) : (tx?.agentId ?? 0);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const previewGci = useMemo(() => {
    const raw = parseCurrencyInput(editForm.grossCommissionIncome ?? "");
    return raw ? parseFloat(raw) : (tx ? Number(tx.grossCommissionIncome ?? 0) : 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editForm.grossCommissionIncome, tx]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const previewReferralPct = useMemo(() => {
    if (editForm.referralPayoutPct) {
      const raw = parseFloat(editForm.referralPayoutPct);
      return isNaN(raw) ? null : raw;
    }
    return tx?.referralPayoutPct ? Number(tx.referralPayoutPct) * 100 : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editForm.referralPayoutPct, tx]);
  const { data: splitPreview, isLoading: splitPreviewLoading } = trpc.transactions.getCommissionPreview.useQuery(
    { agentId: previewAgentId, gci: previewGci, referralPayoutPct: previewReferralPct },
    { enabled: splitPreviewOpen && previewAgentId > 0 && previewGci > 0 }
  );

  const autoAmount = payoutForm.percentage && gci
    ? ((parseFloat(payoutForm.percentage) / 100) * gci).toFixed(2)
    : "";
  const contact = txData?.contact;
  const agent = txData?.agent;
  const property = txData?.property;
  const buyerContact = txData?.buyerContact;

  if (!tx) return <div className="p-6 text-muted-foreground">Loading...</div>;

  const totalPct = (payouts?.items ?? []).reduce((s, { payout: p }) => s + Number(p.percentage), 0);

  // Commission rate: stored as decimal (0.03 = 3%), display as percentage
  const displayCommissionRate = tx.commissionRate
    ? (Number(tx.commissionRate) < 1 ? (Number(tx.commissionRate) * 100).toFixed(2) : Number(tx.commissionRate).toFixed(2))
    : null;

  function openEditDialog() {
    if (!tx) return;
    setEditForm({
      transactionNumber: tx.transactionNumber ?? "",
      transactionType: tx.transactionType ?? "buyer",
      agentId: String(tx.agentId ?? ""),
      primaryContactId: String(tx.primaryContactId ?? ""),
      primaryContactName: contact ? `${contact.firstName} ${contact.lastName}` : "",
      propertyId: tx.propertyId ? String(tx.propertyId) : "",
      propertyName: property ? `${property.address}${property.city ? `, ${property.city}` : ""}` : "",
      purchasePrice: tx.purchasePrice ? Number(tx.purchasePrice).toLocaleString("en-US") : "",
      grossCommissionIncome: tx.grossCommissionIncome ? Number(tx.grossCommissionIncome).toLocaleString("en-US") : "",
      commissionRate: displayCommissionRate ?? "",
      commissionType: tx.commissionType ?? "percentage",
      contractDate: toDateInputValue(tx.contractDate),
      closingDate: toDateInputValue(tx.closingDate),
      notes: tx.notes ?? "",
      referralSourceName: tx.referralSourceName ?? "",
      referralPayoutPct: tx.referralPayoutPct ? String(Number(tx.referralPayoutPct) * 100) : "",
    });
    setEditContactSearch("");
    setEditPropertySearch("");
    setGciManuallyEdited(false);
    setEditOpen(true);
  }

  function handleEditSave() {
    if (!tx) return;
    const data: Record<string, any> = {};

    // Transaction number
    if (editForm.transactionNumber !== (tx.transactionNumber ?? "")) {
      data.transactionNumber = editForm.transactionNumber || null;
    }

    // Type
    if (editForm.transactionType !== tx.transactionType) {
      data.transactionType = editForm.transactionType;
    }

    // Agent
    if (editForm.agentId && Number(editForm.agentId) !== tx.agentId) {
      data.agentId = Number(editForm.agentId);
    }

    // Primary contact
    if (editForm.primaryContactId && Number(editForm.primaryContactId) !== tx.primaryContactId) {
      data.primaryContactId = Number(editForm.primaryContactId);
    }

    // Property
    const currentPropertyId = tx.propertyId ? String(tx.propertyId) : "";
    if (editForm.propertyId !== currentPropertyId) {
      data.propertyId = editForm.propertyId ? Number(editForm.propertyId) : null;
    }

    // Purchase price
    const rawPrice = parsePriceInput(editForm.purchasePrice);
    const currentPrice = tx.purchasePrice ? String(Number(tx.purchasePrice)) : "";
    if (rawPrice !== currentPrice) {
      data.purchasePrice = rawPrice || null;
    }

    // GCI
    const rawGci = parsePriceInput(editForm.grossCommissionIncome);
    const currentGci = tx.grossCommissionIncome ? String(Number(tx.grossCommissionIncome)) : "";
    if (rawGci !== currentGci) {
      data.grossCommissionIncome = rawGci || null;
    }

    // Commission rate (convert percentage to decimal for storage)
    const rawRate = editForm.commissionRate ? String(parseFloat(editForm.commissionRate) / 100) : null;
    const currentRate = tx.commissionRate ? String(Number(tx.commissionRate)) : null;
    if (rawRate !== currentRate) {
      data.commissionRate = rawRate;
    }

    // Commission type
    if (editForm.commissionType !== tx.commissionType) {
      data.commissionType = editForm.commissionType;
    }

    // Contract date
    const currentContractDate = toDateInputValue(tx.contractDate);
    if (editForm.contractDate !== currentContractDate) {
      data.contractDate = editForm.contractDate ? new Date(editForm.contractDate).toISOString() : null;
    }

    // Closing date
    const currentClosingDate = toDateInputValue(tx.closingDate);
    if (editForm.closingDate !== currentClosingDate) {
      data.closingDate = editForm.closingDate ? new Date(editForm.closingDate).toISOString() : null;
    }

    // Notes
    if (editForm.notes !== (tx.notes ?? "")) {
      data.notes = editForm.notes || null;
    }

    // Referral source name
    const currentReferralName = tx.referralSourceName ?? "";
    if (editForm.referralSourceName !== currentReferralName) {
      data.referralSourceName = editForm.referralSourceName || null;
    }

    // Referral payout %
    const rawReferralPct = editForm.referralPayoutPct ? parseFloat(editForm.referralPayoutPct) : null;
    const currentReferralPct = tx.referralPayoutPct ? Number(tx.referralPayoutPct) * 100 : null;
    if (rawReferralPct !== currentReferralPct) {
      data.referralPayoutPct = rawReferralPct != null ? rawReferralPct / 100 : null;
    }

    if (Object.keys(data).length === 0) {
      toast.info("No changes to save");
      setEditOpen(false);
      return;
    }

    updateTransaction.mutate({ id: txId, data });
  }

  // Handle file upload to S3
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) { toast.error("File must be under 16MB"); return; }
    if (docLabel === "other" && !docCustomLabel.trim()) { toast.error("Please enter a custom label"); return; }

    setDocUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("transactionId", String(txId));

      const res = await fetch("/api/upload/transaction-document", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { fileUrl, fileKey } = await res.json();

      await uploadDoc.mutateAsync({
        transactionId: txId,
        fileName: file.name,
        fileUrl,
        fileKey,
        mimeType: file.type,
        fileSize: file.size,
        label: docLabel as any,
        customLabel: docLabel === "other" ? docCustomLabel : null,
      });
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setDocUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ─── Bulk upload handlers ────────────────────────────────────────────────
  const addBulkFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    const valid = arr.filter(f => f.size <= 16 * 1024 * 1024);
    const oversized = arr.filter(f => f.size > 16 * 1024 * 1024);
    if (oversized.length) toast.error(`${oversized.length} file(s) skipped — max 16 MB each`);
    setBulkFiles(prev => [
      ...prev,
      ...valid.map(f => ({
        id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
        file: f,
        label: "other" as const,
        customLabel: "",
        status: "pending" as const,
      })),
    ]);
  }, []);

  function removeBulkFile(id: string) {
    setBulkFiles(prev => prev.filter(f => f.id !== id));
  }

  function setBulkFileLabel(id: string, label: BulkFile["label"]) {
    setBulkFiles(prev => prev.map(f => f.id === id ? { ...f, label } : f));
  }

  function setBulkFileCustomLabel(id: string, customLabel: string) {
    setBulkFiles(prev => prev.map(f => f.id === id ? { ...f, customLabel } : f));
  }

  async function handleBulkUploadSubmit() {
    if (!bulkFiles.length) return;
    // Validate custom labels
    const missingCustom = bulkFiles.filter(f => f.label === "other" && !f.customLabel.trim());
    if (missingCustom.length) {
      toast.error(`Please enter a custom label for ${missingCustom.length} file(s) marked as "Other"`);
      return;
    }
    setBulkUploading(true);
    setBulkFiles(prev => prev.map(f => ({ ...f, status: "uploading" as const })));
    try {
      // Upload all files to S3 in one multipart request
      const formData = new FormData();
      for (const bf of bulkFiles) formData.append("files", bf.file);
      const res = await fetch("/api/upload/transaction-documents-bulk", { method: "POST", body: formData });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? "Upload to S3 failed");
      }
      const { files: uploaded } = await res.json() as { files: Array<{ originalName: string; fileUrl: string; fileKey: string; mimeType: string; fileSize: number }> };
      // Map S3 results back to bulk file entries by index (order preserved)
      const fileMetas = bulkFiles.map((bf, i) => ({
        fileName: bf.file.name,
        fileUrl: uploaded[i].fileUrl,
        fileKey: uploaded[i].fileKey,
        mimeType: bf.file.type || null,
        fileSize: bf.file.size,
        label: bf.label,
        customLabel: bf.label === "other" ? bf.customLabel.trim() : null,
      }));
      await bulkUploadDocs.mutateAsync({ transactionId: txId, files: fileMetas });
      setBulkFiles(prev => prev.map(f => ({ ...f, status: "done" as const })));
    } catch (err: any) {
      setBulkFiles(prev => prev.map(f => ({ ...f, status: "error" as const, error: err.message ?? "Failed" })));
      toast.error(err.message ?? "Bulk upload failed");
    } finally {
      setBulkUploading(false);
    }
  }

  function formatFileSize(bytes: number | null) {
    if (!bytes) return "";
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  function getDocLabel(doc: any) {
    if (doc.label === "other" && doc.customLabel) return doc.customLabel;
    return DOCUMENT_LABELS.find(l => l.value === doc.label)?.label ?? doc.label;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/transactions")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>

      <PageHeader
        title={`${contact?.firstName ?? ""} ${contact?.lastName ?? ""}`.trim() || "Transaction"}
        subtitle={property?.address ? [formatStreet(property.address), formatCityStateZip(property.city, property.state, property.zip)].filter(Boolean).join(" · ") : "No property linked"}
        actions={
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={openEditDialog}>
                <Pencil className="h-4 w-4 mr-1" /> Edit
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => { setNewStatus(tx.status ?? "under_contract"); setStatusOpen(true); }}>Update Status</Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            )}
          </div>
        }
      />

      {/* Integrity Alert */}
      {tx.payoutIntegrityFlag && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">{tx.payoutIntegrityNote}</p>
        </div>
      )}

      {/* Termination Reason Banner */}
      {tx.status === "terminated" && (
        <div className="mb-4 p-4 bg-red-50 border border-red-300 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">Transaction Terminated</p>
              {tx.terminationReason ? (
                <p className="text-sm text-red-700 mt-1">
                  <span className="font-medium">Reason:</span> {tx.terminationReason}
                </p>
              ) : (
                <p className="text-sm text-red-600/70 mt-1 italic">No termination reason was provided.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Combined Summary */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Transaction Summary</CardTitle>
                {isAdmin && (
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={openEditDialog}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {/* Contact */}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Contact</p>
                <p
                  className="font-semibold text-base cursor-pointer hover:text-primary transition-colors"
                  onClick={() => navigate(`/contacts/${contact?.id}`)}
                >
                  {contact?.firstName} {contact?.lastName}
                </p>
                {contact?.email && <p className="text-muted-foreground text-xs mt-0.5">{formatEmail(contact.email)}</p>}
                {contact?.phone && <p className="text-muted-foreground text-xs">{formatPhone(contact.phone)}</p>}
              </div>

              {/* Property */}
              {property && (
                <>
                  <div className="border-t pt-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Property</p>
                    <p
                      className="font-medium cursor-pointer hover:text-primary transition-colors"
                      onClick={() => navigate(`/properties/${property.id}`)}
                    >
                      {formatStreet(property.address)}
                    </p>
                    {(property.city || property.state || property.zip) && (
                      <p className="text-muted-foreground text-xs mt-0.5">
                        {formatCityStateZip(property.city, property.state, property.zip)}
                      </p>
                    )}
                    {property.propertyType && (
                      <p className="text-muted-foreground text-xs capitalize">{property.propertyType.replace(/_/g, " ")}</p>
                    )}
                  </div>
                </>
              )}

              {/* Transaction Details */}
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Details</p>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><TransactionStatusBadge status={tx.status} /></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="capitalize">{tx.transactionType}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Agent</span><span>{agent?.name ?? "—"}</span></div>
                {tx.purchasePrice && <div className="flex justify-between"><span className="text-muted-foreground">Purchase Price</span><span className="font-semibold">${Number(tx.purchasePrice).toLocaleString()}</span></div>}
                {tx.grossCommissionIncome && <div className="flex justify-between"><span className="text-muted-foreground">GCI</span><span className="font-semibold text-emerald-700">${Number(tx.grossCommissionIncome).toLocaleString()}</span></div>}
                {displayCommissionRate && <div className="flex justify-between"><span className="text-muted-foreground">Commission Rate</span><span>{displayCommissionRate}%</span></div>}
                {tx.commissionType && <div className="flex justify-between"><span className="text-muted-foreground">Commission Type</span><span className="capitalize">{tx.commissionType}</span></div>}
                {tx.contractDate && <div className="flex justify-between"><span className="text-muted-foreground">Contract Date</span><span>{safeFormat(tx.contractDate, "MMM d, yyyy")}</span></div>}
                {tx.closingDate && <div className="flex justify-between"><span className="text-muted-foreground">Closing Date</span><span>{safeFormat(tx.closingDate, "MMM d, yyyy")}</span></div>}
                {(tx as any).referralSourceName && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Referral Source</span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">Referral</span>
                      {(tx as any).referralSourceName}
                      {(tx as any).referralPayoutPct && <span className="text-xs text-muted-foreground">({(Number((tx as any).referralPayoutPct) * 100).toFixed(1)}%)</span>}
                    </span>
                  </div>
                )}
              </div>

              {tx.notes && (
                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{tx.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
          {/* Buyer Side Card — shown for dual agency or when buyer fields exist */}
          {(buyerContact || tx.transactionType === "dual") && (
            <Card className="border-blue-200 bg-blue-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-blue-700 uppercase tracking-wide flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Buyer Side
                  </span>
                  {(isAdmin || isAgent) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                      onClick={openBuyerEditDialog}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {/* Buyer Contact */}
                {buyerContact && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Buyer</p>
                    <p
                      className="font-semibold text-base cursor-pointer hover:text-primary transition-colors"
                      onClick={() => navigate(`/contacts/${buyerContact.id}`)}
                    >
                      {buyerContact.firstName} {buyerContact.lastName}
                    </p>
                    {buyerContact.email && <p className="text-muted-foreground text-xs mt-0.5">{formatEmail(buyerContact.email)}</p>}
                    {buyerContact.phone && <p className="text-muted-foreground text-xs">{formatPhone(buyerContact.phone)}</p>}
                  </div>
                )}

                {/* Buyer Commission */}
                {(tx.buyerCommissionRate || tx.buyerCommissionType) && (
                  <div className="border-t border-blue-100 pt-3 space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Buyer Commission</p>
                    {tx.buyerCommissionType && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Type</span>
                        <span className="capitalize">{tx.buyerCommissionType}</span>
                      </div>
                    )}
                    {tx.buyerCommissionRate && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {tx.buyerCommissionType === "flat" ? "Amount" : "Rate"}
                        </span>
                        <span className="font-semibold text-blue-700">
                          {tx.buyerCommissionType === "flat"
                            ? `$${Number(tx.buyerCommissionRate).toLocaleString()}`
                            : `${(Number(tx.buyerCommissionRate) < 1 ? Number(tx.buyerCommissionRate) * 100 : Number(tx.buyerCommissionRate)).toFixed(2)}%`
                          }
                        </span>
                      </div>
                    )}
                    {tx.buyerCommissionRate && tx.grossCommissionIncome && tx.buyerCommissionType !== "flat" && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Est. Amount</span>
                        <span className="font-semibold text-emerald-700">
                          ${((Number(tx.buyerCommissionRate) < 1 ? Number(tx.buyerCommissionRate) : Number(tx.buyerCommissionRate) / 100) * Number(tx.grossCommissionIncome)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Buyer Notes */}
                {tx.buyerNotes && (
                  <div className="border-t border-blue-100 pt-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Buyer Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{tx.buyerNotes}</p>
                  </div>
                )}

                {/* Empty state for dual agency without buyer contact yet */}
                {!buyerContact && tx.transactionType === "dual" && (
                  <div className="text-center py-3">
                    <p className="text-sm text-muted-foreground">No buyer contact linked yet.</p>
                    {(isAdmin || isAgent) && (
                      <Button variant="outline" size="sm" className="mt-2" onClick={openBuyerEditDialog}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Buyer Info
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Buyer Side Edit Dialog */}
          <Dialog open={buyerEditOpen} onOpenChange={setBuyerEditOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Edit Buyer Side</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {/* Buyer Contact */}
                <div>
                  <Label>Buyer Contact</Label>
                  {buyerEditForm.buyerContactId && buyerEditForm.buyerContactName ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">{buyerEditForm.buyerContactName}</Badge>
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setBuyerEditForm({ ...buyerEditForm, buyerContactId: null, buyerContactName: "" })}
                      >
                        Change
                      </button>
                      <button
                        className="text-xs text-red-500 hover:text-red-700"
                        onClick={() => setBuyerEditForm({ ...buyerEditForm, buyerContactId: null, buyerContactName: "" })}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          placeholder="Search contacts by name or email..."
                          value={buyerContactSearch}
                          onChange={(e) => setBuyerContactSearch(e.target.value)}
                        />
                      </div>
                      {buyerContactSearch.length > 1 && (buyerContactResults as any[]).length > 0 && (
                        <div className="border rounded-md mt-1 max-h-36 overflow-y-auto bg-background shadow-sm">
                          {(buyerContactResults as any[]).slice(0, 8).map((c: any) => (
                            <button key={c.contact.id}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50"
                              onClick={() => {
                                setBuyerEditForm({
                                  ...buyerEditForm,
                                  buyerContactId: c.contact.id,
                                  buyerContactName: `${c.contact.firstName} ${c.contact.lastName}`,
                                });
                                setBuyerContactSearch("");
                              }}
                            >
                              {c.contact.firstName} {c.contact.lastName}
                              {c.contact.email ? ` — ${c.contact.email}` : ""}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Buyer Commission Type */}
                <div>
                  <Label>Commission Type</Label>
                  <Select
                    value={buyerEditForm.buyerCommissionType}
                    onValueChange={(v) => setBuyerEditForm({ ...buyerEditForm, buyerCommissionType: v as "percentage" | "flat" })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="flat">Flat Amount ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Buyer Commission Rate */}
                <div>
                  <Label>
                    {buyerEditForm.buyerCommissionType === "flat" ? "Commission Amount ($)" : "Commission Rate (%)"}
                  </Label>
                  <Input
                    className="mt-1"
                    type="number"
                    step="0.01"
                    placeholder={buyerEditForm.buyerCommissionType === "flat" ? "e.g. 5000" : "e.g. 3"}
                    value={buyerEditForm.buyerCommissionRate}
                    onChange={(e) => {
                      const rate = e.target.value;
                      // Auto-calc buyer GCI if not manually edited and type is percentage
                      if (!buyerEditForm.buyerGciManuallyEdited && buyerEditForm.buyerCommissionType === "percentage" && tx.purchasePrice) {
                        const price = Number(tx.purchasePrice);
                        const r = parseFloat(rate);
                        if (!isNaN(price) && !isNaN(r) && price > 0 && r > 0) {
                          const autoGci = (price * r / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
                          setBuyerEditForm({ ...buyerEditForm, buyerCommissionRate: rate, buyerGci: autoGci });
                          return;
                        }
                      }
                      setBuyerEditForm({ ...buyerEditForm, buyerCommissionRate: rate });
                    }}
                  />
                </div>

                {/* Buyer GCI */}
                <div>
                  <Label className="flex items-center gap-2">
                    Buyer GCI (Gross Commission Income)
                    {buyerEditForm.buyerGciManuallyEdited && (
                      <span className="text-xs text-amber-600 font-normal">(manually set)</span>
                    )}
                  </Label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      className="pl-6"
                      placeholder="e.g. 9,000"
                      value={buyerEditForm.buyerGci}
                      onChange={(e) => {
                        const raw = parseCurrencyInput(e.target.value);
                        setBuyerEditForm({
                          ...buyerEditForm,
                          buyerGci: raw ? Number(raw).toLocaleString("en-US") : "",
                          buyerGciManuallyEdited: true,
                        });
                      }}
                    />
                  </div>
                  {buyerEditForm.buyerGciManuallyEdited && buyerEditForm.buyerCommissionType === "percentage" && buyerEditForm.buyerCommissionRate && tx.purchasePrice && (() => {
                    const price = Number(tx.purchasePrice);
                    const r = parseFloat(buyerEditForm.buyerCommissionRate);
                    if (!isNaN(price) && !isNaN(r) && price > 0 && r > 0) {
                      const autoGci = price * r / 100;
                      return (
                        <button
                          type="button"
                          className="mt-1 text-xs text-blue-600 hover:underline flex items-center gap-1"
                          onClick={() => setBuyerEditForm(f => ({ ...f, buyerGci: autoGci.toLocaleString("en-US", { maximumFractionDigits: 2 }), buyerGciManuallyEdited: false }))}
                        >
                          ↺ Recalculate: ${autoGci.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                        </button>
                      );
                    }
                    return null;
                  })()}
                </div>

                {/* Buyer Notes */}
                <div>
                  <Label>Buyer Notes</Label>
                  <Textarea
                    className="mt-1"
                    rows={3}
                    placeholder="Notes about the buyer side of this transaction..."
                    value={buyerEditForm.buyerNotes}
                    onChange={(e) => setBuyerEditForm({ ...buyerEditForm, buyerNotes: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBuyerEditOpen(false)}>Cancel</Button>
                <Button onClick={handleBuyerEditSave} disabled={updateBuyerSide.isPending}>
                  {updateBuyerSide.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Right: Tabs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="payouts">
            <TabsList className="mb-4 flex-wrap h-auto gap-1">
              <TabsTrigger value="payouts">Commission Payouts</TabsTrigger>
              <TabsTrigger value="documents">Documents{documents && documents.length > 0 && <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-primary/10 text-primary text-xs font-medium">{documents.length}</span>}</TabsTrigger>
              <TabsTrigger value="notes">Notes{notes && notes.length > 0 && <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-primary/10 text-primary text-xs font-medium">{notes.length}</span>}</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            {/* Payouts Tab */}
            <TabsContent value="payouts">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold">Payout Items</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${totalPct > 100 ? "bg-red-100 text-red-700" : totalPct === 100 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                    {totalPct.toFixed(1)}% allocated
                  </span>
                  {payouts?.valid ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-red-500" />}
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => recalculateSplits.mutate({ id: txId })}
                      disabled={recalculateSplits.isPending}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${recalculateSplits.isPending ? "animate-spin" : ""}`} />
                      Re-calculate Splits
                    </Button>
                  )}
                  {isAgent && (
                    <Button variant="outline" size="sm" onClick={() => setExceptionOpen(true)}>
                      Request Exception
                    </Button>
                  )}
                </div>
              </div>

              {!payouts?.items || payouts.items.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
                  <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No payout items yet. Add commission splits or click Re-calculate Splits.
                </CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {payouts.items.map(({ payout }) => (
                    <Card key={payout.id} className={(payout as any).isOverride ? "border-amber-400" : ""}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium capitalize">{payout.payeeName ?? (payout.payeeType?.replace(/_/g, " ") ?? "—")}</p>
                            {(payout as any).isAutoGenerated && !((payout as any).isOverride) && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">Auto</span>
                            )}
                            {(payout as any).isOverride && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Override</span>
                            )}
                            {payout.payeeType === "referral_partner" && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">Referral</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-muted-foreground capitalize">{payout.payeeType?.replace(/_/g, " ") ?? "—"}</p>
                            {payout.referralFeePaidBy && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                                Ref fee: {payout.referralFeePaidBy === "savvy" ? "Savvy pays" : payout.referralFeePaidBy === "agent" ? "Agent pays" : payout.referralFeePaidBy === "group_leader" ? "GL pays" : "Split"}
                              </span>
                            )}
                          </div>
                          {(payout as any).overrideNote && <p className="text-xs text-amber-700 mt-0.5 italic">{(payout as any).overrideNote}</p>}
                          {payout.notes && !((payout as any).overrideNote) && <p className="text-xs text-muted-foreground mt-0.5">{payout.notes}</p>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-foreground">{Number(payout.percentage).toFixed(1)}%</span>
                          {payout.amount && <span className="text-sm text-emerald-700 font-semibold">${Number(payout.amount).toLocaleString()}</span>}
                          {payout.isPaid ? (
                            <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Paid</span>
                          ) : (
                            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => markPaid.mutate({ id: payout.id, transactionId: txId, data: { isPaid: true, paidDate: new Date().toISOString() } })}>
                              Mark Paid
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-7 px-2"
                              onClick={() => {
                                setOverrideItem({ id: payout.id, payeeName: payout.payeeName ?? "", percentage: String(payout.percentage), amount: String(payout.amount ?? ""), notes: payout.notes ?? "" });
                                setOverrideForm({ percentage: String(payout.percentage), amount: String(payout.amount ?? ""), note: (payout as any).overrideNote ?? "" });
                                setOverrideOpen(true);
                              }}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Admin Override Dialog */}
              <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Override Payout: {overrideItem?.payeeName}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                      Overriding this payout item will flag it as manually adjusted. It will not be replaced when Re-calculate Splits is run.
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Percentage (%)</Label>
                        <Input
                          className="mt-1"
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={overrideForm.percentage}
                          onChange={e => setOverrideForm(f => ({ ...f, percentage: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Amount ($)</Label>
                        <Input
                          className="mt-1"
                          type="number"
                          min={0}
                          step={0.01}
                          value={overrideForm.amount}
                          onChange={e => setOverrideForm(f => ({ ...f, amount: e.target.value }))}
                          placeholder={overrideForm.percentage && gci ? ((parseFloat(overrideForm.percentage) / 100) * gci).toFixed(2) : ""}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Override Note (reason)</Label>
                      <Textarea
                        className="mt-1 text-sm"
                        rows={2}
                        value={overrideForm.note}
                        onChange={e => setOverrideForm(f => ({ ...f, note: e.target.value }))}
                        placeholder="e.g. Adjusted per broker agreement dated..."
                      />
                    </div>
                  </div>
                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => setOverrideOpen(false)}>Cancel</Button>
                    <Button
                      variant="outline"
                      className="text-amber-700 border-amber-300"
                      onClick={() => overrideItem && updatePayoutOverride.mutate({
                        payoutItemId: overrideItem.id,
                        isOverride: false,
                        overrideNote: undefined,
                      })}
                      disabled={updatePayoutOverride.isPending}
                    >
                      Clear Override
                    </Button>
                    <Button
                      onClick={() => {
                        if (!overrideItem) return;
                        const pct = parseFloat(overrideForm.percentage);
                        if (isNaN(pct) || pct < 0 || pct > 100) { toast.error("Percentage must be 0–100"); return; }
                        // Validate total won't exceed 100% after this override
                        const otherPcts = (payouts?.items ?? [])
                          .filter(({ payout: p }) => p.id !== overrideItem.id)
                          .reduce((s, { payout: p }) => s + Number(p.percentage), 0);
                        if (otherPcts + pct > 100.01) {
                          toast.error(`Override would bring total to ${(otherPcts + pct).toFixed(1)}% — exceeds 100%. Reduce other payouts first.`);
                          return;
                        }
                        updatePayoutOverride.mutate({
                          payoutItemId: overrideItem.id,
                          percentage: pct,
                          amount: overrideForm.amount ? parseFloat(overrideForm.amount) : undefined,
                          overrideNote: overrideForm.note || undefined,
                          isOverride: true,
                        });
                      }}
                      disabled={updatePayoutOverride.isPending}
                    >
                      Save Override
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents">
              <div className="space-y-4">

                {/* ── Bulk Upload Card ─────────────────────────────────────── */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">Upload Documents</CardTitle>
                      {bulkFiles.length > 0 && (
                        <span className="text-xs text-muted-foreground">{bulkFiles.length} file{bulkFiles.length !== 1 ? "s" : ""} queued</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">

                    {/* Drag-and-drop zone */}
                    <div
                      className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                        bulkDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
                      }`}
                      onClick={() => bulkFileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setBulkDragOver(true); }}
                      onDragLeave={() => setBulkDragOver(false)}
                      onDrop={e => {
                        e.preventDefault();
                        setBulkDragOver(false);
                        if (e.dataTransfer.files.length) addBulkFiles(e.dataTransfer.files);
                      }}
                    >
                      <input
                        ref={bulkFileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls"
                        onChange={e => { if (e.target.files?.length) { addBulkFiles(e.target.files); e.target.value = ""; } }}
                      />
                      <FolderOpen className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                      <p className="text-sm font-medium text-foreground/70">
                        {bulkDragOver ? "Drop files here" : "Drag & drop files, or click to browse"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">PDF, Word, Excel, or images · up to 16 MB each · up to 20 files at once</p>
                    </div>

                    {/* Queued file list with per-file label picker */}
                    {bulkFiles.length > 0 && (
                      <div className="space-y-2">
                        {bulkFiles.map(bf => (
                          <div key={bf.id} className="flex items-start gap-2 p-2 rounded-lg border bg-muted/20">
                            {/* Status icon */}
                            <div className="mt-1 shrink-0">
                              {bf.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                              {bf.status === "error" && <AlertTriangle className="h-4 w-4 text-red-500" />}
                              {bf.status === "uploading" && <Loader2 className="h-4 w-4 text-primary animate-spin" />}
                              {bf.status === "pending" && <FileText className="h-4 w-4 text-muted-foreground" />}
                            </div>
                            {/* File info + label */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{bf.file.name}</p>
                              <p className="text-xs text-muted-foreground">{formatFileSize(bf.file.size)}</p>
                              {bf.status === "error" && <p className="text-xs text-red-500 mt-0.5">{bf.error}</p>}
                              {bf.status === "pending" && (
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  <Select
                                    value={bf.label}
                                    onValueChange={val => setBulkFileLabel(bf.id, val as BulkFile["label"])}
                                  >
                                    <SelectTrigger className="h-7 text-xs w-44">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {DOCUMENT_LABELS.map(l => (
                                        <SelectItem key={l.value} value={l.value} className="text-xs">{l.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {bf.label === "other" && (
                                    <Input
                                      className="h-7 text-xs w-44"
                                      placeholder="Custom label..."
                                      value={bf.customLabel}
                                      onChange={e => setBulkFileCustomLabel(bf.id, e.target.value)}
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                            {/* Remove button */}
                            {bf.status === "pending" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 shrink-0 mt-0.5"
                                onClick={() => removeBulkFile(bf.id)}
                                title="Remove"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        ))}

                        {/* Action row */}
                        <div className="flex items-center justify-between pt-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => setBulkFiles([])}
                            disabled={bulkUploading}
                          >
                            Clear all
                          </Button>
                          <Button
                            onClick={handleBulkUploadSubmit}
                            disabled={bulkUploading || bulkFiles.every(f => f.status !== "pending")}
                            size="sm"
                          >
                            {bulkUploading ? (
                              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
                            ) : (
                              <><Upload className="h-4 w-4 mr-2" />Upload {bulkFiles.filter(f => f.status === "pending").length} File{bulkFiles.filter(f => f.status === "pending").length !== 1 ? "s" : ""}</>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Single-file fallback (legacy) */}
                    <details className="group">
                      <summary className="text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
                        Upload a single file with a pre-set label
                      </summary>
                      <div className="mt-2 space-y-2 pl-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Document Type</Label>
                            <Select value={docLabel} onValueChange={setDocLabel}>
                              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {DOCUMENT_LABELS.map(l => (
                                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {docLabel === "other" && (
                            <div>
                              <Label className="text-xs">Custom Label *</Label>
                              <Input className="mt-1 h-8 text-xs" value={docCustomLabel} onChange={e => setDocCustomLabel(e.target.value)} placeholder="e.g. Survey, Title Commitment..." />
                            </div>
                          )}
                        </div>
                        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls" />
                        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={docUploading} className="border-dashed text-xs">
                          <Upload className="h-3.5 w-3.5 mr-1.5" />
                          {docUploading ? "Uploading..." : "Choose Single File"}
                        </Button>
                      </div>
                    </details>

                  </CardContent>
                </Card>

                {/* Document list */}
                {!documents || documents.length === 0 ? (
                  <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No documents uploaded yet.
                  </CardContent></Card>
                ) : (
                  <div className="space-y-2">
                    {documents.map((row: any) => {
                      const d = row.doc ?? row;
                      return (
                        <Card key={d.id}>
                          <CardContent className="p-4 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                {renameDocId === d.id ? (
                                  <div className="flex items-center gap-2">
                                    <Input
                                      value={renameDocName}
                                      onChange={e => setRenameDocName(e.target.value)}
                                      className="h-7 text-sm w-64"
                                      onKeyDown={e => { if (e.key === "Enter" && renameDocName.trim()) renameDoc.mutate({ id: d.id, fileName: renameDocName.trim() }); if (e.key === "Escape") setRenameDocId(null); }}
                                      autoFocus
                                    />
                                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { if (renameDocName.trim()) renameDoc.mutate({ id: d.id, fileName: renameDocName.trim() }); }}>
                                      Save
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setRenameDocId(null)}>Cancel</Button>
                                  </div>
                                ) : (
                                  <span className="text-sm font-medium truncate block">{d.fileName}</span>
                                )}
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded">{getDocLabel(d)}</span>
                                  {d.fileSize && <span className="text-xs text-muted-foreground">{formatFileSize(d.fileSize)}</span>}
                                  <span className="text-xs text-muted-foreground">{safeFormat(d.createdAt, "MMM d, yyyy")}</span>
                                  {row.uploader && <span className="text-xs text-muted-foreground">by {row.uploader.name}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button size="sm" variant="ghost" title="View" onClick={() => window.open(d.fileUrl, "_blank")}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" title="Download" onClick={() => {
                                const a = document.createElement("a");
                                a.href = d.fileUrl;
                                a.download = d.fileName;
                                a.target = "_blank";
                                a.click();
                              }}>
                                <Download className="h-4 w-4" />
                              </Button>
                              {isAdmin && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => { setRenameDocId(d.id); setRenameDocName(d.fileName); }}>
                                      <Pencil className="h-4 w-4 mr-2" /> Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-red-600" onClick={() => deleteDoc.mutate({ id: d.id })}>
                                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Notes Tab */}
            <TabsContent value="notes">
              <div className="space-y-4">
                {/* Add note */}
                <Card>
                  <CardContent className="pt-4 space-y-3">
                    <Textarea
                      value={noteContent}
                      onChange={e => setNoteContent(e.target.value)}
                      placeholder="Add a note about this transaction..."
                      rows={3}
                    />
                    <Button
                      size="sm"
                      onClick={() => addNote.mutate({ transactionId: txId, content: noteContent })}
                      disabled={!noteContent.trim() || addNote.isPending}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {addNote.isPending ? "Adding..." : "Add Note"}
                    </Button>
                  </CardContent>
                </Card>

                {/* Notes list */}
                {!notes || notes.length === 0 ? (
                  <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No notes yet.
                  </CardContent></Card>
                ) : (
                  <div className="space-y-2">
                    {notes.map((row: any) => (
                      <Card key={row.note?.id ?? row.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">{row.author?.name ?? row.note?.authorName ?? "Unknown"}</span>
                            <span className="text-xs text-muted-foreground">{safeFormat(row.note?.createdAt ?? row.createdAt, "MMM d, yyyy h:mm a")}</span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{row.note?.content ?? row.content}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Tasks Tab */}
            <TabsContent value="tasks">
              {!tasks || tasks.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No tasks for this transaction</CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {tasks.map(({ task }) => (
                    <Card key={task.id}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{task.title}</p>
                          {task.dueDate && <p className="text-xs text-muted-foreground">Due {safeFormat(task.dueDate, "MMM d, yyyy")}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <PriorityBadge priority={task.priority} />
                          <span className={`text-xs px-2 py-0.5 rounded-full ${task.status === "completed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{task.status}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity">
              {!comms || comms.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No activity logged</CardContent></Card>
              ) : (
                <div className="space-y-3">
                  {comms.map(({ communication }) => (
                    <Card key={communication.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium capitalize bg-muted px-2 py-0.5 rounded">{communication.type}</span>
                          <span className="text-xs text-muted-foreground">{safeFormat(communication.communicatedAt, "MMM d, h:mm a")}</span>
                        </div>
                        <p className="text-sm">{communication.body}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* History / Audit Tab */}
            <TabsContent value="history">
              <TransactionHistoryTabContent transactionId={txId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Status Dialog */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Transaction Status</DialogTitle></DialogHeader>
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["under_contract","closed","terminated"].map((s) => (
                <SelectItem key={s} value={s}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>Cancel</Button>
            <Button onClick={handleStatusUpdate} disabled={updateStatus.isPending}>
              {updateStatus.isPending ? "Updating..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Termination Reason Dialog */}
      <Dialog open={terminationReasonOpen} onOpenChange={(o) => { if (!o) { setTerminationReasonOpen(false); setTerminationReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Termination Reason</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Please provide a reason for terminating this transaction. This will be saved as a note on the transaction.</p>
          <Textarea
            value={terminationReason}
            onChange={(e) => setTerminationReason(e.target.value)}
            placeholder="e.g. Buyer financing fell through, seller withdrew from agreement..."
            rows={4}
            className="mt-2"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTerminationReasonOpen(false); setTerminationReason(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleTerminationConfirm}
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending ? "Terminating..." : "Confirm Termination"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Transaction Dialog ─────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Transaction Number */}
            <div>
              <Label>Transaction Number</Label>
              <Input
                className="mt-1"
                value={editForm.transactionNumber ?? ""}
                onChange={(e) => setEditForm({ ...editForm, transactionNumber: e.target.value })}
                placeholder="TXN-..."
              />
            </div>

            {/* Type & Agent */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Transaction Type *</Label>
                <Select value={editForm.transactionType ?? "buyer"} onValueChange={(v) => setEditForm({ ...editForm, transactionType: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buyer">Buyer</SelectItem>
                    <SelectItem value="seller">Seller</SelectItem>
                    <SelectItem value="dual">Dual (Both Sides)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Agent *</Label>
                <Select value={editForm.agentId ?? ""} onValueChange={(v) => setEditForm({ ...editForm, agentId: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select agent" /></SelectTrigger>
                  <SelectContent>
                    {(allAgents ?? []).filter((a: any) => a.role === "agent" || a.role === "admin").map((a: any) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name ?? `User #${a.id}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Primary Contact */}
            <div>
              <Label>Primary Contact *</Label>
              {editForm.primaryContactId && editForm.primaryContactName ? (
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">{editForm.primaryContactName}</Badge>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setEditForm({ ...editForm, primaryContactId: "", primaryContactName: "" })}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="mt-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search contacts by name or email..."
                      value={editContactSearch}
                      onChange={(e) => setEditContactSearch(e.target.value)}
                    />
                  </div>
                  {editContactSearch.length > 1 && (editContacts as any[]).length > 0 && (
                    <div className="border rounded-md mt-1 max-h-36 overflow-y-auto bg-background shadow-sm">
                      {(editContacts as any[]).slice(0, 8).map((c: any) => (
                        <button key={c.contact.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50"
                          onClick={() => {
                            setEditForm({
                              ...editForm,
                              primaryContactId: String(c.contact.id),
                              primaryContactName: `${c.contact.firstName} ${c.contact.lastName}`,
                            });
                            setEditContactSearch("");
                          }}
                        >
                          {c.contact.firstName} {c.contact.lastName}
                          {c.contact.email ? ` — ${c.contact.email}` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Property */}
            <div>
              <Label>Property</Label>
              {editForm.propertyId && editForm.propertyName ? (
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">{editForm.propertyName}</Badge>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setEditForm({ ...editForm, propertyId: "", propertyName: "" })}
                  >
                    Change
                  </button>
                  <button
                    className="text-xs text-red-500 hover:text-red-700"
                    onClick={() => setEditForm({ ...editForm, propertyId: "", propertyName: "" })}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="mt-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search properties by address..."
                      value={editPropertySearch}
                      onChange={(e) => setEditPropertySearch(e.target.value)}
                    />
                  </div>
                  {editPropertySearch.length > 1 && (editProperties as any[]).length > 0 && (
                    <div className="border rounded-md mt-1 max-h-36 overflow-y-auto bg-background shadow-sm">
                      {(editProperties as any[]).slice(0, 8).map((p: any) => (
                        <button key={p.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50"
                          onClick={() => {
                            setEditForm({
                              ...editForm,
                              propertyId: String(p.id),
                              propertyName: [formatStreet(p.address), formatCityStateZip(p.city, p.state, p.zip)].filter(Boolean).join(", "),
                            });
                            setEditPropertySearch("");
                          }}
                        >
                          {formatStreet(p.address)}{p.city ? `, ${formatCityStateZip(p.city, p.state, p.zip)}` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Financial */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Purchase Price</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    className="pl-6"
                    placeholder="500,000"
                    value={editForm.purchasePrice ?? ""}
                    onChange={(e) => {
                      const raw = parsePriceInput(e.target.value);
                      const formatted = raw ? Number(raw).toLocaleString("en-US") : "";
                      // Auto-calculate GCI if not manually overridden and commission type is percentage
                      if (!gciManuallyEdited && editForm.commissionType === "percentage" && editForm.commissionRate) {
                        const price = parseFloat(raw || "0");
                        const rate = parseFloat(editForm.commissionRate);
                        if (!isNaN(price) && !isNaN(rate) && price > 0 && rate > 0) {
                          const autoGci = (price * rate / 100);
                          setEditForm(f => ({ ...f, purchasePrice: formatted, grossCommissionIncome: autoGci.toLocaleString("en-US", { maximumFractionDigits: 2 }) }));
                          return;
                        }
                      }
                      setEditForm(f => ({ ...f, purchasePrice: formatted }));
                    }}
                  />
                </div>
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  GCI (Gross Commission Income)
                  {gciManuallyEdited && (
                    <span className="text-xs text-amber-600 font-normal">(manually set)</span>
                  )}
                </Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    className="pl-6"
                    placeholder="15,000"
                    value={editForm.grossCommissionIncome ?? ""}
                    onChange={(e) => {
                      const raw = parsePriceInput(e.target.value);
                      setGciManuallyEdited(true);
                      setEditForm(f => ({ ...f, grossCommissionIncome: raw ? Number(raw).toLocaleString("en-US") : "" }));
                    }}
                  />
                </div>
                {/* Recalculate button shown when GCI was manually edited and we can auto-compute */}
                {gciManuallyEdited && editForm.commissionType === "percentage" && editForm.commissionRate && editForm.purchasePrice && (() => {
                  const price = parseFloat(parsePriceInput(editForm.purchasePrice) || "0");
                  const rate = parseFloat(editForm.commissionRate);
                  if (!isNaN(price) && !isNaN(rate) && price > 0 && rate > 0) {
                    const autoGci = (price * rate / 100);
                    return (
                      <button
                        type="button"
                        className="mt-1 text-xs text-blue-600 hover:underline flex items-center gap-1"
                        onClick={() => {
                          setEditForm(f => ({ ...f, grossCommissionIncome: autoGci.toLocaleString("en-US", { maximumFractionDigits: 2 }) }));
                          setGciManuallyEdited(false);
                        }}
                      >
                        ↺ Recalculate: ${autoGci.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      </button>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Commission Type</Label>
                <Select value={editForm.commissionType ?? "percentage"} onValueChange={(v) => {
                  setEditForm(f => ({ ...f, commissionType: v }));
                  // When switching to percentage, re-enable auto-calculation
                  if (v !== "percentage") setGciManuallyEdited(true);
                }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="flat">Flat ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Commission Rate (%)</Label>
                <Input
                  className="mt-1"
                  placeholder="e.g. 3"
                  value={editForm.commissionRate ?? ""}
                  onChange={(e) => {
                    const rate = e.target.value.replace(/[^0-9.]/g, "");
                    // Auto-calculate GCI if not manually overridden and commission type is percentage
                    if (!gciManuallyEdited && editForm.commissionType === "percentage" && editForm.purchasePrice) {
                      const price = parseFloat(parsePriceInput(editForm.purchasePrice) || "0");
                      const r = parseFloat(rate);
                      if (!isNaN(price) && !isNaN(r) && price > 0 && r > 0) {
                        const autoGci = (price * r / 100);
                        setEditForm(f => ({ ...f, commissionRate: rate, grossCommissionIncome: autoGci.toLocaleString("en-US", { maximumFractionDigits: 2 }) }));
                        return;
                      }
                    }
                    setEditForm(f => ({ ...f, commissionRate: rate }));
                  }}
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Contract Date</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={editForm.contractDate ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, contractDate: e.target.value })}
                />
              </div>
              <div>
                <Label>Closing Date</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={editForm.closingDate ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, closingDate: e.target.value })}
                />
              </div>
            </div>

            {/* Referral */}
            <div className="border rounded-lg p-3 space-y-3 bg-amber-50/40 dark:bg-amber-950/20">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Referral (optional)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Referral Source Name</Label>
                  <Input
                    className="mt-1"
                    value={editForm.referralSourceName ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, referralSourceName: e.target.value })}
                    placeholder="e.g. John Smith"
                  />
                </div>
                <div>
                  <Label>Referral Payout %</Label>
                  <div className="relative mt-1">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={editForm.referralPayoutPct ?? ""}
                      onChange={(e) => setEditForm({ ...editForm, referralPayoutPct: e.target.value })}
                      placeholder="e.g. 25"
                      className="pr-6"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                  </div>
                </div>
              </div>
              {editForm.referralPayoutPct && parseFloat(editForm.referralPayoutPct) > 0 && gci > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Referral amount: <span className="font-semibold">${(gci * parseFloat(editForm.referralPayoutPct) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  {" "}&mdash; deducted from Savvy first (20% floor), then Group Leader, then Agent.
                </p>
              )}
            </div>

            {/* Notes */}
            <div>
              <Label>Notes</Label>
              <Textarea
                className="mt-1"
                rows={3}
                value={editForm.notes ?? ""}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Internal notes about this transaction..."
              />
            </div>
          </div>
          {/* Commission Split Preview */}
          <div className="border rounded-lg overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium"
              onClick={() => setSplitPreviewOpen(v => !v)}
            >
              <span className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-600" />
                Commission Split Preview
                {previewGci > 0 && (
                  <span className="text-xs text-muted-foreground font-normal">GCI: ${previewGci.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">{splitPreviewOpen ? "▲ Hide" : "▼ Show"}</span>
            </button>
            {splitPreviewOpen && (
              <div className="p-3 space-y-2 bg-background">
                {splitPreviewLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Calculating splits…
                  </div>
                ) : !splitPreview ? (
                  <p className="text-sm text-muted-foreground py-2">Enter a GCI amount above to preview splits.</p>
                ) : (splitPreview as any).skipped ? (
                  <div className="flex items-center gap-2 text-sm text-amber-600 py-1">
                    <AlertTriangle className="h-4 w-4" />
                    {(splitPreview as any).skipReason}
                  </div>
                ) : (
                  <>
                    {(splitPreview as any).flagForReview && (
                      <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded p-2">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {(splitPreview as any).flagReason}
                      </div>
                    )}
                    <div className="space-y-1.5">
                      {((splitPreview as any).payouts ?? []).map((p: any, i: number) => {
                        const payeeLabel = p.payeeType === "agent" ? ((splitPreview as any).agentName ?? "Agent")
                          : p.payeeType === "savvy_str_agents" ? "Savvy STR Agents"
                          : p.payeeType === "group_leader" ? ((splitPreview as any).groupLeaderName ?? "Group Leader")
                          : p.payeeType === "referral_partner" ? (editForm.referralSourceName || "Referral Partner")
                          : p.payeeType;
                        const badgeColor = p.payeeType === "agent" ? "bg-emerald-100 text-emerald-700"
                          : p.payeeType === "savvy_str_agents" ? "bg-blue-100 text-blue-700"
                          : p.payeeType === "group_leader" ? "bg-violet-100 text-violet-700"
                          : "bg-purple-100 text-purple-700";
                        return (
                          <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${badgeColor}`}>{payeeLabel}</span>
                              {p.referralFeePaidBy && (
                                <span className="text-xs text-muted-foreground">ref fee: {p.referralFeePaidBy}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-muted-foreground text-xs">{Number(p.percentage).toFixed(1)}%</span>
                              <span className="font-semibold text-emerald-700">${Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">Preview only — actual splits are recalculated when you save.</p>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={updateTransaction.isPending}>
              {updateTransaction.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving...</> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Payout Dialog */}
      <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Commission Payout Item</DialogTitle></DialogHeader>
          {gci > 0 && (
            <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
              GCI: <span className="font-semibold text-foreground">${gci.toLocaleString()}</span>
              {payoutForm.percentage && <> · This split: <span className="font-semibold text-emerald-700">${Number(autoAmount).toLocaleString()}</span></>}
            </div>
          )}
          <div className="space-y-3">
            <div>
              <Label>Payee Type</Label>
              <Select value={payoutForm.payeeType} onValueChange={(v) => setPayoutForm(f => ({ ...f, payeeType: v as any, payeeUserId: "", payeeReferralPartnerId: "", payeeName: "" }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["agent","savvy_str_agents","exp","group_leader","isa_bonus","other"].map((t) => {
                    const labels: Record<string,string> = { agent: "Agent", savvy_str_agents: "Savvy STR Agents", exp: "eXp", group_leader: "Group Leader", isa_bonus: "ISA Bonus", other: "Other" };
                    return <SelectItem key={t} value={t}>{labels[t] ?? t}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>

            {(payoutForm.payeeType === "agent" || payoutForm.payeeType === "group_leader" || payoutForm.payeeType === "isa_bonus") && (
              <div>
                <Label>Select Team Member</Label>
                <Select value={payoutForm.payeeUserId || "none"} onValueChange={(v) => {
                  const found = (agents ?? []).find(a => String(a.id) === v);
                  setPayoutForm(f => ({ ...f, payeeUserId: v === "none" ? "" : v, payeeName: found?.name ?? "" }));
                }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select person..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Select —</SelectItem>
                    {(agents ?? []).map(a => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name ?? `User #${a.id}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(["savvy_str_agents", "exp", "other"].includes(payoutForm.payeeType as string)) && (
              <div>
                <Label>Payee Name / Description</Label>
                <Input className="mt-1" value={payoutForm.payeeName} onChange={(e) => setPayoutForm(f => ({ ...f, payeeName: e.target.value }))} placeholder="e.g. Savvy Brokerage" />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Commission Type</Label>
                <Select value={payoutCommissionType} onValueChange={(v) => setPayoutCommissionType(v as any)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="flat">Flat ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{payoutCommissionType === "percentage" ? "Percentage of GCI *" : "Flat Amount ($) *"}</Label>
                <Input
                  className="mt-1"
                  type="number" step="0.1" min="0"
                  value={payoutForm.percentage}
                  onChange={(e) => setPayoutForm(f => ({ ...f, percentage: e.target.value }))}
                  placeholder={payoutCommissionType === "percentage" ? "e.g. 50" : "e.g. 5000"}
                />
              </div>
              <div>
                <Label>{payoutCommissionType === "percentage" ? "Amount (auto-calc)" : "Amount"}</Label>
                <Input
                  className="mt-1"
                  type="number" step="0.01"
                  value={payoutForm.amount || (payoutCommissionType === "percentage" ? autoAmount : "")}
                  onChange={(e) => setPayoutForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder={payoutCommissionType === "percentage" ? (autoAmount || "e.g. 6750") : "e.g. 5000"}
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea className="mt-1" value={payoutForm.notes} onChange={(e) => setPayoutForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayoutOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addPayout.mutate({
                transactionId: txId,
                payeeType: payoutForm.payeeType,
                payeeUserId: payoutForm.payeeUserId ? parseInt(payoutForm.payeeUserId) : null,
                payeeReferralPartnerId: payoutForm.payeeReferralPartnerId ? parseInt(payoutForm.payeeReferralPartnerId) : null,
                payeeName: payoutForm.payeeName || null,
                percentage: payoutForm.percentage,
                amount: (payoutForm.amount || autoAmount) || null,
                notes: payoutForm.notes || null,
              })}
              disabled={!payoutForm.percentage || addPayout.isPending}
            >
              {addPayout.isPending ? "Adding..." : "Add Payout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Commission Exception Request Dialog */}
      <Dialog open={exceptionOpen} onOpenChange={setExceptionOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Request Commission Exception</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Submit a request to adjust the commission split for this transaction. An admin will review and approve or deny your request.
            </p>
            {/* Existing pending exception warning */}
            {exceptions && exceptions.some((e: any) => e.status === "pending") && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                You already have a pending exception request for this transaction.
              </div>
            )}
            <div>
              <Label>Reason for Exception <span className="text-red-500">*</span></Label>
              <Textarea
                className="mt-1"
                rows={3}
                placeholder="Explain why you are requesting a commission exception..."
                value={exceptionForm.reason}
                onChange={(e) => setExceptionForm(f => ({ ...f, reason: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Agent Split %</Label>
                <Input
                  className="mt-1"
                  type="number" min="0" max="100" step="0.01"
                  placeholder="e.g. 80"
                  value={exceptionForm.agentSplitPct}
                  onChange={(e) => setExceptionForm(f => ({ ...f, agentSplitPct: e.target.value }))}
                />
              </div>
              <div>
                <Label>Savvy Brokerage %</Label>
                <Input
                  className="mt-1"
                  type="number" min="0" max="100" step="0.01"
                  placeholder="e.g. 20"
                  value={exceptionForm.brokerageSplitPct}
                  onChange={(e) => setExceptionForm(f => ({ ...f, brokerageSplitPct: e.target.value }))}
                />
              </div>
              <div>
                <Label>Team Leader %</Label>
                <Input
                  className="mt-1"
                  type="number" min="0" max="100" step="0.01"
                  placeholder="0"
                  value={exceptionForm.teamLeaderSplitPct}
                  onChange={(e) => setExceptionForm(f => ({ ...f, teamLeaderSplitPct: e.target.value }))}
                />
              </div>
              <div>
                <Label>Referral %</Label>
                <Input
                  className="mt-1"
                  type="number" min="0" max="100" step="0.01"
                  placeholder="0"
                  value={exceptionForm.referralSplitPct}
                  onChange={(e) => setExceptionForm(f => ({ ...f, referralSplitPct: e.target.value }))}
                />
              </div>
            </div>
            {/* Live total and warnings */}
            {(() => {
              const agent = parseFloat(exceptionForm.agentSplitPct || "0");
              const brokerage = parseFloat(exceptionForm.brokerageSplitPct || "0");
              const tl = parseFloat(exceptionForm.teamLeaderSplitPct || "0");
              const ref = parseFloat(exceptionForm.referralSplitPct || "0");
              const total = agent + brokerage + tl + ref;
              return (
                <div className="space-y-1">
                  <p className={`text-sm font-medium ${total > 100 ? "text-red-600" : "text-muted-foreground"}`}>
                    Total: {total.toFixed(2)}% {total > 100 ? "— exceeds 100%!" : ""}
                  </p>
                  {agent > 0 && agent < 50 && (
                    <p className="text-sm text-amber-600">⚠️ Agent split is below 50% — admin will be notified if approved.</p>
                  )}
                  {brokerage > 0 && brokerage < 20 && (
                    <p className="text-sm text-amber-600">⚠️ Savvy brokerage split is below 20% — admin will be notified if approved.</p>
                  )}
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExceptionOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const agent = parseFloat(exceptionForm.agentSplitPct || "0");
                const brokerage = parseFloat(exceptionForm.brokerageSplitPct || "0");
                const tl = parseFloat(exceptionForm.teamLeaderSplitPct || "0");
                const ref = parseFloat(exceptionForm.referralSplitPct || "0");
                requestException.mutate({
                  transactionId: txId,
                  reason: exceptionForm.reason,
                  agentSplitPct: agent,
                  brokerageSplitPct: brokerage,
                  teamLeaderSplitPct: tl,
                  referralSplitPct: ref,
                });
              }}
              disabled={!exceptionForm.reason.trim() || !exceptionForm.agentSplitPct || !exceptionForm.brokerageSplitPct || requestException.isPending}
            >
              {requestException.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete transaction <strong>{tx.transactionNumber}</strong> and all associated payout items, documents, notes, and history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteMutation.mutate({ id: txId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Transaction"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
