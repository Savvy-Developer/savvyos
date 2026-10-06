import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

// websiteAccountAuth reaches the database and the signing secret at import
// time. Only normalizeAccountEmail is wanted here, so both are stubbed, as
// websiteAccountAuth.test.ts does.
vi.mock("./db", () => ({ getDb: vi.fn(), logActivity: vi.fn() }));
vi.mock("./_core/env", () => ({ ENV: { cookieSecret: "test-secret" } }));

import { normalizeAccountEmail } from "./_core/websiteAccountAuth";
import {
  OLD_LEAD_ACTIONS,
  buildOldPropertyIndex,
  cell,
  classifyPasswordHash,
  decideInvestor,
  decideLead,
  decidePreferences,
  decideSavedProperty,
  investorName,
  leadAlreadyRecorded,
  leadAttribution,
  leadIntentAndRequest,
  leadSourceName,
  looksLikeEmail,
  mapInvestorRow,
  mapLeadRow,
  mapPreferencesRow,
  mapSavedPropertyRow,
  matchMarketProfiles,
  missingColumns,
  normalizeEmail,
  oldLeadAction,
  parseBooleanOrNull,
  parseCsv,
  parseEmailFrequency,
  parseIntegerOrNull,
  parseLocationList,
  parseMoneyOrNull,
  parseOldTimestamp,
  personName,
  planInvestors,
  planLeads,
  readCsv,
  resolveOldProperty,
} from "./oldSiteInvestorImportLogic";

/**
 * Every value here is invented. No row, address, hash or name from the real
 * export appears in this file, and none should be added to it.
 */

// ─── CSV ─────────────────────────────────────────────────────────────────────

describe("parseCsv", () => {
  it("reads a plain file", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps a newline inside a quoted field as one row", () => {
    // The real leads export is 673 physical lines for 459 rows because of this.
    const rows = parseCsv('id,notes\n7,"line one\nline two"\n8,plain\n');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(["7", "line one\nline two"]);
    expect(rows[2]).toEqual(["8", "plain"]);
  });

  it("keeps commas and escaped quotes inside quoted fields", () => {
    const rows = parseCsv('a,b\n"x, y","he said ""no"""\n');
    expect(rows[1]).toEqual(["x, y", 'he said "no"']);
  });

  it("handles CRLF files and a byte order mark", () => {
    const rows = parseCsv("﻿a,b\r\n1,2\r\n");
    expect(rows[0]).toEqual(["a", "b"]);
    expect(rows[1]).toEqual(["1", "2"]);
  });

  it("does not invent a row for a trailing newline", () => {
    expect(parseCsv("a,b\n1,2\n")).toHaveLength(2);
    expect(parseCsv("a,b\n1,2")).toHaveLength(2);
  });
});

describe("readCsv", () => {
  it("keys rows by column and reports rows that do not fit the header", () => {
    const file = readCsv("id,email\n1,a@example.test\n2\n3,c@example.test,extra\n");
    expect(file.header).toEqual(["id", "email"]);
    expect(file.records).toHaveLength(1);
    expect(file.records[0]).toEqual({ id: "1", email: "a@example.test" });
    expect(file.malformedRows).toEqual([2, 3]);
  });

  it("names the columns a file is missing", () => {
    const file = readCsv("id,email\n1,a@example.test\n");
    expect(missingColumns(file, ["id", "email", "phone"])).toEqual(["phone"]);
    expect(missingColumns(file, ["id"])).toEqual([]);
  });
});

describe("cell", () => {
  it("treats the literal string null as absent", () => {
    // The exports write "null", not an empty field: every budget_min in the
    // leads file is the four-character word.
    const record = { a: "null", b: "NULL", c: " ", d: "0", e: "real" };
    expect(cell(record, "a")).toBeNull();
    expect(cell(record, "b")).toBeNull();
    expect(cell(record, "c")).toBeNull();
    expect(cell(record, "d")).toBe("0");
    expect(cell(record, "e")).toBe("real");
    expect(cell(record, "missing")).toBeNull();
  });

  it("does not mistake a real value containing null for absent", () => {
    expect(cell({ a: "nullable street" }, "a")).toBe("nullable street");
  });
});

// ─── Scalars ─────────────────────────────────────────────────────────────────

describe("normalizeEmail", () => {
  it("agrees with normalizeAccountEmail, which decides what a sign-in finds", () => {
    const inputs = [
      " Person@Example.TEST ", "person@example.test", "PERSON@EXAMPLE.TEST",
      "", "   ", "mixed.Case+tag@Example.test", "\tperson@example.test\n",
    ];
    for (const input of inputs) {
      expect(normalizeEmail(input)).toBe(normalizeAccountEmail(input));
    }
    expect(normalizeEmail(null)).toBe(normalizeAccountEmail(null as unknown as string));
    expect(normalizeEmail(undefined)).toBe(normalizeAccountEmail(undefined as unknown as string));
  });
});

describe("looksLikeEmail", () => {
  it("accepts an address and rejects a name", () => {
    expect(looksLikeEmail("a@b.test")).toBe(true);
    expect(looksLikeEmail("Jo Smith")).toBe(false);
    expect(looksLikeEmail("a@b")).toBe(false);
    expect(looksLikeEmail("a@b.test, c@d.test")).toBe(false);
    expect(looksLikeEmail("")).toBe(false);
  });
});

