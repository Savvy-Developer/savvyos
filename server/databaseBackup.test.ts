/**
 * Nightly database backup (security audit, finding 04): when it runs, where
 * it writes, and that the SQL it writes gives back exactly what was stored.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BACKUP_COMPLETE_MARKER,
  DATABASE_BACKUP_RUNS_DDL,
  MAX_ATTEMPTS_PER_DAY,
  backupDue,
  backupObjectKey,
  countFailedToday,
  databaseBackupConfig,
  dumpSql,
  easternClock,
  emptyDumpStats,
  insertableColumnNames,
  normalizeBackupPrefix,
  partWriter,
  sqlLiteral,
  stripDefiner,
  type DumpSource,
} from "./databaseBackup";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");

const READY = {
  DATABASE_URL: "mysql://app:pw@db.internal:3306/railway",
  DATABASE_BACKUP_S3_BUCKET: "savvy-db-backups",
  DATABASE_BACKUP_AWS_ACCESS_KEY_ID: "AKIABACKUPONLY",
  DATABASE_BACKUP_AWS_SECRET_ACCESS_KEY: "backup-secret",
  AWS_BUCKET_NAME: "savvyos",
  AWS_ACCESS_KEY_ID: "AKIAAPPKEY",
} as NodeJS.ProcessEnv;

describe("settings", () => {
  it("is off until the bucket and its own keys are set, and says what is missing", () => {
    const config = databaseBackupConfig({ DATABASE_URL: "mysql://x" } as NodeJS.ProcessEnv);
    expect(config.enabled).toBe(false);
    if (!config.enabled) {
      expect(config.reason).toContain("DATABASE_BACKUP_S3_BUCKET");
      expect(config.reason).toContain("DATABASE_BACKUP_AWS_SECRET_ACCESS_KEY");
    }
  });

  it("turns on with defaults: 3 AM Eastern, us-east-2, savvyos-mysql/", () => {
    const config = databaseBackupConfig(READY);
    expect(config.enabled).toBe(true);
    if (config.enabled) {
      expect(config.hourEastern).toBe(3);
      expect(config.region).toBe("us-east-2");
      expect(config.prefix).toBe("savvyos-mysql/");
      expect(config.databaseUrl).toBe(READY.DATABASE_URL);
      expect(config.alertEmails).toEqual([]);
    }
  });

  it("reads the hour, alert emails and an optional read-only database user", () => {
    const config = databaseBackupConfig({
      ...READY,
      DATABASE_BACKUP_HOUR_ET: "4",
      DATABASE_BACKUP_ALERT_EMAILS: "dhruv@savvy.realty, tyler@savvy.realty; not-an-email",
      DATABASE_BACKUP_DATABASE_URL: "mysql://reader:pw@db.internal:3306/railway",
    });
    expect(config.enabled).toBe(true);
    if (config.enabled) {
      expect(config.hourEastern).toBe(4);
      expect(config.alertEmails).toEqual(["dhruv@savvy.realty", "tyler@savvy.realty"]);
      expect(config.databaseUrl).toBe("mysql://reader:pw@db.internal:3306/railway");
    }
    const bad = databaseBackupConfig({ ...READY, DATABASE_BACKUP_HOUR_ET: "25" });
    expect(bad.enabled && bad.hourEastern).toBe(3);
  });

  it("refuses the app's own bucket or the app's own keys", () => {
    expect(databaseBackupConfig({ ...READY, DATABASE_BACKUP_S3_BUCKET: "savvyos" }).enabled).toBe(false);
    expect(databaseBackupConfig({ ...READY, DATABASE_BACKUP_S3_BUCKET: "SavvyOS" }).enabled).toBe(false);
    expect(databaseBackupConfig({ ...READY, MLS_MEDIA_BUCKET: "savvy-db-backups" }).enabled).toBe(false);
    expect(databaseBackupConfig({ ...READY, DATABASE_BACKUP_AWS_ACCESS_KEY_ID: "AKIAAPPKEY" }).enabled).toBe(false);
  });

  it("reads the tables to back up without rows, ignoring odd names", () => {
    const config = databaseBackupConfig({ ...READY, DATABASE_BACKUP_SKIP_TABLES: "audit_log, email_bodies;bad-name audit_log" });
    expect(config.enabled && config.skipTables).toEqual(["audit_log", "email_bodies"]);
  });

  it("DATABASE_BACKUP=off stops it", () => {
    const config = databaseBackupConfig({ ...READY, DATABASE_BACKUP: "off" });
    expect(config.enabled).toBe(false);
  });

  it("tidies the folder prefix", () => {
    expect(normalizeBackupPrefix("/nightly")).toBe("nightly/");
    expect(normalizeBackupPrefix("a/b/")).toBe("a/b/");
    expect(normalizeBackupPrefix("  ")).toBe("");
    expect(normalizeBackupPrefix(undefined)).toBe("savvyos-mysql/");
  });
});

describe("when it runs", () => {
  it("reads Eastern time in summer and winter", () => {
    expect(easternClock(new Date("2026-10-09T07:30:00Z"))).toEqual({ day: "2026-10-09", hour: 3 });
    expect(easternClock(new Date("2026-12-01T08:10:00Z"))).toEqual({ day: "2026-12-01", hour: 3 });
    expect(easternClock(new Date("2026-10-09T03:59:00Z"))).toEqual({ day: "2026-10-08", hour: 23 });
  });

  const at3am = new Date("2026-10-09T07:05:00Z");
  it("is due once a day from the chosen hour", () => {
    expect(backupDue({ now: at3am, hourEastern: 3, lastSuccessAt: null, failedStartsToday: 0 }).due).toBe(true);
    expect(
      backupDue({ now: at3am, hourEastern: 3, lastSuccessAt: new Date("2026-10-08T07:10:00Z"), failedStartsToday: 0 }).due
    ).toBe(true);
    expect(
      backupDue({ now: at3am, hourEastern: 3, lastSuccessAt: new Date("2026-10-09T07:01:00Z"), failedStartsToday: 0 }).due
    ).toBe(false);
  });

  it("waits for the hour, and catches up later in the day if the server was down", () => {
    expect(backupDue({ now: new Date("2026-10-09T05:00:00Z"), hourEastern: 3, lastSuccessAt: null, failedStartsToday: 0 }).due).toBe(false);
    expect(backupDue({ now: new Date("2026-10-09T18:00:00Z"), hourEastern: 3, lastSuccessAt: null, failedStartsToday: 0 }).due).toBe(true);
  });

  it(`stops for the day after ${MAX_ATTEMPTS_PER_DAY} failures`, () => {
    expect(backupDue({ now: at3am, hourEastern: 3, lastSuccessAt: null, failedStartsToday: 2 }).due).toBe(true);
    expect(backupDue({ now: at3am, hourEastern: 3, lastSuccessAt: null, failedStartsToday: 3 }).due).toBe(false);
  });

  it("counts only today's failures (Eastern)", () => {
    const runs = [
      { status: "failed", startedAt: new Date("2026-10-09T07:00:00Z") },
      { status: "failed", startedAt: new Date("2026-10-09T03:00:00Z") }, // 8 Oct, 11 PM Eastern
      { status: "succeeded", startedAt: new Date("2026-10-09T07:20:00Z") },
      { status: "running", startedAt: new Date("2026-10-09T07:40:00Z") },
    ];
    expect(countFailedToday(runs, at3am)).toBe(1);
  });

  it("names each file by its UTC time, in a year/month folder", () => {
    expect(backupObjectKey("savvyos-mysql/", new Date("2026-10-09T07:00:05.123Z"))).toBe(
      "savvyos-mysql/2026/10/savvyos-2026-10-09T07-00-05Z.sql.gz"
    );
  });
});

/** Reads the values back out of one "(...)" tuple the way MySQL would. */
function parseTuple(text: string): unknown[] {
  const values: unknown[] = [];
  let index = 0;
  const unescape: Record<string, string> = { "0": "\0", b: "\b", t: "\t", n: "\n", r: "\r", Z: "\x1a", "'": "'", '"': '"', "\\": "\\" };
  if (text[index++] !== "(") throw new Error("no (");
  while (index < text.length) {
    if (text.startsWith("NULL", index)) {
      values.push(null);
      index += 4;
    } else if (text.startsWith("X'", index)) {
      const end = text.indexOf("'", index + 2);
      values.push(Buffer.from(text.slice(index + 2, end), "hex"));
      index = end + 1;
    } else if (text[index] === "'") {
      let out = "";
      index += 1;
      while (text[index] !== "'") {
        if (text[index] === "\\") {
          out += unescape[text[index + 1]];
          index += 2;
        } else {
          out += text[index];
          index += 1;
        }
      }
      values.push(out);
      index += 1;
    } else {
      const match = /^-?[0-9.eE+]+/.exec(text.slice(index));
      if (!match) throw new Error(`cannot read at ${index}: ${text.slice(index, index + 20)}`);
      values.push(Number(match[0]));
      index += match[0].length;
    }
    if (text[index] === ",") index += 1;
    else if (text[index] === ")") return values;
    else throw new Error(`unexpected ${text[index]} at ${index}`);
  }
  throw new Error("no )");
}

