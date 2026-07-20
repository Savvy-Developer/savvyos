import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { usePersistentState } from "@/hooks/usePersistentState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import LeadSourcePicker from "@/components/LeadSourcePicker";
import { IsaStatusBadge, PIPELINE_STAGE_OPTIONS } from "@/components/StatusBadge";
import { toast } from "sonner";
import { Plus, Search, User, Link2, Users, X, ChevronRight, Upload, TrendingUp, AlertTriangle, Phone, Mail, ArrowUpAZ, ArrowDownAZ } from "lucide-react";
import BulkUploadDialog, { type BulkUploadColumn } from "@/components/BulkUploadDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { safeFormat } from "@/lib/safeFormat";
import { formatPhone, isValidEmail, isValidPhone } from "@/lib/inputFormatters";
import { formatEmail } from "@/lib/format"; // formatEmail: lowercase trim

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

type AssignForm = { agentId: string; pipelineStatus: string; agentNotes: string; isaFollowUpDate: string; introduceClient: boolean; };

const PIPELINE_STATUS_LABELS: Record<string, string> = {
  new_lead: "New Lead", attempted_contact: "Attempted Contact", nurture: "Nurture",
  active_client: "Active Client", under_contract: "Under Contract", closed: "Closed", dead: "Dead",
};

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
          {count} agent{count !== 1 ? 's' : ''}
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
                  <p className="text-sm font-medium truncate">{agent?.name ?? 'Unknown Agent'}</p>
                  <p className="text-xs text-muted-foreground">
                    {PIPELINE_STATUS_LABELS[connection.pipelineStatus] ?? connection.pipelineStatus?.replace(/_/g, ' ')}
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

