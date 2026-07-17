import type { TransactionExportFilters } from "./db";

export const TRANSACTION_EXPORT_COLUMNS = [
  "Transaction ID",
  "Transaction Number",
  "Status",
  "Transaction Type",
  "Agent Name",
  "Agent Email",
  "Contact First Name",
  "Contact Last Name",
  "Contact Email",
  "Contact Phone",
  "Property Address",
  "Property City",
  "Property State",
  "Property ZIP",
  "Purchase Price",
  "Gross Commission Income",
  "Commission Rate (%)",
  "Commission Type",
  "Contract Date",
  "Closing Date",
  "Lead Source Category",
  "Lead Source",
  "Payout Integrity Flag",
  "Payout Integrity Note",
  "Termination Reason",
  "Referral Source",
  "Referral Payout (%)",
  "Notes",
  "Created At",
  "Updated At",
] as const;

type ExportTransactionRow = {
  transaction: Record<string, any>;
  agent: Record<string, any> | null;
  contact: Record<string, any> | null;
  property: Record<string, any> | null;
  leadSource: { id: number | null; name: string | null; parentId: number | null } | null;
  parentLeadSource: { id: number | null; name: string | null } | null;
};

export type TransactionExportFilterLabels = {
  agentName?: string;
  marketName?: string;
  leadSourceName?: string;
};

function formatDate(value: unknown, includeTime = false) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return includeTime ? date.toISOString() : date.toISOString().slice(0, 10);
}

function formatCommissionRate(value: unknown, commissionType: unknown) {
  if (!value || commissionType !== "percentage") return "";
  const rate = Number(value);
  if (!Number.isFinite(rate)) return "";
  return (rate < 1 ? rate * 100 : rate).toFixed(2);
}

/** Prevents spreadsheet formula execution while preserving the visible cell value. */
export function escapeCsvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildTransactionCsv(rows: ExportTransactionRow[]) {
  const dataRows = rows.map((row) => {
    const tx = row.transaction;
    return [
      tx.id,
      tx.transactionNumber,
      tx.status,
      tx.transactionType,
      row.agent?.name,
      row.agent?.email,
      row.contact?.firstName,
      row.contact?.lastName,
      row.contact?.email,
      row.contact?.phone,
      row.property?.address,
      row.property?.city,
      row.property?.state,
      row.property?.zip,
      tx.purchasePrice,
      tx.grossCommissionIncome,
      formatCommissionRate(tx.commissionRate, tx.commissionType),
      tx.commissionType,
      formatDate(tx.contractDate),
      formatDate(tx.closingDate),
      row.parentLeadSource?.name,
      row.leadSource?.name,
      tx.payoutIntegrityFlag ? "Yes" : "No",
      tx.payoutIntegrityNote,
      tx.terminationReason,
      tx.referralSourceName,
      tx.referralPayoutPct,
      tx.notes,
      formatDate(tx.createdAt, true),
      formatDate(tx.updatedAt, true),
    ].map(escapeCsvCell).join(",");
  });

  return `\uFEFF${TRANSACTION_EXPORT_COLUMNS.map(escapeCsvCell).join(",")}\r\n${dataRows.join("\r\n")}`;
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function buildTransactionExportFilterSummary(
  filters: TransactionExportFilters,
  labels: TransactionExportFilterLabels = {},
) {
  const parts: string[] = [];
  if (filters.search) parts.push(`Search: “${filters.search}”`);
  if (filters.status) parts.push(`Status: ${titleCase(filters.status)}`);
  if (filters.transactionType) parts.push(`Type: ${titleCase(filters.transactionType)}`);
  if (filters.agentId) parts.push(`Agent: ${labels.agentName ?? `#${filters.agentId}`}`);
  if (filters.marketId) parts.push(`Market: ${labels.marketName ?? `#${filters.marketId}`}`);
  if (filters.leadSourceId) parts.push(`Lead source: ${labels.leadSourceName ?? `#${filters.leadSourceId}`}`);
  if (filters.contractDateFrom || filters.contractDateTo) {
    parts.push(`Contract date: ${filters.contractDateFrom ?? "Any"} to ${filters.contractDateTo ?? "Any"}`);
  }
  if (filters.closingDateFrom || filters.closingDateTo) {
    parts.push(`Closing date: ${filters.closingDateFrom ?? "Any"} to ${filters.closingDateTo ?? "Any"}`);
  }
  if (filters.flagNoClosingDate) parts.push("Missing closing date");
  if (filters.flagPastClosingDate) parts.push("Past-due closing date");
  if (filters.flagPayoutIntegrity) parts.push("Payout integrity issue");
  return parts.length > 0 ? parts.join("; ") : "All transactions";
}
