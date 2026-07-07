import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GroupsPage from "./GroupsPage";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { formatPhone, isValidEmail, isValidPhone } from "@/lib/inputFormatters";
import { Plus, Pencil, Trash2, Users, Eye, Search, Filter, UserCheck, Link2, Link2Off, KeyRound, Upload, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { safeFormat } from "@/lib/safeFormat";

type UserRow = {
  id: number;
  profilePhotoUrl?: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  reportsToId: number | null;
  marketProfileId: number | null;
  role: "admin" | "agent" | "isa" | "agent_support" | "user";
  createdAt: Date;
  lastSignedIn: Date;
  loginMethod: string | null;
};

type MarketRow = { id: number; name: string };

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  agent: "Agent",
  isa: "ISA",
  agent_support: "Agent Support",
  user: "User",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-amber-100 text-amber-800",
  agent: "bg-blue-100 text-blue-800",
  isa: "bg-purple-100 text-purple-800",
  agent_support: "bg-teal-100 text-teal-700",
  user: "bg-gray-100 text-gray-700",
};

type FormState = {
  name: string;
  email: string;
  role: "admin" | "agent" | "isa" | "agent_support";
  phone: string;
  title: string;
  reportsToId: string; // string for select
  marketProfileId: string;    // string for select
  commissionSplit: string; // free numeric input (0-100)
  callBookingLink: string;
  newMarketName: string;
  enableOnboarding: boolean;
  onboardingTemplateId: string;
  allowHiddenNav: boolean;
};

const EMPTY_FORM: FormState = {
  name: "", email: "", role: "agent" as "admin" | "agent" | "isa" | "agent_support",
  phone: "", title: "", reportsToId: "", marketProfileId: "",
  commissionSplit: "",
  callBookingLink: "",
  newMarketName: "",
  enableOnboarding: false,
  onboardingTemplateId: "",
  allowHiddenNav: false,
};