export default function ContactsPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  // Filters persist across navigation (open a record → back) so they don't reset.
  const [search, setSearch] = usePersistentState("contacts.search", "");
  const [isaFilter, setIsaFilter] = usePersistentState<string>("contacts.isaFilter", user?.role === "isa" ? String(user.id) : "all");
  const [isaStatusFilter, setIsaStatusFilter] = usePersistentState<string>("contacts.isaStatusFilter", "all");
  const [leadSourceFilter, setLeadSourceFilter] = usePersistentState<string>("contacts.leadSourceFilter", "all");

  const handleSearchChange = (val: string) => { setSearch(val); setPage(1); };
  const handleIsaFilterChange = (val: string) => { setIsaFilter(val); setPage(1); };
  const handleIsaStatusFilterChange = (val: string) => { setIsaStatusFilter(val); setPage(1); };
  const handleLeadSourceFilterChange = (val: string) => { setLeadSourceFilter(val); setPage(1); };

  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignContactId, setAssignContactId] = useState<number | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [assignForm, setAssignForm] = useState<AssignForm>({ agentId: "", pipelineStatus: "new_lead", agentNotes: "", isaFollowUpDate: "", introduceClient: false });

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkIsaOpen, setBulkIsaOpen] = useState(false);
  const [bulkIsaId, setBulkIsaId] = useState<string>("none");

  const [page, setPage] = usePersistentState("contacts.page", 1);
  const [sortOrder, setSortOrder] = usePersistentState<"asc" | "desc">("contacts.sortOrder", "desc");
  const utils = trpc.useUtils();

  // Duplicate detection: debounce email/phone inputs by 600ms
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
  const isaIdParam = isaFilter === "all" ? undefined : isaFilter === "unassigned" ? -1 : Number(isaFilter);
  const isaStatusParam = isaStatusFilter === "all" ? undefined : isaStatusFilter as any;
  const leadSourceIdParam = leadSourceFilter === "all" ? undefined : Number(leadSourceFilter);
  const { data: contactsData, isLoading } = trpc.contacts.list.useQuery({ search: search || undefined, isaId: isaIdParam, isaStatus: isaStatusParam, leadSourceId: leadSourceIdParam, page, limit: 25, sortOrder });
  const contacts = contactsData?.rows ?? [];
  const totalContacts = contactsData?.total ?? 0;
  const totalPages = Math.ceil(totalContacts / 25);
  const { data: statusCounts } = trpc.contacts.statusCounts.useQuery(undefined, { enabled: user?.role !== "agent" });
  const canListUsers = user?.role === "admin" || user?.role === "isa";
  const { data: agents = [] } = trpc.users.list.useQuery({ role: "agent" }, { enabled: canListUsers });
  const { data: isas = [] } = trpc.users.list.useQuery({ role: "isa" }, { enabled: canListUsers });
  const { data: leadSourcesData = [] } = trpc.leadSources.listFlat.useQuery();

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
      setAssignForm({ agentId: "", pipelineStatus: "new_lead", agentNotes: "", isaFollowUpDate: "", introduceClient: false });
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
      introduceClient: assignForm.introduceClient,
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

  const canAssign = user?.role === "admin" || user?.role === "isa";
  const canBulkAssign = user?.role === "admin" || user?.role === "isa";
  const allSelected = contacts.length > 0 && selectedIds.size === contacts.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < contacts.length;

  const [bulkOpen, setBulkOpen] = useState(false);
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
          <Select value={isaFilter} onValueChange={handleIsaFilterChange}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by ISA" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ISAs</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {(isas as any[]).map((u: any) => (
                <SelectItem key={u.id} value={String(u.id)}>{u.name ?? `ISA #${u.id}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          onClick={() => setSortOrder(o => o === "asc" ? "desc" : "asc")}
          title={sortOrder === "asc" ? "Sorted A → Z (click for Z → A)" : "Sorted Z → A (click for A → Z)"}
        >
          {sortOrder === "asc" ? <><ArrowUpAZ className="h-4 w-4" /><span className="hidden sm:inline">A → Z</span></> : <><ArrowDownAZ className="h-4 w-4" /><span className="hidden sm:inline">Z → A</span></>}
        </Button>
        <Select value={leadSourceFilter} onValueChange={handleLeadSourceFilterChange}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by Lead Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Lead Sources</SelectItem>
            {(() => {
              const allSources = leadSourcesData as any[];
              const parents = allSources.filter((s: any) => !s.ls.parentId);
              const children = allSources.filter((s: any) => !!s.ls.parentId);
              // Top-level sources that have sub-sources
              const parentIds = new Set(children.map((c: any) => c.ls.parentId));
              const items: React.ReactNode[] = [];
              parents.forEach((p: any) => {
                const subs = children.filter((c: any) => c.ls.parentId === p.ls.id);
                if (subs.length > 0) {
                  // Parent is a group label with selectable children
                  items.push(
                    <SelectGroup key={`group-${p.ls.id}`}>
                      <SelectLabel className="text-xs font-semibold text-foreground px-2 py-1.5 cursor-pointer hover:bg-accent rounded-sm"
                        onClick={() => handleLeadSourceFilterChange(String(p.ls.id))}
                      >
                        {p.ls.name}
                      </SelectLabel>
                      {subs.map((sub: any) => (
                        <SelectItem key={sub.ls.id} value={String(sub.ls.id)} className="pl-6">
                          {sub.ls.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                } else {
                  // Standalone top-level source
                  items.push(
                    <SelectItem key={p.ls.id} value={String(p.ls.id)}>{p.ls.name}</SelectItem>
                  );
                }
              });
              // Any orphaned children (parentId set but parent not found)
              const orphans = children.filter((c: any) => !parents.find((p: any) => p.ls.id === c.ls.parentId));
              if (orphans.length > 0) {
                items.push(<SelectSeparator key="orphan-sep" />);
                orphans.forEach((o: any) => {
                  items.push(<SelectItem key={o.ls.id} value={String(o.ls.id)}>{o.ls.name}</SelectItem>);
                });
              }
              return items;
            })()}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
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

      {/* Insights Panel */}
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
                          onClick={() => { setIsaFilter("all"); }}
                        >
                          Clear filters and search again
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  contacts.map((row: any) => { const { contact, agentConnectionId, agentName, agentId: rowAgentId } = row; return (
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
                              return (
                                <div className="flex items-center gap-1 flex-wrap">
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
                  ); })
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
              <span className="text-muted-foreground">
                Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, totalContacts)} of {totalContacts} contacts
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <span className="text-muted-foreground">{page} / {totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
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
              <Select value={bulkIsaId} onValueChange={setBulkIsaId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select ISA..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassign (remove ISA)</SelectItem>
                  {(isas as any[]).map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name ?? `ISA #${u.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  <Select value={form.assignedIsaId || "none"} onValueChange={v => setForm(f => ({ ...f, assignedIsaId: v === "none" ? "" : v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="No ISA assigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No ISA assigned</SelectItem>
                      {(isas as any[]).map((u: any) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Notes</Label>
                <Textarea className="mt-1" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
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
              <Select value={assignForm.agentId || "none"} onValueChange={v => setAssignForm(f => ({ ...f, agentId: v === "none" ? "" : v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select agent..." /></SelectTrigger>
                <SelectContent>
                  {(agents as any[]).map((a: any) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            {/* Only show ISA follow-up date if the contact has an ISA assigned */}
            {(() => {
              const assignContact = contacts.find((c: any) => c.id === assignContactId);
              return (assignContact as any)?.assignedIsaId || (assignContact as any)?.assignedIsa ? (
                <div>
                  <Label>ISA follow up date <span className="text-muted-foreground font-normal">(creates a task for the assigned ISA - optional)</span></Label>
                  <Input type="date" className="mt-1" value={assignForm.isaFollowUpDate} onChange={e => setAssignForm(f => ({ ...f, isaFollowUpDate: e.target.value }))} />
                </div>
              ) : null;
            })()}
            <div>
              <Label>Notes for Agent <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                className="mt-1"
                rows={3}
                placeholder="Any context to pass to the agent..."
                value={assignForm.agentNotes}
                onChange={e => setAssignForm(f => ({ ...f, agentNotes: e.target.value }))}
              />
            </div>
            {/* Agent booking link */}
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
            {/* Introduce client to agent */}
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
            <Button onClick={handleAssign} disabled={!assignForm.agentId || createConnection.isPending}>
              {createConnection.isPending ? "Assigning..." : "Assign to Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
