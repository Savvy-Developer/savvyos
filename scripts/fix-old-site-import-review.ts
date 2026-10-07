/**
 * The data fixes from the PR #178 review of the old-site investor import.
 *
 * A one-off. It touches only rows that import created, named by id in the
 * .rollback.json manifests the import wrote, so it cannot reach a row that
 * live traffic added since.
 *
 * Usage:
 *   tsx scripts/fix-old-site-import-review.ts                 # dry run (default)
 *   tsx scripts/fix-old-site-import-review.ts --apply         # write
 *   tsx scripts/fix-old-site-import-review.ts --only=quiet    # one fix
 *
 * Options:
 *   --apply             Write. Without it nothing is updated.
 *   --only=a,b          Any of: quiet, connection-dates.
 *   --source=DIR        Where the CSVs and .rollback.json manifests are
 *                       (default ../savvy-migration beside the repo).
 *   --report=FILE       Where to write the JSON report. Defaults into the
 *                       source folder. Never inside the repository.
 *
 * Fix 1 "quiet" — a preference row the import created is set to
 * notificationsEnabled=0, emailFrequency='never' when either
 *   (a) the old export had marketing_consent=false for that account, or
 *   (b) a contact with the same email is 'unsubscribed' or 'bounced' here.
 * The import carried neither signal: marketing_consent is in
 * INVESTOR_UNMAPPED_COLUMNS, and contacts were never consulted for
 * preferences. So 1,334 investors became emailable on a default of "daily"
 * regardless of what they had asked for. A row already quiet is left alone,
 * so re-running writes nothing.
 *
 * Fix 3 "connection-dates" — agent_connections is the one table the import
 * inserted without an explicit createdAt (every other insert passes the old
 * date), so all 69 rows read as created on import day and surface as today's
 * new leads. The enquiry date is already on the row: the insert set
 * agingUpdatedAt to lead.createdAt. So createdAt is set from agingUpdatedAt,
 * and only where agingUpdatedAt is genuinely older than createdAt — that
 * insert fell back to `new Date()` when the enquiry had no date, and those
 * rows have no old date to restore and are reported instead.
 *
 * Undo: --apply writes a .rollback.json and .rollback.sql beside the report
 * holding each row's values from BEFORE the update, including updatedAt —
 * both tables carry onUpdateNow(), so an update moves updatedAt as a side
 * effect and the restore has to put it back explicitly.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import {
  INVESTOR_COLUMNS,
  cell,
  missingColumns,
  parseBooleanOrNull,
  readCsv,
  type CsvFile,
} from "../server/oldSiteInvestorImportLogic";

// ─── Arguments ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const option = (name: string) => {
  const hit = argv.find(entry => entry.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const APPLY = flag("apply");
const FIXES = ["quiet", "connection-dates"] as const;
type Fix = (typeof FIXES)[number];

const onlyRaw = option("only");
const selected: Fix[] = onlyRaw
  ? (onlyRaw.split(",").map(entry => entry.trim()).filter(Boolean) as Fix[])
  : [...FIXES];
const unknown = selected.filter(entry => !(FIXES as readonly string[]).includes(entry));
if (unknown.length) {
  console.error(`Unknown --only value: ${unknown.join(", ")}. Choose from ${FIXES.join(", ")}.`);
  process.exit(2);
}

const stray = argv.filter(
  entry =>
    !/^--apply$/.test(entry) &&
    !/^--(only|source|report)=/.test(entry)
);
if (stray.length) {
  console.error(`Unrecognised argument: ${stray.join(", ")}`);
  process.exit(2);
}

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_DIR = path.resolve(option("source") ?? path.join(REPO_ROOT, "..", "savvy-migration"));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.resolve(option("report") ?? path.join(SOURCE_DIR, `fix-report-${stamp}.json`));
if (!path.relative(REPO_ROOT, reportPath).startsWith("..")) {
  console.error(`Refusing to write the report inside the repository: ${reportPath}`);
  process.exit(2);
}
const manifestPath = reportPath.replace(/(\.json)?$/, "") + ".rollback.json";
const rollbackSqlPath = reportPath.replace(/(\.json)?$/, "") + ".rollback.sql";

// ─── What the import created ─────────────────────────────────────────────────

type ImportedIds = { preferences: number[]; connections: number[]; manifests: string[] };

/**
 * Every .rollback.json in the source folder, unioned. Reading them all rather
 * than naming four files means a later import run's manifest is picked up
 * instead of silently ignored.
 */
