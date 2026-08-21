import { Link } from "wouter";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PulseNeedsAttention } from "@/components/pulse/PulseNeedsAttention";
import { trpc } from "@/lib/trpc";

export default function PulseGlobalAttentionPage() {
  const attention = trpc.pulse.scorecard.globalAttention.useQuery();
  if (attention.isLoading) return <div className="mx-auto max-w-3xl space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-48 w-full" /></div>;
  if (attention.error) return <main className="mx-auto max-w-3xl space-y-4"><Link href="/pulse/settings" className="text-sm font-medium text-muted-foreground">Pulse Settings</Link><Card><CardContent className="p-5"><p className="font-medium">Needs Attention is not available.</p><p className="mt-1 text-sm text-muted-foreground">This view is limited to Pulse super admins.</p></CardContent></Card></main>;
  return <main className="mx-auto max-w-3xl space-y-5"><Link href="/pulse/settings" className="text-sm font-medium text-muted-foreground">Pulse Settings</Link><header className="border-b border-border pb-5"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-700" aria-hidden="true" /><h1 className="text-2xl font-semibold tracking-tight">Needs Attention</h1></div><p className="mt-2 text-base text-muted-foreground">Up to five company-wide metric signals, ranked so leaders can decide what to discuss next.</p></header>{attention.data?.length ? <Card><CardContent className="p-4 sm:p-6"><PulseNeedsAttention items={attention.data} showMeeting /></CardContent></Card> : <Card><CardContent className="p-5 text-sm text-muted-foreground">No scorecard signals need attention right now.</CardContent></Card>}</main>;
}