describe("SQL values", () => {
  it("writes every kind of stored value so it reads back the same", () => {
    const tricky = [
      null,
      42,
      -1.5,
      "plain",
      "O'Brien said \"hi\"",
      "C:\\Users\\DELL\\path",
      "line one\nline two\r\n\ttabbed",
      "nul\0byte and ctrl-z\x1a",
      "emoji 🏡 and accents é",
      '{"beds":3,"notes":"a\\"b"}',
      "2026-10-09 07:00:00",
      "0000-00-00 00:00:00",
      "18446744073709551615",
      Buffer.from([0, 1, 2, 255]),
    ];
    const tuple = "(" + tricky.map(sqlLiteral).join(",") + ")";
    expect(parseTuple(tuple)).toEqual(tricky);
  });

  it("handles the rare types", () => {
    expect(sqlLiteral(undefined)).toBe("NULL");
    expect(sqlLiteral(Number.NaN)).toBe("NULL");
    expect(sqlLiteral(12n)).toBe("12");
    expect(sqlLiteral(true)).toBe("1");
    expect(sqlLiteral(Buffer.alloc(0))).toBe("''");
    expect(sqlLiteral(new Date("2026-10-09T07:00:05.120Z"))).toBe("'2026-10-09 07:00:05.120'");
    expect(sqlLiteral({ a: 1 })).toBe(`'{\\"a\\":1}'`);
  });

  it("never writes generated columns (but keeps DEFAULT CURRENT_TIMESTAMP ones)", () => {
    expect(
      insertableColumnNames([
        { name: "id", extra: "auto_increment" },
        { name: "createdAt", extra: "DEFAULT_GENERATED" },
        { name: "updatedAt", extra: "DEFAULT_GENERATED on update CURRENT_TIMESTAMP" },
        { name: "fullName", extra: "VIRTUAL GENERATED" },
        { name: "slugKey", extra: "STORED GENERATED" },
        { name: "notes", extra: null },
      ])
    ).toEqual(["id", "createdAt", "updatedAt", "notes"]);
  });

  it("drops the DEFINER so views and triggers restore under any user", () => {
    expect(
      stripDefiner("CREATE DEFINER=`root`@`%` TRIGGER `t` BEFORE UPDATE ON `contacts` FOR EACH ROW SET NEW.a = 1")
    ).toBe("CREATE TRIGGER `t` BEFORE UPDATE ON `contacts` FOR EACH ROW SET NEW.a = 1");
    expect(
      stripDefiner("CREATE ALGORITHM=UNDEFINED DEFINER=`app`@`10.0.0.%` SQL SECURITY DEFINER VIEW `v` AS select 1")
    ).toBe("CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `v` AS select 1");
  });
});