describe("personName", () => {
  it("splits a full name on the first space", () => {
    expect(personName("Jo Smith", "x@example.test")).toEqual({ firstName: "Jo", lastName: "Smith" });
    expect(personName("Jo van der Berg", "x@example.test")).toEqual({
      firstName: "Jo",
      lastName: "van der Berg",
    });
  });

  it("leaves the last name empty for a one-word name", () => {
    // Both columns are NOT NULL, so "" is the value, never null.
    expect(personName("Jo", "x@example.test")).toEqual({ firstName: "Jo", lastName: "" });
  });

  it("derives a name when the name column holds an email address", () => {
    expect(personName("jo.smith@example.test", "jo.smith@example.test")).toEqual({
      firstName: "Jo",
      lastName: "Smith",
    });
    expect(personName("jo.smith92@example.test", "jo.smith92@example.test")).toEqual({
      firstName: "Jo",
      lastName: "Smith",
    });
  });

  it("falls back to the email when there is no name at all", () => {
    expect(personName(null, "sam_lee@example.test")).toEqual({ firstName: "Sam", lastName: "Lee" });
    expect(personName("", "hello@example.test")).toEqual({ firstName: "Hello", lastName: "" });
  });

  it("never returns an empty first name", () => {
    expect(personName(null, null).firstName).toBe("Website");
    expect(personName("   ", "@example.test").firstName).toBe("Website");
  });

  it("truncates to the column width", () => {
    const long = `${"A".repeat(200)} ${"B".repeat(200)}`;
    const name = personName(long, "x@example.test");
    expect(name.firstName).toHaveLength(128);
    expect(name.lastName).toHaveLength(128);
  });
});

describe("investorName", () => {
  it("prefers the separate name columns", () => {
    expect(investorName({ first_name: "Jo", last_name: "Smith", full_name: "Ignored Name" })).toEqual({
      firstName: "Jo",
      lastName: "Smith",
    });
  });

  it("falls back to the full name, then the email", () => {
    expect(investorName({ first_name: "null", last_name: "null", full_name: "Jo Smith" })).toEqual({
      firstName: "Jo",
      lastName: "Smith",
    });
    expect(
      investorName({ first_name: "null", last_name: "null", full_name: "null", email: "sam.lee@example.test" })
    ).toEqual({ firstName: "Sam", lastName: "Lee" });
  });

  it("keeps a last name supplied alongside a one-word first name", () => {
    expect(investorName({ first_name: "Jo", last_name: "null" })).toEqual({ firstName: "Jo", lastName: "" });
  });
});

describe("parseOldTimestamp", () => {
  it("reads the Postgres shape the exports use", () => {
    // Space separator, microseconds, two-character offset.
    expect(parseOldTimestamp("2026-04-29 12:55:09.391917+00")?.toISOString()).toBe(
      "2026-04-29T12:55:09.391Z"
    );
  });

  it("reads the other offset and precision shapes in the same file", () => {
    expect(parseOldTimestamp("2026-10-05 19:56:53.4574+00")?.toISOString()).toBe(
      "2026-10-05T19:56:53.457Z"
    );
    expect(parseOldTimestamp("2026-01-02 03:04:05+0000")?.toISOString()).toBe(
      "2026-01-02T03:04:05.000Z"
    );
    expect(parseOldTimestamp("2026-01-02 03:04:05-05")?.toISOString()).toBe(
      "2026-01-02T08:04:05.000Z"
    );
    expect(parseOldTimestamp("2026-01-02T03:04:05Z")?.toISOString()).toBe(
      "2026-01-02T03:04:05.000Z"
    );
  });

  it("treats a bare timestamp as UTC rather than local time", () => {
    expect(parseOldTimestamp("2026-01-02 03:04:05")?.toISOString()).toBe("2026-01-02T03:04:05.000Z");
  });

  it("returns null for absent and unreadable values", () => {
    expect(parseOldTimestamp("null")).toBeNull();
    expect(parseOldTimestamp("")).toBeNull();
    expect(parseOldTimestamp(null)).toBeNull();
    expect(parseOldTimestamp("not a date")).toBeNull();
  });
});

describe("number and boolean parsing", () => {
  it("reads integers and rejects nonsense", () => {
    expect(parseIntegerOrNull("3")).toBe(3);
    expect(parseIntegerOrNull("3.7")).toBe(4);
    expect(parseIntegerOrNull("0")).toBe(0);
    expect(parseIntegerOrNull("null")).toBeNull();
    expect(parseIntegerOrNull("-2")).toBeNull();
    expect(parseIntegerOrNull("many")).toBeNull();
  });

  it("returns money as a decimal string", () => {
    expect(parseMoneyOrNull("250000")).toBe("250000.00");
    expect(parseMoneyOrNull("$250,000")).toBe("250000.00");
    expect(parseMoneyOrNull("250000.456")).toBe("250000.46");
    expect(parseMoneyOrNull("null")).toBeNull();
    expect(parseMoneyOrNull("-1")).toBeNull();
    // Wider than decimal(12,2), which MySQL would refuse.
    expect(parseMoneyOrNull("99999999999999")).toBeNull();
  });

  it("reads every boolean spelling Postgres exports use", () => {
    expect(parseBooleanOrNull("t")).toBe(true);
    expect(parseBooleanOrNull("TRUE")).toBe(true);
    expect(parseBooleanOrNull("1")).toBe(true);
    expect(parseBooleanOrNull("f")).toBe(false);
    expect(parseBooleanOrNull("false")).toBe(false);
    expect(parseBooleanOrNull("0")).toBe(false);
    expect(parseBooleanOrNull("null")).toBeNull();
    expect(parseBooleanOrNull("maybe")).toBeNull();
  });
});

