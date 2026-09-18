import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
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
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckSquare,
  Clock,
  KeyRound,
  Loader2,
  Lock,
  RotateCcw,
  Save,
  ShieldCheck,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const GROUP_ORDER = [
  "Overview",
  "Chat",
  "CRM",
  "ISA",
  "Transactions",
  "Transactions Admin",
  "Agent Success Team",
  "Pulse",
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
  Chat: { bg: "#f0fdfa", text: "#0f766e", border: "#99f6e4" },
  CRM: { bg: "#f5f3ff", text: "#6d28d9", border: "#ddd6fe" },
  ISA: { bg: "#fdf4ff", text: "#a21caf", border: "#f5d0fe" },
  Transactions: { bg: "#ecfdf5", text: "#065f46", border: "#a7f3d0" },
  "Transactions Admin": { bg: "#f5f3ff", text: "#6d28d9", border: "#ddd6fe" },
  "Agent Success Team": { bg: "#fefce8", text: "#854d0e", border: "#fde68a" },
  Pulse: { bg: "#f0f9ff", text: "#075985", border: "#bae6fd" },
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

  const grants = items.filter(change => change.granted);
  const revocations = items.filter(change => !change.granted);

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
                  const index = items.indexOf(change);
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
  const { data: definitions = [] } = trpc.permissions.getDefinitions.useQuery(
    undefined,
    { enabled: Boolean(canManage) }
  );
  const { data: allAdmins = [], isLoading: loadingAdmins } =
    trpc.permissions.getAllAdminsPermissions.useQuery(undefined, {
      enabled: Boolean(canManage),
    });

  const [localPerms, setLocalPerms] = useState<
    Record<number, Record<string, boolean>>
  >({});
  const [selectedAdminId, setSelectedAdminId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const initialized = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<ChangeItem[]>([]);

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

  const selectedAdmin =
    allAdmins.find(admin => admin.userId === selectedAdminId) ?? null;
  const selectedPermissions = selectedAdmin
    ? (localPerms[selectedAdmin.userId] ?? selectedAdmin.permissions)
    : {};

  function handleToggle(key: string, value: boolean) {
    if (!selectedAdmin || selectedAdmin.isProtected) return;
    setLocalPerms(current => ({
      ...current,
      [selectedAdmin.userId]: { ...selectedPermissions, [key]: value },
    }));
    setDirty(true);
  }

  function handleSetAll(value: boolean) {
    if (!selectedAdmin || selectedAdmin.isProtected) return;
    const nextPermissions: Record<string, boolean> = {};
    for (const definition of definitions)
      nextPermissions[definition.key] = value;
    setLocalPerms(current => ({
      ...current,
      [selectedAdmin.userId]: nextPermissions,
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
        permissions: { ...(localPerms[admin.userId] ?? admin.permissions) },
        tempExpiry: {},
      };
    }
    for (const change of confirmedChanges) {
      if (!change.granted || change.grantType !== "temporary") continue;
      const duration = TEMP_DURATIONS.find(
        item => item.label === change.tempDuration
      );
      if (!duration || !byUser[change.userId]) continue;
      byUser[change.userId].tempExpiry[change.permKey] = new Date(
        Date.now() + duration.ms
      ).toISOString();
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

  if (checkingAccess || loadingAdmins) {
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

  const grouped = definitions.reduce<Record<string, PermDef[]>>(
    (groups, definition) => {
      (groups[definition.group] ??= []).push(definition);
      return groups;
    },
    {}
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Super Permissions
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Select one administrator, then set their module access and
              advanced controls.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
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

      <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full max-w-md">
            <label
              className="mb-2 block text-sm font-medium"
              htmlFor="permission-admin"
            >
              Administrator
            </label>
            <Select
              value={selectedAdmin ? String(selectedAdmin.userId) : undefined}
              onValueChange={value => setSelectedAdminId(Number(value))}
              disabled={allAdmins.length === 0}
            >
              <SelectTrigger id="permission-admin" className="w-full">
                <SelectValue placeholder="Select an administrator" />
              </SelectTrigger>
              <SelectContent>
                {allAdmins.map(admin => (
                  <SelectItem key={admin.userId} value={String(admin.userId)}>
                    {admin.name} {admin.isProtected ? "(Protected)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedAdmin && (
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-sm text-primary">
                  {getInitials(selectedAdmin.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {selectedAdmin.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {selectedAdmin.email}
                </p>
              </div>
              {selectedAdmin.isProtected && (
                <Badge
                  variant="outline"
                  className="border-amber-200 bg-amber-50 text-amber-700"
                >
                  Protected
                </Badge>
              )}
            </div>
          )}
        </div>

        {selectedAdmin?.isProtected ? (
          <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <strong>{selectedAdmin.name}</strong> always has full access. This
              account cannot be changed here.
            </p>
          </div>
        ) : selectedAdmin ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Use full access only when this administrator should have every
              capability.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSetAll(false)}
              >
                <Square className="mr-1.5 h-3.5 w-3.5" /> Revoke All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSetAll(true)}
              >
                <CheckSquare className="mr-1.5 h-3.5 w-3.5" /> Grant All
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border bg-amber-50/50 p-4 text-sm text-amber-950">
        <div className="flex gap-3">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p>
            <strong>Permission managers are fixed.</strong> Super Permissions
            access is controlled by SavvyOS ownership and cannot be granted from
            this screen.
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
      ) : selectedAdmin ? (
        <Accordion
          type="multiple"
          defaultValue={["Overview", "CRM", "Transactions"]}
          className="rounded-xl border bg-card px-5 shadow-sm"
        >
          {GROUP_ORDER.map(groupName => {
            const groupDefinitions = grouped[groupName];
            if (!groupDefinitions?.length) return null;
            const primaryControls = groupDefinitions.filter(
              definition => !ADVANCED_PERMISSION_KEYS.has(definition.key)
            );
            const advancedControls = groupDefinitions.filter(definition =>
              ADVANCED_PERMISSION_KEYS.has(definition.key)
            );
            const grantedCount = groupDefinitions.filter(
              definition => selectedPermissions[definition.key]
            ).length;
            const colors = GROUP_COLORS[groupName] ?? {
              bg: "#f8fafc",
              text: "#475569",
              border: "#e2e8f0",
            };

            return (
              <AccordionItem key={groupName} value={groupName}>
                <AccordionTrigger className="py-5 hover:no-underline">
                  <span className="flex min-w-0 items-center gap-3 text-left">
                    <span
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{ background: colors.text }}
                    />
                    <span>
                      <span className="block text-sm font-semibold">
                        {groupName}
                      </span>
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        {grantedCount} of {groupDefinitions.length} capabilities
                        granted
                      </span>
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-5">
                  <div className="space-y-2">
                    {primaryControls.map(definition => (
                      <PermissionToggle
                        key={definition.key}
                        definition={definition}
                        checked={Boolean(selectedPermissions[definition.key])}
                        disabled={selectedAdmin.isProtected}
                        onChange={value => handleToggle(definition.key, value)}
                      />
                    ))}
                  </div>
                  {advancedControls.length > 0 && (
                    <Accordion
                      type="single"
                      collapsible
                      className="mt-3 rounded-lg border bg-muted/20 px-4"
                    >
                      <AccordionItem value="advanced" className="border-0">
                        <AccordionTrigger className="py-3 text-xs uppercase tracking-wide text-muted-foreground hover:no-underline">
                          Advanced controls ({advancedControls.length})
                        </AccordionTrigger>
                        <AccordionContent className="pb-4">
                          <div className="space-y-2">
                            {advancedControls.map(definition => (
                              <PermissionToggle
                                key={definition.key}
                                definition={definition}
                                checked={Boolean(
                                  selectedPermissions[definition.key]
                                )}
                                disabled={selectedAdmin.isProtected}
                                onChange={value =>
                                  handleToggle(definition.key, value)
                                }
                              />
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      ) : null}

      {dirty && (
        <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
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
