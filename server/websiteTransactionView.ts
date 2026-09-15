/**
 * What a buyer may see of their own transaction.
 *
 * This is the first place SavvyOS transaction data reaches someone outside the
 * company, so it is built as a whitelist rather than a redaction list. A new
 * column added to the transactions table appears here only if somebody adds it
 * on purpose. The opposite arrangement, where everything is shared unless
 * somebody remembers to hide it, fails silently and in the wrong direction: the
 * day a "sellerMotivation" or "clientNotes" column lands, it would be on a
 * client's screen before anyone noticed.
 *
 * Deliberately not shared, and worth naming so nobody adds them later without
 * thinking: gross commission income, commission rates and types, referral
 * payout percentages, payout integrity flags and notes, internal notes of any
 * kind, buyer notes, the termination reason, and the internal transaction
 * number. Some of those are confidential. Some are merely internal shorthand
 * that reads badly to the person it is about, which is its own kind of damage.
 */

export type TransactionStepState = "done" | "current" | "upcoming" | "stopped";

export type TransactionStep = {
  key: "under_contract" | "closing" | "closed";
  label: string;
  state: TransactionStepState;
  date: Date | null;
};

export type BuyerVisibleTransaction = {
  id: number;
  side: "purchase" | "sale";
  status: "under_contract" | "closed" | "terminated";
  statusLabel: string;
  propertyAddress: string | null;
  purchasePrice: string | null;
  contractDate: Date | null;
  closingDate: Date | null;
  steps: TransactionStep[];
  agent: {
    name: string | null;
    email: string | null;
    phone: string | null;
    imageUrl: string | null;
    slug: string | null;
  };
};

/**
 * The fields this view will never carry, asserted by the tests.
 *
 * Kept as data rather than prose so the test can iterate it. If someone widens
 * the projection to include one of these, the test fails and says which.
 */
export const NEVER_SHARED_TRANSACTION_FIELDS = [
  "grossCommissionIncome",
  "commissionRate",
  "commissionType",
  "buyerCommissionRate",
  "buyerCommissionType",
  "referralSourceName",
  "referralPayoutPct",
  "referralId",
  "payoutIntegrityFlag",
  "payoutIntegrityNote",
  "terminationReason",
  "notes",
  "buyerNotes",
  "transactionNumber",
  "transactionLeadSourceId",
  "agentId",
  "primaryContactId",
  "sellerContactId",
  "buyerContactId",
] as const;

const STATUS_LABEL: Record<BuyerVisibleTransaction["status"], string> = {
  under_contract: "Under contract",
  closed: "Closed",
  // Said plainly and without the reason. The reason lives in an internal field
  // written for colleagues, and a client reading "buyer got cold feet" about
  // themselves is not information, it is an insult.
  terminated: "Did not close",
};

/**
 * The three points of a purchase, as the person buying experiences it.
 *
 * A terminated deal stops wherever it got to rather than showing two greyed
 * steps that imply it is still coming.
 */
export function transactionSteps(
  status: BuyerVisibleTransaction["status"],
  contractDate: Date | null,
  closingDate: Date | null
): TransactionStep[] {
  if (status === "terminated") {
    return [
      {
        key: "under_contract",
        label: "Under contract",
        state: "done",
        date: contractDate,
      },
      { key: "closing", label: "Did not close", state: "stopped", date: null },
    ];
  }

  const closed = status === "closed";
  return [
    {
      key: "under_contract",
      label: "Under contract",
      state: "done",
      date: contractDate,
    },
    {
      key: "closing",
      label: closed ? "Closing" : "Closing expected",
      state: closed ? "done" : "current",
      date: closedOrExpected(closingDate),
    },
    {
      key: "closed",
      label: "Closed",
      state: closed ? "done" : "upcoming",
      date: closed ? closingDate : null,
    },
  ];
}

function closedOrExpected(closingDate: Date | null) {
  return closingDate ?? null;
}

type TransactionRow = {
  id: number;
  transactionType: "buyer" | "seller" | "dual";
  status: BuyerVisibleTransaction["status"];
  propertyAddressSnapshot: string | null;
  address: string | null;
  purchasePrice: string | null;
  contractDate: Date | null;
  closingDate: Date | null;
  agentName: string | null;
  agentEmail: string | null;
  agentPhone: string | null;
  agentImageUrl: string | null;
  agentSlug: string | null;
};

/**
 * Build the client-facing view of one transaction.
 *
 * `dual` means Savvy represented both sides. From the buyer's seat that is
 * still a purchase, so it reads as one; which side the brokerage sat on is an
 * internal arrangement and not this person's business to be told here.
 */
export function buyerVisibleTransaction(
  row: TransactionRow
): BuyerVisibleTransaction {
  const contractDate = row.contractDate ?? null;
  const closingDate = row.closingDate ?? null;
  return {
    id: row.id,
    side: row.transactionType === "seller" ? "sale" : "purchase",
    status: row.status,
    statusLabel: STATUS_LABEL[row.status],
    // The snapshot is what the paperwork said at the time. A later edit to the
    // property record must not silently rewrite the address on someone's deal.
    propertyAddress: row.propertyAddressSnapshot || row.address || null,
    purchasePrice: row.purchasePrice ?? null,
    contractDate,
    closingDate,
    steps: transactionSteps(row.status, contractDate, closingDate),
    agent: {
      name: row.agentName ?? null,
      email: row.agentEmail ?? null,
      phone: row.agentPhone ?? null,
      imageUrl: row.agentImageUrl ?? null,
      slug: row.agentSlug ?? null,
    },
  };
}
