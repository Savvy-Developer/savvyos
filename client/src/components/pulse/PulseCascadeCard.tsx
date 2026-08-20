import { useState } from "react";
import { Check, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PulseCascadeCardMessage = {
  id: string;
  body: string;
  recipientCount: number;
  acknowledgedCount: number;
  myAcknowledgedAt: Date | string | null;
  canAcknowledge: boolean;
  routing: {
    source: string;
    destinations: string;
    acknowledgment: string;
  };
};

export function PulseCascadeCard({
  message,
  onAcknowledge,
  isAcknowledging = false,
}: {
  message: PulseCascadeCardMessage;
  onAcknowledge: (messageId: string) => void;
  isAcknowledging?: boolean;
}) {
  const [showRoster, setShowRoster] = useState(false);

  return (
    <article className="rounded-lg border border-border bg-muted/40 p-3 sm:p-4">
      <p className="text-sm font-medium text-foreground">{message.routing.source}</p>
      <p className="mt-1 text-sm text-muted-foreground">{message.routing.destinations}</p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">{message.body}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
        <span>{message.routing.acknowledgment}</span>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={showRoster}
          onClick={() => setShowRoster((value) => !value)}
        >
          <Users className="h-4 w-4" aria-hidden="true" />
          {showRoster ? "Hide roster" : "View roster"}
        </button>
      </div>
      {showRoster && (
        <p className="mt-2 rounded-md bg-background/70 px-3 py-2 text-sm text-muted-foreground">
          Frozen at send time: {message.recipientCount} recipient{message.recipientCount === 1 ? "" : "s"}; {message.acknowledgedCount} acknowledged.
        </p>
      )}
      {message.canAcknowledge ? (
        <Button
          type="button"
          variant="outline"
          className="mt-3 min-h-11"
          disabled={isAcknowledging}
          onClick={() => onAcknowledge(message.id)}
        >
          <Check className="mr-2 h-4 w-4" aria-hidden="true" />
          {isAcknowledging ? "Saving…" : "Got it"}
        </Button>
      ) : message.myAcknowledgedAt ? (
        <p className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-emerald-700">
          <Check className="h-4 w-4" aria-hidden="true" /> Acknowledged
        </p>
      ) : null}
    </article>
  );
}
