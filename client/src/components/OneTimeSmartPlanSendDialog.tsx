import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import RichEmailEditor from "@/components/RichEmailEditor";
import EmailMessagePreviewDialog from "@/components/EmailMessagePreviewDialog";
import SmartPlanTestSendDialog from "@/components/SmartPlanTestSendDialog";
import OneTimeLeadSourceAudiencePicker from "@/components/OneTimeLeadSourceAudiencePicker";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Eye,
  Mail,
  MessageSquare,
  Send,
  Users,
} from "lucide-react";

type TriggerType =
  | "lead_source"
  | "all_lead_sources"
  | "buyer_under_contract"
  | "seller_under_contract"
  | "new_listing"
  | "buyer_closed"
  | "seller_closed";
type Channel = "email" | "sms";
type ScheduleMode = "now" | "scheduled";
type LeadSource = { id: number; name: string; parentId: number | null };

const TRIGGERS: Array<{
  value: TriggerType;
  label: string;
  audienceLabel: string;
}> = [
  {
    value: "lead_source",
    label: "Lead Source",
    audienceLabel: "contacts from the selected lead source",
  },
  {
    value: "all_lead_sources",
    label: "All Lead Sources",
    audienceLabel: "all current contacts in the database",
  },
  {
    value: "buyer_under_contract",
    label: "Buyer Goes Under Contract",
    audienceLabel: "current buyer contacts with an under-contract transaction",
  },
  {
    value: "seller_under_contract",
    label: "Seller Goes Under Contract",
    audienceLabel: "current seller contacts with an under-contract transaction",
  },
  {
    value: "new_listing",
    label: "New Listing",
    audienceLabel: "current listing contacts",
  },
  {
    value: "buyer_closed",
    label: "Buyer Transaction Closed",
    audienceLabel: "current buyer contacts with a closed transaction",
  },
  {
    value: "seller_closed",
    label: "Seller Transaction Closed",
    audienceLabel: "current seller contacts with a closed transaction",
  },
];

function sendLabel(channel: Channel) {
  return channel === "email" ? "email" : "text message";
}

