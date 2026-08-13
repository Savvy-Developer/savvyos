import { useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, ArrowRight, BarChart3, CalendarClock, ChevronRight, MessageSquare, Settings2, Target, UsersRound } from "lucide-react";

type PulseItem = {
  id: string;
  label: string;
  path: string;
  resourceType: "meeting" | "team" | "one_on_one";
  accessLevel: string;
};

function ResourceList({ items, emptyLabel }: { items: PulseItem[]; emptyLabel: string }) {
  const [, navigate] = useLocation();
  if (items.length === 0) return <p className="text-sm text-muted-foreground py-5">{emptyLabel}</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => navigate(item.path)}
          className="group flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {item.resourceType === "meeting" ? <CalendarClock className="h-4 w-4" /> : <UsersRound className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{item.label}</p>
            <p className="mt-0.5 text-xs capitalize text-muted-foreground">{item.resourceType.replaceAll("_", " ")} · {item.accessLevel}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </button>
      ))}
    </div>
  );
}

export default function PulseSectionPage({ requestedTab }: { requestedTab?: "overview" | "meetings" | "teams" | "one-on-ones" } = {}) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = (user as any)?.role === "admin";
  const { data: permissions } = trpc.permissions.getMyPermissions.useQuery(undefined, { enabled: isAdmin, staleTime: 30000 });
  const { data: navigation = [], isLoading } = trpc.pulse.getNavigation.useQuery(undefined, { enabled: !!user && (user as any)?.personType === "full_user", staleTime: 30000 });

  const resources = useMemo(() => (navigation as Array<{ items: PulseItem[] }>).flatMap((group) => group.items), [navigation]);
  const meetings = resources.filter((item) => item.resourceType === "meeting");
  const teams = resources.filter((item) => item.resourceType === "team");
  const oneOnOnes = resources.filter((item) => item.resourceType === "one_on_one");
  const canAdminister = (permissions as any)?.canViewPulse === true;

  const availableTabs = [
    "overview",
    ...(meetings.length > 0 ? ["meetings"] : []),
    ...(teams.length > 0 ? ["teams"] : []),
    ...(oneOnOnes.length > 0 ? ["one-on-ones"] : []),
  ];
  const activeTab = requestedTab && availableTabs.includes(requestedTab) ? requestedTab : "overview";

  if (isLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Activity className="h-6 w-6 animate-pulse text-primary" /></div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><Activity className="h-3.5 w-3.5" />Pulse</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Operating system</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Your Pulse section only exposes operating contexts you can open. Resource names, teams, and 1:1s are resolved from active access—not from a static index.</p>
        </div>
        {canAdminister && <Button variant="outline" onClick={() => navigate("/pulse/administer")}><Settings2 className="mr-2 h-4 w-4" />Administer Pulse</Button>}
      </section>

      <Tabs value={activeTab} onValueChange={(value) => navigate(value === "overview" ? "/pulse" : `/pulse/${value}`)} className="space-y-5">
        <TabsList className="h-auto max-w-full justify-start gap-1 overflow-x-auto bg-muted/50 p-1">
          <TabsTrigger value="overview" className="shrink-0 gap-2"><Activity className="h-3.5 w-3.5" />Overview</TabsTrigger>
          {meetings.length > 0 && <TabsTrigger value="meetings" className="shrink-0 gap-2"><CalendarClock className="h-3.5 w-3.5" />Meetings <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-[10px]">{meetings.length}</Badge></TabsTrigger>}
          {teams.length > 0 && <TabsTrigger value="teams" className="shrink-0 gap-2"><UsersRound className="h-3.5 w-3.5" />Teams <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-[10px]">{teams.length}</Badge></TabsTrigger>}
          {oneOnOnes.length > 0 && <TabsTrigger value="one-on-ones" className="shrink-0 gap-2"><MessageSquare className="h-3.5 w-3.5" />1:1s <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-[10px]">{oneOnOnes.length}</Badge></TabsTrigger>}
          {canAdminister && <TabsTrigger value="administer" onClick={() => navigate("/pulse/administer")} className="shrink-0 gap-2"><Settings2 className="h-3.5 w-3.5" />Administer</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Card><CardHeader className="pb-2"><CardDescription>Meetings</CardDescription><CardTitle className="text-3xl">{meetings.length}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Active meetings where you have an explicit member or facilitator grant.</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Teams</CardDescription><CardTitle className="text-3xl">{teams.length}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Operational teams where your direct membership is active.</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>1:1s</CardDescription><CardTitle className="text-3xl">{oneOnOnes.length}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Direct relationships or explicitly granted private views.</CardContent></Card>
          </div>
          {resources.length === 0 ? (
            <Card className="border-dashed"><CardContent className="flex flex-col items-center py-14 text-center"><Activity className="h-9 w-9 text-muted-foreground/60" /><h2 className="mt-4 font-semibold">No operating contexts yet</h2><p className="mt-1 max-w-lg text-sm text-muted-foreground">Pulse stays intentionally empty until an active meeting grant, team membership, or 1:1 relationship is assigned to you. It does not reveal hidden resource names.</p>{canAdminister && <Button className="mt-5" onClick={() => navigate("/pulse/administer")}><Settings2 className="mr-2 h-4 w-4" />Configure Pulse</Button>}</CardContent></Card>
          ) : (
            <Card><CardHeader><CardTitle>Open operating context</CardTitle><CardDescription>Choose an active resource you are authorized to access.</CardDescription></CardHeader><CardContent><ResourceList items={resources} emptyLabel="No accessible resources." /></CardContent></Card>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-muted/20"><CardHeader><Target className="h-5 w-5 text-primary" /><CardTitle className="text-base">Plan</CardTitle><CardDescription>Goals, rocks, and scorecard planning will appear as these operating surfaces are built.</CardDescription></CardHeader></Card>
            <Card className="bg-muted/20"><CardHeader><MessageSquare className="h-5 w-5 text-primary" /><CardTitle className="text-base">Communicate</CardTitle><CardDescription>Cascades, announcements, and calendar communication will reuse the same recipient eligibility rules.</CardDescription></CardHeader></Card>
            <Card className="bg-muted/20"><CardHeader><BarChart3 className="h-5 w-5 text-primary" /><CardTitle className="text-base">Analyze</CardTitle><CardDescription>Pulse reporting and operating insights will consume the canonical registry and access model.</CardDescription></CardHeader></Card>
          </div>
        </TabsContent>

        <TabsContent value="meetings" className="mt-0"><Card><CardHeader><CardTitle>Meetings</CardTitle><CardDescription>Only active meetings with an explicit current access relationship appear here.</CardDescription></CardHeader><CardContent><ResourceList items={meetings} emptyLabel="No active meetings are available to you." /></CardContent></Card></TabsContent>
        <TabsContent value="teams" className="mt-0"><Card><CardHeader><CardTitle>Teams</CardTitle><CardDescription>Only teams where your direct membership is active appear here.</CardDescription></CardHeader><CardContent><ResourceList items={teams} emptyLabel="No active teams are available to you." /></CardContent></Card></TabsContent>
        <TabsContent value="one-on-ones" className="mt-0"><Card><CardHeader><CardTitle>1:1s</CardTitle><CardDescription>Only your direct 1:1 relationships and explicit viewer grants appear here.</CardDescription></CardHeader><CardContent><ResourceList items={oneOnOnes} emptyLabel="No active 1:1s are available to you." /></CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}
