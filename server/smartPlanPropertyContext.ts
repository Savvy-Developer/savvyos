export const OFFER_SHEET_REFERRAL_PLAN_NAME =
  "Offer Sheet Referral New Lead (Texts)";
export const OFFER_SHEET_REFERRAL_SOURCE_NAME = "The Offer Sheet Referral";
export const OFFER_SHEET_REFERRAL_FALLBACK_TEXT =
  "Hey {{firstname}}... thanks for checking out the short term rental property for sale on The Offer Sheet. Should I connect you w the Agent on it? -Savvy";

/**
 * Extract the property address from the referral-lead note supplied by the Offer
 * Sheet intake. The upstream note is not consistently spaced, so the extraction
 * stops at the next known intake field instead of relying on a line break after
 * the label.
 */
export function extractOfferSheetReferralPropertyAddress(
  notes: string | null | undefined
): string | null {
  if (!notes) return null;

  const referralMarker = /new\s+referral\s+property\s+lead\s+received\s*:/gi;
  let match: RegExpExecArray | null;
  let candidate: string | null = null;

  while ((match = referralMarker.exec(notes)) !== null) {
    const intake = notes.slice(match.index + match[0].length);
    const address = intake
      .match(
        /address\s+of\s+interested\s+property\s*:?\s*([\s\S]*?)(?=(?:\r?\n|\s*)(?:name|email|phone|message|submitted)\s*:?|$)/i
      )?.[1]
      ?.replace(/\s+/g, " ")
      .trim();

    if (address) candidate = address;
  }

  return candidate || null;
}

/** Restrict the property-aware behavior to the one requested plan and source. */
export function isOfferSheetReferralPlan(
  planName: string,
  leadSourceName: string | null
): boolean {
  return (
    planName.trim() === OFFER_SHEET_REFERRAL_PLAN_NAME &&
    leadSourceName?.trim() === OFFER_SHEET_REFERRAL_SOURCE_NAME
  );
}
