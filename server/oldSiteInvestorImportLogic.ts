/**
 * Moving the old savvy-agents.com investors and leads into SavvyOS: the pure part.
 *
 * The old site is a Supabase app. This takes CSV exports of its four people
 * tables and says what each row should become here. Everything in this file is
 * a plain function over plain data: no database, no filesystem, no network and
 * no clock. scripts/import-old-site-investors.ts does those, and is the only
 * thing that writes.
 *
 * Why a separate pure module rather than logic inside the script: tsconfig.json
 * only includes client/, shared/ and server/, so `npm run check` never
 * typechecks scripts/, and vitest.config.ts only collects server/**\/*.test.ts.
 * Logic that lives here is typechecked and tested; logic that lives in the
 * script is neither.
 *
 * Two existing pieces are reused rather than restated:
 *   - oldSiteWebsiteLeadSource (@shared/websiteLeadSources) already maps the old
 *     site's `source` values to SavvyOS lead sources, because the live webhook
 *     needed exactly the same mapping.
 *   - the activity_log action names the old site's webhook wrote (see
 *     SAVVY_WEB_EVENTS in server/webhookHandlers.ts). Hot Leads, lead scores
 *     and the reports count those names and no others, so a repeat enquiry
 *     imported here has to use them too.
 *
 * On privacy: nothing here logs. Functions return data, and the caller decides
 * what is safe to print. The report the script writes is counts and ids only.
 */
import { oldSiteWebsiteLeadSource, type WebsiteLeadSource } from "@shared/websiteLeadSources";

// ─── CSV ─────────────────────────────────────────────────────────────────────

/**
 * RFC 4180 CSV, because the exports need it: 103 of the 459 lead rows have a
 * newline inside the quoted `notes` field, so the file is 673 physical lines.
 * Splitting on "\n" would produce 672 broken rows and silently import junk.
 */