function loadImportedIds(): ImportedIds {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Source folder not found: ${SOURCE_DIR}`);
    process.exit(2);
  }
  const names = fs
    .readdirSync(SOURCE_DIR)
    .filter(name => name.endsWith(".rollback.json"))
    .sort();
  const preferences = new Set<number>();
  const connections = new Set<number>();
  for (const name of names) {
    let parsed: { ids?: Record<string, unknown> };
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, name), "utf8"));
    } catch (error) {
      console.error(`${name} is not readable JSON: ${(error as Error).message}`);
      process.exit(2);
    }
    const ids = parsed.ids ?? {};
    for (const id of toNumbers(ids["website_account_preferences"])) preferences.add(id);
    for (const id of toNumbers(ids["agent_connections"])) connections.add(id);
  }
  if (!names.length) {
    console.error(`No .rollback.json manifest in ${SOURCE_DIR}. Without one there is no list of imported rows to limit this to.`);
    process.exit(2);
  }
  return {
    preferences: Array.from(preferences).sort((a, b) => a - b),
    connections: Array.from(connections).sort((a, b) => a - b),
    manifests: names,
  };
}

function toNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const entry of value) {
    const id = Number(entry);
    if (Number.isInteger(id) && id > 0) out.push(id);
  }
  return out;
}

// ─── The old export's marketing_consent ──────────────────────────────────────

/** email (lowercased) → marketing_consent, for the accounts file in the folder. */
function loadMarketingConsent(): { byEmail: Map<string, boolean | null>; fileName: string } {
  const csvNames = fs.readdirSync(SOURCE_DIR).filter(name => name.toLowerCase().endsWith(".csv"));
  const matches: Array<{ name: string; file: CsvFile }> = [];
  for (const name of csvNames) {
    const file = readCsv(fs.readFileSync(path.join(SOURCE_DIR, name), "utf8"));
    // Same marker columns the import uses to recognise this file, so a
    // password-stripped copy is still found.
    if (file.header.includes("encrypted_password") && file.header.includes("assigned_agent_email")) {
      matches.push({ name, file });
    }
  }
  if (matches.length !== 1) {
    console.error(
      matches.length === 0
        ? `No investor accounts CSV in ${SOURCE_DIR} (needs the columns encrypted_password, assigned_agent_email).`
        : `${matches.length} files look like the investor accounts CSV (${matches.map(m => m.name).join(", ")}). Leave one in place.`
    );
    process.exit(2);
  }
  const chosen = matches[0];
  const missing = missingColumns(chosen.file, INVESTOR_COLUMNS);
  if (missing.length) {
    console.error(`${chosen.name} is missing the columns: ${missing.join(", ")}.`);
    process.exit(2);
  }
  const byEmail = new Map<string, boolean | null>();
  for (const record of chosen.file.records) {
    const email = cell(record, "email");
    if (!email) continue;
    byEmail.set(email.trim().toLowerCase(), parseBooleanOrNull(cell(record, "marketing_consent")));
  }
  return { byEmail, fileName: chosen.name };
}

// ─── Database ────────────────────────────────────────────────────────────────

let connection: mysql.Connection | null = null;
let keepAlive: NodeJS.Timeout | null = null;

async function openConnection() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(2);
  }
  // One connection held for the run, for the reasons given at openConnection()
  // in scripts/import-old-site-investors.ts.
  connection = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
  });
  keepAlive = setInterval(() => {
    void connection?.query("SELECT 1").catch(() => {});
  }, 30_000);
  keepAlive.unref();
  return connection;
}

async function closeConnection() {
  if (keepAlive) clearInterval(keepAlive);
  if (connection) await connection.end().catch(() => {});
}

const CHUNK = 500;
function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Every query goes through here, because a mysql2 error object carries `sql`
 * — the statement with every parameter interpolated into it. A failed lookup
 * of 1,300 emails therefore prints 1,300 email addresses to the terminal and
 * into any log that captured it. This re-throws with the driver's code and
 * message and nothing else, so a crash cannot leak the rows being queried.
 */
async function safeQuery(
  db: mysql.Connection,
  label: string,
  sql: string,
  params: readonly unknown[] = []
): Promise<mysql.RowDataPacket[]> {
  try {
    const [rows] = await db.query<mysql.RowDataPacket[]>(sql, params as unknown[]);
    return rows;
  } catch (error) {
    const detail = error as { code?: string; sqlState?: string; sqlMessage?: string; message?: string };
    throw new Error(
      `${label} failed: ${detail.code ?? "unknown"}${detail.sqlState ? ` (${detail.sqlState})` : ""}` +
        `: ${detail.sqlMessage ?? detail.message ?? "no message"}`
    );
  }
}

/** The same, for a statement whose result is not read. */
async function safeExecute(
  db: mysql.Connection,
  label: string,
  sql: string,
  params: readonly unknown[] = []
): Promise<void> {
  await safeQuery(db, label, sql, params);
}

/** 'YYYY-MM-DD HH:MM:SS' in local time, which is how mysql2 reads a DATETIME back. */
function sqlTimestamp(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ` +
    `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  );
}
const sqlLiteral = (value: string | number | null) =>
  value === null ? "NULL" : typeof value === "number" ? String(value) : `'${value.replace(/'/g, "''")}'`;

