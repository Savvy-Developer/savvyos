import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  Loader2,
  Save,
  RotateCcw,
  ShieldCheck,
  Lock,
  CheckSquare,
  Square,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ── Constants ─────────────────────────────────────────────────────────────────

const GROUP_ORDER = [
  "Overview",
  "CRM",
  "Transactions",
  "Operations",
  "Admin",
  "Dev Tools",
  "Resources",
  "Projects & Plans",
];

const GROUP_COLORS: Record<string, string> = {
  "Overview":         "bg-blue-50 text-blue-700",
  "CRM":              "bg-violet-50 text-violet-700",
  "Transactions":     "bg-emerald-50 text-emerald-700",
  "Operations":       "bg-amber-50 text-amber-700",
  "Admin":            "bg-rose-50 text-rose-700",
  "Dev Tools":        "bg-slate-100 text-slate-600",
  "Resources":        "bg-teal-50 text-teal-700",
  "Projects & Plans": "bg-orange-50 text-orange-700",
};

const TEMP_DURATIONS = [
  { label: "1 hour",    ms: 1 * 60 * 60 * 1000 },
  { label: "24 hours",  ms: 24 * 60 * 60 * 1000 },
  { label: "3 days",    ms: 72 * 60 * 60 * 1000 },
  { label: "1 week",    ms: 7 * 24 * 60 * 60 * 1000 },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type AdminRow = {
  userId: number;
  name: string;
  email: string;
  isProtected: boolean;
  permissions: Record<string, boolean>;
};

type PermDef = { key: string; label: string; group: string };

// One detected change
type ChangeItem = {
  userId: number;
  adminName: string;
  permKey: string;
  permLabel: string;
  granted: boolean; // true = being granted, false = being revoked
  // Grant type controls
  grantType: "permanent" | "temporary";
  tempDuration: string; // one of TEMP_DURATIONS[].label, only relevant when grantType === "temporary"
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function computeChanges(
  allAdmins: AdminRow[],
  localPerms: Record<number, Record<string, boolean>>,
  definitions: PermDef[]
): ChangeItem[] {
  const changes: ChangeItem[] = [];
  for (const admin of allAdmins) {
    if (admin.isProtected) continue;
    const orig = admin.permissions;
    const local = localPerms[admin.userId];
    if (!local) continue;
    for (const def of definitions) {
      const origVal = orig[def.key] ?? true;
      const newVal = local[def.key] ?? true;
      if (origVal !== newVal) {
        changes.push({
          userId: admin.userId,
          adminName: admin.name,
          permKey: def.key,
          permLabel: def.label,
          granted: newVal,
          grantType: "permanent",
          tempDuration: "1 hour",
        });
      }
    }
  }
  return changes;
}

// ── Confirmation Dialog ───────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  changes,
  onConfirm,
  onCancel,
  isPending,
}: {
  open: boolean;
  changes: ChangeItem[];
  onConfirm: (updated: ChangeItem[]) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [items, setItems] = useState<ChangeItem[]>([]);

  useEffect(() => {
    if (open) setItems(changes.map((c) => ({ ...c })));
  }, [open, changes]);

  function setGrantType(idx: number, val: "permanent" | "temporary") {
    setItems((prev) => prev.map((c, i) => i === idx ? { ...c, grantType: val } : c));
  }

  function setTempDuration(idx: number, val: string) {
    setItems((prev) => prev.map((c, i) => i === idx ? { ...c, tempDuration: val } : c));
  }

  const grants = items.filter((c) => c.granted);
  const revokes = items.filter((c) => !c.granted);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Confirm Permission Changes
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Review each change below. For grants, choose whether to make them permanent or temporary.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Grants */}
          {grants.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                  Granting Access ({grants.length})
                </span>
              </div>
              <div className="space-y-2">
                {grants.map((change, idx) => {
                  const globalIdx = items.indexOf(change);
                  return (
                    <div
                      key={`${change.userId}-${change.permKey}`}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5"
                    >
                      {/* Who + what */}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm">{change.adminName.split(" ")[0]}</span>
                        <span className="text-muted-foreground text-sm"> → </span>
                        <span className="text-sm">{change.permLabel}</span>
                      </div>
                      {/* Grant type selector */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Select
                          value={change.grantType}
                          onValueChange={(v) => setGrantType(globalIdx, v as "permanent" | "temporary")}
                        >
                          <SelectTrigger className="h-7 text-xs w-[148px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="permanent">Permanently Grant</SelectItem>
                            <SelectItem value="temporary">
                              <span className="flex items-center gap-1.5">
                                <Clock className="h-3 w-3" /> Temporarily Grant
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {change.grantType === "temporary" && (
                          <Select
                            value={change.tempDuration}
                            onValueChange={(v) => setTempDuration(globalIdx, v)}
                          >
                            <SelectTrigger className="h-7 text-xs w-[100px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TEMP_DURATIONS.map((d) => (
                                <SelectItem key={d.label} value={d.label}>{d.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Revokes */}
          {revokes.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <ArrowDownLeft className="h-3.5 w-3.5 text-rose-500" />
                <span className="text-xs font-semibold text-rose-600 uppercase tracking-wide">
                  Revoking Access ({revokes.length})
                </span>
              </div>
              <div className="space-y-2">
                {revokes.map((change) => (
                  <div
                    key={`${change.userId}-${change.permKey}`}
                    className="flex items-center gap-2 rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{change.adminName.split(" ")[0]}</span>
                      <span className="text-muted-foreground text-sm"> → </span>
                      <span className="text-sm">{change.permLabel}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-200 bg-rose-50 shrink-0">
                      Revoked
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onConfirm(items)} disabled={isPending}>
            {isPending ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</>
            ) : (
              <><Save className="h-3.5 w-3.5 mr-1.5" /> Confirm & Save</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SuperPermissionsPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: canManage, isLoading: checkingAccess } = trpc.permissions.canManagePermissions.useQuery();
  const { data: definitions = [] } = trpc.permissions.getDefinitions.useQuery(undefined, { enabled: !!canManage });
  const { data: allAdmins = [], isLoading: loadingAdmins } = trpc.permissions.getAllAdminsPermissions.useQuery(
    undefined,
    { enabled: !!canManage }
  );

  // Local editable state — keyed by userId
  const [localPerms, setLocalPerms] = useState<Record<number, Record<string, boolean>>>({});
  const [dirty, setDirty] = useState(false);
  const initialized = useRef(false);

  // Confirmation dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<ChangeItem[]>([]);

  useEffect(() => {
    if (allAdmins.length > 0 && !initialized.current) {
      const initial: Record<number, Record<string, boolean>> = {};
      for (const admin of allAdmins) {
        initial[admin.userId] = { ...admin.permissions };
      }
      setLocalPerms(initial);
      initialized.current = true;
    }
  }, [allAdmins]);

  const bulkUpdate = trpc.permissions.bulkUpdatePermissions.useMutation({
    onSuccess: () => {
      toast.success("All permissions saved");
      setDirty(false);
      setConfirmOpen(false);
      initialized.current = false;
      utils.permissions.getAllAdminsPermissions.invalidate();
      utils.permissions.getMyPermissions.invalidate();
    },
    onError: (err) => toast.error(err.message ?? "Failed to save permissions"),
  });

  function handleToggle(userId: number, key: string, value: boolean) {
    setLocalPerms((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], [key]: value },
    }));
    setDirty(true);
  }

  function handleSaveClick() {
    const changes = computeChanges(allAdmins, localPerms, definitions);
    if (changes.length === 0) {
      toast.info("No changes to save");
      return;
    }
    setPendingChanges(changes);
    setConfirmOpen(true);
  }

  function handleConfirm(confirmedChanges: ChangeItem[]) {
    // Build per-user payload with tempExpiry
    const byUser: Record<number, { permissions: Record<string, boolean>; tempExpiry: Record<string, string> }> = {};

    for (const admin of allAdmins) {
      if (admin.isProtected) continue;
      byUser[admin.userId] = {
        permissions: { ...(localPerms[admin.userId] ?? admin.permissions) },
        tempExpiry: {},
      };
    }

    // Apply temp expiry for confirmed changes
    for (const change of confirmedChanges) {
      if (!change.granted) continue; // revokes are always permanent
      if (change.grantType !== "temporary") continue;
      const dur = TEMP_DURATIONS.find((d) => d.label === change.tempDuration);
      if (!dur) continue;
      const expiresAt = new Date(Date.now() + dur.ms).toISOString();
      if (byUser[change.userId]) {
        byUser[change.userId].tempExpiry[change.permKey] = expiresAt;
      }
    }

    const payload = Object.entries(byUser).map(([uid, data]) => ({
      userId: Number(uid),
      permissions: data.permissions,
      tempExpiry: Object.keys(data.tempExpiry).length > 0 ? data.tempExpiry : undefined,
    }));

    bulkUpdate.mutate(payload);
  }

  function handleReset() {
    const reset: Record<number, Record<string, boolean>> = {};
    for (const admin of allAdmins) {
      reset[admin.userId] = { ...admin.permissions };
    }
    setLocalPerms(reset);
    setDirty(false);
    initialized.current = true;
  }

  // Column-level: toggle all pages for one admin
  function handleToggleAllForAdmin(userId: number, value: boolean) {
    const admin = allAdmins.find((a) => a.userId === userId);
    if (!admin || admin.isProtected) return;
    const updated: Record<string, boolean> = {};
    for (const def of definitions) updated[def.key] = value;
    setLocalPerms((prev) => ({ ...prev, [userId]: updated }));
    setDirty(true);
  }

  // Row-level: toggle one page for all admins
  function handleToggleAllForPage(key: string, value: boolean) {
    setLocalPerms((prev) => {
      const next = { ...prev };
      for (const admin of allAdmins) {
        if (admin.isProtected) continue;
        next[admin.userId] = { ...next[admin.userId], [key]: value };
      }
      return next;
    });
    setDirty(true);
  }

  // Group-level: toggle all pages in a group for all admins
  function handleToggleGroupForAll(group: string, value: boolean) {
    const groupKeys = definitions.filter((d) => d.group === group).map((d) => d.key);
    setLocalPerms((prev) => {
      const next = { ...prev };
      for (const admin of allAdmins) {
        if (admin.isProtected) continue;
        const updated = { ...next[admin.userId] };
        for (const key of groupKeys) updated[key] = value;
        next[admin.userId] = updated;
      }
      return next;
    });
    setDirty(true);
  }

  if (checkingAccess || loadingAdmins) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 gap-4 text-center">
        <Lock className="h-12 w-12 text-muted-foreground opacity-40" />
        <p className="text-lg font-semibold">Access Restricted</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Only Tyler, Elana, and Dyl can access the Super Permissions matrix.
        </p>
        <Button variant="outline" onClick={() => navigate("/")}>Go Home</Button>
      </div>
    );
  }

  // Group definitions
  const grouped: Record<string, PermDef[]> = {};
  for (const def of definitions) {
    if (!grouped[def.group]) grouped[def.group] = [];
    grouped[def.group].push(def);
  }

  // ── Layout constants ─────────────────────────────────────────────────────────
  // Two-panel approach: left panel is a fixed-width div that NEVER scrolls
  // horizontally. Right panel scrolls horizontally. Both share the same
  // vertical scroll via a shared ref-synced scrollTop.
  const LABEL_COL_W = 220; // px
  const ADMIN_COL_W = 88;  // px per admin column

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Super Permissions</h1>
            <p className="text-xs text-muted-foreground">Manage all admin page access in one place</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button variant="outline" size="sm" onClick={handleReset} disabled={bulkUpdate.isPending}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSaveClick}
            disabled={!dirty || bulkUpdate.isPending}
          >
            <Save className="h-3.5 w-3.5 mr-1.5" /> Save All Changes
          </Button>
        </div>
      </div>

      {/* ── Matrix ── */}
      {/*
        Two-panel layout:
        - Left panel: fixed width, overflow-y scroll only (no x scroll ever)
        - Right panel: overflow-x + overflow-y scroll, synced vertically with left
        Both panels are the same height and scroll together via onScroll sync.
      */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT PANEL: page labels (never scrolls horizontally) ── */}
        <div
          className="shrink-0 flex flex-col overflow-y-auto border-r bg-background"
          style={{ width: LABEL_COL_W }}
          id="super-perm-left"
          onScroll={(e) => {
            const right = document.getElementById("super-perm-right");
            if (right) right.scrollTop = (e.target as HTMLElement).scrollTop;
          }}
        >
          {/* Header cell */}
          <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 text-xs font-medium text-muted-foreground shrink-0">
            Page
          </div>

          {/* Group rows */}
          {GROUP_ORDER.map((groupName) => {
            const items = grouped[groupName];
            if (!items || items.length === 0) return null;
            const colorClass = GROUP_COLORS[groupName] ?? "bg-gray-50 text-gray-600";
            return (
              <div key={groupName} className="shrink-0">
                {/* Group header label */}
                <div className={`px-4 py-1.5 font-semibold text-xs uppercase tracking-widest border-t border-b ${colorClass}`}>
                  {groupName}
                </div>
                {/* Page label rows */}
                {items.map((def, idx) => (
                  <div
                    key={def.key}
                    className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b font-medium text-sm whitespace-nowrap ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
                    style={{ height: 41 }}
                  >
                    <span className="truncate">{def.label}</span>
                    <div className="flex gap-1 opacity-40 hover:opacity-100 transition-opacity shrink-0">
                      <button
                        title="Grant to all"
                        onClick={() => handleToggleAllForPage(def.key, true)}
                        className="hover:text-emerald-600 transition-colors"
                      >
                        <CheckSquare className="h-3 w-3" />
                      </button>
                      <button
                        title="Revoke from all"
                        onClick={() => handleToggleAllForPage(def.key, false)}
                        className="hover:text-rose-500 transition-colors"
                      >
                        <Square className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* ── RIGHT PANEL: admin columns (scrolls both x and y) ── */}
        <div
          className="flex-1 overflow-auto"
          id="super-perm-right"
          onScroll={(e) => {
            const left = document.getElementById("super-perm-left");
            if (left) left.scrollTop = (e.target as HTMLElement).scrollTop;
          }}
        >
          {/* Min-width so horizontal scroll appears when needed */}
          <div style={{ minWidth: allAdmins.length * ADMIN_COL_W }}>

            {/* ── Sticky column header row ── */}
            <div className="flex sticky top-0 z-10 bg-background border-b">
              {allAdmins.map((admin) => (
                <div
                  key={admin.userId}
                  className="shrink-0 flex flex-col items-center justify-end gap-1.5 px-1 py-2 text-center"
                  style={{ width: ADMIN_COL_W, minWidth: ADMIN_COL_W }}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                      {getInitials(admin.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-[11px] font-medium leading-tight break-words w-full text-center px-1">
                    {admin.name.split(" ")[0]}
                  </span>
                  {admin.isProtected ? (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-200 bg-amber-50">
                      Protected
                    </Badge>
                  ) : (
                    <div className="flex gap-1">
                      <button
                        title="Grant all pages"
                        onClick={() => handleToggleAllForAdmin(admin.userId, true)}
                        className="text-muted-foreground hover:text-emerald-600 transition-colors"
                      >
                        <CheckSquare className="h-3 w-3" />
                      </button>
                      <button
                        title="Revoke all pages"
                        onClick={() => handleToggleAllForAdmin(admin.userId, false)}
                        className="text-muted-foreground hover:text-rose-500 transition-colors"
                      >
                        <Square className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── Body rows ── */}
            {GROUP_ORDER.map((groupName) => {
              const items = grouped[groupName];
              if (!items || items.length === 0) return null;
              const colorClass = GROUP_COLORS[groupName] ?? "bg-gray-50 text-gray-600";

              return (
                <div key={groupName}>
                  {/* Group header — All On / All Off controls */}
                  <div className={`flex items-center border-t border-b ${colorClass}`}>
                    <div className="flex items-center gap-3 px-3 py-1.5">
                      <button
                        onClick={() => handleToggleGroupForAll(groupName, true)}
                        className="flex items-center gap-1 text-[10px] opacity-60 hover:opacity-100 transition-opacity"
                      >
                        <CheckSquare className="h-3 w-3" /> All On
                      </button>
                      <button
                        onClick={() => handleToggleGroupForAll(groupName, false)}
                        className="flex items-center gap-1 text-[10px] opacity-60 hover:opacity-100 transition-opacity"
                      >
                        <Square className="h-3 w-3" /> All Off
                      </button>
                    </div>
                  </div>

                  {/* Page rows */}
                  {items.map((def, idx) => (
                    <div
                      key={def.key}
                      className={`flex items-center border-b hover:bg-accent/30 transition-colors ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
                      style={{ height: 41 }}
                    >
                      {/* Admin checkbox cells */}
                      {allAdmins.map((admin) => {
                        const checked = admin.isProtected
                          ? true
                          : (localPerms[admin.userId]?.[def.key] ?? true);
                        return (
                          <div
                            key={admin.userId}
                            className="shrink-0 flex items-center justify-center"
                            style={{ width: ADMIN_COL_W, minWidth: ADMIN_COL_W, height: 41 }}
                          >
                            {admin.isProtected ? (
                              <div title="Tyler always has full access">
                                <Lock className="h-3.5 w-3.5 text-amber-400" />
                              </div>
                            ) : (
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(val) => handleToggle(admin.userId, def.key, !!val)}
                                className="h-4 w-4"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Sticky footer bar ── */}
      {dirty && (
        <div className="shrink-0 border-t bg-background/95 backdrop-blur px-6 py-3 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">You have unsaved changes.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={bulkUpdate.isPending}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
            </Button>
            <Button size="sm" onClick={handleSaveClick} disabled={bulkUpdate.isPending}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> Save All Changes
            </Button>
          </div>
        </div>
      )}

      {/* ── Confirmation Dialog ── */}
      <ConfirmDialog
        open={confirmOpen}
        changes={pendingChanges}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
        isPending={bulkUpdate.isPending}
      />
    </div>
  );
}
