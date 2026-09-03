export const PAYOUT_STATUSES = [
  "unreviewed",
  "reviewed",
  "paid",
  "settled",
] as const;

export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const PAYOUT_STATUS_LABELS: Record<
  PayoutStatus,
  "Unreviewed" | "Reviewed" | "Paid" | "Settled"
> = {
  unreviewed: "Unreviewed",
  reviewed: "Reviewed",
  paid: "Paid",
  settled: "Settled",
};

export function isPayoutStatus(value: unknown): value is PayoutStatus {
  return (
    typeof value === "string" && PAYOUT_STATUSES.includes(value as PayoutStatus)
  );
}

/** Provides a safe display fallback while legacy rows are being migrated. */
export function resolvePayoutStatus(
  value: unknown,
  isPaid = false
): PayoutStatus {
  return isPayoutStatus(value) ? value : isPaid ? "paid" : "unreviewed";
}

export function isPaidPayoutStatus(status: PayoutStatus): boolean {
  return status === "paid" || status === "settled";
}

export function isOpenPayoutStatus(status: PayoutStatus): boolean {
  return status === "unreviewed" || status === "reviewed";
}