// ─── Passwords ───────────────────────────────────────────────────────────────

describe("classifyPasswordHash", () => {
  // Generated here, from a throwaway password. No exported hash is in this file.
  const password = "a throwaway test password";
  const generated = bcrypt.hashSync(password, 10);
  const asRevision = (revision: string) => `$2${revision}$${generated.slice(4)}`;

  it("accepts the revisions bcryptjs can actually verify", () => {
    for (const revision of ["a", "b", "y"]) {
      const hash = asRevision(revision);
      expect(classifyPasswordHash(hash)).toBe("bcrypt");
      // The point of copying the hash across: the old password still works.
      expect(bcrypt.compareSync(password, hash)).toBe(true);
      expect(bcrypt.compareSync("the wrong password", hash)).toBe(false);
    }
  });

  it("rejects a revision bcryptjs throws on", () => {
    // $2x$ raises "Invalid salt revision", so an account made from one could
    // never be signed into. Reported rather than imported.
    const hash = asRevision("x");
    expect(classifyPasswordHash(hash)).toBe("unsupported");
    expect(() => bcrypt.compareSync(password, hash)).toThrow();
  });

  it("calls an absent password absent, not broken", () => {
    expect(classifyPasswordHash(null)).toBe("absent");
    expect(classifyPasswordHash("")).toBe("absent");
    expect(classifyPasswordHash("null")).toBe("absent");
  });

  it("rejects anything that is not a 60-character bcrypt hash", () => {
    expect(classifyPasswordHash("plaintext")).toBe("unsupported");
    expect(classifyPasswordHash("$2a$10$tooshort")).toBe("unsupported");
    expect(classifyPasswordHash(`${generated}extra`)).toBe("unsupported");
    // A cost outside bcrypt's range.
    expect(classifyPasswordHash(`$2a$99$${generated.slice(7)}`)).toBe("unsupported");
    expect(classifyPasswordHash(`$1$10$${generated.slice(7)}`)).toBe("unsupported");
  });

  it("verifies a cost-12 hash, which is what this site writes", () => {
    const hash = bcrypt.hashSync(password, 12);
    expect(classifyPasswordHash(hash)).toBe("bcrypt");
    expect(bcrypt.compareSync(password, hash)).toBe(true);
  });
});

// ─── Investors ───────────────────────────────────────────────────────────────

const investorRow = (over: Partial<Record<string, string>> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  email: " Jo@Example.TEST ",
  first_name: "Jo",
  last_name: "Smith",
  full_name: "Jo Smith",
  phone: "555-0100",
  is_active: "t",
  marketing_consent: "t",
  onboarding_completed_at: "null",
  created_at: "2026-01-02 03:04:05+00",
  updated_at: "2026-02-02 03:04:05+00",
  encrypted_password: bcrypt.hashSync("another throwaway", 10),
  email_confirmed_at: "2026-01-03 00:00:00+00",
  last_sign_in_at: "2026-03-01 00:00:00+00",
  has_google: "f",
  assigned_agent_email: " Agent@Savvy.Test ",
  ...over,
});

describe("mapInvestorRow", () => {
  it("maps a complete row", () => {
    const mapped = mapInvestorRow(investorRow());
    expect(mapped.email).toBe("jo@example.test");
    expect(mapped.firstName).toBe("Jo");
    expect(mapped.lastName).toBe("Smith");
    expect(mapped.phone).toBe("555-0100");
    expect(mapped.status).toBe("active");
    expect(mapped.password).toBe("bcrypt");
    expect(mapped.needsPasswordSetup).toBe(false);
    expect(mapped.assignedAgentEmail).toBe("agent@savvy.test");
    expect(mapped.emailVerifiedAt?.toISOString()).toBe("2026-01-03T00:00:00.000Z");
  });

  it("marks a Google-only investor as needing a password", () => {
    const mapped = mapInvestorRow(investorRow({ encrypted_password: "null", has_google: "t" }));
    expect(mapped.password).toBe("absent");
    expect(mapped.passwordHash).toBeNull();
    expect(mapped.needsPasswordSetup).toBe(true);
    expect(mapped.hasGoogle).toBe(true);
  });

  it("suspends an inactive investor", () => {
    expect(mapInvestorRow(investorRow({ is_active: "f" })).status).toBe("suspended");
    // An unreadable flag is not a reason to lock someone out.
    expect(mapInvestorRow(investorRow({ is_active: "null" })).status).toBe("active");
  });

  it("truncates a phone to the column width", () => {
    const mapped = mapInvestorRow(investorRow({ phone: "9".repeat(60) }));
    expect(mapped.phone).toHaveLength(32);
  });
});

