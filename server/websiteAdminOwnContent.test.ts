import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Admins without Website Studio permissions can still post their own work,
 * like an agent: their own listings, case studies, blog posts and profile.
 * Before this, an admin who also lists homes could not publish their own
 * listing unless they were given every property on the site.
 */
const read = (file: string) =>
  readFileSync(path.resolve(import.meta.dirname, file), "utf8").replace(/\r\n/g, "\n");
const website = read("routers/website.ts");
const layout = read("../client/src/components/AppLayout.tsx");

function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to === -1 ? undefined : to);
}

describe("admins posting their own content", () => {
  it("falls back to ownership for admins without the property permission", () => {
    const helper = between(website, "export async function propertyWebsiteAccess(", "\n}\n");
    expect(helper).toContain('canAdminUsePermission(user, "canManageWebsiteProperties")');
    expect(helper).toContain('(user.role === "agent" || user.role === "admin") && (await agentOwnsProperty(db, user.id, propertyId))');
    expect(helper).toContain("user.isActive === false");
  });

  it("uses that one rule for publishing, the Website tab and the publish state", () => {
    const gate = between(website, "async function requirePropertyPublishAccess(", "\n}\n");
    expect(gate).toContain("propertyWebsiteAccess(ctx, db, propertyId)");
    expect(between(website, "  propertyWebsiteContent: protectedProcedure", "\n  savePropertyWebsiteContent:")).toContain(
      "propertyWebsiteAccess(ctx, db, input.propertyId)"
    );
    expect(between(website, "  propertyPublishState: protectedProcedure", "\n  agentPublishState:")).toContain(
      "propertyWebsiteAccess(ctx, db, input.propertyId)"
    );
  });

  it("credits the owner, not nobody, on a listing they publish themselves", () => {
    expect(website).toContain('const assignedAgentId = access === "owner" ? ctx.user.id : null;');
    expect(website).toContain('input.assignedAgentId ?? (access === "owner" ? ctx.user.id : null)');
  });

  it("lets everyone edit their own website profile", () => {
    const gate = between(website, "async function requireAgentProfileAccess(", "\n}\n");
    expect(gate.indexOf("if (ctx.user?.id === userId) return;")).toBeLessThan(gate.indexOf('ctx.user?.role === "admin"'));
  });

  it("shows My Case Studies and My Blog Posts in the admin sidebar", () => {
    const adminNav = between(layout, "function buildAdminNav(", "\nfunction ");
    expect(adminNav).toContain('path: "/my-website/case-studies"');
    expect(adminNav).toContain('path: "/my-website/blog"');
  });
});
