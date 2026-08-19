import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  ExternalLink,
  Loader2,
  Mail,
  MessageCircleReply,
  MousePointerClick,
  RefreshCw,
  Send,
  TriangleAlert,
  Users,
  XCircle,
} from "lucide-react";

type RecipientStatus = "queued" | "sent" | "skipped" | "failed";
type FilterStatus = "all" | RecipientStatus | "delivered" | "opened" | "clicked" | "replied" | "bounced" | "complained" | "suppressed";

const statusStyles: Record<string, string> = {
  queued: "bg-slate-100 text-slate-700 border-slate-200",
  processing: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  sent: "bg-emerald-100 text-emerald-700 border-emerald-200",
  delivered: "bg-emerald-100 text-emerald-700 border-emerald-200",
  opened: "bg-violet-100 text-violet-700 border-violet-200",
  clicked: "bg-cyan-100 text-cyan-700 border-cyan-200",
  failed: "bg-red-100 text-red-700 border-red-200",
  skipped: "bg-amber-100 text-amber-700 border-amber-200",
  bounced: "bg-red-100 text-red-700 border-red-200",
  complained: "bg-red-100 text-red-700 border-red-200",
  suppressed: "bg-amber-100 text-amber-700 border-amber-200",
  replied: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  cancelled: "bg-slate-100 text-slate-700 border-slate-200",
};

function titleCase(value: string | null | undefined): string {
  return (value ?? "unknown")
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatTime(
  value: Date | string | null | undefined,
  includeTime = true
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "America/New_York",
  }).format(date);
}