// ─── Rollback manifest ───────────────────────────────────────────────────────

type PreferenceUndo = {
  id: number;
  notificationsEnabled: number;
  emailFrequency: string;
  updatedAt: string | null;
};
type ConnectionUndo = { id: number; createdAt: string | null; updatedAt: string | null };

const undo = {
  generatedAt: new Date().toISOString(),
  note:
    "Values as they were BEFORE scripts/fix-old-site-import-review.ts --apply. " +
    "Restore with the matching .rollback.sql. updatedAt is restored explicitly " +
    "because both tables carry onUpdateNow().",
  website_account_preferences: [] as PreferenceUndo[],
  agent_connections: [] as ConnectionUndo[],
};

function writeUndoFiles() {
  fs.writeFileSync(manifestPath, JSON.stringify(undo, null, 2));
  const lines: string[] = [
    "-- Restores the rows changed by scripts/fix-old-site-import-review.ts --apply.",
    "-- Every statement names one id and sets back exactly the values it had.",
    "-- Review the counts before running. Wrap in a transaction if you want a dry run.",
    "",
  ];
  for (const row of undo.website_account_preferences) {
    lines.push(
      `UPDATE website_account_preferences SET notificationsEnabled = ${row.notificationsEnabled}, ` +
        `emailFrequency = ${sqlLiteral(row.emailFrequency)}, updatedAt = ${sqlLiteral(row.updatedAt)} ` +
        `WHERE id = ${row.id};`
    );
  }
  for (const row of undo.agent_connections) {
    lines.push(
      `UPDATE agent_connections SET createdAt = ${sqlLiteral(row.createdAt)}, ` +
        `updatedAt = ${sqlLiteral(row.updatedAt)} WHERE id = ${row.id};`
    );
  }
  lines.push("");
  fs.writeFileSync(rollbackSqlPath, lines.join("\n"));
}

// ─── Counting ────────────────────────────────────────────────────────────────

type Tally = { add: (label: string, by?: number) => void; note: (label: string, value: string) => void; values: Record<string, number>; notes: Record<string, string[]> };
const tallies: Record<string, Tally> = {};
function tally(name: string): Tally {
  const values: Record<string, number> = {};
  const notes: Record<string, string[]> = {};
  const t: Tally = {
    values,
    notes,
    add: (label, by = 1) => { values[label] = (values[label] ?? 0) + by; },
    note: (label, value) => {
      if (!notes[label]) notes[label] = [];
      if (!notes[label].includes(value)) notes[label].push(value);
      values[label] = notes[label].length;
    },
  };
  tallies[name] = t;
  return t;
}

// ─── Fix 1: quiet the preferences that should never have been emailable ──────

