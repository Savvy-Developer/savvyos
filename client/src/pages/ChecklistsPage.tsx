import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Building2,
  CheckSquare2,
  ClipboardCheck,
  Copy,
  FilePenLine,
  Loader2,
  Plus,
  Share2,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

type TargetType = "transaction" | "listing";
type AssigneeRule = "none" | "record_owner" | "specific_user";
type AutomaticDefaultEvent = "none" | "on_create" | "on_under_contract";

type Candidate = {
  id: number;
  name: string;
  email: string | null;
  role: "admin" | "agent" | "isa" | "agent_support";
};

type TemplateItemDraft = {
  clientId: string;
  id?: number;
  title: string;
  notes: string;
  sectionName: string;
  relativeDueDateAnchor: string;
  dueDaysOffset: string;
  assigneeRule: AssigneeRule;
  assignedUserId: string;
};

type TemplateDraft = {
  name: string;
  description: string;
  targetType: TargetType;
  transactionSubtype: string;
  automaticDefaultEvent: AutomaticDefaultEvent;
  items: TemplateItemDraft[];
};

type ShareEntry = {
  recipientUserId: number;
  recipientName: string;
  recipientEmail: string | null;
};

type TemplateSummary = {
  id: number;
  name: string;
  description: string | null;
  targetType: TargetType;
  transactionSubtype: string | null;
  archived: boolean;
  itemCount: number;
  isOwner: boolean;
  canManage: boolean;
  ownerName: string | null;
  sharedWithMe: boolean;
  automaticDefaultEvent: AutomaticDefaultEvent;
  shares: ShareEntry[];
};

const EMPTY_DRAFT: TemplateDraft = {
  name: "",
  description: "",
  targetType: "transaction",
  transactionSubtype: "any",
  automaticDefaultEvent: "none",
  items: [],
};

const TRANSACTION_ANCHORS = [
  { value: "target_created", label: "Transaction created date" },
  { value: "under_contract", label: "Under-contract date" },
  { value: "closing", label: "Closing date" },
] as const;

const LISTING_ANCHORS = [
  { value: "target_created", label: "Listing created date" },
  { value: "listing_live", label: "List date" },
  { value: "under_contract", label: "Under-contract date" },
] as const;

