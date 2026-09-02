import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Calendar,
  ClipboardList,
  GripVertical,
  Layers3,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";

type TemplateStage = { id: number; name: string; sortOrder: number };
type TemplateTask = {
  id: number;
  title: string;
  description: string | null;
  assignee: "admin" | "agent";
  adminUserId: number | null;
  stageId: number | null;
  dueDaysOffset: number | null;
  sortOrder: number;
};

export default function OnboardingTemplatesPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<{
    id: number;
    name: string;
    description: string | null;
    type: string;
  } | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [templateType, setTemplateType] = useState<
    "onboarding" | "offboarding"
  >("onboarding");

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
    null
  );
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TemplateTask | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<TemplateTask | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskAssignee, setTaskAssignee] = useState<"admin" | "agent">("admin");
  const [taskAdminUserId, setTaskAdminUserId] = useState("");
  const [taskDueDays, setTaskDueDays] = useState("");
  const [taskStageId, setTaskStageId] = useState("unassigned");

  const [addStageOpen, setAddStageOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<TemplateStage | null>(null);
  const [stageToDelete, setStageToDelete] = useState<TemplateStage | null>(
    null
  );
  const [stageName, setStageName] = useState("");
  const [typeFilter, setTypeFilter] = useState<
    "all" | "onboarding" | "offboarding"
  >("all");

  const { data: templates, isLoading } =
    trpc.onboarding.listTemplates.useQuery();
  const { data: adminUsers } = trpc.users.list.useQuery(
    { role: "admin" },
    { enabled: user?.role === "admin" }
  );
  const { data: templateDetail } = trpc.onboarding.getTemplate.useQuery(
    { id: selectedTemplateId! },
    { enabled: Boolean(selectedTemplateId) }
  );

  const activeAdminUsers = (adminUsers ?? []).filter(
    (admin: any) => admin.isActive !== false
  );
  const adminNameById = new Map(
    activeAdminUsers.map((admin: any) => [
      admin.id,
      admin.name ?? admin.email ?? `Admin #${admin.id}`,
    ])
  );
  const filteredTemplates = templates?.filter(
    template => typeFilter === "all" || template.type === typeFilter
  );
  const stages = (templateDetail?.stages ?? []) as TemplateStage[];
  const tasks = (templateDetail?.tasks ?? []) as TemplateTask[];
  const groupedTasks = useMemo<
    Array<{
      key: string;
      label: string;
      stage: TemplateStage | null;
      tasks: TemplateTask[];
    }>
  >(() => {
    const groups: Array<{
      key: string;
      label: string;
      stage: TemplateStage | null;
      tasks: TemplateTask[];
    }> = stages.map(stage => ({
      key: `stage-${stage.id}`,
      label: stage.name,
      stage,
      tasks: tasks.filter(task => task.stageId === stage.id),
    }));
    const unassignedTasks = tasks.filter(task => task.stageId == null);
    if (unassignedTasks.length > 0) {
      groups.push({
        key: "unassigned",
        label: "Unassigned tasks",
        stage: null,
        tasks: unassignedTasks,
      });
    }
    return groups;
  }, [stages, tasks]);

  const invalidateTemplates = () => {
    void utils.onboarding.listTemplates.invalidate();
    void utils.onboarding.getTemplate.invalidate();
  };

  const createMut = trpc.onboarding.createTemplate.useMutation({
    onSuccess: result => {
      void utils.onboarding.listTemplates.invalidate();
      setCreateOpen(false);
      setTemplateName("");
      setTemplateDesc("");
      setTemplateType("onboarding");
      setSelectedTemplateId(result.id);
      toast.success("Template created");
    },
    onError: error => toast.error(error.message),
  });
  const updateMut = trpc.onboarding.updateTemplate.useMutation({
    onSuccess: () => {
      invalidateTemplates();
      setEditingTemplate(null);
      toast.success("Template updated");
    },
    onError: error => toast.error(error.message),
  });
  const deleteMut = trpc.onboarding.deleteTemplate.useMutation({
    onSuccess: () => {
      void utils.onboarding.listTemplates.invalidate();
      setSelectedTemplateId(null);
      toast.success("Template deleted");
    },
    onError: error => toast.error(error.message),
  });
  const addTaskMut = trpc.onboarding.addTemplateTask.useMutation({
    onSuccess: () => {
      invalidateTemplates();
      setAddTaskOpen(false);
      resetTaskForm();
      toast.success("Task added");
    },
    onError: error => toast.error(error.message),
  });
  const updateTaskMut = trpc.onboarding.updateTemplateTask.useMutation({
    onSuccess: () => {
      invalidateTemplates();
      setEditingTask(null);
      toast.success("Task updated");
    },
    onError: error => toast.error(error.message),
  });
  const deleteTaskMut = trpc.onboarding.deleteTemplateTask.useMutation({
    onSuccess: () => {
      invalidateTemplates();
      setTaskToDelete(null);
      toast.success("Task removed from template");
    },
    onError: error => toast.error(error.message),
  });
  const createStageMut = trpc.onboarding.createTemplateStage.useMutation({
    onSuccess: () => {
      invalidateTemplates();
      setAddStageOpen(false);
      setStageName("");
      toast.success("Stage added");
    },
    onError: error => toast.error(error.message),
  });
  const updateStageMut = trpc.onboarding.updateTemplateStage.useMutation({
    onSuccess: () => {
      invalidateTemplates();
      setEditingStage(null);
      setStageName("");
      toast.success("Stage updated");
    },
    onError: error => toast.error(error.message),
  });
  const deleteStageMut = trpc.onboarding.deleteTemplateStage.useMutation({
    onSuccess: () => {
      invalidateTemplates();
      setStageToDelete(null);
      toast.success("Stage removed; its tasks are now unassigned");
    },
    onError: error => toast.error(error.message),
  });

  function resetTaskForm() {
    setTaskTitle("");
    setTaskDesc("");
    setTaskAssignee("admin");
    setTaskAdminUserId("");
    setTaskDueDays("");
    setTaskStageId("unassigned");
  }

  function openTaskEditor(task: TemplateTask) {
    setEditingTask(task);
    setTaskTitle(task.title);
    setTaskDesc(task.description ?? "");
    setTaskAssignee(task.assignee);
    setTaskAdminUserId(task.adminUserId ? String(task.adminUserId) : "");
    setTaskDueDays(
      task.dueDaysOffset != null ? String(task.dueDaysOffset) : ""
    );
    setTaskStageId(task.stageId ? String(task.stageId) : "unassigned");
  }

  function taskPayload() {
    return {
      title: taskTitle.trim(),
      description: taskDesc.trim() || null,
      assignee: taskAssignee,
      adminUserId: taskAssignee === "admin" ? Number(taskAdminUserId) : null,
      stageId: taskStageId === "unassigned" ? null : Number(taskStageId),
      dueDaysOffset:
        taskDueDays && Number(taskDueDays) > 0 ? Number(taskDueDays) : null,
    };
  }

  if (user?.role !== "admin") return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="On/Offboarding Lists"
        subtitle="Build staged checklists, assign ownership, and keep new launches consistent."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="text-sm text-muted-foreground">Type:</span>
        <Select
          value={typeFilter}
          onValueChange={value => setTypeFilter(value as typeof typeFilter)}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="onboarding">Onboarding</SelectItem>
            <SelectItem value="offboarding">Offboarding</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <Button
            onClick={() => {
              setTemplateName("");
              setTemplateDesc("");
              setTemplateType("onboarding");
              setCreateOpen(true);
            }}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" /> New Template
          </Button>
          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}
          {filteredTemplates?.map(template => (
            <Card
              key={template.id}
              className={`cursor-pointer transition-colors hover:border-primary/50 ${selectedTemplateId === template.id ? "border-primary bg-primary/5" : ""}`}
              onClick={() => setSelectedTemplateId(template.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold">
                        {template.name}
                      </h3>
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-xs ${template.type === "offboarding" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
                      >
                        {template.type === "offboarding" ? (
                          <>
                            <LogOut className="mr-1 h-3 w-3" />
                            Offboarding
                          </>
                        ) : (
                          <>
                            <LogIn className="mr-1 h-3 w-3" />
                            Onboarding
                          </>
                        )}
                      </Badge>
                    </div>
                    {template.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {template.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ClipboardList className="h-3 w-3" />
                        {Number(template.taskCount)} tasks
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {Number(template.instanceCount)} used
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Edit ${template.name}`}
                      onClick={event => {
                        event.stopPropagation();
                        setEditingTemplate(template);
                        setTemplateName(template.name);
                        setTemplateDesc(template.description ?? "");
                        setTemplateType(
                          template.type as "onboarding" | "offboarding"
                        );
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      aria-label={`Delete ${template.name}`}
                      onClick={event => {
                        event.stopPropagation();
                        if (
                          window.confirm(
                            "Delete this template? Templates that have been launched cannot be deleted."
                          )
                        )
                          deleteMut.mutate({ id: template.id });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredTemplates?.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No templates yet. Create one to get started.
            </p>
          )}
        </div>

        <div className="lg:col-span-2">
          {!selectedTemplateId ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ClipboardList className="mb-4 h-12 w-12 opacity-50" />
                <p>Select a template to build its staged checklist.</p>
              </CardContent>
            </Card>
          ) : templateDetail ? (
            <Card>
              <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{templateDetail.name}</CardTitle>
                    <Badge
                      variant="outline"
                      className={
                        templateDetail.type === "offboarding"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }
                    >
                      {templateDetail.type === "offboarding"
                        ? "Offboarding"
                        : "Onboarding"}
                    </Badge>
                  </div>
                  {templateDetail.description && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {templateDetail.description}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setStageName("");
                      setAddStageOpen(true);
                    }}
                  >
                    <Layers3 className="mr-1 h-4 w-4" /> Add Stage
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      resetTaskForm();
                      setAddTaskOpen(true);
                    }}
                  >
                    <Plus className="mr-1 h-4 w-4" /> Add Task
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Layers3 className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold">Stages</p>
                    <span className="text-xs text-muted-foreground">
                      Use stages as headers to group tasks.
                    </span>
                  </div>
                  {stages.length ? (
                    <div className="flex flex-wrap gap-2">
                      {stages.map(stage => (
                        <div
                          key={stage.id}
                          className="flex items-center gap-1 rounded-md border bg-background py-1 pl-2 pr-1 text-sm"
                        >
                          <span>{stage.name}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            aria-label={`Edit ${stage.name} stage`}
                            onClick={() => {
                              setEditingStage(stage);
                              setStageName(stage.name);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive"
                            aria-label={`Remove ${stage.name} stage`}
                            onClick={() => setStageToDelete(stage)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No stages yet. Add one to create a header for a group of
                      tasks.
                    </p>
                  )}
                </div>

                {tasks.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No tasks yet. Add tasks to this template.
                  </p>
                ) : (
                  groupedTasks.map(group => (
                    <section key={group.key} className="space-y-2">
                      <div className="flex items-center gap-2 border-b pb-2">
                        <Layers3 className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold">{group.label}</h3>
                        <Badge variant="secondary" className="text-xs">
                          {group.tasks.length}
                        </Badge>
                      </div>
                      {group.tasks.length === 0 ? (
                        <p className="px-1 py-2 text-xs text-muted-foreground">
                          No tasks in this stage yet.
                        </p>
                      ) : (
                        group.tasks.map((task, taskIndex) => (
                          <div
                            key={task.id}
                            className="flex flex-col gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50 sm:flex-row sm:items-center"
                          >
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="w-5 shrink-0 text-sm font-medium text-muted-foreground">
                                {taskIndex + 1}.
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">
                                    {task.title}
                                  </span>
                                  <Badge
                                    variant={
                                      task.assignee === "agent"
                                        ? "default"
                                        : "secondary"
                                    }
                                    className="text-xs"
                                  >
                                    {task.assignee === "agent" ? (
                                      <>
                                        <UserCheck className="mr-1 h-3 w-3" />
                                        Agent
                                      </>
                                    ) : (
                                      <>
                                        <Users className="mr-1 h-3 w-3" />
                                        {task.adminUserId
                                          ? (adminNameById.get(
                                              task.adminUserId
                                            ) ?? `Admin #${task.adminUserId}`)
                                          : "Admin"}
                                      </>
                                    )}
                                  </Badge>
                                  {task.dueDaysOffset != null && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      <Calendar className="mr-1 h-3 w-3" />
                                      Due in {task.dueDaysOffset} day
                                      {task.dueDaysOffset === 1 ? "" : "s"}
                                    </Badge>
                                  )}
                                </div>
                                {task.description && (
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {task.description}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex shrink-0 justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={`Edit ${task.title}`}
                                onClick={() => openTaskEditor(task)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                aria-label={`Remove ${task.title}`}
                                onClick={() => setTaskToDelete(task)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </section>
                  ))
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Loading...
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input
                value={templateName}
                onChange={event => setTemplateName(event.target.value)}
                placeholder="e.g. New Agent Onboarding"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={templateType}
                onValueChange={value =>
                  setTemplateType(value as "onboarding" | "offboarding")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="offboarding">Offboarding</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                value={templateDesc}
                onChange={event => setTemplateDesc(event.target.value)}
                placeholder="What this template covers..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!templateName.trim() || createMut.isPending}
              onClick={() =>
                createMut.mutate({
                  name: templateName.trim(),
                  description: templateDesc.trim() || undefined,
                  type: templateType,
                })
              }
            >
              {createMut.isPending ? "Creating..." : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingTemplate)}
        onOpenChange={open => !open && setEditingTemplate(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input
                value={templateName}
                onChange={event => setTemplateName(event.target.value)}
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={templateType}
                onValueChange={value =>
                  setTemplateType(value as "onboarding" | "offboarding")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="offboarding">Offboarding</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={templateDesc}
                onChange={event => setTemplateDesc(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>
              Cancel
            </Button>
            <Button
              disabled={!templateName.trim() || updateMut.isPending}
              onClick={() =>
                editingTemplate &&
                updateMut.mutate({
                  id: editingTemplate.id,
                  name: templateName.trim(),
                  description: templateDesc.trim() || null,
                  type: templateType,
                })
              }
            >
              {updateMut.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addStageOpen} onOpenChange={setAddStageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Stage</DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="stage-name">Stage name</Label>
            <Input
              id="stage-name"
              value={stageName}
              onChange={event => setStageName(event.target.value)}
              placeholder="e.g. Getting Started"
              onKeyDown={event => {
                if (
                  event.key === "Enter" &&
                  stageName.trim() &&
                  selectedTemplateId
                )
                  createStageMut.mutate({
                    templateId: selectedTemplateId,
                    name: stageName.trim(),
                  });
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStageOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!stageName.trim() || createStageMut.isPending}
              onClick={() =>
                selectedTemplateId &&
                createStageMut.mutate({
                  templateId: selectedTemplateId,
                  name: stageName.trim(),
                })
              }
            >
              {createStageMut.isPending ? "Adding..." : "Add Stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingStage)}
        onOpenChange={open => !open && setEditingStage(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Stage</DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="edit-stage-name">Stage name</Label>
            <Input
              id="edit-stage-name"
              value={stageName}
              onChange={event => setStageName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStage(null)}>
              Cancel
            </Button>
            <Button
              disabled={!stageName.trim() || updateStageMut.isPending}
              onClick={() =>
                editingStage &&
                updateStageMut.mutate({
                  id: editingStage.id,
                  name: stageName.trim(),
                })
              }
            >
              {updateStageMut.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskDialog
        title="Add Task"
        open={addTaskOpen}
        onOpenChange={setAddTaskOpen}
        taskTitle={taskTitle}
        setTaskTitle={setTaskTitle}
        taskDesc={taskDesc}
        setTaskDesc={setTaskDesc}
        taskAssignee={taskAssignee}
        setTaskAssignee={setTaskAssignee}
        taskAdminUserId={taskAdminUserId}
        setTaskAdminUserId={setTaskAdminUserId}
        taskDueDays={taskDueDays}
        setTaskDueDays={setTaskDueDays}
        taskStageId={taskStageId}
        setTaskStageId={setTaskStageId}
        stages={stages}
        adminUsers={activeAdminUsers}
        pending={addTaskMut.isPending}
        submitLabel="Add Task"
        onSubmit={() =>
          selectedTemplateId &&
          addTaskMut.mutate({
            templateId: selectedTemplateId,
            ...taskPayload(),
            description: taskDesc.trim() || undefined,
          })
        }
      />
      <TaskDialog
        title="Edit Task"
        open={Boolean(editingTask)}
        onOpenChange={open => !open && setEditingTask(null)}
        taskTitle={taskTitle}
        setTaskTitle={setTaskTitle}
        taskDesc={taskDesc}
        setTaskDesc={setTaskDesc}
        taskAssignee={taskAssignee}
        setTaskAssignee={setTaskAssignee}
        taskAdminUserId={taskAdminUserId}
        setTaskAdminUserId={setTaskAdminUserId}
        taskDueDays={taskDueDays}
        setTaskDueDays={setTaskDueDays}
        taskStageId={taskStageId}
        setTaskStageId={setTaskStageId}
        stages={stages}
        adminUsers={activeAdminUsers}
        pending={updateTaskMut.isPending}
        submitLabel="Save Changes"
        onSubmit={() =>
          editingTask &&
          updateTaskMut.mutate({ id: editingTask.id, ...taskPayload() })
        }
      />

      <AlertDialog
        open={Boolean(taskToDelete)}
        onOpenChange={open =>
          !open && !deleteTaskMut.isPending && setTaskToDelete(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove template task?</AlertDialogTitle>
            <AlertDialogDescription>
              {taskToDelete
                ? `“${taskToDelete.title}” will be removed from this template. Checklists already launched will keep their copied task.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTaskMut.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteTaskMut.isPending}
              onClick={event => {
                event.preventDefault();
                if (taskToDelete) deleteTaskMut.mutate({ id: taskToDelete.id });
              }}
            >
              {deleteTaskMut.isPending ? "Removing..." : "Remove Task"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(stageToDelete)}
        onOpenChange={open =>
          !open && !deleteStageMut.isPending && setStageToDelete(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove stage?</AlertDialogTitle>
            <AlertDialogDescription>
              {stageToDelete
                ? `“${stageToDelete.name}” will be removed. Its template tasks will remain and become unassigned.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteStageMut.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteStageMut.isPending}
              onClick={event => {
                event.preventDefault();
                if (stageToDelete)
                  deleteStageMut.mutate({ id: stageToDelete.id });
              }}
            >
              {deleteStageMut.isPending ? "Removing..." : "Remove Stage"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TaskDialog({
  title,
  open,
  onOpenChange,
  taskTitle,
  setTaskTitle,
  taskDesc,
  setTaskDesc,
  taskAssignee,
  setTaskAssignee,
  taskAdminUserId,
  setTaskAdminUserId,
  taskDueDays,
  setTaskDueDays,
  taskStageId,
  setTaskStageId,
  stages,
  adminUsers,
  pending,
  submitLabel,
  onSubmit,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string;
  setTaskTitle: (value: string) => void;
  taskDesc: string;
  setTaskDesc: (value: string) => void;
  taskAssignee: "admin" | "agent";
  setTaskAssignee: (value: "admin" | "agent") => void;
  taskAdminUserId: string;
  setTaskAdminUserId: (value: string) => void;
  taskDueDays: string;
  setTaskDueDays: (value: string) => void;
  taskStageId: string;
  setTaskStageId: (value: string) => void;
  stages: TemplateStage[];
  adminUsers: any[];
  pending: boolean;
  submitLabel: string;
  onSubmit: () => void;
}) {
  const needsAdmin = taskAssignee === "admin";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Task Title</Label>
            <Input
              value={taskTitle}
              onChange={event => setTaskTitle(event.target.value)}
              placeholder="e.g. Complete W-9 form"
            />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea
              value={taskDesc}
              onChange={event => setTaskDesc(event.target.value)}
              placeholder="Additional details..."
            />
          </div>
          <div>
            <Label>Stage</Label>
            <Select value={taskStageId} onValueChange={setTaskStageId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">
                  No stage / unassigned
                </SelectItem>
                {stages.map(stage => (
                  <SelectItem key={stage.id} value={String(stage.id)}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Stages display as headers that group related tasks.
            </p>
          </div>
          <div>
            <Label>Assigned To</Label>
            <Select
              value={taskAssignee}
              onValueChange={value => {
                const assignee = value as "admin" | "agent";
                setTaskAssignee(assignee);
                if (assignee === "agent") setTaskAdminUserId("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin (select recipient)</SelectItem>
                <SelectItem value="agent">
                  Agent (agent completes this)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {needsAdmin && (
            <div>
              <Label>Admin User *</Label>
              <SearchableSelect
                className="mt-1 w-full"
                options={adminUsers.map((admin: any) => ({
                  value: String(admin.id),
                  label: admin.name ?? admin.email ?? `Admin #${admin.id}`,
                }))}
                value={taskAdminUserId}
                onValueChange={setTaskAdminUserId}
                placeholder="Select an admin…"
                searchPlaceholder="Search admins…"
              />
            </div>
          )}
          <div>
            <Label>Due Date (days after start)</Label>
            <Input
              type="number"
              min="1"
              value={taskDueDays}
              onChange={event => setTaskDueDays(event.target.value)}
              placeholder="e.g. 3 (leave blank for no deadline)"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {taskDueDays && Number(taskDueDays) > 0
                ? `This task will be due ${taskDueDays} day${Number(taskDueDays) === 1 ? "" : "s"} after the process starts.`
                : "No deadline — this task can be completed at any time."}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              !taskTitle.trim() || pending || (needsAdmin && !taskAdminUserId)
            }
            onClick={onSubmit}
          >
            {pending ? "Saving..." : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
