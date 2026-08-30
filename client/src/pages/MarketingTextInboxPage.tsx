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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CheckCheck,
  CheckCircle2,
  ExternalLink,
  Inbox,
  MailOpen,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
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
};

type MarketingMessage = {
  id: number;
  direction: "inbound" | "outbound";
  body: string | null;
  sentAt: Date | string | null;
  receivedAt: Date | string | null;
  createdAt: Date | string;
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
  const conversationScrollRef = useRef<HTMLDivElement>(null);
  const isAdmin = user?.role === "admin";

  const configuration = trpc.marketingTextInbox.configuration.useQuery(
    undefined,
    { enabled: isAdmin }
  );
  const availableNumbers =
    trpc.marketingTextInbox.listAvailableNumbers.useQuery(undefined, {
      enabled: isAdmin && !!configuration.data?.apiConfigured,
    });
  const threadsQuery = trpc.marketingTextInbox.listThreads.useQuery(
    { search: search.trim() || undefined, archived: showArchived },
    { enabled: isAdmin && !!configuration.data?.marketingNumber }
  );
  const threadQuery = trpc.marketingTextInbox.getThread.useQuery(
    { contactId: selectedContactId ?? 1 },
    { enabled: isAdmin && !!selectedContactId }
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

  const refreshInbox = () => {
    void configuration.refetch();
    void threadsQuery.refetch();
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
  const optOut = trpc.marketingTextInbox.optOutContact.useMutation({
    onSuccess: () => {
      toast.success("Marketing SMS opt-out recorded.");
      void threadQuery.refetch();
      void threadsQuery.refetch();
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

  if (!isAdmin) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        This inbox is available to administrators only.
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
            />
            Refresh
          </Button>
        </div>
      </div>

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
            ) : (
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
                  Choose a contact thread to review the full history and reply
                  from the marketing line.
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
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                          <p className="whitespace-pre-wrap">{message.body}</p>
                          <p
                            className={`mt-1 text-[10px] ${message.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                          >
                            {message.direction === "outbound"
                              ? "Sent"
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
                        not send replies or Smart Plan texts from this marketing
                        line.
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
    </div>
  );
}
