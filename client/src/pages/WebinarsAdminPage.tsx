import { useEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Settings2,
  Upload,
  Users,
  Video,
  X,
} from "lucide-react";
import { WEBINAR_TIMEZONES, formatWebinarDateTime, formatWebinarTime, hasMinimumWebinarLeadTime, webinarDateKey, webinarDateTimeLocalValue, webinarDateTimeToUtc, webinarTimezoneLabel } from "@shared/webinarTime";

const MARKETING_EMAIL = "marketing@savvy.realty";
const TEMPLATE_TOKENS = [
  "{{webinar_title}}",
  "{{webinar_description}}",
  "{{webinar_start_time}}",
  "{{webinar_duration}}",
  "{{webinar_registration_url}}",
  "{{webinar_creator_name}}",
  "{{webinar_creator_email}}",
];

type WebinarListItem = any;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  return (
    <Badge
      variant="outline"
      className={classes[status] ?? "bg-slate-100 text-slate-700"}
    >
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function copyText(
  value: string | null | undefined,
  successMessage = "Copied to clipboard"
) {
  if (!value) return;
  navigator.clipboard
    .writeText(value)
    .then(() => toast.success(successMessage))
    .catch(() => toast.error("Could not copy the link"));
}

function WebinarRescheduleDialog({
  webinar,
  open,
  onOpenChange,
  onRescheduled,
}: {
  webinar: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRescheduled: () => Promise<void> | void;
}) {
  const utils = trpc.useUtils();
  const [startTime, setStartTime] = useState("");
  useEffect(() => {
    if (open && webinar) {
      setStartTime(webinarDateTimeLocalValue(webinar.startTime, webinar.timezone));
    }
  }, [open, webinar?.id, webinar?.startTime, webinar?.timezone]);

  const rescheduleMutation = trpc.webinars.reschedule.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.webinars.list.invalidate(), onRescheduled()]);
      toast.success("Webinar rescheduled in SavvyOS and Zoom.");
      onOpenChange(false);
    },
    onError: error => toast.error(error.message),
  });

  function submit() {
    let submittedTime: Date;
    try {
      submittedTime = webinarDateTimeToUtc(startTime, webinar.timezone);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enter a valid new webinar date and time.");
      return;
    }
    if (!startTime) {
      toast.error("Enter a valid new webinar date and time.");
      return;
    }
    if (submittedTime <= new Date()) {
      toast.error("Choose a future date and time for the webinar.");
      return;
    }
    rescheduleMutation.mutate({ id: webinar.id, startTime });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reschedule Webinar</DialogTitle>
          <DialogDescription>
            This changes the webinar time in SavvyOS and Zoom. The existing
            registration link and registrants remain connected to the webinar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{webinar?.title}</p>
            <p className="mt-1 text-muted-foreground">
              Currently scheduled for {formatWebinarDateTime(webinar?.startTime, webinar?.timezone)}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reschedule-webinar-start">
              New start date and time ({webinarTimezoneLabel(webinar?.timezone, webinar?.startTime)})
            </Label>
            <Input
              id="reschedule-webinar-start"
              type="datetime-local"
              value={startTime}
              onChange={event => setStartTime(event.target.value)}
              disabled={rescheduleMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              The local date and time stays in this webinar&apos;s selected timezone.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={rescheduleMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={rescheduleMutation.isPending}>
            {rescheduleMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Reschedule in Zoom
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WebinarCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const createMutation = trpc.webinars.create.useMutation();
  const headshotInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [partnerGuestInfo, setPartnerGuestInfo] = useState("");
  const [guestBios, setGuestBios] = useState("");
  const [guestHeadshots, setGuestHeadshots] = useState<File[]>([]);
  const [startTime, setStartTime] = useState("");
  const [timezone, setTimezone] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [approval, setApproval] = useState<
    "automatically" | "manually" | "no_registration"
  >("automatically");
  const [isPreparing, setIsPreparing] = useState(false);
  const submittedStart = useMemo(() => {
    if (!startTime || !timezone) return null;
    try { return webinarDateTimeToUtc(startTime, timezone); } catch { return null; }
  }, [startTime, timezone]);
  const hasMinimumLeadTime = Boolean(submittedStart && hasMinimumWebinarLeadTime(submittedStart));
  const ready = Boolean(title.trim() && description.trim() && partnerGuestInfo.trim() && guestBios.trim() && guestHeadshots.length && startTime && timezone && submittedStart && hasMinimumLeadTime);
  const busy = createMutation.isPending || isPreparing;

  function addHeadshots(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const invalid = files.find(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024);
    if (invalid) { toast.error("Guest headshots must be JPG, PNG, or WEBP images no larger than 2 MB."); event.target.value = ""; return; }
    setGuestHeadshots(current => {
      const next = [...current, ...files];
      if (next.length > 10) { toast.error("Upload no more than 10 guest headshots."); return current; }
      return next;
    });
    event.target.value = "";
  }

  async function submit() {
    if (!ready) {
      toast.error(submittedStart && !hasMinimumLeadTime ? "Webinars require at least two weeks of lead time. Choose a date at least 14 days from today." : "Complete every required webinar request field before submitting.");
      return;
    }
    try {
      setIsPreparing(true);
      const encodedHeadshots = await Promise.all(guestHeadshots.map(async file => ({ fileName: file.name, mimeType: file.type as "image/jpeg" | "image/png" | "image/webp", base64Data: await fileToBase64(file) })));
      const result = await createMutation.mutateAsync({ title: title.trim(), description: description.trim(), partnerGuestInfo: partnerGuestInfo.trim(), guestBios: guestBios.trim(), guestHeadshots: encodedHeadshots, startTime, durationMinutes: Number(durationMinutes) || 60, timezone, registrationApproval: approval });
      await utils.webinars.list.invalidate();
      toast.success(result.marketingEmailSent && result.confirmationEmailSent ? "Webinar created. Marketing was notified and your confirmation email was sent." : "Webinar created. The email handoff needs attention.");
      if (!result.marketingEmailSent && result.marketingEmailReason) toast.message(result.marketingEmailReason);
      if (!result.confirmationEmailSent && result.confirmationEmailReason) toast.message(result.confirmationEmailReason);
      onOpenChange(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create the webinar."); }
    finally { setIsPreparing(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto p-4 sm:h-[calc(100vh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-5xl sm:p-6 sm:rounded-xl">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle>New Webinar Request</DialogTitle>
          <DialogDescription className="break-words">
            Requests need at least two weeks of lead time. Marketing receives the complete request, and the submitter receives a confirmation email.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-5 py-2 lg:grid-cols-2">
          <div className="min-w-0 space-y-2 lg:col-span-2">
            <Label htmlFor="webinar-title">Webinar title *</Label>
            <Input
              id="webinar-title"
              placeholder="e.g., How to Evaluate a Short-Term Rental Market"
              value={title}
              onChange={event => setTitle(event.target.value)}
              disabled={busy}
            />
          </div>
          <div className="min-w-0 space-y-2 lg:col-span-2">
            <Label htmlFor="webinar-description">Description / details *</Label>
            <Textarea
              id="webinar-description"
              placeholder="The Zoom webinar agenda and promotional summary."
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={4}
              disabled={busy}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="webinar-start">Date and time *</Label>
            <Input
              id="webinar-start"
              type="datetime-local"
              value={startTime}
              onChange={event => setStartTime(event.target.value)}
              disabled={busy}
            />
            {submittedStart && !hasMinimumLeadTime && <p className="break-words text-xs leading-5 text-destructive">Webinars require at least two weeks of lead time. Choose a date at least 14 days from today.</p>}
          </div>
          <div className="min-w-0 space-y-2">
            <Label>Timezone *</Label>
            <Select value={timezone} onValueChange={setTimezone} disabled={busy}>
              <SelectTrigger className="w-full min-w-0"><SelectValue className="min-w-0 truncate" placeholder="Select the webinar timezone" /></SelectTrigger>
              <SelectContent>{WEBINAR_TIMEZONES.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="break-words text-xs leading-5 text-muted-foreground">SavvyOS will store and display this exact local time with its timezone label.</p>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="webinar-duration">Duration (minutes)</Label>
            <Input
              id="webinar-duration"
              type="number"
              min={15}
              max={480}
              value={durationMinutes}
              onChange={event => setDurationMinutes(event.target.value)}
              disabled={busy}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label>Registration approval</Label>
            <Select
              value={approval}
              onValueChange={value => setApproval(value as typeof approval)}
              disabled={busy}
            >
              <SelectTrigger className="w-full min-w-0">
                <SelectValue className="min-w-0 truncate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="automatically">
                  Approve registrations automatically
                </SelectItem>
                <SelectItem value="manually">
                  Approve registrations manually
                </SelectItem>
                <SelectItem value="no_registration">
                  No registration required
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-2 lg:col-span-2">
            <Label htmlFor="webinar-partner-guest">Partner or guest information *</Label>
            <Textarea id="webinar-partner-guest" placeholder="List the partner or guests, their roles, and anything Marketing should know." value={partnerGuestInfo} onChange={event => setPartnerGuestInfo(event.target.value)} rows={3} disabled={busy} />
          </div>
          <div className="min-w-0 space-y-2 lg:col-span-2">
            <Label htmlFor="webinar-guest-bios">Guest bios *</Label>
            <Textarea id="webinar-guest-bios" placeholder="Provide the bio copy Marketing should use for every guest." value={guestBios} onChange={event => setGuestBios(event.target.value)} rows={5} disabled={busy} />
          </div>
          <div className="min-w-0 space-y-2 lg:col-span-2">
            <Label>Guest headshots *</Label>
            <input ref={headshotInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={addHeadshots} disabled={busy} />
            <Button type="button" variant="outline" className="w-full whitespace-normal border-dashed text-center leading-5" onClick={() => headshotInput.current?.click()} disabled={busy}><Upload className="mr-2 h-4 w-4" />Upload guest headshots</Button>
            <p className="break-words text-xs leading-5 text-muted-foreground">JPG, PNG, or WEBP. Up to 2 MB each, 10 files maximum.</p>
            {guestHeadshots.length > 0 && <ul className="rounded-md border p-2 text-sm">{guestHeadshots.map((file, index) => <li key={`${file.name}-${index}`} className="flex min-w-0 items-center justify-between gap-2"><span className="min-w-0 flex-1 break-all">{file.name}</span><button type="button" className="shrink-0 rounded p-1" onClick={() => setGuestHeadshots(current => current.filter((_, itemIndex) => itemIndex !== index))} disabled={busy} aria-label={`Remove ${file.name}`}><X className="h-4 w-4" /></button></li>)}</ul>}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={!ready || busy}>
            {busy && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Submit Webinar Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MarketingEmailTemplateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const templateQuery = trpc.webinars.getMarketingEmailTemplate.useQuery(
    undefined,
    { enabled: open }
  );
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const template = templateQuery.data;
  useEffect(() => {
    if (!template) return;
    setSubject(template.subject);
    setBodyText(template.bodyText);
  }, [template?.subject, template?.bodyText]);
  const updateMutation = trpc.webinars.updateMarketingEmailTemplate.useMutation(
    {
      onSuccess: async () => {
        await utils.webinars.getMarketingEmailTemplate.invalidate();
        toast.success("Marketing email template saved");
      },
      onError: error => toast.error(error.message),
    }
  );
  const resetMutation = trpc.webinars.resetMarketingEmailTemplate.useMutation({
    onSuccess: async () => {
      await utils.webinars.getMarketingEmailTemplate.invalidate();
      toast.success("Marketing email template reset to the SavvyOS default");
    },
    onError: error => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto p-6 sm:max-w-6xl sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>Marketing Handoff Email</DialogTitle>
          <DialogDescription>
            When a webinar is created, SavvyOS sends this email to{" "}
            {MARKETING_EMAIL} and copies the person who created the webinar.
          </DialogDescription>
        </DialogHeader>
        {templateQuery.isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="marketing-email-subject">Subject</Label>
              <Input
                id="marketing-email-subject"
                value={subject}
                onChange={event => setSubject(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="marketing-email-body">Message</Label>
              <Textarea
                id="marketing-email-body"
                rows={10}
                value={bodyText}
                onChange={event => setBodyText(event.target.value)}
              />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">Available merge fields</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TEMPLATE_TOKENS.map(token => (
                  <button
                    type="button"
                    key={token}
                    className="rounded border bg-background px-2 py-1 font-mono text-xs hover:bg-muted"
                    onClick={() => {
                      navigator.clipboard.writeText(token);
                      toast.success(`${token} copied`);
                    }}
                    title="Copy merge field"
                  >
                    {token}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Use these in the subject or message. Webinar details and the
                registration link remain included in the branded handoff email.
              </p>
            </div>
          </div>
        )}
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => {
              if (window.confirm("Reset this email to the SavvyOS default?"))
                resetMutation.mutate();
            }}
            disabled={resetMutation.isPending}
          >
            Reset default
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                if (!subject.trim() || !bodyText.trim())
                  return toast.error("Enter an email subject and message.");
                updateMutation.mutate({
                  subject: subject.trim(),
                  bodyText: bodyText.trim(),
                });
              }}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save template
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WebinarDetailDialog({
  webinarId,
  open,
  onOpenChange,
}: {
  webinarId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const detailQuery = trpc.webinars.getById.useQuery(
    { id: webinarId! },
    { enabled: open && webinarId !== null }
  );
  const attendeesQuery = trpc.webinars.listAttendees.useQuery(
    { id: webinarId! },
    { enabled: open && webinarId !== null }
  );
  const syncMutation = trpc.webinars.syncAttendees.useMutation({
    onSuccess: async result => {
      await Promise.all([
        detailQuery.refetch(),
        attendeesQuery.refetch(),
        utils.webinars.list.invalidate(),
      ]);
      toast.success(
        `${result.synchronized} Zoom registrant${result.synchronized === 1 ? "" : "s"} synchronized.`
      );
    },
    onError: error => toast.error(error.message),
  });
  const cancelMutation = trpc.webinars.cancel.useMutation({
    onSuccess: async () => {
      await utils.webinars.list.invalidate();
      toast.success("Webinar cancelled");
      onOpenChange(false);
    },
    onError: error => toast.error(error.message),
  });
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  useEffect(() => {
    if (!open) setRescheduleOpen(false);
  }, [open]);
  const detail = detailQuery.data;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto p-6 sm:max-w-7xl sm:rounded-xl">
        {detailQuery.isLoading || !detail ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle>{detail.webinar.title}</DialogTitle>
                {statusBadge(detail.webinar.status)}
              </div>
              <DialogDescription>
                {formatWebinarDateTime(detail.webinar.startTime, detail.webinar.timezone, { includeWeekday: true })} ·{" "}
                {detail.webinar.durationMinutes} minutes
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Registered</CardDescription>
                  <CardTitle className="text-3xl">
                    {detail.attendeeCounts.registered}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Live Zoom registration count
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Attended</CardDescription>
                  <CardTitle className="text-3xl">
                    {detail.attendeeCounts.attended}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Updated from Zoom events
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Marketing handoff</CardDescription>
                  <CardTitle className="text-lg">{MARKETING_EMAIL}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Creator is copied when the webinar is created
                </CardContent>
              </Card>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="mb-2 text-sm font-medium">Zoom registration link</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  readOnly
                  value={
                    detail.webinar.zoomRegistrationUrl ||
                    detail.webinar.zoomJoinUrl ||
                    "No shareable registration link returned"
                  }
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    copyText(
                      detail.webinar.zoomRegistrationUrl ||
                        detail.webinar.zoomJoinUrl
                    )
                  }
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
                {(detail.webinar.zoomRegistrationUrl ||
                  detail.webinar.zoomJoinUrl) && (
                  <Button variant="outline" asChild>
                    <a
                      href={
                        (detail.webinar.zoomRegistrationUrl ||
                          detail.webinar.zoomJoinUrl) ??
                        undefined
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open
                    </a>
                  </Button>
                )}
              </div>
              {detail.webinar.lastZoomSyncError && (
                <p className="mt-2 text-xs text-destructive">
                  Latest Zoom sync error: {detail.webinar.lastZoomSyncError}
                </p>
              )}
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Webinar request details</h3><span className="text-xs text-muted-foreground">{webinarTimezoneLabel(detail.webinar.timezone, detail.webinar.startTime)}</span></div>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                <div><p className="text-xs font-medium uppercase text-muted-foreground">Description / details</p><p className="mt-1 whitespace-pre-wrap text-sm">{detail.webinar.description || "No description recorded."}</p></div>
                <div><p className="text-xs font-medium uppercase text-muted-foreground">Partner or guest information</p><p className="mt-1 whitespace-pre-wrap text-sm">{detail.webinar.partnerGuestInfo || "No partner or guest information recorded."}</p></div>
                <div className="lg:col-span-2"><p className="text-xs font-medium uppercase text-muted-foreground">Guest bios</p><p className="mt-1 whitespace-pre-wrap text-sm">{detail.webinar.guestBios || "No guest bios recorded."}</p></div>
                <div className="lg:col-span-2"><p className="text-xs font-medium uppercase text-muted-foreground">Guest headshots</p>{(detail.guestHeadshots ?? []).length ? <div className="mt-2 flex flex-wrap gap-3">{detail.guestHeadshots.map((headshot: any) => <a key={headshot.id} href={headshot.fileUrl} target="_blank" rel="noreferrer" className="flex w-28 flex-col overflow-hidden rounded-md border"><img src={headshot.fileUrl} alt={headshot.fileName} className="h-24 w-full object-cover" /><span className="truncate px-2 py-1 text-xs">{headshot.fileName}</span></a>)}</div> : <p className="mt-1 text-sm text-muted-foreground">No guest headshots were recorded.</p>}</div>
              </div>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Attendees</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      syncMutation.mutate({ id: detail.webinar.id })
                    }
                    disabled={syncMutation.isPending}
                  >
                    {syncMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Sync Zoom
                  </Button>
                </div>
                <div className="max-h-72 overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Registration</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(attendeesQuery.data ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="py-7 text-center text-sm text-muted-foreground"
                          >
                            No Zoom registrants have been received yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        attendeesQuery.data?.map((attendee: any) => (
                          <TableRow key={attendee.id}>
                            <TableCell>
                              <p className="font-medium">
                                {[attendee.firstName, attendee.lastName]
                                  .filter(Boolean)
                                  .join(" ") || "Unknown attendee"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {attendee.email || "No email"}
                              </p>
                            </TableCell>
                            <TableCell className="text-xs">
                              {attendee.registeredAt
                                ? format(
                                    new Date(attendee.registeredAt),
                                    "MMM d, h:mm a"
                                  )
                                : "—"}
                            </TableCell>
                            <TableCell>
                              {statusBadge(
                                attendee.status === "cancelled"
                                  ? "cancelled_attendee"
                                  : attendee.status
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Mail className="h-4 w-4" />
                  Marketing handoff
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  This webinar was created by{" "}
                  <strong className="text-foreground">
                    {detail.creatorName ||
                      detail.creatorEmail ||
                      "a SavvyOS administrator"}
                  </strong>
                  . Marketing requests are handled by email, not as standard
                  SavvyOS tasks.
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  The complete request, including guest bios and headshots, goes to{" "}
                  <strong className="text-foreground">{MARKETING_EMAIL}</strong>
                  . The submitter also receives a confirmation email with a reply-to address of {MARKETING_EMAIL}.
                </p>
              </div>
            </div>
            <DialogFooter className="sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {detail.webinar.status === "scheduled" && (
                  <Button
                    variant="outline"
                    onClick={() => setRescheduleOpen(true)}
                    disabled={cancelMutation.isPending}
                  >
                    <CalendarClock className="mr-2 h-4 w-4" />
                    Reschedule
                  </Button>
                )}
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Cancel this webinar in Zoom? This cannot be undone."
                      )
                    )
                      cancelMutation.mutate({ id: detail.webinar.id });
                  }}
                  disabled={cancelMutation.isPending}
                >
                  Cancel Webinar
                </Button>
              </div>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
      </Dialog>
      {detail && (
        <WebinarRescheduleDialog
          webinar={detail.webinar}
          open={rescheduleOpen}
          onOpenChange={setRescheduleOpen}
          onRescheduled={async () => {
            await detailQuery.refetch();
          }}
        />
      )}
    </>
  );
}

export default function WebinarsAdminPage() {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [createOpen, setCreateOpen] = useState(false);
  const [emailTemplateOpen, setEmailTemplateOpen] = useState(false);
  const [selectedWebinarId, setSelectedWebinarId] = useState<number | null>(
    null
  );
  const [historyFilter, setHistoryFilter] = useState<
    "all" | "upcoming" | "past" | "scheduled" | "cancelled"
  >("all");
  const webinarsQuery = trpc.webinars.list.useQuery({ includePast: true });
  const configurationQuery = trpc.webinars.configuration.useQuery();
  const webinars = (webinarsQuery.data ?? []) as WebinarListItem[];
  const calendarDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
      }),
    [month]
  );
  const now = new Date();
  const calendarWebinars = webinars.filter(
    value => value.webinar.status !== "cancelled"
  );
  const upcoming = calendarWebinars
    .filter(value => new Date(value.webinar.startTime) >= now)
    .slice(0, 8);
  const historyWebinars = [...webinars]
    .filter(value => {
      const startTime = new Date(value.webinar.startTime);
      if (historyFilter === "upcoming")
        return startTime >= now && value.webinar.status !== "cancelled";
      if (historyFilter === "past")
        return startTime < now && value.webinar.status !== "cancelled";
      if (historyFilter === "scheduled")
        return value.webinar.status === "scheduled";
      if (historyFilter === "cancelled")
        return value.webinar.status === "cancelled";
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.webinar.startTime).getTime() -
        new Date(a.webinar.startTime).getTime()
    );
  const totals = webinars.reduce(
    (summary, value) => ({
      upcoming:
        summary.upcoming +
        (new Date(value.webinar.startTime) >= now &&
        value.webinar.status !== "cancelled"
          ? 1
          : 0),
      registrations:
        summary.registrations +
        (value.webinar.status !== "cancelled"
          ? value.attendeeCounts.registered
          : 0),
      attendees:
        summary.attendees +
        (value.webinar.status !== "cancelled" ? value.attendeeCounts.total : 0),
      cancelled:
        summary.cancelled + (value.webinar.status === "cancelled" ? 1 : 0),
    }),
    { upcoming: 0, registrations: 0, attendees: 0, cancelled: 0 }
  );

  return (
    <div className="space-y-6 p-4 md:p-7">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Video className="h-5 w-5" />
            <span className="text-sm font-semibold tracking-wide">
              EVENT OPERATIONS
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Webinars</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Create Zoom webinars, share registration links, track attendees, and
            hand promotional coordination directly to marketing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEmailTemplateOpen(true)}>
            <Settings2 className="mr-2 h-4 w-4" />
            Marketing email
          </Button>
          <Button
            onClick={() => setCreateOpen(true)}
            disabled={!configurationQuery.data?.configured}
          >
            <Plus className="mr-2 h-4 w-4" />
            New webinar
          </Button>
        </div>
      </div>
      {configurationQuery.data && !configurationQuery.data.configured && (
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">
              Zoom needs a one-time connection before creating webinars.
            </p>
            <p className="mt-1 text-sm">
              Add the missing service variables:{" "}
              {configurationQuery.data.missing.join(", ")}. Once connected,
              SavvyOS will create a Zoom webinar, email marketing@savvy.realty,
              and provide a shareable registration link from this page.
            </p>
          </div>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Upcoming webinars</CardDescription>
            <CardTitle className="text-3xl">{totals.upcoming}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Scheduled or live events
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total registrations</CardDescription>
            <CardTitle className="text-3xl">{totals.registrations}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Approved and registered Zoom attendees
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cancelled webinars</CardDescription>
            <CardTitle className="text-3xl">{totals.cancelled}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Retained in history, excluded from calendar
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Marketing handoff</CardDescription>
            <CardTitle className="text-lg">Email-based</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {MARKETING_EMAIL} is notified at webinar creation
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Webinar calendar
              </CardTitle>
              <CardDescription>
                Scheduled, live, and completed webinar dates in each webinar&apos;s selected timezone. Cancelled webinars are retained in history only.
              </CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMonth(addMonths(month, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-36 text-center text-sm font-semibold">
                {format(month, "MMMM yyyy")}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMonth(addMonths(month, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 border-l border-t">
              <>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                  <div
                    key={day}
                    className="border-b border-r bg-muted/40 px-2 py-2 text-center text-xs font-medium text-muted-foreground"
                  >
                    {day}
                  </div>
                ))}
              </>
              {calendarDays.map(day => {
                const dayWebinars = calendarWebinars.filter(value =>
                  webinarDateKey(value.webinar.startTime, value.webinar.timezone) === format(day, "yyyy-MM-dd")
                );
                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-28 border-b border-r p-2 ${isSameMonth(day, month) ? "bg-background" : "bg-muted/20 text-muted-foreground"}`}
                  >
                    <p
                      className={`mb-1 text-xs font-medium ${isSameDay(day, new Date()) ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground" : ""}`}
                    >
                      {format(day, "d")}
                    </p>
                    <div className="space-y-1">
                      {dayWebinars.slice(0, 2).map(value => (
                        <button
                          key={value.webinar.id}
                          className="block w-full truncate rounded bg-primary/10 px-1.5 py-1 text-left text-[11px] font-medium text-primary hover:bg-primary/20"
                          title={value.webinar.title}
                          onClick={() => setSelectedWebinarId(value.webinar.id)}
                        >
                          {formatWebinarTime(value.webinar.startTime, value.webinar.timezone)} ·{" "}
                          {value.webinar.title}
                        </button>
                      ))}
                      {dayWebinars.length > 2 && (
                        <p className="text-[10px] text-muted-foreground">
                          +{dayWebinars.length - 2} more
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Upcoming webinars
            </CardTitle>
            <CardDescription>
              Registration and marketing coordination at a glance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {webinarsQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : upcoming.length === 0 ? (
              <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                No upcoming webinars yet.
                <br />
                Create one when Zoom is connected.
              </div>
            ) : (
              upcoming.map(value => (
                <button
                  key={value.webinar.id}
                  onClick={() => setSelectedWebinarId(value.webinar.id)}
                  className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-semibold">
                      {value.webinar.title}
                    </p>
                    {statusBadge(value.webinar.status)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatWebinarDateTime(value.webinar.startTime, value.webinar.timezone)}
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {value.attendeeCounts.registered} registered
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      Marketing email
                    </span>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Webinar history</CardTitle>
            <CardDescription>
              All webinars are retained for operational history, including
              upcoming, past, scheduled, live, ended, and cancelled events.
            </CardDescription>
          </div>
          <Select
            value={historyFilter}
            onValueChange={value =>
              setHistoryFilter(value as typeof historyFilter)
            }
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Filter history" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All webinars</SelectItem>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="past">Past</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Webinar</TableHead>
                  <TableHead>Date &amp; time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Registrations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webinarsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : historyWebinars.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      No webinars match this history filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  historyWebinars.map(value => (
                    <TableRow
                      key={value.webinar.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedWebinarId(value.webinar.id)}
                    >
                      <TableCell>
                        <p className="font-medium">{value.webinar.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Created by{" "}
                          {value.creatorName ||
                            value.creatorEmail ||
                            "SavvyOS administrator"}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatWebinarDateTime(value.webinar.startTime, value.webinar.timezone)}
                      </TableCell>
                      <TableCell>{statusBadge(value.webinar.status)}</TableCell>
                      <TableCell className="text-right text-sm">
                        {value.attendeeCounts.registered}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <WebinarCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <MarketingEmailTemplateDialog
        open={emailTemplateOpen}
        onOpenChange={setEmailTemplateOpen}
      />
      <WebinarDetailDialog
        webinarId={selectedWebinarId}
        open={selectedWebinarId !== null}
        onOpenChange={open => {
          if (!open) setSelectedWebinarId(null);
        }}
      />
    </div>
  );
}
