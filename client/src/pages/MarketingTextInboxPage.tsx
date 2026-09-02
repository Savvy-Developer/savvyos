import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SpeedToLeadStats } from "@/components/SpeedToLeadStats";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CheckCheck,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Inbox,
  Loader2,
  MailOpen,
  MessageSquare,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
  UserRoundPlus,
} from "lucide-react";

type MarketingThread = {
  id: number;
  contactId: number | null;
  direction: "inbound" | "outbound";
  status: string;
  body: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  sentAt: Date | string | null;
  receivedAt: Date | string | null;
  createdAt: Date | string;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactPhone: string | null;
  doNotContact: boolean | null;
  smsMarketingOptedOutAt: Date | string | null;
  archivedAt: Date | string | null;
  isUnread: boolean;
  awaitingReply: boolean;
  awaitingReplySince: Date | string | null;
};

type MarketingMessage = {
  id: number;
  direction: "inbound" | "outbound";
  body: string | null;
  sentAt: Date | string | null;
  receivedAt: Date | string | null;
  createdAt: Date | string;
  smartPlanName?: string | null;
  smartPlanStepOrder?: number | null;
  sentByName?: string | null;
  isGroupMessage?: boolean;
  groupAgentName?: string | null;
  autoFollowUpId?: number | null;
  autoFollowUpDueAt?: Date | string | null;
};

type IntroductionFollowUp = {
  id: number;
  body: string;
  dueAt: Date | string;
  status: "queued" | "processing" | "sent" | "skipped" | "failed";
  sentAt: Date | string | null;
  aircallMessageId: string | null;
  errorMessage: string | null;
  agentName: string | null;
  createdByName: string | null;
};

type IntroductionDraft = {
  groupText: string;
  emailSubject: string;
  emailBody: string;
  contextSummary: string;
};