function fakeSource(): DumpSource {
  const data: Record<string, unknown[][]> = {
    users: [
      [1, "Tyler", "2026-01-01 00:00:00"],
      [2, "O'Neil", null],
      [3, "Dhruv", "2026-10-09 07:00:00"],
    ],
    empty_table: [],
  };
  return {
    serverVersion: async () => "8.0.36",
    tables: async () => [
      { name: "users", type: "BASE TABLE" },
      { name: "active_users", type: "VIEW" },
      { name: "empty_table", type: "BASE TABLE" },
    ],
    createTable: async name => `CREATE TABLE \`${name}\` (\n  \`id\` int NOT NULL\n)`,
    createView: async name => `CREATE ALGORITHM=UNDEFINED DEFINER=\`root\`@\`%\` SQL SECURITY DEFINER VIEW \`${name}\` AS select 1`,
    insertableColumns: async name => (name === "users" ? ["id", "name", "createdAt"] : ["id"]),
    rows: (name: string) =>
      (async function* () {
        for (const row of data[name] ?? []) yield row;
      })(),
    triggers: async () => [
      {
        name: "contacts_preserve_lead_source",
        statement: "CREATE DEFINER=`root`@`%` TRIGGER `contacts_preserve_lead_source` BEFORE UPDATE ON `contacts` FOR EACH ROW SET NEW.`leadSourceId` = OLD.`leadSourceId`",
      },
    ],
  };
}

