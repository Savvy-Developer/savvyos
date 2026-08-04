import { useState, useEffect, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import PageHeader from "@/components/PageHeader";
import LeadSourcePicker from "@/components/LeadSourcePicker";
import { IsaStatusBadge, PIPELINE_STAGE_OPTIONS } from "@/components/StatusBadge";
import { toast } from "sonner";
import { Plus, Search, User, Link2, Users, X, ChevronRight, Upload, TrendingUp, Phone, Mail, ArrowUpAZ, ArrowDownAZ, Calendar } from "lucide-react";
import BulkUploadDialog, { type BulkUploadColumn } from "@/components/BulkUploadDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { safeFormat } from "@/lib/safeFormat";
import { formatPhone, isValidEmail, isValidPhone } from "@/lib/inputFormatters";
import { formatEmail } from "@/lib/format";

// ─── Types ────────────────────────────────────────────────────────────────────

type ContactForm = {
  firstName: string; lastName: string;
  email: string; phone: string;
  secondaryEmail: string; secondaryPhone: string;
  spouseFirstName: string; spouseLastName: string;
  spouseEmail: string; spousePhone: string;
  leadSourceId: number | null;
  assignedIsaId: string;
  notes: string;
};

const emptyForm: ContactForm = {
  firstName: "", lastName: "", email: "", phone: "",
  secondaryEmail: "", secondaryPhone: "",
  spouseFirstName: "", spouseLastName: "", spouseEmail: "", spousePhone: "",
  leadSourceId: null, assignedIsaId: "", notes: "",
};

type AssignForm = {
  agentId: string; pipelineStatus: string; agentNotes: string;
  isaFollowUpDate: string; isaTaskAssigneeId: string; introduceClient: boolean; appointmentSet: boolean;
};

const PIPELINE_STATUS_LABELS: Record<string, string> = {
  new_lead: "New Lead", attempted_contact: "Attempted Contact", nurture: "Nurture",
  active_client: "Active Client", under_contract: "Under Contract", closed: "Closed", dead: "Dead",
};

// ─── URL Search Params helpers ────────────────────────────────────────────────

// ─── Agent Connections Popover ────────────────────────────────────────────────

function AgentConnectionsPopover({ contactId, count }: { contactId: number; count: number }) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const { data: connectionsData, isLoading } = trpc.agentConnections.list.useQuery(
    { contactId, limit: 50 },
    { enabled: open }
  );
  const data = connectionsData?.rows;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-full px-2 py-0.5 transition-colors"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        >
          <Users className="h-3 w-3" />
          {count} agent{count !== 1 ? "s" : ""}
          <ChevronRight className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="px-3 py-2 border-b">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agent Connections</p>
        </div>
        {isLoading ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">Loading...</div>
        ) : !data || (data as any[]).length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">No connections found.</div>
        ) : (
          <div className="divide-y">
            {(data as any[]).map(({ connection, agent }: any) => (
              <button
                key={connection.id}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/50 text-left transition-colors"
                onClick={(e) => { e.stopPropagation(); navigate(`/pipeline/${connection.id}`); setOpen(false); }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{agent?.name ?? "Unknown Agent"}</p>
                  <p className="text-xs text-muted-foreground">
                    {PIPELINE_STATUS_LABELS[connection.pipelineStatus] ?? connection.pipelineStatus?.replace(/_/g, " ")}
                  </p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Numbered Pagination Component ───────────────────────────────────────────

/**
 * Renders a smart numbered pagination bar:
 *   [Prev]  1  …  4  [5]  6  …  20  [Next]
 * Always shows first & last page; shows a window of ±2 around current page;
 * collapses gaps > 1 into ellipses.
 */
function NumberedPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  // Build the list of page numbers / "ellipsis" markers to render
  const pages: (number | "ellipsis-start" | "ellipsis-end")[] = [];
  const window = 2; // pages on each side of current

  const addPage = (n: number) => {
    if (!pages.includes(n)) pages.push(n);
  };

  addPage(1);
  for (let i = Math.max(2, page - window); i <= Math.min(totalPages - 1, page + window); i++) {
    addPage(i);
  }
  addPage(totalPages);

  // Insert ellipsis markers where there are gaps
  const withEllipsis: (number | "ellipsis-start" | "ellipsis-end")[] = [];
  for (let i = 0; i < pages.length; i++) {
    const cur = pages[i] as number;
    const prev = pages[i - 1] as number | undefined;
    if (prev !== undefined && cur - prev > 1) {
      withEllipsis.push(i === 1 ? "ellipsis-start" : "ellipsis-end");
    }
    withEllipsis.push(cur);
  }

  return (
    <Pagination className="justify-end">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            onClick={(e) => { e.preventDefault(); if (page > 1) onPageChange(page - 1); }}
            className={page <= 1 ? "pointer-events-none opacity-40" : "cursor-pointer"}
            aria-disabled={page <= 1}
          />
        </PaginationItem>

        {withEllipsis.map((item, idx) => {
          if (item === "ellipsis-start" || item === "ellipsis-end") {
            return (
              <PaginationItem key={`ell-${idx}`}>
                <PaginationEllipsis />
              </PaginationItem>
            );
          }
          const p = item as number;
          return (
            <PaginationItem key={p}>
              <PaginationLink
                href="#"
                isActive={p === page}
                onClick={(e) => { e.preventDefault(); onPageChange(p); }}
                className="cursor-pointer"
              >
                {p}
              </PaginationLink>
            </PaginationItem>
          );
        })}

        <PaginationItem>
          <PaginationNext
            href="#"
            onClick={(e) => { e.preventDefault(); if (page < totalPages) onPageChange(page + 1); }}
            className={page >= totalPages ? "pointer-events-none opacity-40" : "cursor-pointer"}
            aria-disabled={page >= totalPages}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  // ── Read all filter state from URL search params ──────────────────────────
  // useSearch() from wouter is reactive — re-renders when the query string changes.
  const rawSearch = useSearch();
  const sp = useMemo(() => new URLSearchParams(rawSearch), [rawSearch]);
  const search = sp.get("q") ?? "";
  const isaFilter = sp.get("isa") ?? (user?.role === "isa" ? String(user.id) : "all");
  const isaStatusFilter = sp.get("isaStatus") ?? "all";
  const leadSourceFilter = sp.get("leadSource") ?? "all";
  const sortOrder = (sp.get("sort") ?? "desc") as "asc" | "desc";
  const addedFrom = sp.get("addedFrom") ?? "";
  const addedTo = sp.get("addedTo") ?? "";
  const lastContactedFrom = sp.get("lastFrom") ?? "";
  const lastContactedTo = sp.get("lastTo") ?? "";
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);

  // ── Helper: update one or more URL params and navigate ────────────────────
  const setParams = useCallback((updates: Record<string, string>) => {
    const current = new URLSearchParams(rawSearch);
    for (const [k, v] of Object.entries(updates)) {
      if (v === "" || (v === "all" && k !== "isa") || (k === "page" && v === "1") || (k === "sort" && v === "desc")) {
        current.delete(k);
      } else {
        current.set(k, v);
      }
    }
    const qs = current.toString();
    navigate(qs ? `/contacts?${qs}` : "/contacts");
  }, [navigate, rawSearch]);

  const setPage = useCallback((p: number | ((prev: number) => number)) => {
    const next = typeof p === "function" ? p(page) : p;
    setParams({ page: String(next) });
  }, [page, setParams]);

  const handleSearchChange = (val: string) => {
    // Collapse newlines, tabs, and multiple spaces into a single space (handles pasted text)
    const cleaned = val.replace(/[\r\n\t]+/g, " ").replace(/  +/g, " ");
    setParams({ q: cleaned, page: "1" });
  };
  const handleIsaFilterChange = (val: string) => setParams({ isa: val, page: "1" });
  const handleIsaStatusFilterChange = (val: string) => setParams({ isaStatus: val, page: "1" });
  const handleLeadSourceFilterChange = (val: string) => setParams({ leadSource: val, page: "1" });
  const handleSortToggle = () => setParams({ sort: sortOrder === "asc" ? "desc" : "asc" });
  const handleAddedFromChange = (val: string) => setParams({ addedFrom: val, page: "1" });
  const handleAddedToChange = (val: string) => setParams({ addedTo: val, page: "1" });
  const handleLastContactedFromChange = (val: string) => setParams({ lastFrom: val, page: "1" });
  const handleLastContactedToChange = (val: string) => setParams({ lastTo: val, page: "1" });

  // ── Local UI state (dialogs, forms — not persisted in URL) ────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignContactId, setAssignContactId] = useState<number | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [assignForm, setAssignForm] = useState<AssignForm>({
    agentId: "", pipelineStatus: "new_lead", agentNotes: "",
    isaFollowUpDate: "", isaTaskAssigneeId: user?.id ? String(user.id) : "",
    introduceClient: false, appointmentSet: false,
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkIsaOpen, setBulkIsaOpen] = useState(false);
  const [bulkIsaId, setBulkIsaId] = useState<string>("none");
  const [dateFiltersOpen, setDateFiltersOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const utils = trpc.useUtils();

  // ── Duplicate detection ───────────────────────────────────────────────────
  const [dupCheckEmail, setDupCheckEmail] = useState("");
  const [dupCheckPhone, setDupCheckPhone] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDupCheckEmail(form.email), 600);
    return () => clearTimeout(t);
  }, [form.email]);
  useEffect(() => {
    const t = setTimeout(() => setDupCheckPhone(form.phone), 600);
    return () => clearTimeout(t);
  }, [form.phone]);
  const [dupCheckName, setDupCheckName] = useState({ firstName: "", lastName: "" });
  useEffect(() => {
    const t = setTimeout(() => setDupCheckName({ firstName: form.firstName, lastName: form.lastName }), 800);
    return () => clearTimeout(t);
  }, [form.firstName, form.lastName]);
  const checkDupMut = trpc.contacts.checkDuplicate.useMutation();
  const [dupMatches, setDupMatches] = useState<any[]>([]);
  const [dupNameMatches, setDupNameMatches] = useState<any[]>([]);
  useEffect(() => {
    const shouldCheck = createOpen && (dupCheckEmail.length > 3 || dupCheckPhone.length > 6 || (dupCheckName.firstName.length > 1 && dupCheckName.lastName.length > 1));
    if (!shouldCheck) { setDupMatches([]); setDupNameMatches([]); return; }
    checkDupMut.mutateAsync({ email: dupCheckEmail || undefined, phone: dupCheckPhone || undefined, firstName: dupCheckName.firstName || undefined, lastName: dupCheckName.lastName || undefined })
      .then((res) => { setDupMatches(res.emailPhoneMatches ?? []); setDupNameMatches(res.nameMatches ?? []); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dupCheckEmail, dupCheckPhone, dupCheckName.firstName, dupCheckName.lastName, createOpen]);

  // ── Data queries ──────────────────────────────────────────────────────────
  const isaIdParam = isaFilter === "all" ? undefined : isaFilter === "unassigned" ? -1 : Number(isaFilter);
  const isaStatusParam = isaStatusFilter === "all" ? undefined : isaStatusFilter as any;
  const leadSourceIdParam = leadSourceFilter === "all" ? undefined : Number(leadSourceFilter);

  const { data: contactsData, isLoading } = trpc.contacts.list.useQuery({
    search: search || undefined,
    isaId: isaIdParam,
    isaStatus: isaStatusParam,
    leadSourceId: leadSourceIdParam,
    page,
    limit: 25,
    sortOrder,
    addedFrom: addedFrom || undefined,
    addedTo: addedTo || undefined,
    lastContactedFrom: lastContactedFrom || undefined,
    lastContactedTo: lastContactedTo || undefined,
  });
  const contacts = contactsData?.rows ?? [];
  const totalContacts = contactsData?.total ?? 0;
  const totalPages = Math.ceil(totalContacts / 25);

  const { data: statusCounts } = trpc.contacts.statusCounts.useQuery(undefined, { enabled: user?.role !== "agent" });
  const canListUsers = user?.role === "admin" || user?.role === "isa";
  const { data: agents = [] } = trpc.users.list.useQuery({ role: "agent" }, { enabled: canListUsers });
  const { data: isas = [] } = trpc.users.list.useQuery({ role: "isa" }, { enabled: canListUsers });
  const { data: leadSourcesData = [] } = trpc.leadSources.listFlat.useQuery();

  // ── Mutations ─────────────────────────────────────────────────────────────
  const create = trpc.contacts.create.useMutation({
    onSuccess: (data) => {
      toast.success("Contact created");
      setCreateOpen(false);
      setForm(emptyForm);
      utils.contacts.list.invalidate();
      navigate(`/contacts/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const createConnection = trpc.agentConnections.create.useMutation({
    onSuccess: () => {
      toast.success("Agent connection created — contact is now in the agent's pipeline");
      setAssignOpen(false);
      setAssignForm({ agentId: "", pipelineStatus: "new_lead", agentNotes: "", isaFollowUpDate: "", isaTaskAssigneeId: user?.id ? String(user.id) : "", introduceClient: false, appointmentSet: false });
      utils.contacts.list.invalidate();
      utils.agentConnections.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const requestConnMut = trpc.connectionRequests.create.useMutation({
    onSuccess: () => { toast.success("Connection created successfully!"); setCreateOpen(false); setForm(emptyForm); },
    onError: (e) => toast.error(e.message),
  });

  const bulkAssignIsa = trpc.contacts.bulkAssignIsa.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.updated} contact${data.updated !== 1 ? "s" : ""} updated`);
      setBulkIsaOpen(false);
      setBulkIsaId("none");
      setSelectedIds(new Set());
      utils.contacts.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  function openAssign(contactId: number, e: React.MouseEvent) {
    e.stopPropagation();
    setAssignContactId(contactId);
    setAssignOpen(true);
  }

  function handleCreate() {
    if (!form.firstName || !form.lastName) { toast.error("First and last name are required"); return; }
    if (!form.leadSourceId) { toast.error("Please select a lead source (Details tab) — every lead needs a source for attribution."); return; }
    if (form.email && !isValidEmail(form.email)) { toast.error("Please enter a valid email address (e.g. name@example.com)"); return; }
    if (form.secondaryEmail && !isValidEmail(form.secondaryEmail)) { toast.error("Please enter a valid secondary email address"); return; }
    if (form.spouseEmail && !isValidEmail(form.spouseEmail)) { toast.error("Please enter a valid spouse email address"); return; }
    if (form.phone && !isValidPhone(form.phone)) { toast.error("Please enter a valid phone number (9+ digits)"); return; }
    if (form.secondaryPhone && !isValidPhone(form.secondaryPhone)) { toast.error("Please enter a valid secondary phone number (9+ digits)"); return; }
    if (form.spousePhone && !isValidPhone(form.spousePhone)) { toast.error("Please enter a valid spouse phone number (9+ digits)"); return; }
    create.mutate({
      firstName: form.firstName, lastName: form.lastName,
      email: form.email || undefined,
      phone: form.phone || null,
      secondaryEmail: form.secondaryEmail || null, secondaryPhone: form.secondaryPhone || null,
      spouseFirstName: form.spouseFirstName || null, spouseLastName: form.spouseLastName || null,
      spouseEmail: form.spouseEmail || null, spousePhone: form.spousePhone || null,
      leadSourceId: form.leadSourceId,
      assignedIsaId: form.assignedIsaId ? Number(form.assignedIsaId) : null,
      notes: form.notes || null,
    });
  }

  function handleAssign() {
    if (!assignForm.agentId || !assignContactId) { toast.error("Please select an agent"); return; }
    createConnection.mutate({
      agentId: Number(assignForm.agentId),
      contactId: assignContactId,
      pipelineStatus: assignForm.pipelineStatus as any,
      agentNotes: assignForm.agentNotes || null,
      isaFollowUpDate: assignForm.isaFollowUpDate || null,
      isaTaskAssigneeId: assignForm.isaTaskAssigneeId ? Number(assignForm.isaTaskAssigneeId) : null,
      introduceClient: assignForm.introduceClient,
      appointmentSet: assignForm.appointmentSet,
    });
  }

  function handleBulkAssign() {
    if (selectedIds.size === 0) return;
    bulkAssignIsa.mutate({
      contactIds: Array.from(selectedIds),
      isaId: bulkIsaId === "none" ? null : Number(bulkIsaId),
    });
  }

  function toggleSelect(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((r: any) => r.contact.id)));
    }
  }

  // Agents must never access the full contacts list
  if (user?.role === "agent") {
    navigate("/pipeline");
    return null;
  }

  const canAssign = user?.role === "admin" || user?.role === "isa";
  const canBulkAssign = user?.role === "admin" || user?.role === "isa";
  const allSelected = contacts.length > 0 && selectedIds.size === contacts.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < contacts.length;

  const bulkUploadMutation = trpc.contacts.bulkUpload.useMutation();

  const contactBulkColumns: BulkUploadColumn[] = [
    { key: "firstName", label: "First Name", required: true, example: "Jane" },
    { key: "lastName", label: "Last Name", required: true, example: "Smith" },
    { key: "email", label: "Email", example: "jane@example.com" },
    { key: "phone", label: "Phone", example: "555-123-4567" },
    { key: "secondaryEmail", label: "Secondary Email", example: "" },
    { key: "secondaryPhone", label: "Secondary Phone", example: "" },
    { key: "address", label: "Address", example: "123 Main St" },
    { key: "city", label: "City", example: "Nashville" },
    { key: "state", label: "State", example: "TN" },
    { key: "zip", label: "Zip", example: "37201" },
    { key: "spouseFirstName", label: "Spouse First Name", example: "" },
    { key: "spouseLastName", label: "Spouse Last Name", example: "" },
    { key: "spouseEmail", label: "Spouse Email", example: "" },
    { key: "spousePhone", label: "Spouse Phone", example: "" },
    { key: "notes", label: "Notes", example: "" },
    { key: "tags", label: "Tags", example: "buyer,vip" },
    { key: "leadSourceType", label: "Lead Source Type", example: "referral" },
    { key: "campaignSource", label: "Campaign Source", example: "" },
    { key: "pipelineStatus", label: "Pipeline Status", aliases: ["ISA Status"], example: "new_lead" },
  ];

  const hasDateFilters = addedFrom || addedTo || lastContactedFrom || lastContactedTo;

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle="Manage your CRM contacts and lead relationships"
        actions={
          <div className="flex gap-2">
            {user?.role === "admin" && (
              <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
                <Upload className="h-4 w-4 mr-1" /> Bulk Upload
              </Button>
            )}
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Contact
            </Button>
          </div>
        }
      />
      <BulkUploadDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title="Bulk Upload Contacts"
        columns={contactBulkColumns}
        onUpload={async (rows) => {
          const result = await bulkUploadMutation.mutateAsync({ rows: rows as any });
          return result;
        }}
        onSuccess={() => {
          utils.contacts.list.invalidate();
          toast.success("Contacts imported successfully");
        }}
      />

      {/* ── Filter Bar ── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        {(user?.role === "admin" || user?.role === "isa") && (
          <SearchableSelect
            className="w-full sm:w-48"
            options={[
              { value: "all", label: "All ISAs" },
              { value: "unassigned", label: "Unassigned" },
              ...(isas as any[]).map((u: any) => ({ value: String(u.id), label: u.name ?? `ISA #${u.id}` }))
            ]}
            value={isaFilter}
            onValueChange={handleIsaFilterChange}
            placeholder="Filter by ISA"
            searchPlaceholder="Search ISAs…"
          />
        )}
        {(user?.role === "admin" || user?.role === "isa") && (
          <Select value={isaStatusFilter} onValueChange={handleIsaStatusFilterChange}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by ISA Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ISA Statuses</SelectItem>
              {PIPELINE_STAGE_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={handleSortToggle}
          title={sortOrder === "asc" ? "Sorted A → Z (click for Z → A)" : "Sorted Z → A (click for A → Z)"}
        >
          {sortOrder === "asc"
            ? <><ArrowUpAZ className="h-4 w-4" /><span className="hidden sm:inline">A → Z</span></>
            : <><ArrowDownAZ className="h-4 w-4" /><span className="hidden sm:inline">Z → A</span></>}
        </Button>

        {/* Date Filters Popover */}
        <Popover open={dateFiltersOpen} onOpenChange={setDateFiltersOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={hasDateFilters ? "default" : "outline"}
              size="sm"
              className="shrink-0 gap-1.5"
            >
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Date Filters</span>
              {hasDateFilters && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-xs rounded-full bg-white/20">
                  {[addedFrom || addedTo, lastContactedFrom || lastContactedTo].filter(Boolean).length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4" align="end">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Added Date</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <Input type="date" className="mt-1 h-8 text-xs" value={addedFrom} onChange={e => handleAddedFromChange(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <Input type="date" className="mt-1 h-8 text-xs" value={addedTo} onChange={e => handleAddedToChange(e.target.value)} />
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Last Contacted Date</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <Input type="date" className="mt-1 h-8 text-xs" value={lastContactedFrom} onChange={e => handleLastContactedFromChange(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <Input type="date" className="mt-1 h-8 text-xs" value={lastContactedTo} onChange={e => handleLastContactedToChange(e.target.value)} />
                  </div>
                </div>
              </div>
              {hasDateFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs h-7"
                  onClick={() => {
                    handleAddedFromChange(""); handleAddedToChange("");
                    handleLastContactedFromChange(""); handleLastContactedToChange("");
                  }}
                >
                  <X className="h-3 w-3 mr-1" /> Clear date filters
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <SearchableSelect
          className="w-full sm:w-48"
          options={[
            { value: "all", label: "All Lead Sources" },
            ...(() => {
              const allSources = leadSourcesData as any[];
              const topLevel = allSources.filter((s: any) => !s.ls.parentId);
              const topLevelIdSet = new Set(topLevel.map((s: any) => s.ls.id));
              const secondLevel = allSources.filter((s: any) => s.ls.parentId && topLevelIdSet.has(s.ls.parentId));
              const secondLevelIdSet = new Set(secondLevel.map((s: any) => s.ls.id));
              const thirdLevel = allSources.filter((s: any) => s.ls.parentId && secondLevelIdSet.has(s.ls.parentId));
              const flat: { value: string; label: string; description?: string }[] = [];
              topLevel.forEach((p: any) => {
                const subs = secondLevel.filter((c: any) => c.ls.parentId === p.ls.id);
                if (subs.length > 0) {
                  subs.forEach((sub: any) => {
                    const grandkids = thirdLevel.filter((g: any) => g.ls.parentId === sub.ls.id);
                    if (grandkids.length > 0) {
                      flat.push({ value: String(sub.ls.id), label: sub.ls.name, description: p.ls.name });
                      grandkids.forEach((gc: any) => {
                        flat.push({ value: String(gc.ls.id), label: gc.ls.name, description: `${p.ls.name} > ${sub.ls.name}` });
                      });
                    } else {
                      flat.push({ value: String(sub.ls.id), label: sub.ls.name, description: p.ls.name });
                    }
                  });
                } else {
                  flat.push({ value: String(p.ls.id), label: p.ls.name });
                }
              });
              return flat;
            })()
          ]}
          value={leadSourceFilter}
          onValueChange={handleLeadSourceFilterChange}
          placeholder="Filter by Lead Source"
          searchPlaceholder="Search lead sources…"
        />
      </div>

      {/* ── Bulk action bar ── */}
      {canBulkAssign && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-primary/10 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium text-primary">{selectedIds.size} contact{selectedIds.size !== 1 ? "s" : ""} selected</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => { setBulkIsaId("none"); setBulkIsaOpen(true); }}
          >
            <Users className="h-3.5 w-3.5 mr-1" />
            Assign ISA
          </Button>
          <button
            className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="h-3.5 w-3.5" /> Clear selection
          </button>
        </div>
      )}

      {/* ── Insights Panel ── */}
      {statusCounts && user?.role !== "agent" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{statusCounts.total.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Active Contacts</p>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{statusCounts.newLast30.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">New (Last 30 Days)</p>
            </div>
          </div>
          <div className={`rounded-lg border p-3 flex items-center gap-3 ${statusCounts.noEmail > 0 ? "bg-amber-50 border-amber-100" : "bg-card"}`}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${statusCounts.noEmail > 0 ? "bg-amber-100" : "bg-muted"}`}>
              <Mail className={`h-4 w-4 ${statusCounts.noEmail > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className={`text-xl font-bold ${statusCounts.noEmail > 0 ? "text-amber-700" : "text-foreground"}`}>{statusCounts.noEmail.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Missing Email</p>
            </div>
          </div>
          <div className={`rounded-lg border p-3 flex items-center gap-3 ${statusCounts.noPhone > 0 ? "bg-amber-50 border-amber-100" : "bg-card"}`}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${statusCounts.noPhone > 0 ? "bg-amber-100" : "bg-muted"}`}>
              <Phone className={`h-4 w-4 ${statusCounts.noPhone > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className={`text-xl font-bold ${statusCounts.noPhone > 0 ? "text-amber-700" : "text-foreground"}`}>{statusCounts.noPhone.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Missing Phone</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Contacts Table ── */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  {canBulkAssign && (
                    <th className="py-3 px-3 w-10">
                      <Checkbox
                        checked={allSelected}
                        data-state={someSelected ? "indeterminate" : allSelected ? "checked" : "unchecked"}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </th>
                  )}
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Name</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Email</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Phone</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Lead Source</th>
                  {user?.role === "admin" && (
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Agent Connections</th>
                  )}
                  {(user?.role === "admin" || user?.role === "isa") && (
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">ISA Status</th>
                  )}
                  {(user?.role === "admin" || user?.role === "isa") && (
                    <th className="text-left py-3 px-4 text-muted-foreground font-medium">Assigned ISA</th>
                  )}
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Last Contacted</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">Added</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={canBulkAssign ? 9 : 8} className="text-center py-12 text-muted-foreground text-sm">Loading...</td></tr>
                ) : contacts.length === 0 ? (
                  <tr>
                    <td colSpan={canBulkAssign ? 9 : 8} className="text-center py-12 text-muted-foreground">
                      <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>{search ? "No contacts match your search" : "No contacts yet. Add your first contact!"}</p>
                      {search && isaFilter !== "all" && (
                        <button
                          className="text-primary hover:underline text-sm mt-2 inline-block"
                          onClick={() => handleIsaFilterChange("all")}
                        >
                          Clear filters and search again
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  contacts.map((row: any) => {
                    const { contact, agentConnectionId, agentName, agentId: rowAgentId } = row;
                    return (
                      <tr
                        key={contact.id}
                        className={`border-b last:border-0 hover:bg-muted/20 cursor-pointer ${selectedIds.has(contact.id) ? "bg-primary/5" : ""}`}
                        onClick={() => {
                          if (user?.role === "agent" && agentConnectionId) {
                            navigate(`/pipeline/${agentConnectionId}`);
                          } else {
                            navigate(`/contacts/${contact.id}`);
                          }
                        }}
                      >
                        {canBulkAssign && (
                          <td className="py-3 px-3 w-10" onClick={(e) => toggleSelect(contact.id, e)}>
                            <Checkbox
                              checked={selectedIds.has(contact.id)}
                              onCheckedChange={() => {}}
                              aria-label={`Select ${contact.firstName}`}
                            />
                          </td>
                        )}
                        <td className="py-3 px-4">
                          <p className="font-medium text-foreground">{contact.firstName} {contact.lastName}</p>
                          {contact.spouseFirstName && (
                            <p className="text-xs text-muted-foreground">+ {contact.spouseFirstName} {contact.spouseLastName}</p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{contact.email ? formatEmail(contact.email) : "—"}</td>
                        <td className="py-3 px-4 text-muted-foreground">{contact.phone ? formatPhone(contact.phone) : "—"}</td>
                        <td className="py-3 px-4">
                          {(() => {
                            if (contact.leadSourceId) {
                              const ls = (leadSourcesData as any[]).find((s: any) => s.ls.id === contact.leadSourceId);
                              if (ls) {
                                const parent = ls.ls.parentId ? (leadSourcesData as any[]).find((p: any) => p.ls.id === ls.ls.parentId) : null;
                                const grandparent = parent?.ls.parentId ? (leadSourcesData as any[]).find((p: any) => p.ls.id === parent.ls.parentId) : null;
                                return (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {grandparent && (
                                      <>
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-medium whitespace-nowrap">
                                          {grandparent.ls.name}
                                        </span>
                                        <span className="text-muted-foreground text-xs">›</span>
                                      </>
                                    )}
                                    {parent && (
                                      <>
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-medium whitespace-nowrap">
                                          {parent.ls.name}
                                        </span>
                                        <span className="text-muted-foreground text-xs">›</span>
                                      </>
                                    )}
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-semibold whitespace-nowrap">
                                      {ls.ls.name}
                                    </span>
                                  </div>
                                );
                              }
                            }
                            if (contact.leadSourceType) {
                              return (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-medium">
                                  {contact.leadSourceType.replace(/_/g, " ")}
                                </span>
                              );
                            }
                            return <span className="text-muted-foreground text-xs">—</span>;
                          })()}
                        </td>
                        {user?.role === "admin" && (
                          <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                            {(contact as any).connectionCount > 0 ? (
                              <AgentConnectionsPopover contactId={contact.id} count={Number((contact as any).connectionCount)} />
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                        )}
                        {(user?.role === "admin" || user?.role === "isa") && (
                          <td className="py-3 px-4">
                            <IsaStatusBadge status={(contact as any).isaStatus} />
                          </td>
                        )}
                        {(user?.role === "admin" || user?.role === "isa") && (
                          <td className="py-3 px-4 text-xs text-muted-foreground">
                            {(row as any).assignedIsa?.name ?? "—"}
                          </td>
                        )}
                        <td className="py-3 px-4 text-xs">
                          {(row as any).lastContacted ? (
                            <span className="text-foreground">{safeFormat((row as any).lastContacted, "MMM d, yyyy")}</span>
                          ) : (
                            <span className="text-muted-foreground">Never</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">{safeFormat(contact.createdAt, "MMM d, yyyy")}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1">
                            {canAssign && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(e) => openAssign(contact.id, e)}>
                                <Link2 className="h-3 w-3 mr-1" />Assign
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/contacts/${contact.id}`); }}>View</Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination Footer ── */}
          {totalPages > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t text-sm">
              <span className="text-muted-foreground text-xs shrink-0">
                {totalContacts > 0
                  ? `Showing ${(page - 1) * 25 + 1}–${Math.min(page * 25, totalContacts)} of ${totalContacts.toLocaleString()} contacts`
                  : "No contacts"}
              </span>
              <NumberedPagination
                page={page}
                totalPages={totalPages}
                onPageChange={(p) => setPage(p)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Bulk Assign ISA Dialog ── */}
      <Dialog open={bulkIsaOpen} onOpenChange={(v) => { if (!v) { setBulkIsaOpen(false); setBulkIsaId("none"); } }}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Bulk Assign ISA</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Assign or reassign an ISA to <span className="font-semibold text-foreground">{selectedIds.size} selected contact{selectedIds.size !== 1 ? "s" : ""}</span>.
            </p>
            <div>
              <Label>ISA</Label>
              <SearchableSelect
                className="mt-1 w-full"
                options={[
                  { value: "none", label: "Unassign (remove ISA)" },
                  ...(isas as any[]).map((u: any) => ({ value: String(u.id), label: u.name ?? `ISA #${u.id}` }))
                ]}
                value={bulkIsaId}
                onValueChange={setBulkIsaId}
                placeholder="Select ISA…"
                searchPlaceholder="Search ISAs…"
              />
            </div>
            {bulkIsaId !== "none" && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
                Contacts without an existing ISA status will automatically be set to <strong>New Lead</strong>.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkIsaOpen(false); setBulkIsaId("none"); }}>Cancel</Button>
            <Button onClick={handleBulkAssign} disabled={bulkAssignIsa.isPending}>
              {bulkAssignIsa.isPending ? "Updating..." : `Update ${selectedIds.size} Contact${selectedIds.size !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Contact Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Contact</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="primary">
            <TabsList className="mb-4">
              <TabsTrigger value="primary">Primary Contact</TabsTrigger>
              <TabsTrigger value="spouse">Spouse / Partner</TabsTrigger>
              <TabsTrigger value="details">Details & Source</TabsTrigger>
            </TabsList>

            <TabsContent value="primary" className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>First Name *</Label><Input className="mt-1" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
                <div><Label>Last Name *</Label><Input className="mt-1" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
                <div><Label>Email</Label><Input className="mt-1" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="optional" /></div>
                <div><Label>Phone</Label><Input className="mt-1" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: formatPhone(e.target.value) }))} placeholder="e.g. 5551234567" /></div>
                <div><Label>Secondary Email</Label><Input className="mt-1" type="email" value={form.secondaryEmail} onChange={e => setForm(f => ({ ...f, secondaryEmail: e.target.value }))} /></div>
                <div><Label>Secondary Phone</Label><Input className="mt-1" value={form.secondaryPhone} onChange={e => setForm(f => ({ ...f, secondaryPhone: formatPhone(e.target.value) }))} placeholder="e.g. 5551234567" /></div>
              </div>
            </TabsContent>

            <TabsContent value="spouse" className="space-y-3">
              <p className="text-sm text-muted-foreground mb-2">Add a spouse, business partner, or co-buyer associated with this contact.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>First Name</Label><Input className="mt-1" placeholder="Spouse / partner first name" value={form.spouseFirstName} onChange={e => setForm(f => ({ ...f, spouseFirstName: e.target.value }))} /></div>
                <div><Label>Last Name</Label><Input className="mt-1" placeholder="Spouse / partner last name" value={form.spouseLastName} onChange={e => setForm(f => ({ ...f, spouseLastName: e.target.value }))} /></div>
                <div><Label>Email</Label><Input className="mt-1" type="email" value={form.spouseEmail} onChange={e => setForm(f => ({ ...f, spouseEmail: e.target.value }))} /></div>
                <div><Label>Phone</Label><Input className="mt-1" value={form.spousePhone} onChange={e => setForm(f => ({ ...f, spousePhone: formatPhone(e.target.value) }))} placeholder="e.g. 5551234567" /></div>
              </div>
            </TabsContent>

            <TabsContent value="details" className="space-y-4">
              <div>
                <Label>Lead Source <span className="text-destructive">*</span></Label>
                <LeadSourcePicker
                  className="mt-1"
                  value={form.leadSourceId}
                  onChange={id => setForm(f => ({ ...f, leadSourceId: id }))}
                />
              </div>
              {(user?.role === "admin" || user?.role === "isa") && (
                <div>
                  <Label>Assign to ISA <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <SearchableSelect
                    className="mt-1 w-full"
                    options={[
                      { value: "none", label: "No ISA assigned" },
                      ...(isas as any[]).map((u: any) => ({ value: String(u.id), label: u.name ?? `ISA #${u.id}` }))
                    ]}
                    value={form.assignedIsaId || "none"}
                    onValueChange={v => setForm(f => ({ ...f, assignedIsaId: v === "none" ? "" : v }))}
                    placeholder="No ISA assigned"
                    searchPlaceholder="Search ISAs…"
                  />
                </div>
              )}
              <div>
                <Label>Notes</Label>
                <Textarea className="mt-1 max-h-[200px] overflow-y-auto" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </TabsContent>
          </Tabs>

          {/* Hard block: email/phone exact match */}
          {dupMatches.length > 0 && (
            <div className="mt-3 p-3 rounded-md bg-red-50 border border-red-200 text-sm">
              <p className="font-semibold text-red-800 mb-2">🚫 A contact with this email or phone already exists:</p>
              <ul className="space-y-2">
                {dupMatches.map((m: any) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-medium text-red-800">{m.firstName} {m.lastName}</span>
                      <span className="text-red-600 ml-1 text-xs">
                        {m.email && m.email === dupCheckEmail ? `email: ${m.email}` : m.phone ? `phone: ${m.phone}` : ""}
                      </span>
                    </div>
                    {user?.role === "agent" ? (
                      <Button size="sm" variant="outline" className="text-xs h-7 shrink-0" onClick={() => {
                        requestConnMut.mutate({ contactId: m.id, requestedPipelineStatus: "new_lead" });
                      }} disabled={requestConnMut.isPending}>
                        Request Connection
                      </Button>
                    ) : (
                      <a href={`/contacts/${m.id}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-red-700 underline hover:text-red-900 shrink-0">View Contact</a>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-red-600 mt-2 text-xs font-medium">You cannot create a duplicate contact. Use the existing contact or request a connection.</p>
            </div>
          )}

          {/* Soft warn: name match only */}
          {dupMatches.length === 0 && dupNameMatches.length > 0 && (
            <div className="mt-3 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm">
              <p className="font-medium text-amber-800 mb-2">⚠ A contact with this name might already exist:</p>
              <ul className="space-y-2">
                {dupNameMatches.map((m: any) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-medium text-amber-800">{m.firstName} {m.lastName}</span>
                      {m.email && <span className="text-amber-600 ml-1 text-xs">{m.email}</span>}
                      {m.phone && <span className="text-amber-600 ml-1 text-xs">{m.phone}</span>}
                    </div>
                    <a href={`/contacts/${m.id}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-amber-700 underline hover:text-amber-900 shrink-0">View</a>
                  </li>
                ))}
              </ul>
              <p className="text-amber-600 mt-1 text-xs">If this is the same person, use the existing contact. Otherwise, continue creating.</p>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.firstName || !form.lastName || create.isPending || dupMatches.length > 0}>
              {create.isPending ? "Creating..." : "Create Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  <SelectItem value="new_lead">New Lead</SelectItem>
                  <SelectItem value="attempted_contact">Attempted Contact</SelectItem>
                  <SelectItem value="nurture">Nurture</SelectItem>
                  <SelectItem value="active_client">Active Client</SelectItem>
                  <SelectItem value="under_contract">Under Contract</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
                rows={3}
                placeholder="Any context to pass to the agent..."
                value={assignForm.agentNotes}
                onChange={e => setAssignForm(f => ({ ...f, agentNotes: e.target.value }))}
              />
            </div>
            {assignForm.agentId && (() => {
              const selectedAgent = (agents as any[]).find((a: any) => String(a.id) === assignForm.agentId);
              return selectedAgent?.callBookingLink ? (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Agent's Call Booking Link</p>
                  <a href={selectedAgent.callBookingLink} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline break-all">
                    {selectedAgent.callBookingLink}
                  </a>
                </div>
              ) : null;
            })()}
            <div className="flex items-start gap-2">
              <Checkbox
                id="appointmentSetContacts"
                checked={assignForm.appointmentSet}
                onCheckedChange={(v: boolean) => setAssignForm(f => ({ ...f, appointmentSet: !!v }))}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="appointmentSetContacts" className="cursor-pointer">Set an appointment</Label>
                {assignForm.appointmentSet && (
                  <p className="text-xs text-muted-foreground mt-0.5">This will be tracked for ISA appointment-setting statistics.</p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="introduceClientContacts"
                checked={assignForm.introduceClient}
                onCheckedChange={(v: boolean) => setAssignForm(f => ({ ...f, introduceClient: !!v }))}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="introduceClientContacts" className="cursor-pointer">Introduce client to agent</Label>
                {assignForm.introduceClient && (
                  <p className="text-xs text-muted-foreground mt-0.5">An email will be sent to the client introducing them to the agent, with the agent CC'd.</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={createConnection.isPending}>
              {createConnection.isPending ? "Assigning..." : "Assign to Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