function formatTime(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatElapsed(
  value: Date | string | null | undefined,
  now = Date.now()
) {
  if (!value) return "";
  const startedAt = new Date(value).getTime();
  if (Number.isNaN(startedAt)) return "";
  const minutes = Math.max(0, Math.floor((now - startedAt) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
  const days = Math.floor(hours / 24);
  return `${days}d${hours % 24 ? ` ${hours % 24}h` : ""}`;
}

function toDateTimeLocal(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function contactName(thread: MarketingThread) {
  const name =
    `${thread.contactFirstName ?? ""} ${thread.contactLastName ?? ""}`.trim();
  return (
    name ||
    thread.contactPhone ||
    thread.fromNumber ||
    thread.toNumber ||
    "Unmatched number"
  );
}

export default function MarketingTextInboxPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<number | null>(
    null
  );
  const [selectedNumberId, setSelectedNumberId] = useState("");
  const [reply, setReply] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [archiveOnFinish, setArchiveOnFinish] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [groupText, setGroupText] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [contextSummary, setContextSummary] = useState("");
  const [appointmentSet, setAppointmentSet] = useState(false);
  const [autoFollowUp, setAutoFollowUp] = useState(false);
  const [followUpDelayHours, setFollowUpDelayHours] = useState("24");
  const [followUpBody, setFollowUpBody] = useState("");
  const [editingFollowUpId, setEditingFollowUpId] = useState<number | null>(
    null
  );
  const [editingFollowUpBody, setEditingFollowUpBody] = useState("");
  const [editingFollowUpDueAt, setEditingFollowUpDueAt] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const conversationScrollRef = useRef<HTMLDivElement>(null);
  const isAdmin = user?.role === "admin";
  const isIsa = user?.role === "isa";
  const permissions = trpc.permissions.getMyPermissions.useQuery(undefined, {
    enabled: isAdmin,
  });
  const canUseInbox =
    isIsa ||
    (isAdmin &&
      !!(permissions.data as Record<string, boolean> | undefined)
        ?.canViewMarketingTextInbox);
  const canConfigureMarketingLine = isAdmin && canUseInbox;

  const configuration = trpc.marketingTextInbox.configuration.useQuery(
    undefined,
    { enabled: canUseInbox }
  );
  const availableNumbers =
    trpc.marketingTextInbox.listAvailableNumbers.useQuery(undefined, {
      enabled: canConfigureMarketingLine && !!configuration.data?.apiConfigured,
    });
  const speedToLead = trpc.marketingTextInbox.speedToLead.useQuery(undefined, {
    enabled: canUseInbox,
    refetchInterval: 60_000,
  });
  const agentsQuery = trpc.marketingTextInbox.listEligibleAgents.useQuery(
    undefined,
    {
      enabled: canUseInbox && connectOpen,
    }
  );
  const threadsQuery = trpc.marketingTextInbox.listThreads.useQuery(
    { search: search.trim() || undefined, archived: showArchived },
    { enabled: canUseInbox && !!configuration.data?.marketingNumber }
  );
  const threadQuery = trpc.marketingTextInbox.getThread.useQuery(
    { contactId: selectedContactId ?? 1 },
    { enabled: canUseInbox && !!selectedContactId }
  );
  const followUpsQuery =
    trpc.marketingTextInbox.listIntroductionFollowUps.useQuery(
      { contactId: selectedContactId ?? 1 },
      { enabled: canUseInbox && !!selectedContactId }
    );
  const messages = ((threadQuery.data ?? []) as MarketingMessage[]).filter(
    message => Boolean(message.body?.trim())
  );
  const selectedThread = useMemo(
    () =>
      (threadsQuery.data as MarketingThread[] | undefined)?.find(
        thread => thread.contactId === selectedContactId
      ) ?? null,
    [threadsQuery.data, selectedContactId]
  );
  const selectedAgent = (agentsQuery.data ?? []).find(
    agent => String(agent.id) === selectedAgentId
  );

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const refreshInbox = () => {
    void configuration.refetch();
    void threadsQuery.refetch();
    void speedToLead.refetch();
  };

  const selectNumber =
    trpc.marketingTextInbox.selectMarketingNumber.useMutation({
      onSuccess: line => {
        toast.success(
          `Marketing text line set to ${line.digits || line.name || "the selected Aircall number"}.`
        );
        setSelectedNumberId("");
        refreshInbox();
      },
      onError: error => toast.error(error.message),
    });
  const sendReply = trpc.marketingTextInbox.sendReply.useMutation({
    onSuccess: () => {
      setReply("");
      toast.success("Marketing text sent.");
      void threadQuery.refetch();
      void threadsQuery.refetch();
      void speedToLead.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const markThreadRead = trpc.marketingTextInbox.markThreadRead.useMutation({
    onSuccess: () => {
      void utils.marketingTextInbox.unreadCount.invalidate();
      void threadsQuery.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const markThreadUnread = trpc.marketingTextInbox.markThreadUnread.useMutation(
    {
      onSuccess: () => {
        toast.success("Conversation marked unread.");
        void utils.marketingTextInbox.unreadCount.invalidate();
        void threadsQuery.refetch();
      },
      onError: error => toast.error(error.message),
    }
  );
  const archiveThread = trpc.marketingTextInbox.archiveThread.useMutation({
    onSuccess: (_, values) => {
      toast.success(
        values.archived
          ? "Conversation archived."
          : "Conversation restored to inbox."
      );
      setSelectedContactId(null);
      void threadsQuery.refetch();
      void utils.marketingTextInbox.unreadCount.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const finishThread = trpc.marketingTextInbox.finishThread.useMutation({
    onSuccess: (_, values) => {
      toast.success(
        values.archive
          ? "Conversation finished and archived."
          : "Conversation finished."
      );
      setFinishOpen(false);
      setSelectedContactId(null);
      void threadsQuery.refetch();
      void utils.marketingTextInbox.unreadCount.invalidate();
      void speedToLead.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const optOut = trpc.marketingTextInbox.optOutContact.useMutation({
    onSuccess: () => {
      toast.success("Marketing SMS opt-out recorded.");
      void threadQuery.refetch();
      void threadsQuery.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const draftIntroduction =
    trpc.marketingTextInbox.draftIntroduction.useMutation({
      onSuccess: (draft: IntroductionDraft) => {
        setGroupText(draft.groupText);
        setEmailSubject(draft.emailSubject);
        setEmailBody(draft.emailBody);
        setContextSummary(draft.contextSummary);
        setFollowUpBody(
          current =>
            current ||
            `Hey ${selectedThread ? contactName(selectedThread).split(" ")[0] : "there"}, just wanted to check in and see how talking with ${selectedAgent?.name ?? "your Savvy agent"} went.`
        );
      },
      onError: error =>
        toast.error(error.message || "Unable to draft this introduction."),
    });
  const sendIntroduction = trpc.marketingTextInbox.sendIntroduction.useMutation(
    {
      onSuccess: result => {
        toast.success(
          result.connectionCreated
            ? "Introduction sent and a new agent connection was created."
            : "Introduction sent through the existing agent connection."
        );
        setConnectOpen(false);
        setSelectedAgentId("");
        void threadQuery.refetch();
        void threadsQuery.refetch();
        void speedToLead.refetch();
        void followUpsQuery.refetch();
      },
      onError: error =>
        toast.error(error.message || "Unable to send the introduction."),
    }
  );
  const updateFollowUp =
    trpc.marketingTextInbox.updateIntroductionFollowUp.useMutation({
      onSuccess: () => {
        toast.success("Scheduled follow-up updated.");
        setEditingFollowUpId(null);
        void followUpsQuery.refetch();
      },
      onError: error => toast.error(error.message),
    });
  const deleteFollowUp =
    trpc.marketingTextInbox.deleteIntroductionFollowUp.useMutation({
      onSuccess: () => {
        toast.success("Scheduled follow-up deleted.");
        setEditingFollowUpId(null);
        void followUpsQuery.refetch();
      },
      onError: error => toast.error(error.message),
    });

  useEffect(() => {
    if (selectedContactId)
      markThreadRead.mutate({ contactId: selectedContactId });
  }, [selectedContactId]);

  useEffect(() => {
    if (
      selectedContactId &&
      !(threadsQuery.data as MarketingThread[] | undefined)?.some(
        thread => thread.contactId === selectedContactId
      )
    ) {
      setSelectedContactId(null);
    }
  }, [selectedContactId, threadsQuery.data]);

  useEffect(() => {
    const element = conversationScrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [selectedContactId, messages.length, threadQuery.dataUpdatedAt]);

  useEffect(() => {
    if (!connectOpen || !selectedContactId || !selectedAgentId) return;
    setGroupText("");
    setEmailSubject("");
    setEmailBody("");
    setContextSummary("");
    setFollowUpBody("");
    draftIntroduction.mutate({
      contactId: selectedContactId,
      agentId: Number(selectedAgentId),
    });
  }, [connectOpen, selectedContactId, selectedAgentId]);

  if (isAdmin && permissions.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!canUseInbox) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to the Marketing Text Inbox.
      </div>
    );
  }

  const config = configuration.data;
  const cannotReply =
    !!selectedThread?.doNotContact || !!selectedThread?.smsMarketingOptedOutAt;
  const messageControlsPending =
    markThreadRead.isPending ||
    markThreadUnread.isPending ||
    archiveThread.isPending;
  const canSendIntroduction = Boolean(
    selectedAgentId &&
      groupText.trim() &&
      emailSubject.trim() &&
      emailBody.trim() &&
      (!autoFollowUp ||
        (Number(followUpDelayHours) >= 0.25 && followUpBody.trim()))
  );
  const openIntroduction = () => {
    setAppointmentSet(false);
    setAutoFollowUp(false);
    setFollowUpDelayHours("24");
    setSelectedAgentId("");
    setGroupText("");
    setEmailSubject("");
    setEmailBody("");
    setContextSummary("");
    setFollowUpBody("");
    setConnectOpen(true);
  };

  return (
    <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Inbox className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Marketing Text Inbox
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Lead replies to the dedicated Smart Plan marketing line.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={showArchived ? "outline" : "secondary"}
            size="sm"
            onClick={() => setShowArchived(false)}
          >
            Inbox
          </Button>
          <Button
            variant={showArchived ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowArchived(true)}
          >
            Archived
          </Button>
          <Button
            variant="outline"
            onClick={refreshInbox}
            disabled={configuration.isFetching || threadsQuery.isFetching}
          >
            <RefreshCw
              className={`mr-1.5 h-4 w-4 ${configuration.isFetching || threadsQuery.isFetching ? "animate-spin" : ""}`}
            />{" "}
            Refresh
          </Button>
        </div>
      </div>

      <SpeedToLeadStats
        windows={speedToLead.data?.windows}
        channel="text"
        isLoading={speedToLead.isLoading}
        errorMessage={speedToLead.error?.message}
      />

      {!config?.sendReady && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-amber-950">
              <Settings2 className="h-5 w-5" /> Complete marketing text setup
            </CardTitle>
            <CardDescription className="text-amber-900/80">
              Smart Plan text delivery stays blocked until the dedicated Aircall
              number is configured.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!config?.apiConfigured ? (
              <div className="flex gap-3 rounded-md border border-amber-200 bg-white/60 p-3 text-sm text-amber-950">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  <strong>Aircall credentials are not connected yet.</strong>{" "}
                  Add the Aircall API ID and token to SavvyOS’s production
                  configuration, then return here to select a dedicated
                  SMS-enabled number.
                </p>
              </div>
            ) : canConfigureMarketingLine ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="marketing-number">
                    Dedicated Aircall marketing number
                  </Label>
                  <select
                    id="marketing-number"
                    value={selectedNumberId}
                    onChange={event => setSelectedNumberId(event.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                  >
                    <option value="">
                      Select an unassigned Aircall number…
                    </option>
                    {(availableNumbers.data ?? []).map(number => (
                      <option key={number.id} value={String(number.id)}>
                        {number.digits ||
                          number.name ||
                          `Aircall number #${number.id}`}
                        {number.name ? ` — ${number.name}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={() =>
                      selectedNumberId &&
                      selectNumber.mutate({
                        numberId: Number(selectedNumberId),
                      })
                    }
                    disabled={!selectedNumberId || selectNumber.isPending}
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />{" "}
                    {selectNumber.isPending
                      ? "Saving…"
                      : "Use as marketing line"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Only unassigned numbers appear here; ISA personal lines
                    cannot be selected.
                  </p>
                </div>
              </>
            ) : (
              <div className="flex gap-3 rounded-md border border-amber-200 bg-white/60 p-3 text-sm text-amber-950">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  A SavvyOS administrator needs to select the dedicated marketing
                  number before the shared inbox can receive and send texts.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {config?.sendReady && (
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border bg-card shadow-sm">
          <aside className="flex w-full shrink-0 flex-col border-b md:w-[360px] md:border-b-0 md:border-r">
            <div className="border-b p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Conversations</p>
                  <p className="text-xs text-muted-foreground">
                    {config.marketingNumber?.digits ||
                      config.marketingNumber?.name ||
                      "Dedicated marketing line"}
                  </p>
                </div>
                <Badge variant="secondary">
                  <Phone className="mr-1 h-3 w-3" /> Aircall
                </Badge>
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  className="pl-9"
                  placeholder="Search conversations"
                />
              </div>
            </div>
            <div className="min-h-[240px] flex-1 overflow-y-auto">
              {threadsQuery.isLoading ? (
                <p className="p-4 text-sm text-muted-foreground">
                  Loading replies…
                </p>
              ) : ((threadsQuery.data ?? []) as MarketingThread[]).length ===
                0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  <p>
                    {showArchived
                      ? "No archived conversations."
                      : "No lead replies on this line yet."}
                  </p>
                </div>
              ) : (
                ((threadsQuery.data ?? []) as MarketingThread[]).map(thread => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setSelectedContactId(thread.contactId!)}
                    className={`w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted/60 ${selectedContactId === thread.contactId ? "bg-primary/5" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        {contactName(thread)}
                      </p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatTime(
                          thread.receivedAt ?? thread.sentAt ?? thread.createdAt
                        )}
                      </span>
                      {thread.awaitingReply && (
                        <span
                          title={`Read and awaiting a reply for ${formatElapsed(thread.awaitingReplySince, clock)}`}
                          className="flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                        >
                          <AlertTriangle className="h-3 w-3" />{" "}
                          {formatElapsed(thread.awaitingReplySince, clock)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="truncate text-xs text-muted-foreground">
                        Reply: {thread.body}
                      </p>
                      {thread.isUnread && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </div>
                    {thread.smsMarketingOptedOutAt && (
                      <p className="mt-1 text-[11px] font-medium text-destructive">
                        Marketing SMS opted out
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          </aside>

          <main className="flex min-h-[520px] min-w-0 flex-1 flex-col">
            {!selectedContactId ? (
              <div className="m-auto max-w-sm p-8 text-center text-muted-foreground">
                <Inbox className="mx-auto mb-3 h-10 w-10 opacity-30" />
                <p className="font-medium text-foreground">
                  Select a conversation
                </p>
                <p className="mt-1 text-sm">
                  Choose a contact thread to review the full history, connect
                  them with an agent, or reply from the marketing line.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                  <div>
                    <p className="font-medium">
                      {selectedThread
                        ? contactName(selectedThread)
                        : "Marketing text conversation"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedThread?.contactPhone || "Contact record"}
                    </p>
                    {selectedThread?.awaitingReply && (
                      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" /> Read and
                        awaiting a reply for{" "}
                        {formatElapsed(
                          selectedThread.awaitingReplySince,
                          clock
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={openIntroduction}
                      disabled={showArchived || cannotReply}
                    >
                      <UserRoundPlus className="mr-1.5 h-3.5 w-3.5" /> Connect
                      to agent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        selectedThread?.isUnread
                          ? markThreadRead.mutate({
                              contactId: selectedContactId,
                            })
                          : markThreadUnread.mutate({
                              contactId: selectedContactId,
                            })
                      }
                      disabled={messageControlsPending}
                    >
                      {selectedThread?.isUnread ? (
                        <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <MailOpen className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {selectedThread?.isUnread ? "Mark read" : "Mark unread"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        archiveThread.mutate({
                          contactId: selectedContactId,
                          archived: !showArchived,
                        })
                      }
                      disabled={messageControlsPending}
                    >
                      {showArchived ? (
                        <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <Archive className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {showArchived ? "Restore" : "Archive"}
                    </Button>
                    {!showArchived && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setArchiveOnFinish(false);
                          setFinishOpen(true);
                        }}
                        disabled={
                          messageControlsPending || finishThread.isPending
                        }
                      >
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Finish
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/contacts/${selectedContactId}`)}
                    >
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
                      contact
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        optOut.mutate({
                          contactId: selectedContactId,
                          reason: "Opted out from Marketing Text Inbox",
                        })
                      }
                      disabled={cannotReply || optOut.isPending}
                    >
                      <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />{" "}
                      {cannotReply ? "Opted out" : "Opt out"}
                    </Button>
                  </div>
                </div>
                <div
                  ref={conversationScrollRef}
                  className="flex-1 space-y-3 overflow-y-auto bg-muted/15 p-4"
                >
                  {((followUpsQuery.data ?? []) as IntroductionFollowUp[])
                    .filter(followUp => followUp.status !== "sent")
                    .map(followUp => {
                      const editable = followUp.status === "queued";
                      const isEditing = editingFollowUpId === followUp.id;
                      return (
                        <section
                          key={followUp.id}
                          className={`rounded-xl border p-3 shadow-sm ${followUp.status === "queued" ? "border-amber-300 bg-amber-50/70" : "border-destructive/30 bg-destructive/5"}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 text-sm font-semibold">
                                <Timer className="h-4 w-4 text-amber-700" />
                                {followUp.status === "queued"
                                  ? `Auto follow-up scheduled for ${formatTime(followUp.dueAt)}`
                                  : `Auto follow-up ${followUp.status}`}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {followUp.status === "queued"
                                  ? `Sending to this client after the introduction with ${followUp.agentName ?? "the agent"}.`
                                  : followUp.errorMessage ||
                                    "This scheduled text did not send."}
                              </p>
                            </div>
                            {editable && !isEditing && (
                              <div className="flex shrink-0 gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingFollowUpId(followUp.id);
                                    setEditingFollowUpBody(followUp.body);
                                    setEditingFollowUpDueAt(
                                      toDateTimeLocal(followUp.dueAt)
                                    );
                                  }}
                                  disabled={deleteFollowUp.isPending}
                                >
                                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() =>
                                    deleteFollowUp.mutate({ id: followUp.id })
                                  }
                                  disabled={deleteFollowUp.isPending}
                                >
                                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />{" "}
                                  Delete
                                </Button>
                              </div>
                            )}
                          </div>
                          {isEditing ? (
                            <div className="mt-3 space-y-3 border-t border-amber-200 pt-3">
                              <div className="space-y-1.5">
                                <Label
                                  htmlFor={`follow-up-body-${followUp.id}`}
                                >
                                  Scheduled text
                                </Label>
                                <Textarea
                                  id={`follow-up-body-${followUp.id}`}
                                  value={editingFollowUpBody}
                                  onChange={event =>
                                    setEditingFollowUpBody(event.target.value)
                                  }
                                  rows={3}
                                  maxLength={1600}
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label
                                  htmlFor={`follow-up-due-at-${followUp.id}`}
                                >
                                  Send at
                                </Label>
                                <Input
                                  id={`follow-up-due-at-${followUp.id}`}
                                  type="datetime-local"
                                  value={editingFollowUpDueAt}
                                  onChange={event =>
                                    setEditingFollowUpDueAt(event.target.value)
                                  }
                                />
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingFollowUpId(null)}
                                  disabled={updateFollowUp.isPending}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    updateFollowUp.mutate({
                                      id: followUp.id,
                                      body: editingFollowUpBody.trim(),
                                      dueAt: new Date(editingFollowUpDueAt),
                                    })
                                  }
                                  disabled={
                                    !editingFollowUpBody.trim() ||
                                    !editingFollowUpDueAt ||
                                    updateFollowUp.isPending
                                  }
                                >
                                  {updateFollowUp.isPending
                                    ? "Saving…"
                                    : "Save follow-up"}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="mt-3 whitespace-pre-wrap text-sm">
                              {followUp.body}
                            </p>
                          )}
                        </section>
                      );
                    })}
                  {threadQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">
                      Loading conversation…
                    </p>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No text messages recorded for this contact on the
                      marketing line.
                    </p>
                  ) : (
                    messages.map(message => (
                      <div
                        key={message.id}
                        className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm ${message.direction === "outbound" ? "bg-primary text-primary-foreground" : "border bg-background"}`}
                        >
                          {message.smartPlanName && (
                            <Badge
                              variant="secondary"
                              className="mb-1.5 border-0 bg-black/10 text-[10px] font-medium text-current"
                            >
                              <Sparkles className="mr-1 h-3 w-3" /> Smart Plan ·{" "}
                              {message.smartPlanName} · Step{" "}
                              {message.smartPlanStepOrder}
                            </Badge>
                          )}
                          {message.isGroupMessage && (
                            <Badge
                              variant="secondary"
                              className="mb-1.5 border-0 bg-black/10 text-[10px] font-medium text-current"
                            >
                              <UserRoundPlus className="mr-1 h-3 w-3" />
                              {message.direction === "outbound"
                                ? `Connected with ${message.groupAgentName ?? "an agent"} in a group`
                                : `Group conversation${message.groupAgentName ? ` with ${message.groupAgentName}` : ""}`}
                            </Badge>
                          )}
                          {message.autoFollowUpId && (
                            <Badge
                              variant="secondary"
                              className="mb-1.5 border-0 bg-black/10 text-[10px] font-medium text-current"
                            >
                              <Timer className="mr-1 h-3 w-3" /> Auto follow-up
                              sent
                            </Badge>
                          )}
                          <p className="whitespace-pre-wrap">{message.body}</p>
                          <p
                            className={`mt-1 text-[10px] ${message.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                          >
                            {message.direction === "outbound"
                              ? `Sent by ${message.sentByName ?? "Savvy STR Agents"}`
                              : "Received"}{" "}
                            ·{" "}
                            {formatTime(
                              message.sentAt ??
                                message.receivedAt ??
                                message.createdAt
                            )}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t p-4">
                  {showArchived ? (
                    <p className="text-sm text-muted-foreground">
                      Restore this conversation to send a reply.
                    </p>
                  ) : cannotReply ? (
                    <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>
                        This contact is opted out of marketing SMS. SavvyOS will
                        not send replies, introductions, or Smart Plan texts
                        from this marketing line.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-end gap-3">
                        <Textarea
                          value={reply}
                          onChange={event => setReply(event.target.value)}
                          maxLength={1600}
                          rows={3}
                          placeholder="Write a reply…"
                        />
                        <Button
                          onClick={() =>
                            sendReply.mutate({
                              contactId: selectedContactId,
                              body: reply.trim(),
                            })
                          }
                          disabled={!reply.trim() || sendReply.isPending}
                        >
                          {sendReply.isPending ? (
                            "Sending…"
                          ) : (
                            <>
                              <Send className="mr-1.5 h-4 w-4" /> Send
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                        <span>
                          Replies send to the number that replied from the
                          dedicated marketing line.
                        </span>
                        <span>{reply.length}/1600</span>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </main>
        </div>
      )}

      <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Finish this conversation?</DialogTitle>
            <DialogDescription>
              This marks the current client reply resolved and removes it from
              Speed to Lead calculations. It does not delete the text history.
            </DialogDescription>
          </DialogHeader>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
            <Checkbox
              checked={archiveOnFinish}
              onCheckedChange={checked => setArchiveOnFinish(checked === true)}
            />
            <span>
              <span className="font-medium">
                Also archive this conversation
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                You can restore it later from Archived.
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFinishOpen(false)}
              disabled={finishThread.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                selectedContactId &&
                finishThread.mutate({
                  contactId: selectedContactId,
                  archive: archiveOnFinish,
                })
              }
              disabled={!selectedContactId || finishThread.isPending}
            >
              {finishThread.isPending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}{" "}
              Finish conversation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRoundPlus className="h-5 w-5 text-primary" /> Connect{" "}
              {selectedThread ? contactName(selectedThread) : "client"} to an
              agent
            </DialogTitle>
            <DialogDescription>
              Send one shared introduction text to both people and a group
              email. The editable draft reads the full recent conversation,
              including the outgoing Savvy messages the client is responding to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="introduction-agent">Agent</Label>
              <SearchableSelect
                value={selectedAgentId}
                onValueChange={setSelectedAgentId}
                options={(agentsQuery.data ?? []).map(agent => ({
                  value: String(agent.id),
                  label: agent.name || agent.email || `Agent #${agent.id}`,
                  description: [agent.email, agent.phone]
                    .filter(Boolean)
                    .join(" · "),
                }))}
                placeholder={
                  agentsQuery.isLoading
                    ? "Loading active agents…"
                    : "Select an active agent…"
                }
                searchPlaceholder="Search agent name, email, or phone…"
                emptyText="No active agents match that search."
                disabled={agentsQuery.isLoading}
                listClassName="max-h-72"
                showSelectedDescription
              />
            </div>
            {draftIntroduction.isPending && (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Drafting a personal
                introduction from the recent conversation…
              </div>
            )}
            {selectedAgentId && !draftIntroduction.isPending && (
              <>
                <div className="rounded-lg border border-primary/15 bg-primary/[0.03] p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Sparkles className="h-3.5 w-3.5" /> Why this introduction
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {contextSummary ||
                      "Recent conversation context will be included in the draft."}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="group-intro-text">Shared group text</Label>
                  <Textarea
                    id="group-intro-text"
                    value={groupText}
                    onChange={event => setGroupText(event.target.value)}
                    rows={6}
                    maxLength={1600}
                  />
                  <p className="text-xs text-muted-foreground">
                    Sent once through Aircall to{" "}
                    {selectedThread
                      ? contactName(selectedThread)
                      : "the client"}{" "}
                    and {selectedAgent?.name || "the selected agent"}; both can
                    see and reply in the same group conversation.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="introduction-email-subject">
                    Group email subject
                  </Label>
                  <Input
                    id="introduction-email-subject"
                    value={emailSubject}
                    onChange={event => setEmailSubject(event.target.value)}
                    maxLength={255}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="introduction-email-body">Group email</Label>
                  <Textarea
                    id="introduction-email-body"
                    value={emailBody}
                    onChange={event => setEmailBody(event.target.value)}
                    rows={8}
                    maxLength={20_000}
                  />
                </div>
                <Label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3">
                  <Checkbox
                    checked={appointmentSet}
                    onCheckedChange={checked =>
                      setAppointmentSet(checked === true)
                    }
                  />
                  <span>
                    <span className="font-medium">
                      Create this as an appointment
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Marks the connection as an appointment in the agent’s
                      pipeline.
                    </span>
                  </span>
                </Label>
                <div className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label htmlFor="auto-follow-up" className="font-medium">
                        Auto Text Follow Up
                      </Label>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Schedule a personal check-in to the client after this
                        introduction.
                      </p>
                    </div>
                    <Switch
                      id="auto-follow-up"
                      checked={autoFollowUp}
                      onCheckedChange={setAutoFollowUp}
                    />
                  </div>
                  {autoFollowUp && (
                    <div className="mt-4 space-y-3 border-t pt-4">
                      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                        <div className="space-y-1.5">
                          <Label htmlFor="follow-up-hours">
                            Send after (hours)
                          </Label>
                          <div className="relative">
                            <Clock3 className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="follow-up-hours"
                              className="pl-9"
                              type="number"
                              min="0.25"
                              max="720"
                              step="0.25"
                              value={followUpDelayHours}
                              onChange={event =>
                                setFollowUpDelayHours(event.target.value)
                              }
                            />
                          </div>
                        </div>
                        <p className="self-end pb-2 text-xs text-muted-foreground">
                          Example: enter 24 for a check-in tomorrow.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="follow-up-text">
                          Scheduled follow-up text
                        </Label>
                        <Textarea
                          id="follow-up-text"
                          value={followUpBody}
                          onChange={event =>
                            setFollowUpBody(event.target.value)
                          }
                          rows={3}
                          maxLength={1600}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConnectOpen(false)}
              disabled={sendIntroduction.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                selectedContactId &&
                sendIntroduction.mutate({
                  contactId: selectedContactId,
                  agentId: Number(selectedAgentId),
                  groupText,
                  emailSubject,
                  emailBody,
                  appointmentSet,
                  autoFollowUp,
                  followUpDelayHours: autoFollowUp
                    ? Number(followUpDelayHours)
                    : undefined,
                  followUpBody: autoFollowUp ? followUpBody : undefined,
                })
              }
              disabled={
                !canSendIntroduction ||
                draftIntroduction.isPending ||
                sendIntroduction.isPending
              }
            >
              {sendIntroduction.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Sending
                  introduction…
                </>
              ) : (
                <>
                  <Send className="mr-1.5 h-4 w-4" /> Send group text + email
                  introduction
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