async function collect(source: DumpSource, batchRows?: number) {
  const stats = emptyDumpStats();
  let text = "";
  for await (const piece of dumpSql(source, stats, { now: new Date("2026-10-09T07:00:00Z"), batchRows })) text += piece;
  return { text, stats };
}

describe("the backup file", () => {
  it("sets up the restore session and never drops a table", async () => {
    const { text } = await collect(fakeSource());
    expect(text).toContain("SET NAMES utf8mb4;");
    expect(text).toContain("SET time_zone = '+00:00';");
    expect(text).toContain("SET FOREIGN_KEY_CHECKS = 0;");
    expect(text).toContain("SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';");
    expect(text).not.toContain("DROP TABLE");
    expect(text).not.toContain("USE ");
  });

  it("writes each table and its rows, then views, then triggers, then the end marker", async () => {
    const { text, stats } = await collect(fakeSource());
    expect(text).toContain("CREATE TABLE `users`");
    expect(text).toContain("INSERT INTO `users` (`id`,`name`,`createdAt`) VALUES\n(1,'Tyler','2026-01-01 00:00:00'),\n(2,'O\\'Neil',NULL),\n(3,'Dhruv','2026-10-09 07:00:00');");
    expect(text).toContain("CREATE TABLE `empty_table`");
    expect(text).not.toContain("INSERT INTO `empty_table`");
    expect(text).toContain("CREATE ALGORITHM=UNDEFINED SQL SECURITY DEFINER VIEW `active_users` AS select 1;");
    expect(text).toContain("DELIMITER ;;\nCREATE TRIGGER `contacts_preserve_lead_source` BEFORE UPDATE ON `contacts`");
    expect(text).toContain(";;\nDELIMITER ;");
    expect(text.indexOf("CREATE TABLE `users`")).toBeLessThan(text.indexOf("VIEW `active_users`"));
    expect(text.indexOf("VIEW `active_users`")).toBeLessThan(text.indexOf("CREATE TRIGGER"));
    expect(text.trim().endsWith(`${BACKUP_COMPLETE_MARKER}: 2 tables, 1 views, 1 triggers, 3 rows`)).toBe(true);
    expect(stats.rowsByTable).toEqual({ empty_table: 0, users: 3 });
  });

  it("writes a skipped table's structure but not its rows", async () => {
    const stats = emptyDumpStats();
    let text = "";
    for await (const piece of dumpSql(fakeSource(), stats, { now: new Date("2026-10-09T07:00:00Z"), skipRowsOf: ["users"] })) text += piece;
    expect(text).toContain("CREATE TABLE `users`");
    expect(text).not.toContain("INSERT INTO `users`");
    expect(text).toContain("-- `users`: rows not included (DATABASE_BACKUP_SKIP_TABLES)");
    expect(stats.skippedTables).toEqual(["users"]);
  });

  it("splits big tables into several INSERTs", async () => {
    const { text } = await collect(fakeSource(), 2);
    expect(text.split("INSERT INTO `users`").length - 1).toBe(2);
  });
});