function toDateTimeLocal(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function formatScheduledAt(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "the selected time";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function hourEstimate(recipientCount: number, perHour: number) {
  if (!recipientCount || !perHour) return 0;
  return Math.ceil(recipientCount / perHour);
}

function formatCalendarDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateAddedRange(from: string | null, to: string | null) {
  if (from && to) return `${formatCalendarDate(from)} through ${formatCalendarDate(to)}`;
  if (from) return `${formatCalendarDate(from)} or later`;
  if (to) return `${formatCalendarDate(to)} or earlier`;
  return "All dates";
}

export default function OneTimeSmartPlanSendDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const { data: sourceRows = [] } = trpc.leadSources.list.useQuery();
  const [channel, setChannel] = useState<Channel>("email");
  const [name, setName] = useState("One-time email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("lead_source");
  const [triggerLeadSourceIds, setTriggerLeadSourceIds] = useState<number[]>([]);
  const [dateAddedFilterEnabled, setDateAddedFilterEnabled] = useState(false);
  const [dateAddedFrom, setDateAddedFrom] = useState("");
  const [dateAddedTo, setDateAddedTo] = useState("");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("now");
  const [scheduledAtInput, setScheduledAtInput] = useState("");
  const [staggerEnabled, setStaggerEnabled] = useState(false);
  const [staggerPerHour, setStaggerPerHour] = useState("100");
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewRequested, setReviewRequested] = useState(false);
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const [testSendOpen, setTestSendOpen] = useState(false);

  const isLeadSourceTrigger = triggerType === "lead_source";
  const supportsDateAddedFilter =
    triggerType === "lead_source" || triggerType === "all_lead_sources";
  const dateAddedFilterAvailable =
    triggerType === "all_lead_sources" ||
    (isLeadSourceTrigger && triggerLeadSourceIds.length > 0);
  const dateAddedRangeIsValid =
    !dateAddedFilterEnabled ||
    (dateAddedFilterAvailable &&
      (!!dateAddedFrom || !!dateAddedTo) &&
      (!dateAddedFrom || !dateAddedTo || dateAddedFrom <= dateAddedTo));
  const activeDateAddedFrom =
    supportsDateAddedFilter && dateAddedFilterEnabled
      ? dateAddedFrom || null
      : null;
  const activeDateAddedTo =
    supportsDateAddedFilter && dateAddedFilterEnabled
      ? dateAddedTo || null
      : null;
  const selectedTrigger =
    TRIGGERS.find(trigger => trigger.value === triggerType) ?? TRIGGERS[0];
  const leadSources = (sourceRows as any[]).map(row => ({
    id: row.ls?.id ?? row.id,
    name: row.ls?.name ?? row.name,
    parentId: row.ls?.parentId ?? row.parentId ?? null,
  })) as LeadSource[];
  const scheduledAt =
    scheduleMode === "scheduled" && scheduledAtInput
      ? new Date(scheduledAtInput)
      : undefined;
  const scheduleIsValid =
    scheduleMode === "now" ||
    (!!scheduledAt && !Number.isNaN(scheduledAt.getTime()));
  const staggerRate = Number(staggerPerHour);
  const staggerIsValid =
    !staggerEnabled ||
    (Number.isInteger(staggerRate) && staggerRate >= 1 && staggerRate <= 360);
  const formIsComplete =
    !!name.trim() &&
    !!body.trim() &&
    (channel === "sms" || !!subject.trim()) &&
    (!isLeadSourceTrigger || triggerLeadSourceIds.length > 0) &&
    (channel === "email" || body.length <= 160) &&
    dateAddedRangeIsValid &&
    scheduleIsValid &&
    staggerIsValid;

  const previewInput = useMemo(
    () => ({
      name: name.trim() || "One-time send",
      channel,
      subject: channel === "email" ? subject.trim() || null : null,
      body: body || " ",
      triggerType,
      triggerLeadSourceIds: isLeadSourceTrigger ? triggerLeadSourceIds : null,
      dateAddedFrom: activeDateAddedFrom,
      dateAddedTo: activeDateAddedTo,
      scheduledAt,
      staggerEnabled,
      staggerPerHour: staggerEnabled ? staggerRate : null,
    }),
    [
      body,
      channel,
      activeDateAddedFrom,
      activeDateAddedTo,
      isLeadSourceTrigger,
      name,
      scheduledAt,
      staggerEnabled,
      staggerRate,
      subject,
      triggerLeadSourceIds,
      triggerType,
    ]
  );
  const preview = trpc.smartPlans.oneTimeSends.preview.useQuery(previewInput, {
    enabled: reviewRequested && formIsComplete,
  });
  const queueSend = trpc.smartPlans.oneTimeSends.queue.useMutation({
    onSuccess: result => {
      const timing = result.scheduledAt
        ? new Date(result.scheduledAt).getTime() > Date.now() + 60_000
          ? `scheduled for ${formatScheduledAt(result.scheduledAt)}`
          : "queued for delivery"
        : "queued for delivery";
      toast.success(
        `${result.totalRecipients.toLocaleString()} ${sendLabel(channel)} recipient${result.totalRecipients === 1 ? "" : "s"} ${timing}`
      );
      onClose();
    },
    onError: error => toast.error(error.message),
  });

  const resetReview = () => {
    setReviewRequested(false);
    setIsReviewing(false);
  };

  const changeChannel = (value: Channel) => {
    setChannel(value);
    setName(current =>
      current === "One-time email" || current === "One-time text"
        ? `One-time ${value === "email" ? "email" : "text"}`
        : current
    );
    resetReview();
  };

  const reviewAudience = () => {
    if (!formIsComplete) {
      if (channel === "sms" && body.length > 160)
        return toast.error("Text messages are limited to 160 characters");
      if (isLeadSourceTrigger && !triggerLeadSourceIds.length)
        return toast.error("Choose at least one lead source");
      if (!dateAddedRangeIsValid) {
        if (!dateAddedFrom && !dateAddedTo)
          return toast.error("Choose a date added range or turn off the filter");
        return toast.error("The date added start must be on or before the end date");
      }
      if (!scheduleIsValid)
        return toast.error("Choose a valid scheduled date and time");
      if (staggerEnabled && !staggerIsValid)
        return toast.error("Enter a whole-number delivery rate from 1 to 360 per hour");
      return toast.error(
        channel === "email" && !subject.trim()
          ? "An email subject is required"
          : "Complete the message details first"
      );
    }
    if (scheduledAt && scheduledAt.getTime() < Date.now() - 60_000) {
      return toast.error("Choose a scheduled date and time that has not already passed");
    }
    setReviewRequested(true);
    setIsReviewing(true);
  };

  const confirmSend = () => {
    if (!preview.data?.recipientCount) return;
    queueSend.mutate({ ...previewInput, confirmed: true });
  };

  const estimatedDurationHours = hourEstimate(
    preview.data?.recipientCount ?? 0,
    staggerEnabled ? staggerRate : 0
  );

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" /> One Time Send
          </DialogTitle>
          <DialogDescription>
            {isReviewing
              ? "Review the audience and confirm before any messages are queued."
              : "Compose one email or text blast using the same Smart Plan trigger audiences."}
          </DialogDescription>
        </DialogHeader>

        {!isReviewing ? (
          <div className="space-y-5 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Message name</Label>
                <Input
                  value={name}
                  onChange={event => {
                    setName(event.target.value);
                    resetReview();
                  }}
                  placeholder="e.g. Under-contract buyer reminder"
                />
              </div>
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select
                  value={channel}
                  onValueChange={value => changeChannel(value as Channel)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">
                      <span className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> Email</span>
                    </SelectItem>
                    <SelectItem value="sms">
                      <span className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" /> Text message</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <div>
                <Label>Audience trigger</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose the same current-contact audience used by Smart Plans.
                </p>
              </div>
              <Select
                value={triggerType}
                onValueChange={value => {
                  setTriggerType(value as TriggerType);
                  resetReview();
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRIGGERS.map(trigger => (
                    <SelectItem key={trigger.value} value={trigger.value}>
                      {trigger.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isLeadSourceTrigger && (
                <div className="space-y-2 pt-1">
                  <Label>Lead sources</Label>
                  <OneTimeLeadSourceAudiencePicker
                    sources={leadSources}
                    selectedIds={triggerLeadSourceIds}
                    onSelectedIdsChange={ids => {
                      setTriggerLeadSourceIds(ids);
                      resetReview();
                    }}
                  />
                </div>
              )}
              {dateAddedFilterAvailable && (
                <div className="space-y-3 border-t pt-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Label htmlFor="one-time-send-date-added-filter">Filter by date added</Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Limit this audience to contacts added to SavvyOS during a selected date range.
                      </p>
                    </div>
                    <Switch
                      id="one-time-send-date-added-filter"
                      checked={dateAddedFilterEnabled}
                      onCheckedChange={checked => {
                        setDateAddedFilterEnabled(checked);
                        resetReview();
                      }}
                    />
                  </div>
                  {dateAddedFilterEnabled && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="one-time-send-date-added-from">Date added from</Label>
                        <Input
                          id="one-time-send-date-added-from"
                          type="date"
                          value={dateAddedFrom}
                          max={dateAddedTo || undefined}
                          onChange={event => {
                            setDateAddedFrom(event.target.value);
                            resetReview();
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="one-time-send-date-added-to">Date added through</Label>
                        <Input
                          id="one-time-send-date-added-to"
                          type="date"
                          value={dateAddedTo}
                          min={dateAddedFrom || undefined}
                          onChange={event => {
                            setDateAddedTo(event.target.value);
                            resetReview();
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground sm:col-span-2">
                        Choose a start date, an end date, or both. These dates only filter Lead Source and All Lead Sources audiences.
                      </p>
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                This blast will target {selectedTrigger.audienceLabel}.
              </p>
            </div>

            <div className="space-y-4 rounded-lg border p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Delivery timing</Label>
                  <Select
                    value={scheduleMode}
                    onValueChange={value => {
                      setScheduleMode(value as ScheduleMode);
                      resetReview();
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="now">Send immediately</SelectItem>
                      <SelectItem value="scheduled">Scheduled time and date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {scheduleMode === "scheduled" && (
                  <div className="space-y-2">
                    <Label htmlFor="one-time-send-at">Scheduled time and date</Label>
                    <Input
                      id="one-time-send-at"
                      type="datetime-local"
                      min={toDateTimeLocal(new Date())}
                      value={scheduledAtInput}
                      onChange={event => {
                        setScheduledAtInput(event.target.value);
                        resetReview();
                      }}
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Scheduled times use your browser&apos;s local time. Delivery begins within five minutes of the selected time.
              </p>

              <div className="flex items-start justify-between gap-4 rounded-md border bg-muted/20 p-3">
                <div>
                  <Label htmlFor="stagger-one-time-send">Stagger delivery</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Optional. Spread messages across an hourly delivery rate instead of sending the full audience at once.
                  </p>
                </div>
                <Switch
                  id="stagger-one-time-send"
                  checked={staggerEnabled}
                  onCheckedChange={checked => {
                    setStaggerEnabled(checked);
                    resetReview();
                  }}
                />
              </div>
              {staggerEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="stagger-per-hour">Messages per hour</Label>
                  <Input
                    id="stagger-per-hour"
                    type="number"
                    min={1}
                    max={360}
                    step={1}
                    value={staggerPerHour}
                    onChange={event => {
                      setStaggerPerHour(event.target.value);
                      resetReview();
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter a whole number from 1 to 360. The audience review shows the estimated total delivery time.
                  </p>
                </div>
              )}
            </div>

            {channel === "email" ? (
              <>
                <div className="space-y-2">
                  <Label>Email subject <span className="text-destructive">*</span></Label>
                  <Input
                    value={subject}
                    onChange={event => {
                      setSubject(event.target.value);
                      resetReview();
                    }}
                    placeholder="A concise, recipient-friendly subject"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email content <span className="text-destructive">*</span></Label>
                  <RichEmailEditor
                    value={body}
                    onChange={value => {
                      setBody(value);
                      resetReview();
                    }}
                    placeholder="Write the email recipients will receive..."
                  />
                  <div className="flex justify-end pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEmailPreviewOpen(true)}
                      disabled={!subject.trim() || !body.replace(/<[^>]+>/g, " ").trim()}
                    >
                      <Eye className="mr-1.5 h-4 w-4" /> Preview email
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Text message <span className="text-destructive">*</span></Label>
                  <span className="text-xs text-muted-foreground">{body.length}/160</span>
                </div>
                <Textarea
                  value={body}
                  maxLength={160}
                  rows={5}
                  onChange={event => {
                    setBody(event.target.value);
                    resetReview();
                  }}
                  placeholder="Write the text message recipients will receive..."
                />
              </div>
            )}
            <div className="flex justify-end pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTestSendOpen(true)}
                disabled={!body.trim() || (channel === "email" && !subject.trim())}
              >
                <Send className="mr-1.5 h-4 w-4" /> Test send
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">Insert:</span>
              {["{{first_name}}", "{{last_name}}", "{{full_name}}", "{{lead_source}}"].map(tag => (
                <button
                  key={tag}
                  type="button"
                  className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary hover:bg-primary/20"
                  onClick={() => {
                    setBody(current => `${current}${tag}`);
                    resetReview();
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
            {channel === "sms" && (
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <p>Text sends use the dedicated Aircall marketing number. Contacts without a phone number, without recorded SMS marketing consent, or marked Do Not Contact or SMS opt-out are excluded before delivery.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-4">
              <p className="text-sm font-medium">{name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {channel === "email" ? `Email: ${subject}` : "Text message"} · {selectedTrigger.label}
              </p>
              {activeDateAddedFrom || activeDateAddedTo ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Date added to SavvyOS: {formatDateAddedRange(activeDateAddedFrom, activeDateAddedTo)}
                </p>
              ) : null}
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" />
                {scheduledAt ? `Scheduled for ${formatScheduledAt(scheduledAt)}` : "Sending immediately"}
                {staggerEnabled && staggerIsValid ? ` · Staggered at ${staggerRate.toLocaleString()} per hour` : ""}
              </p>
            </div>
            {preview.isLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Checking the current audience...</div>
            ) : preview.error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{preview.error.message}</div>
            ) : preview.data ? (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Matching contacts</p><p className="mt-1 text-2xl font-semibold">{preview.data.matchingCount.toLocaleString()}</p></div>
                  <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Eligible contacts</p><p className="mt-1 text-2xl font-semibold">{preview.data.eligibleContactCount.toLocaleString()}</p></div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4"><p className="text-xs text-emerald-700">Messages to send</p><p className="mt-1 text-2xl font-semibold text-emerald-800">{preview.data.recipientCount.toLocaleString()}</p></div>
                  <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Excluded contacts</p><p className="mt-1 text-2xl font-semibold">{preview.data.excludedCount.toLocaleString()}</p></div>
                </div>
                {staggerEnabled && estimatedDurationHours > 0 && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
                    <p className="font-medium">Estimated staggered delivery time</p>
                    <p className="mt-1 text-sky-900/90">
                      {preview.data.recipientCount.toLocaleString()} recipient{preview.data.recipientCount === 1 ? "" : "s"} at {staggerRate.toLocaleString()} per hour will take about {estimatedDurationHours.toLocaleString()} hour{estimatedDurationHours === 1 ? "" : "s"} to send.
                    </p>
                  </div>
                )}
                {preview.data.excludedCount > 0 && (
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="text-sm font-medium">Why contacts are excluded</p>
                    <p className="mt-1 text-xs text-muted-foreground">Contacts are counted once using the first applicable reason.</p>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      {preview.data.exclusionReasons.noEmailAddress > 0 && <p><strong>{preview.data.exclusionReasons.noEmailAddress.toLocaleString()}</strong> without an email address</p>}
                      {preview.data.exclusionReasons.noPhoneAddress > 0 && <p><strong>{preview.data.exclusionReasons.noPhoneAddress.toLocaleString()}</strong> without a phone number</p>}
                      {preview.data.exclusionReasons.bounced > 0 && <p><strong>{preview.data.exclusionReasons.bounced.toLocaleString()}</strong> with a hard-bounced email</p>}
                      {preview.data.exclusionReasons.unsubscribed > 0 && <p><strong>{preview.data.exclusionReasons.unsubscribed.toLocaleString()}</strong> unsubscribed from email</p>}
                      {preview.data.exclusionReasons.doNotContact > 0 && <p><strong>{preview.data.exclusionReasons.doNotContact.toLocaleString()}</strong> marked Do Not Contact</p>}
                      {(preview.data.exclusionReasons as any).smsNoConsent > 0 && <p><strong>{(preview.data.exclusionReasons as any).smsNoConsent.toLocaleString()}</strong> without recorded SMS marketing consent</p>}
                      {(preview.data.exclusionReasons as any).smsOptedOut > 0 && <p><strong>{(preview.data.exclusionReasons as any).smsOptedOut.toLocaleString()}</strong> opted out of marketing SMS</p>}
                      {preview.data.exclusionReasons.emailNotVerified > 0 && <p><strong>{preview.data.exclusionReasons.emailNotVerified.toLocaleString()}</strong> with an unverified email status</p>}
                    </div>
                  </div>
                )}
              </>
            ) : null}
            {preview.data?.recipientCount ? (
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <p>
                  <strong>Final confirmation:</strong> {scheduledAt ? `schedule this one-time ${sendLabel(channel)} send for ${formatScheduledAt(scheduledAt)}` : `queue this one-time ${sendLabel(channel)} send immediately`} to <strong>{preview.data.recipientCount.toLocaleString()}</strong> email or phone recipient{preview.data.recipientCount === 1 ? "" : "s"} across {preview.data.eligibleContactCount.toLocaleString()} eligible contact{preview.data.eligibleContactCount === 1 ? "" : "s"}.
                </p>
              </div>
            ) : null}
          </div>
        )}

        {emailPreviewOpen && <EmailMessagePreviewDialog subject={subject} body={body} onClose={() => setEmailPreviewOpen(false)} />}
        {testSendOpen && <SmartPlanTestSendDialog channel={channel} subject={subject} body={body} onClose={() => setTestSendOpen(false)} />}
        <DialogFooter>
          {!isReviewing ? (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={reviewAudience}><Users className="mr-1.5 h-4 w-4" /> Review audience</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => { setIsReviewing(false); setReviewRequested(false); }}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to edit</Button>
              <Button disabled={!preview.data?.recipientCount || queueSend.isPending} onClick={confirmSend} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="mr-1.5 h-4 w-4" />{queueSend.isPending ? "Queueing..." : scheduledAt ? `Schedule ${preview.data?.recipientCount?.toLocaleString() ?? 0} recipients` : `Queue ${preview.data?.recipientCount?.toLocaleString() ?? 0} recipients`}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