type PreferenceRow = {
  id: number;
  accountId: number;
  email: string | null;
  notificationsEnabled: number;
  emailFrequency: string;
  updatedAt: Date | null;
};

async function fixQuiet(db: mysql.Connection, imported: ImportedIds) {
  const counts = tally("quiet");
  counts.add("preference rows named by the manifests", imported.preferences.length);
  if (!imported.preferences.length) return;

  const rows: PreferenceRow[] = [];
  for (const chunk of chunks(imported.preferences, CHUNK)) {
    const result = await safeQuery(
      db,
      "reading the imported preference rows",
      `SELECT p.id, p.accountId, p.notificationsEnabled, p.emailFrequency, p.updatedAt, a.email
         FROM website_account_preferences p
         JOIN website_accounts a ON a.id = p.accountId
        WHERE p.id IN (${chunk.map(() => "?").join(",")})`,
      chunk
    );
    for (const row of result) rows.push(row as PreferenceRow);
  }
  counts.add("found in the database", rows.length);
  const missing = imported.preferences.length - rows.length;
  if (missing > 0) counts.add("named by a manifest but no longer present", missing);

  const { byEmail, fileName } = loadMarketingConsent();
  counts.add(`consent read from ${fileName}`, byEmail.size);

  // Contacts that have said no, by email. Archived ones count too: an
  // unsubscribe is about the person, not the row's lifecycle.
  // Queried as-is, not LOWER(email): the column's collation is already
  // case-insensitive, and wrapping it in a function would scan the whole
  // contacts table instead of using the index. This is what the import's own
  // contact lookup does. Results are lowercased in JS for the map key.
  const emails = Array.from(
    new Map(
      rows
        .map(row => (row.email ?? "").trim())
        .filter(Boolean)
        .map(email => [email.toLowerCase(), email] as const)
    ).values()
  );
  const suppressed = new Map<string, { status: string; archived: boolean }>();
  for (const chunk of chunks(emails, CHUNK)) {
    // archived_at, not archivedAt: this one column is snake_case while its
    // neighbours (emailStatus, emailBouncedAt) are camelCase.
    const result = await safeQuery(
      db,
      "reading unsubscribed and bounced contacts",
      `SELECT email, emailStatus, archived_at AS archivedAt
         FROM contacts
        WHERE emailStatus IN ('unsubscribed','bounced')
          AND email IN (${chunk.map(() => "?").join(",")})`,
      chunk
    );
    for (const row of result) {
      const key = String(row.email ?? "").trim().toLowerCase();
      if (!key) continue;
      const archived = row.archivedAt !== null;
      const existing = suppressed.get(key);
      // A non-archived match is the stronger evidence; keep it if both exist.
      if (!existing || (existing.archived && !archived)) {
        suppressed.set(key, { status: String(row.emailStatus), archived });
      }
    }
  }

  // contacts also carries secondaryEmail, thirdEmail and spouseEmail, and
  // emailStatus is one flag for the whole contact rather than per address. An
  // investor whose address sits in one of those columns on a suppressed
  // contact counts as opted out: leaving someone off a marketing list costs
  // little, and emailing someone who opted out is the mistake this fix exists
  // to prevent. Tracked separately from a primary-address match so the report
  // and the undo file show which signal each row came from.
  let alsoOnOtherAddress = 0;
  for (const chunk of chunks(emails, CHUNK)) {
    const placeholders = chunk.map(() => "?").join(",");
    const result = await safeQuery(
      db,
      "checking secondary addresses on suppressed contacts",
      `SELECT LOWER(matched) AS email, emailStatus FROM (
         SELECT secondaryEmail AS matched, emailStatus FROM contacts
          WHERE emailStatus IN ('unsubscribed','bounced') AND secondaryEmail IN (${placeholders})
         UNION ALL
         SELECT thirdEmail, emailStatus FROM contacts
          WHERE emailStatus IN ('unsubscribed','bounced') AND thirdEmail IN (${placeholders})
         UNION ALL
         SELECT spouseEmail, emailStatus FROM contacts
          WHERE emailStatus IN ('unsubscribed','bounced') AND spouseEmail IN (${placeholders})
       ) matches`,
      [...chunk, ...chunk, ...chunk]
    );
    for (const row of result) {
      const key = String(row.email ?? "").trim().toLowerCase();
      if (!key || suppressed.has(key)) continue;
      suppressed.set(key, {
        status: `${String(row.emailStatus)} on a secondary/spouse address`,
        archived: false,
      });
      alsoOnOtherAddress += 1;
    }
  }
  if (alsoOnOtherAddress) {
    counts.add(
      "matched only on a secondary/spouse address of a suppressed contact",
      alsoOnOtherAddress
    );
  }

  const toUpdate: Array<{ row: PreferenceRow; reasons: string[] }> = [];
  for (const row of rows) {
    const email = (row.email ?? "").trim().toLowerCase();
    const reasons: string[] = [];
    if (!email) {
      counts.add("account has no email: left alone");
      continue;
    }
    const consent = byEmail.has(email) ? byEmail.get(email) ?? null : undefined;
    if (consent === undefined) counts.add("no row for this email in the export (left to the contact check)");
    if (consent === false) reasons.push("marketing_consent=false in the export");
    const contact = suppressed.get(email);
    if (contact) {
      reasons.push(`contact emailStatus '${contact.status}'${contact.archived ? " (archived contact)" : ""}`);
      counts.add(`matched a ${contact.status} contact`);
    }
    if (!reasons.length) continue;

    const alreadyQuiet = Number(row.notificationsEnabled) === 0 && row.emailFrequency === "never";
    if (alreadyQuiet) {
      counts.add("already quiet: nothing to write");
      continue;
    }
    toUpdate.push({ row, reasons });
    for (const reason of reasons) counts.add(`will quiet — ${reason.replace(/ \(archived contact\)$/, "")}`);
  }
  counts.add(APPLY ? "to quiet" : "will quiet", toUpdate.length);
  counts.add(
    "of those, both signals agreed",
    toUpdate.filter(entry => entry.reasons.length > 1).length
  );

  if (!APPLY || !toUpdate.length) return;

  for (const batch of chunks(toUpdate, 50)) {
    await db.beginTransaction();
    try {
      for (const entry of batch) {
        // One row at a time so each prior value reaches the manifest.
        await safeExecute(
          db,
          "quieting a preference row",
          `UPDATE website_account_preferences
              SET notificationsEnabled = 0, emailFrequency = 'never'
            WHERE id = ?`,
          [entry.row.id]
        );
        undo.website_account_preferences.push({
          id: entry.row.id,
          notificationsEnabled: Number(entry.row.notificationsEnabled),
          emailFrequency: entry.row.emailFrequency,
          updatedAt: entry.row.updatedAt ? sqlTimestamp(new Date(entry.row.updatedAt)) : null,
        });
      }
      await db.commit();
      counts.add("quieted", batch.length);
    } catch (error) {
      await db.rollback();
      throw error;
    }
  }
}

