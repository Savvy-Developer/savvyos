import { BellRing, CheckCircle2, Settings2 } from "lucide-react";
import { Link } from "wouter";
import { PulseCascadeCard } from "@/components/pulse/PulseCascadeCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";

const templateLabels: Record<string, { title: string; description: string }> = {
  meeting_reminder: { title: "Meeting reminders", description: "Know when your Pulse meeting is coming up." },
  todo_assigned: { title: "To-dos assigned", description: "Know when a clear next step is assigned to you." },
  cascade_sent: { title: "Cascading messages", description: "Know when another meeting needs your acknowledgment." },
  overdue_digest: { title: "Overdue work", description: "Get a simple digest of open work that needs attention." },
  mention: { title: "Mentions", description: "Know when a teammate calls you into a Pulse item." },
  rock_completed: { title: "Rock completed", description: "Know when a meeting rock is marked complete." },
  welcome: { title: "Welcome", description: "Get a short orientation when you join Pulse." },
};

export default function PulseMissionControlPage() {
  const utils = trpc.useUtils();
  const pendingNotifications = trpc.pulse.notifications.pending.useQuery();
  const pendingCascades = trpc.pulse.cascades.pending.useQuery();
  const preferences = trpc.pulse.notifications.preferences.useQuery();
  const acknowledge = trpc.pulse.cascades.acknowledge.useMutation({
    onSuccess: () => {
      utils.pulse.notifications.pending.invalidate();
      utils.pulse.cascades.pending.invalidate();
    },
  });
  const setPreference = trpc.pulse.notifications.setPreference.useMutation({
    onSuccess: () => utils.pulse.notifications.preferences.invalidate(),
  });

  if (pendingNotifications.isLoading || pendingCascades.isLoading || preferences.isLoading) {
    return <div className="mx-auto max-w-3xl space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-52 w-full" /></div>;
  }

  const actionNotificationIds = new Set((pendingNotifications.data ?? [])
    .filter((notification: any) => notification.notificationType === "cascade" && notification.sourceType === "cascade")
    .map((notification: any) => notification.sourceId));
  const cascades = (pendingCascades.data ?? []).filter((cascade: any) => actionNotificationIds.has(cascade.id));
  const otherActions = (pendingNotifications.data ?? []).filter((notification: any) => (
    !(notification.notificationType === "cascade" && notification.sourceType === "cascade")
  ));

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-5">
        <div>
          <p className="text-sm font-medium text-primary">Pulse</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Mission Control</h1>
          <p className="mt-1 text-base text-muted-foreground">One clear place for meeting actions that need you.</p>
        </div>
        <Button asChild variant="outline" className="min-h-11"><Link href="/pulse/meetings">Your meetings</Link></Button>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg"><BellRing className="h-5 w-5 text-primary" aria-hidden="true" /> Needs your action</CardTitle>
          <CardDescription className="text-base">Acknowledge a cascading message once. It clears every frozen recipient record for you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {cascades.map((cascade: any) => (
            <PulseCascadeCard
              key={cascade.id}
              message={cascade}
              isAcknowledging={acknowledge.isPending}
              onAcknowledge={(messageId) => acknowledge.mutate({ messageId, from: "mission_control" })}
            />
          ))}
          {otherActions.map((notification: any) => (
            <div key={notification.id} className="rounded-lg border border-border p-3 text-sm">
              <p>{notification.body}</p>
              <Button asChild variant="outline" className="mt-3 min-h-11"><Link href="/pulse">Open Pulse</Link></Button>
            </div>
          ))}
          {!cascades.length && !otherActions.length && (
            <div className="rounded-lg bg-muted/60 p-4 text-sm text-muted-foreground">
              <CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-600" aria-hidden="true" /> Nothing needs your action right now.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg"><Settings2 className="h-5 w-5 text-primary" aria-hidden="true" /> Pulse delivery settings</CardTitle>
          <CardDescription className="text-base">Choose separately what appears in Pulse and what reaches your inbox.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {(preferences.data ?? []).map((preference: any) => {
            const copy = templateLabels[preference.templateKey] ?? { title: preference.templateKey, description: "Choose how you want to receive this." };
            return (
              <div key={preference.templateKey} className="py-4 first:pt-0 last:pb-0">
                <p className="font-medium">{copy.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3 text-sm">
                  <label className="flex min-h-11 items-center gap-3"><Switch checked={preference.inApp} disabled={setPreference.isPending} onCheckedChange={(inApp) => setPreference.mutate({ templateKey: preference.templateKey, inApp })} /><span>Show in Pulse</span></label>
                  <label className="flex min-h-11 items-center gap-3"><Switch checked={preference.email} disabled={setPreference.isPending} onCheckedChange={(email) => setPreference.mutate({ templateKey: preference.templateKey, email })} /><span>Send email</span></label>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </main>
  );
}
