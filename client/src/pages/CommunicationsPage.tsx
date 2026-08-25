import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { MessageSquareText, PhoneCall, Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import AircallWorkspacePanel from "@/components/AircallWorkspacePanel";

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

export default function CommunicationsPage() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const initialPhone = params.get("dial");
  const initialContactId = Number(params.get("contact") || 0);
  const utils = trpc.useUtils();
  const { data: status, isLoading: statusLoading } =
    trpc.aircallCalling.myStatus.useQuery();
  const { data: calls = [], isLoading: callsLoading } =
    trpc.aircallCommunications.listMyCalls.useQuery(undefined, {
      enabled: status?.ready,
    });
  const { data: messages = [], isLoading: messagesLoading } =
    trpc.aircallCommunications.listMyMessages.useQuery(undefined, {
      enabled: status?.ready,
    });
  const [selectedContactId, setSelectedContactId] = useState<number | null>(
    initialContactId || null
  );
  const [draft, setDraft] = useState("");

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

  useEffect(() => {
    if (selectedContactId || !threads.length) return;
    const firstContactThread = threads.find(thread => thread.contactId);
    setSelectedContactId(firstContactThread?.contactId ?? null);
  }, [selectedContactId, threads]);

  const selectedThread =
    threads.find(thread => thread.contactId === selectedContactId) ?? null;
  const sendText = trpc.aircallCommunications.sendContactText.useMutation({
    onSuccess: () => {
      toast.success("Text sent through Aircall");
      setDraft("");
      utils.aircallCommunications.listMyMessages.invalidate();
      if (selectedContactId)
        utils.aircallCommunications.listContactMessages.invalidate({
          contactId: selectedContactId,
        });
      utils.communications.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  if (statusLoading)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Checking your Aircall assignment…
      </div>
    );
  if (!status?.ready) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border bg-card p-8 text-center">
        <PhoneCall className="mx-auto h-9 w-9 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">
          Aircall communications are not ready
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {status?.reason ?? "Your Aircall setup is still being checked."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Communications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Call and text from SavvyOS using your assigned Aircall line. Calls and
          texts stay connected to the correct Contact record.
        </p>
      </div>
      <Tabs
        defaultValue={initialPhone ? "calls" : "texts"}
        className="space-y-5"
      >
        <TabsList>
          <TabsTrigger value="calls">
            <PhoneCall className="mr-2 h-4 w-4" />
            Calls
          </TabsTrigger>
          <TabsTrigger value="texts">
            <MessageSquareText className="mr-2 h-4 w-4" />
            Texts
          </TabsTrigger>
        </TabsList>
        <TabsContent value="calls" className="space-y-5">
          <AircallWorkspacePanel initialPhone={initialPhone} />
          <section className="rounded-xl border bg-card">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold">Recent calls on my line</h2>
            </div>
            {callsLoading ? (
              <p className="p-5 text-sm text-muted-foreground">
                Loading calls…
              </p>
            ) : calls.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                No synchronized calls are available for your assigned line yet.
              </p>
            ) : (
              <div className="divide-y">
                {(calls as any[]).map(call => (
                  <button
                    key={call.id}
                    className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left hover:bg-muted/40"
                    onClick={() =>
                      call.contactId && navigate(`/contacts/${call.contactId}`)
                    }
                  >
                    <span>
                      <span className="block font-medium">
                        {[call.contactFirstName, call.contactLastName]
                          .filter(Boolean)
                          .join(" ") ||
                          call.calleeNumber ||
                          call.callerNumber ||
                          "Unmatched call"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {call.direction === "outbound" ? "Outbound" : "Inbound"}{" "}
                        · {call.status} ·{" "}
                        {call.duration
                          ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s`
                          : "—"}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {displayTime(call.startedAt)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </TabsContent>
        <TabsContent value="texts">
          <div className="grid min-h-[620px] overflow-hidden rounded-xl border bg-card lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="border-b lg:border-b-0 lg:border-r">
              <div className="border-b px-4 py-4">
                <h2 className="font-semibold">Text conversations</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Texts sync from your Aircall line.
                </p>
              </div>
              <div className="max-h-[550px] overflow-y-auto">
                {messagesLoading ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    Loading texts…
                  </p>
                ) : threads.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    No synced text conversations yet.
                  </p>
                ) : (
                  threads.map(thread => (
                    <button
                      key={thread.key}
                      className={`w-full border-b px-4 py-3 text-left hover:bg-muted/40 ${thread.contactId === selectedContactId ? "bg-primary/5" : ""}`}
                      onClick={() =>
                        thread.contactId &&
                        setSelectedContactId(thread.contactId)
                      }
                      disabled={!thread.contactId}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">
                          {displayName(thread.latest)}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {displayTime(
                            thread.latest.sentAt ?? thread.latest.createdAt
                          )}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {thread.latest.body || "No message body"}
                      </span>
                      {!thread.contactId && (
                        <span className="mt-1 block text-[11px] text-amber-700">
                          Unmatched Contact
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </aside>
            <section className="flex min-h-[500px] flex-col">
              {!selectedThread ? (
                <div className="m-auto px-6 text-center text-sm text-muted-foreground">
                  <UserRound className="mx-auto mb-3 h-8 w-8" />
                  Select a Contact-linked conversation to review or send a text.
                </div>
              ) : (
                <>
                  <div className="border-b px-5 py-4">
                    <h2 className="font-semibold">
                      {displayName(selectedThread.latest)}
                    </h2>
                    <button
                      className="mt-1 text-xs text-primary hover:underline"
                      onClick={() => navigate(`/contacts/${selectedContactId}`)}
                    >
                      Open Contact
                    </button>
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-5">
                    {selectedThread.items.map(message => (
                      <div
                        key={message.id}
                        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${message.direction === "outbound" ? "ml-auto bg-primary text-primary-foreground" : "bg-background border"}`}
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
                    ))}
                  </div>
                  <div className="border-t p-4">
                    <textarea
                      value={draft}
                      onChange={event => setDraft(event.target.value)}
                      rows={3}
                      maxLength={1600}
                      placeholder="Write a text message…"
                      className="w-full resize-none rounded-md border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {draft.length}/1600 · Do Not Contact records are
                        blocked.
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
                        <Send className="mr-2 h-4 w-4" />
                        {sendText.isPending ? "Sending…" : "Send text"}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
