import { Link } from "wouter";
import { AlertTriangle, Bell, ChevronRight, ClipboardList, Settings2, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PulseSettingsHubPage() {
  const shell = trpc.pulse.shell.useQuery();
  const meetings = trpc.pulse.settings.configurationMeetings.useQuery(undefined, { enabled: Boolean(shell.data?.canSeeSettings) });
  const capabilities = shell.data?.capabilities;
  const canManageSettings = Boolean(capabilities?.canManageSettings);
  const canViewEffectiveness = Boolean(capabilities?.canViewEffectiveness);
  const canViewHistory = Boolean(capabilities?.canViewHistory);

  if (shell.isLoading) {
    return <main className="mx-auto max-w-4xl space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-48 w-full" /></main>;
  }

  if (!shell.data?.canSeeSettings) {
    return <main className="mx-auto max-w-3xl"><Card><CardContent className="p-6"><p className="text-base font-medium">Pulse settings are not available.</p><p className="mt-1 text-base leading-6 text-muted-foreground">Meeting owners and administrators can manage their meetings. Your SavvyOS administrator can grant other Pulse capabilities when you need them.</p><Button asChild className="mt-4 min-h-11"><Link href="/pulse">Return to Pulse</Link></Button></CardContent></Card></main>;
  }

  const configurationMeetings = meetings.data ?? [];

  return (
    <main className="mx-auto max-w-4xl space-y-6 pb-10">
      <header className="border-b border-border pb-5">
        <p className="text-base font-medium text-primary">Pulse</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
        <p className="mt-2 text-base leading-6 text-muted-foreground">Set up meetings you lead and choose how Pulse reaches you.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl"><Settings2 className="h-5 w-5 text-primary" aria-hidden="true" />Meeting configuration</CardTitle>
          <CardDescription className="text-base">Every change saves as you make it. Choose a meeting you own or administer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {canManageSettings ? <div className="flex justify-end"><Button asChild className="min-h-11"><Link href="/pulse/settings/create">Create a meeting</Link></Button></div> : null}
          <div className="divide-y divide-border rounded-lg border border-border">
            {meetings.isLoading ? <Skeleton className="m-3 h-14" /> : configurationMeetings.map((meeting: any) => (
              <Link key={meeting.id} href={`/pulse/settings/meetings/${meeting.id}`} className="flex min-h-14 items-center gap-3 p-3 text-base transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1"><span className="block font-medium">{meeting.name}</span><span className="text-base text-muted-foreground">{meeting.meetingRole === "owner" ? "Owner" : "Administrator"}</span></span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
            {!meetings.isLoading && !configurationMeetings.length ? <p className="p-4 text-base leading-6 text-muted-foreground">You do not lead a meeting yet. {canManageSettings ? "Create one to get started." : "When you lead one, it will appear here."}</p> : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Bell className="h-5 w-5 text-primary" aria-hidden="true" />Pulse delivery</CardTitle>
            <CardDescription className="text-base">See each Pulse email and choose separately what appears in Pulse and what reaches your inbox.</CardDescription>
          </CardHeader>
          <CardContent><Button asChild variant="outline" className="min-h-11"><Link href="/pulse/settings/notifications">Review delivery</Link></Button></CardContent>
        </Card>

        {canViewEffectiveness ? <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" />Meeting effectiveness</CardTitle><CardDescription className="text-base">Review recent meeting patterns before deciding what to change.</CardDescription></CardHeader>
          <CardContent><Button asChild variant="outline" className="min-h-11"><Link href="/pulse/settings/effectiveness">View effectiveness</Link></Button></CardContent>
        </Card> : null}

        {canViewEffectiveness ? <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><AlertTriangle className="h-5 w-5 text-primary" aria-hidden="true" />Needs attention</CardTitle><CardDescription className="text-base">Review the strongest scorecard signals across Pulse meetings.</CardDescription></CardHeader>
          <CardContent><Button asChild variant="outline" className="min-h-11"><Link href="/pulse/settings/attention">View needs attention</Link></Button></CardContent>
        </Card> : null}

        {canViewHistory ? <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" />Meeting history</CardTitle><CardDescription className="text-base">Meeting history is available inside the effectiveness view.</CardDescription></CardHeader>
          <CardContent><Button asChild variant="outline" className="min-h-11"><Link href="/pulse/settings/effectiveness">Open meeting history</Link></Button></CardContent>
        </Card> : null}
      </div>
    </main>
  );
}
