/**
 * CSV for the Pipeline page's Export dialog. Built in the browser from
 * agentConnections.exportRows, so it lives here as plain functions that the
 * server tests can exercise too.
 */

export type PipelineExportRow = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  stage: string | null;
  relationshipType: string | null;
  agentName: string | null;
  isaName: string | null;
  leadSourceName: string | null;
  parentLeadSourceName: string | null;
  updatedAt: Date | string | null;
};

export const PIPELINE_CSV_HEADERS = [
  "Name",
  "Email",
  "Phone",
  "Address",
  "City",
  "State",
  "Zip",
  "Stage",
  "Relationship Type",
  "Agent",
  "ISA",
  "Lead Source",
  "Last Updated",
] as const;

const RELATIONSHIP_LABELS: Record<string, string> = {
  buyer: "Buyer",
  seller: "Seller",
  both: "Buyer & Seller",
};

/**
 * One CSV cell. Quotes when needed (comma, quote, newline) and defuses
 * spreadsheet formulas: a value starting with = + - @ (or a tab/CR) is
 * prefixed with a single quote so Excel and Sheets show it as text.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function lastUpdated(value: Date | string | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  // ISO date and time (UTC), which every spreadsheet sorts correctly.
  return date.toISOString().replace("T", " ").slice(0, 16);
}

/** The CSV text: header row, then one row per connection, CRLF line endings. */
export function buildPipelineCsv(
  rows: PipelineExportRow[],
  stageLabels: Record<string, string> = {},
): string {
  const lines = [PIPELINE_CSV_HEADERS.map(csvCell).join(",")];
  for (const row of rows) {
    const name = [row.firstName, row.lastName].map(part => (part ?? "").trim()).filter(Boolean).join(" ");
    const leadSource = row.parentLeadSourceName && row.leadSourceName
      ? `${row.parentLeadSourceName} > ${row.leadSourceName}`
      : row.leadSourceName ?? "";
    lines.push(
      [
        name,
        row.email,
        row.phone,
        row.address,
        row.city,
        row.state,
        row.zip,
        row.stage ? stageLabels[row.stage] ?? row.stage : "",
        row.relationshipType ? RELATIONSHIP_LABELS[row.relationshipType] ?? row.relationshipType : "",
        row.agentName,
        row.isaName,
        leadSource,
        lastUpdated(row.updatedAt),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
