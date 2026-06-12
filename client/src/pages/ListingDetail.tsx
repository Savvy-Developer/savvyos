import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { formatEmail, formatStreet, formatCityStateZip } from "@/lib/format";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  User,
  DollarSign,
  Edit2,
  ArrowRightLeft,
  XCircle,
  Clock,
  MessageSquare,
  Send,
  Loader2,
  CheckCircle2,
  Hash,
  MapPin,
  Plus,
  Search,
} from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";
import { formatPhone as _formatPhone, parseCurrencyInput, isValidEmail, isValidPhone } from "@/lib/inputFormatters";
import React from "react";

function formatListingActivity(entry: any): { icon: React.ReactNode; label: string; description: string; color: string } {
  // activityLog returns { log, user } objects
  const log = entry.log ?? entry;
  const d = (log.details ?? {}) as Record<string, any>;
  const action: string = log.action ?? "";
  switch (action) {
    case "listing_created":
      return { icon: <Plus className="h-3.5 w-3.5 text-emerald-600" />, label: "Listing Created", description: d.mlsNumber ? `MLS# ${d.mlsNumber}` : "", color: "bg-emerald-100" };
    case "listing_updated": {
      const changes = d.changes ?? {};
      const parts = Object.entries(changes).map(([k, v]: any) => `${k}: ${v.from ?? "—"} → ${v.to ?? "—"}`).join(", ");
      return { icon: <Edit2 className="h-3.5 w-3.5 text-blue-600" />, label: "Listing Updated", description: parts || "Details changed", color: "bg-blue-100" };
    }
    case "listing_terminated":
      return { icon: <XCircle className="h-3.5 w-3.5 text-red-600" />, label: "Listing Terminated", description: d.terminationDate ? `Termination date: ${new Date(d.terminationDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "", color: "bg-red-100" };
    case "listing_converted_to_transaction":
      return { icon: <ArrowRightLeft className="h-3.5 w-3.5 text-purple-600" />, label: "Converted to Transaction", description: d.transactionId ? `Transaction #${d.transactionId}` : "", color: "bg-purple-100" };
    case "listing_back_to_active": {
      const parts: string[] = [];
      if (d.newListPrice) parts.push(`New price: $${Number(d.newListPrice).toLocaleString()}`);
      if (d.newCommissionRate) parts.push(`Commission: ${d.newCommissionRate}%`);
      if (d.terminatedTransactions?.length) parts.push(`${d.terminatedTransactions.length} transaction${d.terminatedTransactions.length > 1 ? "s" : ""} terminated`);
      if (d.reason) parts.push(`Reason: ${d.reason}`);
      return { icon: <ArrowLeft className="h-3.5 w-3.5 text-green-600" />, label: "Reverted to Active", description: parts.join(" · ") || "Listing re-activated", color: "bg-green-100" };
    }
    default:
      return { icon: <Clock className="h-3.5 w-3.5 text-gray-600" />, label: action ? action.replace(/_/g, " ") : "Activity", description: "", color: "bg-gray-100" };
  }
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  terminated: "bg-red-100 text-red-700",
  expired: "bg-yellow-100 text-yellow-700",
  under_contract: "bg-blue-100 text-blue-700",
  closed: "bg-purple-100 text-purple-700",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  terminated: "Terminated",
  expired: "Expired",
  under_contract: "Under Contract",
  closed: "Closed",
};

function formatCurrency(val: string | number | null | undefined): string {
  if (!val) return "—";
  return `$${Number(val).toLocaleString()}`;
}

function formatDate(val: Date | string | null | undefined): string {
  if (!val) return "—";
  try { return safeFormat(val, "MMM d, yyyy"); } catch { return "—"; }
}

const formatPhone = _formatPhone;

const EMPTY_CONTACT_FORM = { firstName: "", lastName: "", email: "", phone: "" };
const EMPTY_PROPERTY_FORM = { address: "", city: "", state: "", zip: "", propertyType: "single_family" as string };

export default function ListingDetail() {
  const params = useParams<{ id: string }>();
  const listingId = parseInt(params.id ?? "0", 10);
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const role = (user as any)?.role as string;
  const isAdminUser = role === "admin";
  const utils = trpc.useUtils();

  // ─── Data ─────────────────────────────────────────────────────────────────
  const { data, isLoading, error } = trpc.listings.get.useQuery(
    { id: listingId },
    { enabled: !!listingId }
  );
  const { data: notes, refetch: refetchNotes } = trpc.listings.getNotes.useQuery(
    { listingId },
    { enabled: !!listingId }
  );
  const { data: activityLog } = trpc.analytics.activityLog.useQuery(
    { entityType: "listing", entityId: listingId },
    { enabled: !!listingId }
  );

  // ─── Edit form state ──────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    listPrice: "",
    listDate: "",
    expirationDate: "",
    terminationDate: "",
    mlsNumber: "",
    notes: "",
    listingStatus: "active" as "active" | "terminated" | "expired" | "under_contract" | "closed",
    agentId: "",
  });

  // Contact editing inside Edit dialog
  const [editContactMode, setEditContactMode] = useState<"keep" | "search" | "new">("keep");
  const [editContactSearch, setEditContactSearch] = useState("");
  const [editContactId, setEditContactId] = useState<number | null>(null);
  const [editContactName, setEditContactName] = useState("");
  const [newContactForm, setNewContactForm] = useState(EMPTY_CONTACT_FORM);

  // Property editing inside Edit dialog
  const [editPropertyMode, setEditPropertyMode] = useState<"keep" | "search" | "new">("keep");
  const [editPropertySearch, setEditPropertySearch] = useState("");
  const [editPropertyId, setEditPropertyId] = useState<number | null>(null);
  const [editPropertyName, setEditPropertyName] = useState("");
  const [newPropertyForm, setNewPropertyForm] = useState(EMPTY_PROPERTY_FORM);

  // ─── Convert dialog state ─────────────────────────────────────────────────
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertForm, setConvertForm] = useState({
    transactionType: "seller" as "seller" | "dual",
    contactSearch: "",
    primaryContactId: "",
    purchasePrice: "",
    commissionRate: "",
    commissionType: "percentage" as "percentage" | "flat",
    // Dual-agency buyer side
    buyerSearch: "",
    buyerContactId: "",
    buyerCommissionRate: "",
    buyerCommissionType: "percentage" as "percentage" | "flat",
    buyerNotes: "",
  });

  // ─── Other state ──────────────────────────────────────────────────────────
  const [terminateConfirm, setTerminateConfirm] = useState(false);
  const [terminateDate, setTerminateDate] = useState("");
  const [expireConfirm, setExpireConfirm] = useState(false);
  const [noteText, setNoteText] = useState("");

  // ─── Back to Active state ─────────────────────────────────────────────────
  const [backToActiveOpen, setBackToActiveOpen] = useState(false);
  const [backToActiveForm, setBackToActiveForm] = useState({ listPrice: "", commissionRate: "", reason: "" });

  // ─── Agents list (for admin agent reassignment) ──────────────────────────
  const { data: agentsList = [] } = trpc.users.list.useQuery(
    { role: "agent" },
    { enabled: isAdminUser }
  );

  // ─── Search queries ───────────────────────────────────────────────────────
  const { data: contactSearchResults } = trpc.contacts.list.useQuery(
    { search: editContactSearch, limit: 8 },
    { enabled: editContactSearch.length >= 2 && editContactMode === "search" }
  );
  const editContactRows = contactSearchResults?.rows ?? [];

  const { data: propertySearchResults = [] } = trpc.properties.list.useQuery(
    { search: editPropertySearch },
    { enabled: editPropertySearch.length >= 2 && editPropertyMode === "search" }
  );

  const { data: convertContactResults } = trpc.contacts.list.useQuery(
    { search: convertForm.contactSearch, limit: 8 },
    { enabled: convertForm.contactSearch.length >= 2 }
  );
  const convertContactRows = convertContactResults?.rows ?? [];

  const { data: convertBuyerResults } = trpc.contacts.list.useQuery(
    { search: convertForm.buyerSearch, limit: 8 },
    { enabled: convertForm.buyerSearch.length >= 2 }
  );
  const convertBuyerRows = convertBuyerResults?.rows ?? [];

  // ─── Mutations ────────────────────────────────────────────────────────────
  const createContact = trpc.contacts.create.useMutation({ onError: (e) => toast.error(e.message) });
  const createProperty = trpc.properties.create.useMutation({ onError: (e) => toast.error(e.message) });

  const update = trpc.listings.update.useMutation({
    onSuccess: () => {
      utils.listings.get.invalidate({ id: listingId });
      setEditOpen(false);
      toast.success("Listing updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const terminate = trpc.listings.terminate.useMutation({
    onSuccess: () => {
      utils.listings.get.invalidate({ id: listingId });
      setTerminateConfirm(false);
      toast.success("Listing terminated");
    },
    onError: (e) => toast.error(e.message),
  });

  const markExpired = trpc.listings.markExpired.useMutation({
    onSuccess: () => {
      utils.listings.get.invalidate({ id: listingId });
      setExpireConfirm(false);
      toast.success("Listing marked as expired");
    },
    onError: (e) => toast.error(e.message),
  });

  const convertToTx = trpc.listings.convertToTransaction.useMutation({
    onSuccess: (data) => {
      if ((data as any).dual) {
        toast.success("Dual agency: 2 transactions created! (Seller + Buyer)");
      } else {
        toast.success("Listing converted to transaction!");
      }
      navigate(`/transactions/${data.transactionId}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const backToActive = trpc.listings.backToActive.useMutation({
    onSuccess: (data) => {
      utils.listings.get.invalidate({ id: listingId });
      setBackToActiveOpen(false);
      const txMsg = data.terminatedCount > 0 ? ` ${data.terminatedCount} transaction${data.terminatedCount > 1 ? "s" : ""} terminated.` : "";
      toast.success(`Listing reverted to Active.${txMsg}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const addNote = trpc.listings.addNote.useMutation({
    onSuccess: () => {
      refetchNotes();
      setNoteText("");
      toast.success("Note added");
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const openEdit = () => {
    if (!data) return;
    const l = data.listing;
    setEditForm({
      listPrice: l.listPrice ? String(Number(l.listPrice)) : "",
      listDate: l.listDate ? safeFormat(l.listDate, "yyyy-MM-dd") : "",
      expirationDate: l.expirationDate ? safeFormat(l.expirationDate, "yyyy-MM-dd") : "",
      terminationDate: (l as any).terminationDate ? safeFormat((l as any).terminationDate, "yyyy-MM-dd") : "",
      mlsNumber: l.mlsNumber ?? "",
      notes: l.notes ?? "",
      listingStatus: l.listingStatus as any,
      agentId: l.agentId ? String(l.agentId) : "",
    });
    // Reset contact/property editing to "keep" mode
    setEditContactMode("keep");
    setEditContactSearch("");
    setEditContactId(data.contact?.id ?? null);
    setEditContactName(data.contact ? `${data.contact.firstName} ${data.contact.lastName}` : "");
    setNewContactForm(EMPTY_CONTACT_FORM);
    setEditPropertyMode("keep");
    setEditPropertySearch("");
    setEditPropertyId(data.property?.id ?? null);
    setEditPropertyName(data.property ? [data.property.address, data.property.city].filter(Boolean).join(", ") : "");
    setNewPropertyForm(EMPTY_PROPERTY_FORM);
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    let finalContactId: number | null | undefined = undefined; // undefined = don't change
    let finalPropertyId: number | null | undefined = undefined;

    // Resolve contact
    if (editContactMode === "search") {
      if (!editContactId) { toast.error("Please select a contact"); return; }
      finalContactId = editContactId;
    } else if (editContactMode === "new") {
      if (!newContactForm.firstName || !newContactForm.lastName) {
        toast.error("Contact first and last name are required");
        return;
      }
      if (newContactForm.email && !isValidEmail(newContactForm.email)) {
        toast.error("Please enter a valid email address for the contact");
        return;
      }
      if (newContactForm.phone && !isValidPhone(newContactForm.phone)) {
        toast.error("Please enter a valid phone number (9+ digits)");
        return;
      }
      try {
        const result = await createContact.mutateAsync({
          firstName: newContactForm.firstName,
          lastName: newContactForm.lastName,
          email: newContactForm.email || undefined,
          phone: newContactForm.phone || undefined,
        });
        finalContactId = result.id;
      } catch { return; }
    }
    // else "keep" → don't send contactId (backend won't change it)

    // Resolve property
    if (editPropertyMode === "search") {
      if (!editPropertyId) { toast.error("Please select a property"); return; }
      finalPropertyId = editPropertyId;
    } else if (editPropertyMode === "new") {
      if (!newPropertyForm.address) { toast.error("Property address is required"); return; }
      try {
        const result = await createProperty.mutateAsync({
          address: newPropertyForm.address,
          city: newPropertyForm.city || undefined,
          state: newPropertyForm.state || undefined,
          zip: newPropertyForm.zip || undefined,
          propertyType: newPropertyForm.propertyType as any,
        });
        finalPropertyId = result.id;
      } catch { return; }
    }

    update.mutate({
      id: listingId,
      data: {
        listPrice: editForm.listPrice || null,
        listDate: editForm.listDate || null,
        expirationDate: editForm.expirationDate || null,
        terminationDate: editForm.terminationDate || null,
        mlsNumber: editForm.mlsNumber || null,
        notes: editForm.notes || null,
        listingStatus: editForm.listingStatus as any,
        ...(isAdminUser && editForm.agentId ? { agentId: Number(editForm.agentId) } : {}),
        ...(finalContactId !== undefined ? { contactId: finalContactId } : {}),
        ...(finalPropertyId !== undefined ? { propertyId: finalPropertyId } : {}),
      },
    });
  };

  const handleConvert = () => {
    if (!convertForm.primaryContactId) {
      toast.error("Please select a seller contact for this transaction");
      return;
    }
    if (!convertForm.buyerContactId) {
      toast.error("A buyer contact is required to convert a listing to a transaction");
      return;
    }
    convertToTx.mutate({
      listingId,
      transactionType: convertForm.transactionType,
      primaryContactId: parseInt(convertForm.primaryContactId, 10),
      purchasePrice: convertForm.purchasePrice || null,
      commissionRate: convertForm.commissionRate
        ? convertForm.commissionType === "percentage"
          ? String(parseFloat(convertForm.commissionRate) / 100)
          : convertForm.commissionRate
        : null,
      commissionType: convertForm.commissionType,
      buyerContactId: convertForm.buyerContactId ? parseInt(convertForm.buyerContactId, 10) : null,
      buyerCommissionRate: convertForm.buyerCommissionRate
        ? convertForm.buyerCommissionType === "percentage"
          ? String(parseFloat(convertForm.buyerCommissionRate) / 100)
          : convertForm.buyerCommissionRate
        : null,
      buyerCommissionType: convertForm.buyerCommissionType || null,
      buyerNotes: convertForm.buyerNotes || null,
    });
  };

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addNote.mutate({ listingId, content: noteText.trim() });
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/listings")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Listings
        </Button>
        <p className="text-destructive">Listing not found.</p>
      </div>
    );
  }

  const { listing, contact, agent, property, terminatedTransactions = [] } = data as any;
  const isAdmin = isAdminUser;
  const isActive = listing.listingStatus === "active";
  const isAssignedAgent = role === "agent" && listing.agentId === (user as any)?.id;
  // Admins can always edit (including bulk-uploaded non-active listings); agents can only edit active listings
  const canEdit = isAdmin || (role === "agent" && isActive);
  const canBackToActive = (isAdmin || isAssignedAgent) && listing.listingStatus === "under_contract";

  const addressParts = [property?.address, property?.city, property?.state, property?.zip].filter(Boolean);
  const fullAddress = addressParts.length > 0
    ? addressParts.join(", ")
    : listing.mlsNumber ? `MLS #${listing.mlsNumber}` : "Listing";

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Back + Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/listings")} className="mb-3 -ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Listings
        </Button>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">{fullAddress}</h1>
              <Badge className={STATUS_COLORS[listing.listingStatus]}>
                {STATUS_LABELS[listing.listingStatus]}
              </Badge>
            </div>
            {listing.mlsNumber && (
              <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
                <Hash className="h-3.5 w-3.5" /> MLS {listing.mlsNumber}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canEdit && (
              <Button variant="outline" size="sm" onClick={openEdit}>
                <Edit2 className="h-4 w-4 mr-1.5" /> Edit
              </Button>
            )}
            {isAdmin && isActive && (
              <>
                <Button
                  variant="outline" size="sm"
                  className="text-amber-600 border-amber-200 hover:bg-amber-50"
                  onClick={() => setExpireConfirm(true)}
                >
                  <Clock className="h-4 w-4 mr-1.5" /> Mark Expired
                </Button>
                <Button
                  variant="outline" size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setTerminateConfirm(true)}
                >
                  <XCircle className="h-4 w-4 mr-1.5" /> Terminate
                </Button>
                <Button size="sm" onClick={() => {
                  setConvertForm({
                    transactionType: "seller",
                    contactSearch: "",
                    primaryContactId: contact ? String(contact.id) : "",
                    purchasePrice: listing.listPrice ? String(Number(listing.listPrice)) : "",
                    commissionRate: "",
                    commissionType: "percentage",
                    buyerSearch: "",
                    buyerContactId: "",
                    buyerCommissionRate: "",
                    buyerCommissionType: "percentage",
                    buyerNotes: "",
                  });
                  setConvertOpen(true);
                }}>
                  <ArrowRightLeft className="h-4 w-4 mr-1.5" /> Convert to Contract
                </Button>
              </>
            )}
            {listing.convertedTransactionId && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/transactions/${listing.convertedTransactionId}`)}>
                <CheckCircle2 className="h-4 w-4 mr-1.5 text-blue-600" /> View Transaction
              </Button>
            )}
            {canBackToActive && (
              <Button
                variant="outline" size="sm"
                className="text-green-700 border-green-300 hover:bg-green-50"
                onClick={() => {
                  setBackToActiveForm({ listPrice: listing.listPrice ? String(Number(listing.listPrice)) : "", commissionRate: "", reason: "" });
                  setBackToActiveOpen(true);
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Active
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Details */}
        <div className="space-y-4">
          {/* Listing Details */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Listing Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge className={STATUS_COLORS[listing.listingStatus]}>
                  {STATUS_LABELS[listing.listingStatus]}
                </Badge>
              </div>
              {listing.listPrice && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">List Price</span>
                  <span className="font-semibold text-emerald-700">{formatCurrency(listing.listPrice)}</span>
                </div>
              )}
              {listing.listDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Listed</span>
                  <span>{formatDate(listing.listDate)}</span>
                </div>
              )}
              {listing.expirationDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expires</span>
                  <span>{formatDate(listing.expirationDate)}</span>
                </div>
              )}
              {listing.mlsNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">MLS #</span>
                  <span className="font-mono">{listing.mlsNumber}</span>
                </div>
              )}
              {listing.listingStatus === "terminated" && listing.terminationDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Terminated</span>
                  <span className="text-red-600 font-medium">{formatDate(listing.terminationDate)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(listing.createdAt)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Contact (Seller) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Seller
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1.5">
              {contact ? (
                <>
                  <button
                    className="font-medium text-primary hover:underline text-left"
                    onClick={() => navigate(`/contacts/${contact.id}`)}
                  >
                    {contact.firstName} {contact.lastName}
                  </button>
                  {contact.email && (
                    <p className="text-muted-foreground flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" /> {formatEmail(contact.email)}
                    </p>
                  )}
                  {contact.phone && (
                    <p className="text-muted-foreground">{formatPhone(contact.phone)}</p>
                  )}
                  {canEdit && isActive && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs mt-1 -ml-1" onClick={openEdit}>
                      <Edit2 className="h-3 w-3 mr-1" /> Change Contact
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground italic text-xs">No contact linked</p>
              )}
            </CardContent>
          </Card>

          {/* Property */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Property
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1.5">
              {property ? (
                <>
                  <button
                    className="font-medium text-primary hover:underline text-left"
                    onClick={() => navigate(`/properties/${property.id}`)}
                  >
                    <MapPin className="h-3.5 w-3.5 inline mr-1" />
                    {[formatStreet(property.address), formatCityStateZip(property.city, property.state, property.zip)].filter(Boolean).join(", ")}
                  </button>
                  {property.propertyType && (
                    <p className="text-muted-foreground capitalize">{property.propertyType.replace("_", " ")}</p>
                  )}
                  {canEdit && isActive && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs mt-1 -ml-1" onClick={openEdit}>
                      <Edit2 className="h-3 w-3 mr-1" /> Change Property
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground italic text-xs">No property linked</p>
              )}
            </CardContent>
          </Card>

          {/* Agent */}
          {agent && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Agent
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="font-medium">{agent.name}</p>
                {agent.email && <p className="text-muted-foreground">{agent.email}</p>}
              </CardContent>
            </Card>
          )}

          {/* Listing-level notes */}
          {listing.notes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Listing Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{listing.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Previously Terminated Transactions */}
          {terminatedTransactions.length > 0 && (
            <Card className="border-red-200 bg-red-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-700">
                  <XCircle className="h-4 w-4" /> Previously Terminated Transactions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {terminatedTransactions.map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between text-sm p-2 rounded-md bg-white border border-red-100">
                    <div>
                      <p className="font-medium">{tx.primaryContactName ?? `Transaction #${tx.id}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.transactionType ? tx.transactionType.charAt(0).toUpperCase() + tx.transactionType.slice(1) : ""}
                        {tx.closingDate ? ` · ${new Date(tx.closingDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                        {tx.gci ? ` · $${Number(tx.gci).toLocaleString()}` : ""}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => navigate(`/transactions/${tx.id}`)}>
                      View
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Notes Thread */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Notes
                {notes && notes.length > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">({notes.length})</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  placeholder="Add a note about this listing..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
                <Button size="sm" onClick={handleAddNote} disabled={!noteText.trim() || addNote.isPending}>
                  {addNote.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                  Add Note
                </Button>
              </div>
              <Separator />
              {!notes || notes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No notes yet. Add the first note above.
                </div>
              ) : (
                <div className="space-y-3">
                  {notes.map(({ note, author }) => (
                    <div key={note.id} className="bg-muted/50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-foreground">{author?.name ?? "Unknown"}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(note.createdAt)}</span>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─── Listing History ──────────────────────────────────────────────── */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" /> Listing History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!activityLog || activityLog.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No history recorded for this listing.
            </div>
          ) : (
            <div className="space-y-3">
              {activityLog.map((entry: any) => {
                const { icon, label, description, color } = formatListingActivity(entry);
                const log = entry.log ?? entry;
                return (
                  <div key={log.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                    <div className={`mt-0.5 p-1.5 rounded-full ${color}`}>{icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{label}</p>
                      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
                        {entry.user?.name && ` — ${entry.user.name}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Edit Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Listing</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Listing Status — admin only, allows correcting bulk-uploaded status */}
            {isAdmin && (
              <div className="space-y-1.5">
                <Label>Listing Status</Label>
                <Select
                  value={editForm.listingStatus}
                  onValueChange={(v) => setEditForm(f => ({ ...f, listingStatus: v as any }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="terminated">Terminated</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="under_contract">Under Contract</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Agent — admin only, allows reassigning bulk-uploaded listings */}
            {isAdmin && (
              <div className="space-y-1.5">
                <Label>Agent</Label>
                <Select
                  value={editForm.agentId || "__unassigned__"}
                  onValueChange={(v) => setEditForm(f => ({ ...f, agentId: v === "__unassigned__" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned__">Unassigned</SelectItem>
                    {(agentsList as any[]).map((a: any) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name ?? `Agent #${a.id}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* List Price */}
            <div className="space-y-1.5">
              <Label>List Price</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={editForm.listPrice}
                  onChange={(e) => setEditForm(f => ({ ...f, listPrice: e.target.value.replace(/[^0-9.]/g, "") }))}
                  placeholder="875000"
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Listing Date</Label>
                <Input type="date" value={editForm.listDate} onChange={(e) => setEditForm(f => ({ ...f, listDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Expiration Date</Label>
                <Input type="date" value={editForm.expirationDate} onChange={(e) => setEditForm(f => ({ ...f, expirationDate: e.target.value }))} />
              </div>
            </div>

            {/* MLS */}
            <div className="space-y-1.5">
              <Label>MLS Number</Label>
              <Input value={editForm.mlsNumber} onChange={(e) => setEditForm(f => ({ ...f, mlsNumber: e.target.value }))} placeholder="e.g. 3847291" />
            </div>

            {/* Termination Date — shown when status is terminated */}
            {editForm.listingStatus === "terminated" && (
              <div className="space-y-1.5">
                <Label>Termination Date</Label>
                <Input type="date" value={editForm.terminationDate} onChange={(e) => setEditForm(f => ({ ...f, terminationDate: e.target.value }))} />
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={editForm.notes} onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Internal notes..." />
            </div>

            <Separator />

            {/* ── Contact Section ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Seller Contact</Label>
                {editContactMode === "keep" && (
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setEditContactMode("search")}>
                      <Search className="h-3 w-3 mr-1" /> Change
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setEditContactMode("new")}>
                      <Plus className="h-3 w-3 mr-1" /> New
                    </Button>
                  </div>
                )}
              </div>

              {editContactMode === "keep" && (
                <div className="bg-muted rounded-md px-3 py-2 text-sm">
                  {editContactName || <span className="text-muted-foreground italic">No contact linked</span>}
                </div>
              )}

              {editContactMode === "search" && (
                <div className="space-y-1">
                  {editContactId ? (
                    <div className="flex items-center justify-between bg-muted rounded-md px-3 py-2">
                      <span className="text-sm font-medium">{editContactName}</span>
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setEditContactId(null); setEditContactName(""); setEditContactSearch(""); }}>
                        Change
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Input
                        placeholder="Search contacts by name or email..."
                        value={editContactSearch}
                        onChange={(e) => setEditContactSearch(e.target.value)}
                        autoFocus
                      />
                      {editContactRows.length > 0 && (
                        <div className="border rounded-md divide-y max-h-36 overflow-y-auto">
                          {editContactRows.map(({ contact: c }) => (
                            <button
                              key={c.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                              onClick={() => { setEditContactId(c.id); setEditContactName(`${c.firstName} ${c.lastName}`); setEditContactSearch(""); }}
                            >
                              {c.firstName} {c.lastName}
                              {c.email && <span className="text-muted-foreground ml-2 text-xs">{c.email}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setEditContactMode("keep")}>
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              )}

              {editContactMode === "new" && (
                <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground">New Contact</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">First Name *</Label>
                      <Input value={newContactForm.firstName} onChange={(e) => setNewContactForm(f => ({ ...f, firstName: e.target.value }))} placeholder="Jane" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Last Name *</Label>
                      <Input value={newContactForm.lastName} onChange={(e) => setNewContactForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Smith" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Email</Label>
                    <Input type="email" value={newContactForm.email} onChange={(e) => setNewContactForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@example.com" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone</Label>
                    <Input value={newContactForm.phone} onChange={(e) => setNewContactForm(f => ({ ...f, phone: formatPhone(e.target.value) }))} placeholder="e.g. 5551234567" />
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setEditContactMode("keep")}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            {/* ── Property Section ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Property</Label>
                {editPropertyMode === "keep" && (
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setEditPropertyMode("search")}>
                      <Search className="h-3 w-3 mr-1" /> Change
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setEditPropertyMode("new")}>
                      <Plus className="h-3 w-3 mr-1" /> New
                    </Button>
                  </div>
                )}
              </div>

              {editPropertyMode === "keep" && (
                <div className="bg-muted rounded-md px-3 py-2 text-sm">
                  {editPropertyName || <span className="text-muted-foreground italic">No property linked</span>}
                </div>
              )}

              {editPropertyMode === "search" && (
                <div className="space-y-1">
                  {editPropertyId ? (
                    <div className="flex items-center justify-between bg-muted rounded-md px-3 py-2">
                      <span className="text-sm font-medium">{editPropertyName}</span>
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setEditPropertyId(null); setEditPropertyName(""); setEditPropertySearch(""); }}>
                        Change
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Input
                        placeholder="Search by address or city..."
                        value={editPropertySearch}
                        onChange={(e) => setEditPropertySearch(e.target.value)}
                        autoFocus
                      />
                      {propertySearchResults.length > 0 && (
                        <div className="border rounded-md divide-y max-h-36 overflow-y-auto">
                          {propertySearchResults.map((p: any) => (
                            <button
                              key={p.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                              onClick={() => {
                                setEditPropertyId(p.id);
                                setEditPropertyName([formatStreet(p.address), formatCityStateZip(p.city, p.state, p.zip)].filter(Boolean).join(", "));
                                setEditPropertySearch("");
                              }}
                            >
                              <MapPin className="h-3 w-3 inline mr-1 text-muted-foreground" />
                              {[formatStreet(p.address), formatCityStateZip(p.city, p.state, p.zip)].filter(Boolean).join(", ")}
                            </button>
                          ))}
                        </div>
                      )}
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setEditPropertyMode("keep")}>
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              )}

              {editPropertyMode === "new" && (
                <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground">New Property</p>
                  <div className="space-y-1">
                    <Label className="text-xs">Address *</Label>
                    <Input value={newPropertyForm.address} onChange={(e) => setNewPropertyForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Main St" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1 col-span-1">
                      <Label className="text-xs">City</Label>
                      <Input value={newPropertyForm.city} onChange={(e) => setNewPropertyForm(f => ({ ...f, city: e.target.value }))} placeholder="Denver" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">State</Label>
                      <Input value={newPropertyForm.state} onChange={(e) => setNewPropertyForm(f => ({ ...f, state: e.target.value }))} placeholder="CO" maxLength={2} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">ZIP</Label>
                      <Input value={newPropertyForm.zip} onChange={(e) => setNewPropertyForm(f => ({ ...f, zip: e.target.value }))} placeholder="80202" />
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setEditPropertyMode("keep")}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={update.isPending || createContact.isPending || createProperty.isPending}>
              {(update.isPending || createContact.isPending || createProperty.isPending)
                ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Convert to Contract Dialog ──────────────────────────────────────── */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" /> Convert to Contract
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">

            {/* Transaction Type */}
            <div className="space-y-1.5">
              <Label>Transaction Type</Label>
              <Select value={convertForm.transactionType} onValueChange={(v) => setConvertForm(f => ({ ...f, transactionType: v as "seller" | "dual" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="seller">Seller Only</SelectItem>
                  <SelectItem value="dual">Dual Agency (Seller + Buyer)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ── Seller Side ─────────────────────────────────────────────── */}
            <div className="rounded-lg border p-4 space-y-4">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Seller Side</p>

              {/* Seller Contact */}
              <div className="space-y-1.5">
                <Label>Seller Contact *</Label>
                {convertForm.primaryContactId ? (
                  <div className="flex items-center justify-between bg-muted rounded-md px-3 py-2">
                    <span className="text-sm font-medium">
                      {convertContactRows.find((r) => String(r.contact.id) === convertForm.primaryContactId)
                        ? `${convertContactRows.find((r) => String(r.contact.id) === convertForm.primaryContactId)!.contact.firstName} ${convertContactRows.find((r) => String(r.contact.id) === convertForm.primaryContactId)!.contact.lastName}`
                        : contact ? `${contact.firstName} ${contact.lastName}` : "Selected"}
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setConvertForm(f => ({ ...f, primaryContactId: "", contactSearch: "" }))}>
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Input
                      placeholder="Search contacts..."
                      value={convertForm.contactSearch}
                      onChange={(e) => setConvertForm(f => ({ ...f, contactSearch: e.target.value }))}
                    />
                    {contact && !convertForm.contactSearch && (
                      <button
                        className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted border border-dashed border-border"
                        onClick={() => setConvertForm(f => ({ ...f, primaryContactId: String(contact.id), contactSearch: "" }))}
                      >
                        Use listing contact: <span className="font-medium">{contact.firstName} {contact.lastName}</span>
                      </button>
                    )}
                    {convertContactRows.length > 0 && convertForm.contactSearch.length >= 2 && (
                      <div className="border rounded-md divide-y max-h-36 overflow-y-auto">
                        {convertContactRows.map(({ contact: c }) => (
                          <button
                            key={c.id}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                            onClick={() => setConvertForm(f => ({ ...f, primaryContactId: String(c.id), contactSearch: "" }))}
                          >
                            {c.firstName} {c.lastName}
                            {c.email && <span className="text-muted-foreground ml-2">{c.email}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Purchase Price */}
              <div className="space-y-1.5">
                <Label>Purchase Price</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    value={convertForm.purchasePrice}
                    onChange={(e) => setConvertForm(f => ({ ...f, purchasePrice: e.target.value.replace(/[^0-9.]/g, "") }))}
                    placeholder={listing.listPrice ? String(Number(listing.listPrice)) : "e.g. 875000"}
                  />
                </div>
              </div>

              {/* Seller Commission */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Commission Type</Label>
                  <Select value={convertForm.commissionType} onValueChange={(v) => setConvertForm(f => ({ ...f, commissionType: v as "percentage" | "flat" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="flat">Flat ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{convertForm.commissionType === "percentage" ? "Seller Commission %" : "Seller Commission $"}</Label>
                  <Input
                    value={convertForm.commissionRate}
                    onChange={(e) => setConvertForm(f => ({ ...f, commissionRate: e.target.value.replace(/[^0-9.]/g, "") }))}
                    placeholder={convertForm.commissionType === "percentage" ? "e.g. 3" : "e.g. 15000"}
                  />
                </div>
              </div>
            </div>

            {/* ── Buyer Contact (required for all conversion types) ────────── */}
            <div className="rounded-lg border border-blue-200 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-950/20 p-4 space-y-4">
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">
                {convertForm.transactionType === "dual" ? "Buyer Side" : "Buyer Contact"}
              </p>

                {/* Buyer Contact */}
                <div className="space-y-1.5">
                  <Label>Buyer Contact <span className="text-destructive">*</span></Label>
                  {convertForm.buyerContactId ? (
                    <div className="flex items-center justify-between bg-muted rounded-md px-3 py-2">
                      <span className="text-sm font-medium">
                        {convertBuyerRows.find((r) => String(r.contact.id) === convertForm.buyerContactId)
                          ? `${convertBuyerRows.find((r) => String(r.contact.id) === convertForm.buyerContactId)!.contact.firstName} ${convertBuyerRows.find((r) => String(r.contact.id) === convertForm.buyerContactId)!.contact.lastName}`
                          : "Selected"}
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setConvertForm(f => ({ ...f, buyerContactId: "", buyerSearch: "" }))}>
                        Change
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Input
                        placeholder="Search contacts..."
                        value={convertForm.buyerSearch}
                        onChange={(e) => setConvertForm(f => ({ ...f, buyerSearch: e.target.value }))}
                      />
                      {convertBuyerRows.length > 0 && convertForm.buyerSearch.length >= 2 && (
                        <div className="border rounded-md divide-y max-h-36 overflow-y-auto">
                          {convertBuyerRows.map(({ contact: c }) => (
                            <button
                              key={c.id}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                              onClick={() => setConvertForm(f => ({ ...f, buyerContactId: String(c.id), buyerSearch: "" }))}
                            >
                              {c.firstName} {c.lastName}
                              {c.email && <span className="text-muted-foreground ml-2">{c.email}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Buyer Commission */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Buyer Commission Type</Label>
                    <Select value={convertForm.buyerCommissionType} onValueChange={(v) => setConvertForm(f => ({ ...f, buyerCommissionType: v as "percentage" | "flat" }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                        <SelectItem value="flat">Flat ($)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{convertForm.buyerCommissionType === "percentage" ? "Buyer Commission %" : "Buyer Commission $"}</Label>
                    <Input
                      value={convertForm.buyerCommissionRate}
                      onChange={(e) => setConvertForm(f => ({ ...f, buyerCommissionRate: e.target.value.replace(/[^0-9.]/g, "") }))}
                      placeholder={convertForm.buyerCommissionType === "percentage" ? "e.g. 3" : "e.g. 15000"}
                    />
                  </div>
                </div>

                {/* Buyer Notes */}
                <div className="space-y-1.5">
                  <Label>Buyer-Side Notes</Label>
                  <Textarea
                    value={convertForm.buyerNotes}
                    onChange={(e) => setConvertForm(f => ({ ...f, buyerNotes: e.target.value }))}
                    placeholder="Internal notes for the buyer side of this dual agency transaction..."
                    rows={3}
                  />
                </div>
              </div>
            </div>

          {/* ── Live Commission Calculator ────────────────────────────── */}
          {(() => {
            const price = parseFloat(convertForm.purchasePrice) || 0;
            const sellerRate = parseFloat(convertForm.commissionRate) || 0;
            const buyerRate = parseFloat(convertForm.buyerCommissionRate) || 0;
            const sellerAmt = convertForm.commissionType === "percentage"
              ? price * (sellerRate / 100)
              : sellerRate;
            const buyerAmt = convertForm.buyerCommissionType === "percentage"
              ? price * (buyerRate / 100)
              : buyerRate;
            const totalAmt = sellerAmt + (convertForm.transactionType === "dual" ? buyerAmt : 0);
            const fmt = (n: number) => n > 0
              ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
              : "—";
            const hasAny = price > 0 || sellerRate > 0 || (convertForm.transactionType === "dual" && buyerRate > 0);
            if (!hasAny) return null;
            return (
              <div className="mx-6 mb-2 rounded-lg border bg-muted/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Commission Preview</p>
                <div className="space-y-2">
                  {/* Price row */}
                  {price > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Sale Price</span>
                      <span className="font-medium">{price.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}</span>
                    </div>
                  )}
                  {/* Seller side */}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Seller Commission
                      {sellerRate > 0 && price > 0 && convertForm.commissionType === "percentage" && (
                        <span className="ml-1 text-xs">({sellerRate}%)</span>
                      )}
                    </span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">{fmt(sellerAmt)}</span>
                  </div>
                  {/* Buyer side (dual only) */}
                  {convertForm.transactionType === "dual" && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Buyer Commission
                        {buyerRate > 0 && price > 0 && convertForm.buyerCommissionType === "percentage" && (
                          <span className="ml-1 text-xs">({buyerRate}%)</span>
                        )}
                      </span>
                      <span className="font-medium text-blue-600 dark:text-blue-400">{fmt(buyerAmt)}</span>
                    </div>
                  )}
                  {/* Total (dual only) */}
                  {convertForm.transactionType === "dual" && (sellerAmt > 0 || buyerAmt > 0) && (
                    <>
                      <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                        <span>Total Commission</span>
                        <span>{fmt(totalAmt)}</span>
                      </div>
                      {price > 0 && totalAmt > 0 && (
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Combined rate</span>
                          <span>{((totalAmt / price) * 100).toFixed(2)}% of sale price</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button
              onClick={handleConvert}
              disabled={convertToTx.isPending || !convertForm.primaryContactId || !convertForm.buyerContactId}
            >
              {convertToTx.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ArrowRightLeft className="h-4 w-4 mr-1.5" />}
              Convert to Contract
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Terminate Confirm ───────────────────────────────────────────────── */}
      <AlertDialog open={terminateConfirm} onOpenChange={setTerminateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminate Listing?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the listing as terminated. Please provide a termination date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Label>Termination Date *</Label>
            <Input
              type="date"
              value={terminateDate}
              onChange={(e) => setTerminateDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={!terminateDate}
              onClick={() => terminate.mutate({ id: listingId, terminationDate: terminateDate })}
            >
              {terminate.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Terminate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Expire Confirm ──────────────────────────────────────────────────── */}
      <AlertDialog open={expireConfirm} onOpenChange={setExpireConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Expired?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the listing as expired.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-amber-600 hover:bg-amber-700" onClick={() => markExpired.mutate({ id: listingId })}>
              {markExpired.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Mark Expired
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Back to Active Dialog */}
      <Dialog open={backToActiveOpen} onOpenChange={setBackToActiveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <ArrowLeft className="h-5 w-5" /> Back to Active
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              This will revert the listing to <strong>Active</strong> and automatically mark any linked transactions as <strong>Terminated</strong>. Please enter the updated listing details.
            </p>
            <div className="space-y-1">
              <Label>New List Price <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                min="1"
                placeholder="e.g. 450000"
                value={backToActiveForm.listPrice}
                onChange={e => setBackToActiveForm(f => ({ ...f, listPrice: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Commission Rate (%) <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="e.g. 3.0"
                value={backToActiveForm.commissionRate}
                onChange={e => setBackToActiveForm(f => ({ ...f, commissionRate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Reason (optional)</Label>
              <Input
                placeholder="e.g. Buyer financing fell through"
                value={backToActiveForm.reason}
                onChange={e => setBackToActiveForm(f => ({ ...f, reason: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBackToActiveOpen(false)}>Cancel</Button>
            <Button
              className="bg-green-700 hover:bg-green-800 text-white"
              disabled={backToActive.isPending || !backToActiveForm.listPrice || !backToActiveForm.commissionRate}
              onClick={() => {
                const lp = parseFloat(backToActiveForm.listPrice);
                const cr = parseFloat(backToActiveForm.commissionRate);
                if (isNaN(lp) || lp <= 0) { toast.error("Please enter a valid list price"); return; }
                if (isNaN(cr) || cr < 0 || cr > 100) { toast.error("Commission rate must be between 0 and 100"); return; }
                backToActive.mutate({
                  id: listingId,
                  listPrice: lp,
                  commissionRate: cr,
                  reason: backToActiveForm.reason || undefined,
                });
              }}
            >
              {backToActive.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Confirm — Back to Active
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
