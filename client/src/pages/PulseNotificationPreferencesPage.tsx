import { ArrowLeft, Mail, MonitorSmartphone } from "lucide-react";
import { Link } from "wouter";
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

export default function PulseNotificationPreferencesPage() {
  const utils = trpc.useUtils();
  const preferences = trpc.pulse.notifications.preferences.useQuery();
  const setPreference = trpc.pulse.notifications.setPreference.useMutation({
    onSuccess: () => utils.pulse.notifications.preferences.invalidate(),
  });

  if (preferences.isLoading) return <main className="mx-auto max-w-3xl space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-64 w-full" /></main>;

  return (
    <main className="mx-auto max-w-3xl space-y-6 pb-8">
      <header className="border-b border-border pb-5">
        <Button asChild variant="ghost" className="-ml-3 min-h-11"><Link href="/pulse/settings"><ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />Pulse settings</Link></Button>
        <p className="mt-3 text-sm font-medium text-primary">Pulse</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Delivery settings</h1>
        <p className="mt-2 text-base leading-6 text-muted-foreground">Choose separately what appears in Pulse and what reaches your inbox.</p>
      </header>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-lg">Your delivery choices</CardTitle><CardDescription className="text-base">Changing one switch never changes the other.</CardDescription></CardHeader>
        <CardContent className="divide-y divide-border">
          {(preferences.data ?? []).map((preference: any) => {
            const copy = templateLabels[preference.templateKey] ?? { title: preference.templateKey, description: "Choose how you want to receive this." };
            return <div key={preference.templateKey} className="py-4 first:pt-0 last:pb-0"><p className="font-medium">{copy.title}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.description}</p><div className="mt-3 flex flex-col gap-3 text-sm sm:flex-row sm:gap-6"><label className="flex min-h-11 items-center gap-3"><Switch checked={preference.inApp} disabled={setPreference.isPending} onCheckedChange={(inApp) => setPreference.mutate({ templateKey: preference.templateKey, inApp })} /><MonitorSmartphone className="h-4 w-4 text-muted-foreground" aria-hidden="true" /><span>Show in Pulse</span></label><label className="flex min-h-11 items-center gap-3"><Switch checked={preference.email} disabled={setPreference.isPending} onCheckedChange={(email) => setPreference.mutate({ templateKey: preference.templateKey, email })} /><Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" /><span>Send email</span></label></div></div>;
          })}
        </CardContent>
      </Card>
    </main>
  );
}
