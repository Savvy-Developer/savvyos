import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { Link } from "wouter";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CheckCheck,
  ChevronLeft,
  ExternalLink,
  FileText,
  Inbox,
  Loader2,
  MailOpen,
  Paperclip,
  RefreshCw,
  Reply,
  Search,
  Send,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import RichEmailEditor from "@/components/RichEmailEditor";
import { SpeedToLeadStats } from "@/components/SpeedToLeadStats";

type InboxThread = {
  id: number;
  subject: string;
  participantEmail: string;
  receivedAddress: string;
  lastIncomingAt: Date | string;
  lastMessageAt: Date | string;
  archivedAt: Date | string | null;
  isUnread: boolean;
  awaitingReply: boolean;
  awaitingReplySince: Date | string | null;
  contact: { id: number; name: string | null; email: string | null } | null;
};

function toDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function awaitingReplyLabel(value: Date | string | null) {
  if (!value) return "Awaiting reply";
  return `Awaiting reply · ${formatDistanceToNow(toDate(value))}`;
}

function plainTextFromHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function messageDocument(html: string | null, text: string | null) {
  const fallback = (text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;color:#1f2937;font:14px/1.65 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;word-break:break-word}img{max-width:100%;height:auto}table{max-width:100%!important}a{color:#0891b2}</style></head><body>${html || `<pre style="white-space:pre-wrap;font:inherit;margin:0">${fallback}</pre>`}</body></html>`;
}

export default function ResendInboxPage() {
  const utils = trpc.useUtils();
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [replyHtml, setReplyHtml] = useState("<p></p>");
  const [showReply, setShowReply] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ pages: number; scanned: number; stored: number; skipped: number } | null>(null);

  const { data: threads = [], isLoading: listLoading, refetch: refetchThreads } = trpc.resendInbox.list.useQuery(
    { archived: showArchived },
    { refetchInterval: 30_000 },
  );
  const speedToLead = trpc.resendInbox.speedToLead.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const filteredThreads = useMemo(() => (threads as InboxThread[]).filter((thread) => {
    const haystack = `${thread.subject} ${thread.participantEmail} ${thread.receivedAddress}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }), [threads, query]);

  useEffect(() => {
    if (selectedThreadId && !filteredThreads.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(filteredThreads[0]?.id ?? null);
      setMobileDetail(false);
    } else if (!selectedThreadId && filteredThreads[0]) {
      setSelectedThreadId(filteredThreads[0].id);
    }
  }, [filteredThreads, selectedThreadId]);

  const { data: conversation, isLoading: threadLoading } = trpc.resendInbox.getThread.useQuery(
    { threadId: selectedThreadId ?? 0 },
    { enabled: !!selectedThreadId },
  );

  useEffect(() => {
    if (conversation?.thread?.id) {
      void utils.resendInbox.list.invalidate();
      void utils.resendInbox.unreadCount.invalidate();
    }
  }, [conversation?.thread?.id, utils.resendInbox.list, utils.resendInbox.unreadCount]);

  const invalidateInbox = async () => {
    await Promise.all([
      utils.resendInbox.list.invalidate(),
      utils.resendInbox.getThread.invalidate(),
      utils.resendInbox.unreadCount.invalidate(),
    ]);
  };

  const archiveThread = trpc.resendInbox.archive.useMutation({
    onSuccess: async (_, values) => {
      toast.success(values.archived ? "Conversation archived" : "Conversation restored to inbox");
      setShowReply(false);
      await invalidateInbox();
    },
    onError: (error) => toast.error(error.message),
  });

  const setUnread = trpc.resendInbox.setUnread.useMutation({
    onSuccess: async (_, values) => {
      toast.success(values.markedUnread ? "Marked unread" : "Marked read");
      await invalidateInbox();
    },
    onError: (error) => toast.error(error.message),
  });

  const sendReply = trpc.resendInbox.reply.useMutation({
    onSuccess: async () => {
      toast.success("Reply sent");
      setReplyHtml("<p></p>");
      setShowReply(false);
      await invalidateInbox();
    },
    onError: (error) => toast.error(error.message),
  });

  const syncInbox = trpc.resendInbox.sync.useMutation({
    onError: (error) => toast.error(error.message),
  });

  async function syncAllResendHistory() {
    // The provider returns at most 100 messages per page. Cursor chaining keeps
    // the browser responsive while importing the complete history in order.
    const maxPagesPerRun = 500;
    const seenCursors = new Set<string>();
    let after: string | undefined;
    let pages = 0;
    let scanned = 0;
    let stored = 0;
    let skipped = 0;

    setIsSyncingHistory(true);
    setSyncProgress({ pages, scanned, stored, skipped });
    try {
      while (pages < maxPagesPerRun) {
        const result = await syncInbox.mutateAsync({ limit: 100, ...(after ? { after } : {}) });
        pages += 1;
        scanned += result.scanned;
        stored += result.stored;
        skipped += result.skipped;
        setSyncProgress({ pages, scanned, stored, skipped });

        if (!result.hasMore) {
          toast.success(`Resend history synced: ${stored} added across ${pages} page${pages === 1 ? "" : "s"}`);
          break;
        }
        if (!result.nextCursor || seenCursors.has(result.nextCursor)) {
          throw new Error("Resend returned an invalid pagination cursor. Please try Sync again.");
        }
        seenCursors.add(result.nextCursor);
        after = result.nextCursor;
      }

      if (pages >= maxPagesPerRun) {
        toast.warning(`Imported ${pages * 100} messages or more. Click Sync Resend History again to continue the remaining history.`);
      }
      await refetchThreads();
      await utils.resendInbox.unreadCount.invalidate();
    } catch (error) {
      if (error instanceof Error && !/Resend returned an invalid pagination cursor/.test(error.message)) {
        // Transport failures are already surfaced by the mutation; preserve the
        // partial import because completed pages are idempotently stored.
      } else if (error instanceof Error) {
        toast.error(error.message);
      }
    } finally {
      setIsSyncingHistory(false);
    }
  }

  const attachmentUrl = trpc.resendInbox.getAttachmentUrl.useMutation({
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (error) => toast.error(error.message),
  });

  const selectedThread = conversation?.thread as InboxThread | undefined;
  const selectedThreadPreview = (threads as InboxThread[]).find(
    thread => thread.id === selectedThread?.id
  );
  const messages = (conversation?.messages ?? []) as Array<{
    id: number;
    direction: "inbound" | "outbound";
    fromEmail: string;
    fromName: string | null;
    toRecipients: string[];
    subject: string;
    bodyHtml: string | null;
    bodyText: string | null;
    attachments: Array<{ id: string; filename: string; size: number; contentType: string | null }> | null;
    receivedAt: Date | string;
  }>;
  const replyReady = plainTextFromHtml(replyHtml).length > 0;

  return (
    <div className="-m-4 flex h-[calc(100vh-56px)] min-w-0 flex-col bg-background md:-m-6">
      <header className="flex flex-col gap-3 border-b bg-card px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-700">
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Resend Inbox</h1>
            <p className="text-xs text-muted-foreground">Incoming replies and conversations received through Resend.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={syncAllResendHistory} disabled={isSyncingHistory}>
            {isSyncingHistory ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            {isSyncingHistory && syncProgress ? `Syncing ${syncProgress.scanned} emails…` : "Sync Resend History"}
          </Button>
          <Button variant={showArchived ? "outline" : "secondary"} size="sm" onClick={() => setShowArchived(false)}>
            Inbox
          </Button>
          <Button variant={showArchived ? "secondary" : "outline"} size="sm" onClick={() => setShowArchived(true)}>
            Archived
          </Button>
        </div>
      </header>

      <div className="border-b bg-muted/10 px-4 py-3 md:px-6">
        <SpeedToLeadStats windows={speedToLead.data?.windows} channel="email" />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className={`flex w-full shrink-0 flex-col border-r bg-card md:w-[360px] ${mobileDetail ? "hidden md:flex" : "flex"}`}>
          <div className="border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sender or subject" className="pl-9" />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {listLoading ? (
              <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : filteredThreads.length === 0 ? (
              <div className="px-7 py-16 text-center text-muted-foreground">
                <Inbox className="mx-auto mb-3 h-8 w-8 opacity-30" />
                <p className="text-sm font-medium">{showArchived ? "No archived conversations" : "Your inbox is clear"}</p>
                <p className="mt-1 text-xs">{showArchived ? "Archived email conversations appear here." : "Use Sync Resend History to import every message already received."}</p>
              </div>
            ) : filteredThreads.map((thread) => {
              const active = thread.id === selectedThreadId;
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => { setSelectedThreadId(thread.id); setShowReply(false); setMobileDetail(true); }}
                  className={`w-full border-b px-4 py-3 text-left transition-colors ${active ? "bg-cyan-500/10" : "hover:bg-muted/60"}`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${thread.isUnread ? "bg-red-500" : "bg-transparent"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`truncate text-sm ${thread.isUnread ? "font-semibold" : "font-medium"}`}>{thread.participantEmail}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{formatDistanceToNow(toDate(thread.lastIncomingAt), { addSuffix: true })}</span>
                        {thread.awaitingReply && (
                          <span
                            title={`Read but ${awaitingReplyLabel(thread.awaitingReplySince).toLowerCase()}`}
                            className="flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                          >
                            <AlertTriangle className="h-3 w-3" /> {formatDistanceToNow(toDate(thread.awaitingReplySince ?? thread.lastIncomingAt))}
                          </span>
                        )}
                      </div>
                      <p className={`mt-0.5 truncate text-sm ${thread.isUnread ? "font-semibold" : ""}`}>{thread.subject}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">Received by {thread.receivedAddress}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className={`min-w-0 flex-1 flex-col overflow-hidden ${mobileDetail ? "flex" : "hidden md:flex"}`}>
          {!selectedThreadId ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <Inbox className="mb-3 h-10 w-10 opacity-25" />
              <p className="text-sm font-medium">Choose a conversation</p>
            </div>
          ) : threadLoading || !selectedThread ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-3 md:px-6">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileDetail(false)}><ChevronLeft className="h-4 w-4" /></Button>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold">{selectedThread.subject}</h2>
                  <p className="truncate text-xs text-muted-foreground">To {selectedThread.receivedAddress} · {selectedThread.participantEmail}</p>
                  {selectedThreadPreview?.awaitingReply && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" /> Read but {awaitingReplyLabel(selectedThreadPreview.awaitingReplySince).toLowerCase()}
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setUnread.mutate({ threadId: selectedThread.id, markedUnread: !selectedThread.isUnread })} disabled={setUnread.isPending}>
                  {selectedThread.isUnread ? <CheckCheck className="mr-1.5 h-3.5 w-3.5" /> : <MailOpen className="mr-1.5 h-3.5 w-3.5" />}
                  {selectedThread.isUnread ? "Mark read" : "Mark unread"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => archiveThread.mutate({ threadId: selectedThread.id, archived: !showArchived })} disabled={archiveThread.isPending}>
                  {showArchived ? <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" /> : <Archive className="mr-1.5 h-3.5 w-3.5" />}
                  {showArchived ? "Restore" : "Archive"}
                </Button>
                {selectedThread.contact && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/contacts/${selectedThread.contact.id}`}><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open contact</Link>
                  </Button>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-4 py-5 md:px-6">
                <div className="mx-auto max-w-4xl space-y-4">
                  {messages.map((message) => (
                    <article key={message.id} className={`overflow-hidden rounded-xl border bg-card shadow-sm ${message.direction === "outbound" ? "border-cyan-200" : "border-border"}`}>
                      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3 ${message.direction === "outbound" ? "bg-cyan-50/70" : "bg-muted/30"}`}>
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${message.direction === "outbound" ? "bg-cyan-600 text-white" : "bg-muted text-muted-foreground"}`}>
                            {message.direction === "outbound" ? <Send className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{message.direction === "outbound" ? "Savvy STR Agents" : (message.fromName || message.fromEmail)}</p>
                            <p className="truncate text-xs text-muted-foreground">{message.direction === "outbound" ? `to ${message.toRecipients.join(", ")}` : `from ${message.fromEmail}`}</p>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">{format(toDate(message.receivedAt), "MMM d, yyyy · h:mm a")}</span>
                      </div>
                      <div className="p-4">
                        <iframe title={`Message ${message.id}`} sandbox="allow-popups" srcDoc={messageDocument(message.bodyHtml, message.bodyText)} className="min-h-[120px] w-full border-0" />
                        {(message.attachments ?? []).filter((attachment) => !attachment.contentType?.startsWith("image/")).length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                            {(message.attachments ?? []).filter((attachment) => !attachment.contentType?.startsWith("image/")).map((attachment) => (
                              <Button key={attachment.id} variant="outline" size="sm" className="max-w-full" onClick={() => attachmentUrl.mutate({ messageId: message.id, attachmentId: attachment.id })} disabled={attachmentUrl.isPending}>
                                <Paperclip className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{attachment.filename}</span>
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  ))}

                  {!showArchived && (
                    <section className="rounded-xl border border-cyan-200 bg-card shadow-sm">
                      <div className="flex items-center justify-between border-b bg-cyan-50/70 px-4 py-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-cyan-900"><Reply className="h-4 w-4" /> Reply</div>
                        <span className="text-xs text-muted-foreground">From {selectedThread.receivedAddress}</span>
                      </div>
                      {!showReply ? (
                        <div className="p-4"><Button onClick={() => setShowReply(true)}><Reply className="mr-1.5 h-4 w-4" /> Compose reply</Button></div>
                      ) : (
                        <div className="p-4">
                          <RichEmailEditor value={replyHtml} onChange={setReplyHtml} placeholder="Write your reply…" />
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <p className="text-xs text-muted-foreground">Your reply will stay in this email thread and be sent from the address that received it.</p>
                            <div className="flex shrink-0 gap-2">
                              <Button variant="outline" size="sm" onClick={() => setShowReply(false)} disabled={sendReply.isPending}>Cancel</Button>
                              <Button size="sm" onClick={() => sendReply.mutate({ threadId: selectedThread.id, bodyHtml: replyHtml })} disabled={!replyReady || sendReply.isPending}>
                                {sendReply.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} Send reply
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </section>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
