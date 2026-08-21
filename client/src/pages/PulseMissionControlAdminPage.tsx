import { ArrowLeft, ClipboardList } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

function ageLabel(value: Date | string | null) {
  if (!value) return "—";
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const days = Math.floor(elapsed / 86_400_000);
  if (days === 0) return "Today";
  return `${days} day${days === 1 ? "" : "s"}`;
}

export default function PulseMissionControlAdminPage() {
  const outstanding = trpc.pulse.notifications.adminOutstanding.useQuery();
  if (outstanding.isLoading) return <main className="mx-auto max-w-4xl space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-52 w-full" /></main>;
  if (outstanding.error) return <main className="mx-auto max-w-4xl"><Card><CardContent className="p-6">This Pulse page is not available. <Link className="underline" href="/pulse/settings">Return to Pulse settings</Link>.</CardContent></Card></main>;

  return <main className="mx-auto max-w-4xl space-y-6 pb-8"><header className="border-b border-border pb-5"><Button asChild variant="ghost" className="-ml-3 min-h-11"><Link href="/pulse/settings"><ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />Pulse settings</Link></Button><p className="mt-3 text-sm font-medium text-primary">Pulse</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Outstanding items</h1><p className="mt-2 text-base leading-6 text-muted-foreground">A neutral check on work still waiting for a person. Counts are not scores.</p></header><Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" />Unacknowledged and uncleared</CardTitle><CardDescription className="text-base">Oldest items appear first.</CardDescription></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-y border-border bg-muted/40 text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Person</th><th className="px-4 py-3 text-right font-medium">Unacknowledged cascades</th><th className="px-4 py-3 text-right font-medium">Uncleared notifications</th><th className="px-4 py-3 text-right font-medium">Oldest item</th></tr></thead><tbody>{(outstanding.data ?? []).map((row: any) => <tr key={row.personId} className="border-b border-border last:border-0"><td className="px-4 py-4 font-medium">{row.personName}</td><td className="px-4 py-4 text-right tabular-nums">{row.unacknowledgedCascades}</td><td className="px-4 py-4 text-right tabular-nums">{row.unclearedNotifications}</td><td className="px-4 py-4 text-right tabular-nums">{ageLabel(row.oldestAt)}</td></tr>)}{!(outstanding.data ?? []).length && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No one has an outstanding Pulse item right now.</td></tr>}</tbody></table></CardContent></Card></main>;
}
