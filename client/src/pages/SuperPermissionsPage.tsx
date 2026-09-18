import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  enforcePagePermissionDependencies,
  parentPagePermissionKey,
} from "@shared/permissionDependencies";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckSquare,
  Eye,
  KeyRound,
  LayoutGrid,
  Loader2,
  Lock,
  RotateCcw,
  Save,
  ShieldCheck,
  Square,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// This order deliberately mirrors buildAdminNav in AppLayout.tsx.
const NAV_GROUP_ORDER = [
  "Overview",
  "CRM",
  "ISA",
  "Transactions",
  "Agent Success Team",
  "Work",
  "Events",
  "Marketing",
  "Tech",
  "Approvals",
  "HR",
  "Admin",
];

const GROUP_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  Overview: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  CRM: { bg: "#f5f3ff", text: "#6d28d9", border: "#ddd6fe" },
  ISA: { bg: "#fdf4ff", text: "#a21caf", border: "#f5d0fe" },
  Transactions: { bg: "#ecfdf5", text: "#065f46", border: "#a7f3d0" },
  "Agent Success Team": { bg: "#fefce8", text: "#854d0e", border: "#fde68a" },
  Work: { bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
  Events: { bg: "#ecfeff", text: "#0e7490", border: "#a5f3fc" },
  Marketing: { bg: "#fff7ed", text: "#9a3412", border: "#fed7aa" },
  Tech: { bg: "#ecfeff", text: "#0e7490", border: "#a5f3fc" },
  Approvals: { bg: "#f0fdfa", text: "#134e4a", border: "#99f6e4" },
  HR: { bg: "#fef2f2", text: "#b91c1c", border: "#fecaca" },
  Admin: { bg: "#fff1f2", text: "#9f1239", border: "#fecdd3" },
};

const ADVANCED_PERMISSION_KEYS = new Set([
  "canManageChat",
  "canEditContactLeadSource",
  "canCreateReferrals",
  "canEditReferrals",
  "canManageReferralAgents",
  "canEditReferralSplits",
  "canViewReferralFinancials",
  "canUpdateReferralPayments",
  "canManageReferralAgreements",
  "canEditHistoricalReferrals",
  "canAdministerTransactions",
  "canEditTransactionLeadSource",
  "canViewPulseSettings",
  "canCreateLandingPages",
  "canEditLandingPages",
  "canPublishLandingPages",
  "canArchiveLandingPages",
  "canManageWebsiteProperties",
  "canManageWebsiteAgents",
  "canManageWebsiteCaseStudies",
  "canManageWebsiteBlog",
  "canManageWebsiteSettings",
  "canViewWebsiteLeads",
  "canAdministerPto",
  "canApprovePto",
]);

