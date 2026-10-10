function calendarDateKey(value: Date | string) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value));
  return match?.[1] ?? null;
}

/**
 * Event dates and sponsor deadlines are calendar dates. Use UTC noon so a
 * server or browser time-zone conversion cannot shift a deadline by one day.
 */
export function dueDateFromEventStart(
  eventStartDate: Date | string | null | undefined,
  dueOffsetDays: number | null | undefined
) {
  if (!eventStartDate || !Number.isInteger(dueOffsetDays)) return null;
  const dateKey = calendarDateKey(eventStartDate);
  if (!dateKey) return null;
  const dueDate = new Date(`${dateKey}T12:00:00.000Z`);
  dueDate.setUTCDate(dueDate.getUTCDate() + dueOffsetDays);
  return dueDate;
}