describe("streaming upload in parts", () => {
  async function writeAll(chunks: Buffer[], partSize: number) {
    const parts: Array<{ number: number; body: Buffer }> = [];
    const writer = partWriter({
      partSize,
      uploadPart: async (number, body) => {
        parts.push({ number, body });
      },
    });
    await new Promise<void>((resolve, reject) => {
      writer.writable.on("error", reject);
      writer.writable.on("finish", () => resolve());
      for (const chunk of chunks) writer.writable.write(chunk);
      writer.writable.end();
    });
    return { parts, result: writer.result() };
  }

  it("cuts the stream into equal parts plus a last smaller one, in order, losing nothing", async () => {
    const data = Buffer.from(Array.from({ length: 2500 }, (_, index) => index % 251));
    const chunks = [data.subarray(0, 7), data.subarray(7, 1100), data.subarray(1100, 1101), data.subarray(1101)];
    const { parts, result } = await writeAll(chunks, 1000);
    expect(parts.map(part => part.number)).toEqual([1, 2, 3]);
    expect(parts.map(part => part.body.length)).toEqual([1000, 1000, 500]);
    expect(Buffer.concat(parts.map(part => part.body)).equals(data)).toBe(true);
    expect(result.bytes).toBe(2500);
    expect(result.parts).toBe(3);
    const { createHash } = await import("node:crypto");
    expect(result.sha256).toBe(createHash("sha256").update(data).digest("hex"));
  });

  it("sends a small file as one part", async () => {
    const { parts } = await writeAll([Buffer.from("tiny")], 1000);
    expect(parts.length).toBe(1);
    expect(parts[0].body.toString()).toBe("tiny");
  });
});

describe("safety and wiring", () => {
  const source = read("server/databaseBackup.ts");
  const index = read("server/_core/index.ts");
  const worker = read("server/databaseBackupWorker.ts");

  it("never deletes backups (the bucket's lifecycle rule does that)", () => {
    expect(source).not.toContain("DeleteObject");
    expect(source).not.toContain("DROP TABLE IF EXISTS");
  });

  it("takes one consistent snapshot, one server at a time, and checksums every part", () => {
    expect(source).toContain("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
    expect(source).toContain('"SELECT GET_LOCK(?, 0) AS got"');
    expect(source).toContain('ChecksumAlgorithm: "SHA256"');
    expect(source).toContain("ChecksumSHA256: checksum");
    expect(source).toContain("AbortMultipartUploadCommand");
    expect(source).toContain(".manifest.json");
    expect(source).not.toContain("tmpdir");
  });

  it("creates its run table at startup but never runs in the web server", () => {
    expect(DATABASE_BACKUP_RUNS_DDL).toContain("CREATE TABLE IF NOT EXISTS `database_backup_runs`");
    expect(index).toContain("await ensureDatabaseBackupSchema();");
    expect(index).not.toContain("scheduleDatabaseBackup");
    expect(index).not.toContain("runDatabaseBackup");
  });

  it("runs in its own worker service, which answers the health check", () => {
    expect(worker).toContain("scheduleDatabaseBackup();");
    expect(worker).toContain('"/healthz"');
    expect(read("package.json")).toContain("--outfile=dist/databaseBackupWorker.js");
  });
});
