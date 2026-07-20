import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { Plus, ChevronRight, ChevronDown, Pencil, Trash2, FolderOpen, Folder, Lock, Percent, Copy, Check, Link2, ExternalLink, Search, Upload, FileText, Download, RefreshCw } from "lucide-react";

const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  buyer: "Buyer Campaign",
  seller: "Seller Campaign",
  both: "Buyer & Seller",
};

const REFERRAL_PERCENT_OPTIONS = [5, 10, 15, 20, 25, 30];

type SourceRow = {
  ls: {
    id: number;
    name: string;
    parentId: number | null;
    campaignType: "buyer" | "seller" | "both" | null;
    referralPercent: number | null;
    isProtected: boolean;
    description: string | null;
    isActive: boolean;
    agreementUrl: string | null;
    agreementKey: string | null;
    requireAgreementForSubSources: boolean;
  };
  contactCount: number;
};

type FormData = {
  name: string;
  campaignType: string;
  parentId: string;
  referralPercent: string;
  description: string;
  agreementUrl: string;
  agreementKey: string;
  requireAgreementForSubSources: boolean;
};

const emptyForm: FormData = {
  name: "", campaignType: "none", parentId: "", referralPercent: "", description: "",
  agreementUrl: "", agreementKey: "", requireAgreementForSubSources: false,
};

