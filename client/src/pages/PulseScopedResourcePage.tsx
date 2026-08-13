import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, EyeOff, Loader2, LockKeyhole, UsersRound } from "lucide-react";
import { useLocation } from "wouter";

export default function PulseScopedResourcePage({
  resourceType,
  resourceId,
}: {
  resourceType: "team" | "one_on_one";
  resourceId: number;
}) {
  const [, navigate] = useLocation();
  const isTeam = resourceType === "team";
  const teamQuery = trpc.pulse.getTeam.useQuery(
    { teamId: resourceId },
    { enabled: isTeam && Number.isInteger(resourceId) && resourceId > 0 },
  );
  const oneOnOneQuery = trpc.pulse.getOneOnOne.useQuery(
    { oneOnOneId: resourceId },
    { enabled: !isTeam && Number.isInteger(resourceId) && resourceId > 0 },
  );
  const query = isTeam ? teamQuery : oneOnOneQuery;
  const resource = query.data as any;

  if (query.isLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  if (query.error || !resource) {
    return <div className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-center justify-center text-center"><LockKeyhole className="h-10 w-10 text-muted-foreground/60" /><h1 className="mt-4 text-xl font-semibold">Resource unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{query.error?.message || "You do not have active access to this Pulse resource."}</p><Button variant="outline" className="mt-5" onClick={() => navigate("/")}><ArrowLeft className="mr-2 h-4 w-4" />Return to SavvyOS</Button></div>;
  }

  const label = isTeam ? "Team" : "1:1";
  const accessLabel = isTeam ? resource.membershipRole : resource.accessLevel;
  const visibleSections = !isTeam ? Object.entries(resource.sectionVisibility as Record<string, boolean>).filter(([, visible]) => visible).map(([key]) => key) : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => navigate("/")}><ArrowLeft className="mr-1.5 h-4 w-4" />SavvyOS</Button>
      <section className="rounded-2xl border bg-gradient-to-br from-primary/[0.08] via-background to-background p-6 md:p-8"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><UsersRound className="h-3.5 w-3.5" />Operate · Pulse</div><h1 className="mt-2 text-3xl font-semibold tracking-tight">{resource.name}</h1><p className="mt-2 text-sm text-muted-foreground">{isTeam ? resource.purpose || "Operational team" : "Direct operating relationship"}</p></div><Badge className="capitalize">{accessLabel}</Badge></div></section>
      <Card><CardHeader><CardTitle>{label} access confirmed</CardTitle><CardDescription>{isTeam ? "The team was discovered through active direct membership. A linked Pulse meeting does not create team access." : "The 1:1 was discovered through direct participation or an explicit viewer grant. Administrator status alone does not create access."}</CardDescription></CardHeader>{visibleSections.length > 0 && <CardContent className="flex flex-wrap gap-2">{visibleSections.map((section) => <Badge key={section} variant="secondary">{section}</Badge>)}</CardContent>}</Card>
      <Card className="border-dashed"><CardContent className="py-10 text-center"><EyeOff className="mx-auto h-8 w-8 text-muted-foreground/60" /><h2 className="mt-3 font-semibold">Operating surfaces will appear here</h2><p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">This access foundation is intentionally in place before Pulse adds team dashboards, 1:1 sessions, work, and communications. Those later surfaces will reuse this exact membership and viewer model.</p></CardContent></Card>
    </div>
  );
}
