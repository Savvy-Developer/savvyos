import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BROADCAST_ONLY_AUDIENCES,
  isBroadcastOnlyAudience,
  normalizedAudienceContactIds,
  normalizedAudienceTags,
} from "./oneTimeSendAudience";
import { oneTimeSendInput } from "./routers/smartPlans";
import { oneTimeSends, smartPlans } from "../drizzle/schema";

const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(path.join(repoRoot, relative), "utf8");

const EMAIL = {
  name: "Spring update",
  channel: "email" as const,
  subject: "Spring update",
  body: "Hello",
};

describe("normalizedAudienceTags", () => {
  it("trims, because tags are typed by hand on the contact form", () => {
    expect(normalizedAudienceTags([" VIP ", "Investor"])).toEqual(["VIP", "Investor"]);
  });

  it("drops blanks and de-duplicates, keeping the order they were chosen in", () => {
    expect(normalizedAudienceTags(["VIP", "", "  ", "VIP", "Investor"])).toEqual([
      "VIP",
      "Investor",
    ]);
  });

  /**
   * Two spellings of one tag collapse into one entry, so the contact carrying
   * it is matched once rather than counted twice in the audience.
   */
  it("collapses two spellings of the same tag", () => {
    expect(normalizedAudienceTags(["VIP", " VIP"])).toEqual(["VIP"]);
  });

  it("treats a missing list as no tags", () => {
    expect(normalizedAudienceTags(null)).toEqual([]);
    expect(normalizedAudienceTags(undefined)).toEqual([]);
  });
});

describe("normalizedAudienceContactIds", () => {
  it("de-duplicates, so nobody picked twice is messaged twice", () => {
    expect(normalizedAudienceContactIds([7, 7, 9])).toEqual([7, 9]);
  });

  it("keeps the order the contacts were picked in", () => {
    expect(normalizedAudienceContactIds([9, 3, 7])).toEqual([9, 3, 7]);
  });

  it("drops ids that cannot be a contact", () => {
    expect(normalizedAudienceContactIds([0, -1, 1.5, Number.NaN, 4])).toEqual([4]);
  });
});

describe("isBroadcastOnlyAudience", () => {
  it("names the two audiences that are not Smart Plan triggers", () => {
    expect(BROADCAST_ONLY_AUDIENCES).toEqual(["tag", "manual_contacts"]);
    expect(isBroadcastOnlyAudience("tag")).toBe(true);
    expect(isBroadcastOnlyAudience("manual_contacts")).toBe(true);
    expect(isBroadcastOnlyAudience("lead_source")).toBe(false);
  });
});

describe("the One Time Send composer input", () => {
  it("accepts a tag audience", () => {
    const parsed = oneTimeSendInput.safeParse({
      ...EMAIL,
      triggerType: "tag",
      triggerTags: ["VIP"],
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a tag audience with no tags", () => {
    const parsed = oneTimeSendInput.safeParse({ ...EMAIL, triggerType: "tag" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some(issue => issue.message === "Choose at least one tag.")).toBe(
      true,
    );
  });

  /**
   * A list of blanks passes a plain length check and matches nobody, so the
   * refusal is measured after normalization rather than on the raw array.
   */
  it("refuses a tag audience whose tags are all blank", () => {
    const parsed = oneTimeSendInput.safeParse({
      ...EMAIL,
      triggerType: "tag",
      triggerTags: ["  "],
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a hand-picked audience, and refuses an empty one", () => {
    expect(
      oneTimeSendInput.safeParse({
        ...EMAIL,
        triggerType: "manual_contacts",
        triggerContactIds: [4, 9],
      }).success,
    ).toBe(true);
    const empty = oneTimeSendInput.safeParse({
      ...EMAIL,
      triggerType: "manual_contacts",
      triggerContactIds: [],
    });
    expect(empty.success).toBe(false);
    expect(
      empty.error?.issues.some(issue => issue.message === "Choose at least one contact."),
    ).toBe(true);
  });

  /**
   * Date added filters read contacts.createdAt and mean nothing for a list
   * somebody picked by hand; the existing guard already says so, and this
   * pins that the two new audiences are on the excluded side of it.
   */
  it("refuses a date added filter on the two new audiences", () => {
    for (const triggerType of ["tag", "manual_contacts"] as const) {
      const parsed = oneTimeSendInput.safeParse({
        ...EMAIL,
        triggerType,
        triggerTags: ["VIP"],
        triggerContactIds: [4],
        dateAddedFrom: "2026-01-01",
      });
      expect(parsed.success).toBe(false);
    }
  });

  it("still accepts the Smart Plan audiences it accepted before", () => {
    expect(
      oneTimeSendInput.safeParse({
        ...EMAIL,
        triggerType: "lead_source",
        triggerLeadSourceIds: [1],
        dateAddedFrom: "2026-01-01",
      }).success,
    ).toBe(true);
  });
});

/**
 * triggerType is a MySQL enum on both tables and Railway does not run the
 * files in drizzle/. A value the code sends that the column does not hold is
 * rejected at write time, in production, on the first send somebody tries.
 */
describe("the audiences the database will accept", () => {
  const oneTimeEnumValues = (oneTimeSends.triggerType as any).enumValues as string[];

  it("is widened on one_time_sends", () => {
    for (const audience of BROADCAST_ONLY_AUDIENCES) {
      expect(oneTimeEnumValues).toContain(audience);
    }
  });

  it("is not widened on smart_plans, which cannot enrol a hand-picked list", () => {
    const planEnumValues = (smartPlans.triggerType as any).enumValues as string[];
    for (const audience of BROADCAST_ONLY_AUDIENCES) {
      expect(planEnumValues).not.toContain(audience);
    }
  });

  it("has a migration that lists every value the schema declares", () => {
    const migration = read("drizzle/20260921_one_time_send_tag_and_contact_audiences.sql");
    expect(migration).toContain("MODIFY COLUMN `triggerType`");
    for (const value of oneTimeEnumValues) {
      expect(migration).toContain(`'${value}'`);
    }
    // MODIFY rewrites the whole enum, so a value left out of the migration is
    // a value dropped from the column rather than one merely not added.
    const declared = Array.from(migration.matchAll(/'([a-z_]+)'/g)).map(match => match[1]);
    expect(new Set(declared)).toEqual(new Set(oneTimeEnumValues));
  });

  it("has a migration that adds the two columns the audiences are stored in", () => {
    const migration = read("drizzle/20260921_one_time_send_tag_and_contact_audiences.sql");
    expect(migration).toContain("`triggerTags` json");
    expect(migration).toContain("`triggerContactIds` json");
  });
});