// ─── Partner Links Sub-Component ─────────────────────────────────────────────────────
function PartnerLinksTab() {
  const { data: sources = [], isLoading } = trpc.webhooks.listPartnerSources.useQuery();
  const { data: analytics = [] } = trpc.webhooks.getPartnerLinkAnalytics.useQuery();
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<number | null>(null);

  // Build analytics map by id for O(1) lookup
  const analyticsMap = new Map(analytics.map(a => [a.id, a]));

  const filtered = sources.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );
  function buildPartnerUrl(name: string) {
    return `${window.location.origin}/partner-lead?partner=${encodeURIComponent(name)}`;
  }

  async function copyLink(id: number, name: string) {
    try {
      await navigator.clipboard.writeText(buildPartnerUrl(name));
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Failed to copy link");
    }
  }

  function openLink(name: string) {
    window.open(buildPartnerUrl(name), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-5">
      {/* How it works */}
      <Card className="border-cyan-500/30 bg-cyan-500/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Link2 className="h-5 w-5 text-cyan-500 mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">How it works</p>
              <p>
                Each link pre-fills the partner source on the public intake form. The partner
                doesn't need an account — they just fill in their client's details and submit.
                You'll receive an admin notification and the contact will be created in the CRM automatically.
              </p>
              <p className="mt-1">
                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                  {window.location.origin}/partner-lead?partner=Partner+Name
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search lead sources..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Active Lead Sources
            {sources && (
              <Badge variant="secondary" className="ml-2 font-normal">
                {sources.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading sources…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              {search ? "No sources match your search." : "No active lead sources found."}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((source) => {
                const url = buildPartnerUrl(source.name);
                const isCopied = copied === source.id;
                const stats = analyticsMap.get(source.id);
                return (
                  <div
                    key={source.id}
                    className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-foreground truncate">{source.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{url}</p>
                      {/* Analytics badges */}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400" />
                          <span className="font-medium text-foreground">{stats?.clickCount ?? 0}</span> clicks
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span className="font-medium text-foreground">{stats?.submissionCount ?? 0}</span> submissions
                        </span>
                        {stats && stats.clickCount > 0 && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="text-xs text-muted-foreground">
                              {Math.round((stats.submissionCount / stats.clickCount) * 100)}% conversion
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openLink(source.name)}>
                        <ExternalLink className="h-3.5 w-3.5" />
                        Preview
                      </Button>
                      <Button size="sm" className="gap-1.5" onClick={() => copyLink(source.id, source.name)}>
                        {isCopied ? (
                          <><Check className="h-3.5 w-3.5" />Copied!</>
                        ) : (
                          <><Copy className="h-3.5 w-3.5" />Copy Link</>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LeadSourcesPage() {
  const utils = trpc.useUtils();
  const { data: rawSources = [], isLoading } = trpc.leadSources.list.useQuery();

  const sources = rawSources as unknown as SourceRow[];

  const [activeTab, setActiveTab] = useState<"sources" | "partner-links" | "inactive">("sources");
  const { data: inactiveSources = [] } = trpc.leadSources.listInactive.useQuery();
  const reactivateMutation = trpc.leadSources.update.useMutation({
    onSuccess: () => { utils.leadSources.list.invalidate(); utils.leadSources.listInactive.invalidate(); toast.success("Lead source reactivated"); },
    onError: (e) => toast.error(e.message),
  });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [agreementFile, setAgreementFile] = useState<File | null>(null);
  const [agreementUploading, setAgreementUploading] = useState(false);
  const [agreementError, setAgreementError] = useState<string | null>(null);

  const createMutation = trpc.leadSources.create.useMutation({
    onSuccess: () => { utils.leadSources.list.invalidate(); setShowDialog(false); toast.success("Lead source created"); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.leadSources.update.useMutation({
    onSuccess: () => { utils.leadSources.list.invalidate(); setShowDialog(false); toast.success("Lead source updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.leadSources.delete.useMutation({
    onSuccess: () => { utils.leadSources.list.invalidate(); toast.success("Lead source deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const parents = sources.filter(s => s.ls.parentId === null);
  const childrenOf = (parentId: number) => sources.filter(s => s.ls.parentId === parentId);

  // Check if a parent is the "Referral Partner" category
  function isReferralPartnerCategory(parentId: string | number | null): boolean {
    if (!parentId) return false;
    const parent = sources.find(s => s.ls.id === Number(parentId));
    return parent?.ls.name?.toLowerCase().includes("referral partner") ?? false;
  }

  function openCreate(parentId?: number) {
    setEditingId(null);
    setForm({ ...emptyForm, parentId: parentId ? String(parentId) : "" });
    setAgreementFile(null);
    setAgreementError(null);
    setShowDialog(true);
  }

  function openEdit(row: SourceRow) {
    setEditingId(row.ls.id);
    setForm({
      name: row.ls.name,
      campaignType: row.ls.campaignType ?? "none",
      parentId: row.ls.parentId ? String(row.ls.parentId) : "",
      referralPercent: row.ls.referralPercent?.toString() ?? "",
      description: row.ls.description ?? "",
      agreementUrl: row.ls.agreementUrl ?? "",
      agreementKey: row.ls.agreementKey ?? "",
      requireAgreementForSubSources: row.ls.requireAgreementForSubSources ?? false,
    });
    setAgreementFile(null);
    setAgreementError(null);
    setShowDialog(true);
  }

  async function uploadAgreementFile(file: File): Promise<{ url: string; fileKey: string } | null> {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload/lead-source-agreement", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      return await res.json();
    } catch {
      return null;
    }
  }

  async function handleSubmit() {
    const isSubSource = !!form.parentId;
    const selectedParent = isSubSource ? sources.find(source => source.ls.id === Number(form.parentId)) : undefined;
    const agreementRequired = !!selectedParent?.ls.requireAgreementForSubSources;
    const payload: any = {
      name: form.name.trim(),
      parentId: form.parentId ? Number(form.parentId) : null,
      campaignType: (form.campaignType !== "none" ? form.campaignType : null) as "buyer" | "seller" | "both" | null | undefined,
      description: form.description.trim() || null,
    };
    // Include referralPercent if this is a sub-source under Referral Partner
    if (form.referralPercent) {
      payload.referralPercent = parseInt(form.referralPercent);
    } else {
      payload.referralPercent = null;
    }
    if (!payload.name) { toast.error("Name is required"); return; }

    let agreementUrl = form.agreementUrl || null;
    let agreementKey = form.agreementKey || null;
    if (agreementFile) {
      setAgreementUploading(true);
      const uploaded = await uploadAgreementFile(agreementFile);
      setAgreementUploading(false);
      if (!uploaded) { toast.error("Agreement upload failed. Please try again."); return; }
      agreementUrl = uploaded.url;
      agreementKey = uploaded.fileKey;
    } else if (isSubSource && agreementRequired && !agreementUrl) {
      setAgreementError("A referral agreement is required for sub-sources in this category.");
      return;
    }
    if (isSubSource) {
      payload.agreementUrl = agreementUrl;
      payload.agreementKey = agreementKey;
    } else {
      payload.requireAgreementForSubSources = form.requireAgreementForSubSources;
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const selectedParent = form.parentId ? sources.find(source => source.ls.id === Number(form.parentId)) : undefined;
  const agreementRequired = !!selectedParent?.ls.requireAgreementForSubSources;

  // Whether the form is for a referral partner sub-source
  const showReferralPercent = isReferralPartnerCategory(form.parentId) || (editingId && (() => {
    const editing = sources.find(s => s.ls.id === editingId);
    return editing?.ls.parentId ? isReferralPartnerCategory(editing.ls.parentId) : false;
  })());

  return (
    <div>
      <PageHeader
        title="Lead Sources"
        subtitle="Manage your lead source hierarchy, sub-sources, and partner intake links"
        actions={
          activeTab === "sources" ? (
            <Button size="sm" onClick={() => openCreate()}><Plus className="h-4 w-4 mr-1" />Add Category</Button>
          ) : null
        }
      />
      {/* Tab switcher */}
      <div className="flex gap-1 mb-5 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("sources")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "sources"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Lead Sources
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("partner-links")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "partner-links"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Partner Links
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("inactive")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "inactive"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Inactive {(inactiveSources as SourceRow[]).length > 0 && <span className="ml-1 text-xs bg-muted rounded-full px-1.5 py-0.5">{(inactiveSources as SourceRow[]).length}</span>}
        </button>
      </div>
      {activeTab === "partner-links" && <PartnerLinksTab />}
      {activeTab === "inactive" && (
        <div className="space-y-2">
          {(inactiveSources as SourceRow[]).length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">No inactive lead sources.</CardContent></Card>
          ) : (
            (inactiveSources as SourceRow[]).map(row => (
              <Card key={row.ls.id}>
                <CardContent className="py-3 px-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{row.ls.name}</p>
                    {row.ls.description && <p className="text-xs text-muted-foreground">{row.ls.description}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">{row.contactCount} contact{row.contactCount !== 1 ? 's' : ''}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reactivateMutation.mutate({ id: row.ls.id, isActive: true })}
                    disabled={reactivateMutation.isPending}
                  >
                    Reactivate
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
      {activeTab === "sources" && (
        <div>
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
      ) : parents.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-medium mb-2">No lead sources yet</p>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Create top-level categories like "Paid Lead", "Website Lead", or "Social Media", then add sub-sources under each.
            </p>
            <Button onClick={() => openCreate()}>
              <Plus className="h-4 w-4 mr-1" />Add First Category
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {parents.map(parent => {
            const children = childrenOf(parent.ls.id);
            const isOpen = expanded.has(parent.ls.id);
            const isReferralParent = parent.ls.name.toLowerCase().includes("referral partner");
            return (
              <Card key={parent.ls.id} className="overflow-hidden">
                <div className="flex items-center gap-3 p-4 hover:bg-muted/20 transition-colors">
                  <button onClick={() => toggleExpand(parent.ls.id)} className="text-muted-foreground hover:text-foreground">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <Folder className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{parent.ls.name}</span>
                      {parent.ls.isProtected && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Lock className="h-2.5 w-2.5" /> Protected
                        </Badge>
                      )}
                      {parent.ls.requireAgreementForSubSources && (
                        <Badge variant="outline" className="text-xs gap-1 text-amber-700 border-amber-300 bg-amber-50">
                          <FileText className="h-2.5 w-2.5" /> Agreement required
                        </Badge>
                      )}
                      {parent.ls.campaignType && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">
                          {CAMPAIGN_TYPE_LABELS[parent.ls.campaignType]}
                        </span>
                      )}
                      {!parent.ls.isActive && <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>}
                    </div>
                    {parent.ls.description && <p className="text-xs text-muted-foreground mt-0.5">{parent.ls.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-muted-foreground mr-2">
                      {children.length} sub-source{children.length !== 1 ? "s" : ""}
                      {parent.contactCount > 0 && ` · ${parent.contactCount} contact${parent.contactCount !== 1 ? "s" : ""}`}
                    </span>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openCreate(parent.ls.id)}>
                      <Plus className="h-3 w-3 mr-1" />Add Sub-Source
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(parent)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {!parent.ls.isProtected && (
                      <Button
                        size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => { if (confirm(`Delete "${parent.ls.name}"?`)) deleteMutation.mutate({ id: parent.ls.id }); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {isOpen && children.length > 0 && (
                  <div className="border-t divide-y bg-muted/10">
                    {children.map(child => (
                      <div key={child.ls.id} className="flex items-center gap-3 pl-10 pr-4 py-3 hover:bg-muted/20 transition-colors">
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{child.ls.name}</span>
                            {child.ls.isProtected && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <Lock className="h-2.5 w-2.5" /> Protected
                              </Badge>
                            )}
                            {child.ls.campaignType && (
                              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {CAMPAIGN_TYPE_LABELS[child.ls.campaignType]}
                              </span>
                            )}
                            {isReferralParent && child.ls.referralPercent != null && (
                              <Badge className="text-xs gap-1 bg-blue-100 text-blue-700 hover:bg-blue-100">
                                <Percent className="h-2.5 w-2.5" /> {child.ls.referralPercent}% Referral Fee
                              </Badge>
                            )}
                            {!child.ls.isActive && <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>}
                          </div>
                          {child.ls.description && <p className="text-xs text-muted-foreground mt-0.5">{child.ls.description}</p>}
                          {child.contactCount > 0 && (
                            <p className="text-xs text-muted-foreground mt-0.5">{child.contactCount} contact{child.contactCount !== 1 ? "s" : ""}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {child.ls.agreementUrl && (
                            <a
                              href={child.ls.agreementUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View Agreement"
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(child)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {!child.ls.isProtected && (
                            <Button
                              size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => { if (confirm(`Delete "${child.ls.name}"?`)) deleteMutation.mutate({ id: child.ls.id }); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {isOpen && children.length === 0 && (
                  <div className="border-t px-10 py-3 text-xs text-muted-foreground italic bg-muted/10">
                    No sub-sources yet —{" "}
                    <button className="text-primary hover:underline" onClick={() => openCreate(parent.ls.id)}>add one</button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
        </div>
      )}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Lead Source" : form.parentId ? "Add Sub-Source" : "Add Lead Source Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name *</Label>
              <Input
                className="mt-1"
                placeholder={form.parentId ? "e.g. Google Buyer Q1, Facebook Spring" : "e.g. Paid Lead, Website Lead, Social Media"}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            {(form.parentId || editingId) && (
              <div>
                <Label>Parent Category</Label>
                <Select value={form.parentId || "none"} onValueChange={v => setForm(f => ({ ...f, parentId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Top-level (no parent)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Top-level (no parent)</SelectItem>
                    {parents.filter(p => p.ls.id !== editingId).map(p => (
                      <SelectItem key={p.ls.id} value={String(p.ls.id)}>{p.ls.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Campaign Type <span className="text-muted-foreground font-normal">(for paid lead sources)</span></Label>
              <Select value={form.campaignType} onValueChange={v => setForm(f => ({ ...f, campaignType: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="buyer">Buyer Campaign</SelectItem>
                  <SelectItem value="seller">Seller Campaign</SelectItem>
                  <SelectItem value="both">Buyer & Seller</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!form.parentId && (
              <div className="flex items-start justify-between gap-4 rounded-md border bg-muted/20 px-3 py-3">
                <div className="space-y-1">
                  <Label htmlFor="require-agreement-for-sub-sources" className="cursor-pointer">
                    Require agreement for sub-sources
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    When enabled, each sub-source in this category must have a referral agreement uploaded.
                  </p>
                </div>
                <Switch
                  id="require-agreement-for-sub-sources"
                  checked={form.requireAgreementForSubSources}
                  onCheckedChange={checked => setForm(current => ({ ...current, requireAgreementForSubSources: checked }))}
                  aria-label="Require agreement for sub-sources"
                />
              </div>
            )}

            {showReferralPercent && (
              <div>
                <Label className="flex items-center gap-1">
                  <Percent className="h-3.5 w-3.5" /> Referral Fee %
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-1">
                  The percentage of the deal's gross commission paid as a referral fee
                </p>
                <Select value={form.referralPercent || "none"} onValueChange={v => setForm(f => ({ ...f, referralPercent: v === "none" ? "" : v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select referral %" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {REFERRAL_PERCENT_OPTIONS.map(p => (
                      <SelectItem key={p} value={String(p)}>{p}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                className="mt-1"
                placeholder="Notes about this source"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* Agreement upload — required only when the selected category requires it */}
            {form.parentId && (
              <div>
                <Label className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" />
                  Upload Agreement {agreementRequired && <span className="text-destructive">*</span>}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                  {agreementRequired
                    ? "Required for this category. Accepted formats: PDF, DOCX, PNG, JPG (max 16 MB)."
                    : "Optional. Accepted formats: PDF, DOCX, PNG, JPG (max 16 MB)."}
                </p>

                {/* Existing agreement display */}
                {form.agreementUrl && !agreementFile && (
                  <div className="flex items-center gap-2 mb-2 p-2 rounded-md border bg-muted/30 text-sm">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <span className="flex-1 truncate text-xs text-muted-foreground">Agreement on file</span>
                    <a
                      href={form.agreementUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" /> View
                    </a>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => document.getElementById('agreement-upload-input')?.click()}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Replace
                    </button>
                  </div>
                )}

                {/* New file selected preview */}
                {agreementFile && (
                  <div className="flex items-center gap-2 mb-2 p-2 rounded-md border border-primary/30 bg-primary/5 text-sm">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <span className="flex-1 truncate text-xs">{agreementFile.name}</span>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => setAgreementFile(null)}
                    >
                      Remove
                    </button>
                  </div>
                )}

                {/* Upload button */}
                {!agreementFile && (
                  <label
                    htmlFor="agreement-upload-input"
                    className="flex items-center gap-2 cursor-pointer border border-dashed rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    {form.agreementUrl ? "Upload replacement file" : "Choose file to upload"}
                  </label>
                )}
                <input
                  id="agreement-upload-input"
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) { setAgreementFile(f); setAgreementError(null); }
                    e.target.value = "";
                  }}
                />

                {/* Validation error */}
                {agreementError && (
                  <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                    <span>⚠</span> {agreementError}
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || agreementUploading}>
              {agreementUploading ? "Uploading..." : isSubmitting ? "Saving..." : editingId ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
