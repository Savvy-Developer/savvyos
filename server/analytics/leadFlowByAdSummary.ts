/**
 * Lead Flow by Ad: the leads each ad brought in, and what happened to them.
 *
 * Pure grouping and counting. The query that feeds it is in leadFlowByAd.ts.
 *
 * The outcome rules match Lead Cohort Conversion (leadCohortConversion.ts), so
 * the two reports never disagree about the same contact:
 * - a contract or close counts only when it happened on or after the day the
 *   lead came in, and a close counts as a contract even when the transaction
 *   has no contract date;
 * - a booked call is any appointment or Market Match booking that was not
 *   cancelled, made on or after the day the lead came in.
 *
 * No cost figures: spend lives in the ad platforms, not in SavvyOS.
 */

export type LeadFlowLevel = "campaign" | "adSet" | "ad";

/**
 * Which tracking tag holds what. Meta's standard URL parameters put the
 * campaign in utm_campaign, the ad set in utm_term and the ad in
 * utm_content; Google Ads templates follow the same convention.
 */
export const LEVEL_FIELDS: Record<LeadFlowLevel, Array<"utmCampaign" | "utmTerm" | "utmContent">> = {
  campaign: ["utmCampaign"],
  adSet: ["utmCampaign", "utmTerm"],
  ad: ["utmCampaign", "utmTerm", "utmContent"],
};

export const NOT_SET = "(not set)";

export type LeadFlowContact = {
  contactId: number;
  contactName: string;
  createdAt: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  stage: string | null;
  firstBookedAt: string | null;
  firstContractDate: string | null;
  firstClosingDate: string | null;
};

export type LeadFlowOutcome = {
  booked: boolean;
  contracted: boolean;
  closed: boolean;
};

export type LeadFlowGroup = {
  key: string;
  campaign: string;
  adSet: string | null;
  ad: string | null;
  sources: string[];
  leads: number;
  bookedCalls: number;
  underContract: number;
  closed: number;
  bookedPct: number;
  contractPct: number;
  closePct: number;
  contacts: Array<LeadFlowContact & LeadFlowOutcome>;
};

function dayMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/** Whether each step happened, and happened after the lead came in. */
export function leadOutcome(contact: LeadFlowContact): LeadFlowOutcome {
  const created = dayMs(contact.createdAt);
  const after = (value: string | null) => {
    const at = dayMs(value);
    return created !== null && at !== null && at >= created;
  };
  const closed = after(contact.firstClosingDate);
  return {
    booked: after(contact.firstBookedAt),
    contracted: after(contact.firstContractDate) || closed,
    closed,
  };
}

function label(value: string | null): string {
  const clean = (value ?? "").trim();
  return clean || NOT_SET;
}

function percentage(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

/**
 * One row per campaign, ad set or ad. Tags are compared as written, apart
 * from surrounding spaces, because ad names are case-sensitive in Meta and
 * two ads that differ only in case are two ads.
 */
export function summarizeLeadFlow(contacts: LeadFlowContact[], level: LeadFlowLevel): LeadFlowGroup[] {
  const groups = new Map<string, LeadFlowGroup>();
  for (const contact of contacts) {
    const parts = LEVEL_FIELDS[level].map(field => label(contact[field]));
    const key = parts.join(" › ");
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        campaign: parts[0],
        adSet: parts[1] ?? null,
        ad: parts[2] ?? null,
        sources: [],
        leads: 0,
        bookedCalls: 0,
        underContract: 0,
        closed: 0,
        bookedPct: 0,
        contractPct: 0,
        closePct: 0,
        contacts: [],
      };
      groups.set(key, group);
    }
    const outcome = leadOutcome(contact);
    group.leads += 1;
    if (outcome.booked) group.bookedCalls += 1;
    if (outcome.contracted) group.underContract += 1;
    if (outcome.closed) group.closed += 1;
    const source = label(contact.utmSource);
    if (!group.sources.includes(source)) group.sources.push(source);
    group.contacts.push({ ...contact, ...outcome });
  }
  const list = Array.from(groups.values());
  for (const group of list) {
    group.bookedPct = percentage(group.bookedCalls, group.leads);
    group.contractPct = percentage(group.underContract, group.leads);
    group.closePct = percentage(group.closed, group.leads);
    group.sources.sort();
    group.contacts.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }
  // Most leads first; "(not set)" rows last, since they are the ones nobody
  // can act on.
  return list.sort((a, b) => {
    const aUnset = a.key.includes(NOT_SET) ? 1 : 0;
    const bUnset = b.key.includes(NOT_SET) ? 1 : 0;
    return aUnset - bUnset || b.leads - a.leads || a.key.localeCompare(b.key);
  });
}

export function leadFlowTotals(groups: LeadFlowGroup[]) {
  const leads = groups.reduce((sum, g) => sum + g.leads, 0);
  const bookedCalls = groups.reduce((sum, g) => sum + g.bookedCalls, 0);
  const underContract = groups.reduce((sum, g) => sum + g.underContract, 0);
  const closed = groups.reduce((sum, g) => sum + g.closed, 0);
  return {
    leads,
    bookedCalls,
    underContract,
    closed,
    bookedPct: percentage(bookedCalls, leads),
    contractPct: percentage(underContract, leads),
    closePct: percentage(closed, leads),
  };
}