function asArray(value: any, keys: string[]): any[] {
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

function normalizeCandidates(value: any): Candidate[] {
  return asArray(value, ["candidates", "users", "rows"])
    .map((row: any) => row.user ?? row)
    .filter((row: any) => Number.isFinite(Number(row?.id)))
    .map((row: any) => ({
      id: Number(row.id),
      name: row.name ?? row.email ?? `User #${row.id}`,
      email: row.email ?? null,
      role: row.role,
    }));
}

function normalizeShares(value: any): ShareEntry[] {
  return asArray(value, ["shares", "sharedWith"]).map((row: any) => {
    const recipient = row.recipient ?? row.user ?? row;
    return {
      recipientUserId: Number(row.userId ?? row.recipientUserId ?? recipient.id),
      recipientName:
        row.userName ??
        recipient.name ??
        row.userEmail ??
        recipient.email ??
        `User #${row.userId ?? recipient.id}`,
      recipientEmail: row.userEmail ?? recipient.email ?? null,
    };
  });
}

function normalizeSummary(row: any, currentUserId?: number): TemplateSummary {
  const template = row.template ?? row;
  const owner = row.owner ?? template.owner ?? null;
  const archived = Boolean(
    template.archivedAt ?? template.archived ?? template.isArchived
  );
  const canManage = row.canManage ?? template.canManage;
  const inferredShared = Boolean(
    row.sharedWithMe ??
      template.sharedWithMe ??
      (canManage === false || Boolean(row.share ?? template.share))
  );
  const isOwner = Boolean(
    template.ownerUserId != null && currentUserId != null
      ? Number(template.ownerUserId) === currentUserId
      : (row.isOwner ?? template.isOwner ?? canManage ?? (!inferredShared && !owner))
  );
  const target = template.targetType ?? template.appliesTo;
  return {
    id: Number(template.id),
    name: template.name ?? "Untitled checklist",
    description: template.description ?? null,
    targetType: target === "listing" ? "listing" : "transaction",
    transactionSubtype:
      template.transactionTypeFilter ??
      template.transactionSubtype ??
      template.transactionType ??
      null,
    archived,
    itemCount: Number(
      row.itemCount ?? template.itemCount ?? template.items?.length ?? 0
    ),
    isOwner,
    canManage: Boolean(canManage ?? isOwner),
    ownerName: owner?.name ?? row.ownerName ?? template.ownerName ?? null,
    sharedWithMe: inferredShared,
    automaticDefaultEvent:
      template.automaticDefaultEvent === "on_create" ||
      template.automaticDefaultEvent === "on_under_contract"
        ? template.automaticDefaultEvent
        : "none",
    shares: normalizeShares(row.shares ?? template.shares),
  };
}

function normalizeTemplates(value: any, currentUserId?: number): TemplateSummary[] {
  return asArray(value, ["templates", "rows"]).map(row =>
    normalizeSummary(row, currentUserId)
  );
}

function newItem(sectionName = ""): TemplateItemDraft {
  return {
    clientId: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: "",
    notes: "",
    sectionName,
    relativeDueDateAnchor: "none",
    dueDaysOffset: "0",
    assigneeRule: "none",
    assignedUserId: "unassigned",
  };
}

function normalizeDetail(value: any): TemplateDraft {
  const template = value?.template ?? value ?? {};
  const targetType: TargetType =
    (template.targetType ?? template.appliesTo) === "listing"
      ? "listing"
      : "transaction";
  const items = asArray(value?.items ?? template.items, ["items", "rows"]);
  return {
    name: template.name ?? "",
    description: template.description ?? "",
    targetType,
    transactionSubtype:
      template.transactionTypeFilter ??
      template.transactionSubtype ??
      template.transactionType ??
      "any",
    automaticDefaultEvent:
      template.automaticDefaultEvent === "on_create" ||
      template.automaticDefaultEvent === "on_under_contract"
        ? template.automaticDefaultEvent
        : "none",
    items: items.map((row: any, index: number) => {
      const item = row.item ?? row;
      const assigneeRule =
        item.assignmentType ??
        item.assigneeRule ??
        (item.assignedUserId ? "specific_user" : "none");
      return {
        clientId: `existing-${item.id ?? index}`,
        id: item.id == null ? undefined : Number(item.id),
        title: item.title ?? "",
        notes: item.notes ?? item.description ?? "",
        sectionName: item.sectionName ?? item.section ?? "",
        relativeDueDateAnchor:
          item.dueAnchor ??
          item.relativeDueDateAnchor ??
          item.dueDateAnchor ??
          "none",
        dueDaysOffset: String(
          item.dueOffsetDays ?? item.dueDaysOffset ?? item.dayOffset ?? 0
        ),
        assigneeRule:
          assigneeRule === "owner" || assigneeRule === "record_owner"
            ? "record_owner"
            : assigneeRule === "specific" || assigneeRule === "specific_user"
              ? "specific_user"
              : "none",
        assignedUserId:
          item.assignedUserId == null
            ? "unassigned"
            : String(item.assignedUserId),
      } satisfies TemplateItemDraft;
    }),
  };
}

function relativeDateExample(item: TemplateItemDraft): string {
  if (item.relativeDueDateAnchor === "none") {
    return "No due date will be set when this checklist is applied.";
  }
  const offset = Number(item.dueDaysOffset || 0);
  const direction =
    offset === 0
      ? "on"
      : offset > 0
        ? `${offset} day${offset === 1 ? "" : "s"} after`
        : `${Math.abs(offset)} day${offset === -1 ? "" : "s"} before`;
  const anchor = [...TRANSACTION_ANCHORS, ...LISTING_ANCHORS].find(
    option => option.value === item.relativeDueDateAnchor
  )?.label.toLowerCase();
  return `Example: due ${direction} the ${anchor ?? "record date"}. Use -3 for three days before; +7 for seven days after.`;
}

function templatePayload(draft: TemplateDraft) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    targetType: draft.targetType,
    transactionTypeFilter:
      draft.targetType === "transaction" &&
      draft.transactionSubtype !== "all" &&
      draft.transactionSubtype !== "any"
        ? (draft.transactionSubtype as "buyer" | "seller" | "dual")
        : ("any" as const),
    automaticDefaultEvent: draft.automaticDefaultEvent,
    items: draft.items.map(item => ({
      title: item.title.trim(),
      notes: item.notes.trim() || null,
      sectionName: item.sectionName.trim() || "General",
      dueAnchor:
        item.relativeDueDateAnchor === "none"
          ? null
          : (item.relativeDueDateAnchor as
              | "target_created"
              | "under_contract"
              | "closing"
              | "listing_live"),
      dueOffsetDays: Number(item.dueDaysOffset || 0),
      assignmentType:
        item.assigneeRule === "record_owner"
          ? ("owner" as const)
          : item.assigneeRule === "specific_user"
            ? ("specific" as const)
            : ("none" as const),
      assignedUserId:
        item.assigneeRule === "specific_user" &&
        item.assignedUserId !== "unassigned"
          ? Number(item.assignedUserId)
          : null,
    })),
  };
}

