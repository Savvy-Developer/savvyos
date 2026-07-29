import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Save, RotateCcw, ShieldCheck, Lock, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";

// Permission groups in display order
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

type AdminRow = {
  userId: number;
  name: string;
  email: string;
  isProtected: boolean;
  permissions: Record<string, boolean>;
};

type PermDef = { key: string; label: string; group: string };

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function SuperPermissionsPage() {
  const { user } = useAuth();
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
      initialized.current = false; // allow re-init on next fetch
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

  function handleSave() {
    const payload = allAdmins
      .filter((a) => !a.isProtected)
      .map((a) => ({ userId: a.userId, permissions: localPerms[a.userId] ?? a.permissions }));
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

  // Non-protected admins (editable columns)
  const editableAdmins = allAdmins.filter((a) => !a.isProtected);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background sticky top-0 z-30">
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
            onClick={handleSave}
            disabled={!dirty || bulkUpdate.isPending}
            className={dirty ? "bg-primary" : ""}
          >
            {bulkUpdate.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</>
            ) : (
              <><Save className="h-3.5 w-3.5 mr-1.5" /> Save All Changes</>
            )}
          </Button>
        </div>
      </div>

      {/* Scrollable matrix */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse min-w-max w-full text-sm">
          <thead>
            <tr className="sticky top-0 z-20 bg-background border-b">
              {/* Page label column */}
              <th className="sticky left-0 z-30 bg-background text-left px-4 py-3 font-medium text-muted-foreground w-48 min-w-[192px] border-r">
                Page
              </th>
              {/* Admin columns */}
              {allAdmins.map((admin) => (
                <th key={admin.userId} className="px-2 py-2 text-center min-w-[80px] max-w-[100px]">
                  <div className="flex flex-col items-center gap-1.5">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                        {getInitials(admin.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-[11px] font-medium leading-tight text-center break-words max-w-[80px]">
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
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUP_ORDER.map((groupName) => {
              const items = grouped[groupName];
              if (!items || items.length === 0) return null;
              const colorClass = GROUP_COLORS[groupName] ?? "bg-gray-50 text-gray-600";
              return (
                <>
                  {/* Group header row */}
                  <tr key={`group-${groupName}`} className="border-t border-b">
                    <td
                      colSpan={allAdmins.length + 1}
                      className={`sticky left-0 px-4 py-1.5 font-semibold text-xs uppercase tracking-widest ${colorClass}`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{groupName}</span>
                        <div className="flex items-center gap-2 mr-2">
                          <button
                            title={`Grant ${groupName} to all admins`}
                            onClick={() => handleToggleGroupForAll(groupName, true)}
                            className="flex items-center gap-1 text-[10px] opacity-60 hover:opacity-100 transition-opacity"
                          >
                            <CheckSquare className="h-3 w-3" /> All On
                          </button>
                          <button
                            title={`Revoke ${groupName} from all admins`}
                            onClick={() => handleToggleGroupForAll(groupName, false)}
                            className="flex items-center gap-1 text-[10px] opacity-60 hover:opacity-100 transition-opacity"
                          >
                            <Square className="h-3 w-3" /> All Off
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                  {/* Page rows */}
                  {items.map((def, idx) => (
                    <tr
                      key={def.key}
                      className={`border-b hover:bg-accent/30 transition-colors ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
                    >
                      {/* Page label — sticky left */}
                      <td className="sticky left-0 z-10 bg-inherit px-4 py-2.5 font-medium text-sm border-r whitespace-nowrap">
                        <div className="flex items-center justify-between gap-2">
                          <span>{def.label}</span>
                          <div className="flex gap-1 opacity-40 hover:opacity-100 transition-opacity">
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
                      </td>
                      {/* Checkbox per admin */}
                      {allAdmins.map((admin) => {
                        const checked = admin.isProtected
                          ? true
                          : (localPerms[admin.userId]?.[def.key] ?? true);
                        return (
                          <td key={admin.userId} className="text-center px-2 py-2.5">
                            {admin.isProtected ? (
                              <div className="flex justify-center" title="Tyler always has full access">
                                <Lock className="h-3.5 w-3.5 text-amber-400" />
                              </div>
                            ) : (
                              <div className="flex justify-center">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(val) => handleToggle(admin.userId, def.key, !!val)}
                                  className="h-4 w-4"
                                />
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sticky footer save bar (appears when dirty) */}
      {dirty && (
        <div className="sticky bottom-0 z-30 border-t bg-background/95 backdrop-blur px-6 py-3 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">You have unsaved changes.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={bulkUpdate.isPending}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
            </Button>
            <Button size="sm" onClick={handleSave} disabled={bulkUpdate.isPending}>
              {bulkUpdate.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                <><Save className="h-3.5 w-3.5 mr-1.5" /> Save All Changes</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
