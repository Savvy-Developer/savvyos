import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const router = readFileSync(path.join(root, "server/routers/pm.ts"), "utf8");
const selector = readFileSync(
  path.join(root, "client/src/components/RockMeetingRoutingSelector.tsx"),
  "utf8"
);

const routingAccess = router.slice(
  router.indexOf("async function assertAuthorisedRockRouting"),
  router.indexOf("const FULL_PROJECT_VISIBILITY_EMAILS")
);
const routingOptions = router.slice(
  router.indexOf("routingOptions: protectedProcedure"),
  router.indexOf("create: protectedProcedure")
);
const updateProject = router.slice(
  router.indexOf("update: protectedProcedure"),
  router.indexOf("archive: protectedProcedure")
);

describe("Project Rock meeting routing access", () => {
  it("lets an active meeting member discover their own active Pulse meetings without L10 administration", () => {
    expect(routingOptions).toContain("visible_meeting_ids(db, ctx.user.id)");
    expect(routingOptions).toContain("eq(pulseMeetings.isActive, true)");
    expect(routingOptions).toContain("isNull(pulseMeetings.deletedAt)");
    expect(routingOptions).not.toContain("hasPulseCapability");
    expect(routingAccess).toContain("visible_meeting_ids(db, user.id)");
    expect(routingAccess).not.toContain("manage_l10s");
  });

  it("keeps Project access and active meeting membership enforced on the server", () => {
    expect(updateProject).toContain(
      "await assertProjectAccess(db, input.id, ctx.user)"
    );
    expect(updateProject).toContain(
      "await assertAuthorisedRockRouting(db, ctx.user, input.routedMeetingIds)"
    );
    expect(
      updateProject.indexOf("await assertProjectAccess(db, input.id, ctx.user)")
    ).toBeLessThan(
      updateProject.indexOf(
        "await assertAuthorisedRockRouting(db, ctx.user, input.routedMeetingIds)"
      )
    );
    expect(routingAccess).toContain("!visibleMeetingIds.includes(meetingId)");
  });

  it("does not imply that L10 management permission is required", () => {
    expect(selector).toContain(
      "You can route this Rock to any active meeting you belong to."
    );
    expect(selector).not.toContain("access to manage an L10");
  });
});
