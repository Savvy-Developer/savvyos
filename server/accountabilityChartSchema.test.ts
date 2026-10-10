import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("server/accountabilityChartSchema.ts", "utf8");
const migration = readFileSync("drizzle/20261010_accountability_chart.sql", "utf8");
const entrypoint = readFileSync("server/_core/index.ts", "utf8");

describe("accountability chart schema compatibility", () => {
  it("keeps the committed migration and startup guard aligned", () => {
    for (const table of ["accountability_seats", "accountability_seat_holders"]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS \`${table}\``);
      expect(source).toContain("CREATE TABLE IF NOT EXISTS \\`" + table + "\\`");
    }
    for (const requiredFragment of ["`seatId`", "rr_seat_status_idx", "rr_seat_fk"]) {
      expect(migration).toContain(requiredFragment);
      expect(source).toContain(requiredFragment);
    }
  });

  it("prepares the additive schema before the server accepts traffic", () => {
    expect(entrypoint).toContain("await ensureAccountabilityChartSchema();");
  });
});
