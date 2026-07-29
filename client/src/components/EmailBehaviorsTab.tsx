/**
 * EmailBehaviorsTab
 *
 * Displays a unified list of email activity for a contact, sourced from
 * both Resend (SavvyOS system emails) and GoHighLevel (GHL campaign/workflow emails).
 * Shows source, to/from, subject, sent time, and delivery/engagement status.
 */
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, RefreshCw, AlertCircle, CheckCircle2, MousePointerClick, Eye, XCircle, Clock, Send } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailBehavior {
  id: number;
  contactId: number | null;
  source: "resend" | "ghl";
  externalId: string;
  toEmail: string;
  fromEmail: string | null;
  subject: string | null;
  direction: "outbound" | "inbound";
  status: string | null;
  openedAt: string | Date | null;
  clickedAt: string | Date | null;
  ghlConversationId: string | null;
  ghlMessageSource: string | null;
  sentAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusConfig(status: string | null, openedAt: unknown, clickedAt: unknown) {
  if (clickedAt) {
    return {
      label: "Clicked",
      icon: <MousePointerClick className="h-3 w-3" />,
      className: "bg-purple-100 text-purple-700 border-purple-200",
    };
  }
  if (openedAt) {
    return {
      label: "Opened",
      icon: <Eye className="h-3 w-3" />,
      className: "bg-blue-100 text-blue-700 border-blue-200",
    };
  }
  const s = (status ?? "").toLowerCase();
  if (s === "delivered") {
    return {
      label: "Delivered",
      icon: <CheckCircle2 className="h-3 w-3" />,
      className: "bg-green-100 text-green-700 border-green-200",
    };
  }
  if (s === "bounced") {
    return {
      label: "Bounced",
      icon: <XCircle className="h-3 w-3" />,
      className: "bg-red-100 text-red-700 border-red-200",
    };
  }
  if (s === "failed") {
    return {
      label: "Failed",
      icon: <AlertCircle className="h-3 w-3" />,
      className: "bg-red-100 text-red-700 border-red-200",
    };
  }
  if (s === "sent") {
    return {
      label: "Sent",
      icon: <Send className="h-3 w-3" />,
      className: "bg-gray-100 text-gray-600 border-gray-200",
    };
  }
  return {
    label: status ?? "Unknown",
    icon: <Clock className="h-3 w-3" />,
    className: "bg-gray-100 text-gray-500 border-gray-200",
  };
}

function SourceBadge({ source }: { source: "resend" | "ghl" }) {
  if (source === "resend") {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">
        Resend
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200">
      GHL
    </span>
  );
}

function formatSentAt(sentAt: string | Date | null | undefined): string {
  if (!sentAt) return "—";
  try {
    const d = new Date(sentAt);
    return format(d, "MMM d, yyyy h:mm a");
  } catch {
    return "—";
  }
}

function formatRelative(date: string | Date | null | undefined): string {
  if (!date) return "";
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return "";
  }
}

