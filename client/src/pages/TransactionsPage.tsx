import { useEffect, useState, useCallback, useRef } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import { TransactionStatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import { Plus, FileText, AlertTriangle, Search, ChevronLeft, ChevronRight, Home, User, DollarSign, CheckCircle2, Upload, Download, CheckCircle, XCircle, AlertCircle, ArrowUpAZ, ArrowDownAZ, ChevronDown, BarChart2, TrendingUp, Settings2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { safeFormat } from "@/lib/safeFormat";
import { formatPhone as _formatPhone, parseCurrencyInput as _parseCurrencyInput, isValidEmail, isValidPhone } from "@/lib/inputFormatters";
import LeadSourcePicker from "@/components/LeadSourcePicker";

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
  const { user } = useAuth();
  const requiresPhone = user?.role === "agent";
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newLeadSourceId, setNewLeadSourceId] = useState<number | null>(null);

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
      setNewFirst(""); setNewLast(""); setNewEmail(""); setNewPhone(""); setNewLeadSourceId(null);
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
            <Label className="text-xs">Phone {requiresPhone && <span className="text-destructive">*</span>}</Label>
            <Input className="mt-0.5 h-8 text-sm" value={newPhone} onChange={(e) => setNewPhone(formatPhoneDisplay(e.target.value))} placeholder="e.g. 5551234567" />
          </div>
          <div>
            <Label className="text-xs">Lead Source <span className="text-destructive">*</span></Label>
            <LeadSourcePicker
              className="mt-0.5"
              value={newLeadSourceId}
              onChange={(id) => setNewLeadSourceId(id)}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!newFirst || !newLast || !newLeadSourceId || createContact.isPending || (requiresPhone && !newPhone.trim())}
              onClick={() => {
                if (!newLeadSourceId) { toast.error("Lead source is required \u2014 every contact needs a source for attribution."); return; }
                if (requiresPhone && !newPhone.trim()) { toast.error("A phone number is required when adding a contact"); return; }
                if (newEmail && !isValidEmail(newEmail)) { toast.error("Please enter a valid email address"); return; }
                if (newPhone && !isValidPhone(newPhone)) { toast.error("Please enter a valid phone number (9+ digits)"); return; }
                createContact.mutate({
                  firstName: newFirst,
                  lastName: newLast,
                  email: newEmail || undefined,
                  phone: newPhone || undefined,
                  leadSourceId: newLeadSourceId,
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
      <Label>Property <span className="text-destructive">*</span></Label>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">City *</Label>
              <Input className="mt-0.5 h-8 text-sm" value={newCity} onChange={(e) => setNewCity(e.target.value)} placeholder="e.g. Glendale" />
            </div>
            <div>
              <Label className="text-xs">State *</Label>
              <Input className="mt-0.5 h-8 text-sm" value={newState} onChange={(e) => setNewState(e.target.value)} placeholder="e.g. UT" maxLength={2} />
            </div>
            <div>
              <Label className="text-xs">ZIP *</Label>
              <Input className="mt-0.5 h-8 text-sm" value={newZip} onChange={(e) => setNewZip(e.target.value)} placeholder="e.g. 84729" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!newAddress || !newCity || !newState || !newZip || createProperty.isPending}
              onClick={() => createProperty.mutate({ address: newAddress, city: newCity, state: newState, zip: newZip })}
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
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = (user as any)?.role === "admin";
  const { data: adminPermissions } = trpc.permissions.getMyPermissions.useQuery(
    undefined,
    { enabled: isAdmin, staleTime: 30000 },
  );
  const canViewTransactionExports = !!(adminPermissions as Record<string, boolean> | undefined)?.canViewTransactionExports;

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
  const [statusFilter, setStatusFilter] = usePersistentState("transactions.statusFilter", "all");
  const [marketFilter, setMarketFilter] = usePersistentState("transactions.marketFilter", "all");
  const [agentFilter, setAgentFilter] = usePersistentState("transactions.agentFilter", "all");
  const [txSearch, setTxSearch] = usePersistentState("transactions.search", "");
  const [txPage, setTxPage] = usePersistentState("transactions.page", 1);
  const [closingDateFrom, setClosingDateFrom] = usePersistentState("transactions.closingDateFrom", "");
  const [closingDateTo, setClosingDateTo] = usePersistentState("transactions.closingDateTo", "");
  const [contractDateFrom, setContractDateFrom] = usePersistentState("transactions.contractDateFrom", "");
  const [contractDateTo, setContractDateTo] = usePersistentState("transactions.contractDateTo", "");
  const [showDateFilters, setShowDateFilters] = usePersistentState("transactions.showDateFilters", false);
  const [leadSourceFilter, setLeadSourceFilter] = usePersistentState("transactions.leadSourceFilter", "all");
  const [typeFilter, setTypeFilter] = usePersistentState("transactions.typeFilter", "all");
  const [sortOrder, setSortOrder] = usePersistentState<"asc" | "desc">("transactions.sortOrder", "desc");
  const [sortColumn, setSortColumn] = usePersistentState<string>("transactions.sortColumn", "closing_date");
  const [aggregateMode, setAggregateMode] = usePersistentState<"sum" | "avg" | "median" | "count">("transactions.aggregateMode", "sum");
  const [txLimit, setTxLimit] = usePersistentState<number>("transactions.limit", 25);
  const [visibleColumns, setVisibleColumns] = usePersistentState<string[]>("transactions.visibleColumns", ["contact", "property", "agent", "type", "price", "gci", "savvy_net", "status", "closing_date", "date_added"]);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [flagNoClosingDate, setFlagNoClosingDate] = useState(false);
  const [flagPastClosingDate, setFlagPastClosingDate] = useState(false);
  const [flagPayoutIntegrity, setFlagPayoutIntegrity] = useState(false);
  const [groupLeaderId, setGroupLeaderId] = useState<number | undefined>(undefined);
  const [includeLeaderStats, setIncludeLeaderStats] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [applyStatsToAll, setApplyStatsToAll] = useState(false);
  const appliedAnalyticsLink = useRef<string | null>(null);
  // Wouter's location value is the pathname in this app, so query-string state
  // must be read from the browser URL. Analytics evidence links intentionally
  // take precedence over persisted list filters on their initial load.
  const analyticsQuery = typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "";
  const analyticsReturnUrl = (() => {
    const candidate = new URLSearchParams(analyticsQuery).get("returnTo");
    return candidate && candidate.startsWith("/analytics") && !candidate.startsWith("//") ? candidate : null;
  })();

  // Analytics uses this small, explicit URL contract to send users to the
  // canonical operational Transactions page. The URL is intentionally applied
  // once per distinct link so subsequent local filter changes remain under the
  // user’s control and no navigation/render loop is introduced.
  useEffect(() => {
    const query = analyticsQuery;
    const params = new URLSearchParams(query);
    if (params.get("analytics") !== "1" || appliedAnalyticsLink.current === query) return;

    const date = (key: string) => {
      const value = params.get(key) ?? "";
      return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
    };
    const identifier = (key: string) => {
      const value = params.get(key) ?? "";
      return /^\d+$/.test(value) ? value : "all";
    };
    const nextStatus = params.get("status") ?? "all";
    const permittedStatuses = ["all", "closed", "under_contract", "terminated"];
    const nextClosingFrom = date("closingDateFrom");
    const nextClosingTo = date("closingDateTo");
    const nextContractFrom = date("contractDateFrom");
    const nextContractTo = date("contractDateTo");
    const nextType = params.get("transactionType") ?? "all";
    const permittedTypes = ["all", "buyer", "seller", "dual"];
    const flag = (key: string) => params.get(key) === "true";

    setStatusFilter(permittedStatuses.includes(nextStatus) ? nextStatus : "all");
    setMarketFilter(identifier("marketId"));
    setAgentFilter(identifier("agentId"));
    setLeadSourceFilter(identifier("leadSourceId"));
    setTypeFilter(permittedTypes.includes(nextType) ? nextType : "all");
    setFlagNoClosingDate(flag("flagNoClosingDate"));
    setFlagPastClosingDate(flag("flagPastClosingDate"));
    setFlagPayoutIntegrity(flag("flagPayoutIntegrity"));
    setGroupLeaderId(/^\d+$/.test(params.get("groupLeaderId") ?? "") ? Number(params.get("groupLeaderId")) : undefined);
    setIncludeLeaderStats(flag("includeLeaderStats"));
    setClosingDateFrom(nextClosingFrom);
    setClosingDateTo(nextClosingTo);
    setContractDateFrom(nextContractFrom);
    setContractDateTo(nextContractTo);
    setShowDateFilters(Boolean(nextClosingFrom || nextClosingTo || nextContractFrom || nextContractTo));
    setTxPage(1);
    appliedAnalyticsLink.current = query;
  }, [analyticsQuery, location, setAgentFilter, setClosingDateFrom, setClosingDateTo, setContractDateFrom, setContractDateTo, setLeadSourceFilter, setMarketFilter, setShowDateFilters, setStatusFilter, setTxPage, setTypeFilter]);

  function handleColumnSort(col: string) {
    if (sortColumn === col) {
      setSortOrder(o => o === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(col);
      setSortOrder("desc");
    }
    setTxPage(1);
  }

  function SortIcon({ col }: { col: string }) {
    if (sortColumn !== col) return <span className="ml-1 opacity-30 text-xs">↕</span>;
    return <span className="ml-1 text-xs">{sortOrder === "asc" ? "↑" : "↓"}</span>;
  }

  function calcAggregate(values: number[], mode: typeof aggregateMode): string {
    const nums = values.filter(n => !isNaN(n) && isFinite(n));
    if (nums.length === 0) return "—";
    if (mode === "count") return nums.length.toLocaleString();
    if (mode === "sum") {
      const s = nums.reduce((a, b) => a + b, 0);
      return `$${Math.round(s).toLocaleString()}`;
    }
    if (mode === "avg") {
      const a = nums.reduce((a, b) => a + b, 0) / nums.length;
      return `$${Math.round(a).toLocaleString()}`;
    }
    if (mode === "median") {
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const m = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      return `$${Math.round(m).toLocaleString()}`;
    }
    return "—";
  }

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
    page: txPage, limit: txLimit, marketId: marketIdParam, search: txSearch || undefined, status: statusParam,
    agentId: agentIdParam,
    contractDateFrom: contractDateFrom || undefined,
    contractDateTo: contractDateTo || undefined,
    closingDateFrom: closingDateFrom || undefined,
    closingDateTo: closingDateTo || undefined,
    leadSourceId: leadSourceIdParam,
    flagNoClosingDate,
    flagPastClosingDate,
    flagPayoutIntegrity,
    groupLeaderId,
    includeLeaderStats,
    transactionType: typeParam,
    sortOrder,
    sortBy: sortColumn,
  });
  const { data: markets = [] } = trpc.markets.list.useQuery();
  const { data: leadSourcesData } = trpc.leadSources.list.useQuery();
  const leadSourcesList = (leadSourcesData ?? []) as any[];
  const transactions = transactionsData?.rows ?? [];
  const txTotal = transactionsData?.total ?? 0;
  const txTotalPages = Math.ceil(txTotal / txLimit);
  // Whether pagination is truncating results (total > what's shown on this page)
  const isPaginated = txTotal > txLimit;
  // Stats query — fires when admin and (stats panel open, applyStatsToAll, or results are paginated)
  const statsFilters = {
    agentId: agentIdParam,
    status: statusParam as any,
    transactionType: typeParam as any,
    search: txSearch || undefined,
    marketId: marketIdParam,
    contractDateFrom: contractDateFrom || undefined,
    contractDateTo: contractDateTo || undefined,
    closingDateFrom: closingDateFrom || undefined,
    closingDateTo: closingDateTo || undefined,
    leadSourceId: leadSourceIdParam,
    flagNoClosingDate,
    flagPastClosingDate,
    flagPayoutIntegrity,
    groupLeaderId,
    includeLeaderStats,
  };
  const { data: txStats, isFetching: statsFetching } = trpc.transactions.stats.useQuery(
    statsFilters,
    { enabled: isAdmin && (statsOpen || applyStatsToAll || isPaginated) }
  );
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
    if (form.mode === "buy") return !!buyerContact && !!selectedProperty && (!isAdmin || !!selectedAgent);
    if (form.mode === "sell") return !!sellerContact && !!selectedProperty && (!isAdmin || !!selectedAgent);
    if (form.mode === "dual") return !!buyerContact && !!sellerContact && buyerContact.id !== sellerContact.id && !!selectedProperty && (!isAdmin || !!selectedAgent);
    return false;
  }, [form.mode, buyerContact, sellerContact, selectedProperty, selectedAgent, isAdmin]);

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
    if (!selectedProperty) {
      toast.error("A property is required before creating this transaction");
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
          <div className="flex gap-2">
            {analyticsReturnUrl && (
              <Button variant="outline" size="sm" onClick={() => navigate(analyticsReturnUrl)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back to report
              </Button>
            )}
            {user?.role !== "agent" && (
              <div className="flex gap-2">
                {isAdmin && canViewTransactionExports && (
                  <Button variant="outline" size="sm" onClick={() => navigate("/transaction-reporting")}>
                    <Download className="h-4 w-4 mr-1" /> Transaction Exports
                  </Button>
                )}
                {isAdmin && (
                  <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
                    <Upload className="h-4 w-4 mr-1" /> Bulk Upload
                  </Button>
                )}
                <Button onClick={() => { resetDialog(); setOpen(true); }} size="sm">
                  <Plus className="h-4 w-4 mr-1" /> New Transaction
                </Button>
              </div>
            )}
          </div>
        }
      />

      {/* Search bar + Clear Filters */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by transaction number, contact name..."
            value={txSearch}
            onChange={(e) => { setTxSearch(e.target.value); setTxPage(1); }}
            className="pl-9"
          />
        </div>
        {(statusFilter !== "all" || typeFilter !== "all" || agentFilter !== "all" || marketFilter !== "all" || leadSourceFilter !== "all" || groupLeaderId || flagNoClosingDate || flagPastClosingDate || flagPayoutIntegrity || txSearch || closingDateFrom || closingDateTo || contractDateFrom || contractDateTo) && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setStatusFilter("all"); setTypeFilter("all"); setAgentFilter("all");
              setMarketFilter("all"); setLeadSourceFilter("all"); setTxSearch("");
              setClosingDateFrom(""); setClosingDateTo(""); setContractDateFrom(""); setContractDateTo("");
              setFlagNoClosingDate(false); setFlagPastClosingDate(false); setFlagPayoutIntegrity(false);
              setGroupLeaderId(undefined); setIncludeLeaderStats(false);
              setShowDateFilters(false); setTxPage(1);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Status filters */}
      <div className="flex gap-2 flex-wrap mb-3">
        {["all","under_contract","closed","terminated"].map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(s);
              // A closed-production view defaults to the same YTD closing-date
              // scope as the Admin Dashboard. Explicit date filters are never
              // overwritten, so users retain control of historical research.
              if (s === "closed" && !closingDateFrom && !closingDateTo && !contractDateFrom && !contractDateTo) {
                const today = new Date().toISOString().slice(0, 10);
                setClosingDateFrom(`${today.slice(0, 4)}-01-01`);
                setClosingDateTo(today);
                setShowDateFilters(true);
              }
              setTxPage(1);
            }}
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
          <SearchableSelect
            className="w-full sm:w-48"
            options={[{ value: "all", label: "All Agents" }, ...(agents as any[] ?? []).map((a: any) => ({ value: String(a.id), label: a.name ?? `Agent #${a.id}` }))]}
            value={agentFilter}
            onValueChange={(v) => { setAgentFilter(v); setTxPage(1); }}
            placeholder="Filter by Agent"
            searchPlaceholder="Search agents…"
          />
        )}
        {isAdmin && (markets as any[]).length > 0 && (
          <SearchableSelect
            className="w-full sm:w-48"
            options={[{ value: "all", label: "All Markets" }, ...(markets as any[]).map((m: any) => ({ value: String(m.id), label: m.name }))]}
            value={marketFilter}
            onValueChange={(v) => { setMarketFilter(v); setTxPage(1); }}
            placeholder="Filter by Market"
            searchPlaceholder="Search markets…"
          />
        )}
        <SearchableSelect
          className="w-full sm:w-48"
          options={[
            { value: "all", label: "All Lead Sources" },
            ...(() => {
              const all = leadSourcesList as any[];
              const flat: { value: string; label: string; description?: string }[] = [];
              const parents = all.filter((r: any) => !(r.ls ?? r).parentId);
              const children = all.filter((r: any) => !!(r.ls ?? r).parentId);
              parents.forEach((pRow: any) => {
                const p = pRow.ls ?? pRow;
                const subs = children.filter((r: any) => (r.ls ?? r).parentId === p.id);
                if (subs.length > 0) {
                  subs.forEach((cRow: any) => {
                    const c = cRow.ls ?? cRow;
                    flat.push({ value: String(c.id), label: c.name, description: p.name });
                  });
                } else {
                  flat.push({ value: String(p.id), label: p.name });
                }
              });
              return flat;
            })()
          ]}
          value={leadSourceFilter}
          onValueChange={(v) => { setLeadSourceFilter(v); setTxPage(1); }}
          placeholder="Filter by Lead Source"
          searchPlaceholder="Search lead sources…"
        />
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

      {/* ─── Stats Panel (admin only) ──────────────────────────────────────────── */}
      {isAdmin && (
        <div className="mb-4 rounded-lg border bg-card shadow-sm">
          {/* Header / toggle */}
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/30 transition-colors rounded-lg"
            onClick={() => setStatsOpen(o => !o)}
          >
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-primary" />
              <span>Transaction Stats</span>
              {txTotal > 0 && (
                <span className="text-xs text-muted-foreground font-normal">
                  {isPaginated && !applyStatsToAll
                    ? `— showing page stats (${filtered.length} of ${txTotal.toLocaleString()} transactions)`
                    : `— ${txTotal.toLocaleString()} transaction${txTotal !== 1 ? "s" : ""}`}
                </span>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${statsOpen ? "rotate-180" : ""}`} />
          </button>

          {statsOpen && (
            <div className="border-t px-4 pb-4 pt-3 space-y-4">
              {/* Apply to all checkbox */}
              {isPaginated && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="applyStatsToAll"
                    checked={applyStatsToAll}
                    onCheckedChange={(v) => setApplyStatsToAll(!!v)}
                  />
                  <label htmlFor="applyStatsToAll" className="text-sm cursor-pointer select-none">
                    Apply to all <span className="font-semibold">{txTotal.toLocaleString()}</span> matching transactions
                  </label>
                  {statsFetching && <span className="text-xs text-muted-foreground animate-pulse">Loading…</span>}
                </div>
              )}

              {/* Determine which data to show */}
              {(() => {
                const useAll = applyStatsToAll && txStats;
                const fmt = (n: number | undefined) => n == null ? "—" : `$${Math.round(n).toLocaleString()}`;
                const fmtPct = (n: number | undefined) => n == null || n === 0 ? "—" : `${n.toFixed(2)}%`;
                const fmtN = (n: number | undefined) => n == null ? "—" : n.toLocaleString();

                // Page-level stats from filtered rows
                const pageTotal = filtered.length;
                const pageBuyer = filtered.filter(({ transaction }: any) => transaction.transactionType === "buyer").length;
                const pageSeller = filtered.filter(({ transaction }: any) => transaction.transactionType === "seller").length;
                const pageDual = filtered.filter(({ transaction }: any) => transaction.transactionType === "dual").length;
                const pagePrices = filtered.map(({ transaction }: any) => parseFloat(transaction.purchasePrice ?? "0")).filter(n => n > 0);
                const pageGcis = filtered.map(({ transaction }: any) => parseFloat(transaction.grossCommissionIncome ?? "0")).filter(n => n > 0);
                const pageBuyerPrices = filtered.filter(({ transaction }: any) => transaction.transactionType === "buyer").map(({ transaction }: any) => parseFloat(transaction.purchasePrice ?? "0")).filter(n => n > 0);
                const pageSellerPrices = filtered.filter(({ transaction }: any) => transaction.transactionType === "seller").map(({ transaction }: any) => parseFloat(transaction.purchasePrice ?? "0")).filter(n => n > 0);
                const pageBuyerGcis = filtered.filter(({ transaction }: any) => transaction.transactionType === "buyer").map(({ transaction }: any) => parseFloat(transaction.grossCommissionIncome ?? "0")).filter(n => n > 0);
                const pageSellerGcis = filtered.filter(({ transaction }: any) => transaction.transactionType === "seller").map(({ transaction }: any) => parseFloat(transaction.grossCommissionIncome ?? "0")).filter(n => n > 0);
                const pageRates = filtered.map(({ transaction }: any) => parseFloat(transaction.commissionRate ?? "0")).filter(n => n > 0);
                const pageBuyerRates = filtered.filter(({ transaction }: any) => transaction.transactionType === "buyer").map(({ transaction }: any) => parseFloat(transaction.commissionRate ?? "0")).filter(n => n > 0);
                const pageSellerRates = filtered.filter(({ transaction }: any) => transaction.transactionType === "seller").map(({ transaction }: any) => parseFloat(transaction.commissionRate ?? "0")).filter(n => n > 0);
                const pageSavvyNets = filtered.map(({ savvyNet }: any) => parseFloat(savvyNet ?? "0")).filter(n => n > 0);
                const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
                const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

                const stats = useAll ? {
                  total: txStats.total,
                  buyerCount: txStats.buyerCount,
                  sellerCount: txStats.sellerCount,
                  dualCount: txStats.dualCount,
                  avgPrice: txStats.avgPrice,
                  avgPriceBuyer: txStats.avgPriceBuyer,
                  avgPriceSeller: txStats.avgPriceSeller,
                  totalVolume: txStats.totalVolume,
                  totalGci: txStats.totalGci,
                  avgGci: txStats.avgGci,
                  avgGciBuyer: txStats.avgGciBuyer,
                  avgGciSeller: txStats.avgGciSeller,
                  avgRateAll: txStats.avgRateAll,
                  avgRateBuyer: txStats.avgRateBuyer,
                  avgRateSeller: txStats.avgRateSeller,
                  totalSavvyNet: txStats.totalSavvyNet,
                  closedCount: txStats.closedCount,
                  underContractCount: txStats.underContractCount,
                  terminatedCount: txStats.terminatedCount,
                } : {
                  total: pageTotal,
                  buyerCount: pageBuyer,
                  sellerCount: pageSeller,
                  dualCount: pageDual,
                  avgPrice: avg(pagePrices),
                  avgPriceBuyer: avg(pageBuyerPrices),
                  avgPriceSeller: avg(pageSellerPrices),
                  totalVolume: sum(pagePrices),
                  totalGci: sum(pageGcis),
                  avgGci: avg(pageGcis),
                  avgGciBuyer: avg(pageBuyerGcis),
                  avgGciSeller: avg(pageSellerGcis),
                  avgRateAll: avg(pageRates) * 100,
                  avgRateBuyer: avg(pageBuyerRates) * 100,
                  avgRateSeller: avg(pageSellerRates) * 100,
                  totalSavvyNet: sum(pageSavvyNets),
                  closedCount: filtered.filter(({ transaction }: any) => transaction.status === "closed").length,
                  underContractCount: filtered.filter(({ transaction }: any) => transaction.status === "under_contract").length,
                  terminatedCount: filtered.filter(({ transaction }: any) => transaction.status === "terminated").length,
                };

                return (
                  <div className="space-y-4">
                    {/* Top-level counts */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums">{fmtN(stats.total)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{fmtN(stats.closedCount)} closed · {fmtN(stats.underContractCount)} UC</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground">Buyer / Seller / Dual</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums">{fmtN(stats.buyerCount)} / {fmtN(stats.sellerCount)} / {fmtN(stats.dualCount)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {stats.total > 0 ? `${Math.round(stats.buyerCount / stats.total * 100)}% buyer` : "—"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground">Total Volume</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums">{fmt(stats.totalVolume)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Avg. {fmt(stats.avgPrice)}</p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                        <p className="text-xs text-emerald-700">Total GCI</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-800">{fmt(stats.totalGci)}</p>
                        <p className="text-xs text-emerald-700 mt-0.5">Avg. {fmt(stats.avgGci)}</p>
                      </div>
                    </div>

                    {/* Buyer vs Seller breakdown */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Buyer side */}
                      <div className="rounded-lg border p-3 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Buyer Side</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                          <div className="flex justify-between"><span className="text-muted-foreground">Count</span><span className="font-medium tabular-nums">{fmtN(stats.buyerCount)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Avg. Price</span><span className="font-medium tabular-nums">{fmt(stats.avgPriceBuyer)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Avg. GCI</span><span className="font-medium tabular-nums text-emerald-700">{fmt(stats.avgGciBuyer)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Avg. Commission</span><span className="font-medium tabular-nums">{fmtPct(stats.avgRateBuyer)}</span></div>
                        </div>
                      </div>
                      {/* Seller side */}
                      <div className="rounded-lg border p-3 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seller Side</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                          <div className="flex justify-between"><span className="text-muted-foreground">Count</span><span className="font-medium tabular-nums">{fmtN(stats.sellerCount)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Avg. Price</span><span className="font-medium tabular-nums">{fmt(stats.avgPriceSeller)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Avg. GCI</span><span className="font-medium tabular-nums text-emerald-700">{fmt(stats.avgGciSeller)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Avg. Commission</span><span className="font-medium tabular-nums">{fmtPct(stats.avgRateSeller)}</span></div>
                        </div>
                      </div>
                    </div>

                    {/* Commission rates + Savvy Net row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Avg. Commission Rate (All)</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">{fmtPct(stats.avgRateAll)}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Avg. Commission Rate (Buyer / Seller)</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">{fmtPct(stats.avgRateBuyer)} / {fmtPct(stats.avgRateSeller)}</p>
                      </div>
                      <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
                          <p className="text-xs text-blue-700">Total Savvy Net</p>
                        </div>
                        <p className="mt-1 text-lg font-semibold tabular-nums text-blue-800">{fmt(stats.totalSavvyNet)}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Column configuration */}
      <div className="flex justify-end mb-2">
        <div className="relative">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setColumnsMenuOpen(!columnsMenuOpen)}>
            <Settings2 className="h-3.5 w-3.5" />Columns
          </Button>
          {columnsMenuOpen && (
            <div className="absolute right-0 top-9 z-50 w-64 rounded-lg border bg-background p-3 shadow-lg">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Toggle columns</p>
              <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                {([
                  { id: "contact", label: "Contact" },
                  { id: "property", label: "Property" },
                  { id: "agent", label: "Agent" },
                  { id: "lead_source", label: "Lead Source" },
                  { id: "type", label: "Type" },
                  { id: "price", label: "Price" },
                  { id: "gci", label: "GCI" },
                  { id: "savvy_net", label: "Savvy Net" },
                  { id: "commission_rate", label: "Commission Rate" },
                  { id: "status", label: "Status" },
                  { id: "closing_date", label: "Closing Date" },
                  { id: "contract_date", label: "Contract Date" },
                  { id: "date_added", label: "Date Added" },
                  { id: "transaction_number", label: "Transaction #" },
                ] as const).map((col) => (
                  <label key={col.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 rounded px-1.5 py-1">
                    <input type="checkbox" className="rounded border-muted-foreground/30" checked={visibleColumns.includes(col.id)} onChange={(e) => { if (e.target.checked) { setVisibleColumns([...visibleColumns, col.id]); } else { setVisibleColumns(visibleColumns.filter(c => c !== col.id)); } }} />
                    {col.label}
                  </label>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t flex gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => setVisibleColumns(["contact", "property", "agent", "type", "price", "gci", "savvy_net", "status", "closing_date", "date_added"])}>Reset</Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => setVisibleColumns(["contact", "property", "agent", "lead_source", "type", "price", "gci", "savvy_net", "commission_rate", "status", "closing_date", "contract_date", "date_added", "transaction_number"])}>All</Button>
                <Button size="sm" className="h-7 text-xs flex-1" onClick={() => setColumnsMenuOpen(false)}>Done</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  {visibleColumns.includes("contact") && <th className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none" onClick={() => handleColumnSort("contact")}>Contact<SortIcon col="contact" /></th>}
                  {visibleColumns.includes("property") && <th className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none" onClick={() => handleColumnSort("property")}>Property<SortIcon col="property" /></th>}
                  {visibleColumns.includes("agent") && <th className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none" onClick={() => handleColumnSort("agent")}>Agent<SortIcon col="agent" /></th>}
                  {visibleColumns.includes("lead_source") && <th className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none" onClick={() => handleColumnSort("lead_source")}>Lead Source<SortIcon col="lead_source" /></th>}
                  {visibleColumns.includes("type") && <th className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none" onClick={() => handleColumnSort("type")}>Type<SortIcon col="type" /></th>}
                  {visibleColumns.includes("price") && <th className="text-right py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none" onClick={() => handleColumnSort("price")}>Price<SortIcon col="price" /></th>}
                  {visibleColumns.includes("gci") && <th className="text-right py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none" onClick={() => handleColumnSort("gci")}>GCI<SortIcon col="gci" /></th>}
                  {visibleColumns.includes("savvy_net") && isAdmin && <th className="text-right py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none" onClick={() => handleColumnSort("savvy_net")}>Savvy Net<SortIcon col="savvy_net" /></th>}
                  {visibleColumns.includes("commission_rate") && <th className="text-right py-3 px-4 text-muted-foreground font-medium select-none">Comm %</th>}
                  {visibleColumns.includes("status") && <th className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none" onClick={() => handleColumnSort("status")}>Status<SortIcon col="status" /></th>}
                  {visibleColumns.includes("closing_date") && <th className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none" onClick={() => handleColumnSort("closing_date")}>Closing<SortIcon col="closing_date" /></th>}
                  {visibleColumns.includes("contract_date") && <th className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none" onClick={() => handleColumnSort("contract_date")}>Contract<SortIcon col="contract_date" /></th>}
                  {visibleColumns.includes("date_added") && <th className="text-left py-3 px-4 text-muted-foreground font-medium cursor-pointer hover:text-foreground select-none" onClick={() => handleColumnSort("date_added")}>Date Added<SortIcon col="date_added" /></th>}
                  {visibleColumns.includes("transaction_number") && <th className="text-left py-3 px-4 text-muted-foreground font-medium select-none">Txn #</th>}
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 1} className="text-center py-12 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>No transactions found</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(({ transaction, contact, agent, property, savvyNet, leadSource, parentLeadSource }: any) => {
                    const lsLabel = leadSource?.name ? (parentLeadSource?.name ? `${parentLeadSource.name} \u203A ${leadSource.name}` : leadSource.name) : null;
                    return (
                    <tr key={transaction.id} className="border-b last:border-0 hover:bg-muted/20 cursor-pointer" onClick={() => navigate(`/transactions/${transaction.id}`)}>
                      {visibleColumns.includes("contact") && <td className="py-3 px-4"><div className="flex items-center gap-1.5"><p className="font-medium text-foreground">{contact?.firstName} {contact?.lastName}</p>{transaction.payoutIntegrityFlag && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}</div></td>}
                      {visibleColumns.includes("property") && <td className="py-3 px-4 text-muted-foreground">{property?.address ?? <span className="italic text-muted-foreground/50">No property</span>}</td>}
                      {visibleColumns.includes("agent") && <td className="py-3 px-4 text-muted-foreground">{agent?.name ?? "\u2014"}</td>}
                      {visibleColumns.includes("lead_source") && <td className="py-3 px-4 text-muted-foreground text-xs">{lsLabel ?? <span className="italic text-muted-foreground/50">No source</span>}</td>}
                      {visibleColumns.includes("type") && <td className="py-3 px-4 text-muted-foreground capitalize">{transaction.transactionType}</td>}
                      {visibleColumns.includes("price") && <td className="py-3 px-4 text-right">{formatCurrency(transaction.purchasePrice)}</td>}
                      {visibleColumns.includes("gci") && <td className="py-3 px-4 text-right font-medium text-emerald-600">{formatCurrency(transaction.grossCommissionIncome)}</td>}
                      {visibleColumns.includes("savvy_net") && isAdmin && <td className="py-3 px-4 text-right font-medium text-blue-600">{savvyNet ? formatCurrency(savvyNet) : <span className="text-muted-foreground/50 font-normal">\u2014</span>}</td>}
                      {visibleColumns.includes("commission_rate") && <td className="py-3 px-4 text-right text-muted-foreground">{transaction.commissionRate ? `${(parseFloat(transaction.commissionRate) * 100).toFixed(2)}%` : "\u2014"}</td>}
                      {visibleColumns.includes("status") && <td className="py-3 px-4"><TransactionStatusBadge status={transaction.status} />{transaction.status === "terminated" && transaction.terminationReason && (<p className="text-xs text-red-600 mt-0.5 truncate max-w-[180px]" title={transaction.terminationReason}>{transaction.terminationReason}</p>)}</td>}
                      {visibleColumns.includes("closing_date") && <td className="py-3 px-4 text-muted-foreground text-xs">{transaction.closingDate ? safeFormat(transaction.closingDate, "MMM d, yyyy") : "\u2014"}</td>}
                      {visibleColumns.includes("contract_date") && <td className="py-3 px-4 text-muted-foreground text-xs">{transaction.contractDate ? safeFormat(transaction.contractDate, "MMM d, yyyy") : "\u2014"}</td>}
                      {visibleColumns.includes("date_added") && <td className="py-3 px-4 text-muted-foreground text-xs">{transaction.createdAt ? safeFormat(transaction.createdAt, "MMM d, yyyy") : "\u2014"}</td>}
                      {visibleColumns.includes("transaction_number") && <td className="py-3 px-4 text-muted-foreground text-xs">{transaction.transactionNumber ?? "\u2014"}</td>}
                      <td className="py-3 px-4"><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/transactions/${transaction.id}`); }}>View</Button></td>
                    </tr>
                    );
                  })
                )}
              </tbody>
              {/* Aggregation Footer */}
              {filtered.length > 0 && (
                <tfoot className="border-t bg-muted/50">
                  <tr>
                    <td colSpan={4} className="py-2 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-medium">Page {aggregateMode === "count" ? "count" : aggregateMode}:</span>
                        <div className="flex gap-1">
                          {(["sum", "avg", "median", "count"] as const).map((m) => (
                            <button
                              key={m}
                              onClick={() => setAggregateMode(m)}
                              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                                aggregateMode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                              }`}
                            >
                              {m.charAt(0).toUpperCase() + m.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-4 text-right font-semibold text-sm">
                      {calcAggregate(
                        filtered.map(({ transaction }: any) => parseFloat(transaction.purchasePrice ?? "0")),
                        aggregateMode
                      )}
                    </td>
                    <td className="py-2 px-4 text-right font-semibold text-sm text-emerald-600">
                      {calcAggregate(
                        filtered.map(({ transaction }: any) => parseFloat(transaction.grossCommissionIncome ?? "0")),
                        aggregateMode
                      )}
                    </td>
                    {isAdmin && (
                      <td className="py-2 px-4 text-right font-semibold text-sm text-blue-600">
                        {calcAggregate(
                          filtered.map(({ savvyNet }: any) => parseFloat(savvyNet ?? "0")),
                          aggregateMode
                        )}
                      </td>
                    )}
                    <td colSpan={3} className="py-2 px-4 text-xs text-muted-foreground">
                      {filtered.length} row{filtered.length !== 1 ? "s" : ""} (this page)
                    </td>
                  </tr>
                  {/* All-records totals row — only shown when there are more records than the current page */}
                  {isAdmin && isPaginated && txStats && (
                    <tr className="border-t-2 border-primary/20 bg-primary/5">
                      <td colSpan={4} className="py-2 px-4">
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className="h-3.5 w-3.5 text-primary" />
                          <span className="text-xs font-semibold text-primary">All {txStats.total.toLocaleString()} matching transactions</span>
                          {statsFetching && <span className="text-xs text-muted-foreground animate-pulse">Refreshing…</span>}
                        </div>
                      </td>
                      <td className="py-2 px-4 text-right font-semibold text-sm text-primary">
                        ${Math.round(txStats.totalVolume).toLocaleString()}
                      </td>
                      <td className="py-2 px-4 text-right font-semibold text-sm text-emerald-700">
                        ${Math.round(txStats.totalGci).toLocaleString()}
                      </td>
                      <td className="py-2 px-4 text-right font-semibold text-sm text-blue-700">
                        {txStats.totalSavvyNet > 0 ? `$${Math.round(txStats.totalSavvyNet).toLocaleString()}` : "—"}
                      </td>
                      <td colSpan={3} className="py-2 px-4 text-xs text-primary/70">
                        {txStats.closedCount.toLocaleString()} closed · {txStats.underContractCount.toLocaleString()} UC
                      </td>
                    </tr>
                  )}
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {txTotal > 0 && (
        <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
          <p className="text-sm text-muted-foreground">
            {txTotal > txLimit
              ? `Showing ${((txPage - 1) * txLimit) + 1}–${Math.min(txPage * txLimit, txTotal)} of ${txTotal} transactions`
              : `${txTotal} transaction${txTotal !== 1 ? "s" : ""}`}
          </p>
          <div className="flex items-center gap-3">
            {/* Rows per page */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</span>
              <Select
                value={String(txLimit)}
                onValueChange={(v) => {
                  setTxLimit(Number(v));
                  setTxPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-20 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[25, 50, 75, 100].map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Prev / Next */}
            {txTotalPages > 1 && (
              <div className="flex gap-2 items-center">
                <Button size="sm" variant="outline" disabled={txPage <= 1} onClick={() => setTxPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground px-2">Page {txPage} of {txTotalPages}</span>
                <Button size="sm" variant="outline" disabled={txPage >= txTotalPages} onClick={() => setTxPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Create Transaction Dialog ─────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) resetDialog(); setOpen(v); }}>
        <DialogContent className="max-w-xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto p-5">
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
                  <SearchableSelect
                    className="mt-1 w-full"
                    options={(agents as any[] ?? []).map((a: any) => ({ value: String(a.id), label: a.name ?? a.email ?? `Agent #${a.id}` }))}
                    value={selectedAgent ? String(selectedAgent.id) : ""}
                    onValueChange={(v) => {
                      const found = (agents as any[] ?? []).find((a: any) => String(a.id) === v);
                      setSelectedAgent(found ?? null);
                      setAgentSearch(found?.name ?? found?.email ?? "");
                    }}
                    placeholder="Select agent…"
                    searchPlaceholder="Search agents…"
                    clearable
                    clearValue=""
                  />
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
        <DialogContent className="max-w-4xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto p-5">
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
