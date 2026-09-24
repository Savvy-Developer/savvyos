type NumericValue = string | number | null | undefined;

function numberOrNull(value: NumericValue): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function referralPercentage(value: NumericValue): number | null {
  const percentage = numberOrNull(value);
  return percentage !== null && percentage > 0 && percentage <= 100
    ? percentage
    : null;
}

/**
 * Keeps the portal's payout figure aligned with the transaction payout record
 * when one exists. Older transactions without that record use the same source
 * rate fallback that the automatic payout workflow uses.
 */
export function resolveExpectedReferralPayout(input: {
  recordedPayoutAmount?: NumericValue;
  grossCommissionIncome?: NumericValue;
  transactionReferralPayoutPct?: NumericValue;
  sourceReferralPct?: NumericValue;
}): number | null {
  const recordedPayoutAmount = numberOrNull(input.recordedPayoutAmount);
  if (recordedPayoutAmount !== null && recordedPayoutAmount >= 0) {
    return recordedPayoutAmount;
  }

  const grossCommissionIncome = numberOrNull(input.grossCommissionIncome);
  if (grossCommissionIncome === null || grossCommissionIncome < 0) return null;

  const referralPct =
    referralPercentage(input.transactionReferralPayoutPct) ??
    referralPercentage(input.sourceReferralPct);
  if (referralPct === null) return null;

  return Math.round(grossCommissionIncome * referralPct) / 100;
}

/**
 * Sales cycle is measured from lead introduction to closing for closed deals,
 * or from lead introduction through today for deals still in progress.
 */
export function calculatePartnerSalesCycleDays(input: {
  leadSubmittedAt?: Date | string | null;
  transactionStatus?: string | null;
  closingDate?: Date | string | null;
  now?: Date;
}): number | null {
  if (!input.leadSubmittedAt) return null;

  const startedAt = new Date(input.leadSubmittedAt).getTime();
  const closingAt = input.closingDate ? new Date(input.closingDate).getTime() : null;
  if (!Number.isFinite(startedAt)) return null;

  const endedAt =
    input.transactionStatus === "closed" && closingAt !== null && Number.isFinite(closingAt)
      ? closingAt
      : (input.now ?? new Date()).getTime();
  if (!Number.isFinite(endedAt)) return null;

  return Math.max(0, Math.floor((endedAt - startedAt) / 86_400_000));
}