function truncate(str: string | null | undefined, max: number): string {
  if (!str) return "(no subject)";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

// ─── Email Row ────────────────────────────────────────────────────────────────

function EmailBehaviorRow({ item }: { item: EmailBehavior }) {
  const statusConfig = getStatusConfig(item.status, item.openedAt, item.clickedAt);
  const isInbound = item.direction === "inbound";

  return (
    <div className="flex items-start gap-3 py-3 px-4 border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
      {/* Icon */}
      <div className="mt-0.5 flex-shrink-0">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isInbound ? "bg-indigo-100" : "bg-cyan-100"}`}>
          <Mail className={`h-3.5 w-3.5 ${isInbound ? "text-indigo-600" : "text-cyan-600"}`} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <SourceBadge source={item.source} />
          <span className="text-xs text-gray-500 capitalize">{item.direction}</span>
          {item.ghlMessageSource && item.ghlMessageSource !== "unknown" && (
            <span className="text-[10px] text-gray-400 italic">{item.ghlMessageSource}</span>
          )}
        </div>

        {/* Subject */}
        <p className="text-sm font-medium text-gray-800 leading-snug truncate">
          {truncate(item.subject, 80)}
        </p>

        {/* To / From */}
        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
          {item.fromEmail && (
            <span>
              <span className="text-gray-400">From:</span>{" "}
              <span className="text-gray-600">{item.fromEmail.replace(/<[^>]+>/, "").trim()}</span>
            </span>
          )}
          <span>
            <span className="text-gray-400">To:</span>{" "}
            <span className="text-gray-600">{item.toEmail}</span>
          </span>
        </div>

        {/* Timestamps */}
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
          <span title={formatSentAt(item.sentAt)}>
            {formatSentAt(item.sentAt)}
          </span>
          {item.openedAt && (
            <span className="text-blue-500">
              Opened {formatRelative(item.openedAt)}
            </span>
          )}
          {item.clickedAt && (
            <span className="text-purple-500">
              Clicked {formatRelative(item.clickedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Status badge */}
      <div className="flex-shrink-0 mt-0.5">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${statusConfig.className}`}
        >
          {statusConfig.icon}
          {statusConfig.label}
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface EmailBehaviorsTabProps {
  /** Pass contactId to load via contact */
  contactId?: number;
  /** Pass connectionId to load via agent connection */
  connectionId?: number;
}

export default function EmailBehaviorsTab({ contactId, connectionId }: EmailBehaviorsTabProps) {
  // Choose the right query based on what was passed
  const contactQuery = trpc.emailBehaviors.listForContact.useQuery(
    { contactId: contactId! },
    { enabled: !!contactId && !connectionId },
  );
  const connectionQuery = trpc.emailBehaviors.listForConnection.useQuery(
    { connectionId: connectionId! },
    { enabled: !!connectionId },
  );

  const { data, isLoading, error, refetch } = contactId && !connectionId
    ? contactQuery
    : connectionQuery;

  const emails = (data ?? []) as EmailBehavior[];

  // Group by source for summary counts
  const resendCount = emails.filter((e) => e.source === "resend").length;
  const ghlCount = emails.filter((e) => e.source === "ghl").length;
  const openedCount = emails.filter((e) => e.openedAt).length;
  const clickedCount = emails.filter((e) => e.clickedAt).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
        Loading email behaviors…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-8 px-4 text-red-500 text-sm">
        <AlertCircle className="h-4 w-4" />
        Failed to load email behaviors.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with summary stats */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-500">
            {emails.length} email{emails.length !== 1 ? "s" : ""} total
          </span>
          {resendCount > 0 && (
            <span className="text-xs text-cyan-600 bg-cyan-50 border border-cyan-200 rounded px-2 py-0.5">
              {resendCount} Resend
            </span>
          )}
          {ghlCount > 0 && (
            <span className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-2 py-0.5">
              {ghlCount} GHL
            </span>
          )}
          {openedCount > 0 && (
            <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
              <Eye className="h-3 w-3 inline mr-0.5" />
              {openedCount} opened
            </span>
          )}
          {clickedCount > 0 && (
            <span className="text-xs text-purple-600 bg-purple-50 border border-purple-200 rounded px-2 py-0.5">
              <MousePointerClick className="h-3 w-3 inline mr-0.5" />
              {clickedCount} clicked
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="h-7 px-2 text-xs text-gray-500"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Email list */}
      {emails.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 border border-dashed border-gray-200 rounded-lg">
          <Mail className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">No email activity found for this contact.</p>
          <p className="text-xs mt-1 text-gray-400">
            Emails from Resend and GoHighLevel will appear here once synced.
          </p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          {emails.map((item) => (
            <EmailBehaviorRow key={`${item.source}-${item.externalId}`} item={item} />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 px-1 pt-1 text-xs text-gray-400 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
          Resend = SavvyOS system emails
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
          GHL = GoHighLevel campaign / workflow emails
        </span>
      </div>
    </div>
  );
}