// ─── Fix 3: give the connections their enquiry date ──────────────────────────

type ConnectionRow = {
  id: number;
  contactId: number;
  agentId: number;
  createdAt: Date | null;
  agingUpdatedAt: Date | null;
  updatedAt: Date | null;
};

async function fixConnectionDates(db: mysql.Connection, imported: ImportedIds) {
  const counts = tally("connection-dates");
  counts.add("agent_connections named by the manifests", imported.connections.length);
  if (!imported.connections.length) return;

  const rows: ConnectionRow[] = [];
  for (const chunk of chunks(imported.connections, CHUNK)) {
    const result = await safeQuery(
      db,
      "reading the imported agent_connections",
      `SELECT id, contactId, agentId, createdAt, agingUpdatedAt, updatedAt
         FROM agent_connections
        WHERE id IN (${chunk.map(() => "?").join(",")})`,
      chunk
    );
    for (const row of result) rows.push(row as ConnectionRow);
  }
  counts.add("found in the database", rows.length);
  const missing = imported.connections.length - rows.length;
  if (missing > 0) counts.add("named by a manifest but no longer present", missing);

  const toUpdate: ConnectionRow[] = [];
  for (const row of rows) {
    if (!row.agingUpdatedAt) {
      counts.add("no agingUpdatedAt: no enquiry date to restore, left alone");
      continue;
    }
    const aging = new Date(row.agingUpdatedAt).getTime();
    const created = row.createdAt ? new Date(row.createdAt).getTime() : 0;
    // The insert used `agingUpdatedAt: lead.createdAt ?? new Date()`, so a row
    // whose aging clock is not older than createdAt took that fallback and has
    // no old date on it. Moving createdAt forward is never the fix.
    if (aging >= created) {
      counts.add("agingUpdatedAt is not older than createdAt (import-day fallback), left alone");
      counts.note("left alone, id", String(row.id));
      continue;
    }
    toUpdate.push(row);
  }

  counts.add(APPLY ? "to backdate" : "will backdate", toUpdate.length);
  if (toUpdate.length) {
    const oldest = toUpdate.reduce((a, b) => (new Date(a.agingUpdatedAt!) < new Date(b.agingUpdatedAt!) ? a : b));
    const newest = toUpdate.reduce((a, b) => (new Date(a.agingUpdatedAt!) > new Date(b.agingUpdatedAt!) ? a : b));
    counts.note("oldest enquiry date to apply", sqlTimestamp(new Date(oldest.agingUpdatedAt!)));
    counts.note("newest enquiry date to apply", sqlTimestamp(new Date(newest.agingUpdatedAt!)));
  }

  if (!APPLY || !toUpdate.length) return;

  for (const batch of chunks(toUpdate, 50)) {
    await db.beginTransaction();
    try {
      for (const row of batch) {
        await safeExecute(
          db,
          "backdating an agent_connections row",
          `UPDATE agent_connections SET createdAt = ? WHERE id = ?`,
          [sqlTimestamp(new Date(row.agingUpdatedAt!)), row.id]
        );
        undo.agent_connections.push({
          id: row.id,
          createdAt: row.createdAt ? sqlTimestamp(new Date(row.createdAt)) : null,
          updatedAt: row.updatedAt ? sqlTimestamp(new Date(row.updatedAt)) : null,
        });
      }
      await db.commit();
      counts.add("backdated", batch.length);
    } catch (error) {
      await db.rollback();
      throw error;
    }
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

async function main() {
  const imported = loadImportedIds();
  console.log("");
  console.log(`  Old-site import review fixes — ${APPLY ? "APPLY (writing)" : "DRY RUN (nothing is written)"}`);
  console.log(`  source: ${SOURCE_DIR}`);
  console.log(`  manifests: ${imported.manifests.join(", ")}`);
  console.log(`  fixes: ${selected.join(", ")}`);
  console.log("");

  const db = await openConnection();
  try {
    if (selected.includes("quiet")) await fixQuiet(db, imported);
    if (selected.includes("connection-dates")) await fixConnectionDates(db, imported);
  } finally {
    await closeConnection();
  }

  for (const [name, counts] of Object.entries(tallies)) {
    console.log(`  ${name}`);
    for (const label of Object.keys(counts.values).sort()) {
      console.log(`     ${String(counts.values[label]).padStart(6)}  ${label}`);
      for (const value of counts.notes[label] ?? []) console.log(`             - ${value}`);
    }
    console.log("");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? "apply" : "dry-run",
    sourceDir: SOURCE_DIR,
    manifests: imported.manifests,
    fixes: selected,
    counts: Object.fromEntries(Object.entries(tallies).map(([name, t]) => [name, t.values])),
    notes: Object.fromEntries(Object.entries(tallies).map(([name, t]) => [name, t.notes])),
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`  report: ${reportPath}`);

  if (APPLY) {
    writeUndoFiles();
    console.log(`  undo:   ${manifestPath}`);
    console.log(`          ${rollbackSqlPath}`);
  } else {
    console.log("  Nothing was written. Re-run with --apply to write.");
  }
  console.log("");
}

void main().catch(async error => {
  await closeConnection();
  // The message only. Printing the error object would print mysql2's `sql`
  // field, which is the statement with every parameter interpolated into it —
  // a failed lookup of 1,300 investors would print 1,300 email addresses.
  const detail = error as { message?: string };
  console.error(detail.message ?? "failed, with no message");
  process.exit(1);
});