describe("planInvestors", () => {
  it("keeps one row per email and reports the duplicate", () => {
    const plan = planInvestors([
      investorRow({ id: "old-1", created_at: "2026-01-01 00:00:00+00" }),
      investorRow({ id: "old-2", created_at: "2026-05-01 00:00:00+00" }),
    ]);
    expect(plan.importable).toHaveLength(1);
    // The newest row wins; the older id is reported, not silently lost.
    expect(plan.importable[0].oldId).toBe("old-2");
    expect(plan.duplicateInSource).toEqual(["old-1"]);
  });

  it("reports rows it cannot import instead of dropping them", () => {
    const plan = planInvestors([
      investorRow({ id: "no-email", email: "null" }),
      investorRow({ id: "bad-email", email: "not an address" }),
      investorRow({ id: "bad-hash", email: "b@example.test", encrypted_password: "plaintext" }),
      investorRow({ id: "fine", email: "c@example.test" }),
    ]);
    expect(plan.importable.map(entry => entry.oldId)).toEqual(["fine"]);
    expect(plan.noEmail).toEqual(["no-email", "bad-email"]);
    expect(plan.unsupportedPassword).toEqual(["bad-hash"]);
  });

  it("is stable when re-run over the same records", () => {
    const records = [investorRow({ id: "a", email: "a@example.test" })];
    expect(planInvestors(records)).toEqual(planInvestors(records));
  });
});

describe("decideInvestor", () => {
  const investor = mapInvestorRow(investorRow());

  it("creates an account when there is none", () => {
    expect(decideInvestor(investor, undefined)).toEqual({ action: "create", investor });
  });

  it("never overwrites an existing account's own password", () => {
    const decision = decideInvestor(investor, {
      id: 7,
      email: investor.email,
      firstName: "Jo",
      lastName: "Smith",
      phone: "555-0199",
      emailVerifiedAt: new Date("2026-01-01T00:00:00Z"),
      passwordHash: bcrypt.hashSync("a password they chose here", 12),
    });
    expect(decision.action).toBe("conflict");
    if (decision.action === "conflict") {
      expect(decision.accountId).toBe(7);
      expect(decision.reason).toContain("not copied");
    }
  });

  it("fills blank fields but leaves filled ones alone", () => {
    const decision = decideInvestor(investor, {
      id: 8,
      email: investor.email,
      firstName: null,
      lastName: "Jones",
      phone: null,
      emailVerifiedAt: null,
      passwordHash: investor.passwordHash,
    });
    expect(decision.action).toBe("update");
    if (decision.action === "update") {
      expect(decision.fields.firstName).toBe("Jo");
      expect(decision.fields.phone).toBe("555-0100");
      expect(decision.fields.emailVerifiedAt).toBeInstanceOf(Date);
      // Already set here, so the import does not touch it.
      expect(decision.fields).not.toHaveProperty("lastName");
      expect(decision.fields).not.toHaveProperty("passwordHash");
    }
  });

  it("reports nothing to do on a second run", () => {
    const existing = {
      id: 9,
      email: investor.email,
      firstName: investor.firstName,
      lastName: investor.lastName,
      phone: investor.phone,
      emailVerifiedAt: investor.emailVerifiedAt,
      passwordHash: investor.passwordHash,
    };
    expect(decideInvestor(investor, existing)).toEqual({
      action: "exists",
      accountId: 9,
      investor,
    });
  });

  it("does not call a Google-only investor a password conflict", () => {
    // They have no old hash to copy, so whatever is here is not in conflict.
    const google = mapInvestorRow(investorRow({ encrypted_password: "null", has_google: "t" }));
    const decision = decideInvestor(google, {
      id: 10,
      email: google.email,
      firstName: google.firstName,
      lastName: google.lastName,
      phone: google.phone,
      emailVerifiedAt: google.emailVerifiedAt,
      passwordHash: "$2b$12$whatever-is-already-here-is-left-alone-00000000000",
    });
    expect(decision.action).toBe("exists");
  });
});

// ─── Preferences ─────────────────────────────────────────────────────────────

describe("parseEmailFrequency", () => {
  it("accepts the three values and nothing else", () => {
    expect(parseEmailFrequency("daily")).toBe("daily");
    expect(parseEmailFrequency("WEEKLY")).toBe("weekly");
    expect(parseEmailFrequency("never")).toBe("never");
    expect(parseEmailFrequency("monthly")).toBeNull();
    expect(parseEmailFrequency("null")).toBeNull();
  });
});

describe("parseLocationList", () => {
  it("reads a JSON array", () => {
    expect(parseLocationList('["Poconos","Smoky Mountains"]')).toEqual(["Poconos", "Smoky Mountains"]);
  });

  it("reads a Postgres array literal", () => {
    expect(parseLocationList('{"Poconos","Smoky Mountains"}')).toEqual(["Poconos", "Smoky Mountains"]);
  });

  it("reads a separated list", () => {
    expect(parseLocationList("Poconos, Smoky Mountains")).toEqual(["Poconos", "Smoky Mountains"]);
    expect(parseLocationList("Poconos; Smoky Mountains")).toEqual(["Poconos", "Smoky Mountains"]);
  });

  it("drops blanks, nulls and repeats", () => {
    expect(parseLocationList('["Poconos","Poconos","","null"]')).toEqual(["Poconos"]);
    expect(parseLocationList("null")).toEqual([]);
    expect(parseLocationList(null)).toEqual([]);
  });
});

