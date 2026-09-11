/**
 * Turning a pro-forma into figures the public website may show.
 *
 * A pro-forma is an internal working document. Most of what it holds has no
 * business on a public listing, and some of it would be actively misleading
 * there. This module is the narrow, deliberate gate between the two: it takes
 * raw pro-forma form data and returns only a revenue range and the comparable
 * listings that substantiate it.
 *
 * Three rules shape everything here, and all three exist because this output
 * goes in front of investors:
 *
 * 1. A range, never a single number. A lone figure reads as a promise. The
 *    range between the conservative and the strong scenario carries the
 *    uncertainty that is actually in the model.
 * 2. Nothing rather than zero. A scenario with no ADR or no occupancy has not
 *    been filled in, and "$0 projected revenue" is worse than showing nothing.
 * 3. Only what can be checked. Comps are the evidence for the range, so a comp
 *    with no revenue figure is not evidence and is dropped.
 *
 * Whether a property is allowed to publish these at all is decided by the
 * caller, which also enforces that the pro-forma is final rather than a draft.
 */

/** Mirrors the parsing in the pro-forma form, where every field is a string. */
function parseNum(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? "").replace(/[$,]/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** A percentage as typed, "65", becomes the fraction 0.65. */
function parsePct(value: unknown): number {
  const parsed = parseFloat(String(value ?? ""));
  return Number.isNaN(parsed) ? 0 : parsed / 100;
}

export type ScenarioInput = {
  adr: unknown;
  occupancy: unknown;
  availableNights: unknown;
  cleaningFeeRevenue: unknown;
  ancillaryRevenue: unknown;
};

/**
 * Gross annual revenue for one scenario, matching the pro-forma's own
 * arithmetic: nightly revenue, plus the cleaning fee charged on each booking,
 * plus anything ancillary.
 *
 * Returns null when the scenario has not been filled in. A scenario needs both
 * a rate and an occupancy to mean anything; either one missing makes the
 * result zero, which would publish as a real claim of no revenue.
 */
export function scenarioGrossRevenue(
  scenario: ScenarioInput,
  avgLengthOfStay: unknown
): number | null {
  const adr = parseNum(scenario.adr);
  const occupancy = parsePct(scenario.occupancy);
  if (adr <= 0 || occupancy <= 0) return null;

  const availableNights = parseNum(scenario.availableNights) || 365;
  const soldNights = Math.round(availableNights * occupancy);
  const avgLOS = parseNum(avgLengthOfStay) || 3.5;
  const bookings = avgLOS > 0 ? soldNights / avgLOS : 0;

  const nightlyRevenue = adr * soldNights;
  const cleaningFeeRevenue = parseNum(scenario.cleaningFeeRevenue) * bookings;
  const ancillaryRevenue = parseNum(scenario.ancillaryRevenue);

  const gross = nightlyRevenue + cleaningFeeRevenue + ancillaryRevenue;
  if (!Number.isFinite(gross) || gross <= 0) return null;
  return Math.round(gross);
}

function scenarioAt(formData: any, index: 1 | 2 | 3): ScenarioInput {
  return {
    adr: formData?.[`scenario${index}ADR`],
    occupancy: formData?.[`scenario${index}Occupancy`],
    availableNights: formData?.[`scenario${index}AvailableNights`],
    cleaningFeeRevenue: formData?.[`scenario${index}CleaningFeeRevenue`],
    ancillaryRevenue: formData?.[`scenario${index}AncillaryRevenue`],
  };
}

export type RevenueRange = {
  low: number;
  high: number;
  /** True when only one scenario was filled in, so low and high are equal. */
  single: boolean;
};

/**
 * The revenue range to show publicly, spanning whichever scenarios have been
 * filled in. Scenario 1 is the conservative case and 3 the strong one, but the
 * range is taken as the actual minimum and maximum rather than assuming the
 * three are in order, because nothing in the form enforces that.
 *
 * Returns null when no scenario has been filled in.
 */
export function publicRevenueRange(formData: any): RevenueRange | null {
  const avgLOS = formData?.avgLengthOfStay;
  const figures = ([1, 2, 3] as const)
    .map(index => scenarioGrossRevenue(scenarioAt(formData, index), avgLOS))
    .filter((value): value is number => value != null);
  if (figures.length === 0) return null;
  const low = Math.min(...figures);
  const high = Math.max(...figures);
  return { low, high, single: low === high };
}

export type PublicComp = {
  name: string;
  annualRevenue: number;
  adr: number | null;
  occupancy: number | null;
  beds: number | null;
  city: string | null;
  photoUrl: string | null;
  link: string | null;
};

/** Public listings may only be linked over http or https. */
function safeLink(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  return parsed.toString();
}

/**
 * The comparable listings behind the range.
 *
 * A comp earns its place by carrying a revenue figure, either entered directly
 * or derivable from its rate and occupancy. One without a number substantiates
 * nothing, so it is dropped rather than shown as an empty card. The highest
 * earning comps come first, and the list is capped at the same eight the
 * pro-forma form allows.
 */
export function publicComps(formData: any, limit = 8): PublicComp[] {
  const raw = Array.isArray(formData?.comps) ? formData.comps : [];
  const mapped: PublicComp[] = [];
  for (const comp of raw) {
    const name = String(comp?.name ?? "").trim();
    if (!name) continue;

    const adr = parseNum(comp?.adr);
    const occupancy = parsePct(comp?.occupancy);
    const entered = parseNum(comp?.annualRevenue);
    // The form shows a derived revenue whenever rate and occupancy are both
    // present, and only falls back to the typed figure otherwise. Match that,
    // so the public page never disagrees with what the author saw.
    const derived = adr > 0 && occupancy > 0 ? Math.round(adr * occupancy * 365) : 0;
    const annualRevenue = derived > 0 ? derived : entered;
    if (annualRevenue <= 0) continue;

    const beds = parseNum(comp?.beds);
    const city = String(comp?.city ?? "").trim();
    mapped.push({
      name,
      annualRevenue,
      adr: adr > 0 ? adr : null,
      occupancy: occupancy > 0 ? occupancy : null,
      beds: beds > 0 ? beds : null,
      city: city || null,
      photoUrl: safeLink(comp?.photoUrl),
      link: safeLink(comp?.link),
    });
  }
  mapped.sort((a, b) => b.annualRevenue - a.annualRevenue);
  return mapped.slice(0, Math.max(0, limit));
}
