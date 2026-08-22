import { Check, CheckCircle2, CircleCheck, MessageSquare, SquareCheckBig } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { PulseCascadeCard } from "@/components/pulse/PulseCascadeCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

const dayIndex: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function nextMeeting(meetings: any[]) {
  const today = new Date().getDay();
  return [...meetings].sort((left, right) => {
    const leftAhead = left.dayOfWeek in dayIndex ? (dayIndex[left.dayOfWeek] - today + 7) % 7 : 8;
    const rightAhead = right.dayOfWeek in dayIndex ? (dayIndex[right.dayOfWeek] - today + 7) % 7 : 8;
    return leftAhead - rightAhead || left.name.localeCompare(right.name);
  })[0] ?? null;
}

function dateLabel(value: Date | string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

export default function PulseMissionControlPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const pendingCascades = trpc.pulse.cascades.pending.useQuery();
  const pendingResponses = trpc.pulse.notifications.pending.useQuery();
  const shell = trpc.pulse.shell.useQuery();
  const acknowledge = trpc.pulse.cascades.acknowledge.useMutation({
    onSuccess: () => {
      utils.pulse.cascades.pending.invalidate();
      utils.pulse.notifications.pending.invalidate();
    },
  });
  const clear = trpc.pulse.notifications.clear.useMutation({ onSuccess: () => utils.pulse.notifications.pending.invalidate() });
  const clearLegacy = trpc.pulse.notifications.clearWorkItemNotification.useMutation({ onSuccess: () => utils.pulse.notifications.pending.invalidate() });
  const completeTodo = trpc.pulse.workItems.setTodoStatus.useMutation({ onSuccess: () => utils.pulse.notifications.pending.invalidate() });

  if (pendingCascades.isLoading || pendingResponses.isLoading || shell.isLoading) {
    return <main className="mx-auto max-w-3xl space-y-5"><Skeleton className="h-20 w-full" /><Skeleton className="h-48 w-full" /></main>;
  }

  const cascades = pendingCascades.data ?? [];
  const responses = pendingResponses.data ?? [];
  const next = nextMeeting(shell.data?.meetings ?? []);
  const firstName = user?.name?.trim().split(/\s+/)[0] || "there";
  const hasActions = cascades.length > 0 || responses.length > 0;

  return (
    <main className="mx-auto max-w-3xl space-y-6 pb-8">
      <header className="border-b border-border pb-5">
        <p className="text-sm font-medium text-primary">Pulse</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{greeting()}, {firstName}.</h1>
      </header>

      {cascades.length > 0 && (
        <section aria-labelledby="needs-ok" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="needs-ok" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Needs your OK</h2>
            <span className="text-sm tabular-nums text-muted-foreground">{cascades.length}</span>
          </div>
          <Card>
            <CardContent className="space-y-3 p-3 sm:p-4">
              {cascades.map((cascade: any) => <PulseCascadeCard key={cascade.id} message={cascade} isAcknowledging={acknowledge.isPending} onAcknowledge={(messageId) => acknowledge.mutate({ messageId, from: "mission_control" })} />)}
            </CardContent>
          </Card>
        </section>
      )}

      {responses.length > 0 && (
        <section aria-labelledby="needs-reply" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="needs-reply" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Needs your reply</h2>
            <span className="text-sm tabular-nums text-muted-foreground">{responses.length}</span>
          </div>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {responses.map((response: any) => {
                const detailHref = response.meetingId ? `/pulse/meetings/${response.meetingId}` : "/pulse/work";
                const pending = clear.isPending || clearLegacy.isPending || completeTodo.isPending;
                const clearItem = () => response.kind === "work_item_notification"
                  ? clearLegacy.mutate({ notificationId: response.id })
                  : clear.mutate({ notificationId: response.id });
                const complete = async () => {
                  if (!response.workItemId) return;
                  await completeTodo.mutateAsync({ workItemId: response.workItemId, status: "done" });
                  clearItem();
                };
                return (
                  <article key={`${response.kind}-${response.id}`} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-base font-medium">{response.headline}</p>
                      <p className="shrink-0 text-sm text-muted-foreground">{response.meetingName}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-foreground">{response.body}</p>
                    {response.dueDate && <p className="mt-2 text-sm text-muted-foreground">Due {dateLabel(response.dueDate)}</p>}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button asChild variant="outline" className="min-h-11"><Link href={detailHref}><MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" />Reply</Link></Button>
                      {response.canComplete ? <Button type="button" className="min-h-11" disabled={pending} onClick={complete}><SquareCheckBig className="mr-2 h-4 w-4" aria-hidden="true" />Done</Button> : <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={clearItem}><Check className="mr-2 h-4 w-4" aria-hidden="true" />Clear</Button>}
                    </div>
                  </article>
                );
              })}
            </CardContent>
          </Card>
        </section>
      )}

      {!hasActions && (
        <section className="py-7" aria-label="No actions need attention">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-base font-medium">Nothing needs you right now.</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">Your next meeting is {next ? `${next.name}${next.dayOfWeek ? ` on ${next.dayOfWeek.charAt(0).toUpperCase()}${next.dayOfWeek.slice(1)}` : ""}.` : "not scheduled yet."} <Link href="/pulse/work" className="font-medium text-primary underline-offset-4 hover:underline">See your work</Link></p>
            </div>
          </div>
        </section>
      )}

      {hasActions && next && <p className="border-t border-border pt-4 text-sm text-muted-foreground">Next meeting: <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={`/pulse/meetings/${next.id}`}>{next.name}</Link>{next.dayOfWeek ? ` on ${next.dayOfWeek.charAt(0).toUpperCase()}${next.dayOfWeek.slice(1)}` : ""}.</p>}
    </main>
  );
}