describe("matchMarketProfiles", () => {
  const profiles = [
    { id: 1, name: "Poconos", state: "PA" },
    { id: 2, name: "Smoky Mountains", state: "TN" },
  ];

  it("matches a name exactly, with or without the state", () => {
    expect(matchMarketProfiles(["Poconos"], profiles).ids).toEqual([1]);
    expect(matchMarketProfiles(["poconos, pa"], profiles).ids).toEqual([1]);
    expect(matchMarketProfiles(["Smoky  Mountains"], profiles).ids).toEqual([2]);
  });

  it("matches on the part before a comma", () => {
    expect(matchMarketProfiles(["Poconos, Pennsylvania"], profiles).ids).toEqual([1]);
  });

  it("reports an unknown location rather than guessing", () => {
    const result = matchMarketProfiles(["Poconos", "Atlantis"], profiles);
    expect(result.ids).toEqual([1]);
    expect(result.unmatched).toEqual(["Atlantis"]);
  });

  it("does not repeat an id when two names resolve to one market", () => {
    expect(matchMarketProfiles(["Poconos", "Poconos, PA"], profiles).ids).toEqual([1]);
  });
});

const preferencesRow = (over: Partial<Record<string, string>> = {}) => ({
  id: "22222222-2222-4222-8222-222222222222",
  email_frequency: "weekly",
  notifications_enabled: "t",
  timeline: "3-6 months",
  budget_min: "100000",
  budget_max: "400000",
  preferred_locations: '["Poconos"]',
  preferred_property_types: '["single_family"]',
  min_bedrooms: "3",
  created_at: "2026-01-02 03:04:05+00",
  updated_at: "2026-01-02 03:04:05+00",
  ...over,
});

describe("mapPreferencesRow", () => {
  it("maps a complete row", () => {
    const mapped = mapPreferencesRow(preferencesRow());
    expect(mapped.emailFrequency).toBe("weekly");
    expect(mapped.notificationsEnabled).toBe(true);
    expect(mapped.budgetMin).toBe("100000.00");
    expect(mapped.budgetMax).toBe("400000.00");
    expect(mapped.minBedrooms).toBe(3);
    expect(mapped.investmentTimeline).toBe("3-6 months");
    expect(mapped.locations).toEqual(["Poconos"]);
    expect(mapped.frequencyFellBack).toBe(false);
  });

  it("keeps the column default when the frequency is unreadable, and says so", () => {
    const mapped = mapPreferencesRow(preferencesRow({ email_frequency: "monthly" }));
    expect(mapped.emailFrequency).toBe("daily");
    expect(mapped.frequencyFellBack).toBe(true);
  });

  it("does not report a fallback for an absent frequency", () => {
    expect(mapPreferencesRow(preferencesRow({ email_frequency: "null" })).frequencyFellBack).toBe(false);
  });

  it("turns a reversed budget range the right way round", () => {
    const mapped = mapPreferencesRow(preferencesRow({ budget_min: "400000", budget_max: "100000" }));
    expect(mapped.budgetMin).toBe("100000.00");
    expect(mapped.budgetMax).toBe("400000.00");
  });

  it("only disables notifications on an explicit false", () => {
    expect(mapPreferencesRow(preferencesRow({ notifications_enabled: "f" })).notificationsEnabled).toBe(false);
    expect(mapPreferencesRow(preferencesRow({ notifications_enabled: "null" })).notificationsEnabled).toBe(true);
  });

  it("truncates a long timeline to the column width", () => {
    expect(mapPreferencesRow(preferencesRow({ timeline: "x".repeat(200) })).investmentTimeline).toHaveLength(64);
  });
});

describe("decidePreferences", () => {
  const mapped = mapPreferencesRow(preferencesRow());
  const markets = { ids: [1], unmatched: [] as string[] };

  it("creates a row when the account has none", () => {
    const decision = decidePreferences(mapped, 5, false, markets);
    expect(decision.action).toBe("create");
    if (decision.action === "create") {
      expect(decision.values.accountId).toBe(5);
      expect(decision.values.marketProfileIds).toEqual([1]);
      expect(decision.values.emailFrequency).toBe("weekly");
    }
  });

  it("never overwrites settings the investor may have changed here", () => {
    expect(decidePreferences(mapped, 5, true, markets)).toEqual({ action: "exists", accountId: 5 });
  });

  it("skips a row whose investor was not imported", () => {
    expect(decidePreferences(mapped, undefined, false, markets)).toEqual({
      action: "skip",
      reason: "no-account",
    });
  });

  it("always supplies the NOT NULL market array", () => {
    const decision = decidePreferences(mapped, 5, false, { ids: [], unmatched: ["Atlantis"] });
    expect(decision.action).toBe("create");
    if (decision.action === "create") {
      expect(decision.values.marketProfileIds).toEqual([]);
      expect(decision.unmatchedLocations).toEqual(["Atlantis"]);
    }
  });
});

// ─── Saved properties ────────────────────────────────────────────────────────