export default function UsersPage() {
  const { user: me } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: users = [], isLoading } = trpc.users.listWithDocCounts.useQuery();
  const { data: markets = [] } = trpc.markets.list.useQuery();
  const { data: onboardingTemplates } = trpc.onboarding.listTemplates.useQuery();

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [creatingMarket, setCreatingMarket] = useState(false);

  // Admin headshot upload state
  const [headshotPreview, setHeadshotPreview] = useState<string | null>(null);
  const [headshotFile, setHeadshotFile] = useState<File | null>(null);
  const [headshotDragOver, setHeadshotDragOver] = useState(false);
  const [headshotUploadState, setHeadshotUploadState] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [headshotError, setHeadshotError] = useState<string | null>(null);
  const headshotInputRef = useRef<HTMLInputElement>(null);
  const adminUpdateAvatarMutation = trpc.users.adminUpdateAvatar.useMutation({
    onSuccess: (_data, variables) => {
      utils.users.listWithDocCounts.invalidate();
      utils.users.orgChart.invalidate();
      utils.users.getCoreProfile.invalidate({ userId: variables.userId });
    },
  });

  const createMarketMutation = trpc.markets.create.useMutation({
    onSuccess: (newMarket) => {
      utils.markets.list.invalidate();
      setForm((f) => ({ ...f, marketProfileId: String(newMarket.id), newMarketName: "" }));
      setCreatingMarket(false);
      toast.success(`Market "${newMarket.name}" created`);
    },
    onError: (e) => toast.error(e.message),
  });

  const startOnboardingMut = trpc.onboarding.createInstance.useMutation({
    onSuccess: () => toast.success("Onboarding started for new agent"),
    onError: (e: any) => toast.error(`Onboarding error: ${e.message}`),
  });
  const createMutation = trpc.users.create.useMutation({
    onSuccess: (result) => {
      toast.success("Team member added");
      utils.users.listWithDocCounts.invalidate();
      if (form.enableOnboarding && form.onboardingTemplateId) {
        startOnboardingMut.mutate({
          agentUserId: result.id,
          templateId: Number(form.onboardingTemplateId),
        });
      }
      setAddOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.users.update.useMutation({
    onSuccess: () => {
      toast.success("Team member updated");
      utils.users.listWithDocCounts.invalidate();
      setEditTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.users.delete.useMutation({
    onSuccess: () => {
      toast.success("Team member removed");
      utils.users.listWithDocCounts.invalidate();
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  function openAdd() {
    setForm(EMPTY_FORM);
    setCreatingMarket(false);
    setAddOpen(true);
  }

  function openEdit(u: UserRow) {
    setForm({
      name: u.name ?? "",
      email: u.email ?? "",
      role: (["admin", "agent", "isa", "agent_support"].includes(u.role) ? u.role : "agent") as "admin" | "agent" | "isa" | "agent_support",
      phone: u.phone ?? "",
      title: u.title ?? "",
      reportsToId: u.reportsToId ? String(u.reportsToId) : "",
      marketProfileId: u.marketProfileId ? String(u.marketProfileId) : "",
      commissionSplit: (u as any).commissionSplit ? String((u as any).commissionSplit) : "",
      callBookingLink: (u as any).callBookingLink ?? "",
      newMarketName: "",
      enableOnboarding: false,
      onboardingTemplateId: "",
      allowHiddenNav: !!(u as any).allowHiddenNav,
    });
    setCreatingMarket(false);
    setEditTarget(u);
    // Reset headshot upload state for this edit session
    setHeadshotPreview(null);
    setHeadshotFile(null);
    setHeadshotUploadState("idle");
    setHeadshotError(null);
  }

  const isTyler = (me as any)?.email === "tyler@savvy.realty";

  function buildMutationPayload() {
    return {
      name: form.name,
      email: form.email,
      role: form.role,
      phone: form.phone || null,
      title: form.title || null,
      reportsToId: form.reportsToId ? Number(form.reportsToId) : null,
      marketProfileId: form.marketProfileId ? Number(form.marketProfileId) : null,
      commissionSplit: form.commissionSplit ? Number(form.commissionSplit) : null,
      callBookingLink: form.callBookingLink || null,
      ...(isTyler ? { allowHiddenNav: form.allowHiddenNav } : {}),
    };
  }

  async function handleSaveNewMarket() {
    if (!form.newMarketName.trim()) return;
    createMarketMutation.mutate({ name: form.newMarketName.trim() });
  }

  // Agent Support assignment management
  const [assignTarget, setAssignTarget] = useState<UserRow | null>(null);
  const [pwTarget, setPwTarget] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const adminSetPasswordMut = trpc.auth.adminSetPassword.useMutation({
    onSuccess: () => {
      toast.success(`Password updated for ${pwTarget?.name ?? pwTarget?.email}`);
      setPwTarget(null);
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e) => toast.error(e.message),
  });
  const { data: allAssignments = [] } = trpc.agentSupport.listAssignments.useQuery(
    undefined,
    { enabled: (me as any)?.role === "admin" }
  );
  const addAssignmentMut = trpc.agentSupport.addAssignment.useMutation({
    onSuccess: () => { utils.agentSupport.listAssignments.invalidate(); toast.success("Agent assigned"); },
    onError: (e) => toast.error(e.message),
  });
  const removeAssignmentMut = trpc.agentSupport.removeAssignment.useMutation({
    onSuccess: () => { utils.agentSupport.listAssignments.invalidate(); toast.success("Assignment removed"); },
    onError: (e) => toast.error(e.message),
  });

  const [filterRole, setFilterRole] = useState<"all" | "admin" | "agent" | "isa" | "agent_support">("all");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [filterSearch, setFilterSearch] = useState("");

  const userList = (users as (UserRow & { isActive?: boolean })[]).filter((u) => {
    if (filterRole !== "all" && u.role !== filterRole) return false;
    if (filterActive === "active" && (u as any).isActive === false) return false;
    if (filterActive === "inactive" && (u as any).isActive !== false) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (!((u.name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q))) return false;
    }
    return true;
  });
  const marketList = markets as MarketRow[];

  function getMarketName(id: number | null) {
    if (!id) return null;
    return marketList.find((m) => m.id === id)?.name ?? null;
  }

  function getReportsToName(id: number | null) {
    if (!id) return null;
    return userList.find((u) => u.id === id)?.name ?? null;
  }

  // ── Shared form fields ──
  function renderFormFields(isEdit = false) {
    const otherUsers = isEdit
      ? userList.filter((u) => u.id !== editTarget?.id)
      : userList;

    return (
      <div className="space-y-4 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Full Name *</Label>
            <Input
              placeholder="Jane Smith"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          {form.role === "admin" && (
            <div className="space-y-1.5">
              <Label>Title / Position *</Label>
              <Input
                placeholder="Director of Operations"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input
              type="email"
              placeholder="jane@savvyrealty.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input
              placeholder="(555) 000-0000"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: formatPhone(e.target.value) }))}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Reports To *</Label>
          <Select
            value={form.reportsToId}
            onValueChange={(v) => setForm((f) => ({ ...f, reportsToId: v === "__none__" ? "" : v }))}
          >
            <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— None (top of hierarchy) —</SelectItem>
              {otherUsers.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name ?? u.email} — {ROLE_LABELS[u.role] ?? u.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Required to keep the Org Chart accurate. Select “None” only for the top-level owner.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Role *</Label>
          <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as any }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="isa">ISA (Inside Sales Agent)</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="agent_support">Agent Support</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(form.role === "agent") && (
          <div className="space-y-1.5">
            <Label>Call Booking Calendar Link</Label>
            <Input
              placeholder="https://calendly.com/agent-name"
              value={form.callBookingLink}
              onChange={(e) => setForm((f) => ({ ...f, callBookingLink: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">Calendly or other booking page URL</p>
          </div>
        )}
        {(form.role === "agent") && (
          <div className="space-y-1.5">
            <Label>Commission Split (Agent %)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                placeholder="e.g. 80"
                value={form.commissionSplit}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || (Number(v) >= 0 && Number(v) <= 100)) {
                    setForm((f) => ({ ...f, commissionSplit: v }));
                  }
                }}
                className={form.commissionSplit && (Number(form.commissionSplit) < 0 || Number(form.commissionSplit) > 100) ? "border-red-500" : ""}
              />
              {form.commissionSplit && Number(form.commissionSplit) >= 0 && Number(form.commissionSplit) <= 100 && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  Agent {form.commissionSplit}% / Savvy {100 - Number(form.commissionSplit)}%
                </span>
              )}
            </div>
            {form.commissionSplit && (Number(form.commissionSplit) < 0 || Number(form.commissionSplit) > 100) && (
              <p className="text-xs text-red-500">Must be between 0 and 100</p>
            )}
            <p className="text-xs text-muted-foreground">Enter the agent's percentage (0–100). Savvy's share is calculated automatically.</p>
          </div>
        )}
        {form.role === "agent" && (
        <div className="space-y-1.5">
          <Label>Market</Label>
          {!creatingMarket ? (
            <div className="flex gap-2">
              <Select value={form.marketProfileId} onValueChange={(v) => setForm((f) => ({ ...f, marketProfileId: v === "none" ? "" : v }))}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select market" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {marketList.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={() => setCreatingMarket(true)}>
                + New
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="Market name"
                value={form.newMarketName}
                onChange={(e) => setForm((f) => ({ ...f, newMarketName: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleSaveNewMarket()}
                autoFocus
              />
              <Button
                type="button"
                size="sm"
                onClick={handleSaveNewMarket}
                disabled={!form.newMarketName.trim() || createMarketMutation.isPending}
              >
                Save
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setCreatingMarket(false)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
        )}
        {isEdit && (
          <div className="border-t pt-3 space-y-3">
            <Label className="text-sm font-medium">Profile Photo</Label>
            {/* Current photo preview */}
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 ring-2 ring-border">
                {(headshotPreview ?? editTarget?.profilePhotoUrl) && (
                  <AvatarImage
                    src={headshotPreview ?? editTarget?.profilePhotoUrl ?? ""}
                    alt={editTarget?.name ?? ""}
                    className="object-cover"
                  />
                )}
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {editTarget?.name ? editTarget.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) : "?"}
                </AvatarFallback>
              </Avatar>
              <div className="text-xs text-muted-foreground">
                {editTarget?.profilePhotoUrl && !headshotPreview
                  ? "Current photo on file"
                  : headshotPreview
                  ? "New photo selected — click Save Photo to apply"
                  : "No photo uploaded yet"}
              </div>
            </div>
            {/* Drag-and-drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setHeadshotDragOver(true); }}
              onDragLeave={() => setHeadshotDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setHeadshotDragOver(false);
                const file = e.dataTransfer.files[0];
                if (!file) return;
                if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                  setHeadshotError("Only JPG, PNG, and WEBP images are allowed.");
                  setHeadshotUploadState("error");
                  return;
                }
                if (file.size > 2 * 1024 * 1024) {
                  setHeadshotError("File must be under 2MB.");
                  setHeadshotUploadState("error");
                  return;
                }
                setHeadshotError(null);
                setHeadshotUploadState("idle");
                setHeadshotFile(file);
                const reader = new FileReader();
                reader.onload = (ev) => setHeadshotPreview(ev.target?.result as string);
                reader.readAsDataURL(file);
              }}
              onClick={() => headshotInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${
                headshotDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <input
                ref={headshotInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                    setHeadshotError("Only JPG, PNG, and WEBP images are allowed.");
                    setHeadshotUploadState("error");
                    return;
                  }
                  if (file.size > 2 * 1024 * 1024) {
                    setHeadshotError("File must be under 2MB.");
                    setHeadshotUploadState("error");
                    return;
                  }
                  setHeadshotError(null);
                  setHeadshotUploadState("idle");
                  setHeadshotFile(file);
                  const reader = new FileReader();
                  reader.onload = (ev) => setHeadshotPreview(ev.target?.result as string);
                  reader.readAsDataURL(file);
                }}
              />
              <Upload className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground" />
              <p className="text-xs font-medium text-foreground">{headshotDragOver ? "Drop here" : "Drag & drop or click to upload"}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">JPG, PNG, WEBP — max 2MB</p>
            </div>
            {/* Save photo button */}
            {headshotFile && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  type="button"
                  disabled={headshotUploadState === "uploading"}
                  onClick={async () => {
                    if (!headshotFile || !editTarget) return;
                    setHeadshotUploadState("uploading");
                    setHeadshotError(null);
                    try {
                      const fd = new FormData();
                      fd.append("file", headshotFile);
                      fd.append("targetUserId", String(editTarget.id));
                      const res = await fetch("/api/upload/headshot", { method: "POST", body: fd, credentials: "include" });
                      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? "Upload failed"); }
                      const { url } = await res.json();
                      await adminUpdateAvatarMutation.mutateAsync({ userId: editTarget.id, avatarUrl: url });
                      setHeadshotUploadState("success");
                      setHeadshotFile(null);
                      setEditTarget((prev) => prev ? { ...prev, profilePhotoUrl: url } : prev);
                      toast.success(`Photo updated for ${editTarget.name ?? "user"}`);
                    } catch (err: any) {
                      setHeadshotError(err.message ?? "Upload failed");
                      setHeadshotUploadState("error");
                    }
                  }}
                >
                  {headshotUploadState === "uploading" ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Uploading…</>
                  ) : "Save Photo"}
                </Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => { setHeadshotFile(null); setHeadshotPreview(null); setHeadshotUploadState("idle"); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            {headshotUploadState === "success" && (
              <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />Photo saved successfully.
              </div>
            )}
            {headshotUploadState === "error" && headshotError && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />{headshotError}
              </div>
            )}
          </div>
        )}
        {isEdit && isTyler && (
          <div className="border-t pt-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="allowHiddenNav"
                checked={form.allowHiddenNav}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, allowHiddenNav: !!checked }))}
              />
              <Label htmlFor="allowHiddenNav" className="cursor-pointer">
                Allow access to Hidden Navigation
              </Label>
            </div>
            <p className="text-xs text-muted-foreground mt-1 pl-6">
              Grants this user access to the Hidden section in the sidebar (Projects, Smart Plans, Email Test).
            </p>
          </div>
        )}
        {!isEdit && form.role === "agent" && (
          <div className="space-y-3 border-t pt-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="enableOnboarding"
                checked={form.enableOnboarding}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, enableOnboarding: !!checked }))}
              />
              <Label htmlFor="enableOnboarding" className="cursor-pointer">Start onboarding for this agent</Label>
            </div>
            {form.enableOnboarding && (
              <div className="space-y-1.5 pl-6">
                <Label>Onboarding Template *</Label>
                <Select value={form.onboardingTemplateId} onValueChange={(v) => setForm((f) => ({ ...f, onboardingTemplateId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                  <SelectContent>
                    {onboardingTemplates?.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name} ({Number(t.taskCount)} tasks)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(!onboardingTemplates || onboardingTemplates.length === 0) && (
                  <p className="text-xs text-muted-foreground">No templates available. Create one in Onboarding Templates first.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" /> Users
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage team members and groups.
          </p>
        </div>
      </div>
      <Tabs defaultValue="members" className="space-y-6">
        <TabsList>
          <TabsTrigger value="members">Team Members</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
        </TabsList>
        <TabsContent value="groups"><GroupsPage /></TabsContent>
        <TabsContent value="members">
      <div className="flex justify-end">
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-2" /> Add Member
        </Button>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            className="w-full pl-9 pr-3 h-9 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Select value={filterRole} onValueChange={(v) => setFilterRole(v as any)}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All Roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
            <SelectItem value="isa">ISA</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="agent_support">Agent Support</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterActive} onValueChange={(v) => setFilterActive(v as any)}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Deactivated</SelectItem>
          </SelectContent>
        </Select>
        {(filterRole !== "all" || filterActive !== "all" || filterSearch) && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setFilterRole("all"); setFilterActive("all"); setFilterSearch(""); }}>
            Clear filters
          </Button>
        )}
        <span className="text-sm text-muted-foreground ml-auto">{userList.length} member{userList.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Split</TableHead>
              <TableHead>Market</TableHead>
              <TableHead>Reports To</TableHead>
              <TableHead>Last Sign In</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                  Loading team members...
                </TableCell>
              </TableRow>
            ) : userList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                  No team members yet. Add your first member above.
                </TableCell>
              </TableRow>
            ) : (
              userList.map((u) => {
                const initials = u.name
                  ? u.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
                  : "?";
                const isMe = u.id === (me as any)?.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          {(u as any).profilePhotoUrl && (
                            <AvatarImage src={(u as any).profilePhotoUrl} alt={u.name ?? ""} className="object-cover" />
                          )}
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              className="font-medium hover:underline hover:text-primary text-left transition-colors"
                              onClick={() => navigate(`/agents/${u.id}`)}
                              title="View profile"
                            >
                              {u.name ?? "—"}{isMe && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
                            </button>
                            {(u as any).documentCount > 0 && (
                              <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-primary/15 text-primary text-[10px] font-semibold" title={`${(u as any).documentCount} document${(u as any).documentCount !== 1 ? 's' : ''}`}>
                                {(u as any).documentCount}
                              </span>
                            )}
                          </div>
                          {(u as any).isActive === false ? (
                            <span className="inline-flex items-center text-[10px] font-medium text-red-700 bg-red-100 rounded-full px-1.5 py-0.5 w-fit leading-tight">
                              Deactivated
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-medium text-green-700 bg-green-100 rounded-full px-1.5 py-0.5 w-fit leading-tight">
                              Active
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{u.title ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{u.phone ?? "—"}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] ?? ROLE_COLORS.user}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {(u as any).commissionSplit ? `${(u as any).commissionSplit}/${100 - (u as any).commissionSplit}` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[140px]"><div className="truncate" title={getMarketName(u.marketProfileId) ?? ""}>{getMarketName(u.marketProfileId) ?? "—"}</div></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{getReportsToName(u.reportsToId) ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {u.lastSignedIn ? safeFormat(u.lastSignedIn, "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" title="View Profile" onClick={() => navigate(`/agents/${u.id}`)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {u.role === "agent_support" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Manage Agent Assignments"
                            onClick={() => setAssignTarget(u)}
                          >
                            <UserCheck className="h-4 w-4 text-teal-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" title="Set Password" onClick={() => { setPwTarget(u); setNewPassword(""); setConfirmPassword(""); }}>
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!isMe && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(u)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Add Dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
          </DialogHeader>
          {renderFormFields(false)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (form.email && !isValidEmail(form.email)) { toast.error("Please enter a valid email address"); return; }
                if (form.phone && !isValidPhone(form.phone)) { toast.error("Please enter a valid phone number (9+ digits)"); return; }
                createMutation.mutate(buildMutationPayload());
              }}
              disabled={!form.name || !form.email || createMutation.isPending}
            >
              {createMutation.isPending ? "Adding..." : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
          </DialogHeader>
          {renderFormFields(true)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (form.email && !isValidEmail(form.email)) { toast.error("Please enter a valid email address"); return; }
                if (form.phone && !isValidPhone(form.phone)) { toast.error("Please enter a valid phone number (9+ digits)"); return; }
                editTarget && updateMutation.mutate({ id: editTarget.id, ...buildMutationPayload() });
              }}
              disabled={!form.name || !form.email || updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Agent Support Assignments Dialog ── */}
      <Dialog open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-teal-600" />
              Manage Assignments — {assignTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Current assignments */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Currently Assigned Agents</p>
              {(allAssignments as any[]).filter((a: any) => a.agentSupportUserId === assignTarget?.id).length === 0 ? (
                <p className="text-sm text-muted-foreground">No agents assigned yet.</p>
              ) : (
                <div className="space-y-1">
                  {(allAssignments as any[]).filter((a: any) => a.agentSupportUserId === assignTarget?.id).map((a: any) => {
                    const agentUser = (users as any[]).find((u: any) => u.id === a.agentId);
                    return (
                      <div key={a.id} className="flex items-center justify-between p-2 rounded-md border">
                        <span className="text-sm">{agentUser?.name ?? `Agent #${a.agentId}`}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => removeAssignmentMut.mutate({ id: a.id })}
                          disabled={removeAssignmentMut.isPending}
                        >
                          <Link2Off className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Add new assignment */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Assign to Agent</p>
              <div className="space-y-1">
                {(users as any[]).filter((u: any) => u.role === "agent" && !(allAssignments as any[]).some((a: any) => a.agentSupportUserId === assignTarget?.id && a.agentId === u.id)).map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/40">
                    <span className="text-sm">{u.name ?? u.email}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => assignTarget && addAssignmentMut.mutate({ agentSupportUserId: assignTarget.id, agentId: u.id })}
                      disabled={addAssignmentMut.isPending}
                    >
                      <Link2 className="h-3 w-3" /> Assign
                    </Button>
                  </div>
                ))}
                {(users as any[]).filter((u: any) => u.role === "agent").length === 0 && (
                  <p className="text-sm text-muted-foreground">No agents available.</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Set Password Dialog ── */}
      <Dialog open={!!pwTarget} onOpenChange={(o) => { if (!o) { setPwTarget(null); setNewPassword(""); setConfirmPassword(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Set Password — {pwTarget?.name ?? pwTarget?.email}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>New Password <span className="text-muted-foreground text-xs">(min. 8 characters)</span></Label>
              <Input
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm Password</Label>
              <Input
                type="password"
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPwTarget(null); setNewPassword(""); setConfirmPassword(""); }}>Cancel</Button>
            <Button
              onClick={() => pwTarget && adminSetPasswordMut.mutate({ userId: pwTarget.id, password: newPassword })}
              disabled={!newPassword || newPassword.length < 8 || newPassword !== confirmPassword || adminSetPasswordMut.isPending}
            >
              {adminSetPasswordMut.isPending ? "Saving..." : "Set Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Team Member</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Are you sure you want to remove <strong>{deleteTarget?.name}</strong>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
