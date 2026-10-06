#!/usr/bin/env tsx
/**
 * Import the old savvy-agents.com investors and leads into SavvyOS.
 * ================================================================
 *
 * Safe by default and safe to re-run. Nothing is written unless --apply is
 * passed, and a second --apply run over the same files writes nothing again.
 *
 * Usage
 *   tsx scripts/import-old-site-investors.ts                 # dry run (default)
 *   tsx scripts/import-old-site-investors.ts --offline       # no database at all
 *   tsx scripts/import-old-site-investors.ts --apply         # write
 *   tsx scripts/import-old-site-investors.ts --only=leads    # one dataset
 *
 * Options
 *   --apply             Write. Without it nothing is inserted or updated.
 *   --offline           Read the CSVs only: no database connection. Reports
 *                       what the files contain and what cannot be imported
 *                       whatever the database holds.
 *   --only=a,b          Any of: accounts, preferences, saved, leads.
 *   --source=DIR        Where the CSVs are (default ../savvy-migration
 *                       relative to the repo, or SAVVY_MIGRATION_DIR).
 *   --report=FILE       Where to write the JSON report. Defaults into the
 *                       source directory. Never inside the repository.
 *   --batch=N           Rows per transaction (default 50).
 *
 * What it writes, per dataset
 *   accounts     website_accounts
 *   preferences  website_account_preferences
 *   saved        website_account_saved_properties
 *   leads        contacts, website_leads, agent_connections, activity_log
 *
 * Three things it deliberately does NOT do
 *   1. Send anything. A backfill that enrolled 245 historical people in Smart
 *      Plans, or called alertAgentOfWebsiteInquiry, would email and text them
 *      about enquiries they made months ago. submitLead does both for a live
 *      form; this does neither, on purpose.
 *   2. Set website_accounts.contactId. That link is what lets an account read
 *      a contact's transactions, and an email address in an export is not
 *      proof of ownership — the same reason contactIdForAccount in
 *      server/websiteActivity.ts only ever reads it.
 *   3. Overwrite anything a person already has here: no existing password,
 *      name, phone, contact field or preferences row is changed. Conflicts are
 *      reported instead.
 *
 * Privacy: this prints and writes counts, old export ids and SavvyOS row ids.
 * No email address, name, phone number or password hash is printed, logged, or
 * put in the report. The report goes in the source folder, never in the repo.
 */

