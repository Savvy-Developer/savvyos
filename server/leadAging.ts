export const CONTACT_INFORMATION_FIELDS = new Set<string>([
  "firstName",
  "lastName",
  "email",
  "phone",
  "secondaryEmail",
  "secondaryPhone",
  "address",
  "city",
  "state",
  "zip",
  "spouseFirstName",
  "spouseLastName",
  "spouseEmail",
  "spousePhone",
  "timezone",
]);

const NO_EXCLUDED_FIELDS = new Set<string>();

type FieldValues = Record<string, unknown>;

function comparableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(comparableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, comparableValue(nestedValue)]),
    );
  }
  return value;
}

function valuesMatch(left: unknown, right: unknown): boolean {
  return JSON.stringify(comparableValue(left)) === JSON.stringify(comparableValue(right));
}

/**
 * Returns true only when an agent changed at least one non-contact field.
 * The optional excluded-field set lets connection updates treat every supplied
 * field as lead activity, while contact updates exclude identity and contact
 * details such as names, emails, phone numbers, addresses, and time zone.
 */
export function shouldResetLeadAging(
  actorRole: string | null | undefined,
  currentValues: FieldValues,
  updateValues: FieldValues,
  excludedFields: ReadonlySet<string> = CONTACT_INFORMATION_FIELDS,
): boolean {
  if (actorRole !== "agent") return false;

  return Object.entries(updateValues).some(([field, nextValue]) => {
    if (nextValue === undefined || excludedFields.has(field)) return false;
    return !valuesMatch(currentValues[field], nextValue);
  });
}

export { NO_EXCLUDED_FIELDS };
