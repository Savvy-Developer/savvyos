import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const webinarPage = readFileSync(
  path.join(root, "client/src/pages/WebinarsAdminPage.tsx"),
  "utf8"
);
const webinarRouter = readFileSync(
  path.join(root, "server/routers/webinars.ts"),
  "utf8"
);
const serverEntry = readFileSync(
  path.join(root, "server/_core/index.ts"),
  "utf8"
);
const schemaGuard = readFileSync(
  path.join(root, "server/webinarRequestSchema.ts"),
  "utf8"
);

describe("webinar request workflow", () => {
  it("requires the complete marketing intake before submission", () => {
    expect(webinarPage).toContain("Webinar title *");
    expect(webinarPage).toContain("Description / details *");
    expect(webinarPage).toContain("Partner or guest information *");
    expect(webinarPage).toContain("Guest bios *");
    expect(webinarPage).toContain("Guest headshots *");
    expect(webinarPage).toContain("disabled={!ready || busy}");
    expect(webinarRouter).toContain("Upload at least one guest headshot.");
    expect(webinarRouter).toContain("partnerGuestInfo: z.string().trim().min(1)");
    expect(webinarRouter).toContain("guestBios: z.string().trim().min(1)");
  });

  it("enforces the two-week lead time in both the browser and server", () => {
    expect(webinarPage).toContain("Webinars require at least two weeks of lead time");
    expect(webinarRouter).toContain("hasMinimumWebinarLeadTime");
    expect(webinarRouter).toContain("WEBINAR_LEAD_TIME_DAYS = 14");
  });

  it("preserves the selected webinar timezone in input, storage, and display", () => {
    expect(webinarPage).toContain("WEBINAR_TIMEZONES");
    expect(webinarPage).toContain("formatWebinarDateTime");
    expect(webinarPage).toContain("formatWebinarTime");
    expect(webinarRouter).toContain("webinarDateTimeToUtc");
    expect(webinarRouter).toContain("formatWebinarDateTime(startTime, input.timezone");
  });

  it("makes the webinar request schema ready before production traffic", () => {
    expect(serverEntry).toContain("ensureWebinarRequestSchema");
    expect(serverEntry).toContain("await ensureWebinarRequestSchema()");
    expect(schemaGuard).toContain("partnerGuestInfo");
    expect(schemaGuard).toContain("guestBios");
    expect(schemaGuard).toContain("CREATE TABLE IF NOT EXISTS");
    expect(schemaGuard).toContain("webinar_guest_headshots");
  });
});
