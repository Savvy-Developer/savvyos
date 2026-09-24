import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Loader2,
  Mail,
  Send,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

/**
 * Website Studio > Daily Email.
 *
 * The 5 PM new-listings email, rebuilt from SavvyOS properties. Four parts,
 * top to bottom in the order someone uses them: settings, today's review
 * queue, preview and test, and how past sends did.
 */

const hourLabel = (hour: number) => {
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix} Eastern`;
};

const money = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(parsed);
};

const shortDate = (value: unknown) => {
  if (!value) return "";
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
};

const STATUS_STYLE: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  failed: "bg-rose-100 text-rose-800",
  skipped: "bg-slate-100 text-slate-600",
  sending: "bg-cyan-100 text-cyan-800",
};

export function DailyEmailPanel() {
  const utils = trpc.useUtils();
  const overview = trpc.website.dailyEmailOverview.useQuery();
  const data = overview.data;

  // ── Settings form ──────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    enabled: false,
    sendHourEt: 17,
    segmentIds: [] as string[],
    internalRecipients: "",
    personalEmailsEnabled: true,
    subjectTemplate: "",
    introText: "",
  });
  const [manualSegment, setManualSegment] = useState("");

  useEffect(() => {
    if (!data?.settings) return;
    setForm({
      enabled: data.settings.enabled,
      sendHourEt: data.settings.sendHourEt,
      segmentIds: data.settings.segmentIds,
      internalRecipients: data.settings.internalRecipients.join(", "),
      personalEmailsEnabled: data.settings.personalEmailsEnabled,
      subjectTemplate: data.settings.subjectTemplate ?? "",
      introText: data.settings.introText ?? "",
    });
  }, [data?.settings]);

  const saveSettings = trpc.website.saveDailyEmailSettings.useMutation({
    onSuccess: () => {
      toast.success("Daily email settings saved");
      void utils.website.dailyEmailOverview.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const toggleSegment = (id: string, on: boolean) =>
    setForm(current => ({
      ...current,
      segmentIds: on
        ? Array.from(new Set([...current.segmentIds, id]))
        : current.segmentIds.filter(item => item !== id),
    }));

  // Segments already chosen but not in Resend's list (typed in by hand, or
  // since renamed) still show, so they can be seen and removed.
  const segmentOptions = useMemo(() => {
    const known = data?.segments ?? [];
    const extra = form.segmentIds
      .filter(id => !known.some(segment => segment.id === id))
      .map(id => ({ id, name: id }));
    return [...known, ...extra];
  }, [data?.segments, form.segmentIds]);

  // ── Review queue ───────────────────────────────────────────────────────────
  const setApproval = trpc.website.setDailyEmailApproval.useMutation({
    onSuccess: () => {
      void utils.website.dailyEmailOverview.invalidate();
      void utils.website.previewDailyEmail.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const queue = data?.queue ?? [];
  const approvedCount = queue.filter(item => item.approved).length;

  // ── Preview, test, send ────────────────────────────────────────────────────
  const [showPreview, setShowPreview] = useState(false);
  const preview = trpc.website.previewDailyEmail.useQuery(undefined, {
    enabled: showPreview,
  });
  const [testTo, setTestTo] = useState("");
  const sendTest = trpc.website.sendDailyEmailTest.useMutation({
    onSuccess: result => {
      if (result.status === "sent") toast.success(result.message);
      else toast.error(result.message);
      void utils.website.dailyEmailOverview.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const [confirmSend, setConfirmSend] = useState(false);
  const sendNow = trpc.website.sendDailyEmailNow.useMutation({
    onSuccess: result => {
      if (result.status === "sent") toast.success(result.message);
      else if (result.status === "partial") toast.warning(result.message);
      else toast.error(result.message);
      void utils.website.dailyEmailOverview.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  // ── AI review ──────────────────────────────────────────────────────────────
  const [review, setReview] = useState<string | null>(null);
  // ── Price drop alerts ──────────────────────────────────────────────────────
  const setPriceDrops = trpc.website.setPriceDropAlerts.useMutation({
    onSuccess: (_result, variables) => {
      toast.success(variables.enabled ? "Price drop alerts on" : "Price drop alerts off");
      void utils.website.dailyEmailOverview.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const [priceTestTo, setPriceTestTo] = useState("");
  const sendPriceTest = trpc.website.sendPriceDropTest.useMutation({
    onSuccess: result => (result.sent ? toast.success(result.message) : toast.error(result.message)),
    onError: error => toast.error(error.message),
  });

  const analyze = trpc.website.analyzeDailyEmail.useMutation({
    onSuccess: result => setReview(result.review),
    onError: error => toast.error(error.message),
  });

  if (overview.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the daily email
      </div>
    );
  }
  if (overview.error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-rose-700">
          {overview.error.message}
        </CardContent>
      </Card>
    );
  }

  const runs = data?.analytics.runs ?? [];
  const realRuns = runs.filter(run => run.trigger !== "test");
  const topProperties = data?.analytics.topProperties ?? [];

  return (
    <div className="space-y-6">
      {/* ── Status ─────────────────────────────────────────────────────── */}
      {!data?.masterSwitch ? (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Sending is switched off on the server.</p>
            <p className="mt-1">
              Nothing goes to the list yet. You can still approve listings,
              preview the email and send tests to yourself. When the test
              emails look right, a developer turns on
              DAILY_PROPERTY_EMAIL_ENABLED and the timed send starts.
            </p>
          </div>
        </div>
      ) : !data?.settings.enabled ? (
        <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <Mail className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            The timed send is off. Turn on "Send every day" below to send the
            approved listings at {hourLabel(form.sendHourEt)}.
          </p>
        </div>
      ) : (
        <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            On. Approved listings go out every day at{" "}
            {hourLabel(data.settings.sendHourEt)}. Days with nothing approved
            send nothing.
          </p>
        </div>
      )}

      {/* ── Review queue ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Today's listings</CardTitle>
          <CardDescription>
            Newly published properties wait here. Only the ticked ones go out
            in the next email. Once sent, a listing leaves this list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {queue.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
              No new listings waiting. Publish a property on the website and it
              appears here.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-slate-700">
                  {approvedCount} of {queue.length} ticked
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={setApproval.isPending || approvedCount === queue.length}
                  onClick={() =>
                    setApproval.mutate({
                      propertyIds: queue.map(item => item.propertyId),
                      approved: true,
                    })
                  }
                >
                  Tick all
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={setApproval.isPending || approvedCount === 0}
                  onClick={() =>
                    setApproval.mutate({
                      propertyIds: queue
                        .filter(item => item.approved)
                        .map(item => item.propertyId),
                      approved: false,
                    })
                  }
                >
                  Clear
                </Button>
              </div>
              <div className="divide-y rounded-lg border">
                {queue.map(item => (
                  <label
                    key={item.propertyId}
                    className="flex cursor-pointer items-center gap-3 p-3 hover:bg-slate-50"
                  >
                    <Checkbox
                      checked={item.approved}
                      disabled={setApproval.isPending}
                      onCheckedChange={checked =>
                        setApproval.mutate({
                          propertyIds: [item.propertyId],
                          approved: checked === true,
                        })
                      }
                    />
                    {item.heroImageUrl ? (
                      <img
                        src={item.heroImageUrl}
                        alt=""
                        className="h-12 w-16 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="h-12 w-16 shrink-0 rounded bg-slate-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {item.headline || item.address || item.slug}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {[item.city, item.state].filter(Boolean).join(", ")}
                        {money(item.listPrice) ? ` · ${money(item.listPrice)}` : ""}
                        {item.publishedAt ? ` · published ${shortDate(item.publishedAt)}` : ""}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Preview, test and send ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Preview and test</CardTitle>
          <CardDescription>
            See the email before it goes out, and send a test to yourself. A
            test never goes to the list and never marks a listing as sent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowPreview(true);
                void preview.refetch();
              }}
            >
              <Eye className="mr-2 h-4 w-4" /> Show preview
            </Button>
            <div className="min-w-[240px] flex-1 space-y-1">
              <Label htmlFor="daily-email-test">Send a test to</Label>
              <Input
                id="daily-email-test"
                placeholder="you@savvy.realty"
                value={testTo}
                onChange={event => setTestTo(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              disabled={sendTest.isPending || !testTo.trim()}
              onClick={() => sendTest.mutate({ recipients: testTo })}
            >
              {sendTest.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              Send test
            </Button>
            <Button
              disabled={!data?.masterSwitch || approvedCount === 0 || sendNow.isPending}
              onClick={() => setConfirmSend(true)}
              title={
                !data?.masterSwitch
                  ? "Sending is switched off on the server"
                  : approvedCount === 0
                    ? "Tick at least one listing first"
                    : undefined
              }
            >
              {sendNow.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send now
            </Button>
          </div>
          {showPreview && (
            <div className="space-y-2">
              {preview.isFetching && !preview.data ? (
                <p className="text-sm text-slate-500">Building the preview</p>
              ) : preview.data ? (
                <>
                  <p className="text-sm text-slate-600">
                    <span className="font-semibold">Subject:</span>{" "}
                    {preview.data.subject}
                    {!preview.data.usingApproved && preview.data.listingCount > 0 && (
                      <span className="ml-2 text-amber-700">
                        (Nothing ticked yet, so this shows a sample of{" "}
                        {preview.data.listingCount} listing
                        {preview.data.listingCount === 1 ? "" : "s"}.)
                      </span>
                    )}
                  </p>
                  {preview.data.listingCount === 0 ? (
                    <p className="text-sm text-slate-500">
                      No listings to preview yet.
                    </p>
                  ) : (
                    <iframe
                      title="Daily email preview"
                      srcDoc={preview.data.html}
                      sandbox=""
                      className="h-[640px] w-full rounded-lg border bg-white"
                    />
                  )}
                </>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Settings ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Who gets the email, when, and what it says.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-sm font-semibold">Send every day</p>
              <p className="text-xs text-slate-500">
                Sends the ticked listings once a day at the time below.
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={enabled => setForm(current => ({ ...current, enabled }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Send time</Label>
              <Select
                value={String(form.sendHourEt)}
                onValueChange={value =>
                  setForm(current => ({ ...current, sendHourEt: Number(value) }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, hour) => (
                    <SelectItem key={hour} value={String(hour)}>
                      {hourLabel(hour)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="daily-email-subject">Subject line</Label>
              <Input
                id="daily-email-subject"
                placeholder="{count} new STR investment properties"
                value={form.subjectTemplate}
                onChange={event =>
                  setForm(current => ({ ...current, subjectTemplate: event.target.value }))
                }
              />
              <p className="text-xs text-slate-500">
                {"{count}"} becomes the number of listings. Leave blank for the
                default.
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="daily-email-intro">Opening line</Label>
            <Textarea
              id="daily-email-intro"
              rows={2}
              placeholder="Here are the newest short-term rental properties on Savvy STR Agents."
              value={form.introText}
              onChange={event =>
                setForm(current => ({ ...current, introText: event.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Email lists (Resend segments)</Label>
            <p className="text-xs text-slate-500">
              The big list. One shared email goes to each list ticked here.
            </p>
            {data?.segmentsError && (
              <p className="text-xs text-rose-700">
                Could not load the lists from Resend: {data.segmentsError}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {segmentOptions.map(segment => (
                <label
                  key={segment.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm"
                >
                  <Checkbox
                    checked={form.segmentIds.includes(segment.id)}
                    onCheckedChange={checked => toggleSegment(segment.id, checked === true)}
                  />
                  <span className="truncate">{segment.name}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Or paste a segment ID"
                value={manualSegment}
                onChange={event => setManualSegment(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!manualSegment.trim()}
                onClick={() => {
                  toggleSegment(manualSegment.trim(), true);
                  setManualSegment("");
                }}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-sm font-semibold">Personal emails to website accounts</p>
              <p className="text-xs text-slate-500">
                Investors with an account also get their own email with only
                the listings that match their budget, bedrooms and markets.
              </p>
            </div>
            <Switch
              checked={form.personalEmailsEnabled}
              onCheckedChange={personalEmailsEnabled =>
                setForm(current => ({ ...current, personalEmailsEnabled }))
              }
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="daily-email-internal">Team copy</Label>
            <Input
              id="daily-email-internal"
              placeholder="tyler@savvy.realty, marketing@savvy.realty"
              value={form.internalRecipients}
              onChange={event =>
                setForm(current => ({ ...current, internalRecipients: event.target.value }))
              }
            />
            <p className="text-xs text-slate-500">
              These people get a copy of every send, so someone sees what went out.
            </p>
          </div>

          <Button
            disabled={saveSettings.isPending}
            onClick={() =>
              saveSettings.mutate({
                enabled: form.enabled,
                sendHourEt: form.sendHourEt,
                segmentIds: form.segmentIds,
                internalRecipients: form.internalRecipients,
                personalEmailsEnabled: form.personalEmailsEnabled,
                subjectTemplate: form.subjectTemplate.trim() || null,
                introText: form.introText.trim() || null,
              })
            }
          >
            {saveSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save settings
          </Button>
        </CardContent>
      </Card>

      {/* ── Analytics ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>How the emails did</CardTitle>
          <CardDescription>
            Opens and clickers are people, counted once per email. New
            accounts are website sign-ups in the 24 hours after a send.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {runs.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
              No sends yet. Results show here after the first email.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Sent</th>
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2 text-right">Properties</th>
                    <th className="px-3 py-2 text-right">Opens</th>
                    <th className="px-3 py-2 text-right">Clickers</th>
                    <th className="px-3 py-2 text-right">New accounts</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {runs.map(run => (
                    <tr key={run.id} className={run.trigger === "test" ? "text-slate-400" : ""}>
                      <td className="whitespace-nowrap px-3 py-2">
                        {shortDate(run.sentAt) || run.runDate}
                        {run.trigger !== "scheduled" && (
                          <span className="ml-1 text-xs">({run.trigger})</span>
                        )}
                      </td>
                      <td className="max-w-[260px] truncate px-3 py-2" title={run.subject ?? ""}>
                        {run.subject || "(none)"}
                      </td>
                      <td className="px-3 py-2 text-right">{run.propertyCount}</td>
                      <td className="px-3 py-2 text-right">{run.opens}</td>
                      <td className="px-3 py-2 text-right">{run.clickers}</td>
                      <td className="px-3 py-2 text-right">
                        {run.trigger === "test" ? "" : run.newAccountsNext24h}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="secondary"
                          className={STATUS_STYLE[run.status] ?? ""}
                          title={[run.note, run.error].filter(Boolean).join(" ") || undefined}
                        >
                          {run.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {topProperties.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800">Most clicked properties</p>
              <div className="divide-y rounded-lg border">
                {topProperties.map(item => (
                  <div key={item.slug} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="truncate">{item.headline}</span>
                    <span className="shrink-0 font-semibold">
                      {item.clicks} {item.clicks === 1 ? "click" : "clicks"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3 rounded-lg border bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">AI review</p>
                <p className="text-xs text-slate-500">
                  A plain-English read of the last month: what works, what to try.
                </p>
              </div>
              <Button
                variant="outline"
                disabled={analyze.isPending || realRuns.length < 2}
                title={realRuns.length < 2 ? "Needs at least two real sends" : undefined}
                onClick={() => analyze.mutate()}
              >
                {analyze.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Review with AI
              </Button>
            </div>
            {review && (
              <div className="whitespace-pre-wrap rounded-md bg-white p-3 text-sm text-slate-700">
                {review}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Price drop alerts ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Price drop alerts</CardTitle>
          <CardDescription>
            When a live listing's price drops by $1,000 or more, investors who
            viewed it in the last 90 days or saved it get one email with the
            old and new price. Each drop is sent once. People who turned email
            off or unsubscribed are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-sm font-semibold">Send price drop alerts</p>
              <p className="text-xs text-slate-500">
                {data?.masterSwitch
                  ? "Checked every 30 minutes. Sends straight away when a drop is found."
                  : "Sending is switched off on the server, so nothing goes out yet even when this is on."}
              </p>
            </div>
            <Switch
              checked={!!data?.priceDropAlerts?.enabled}
              disabled={setPriceDrops.isPending}
              onCheckedChange={enabled => setPriceDrops.mutate({ enabled })}
            />
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1 space-y-1">
              <Label htmlFor="price-drop-test">Send a test alert to</Label>
              <Input
                id="price-drop-test"
                placeholder="you@savvy.realty"
                value={priceTestTo}
                onChange={event => setPriceTestTo(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              disabled={sendPriceTest.isPending || !priceTestTo.trim()}
              onClick={() => sendPriceTest.mutate({ recipients: priceTestTo })}
            >
              {sendPriceTest.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              Send test
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            The test uses the newest live listing with a made-up 5% drop. It is
            not recorded and changes nothing.
          </p>

          {(data?.priceDropAlerts?.recent ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-slate-500">
              No price drops yet.
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {(data?.priceDropAlerts?.recent ?? []).map((alert: any) => (
                <div key={alert.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{alert.name}</p>
                    <p className="text-xs text-slate-500">
                      {money(alert.oldPrice)} to {money(alert.newPrice)} · {shortDate(alert.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">
                      {alert.status === "no_recipients"
                        ? "Nobody to email"
                        : `${alert.sent} of ${alert.recipients} emailed`}
                    </span>
                    <Badge variant="secondary" className={STATUS_STYLE[alert.status] ?? ""}>
                      {alert.status === "no_recipients" ? "none" : alert.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send today's email now?</AlertDialogTitle>
            <AlertDialogDescription>
              {approvedCount} ticked listing{approvedCount === 1 ? "" : "s"} will
              go to {data?.settings.segmentIds.length ?? 0} email list
              {data?.settings.segmentIds.length === 1 ? "" : "s"}
              {data?.settings.personalEmailsEnabled ? " and to matching website accounts" : ""}.
              This uses the saved settings, so save any changes first.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => sendNow.mutate()}>Send now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
