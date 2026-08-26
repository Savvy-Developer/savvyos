import { useMemo, useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Copy, ExternalLink, Link2, Loader2, Plus, RefreshCw, Settings2, Users, Video } from "lucide-react";

const ET_TIMEZONE = "America/New_York";

type WebinarListItem = any;
type TemplateTask = any;

function toDateTimeLocal(value: Date | string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function statusBadge(status: string) {
  const classes: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-800 border-blue-200",
    live: "bg-emerald-100 text-emerald-800 border-emerald-200",
    ended: "bg-slate-100 text-slate-700 border-slate-200",
    cancelled: "bg-rose-100 text-rose-800 border-rose-200",
    approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
    registered: "bg-blue-100 text-blue-800 border-blue-200",
    attended: "bg-violet-100 text-violet-800 border-violet-200",
    cancelled_attendee: "bg-rose-100 text-rose-800 border-rose-200",
  };
  return <Badge variant="outline" className={classes[status] ?? "bg-slate-100 text-slate-700"}>{status.replace(/_/g, " ")}</Badge>;
}

function offsetLabel(offset: number) {
  if (offset === 0) return "Event day";
  return offset < 0 ? `${Math.abs(offset)} day${Math.abs(offset) === 1 ? "" : "s"} before` : `${offset} day${offset === 1 ? "" : "s"} after`;
}

function copyText(value: string | null | undefined, successMessage = "Copied to clipboard") {
  if (!value) return;
  navigator.clipboard.writeText(value).then(() => toast.success(successMessage)).catch(() => toast.error("Could not copy the link"));
}

