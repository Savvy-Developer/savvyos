import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarDays, Check, Clock3, ExternalLink, Loader2, Pencil, Plus, Trash2, UserRoundCheck, XCircle } from "lucide-react";

const TIMEZONES = [
  ["America/New_York", "Eastern (ET)"],
  ["America/Chicago", "Central (CT)"],
  ["America/Denver", "Mountain (MT)"],
  ["America/Phoenix", "Mountain — Arizona"],
  ["America/Los_Angeles", "Pacific (PT)"],
  ["America/Anchorage", "Alaska (AKT)"],
  ["Pacific/Honolulu", "Hawaii (HST)"],
] as const;
const DURATIONS = [15, 30, 45, 60, 90, 120];

type AppointmentForm = {
  title: string;
  date: string;
  time: string;
  duration: string;
  timezone: string;
  location: string;
  notes: string;
};

function formatParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const result = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { date: `${result.year}-${result.month}-${result.day}`, time: `${result.hour}:${result.minute}` };
}

/** Converts the selected wall-clock date and time in an IANA zone to an instant. */
function zonedDateTime(date: string, time: string, timezone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const assumedUtc = Date.UTC(year, month - 1, day, hour, minute);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(assumedUtc));
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const renderedAsUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second));
    // A second pass handles the rare daylight-saving boundary where the first
    // offset estimate crosses the transition.
    const first = new Date(assumedUtc - (renderedAsUtc - assumedUtc));
    const actual = formatParts(first, timezone);
    if (actual.date === date && actual.time === time) return first;
    const secondParts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(first);
    const secondMap = Object.fromEntries(secondParts.map(part => [part.type, part.value]));
    const secondRendered = Date.UTC(Number(secondMap.year), Number(secondMap.month) - 1, Number(secondMap.day), Number(secondMap.hour), Number(secondMap.minute), Number(secondMap.second));
    return new Date(assumedUtc - (secondRendered - assumedUtc));
  } catch {
    return null;
  }
}

