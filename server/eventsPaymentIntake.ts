export type SwoogoPaymentIntake = {
  providerEventId: string | null;
  registrantId: string | null;
  transactionId: string | null;
  paymentMethod: "ach" | "wire" | null;
  amount: number | null;
  registrantName: string | null;
  registrantEmail: string | null;
  sponsorCandidates: string[];
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function records(payload: unknown) {
  const root = record(payload);
  const data = record(root?.data);
  const nestedPayload = record(root?.payload);
  const registrant =
    record(root?.registrant) ??
    record(data?.registrant) ??
    record(nestedPayload?.registrant) ??
    data ??
    nestedPayload;
  const transaction =
    record(root?.transaction) ??
    record(data?.transaction) ??
    record(registrant?.transaction) ??
    (Array.isArray(root?.transactions) ? record(root.transactions[0]) : null) ??
    (Array.isArray(data?.transactions) ? record(data.transactions[0]) : null) ??
    (Array.isArray(registrant?.transactions)
      ? record(registrant.transactions[0])
      : null);
  return [root, data, nestedPayload, registrant, transaction].filter(
    (item): item is UnknownRecord => Boolean(item)
  );
}

function firstText(values: UnknownRecord[], keys: string[]) {
  for (const item of values) {
    for (const key of keys) {
      const value = item[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value))
        return String(value);
    }
  }
  return null;
}

function firstAmount(values: UnknownRecord[]) {
  const raw = firstText(values, [
    "amount",
    "total",
    "total_due",
    "amount_due",
    "balance_due",
    "payment_amount",
    "registration_total",
  ]);
  if (!raw) return null;
  const parsed = Number(raw.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalized(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function classifyPaymentMethod(values: UnknownRecord[]) {
  const signal = values
    .flatMap(item =>
      [
        item.payment_method,
        item.paymentMethod,
        item.payment_type,
        item.paymentType,
        item.transaction_type,
        item.transactionType,
        item.type,
        item.method,
      ].map(value => String(value ?? ""))
    )
    .join(" ")
    .toLocaleLowerCase();
  if (/\b(ach|e-?check|bank\s*ach)\b/.test(signal)) return "ach" as const;
  if (/\bwire\b|wire_transfer|wire transfer|bank\s+transfer/.test(signal))
    return "wire" as const;
  return null;
}

/**
 * Extracts only clear offline-payment signals from a Swoogo registrant payload.
 * An unrecognized payment method returns null, preventing non-sponsor or card
 * registrations from entering the operating payment tracker.
 */
export function extractSwoogoPaymentIntake(
  payload: unknown
): SwoogoPaymentIntake | null {
  const values = records(payload);
  if (!values.length) return null;
  const paymentMethod = classifyPaymentMethod(values);
  if (!paymentMethod) return null;
  const firstName = firstText(values, ["first_name", "firstName"]);
  const lastName = firstText(values, ["last_name", "lastName"]);
  const explicitName = firstText(values, [
    "registrant_name",
    "registrantName",
    "name",
  ]);
  const assembledName = [firstName, lastName].filter(Boolean).join(" ");
  const registrantName = explicitName ?? (assembledName || null);
  const sponsorCandidates = [
    firstText(values, [
      "company",
      "company_name",
      "companyName",
      "organization",
      "organization_name",
      "organizationName",
      "sponsor_name",
      "sponsorName",
    ]),
    registrantName,
  ].filter((value): value is string => Boolean(value && normalized(value)));
  return {
    providerEventId: firstText(values, ["event_id", "eventId"]),
    registrantId: firstText(values, ["registrant_id", "registrantId", "id"]),
    transactionId: firstText(values, ["transaction_id", "transactionId"]),
    paymentMethod,
    amount: firstAmount(values),
    registrantName,
    registrantEmail: firstText(values, [
      "email",
      "registrant_email",
      "registrantEmail",
    ]),
    sponsorCandidates,
  };
}

export function normalizePaymentIdentity(value: string | null | undefined) {
  return value ? normalized(value) : "";
}