const TEMP_DURATIONS = [
  { label: "1 hour", ms: 1 * 60 * 60 * 1000 },
  { label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { label: "3 days", ms: 72 * 60 * 60 * 1000 },
  { label: "1 week", ms: 7 * 24 * 60 * 60 * 1000 },
];

type EditMode = "admin" | "page" | "matrix";
type AdminRow = {
  userId: number;
  name: string;
  email: string;
  isProtected: boolean;
  permissions: Record<string, boolean>;
};
type PermDef = { key: string; label: string; group: string };
type ChangeItem = {
  userId: number;
  adminName: string;
  permKey: string;
  permLabel: string;
  granted: boolean;
  grantType: "permanent" | "temporary";
  tempDuration: string;
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map(part => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function computeChanges(
  allAdmins: AdminRow[],
  localPerms: Record<number, Record<string, boolean>>,
  definitions: PermDef[]
): ChangeItem[] {
  const changes: ChangeItem[] = [];
  for (const admin of allAdmins) {
    if (admin.isProtected) continue;
    const original = admin.permissions;
    const local = localPerms[admin.userId];
    if (!local) continue;
    for (const definition of definitions) {
      const originalValue = original[definition.key] ?? true;
      const nextValue = local[definition.key] ?? true;
      if (originalValue !== nextValue) {
        changes.push({
          userId: admin.userId,
          adminName: admin.name,
          permKey: definition.key,
          permLabel: definition.label,
          granted: nextValue,
          grantType: "permanent",
          tempDuration: "1 hour",
        });
      }
    }
  }
  return changes;
}

function PermissionToggle({
  definition,
  checked,
  disabled,
  onChange,
}: {
  definition: PermDef;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/30 has-[:disabled]:cursor-default">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{definition.label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {checked ? "Access granted" : "Access not granted"}
        </span>
      </span>
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={value => onChange(Boolean(value))}
        aria-label={`${checked ? "Revoke" : "Grant"} ${definition.label}`}
        className="h-5 w-5 shrink-0"
      />
    </label>
  );
}

function GroupSelect({
  value,
  groups,
  onChange,
  id,
}: {
  value: string;
  groups: string[];
  onChange: (value: string) => void;
  id: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full sm:w-[250px]">
        <SelectValue placeholder="Select navigation category" />
      </SelectTrigger>
      <SelectContent>
        {groups.map(group => (
          <SelectItem key={group} value={group}>
            {group}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AdminIdentity({ admin }: { admin: AdminRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarFallback className="bg-primary/10 text-xs text-primary">
          {getInitials(admin.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{admin.name}</p>
        <p className="truncate text-xs text-muted-foreground">{admin.email}</p>
      </div>
      {admin.isProtected && (
        <Badge
          variant="outline"
          className="border-amber-200 bg-amber-50 text-amber-700"
        >
          Protected
        </Badge>
      )}
    </div>
  );
}

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
    if (open) setItems(changes.map(change => ({ ...change })));
  }, [open, changes]);

  const grants = items.filter(change => change.granted);
  const revocations = items.filter(change => !change.granted);

  function setGrantType(index: number, value: "permanent" | "temporary") {
    setItems(current =>
      current.map((change, itemIndex) =>
        itemIndex === index ? { ...change, grantType: value } : change
      )
    );
  }

  function setTempDuration(index: number, value: string) {
    setItems(current =>
      current.map((change, itemIndex) =>
        itemIndex === index ? { ...change, tempDuration: value } : change
      )
    );
  }

  return (
    <Dialog open={open} onOpenChange={nextOpen => !nextOpen && onCancel()}>
      <DialogContent className="max-h-[80vh] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 pb-3 pt-5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Confirm Permission Changes
          </DialogTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Review every change. New access can be granted permanently or
            temporarily.
          </p>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-5 overflow-y-auto px-6 py-4">
          {grants.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-1.5">
                <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Granting access ({grants.length})
                </span>
              </div>
              <div className="space-y-2">
                {grants.map(change => {
                  const index = items.findIndex(
                    item =>
                      item.userId === change.userId &&
                      item.permKey === change.permKey
                  );
                  return (
                    <div
                      key={`${change.userId}-${change.permKey}`}
                      className="flex flex-col gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1 text-sm">
                        <span className="font-medium">
                          {change.adminName.split(" ")[0]}
                        </span>
                        <span className="text-muted-foreground"> → </span>
                        <span>{change.permLabel}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Select
                          value={change.grantType}
                          onValueChange={value =>
                            setGrantType(
                              index,
                              value as "permanent" | "temporary"
                            )
                          }
                        >
                          <SelectTrigger className="h-7 w-[148px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="permanent">
                              Permanently Grant
                            </SelectItem>
                            <SelectItem value="temporary">
                              Temporarily Grant
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {change.grantType === "temporary" && (
                          <Select
                            value={change.tempDuration}
                            onValueChange={value =>
                              setTempDuration(index, value)
                            }
                          >
                            <SelectTrigger className="h-7 w-[100px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TEMP_DURATIONS.map(duration => (
                                <SelectItem
                                  key={duration.label}
                                  value={duration.label}
                                >
                                  {duration.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {revocations.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-1.5">
                <ArrowDownLeft className="h-3.5 w-3.5 text-rose-500" />
                <span className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                  Revoking access ({revocations.length})
                </span>
              </div>
              <div className="space-y-2">
                {revocations.map(change => (
                  <div
                    key={`${change.userId}-${change.permKey}`}
                    className="flex items-center gap-2 rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">
                        {change.adminName.split(" ")[0]}
                      </span>
                      <span className="text-muted-foreground"> → </span>
                      <span>{change.permLabel}</span>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 border-rose-200 bg-rose-50 text-[10px] text-rose-600"
                    >
                      Revoked
                    </Badge>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
        <DialogFooter className="gap-2 border-t px-6 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => onConfirm(items)}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="mr-1.5 h-3.5 w-3.5" /> Confirm & Save
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SuperPermissionsPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: canManage, isLoading: checkingAccess } =
    trpc.permissions.canManagePermissions.useQuery();
  const { data: definitions = [], isLoading: loadingDefinitions } =
    trpc.permissions.getDefinitions.useQuery(undefined, {
      enabled: Boolean(canManage),
    });
  const { data: allAdmins = [], isLoading: loadingAdmins } =
    trpc.permissions.getAllAdminsPermissions.useQuery(undefined, {
      enabled: Boolean(canManage),
    });

  const [localPerms, setLocalPerms] = useState<
    Record<number, Record<string, boolean>>
  >({});
  const [mode, setMode] = useState<EditMode>("admin");
  const [selectedAdminId, setSelectedAdminId] = useState<number | null>(null);
  const [selectedGroup, setSelectedGroup] = useState("Overview");
  const [selectedPageKey, setSelectedPageKey] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<ChangeItem[]>([]);
  const initialized = useRef(false);

  const grouped = useMemo(
    () =>
      definitions.reduce<Record<string, PermDef[]>>((groups, definition) => {
        (groups[definition.group] ??= []).push(definition);
        return groups;
      }, {}),
    [definitions]
  );
  const groups = useMemo(
    () => NAV_GROUP_ORDER.filter(group => grouped[group]?.length),
    [grouped]
  );
  const selectedGroupDefinitions = grouped[selectedGroup] ?? [];
  const pageDefinitions = grouped[selectedGroup] ?? [];
  const matrixGridTemplateColumns = useMemo(
    () =>
      `320px repeat(${Math.max(selectedGroupDefinitions.length, 1)}, 164px)`,
    [selectedGroupDefinitions.length]
  );
  const selectedPage =
    definitions.find(definition => definition.key === selectedPageKey) ?? null;
  const selectedAdmin =
    allAdmins.find(admin => admin.userId === selectedAdminId) ?? null;

  useEffect(() => {
    if (allAdmins.length === 0 || initialized.current) return;
    const initial: Record<number, Record<string, boolean>> = {};
    for (const admin of allAdmins)
      initial[admin.userId] = { ...admin.permissions };
    setLocalPerms(initial);
    setSelectedAdminId(current => current ?? allAdmins[0].userId);
    initialized.current = true;
  }, [allAdmins]);

  useEffect(() => {
    if (!definitions.length) return;
    setSelectedGroup(current =>
      groups.includes(current) ? current : groups[0]
    );
    setSelectedPageKey(current =>
      definitions.some(definition => definition.key === current)
        ? current
        : definitions[0].key
    );
  }, [definitions, groups]);

  useEffect(() => {
    if (
      selectedAdminId &&
      allAdmins.some(admin => admin.userId === selectedAdminId)
    )
      return;
    setSelectedAdminId(allAdmins[0]?.userId ?? null);
  }, [allAdmins, selectedAdminId]);

  const bulkUpdate = trpc.permissions.bulkUpdatePermissions.useMutation({
    onSuccess: () => {
      toast.success("All permissions saved");
      setDirty(false);
      setConfirmOpen(false);
      initialized.current = false;
      void utils.permissions.getAllAdminsPermissions.invalidate();
      void utils.permissions.getMyPermissions.invalidate();
    },
    onError: error =>
      toast.error(error.message ?? "Failed to save permissions"),
  });

  function permissionsFor(admin: AdminRow) {
    return localPerms[admin.userId] ?? admin.permissions;
  }

  function applyPermissionChange(
    permissions: Record<string, boolean>,
    key: string,
    value: boolean
  ) {
    return enforcePagePermissionDependencies(
      { ...permissions, [key]: value },
      definitions
    );
  }

  function isPermissionLocked(
    permissions: Record<string, boolean>,
    key: string
  ) {
    const parentKey = parentPagePermissionKey(key);
    return Boolean(parentKey && permissions[parentKey] === false);
  }

  function updatePermission(userId: number, key: string, value: boolean) {
    const admin = allAdmins.find(item => item.userId === userId);
    if (!admin || admin.isProtected) return;
    setLocalPerms(current => ({
      ...current,
      [userId]: applyPermissionChange(
        current[userId] ?? admin.permissions,
        key,
        value
      ),
    }));
    setDirty(true);
  }

  function updateAdminAll(value: boolean) {
    if (!selectedAdmin || selectedAdmin.isProtected) return;
    const next = { ...permissionsFor(selectedAdmin) };
    for (const definition of definitions) next[definition.key] = value;
    setLocalPerms(current => ({ ...current, [selectedAdmin.userId]: next }));
    setDirty(true);
  }

  function updateAdminGroup(value: boolean) {
    if (!selectedAdmin || selectedAdmin.isProtected) return;
    const next = { ...permissionsFor(selectedAdmin) };
    for (const definition of selectedGroupDefinitions)
      next[definition.key] = value;
    setLocalPerms(current => ({ ...current, [selectedAdmin.userId]: next }));
    setDirty(true);
  }

  function updatePageForAll(value: boolean) {
    if (!selectedPage) return;
    setLocalPerms(current => {
      const next = { ...current };
      for (const admin of allAdmins) {
        if (admin.isProtected) continue;
        next[admin.userId] = applyPermissionChange(
          current[admin.userId] ?? admin.permissions,
          selectedPage.key,
          value
        );
      }
      return next;
    });
    setDirty(true);
  }

  function selectGroup(group: string) {
    setSelectedGroup(group);
    const firstPage = grouped[group]?.[0];
    if (firstPage) setSelectedPageKey(firstPage.key);
  }

  function handleSaveClick() {
    const changes = computeChanges(allAdmins, localPerms, definitions);
    if (!changes.length) {
      toast.info("No changes to save");
      return;
    }
    setPendingChanges(changes);
    setConfirmOpen(true);
  }

  function handleConfirm(confirmedChanges: ChangeItem[]) {
    const byUser: Record<
      number,
      {
        permissions: Record<string, boolean>;
        tempExpiry: Record<string, string>;
      }
    > = {};
    for (const admin of allAdmins) {
      if (admin.isProtected) continue;
      byUser[admin.userId] = {
        permissions: { ...permissionsFor(admin) },
        tempExpiry: {},
      };
    }
    for (const change of confirmedChanges) {
      if (!change.granted || change.grantType !== "temporary") continue;
      const duration = TEMP_DURATIONS.find(
        item => item.label === change.tempDuration
      );
      if (duration && byUser[change.userId]) {
        byUser[change.userId].tempExpiry[change.permKey] = new Date(
          Date.now() + duration.ms
        ).toISOString();
      }
    }
    bulkUpdate.mutate(
      Object.entries(byUser).map(([userId, data]) => ({
        userId: Number(userId),
        permissions: data.permissions,
        tempExpiry: Object.keys(data.tempExpiry).length
          ? data.tempExpiry
          : undefined,
      }))
    );
  }

  function handleReset() {
    const reset: Record<number, Record<string, boolean>> = {};
    for (const admin of allAdmins)
      reset[admin.userId] = { ...admin.permissions };
    setLocalPerms(reset);
    setDirty(false);
    initialized.current = true;
  }

  if (checkingAccess || (canManage && (loadingDefinitions || loadingAdmins))) {
    return (
      <div className="flex h-full items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 py-24 text-center">
        <Lock className="h-12 w-12 text-muted-foreground opacity-40" />
        <p className="text-lg font-semibold">Access Restricted</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Only designated SavvyOS permission managers can change administrator
          access.
        </p>
        <Button variant="outline" onClick={() => navigate("/")}>
          Go Home
        </Button>
      </div>
    );
  }

  const selectedPermissions = selectedAdmin
    ? permissionsFor(selectedAdmin)
    : {};
  const selectedGroupGranted = selectedGroupDefinitions.filter(
    definition => selectedPermissions[definition.key]
  ).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Super Permissions
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Manage the same categories people see in the SavvyOS sidebar.
              Choose the editing view that fits the decision in front of you.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {dirty && (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={bulkUpdate.isPending}
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Reset
            </Button>
          )}
          <Button
            onClick={handleSaveClick}
            disabled={!dirty || bulkUpdate.isPending}
          >
            <Save className="mr-2 h-4 w-4" /> Save Changes
          </Button>
        </div>
      </header>

      <div className="rounded-xl border bg-amber-50/50 p-4 text-sm text-amber-950">
        <div className="flex gap-3">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p>
            <strong>Permission managers are fixed.</strong> This screen manages
            administrator access to SavvyOS pages and capabilities, not who can
            manage Super Permissions itself.
          </p>
        </div>
      </div>

      {allAdmins.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 font-medium">No active administrators</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Active administrators appear here when their admin profile is
            active.
          </p>
        </div>
      ) : (
        <Tabs
          value={mode}
          onValueChange={value => setMode(value as EditMode)}
          className="gap-5"
        >
          <TabsList className="h-auto w-full justify-start overflow-x-auto p-1 sm:w-fit">
            <TabsTrigger value="admin" className="min-h-10 px-4">
              <Users className="h-4 w-4" /> By Admin
            </TabsTrigger>
            <TabsTrigger value="page" className="min-h-10 px-4">
              <Eye className="h-4 w-4" /> By Page
            </TabsTrigger>
            <TabsTrigger value="matrix" className="min-h-10 px-4">
              <LayoutGrid className="h-4 w-4" /> Super Matrix
            </TabsTrigger>
          </TabsList>

          <TabsContent value="admin">
            <div className="space-y-5">
              <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="w-full max-w-md">
                    <label
                      className="mb-2 block text-sm font-medium"
                      htmlFor="permission-admin"
                    >
                      Administrator
                    </label>
                    <Select
                      value={
                        selectedAdmin ? String(selectedAdmin.userId) : undefined
                      }
                      onValueChange={value => setSelectedAdminId(Number(value))}
                    >
                      <SelectTrigger id="permission-admin" className="w-full">
                        <SelectValue placeholder="Select an administrator" />
                      </SelectTrigger>
                      <SelectContent>
                        {allAdmins.map(admin => (
                          <SelectItem
                            key={admin.userId}
                            value={String(admin.userId)}
                          >
                            {admin.name}
                            {admin.isProtected ? " (Protected)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedAdmin && <AdminIdentity admin={selectedAdmin} />}
                </div>
                {selectedAdmin?.isProtected ? (
                  <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      <strong>{selectedAdmin.name}</strong> always has full
                      access. This account cannot be changed here.
                    </p>
                  </div>
                ) : selectedAdmin ? (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <p className="text-sm text-muted-foreground">
                      Set an entire administrator to full access only when that
                      is genuinely the job.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateAdminAll(false)}
                      >
                        <Square className="mr-1.5 h-3.5 w-3.5" /> Revoke All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateAdminAll(true)}
                      >
                        <CheckSquare className="mr-1.5 h-3.5 w-3.5" /> Grant All
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              {selectedAdmin && (
                <div className="rounded-xl border bg-card shadow-sm">
                  <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div>
                      <p className="text-sm font-semibold">
                        Navigation category
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        These categories match the admin sidebar exactly.
                      </p>
                    </div>
                    <GroupSelect
                      id="admin-category"
                      value={selectedGroup}
                      groups={groups}
                      onChange={selectGroup}
                    />
                  </div>
                  <div className="p-4 sm:p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-8 w-1 rounded-full"
                          style={{
                            background: (
                              GROUP_COLORS[selectedGroup] ??
                              GROUP_COLORS.Overview
                            ).text,
                          }}
                        />
                        <div>
                          <p className="text-sm font-semibold">
                            {selectedGroup}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {selectedGroupGranted} of{" "}
                            {selectedGroupDefinitions.length} capabilities
                            granted
                          </p>
                        </div>
                      </div>
                      {!selectedAdmin.isProtected && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateAdminGroup(false)}
                          >
                            Revoke category
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateAdminGroup(true)}
                          >
                            Grant category
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      {selectedGroupDefinitions
                        .filter(
                          definition =>
                            !ADVANCED_PERMISSION_KEYS.has(definition.key)
                        )
                        .map(definition => (
                          <PermissionToggle
                            key={definition.key}
                            definition={definition}
                            checked={Boolean(
                              selectedPermissions[definition.key]
                            )}
                            disabled={
                              selectedAdmin.isProtected ||
                              isPermissionLocked(
                                selectedPermissions,
                                definition.key
                              )
                            }
                            onChange={value =>
                              updatePermission(
                                selectedAdmin.userId,
                                definition.key,
                                value
                              )
                            }
                          />
                        ))}
                    </div>
                    {selectedGroupDefinitions.some(definition =>
                      ADVANCED_PERMISSION_KEYS.has(definition.key)
                    ) && (
                      <Accordion
                        type="single"
                        collapsible
                        className="mt-3 rounded-lg border bg-muted/20 px-4"
                      >
                        <AccordionItem value="advanced" className="border-0">
                          <AccordionTrigger className="py-3 text-xs uppercase tracking-wide text-muted-foreground hover:no-underline">
                            Advanced controls (
                            {
                              selectedGroupDefinitions.filter(definition =>
                                ADVANCED_PERMISSION_KEYS.has(definition.key)
                              ).length
                            }
                            )
                          </AccordionTrigger>
                          <AccordionContent className="pb-4">
                            <div className="space-y-2">
                              {selectedGroupDefinitions
                                .filter(definition =>
                                  ADVANCED_PERMISSION_KEYS.has(definition.key)
                                )
                                .map(definition => (
                                  <PermissionToggle
                                    key={definition.key}
                                    definition={definition}
                                    checked={Boolean(
                                      selectedPermissions[definition.key]
                                    )}
                                    disabled={
                                      selectedAdmin.isProtected ||
                                      isPermissionLocked(
                                        selectedPermissions,
                                        definition.key
                                      )
                                    }
                                    onChange={value =>
                                      updatePermission(
                                        selectedAdmin.userId,
                                        definition.key,
                                        value
                                      )
                                    }
                                  />
                                ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    )}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="page">
            <div className="rounded-xl border bg-card shadow-sm">
              <div className="flex flex-col gap-4 border-b p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium"
                      htmlFor="page-category"
                    >
                      Navigation category
                    </label>
                    <GroupSelect
                      id="page-category"
                      value={selectedGroup}
                      groups={groups}
                      onChange={selectGroup}
                    />
                  </div>
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium"
                      htmlFor="permission-page"
                    >
                      Page or capability
                    </label>
                    <Select
                      value={selectedPageKey}
                      onValueChange={setSelectedPageKey}
                    >
                      <SelectTrigger id="permission-page" className="w-full">
                        <SelectValue placeholder="Select a page or capability" />
                      </SelectTrigger>
                      <SelectContent>
                        {pageDefinitions.map(definition => (
                          <SelectItem
                            key={definition.key}
                            value={definition.key}
                          >
                            {definition.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {selectedPage && (
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      style={{
                        background: (
                          GROUP_COLORS[selectedPage.group] ??
                          GROUP_COLORS.Overview
                        ).bg,
                        color: (
                          GROUP_COLORS[selectedPage.group] ??
                          GROUP_COLORS.Overview
                        ).text,
                        borderColor: (
                          GROUP_COLORS[selectedPage.group] ??
                          GROUP_COLORS.Overview
                        ).border,
                      }}
                    >
                      {selectedPage.group}
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                      Showing every administrator with access.
                    </p>
                  </div>
                )}
              </div>
              {selectedPage && (
                <div className="p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">
                        {selectedPage.label}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Turn this one item on or off for the exact people who
                        need it.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updatePageForAll(false)}
                      >
                        Revoke from all
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updatePageForAll(true)}
                      >
                        Grant to all
                      </Button>
                    </div>
                  </div>
                  <div className="divide-y rounded-lg border">
                    {allAdmins.map(admin => {
                      const granted = Boolean(
                        permissionsFor(admin)[selectedPage.key]
                      );
                      return (
                        <div
                          key={admin.userId}
                          className="flex min-h-16 items-center justify-between gap-4 px-4 py-3"
                        >
                          <AdminIdentity admin={admin} />
                          <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                            <span>{granted ? "Has access" : "No access"}</span>
                            <Checkbox
                              checked={granted}
                              disabled={
                                admin.isProtected ||
                                isPermissionLocked(
                                  permissionsFor(admin),
                                  selectedPage.key
                                )
                              }
                              onCheckedChange={value =>
                                updatePermission(
                                  admin.userId,
                                  selectedPage.key,
                                  Boolean(value)
                                )
                              }
                              aria-label={`${granted ? "Revoke" : "Grant"} ${selectedPage.label} for ${admin.name}`}
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="matrix">
            <div className="rounded-xl border bg-card shadow-sm">
              <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div>
                  <p className="text-sm font-semibold">Super Matrix</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    One clean grid for a single sidebar category at a time.
                  </p>
                </div>
                <GroupSelect
                  id="matrix-category"
                  value={selectedGroup}
                  groups={groups}
                  onChange={selectGroup}
                />
              </div>
              <div
                data-super-permissions-matrix
                className="isolate max-h-[62vh] overflow-auto bg-card"
              >
                <div className="sticky top-0 left-0 z-[60] flex h-[76px] w-[320px] items-center border-r border-b bg-card px-5 text-sm font-medium shadow-[3px_2px_5px_-4px_rgba(15,23,42,0.45)]">
                  Administrator
                </div>
                <div className="min-w-max -mt-[76px]">
                  <div
                    className="sticky top-0 z-50 grid isolate border-b bg-card shadow-[0_2px_5px_-3px_rgba(15,23,42,0.45)] before:absolute before:inset-0 before:z-0 before:bg-card"
                    style={{ gridTemplateColumns: matrixGridTemplateColumns }}
                  >
                    <div className="min-h-[76px] border-r bg-card" aria-hidden="true" />
                    {selectedGroupDefinitions.map(definition => (
                      <div
                        key={definition.key}
                        className="relative z-10 flex min-h-[76px] items-center justify-center border-l bg-card px-3 text-center text-xs font-medium leading-5"
                        title={definition.label}
                      >
                        {definition.label}
                      </div>
                    ))}
                  </div>

                  <div className="relative z-0 divide-y">
                    {allAdmins.map(admin => (
                      <div
                        key={admin.userId}
                        className="relative z-0 group grid min-h-[76px] bg-card"
                        style={{ gridTemplateColumns: matrixGridTemplateColumns }}
                      >
                        <div className="sticky left-0 z-20 flex min-h-[76px] items-center border-r bg-card px-5 shadow-[3px_0_5px_-4px_rgba(15,23,42,0.45)] group-hover:bg-muted">
                          <AdminIdentity admin={admin} />
                        </div>
                        {selectedGroupDefinitions.map(definition => {
                          const granted = Boolean(
                            permissionsFor(admin)[definition.key]
                          );
                          return (
                            <div
                              key={definition.key}
                              className="flex min-h-[76px] items-center justify-center border-l px-3"
                            >
                              <Checkbox
                                checked={granted}
                                disabled={
                                  admin.isProtected ||
                                  isPermissionLocked(
                                    permissionsFor(admin),
                                    definition.key
                                  )
                                }
                                onCheckedChange={value =>
                                  updatePermission(
                                    admin.userId,
                                    definition.key,
                                    Boolean(value)
                                  )
                                }
                                aria-label={`${granted ? "Revoke" : "Grant"} ${definition.label} for ${admin.name}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {dirty && (
        <div className="sticky sticky-surface-background bottom-4 flex items-center justify-between gap-3 rounded-xl border p-3 shadow-lg">
          <p className="text-sm text-muted-foreground">
            You have unsaved permission changes.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={bulkUpdate.isPending}
            >
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleSaveClick}
              disabled={bulkUpdate.isPending}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" /> Save Changes
            </Button>
          </div>
        </div>
      )}
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
