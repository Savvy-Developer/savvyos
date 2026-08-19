import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { formatActivityEntry } from "@/lib/activityFormatter";
import { Globe2, Loader2 } from "lucide-react";

const WEBSITE_ACTIONS = new Set([
  "property_viewed",
  "property_favorited",
  "property_contact_requested",
  "market_searched",
  "property_shared",
  "analysis_requested",
  "showing_requested",
]);

type BehaviorRow = any;

function WebsiteBehaviorsList({ behaviors, sourceLabel }: { behaviors: BehaviorRow[]; sourceLabel: string }) {
  if (behaviors.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <Globe2 className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-medium">No website behavior yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Property views, favorites, requests, and other events sent through the website webhook will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{sourceLabel}</p>
      {behaviors.map((row: BehaviorRow) => {
        const log = row?.log ?? row;
        const entry = formatActivityEntry(row?.log ? row : { log, user: null });
        return (
          <Card key={log.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Globe2 className="h-4 w-4 text-primary" />
                {entry.title}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{entry.timestamp}</p>
            </CardHeader>
            <CardContent className="space-y-1.5 pt-0">
              {entry.lines.length > 0 ? entry.lines.map((line, index) => (
                <p key={`${log.id}-${index}`} className="text-sm whitespace-pre-wrap">{line}</p>
              )) : (
                <p className="text-sm text-muted-foreground">Website activity received.</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function WebsiteBehaviorsTab({ connectionId }: { connectionId: number }) {
  const { data: behaviors = [], isLoading } = trpc.agentConnections.websiteBehaviors.useQuery({ connectionId });

  if (isLoading) {
    return (
      <div className="flex justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return <WebsiteBehaviorsList behaviors={behaviors} sourceLabel="Events delivered from the Savvy website webhook for this connection’s contact." />;
}

export function ContactWebsiteBehaviorsTab({ contactId }: { contactId: number }) {
  const { data: activityLog = [], isLoading } = trpc.analytics.activityLog.useQuery({ contactId });
  const behaviors = activityLog.filter((row: BehaviorRow) => WEBSITE_ACTIONS.has(row?.log?.action ?? row?.action ?? ""));

  if (isLoading) {
    return (
      <div className="flex justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return <WebsiteBehaviorsList behaviors={behaviors} sourceLabel="Events delivered from the Savvy website webhook for this contact." />;
}
