import { useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

export type ChecklistTargetType = "transaction" | "listing";

type Candidate = {
  id: number;
  name: string;
  email?: string | null;
};

type AppliedItem = {
  id: number;
  applicationId: number;
  title: string;
  notes: string | null;
  sectionName: string | null;
  dueDate: Date | string | null;
  assignedUserId: number | null;
  assignedUser: Candidate | null;
  completed: boolean;
  sortOrder: number;
};

type ChecklistApplication = {
  id: number;
  templateId: number | null;
  name: string;
  items: AppliedItem[];
};

type ChecklistTemplateSummary = {
  id: number;
  name: string;
  description: string | null;
  targetType: string | null;
  transactionSubtype: string | null;
  itemCount: number;
};

type ItemDraft = {
  title: string;
  notes: string;
  sectionName: string;
  dueDate: string;
  assignedUserId: string;
};

const EMPTY_ITEM_DRAFT: ItemDraft = {
  title: "",
  notes: "",
  sectionName: "",
  dueDate: "",
  assignedUserId: "unassigned",
};

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
    }));
}

function normalizeApplications(value: any): ChecklistApplication[] {
  return asArray(value, ["applications", "rows"]).map((row: any) => {
    const application = row.application ?? row;
    const template = row.template ?? application.template ?? {};
    const rawItems = asArray(
      row.items ?? application.items,
      ["items", "rows"]
    );
    return {
      id: Number(application.id),
      templateId:
        application.templateId == null ? null : Number(application.templateId),
      name:
        application.name ??
        application.templateNameSnapshot ??
        application.templateName ??
        template.name ??
        "Untitled checklist",
      items: rawItems
        .map((itemRow: any, index: number) => {
          const item = itemRow.item ?? itemRow;
          const assignedUser =
            itemRow.assignedUser ?? item.assignedUser ?? item.assignee ?? null;
          const assigneeName = itemRow.assigneeName ?? item.assigneeName ?? null;
          return {
            id: Number(item.id),
            applicationId: Number(item.applicationId ?? application.id),
            title: item.title ?? "Untitled item",
            notes: item.notes ?? item.description ?? null,
            sectionName: item.sectionName ?? item.section ?? null,
            dueDate: item.dueDate ?? null,
            assignedUserId:
              item.assignedUserId == null
                ? assignedUser?.id == null
                  ? null
                  : Number(assignedUser.id)
                : Number(item.assignedUserId),
            assignedUser: assignedUser || assigneeName
              ? {
                  id: Number(assignedUser?.id ?? item.assignedUserId),
                  name:
                    assignedUser?.name ??
                    assignedUser?.email ??
                    assigneeName ??
                    `User #${item.assignedUserId}`,
                  email: assignedUser?.email ?? null,
                }
              : null,
            completed: Boolean(
              item.completed ?? item.isCompleted ?? item.completedAt
            ),
            sortOrder: Number(item.sortOrder ?? index),
          } satisfies AppliedItem;
        })
        .sort((a: AppliedItem, b: AppliedItem) => a.sortOrder - b.sortOrder),
    } satisfies ChecklistApplication;
  });
}

function normalizeTemplates(value: any): ChecklistTemplateSummary[] {
  return asArray(value, ["templates", "rows"]).map((row: any) => {
    const template = row.template ?? row;
    return {
      id: Number(template.id),
      name: template.name ?? "Untitled checklist",
      description: template.description ?? null,
      targetType: template.targetType ?? template.appliesTo ?? null,
      transactionSubtype:
        template.transactionTypeFilter ??
        template.transactionSubtype ??
        template.transactionType ??
        null,
      itemCount: Number(
        template.itemCount ?? row.itemCount ?? template.items?.length ?? 0
      ),
    };
  });
}