function WebinarCreateDialog({ open, onOpenChange, templates }: { open: boolean; onOpenChange: (open: boolean) => void; templates: any[] }) {
  const utils = trpc.useUtils();
  const createMutation = trpc.webinars.create.useMutation({
    onSuccess: async (result) => {
      await utils.webinars.list.invalidate();
      toast.success(`Webinar created with ${result.generatedTasks} marketing task${result.generatedTasks === 1 ? "" : "s"}.`);
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [approval, setApproval] = useState<"automatically" | "manually" | "no_registration">("automatically");
  const [templateId, setTemplateId] = useState("none");

  function submit() {
    if (!title.trim() || !startTime) {
      toast.error("Enter a webinar title and start date/time.");
      return;
    }
    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || null,
      startTime: new Date(startTime).toISOString(),
      durationMinutes: Number(durationMinutes) || 60,
      timezone: ET_TIMEZONE,
      registrationApproval: approval,
      marketingTemplateId: templateId === "none" ? null : Number(templateId),
    });
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Create Webinar</DialogTitle>
        <DialogDescription>Publishing creates the Zoom webinar, returns a shareable registration link, and automatically materializes the selected marketing tasks.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-2 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2"><Label htmlFor="webinar-title">Title</Label><Input id="webinar-title" placeholder="e.g., How to Evaluate a Short-Term Rental Market" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
        <div className="space-y-2 md:col-span-2"><Label htmlFor="webinar-description">Description</Label><Textarea id="webinar-description" placeholder="The Zoom webinar agenda and promotional summary." value={description} onChange={(event) => setDescription(event.target.value)} rows={4} /></div>
        <div className="space-y-2"><Label htmlFor="webinar-start">Start date and time</Label><Input id="webinar-start" type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="webinar-duration">Duration (minutes)</Label><Input id="webinar-duration" type="number" min={15} max={480} value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} /></div>
        <div className="space-y-2"><Label>Registration approval</Label><Select value={approval} onValueChange={(value) => setApproval(value as typeof approval)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="automatically">Approve registrations automatically</SelectItem><SelectItem value="manually">Approve registrations manually</SelectItem><SelectItem value="no_registration">No registration required</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label>Marketing task template</Label><Select value={templateId} onValueChange={setTemplateId}><SelectTrigger><SelectValue placeholder="No template" /></SelectTrigger><SelectContent><SelectItem value="none">No marketing tasks</SelectItem>{templates.filter((template) => template.isActive).map((template) => <SelectItem key={template.id} value={String(template.id)}>{template.name} · {template.taskCount} tasks</SelectItem>)}</SelectContent></Select></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>Cancel</Button><Button onClick={submit} disabled={createMutation.isPending}>{createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Zoom Webinar</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function TemplateTaskForm({ templateId, assignees, onDone }: { templateId: number; assignees: any[]; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [offset, setOffset] = useState("-7");
  const [assigneeId, setAssigneeId] = useState("none");
  const addTask = trpc.webinars.addTemplateTask.useMutation({ onSuccess: () => { setTitle(""); onDone(); toast.success("Template task added"); }, onError: (error) => toast.error(error.message) });
  return <div className="rounded-lg border bg-muted/30 p-3">
    <p className="mb-2 text-sm font-medium">Add marketing task</p>
    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_130px_180px_auto]">
      <Input placeholder="Task title" value={title} onChange={(event) => setTitle(event.target.value)} />
      <Input type="number" value={offset} onChange={(event) => setOffset(event.target.value)} title="Days before (-) or after (+) webinar" />
      <Select value={assigneeId} onValueChange={setAssigneeId}><SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{assignees.map((person) => <SelectItem key={person.id} value={String(person.id)}>{person.name || person.email}</SelectItem>)}</SelectContent></Select>
      <Button size="sm" onClick={() => { if (!title.trim()) return toast.error("Enter a task title."); addTask.mutate({ templateId, data: { title: title.trim(), dueDaysOffset: Number(offset) || 0, assignedToId: assigneeId === "none" ? null : Number(assigneeId), priority: "medium", taskType: "other", sortOrder: 999 } }); }} disabled={addTask.isPending}>{addTask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}</Button>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">Use a negative number for tasks due before the webinar, such as <strong>-7</strong> for one week before.</p>
  </div>;
}

function TemplateManagerDialog({ open, onOpenChange, templates, assignees }: { open: boolean; onOpenChange: (open: boolean) => void; templates: any[]; assignees: any[] }) {
  const utils = trpc.useUtils();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");
  const chosenId = selectedId ?? templates[0]?.id ?? null;
  const selectedQuery = trpc.webinars.getTemplate.useQuery({ id: chosenId! }, { enabled: open && Boolean(chosenId) });
  const createTemplate = trpc.webinars.createTemplate.useMutation({ onSuccess: async (result) => { setSelectedId(result.id); setNewTemplateName(""); setNewTemplateDescription(""); await utils.webinars.listTemplates.invalidate(); toast.success("Marketing template created"); }, onError: (error) => toast.error(error.message) });
  const deleteTemplateTask = trpc.webinars.deleteTemplateTask.useMutation({ onSuccess: async () => { await selectedQuery.refetch(); toast.success("Template task removed"); }, onError: (error) => toast.error(error.message) });

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
      <DialogHeader><DialogTitle>Marketing Task Templates</DialogTitle><DialogDescription>Every new webinar can instantiate one template as normal assigned SavvyOS tasks, with deadlines calculated from the webinar date.</DialogDescription></DialogHeader>
      <div className="grid gap-5 py-2 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="space-y-2 rounded-lg border p-2">{templates.map((template) => <button key={template.id} className={`w-full rounded-md px-3 py-2 text-left text-sm ${template.id === chosenId ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} onClick={() => setSelectedId(template.id)}><span className="block font-medium">{template.name}</span><span className="text-xs opacity-80">{template.taskCount} tasks{!template.isActive ? " · inactive" : ""}</span></button>)}</div>
        <div className="space-y-4">
          <div className="rounded-lg border p-3"><p className="mb-3 text-sm font-medium">Create a new template</p><div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><Input placeholder="Template name" value={newTemplateName} onChange={(event) => setNewTemplateName(event.target.value)} /><Input placeholder="Optional description" value={newTemplateDescription} onChange={(event) => setNewTemplateDescription(event.target.value)} /><Button size="sm" disabled={createTemplate.isPending} onClick={() => { if (!newTemplateName.trim()) return toast.error("Enter a template name."); createTemplate.mutate({ name: newTemplateName.trim(), description: newTemplateDescription.trim() || null }); }}>Create</Button></div></div>
          {selectedQuery.data ? <>
            <div><h3 className="font-semibold">{selectedQuery.data.name}</h3>{selectedQuery.data.description && <p className="mt-1 text-sm text-muted-foreground">{selectedQuery.data.description}</p>}</div>
            <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Task</TableHead><TableHead>Due</TableHead><TableHead>Assignee</TableHead><TableHead className="w-16" /></TableRow></TableHeader><TableBody>{selectedQuery.data.tasks.length === 0 ? <TableRow><TableCell colSpan={4} className="py-7 text-center text-sm text-muted-foreground">No tasks yet.</TableCell></TableRow> : selectedQuery.data.tasks.map((task: TemplateTask) => <TableRow key={task.id}><TableCell><p className="font-medium">{task.title}</p>{task.description && <p className="mt-1 max-w-md text-xs text-muted-foreground">{task.description}</p>}</TableCell><TableCell className="whitespace-nowrap text-sm">{offsetLabel(task.dueDaysOffset)}</TableCell><TableCell className="text-sm">{task.assigneeName || task.assigneeEmail || "Unassigned"}</TableCell><TableCell><Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteTemplateTask.mutate({ id: task.id })}>×</Button></TableCell></TableRow>)}</TableBody></Table></div>
            <TemplateTaskForm templateId={selectedQuery.data.id} assignees={assignees} onDone={() => selectedQuery.refetch()} />
          </> : <div className="py-8 text-center text-sm text-muted-foreground">Select or create a marketing template.</div>}
        </div>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function WebinarDetailDialog({ webinarId, open, onOpenChange }: { webinarId: number | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const detailQuery = trpc.webinars.getById.useQuery({ id: webinarId! }, { enabled: open && webinarId !== null });
  const attendeesQuery = trpc.webinars.listAttendees.useQuery({ id: webinarId! }, { enabled: open && webinarId !== null });
  const syncMutation = trpc.webinars.syncAttendees.useMutation({ onSuccess: async (result) => { await Promise.all([detailQuery.refetch(), attendeesQuery.refetch(), utils.webinars.list.invalidate()]); toast.success(`${result.synchronized} Zoom registrant${result.synchronized === 1 ? "" : "s"} synchronized.`); }, onError: (error) => toast.error(error.message) });
  const cancelMutation = trpc.webinars.cancel.useMutation({ onSuccess: async () => { await utils.webinars.list.invalidate(); toast.success("Webinar cancelled"); onOpenChange(false); }, onError: (error) => toast.error(error.message) });
  const detail = detailQuery.data;

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
      {detailQuery.isLoading || !detail ? <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : <>
        <DialogHeader><div className="flex flex-wrap items-center gap-2"><DialogTitle>{detail.webinar.title}</DialogTitle>{statusBadge(detail.webinar.status)}</div><DialogDescription>{format(new Date(detail.webinar.startTime), "EEEE, MMMM d, yyyy · h:mm a")} ET · {detail.webinar.durationMinutes} minutes</DialogDescription></DialogHeader>
        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardDescription>Registered</CardDescription><CardTitle className="text-3xl">{detail.attendeeCounts.registered}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Live Zoom registration count</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Attended</CardDescription><CardTitle className="text-3xl">{detail.attendeeCounts.attended}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Updated from Zoom events</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Marketing tasks</CardDescription><CardTitle className="text-3xl">{detail.linkedTasks.filter((item: any) => item.task.status === "completed").length}/{detail.linkedTasks.length}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Completed from the existing task workspace</CardContent></Card>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3"><p className="mb-2 text-sm font-medium">Zoom registration link</p><div className="flex flex-col gap-2 sm:flex-row"><Input readOnly value={detail.webinar.zoomRegistrationUrl || detail.webinar.zoomJoinUrl || "No shareable registration link returned"} /><Button variant="outline" onClick={() => copyText(detail.webinar.zoomRegistrationUrl || detail.webinar.zoomJoinUrl)}><Copy className="mr-2 h-4 w-4" />Copy</Button>{(detail.webinar.zoomRegistrationUrl || detail.webinar.zoomJoinUrl) && <Button variant="outline" asChild><a href={(detail.webinar.zoomRegistrationUrl || detail.webinar.zoomJoinUrl) ?? undefined} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open</a></Button>}</div>{detail.webinar.lastZoomSyncError && <p className="mt-2 text-xs text-destructive">Latest Zoom sync error: {detail.webinar.lastZoomSyncError}</p>}</div>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Attendees</h3><Button size="sm" variant="outline" onClick={() => syncMutation.mutate({ id: detail.webinar.id })} disabled={syncMutation.isPending}>{syncMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Sync Zoom</Button></div><div className="max-h-72 overflow-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Registration</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{(attendeesQuery.data ?? []).length === 0 ? <TableRow><TableCell colSpan={3} className="py-7 text-center text-sm text-muted-foreground">No Zoom registrants have been received yet.</TableCell></TableRow> : attendeesQuery.data?.map((attendee: any) => <TableRow key={attendee.id}><TableCell><p className="font-medium">{[attendee.firstName, attendee.lastName].filter(Boolean).join(" ") || "Unknown attendee"}</p><p className="text-xs text-muted-foreground">{attendee.email || "No email"}</p></TableCell><TableCell className="text-xs">{attendee.registeredAt ? format(new Date(attendee.registeredAt), "MMM d, h:mm a") : "—"}</TableCell><TableCell>{statusBadge(attendee.status === "cancelled" ? "cancelled_attendee" : attendee.status)}</TableCell></TableRow>)}</TableBody></Table></div></div>
          <div className="space-y-3"><h3 className="font-semibold">Marketing tasks</h3><div className="max-h-72 overflow-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Task</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{detail.linkedTasks.length === 0 ? <TableRow><TableCell colSpan={3} className="py-7 text-center text-sm text-muted-foreground">No marketing template was applied.</TableCell></TableRow> : detail.linkedTasks.map((item: any) => <TableRow key={item.task.id}><TableCell><p className="font-medium">{item.task.title}</p><p className="text-xs text-muted-foreground">{item.task.assignedToId ? "Assigned" : "Unassigned"}</p></TableCell><TableCell className="text-xs">{item.task.dueDate ? format(new Date(item.task.dueDate), "MMM d") : "—"}</TableCell><TableCell>{statusBadge(item.task.status)}</TableCell></TableRow>)}</TableBody></Table></div></div>
        </div>
        <DialogFooter className="sm:justify-between"><Button variant="destructive" onClick={() => { if (window.confirm("Cancel this webinar in Zoom? This cannot be undone.")) cancelMutation.mutate({ id: detail.webinar.id }); }} disabled={cancelMutation.isPending}>Cancel Webinar</Button><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
      </>}
    </DialogContent>
  </Dialog>;
}

export default function WebinarsAdminPage() {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [createOpen, setCreateOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [selectedWebinarId, setSelectedWebinarId] = useState<number | null>(null);
  const webinarsQuery = trpc.webinars.list.useQuery({ includePast: true });
  const templatesQuery = trpc.webinars.listTemplates.useQuery();
  const assigneesQuery = trpc.webinars.listEligibleAssignees.useQuery();
  const configurationQuery = trpc.webinars.configuration.useQuery();
  const webinars = (webinarsQuery.data ?? []) as WebinarListItem[];
  const calendarDays = useMemo(() => eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }) }), [month]);
  const upcoming = webinars.filter((value) => new Date(value.webinar.startTime) >= new Date() && value.webinar.status !== "cancelled").slice(0, 8);
  const totals = webinars.filter((value) => value.webinar.status !== "cancelled").reduce((summary, value) => ({ upcoming: summary.upcoming + (new Date(value.webinar.startTime) >= new Date() ? 1 : 0), registrations: summary.registrations + value.attendeeCounts.registered, tasks: summary.tasks + value.attendeeCounts.total }), { upcoming: 0, registrations: 0, tasks: 0 });

  return <div className="space-y-6 p-4 md:p-7">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><div className="mb-2 flex items-center gap-2 text-primary"><Video className="h-5 w-5" /><span className="text-sm font-semibold tracking-wide">EVENT OPERATIONS</span></div><h1 className="text-3xl font-bold tracking-tight">Webinars</h1><p className="mt-1 max-w-2xl text-muted-foreground">Create and promote Zoom webinars, track registrations, and manage the marketing work that drives attendance.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setTemplatesOpen(true)}><Settings2 className="mr-2 h-4 w-4" />Marketing templates</Button><Button onClick={() => setCreateOpen(true)} disabled={!configurationQuery.data?.configured}><Plus className="mr-2 h-4 w-4" />New webinar</Button></div></div>
    {configurationQuery.data && !configurationQuery.data.configured && <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-medium">Zoom needs a one-time connection before creating webinars.</p><p className="mt-1 text-sm">Add the missing service variables: {configurationQuery.data.missing.join(", ")}. Once connected, SavvyOS will create a Zoom webinar and shareable registration link from this page.</p></div></div>}
    <div className="grid gap-4 md:grid-cols-3"><Card><CardHeader className="pb-2"><CardDescription>Upcoming webinars</CardDescription><CardTitle className="text-3xl">{totals.upcoming}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Scheduled or live events</CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>Total registrations</CardDescription><CardTitle className="text-3xl">{totals.registrations}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Approved and registered Zoom attendees</CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>Tracked attendees</CardDescription><CardTitle className="text-3xl">{totals.tasks}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Registrant and attendance records</CardContent></Card></div>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"><Card><CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" />Webinar calendar</CardTitle><CardDescription>All webinar dates and scheduled event operations.</CardDescription></div><div className="flex items-center gap-1"><Button variant="ghost" size="icon" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></Button><span className="min-w-36 text-center text-sm font-semibold">{format(month, "MMMM yyyy")}</span><Button variant="ghost" size="icon" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></Button></div></CardHeader><CardContent><div className="grid grid-cols-7 border-l border-t"><>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="border-b border-r bg-muted/40 px-2 py-2 text-center text-xs font-medium text-muted-foreground">{day}</div>)}</>{calendarDays.map((day) => { const dayWebinars = webinars.filter((value) => isSameDay(new Date(value.webinar.startTime), day)); return <div key={day.toISOString()} className={`min-h-28 border-b border-r p-2 ${isSameMonth(day, month) ? "bg-background" : "bg-muted/20 text-muted-foreground"}`}><p className={`mb-1 text-xs font-medium ${isSameDay(day, new Date()) ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground" : ""}`}>{format(day, "d")}</p><div className="space-y-1">{dayWebinars.slice(0, 2).map((value) => <button key={value.webinar.id} className="block w-full truncate rounded bg-primary/10 px-1.5 py-1 text-left text-[11px] font-medium text-primary hover:bg-primary/20" title={value.webinar.title} onClick={() => setSelectedWebinarId(value.webinar.id)}>{format(new Date(value.webinar.startTime), "h:mm a")} · {value.webinar.title}</button>)}{dayWebinars.length > 2 && <p className="text-[10px] text-muted-foreground">+{dayWebinars.length - 2} more</p>}</div></div>;})}</div></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" />Upcoming webinars</CardTitle><CardDescription>Registration and marketing readiness at a glance.</CardDescription></CardHeader><CardContent className="space-y-3">{webinarsQuery.isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : upcoming.length === 0 ? <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">No upcoming webinars yet.<br />Create one when Zoom is connected.</div> : upcoming.map((value) => <button key={value.webinar.id} onClick={() => setSelectedWebinarId(value.webinar.id)} className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/60"><div className="flex items-start justify-between gap-2"><p className="line-clamp-2 text-sm font-semibold">{value.webinar.title}</p>{statusBadge(value.webinar.status)}</div><p className="mt-1 text-xs text-muted-foreground">{format(new Date(value.webinar.startTime), "EEE, MMM d · h:mm a")} ET</p><div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{value.attendeeCounts.registered} registered</span><span className="inline-flex items-center gap-1"><ClipboardCheck className="h-3.5 w-3.5" />{value.templateName || "No template"}</span></div></button>)}</CardContent></Card></div>
    <WebinarCreateDialog open={createOpen} onOpenChange={setCreateOpen} templates={templatesQuery.data ?? []} />
    <TemplateManagerDialog open={templatesOpen} onOpenChange={setTemplatesOpen} templates={templatesQuery.data ?? []} assignees={assigneesQuery.data ?? []} />
    <WebinarDetailDialog webinarId={selectedWebinarId} open={selectedWebinarId !== null} onOpenChange={(open) => { if (!open) setSelectedWebinarId(null); }} />
  </div>;
}
