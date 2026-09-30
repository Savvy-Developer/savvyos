export type MyEosRockItem = {
  id: string;
  type: string;
  meetingId: string | null;
  meetingName?: string | null;
  ownerPersonId: number | null;
  assigneeId: number | null;
  [key: string]: unknown;
};

export type RoutedPersonalRockMeeting = {
  workItemId: string;
  meetingId: string;
  meetingName: string;
};

/**
 * A Rock can remain personal while being deliberately routed to one visible L10.
 * My EOS should place that Rock in its routed meeting without moving the source
 * item or changing access, ownership, or the Rock's home record.
 */
export function projectRoutedPersonalRocks<T extends MyEosRockItem>(items: T[], routes: RoutedPersonalRockMeeting[], personId: number): T[] {
  const routesByRockId = new Map<string, RoutedPersonalRockMeeting[]>();
  for (const route of routes) routesByRockId.set(route.workItemId, [...(routesByRockId.get(route.workItemId) ?? []), route]);
  return items.flatMap((item) => {
    if (item.type !== "rock" || item.meetingId || (item.ownerPersonId !== personId && item.assigneeId !== personId)) return item;
    const routedMeetings = routesByRockId.get(item.id) ?? [];
    return routedMeetings.length ? routedMeetings.map((route) => ({ ...item, meetingId: route.meetingId, meetingName: route.meetingName, routedFromPersonal: true })) : item;
  });
}