function displayDate(value: string | Date, timezone: string) {
  const date = new Date(value);
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function statusTone(status: string) {
  const map: Record<string, string> = {
    scheduled: "border-sky-200 bg-sky-50 text-sky-800",
    confirmed: "border-emerald-200 bg-emerald-50 text-emerald-800",
    canceled: "border-slate-200 bg-slate-100 text-slate-700",
    completed: "border-violet-200 bg-violet-50 text-violet-800",
    no_show: "border-amber-200 bg-amber-50 text-amber-800",
  };
  return map[status] || "border-muted bg-muted text-muted-foreground";
}

export default function ConnectionAppointmentManager({
  connectionId,
  clientName,
  agentName,
}: {
  connectionId: number;
  clientName: string;
  agentName: string;
}) {
  const utils = trpc.useUtils();
  const { data: appointmentRows = [], isLoading } = trpc.appointments.list.useQuery({ connectionId }, { enabled: Number.isInteger(connectionId) && connectionId > 0 });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const defaultTitle = `${agentName || "Agent"} & ${clientName || "Client"} call`;
  const [form, setForm] = useState<AppointmentForm>(() => {
    const parts = formatParts(new Date(Date.now() + 60 * 60 * 1000), "America/New_York");
    return { title: defaultTitle, date: parts.date, time: parts.time, duration: "30", timezone: "America/New_York", location: "", notes: "" };
  });

  const startAt = useMemo(() => zonedDateTime(form.date, form.time, form.timezone), [form.date, form.time, form.timezone]);
  const endAt = useMemo(() => startAt ? new Date(startAt.getTime() + Number(form.duration || 30) * 60_000) : null, [startAt, form.duration]);
  const availability = trpc.appointments.availability.useQuery(
    { connectionId, startAt: startAt ?? new Date(), endAt: endAt ?? new Date(), timezone: form.timezone as any, excludeAppointmentId: editing?.id },
    { enabled: open && !!startAt && !!endAt }
  );

  const create = trpc.appointments.create.useMutation({
    onSuccess: (result) => {
      toast.success(result.calendar === "google" ? "Appointment added to Google Calendar and invitations sent." : "Appointment scheduled and calendar invitations emailed.");
      closeDialog();
      utils.appointments.list.invalidate({ connectionId });
      utils.agentConnections.get.invalidate({ id: connectionId });
    },
    onError: error => toast.error(error.message),
  });
  const reschedule = trpc.appointments.reschedule.useMutation({
    onSuccess: () => {
      toast.success("Appointment updated.");
      closeDialog();
      utils.appointments.list.invalidate({ connectionId });
    },
    onError: error => toast.error(error.message),
  });
  const cancel = trpc.appointments.cancel.useMutation({
    onSuccess: () => { toast.success("Appointment canceled."); utils.appointments.list.invalidate({ connectionId }); },
    onError: error => toast.error(error.message),
  });
  const setStatus = trpc.appointments.setStatus.useMutation({
    onSuccess: () => { toast.success("Appointment updated."); utils.appointments.list.invalidate({ connectionId }); },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!open || editing) return;
    setForm(current => ({ ...current, title: current.title || defaultTitle }));
  }, [open, editing, defaultTitle]);

  function openCreate() {
    const parts = formatParts(new Date(Date.now() + 60 * 60 * 1000), "America/New_York");
    setEditing(null);
    setForm({ title: defaultTitle, date: parts.date, time: parts.time, duration: "30", timezone: "America/New_York", location: "", notes: "" });
    setOpen(true);
  }

  function openEdit(appointment: any) {
    const start = formatParts(new Date(appointment.startAt), appointment.timezone);
    const duration = Math.max(15, Math.round((new Date(appointment.endAt).getTime() - new Date(appointment.startAt).getTime()) / 60_000));
    setEditing(appointment);
    setForm({
      title: appointment.title,
      date: start.date,
      time: start.time,
      duration: String(DURATIONS.includes(duration) ? duration : 30),
      timezone: appointment.timezone,
      location: appointment.location || "",
      notes: appointment.notes || "",
    });
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditing(null);
  }

  function saveAppointment() {
    if (!startAt || !endAt) return toast.error("Choose a valid appointment date and time.");
    if (!form.title.trim()) return toast.error("An appointment title is required.");
    const appointment = { title: form.title.trim(), startAt, endAt, timezone: form.timezone as any, location: form.location.trim() || null, notes: form.notes.trim() || null };
    if (editing) reschedule.mutate({ appointmentId: editing.id, appointment });
    else create.mutate({ connectionId, appointment });
  }

  const busy = availability.data?.connected && (availability.data.busy?.length ?? 0) > 0;
  const saving = create.isPending || reschedule.isPending;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={openCreate}>
          <CalendarDays className="mr-1.5 h-4 w-4" /> Add appointment
        </Button>
        {appointmentRows.length > 0 && <Badge variant="outline" className="font-normal">{appointmentRows.length} scheduled</Badge>}
      </div>

      {isLoading ? <p className="text-xs text-muted-foreground">Loading appointments…</p> : appointmentRows.length > 0 && (
        <div className="space-y-2">
          {appointmentRows.slice(0, 6).map((row: any) => {
            const appointment = row.appointment;
            const isCalendly = appointment.source === "calendly";
            const canEdit = !isCalendly && !["canceled", "completed", "no_show"].includes(appointment.status);
            return (
              <div key={appointment.id} className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-sm">{appointment.title}</p>
                      <Badge variant="outline" className={`capitalize ${statusTone(appointment.status)}`}>{appointment.status.replace("_", " ")}</Badge>
                      {isCalendly && <Badge variant="outline" className="text-[10px]">Calendly</Badge>}
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{displayDate(appointment.startAt, appointment.timezone)}</p>
                    {appointment.location && <p className="mt-1 text-xs text-muted-foreground break-all">{appointment.location}</p>}
                    {appointment.invitationDeliveryError && <p className="mt-1 text-xs text-amber-700">Invitation note: {appointment.invitationDeliveryError}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {appointment.externalCalendarEventUrl && <Button size="sm" variant="ghost" asChild><a href={appointment.externalCalendarEventUrl} target="_blank" rel="noreferrer" title="Open Google Calendar event"><ExternalLink className="h-3.5 w-3.5" /></a></Button>}
                    {canEdit && <Button size="sm" variant="outline" onClick={() => openEdit(appointment)}><Pencil className="mr-1 h-3.5 w-3.5" />Reschedule</Button>}
                    {appointment.status === "scheduled" && <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ appointmentId: appointment.id, status: "confirmed" })}><UserRoundCheck className="mr-1 h-3.5 w-3.5" />Confirm</Button>}
                    {appointment.status === "confirmed" && <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ appointmentId: appointment.id, status: "completed" })}><Check className="mr-1 h-3.5 w-3.5" />Complete</Button>}
                    {canEdit && <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { if (window.confirm("Cancel this appointment? Both parties will be notified.")) cancel.mutate({ appointmentId: appointment.id }); }}><Trash2 className="mr-1 h-3.5 w-3.5" />Cancel</Button>}
                    {isCalendly && appointment.calendlyRescheduleUrl && <Button size="sm" variant="outline" asChild><a href={appointment.calendlyRescheduleUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" />Reschedule in Calendly</a></Button>}
                    {isCalendly && appointment.calendlyCancelUrl && <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" asChild><a href={appointment.calendlyCancelUrl} target="_blank" rel="noreferrer"><XCircle className="mr-1 h-3.5 w-3.5" />Cancel in Calendly</a></Button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={nextOpen => !nextOpen && closeDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Reschedule appointment" : "Schedule appointment"}</DialogTitle>
            <DialogDescription>{editing ? "Update the time or details. Connected Google Calendars and email invitations will be updated automatically." : `Book a call between ${agentName || "the agent"} and ${clientName || "this client"}.`}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label htmlFor="appointment-title">Appointment title</Label><Input id="appointment-title" value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="appointment-date">Date</Label><Input id="appointment-date" type="date" min={new Date().toISOString().slice(0, 10)} value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="appointment-time">Time</Label><Input id="appointment-time" type="time" value={form.time} onChange={event => setForm(current => ({ ...current, time: event.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Duration</Label><Select value={form.duration} onValueChange={duration => setForm(current => ({ ...current, duration }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DURATIONS.map(duration => <SelectItem key={duration} value={String(duration)}>{duration < 60 ? `${duration} minutes` : `${duration / 60} hour${duration === 60 ? "" : "s"}`}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Timezone</Label><Select value={form.timezone} onValueChange={timezone => setForm(current => ({ ...current, timezone }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIMEZONES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            {availability.isFetching && <p className="text-xs text-muted-foreground">Checking Google Calendar availability…</p>}
            {availability.data?.connected && !availability.isFetching && (
              <div className={`rounded-lg border p-3 text-xs ${busy ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
                {availability.data.error ? `Google Calendar could not confirm availability: ${availability.data.error}. An email invitation will be sent instead.` : busy ? "The agent is busy during this time in Google Calendar. Choose another time." : "The agent is free during this time according to Google Calendar."}
              </div>
            )}
            {!availability.data?.connected && !availability.isFetching && <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">The agent has not connected Google Calendar yet. SavvyOS will save the appointment and email calendar invitations to the agent and client.</div>}
            <div className="space-y-2"><Label htmlFor="appointment-location">Location or meeting link <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="appointment-location" placeholder="Google Meet, Zoom, phone number, or address" value={form.location} onChange={event => setForm(current => ({ ...current, location: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="appointment-notes">Internal notes <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="appointment-notes" rows={3} placeholder="Purpose, agenda, or context for the appointment" value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={saveAppointment} disabled={saving || busy || !startAt || !endAt}>{saving ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Saving…</> : editing ? "Save appointment" : "Schedule appointment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const __testables__ = { zonedDateTime, formatParts };
