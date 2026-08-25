import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  MessageSquareText,
  PhoneCall,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import AircallWorkspacePanel from "@/components/AircallWorkspacePanel";

const HUB_EVENT = "savvyos:communications-open";
const OPEN_STATE_KEY = "savvyos-communications-hub-open";
const DRAFTS_KEY = "savvyos-communications-text-drafts";

type HubTab = "calls" | "texts";
type HubRequest = { contactId?: number; phone?: string | null; tab?: HubTab };

export function openCommunicationsHub(request: HubRequest = {}) {
  window.dispatchEvent(
    new CustomEvent<HubRequest>(HUB_EVENT, { detail: request })
  );
}

function displayTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function displayName(message: any): string {
  const name = [message.contactFirstName, message.contactLastName]
    .filter(Boolean)
    .join(" ");
  return (
    name ||
    message.contactPhone ||
    message.toNumber ||
    message.fromNumber ||
    "Unmatched number"
  );
}

function readDrafts(): Record<string, string> {
  try {
    const stored = window.localStorage.getItem(DRAFTS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export default function CommunicationsHub() {
  const utils = trpc.useUtils();
  const [isOpen, setIsOpen] = useState(
    () => window.localStorage.getItem(OPEN_STATE_KEY) === "true"
  );
  const [tab, setTab] = useState<HubTab>("texts");
  const [selectedContactId, setSelectedContactId] = useState<number | null>(
    null
  );
  const [dialNumber, setDialNumber] = useState<string>("");
  const [drafts, setDrafts] = useState<Record<string, string>>(readDrafts);

  const { data: status } = trpc.aircallCalling.myStatus.useQuery(undefined, {
    retry: false,
  });
  const ready = Boolean(status?.ready);
  const { data: calls = [], isLoading: callsLoading } =
    trpc.aircallCommunications.listMyCalls.useQuery(undefined, {
      enabled: ready && isOpen,
    });
  const { data: messages = [], isLoading: messagesLoading } =
    trpc.aircallCommunications.listMyMessages.useQuery(undefined, {
      enabled: ready && isOpen,
    });
  const { data: selectedContactData } = trpc.contacts.get.useQuery(
    { id: selectedContactId ?? 0 },
    { enabled: ready && isOpen && !!selectedContactId }
  );

  useEffect(() => {
    const listener = (event: Event) => {
      const request = (event as CustomEvent<HubRequest>).detail ?? {};
      setIsOpen(true);
      if (request.tab) setTab(request.tab);
      if (request.contactId) setSelectedContactId(request.contactId);
      if (request.phone) setDialNumber(request.phone);
    };
    window.addEventListener(HUB_EVENT, listener);
    return () => window.removeEventListener(HUB_EVENT, listener);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(OPEN_STATE_KEY, String(isOpen));
  }, [isOpen]);

  useEffect(() => {
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  }, [drafts]);

  const threads = useMemo(() => {
    const grouped = new Map<string, any[]>();
    for (const message of messages as any[]) {
      const key = message.contactId
        ? `contact-${message.contactId}`
        : `unmatched-${message.toNumber ?? message.fromNumber ?? message.id}`;
      grouped.set(key, [...(grouped.get(key) ?? []), message]);
    }
    return Array.from(grouped.entries())
      .map(([key, items]) => ({
        key,
        latest: items[0],
        items: [...items].reverse(),
        contactId: items[0]?.contactId ?? null,
      }))
      .sort(
        (a, b) =>
          new Date(b.latest.sentAt ?? b.latest.createdAt).getTime() -
          new Date(a.latest.sentAt ?? a.latest.createdAt).getTime()
      );
  }, [messages]);

  const selectedThread =
    threads.find(thread => thread.contactId === selectedContactId) ?? null;
  const selectedContact = (selectedContactData as any)?.contact;
  const selectedName = selectedThread
    ? displayName(selectedThread.latest)
    : [selectedContact?.firstName, selectedContact?.lastName]
        .filter(Boolean)
        .join(" ");
  const draftKey = selectedContactId ? String(selectedContactId) : "";
  const draft = drafts[draftKey] ?? "";

  const sendText = trpc.aircallCommunications.sendContactText.useMutation({
    onSuccess: () => {
      toast.success("Text sent through Aircall");
      setDrafts(current => ({ ...current, [draftKey]: "" }));
      utils.aircallCommunications.listMyMessages.invalidate();
      if (selectedContactId) {
        utils.aircallCommunications.listContactMessages.invalidate({
          contactId: selectedContactId,
        });
        utils.communications.list.invalidate({ contactId: selectedContactId });
      }
    },
    onError: error => toast.error(error.message),
  });

  function updateDraft(value: string) {
    if (!draftKey) return;
    setDrafts(current => ({ ...current, [draftKey]: value }));
  }

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 rounded-l-xl border border-r-0 bg-card px-2.5 py-4 shadow-lg transition-colors hover:bg-muted md:flex md:flex-col md:items-center md:gap-2"
          title="Open Communications Hub"
          aria-label="Open Communications Hub"
        >
          <MessageSquareText className="h-5 w-5 text-primary" />
          <span className="[writing-mode:vertical-rl] text-xs font-semibold text-muted-foreground">
            Communications
          </span>
        </button>
      )}
      <aside
        aria-label="Communications Hub"
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[500px] flex-col border-l bg-background shadow-2xl transition-transform duration-200 ease-out sm:w-[470px] ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-sm font-semibold">Communications Hub</h2>
              <p className="text-[11px] text-muted-foreground">
                Stays open while you work
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Collapse Communications Hub"
            aria-label="Collapse Communications Hub"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        {!ready ? (
          <div className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {status?.reason ?? "Checking your Aircall caller assignment…"}
          </div>
        ) : (
          <Tabs
            value={tab}
            onValueChange={value => setTab(value as HubTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="shrink-0 border-b px-3 pt-3">
              <TabsList className="w-full">
                <TabsTrigger className="flex-1" value="texts">
                  <MessageSquareText className="mr-1.5 h-4 w-4" />
                  Texts
                </TabsTrigger>
                <TabsTrigger className="flex-1" value="calls">
                  <PhoneCall className="mr-1.5 h-4 w-4" />
                  Calls
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent
              value="texts"
              className="mt-0 flex min-h-0 flex-1 flex-col"
            >
              <div className="grid min-h-0 flex-1 grid-rows-[minmax(130px,32%)_1fr] border-b">
                <div className="min-h-0 overflow-y-auto border-b bg-muted/20">
                  {messagesLoading ? (
                    <p className="p-4 text-sm text-muted-foreground">
                      Loading text conversations…
                    </p>
                  ) : threads.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">
                      No synchronized texts yet. Open a Contact and select Text
                      now to start a thread.
                    </p>
                  ) : (
                    threads.map(thread => (
                      <button
                        key={thread.key}
                        type="button"
                        disabled={!thread.contactId}
                        onClick={() =>
                          thread.contactId &&
                          setSelectedContactId(thread.contactId)
                        }
                        className={`w-full border-b px-4 py-3 text-left hover:bg-muted/60 disabled:cursor-not-allowed ${thread.contactId === selectedContactId ? "bg-primary/10" : ""}`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">
                            {displayName(thread.latest)}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {displayTime(
                              thread.latest.sentAt ?? thread.latest.createdAt
                            )}
                          </span>
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {thread.latest.body || "No message body"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
                <div className="flex min-h-0 flex-col">
                  {!selectedContactId ? (
                    <div className="m-auto px-8 text-center text-sm text-muted-foreground">
                      Select a conversation, or use Text now from any Contact to
                      compose without leaving the page.
                    </div>
                  ) : (
                    <>
                      <div className="shrink-0 border-b px-4 py-3">
                        <p className="text-sm font-semibold">
                          {selectedName || "New text"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selectedContact?.phone ?? "Contact conversation"}
                        </p>
                      </div>
                      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/15 p-4">
                        {selectedThread?.items.length ? (
                          selectedThread.items.map(message => (
                            <div
                              key={message.id}
                              className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${message.direction === "outbound" ? "ml-auto bg-primary text-primary-foreground" : "border bg-card"}`}
                            >
                              <p className="whitespace-pre-wrap">
                                {message.body || "(No message body)"}
                              </p>
                              <p
                                className={`mt-1 text-[10px] ${message.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                              >
                                {message.direction === "outbound"
                                  ? `${message.status} · `
                                  : ""}
                                {displayTime(
                                  message.sentAt ??
                                    message.receivedAt ??
                                    message.createdAt
                                )}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="pt-8 text-center text-sm text-muted-foreground">
                            Start the conversation with this Contact.
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 border-t p-3">
                        <textarea
                          value={draft}
                          onChange={event => updateDraft(event.target.value)}
                          rows={3}
                          maxLength={1600}
                          placeholder="Write a text message…"
                          className="w-full resize-none rounded-md border bg-card p-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <span className="text-[11px] text-muted-foreground">
                            {draft.length}/1600
                          </span>
                          <Button
                            size="sm"
                            disabled={!draft.trim() || sendText.isPending}
                            onClick={() =>
                              selectedContactId &&
                              sendText.mutate({
                                contactId: selectedContactId,
                                body: draft,
                              })
                            }
                          >
                            <Send className="mr-1.5 h-3.5 w-3.5" />
                            {sendText.isPending ? "Sending…" : "Send"}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </TabsContent>
            <TabsContent
              value="calls"
              className="m-0 min-h-0 flex-1 overflow-y-auto p-3"
            >
              <AircallWorkspacePanel compact initialPhone={dialNumber} />
              <section className="mt-3 overflow-hidden rounded-lg border bg-card">
                <div className="border-b px-3 py-2">
                  <h3 className="text-sm font-semibold">
                    Recent calls on my line
                  </h3>
                </div>
                {callsLoading ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    Loading calls…
                  </p>
                ) : calls.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    No synchronized calls yet.
                  </p>
                ) : (
                  <div className="divide-y">
                    {(calls as any[]).slice(0, 25).map(call => (
                      <div
                        key={call.id}
                        className="flex items-center justify-between gap-3 px-3 py-2.5"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {[call.contactFirstName, call.contactLastName]
                              .filter(Boolean)
                              .join(" ") ||
                              call.calleeNumber ||
                              call.callerNumber ||
                              "Unmatched call"}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {call.direction === "outbound"
                              ? "Outbound"
                              : "Inbound"}{" "}
                            · {call.status}
                          </span>
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {displayTime(call.startedAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </TabsContent>
          </Tabs>
        )}
      </aside>
    </>
  );
}
