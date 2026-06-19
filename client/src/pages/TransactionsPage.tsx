import { useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import { TransactionStatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import { Plus, FileText, AlertTriangle, Search, ChevronLeft, ChevronRight, Home, User, DollarSign, CheckCircle2, Upload, Download, CheckCircle, XCircle, AlertCircle, ArrowUpAZ, ArrowDownAZ } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { safeFormat } from "@/lib/safeFormat";
import { formatPhone as _formatPhone, parseCurrencyInput as _parseCurrencyInput, isValidEmail, isValidPhone } from "@/lib/inputFormatters";

// ─── Formatters ───────────────────────────────────────────────────────────────
const formatCurrency = (val: string | null | undefined) => {
  if (!val) return "—";
  const num = parseFloat(val);
  return isNaN(num) ? val : `$${num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};
const parseCurrencyInput = _parseCurrencyInput;
const formatPhoneDisplay = _formatPhone;

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Inline contact lookup + create-if-not-found */
function ContactPicker({
  label,
  required,
  value,
  onChange,
  excludeContactId,
}: {
  label: string;
  required?: boolean;
  value: { id: number; firstName: string; lastName: string; email?: string | null } | null;
  onChange: (c: { id: number; firstName: string; lastName: string; email?: string | null } | null) => void;
  excludeContactId?: number | null;
}) {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const { data: searchData } = trpc.contacts.list.useQuery(
    { search: search || undefined, limit: 25 },
    { enabled: search.length >= 2 }
  );
  const contacts = (searchData?.rows ?? []).filter(r =>
    !excludeContactId || r.contact.id !== excludeContactId
  );

  const createContact = trpc.contacts.create.useMutation({
    onSuccess: (data: any) => {
      onChange({ id: data.id, firstName: newFirst, lastName: newLast, email: newEmail || null });
      setShowCreate(false);
      setSearch(`${newFirst} ${newLast}`);
      setNewFirst(""); setNewLast(""); setNewEmail(""); setNewPhone("");
      toast.success("Contact created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (value) {
    return (
      <div>
        <Label>{label}{required && " *"}</Label>
        <div className="mt-1 p-2 rounded-md bg-primary/10 text-sm flex items-center justify-between">
          <span className="font-medium flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-primary" />
            {value.firstName} {value.lastName}
            {value.email && <span className="text-muted-foreground font-normal">— {value.email}</span>}
          </span>
          <button className="text-xs text-primary hover:underline" onClick={() => { onChange(null); setSearch(""); }}>Change</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Label>{label}{required && " *"}</Label>
      {!showCreate ? (
        <>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {search.length >= 2 && (
            <div className="border rounded-md mt-1 max-h-40 overflow-y-auto">
              {contacts.length === 0 ? (
                <div className="p-3">
                  <p className="text-sm text-muted-foreground mb-2">No contacts found</p>
                  <button
                    className="text-xs text-primary hover:underline font-medium"
                    onClick={() => { setShowCreate(true); setNewFirst(search.split(" ")[0] || ""); setNewLast(search.split(" ").slice(1).join(" ") || ""); }}
                  >
                    + Create "{search}" as new contact
                  </button>
                </div>
              ) : (
                <>
                  {contacts.slice(0, 25).map((r) => (
                    <button
                      key={r.contact.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b last:border-0"
                      onClick={() => { onChange(r.contact); setSearch(`${r.contact.firstName} ${r.contact.lastName}`); }}
                    >
                      <span className="font-medium">{r.contact.firstName} {r.contact.lastName}</span>
                      {r.contact.email && <span className="text-muted-foreground ml-2 text-xs">{r.contact.email}</span>}
                    </button>
                  ))}
                  <button
                    className="w-full text-left px-3 py-2 text-xs text-primary hover:bg-muted/50 font-medium"
                    onClick={() => setShowCreate(true)}
                  >
                    + Create new contact instead
                  </button>
                </>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="mt-1 border rounded-md p-3 space-y-2 bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Create New Contact</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">First Name *</Label>
              <Input className="mt-0.5 h-8 text-sm" value={newFirst} onChange={(e) => setNewFirst(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Last Name *</Label>
              <Input className="mt-0.5 h-8 text-sm" value={newLast} onChange={(e) => setNewLast(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input className="mt-0.5 h-8 text-sm" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Phone</Label>
            <Input className="mt-0.5 h-8 text-sm" value={newPhone} onChange={(e) => setNewPhone(formatPhoneDisplay(e.target.value))} placeholder="e.g. 5551234567" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!newFirst || !newLast || createContact.isPending}
              onClick={() => {
                if (newEmail && !isValidEmail(newEmail)) { toast.error("Please enter a valid email address"); return; }
                if (newPhone && !isValidPhone(newPhone)) { toast.error("Please enter a valid phone number (9+ digits)"); return; }
                createContact.mutate({
                  firstName: newFirst,
                  lastName: newLast,
                  email: newEmail || undefined,
                  phone: newPhone || undefined,
                });
              }}
            >
              {createContact.isPending ? "Creating..." : "Create Contact"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Inline property lookup + create-if-not-found */
function PropertyPicker({
  value,
  onChange,
}: {
  value: { id: number; address: string } | null;
  onChange: (p: { id: number; address: string } | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [newZip, setNewZip] = useState("");

  const { data: propData } = trpc.properties.list.useQuery(
    { search: search || undefined },
    { enabled: search.length >= 2 }
  );
  const properties = propData ?? [];

  const createProperty = trpc.properties.create.useMutation({
    onSuccess: (data: any) => {
      onChange({ id: data.id, address: newAddress });
      setShowCreate(false);
      setSearch(newAddress);
      setNewAddress(""); setNewCity(""); setNewState(""); setNewZip("");
      toast.success("Property created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (value) {
    return (
      <div>
        <Label>Property</Label>
        <div className="mt-1 p-2 rounded-md bg-primary/10 text-sm flex items-center justify-between">
          <span className="font-medium flex items-center gap-1.5">
            <Home className="h-3.5 w-3.5 text-primary" />
            {value.address}
          </span>
          <button className="text-xs text-primary hover:underline" onClick={() => { onChange(null); setSearch(""); }}>Change</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Label>Property <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
      {!showCreate ? (
        <>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {search.length >= 2 && (
            <div className="border rounded-md mt-1 max-h-40 overflow-y-auto">
              {properties.length === 0 ? (
                <div className="p-3">
                  <p className="text-sm text-muted-foreground mb-2">No properties found</p>
                  <button
                    className="text-xs text-primary hover:underline font-medium"
                    onClick={() => { setShowCreate(true); setNewAddress(search); }}
                  >
                    + Add "{search}" as new property
                  </button>
                </div>
              ) : (
                <>
                  {properties.slice(0, 10).map((p: any) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b last:border-0"
                      onClick={() => { onChange({ id: p.id, address: p.address }); setSearch(p.address); }}
                    >
                      <span className="font-medium">{p.address}</span>
                      {(p.city || p.state) && <span className="text-muted-foreground ml-2 text-xs">{[p.city, p.state].filter(Boolean).join(", ")}</span>}
                    </button>
                  ))}
                  <button
                    className="w-full text-left px-3 py-2 text-xs text-primary hover:bg-muted/50 font-medium"
                    onClick={() => setShowCreate(true)}
                  >
                    + Add new property instead
                  </button>
                </>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="mt-1 border rounded-md p-3 space-y-2 bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add New Property</p>
          <div>
            <Label className="text-xs">Address *</Label>
            <Input className="mt-0.5 h-8 text-sm" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">City</Label>
              <Input className="mt-0.5 h-8 text-sm" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">State</Label>
              <Input className="mt-0.5 h-8 text-sm" value={newState} onChange={(e) => setNewState(e.target.value)} placeholder="TN" />
            </div>
            <div>
              <Label className="text-xs">ZIP</Label>
              <Input className="mt-0.5 h-8 text-sm" value={newZip} onChange={(e) => setNewZip(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!newAddress || createProperty.isPending}
              onClick={() => createProperty.mutate({ address: newAddress, city: newCity || null, state: newState || null, zip: newZip || null })}
            >
              {createProperty.isPending ? "Adding..." : "Add Property"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Commission rate input with % display */
function CommissionFields({
  label,
  commissionType,
  commissionRate,
  gci,
  gciManuallyEdited,
  purchasePrice,
  onTypeChange,
  onRateChange,
  onGciChange,
  onGciManualChange,
}: {
  label: string;
  commissionType: "percentage" | "flat";
  commissionRate: string;
  gci: string;
  gciManuallyEdited?: boolean;
  purchasePrice?: string;
  onTypeChange: (v: "percentage" | "flat") => void;
  onRateChange: (v: string) => void;
  onGciChange?: (v: string) => void;
  onGciManualChange?: (manual: boolean) => void;
}) {
  // Auto-calc GCI from price × rate
  const autoGci = (() => {
    if (commissionType !== "percentage" || !purchasePrice || !commissionRate) return null;
    const p = parseFloat(purchasePrice.replace(/,/g, ""));
    const r = parseFloat(commissionRate);
    if (!isNaN(p) && !isNaN(r) && p > 0 && r > 0) return p * r / 100;
    return null;
  })();

  return (
    <div className="border rounded-md p-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={commissionType} onValueChange={(v) => onTypeChange(v as "percentage" | "flat")}>
            <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">Percentage (%)</SelectItem>
              <SelectItem value="flat">Flat ($)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{commissionType === "percentage" ? "Rate (%)" : "Amount ($)"}</Label>
          <div className="relative mt-1">
            {commissionType === "percentage" && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            )}
            {commissionType === "flat" && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
            )}
            <Input
              className={`h-8 text-sm ${commissionType === "percentage" ? "pr-7" : "pl-7"}`}
              value={commissionRate}
              onChange={(e) => onRateChange(e.target.value)}
              placeholder={commissionType === "percentage" ? "3.00" : "15000"}
            />
          </div>
        </div>
      </div>
      {/* GCI field with manual override */}
      <div>
        <Label className="text-xs flex items-center gap-1.5">
          GCI (Gross Commission Income)
          {gciManuallyEdited && (
            <span className="text-amber-600 font-normal">(manually set)</span>
          )}
        </Label>
        <div className="relative mt-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
          <Input
            className="h-8 text-sm pl-7"
            placeholder={autoGci ? autoGci.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "auto-calculated"}
            value={gci}
            onChange={(e) => {
              const raw = _parseCurrencyInput(e.target.value);
              onGciChange?.(raw ? Number(raw).toLocaleString("en-US") : "");
              onGciManualChange?.(true);
            }}
          />
        </div>
        {gciManuallyEdited && autoGci !== null && (
          <button
            type="button"
            className="mt-1 text-xs text-blue-600 hover:underline flex items-center gap-1"
            onClick={() => {
              onGciChange?.(autoGci.toLocaleString("en-US", { maximumFractionDigits: 2 }));
              onGciManualChange?.(false);
            }}
          >
            ↺ Recalculate: ${autoGci.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </button>
        )}
        {!gciManuallyEdited && gci && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold mt-1">
            <DollarSign className="h-3 w-3" />
            {formatCurrency(gci)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type TxMode = "buy" | "sell" | "dual";

interface CreateForm {
  mode: TxMode;
  status: "under_contract";
  purchasePrice: string;
  contractDate: string;
  closingDate: string;
  notes: string;
  // Buyer side commission
  buyCommissionType: "percentage" | "flat";
  buyCommissionRate: string;
  buyGci: string;
  buyGciManuallyEdited: boolean;
  // Seller side commission
  sellCommissionType: "percentage" | "flat";
  sellCommissionRate: string;
  sellGci: string;
  sellGciManuallyEdited: boolean;
}

const defaultForm = (): CreateForm => ({
  mode: "buy",
  status: "under_contract",
  purchasePrice: "",
  contractDate: "",
  closingDate: "",
  notes: "",
  buyCommissionType: "percentage",
  buyCommissionRate: "",
  buyGci: "",
  buyGciManuallyEdited: false,
  sellCommissionType: "percentage",
  sellCommissionRate: "",
  sellGci: "",
  sellGciManuallyEdited: false,
});

const calcGci = (price: string, rate: string, type: "percentage" | "flat"): string => {
  const p = parseFloat(price);
  const r = parseFloat(rate);
  if (type === "percentage" && !isNaN(p) && !isNaN(r) && r > 0) return (p * r / 100).toFixed(2);
  if (type === "flat" && !isNaN(r)) return r.toFixed(2);
  return "";
};

export default function TransactionsPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = (user as any)?.role === "admin";

  // ─── Bulk Upload State ────────────────────────────────────────────────────────
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkPreview, setBulkPreview] = useState<any[]>([]);
  const [bulkStep, setBulkStep] = useState<"upload" | "preview" | "results">("upload");
  const [bulkResults, setBulkResults] = useState<any>(null);
  const bulkFileRef = useRef<HTMLInputElement>(null);

  const bulkUpload = trpc.transactions.bulkUpload.useMutation({
    onSuccess: (data) => {
      setBulkResults(data);
      setBulkStep("results");
      if (data.succeeded > 0) {
        refetch();
        toast.success(`${data.succeeded} transaction${data.succeeded !== 1 ? "s" : ""} imported successfully.`);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  function parseCsvToRows(csvText: string): any[] {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
    return lines.slice(1).map((line, i) => {
      // Handle quoted fields
      const values: string[] = [];
      let cur = ""; let inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === "," && !inQ) { values.push(cur.trim()); cur = ""; }
        else { cur += ch; }
      }
      values.push(cur.trim());
      const row: any = { rowIndex: i + 2 }; // 1-based, +1 for header
      headers.forEach((h, j) => { row[h] = values[j] ?? ""; });
      return row;
    });
  }

  function mapCsvRowToInput(row: any) {
    return {
      rowIndex: row.rowIndex,
      transactionNumber: row.transaction_number || undefined,
      transactionType: row.transaction_type || "",
      status: row.status || "",
      agentEmail: row.agent_email || "",
      primaryContactFirstName: row.primary_contact_first_name || "",
      primaryContactLastName: row.primary_contact_last_name || "",
      primaryContactEmail: row.primary_contact_email || undefined,
      primaryContactPhone: row.primary_contact_phone || undefined,
      propertyAddress: row.property_address || undefined,
      propertyCity: row.property_city || undefined,
      propertyState: row.property_state || undefined,
      propertyZip: row.property_zip || undefined,
      purchasePrice: row.purchase_price || undefined,
      commissionRatePct: row.commission_rate_pct || undefined,
      gci: row.gci || undefined,
      agentSplitPct: row.agent_split_pct || undefined,
      groupLeaderSplitPct: row.group_leader_split_pct || undefined,
      referralSourceName: row.referral_source_name || undefined,
      referralPayoutPct: row.referral_payout_pct || undefined,
      contractDate: row.contract_date || undefined,
      closingDate: row.closing_date || undefined,
      notes: row.notes || undefined,
    };
  }

  function handleBulkFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsvToRows(text);
      setBulkPreview(rows);
      setBulkStep("preview");
    };
    reader.readAsText(file);
  }

  function handleBulkSubmit() {
    const rows = bulkPreview.map(mapCsvRowToInput);
    bulkUpload.mutate({ rows });
  }

  function resetBulkUpload() {
    setBulkFile(null);
    setBulkPreview([]);
    setBulkStep("upload");
    setBulkResults(null);
    if (bulkFileRef.current) bulkFileRef.current.value = "";
  }

  function downloadTemplate() {
    const header = "transaction_number,transaction_type,status,agent_email,primary_contact_first_name,primary_contact_last_name,primary_contact_email,primary_contact_phone,property_address,property_city,property_state,property_zip,purchase_price,commission_rate_pct,gci,agent_split_pct,group_leader_split_pct,referral_source_name,referral_payout_pct,contract_date,closing_date,notes";
    const example = "TXN-001,seller,closed,agent@example.com,John,Doe,john@email.com,555-123-4567,123 Main St,Nashville,TN,37201,450000,3,13500,70,,,,2024-03-01,2024-04-15,Example transaction";
    const blob = new Blob([header + "\n" + example], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "transaction_bulk_upload_template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const [open, setOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [txSearch, setTxSearch] = useState("");
  const [txPage, setTxPage] = useState(1);
  const [closingDateFrom, setClosingDateFrom] = useState("");
  const [closingDateTo, setClosingDateTo] = useState("");
  const [contractDateFrom, setContractDateFrom] = useState("");
  const [contractDateTo, setContractDateTo] = useState("");
  const [showDateFilters, setShowDateFilters] = useState(false);
  const [leadSourceFilter, setLeadSourceFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Wizard state
  const [form, setForm] = useState<CreateForm>(defaultForm());
  const [buyerContact, setBuyerContact] = useState<any>(null);
  const [sellerContact, setSellerContact] = useState<any>(null);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [agentSearch, setAgentSearch] = useState("");
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [listingSearch, setListingSearch] = useState("");

  // Queries
  const marketIdParam = marketFilter === "all" ? undefined : Number(marketFilter);
  const statusParam = statusFilter === "all" ? undefined : statusFilter;
  const agentIdParam = agentFilter === "all" ? undefined : Number(agentFilter);
  const leadSourceIdParam = leadSourceFilter === "all" ? undefined : Number(leadSourceFilter);
  const typeParam = typeFilter === "all" ? undefined : typeFilter as "buyer" | "seller" | "dual";
  const { data: transactionsData, refetch } = trpc.transactions.list.useQuery({
    page: txPage, limit: 25, marketId: marketIdParam, search: txSearch || undefined, status: statusParam,
    agentId: agentIdParam,
    contractDateFrom: contractDateFrom || undefined,
    contractDateTo: contractDateTo || undefined,
    closingDateFrom: closingDateFrom || undefined,
    closingDateTo: closingDateTo || undefined,
    leadSourceId: leadSourceIdParam,
    transactionType: typeParam,
    sortOrder,
  });
  const { data: markets = [] } = trpc.markets.list.useQuery();
  const { data: leadSourcesData } = trpc.leadSources.list.useQuery();
  const leadSourcesList = (leadSourcesData ?? []) as any[];
  const transactions = transactionsData?.rows ?? [];
  const txTotal = transactionsData?.total ?? 0;
  const txTotalPages = Math.ceil(txTotal / 25);
  const { data: agents } = trpc.users.list.useQuery({ role: "agent" }, { enabled: isAdmin });
  const { data: listingsData } = trpc.listings.list.useQuery(
    { search: listingSearch || undefined },
    { enabled: listingSearch.length >= 2 }
  );
  const listings = listingsData ?? [];

  const create = trpc.transactions.create.useMutation({
    onSuccess: () => refetch(),
    onError: (e: any) => toast.error(e.message),
  });

  const filteredAgents = (agents ?? []).filter((a: any) =>
    !agentSearch || a.name?.toLowerCase().includes(agentSearch.toLowerCase()) || a.email?.toLowerCase().includes(agentSearch.toLowerCase())
  );

  // Status filtering is now done server-side
  const filtered = transactions;

  function updateForm(field: keyof CreateForm, value: string | boolean) {
    setForm(prev => {
      const updated = { ...prev, [field]: value };
      const price = field === "purchasePrice" ? (value as string) : prev.purchasePrice;
      // Only auto-calc GCI if not manually edited
      if (["purchasePrice", "buyCommissionRate", "buyCommissionType"].includes(field as string)) {
        if (!prev.buyGciManuallyEdited) {
          updated.buyGci = calcGci(price, updated.buyCommissionRate, updated.buyCommissionType);
        }
      }
      if (["purchasePrice", "sellCommissionRate", "sellCommissionType"].includes(field as string)) {
        if (!prev.sellGciManuallyEdited) {
          updated.sellGci = calcGci(price, updated.sellCommissionRate, updated.sellCommissionType);
        }
      }
      return updated;
    });
  }

  function resetDialog() {
    setWizardStep(1);
    setForm(defaultForm());
    setBuyerContact(null);
    setSellerContact(null);
    setSelectedAgent(null);
    setAgentSearch("");
    setSelectedProperty(null);
    setSelectedListing(null);
    setListingSearch("");
  }

  const canAdvanceStep1 = useCallback(() => {
    if (form.mode === "buy") return !!buyerContact && (!isAdmin || !!selectedAgent);
    if (form.mode === "sell") return !!sellerContact && (!isAdmin || !!selectedAgent);
    if (form.mode === "dual") return !!buyerContact && !!sellerContact && buyerContact.id !== sellerContact.id && (!isAdmin || !!selectedAgent);
    return false;
  }, [form.mode, buyerContact, sellerContact, selectedAgent, isAdmin]);

  async function handleCreate() {
    // Belt-and-suspenders: canAdvanceStep1 already gates the UI, but validate here too
    if ((form.mode === "buy" || form.mode === "dual") && !buyerContact) {
      toast.error("A buyer contact is required before creating this transaction");
      return;
    }
    if ((form.mode === "sell" || form.mode === "dual") && !sellerContact) {
      toast.error("A seller contact is required before creating this transaction");
      return;
    }
    if (form.mode === "dual" && buyerContact && sellerContact && buyerContact.id === sellerContact.id) {
      toast.error("Buyer and seller contacts must be different people");
      return;
    }
    const agentId = isAdmin ? selectedAgent?.id : undefined;
    const base = {
      ...(agentId ? { agentId } : {}),
      status: form.status,
      purchasePrice: parseCurrencyInput(form.purchasePrice) || null,
      contractDate: form.contractDate || null,
      closingDate: form.closingDate || null,
      notes: form.notes || null,
      propertyId: selectedProperty?.id ?? null,
    };

    // Store commission rate as decimal (e.g. 3% → "0.03") for percentage type
    const toDecimalRate = (rate: string, type: "percentage" | "flat") => {
      if (!rate) return null;
      if (type === "percentage") {
        const n = parseFloat(rate);
        return isNaN(n) ? null : (n / 100).toString();
      }
      return rate;
    };

    try {
      if (form.mode === "buy") {
        const result = await create.mutateAsync({
          ...base,
          primaryContactId: buyerContact.id,
          transactionType: "buyer",
          commissionType: form.buyCommissionType,
          commissionRate: toDecimalRate(form.buyCommissionRate, form.buyCommissionType),
          grossCommissionIncome: parseCurrencyInput(form.buyGci) || null,
        });
        toast.success(`Transaction ${result.transactionNumber} created`);
        setOpen(false); resetDialog();
        navigate(`/transactions/${result.id}`);
      } else if (form.mode === "sell") {
        const result = await create.mutateAsync({
          ...base,
          primaryContactId: sellerContact.id,
          transactionType: "seller",
          listingId: selectedListing?.id ?? null,
          commissionType: form.sellCommissionType,
          commissionRate: toDecimalRate(form.sellCommissionRate, form.sellCommissionType),
          grossCommissionIncome: parseCurrencyInput(form.sellGci) || null,
        });
        toast.success(`Transaction ${result.transactionNumber} created`);
        setOpen(false); resetDialog();
        navigate(`/transactions/${result.id}`);
      } else {
        // Dual — create buyer then seller
        const buyResult = await create.mutateAsync({
          ...base,
          primaryContactId: buyerContact.id,
          transactionType: "buyer",
          commissionType: form.buyCommissionType,
          commissionRate: toDecimalRate(form.buyCommissionRate, form.buyCommissionType),
          grossCommissionIncome: parseCurrencyInput(form.buyGci) || null,
          sellerContactId: sellerContact.id,
        });
        const sellResult = await create.mutateAsync({
          ...base,
          primaryContactId: sellerContact.id,
          transactionType: "seller",
          listingId: selectedListing?.id ?? null,
          commissionType: form.sellCommissionType,
          commissionRate: toDecimalRate(form.sellCommissionRate, form.sellCommissionType),
          grossCommissionIncome: parseCurrencyInput(form.sellGci) || null,
          sellerContactId: sellerContact.id,
        });
        toast.success(`Dual transaction created — Buy: ${buyResult.transactionNumber} · Sell: ${sellResult.transactionNumber}`);
        setOpen(false); resetDialog();
        navigate(`/transactions/${buyResult.id}`);
      }
    } catch (_) {
      // error already shown by mutation onError
    }
  }

  const modeLabels: Record<TxMode, string> = { buy: "Buy", sell: "Sell", dual: "Dual (Buy + Sell)" };
  const modeDescriptions: Record<TxMode, string> = {
    buy: "Representing the buyer on a purchase",
    sell: "Representing the seller on a listing",
    dual: "Representing both buyer and seller on the same property",
  };

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle="Manage all active and closed real estate transactions"
        actions={
          user?.role !== "agent" ? (
            <div className="flex gap-2">
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
                  <Upload className="h-4 w-4 mr-1" /> Bulk Upload
                </Button>
              )}
              <Button onClick={() => { resetDialog(); setOpen(true); }} size="sm">
                <Plus className="h-4 w-4 mr-1" /> New Transaction
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Search bar */}
      <div className="flex gap-2 mb-4">
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => setSortOrder(o => o === "asc" ? "desc" : "asc")}
          title={sortOrder === "asc" ? "Sorted A → Z" : "Sorted Z → A"}
        >
          {sortOrder === "asc" ? <><ArrowUpAZ className="h-4 w-4" /><span className="hidden sm:inline">A → Z</span></> : <><ArrowDownAZ className="h-4 w-4" /><span className="hidden sm:inline">Z → A</span></>}
        </Button>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by transaction number, contact name..."
            value={txSearch}
            onChange={(e) => { setTxSearch(e.target.value); setTxPage(1); }}
            className="pl-9"
          />
        </div>
      </div>

      {/* Status filters */}
      <div className="flex gap-2 flex-wrap mb-3">
        {["all","under_contract","closed","terminated"].map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setTxPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {s === "all" ? "All" : s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </button>
        ))}
        <div className="h-4 w-px bg-border self-center" />
        {["all","buyer","seller","dual"].map((t) => (
          <button
            key={t}
            onClick={() => { setTypeFilter(t); setTxPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${typeFilter === t ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {t === "all" ? "All Types" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <div className="h-4 w-px bg-border self-center" />
        <button
          onClick={() => setShowDateFilters(!showDateFilters)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${showDateFilters ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
        >
          Date Filters
        </button>
      </div>

      {/* Agent + Market filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        {isAdmin && (
          <Select value={agentFilter} onValueChange={(v) => { setAgentFilter(v); setTxPage(1); }}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {(agents as any[] ?? []).map((a: any) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {isAdmin && (markets as any[]).length > 0 && (
          <Select value={marketFilter} onValueChange={(v) => { setMarketFilter(v); setTxPage(1); }}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by Market" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Markets</SelectItem>
              {(markets as any[]).map((m: any) => (
                <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={leadSourceFilter} onValueChange={(v) => { setLeadSourceFilter(v); setTxPage(1); }}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by Lead Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Lead Sources</SelectItem>
            {(() => {
              const parents = leadSourcesList.filter((row: any) => !(row.ls ?? row).parentId);
              const children = leadSourcesList.filter((row: any) => !!(row.ls ?? row).parentId);
              const items: React.ReactNode[] = [];
              parents.forEach((parentRow: any) => {
                const parent = parentRow.ls ?? parentRow;
                const subs = children.filter((r: any) => (r.ls ?? r).parentId === parent.id);
                if (subs.length > 0) {
                  items.push(
                    <SelectGroup key={`group-${parent.id}`}>
                      <SelectLabel
                        className="text-xs font-semibold text-foreground px-2 py-1.5 cursor-pointer hover:bg-accent rounded-sm"
                        onClick={() => { setLeadSourceFilter(String(parent.id)); setTxPage(1); }}
                      >
                        {parent.name}
                      </SelectLabel>
                      {subs.map((childRow: any) => {
                        const child = childRow.ls ?? childRow;
                        return (
                          <SelectItem key={child.id} value={String(child.id)} className="pl-6">
                            {child.name}
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  );
                } else {
                  items.push(
                    <SelectItem key={parent.id} value={String(parent.id)}>{parent.name}</SelectItem>
                  );
                }
              });
              const orphans = children.filter((r: any) => !parents.find((p: any) => (p.ls ?? p).id === (r.ls ?? r).parentId));
              if (orphans.length > 0) {
                items.push(<SelectSeparator key="orphan-sep" />);
                orphans.forEach((o: any) => {
                  const item = o.ls ?? o;
                  items.push(<SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>);
                });
              }
              return items;
            })()}
          </SelectContent>
        </Select>
      </div>

      {/* Date filters */}
      {showDateFilters && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 p-3 rounded-lg border bg-muted/30">
          <div>
            <Label className="text-xs mb-1 block">Contract From</Label>
            <Input type="date" value={contractDateFrom} onChange={(e) => { setContractDateFrom(e.target.value); setTxPage(1); }} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Contract To</Label>
            <Input type="date" value={contractDateTo} onChange={(e) => { setContractDateTo(e.target.value); setTxPage(1); }} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Closing From</Label>
            <Input type="date" value={closingDateFrom} onChange={(e) => { setClosingDateFrom(e.target.value); setTxPage(1); }} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Closing To</Label>
            <Input type="date" value={closingDateTo} onChange={(e) => { setClosingDateTo(e.target.value); setTxPage(1); }} className="h-8 text-xs" />
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Contact</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Property</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Agent</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Type</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">Price</th>
                  <th className="text-right py-3 px-4 text-muted-foreground font-medium">GCI</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Closing</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>No transactions found</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(({ transaction, contact, agent, property }: any) => (
                    <tr key={transaction.id} className="border-b last:border-0 hover:bg-muted/20 cursor-pointer" onClick={() => navigate(`/transactions/${transaction.id}`)}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-foreground">{contact?.firstName} {contact?.lastName}</p>
                          {transaction.payoutIntegrityFlag && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{property?.address ?? <span className="italic text-muted-foreground/50">No property</span>}</td>
                      <td className="py-3 px-4 text-muted-foreground">{agent?.name ?? "—"}</td>
                      <td className="py-3 px-4 text-muted-foreground capitalize">{transaction.transactionType}</td>
                      <td className="py-3 px-4 text-right">{formatCurrency(transaction.purchasePrice)}</td>
                      <td className="py-3 px-4 text-right font-medium text-emerald-600">{formatCurrency(transaction.grossCommissionIncome)}</td>
                      <td className="py-3 px-4">
                        <TransactionStatusBadge status={transaction.status} />
                        {transaction.status === "terminated" && transaction.terminationReason && (
                          <p className="text-xs text-red-600 mt-0.5 truncate max-w-[180px]" title={transaction.terminationReason}>
                            {transaction.terminationReason}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">{transaction.closingDate ? safeFormat(transaction.closingDate, "MMM d, yyyy") : "—"}</td>
                      <td className="py-3 px-4"><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/transactions/${transaction.id}`); }}>View</Button></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {txTotalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Showing {((txPage - 1) * 25) + 1}–{Math.min(txPage * 25, txTotal)} of {txTotal} transactions
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={txPage <= 1} onClick={() => setTxPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground flex items-center px-2">Page {txPage} of {txTotalPages}</span>
            <Button size="sm" variant="outline" disabled={txPage >= txTotalPages} onClick={() => setTxPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Create Transaction Dialog ─────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) resetDialog(); setOpen(v); }}>
        <DialogContent className="max-w-xl w-[calc(100vw-2rem)] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {wizardStep === 1 && "Step 1 of 3 — Transaction Type"}
              {wizardStep === 2 && "Step 2 of 3 — Contacts & Property"}
              {wizardStep === 3 && "Step 3 of 3 — Transaction Details"}
            </DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-1 mb-2">
            {[1,2,3].map((s) => (
              <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= wizardStep ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>

          {/* ── Step 1: Mode selector ── */}
          {wizardStep === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">What type of transaction is this?</p>
              <div className="grid gap-2">
                {(["buy","sell","dual"] as TxMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setForm(prev => ({ ...prev, mode: m }))}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${form.mode === m ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                  >
                    <div className="flex items-center gap-2">
                      {form.mode === m && <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />}
                      {form.mode !== m && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground flex-shrink-0" />}
                      <div>
                        <p className="font-semibold text-sm">{modeLabels[m]}</p>
                        <p className="text-xs text-muted-foreground">{modeDescriptions[m]}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { resetDialog(); setOpen(false); }}>Cancel</Button>
                <Button onClick={() => setWizardStep(2)}>Next →</Button>
              </DialogFooter>
            </div>
          )}

          {/* ── Step 2: Contacts + Property + Agent ── */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              {/* Buyer contact */}
              {(form.mode === "buy" || form.mode === "dual") && (
                <ContactPicker
                  label={form.mode === "dual" ? "Buyer Contact" : "Contact (Buyer)"}
                  required
                  value={buyerContact}
                  onChange={setBuyerContact}
                  excludeContactId={sellerContact?.id}
                />
              )}

              {/* Seller contact */}
              {(form.mode === "sell" || form.mode === "dual") && (
                <ContactPicker
                  label={form.mode === "dual" ? "Seller Contact" : "Contact (Seller)"}
                  required
                  value={sellerContact}
                  onChange={setSellerContact}
                  excludeContactId={buyerContact?.id}
                />
              )}

              {/* Dual: warn if same contact */}
              {form.mode === "dual" && buyerContact && sellerContact && buyerContact.id === sellerContact.id && (
                <div className="text-sm text-red-500 flex items-center gap-1.5 p-2 bg-red-50 rounded-md">
                  <AlertTriangle className="h-4 w-4" />
                  Buyer and seller cannot be the same contact
                </div>
              )}

              {/* Listing picker for sell/dual */}
              {(form.mode === "sell" || form.mode === "dual") && (
                <div>
                  <Label>Linked Listing <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                  {selectedListing ? (
                    <div className="mt-1 p-2 rounded-md bg-primary/10 text-sm flex items-center justify-between">
                      <span className="font-medium">
                        {selectedListing.address || `Listing #${selectedListing.id}`}
                        {selectedListing.listPrice && <span className="text-muted-foreground ml-2 text-xs">{formatCurrency(selectedListing.listPrice)}</span>}
                      </span>
                      <button className="text-xs text-primary hover:underline" onClick={() => { setSelectedListing(null); setListingSearch(""); }}>Change</button>
                    </div>
                  ) : (
                    <>
                      <div className="relative mt-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search active listings..."
                          value={listingSearch}
                          onChange={(e) => setListingSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                      {listingSearch.length >= 2 && (
                        <div className="border rounded-md mt-1 max-h-40 overflow-y-auto">
                          {listings.length === 0 ? (
                            <p className="text-sm text-muted-foreground p-3">No listings found</p>
                          ) : (
                            listings.slice(0, 10).map((l: any) => (
                              <button
                                key={l.listing.id}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b last:border-0"
                                onClick={() => {
                                  setSelectedListing({ id: l.listing.id, address: l.property?.address || l.listing.address, listPrice: l.listing.listPrice });
                                  setListingSearch(l.property?.address || l.listing.address || `Listing #${l.listing.id}`);
                                }}
                              >
                                <span className="font-medium">{l.property?.address || l.listing.address || `Listing #${l.listing.id}`}</span>
                                {l.listing.listPrice && <span className="text-muted-foreground ml-2 text-xs">{formatCurrency(l.listing.listPrice)}</span>}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Property picker */}
              <PropertyPicker value={selectedProperty} onChange={setSelectedProperty} />

              {/* Agent picker (admin only) */}
              {isAdmin ? (
                <div>
                  <Label>Agent *</Label>
                  {selectedAgent ? (
                    <div className="mt-1 p-2 rounded-md bg-primary/10 text-sm flex items-center justify-between">
                      <span className="font-medium">{selectedAgent.name ?? selectedAgent.email}</span>
                      <button className="text-xs text-primary hover:underline" onClick={() => { setSelectedAgent(null); setAgentSearch(""); }}>Change</button>
                    </div>
                  ) : (
                    <>
                      <div className="relative mt-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search agents..."
                          value={agentSearch}
                          onChange={(e) => setAgentSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                      {agentSearch && (
                        <div className="border rounded-md mt-1 max-h-40 overflow-y-auto">
                          {filteredAgents.length === 0 ? (
                            <p className="text-sm text-muted-foreground p-3">No agents found</p>
                          ) : (
                            filteredAgents.slice(0, 10).map((a: any) => (
                              <button
                                key={a.id}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b last:border-0"
                                onClick={() => { setSelectedAgent(a); setAgentSearch(a.name ?? a.email); }}
                              >
                                {a.name ?? a.email}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <Label>Agent</Label>
                  <div className="mt-1 px-3 py-2 rounded-md border bg-muted text-sm text-muted-foreground">
                    {user?.name ?? "You (current user)"}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setWizardStep(1)}>← Back</Button>
                <Button onClick={() => setWizardStep(3)} disabled={!canAdvanceStep1()}>
                  Next →
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* ── Step 3: Transaction Details ── */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="p-2.5 rounded-md bg-muted text-sm space-y-0.5">
                <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-1">Summary</p>
                <p><span className="font-medium">Type:</span> {modeLabels[form.mode]}</p>
                {buyerContact && <p><span className="font-medium">Buyer:</span> {buyerContact.firstName} {buyerContact.lastName}</p>}
                {sellerContact && <p><span className="font-medium">Seller:</span> {sellerContact.firstName} {sellerContact.lastName}</p>}
                {selectedProperty && <p><span className="font-medium">Property:</span> {selectedProperty.address}</p>}
                {selectedListing && <p><span className="font-medium">Listing:</span> {selectedListing.address}</p>}
                {selectedAgent && <p><span className="font-medium">Agent:</span> {selectedAgent.name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => updateForm("status", v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="under_contract">Under Contract</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Purchase Price</Label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                    <Input
                      className="pl-7"
                      placeholder="450,000"
                      value={form.purchasePrice}
                      onChange={(e) => updateForm("purchasePrice", parseCurrencyInput(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Contract Date</Label>
                  <Input className="mt-1" type="date" value={form.contractDate} onChange={(e) => updateForm("contractDate", e.target.value)} />
                </div>
                <div>
                  <Label>Closing Date</Label>
                  <Input className="mt-1" type="date" value={form.closingDate} onChange={(e) => updateForm("closingDate", e.target.value)} />
                </div>
              </div>

              {/* Buy side commission */}
              {(form.mode === "buy" || form.mode === "dual") && (
                <CommissionFields
                  label={form.mode === "dual" ? "Buyer Side Commission" : "Commission"}
                  commissionType={form.buyCommissionType}
                  commissionRate={form.buyCommissionRate}
                  gci={form.buyGci}
                  gciManuallyEdited={form.buyGciManuallyEdited}
                  purchasePrice={form.purchasePrice}
                  onTypeChange={(v) => updateForm("buyCommissionType", v)}
                  onRateChange={(v) => updateForm("buyCommissionRate", v)}
                  onGciChange={(v) => updateForm("buyGci", v)}
                  onGciManualChange={(manual) => updateForm("buyGciManuallyEdited", manual)}
                />
              )}

              {/* Sell side commission */}
              {(form.mode === "sell" || form.mode === "dual") && (
                <CommissionFields
                  label={form.mode === "dual" ? "Seller Side Commission" : "Commission"}
                  commissionType={form.sellCommissionType}
                  commissionRate={form.sellCommissionRate}
                  gci={form.sellGci}
                  gciManuallyEdited={form.sellGciManuallyEdited}
                  purchasePrice={form.purchasePrice}
                  onTypeChange={(v) => updateForm("sellCommissionType", v)}
                  onRateChange={(v) => updateForm("sellCommissionRate", v)}
                  onGciChange={(v) => updateForm("sellGci", v)}
                  onGciManualChange={(manual) => updateForm("sellGciManuallyEdited", manual)}
                />
              )}

              <div>
                <Label>Notes</Label>
                <textarea
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={3}
                  placeholder="Internal notes about this transaction..."
                  value={form.notes}
                  onChange={(e) => updateForm("notes", e.target.value)}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setWizardStep(2)}>← Back</Button>
                <Button onClick={handleCreate} disabled={create.isPending}>
                  {create.isPending ? "Creating..." : `Create ${modeLabels[form.mode]} Transaction`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Upload Dialog ─────────────────────────────────────────────── */}
      <Dialog open={bulkOpen} onOpenChange={(v) => { if (!v) resetBulkUpload(); setBulkOpen(v); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" /> Bulk Upload Transactions
            </DialogTitle>
          </DialogHeader>

          {bulkStep === "upload" && (
            <div className="space-y-5">
              <div className="rounded-lg border border-dashed border-muted-foreground/40 bg-muted/20 p-6 text-center">
                <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium mb-1">Upload a CSV file to import transactions</p>
                <p className="text-xs text-muted-foreground mb-4">All rows will be validated before import. Commission payouts are auto-calculated.</p>
                <input
                  ref={bulkFileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  id="bulk-tx-file"
                  onChange={handleBulkFileChange}
                />
                <label htmlFor="bulk-tx-file">
                  <Button asChild size="sm"><span>Choose CSV File</span></Button>
                </label>
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Need a template?</p>
                  <p className="text-xs text-muted-foreground">Download the CSV template with all required columns and example data.</p>
                </div>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-1" /> Download Template
                </Button>
              </div>
              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Required Columns</p>
                <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  {["transaction_type","status","agent_email","primary_contact_first_name","primary_contact_last_name"].map(c => (
                    <span key={c} className="font-mono bg-muted rounded px-1.5 py-0.5">{c}</span>
                  ))}
                </div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 mt-3">Optional Columns</p>
                <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  {["transaction_number","purchase_price","commission_rate_pct","gci","agent_split_pct","group_leader_split_pct","referral_source_name","referral_payout_pct","contract_date","closing_date","property_address","notes"].map(c => (
                    <span key={c} className="font-mono bg-muted rounded px-1.5 py-0.5">{c}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {bulkStep === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{bulkPreview.length}</span> rows parsed from <span className="font-mono text-xs">{bulkFile?.name}</span>
                </p>
                <Button variant="ghost" size="sm" onClick={() => { setBulkStep("upload"); setBulkPreview([]); setBulkFile(null); if (bulkFileRef.current) bulkFileRef.current.value = ""; }}>
                  ← Change File
                </Button>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      {["Row","Type","Status","Agent Email","Contact","Purchase Price","GCI","Agent Split","Contract Date","Closing Date"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {bulkPreview.slice(0, 20).map((row) => (
                      <tr key={row.rowIndex} className="hover:bg-muted/20">
                        <td className="px-3 py-2 text-muted-foreground">{row.rowIndex}</td>
                        <td className="px-3 py-2">{row.transaction_type || <span className="text-destructive">—</span>}</td>
                        <td className="px-3 py-2">{row.status || <span className="text-destructive">—</span>}</td>
                        <td className="px-3 py-2 font-mono">{row.agent_email || <span className="text-destructive">—</span>}</td>
                        <td className="px-3 py-2">{[row.primary_contact_first_name, row.primary_contact_last_name].filter(Boolean).join(" ") || <span className="text-destructive">—</span>}</td>
                        <td className="px-3 py-2">{row.purchase_price ? `$${parseFloat(row.purchase_price.replace(/[$,]/g,"")).toLocaleString()}` : "—"}</td>
                        <td className="px-3 py-2">{row.gci ? `$${parseFloat(row.gci.replace(/[$,]/g,"")).toLocaleString()}` : "—"}</td>
                        <td className="px-3 py-2">{row.agent_split_pct ? `${row.agent_split_pct}%` : "—"}</td>
                        <td className="px-3 py-2">{row.contract_date || "—"}</td>
                        <td className="px-3 py-2">{row.closing_date || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {bulkPreview.length > 20 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/20">
                    Showing first 20 of {bulkPreview.length} rows. All rows will be imported.
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setBulkStep("upload"); setBulkPreview([]); setBulkFile(null); if (bulkFileRef.current) bulkFileRef.current.value = ""; }}>Cancel</Button>
                <Button onClick={handleBulkSubmit} disabled={bulkUpload.isPending || bulkPreview.length === 0}>
                  {bulkUpload.isPending ? "Importing..." : `Import ${bulkPreview.length} Rows`}
                </Button>
              </DialogFooter>
            </div>
          )}

          {bulkStep === "results" && bulkResults && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-3 text-center">
                  <CheckCircle className="mx-auto h-6 w-6 text-green-600 mb-1" />
                  <p className="text-2xl font-bold text-green-700">{bulkResults.succeeded}</p>
                  <p className="text-xs text-green-600">Imported</p>
                </div>
                <div className="rounded-lg border bg-red-50 dark:bg-red-950/20 p-3 text-center">
                  <XCircle className="mx-auto h-6 w-6 text-red-500 mb-1" />
                  <p className="text-2xl font-bold text-red-600">{bulkResults.failed}</p>
                  <p className="text-xs text-red-500">Failed</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <FileText className="mx-auto h-6 w-6 text-muted-foreground mb-1" />
                  <p className="text-2xl font-bold">{bulkResults.total}</p>
                  <p className="text-xs text-muted-foreground">Total Rows</p>
                </div>
              </div>

              {/* Per-row results */}
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {bulkResults.results.map((r: any) => (
                  <div key={r.rowIndex} className={`rounded-lg border px-3 py-2.5 text-sm ${
                    r.success ? "border-green-200 bg-green-50/50 dark:bg-green-950/10" : "border-red-200 bg-red-50/50 dark:bg-red-950/10"
                  }`}>
                    <div className="flex items-center gap-2">
                      {r.success
                        ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                        : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                      <span className="font-medium">Row {r.rowIndex}</span>
                      {r.success && r.transactionNumber && (
                        <span className="text-xs text-muted-foreground font-mono">{r.transactionNumber}</span>
                      )}
                    </div>
                    {r.errors.length > 0 && (
                      <ul className="mt-1.5 ml-6 space-y-0.5">
                        {r.errors.map((e: string, i: number) => (
                          <li key={i} className="text-xs text-red-600 flex items-start gap-1">
                            <XCircle className="h-3 w-3 mt-0.5 shrink-0" /> {e}
                          </li>
                        ))}
                      </ul>
                    )}
                    {r.warnings.length > 0 && (
                      <ul className="mt-1.5 ml-6 space-y-0.5">
                        {r.warnings.map((w: string, i: number) => (
                          <li key={i} className="text-xs text-amber-600 flex items-start gap-1">
                            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> {w}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              <DialogFooter>
                {bulkResults.failed > 0 && (
                  <Button variant="outline" onClick={() => setBulkStep("preview")}>
                    ← Back to Preview
                  </Button>
                )}
                <Button onClick={() => { resetBulkUpload(); setBulkOpen(false); }}>Done</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
