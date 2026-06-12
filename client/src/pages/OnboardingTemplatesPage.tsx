import { useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, GripVertical, ClipboardList, Users, UserCheck, Calendar, LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";

export default function OnboardingTemplatesPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<{ id: number; name: string; description: string | null; type: string } | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [templateType, setTemplateType] = useState<"onboarding" | "offboarding">("onboarding");

  // Detail view state
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<{ id: number; title: string; description: string | null; assignee: string; dueDaysOffset: number | null } | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskAssignee, setTaskAssignee] = useState<"admin" | "agent">("admin");
  const [taskDueDays, setTaskDueDays] = useState("");

  // Filter
  const [typeFilter, setTypeFilter] = useState<"all" | "onboarding" | "offboarding">("all");

  const { data: templates, isLoading } = trpc.onboarding.listTemplates.useQuery();
  const { data: templateDetail } = trpc.onboarding.getTemplate.useQuery(
    { id: selectedTemplateId! },
    { enabled: !!selectedTemplateId }
  );

  const filteredTemplates = templates?.filter((t) =>
    typeFilter === "all" ? true : t.type === typeFilter
  );

  const createMut = trpc.onboarding.createTemplate.useMutation({
    onSuccess: () => {
      utils.onboarding.listTemplates.invalidate();
      setCreateOpen(false);
      setTemplateName("");
      setTemplateDesc("");
      setTemplateType("onboarding");
      toast.success("Template created");
    },
  });

  const updateMut = trpc.onboarding.updateTemplate.useMutation({
    onSuccess: () => {
      utils.onboarding.listTemplates.invalidate();
      utils.onboarding.getTemplate.invalidate();
      setEditingTemplate(null);
      toast.success("Template updated");
    },
  });

  const deleteMut = trpc.onboarding.deleteTemplate.useMutation({
    onSuccess: () => {
      utils.onboarding.listTemplates.invalidate();
      if (selectedTemplateId) setSelectedTemplateId(null);
      toast.success("Template deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const addTaskMut = trpc.onboarding.addTemplateTask.useMutation({
    onSuccess: () => {
      utils.onboarding.getTemplate.invalidate();
      utils.onboarding.listTemplates.invalidate();
      setAddTaskOpen(false);
      resetTaskForm();
      toast.success("Task added");
    },
  });

  const updateTaskMut = trpc.onboarding.updateTemplateTask.useMutation({
    onSuccess: () => {
      utils.onboarding.getTemplate.invalidate();
      setEditingTask(null);
      toast.success("Task updated");
    },
  });

  const deleteTaskMut = trpc.onboarding.deleteTemplateTask.useMutation({
    onSuccess: () => {
      utils.onboarding.getTemplate.invalidate();
      utils.onboarding.listTemplates.invalidate();
      toast.success("Task removed");
    },
  });

  function resetTaskForm() {
    setTaskTitle("");
    setTaskDesc("");
    setTaskAssignee("admin");
    setTaskDueDays("");
  }

  if (user?.role !== "admin") return null;

  return (
    <div className="space-y-6">
      <PageHeader title="On/Offboarding Lists" />

      {/* Type Filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Type:</span>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="onboarding">Onboarding</SelectItem>
            <SelectItem value="offboarding">Offboarding</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Template List ── */}
        <div className="lg:col-span-1 space-y-4">
          <Button onClick={() => { setTemplateName(""); setTemplateDesc(""); setTemplateType("onboarding"); setCreateOpen(true); }} className="w-full">
            <Plus className="h-4 w-4 mr-2" /> New Template
          </Button>

          {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

          {filteredTemplates?.map((t) => (
            <Card
              key={t.id}
              className={`cursor-pointer transition-colors hover:border-primary/50 ${selectedTemplateId === t.id ? "border-primary bg-primary/5" : ""}`}
              onClick={() => setSelectedTemplateId(t.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{t.name}</h3>
                      <Badge
                        variant="outline"
                        className={`text-xs shrink-0 ${
                          t.type === "offboarding"
                            ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {t.type === "offboarding" ? (
                          <><LogOut className="h-3 w-3 mr-1" />Offboarding</>
                        ) : (
                          <><LogIn className="h-3 w-3 mr-1" />Onboarding</>
                        )}
                      </Badge>
                    </div>
                    {t.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                    )}
                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ClipboardList className="h-3 w-3" /> {Number(t.taskCount)} tasks
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" /> {Number(t.instanceCount)} used
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTemplate({ id: t.id, name: t.name, description: t.description, type: t.type });
                        setTemplateName(t.name);
                        setTemplateDesc(t.description ?? "");
                        setTemplateType(t.type as "onboarding" | "offboarding");
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Delete this template?")) deleteMut.mutate({ id: t.id });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredTemplates && filteredTemplates.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No templates yet. Create one to get started.
            </p>
          )}
        </div>

        {/* ── Template Detail / Tasks ── */}
        <div className="lg:col-span-2">
          {!selectedTemplateId ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ClipboardList className="h-12 w-12 mb-4 opacity-50" />
                <p>Select a template to view and edit its tasks</p>
              </CardContent>
            </Card>
          ) : templateDetail ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>{templateDetail.name}</CardTitle>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        templateDetail.type === "offboarding"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                      }`}
                    >
                      {templateDetail.type === "offboarding" ? "Offboarding" : "Onboarding"}
                    </Badge>
                  </div>
                  {templateDetail.description && (
                    <p className="text-sm text-muted-foreground mt-1">{templateDetail.description}</p>
                  )}
                </div>
                <Button size="sm" onClick={() => { resetTaskForm(); setAddTaskOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Add Task
                </Button>
              </CardHeader>
              <CardContent>
                {templateDetail.tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No tasks yet. Add tasks to this template.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {templateDetail.tasks.map((task, idx) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-muted-foreground w-6">{idx + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{task.title}</span>
                            <Badge variant={task.assignee === "agent" ? "default" : "secondary"} className="text-xs shrink-0">
                              {task.assignee === "agent" ? (
                                <><UserCheck className="h-3 w-3 mr-1" /> Agent</>
                              ) : (
                                <><Users className="h-3 w-3 mr-1" /> Admin</>
                              )}
                            </Badge>
                            {task.dueDaysOffset != null && task.dueDaysOffset > 0 && (
                              <Badge variant="outline" className="text-xs shrink-0">
                                <Calendar className="h-3 w-3 mr-1" />
                                Due in {task.dueDaysOffset} day{task.dueDaysOffset !== 1 ? "s" : ""}
                              </Badge>
                            )}
                          </div>
                          {task.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingTask({
                                id: task.id,
                                title: task.title,
                                description: task.description,
                                assignee: task.assignee,
                                dueDaysOffset: task.dueDaysOffset,
                              });
                              setTaskTitle(task.title);
                              setTaskDesc(task.description ?? "");
                              setTaskAssignee(task.assignee as "admin" | "agent");
                              setTaskDueDays(task.dueDaysOffset != null ? String(task.dueDaysOffset) : "");
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => {
                              if (confirm("Remove this task?")) deleteTaskMut.mutate({ id: task.id });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">Loading...</CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── Create Template Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. New Agent Onboarding" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={templateType} onValueChange={(v) => setTemplateType(v as "onboarding" | "offboarding")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="offboarding">Offboarding</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {templateType === "offboarding"
                  ? "Use for agent departure checklists (equipment return, access revocation, etc.)"
                  : "Use for new agent setup checklists (paperwork, training, etc.)"}
              </p>
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea value={templateDesc} onChange={(e) => setTemplateDesc(e.target.value)} placeholder="What this template covers..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!templateName.trim() || createMut.isPending}
              onClick={() => createMut.mutate({ name: templateName.trim(), description: templateDesc.trim() || undefined, type: templateType })}
            >
              {createMut.isPending ? "Creating..." : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Template Dialog ── */}
      <Dialog open={!!editingTemplate} onOpenChange={() => setEditingTemplate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={templateType} onValueChange={(v) => setTemplateType(v as "onboarding" | "offboarding")}>
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
              <Textarea value={templateDesc} onChange={(e) => setTemplateDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>Cancel</Button>
            <Button
              disabled={!templateName.trim() || updateMut.isPending}
              onClick={() => editingTemplate && updateMut.mutate({ id: editingTemplate.id, name: templateName.trim(), description: templateDesc.trim() || null, type: templateType })}
            >
              {updateMut.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Task Dialog ── */}
      <Dialog open={addTaskOpen} onOpenChange={setAddTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Task Title</Label>
              <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="e.g. Complete W-9 form" />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} placeholder="Additional details..." />
            </div>
            <div>
              <Label>Assigned To</Label>
              <Select value={taskAssignee} onValueChange={(v) => setTaskAssignee(v as "admin" | "agent")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin (you complete this)</SelectItem>
                  <SelectItem value="agent">Agent (agent completes this)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {taskAssignee === "agent"
                  ? "The agent will see this task on their checklist and can mark it complete."
                  : "Only admins can mark this task as complete."}
              </p>
            </div>
            <div>
              <Label>Due Date (days after start)</Label>
              <Input
                type="number"
                min="1"
                value={taskDueDays}
                onChange={(e) => setTaskDueDays(e.target.value)}
                placeholder="e.g. 3 (leave blank for no deadline)"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {taskDueDays && Number(taskDueDays) > 0
                  ? `This task will be due ${taskDueDays} day${Number(taskDueDays) !== 1 ? "s" : ""} after the process starts.`
                  : "No deadline — this task can be completed at any time."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTaskOpen(false)}>Cancel</Button>
            <Button
              disabled={!taskTitle.trim() || addTaskMut.isPending}
              onClick={() =>
                selectedTemplateId &&
                addTaskMut.mutate({
                  templateId: selectedTemplateId,
                  title: taskTitle.trim(),
                  description: taskDesc.trim() || undefined,
                  assignee: taskAssignee,
                  dueDaysOffset: taskDueDays && Number(taskDueDays) > 0 ? Number(taskDueDays) : null,
                })
              }
            >
              {addTaskMut.isPending ? "Adding..." : "Add Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Task Dialog ── */}
      <Dialog open={!!editingTask} onOpenChange={() => setEditingTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Task Title</Label>
              <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} />
            </div>
            <div>
              <Label>Assigned To</Label>
              <Select value={taskAssignee} onValueChange={(v) => setTaskAssignee(v as "admin" | "agent")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due Date (days after start)</Label>
              <Input
                type="number"
                min="1"
                value={taskDueDays}
                onChange={(e) => setTaskDueDays(e.target.value)}
                placeholder="Leave blank for no deadline"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {taskDueDays && Number(taskDueDays) > 0
                  ? `Due ${taskDueDays} day${Number(taskDueDays) !== 1 ? "s" : ""} after the process starts.`
                  : "No deadline."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTask(null)}>Cancel</Button>
            <Button
              disabled={!taskTitle.trim() || updateTaskMut.isPending}
              onClick={() =>
                editingTask &&
                updateTaskMut.mutate({
                  id: editingTask.id,
                  title: taskTitle.trim(),
                  description: taskDesc.trim() || null,
                  assignee: taskAssignee,
                  dueDaysOffset: taskDueDays && Number(taskDueDays) > 0 ? Number(taskDueDays) : null,
                })
              }
            >
              {updateTaskMut.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
