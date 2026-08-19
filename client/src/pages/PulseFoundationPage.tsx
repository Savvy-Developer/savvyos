import { Activity, Construction } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PulseFoundationPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="border-b pb-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          <Activity className="h-3.5 w-3.5" />
          Pulse
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Pulse is being rebuilt</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          This workspace is a clean starting point for the next version of Pulse. The prior Pulse workflows and data model have been removed without changing the rest of SavvyOS.
        </p>
      </section>

      <Card className="border-dashed">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
              <Construction className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Fresh Pulse workspace</CardTitle>
              <CardDescription className="mt-1">
                New Pulse capabilities will be introduced here as the rebuild takes shape.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The Pulse tab remains available so you have a consistent place to return as new workflows are added.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