describe("buildOldPropertyIndex and resolveOldProperty", () => {
  const index = buildOldPropertyIndex([
    { propertyId: 100, slug: "cabin-in-the-woods", importedData: { oldId: "OLD-A", oldSlug: "cabin-in-the-woods" } },
    { propertyId: 200, slug: "renamed-lake-house", importedData: { oldId: "old-b", oldSlug: "lake-house" } },
    { propertyId: 300, slug: "no-import-data", importedData: null },
  ]);

  it("matches on the old id, case insensitively", () => {
    expect(resolveOldProperty("old-a", null, index)).toEqual({ propertyId: 100, matchedBy: "oldId" });
    expect(resolveOldProperty("OLD-B", null, index)).toEqual({ propertyId: 200, matchedBy: "oldId" });
  });

  it("falls back to the old slug when the id is unknown", () => {
    expect(resolveOldProperty(null, "lake-house", index)).toEqual({ propertyId: 200, matchedBy: "slug" });
  });

  it("prefers the id, because a slug can be edited here afterwards", () => {
    // The listing now has slug "renamed-lake-house"; the save still finds it.
    expect(resolveOldProperty("old-b", "lake-house", index)).toEqual({ propertyId: 200, matchedBy: "oldId" });
  });

  it("also indexes the current slug, which the listing import kept", () => {
    expect(resolveOldProperty(null, "no-import-data", index)).toEqual({ propertyId: 300, matchedBy: "slug" });
  });

  it("reports a listing it cannot map rather than dropping the save", () => {
    expect(resolveOldProperty("missing", "also-missing", index)).toEqual({
      propertyId: null,
      reason: "unmapped",
    });
    expect(resolveOldProperty(null, null, index)).toEqual({
      propertyId: null,
      reason: "no-identifier",
    });
  });
});

describe("decideSavedProperty", () => {
  const index = buildOldPropertyIndex([
    { propertyId: 100, slug: "cabin", importedData: { oldId: "OLD-A", oldSlug: "cabin" } },
  ]);
  const row = (over: Partial<Record<string, string>> = {}) =>
    mapSavedPropertyRow({
      user_id: "33333333-3333-4333-8333-333333333333",
      property_id: "OLD-A",
      property_slug: "cabin",
      address: "1 Test Way",
      city: "Testville",
      state: "PA",
      saved_at: "2026-02-03 04:05:06+00",
      ...over,
    });

  it("creates a save, keeping when it was saved", () => {
    const decision = decideSavedProperty(row(), 5, index, new Set());
    expect(decision.action).toBe("create");
    if (decision.action === "create") {
      expect(decision.propertyId).toBe(100);
      expect(decision.createdAt?.toISOString()).toBe("2026-02-03T04:05:06.000Z");
    }
  });

  it("skips a save that is already there", () => {
    expect(decideSavedProperty(row(), 5, index, new Set(["5:100"]))).toEqual({
      action: "exists",
      accountId: 5,
      propertyId: 100,
    });
  });

  it("reports a listing with no SavvyOS match", () => {
    const decision = decideSavedProperty(row({ property_id: "gone", property_slug: "gone" }), 5, index, new Set());
    expect(decision).toEqual({ action: "unmapped", reason: "unmapped", oldPropertyId: "gone" });
  });

  it("skips a save whose investor was not imported", () => {
    expect(decideSavedProperty(row(), undefined, index, new Set())).toEqual({
      action: "skip",
      reason: "no-account",
    });
  });

  it("does not plan the same save twice within one run", () => {
    // The UNIQUE (accountId, propertyId) index would abort the batch.
    const seen = new Set<string>();
    const first = decideSavedProperty(row(), 5, index, seen);
    expect(first.action).toBe("create");
    if (first.action === "create") seen.add(`${first.accountId}:${first.propertyId}`);
    expect(decideSavedProperty(row({ property_slug: "cabin" }), 5, index, seen).action).toBe("exists");
  });
});

// ─── Leads ───────────────────────────────────────────────────────────────────

describe("leadIntentAndRequest", () => {
  it("maps the three request buttons onto requestType", () => {
    expect(leadIntentAndRequest("book_showing", true)).toEqual({ intent: "property", requestType: "showing" });
    expect(leadIntentAndRequest("deeper_analysis", true)).toEqual({ intent: "property", requestType: "analysis" });
    expect(leadIntentAndRequest("financing", true)).toEqual({ intent: "property", requestType: "financing" });
  });

  it("keeps a request type when the enquiry has no listing attached", () => {
    // 8 financing and 15 deeper_analysis rows have no property.
    expect(leadIntentAndRequest("financing", false)).toEqual({ intent: "general", requestType: "financing" });
  });

  it("maps the seller and agent pages", () => {
    expect(leadIntentAndRequest("seller", false)).toEqual({ intent: "sell", requestType: null });
    expect(leadIntentAndRequest("agent_profile", false)).toEqual({ intent: "agent", requestType: null });
  });

  it("treats an enquiry about a listing as a property enquiry", () => {
    expect(leadIntentAndRequest("property_detail", true)).toEqual({ intent: "property", requestType: null });
    expect(leadIntentAndRequest("direct", true)).toEqual({ intent: "property", requestType: null });
  });

  it("falls back to general for the marketing sources and anything new", () => {
    for (const source of ["direct", "organic_search", "blog", "google_ads", "website", "social", "other"]) {
      expect(leadIntentAndRequest(source, false)).toEqual({ intent: "general", requestType: null });
    }
    expect(leadIntentAndRequest("a_source_added_later", false)).toEqual({
      intent: "general",
      requestType: null,
    });
    expect(leadIntentAndRequest(null, false)).toEqual({ intent: "general", requestType: null });
  });
});

