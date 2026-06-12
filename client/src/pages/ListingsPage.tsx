import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { Plus, Building2, ArrowRightLeft, Search, XCircle, Clock, MessageSquare, Send, Loader2, ChevronRight, AlertTriangle, Filter, X, Upload, ArrowUpAZ, ArrowDownAZ } from "lucide-react";
import BulkUploadDialog, { type BulkUploadColumn } from "@/components/BulkUploadDialog";
import { format } from "date-fns";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { safeFormat } from "@/lib/safeFormat";
import { formatPhone as _formatPhone, parseCurrencyInput, isValidEmail, isValidPhone } from "@/lib/inputFormatters";
import { formatStreet, formatCityStateZip } from "@/lib/format";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  terminated: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  expired: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  under_contract: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  closed: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  terminated: "Terminated",
  expired: "Expired",
  under_contract: "Under Contract",
  closed: "Closed",
};

const EMPTY_FORM = {
  agentId: "",
  contactId: "",
  contactSearch: "",
  propertyId: "",
  propertySearch: "",
  listingStatus: "active" as "active" | "terminated" | "expired" | "under_contract" | "closed",
  listPrice: "",
  listDate: "",
  expirationDate: "",
  mlsNumber: "",
  notes: "",
};

const EMPTY_CONTACT_FORM = { firstName: "", lastName: "", email: "", phone: "" };
const EMPTY_PROPERTY_FORM = { address: "", city: "", state: "", zip: "", propertyType: "single_family" as string };
const EMPTY_CONVERT_FORM = {
  transactionType: "seller" as "seller" | "dual",
  contactSearch: "",
  primaryContactId: "",
  purchasePrice: "",
  commissionRate: "",
  commissionType: "percentage" as "percentage" | "flat",
};

function formatPrice(p: string | null | undefined) {
  if (!p) return "—";
  const num = parseFloat(p);
  return isNaN(num) ? p : `$${num.toLocaleString("en-US")}`;
}

const formatPhone = _formatPhone;
function parsePriceInput(value: string) {
  return parseCurrencyInput(value);
}

