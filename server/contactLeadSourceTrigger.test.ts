import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  CONTACT_LEAD_SOURCE_TRIGGER,
  CONTACT_LEAD_SOURCE_UPDATE_SESSION_VARIABLE,
  createContactLeadSourceTriggerSql,
} from "./contactLeadSourceTrigger";

const source = (file: string) =>
  readFileSync(path.resolve(import.meta.dirname, file), "utf8");

describe("contact lead-source database guard", () => {
  it("preserves raw-write protection while allowing an explicit transaction flag", () => {
    expect(createContactLeadSourceTriggerSql).toContain(
      `CREATE TRIGGER \`${CONTACT_LEAD_SOURCE_TRIGGER}\``
    );
    expect(createContactLeadSourceTriggerSql).toContain(
      `@${CONTACT_LEAD_SOURCE_UPDATE_SESSION_VARIABLE}`
    );
    expect(createContactLeadSourceTriggerSql).toContain("NEW.`leadSourceId`");
    expect(createContactLeadSourceTriggerSql).toContain("OLD.`leadSourceId`");
  });

  it("uses the same guarded trigger in the committed migration", () => {
    const migration = source(
      "../drizzle/20260924_contact_lead_source_correction_trigger.sql"
    );

    expect(migration).toContain(
      `DROP TRIGGER IF EXISTS \`${CONTACT_LEAD_SOURCE_TRIGGER}\``
    );
    expect(migration).toContain(
      `@${CONTACT_LEAD_SOURCE_UPDATE_SESSION_VARIABLE}`
    );
  });

  it("sets and clears the connection-scoped flag around the authorized contact write", () => {
    const db = source("db.ts");

    expect(db).toContain("await db.transaction(async (tx) => {");
    expect(db).toContain("CONTACT_LEAD_SOURCE_UPDATE_SESSION_VARIABLE} = 1");
    expect(db).toContain("CONTACT_LEAD_SOURCE_UPDATE_SESSION_VARIABLE} = 0");
    expect(db).toMatch(
      /CONTACT_LEAD_SOURCE_UPDATE_SESSION_VARIABLE} = 1[\s\S]*try \{[\s\S]*tx\.update\(contacts\)[\s\S]*finally \{[\s\S]*CONTACT_LEAD_SOURCE_UPDATE_SESSION_VARIABLE} = 0/
    );
  });

  it("repairs the trigger before the production server accepts traffic", () => {
    const core = source("_core/index.ts");

    expect(core).toContain(
      'import { ensureContactLeadSourceTrigger } from "../contactLeadSourceTrigger";'
    );
    expect(core).toContain("await ensureContactLeadSourceTrigger();");
  });
});