describe("oldLeadAction", () => {
  it("uses the action names the old site's webhook wrote", () => {
    expect(oldLeadAction("book_showing", true)).toBe("showing_requested");
    expect(oldLeadAction("deeper_analysis", true)).toBe("analysis_requested");
    expect(oldLeadAction("financing", false)).toBe("financing_requested");
    expect(oldLeadAction("property_detail", true)).toBe("property_contact_requested");
    expect(oldLeadAction("organic_search", false)).toBe("lead_created");
  });

  it("only ever returns an action Hot Leads and the reports count", () => {
    // These five names are SAVVY_WEB_EVENTS' lead actions in
    // server/webhookHandlers.ts. An action outside that set is invisible to
    // every reader of the timeline.
    const sources = [
      "book_showing", "deeper_analysis", "financing", "property_detail",
      "agent_profile", "seller", "direct", "organic_search", "blog",
      "google_ads", "website", "social", "other", "something_new", null,
    ];
    for (const source of sources) {
      for (const hasProperty of [true, false]) {
        expect(OLD_LEAD_ACTIONS).toContain(oldLeadAction(source, hasProperty));
      }
    }
  });
});

describe("leadSourceName", () => {
  it("reuses the mapping the live webhook already uses", () => {
    expect(leadSourceName("deeper_analysis", "property")).toBe("Deeper Analysis Request");
    expect(leadSourceName("financing", "property")).toBe("Financing Request");
    expect(leadSourceName("book_showing", "property")).toBe("Book a Showing");
    expect(leadSourceName("property_detail", "property")).toBe("Property Inquiry");
    expect(leadSourceName("agent_profile", "agent")).toBe("Agent Message");
    expect(leadSourceName("seller", "sell")).toBe("Seller Enquiry");
  });

  it("falls back by intent for the sources it does not know", () => {
    expect(leadSourceName("organic_search", "general")).toBe("General Inquiry");
    expect(leadSourceName("direct", "property")).toBe("Property Inquiry");
    expect(leadSourceName("google_ads", "sell")).toBe("Seller Enquiry");
  });
});

const leadRow = (over: Partial<Record<string, string>> = {}) => ({
  id: "44444444-4444-4444-8444-444444444444",
  created_at: "2026-05-01 10:00:00+00",
  updated_at: "2026-05-01 10:00:00+00",
  name: "Jo Smith",
  email: " Jo@Example.TEST ",
  phone: "555-0100",
  source: "deeper_analysis",
  status: "synced",
  budget_min: "null",
  budget_max: "null",
  timeline: "null",
  markets_of_interest: "",
  experience_level: "null",
  notes: "Requested deeper analysis",
  user_id: "55555555-5555-4555-8555-555555555555",
  agent_id: "66666666-6666-4666-8666-666666666666",
  agent_email: " Agent@Savvy.Test ",
  property_id: "OLD-A",
  property_address: "1 Test Way",
  property_city: "Testville",
  ...over,
});

describe("mapLeadRow", () => {
  it("maps a complete row", () => {
    const mapped = mapLeadRow(leadRow());
    expect(mapped.email).toBe("jo@example.test");
    expect(mapped.firstName).toBe("Jo");
    expect(mapped.lastName).toBe("Smith");
    expect(mapped.intent).toBe("property");
    expect(mapped.requestType).toBe("analysis");
    expect(mapped.action).toBe("analysis_requested");
    expect(mapped.leadSourceName).toBe("Deeper Analysis Request");
    expect(mapped.agentEmail).toBe("agent@savvy.test");
    expect(mapped.oldPropertyId).toBe("OLD-A");
    expect(mapped.createdAt?.toISOString()).toBe("2026-05-01T10:00:00.000Z");
  });

  it("reads the export's absent values as absent", () => {
    const mapped = mapLeadRow(leadRow({ phone: "null", notes: "null", property_id: "null", agent_email: "null" }));
    expect(mapped.phone).toBeNull();
    expect(mapped.message).toBeNull();
    expect(mapped.oldPropertyId).toBeNull();
    expect(mapped.agentEmail).toBeNull();
    // No listing attached, so it is no longer a property enquiry.
    expect(mapped.intent).toBe("general");
  });

  it("keeps a multi-line note", () => {
    const mapped = mapLeadRow(leadRow({ notes: "line one\nline two" }));
    expect(mapped.message).toBe("line one\nline two");
  });

  it("truncates a very long note", () => {
    expect(mapLeadRow(leadRow({ notes: "x".repeat(9000) })).message).toHaveLength(4000);
  });
});

describe("planLeads", () => {
  it("groups repeat enquiries into one person, oldest first", () => {
    const plan = planLeads([
      leadRow({ id: "b", created_at: "2026-05-02 10:00:00+00" }),
      leadRow({ id: "a", created_at: "2026-05-01 10:00:00+00" }),
      leadRow({ id: "c", created_at: "2026-05-03 10:00:00+00", email: "other@example.test" }),
    ]);
    expect(plan.people).toHaveLength(2);
    const jo = plan.people.find(person => person.email === "jo@example.test");
    expect(jo?.enquiries.map(entry => entry.oldId)).toEqual(["a", "b"]);
    expect(plan.totalEnquiries).toBe(3);
  });

  it("matches on the lowercased, trimmed email", () => {
    const plan = planLeads([
      leadRow({ id: "a", email: "Jo@Example.TEST" }),
      leadRow({ id: "b", email: " jo@example.test " }),
    ]);
    expect(plan.people).toHaveLength(1);
    expect(plan.people[0].enquiries).toHaveLength(2);
  });

  it("reports rows it cannot place rather than dropping them", () => {
    const plan = planLeads([
      leadRow({ id: "no-email", email: "null" }),
      leadRow({ id: "no-date", created_at: "null" }),
      leadRow({ id: "fine" }),
    ]);
    expect(plan.noEmail).toEqual(["no-email"]);
    expect(plan.noCreatedAt).toEqual(["no-date"]);
    expect(plan.totalEnquiries).toBe(1);
  });

  it("orders deterministically when two enquiries share a timestamp", () => {
    const first = planLeads([leadRow({ id: "b" }), leadRow({ id: "a" })]);
    const second = planLeads([leadRow({ id: "a" }), leadRow({ id: "b" })]);
    expect(first.people[0].enquiries.map(e => e.oldId)).toEqual(["a", "b"]);
    expect(second.people[0].enquiries.map(e => e.oldId)).toEqual(["a", "b"]);
  });
});

