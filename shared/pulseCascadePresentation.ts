export type CascadeRoutingDetails = {
  fromMeetingName: string;
  toMeetingNames: string[];
  createdAt: Date | string;
  recipientCount: number;
  acknowledgedCount: number;
};

function dateLabel(value: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

/**
 * Canonical, plain-language routing presentation for a frozen Pulse cascade.
 * Keep all four Prompt 5 surfaces on these fields so no destination or
 * acknowledgment state is lost when the message is shown in a new context.
 */
export function getCascadeRoutingPresentation(details: CascadeRoutingDetails) {
  const source = `From ${details.fromMeetingName} · ${dateLabel(details.createdAt)}`;
  const destinations = `To ${details.toMeetingNames.join(", ")}`;
  const acknowledgment = `${details.acknowledgedCount} of ${details.recipientCount} acknowledged`;

  return {
    source,
    destinations,
    acknowledgment,
    text: `${source}\n${destinations}\n${acknowledgment}`,
  };
}
