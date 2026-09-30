/** Formats an inline to-do due date without consuming space for its year. */
export function formatTodoDueMonthDay(value: Date | string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