function dateInputValue(value: Date | string | null): string {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function displayDate(value: Date | string | null): string {
  const dateValue = dateInputValue(value);
  if (!dateValue) return "";
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function dueDateApiValue(value: string): string | null {
  return value ? new Date(`${value}T12:00:00`).toISOString() : null;
}

function dueState(item: AppliedItem): "overdue" | "upcoming" | "later" | null {
  if (item.completed || !item.dueDate) return null;
  const due = new Date(`${dateInputValue(item.dueDate)}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const inSevenDays = new Date(today);
  inSevenDays.setDate(today.getDate() + 7);
  if (due < today) return "overdue";
  if (due <= inSevenDays) return "upcoming";
  return "later";
}

function templateMatchesTarget(
  template: ChecklistTemplateSummary,
  targetType: ChecklistTargetType,
  transactionType?: "buyer" | "seller" | "dual" | null
): boolean {
  const configuredTarget = template.targetType?.toLowerCase();
  const targetMatches =
    !configuredTarget ||
    configuredTarget === "all" ||
    configuredTarget === "both" ||
    configuredTarget === targetType;
  if (!targetMatches || targetType !== "transaction") return targetMatches;
  const subtype = template.transactionSubtype?.toLowerCase();
  return !subtype || subtype === "all" || subtype === "any" || subtype === transactionType;
}

function groupItems(items: AppliedItem[]) {
  const groups = new Map<string, AppliedItem[]>();
  for (const item of items) {
    const section = item.sectionName?.trim() || "Checklist items";
    const existing = groups.get(section) ?? [];
    existing.push(item);
    groups.set(section, existing);
  }
  return Array.from(groups.entries());
}

function ChecklistPanelSkeleton() {
  return (
    <Card>
      <CardHeader className="space-y-3">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-2 w-full" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </CardContent>
    </Card>
  );
}

export default function ChecklistPanel({
  targetType,
  targetId,
  transactionType,
  className,
}: {
  targetType: ChecklistTargetType;
  targetId: number;
  transactionType?: "buyer" | "seller" | "dual" | null;
  className?: string;
}) {
  const utils = trpc.useUtils();
  const [applyOpen, setApplyOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
    null
  );
  const [expandedApplications, setExpandedApplications] = useState<Set<number>>(
    () => new Set()
  );
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<ItemDraft>(EMPTY_ITEM_DRAFT);
  const [addingToApplicationId, setAddingToApplicationId] = useState<
    number | null
  >(null);
  const [addDraft, setAddDraft] = useState<ItemDraft>(EMPTY_ITEM_DRAFT);
  const [applicationToRemove, setApplicationToRemove] =
    useState<ChecklistApplication | null>(null);

  const applicationsQuery = trpc.checklists.applications.list.useQuery(
    { targetType, targetId },
    { enabled: targetId > 0 }
  );
  const templatesQuery = trpc.checklists.templates.list.useQuery(
    { includeArchived: false },
    { enabled: applyOpen }
  );
  const candidatesQuery = trpc.checklists.users.candidates.useQuery(undefined, {
    enabled: applyOpen || editingItemId != null || addingToApplicationId != null,
  });

  const applications = useMemo(
    () => normalizeApplications(applicationsQuery.data),
    [applicationsQuery.data]
  );
  const templates = useMemo(
    () =>
      normalizeTemplates(templatesQuery.data).filter(template =>
        templateMatchesTarget(template, targetType, transactionType)
      ),
    [targetType, templatesQuery.data, transactionType]
  );
  const candidates = useMemo(
    () => normalizeCandidates(candidatesQuery.data),
    [candidatesQuery.data]
  );

  const allItems = applications.flatMap(application => application.items);
  const completedCount = allItems.filter(item => item.completed).length;
  const overdueCount = allItems.filter(item => dueState(item) === "overdue").length;
  const upcomingCount = allItems.filter(
    item => dueState(item) === "upcoming"
  ).length;
  const completionPercent = allItems.length
    ? Math.round((completedCount / allItems.length) * 100)
    : 0;

  const invalidateApplications = () =>
    utils.checklists.applications.list.invalidate({ targetType, targetId });

  const applyMutation = trpc.checklists.applications.applyTemplate.useMutation({
    onSuccess: () => {
      void invalidateApplications();
      setApplyOpen(false);
      setSelectedTemplateId(null);
      toast.success("Checklist applied as an independent copy");
    },
    onError: error => toast.error(error.message),
  });
  const removeApplicationMutation = trpc.checklists.applications.remove.useMutation({
    onSuccess: () => {
      void invalidateApplications();
      setApplicationToRemove(null);
      toast.success("Checklist removed");
    },
    onError: error => toast.error(error.message),
  });
  const updateItemMutation = trpc.checklists.items.update.useMutation({
    onSuccess: () => {
      void invalidateApplications();
      setEditingItemId(null);
    },
    onError: error => toast.error(error.message),
  });
  const addItemMutation = trpc.checklists.items.addItem.useMutation({
    onSuccess: () => {
      void invalidateApplications();
      setAddingToApplicationId(null);
      setAddDraft(EMPTY_ITEM_DRAFT);
      toast.success("Checklist item added");
    },
    onError: error => toast.error(error.message),
  });
  const removeItemMutation = trpc.checklists.items.removeItem.useMutation({
    onSuccess: () => {
      void invalidateApplications();
      toast.success("Checklist item removed");
    },
    onError: error => toast.error(error.message),
  });

  function startEditing(item: AppliedItem) {
    setEditingItemId(item.id);
    setEditDraft({
      title: item.title,
      notes: item.notes ?? "",
      sectionName: item.sectionName ?? "",
      dueDate: dateInputValue(item.dueDate),
      assignedUserId:
        item.assignedUserId == null ? "unassigned" : String(item.assignedUserId),
    });
  }

  function saveEditedItem(item: AppliedItem) {
    if (!editDraft.title.trim()) {
      toast.error("Item title is required");
      return;
    }
    updateItemMutation.mutate({
      id: item.id,
      data: {
        title: editDraft.title.trim(),
        notes: editDraft.notes.trim() || null,
        sectionName: editDraft.sectionName.trim() || "General",
        dueDate: dueDateApiValue(editDraft.dueDate),
        assignedUserId:
          editDraft.assignedUserId === "unassigned"
            ? null
            : Number(editDraft.assignedUserId),
      },
    });
  }

  function addItem(applicationId: number) {
    if (!addDraft.title.trim()) {
      toast.error("Item title is required");
      return;
    }
    addItemMutation.mutate({
      applicationId,
      title: addDraft.title.trim(),
      notes: addDraft.notes.trim() || null,
      sectionName: addDraft.sectionName.trim() || "General",
      dueDate: dueDateApiValue(addDraft.dueDate),
      assignedUserId:
        addDraft.assignedUserId === "unassigned"
          ? null
          : Number(addDraft.assignedUserId),
    });
  }

  function toggleApplication(applicationId: number) {
    setExpandedApplications(current => {
      const next = new Set(current);
      if (next.has(applicationId)) next.delete(applicationId);
      else next.add(applicationId);
      return next;
    });
  }

  if (applicationsQuery.isLoading) return <ChecklistPanelSkeleton />;

  if (applicationsQuery.error) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div>
            <p className="font-medium">Couldn’t load checklists</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {applicationsQuery.error.message}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => applicationsQuery.refetch()}
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4 text-primary" /> Checklists
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Applied copies can be edited without changing your library templates.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/checklists">
                Library <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button size="sm" onClick={() => setApplyOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Apply checklist
            </Button>
          </div>
        </div>
        {applications.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium">
                {completedCount} of {allItems.length} complete ({completionPercent}%)
              </span>
              <div className="flex gap-2">
                {overdueCount > 0 && (
                  <Badge variant="destructive" className="font-medium">
                    {overdueCount} overdue
                  </Badge>
                )}
                {upcomingCount > 0 && (
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-50 text-amber-800"
                  >
                    {upcomingCount} due in 7 days
                  </Badge>
                )}
              </div>
            </div>
            <Progress value={completionPercent} aria-label={`${completionPercent}% complete`} />
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {applications.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <div className="mb-3 rounded-full bg-primary/10 p-3">
              <ClipboardCheck className="h-7 w-7 text-primary" />
            </div>
            <h3 className="font-semibold">No checklists attached</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Apply a reusable checklist to keep this {targetType} moving. The
              applied checklist becomes an independent snapshot.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={() => setApplyOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Apply checklist
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/checklists">Open checklist library</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {applications.map(application => {
              const complete = application.items.filter(item => item.completed).length;
              const percent = application.items.length
                ? Math.round((complete / application.items.length) * 100)
                : 0;
              const isExpanded = expandedApplications.has(application.id);
              const groups = groupItems(application.items);
              const applicationOverdue = application.items.filter(
                item => dueState(item) === "overdue"
              ).length;
              const applicationUpcoming = application.items.filter(
                item => dueState(item) === "upcoming"
              ).length;

              return (
                <section key={application.id}>
                  <div className="flex items-start gap-2 px-4 py-4 sm:px-5">
                    <button
                      type="button"
                      onClick={() => toggleApplication(application.id)}
                      className="mt-0.5 rounded p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? "Collapse" : "Expand"} ${application.name}`}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleApplication(application.id)}
                      className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">
                          {application.name}
                        </h3>
                        {percent === 100 && application.items.length > 0 && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {complete}/{application.items.length} · {percent}%
                        </span>
                        {applicationOverdue > 0 && (
                          <span className="font-medium text-destructive">
                            {applicationOverdue} overdue
                          </span>
                        )}
                        {applicationUpcoming > 0 && (
                          <span className="font-medium text-amber-700">
                            {applicationUpcoming} upcoming
                          </span>
                        )}
                      </div>
                      <Progress value={percent} className="mt-2 h-1.5" />
                    </button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setApplicationToRemove(application)}
                      aria-label={`Remove ${application.name}`}
                      title="Remove checklist"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="border-t bg-background px-4 pb-5 pt-4 sm:px-6">
                      {groups.length === 0 ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                          This checklist has no items yet.
                        </p>
                      ) : (
                        <div className="space-y-5">
                          {groups.map(([sectionName, items]) => (
                            <div key={sectionName}>
                              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {sectionName}
                              </h4>
                              <div className="space-y-1.5">
                                {items.map(item => {
                                  const status = dueState(item);
                                  const editing = editingItemId === item.id;
                                  return (
                                    <div
                                      key={item.id}
                                      className={cn(
                                        "rounded-lg border bg-card px-3 py-2.5",
                                        status === "overdue" &&
                                          "border-destructive/30 bg-destructive/[0.025]"
                                      )}
                                    >
                                      <div className="flex items-start gap-3">
                                        <Checkbox
                                          className="mt-0.5"
                                          checked={item.completed}
                                          disabled={updateItemMutation.isPending}
                                          onCheckedChange={checked =>
                                            updateItemMutation.mutate({
                                              id: item.id,
                                              data: { completed: checked === true },
                                            })
                                          }
                                          aria-label={`${item.completed ? "Mark incomplete" : "Mark complete"}: ${item.title}`}
                                        />
                                        <div className="min-w-0 flex-1">
                                          <p
                                            className={cn(
                                              "text-sm font-medium",
                                              item.completed &&
                                                "text-muted-foreground line-through"
                                            )}
                                          >
                                            {item.title}
                                          </p>
                                          {!editing && item.notes && (
                                            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                                              {item.notes}
                                            </p>
                                          )}
                                          {!editing && (
                                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                              {item.dueDate && (
                                                <span
                                                  className={cn(
                                                    "flex items-center gap-1",
                                                    status === "overdue" &&
                                                      "font-medium text-destructive",
                                                    status === "upcoming" &&
                                                      "font-medium text-amber-700"
                                                  )}
                                                >
                                                  <CalendarClock className="h-3.5 w-3.5" />
                                                  {status === "overdue"
                                                    ? "Overdue "
                                                    : "Due "}
                                                  {displayDate(item.dueDate)}
                                                </span>
                                              )}
                                              {(item.assignedUser ||
                                                item.assignedUserId) && (
                                                <span className="flex items-center gap-1">
                                                  <UserRound className="h-3.5 w-3.5" />
                                                  {item.assignedUser?.name ??
                                                    `User #${item.assignedUserId}`}
                                                </span>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-0.5">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() =>
                                              editing
                                                ? setEditingItemId(null)
                                                : startEditing(item)
                                            }
                                            aria-label={`${editing ? "Cancel editing" : "Edit"} ${item.title}`}
                                          >
                                            {editing ? (
                                              <X className="h-3.5 w-3.5" />
                                            ) : (
                                              <Pencil className="h-3.5 w-3.5" />
                                            )}
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                            disabled={removeItemMutation.isPending}
                                            onClick={() =>
                                              removeItemMutation.mutate({ id: item.id })
                                            }
                                            aria-label={`Remove ${item.title}`}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      </div>

                                      {editing && (
                                        <div className="ml-7 mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2">
                                          <div className="sm:col-span-2">
                                            <Label htmlFor={`checklist-title-${item.id}`} className="text-xs">
                                              Item
                                            </Label>
                                            <Input
                                              id={`checklist-title-${item.id}`}
                                              className="mt-1 h-8"
                                              value={editDraft.title}
                                              onChange={event =>
                                                setEditDraft(draft => ({
                                                  ...draft,
                                                  title: event.target.value,
                                                }))
                                              }
                                            />
                                          </div>
                                          <div>
                                            <Label htmlFor={`checklist-section-${item.id}`} className="text-xs">
                                              Section
                                            </Label>
                                            <Input
                                              id={`checklist-section-${item.id}`}
                                              className="mt-1 h-8"
                                              placeholder="e.g. Before closing"
                                              value={editDraft.sectionName}
                                              onChange={event =>
                                                setEditDraft(draft => ({
                                                  ...draft,
                                                  sectionName: event.target.value,
                                                }))
                                              }
                                            />
                                          </div>
                                          <div>
                                            <Label htmlFor={`checklist-due-${item.id}`} className="text-xs">
                                              Due date
                                            </Label>
                                            <Input
                                              id={`checklist-due-${item.id}`}
                                              type="date"
                                              className="mt-1 h-8"
                                              value={editDraft.dueDate}
                                              onChange={event =>
                                                setEditDraft(draft => ({
                                                  ...draft,
                                                  dueDate: event.target.value,
                                                }))
                                              }
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs">Assignee</Label>
                                            <Select
                                              value={editDraft.assignedUserId}
                                              onValueChange={assignedUserId =>
                                                setEditDraft(draft => ({
                                                  ...draft,
                                                  assignedUserId,
                                                }))
                                              }
                                            >
                                              <SelectTrigger className="mt-1 h-8">
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="unassigned">
                                                  Unassigned
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
                                          <div className="sm:col-span-2">
                                            <Label htmlFor={`checklist-notes-${item.id}`} className="text-xs">
                                              Notes
                                            </Label>
                                            <Textarea
                                              id={`checklist-notes-${item.id}`}
                                              className="mt-1 min-h-16 resize-y text-sm"
                                              value={editDraft.notes}
                                              onChange={event =>
                                                setEditDraft(draft => ({
                                                  ...draft,
                                                  notes: event.target.value,
                                                }))
                                              }
                                            />
                                          </div>
                                          <div className="flex justify-end gap-2 sm:col-span-2">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => setEditingItemId(null)}
                                            >
                                              Cancel
                                            </Button>
                                            <Button
                                              size="sm"
                                              disabled={updateItemMutation.isPending}
                                              onClick={() => saveEditedItem(item)}
                                            >
                                              {updateItemMutation.isPending && (
                                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                              )}
                                              Save item
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {addingToApplicationId === application.id ? (
                        <div className="mt-4 rounded-lg border border-dashed bg-muted/20 p-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <Label htmlFor={`new-checklist-item-${application.id}`} className="text-xs">
                                Item title
                              </Label>
                              <Input
                                id={`new-checklist-item-${application.id}`}
                                className="mt-1 h-8"
                                autoFocus
                                value={addDraft.title}
                                onChange={event =>
                                  setAddDraft(draft => ({
                                    ...draft,
                                    title: event.target.value,
                                  }))
                                }
                                onKeyDown={event => {
                                  if (event.key === "Enter") addItem(application.id);
                                }}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Section</Label>
                              <Input
                                className="mt-1 h-8"
                                placeholder="Optional section"
                                value={addDraft.sectionName}
                                onChange={event =>
                                  setAddDraft(draft => ({
                                    ...draft,
                                    sectionName: event.target.value,
                                  }))
                                }
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Due date</Label>
                              <Input
                                type="date"
                                className="mt-1 h-8"
                                value={addDraft.dueDate}
                                onChange={event =>
                                  setAddDraft(draft => ({
                                    ...draft,
                                    dueDate: event.target.value,
                                  }))
                                }
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Assignee</Label>
                              <Select
                                value={addDraft.assignedUserId}
                                onValueChange={assignedUserId =>
                                  setAddDraft(draft => ({
                                    ...draft,
                                    assignedUserId,
                                  }))
                                }
                              >
                                <SelectTrigger className="mt-1 h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">Unassigned</SelectItem>
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
                            <div className="sm:col-span-2">
                              <Label className="text-xs">Notes</Label>
                              <Textarea
                                className="mt-1 min-h-16 resize-y text-sm"
                                value={addDraft.notes}
                                onChange={event =>
                                  setAddDraft(draft => ({
                                    ...draft,
                                    notes: event.target.value,
                                  }))
                                }
                              />
                            </div>
                          </div>
                          <div className="mt-3 flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setAddingToApplicationId(null);
                                setAddDraft(EMPTY_ITEM_DRAFT);
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              disabled={addItemMutation.isPending}
                              onClick={() => addItem(application.id)}
                            >
                              {addItemMutation.isPending && (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              )}
                              Add item
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-3 text-muted-foreground"
                          onClick={() => {
                            setAddingToApplicationId(application.id);
                            setAddDraft(EMPTY_ITEM_DRAFT);
                          }}
                        >
                          <Plus className="mr-1.5 h-4 w-4" /> Add item
                        </Button>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog
        open={applyOpen}
        onOpenChange={open => {
          setApplyOpen(open);
          if (!open) setSelectedTemplateId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Apply checklist</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            Applying creates an independent snapshot. Later template edits will not
            change this {targetType}, and edits here will not change the template.
          </div>
          {templatesQuery.isLoading ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : templatesQuery.error ? (
            <div className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
              {templatesQuery.error.message}
            </div>
          ) : templates.length === 0 ? (
            <div className="py-8 text-center">
              <ClipboardCheck className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 font-medium">No matching templates</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a {targetType} template in My Checklists first.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href="/checklists">Open library</Link>
              </Button>
            </div>
          ) : (
            <div
              className="grid gap-2 py-1"
              role="radiogroup"
              aria-label="Checklist templates"
            >
              {templates.map(template => {
                const selected = selectedTemplateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-primary bg-primary/5"
                        : "hover:border-primary/40 hover:bg-muted/30"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{template.name}</p>
                        {template.description && (
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {template.description}
                          </p>
                        )}
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {template.itemCount} items
                      </Badge>
                    </div>
                    {template.transactionSubtype && targetType === "transaction" && (
                      <p className="mt-2 text-xs capitalize text-muted-foreground">
                        {template.transactionSubtype.replace(/_/g, " ")} transactions
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!selectedTemplateId || applyMutation.isPending}
              onClick={() =>
                selectedTemplateId &&
                applyMutation.mutate({
                  templateId: selectedTemplateId,
                  targetType,
                  targetId,
                })
              }
            >
              {applyMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Apply checklist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(applicationToRemove)}
        onOpenChange={open => !open && setApplicationToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this checklist?</AlertDialogTitle>
            <AlertDialogDescription>
              “{applicationToRemove?.name}” and its current completion history will
              be removed from this {targetType}. Your library template is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeApplicationMutation.isPending}
              onClick={() =>
                applicationToRemove &&
                removeApplicationMutation.mutate({ id: applicationToRemove.id })
              }
            >
              Remove checklist
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