import "dotenv/config";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import {
  activityLog,
  agentConnections,
  contacts,
  leadSources,
  marketProfiles,
  users,
  websiteAccountPreferences,
  websiteAccountSavedProperties,
  websiteAccounts,
  websiteLeads,
  websiteProperties,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import { WEBSITE_LEAD_PARENT } from "@shared/websiteLeadSources";
import {
  INVESTOR_COLUMNS,
  INVESTOR_UNMAPPED_COLUMNS,
  LEAD_COLUMNS,
  OLD_LEAD_ACTIONS,
  PREFERENCE_COLUMNS,
  PREFERENCE_UNMAPPED_COLUMNS,
  SAVED_PROPERTY_COLUMNS,
  UNUSABLE_PASSWORD_MARKER,
  buildOldPropertyIndex,
  decideInvestor,
  decideLead,
  decidePreferences,
  decideSavedProperty,
  leadAttribution,
  mapPreferencesRow,
  mapSavedPropertyRow,
  matchMarketProfiles,
  missingColumns,
  normalizeEmail,
  planInvestors,
  planLeads,
  readCsv,
  type CsvFile,
  type MappedInvestor,
  type MappedLead,
  type OldPropertyIndex,
} from "../server/oldSiteInvestorImportLogic";

// ─── Options ─────────────────────────────────────────────────────────────────

const DATASETS = ["accounts", "preferences", "saved", "leads"] as const;
type Dataset = (typeof DATASETS)[number];

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const option = (name: string): string | null => {
  const hit = argv.find(entry => entry.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const APPLY = flag("apply");
const OFFLINE = flag("offline");
const BATCH_SIZE = Math.max(1, Number(option("batch") ?? 50) || 50);
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_DIR = path.resolve(
  option("source") ?? process.env.SAVVY_MIGRATION_DIR ?? path.join(REPO_ROOT, "..", "savvy-migration")
);

const selected: Dataset[] = (() => {
  const only = option("only");
  if (!only) return [...DATASETS];
  const names = only.split(",").map(name => name.trim().toLowerCase());
  const unknown = names.filter(name => !(DATASETS as readonly string[]).includes(name));
  if (unknown.length) {
    console.error(`Unknown --only value: ${unknown.join(", ")}. Choose from ${DATASETS.join(", ")}.`);
    process.exit(2);
  }
  return DATASETS.filter(name => names.includes(name));
})();

const unknownFlags = argv.filter(
  entry =>
    !/^--(apply|offline)$/.test(entry) &&
    !/^--(only|source|report|batch)=/.test(entry)
);
if (unknownFlags.length) {
  console.error(`Unknown option: ${unknownFlags.join(" ")}`);
  process.exit(2);
}
if (APPLY && OFFLINE) {
  console.error("--apply and --offline are contradictory: --offline never writes.");
  process.exit(2);
}

// The report must not land in the repository, where it could be committed.
const reportPath = path.resolve(
  option("report") ?? path.join(SOURCE_DIR, `import-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
);
if (!path.relative(REPO_ROOT, reportPath).startsWith("..")) {
  console.error(`Refusing to write the report inside the repository: ${reportPath}`);
  process.exit(2);
}

// ─── Source files ────────────────────────────────────────────────────────────

/**
 * Files are found by what is in them, not by an exact name: the exports are
 * dated and the investor, preference and saved-property files are not named
 * yet. A file matches when its header has the dataset's marker columns.
 */
const FILE_SPECS: Record<Dataset, { label: string; required: readonly string[]; markers: readonly string[] }> = {
  accounts: {
    label: "investor accounts",
    required: INVESTOR_COLUMNS,
    markers: ["encrypted_password", "assigned_agent_email"],
  },
  preferences: {
    label: "preferences",
    required: PREFERENCE_COLUMNS,
    markers: ["email_frequency", "preferred_locations"],
  },
  saved: {
    label: "saved properties",
    required: SAVED_PROPERTY_COLUMNS,
    markers: ["property_slug", "saved_at"],
  },
  leads: { label: "leads", required: LEAD_COLUMNS, markers: ["markets_of_interest", "agent_email"] },
};

type LoadedFile = { dataset: Dataset; fileName: string; file: CsvFile };

function loadSourceFiles(): { loaded: Map<Dataset, LoadedFile>; problems: string[] } {
  const loaded = new Map<Dataset, LoadedFile>();
  const problems: string[] = [];
  if (!fs.existsSync(SOURCE_DIR)) {
    problems.push(`Source folder not found: ${SOURCE_DIR}`);
    return { loaded, problems };
  }
  const csvNames = fs.readdirSync(SOURCE_DIR).filter(name => name.toLowerCase().endsWith(".csv"));
  const parsed = csvNames.map(name => ({
    name,
    file: readCsv(fs.readFileSync(path.join(SOURCE_DIR, name), "utf8")),
  }));

  for (const dataset of selected) {
    const spec = FILE_SPECS[dataset];
    const matches = parsed.filter(entry => spec.markers.every(marker => entry.file.header.includes(marker)));
    if (matches.length === 0) {
      problems.push(`No ${spec.label} CSV in ${SOURCE_DIR} (needs the columns ${spec.markers.join(", ")}).`);
      continue;
    }
    if (matches.length > 1) {
      problems.push(
        `${matches.length} files look like the ${spec.label} CSV (${matches.map(m => m.name).join(", ")}). ` +
          `Leave one in place, or pass --source to a folder with one.`
      );
      continue;
    }
    const chosen = matches[0];
    const missing = missingColumns(chosen.file, spec.required);
    if (missing.length) {
      problems.push(`${chosen.name} is missing the columns: ${missing.join(", ")}.`);
      continue;
    }
    loaded.set(dataset, { dataset, fileName: chosen.name, file: chosen.file });
  }
  return { loaded, problems };
}

// ─── Counters ────────────────────────────────────────────────────────────────

type Counts = Record<string, number>;

class Tally {
  readonly counts: Counts = {};
  /** Old export ids or SavvyOS ids. Never a name, email, phone or hash. */
  readonly lists: Record<string, string[]> = {};

  add(key: string, by = 1) {
    this.counts[key] = (this.counts[key] ?? 0) + by;
  }

  note(key: string, id: string) {
    (this.lists[key] ??= []).push(id);
    this.add(key);
  }
}

const tallies: Partial<Record<Dataset, Tally>> = {};
const tally = (dataset: Dataset) => (tallies[dataset] ??= new Tally());

// ─── Database reads ──────────────────────────────────────────────────────────

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function connect(): Promise<Db> {
  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set. Either set it, or run with --offline to check the CSVs alone."
    );
    process.exit(2);
  }
  const db = await getDb();
  if (!db) {
    console.error("Could not connect to the database.");
    process.exit(2);
  }
  await db.execute(sql`SELECT 1`);
  return db;
}

/** Existing website accounts, by normalized email. */
async function existingAccounts(db: Db, emails: string[]) {
  const byEmail = new Map<string, {
    id: number; email: string; firstName: string | null; lastName: string | null;
    phone: string | null; emailVerifiedAt: Date | null; passwordHash: string | null;
  }>();
  for (const chunk of chunks(emails, 500)) {
    const rows = await db
      .select({
        id: websiteAccounts.id,
        email: websiteAccounts.email,
        firstName: websiteAccounts.firstName,
        lastName: websiteAccounts.lastName,
        phone: websiteAccounts.phone,
        emailVerifiedAt: websiteAccounts.emailVerifiedAt,
        passwordHash: websiteAccounts.passwordHash,
      })
      .from(websiteAccounts)
      .where(inArray(websiteAccounts.email, chunk));
    for (const row of rows) byEmail.set(normalizeEmail(row.email), row);
  }
  return byEmail;
}

/** Contacts by normalized email, newest-wins is irrelevant: the lowest id wins. */
async function existingContacts(db: Db, emails: string[]) {
  const byEmail = new Map<string, number>();
  for (const chunk of chunks(emails, 500)) {
    const rows = await db
      .select({ id: contacts.id, email: contacts.email })
      .from(contacts)
      .where(and(isNull(contacts.archivedAt), inArray(contacts.email, chunk)));
    for (const row of rows) {
      const key = normalizeEmail(row.email);
      const seen = byEmail.get(key);
      if (seen === undefined || row.id < seen) byEmail.set(key, row.id);
    }
  }
  return byEmail;
}

/** Active agents and admins, by lowercased email — what agent_email resolves to. */
async function agentsByEmail(db: Db) {
  const rows = await db
    .select({ id: users.id, email: users.email, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.isActive, true));
  const byEmail = new Map<string, number>();
  for (const row of rows) {
    if (row.role !== "agent" && row.role !== "admin") continue;
    const key = normalizeEmail(row.email);
    if (key && !byEmail.has(key)) byEmail.set(key, row.id);
  }
  return byEmail;
}

/**
 * Every old lead id already on a contact's timeline.
 *
 * The old site's webhook wrote it to activity_log.details.leadId as each lead
 * came in (savvyWebEventHandler), and this script writes it there too. That is
 * the whole re-run guard for leads: 450 of the 459 rows say they synced, and
 * this is how the import knows which.
 */
async function recordedOldLeadIds(db: Db): Promise<Set<string>> {
  const recorded = new Set<string>();
  const fromActivity = await db
    .select({ leadId: sql<string | null>`JSON_UNQUOTE(JSON_EXTRACT(${activityLog.details}, '$.leadId'))` })
    .from(activityLog)
    .where(
      and(
        inArray(activityLog.action, [...OLD_LEAD_ACTIONS]),
        isNotNull(activityLog.details),
        sql`JSON_EXTRACT(${activityLog.details}, '$.leadId') IS NOT NULL`
      )
    );
  for (const row of fromActivity) {
    const id = (row.leadId ?? "").trim();
    if (id && id !== "null") recorded.add(id);
  }
  // Rows this script wrote on an earlier run put it in website_leads too.
  const fromLeads = await db
    .select({ leadId: sql<string | null>`JSON_UNQUOTE(JSON_EXTRACT(${websiteLeads.attribution}, '$.oldLeadId'))` })
    .from(websiteLeads)
    .where(sql`JSON_EXTRACT(${websiteLeads.attribution}, '$.oldLeadId') IS NOT NULL`);
  for (const row of fromLeads) {
    const id = (row.leadId ?? "").trim();
    if (id && id !== "null") recorded.add(id);
  }
  return recorded;
}

/** The old listing id/slug → SavvyOS property id index. */
async function oldPropertyIndex(db: Db): Promise<OldPropertyIndex> {
  const rows = await db
    .select({
      propertyId: websiteProperties.propertyId,
      slug: websiteProperties.slug,
      importedData: websiteProperties.importedData,
    })
    .from(websiteProperties);
  return buildOldPropertyIndex(rows);
}

/** Saves already stored, as "accountId:propertyId". */
async function existingSaves(db: Db): Promise<Set<string>> {
  const rows = await db
    .select({
      accountId: websiteAccountSavedProperties.accountId,
      propertyId: websiteAccountSavedProperties.propertyId,
    })
    .from(websiteAccountSavedProperties);
  return new Set(rows.map(row => `${row.accountId}:${row.propertyId}`));
}

/** Accounts that already have a preferences row. */
async function accountsWithPreferences(db: Db): Promise<Set<number>> {
  const rows = await db
    .select({ accountId: websiteAccountPreferences.accountId })
    .from(websiteAccountPreferences);
  return new Set(rows.map(row => row.accountId));
}

/** The "Savvy-Agents.com > X" lead source ids, by sub-source name. */
async function websiteLeadSourceIds(db: Db): Promise<Map<string, number>> {
  const [parent] = await db
    .select({ id: leadSources.id })
    .from(leadSources)
    .where(and(eq(leadSources.name, WEBSITE_LEAD_PARENT), isNull(leadSources.parentId)))
    .limit(1);
  if (!parent) return new Map();
  const children = await db
    .select({ id: leadSources.id, name: leadSources.name })
    .from(leadSources)
    .where(eq(leadSources.parentId, parent.id));
  return new Map(children.map(row => [row.name, row.id]));
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * A password hash nothing can match, for the investors who only ever signed in
 * with Google. passwordHash is NOT NULL, so the row needs one; this is random
 * and never handed out, so the account cannot be entered with a password while
 * "forgot password" still works normally. Cost 12, as websiteAccountAuth uses.
 */
async function unusablePasswordHash(): Promise<string> {
  const secret = `${UNUSABLE_PASSWORD_MARKER}:${crypto.randomBytes(32).toString("hex")}`;
  return bcrypt.hash(secret, 12);
}

// ─── Accounts ────────────────────────────────────────────────────────────────

type AccountIds = Map<string, number>;

async function runAccounts(db: Db | null, loaded: LoadedFile): Promise<{
  investors: Map<string, MappedInvestor>;
  accountIds: AccountIds;
}> {
  const counts = tally("accounts");
  const plan = planInvestors(loaded.file.records);
  counts.add("source rows", loaded.file.records.length);
  counts.add("malformed rows", loaded.file.malformedRows.length);
  counts.add("importable", plan.importable.length);
  for (const id of plan.noEmail) counts.note("skipped: no usable email", id);
  for (const id of plan.unsupportedPassword) counts.note("skipped: unreadable password hash", id);
  for (const id of plan.duplicateInSource) counts.note("skipped: duplicate email in export", id);

  const copied = plan.importable.filter(entry => entry.password === "bcrypt").length;
  counts.add("password copied unchanged", copied);
  counts.add("needs a set-your-password email", plan.importable.length - copied);

  // By old id, so preferences and saved properties can find their account.
  const investors = new Map<string, MappedInvestor>();
  for (const investor of plan.importable) investors.set(investor.oldId, investor);

  const accountIds: AccountIds = new Map();
  if (!db) {
    counts.add("not checked against the database (offline)", plan.importable.length);
    return { investors, accountIds };
  }

  const existing = await existingAccounts(db, plan.importable.map(entry => entry.email));
  const agents = await agentsByEmail(db);

  const toCreate: MappedInvestor[] = [];
  const toUpdate: Array<{ accountId: number; fields: Record<string, unknown> }> = [];
  for (const investor of plan.importable) {
    const decision = decideInvestor(investor, existing.get(investor.email));
    if (decision.action === "create") {
      toCreate.push(investor);
      counts.add("will create");
      if (investor.needsPasswordSetup) counts.note("new account needs a password email", investor.oldId);
    } else if (decision.action === "update") {
      toUpdate.push({ accountId: decision.accountId, fields: decision.fields });
      accountIds.set(investor.oldId, decision.accountId);
      counts.add("will update (blank fields only)");
    } else if (decision.action === "exists") {
      accountIds.set(investor.oldId, decision.accountId);
      counts.add("already exists");
    } else {
      accountIds.set(investor.oldId, decision.accountId);
      counts.note("conflict: existing account keeps its own password", String(decision.accountId));
    }
    // The old site's agent assignment, reported but not acted on here: an
    // investor is not a contact until they enquire, and agent_connections
    // needs a contact. The leads import makes those connections.
    if (investor.assignedAgentEmail) {
      counts.add(
        agents.has(investor.assignedAgentEmail)
          ? "assigned agent resolves to a SavvyOS user"
          : "assigned agent does not match any active SavvyOS user"
      );
    }
  }

  if (!APPLY) return { investors, accountIds };

  for (const batch of chunks(toCreate, BATCH_SIZE)) {
    // Hashing is slow, so it happens before the transaction opens.
    const values = [] as Array<Record<string, unknown>>;
    for (const investor of batch) {
      values.push({
        email: investor.email,
        passwordHash: investor.passwordHash ?? (await unusablePasswordHash()),
        firstName: investor.firstName || null,
        lastName: investor.lastName || null,
        phone: investor.phone,
        status: investor.status,
        emailVerifiedAt: investor.emailVerifiedAt,
        lastSignInAt: investor.lastSignInAt,
        ...(investor.createdAt ? { createdAt: investor.createdAt } : {}),
      });
    }
    await db.transaction(async tx => {
      for (let i = 0; i < batch.length; i += 1) {
        const inserted = await tx.insert(websiteAccounts).values(values[i] as never);
        const id = Number((inserted as any)[0]?.insertId);
        if (Number.isInteger(id) && id > 0) accountIds.set(batch[i].oldId, id);
      }
    });
    counts.add("created", batch.length);
  }
  for (const batch of chunks(toUpdate, BATCH_SIZE)) {
    await db.transaction(async tx => {
      for (const entry of batch) {
        await tx.update(websiteAccounts).set(entry.fields).where(eq(websiteAccounts.id, entry.accountId));
      }
    });
    counts.add("updated", batch.length);
  }
  return { investors, accountIds };
}

// ─── Preferences ─────────────────────────────────────────────────────────────

async function runPreferences(
  db: Db | null,
  loaded: LoadedFile,
  accountIds: AccountIds
): Promise<void> {
  const counts = tally("preferences");
  counts.add("source rows", loaded.file.records.length);
  counts.add("malformed rows", loaded.file.malformedRows.length);
  for (const column of PREFERENCE_UNMAPPED_COLUMNS) {
    if (loaded.file.header.includes(column)) counts.add(`column with no SavvyOS field: ${column}`);
  }

  const mapped = loaded.file.records.map(mapPreferencesRow);
  const fellBack = mapped.filter(entry => entry.frequencyFellBack).length;
  if (fellBack) counts.add("email frequency not one of daily/weekly/never, left at daily", fellBack);

  if (!db) {
    const locations = new Set<string>();
    for (const entry of mapped) for (const name of entry.locations) locations.add(name);
    counts.add("distinct preferred locations to map to markets", locations.size);
    counts.add("not checked against the database (offline)", mapped.length);
    return;
  }

  const profiles = await db
    .select({ id: marketProfiles.id, name: marketProfiles.name, state: marketProfiles.state })
    .from(marketProfiles);
  const existing = await accountsWithPreferences(db);

  const toCreate: Array<Record<string, unknown>> = [];
  const unmatchedLocations = new Set<string>();
  for (const entry of mapped) {
    const accountId = accountIds.get(entry.oldUserId);
    const markets = matchMarketProfiles(entry.locations, profiles);
    for (const name of markets.unmatched) unmatchedLocations.add(name);
    const decision = decidePreferences(entry, accountId, accountId ? existing.has(accountId) : false, markets);
    if (decision.action === "create") {
      toCreate.push(decision.values);
      existing.add(decision.accountId);
      counts.add("will create");
    } else if (decision.action === "exists") {
      counts.add("already exists (investor's own settings kept)");
    } else {
      counts.add(
        decision.reason === "no-account"
          ? "skipped: no imported account for this old user id"
          : "skipped: row has no user id"
      );
    }
  }
  // Names, not people: a market name is not personal data.
  if (unmatchedLocations.size) {
    counts.note("unmapped location names", Array.from(unmatchedLocations).sort().join(" | "));
  }

  if (!APPLY) return;
  for (const batch of chunks(toCreate, BATCH_SIZE)) {
    await db.transaction(async tx => {
      await tx.insert(websiteAccountPreferences).values(batch as never);
    });
    counts.add("created", batch.length);
  }
}

// ─── Saved properties ────────────────────────────────────────────────────────

async function runSavedProperties(
  db: Db | null,
  loaded: LoadedFile,
  accountIds: AccountIds
): Promise<void> {
  const counts = tally("saved");
  counts.add("source rows", loaded.file.records.length);
  counts.add("malformed rows", loaded.file.malformedRows.length);
  const mapped = loaded.file.records.map(mapSavedPropertyRow);

  if (!db) {
    counts.add("distinct old listings referenced", new Set(mapped.map(entry => entry.oldPropertyId ?? entry.oldSlug)).size);
    counts.add("not checked against the database (offline)", mapped.length);
    return;
  }

  const index = await oldPropertyIndex(db);
  counts.add("SavvyOS listings with an old-site id", index.byOldId.size);
  const seen = await existingSaves(db);

  const toCreate: Array<Record<string, unknown>> = [];
  for (const entry of mapped) {
    const decision = decideSavedProperty(entry, accountIds.get(entry.oldUserId), index, seen);
    if (decision.action === "create") {
      toCreate.push({
        accountId: decision.accountId,
        propertyId: decision.propertyId,
        ...(decision.createdAt ? { createdAt: decision.createdAt } : {}),
      });
      seen.add(`${decision.accountId}:${decision.propertyId}`);
      counts.add("will create");
    } else if (decision.action === "exists") {
      counts.add("already exists");
    } else if (decision.action === "unmapped") {
      // Reported with the old listing id, so each one can be chased up.
      counts.note(
        decision.reason === "unmapped"
          ? "unmapped: no SavvyOS listing for this old listing"
          : "unmapped: row names no listing",
        decision.oldPropertyId ?? "(none)"
      );
    } else {
      counts.add("skipped: no imported account for this old user id");
    }
  }

  if (!APPLY) return;
  for (const batch of chunks(toCreate, BATCH_SIZE)) {
    await db.transaction(async tx => {
      await tx.insert(websiteAccountSavedProperties).values(batch as never);
    });
    counts.add("created", batch.length);
  }
}

// ─── Leads ───────────────────────────────────────────────────────────────────

async function runLeads(db: Db | null, loaded: LoadedFile, index: OldPropertyIndex | null): Promise<void> {
  const counts = tally("leads");
  const plan = planLeads(loaded.file.records);
  counts.add("source rows", loaded.file.records.length);
  counts.add("malformed rows", loaded.file.malformedRows.length);
  counts.add("enquiries", plan.totalEnquiries);
  counts.add("distinct people", plan.people.length);
  for (const id of plan.noEmail) counts.note("skipped: no usable email", id);
  for (const id of plan.noCreatedAt) counts.note("skipped: no created_at to order or match on", id);

  const syncedInExport = plan.people.reduce(
    (total, person) => total + person.enquiries.filter(entry => entry.oldStatus === "synced").length,
    0
  );
  counts.add('export says already sent to SavvyOS (status "synced")', syncedInExport);

  if (!db) {
    counts.add("not checked against the database (offline)", plan.totalEnquiries);
    return;
  }

  const recorded = await recordedOldLeadIds(db);
  counts.add("old lead ids already on a SavvyOS timeline", recorded.size);
  const contactIds = await existingContacts(db, plan.people.map(person => person.email));
  const agents = await agentsByEmail(db);
  const sourceIds = await websiteLeadSourceIds(db);
  const propertyIndex = index ?? (await oldPropertyIndex(db));
  const connections = new Set<string>();

  type PersonWork = {
    email: string;
    contactId: number | null;
    /** The enquiry the contact is created from, when there is no contact yet. */
    createFrom: MappedLead | null;
    attach: MappedLead[];
  };
  const work: PersonWork[] = [];

  for (const person of plan.people) {
    const contactId = contactIds.get(person.email) ?? null;
    const fresh = person.enquiries.filter(entry => !recorded.has(entry.oldId));
    const alreadyThere = person.enquiries.length - fresh.length;
    if (alreadyThere) {
      counts.add("enquiry already recorded (matched on details.leadId)", alreadyThere);
    }
    if (fresh.length === 0) {
      counts.add("person needs nothing");
      continue;
    }
    if (contactId) {
      counts.add("existing contact (data left untouched)");
      work.push({ email: person.email, contactId, createFrom: null, attach: fresh });
      counts.add("will attach an enquiry to an existing contact", fresh.length);
    } else {
      counts.add("will create a contact");
      work.push({ email: person.email, contactId: null, createFrom: fresh[0], attach: fresh.slice(1) });
      if (fresh.length > 1) counts.add("will attach a repeat enquiry as history", fresh.length - 1);
    }
    for (const entry of fresh) {
      counts.add("will create a website_leads row");
      if (entry.oldPropertyId && !propertyIndex.byOldId.has(entry.oldPropertyId.trim().toLowerCase())) {
        counts.add("enquiry whose listing does not map to SavvyOS");
      }
      if (entry.agentEmail && !agents.has(entry.agentEmail)) {
        counts.add("agent_email does not match any active SavvyOS agent");
      }
      if (!sourceIds.has(entry.leadSourceName)) {
        counts.add(`lead source missing in SavvyOS: ${entry.leadSourceName}`);
      }
    }
  }

  // How far the listing import got, counted per listing rather than per
  // enquiry: 459 enquiries name about 225 distinct old listings, and one
  // unmapped listing would otherwise be reported as many unmapped enquiries.
  counts.add("SavvyOS listings carrying an old-site id", propertyIndex.byOldId.size);
  const referenced = new Map<string, boolean>();
  for (const person of plan.people) {
    for (const entry of person.enquiries) {
      if (!entry.oldPropertyId) continue;
      const key = entry.oldPropertyId.trim().toLowerCase();
      if (!referenced.has(key)) referenced.set(key, propertyIndex.byOldId.has(key));
    }
  }
  const mapped = Array.from(referenced.values()).filter(Boolean).length;
  counts.add("distinct old listings named by enquiries", referenced.size);
  counts.add("  of those, mapped to a SavvyOS listing", mapped);
  for (const [oldId, isMapped] of Array.from(referenced.entries())) {
    if (!isMapped) counts.note("  of those, unmapped (old listing id)", oldId);
  }

  if (!APPLY) return;

  for (const batch of chunks(work, BATCH_SIZE)) {
    await db.transaction(async tx => {
      for (const person of batch) {
        let contactId = person.contactId;
        if (!contactId && person.createFrom) {
          contactId = await createContact(tx, person.createFrom, sourceIds);
          counts.add("created a contact");
        }
        if (!contactId) continue;
        const enquiries = person.createFrom ? [person.createFrom, ...person.attach] : person.attach;
        for (const entry of enquiries) {
          await writeEnquiry(tx, entry, contactId, agents, propertyIndex, connections);
          counts.add("recorded an enquiry");
        }
      }
    });
  }
}

/**
 * A contact for someone SavvyOS has never seen, shaped like the one submitLead
 * makes for a live form: a lead source so reports and filters find them, a
 * "Savvy website" tag, and the ISA pipeline's first status. No Smart Plan is
 * triggered — see the header.
 */
async function createContact(
  tx: any,
  lead: MappedLead,
  sourceIds: Map<string, number>
): Promise<number | null> {
  const leadSourceId = sourceIds.get(lead.leadSourceName) ?? null;
  const inserted = await tx.insert(contacts).values({
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    ...(leadSourceId ? { leadSourceId } : {}),
    leadSourceType: "organic",
    isaStatus: "new_lead",
    tags: ["Savvy website"],
    notes: lead.message || "Savvy website inquiry (imported from savvy-agents.com)",
    ...(lead.createdAt ? { createdAt: lead.createdAt } : {}),
  });
  const id = Number((inserted as any)?.[0]?.insertId);
  if (!Number.isInteger(id) || id <= 0) return null;
  await tx.insert(activityLog).values({
    userId: null,
    action: "contact_created",
    entityType: "contact",
    entityId: id,
    relatedContactId: id,
    details: { via: "savvy-web", reason: "old_site_import", oldLeadId: lead.oldId },
    ...(lead.createdAt ? { createdAt: lead.createdAt } : {}),
  });
  return id;
}

/**
 * One enquiry: the website_leads row, the agent connection, and the timeline
 * entry under the action name the old site's webhook used, carrying the old
 * lead id so a re-run recognises it.
 */
async function writeEnquiry(
  tx: any,
  lead: MappedLead,
  contactId: number,
  agents: Map<string, number>,
  index: OldPropertyIndex,
  connections: Set<string>
): Promise<void> {
  const agentId = lead.agentEmail ? (agents.get(lead.agentEmail) ?? null) : null;
  const propertyId = lead.oldPropertyId
    ? (index.byOldId.get(lead.oldPropertyId.trim().toLowerCase()) ?? null)
    : null;

  await tx.insert(websiteLeads).values({
    contactId,
    propertyId,
    agentUserId: agentId,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    intent: lead.intent,
    requestType: lead.requestType,
    message: lead.message,
    sourcePath: null,
    attribution: leadAttribution(lead),
    // The export's status is sync state, not pipeline state. Every imported
    // enquiry starts where a new one would.
    status: "new",
    ...(lead.createdAt ? { createdAt: lead.createdAt } : {}),
  });

  if (agentId) {
    const key = `${agentId}:${contactId}`;
    if (!connections.has(key)) {
      const [existing] = await tx
        .select({ id: agentConnections.id })
        .from(agentConnections)
        .where(and(eq(agentConnections.agentId, agentId), eq(agentConnections.contactId, contactId)))
        .limit(1);
      if (!existing) {
        await tx.insert(agentConnections).values({
          agentId,
          contactId,
          pipelineStatus: "new_lead",
          agingUpdatedAt: lead.createdAt ?? new Date(),
        });
      }
      connections.add(key);
    }
  }

  await tx.insert(activityLog).values({
    // null, not the agent, exactly as savvyWebEventHandler wrote these rows.
    // userId is who *did* the thing, and reports that count activity per user
    // would otherwise credit agents with hundreds of actions they never took.
    // The agent is named in details, as recordWebsiteRequestActivity does.
    userId: null,
    action: lead.action,
    entityType: "contact",
    entityId: contactId,
    relatedContactId: contactId,
    details: {
      propertyId: lead.oldPropertyId,
      savvyosPropertyId: propertyId,
      propertyCity: lead.propertyCity,
      agentId,
      // The key a re-run matches on, written exactly where the old site's
      // webhook wrote it.
      leadId: lead.oldId,
      occurredAt: lead.createdAt?.toISOString() ?? null,
      event: lead.action,
      via: "savvy-web",
      import: "old-site-investor-import",
      oldSource: lead.oldSource,
    },
    ...(lead.createdAt ? { createdAt: lead.createdAt } : {}),
  });
}

// ─── Reporting ───────────────────────────────────────────────────────────────

function printSummary(problems: string[], loaded: Map<Dataset, LoadedFile>) {
  const mode = OFFLINE ? "OFFLINE (no database)" : APPLY ? "APPLY (writing)" : "DRY RUN (nothing written)";
  console.log("");
  console.log(`  Old-site investor import — ${mode}`);
  console.log(`  source: ${SOURCE_DIR}`);
  console.log(`  datasets: ${selected.join(", ")}`);
  console.log("");
  for (const dataset of selected) {
    const file = loaded.get(dataset);
    const counts = tallies[dataset];
    console.log(`  ${dataset}  ${file ? file.fileName : "— file not found"}`);
    if (!counts) {
      console.log("      (not run)");
      continue;
    }
    const keys = Object.keys(counts.counts).sort();
    for (const key of keys) console.log(`      ${String(counts.counts[key]).padStart(6)}  ${key}`);
    console.log("");
  }
  if (problems.length) {
    console.log("  Problems:");
    for (const problem of problems) console.log(`      - ${problem}`);
    console.log("");
  }
  if (!APPLY && !OFFLINE) {
    console.log("  Nothing was written. Re-run with --apply to write.");
    console.log("");
  }
}

function writeReport(problems: string[], loaded: Map<Dataset, LoadedFile>) {
  const report = {
    generatedAt: new Date().toISOString(),
    mode: OFFLINE ? "offline" : APPLY ? "apply" : "dry-run",
    sourceDir: SOURCE_DIR,
    datasets: selected,
    files: Object.fromEntries(
      selected.map(dataset => [dataset, loaded.get(dataset)?.fileName ?? null])
    ),
    unmappedColumns: {
      accounts: INVESTOR_UNMAPPED_COLUMNS,
      preferences: PREFERENCE_UNMAPPED_COLUMNS,
    },
    counts: Object.fromEntries(selected.map(dataset => [dataset, tallies[dataset]?.counts ?? {}])),
    // Old export ids and SavvyOS row ids only — see the header on privacy.
    ids: Object.fromEntries(selected.map(dataset => [dataset, tallies[dataset]?.lists ?? {}])),
    problems,
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`  report: ${reportPath}`);
  console.log("");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { loaded, problems } = loadSourceFiles();

  // A dataset that depends on the accounts file cannot run without it, because
  // an old user id only becomes an account id through that file's email.
  const needsAccounts = selected.filter(name => name === "preferences" || name === "saved");
  if (needsAccounts.length && !loaded.has("accounts")) {
    problems.push(
      `${needsAccounts.join(" and ")} need the investor accounts CSV: the only link from an old ` +
        `user id to a SavvyOS account is that file's email column.`
    );
  }

  if (problems.length && !loaded.size) {
    printSummary(problems, loaded);
    console.error("Nothing to do. Add the missing files, or pass --only for the ones that are here.");
    process.exit(1);
  }

  const db = OFFLINE ? null : await connect();
  let accountIds: AccountIds = new Map();

  if (loaded.has("accounts")) {
    ({ accountIds } = await runAccounts(db, loaded.get("accounts")!));
  }
  if (loaded.has("preferences") && loaded.has("accounts")) {
    await runPreferences(db, loaded.get("preferences")!, accountIds);
  }
  if (loaded.has("saved") && loaded.has("accounts")) {
    await runSavedProperties(db, loaded.get("saved")!, accountIds);
  }
  if (loaded.has("leads")) {
    await runLeads(db, loaded.get("leads")!, db ? await oldPropertyIndex(db) : null);
  }

  printSummary(problems, loaded);
  writeReport(problems, loaded);
  // A missing file is a real result, not a crash, but it must not look like success.
  process.exit(problems.length ? 1 : 0);
}

main().catch(error => {
  console.error("Import failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
