import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowRight, CheckCircle2, ClipboardList, GitBranch,
  Phone, PhoneCall, Users, Calendar, Star, UserPlus, Edit2,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { IsaStatusBadge, PIPELINE_STAGE_OPTIONS } from "@/components/StatusBadge";
import { safeFormat } from "@/lib/safeFormat";

function StatCard({ title, value, icon: Icon, subtitle, color = "primary" }: {
  title: string; value: string | number; icon: React.ElementType;
  subtitle?: string; color?: "primary" | "green" | "amber" | "purple";
}) {
  const colorMap = {
    primary: "text-primary bg-primary/10",
    green: "text-emerald-600 bg-emerald-50",
    amber: "text-amber-600 bg-amber-50",
    purple: "text-purple-600 bg-purple-50",
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={`p-2.5 rounded-lg ${colorMap[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const PIPELINE_STATUS_COLORS: Record<string, string> = {
  new_lead: "bg-blue-100 text-blue-700",
  attempted_contact: "bg-yellow-100 text-yellow-700",
  nurture: "bg-orange-100 text-orange-700",
  active_client: "bg-green-100 text-green-700",
  under_contract: "bg-indigo-100 text-indigo-700",
  closed: "bg-emerald-100 text-emerald-700",
  dead: "bg-red-100 text-red-700",
};

const PIPELINE_STAGES = [
  { value: "new_lead", label: "New Lead" },
  { value: "attempted_contact", label: "Attempted Contact" },
  { value: "nurture", label: "Nurture" },
  { value: "active_client", label: "Active Client" },
  { value: "under_contract", label: "Under Contract" },
  { value: "closed", label: "Closed" },
  { value: "dead", label: "Dead" },
];

export default function ISADashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");
  const [isaStatusFilter, setIsaStatusFilter] = useState<string>("all");

  // Task edit state
  const [editTaskOpen, setEditTaskOpen] = useState(false);
  const [editTask, setEditTask] = useState<any>(null);
  const [editTaskForm, setEditTaskForm] = useState({ status: "", dueDate: "", priority: "", description: "" });

  const { data: allContactsData } = trpc.contacts.list.useQuery({ limit: 100 });
  const allContacts = allContactsData?.rows ?? [];
  const { data: myTasksData } = trpc.tasks.list.useQuery({ status: "pending", limit: 100 });
  const myTasks = myTasksData?.rows ?? [];
  const { data: teamMembers } = trpc.users.list.useQuery({});
  const agents = (teamMembers ?? []).filter((u) => u.role === "agent");

  const { data: pipelineData } = trpc.agentConnections.list.useQuery(
    selectedAgentId !== "all" ? { agentId: parseInt(selectedAgentId), limit: 200 } : { limit: 200 }
  );
  const pipeline = pipelineData?.rows;

  const utils = trpc.useUtils();
  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => { toast.success("Task updated"); setEditTaskOpen(false); utils.tasks.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const openTaskEdit = (task: any) => {
    setEditTask(task);
    setEditTaskForm({
      status: task.status ?? "pending",
      dueDate: task.dueDate ? safeFormat(task.dueDate, "yyyy-MM-dd") : "",
      priority: task.priority ?? "medium",
      description: task.description ?? "",
    });
    setEditTaskOpen(true);
  };

  const myContacts = (allContacts ?? []).filter(
    (c) => c.contact.assignedIsaId === (user as any)?.id &&
      (isaStatusFilter === "all" || (c.contact as any).isaStatus === isaStatusFilter)
  );
  const allLeadsCount = allContacts?.length ?? 0;
  const myLeadsCount = myContacts.length;
  const pendingTaskCount = myTasks?.length ?? 0;
  const activeClientCount = (pipeline ?? []).filter(
    (p) => p.connection.pipelineStatus === "active_client"
  ).length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {greeting}, {user?.name?.split(" ")[0] ?? "ISA"} 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Your lead queue and agent pipelines — let's make some calls.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => navigate("/contacts/new")}>
            <UserPlus className="h-4 w-4 mr-2" />
            New Lead
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/contacts")}>
            <Users className="h-4 w-4 mr-2" />
            All Contacts
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="All Leads" value={allLeadsCount} icon={Users} subtitle="In brokerage CRM" />
        <StatCard title="My Assigned" value={myLeadsCount} icon={PhoneCall} subtitle="Leads assigned to me" color="purple" />
        <StatCard title="Active Clients" value={activeClientCount} icon={Star} subtitle="Across all agents" color="amber" />
        <StatCard title="My Tasks" value={pendingTaskCount} icon={ClipboardList} subtitle="Pending follow-ups" color="green" />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Pipeline View */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  Agent Pipeline
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <SelectValue placeholder="Filter by agent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Agents</SelectItem>
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.name ?? `Agent #${a.id}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => navigate("/pipeline")}>
                    Full view <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!pipeline || (pipeline as any[]).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No pipeline entries found.</p>
                  <p className="text-xs mt-1">
                    {selectedAgentId !== "all"
                      ? "This agent has no pipeline entries yet."
                      : "Click 'New Lead' to add a contact to an agent's pipeline."}
                  </p>
                </div>
              ) : (
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {pipeline.slice(0, 20).map(({ connection, contact, agent, leadSource, parentLeadSource }) => (
                    <div
                      key={connection.id}
                      className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/contacts/${connection.contactId}`)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {contact?.firstName} {contact?.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          Agent: {agent?.name ?? "Unassigned"}
                        </p>
                        {leadSource?.name && (
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {parentLeadSource?.name && (
                              <>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground font-medium whitespace-nowrap">
                                  {parentLeadSource.name}
                                </span>
                                <span className="text-muted-foreground text-[10px]">›</span>
                              </>
                            )}
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary font-semibold whitespace-nowrap">
                              {leadSource.name}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                        PIPELINE_STATUS_COLORS[connection.pipelineStatus ?? "new_lead"] ?? "bg-gray-100 text-gray-600"
                      }`}>
                        {(connection.pipelineStatus ?? "new_lead").replace(/_/g, " ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* My Assigned Leads */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" />
                  My Assigned Leads
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={isaStatusFilter} onValueChange={setIsaStatusFilter}>
                    <SelectTrigger className="h-7 text-xs w-40">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {PIPELINE_STAGE_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button onClick={() => navigate("/contacts")} className="text-xs text-primary hover:underline">
                    View all
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {myContacts.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Users className="h-7 w-7 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No leads assigned to you yet.</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {myContacts.slice(0, 10).map(({ contact }) => (
                    <div
                      key={contact.id}
                      className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/contacts/${contact.id}`)}
                    >
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-xs font-semibold text-purple-700 shrink-0">
                        {contact.firstName?.[0]}{contact.lastName?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {contact.firstName} {contact.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {contact.phone ?? contact.email ?? "No contact info"}
                        </p>
                        {((contact as any).leadSource?.name || (contact as any).leadSourceType) && (
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {(contact as any).leadSource?.parentName && (
                              <>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground font-medium whitespace-nowrap">
                                  {(contact as any).leadSource.parentName}
                                </span>
                                <span className="text-muted-foreground text-[10px]">›</span>
                              </>
                            )}
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary font-semibold whitespace-nowrap">
                              {(contact as any).leadSource?.name || (contact as any).leadSourceType?.replace(/_/g, ' ')}
                            </span>
                          </div>
                        )}
                      </div>
                      <IsaStatusBadge status={(contact as any).isaStatus} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Tasks + Quick Actions */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  My Pending Tasks
                </CardTitle>
                <button onClick={() => navigate("/tasks")} className="text-xs text-primary hover:underline">
                  View all
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!myTasks || myTasks.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <CheckCircle2 className="h-7 w-7 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">All caught up!</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {myTasks.slice(0, 8).map(({ task, assignedTo, contact }) => (
                    <div
                      key={task.id}
                      className="flex items-start gap-2 p-2.5 rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate("/tasks")}>
                        <p className="text-xs font-medium text-foreground truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {task.dueDate && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {safeFormat(task.dueDate, "MMM d, yyyy")}
                            </p>
                          )}
                          {assignedTo && (
                            <span className="text-xs text-muted-foreground">· {assignedTo.name}</span>
                          )}
                          {contact && (
                            <span className="text-xs text-muted-foreground">· {(contact as any).firstName} {(contact as any).lastName}</span>
                          )}
                          {task.createdAt && (
                            <span className="text-xs text-muted-foreground">· Created {safeFormat(task.createdAt, "MMM d h:mm a")}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); openTaskEdit(task); }} className="p-1 rounded hover:bg-muted">
                          <Edit2 className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                        </button>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          task.priority === "urgent" ? "bg-red-100 text-red-700"
                          : task.priority === "high" ? "bg-orange-100 text-orange-700"
                          : "bg-gray-100 text-gray-600"
                        }`}>
                          {task.priority}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              {[
                { label: "Add New Lead", action: () => navigate("/contacts/new") },
                { label: "View All Contacts", action: () => navigate("/contacts") },
                { label: "Agent Pipelines", action: () => navigate("/pipeline") },
                { label: "My Tasks", action: () => navigate("/tasks") },
              ].map(({ label, action }) => (
                <button
                  key={label}
                  onClick={action}
                  className="w-full text-left text-sm text-foreground hover:text-primary hover:bg-muted/50 px-2 py-1.5 rounded flex items-center justify-between group"
                >
                  {label}
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Task Edit Dialog */}
      <Dialog open={editTaskOpen} onOpenChange={setEditTaskOpen}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
          <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Status</Label>
              <Select value={editTaskForm.status} onValueChange={(v) => setEditTaskForm({ ...editTaskForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["pending","in_progress","completed","cancelled"].map((s) => (
                    <SelectItem key={s} value={s}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={editTaskForm.dueDate} onChange={(e) => setEditTaskForm({ ...editTaskForm, dueDate: e.target.value })} />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={editTaskForm.priority} onValueChange={(v) => setEditTaskForm({ ...editTaskForm, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["low","medium","high","urgent"].map((p) => (
                    <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={3} value={editTaskForm.description} onChange={(e) => setEditTaskForm({ ...editTaskForm, description: e.target.value })} placeholder="Task notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTaskOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!editTask) return;
              updateTask.mutate({
                id: editTask.id,
                data: {
                  status: editTaskForm.status as any,
                  dueDate: editTaskForm.dueDate ? new Date(editTaskForm.dueDate).toISOString() : null,
                  priority: editTaskForm.priority as any,
                  description: editTaskForm.description || null,
                },
              });
            }} disabled={updateTask.isPending}>
              {updateTask.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