describe("leadAlreadyRecorded", () => {
  it("recognises an enquiry the old site already posted", () => {
    // The webhook wrote the old lead id to activity_log.details.leadId.
    const lead = mapLeadRow(leadRow({ id: "already-synced" }));
    expect(leadAlreadyRecorded(lead, new Set(["already-synced"]))).toBe(true);
    expect(leadAlreadyRecorded(lead, new Set(["a-different-lead"]))).toBe(false);
  });

  it("does not treat a row with no id as recorded", () => {
    const lead = mapLeadRow(leadRow({ id: "" }));
    expect(leadAlreadyRecorded(lead, new Set([""]))).toBe(false);
  });
});

describe("leadAttribution", () => {
  it("carries the old lead id, which is what a re-run matches on", () => {
    const attribution = leadAttribution(mapLeadRow(leadRow({ id: "lead-7" })));
    expect(attribution.oldLeadId).toBe("lead-7");
    expect(attribution.import).toBe("old-site-investor-import");
    expect(attribution.oldSource).toBe("deeper_analysis");
  });

  it("carries no personal detail", () => {
    const lead = mapLeadRow(leadRow());
    const attribution = leadAttribution(lead);
    const serialized = JSON.stringify(attribution);
    for (const value of [lead.email, lead.firstName, lead.lastName, lead.phone, lead.agentEmail]) {
      if (value) expect(serialized).not.toContain(value);
    }
  });
});

describe("decideLead", () => {
  const lead = mapLeadRow(leadRow({ id: "lead-1" }));

  it("creates a contact for someone SavvyOS does not have", () => {
    expect(decideLead(lead, undefined, new Set())).toEqual({ action: "create-contact", lead });
  });

  it("attaches a new enquiry to an existing contact", () => {
    expect(decideLead(lead, 42, new Set())).toEqual({ action: "attach", contactId: 42, lead });
  });

  it("does nothing for an enquiry already on the timeline", () => {
    expect(decideLead(lead, 42, new Set(["lead-1"]))).toEqual({
      action: "exists",
      contactId: 42,
      lead,
    });
  });

  it("is idempotent: a second run attaches nothing new", () => {
    const recorded = new Set<string>();
    const first = decideLead(lead, 42, recorded);
    expect(first.action).toBe("attach");
    recorded.add(lead.oldId);
    expect(decideLead(lead, 42, recorded).action).toBe("exists");
  });
});

// ─── Re-runnability across the whole plan ────────────────────────────────────

describe("re-running the import", () => {
  it("plans no writes the second time for investors", () => {
    const records = [investorRow({ id: "a", email: "a@example.test" })];
    const plan = planInvestors(records);
    const investor = plan.importable[0];

    const firstRun = decideInvestor(investor, undefined);
    expect(firstRun.action).toBe("create");

    // What the row looks like after the first run wrote it.
    const written = {
      id: 1,
      email: investor.email,
      firstName: investor.firstName,
      lastName: investor.lastName,
      phone: investor.phone,
      emailVerifiedAt: investor.emailVerifiedAt,
      passwordHash: investor.passwordHash,
    };
    expect(decideInvestor(plan.importable[0], written).action).toBe("exists");
    // And a third run, from a freshly parsed plan.
    expect(decideInvestor(planInvestors(records).importable[0], written).action).toBe("exists");
  });

  it("plans no writes the second time for leads, saves and preferences", () => {
    const leadPlan = planLeads([leadRow({ id: "lead-1" })]);
    const lead = leadPlan.people[0].enquiries[0];
    expect(decideLead(lead, undefined, new Set()).action).toBe("create-contact");
    expect(decideLead(lead, 1, new Set(["lead-1"])).action).toBe("exists");

    const index = buildOldPropertyIndex([
      { propertyId: 100, slug: "cabin", importedData: { oldId: "OLD-A" } },
    ]);
    const saved = mapSavedPropertyRow({ user_id: "u", property_id: "OLD-A", property_slug: "cabin", saved_at: "null" });
    expect(decideSavedProperty(saved, 1, index, new Set()).action).toBe("create");
    expect(decideSavedProperty(saved, 1, index, new Set(["1:100"])).action).toBe("exists");

    const prefs = mapPreferencesRow(preferencesRow());
    const markets = { ids: [1], unmatched: [] as string[] };
    expect(decidePreferences(prefs, 1, false, markets).action).toBe("create");
    expect(decidePreferences(prefs, 1, true, markets).action).toBe("exists");
  });
});