export default function ChecklistsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<"active" | "archived">(
    "active"
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>(EMPTY_DRAFT);
  const [templateToArchive, setTemplateToArchive] =
    useState<TemplateSummary | null>(null);
  const [shareTemplate, setShareTemplate] = useState<TemplateSummary | null>(null);
  const [shareRecipientId, setShareRecipientId] = useState("unselected");

  const templatesQuery = trpc.checklists.templates.list.useQuery({
    includeArchived: true,
  });
  const detailQuery = trpc.checklists.templates.get.useQuery(
    { id: editingTemplateId as number },
    { enabled: editorOpen && editingTemplateId != null }
  );
  const candidatesQuery = trpc.checklists.users.candidates.useQuery();

  const allTemplates = useMemo(
    () => normalizeTemplates(templatesQuery.data, user?.id),
    [templatesQuery.data, user?.id]
  );
  const candidates = useMemo(
    () => normalizeCandidates(candidatesQuery.data),
    [candidatesQuery.data]
  );
  const visibleTemplates = allTemplates.filter(template =>
    statusFilter === "archived" ? template.archived : !template.archived
  );
  const ownTemplates = visibleTemplates.filter(template => template.isOwner);
  const sharedTemplates = visibleTemplates.filter(template => !template.isOwner);
  const activeCount = allTemplates.filter(template => !template.archived).length;
  const archivedCount = allTemplates.filter(template => template.archived).length;

  useEffect(() => {
    if (!editorOpen || editingTemplateId == null || !detailQuery.data) return;
    setDraft(normalizeDetail(detailQuery.data));
  }, [detailQuery.data, editingTemplateId, editorOpen]);

  const invalidateTemplates = () => {
    void utils.checklists.templates.list.invalidate();
    void utils.checklists.templates.get.invalidate();
  };

  const createMutation = trpc.checklists.templates.create.useMutation({
    onSuccess: () => {
      invalidateTemplates();
      setEditorOpen(false);
      toast.success("Checklist template created");
    },
    onError: error => toast.error(error.message),
  });
  const updateMutation = trpc.checklists.templates.update.useMutation({
    onSuccess: () => {
      invalidateTemplates();
      setEditorOpen(false);
      toast.success("Checklist template updated");
    },
    onError: error => toast.error(error.message),
  });
  const duplicateMutation = trpc.checklists.templates.duplicate.useMutation({
    onSuccess: () => {
      invalidateTemplates();
      toast.success("Checklist copied to your library");
    },
    onError: error => toast.error(error.message),
  });
  const archiveMutation = trpc.checklists.templates.archive.useMutation({
    onSuccess: () => {
      invalidateTemplates();
      setTemplateToArchive(null);
      toast.success("Checklist archived");
    },
    onError: error => toast.error(error.message),
  });
  const restoreMutation = trpc.checklists.templates.restore.useMutation({
    onSuccess: () => {
      invalidateTemplates();
      toast.success("Checklist restored");
    },
    onError: error => toast.error(error.message),
  });
  const shareMutation = trpc.checklists.templates.share.useMutation({
    onSuccess: () => {
      invalidateTemplates();
      setShareRecipientId("unselected");
      toast.success("Checklist shared");
    },
    onError: error => toast.error(error.message),
  });
  const unshareMutation = trpc.checklists.templates.unshare.useMutation({
    onSuccess: () => {
      invalidateTemplates();
      toast.success("Sharing removed");
    },
    onError: error => toast.error(error.message),
  });

  function openCreate() {
    setEditingTemplateId(null);
    setDraft({ ...EMPTY_DRAFT, items: [newItem()] });
    setEditorOpen(true);
  }

  function openEdit(template: TemplateSummary) {
    setEditingTemplateId(template.id);
    setDraft(EMPTY_DRAFT);
    setEditorOpen(true);
  }

  function updateItem(
    clientId: string,
    patch: Partial<TemplateItemDraft>
  ) {
    setDraft(current => ({
      ...current,
      items: current.items.map(item =>
        item.clientId === clientId ? { ...item, ...patch } : item
      ),
    }));
  }

  function moveItem(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= draft.items.length) return;
    setDraft(current => {
      const items = [...current.items];
      [items[index], items[destination]] = [items[destination], items[index]];
      return { ...current, items };
    });
  }

  function saveTemplate() {
    if (!draft.name.trim()) {
      toast.error("Template name is required");
      return;
    }
    if (draft.items.some(item => !item.title.trim())) {
      toast.error("Every checklist item needs a title");
      return;
    }
    if (
      draft.items.some(
        item =>
          item.assigneeRule === "specific_user" &&
          item.assignedUserId === "unassigned"
      )
    ) {
      toast.error("Choose a specific assignee for each item using that rule");
      return;
    }
    const payload = templatePayload(draft);
    if (editingTemplateId == null) createMutation.mutate(payload);
    else updateMutation.mutate({ id: editingTemplateId, data: payload });
  }

  const editorPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Checklists"
        subtitle="Build repeatable transaction and listing workflows, then apply independent copies to individual records."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New checklist
          </Button>
        }
      />

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
        <strong>Templates stay reusable.</strong> When a checklist is applied to a
        listing or transaction, SavvyOS creates a snapshot. Completing, editing,
        adding, or removing items on that record never changes this library version.
      </div>

      <Tabs
        value={statusFilter}
        onValueChange={value => setStatusFilter(value as typeof statusFilter)}
      >
        <TabsList>
          <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({archivedCount})</TabsTrigger>
        </TabsList>
      </Tabs>

      {templatesQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map(index => (
            <Skeleton key={index} className="h-52 w-full rounded-xl" />
          ))}
        </div>
      ) : templatesQuery.error ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium text-destructive">Couldn’t load checklists</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {templatesQuery.error.message}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => templatesQuery.refetch()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : visibleTemplates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-3 rounded-full bg-primary/10 p-3">
              {statusFilter === "active" ? (
                <ClipboardCheck className="h-8 w-8 text-primary" />
              ) : (
                <Archive className="h-8 w-8 text-primary" />
              )}
            </div>
            <h2 className="text-lg font-semibold">
              {statusFilter === "active"
                ? "Create your first checklist"
                : "No archived checklists"}
            </h2>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">
              {statusFilter === "active"
                ? "Capture your repeatable process once, then apply it to any transaction or listing."
                : "Archived templates will appear here and can be restored at any time."}
            </p>
            {statusFilter === "active" && (
              <Button className="mt-5" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> New checklist
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {ownTemplates.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <UserRound className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Your templates
                </h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {ownTemplates.map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    duplicatePending={duplicateMutation.isPending}
                    archivePending={restoreMutation.isPending}
                    onEdit={() => openEdit(template)}
                    onDuplicate={() =>
                      duplicateMutation.mutate({ id: template.id })
                    }
                    onArchive={() => setTemplateToArchive(template)}
                    onShare={() => {
                      setShareTemplate(template);
                      setShareRecipientId("unselected");
                    }}
                    onRestore={() =>
                      restoreMutation.mutate({ id: template.id })
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {sharedTemplates.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <UsersRound className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {isAdmin ? "Other agents’ templates" : "Shared with you"}
                </h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {sharedTemplates.map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    duplicatePending={duplicateMutation.isPending}
                    archivePending={restoreMutation.isPending}
                    onEdit={template.canManage ? () => openEdit(template) : undefined}
                    onDuplicate={() =>
                      duplicateMutation.mutate({ id: template.id })
                    }
                    onArchive={template.canManage ? () => setTemplateToArchive(template) : undefined}
                    onShare={template.canManage ? () => {
                      setShareTemplate(template);
                      setShareRecipientId("unselected");
                    } : undefined}
                    onRestore={() =>
                      restoreMutation.mutate({ id: template.id })
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <Dialog
        open={editorOpen}
        onOpenChange={open => {
          if (!editorPending) setEditorOpen(open);
        }}
      >
        <DialogContent className="max-h-[94vh] w-[calc(100vw-1rem)] max-w-5xl overflow-y-auto p-0">
          <DialogHeader className="sticky top-0 z-10 border-b bg-background px-5 py-4 sm:px-6">
            <DialogTitle>
              {editingTemplateId == null ? "Create checklist" : "Edit checklist"}
            </DialogTitle>
          </DialogHeader>

          {editingTemplateId != null && detailQuery.isLoading ? (
            <div className="space-y-4 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : detailQuery.error ? (
            <div className="p-6 text-center">
              <p className="font-medium text-destructive">Couldn’t open checklist</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {detailQuery.error.message}
              </p>
            </div>
          ) : (
            <div className="space-y-6 p-5 sm:p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label htmlFor="checklist-template-name">Name</Label>
                  <Input
                    id="checklist-template-name"
                    className="mt-1"
                    placeholder="e.g. Buyer under contract"
                    value={draft.name}
                    onChange={event =>
                      setDraft(current => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="checklist-template-description">
                    Description
                  </Label>
                  <Textarea
                    id="checklist-template-description"
                    className="mt-1 resize-y"
                    placeholder="When should this checklist be used?"
                    value={draft.description}
                    onChange={event =>
                      setDraft(current => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Target type</Label>
                  <Select
                    value={draft.targetType}
                    onValueChange={value =>
                      setDraft(current => ({
                        ...current,
                        targetType: value as TargetType,
                        transactionSubtype:
                          value === "listing"
                            ? "any"
                            : current.transactionSubtype,
                        items: current.items.map(item => ({
                          ...item,
                          relativeDueDateAnchor:
                            item.relativeDueDateAnchor === "none"
                              ? "none"
                              : "target_created",
                        })),
                      }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="transaction">Transaction</SelectItem>
                      <SelectItem value="listing">Listing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Transaction subtype</Label>
                  <Select
                    disabled={draft.targetType !== "transaction"}
                    value={draft.transactionSubtype}
                    onValueChange={transactionSubtype =>
                      setDraft(current => ({ ...current, transactionSubtype }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">All transaction types</SelectItem>
                      <SelectItem value="buyer">Buyer</SelectItem>
                      <SelectItem value="seller">Seller</SelectItem>
                      <SelectItem value="dual">Dual</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Optional filter used when choosing a checklist to apply.
                  </p>
                </div>
                <div className="md:col-span-2">
                  <Label>Automatic application</Label>
                  <Select
                    value={draft.automaticDefaultEvent}
                    onValueChange={automaticDefaultEvent =>
                      setDraft(current => ({
                        ...current,
                        automaticDefaultEvent:
                          automaticDefaultEvent as AutomaticDefaultEvent,
                      }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Manual only</SelectItem>
                      <SelectItem value="on_create">
                        Automatically when the {draft.targetType} is created
                      </SelectItem>
                      <SelectItem value="on_under_contract">
                        Automatically when the {draft.targetType} goes under contract
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    SavvyOS applies this template once to matching records owned by you. You can still apply it manually.
                  </p>
                </div>
              </div>

              <div className="border-t pt-5">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-semibold">Checklist items</h3>
                    <p className="text-sm text-muted-foreground">
                      Add as many items as needed. Section names group items after application.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDraft(current => ({
                        ...current,
                        items: [
                          ...current.items,
                          newItem(current.items.at(-1)?.sectionName ?? ""),
                        ],
                      }))
                    }
                  >
                    <Plus className="mr-1.5 h-4 w-4" /> Add item
                  </Button>
                </div>

                {draft.items.length === 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setDraft(current => ({
                        ...current,
                        items: [newItem()],
                      }))
                    }
                    className="w-full rounded-xl border-2 border-dashed px-6 py-10 text-center text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="mx-auto mb-2 h-5 w-5" />
                    Add your first checklist item
                  </button>
                ) : (
                  <div className="space-y-3">
                    {draft.items.map((item, index) => {
                      const anchors =
                        draft.targetType === "transaction"
                          ? TRANSACTION_ANCHORS
                          : LISTING_ANCHORS;
                      return (
                        <div
                          key={item.clientId}
                          className="rounded-xl border bg-card p-3 shadow-sm sm:p-4"
                        >
                          <div className="flex items-start gap-2">
                            <div className="mt-0.5 flex shrink-0 flex-col rounded-md border bg-muted/20">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-b-none"
                                disabled={index === 0}
                                onClick={() => moveItem(index, -1)}
                                aria-label={`Move ${item.title || `item ${index + 1}`} up`}
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-t-none border-t"
                                disabled={index === draft.items.length - 1}
                                onClick={() => moveItem(index, 1)}
                                aria-label={`Move ${item.title || `item ${index + 1}`} down`}
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <div className="min-w-0 flex-1 space-y-3">
                              <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(150px,1fr)]">
                                <div>
                                  <Label htmlFor={`item-title-${item.clientId}`} className="text-xs">
                                    Item {index + 1}
                                  </Label>
                                  <Input
                                    id={`item-title-${item.clientId}`}
                                    className="mt-1"
                                    placeholder="What needs to be done?"
                                    value={item.title}
                                    onChange={event =>
                                      updateItem(item.clientId, {
                                        title: event.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div>
                                  <Label htmlFor={`item-section-${item.clientId}`} className="text-xs">
                                    Section
                                  </Label>
                                  <Input
                                    id={`item-section-${item.clientId}`}
                                    className="mt-1"
                                    placeholder="e.g. Pre-closing"
                                    value={item.sectionName}
                                    onChange={event =>
                                      updateItem(item.clientId, {
                                        sectionName: event.target.value,
                                      })
                                    }
                                  />
                                </div>
                              </div>
                              <div>
                                <Label htmlFor={`item-notes-${item.clientId}`} className="text-xs">
                                  Notes
                                </Label>
                                <Textarea
                                  id={`item-notes-${item.clientId}`}
                                  className="mt-1 min-h-16 resize-y text-sm"
                                  placeholder="Instructions, links, or context (optional)"
                                  value={item.notes}
                                  onChange={event =>
                                    updateItem(item.clientId, {
                                      notes: event.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="grid gap-3 md:grid-cols-3">
                                <div>
                                  <Label className="text-xs">Due date anchor</Label>
                                  <Select
                                    value={item.relativeDueDateAnchor}
                                    onValueChange={relativeDueDateAnchor =>
                                      updateItem(item.clientId, {
                                        relativeDueDateAnchor,
                                      })
                                    }
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">No due date</SelectItem>
                                      {anchors.map(anchor => (
                                        <SelectItem
                                          key={anchor.value}
                                          value={anchor.value}
                                        >
                                          {anchor.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label htmlFor={`item-offset-${item.clientId}`} className="text-xs">
                                    Signed day offset
                                  </Label>
                                  <Input
                                    id={`item-offset-${item.clientId}`}
                                    type="number"
                                    step={1}
                                    className="mt-1"
                                    placeholder="0, -3, +7"
                                    value={item.dueDaysOffset}
                                    onChange={event =>
                                      updateItem(item.clientId, {
                                        dueDaysOffset: event.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Assignee rule</Label>
                                  <Select
                                    value={item.assigneeRule}
                                    onValueChange={assigneeRule =>
                                      updateItem(item.clientId, {
                                        assigneeRule: assigneeRule as AssigneeRule,
                                        assignedUserId:
                                          assigneeRule === "specific_user"
                                            ? item.assignedUserId
                                            : "unassigned",
                                      })
                                    }
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">No assignee</SelectItem>
                                      <SelectItem value="record_owner">
                                        Record owner
                                      </SelectItem>
                                      <SelectItem value="specific_user">
                                        Specific person
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              {item.assigneeRule === "specific_user" && (
                                <div className="max-w-sm">
                                  <Label className="text-xs">Specific person</Label>
                                  <Select
                                    value={item.assignedUserId}
                                    onValueChange={assignedUserId =>
                                      updateItem(item.clientId, { assignedUserId })
                                    }
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue placeholder="Choose a Savvy user" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="unassigned">
                                        Choose a Savvy user
                                      </SelectItem>
                                      {candidates.map(candidate => (
                                        <SelectItem
                                          key={candidate.id}
                                          value={String(candidate.id)}
                                        >
                                          {candidate.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {relativeDateExample(item)}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setDraft(current => ({
                                  ...current,
                                  items: current.items.filter(
                                    draftItem =>
                                      draftItem.clientId !== item.clientId
                                  ),
                                }))
                              }
                              aria-label={`Delete ${item.title || `item ${index + 1}`}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="sticky bottom-0 z-10 border-t bg-background px-5 py-4 sm:px-6">
            <Button
              variant="outline"
              disabled={editorPending}
              onClick={() => setEditorOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                editorPending ||
                (editingTemplateId != null && detailQuery.isLoading)
              }
              onClick={saveTemplate}
            >
              {editorPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingTemplateId == null ? "Create checklist" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(shareTemplate)}
        onOpenChange={open => {
          if (!open) setShareTemplate(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Share “{shareTemplate?.name}”</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Recipients can use the shared template or duplicate it into their own
            library. Your original remains under your control.
          </p>
          <div>
            <Label>Share with a Savvy user</Label>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              <Select
                value={shareRecipientId}
                onValueChange={setShareRecipientId}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Choose user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unselected">Choose user</SelectItem>
                  {candidates
                    .filter(
                      candidate =>
                        candidate.role === "agent" &&
                        !shareTemplate?.shares.some(
                          share => share.recipientUserId === candidate.id
                        )
                    )
                    .map(candidate => (
                      <SelectItem key={candidate.id} value={String(candidate.id)}>
                        {candidate.name}
                        {candidate.email ? ` · ${candidate.email}` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                disabled={
                  shareRecipientId === "unselected" || shareMutation.isPending
                }
                onClick={() =>
                  shareTemplate &&
                  shareMutation.mutate({
                    id: shareTemplate.id,
                    userId: Number(shareRecipientId),
                  })
                }
              >
                {shareMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Share
              </Button>
            </div>
          </div>
          <div className="space-y-2 border-t pt-4">
            <Label>People with access</Label>
            {shareTemplate?.shares.length ? (
              shareTemplate.shares.map(share => (
                <div
                  key={share.recipientUserId}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {share.recipientName}
                    </p>
                    {share.recipientEmail && (
                      <p className="truncate text-xs text-muted-foreground">
                        {share.recipientEmail}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    disabled={unshareMutation.isPending}
                    onClick={() =>
                      shareTemplate &&
                      unshareMutation.mutate({
                        id: shareTemplate.id,
                        userId: share.recipientUserId,
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Not shared with anyone yet.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareTemplate(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(templateToArchive)}
        onOpenChange={open => !open && setTemplateToArchive(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this checklist?</AlertDialogTitle>
            <AlertDialogDescription>
              “{templateToArchive?.name}” will move out of the active library and
              can no longer be newly applied. Existing applied copies remain exactly
              as they are and the template can be restored later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiveMutation.isPending}
              onClick={() =>
                templateToArchive &&
                archiveMutation.mutate({ id: templateToArchive.id })
              }
            >
              Archive checklist
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TemplateCard({
  template,
  duplicatePending,
  archivePending,
  onEdit,
  onDuplicate,
  onArchive,
  onShare,
  onRestore,
}: {
  template: TemplateSummary;
  duplicatePending: boolean;
  archivePending: boolean;
  onEdit?: () => void;
  onDuplicate: () => void;
  onArchive?: () => void;
  onShare?: () => void;
  onRestore: () => void;
}) {
  return (
    <Card className="flex h-full flex-col transition-colors hover:border-primary/35">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{template.name}</CardTitle>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="gap-1 capitalize">
                {template.targetType === "transaction" ? (
                  <CheckSquare2 className="h-3 w-3" />
                ) : (
                  <Building2 className="h-3 w-3" />
                )}
                {template.targetType}
              </Badge>
              {template.targetType === "transaction" &&
                template.transactionSubtype &&
                template.transactionSubtype !== "all" && (
                  <Badge variant="outline" className="capitalize">
                    {template.transactionSubtype.replace(/_/g, " ")}
                  </Badge>
                )}
              {template.automaticDefaultEvent !== "none" && (
                <Badge variant="outline">
                  {template.automaticDefaultEvent === "on_create"
                    ? "Auto: on creation"
                    : "Auto: under contract"}
                </Badge>
              )}
              {template.sharedWithMe && (
                <Badge
                  variant="outline"
                  className="border-blue-200 bg-blue-50 text-blue-800"
                >
                  Shared
                </Badge>
              )}
            </div>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {template.itemCount} item{template.itemCount === 1 ? "" : "s"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <p
          className={cn(
            "line-clamp-3 text-sm text-muted-foreground",
            !template.description && "italic"
          )}
        >
          {template.description || "No description"}
        </p>
        {template.sharedWithMe && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" /> Shared by {template.ownerName ?? "another Savvy user"}
          </p>
        )}
        {template.isOwner && template.shares.length > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <UsersRound className="h-3.5 w-3.5" /> Shared with {template.shares.length} user{template.shares.length === 1 ? "" : "s"}
          </p>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-5">
          {template.canManage && !template.archived && onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <FilePenLine className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={duplicatePending}
            onClick={onDuplicate}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            {template.sharedWithMe ? "Copy to mine" : "Duplicate"}
          </Button>
          {template.canManage && !template.archived && onShare && (
            <Button variant="ghost" size="sm" onClick={onShare}>
              <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share
            </Button>
          )}
          {template.canManage && !template.archived && onArchive && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={onArchive}
            >
              <Archive className="mr-1.5 h-3.5 w-3.5" /> Archive
            </Button>
          )}
          {template.canManage && template.archived && (
            <Button
              variant="outline"
              size="sm"
              disabled={archivePending}
              onClick={onRestore}
            >
              <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" /> Restore
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