export function parseCsv(text: string): string[][] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  while (i < body.length) {
    const char = body[i];
    if (quoted) {
      if (char === '"') {
        // "" inside a quoted field is one literal quote.
        if (body[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // A trailing newline leaves one [""] row; a real one-column CSV is not a
  // thing any of these exports are, so dropping it is safe.
  return rows.filter(entry => entry.length > 1 || (entry.length === 1 && entry[0] !== ""));
}

export type CsvRecord = Record<string, string>;

export type CsvFile = {
  header: string[];
  records: CsvRecord[];
  /** Rows whose column count did not match the header. Never imported. */
  malformedRows: number[];
};

/** Rows keyed by column name, plus a count of any rows that did not fit. */
export function readCsv(text: string): CsvFile {
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map(name => name.trim());
  const records: CsvRecord[] = [];
  const malformedRows: number[] = [];
  rows.slice(1).forEach((row, index) => {
    if (row.length !== header.length) {
      // 1-based line within the data, for a report that names no values.
      malformedRows.push(index + 1);
      return;
    }
    const record: CsvRecord = {};
    header.forEach((name, column) => {
      record[name] = row[column] ?? "";
    });
    records.push(record);
  });
  return { header, records, malformedRows };
}

/** The columns a file must have before it is worth importing. */
export function missingColumns(file: CsvFile, required: readonly string[]): string[] {
  return required.filter(name => !file.header.includes(name));
}

/**
 * One cell, or null.
 *
 * The exports write the four-character string "null" for an absent value, not
 * an empty field: every budget_min and experience_level in the leads file is
 * "null", and 151 phones are. Treating that as text would put the word "null"
 * on 151 contacts and make Number("null") a NaN budget.
 */
export function cell(record: CsvRecord, column: string): string | null {
  const raw = (record[column] ?? "").trim();
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  if (lowered === "null" || lowered === "\\n") return null;
  return raw;
}

// ─── Scalars ─────────────────────────────────────────────────────────────────

/**
 * The matching key for every person in this import.
 *
 * Must stay identical to normalizeAccountEmail in
 * server/_core/websiteAccountAuth.ts, which decides what a sign-in looks up.
 * An import that normalized differently would create an account the owner
 * could not sign in to. oldSiteInvestorImportLogic.test.ts asserts the two
 * agree rather than trusting this comment.
 */
export function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Whether a string is a plausible single email address. */
export function looksLikeEmail(value: string | null | undefined): boolean {
  const text = String(value ?? "").trim();
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(text);
}

const NAME_LIMIT = 128;

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * A first and last name for a person.
 *
 * contacts.firstName, contacts.lastName, websiteLeads.firstName and
 * websiteLeads.lastName are all NOT NULL, so this always returns strings. A
 * one-word name gives an empty last name, which is what the live site already
 * stores (see nameForAccount in server/websiteActivity.ts) — 38 of the 459
 * lead rows are one word.
 *
 * 10 of them have an email address in the name column. Using it verbatim would
 * put an address in a name field and print it on an agent's screen; deriving
 * from the local part is what deriveNameFromEmail in server/webhookHandlers.ts
 * already does for the same data arriving live.
 */
export function personName(
  fullName: string | null | undefined,
  email: string | null | undefined
): { firstName: string; lastName: string } {
  const supplied = String(fullName ?? "").trim();
  if (supplied && !looksLikeEmail(supplied) && !supplied.includes("@")) {
    const words = supplied.split(/\s+/).filter(Boolean);
    return {
      firstName: words[0].slice(0, NAME_LIMIT),
      lastName: words.slice(1).join(" ").slice(0, NAME_LIMIT),
    };
  }
  const local = (normalizeEmail(email || supplied).split("@")[0] ?? "").trim();
  const parts = local
    .split(/[._+\-]+/)
    .map(part => part.replace(/\d+$/, ""))
    .filter(Boolean);
  if (parts.length === 0) return { firstName: "Website", lastName: "" };
  return {
    firstName: capitalize(parts[0]).slice(0, NAME_LIMIT),
    lastName: parts.slice(1).map(capitalize).join(" ").slice(0, NAME_LIMIT),
  };
}

/** A first and last name from separate columns, falling back to the full name. */
export function investorName(record: CsvRecord): { firstName: string; lastName: string } {
  const first = cell(record, "first_name");
  const last = cell(record, "last_name");
  if (first && !looksLikeEmail(first)) {
    return { firstName: first.slice(0, NAME_LIMIT), lastName: (last ?? "").slice(0, NAME_LIMIT) };
  }
  return personName(cell(record, "full_name"), cell(record, "email"));
}

/**
 * Postgres timestamps, as the exports write them:
 * "2026-04-29 12:55:09.391917+00". A space instead of T, microseconds rather
 * than milliseconds, and a two-character offset. Date parsing of that shape is
 * not specified, so it is normalized here instead of hoped for.
 */
export function parseOldTimestamp(value: string | null | undefined): Date | null {
  const raw = (value ?? "").trim();
  if (!raw || raw.toLowerCase() === "null") return null;
  let text = raw.replace(" ", "T");
  // +00 / -05 → +00:00 / -05:00. +0000 → +00:00. A bare timestamp is UTC,
  // which is what Supabase exports are.
  if (/[+-]\d{2}$/.test(text)) text = `${text}:00`;
  else if (/[+-]\d{4}$/.test(text)) text = `${text.slice(0, -2)}:${text.slice(-2)}`;
  else if (!/(Z|[+-]\d{2}:\d{2})$/.test(text)) text = `${text}Z`;
  // Microseconds: keep milliseconds, drop the rest. Date accepts extra digits
  // inconsistently across runtimes.
  text = text.replace(/\.(\d{3})\d+/, ".$1");
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** A positive integer, or null. */
export function parseIntegerOrNull(value: string | null | undefined): number | null {
  const raw = (value ?? "").trim();
  if (!raw || raw.toLowerCase() === "null") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded >= 0 ? rounded : null;
}

/**
 * A money amount as the string a drizzle `decimal` column wants, or null.
 * Numbers would round-trip through a float; decimal columns take strings.
 */
export function parseMoneyOrNull(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim().replace(/[$,]/g, "");
  if (!raw || raw.toLowerCase() === "null") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  // precision 12, scale 2 — anything larger would be a silent MySQL error.
  if (parsed > 9_999_999_999) return null;
  return parsed.toFixed(2);
}

/** Postgres booleans: t/f, true/false, 1/0. */
export function parseBooleanOrNull(value: string | null | undefined): boolean | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw || raw === "null") return null;
  if (["t", "true", "1", "yes", "y"].includes(raw)) return true;
  if (["f", "false", "0", "no", "n"].includes(raw)) return false;
  return null;
}

// ─── Passwords ───────────────────────────────────────────────────────────────

/**
 * Whether a Supabase encrypted_password can be copied into
 * websiteAccounts.passwordHash and still verify.
 *
 * bcryptjs 3.0.3 compare() accepts the $2a$, $2b$ and $2y$ revisions and
 * throws "Invalid salt revision" on anything else. Supabase writes $2a$. A
 * copied hash therefore signs in unchanged, with no password reset and no
 * email. verifyPassword already catches, so an unsupported value would fail
 * closed rather than crash — but it would be an account nobody can ever use,
 * so it is reported instead of imported quietly.
 */
export type PasswordClassification = "bcrypt" | "absent" | "unsupported";

export function classifyPasswordHash(value: string | null | undefined): PasswordClassification {
  const raw = (value ?? "").trim();
  if (!raw || raw.toLowerCase() === "null") return "absent";
  // $2<rev>$<2-digit cost>$<53 chars of salt and digest> = 60 characters.
  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(raw)) return "unsupported";
  const cost = Number(raw.slice(4, 6));
  if (!Number.isInteger(cost) || cost < 4 || cost > 31) return "unsupported";
  // varchar(255), so length is never the problem; stated for the reader.
  return raw.length === 60 ? "bcrypt" : "unsupported";
}

/**
 * passwordHash is NOT NULL, and 153 investors signed in with Google and have no
 * password at all. They get a hash of random bytes that is never shown to
 * anyone and that no input can produce, so the row is valid, the account
 * cannot be signed into with a password, and "forgot password" still works. The
 * caller supplies the hashing function so this file stays free of bcrypt and of
 * randomness.
 */
export const UNUSABLE_PASSWORD_MARKER = "no-old-site-password";

// ─── Investor accounts ───────────────────────────────────────────────────────

export const INVESTOR_COLUMNS = [
  "id", "email", "first_name", "last_name", "full_name", "phone", "is_active",
  "marketing_consent", "onboarding_completed_at", "created_at", "updated_at",
  "encrypted_password", "email_confirmed_at", "last_sign_in_at", "has_google",
  "assigned_agent_email",
] as const;

/**
 * Columns with nowhere to go in SavvyOS. Listed in the report rather than
 * dropped quietly, so the decision to leave them behind is visible and can be
 * revisited without re-reading the export.
 */
export const INVESTOR_UNMAPPED_COLUMNS = [
  "marketing_consent", "onboarding_completed_at", "has_google",
] as const;

export type MappedInvestor = {
  oldId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: "active" | "suspended";
  emailVerifiedAt: Date | null;
  lastSignInAt: Date | null;
  createdAt: Date | null;
  /** The copied bcrypt hash, or null when one has to be invented. */
  passwordHash: string | null;
  password: PasswordClassification;
  /** True when the account needs a "set your password" email later. */
  needsPasswordSetup: boolean;
  /** Lowercased, for resolving to a SavvyOS user. */
  assignedAgentEmail: string | null;
  hasGoogle: boolean;
};

export function mapInvestorRow(record: CsvRecord): MappedInvestor {
  const email = normalizeEmail(cell(record, "email"));
  const { firstName, lastName } = investorName(record);
  const password = classifyPasswordHash(cell(record, "encrypted_password"));
  const isActive = parseBooleanOrNull(cell(record, "is_active"));
  const phone = cell(record, "phone");
  return {
    oldId: cell(record, "id") ?? "",
    email,
    firstName,
    lastName,
    // contacts.phone and websiteAccounts.phone are both varchar(32).
    phone: phone ? phone.slice(0, 32) : null,
    status: isActive === false ? "suspended" : "active",
    emailVerifiedAt: parseOldTimestamp(cell(record, "email_confirmed_at")),
    lastSignInAt: parseOldTimestamp(cell(record, "last_sign_in_at")),
    createdAt: parseOldTimestamp(cell(record, "created_at")),
    passwordHash: password === "bcrypt" ? (cell(record, "encrypted_password") as string) : null,
    password,
    needsPasswordSetup: password !== "bcrypt",
    assignedAgentEmail: cell(record, "assigned_agent_email")
      ? normalizeEmail(cell(record, "assigned_agent_email"))
      : null,
    hasGoogle: parseBooleanOrNull(cell(record, "has_google")) === true,
  };
}

/**
 * The rows worth importing, and why the rest were not.
 *
 * Duplicate emails inside one export are collapsed to the newest row rather
 * than both being attempted: websiteAccounts.email is UNIQUE, so the second
 * insert would abort the batch.
 */
export type InvestorPlan = {
  importable: MappedInvestor[];
  noEmail: string[];
  unsupportedPassword: string[];
  duplicateInSource: string[];
};

export function planInvestors(records: CsvRecord[]): InvestorPlan {
  const noEmail: string[] = [];
  const unsupportedPassword: string[] = [];
  const duplicateInSource: string[] = [];
  const byEmail = new Map<string, MappedInvestor>();
  for (const record of records) {
    const mapped = mapInvestorRow(record);
    if (!mapped.email || !looksLikeEmail(mapped.email)) {
      noEmail.push(mapped.oldId);
      continue;
    }
    if (mapped.password === "unsupported") {
      // Importing it would make an account whose password can never match.
      unsupportedPassword.push(mapped.oldId);
      continue;
    }
    const seen = byEmail.get(mapped.email);
    if (seen) {
      const keepNew = (mapped.createdAt?.getTime() ?? 0) >= (seen.createdAt?.getTime() ?? 0);
      duplicateInSource.push(keepNew ? seen.oldId : mapped.oldId);
      if (keepNew) byEmail.set(mapped.email, mapped);
      continue;
    }
    byEmail.set(mapped.email, mapped);
  }
  return {
    importable: Array.from(byEmail.values()),
    noEmail,
    unsupportedPassword,
    duplicateInSource,
  };
}

/**
 * What to do with one investor, given what SavvyOS already has.
 *
 * An existing account is never given the old site's password: someone who
 * signed up here directly has a password they chose, and overwriting it with a
 * Supabase hash would lock them out of their own account. The same goes for
 * their name and phone, which they may have corrected here. Only the empty
 * fields are offered, and a differing password is reported as a conflict.
 */
export type ExistingAccount = {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  emailVerifiedAt: Date | null;
  passwordHash: string | null;
};

export type InvestorDecision =
  | { action: "create"; investor: MappedInvestor }
  | { action: "update"; accountId: number; investor: MappedInvestor; fields: Record<string, unknown> }
  | { action: "exists"; accountId: number; investor: MappedInvestor }
  | { action: "conflict"; accountId: number; investor: MappedInvestor; reason: string };

export function decideInvestor(
  investor: MappedInvestor,
  existing: ExistingAccount | undefined
): InvestorDecision {
  if (!existing) return { action: "create", investor };

  const hasOwnPassword =
    !!existing.passwordHash &&
    !!investor.passwordHash &&
    existing.passwordHash !== investor.passwordHash;

  // Fill blanks only. A value already here was either chosen on this site or
  // already imported, and either way it wins.
  const fields: Record<string, unknown> = {};
  if (!existing.firstName && investor.firstName) fields.firstName = investor.firstName;
  if (!existing.lastName && investor.lastName) fields.lastName = investor.lastName;
  if (!existing.phone && investor.phone) fields.phone = investor.phone;
  if (!existing.emailVerifiedAt && investor.emailVerifiedAt) {
    fields.emailVerifiedAt = investor.emailVerifiedAt;
  }

  if (hasOwnPassword) {
    return {
      action: "conflict",
      accountId: existing.id,
      investor,
      reason: "account already has a different password; old-site password not copied",
    };
  }
  if (Object.keys(fields).length > 0) {
    return { action: "update", accountId: existing.id, investor, fields };
  }
  return { action: "exists", accountId: existing.id, investor };
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export const PREFERENCE_COLUMNS = [
  "id", "email_frequency", "notifications_enabled", "timeline", "budget_min",
  "budget_max", "preferred_locations", "preferred_property_types",
  "min_bedrooms", "created_at", "updated_at",
] as const;

/**
 * preferred_property_types has no column in website_account_preferences, which
 * filters the daily email on budget, bedrooms and market only. Reported, not
 * dropped silently.
 */
export const PREFERENCE_UNMAPPED_COLUMNS = ["preferred_property_types"] as const;

const EMAIL_FREQUENCIES = ["daily", "weekly", "never"] as const;
export type EmailFrequency = (typeof EMAIL_FREQUENCIES)[number];

/** The enum value, or null when the export says something else. */
export function parseEmailFrequency(value: string | null | undefined): EmailFrequency | null {
  const raw = (value ?? "").trim().toLowerCase();
  return (EMAIL_FREQUENCIES as readonly string[]).includes(raw) ? (raw as EmailFrequency) : null;
}

/**
 * preferred_locations, whatever shape the export took: a JSON array, a Postgres
 * array literal, or a comma or semicolon separated list.
 */
export function parseLocationList(value: string | null | undefined): string[] {
  const raw = (value ?? "").trim();
  if (!raw || raw.toLowerCase() === "null") return [];
  let parts: string[] = [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) parts = parsed.map(entry => String(entry));
    } catch {
      parts = raw.slice(1, -1).split(",");
    }
  } else if (raw.startsWith("{") && raw.endsWith("}")) {
    // Postgres text[] literal: {"Poconos","Smoky Mountains"}
    parts = raw.slice(1, -1).split(",");
  } else {
    parts = raw.split(/[;,|]/);
  }
  const cleaned: string[] = [];
  for (const part of parts) {
    const text = part.trim().replace(/^["']|["']$/g, "").trim();
    if (text && text.toLowerCase() !== "null" && !cleaned.includes(text)) cleaned.push(text);
  }
  return cleaned;
}

export type MarketProfileRow = { id: number; name: string; state: string };

function marketKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Old location names resolved to market_profiles ids, which is what
 * websiteAccountPreferences.marketProfileIds holds.
 *
 * Only an exact name match, or a name that is the whole first comma-separated
 * part ("Poconos, PA" → "Poconos"), counts. A fuzzy guess here would email
 * someone listings in a state they never asked about, so anything unresolved
 * is returned for the report instead.
 */
export function matchMarketProfiles(
  locations: readonly string[],
  profiles: readonly MarketProfileRow[]
): { ids: number[]; unmatched: string[] } {
  const byName = new Map<string, number>();
  for (const profile of profiles) {
    byName.set(marketKey(profile.name), profile.id);
    byName.set(marketKey(`${profile.name} ${profile.state}`), profile.id);
    byName.set(marketKey(`${profile.name}, ${profile.state}`), profile.id);
  }
  const ids: number[] = [];
  const unmatched: string[] = [];
  for (const location of locations) {
    const direct = byName.get(marketKey(location));
    const head = byName.get(marketKey(location.split(",")[0] ?? ""));
    const id = direct ?? head;
    if (id === undefined) {
      if (!unmatched.includes(location)) unmatched.push(location);
      continue;
    }
    if (!ids.includes(id)) ids.push(id);
  }
  return { ids, unmatched };
}

export type MappedPreferences = {
  /** The old user id, which is this table's primary key. */
  oldUserId: string;
  notificationsEnabled: boolean;
  emailFrequency: EmailFrequency;
  budgetMin: string | null;
  budgetMax: string | null;
  minBedrooms: number | null;
  investmentTimeline: string | null;
  locations: string[];
  createdAt: Date | null;
  /** True when the export's email_frequency was not one of the three values. */
  frequencyFellBack: boolean;
};

export function mapPreferencesRow(record: CsvRecord): MappedPreferences {
  const frequency = parseEmailFrequency(cell(record, "email_frequency"));
  const timeline = cell(record, "timeline");
  let budgetMin = parseMoneyOrNull(cell(record, "budget_min"));
  let budgetMax = parseMoneyOrNull(cell(record, "budget_max"));
  // A reversed range would match nothing and look like a bug in the email.
  if (budgetMin && budgetMax && Number(budgetMin) > Number(budgetMax)) {
    [budgetMin, budgetMax] = [budgetMax, budgetMin];
  }
  return {
    oldUserId: cell(record, "id") ?? "",
    notificationsEnabled: parseBooleanOrNull(cell(record, "notifications_enabled")) !== false,
    // The column default is "daily"; an unreadable value keeps it rather than
    // silently unsubscribing someone.
    emailFrequency: frequency ?? "daily",
    budgetMin,
    budgetMax,
    minBedrooms: parseIntegerOrNull(cell(record, "min_bedrooms")),
    investmentTimeline: timeline ? timeline.slice(0, 64) : null,
    locations: parseLocationList(cell(record, "preferred_locations")),
    createdAt: parseOldTimestamp(cell(record, "created_at")),
    frequencyFellBack: !!cell(record, "email_frequency") && frequency === null,
  };
}

/**
 * Preferences are the investor's own settings, so an existing row here is never
 * overwritten — they may have changed them on the new site since. A row is
 * created when there is none, and nothing else.
 */
export type PreferencesDecision =
  | { action: "create"; accountId: number; values: Record<string, unknown>; unmatchedLocations: string[] }
  | { action: "exists"; accountId: number }
  | { action: "skip"; reason: "no-account" | "no-account-id" };

export function decidePreferences(
  preferences: MappedPreferences,
  accountId: number | undefined,
  hasExistingRow: boolean,
  markets: { ids: number[]; unmatched: string[] }
): PreferencesDecision {
  if (!preferences.oldUserId) return { action: "skip", reason: "no-account-id" };
  if (!accountId) return { action: "skip", reason: "no-account" };
  if (hasExistingRow) return { action: "exists", accountId };
  return {
    action: "create",
    accountId,
    values: {
      accountId,
      notificationsEnabled: preferences.notificationsEnabled,
      emailFrequency: preferences.emailFrequency,
      budgetMin: preferences.budgetMin,
      budgetMax: preferences.budgetMax,
      minBedrooms: preferences.minBedrooms,
      investmentTimeline: preferences.investmentTimeline,
      // NOT NULL json. An empty array means "no market filter", which is how
      // the daily email already reads a preferences row with no markets.
      marketProfileIds: markets.ids,
    },
    unmatchedLocations: markets.unmatched,
  };
}

// ─── Saved properties ────────────────────────────────────────────────────────

export const SAVED_PROPERTY_COLUMNS = [
  "user_id", "property_id", "property_slug", "address", "city", "state", "saved_at",
] as const;

/**
 * Old listing id and slug → the SavvyOS property id.
 *
 * server/oldSiteListingImportLogic.ts stamps every imported listing with
 * importedData.oldId and importedData.oldSlug, and website_properties.slug is
 * kept as the old slug so the old URLs redirect. Both are used, id first: a
 * slug can be edited after the import, an id cannot.
 *
 * websiteAccountSavedProperties.propertyId points at properties.id, not at the
 * website row, so that is what the index returns.
 */
export type WebsitePropertyRow = {
  /** properties.id — what a save points at. */
  propertyId: number;
  slug: string;
  importedData: Record<string, unknown> | null;
};

export type OldPropertyIndex = {
  byOldId: Map<string, number>;
  bySlug: Map<string, number>;
};

export function buildOldPropertyIndex(rows: readonly WebsitePropertyRow[]): OldPropertyIndex {
  const byOldId = new Map<string, number>();
  const bySlug = new Map<string, number>();
  for (const row of rows) {
    const imported = row.importedData ?? {};
    const oldId = typeof imported.oldId === "string" ? imported.oldId.trim().toLowerCase() : "";
    const oldSlug = typeof imported.oldSlug === "string" ? imported.oldSlug.trim().toLowerCase() : "";
    if (oldId && !byOldId.has(oldId)) byOldId.set(oldId, row.propertyId);
    if (oldSlug && !bySlug.has(oldSlug)) bySlug.set(oldSlug, row.propertyId);
    const slug = row.slug.trim().toLowerCase();
    if (slug && !bySlug.has(slug)) bySlug.set(slug, row.propertyId);
  }
  return { byOldId, bySlug };
}

export type PropertyResolution =
  | { propertyId: number; matchedBy: "oldId" | "slug" }
  | { propertyId: null; reason: "no-identifier" | "unmapped" };

export function resolveOldProperty(
  oldPropertyId: string | null,
  oldSlug: string | null,
  index: OldPropertyIndex
): PropertyResolution {
  const id = (oldPropertyId ?? "").trim().toLowerCase();
  const slug = (oldSlug ?? "").trim().toLowerCase();
  if (!id && !slug) return { propertyId: null, reason: "no-identifier" };
  const byId = id ? index.byOldId.get(id) : undefined;
  if (byId !== undefined) return { propertyId: byId, matchedBy: "oldId" };
  const bySlug = slug ? index.bySlug.get(slug) : undefined;
  if (bySlug !== undefined) return { propertyId: bySlug, matchedBy: "slug" };
  return { propertyId: null, reason: "unmapped" };
}

export type MappedSavedProperty = {
  oldUserId: string;
  oldPropertyId: string | null;
  oldSlug: string | null;
  savedAt: Date | null;
};

export function mapSavedPropertyRow(record: CsvRecord): MappedSavedProperty {
  return {
    oldUserId: cell(record, "user_id") ?? "",
    oldPropertyId: cell(record, "property_id"),
    oldSlug: cell(record, "property_slug"),
    savedAt: parseOldTimestamp(cell(record, "saved_at")),
  };
}

export type SavedPropertyDecision =
  | { action: "create"; accountId: number; propertyId: number; createdAt: Date | null }
  | { action: "exists"; accountId: number; propertyId: number }
  | { action: "unmapped"; reason: "no-identifier" | "unmapped"; oldPropertyId: string | null }
  | { action: "skip"; reason: "no-account" };

/**
 * `existingPairs` holds "accountId:propertyId" for every save already in
 * SavvyOS, and is added to as a run proceeds so two rows for the same listing
 * (907 saves over 225 listings) cannot both be inserted into a UNIQUE index.
 */
export function decideSavedProperty(
  saved: MappedSavedProperty,
  accountId: number | undefined,
  index: OldPropertyIndex,
  existingPairs: Set<string>
): SavedPropertyDecision {
  if (!accountId) return { action: "skip", reason: "no-account" };
  const resolved = resolveOldProperty(saved.oldPropertyId, saved.oldSlug, index);
  if (resolved.propertyId === null) {
    return { action: "unmapped", reason: resolved.reason, oldPropertyId: saved.oldPropertyId };
  }
  const key = `${accountId}:${resolved.propertyId}`;
  if (existingPairs.has(key)) return { action: "exists", accountId, propertyId: resolved.propertyId };
  return { action: "create", accountId, propertyId: resolved.propertyId, createdAt: saved.savedAt };
}

// ─── Leads ───────────────────────────────────────────────────────────────────

export const LEAD_COLUMNS = [
  "id", "created_at", "updated_at", "name", "email", "phone", "source", "status",
  "budget_min", "budget_max", "timeline", "markets_of_interest",
  "experience_level", "notes", "user_id", "agent_id", "agent_email",
  "property_id", "property_address", "property_city",
] as const;

/**
 * The export's `status` is sync state, not pipeline state: 450 rows say
 * "synced" (the old site posted them to SavvyOS successfully) and 9 say "new".
 * Neither is one of website_leads.status's values, and treating "new" as a
 * pipeline status would be a coincidence rather than a mapping, so every
 * imported lead starts at "new" and the old value goes in the report.
 */
export const LEAD_SYNCED_STATUS = "synced";

export type LeadIntent = "buy" | "sell" | "property" | "agent" | "general";
export type LeadRequestType = "showing" | "analysis" | "financing" | null;

/**
 * What the old site's `source` means in new-site terms.
 *
 * The three request buttons map one to one onto requestType, which is what
 * websiteRequestAction in server/websiteActivity.ts reads. intent becomes
 * "property" whenever a listing is attached, matching what the new site stores
 * for the same click.
 */
export function leadIntentAndRequest(
  source: string | null,
  hasProperty: boolean
): { intent: LeadIntent; requestType: LeadRequestType } {
  const value = (source ?? "").trim().toLowerCase();
  if (value === "book_showing") return { intent: hasProperty ? "property" : "general", requestType: "showing" };
  if (value === "deeper_analysis") return { intent: hasProperty ? "property" : "general", requestType: "analysis" };
  if (value === "financing") return { intent: hasProperty ? "property" : "general", requestType: "financing" };
  if (value === "seller") return { intent: "sell", requestType: null };
  if (value === "agent_profile") return { intent: "agent", requestType: null };
  if (value === "property_detail") return { intent: hasProperty ? "property" : "general", requestType: null };
  // direct, organic_search, blog, google_ads, website, social, other and
  // anything the export adds later.
  return { intent: hasProperty ? "property" : "general", requestType: null };
}

/**
 * The activity_log action for an old enquiry.
 *
 * These are the names the old site's own webhook wrote (SAVVY_WEB_EVENTS in
 * server/webhookHandlers.ts). Hot Leads, the lead score, the daily agent report
 * and the custom reports all count these and nothing else, so an imported
 * enquiry has to use them or it is invisible to every one of those readers.
 */
export const OLD_LEAD_ACTIONS = [
  "showing_requested", "analysis_requested", "financing_requested",
  "property_contact_requested", "lead_created",
] as const;
export type OldLeadAction = (typeof OLD_LEAD_ACTIONS)[number];

export function oldLeadAction(source: string | null, hasProperty: boolean): OldLeadAction {
  const { intent, requestType } = leadIntentAndRequest(source, hasProperty);
  if (requestType === "showing") return "showing_requested";
  if (requestType === "analysis") return "analysis_requested";
  if (requestType === "financing") return "financing_requested";
  if (intent === "property" && hasProperty) return "property_contact_requested";
  return "lead_created";
}

/** The SavvyOS lead source for an old enquiry. Falls back by intent. */
export function leadSourceName(source: string | null, intent: LeadIntent): WebsiteLeadSource {
  const mapped = oldSiteWebsiteLeadSource(source);
  if (mapped) return mapped;
  if (intent === "sell") return "Seller Enquiry";
  if (intent === "agent") return "Agent Message";
  if (intent === "property") return "Property Inquiry";
  return "General Inquiry";
}

export type MappedLead = {
  oldId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  intent: LeadIntent;
  requestType: LeadRequestType;
  action: OldLeadAction;
  leadSourceName: WebsiteLeadSource;
  message: string | null;
  oldSource: string | null;
  oldStatus: string | null;
  oldUserId: string | null;
  oldPropertyId: string | null;
  propertyCity: string | null;
  agentEmail: string | null;
  createdAt: Date | null;
};

export function mapLeadRow(record: CsvRecord): MappedLead {
  const email = normalizeEmail(cell(record, "email"));
  const { firstName, lastName } = personName(cell(record, "name"), email);
  const oldPropertyId = cell(record, "property_id");
  const source = cell(record, "source");
  const { intent, requestType } = leadIntentAndRequest(source, !!oldPropertyId);
  const phone = cell(record, "phone");
  const notes = cell(record, "notes");
  return {
    oldId: cell(record, "id") ?? "",
    email,
    firstName,
    lastName,
    // websiteLeads.phone is varchar(64); contacts.phone is varchar(32).
    phone: phone ? phone.slice(0, 32) : null,
    intent,
    requestType,
    action: oldLeadAction(source, !!oldPropertyId),
    leadSourceName: leadSourceName(source, intent),
    message: notes ? notes.slice(0, 4000) : null,
    oldSource: source,
    oldStatus: cell(record, "status"),
    oldUserId: cell(record, "user_id"),
    oldPropertyId,
    propertyCity: cell(record, "property_city"),
    agentEmail: cell(record, "agent_email") ? normalizeEmail(cell(record, "agent_email")) : null,
    createdAt: parseOldTimestamp(cell(record, "created_at")),
  };
}

/**
 * The lead rows worth importing, grouped into one person each.
 *
 * 459 rows are 245 people, one of whom enquired 17 times. Each person becomes
 * one contact — their earliest enquiry — and every later enquiry becomes a
 * timeline entry on it, which is what rule 4 asks for and what the old site's
 * webhook did live.
 */
export type LeadPerson = {
  email: string;
  /** Oldest first. The first is the one the contact is created from. */
  enquiries: MappedLead[];
};

export type LeadPlan = {
  people: LeadPerson[];
  totalEnquiries: number;
  noEmail: string[];
  noCreatedAt: string[];
};

export function planLeads(records: CsvRecord[]): LeadPlan {
  const noEmail: string[] = [];
  const noCreatedAt: string[] = [];
  const byEmail = new Map<string, MappedLead[]>();
  let totalEnquiries = 0;
  for (const record of records) {
    const mapped = mapLeadRow(record);
    if (!mapped.email || !looksLikeEmail(mapped.email)) {
      noEmail.push(mapped.oldId);
      continue;
    }
    // An enquiry with no time cannot be ordered or matched to the already
    // synced row, so it is reported rather than guessed at.
    if (!mapped.createdAt) {
      noCreatedAt.push(mapped.oldId);
      continue;
    }
    const list = byEmail.get(mapped.email);
    if (list) list.push(mapped);
    else byEmail.set(mapped.email, [mapped]);
    totalEnquiries += 1;
  }
  const people: LeadPerson[] = [];
  Array.from(byEmail.entries()).forEach(([email, enquiries]) => {
    enquiries.sort(
      (a, b) =>
        (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) ||
        a.oldId.localeCompare(b.oldId)
    );
    people.push({ email, enquiries });
  });
  return { people, totalEnquiries, noEmail, noCreatedAt };
}

/**
 * Whether an enquiry is already on a contact's timeline.
 *
 * The old site posted each lead to SavvyOS as it happened, and the webhook
 * wrote the old lead's id into activity_log.details.leadId (see
 * savvyWebEventHandler). That id is the exact key: 450 of the 459 rows say
 * they synced, and matching on it means a re-run of this import adds nothing
 * and invents no duplicate timeline entries.
 *
 * There is no fallback to "same email at about the same time". A guess would
 * either double-post a real enquiry or hide one, and the ids are right here.
 */
export function leadAlreadyRecorded(
  lead: MappedLead,
  recordedOldLeadIds: Set<string>
): boolean {
  return !!lead.oldId && recordedOldLeadIds.has(lead.oldId);
}

/**
 * website_leads has no column for the old lead id, so the import puts it in
 * `attribution`, which is the json bag the endpoint already fills. That makes
 * a row this script wrote recognisable on the next run.
 */
export function leadAttribution(lead: MappedLead): Record<string, string> {
  const attribution: Record<string, string> = {
    source: "savvy-agents.com",
    import: "old-site-investor-import",
    oldLeadId: lead.oldId,
  };
  if (lead.oldSource) attribution.oldSource = lead.oldSource;
  if (lead.oldStatus) attribution.oldStatus = lead.oldStatus;
  if (lead.oldPropertyId) attribution.oldPropertyId = lead.oldPropertyId;
  return attribution;
}

export type LeadDecision =
  | { action: "create-contact"; lead: MappedLead }
  | { action: "attach"; contactId: number; lead: MappedLead }
  | { action: "exists"; contactId: number | null; lead: MappedLead }
  | { action: "conflict"; contactId: number; lead: MappedLead; reason: string };

/**
 * What to do with one enquiry.
 *
 * An existing contact's own fields are never touched — rule 2, and the reason
 * is real: a contact may have been corrected by an agent, or be a long-standing
 * client who also happens to have used the website. A new enquiry only ever
 * adds to their timeline.
 */
export function decideLead(
  lead: MappedLead,
  contactId: number | undefined,
  recordedOldLeadIds: Set<string>
): LeadDecision {
  if (leadAlreadyRecorded(lead, recordedOldLeadIds)) {
    return { action: "exists", contactId: contactId ?? null, lead };
  }
  if (!contactId) return { action: "create-contact", lead };
  return { action: "attach", contactId, lead };
}
