/**
 * Sorts mixed contact activity into a stable newest-first timeline.
 * Undated or invalid entries remain at the end in their original order.
 */
export function sortActivityTimeline<
  T extends { occurredAt?: string | Date | null },
>(items: readonly T[]): T[] {
  const timestampFor = (value: T["occurredAt"]): number | null => {
    if (!value) return null;
    const timestamp =
      value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  };

  return items
    .map((item, index) => ({
      item,
      index,
      timestamp: timestampFor(item.occurredAt),
    }))
    .sort((a, b) => {
      if (a.timestamp !== null && b.timestamp !== null) {
        return b.timestamp - a.timestamp || a.index - b.index;
      }
      if (a.timestamp !== null) return -1;
      if (b.timestamp !== null) return 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}