function percent(numerator: number, denominator: number): string {
  if (!denominator) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function metricNumber(value: unknown): number {
  return Number(value ?? 0);
}

function StatusBadge({ value }: { value: string | null | undefined }) {
  const label = titleCase(value);
  return (
    <Badge
      variant="outline"
      className={
        statusStyles[value ?? ""] ??
        "bg-slate-100 text-slate-700 border-slate-200"
      }
    >
      {label}
    </Badge>
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2.5 min-w-[104px]">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold leading-none">
        {value.toLocaleString()}
      </div>
      {hint && (
        <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

function recipientActivity(recipient: any): {
  label: string;
  value: string;
  tone: string;
} {
  if (recipient.repliedAt)
    return {
      label: "Replied",
      value: formatTime(recipient.repliedAt),
      tone: "text-fuchsia-700",
    };
  if (recipient.clickedAt || recipient.providerLastEvent === "clicked")
    return {
      label: "Clicked",
      value: recipient.clickedAt
        ? formatTime(recipient.clickedAt)
        : "Provider reports click",
      tone: "text-cyan-700",
    };
  if (
    recipient.openedAt ||
    ["opened", "clicked"].includes(recipient.providerLastEvent)
  )
    return {
      label: "Opened",
      value: recipient.openedAt
        ? formatTime(recipient.openedAt)
        : "Provider reports open",
      tone: "text-violet-700",
    };
  if (
    recipient.deliveredAt ||
    ["delivered", "opened", "clicked"].includes(recipient.providerLastEvent)
  )
    return {
      label: "Delivered",
      value: recipient.deliveredAt
        ? formatTime(recipient.deliveredAt)
        : "Provider reports delivery",
      tone: "text-emerald-700",
    };
  if (recipient.bouncedAt || recipient.providerLastEvent === "bounced")
    return {
      label: "Bounced",
      value: recipient.bouncedAt
        ? formatTime(recipient.bouncedAt)
        : "Provider reports bounce",
      tone: "text-red-700",
    };
  if (recipient.complainedAt || recipient.providerLastEvent === "complained")
    return {
      label: "Complained",
      value: recipient.complainedAt
        ? formatTime(recipient.complainedAt)
        : "Provider reports complaint",
      tone: "text-red-700",
    };
  if (recipient.suppressedAt || recipient.providerLastEvent === "suppressed")
    return {
      label: "Suppressed",
      value: recipient.suppressedAt
        ? formatTime(recipient.suppressedAt)
        : "Provider reports suppression",
      tone: "text-amber-700",
    };
  return {
    label:
      recipient.status === "queued"
        ? "Waiting in queue"
        : titleCase(recipient.status),
    value: recipient.sentAt ? formatTime(recipient.sentAt) : "—",
    tone: "text-muted-foreground",
  };
}

function RecipientHistoryDialog({
  sendId,
  open,
  onOpenChange,
}: {
  sendId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const detailQuery = trpc.smartPlans.oneTimeSends.detail.useQuery(
    {
      sendId,
      page,
      limit: 50,
      status: ["queued", "sent", "skipped", "failed"].includes(filter)
        ? (filter as RecipientStatus)
        : undefined,
      activity: ["delivered", "opened", "clicked", "replied", "bounced", "complained", "suppressed"].includes(filter)
        ? (filter as "delivered" | "opened" | "clicked" | "replied" | "bounced" | "complained" | "suppressed")
        : undefined,
    },
    {
      enabled: open,
      refetchInterval: query => {
        const status = (query.state.data as any)?.send?.status;
        return status === "queued" || status === "processing" ? 5_000 : false;
      },
    }
  );
  const syncMutation =
    trpc.smartPlans.oneTimeSends.syncProviderStatus.useMutation({
      onSuccess: result => {
        toast.success(
          `Refreshed Resend status for ${result.updated} recipient${result.updated === 1 ? "" : "s"}.`
        );
        utils.smartPlans.oneTimeSends.list.invalidate();
        detailQuery.refetch();
      },
      onError: error => toast.error(error.message),
    });
  const data = detailQuery.data as any;
  const send = data?.send;
  const recipients = data?.recipients ?? [];
  const total = metricNumber(data?.totalRecipients);
  const pageCount = Math.max(1, Math.ceil(total / 50));

  const queueCount = send
    ? Math.max(
        0,
        metricNumber(send.totalRecipients) -
          metricNumber(send.sentCount) -
          metricNumber(send.skippedCount) -
          metricNumber(send.failedCount)
      )
    : 0;
  const providerEligible = recipients.filter(
    (row: any) => row.recipient.provider === "resend"
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-[calc(100vw-1rem)] max-h-[96vh] overflow-x-hidden overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Activity className="h-5 w-5" /> One-Time Send Activity{" "}
            {send?.name ? `— ${send.name}` : ""}
          </DialogTitle>
        </DialogHeader>
        {detailQuery.isLoading || !send ? (
          <div className="flex min-h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 py-1">
            <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>
                  {send.channel === "email" ? "Email" : "SMS"} campaign
                </strong>{" "}
                created by{" "}
                {send.createdBy?.name ||
                  send.createdBy?.email ||
                  "Unknown sender"}{" "}
                on {formatTime(send.confirmedAt)}.
              </span>
              <StatusBadge value={send.status} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Metric
                icon={<Users className="h-3.5 w-3.5" />}
                label="Audience"
                value={metricNumber(send.totalRecipients)}
              />
              <Metric
                icon={<Clock3 className="h-3.5 w-3.5" />}
                label="Queued"
                value={queueCount}
                hint={send.status === "processing" ? "Sending now" : undefined}
              />
              <Metric
                icon={<Send className="h-3.5 w-3.5" />}
                label="Accepted"
                value={metricNumber(send.sentCount)}
              />
              <Metric
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                label="Delivered"
                value={metricNumber(send.deliveredCount)}
                hint={percent(
                  metricNumber(send.deliveredCount),
                  metricNumber(send.sentCount)
                )}
              />
              <Metric
                icon={<Eye className="h-3.5 w-3.5" />}
                label="Opened"
                value={metricNumber(send.openedCount)}
                hint={percent(
                  metricNumber(send.openedCount),
                  metricNumber(send.deliveredCount) ||
                    metricNumber(send.sentCount)
                )}
              />
              <Metric
                icon={<MousePointerClick className="h-3.5 w-3.5" />}
                label="Clicked"
                value={metricNumber(send.clickedCount)}
              />
              <Metric
                icon={<MessageCircleReply className="h-3.5 w-3.5" />}
                label="Replied"
                value={metricNumber(send.repliedCount)}
              />
              <Metric
                icon={<TriangleAlert className="h-3.5 w-3.5" />}
                label="Failed"
                value={metricNumber(send.failedCount)}
              />
              <Metric
                icon={<XCircle className="h-3.5 w-3.5" />}
                label="Skipped"
                value={metricNumber(send.skippedCount)}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  SUBJECT
                </p>
                <p className="mt-1 font-medium break-words">
                  {send.subject || "No subject"}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  QUEUE TIMELINE
                </p>
                <p className="mt-1">
                  Started {formatTime(send.startedAt)} · Completed{" "}
                  {formatTime(send.completedAt)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This view refreshes automatically while the batch is queued or
                  processing.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-medium text-sm">Resend provider status</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Refreshes the latest state for up to 100 accepted recipients.
                  Future delivery and engagement events arrive automatically
                  through the provider event stream.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => syncMutation.mutate({ sendId })}
                disabled={syncMutation.isPending || providerEligible === 0}
              >
                {syncMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                )}
                Refresh Resend Status
              </Button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold">Recipient activity</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Showing {recipients.length} of {total.toLocaleString()}{" "}
                  selected recipient addresses.
                </p>
              </div>
              <Select
                value={filter}
                onValueChange={value => {
                  setFilter(value as FilterStatus);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Filter recipients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All recipients</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="sent">Accepted</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="opened">Opened</SelectItem>
                  <SelectItem value="clicked">Clicked</SelectItem>
                  <SelectItem value="replied">Replied</SelectItem>
                  <SelectItem value="bounced">Bounced</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Contact</th>
                    <th className="p-3 font-medium">Address</th>
                    <th className="p-3 font-medium">Queue status</th>
                    <th className="p-3 font-medium">Provider / activity</th>
                    <th className="p-3 font-medium">Sent</th>
                    <th className="p-3 font-medium">Events</th>
                    <th className="p-3 font-medium">Issue</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recipients.map((row: any) => {
                    const recipient = row.recipient;
                    const contact = row.contact;
                    const activity = recipientActivity(recipient);
                    const events = row.events ?? [];
                    const contactName =
                      [contact.firstName, contact.lastName]
                        .filter(Boolean)
                        .join(" ") || "Unnamed contact";
                    return (
                      <tr key={recipient.id} className="align-top">
                        <td className="p-3 font-medium">{contactName}</td>
                        <td className="p-3 text-muted-foreground break-all">
                          {recipient.recipientAddress}
                        </td>
                        <td className="p-3">
                          <StatusBadge value={recipient.status} />
                        </td>
                        <td className={`p-3 ${activity.tone}`}>
                          <p className="font-medium">{activity.label}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {activity.value}
                            {recipient.providerStatusCheckedAt
                              ? ` · checked ${formatTime(recipient.providerStatusCheckedAt)}`
                              : ""}
                          </p>
                          {recipient.providerMessageId && (
                            <p className="mt-1 font-mono text-[10px] text-muted-foreground break-all">
                              {recipient.providerMessageId}
                            </p>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground whitespace-nowrap">
                          {formatTime(recipient.sentAt)}
                        </td>
                        <td className="p-3">
                          <div className="space-y-1">
                            {events.length > 0 ? (
                              events.slice(0, 3).map((event: any) => (
                                <p key={event.id} className="text-xs">
                                  <span className="font-medium">
                                    {titleCase(event.eventType)}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {" "}
                                    · {formatTime(event.occurredAt)}
                                  </span>
                                </p>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                No stored provider events yet
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-xs text-destructive max-w-56 break-words">
                          {recipient.errorMessage || "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {recipients.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="p-10 text-center text-muted-foreground"
                      >
                        No recipients match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-2 text-sm">
              <span className="mr-auto text-muted-foreground">
                Page {page} of {pageCount}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage(current => Math.max(1, current - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setPage(current => Math.min(pageCount, current + 1))
                }
                disabled={page >= pageCount}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Open tracking is an engagement signal and may be limited by
              privacy settings or email-client image blocking. Reply
              identification requires a reply-enabled campaign address.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function OneTimeSmartPlanSendHistory() {
  const { data: sendRows = [], isLoading } =
    trpc.smartPlans.oneTimeSends.list.useQuery(undefined, {
      refetchInterval: 5_000,
    });
  const [selectedSendId, setSelectedSendId] = useState<number | null>(null);
  const sends = useMemo(() => sendRows as any[], [sendRows]);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" /> One-Time Send History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading one-time
              sends…
            </div>
          ) : sends.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">
              No one-time Smart Plan sends have been queued yet.
            </div>
          ) : (
            <div className="divide-y rounded-lg border">
              {sends.map((row: any) => {
                const send = row.send;
                const queueCount = Math.max(
                  0,
                  metricNumber(send.totalRecipients) -
                    metricNumber(send.sentCount) -
                    metricNumber(send.skippedCount) -
                    metricNumber(send.failedCount)
                );
                return (
                  <div
                    key={send.id}
                    className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{send.name}</p>
                        <StatusBadge value={send.status} />
                        <Badge variant="outline">
                          {titleCase(send.channel)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground break-words">
                        {send.subject || "No subject"}
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Queued by{" "}
                        {row.createdBy?.name ||
                          row.createdBy?.email ||
                          "Unknown sender"}{" "}
                        · {formatTime(send.confirmedAt)} ·{" "}
                        {metricNumber(send.totalRecipients).toLocaleString()}{" "}
                        recipient addresses
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground lg:justify-end">
                      <span>
                        <strong className="text-foreground">
                          {queueCount}
                        </strong>{" "}
                        queued
                      </span>
                      <span>
                        <strong className="text-foreground">
                          {metricNumber(send.sentCount)}
                        </strong>{" "}
                        accepted
                      </span>
                      <span>
                        <strong className="text-foreground">
                          {metricNumber(send.openedCount)}
                        </strong>{" "}
                        opened
                      </span>
                      <span>
                        <strong className="text-foreground">
                          {metricNumber(send.repliedCount)}
                        </strong>{" "}
                        replied
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedSendId(send.id)}
                      >
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> View
                        activity
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {selectedSendId && (
        <RecipientHistoryDialog
          sendId={selectedSendId}
          open={Boolean(selectedSendId)}
          onOpenChange={open => {
            if (!open) setSelectedSendId(null);
          }}
        />
      )}
    </>
  );
}
