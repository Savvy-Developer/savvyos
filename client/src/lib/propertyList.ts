export type PropertyListProperty = {
  id: number;
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * `properties.list` returns rows shaped as `{ property, ...aggregateCounts }`.
 * Selection controls only need the nested property record. Accepting a bare
 * property as well keeps the controls resilient if a caller already normalized
 * the response.
 */
export function unwrapPropertyListRows(
  rows: readonly unknown[] | null | undefined
): PropertyListProperty[] {
  return (rows ?? []).flatMap(row => {
    const candidate = isRecord(row) && "property" in row ? row.property : row;
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== "number" ||
      typeof candidate.address !== "string"
    ) {
      return [];
    }

    return [candidate as PropertyListProperty];
  });
}