export default function ListingsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isAdmin = user?.role === "admin";
  const canCreate = isAdmin || user?.role === "agent";

  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertListing, setConvertListing] = useState<any>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesListing, setNotesListing] = useState<any>(null);
  const [newNote, setNewNote] = useState("");

  // Create form state
  const [form, setForm] = useState(EMPTY_FORM);
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContactForm, setNewContactForm] = useState(EMPTY_CONTACT_FORM);
  const [showNewProperty, setShowNewProperty] = useState(false);
  const [newPropertyForm, setNewPropertyForm] = useState(EMPTY_PROPERTY_FORM);

  // Date filter state
  const [filterAgentId, setFilterAgentId] = useState("");
  const [listingDateFrom, setListingDateFrom] = useState("");
  const [listingDateTo, setListingDateTo] = useState("");
  const [expirationDateFrom, setExpirationDateFrom] = useState("");
  const [expirationDateTo, setExpirationDateTo] = useState("");
  const [showDateFilters, setShowDateFilters] = useState(false);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Termination modal state
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [terminateListingId, setTerminateListingId] = useState<number | null>(null);
  const [terminateDate, setTerminateDate] = useState("");

  // Convert form state
  const [convertForm, setConvertForm] = useState(EMPTY_CONVERT_FORM);
  const [showNewConvertContact, setShowNewConvertContact] = useState(false);
  const [newConvertContactForm, setNewConvertContactForm] = useState(EMPTY_CONTACT_FORM);

  const utils = trpc.useUtils();

  const listingsQueryInput = useMemo(() => {
    const input: Record<string, any> = {};
    if (statusFilter !== "all") input.status = statusFilter;
    if (filterAgentId && filterAgentId !== "all_agents") input.filterAgentId = Number(filterAgentId);
    if (listingDateFrom) input.listingDateFrom = listingDateFrom;
    if (listingDateTo) input.listingDateTo = listingDateTo;
    if (expirationDateFrom) input.expirationDateFrom = expirationDateFrom;
    if (expirationDateTo) input.expirationDateTo = expirationDateTo;
    input.sortOrder = sortOrder;
    return input;
  }, [statusFilter, filterAgentId, listingDateFrom, listingDateTo, expirationDateFrom, expirationDateTo, sortOrder]);
  const { data: listings, isLoading } = trpc.listings.list.useQuery(listingsQueryInput);
  const { data: agents = [] } = trpc.users.list.useQuery({ role: "agent" });
  const { data: contactsData } = trpc.contacts.list.useQuery(
    { search: form.contactSearch || undefined, limit: 50 },
    { enabled: form.contactSearch.length > 1 }
  );
  const contacts = contactsData?.rows ?? [];
  const { data: convertContactsData } = trpc.contacts.list.useQuery(
    { search: convertForm.contactSearch || undefined, limit: 50 },
    { enabled: convertForm.contactSearch.length > 1 }
  );
  const convertContacts = convertContactsData?.rows ?? [];
  const { data: properties = [] } = trpc.properties.list.useQuery(
    { search: form.propertySearch || undefined },
    { enabled: form.propertySearch.length > 1 }
  );
  const { data: listingNotes = [] } = trpc.listings.getNotes.useQuery(
    { listingId: notesListing?.listing?.id ?? 0 },
    { enabled: !!notesListing && notesOpen }
  );

  const createContact = trpc.contacts.create.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const createProperty = trpc.properties.create.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const create = trpc.listings.create.useMutation({
    onSuccess: () => {
      toast.success("Listing created");
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setShowNewContact(false);
      setNewContactForm(EMPTY_CONTACT_FORM);
      setShowNewProperty(false);
      setNewPropertyForm(EMPTY_PROPERTY_FORM);
      utils.listings.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const terminate = trpc.listings.terminate.useMutation({
    onSuccess: () => { toast.success("Listing terminated"); utils.listings.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const markExpired = trpc.listings.markExpired.useMutation({
    onSuccess: () => { toast.success("Listing marked as expired"); utils.listings.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const convert = trpc.listings.convertToTransaction.useMutation({
    onSuccess: (data) => {
      toast.success("Listing converted to transaction");
      setConvertOpen(false);
      navigate(`/transactions/${data.transactionId}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const addNote = trpc.listings.addNote.useMutation({
    onSuccess: () => {
      setNewNote("");
      utils.listings.getNotes.invalidate({ listingId: notesListing?.listing?.id });
    },
    onError: (e) => toast.error(e.message),
  });

  const filteredListings = useMemo(() => {
    if (!listings || !search) return listings;
    const s = search.toLowerCase();
    return (listings as any[]).filter((l: any) => {
      const agentName = l.agent?.name?.toLowerCase() ?? "";
      const mls = l.listing.mlsNumber?.toLowerCase() ?? "";
      const addr = l.property ? `${l.property.address} ${l.property.city}`.toLowerCase() : "";
      const contactName = l.contact ? `${l.contact.firstName} ${l.contact.lastName}`.toLowerCase() : "";
      return agentName.includes(s) || mls.includes(s) || addr.includes(s) || contactName.includes(s);
    });
  }, [listings, search]);

  async function handleCreate() {
    if (!form.agentId && isAdmin) { toast.error("Please select an agent"); return; }
    // Required fields: list price, list date, expiration date
    if (!form.listPrice) { toast.error("List price is required"); return; }
    if (!form.listDate) { toast.error("List date is required"); return; }
    if (!form.expirationDate) { toast.error("Expiration date is required"); return; }
    // A listing must always have a seller contact
    if (!form.contactId && !showNewContact) {
      toast.error("A seller contact is required for every listing");
      return;
    }

    let contactId = form.contactId ? Number(form.contactId) : null;
    let propertyId = form.propertyId ? Number(form.propertyId) : null;

    // Create new contact if needed
    if (showNewContact) {
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
        contactId = result.id;
      } catch { return; }
    }

    // Create new property if needed
    if (showNewProperty) {
      if (!newPropertyForm.address) { toast.error("Property address is required"); return; }
      try {
        const result = await createProperty.mutateAsync({
          address: newPropertyForm.address,
          city: newPropertyForm.city || undefined,
          state: newPropertyForm.state || undefined,
          zip: newPropertyForm.zip || undefined,
          propertyType: newPropertyForm.propertyType as any,
        });
        propertyId = result.id;
      } catch { return; }
    }

    if (!contactId) { toast.error("A seller contact is required for every listing"); return; }
    create.mutate({
      agentId: form.agentId ? Number(form.agentId) : undefined,
      contactId,
      propertyId,
      listingStatus: form.listingStatus,
      listPrice: parsePriceInput(form.listPrice) || null,
      listDate: form.listDate ? new Date(form.listDate).toISOString() : null,
      expirationDate: form.expirationDate ? new Date(form.expirationDate).toISOString() : null,
      mlsNumber: form.mlsNumber || null,
      notes: form.notes || null,
    });
  }

  function openConvert(listing: any) {
    setConvertListing(listing);
    setConvertForm({
      transactionType: "seller",
      contactSearch: listing.contact ? `${listing.contact.firstName} ${listing.contact.lastName}` : "",
      primaryContactId: listing.contact ? String(listing.contact.id) : "",
      purchasePrice: listing.listing.listPrice || "",
      commissionRate: "",
      commissionType: "percentage",
    });
    setShowNewConvertContact(false);
    setNewConvertContactForm(EMPTY_CONTACT_FORM);
    setConvertOpen(true);
  }

  async function handleConvert() {
    let primaryContactId = convertForm.primaryContactId ? Number(convertForm.primaryContactId) : null;

    if (showNewConvertContact) {
      if (!newConvertContactForm.firstName || !newConvertContactForm.lastName) {
        toast.error("Contact first and last name are required");
        return;
      }
      try {
        const result = await createContact.mutateAsync({
          firstName: newConvertContactForm.firstName,
          lastName: newConvertContactForm.lastName,
          email: newConvertContactForm.email || undefined,
          phone: newConvertContactForm.phone || undefined,
        });
        primaryContactId = result.id;
      } catch { return; }
    }

    if (!primaryContactId) { toast.error("Please select or create a contact"); return; }

    const commissionRate = convertForm.commissionRate
      ? convertForm.commissionType === "percentage"
        ? String(parseFloat(convertForm.commissionRate) / 100)
        : convertForm.commissionRate
      : null;

    convert.mutate({
      listingId: convertListing.listing.id,
      transactionType: convertForm.transactionType,
      primaryContactId,
      purchasePrice: parsePriceInput(convertForm.purchasePrice) || null,
      commissionRate,
      commissionType: convertForm.commissionType,
    });
  }

  const handleAddNote = useCallback(() => {
    if (!newNote.trim()) return;
    addNote.mutate({ listingId: notesListing?.listing?.id, content: newNote.trim() });
  }, [newNote, notesListing, addNote]);

  const [bulkOpen, setBulkOpen] = useState(false);
  const bulkUploadMutation = trpc.listings.bulkUpload.useMutation();

  const listingBulkColumns: BulkUploadColumn[] = [
    { key: "address", label: "Address", example: "123 Main St" },
    { key: "city", label: "City", example: "Nashville" },
    { key: "state", label: "State", example: "TN" },
    { key: "zip", label: "Zip", example: "37201" },
    { key: "propertyType", label: "Property Type", example: "single_family" },
    { key: "beds", label: "Beds", example: "3" },
    { key: "baths", label: "Baths", example: "2" },
    { key: "sqft", label: "Sqft", example: "1800" },
    { key: "mlsNumber", label: "MLS Number", example: "MLS123456" },
    { key: "listPrice", label: "List Price", example: "350000" },
    { key: "listDate", label: "List Date", example: "2024-01-15" },
    { key: "expirationDate", label: "Expiration Date", example: "2024-07-15" },
    { key: "listingStatus", label: "Listing Status", example: "active | under_contract | closed | terminated | expired" },
    { key: "agentEmail", label: "Agent Email", example: "agent@example.com" },
    { key: "sellerFirstName", label: "Seller First Name", example: "John" },
    { key: "sellerLastName", label: "Seller Last Name", example: "Doe" },
    { key: "sellerEmail", label: "Seller Email", example: "john@example.com" },
    { key: "sellerPhone", label: "Seller Phone", example: "555-987-6543" },
    { key: "notes", label: "Notes", example: "" },
  ];

  return (
    <div>
      <PageHeader
        title="Listings"
        subtitle="Active, terminated, and expired property listings"
        actions={canCreate ? (
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
                <Upload className="h-4 w-4 mr-1" /> Bulk Upload
              </Button>
            )}
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Listing
            </Button>
          </div>
        ) : undefined}
      />
      <BulkUploadDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title="Bulk Upload Listings"
        columns={listingBulkColumns}
        onUpload={async (rows) => {
          const result = await bulkUploadMutation.mutateAsync({ rows: rows as any });
          return result;
        }}
        onSuccess={() => {
          utils.listings.list.invalidate();
          toast.success("Listings imported successfully");
        }}
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5 self-start"
          onClick={() => setSortOrder(o => o === "asc" ? "desc" : "asc")}
          title={sortOrder === "asc" ? "Sorted A → Z" : "Sorted Z → A"}
        >
          {sortOrder === "asc" ? <><ArrowUpAZ className="h-4 w-4" /><span className="hidden sm:inline">A → Z</span></> : <><ArrowDownAZ className="h-4 w-4" /><span className="hidden sm:inline">Z → A</span></>}
        </Button>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by agent, contact, MLS#, or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["all", "active", "under_contract", "closed", "terminated", "expired"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {s === "all" ? "All" : (STATUS_LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1))}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Filters */}
      {isAdmin && (
        <div className="mb-4">
          <button
            onClick={() => setShowDateFilters(!showDateFilters)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Filter className="h-3.5 w-3.5" />
            {showDateFilters ? "Hide Filters" : "More Filters"}
            {(filterAgentId || listingDateFrom || listingDateTo || expirationDateFrom || expirationDateTo) && (
              <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none">
                {[filterAgentId, listingDateFrom, listingDateTo, expirationDateFrom, expirationDateTo].filter(Boolean).length}
              </span>
            )}
          </button>
          {showDateFilters && (
            <div className="mt-2 p-3 rounded-lg border bg-card space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Agent</Label>
                  <Select value={filterAgentId} onValueChange={setFilterAgentId}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="All agents" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_agents">All Agents</SelectItem>
                      {(agents as any[]).map((a: any) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.name ?? `Agent #${a.id}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">List Date From</Label>
                  <Input type="date" className="mt-1 h-8 text-xs" value={listingDateFrom} onChange={(e) => setListingDateFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">List Date To</Label>
                  <Input type="date" className="mt-1 h-8 text-xs" value={listingDateTo} onChange={(e) => setListingDateTo(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Expiration Date From</Label>
                  <Input type="date" className="mt-1 h-8 text-xs" value={expirationDateFrom} onChange={(e) => setExpirationDateFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Expiration Date To</Label>
                  <Input type="date" className="mt-1 h-8 text-xs" value={expirationDateTo} onChange={(e) => setExpirationDateTo(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="ghost" size="sm" className="h-7 text-xs"
                  onClick={() => {
                    setFilterAgentId("");
                    setListingDateFrom("");
                    setListingDateTo("");
                    setExpirationDateFrom("");
                    setExpirationDateTo("");
                  }}
                >
                  <X className="h-3 w-3 mr-1" /> Clear Filters
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">MLS #</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Property</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Contact</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Agent</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">List Price</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">List Date</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Expiration</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground text-sm">Loading...</td></tr>
                ) : !filteredListings || (filteredListings as any[]).length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-muted-foreground">
                      <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>No listings found</p>
                    </td>
                  </tr>
                ) : (
                  (filteredListings as any[]).map((item: any) => (
                    <tr key={item.listing.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="py-2 px-4 font-medium text-sm">{item.listing.mlsNumber || "—"}</td>
                      <td className="py-2 px-4">
                        {item.property ? (
                          <div>
                            <p className="text-sm font-medium text-foreground truncate max-w-[200px]" title={item.property.address}>{formatStreet(item.property.address)}</p>
                            {(item.property.city || item.property.state || item.property.zip) && (
                              <p className="text-xs text-muted-foreground">{formatCityStateZip(item.property.city, item.property.state, item.property.zip)}</p>
                            )}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="py-2 px-4 text-sm text-muted-foreground">
                        {item.contact
                          ? <button className="hover:underline text-foreground" onClick={() => navigate(`/contacts/${item.contact.id}`)}>{item.contact.firstName} {item.contact.lastName}</button>
                          : "—"}
                      </td>
                      <td className="py-2 px-4 text-sm text-muted-foreground">{item.agent?.name ?? "—"}</td>
                      <td className="py-2 px-4 text-sm font-medium">{formatPrice(item.listing.listPrice)}</td>
                      <td className="py-2 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[item.listing.listingStatus] || "bg-gray-100 text-gray-600"}`}>
                          {STATUS_LABELS[item.listing.listingStatus] ?? item.listing.listingStatus}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-muted-foreground text-xs">
                        {item.listing.listDate ? safeFormat(item.listing.listDate, "MMM d, yyyy") : "—"}
                      </td>
                      <td className="py-2 px-4 text-xs">
                        {item.listing.expirationDate ? (() => {
                          const expDate = new Date(item.listing.expirationDate);
                          const now = new Date();
                          const daysUntil = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                          const isExpired = daysUntil < 0 && item.listing.listingStatus === "active";
                          const isExpiringSoon = daysUntil >= 0 && daysUntil <= 7 && item.listing.listingStatus === "active";
                          return (
                            <span className={`flex items-center gap-1 ${
                              isExpired ? "text-red-600 font-semibold" :
                              isExpiringSoon ? "text-amber-600 font-medium" :
                              "text-muted-foreground"
                            }`}>
                              {(isExpired || isExpiringSoon) && <AlertTriangle className="h-3 w-3 flex-shrink-0" />}
                              {format(expDate, "MMM d, yyyy")}
                              {isExpired && (
                                <span className="ml-1 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Expired</span>
                              )}
                              {isExpiringSoon && (
                                <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                                  {daysUntil === 0 ? "Today" : `${daysUntil}d`}
                                </span>
                              )}
                            </span>
                          );
                        })() : "—"}
                      </td>
                      <td className="py-2 px-4">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2 text-xs"
                            onClick={() => navigate(`/listings/${item.listing.id}`)}
                          >
                            <ChevronRight className="h-3 w-3 mr-1" /> Details
                          </Button>
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2 text-xs"
                            onClick={() => { setNotesListing(item); setNotesOpen(true); }}
                          >
                            <MessageSquare className="h-3 w-3 mr-1" /> Notes
                          </Button>
                          {item.listing.listingStatus === "active" && (isAdmin || user?.role === "agent") && (
                            <>
                              <Button
                                size="sm" variant="ghost" className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700"
                                onClick={() => markExpired.mutate({ id: item.listing.id })}
                                disabled={markExpired.isPending}
                              >
                                <Clock className="h-3 w-3 mr-1" /> Expire
                              </Button>
                              <Button
                                size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
                onClick={() => {
                  setTerminateListingId(item.listing.id);
                  setTerminateDate("");
                  setTerminateOpen(true);
                }}
                disabled={terminate.isPending}
              >
                <XCircle className="h-3 w-3 mr-1" /> Terminate
              </Button>
                              <Button
                                size="sm" variant="ghost" className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700"
                                onClick={() => openConvert(item)}
                              >
                                <ArrowRightLeft className="h-3 w-3 mr-1" /> Convert
                              </Button>
                            </>
                          )}
                          {item.listing.listingStatus === "closed" && item.listing.convertedTransactionId && (
                            <Button
                              size="sm" variant="ghost" className="h-7 px-2 text-xs text-blue-600"
                              onClick={() => navigate(`/transactions/${item.listing.convertedTransactionId}`)}
                            >
                              <ChevronRight className="h-3 w-3 mr-1" /> View Transaction
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Create Listing Dialog ─────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add New Listing</DialogTitle></DialogHeader>
          <div className="space-y-4">

            {/* Agent (admin only) */}
            {isAdmin && (
              <div>
                <Label>Agent *</Label>
                <Select value={form.agentId} onValueChange={(v) => setForm({ ...form, agentId: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select agent" /></SelectTrigger>
                  <SelectContent>
                    {(agents as any[]).map((a: any) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name ?? `Agent #${a.id}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Contact */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Contact (Seller)</Label>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => { setShowNewContact(!showNewContact); setForm({ ...form, contactId: "", contactSearch: "" }); }}
                >
                  {showNewContact ? "Search existing" : "+ New contact"}
                </button>
              </div>
              {showNewContact ? (
                <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">First Name *</Label>
                      <Input className="mt-0.5 h-8 text-sm" value={newContactForm.firstName}
                        onChange={(e) => setNewContactForm({ ...newContactForm, firstName: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Last Name *</Label>
                      <Input className="mt-0.5 h-8 text-sm" value={newContactForm.lastName}
                        onChange={(e) => setNewContactForm({ ...newContactForm, lastName: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Email</Label>
                      <Input className="mt-0.5 h-8 text-sm" type="email" value={newContactForm.email}
                        onChange={(e) => setNewContactForm({ ...newContactForm, email: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Phone</Label>
                      <Input className="mt-0.5 h-8 text-sm" value={newContactForm.phone}
                        onChange={(e) => setNewContactForm({ ...newContactForm, phone: formatPhone(e.target.value) })} />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <Input
                    className="mt-1" placeholder="Search contacts by name or email..."
                    value={form.contactSearch}
                    onChange={(e) => setForm({ ...form, contactSearch: e.target.value, contactId: "" })}
                  />
                  {form.contactSearch.length > 1 && (contacts as any[]).length > 0 && !form.contactId && (
                    <div className="border rounded-md mt-1 max-h-36 overflow-y-auto bg-background shadow-sm z-10">
                      {(contacts as any[]).slice(0, 8).map((c: any) => (
                        <button key={c.contact.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50"
                          onClick={() => setForm({ ...form, contactId: String(c.contact.id), contactSearch: `${c.contact.firstName} ${c.contact.lastName}` })}
                        >
                          {c.contact.firstName} {c.contact.lastName}
                          {c.contact.email ? ` — ${c.contact.email}` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                  {form.contactId && (
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">{form.contactSearch}</Badge>
                      <button className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setForm({ ...form, contactId: "", contactSearch: "" })}>✕</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Property */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Property</Label>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => { setShowNewProperty(!showNewProperty); setForm({ ...form, propertyId: "", propertySearch: "" }); }}
                >
                  {showNewProperty ? "Search existing" : "+ New property"}
                </button>
              </div>
              {showNewProperty ? (
                <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                  <div>
                    <Label className="text-xs">Address *</Label>
                    <Input className="mt-0.5 h-8 text-sm" placeholder="123 Main St"
                      value={newPropertyForm.address}
                      onChange={(e) => setNewPropertyForm({ ...newPropertyForm, address: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">City</Label>
                      <Input className="mt-0.5 h-8 text-sm" value={newPropertyForm.city}
                        onChange={(e) => setNewPropertyForm({ ...newPropertyForm, city: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">State</Label>
                      <Input className="mt-0.5 h-8 text-sm" value={newPropertyForm.state}
                        onChange={(e) => setNewPropertyForm({ ...newPropertyForm, state: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Zip</Label>
                      <Input className="mt-0.5 h-8 text-sm" value={newPropertyForm.zip}
                        onChange={(e) => setNewPropertyForm({ ...newPropertyForm, zip: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Property Type</Label>
                    <Select value={newPropertyForm.propertyType} onValueChange={(v) => setNewPropertyForm({ ...newPropertyForm, propertyType: v })}>
                      <SelectTrigger className="mt-0.5 h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single_family">Single Family</SelectItem>
                        <SelectItem value="condo">Condo</SelectItem>
                        <SelectItem value="townhouse">Townhouse</SelectItem>
                        <SelectItem value="multi_family">Multi-Family</SelectItem>
                        <SelectItem value="land">Land</SelectItem>
                        <SelectItem value="commercial">Commercial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div>
                  <Input
                    className="mt-1" placeholder="Search properties by address..."
                    value={form.propertySearch}
                    onChange={(e) => setForm({ ...form, propertySearch: e.target.value, propertyId: "" })}
                  />
                  {form.propertySearch.length > 1 && (properties as any[]).length > 0 && !form.propertyId && (
                    <div className="border rounded-md mt-1 max-h-36 overflow-y-auto bg-background shadow-sm">
                      {(properties as any[]).slice(0, 8).map((p: any) => (
                        <button key={p.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50"
                          onClick={() => setForm({ ...form, propertyId: String(p.id), propertySearch: [formatStreet(p.address), formatCityStateZip(p.city, p.state, p.zip)].filter(Boolean).join(", ") })}
                        >
                          {formatStreet(p.address)}{p.city ? `, ${formatCityStateZip(p.city, p.state, p.zip)}` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                  {form.propertyId && (
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">{form.propertySearch}</Badge>
                      <button className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setForm({ ...form, propertyId: "", propertySearch: "" })}>✕</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>MLS Number</Label>
                <Input className="mt-1" value={form.mlsNumber} onChange={(e) => setForm({ ...form, mlsNumber: e.target.value })} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.listingStatus} onValueChange={(v) => setForm({ ...form, listingStatus: v as any })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="under_contract">Under Contract</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="terminated">Terminated</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>List Price</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    className="pl-6"
                    placeholder="500,000"
                    value={form.listPrice}
                    onChange={(e) => {
                      const raw = parsePriceInput(e.target.value);
                      setForm({ ...form, listPrice: raw ? Number(raw).toLocaleString("en-US") : "" });
                    }}
                  />
                </div>
              </div>
              <div>
                <Label>List Date</Label>
                <Input type="date" className="mt-1" value={form.listDate} onChange={(e) => setForm({ ...form, listDate: e.target.value })} />
              </div>
            </div>

            <div>
              <Label>Expiration Date</Label>
              <Input type="date" className="mt-1" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea className="mt-1" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Internal notes about this listing..." />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={create.isPending || createContact.isPending || createProperty.isPending}>
              {create.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating...</> : "Create Listing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Convert to Transaction Dialog ─────────────────────── */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Convert Listing to Transaction</DialogTitle>
            {convertListing?.property && (
              <p className="text-sm text-muted-foreground mt-1">
                {[formatStreet(convertListing.property.address), formatCityStateZip(convertListing.property.city, convertListing.property.state, convertListing.property.zip)].filter(Boolean).join(", ")}
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Transaction Type *</Label>
              <Select value={convertForm.transactionType} onValueChange={(v) => setConvertForm({ ...convertForm, transactionType: v as "seller" | "dual" })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="seller">Seller</SelectItem>
                  <SelectItem value="dual">Dual (Representing Both Sides)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Listings convert to seller or dual transactions only</p>
            </div>

            {/* Contact for transaction */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Primary Contact *</Label>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => { setShowNewConvertContact(!showNewConvertContact); setConvertForm({ ...convertForm, primaryContactId: "", contactSearch: "" }); }}
                >
                  {showNewConvertContact ? "Search existing" : "+ New contact"}
                </button>
              </div>
              {showNewConvertContact ? (
                <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">First Name *</Label>
                      <Input className="mt-0.5 h-8 text-sm" value={newConvertContactForm.firstName}
                        onChange={(e) => setNewConvertContactForm({ ...newConvertContactForm, firstName: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Last Name *</Label>
                      <Input className="mt-0.5 h-8 text-sm" value={newConvertContactForm.lastName}
                        onChange={(e) => setNewConvertContactForm({ ...newConvertContactForm, lastName: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Email</Label>
                      <Input className="mt-0.5 h-8 text-sm" type="email" value={newConvertContactForm.email}
                        onChange={(e) => setNewConvertContactForm({ ...newConvertContactForm, email: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Phone</Label>
                      <Input className="mt-0.5 h-8 text-sm" value={newConvertContactForm.phone}
                        onChange={(e) => setNewConvertContactForm({ ...newConvertContactForm, phone: formatPhone(e.target.value) })} />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <Input
                    className="mt-1" placeholder="Search contacts..."
                    value={convertForm.contactSearch}
                    onChange={(e) => setConvertForm({ ...convertForm, contactSearch: e.target.value, primaryContactId: "" })}
                  />
                  {convertForm.contactSearch.length > 1 && (convertContacts as any[]).length > 0 && !convertForm.primaryContactId && (
                    <div className="border rounded-md mt-1 max-h-36 overflow-y-auto bg-background shadow-sm">
                      {(convertContacts as any[]).slice(0, 8).map((c: any) => (
                        <button key={c.contact.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50"
                          onClick={() => setConvertForm({ ...convertForm, primaryContactId: String(c.contact.id), contactSearch: `${c.contact.firstName} ${c.contact.lastName}` })}
                        >
                          {c.contact.firstName} {c.contact.lastName}
                          {c.contact.email ? ` — ${c.contact.email}` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                  {convertForm.primaryContactId && (
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">{convertForm.contactSearch}</Badge>
                      <button className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setConvertForm({ ...convertForm, primaryContactId: "", contactSearch: "" })}>✕</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <Label>Purchase Price</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  className="pl-6"
                  value={convertForm.purchasePrice}
                  onChange={(e) => {
                    const raw = parsePriceInput(e.target.value);
                    setConvertForm({ ...convertForm, purchasePrice: raw ? Number(raw).toLocaleString("en-US") : "" });
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Commission Type</Label>
                <Select value={convertForm.commissionType} onValueChange={(v) => setConvertForm({ ...convertForm, commissionType: v as any })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="flat">Flat ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Commission {convertForm.commissionType === "percentage" ? "Rate (%)" : "Amount ($)"}</Label>
                <Input
                  className="mt-1"
                  placeholder={convertForm.commissionType === "percentage" ? "e.g. 3" : "e.g. 15000"}
                  value={convertForm.commissionRate}
                  onChange={(e) => setConvertForm({ ...convertForm, commissionRate: e.target.value.replace(/[^0-9.]/g, "") })}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button onClick={handleConvert} disabled={convert.isPending || createContact.isPending}>
              {convert.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Converting...</> : "Create Transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Notes Dialog ──────────────────────────────────────── */}
      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Listing Notes</DialogTitle>
            {notesListing?.property && (
              <p className="text-sm text-muted-foreground">
                {[formatStreet(notesListing.property.address), formatCityStateZip(notesListing.property.city, notesListing.property.state, notesListing.property.zip)].filter(Boolean).join(", ")}
              </p>
            )}
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            {(listingNotes as any[]).length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">No notes yet</p>
            ) : (
              (listingNotes as any[]).map((note: any) => (
                <div key={note.id} className="bg-muted/30 rounded-md p-3">
                  <p className="text-sm">{note.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {note.author?.name ?? "Unknown"} · {safeFormat(note.createdAt, "MMM d, yyyy h:mm a")}
                  </p>
                </div>
              ))
            )}
          </div>
          <Separator />
          <div className="flex gap-2 pt-2">
            <Input
              placeholder="Add a note..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddNote(); } }}
            />
            <Button size="sm" onClick={handleAddNote} disabled={!newNote.trim() || addNote.isPending}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* ─── Terminate Listing Dialog ─────────────────────────────────── */}
      <AlertDialog open={terminateOpen} onOpenChange={setTerminateOpen}>
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
              disabled={!terminateDate || !terminateListingId}
              onClick={() => {
                if (terminateListingId) {
                  terminate.mutate({ id: terminateListingId, terminationDate: terminateDate });
                  setTerminateOpen(false);
                }
              }}
            >
              {terminate.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Terminate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
