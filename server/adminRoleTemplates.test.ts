/**
 * Admin role templates and the permission manager lists (security audit,
 * finding 05).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  ADMIN_ROLE_TEMPLATES,
  ROLE_BASE_PERMISSIONS,
  applyRoleTemplate,
  closestRoleTemplate,
  templateGrants,
} from "@shared/adminRoleTemplates";
import { PAGE_PERMISSION_DEPENDENCIES } from "@shared/permissionDependencies";
import {
  adminCreatorEmails,
  isAdminCreatorEmail,
  isPermissionManagerEmail,
  permissionManagerEmails,
} from "./permissionManagers";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");
const permissionsSource = read("server/routers/permissions.ts");
const ALL_KEYS = Array.from(permissionsSource.matchAll(/\{ key: "(\w+)",/g)).map(match => match[1]);

const SENSITIVE = [
  "canViewPasswords",
  "canViewActivityLog",
  "canViewWebhooks",
  "canManageWebsiteSettings",
  "canManageMlsFeeds",
  "canEditContactLeadSource",
  "canEditTransactionLeadSource",
  "canAdministerPto",
  "canManageChat",
  "canEditHistoricalReferrals",
  "canAdministerTransactions",
  "canViewMarketMatchSettings",
  "canViewPulseSettings",
];

describe("role templates", () => {
  it("found every permission key in the router", () => {
    expect(ALL_KEYS.length).toBeGreaterThan(80);
  });

  it("only name permissions that exist", () => {
    const known = new Set(ALL_KEYS);
    for (const key of ROLE_BASE_PERMISSIONS) expect(known.has(key)).toBe(true);
    for (const template of ADMIN_ROLE_TEMPLATES) {
      for (const key of template.permissions) {
        if (!known.has(key)) throw new Error(`${template.label}: unknown permission ${key}`);
      }
    }
  });

  it("are the five jobs the audit named", () => {
    expect(ADMIN_ROLE_TEMPLATES.map(template => template.label)).toEqual([
      "Operations",
      "Marketing",
      "ISA lead",
      "Finance",
      "Website",
    ]);
  });

  it("never hand out the sensitive pages", () => {
    for (const template of ADMIN_ROLE_TEMPLATES) {
      const grants = templateGrants(template);
      for (const key of SENSITIVE) {
        if (grants.has(key)) throw new Error(`${template.label} grants ${key}`);
      }
    }
  });

  it("include the page above every capability they grant", () => {
    for (const template of ADMIN_ROLE_TEMPLATES) {
      const grants = templateGrants(template);
      for (const [page, capabilities] of Object.entries(PAGE_PERMISSION_DEPENDENCIES)) {
        for (const capability of capabilities) {
          if (grants.has(capability) && !grants.has(page)) {
            throw new Error(`${template.label} grants ${capability} without ${page}`);
          }
        }
      }
    }
  });

  it("are much narrower than today's typical admin (50% or more)", () => {
    for (const template of ADMIN_ROLE_TEMPLATES) {
      expect(templateGrants(template).size / ALL_KEYS.length).toBeLessThan(0.45);
    }
  });

  it("turn on the role's pages and turn every other page off", () => {
    const marketing = ADMIN_ROLE_TEMPLATES.find(template => template.key === "marketing")!;
    const applied = applyRoleTemplate(marketing, ALL_KEYS);
    expect(Object.keys(applied).length).toBe(ALL_KEYS.length);
    expect(applied.canViewLandingPages).toBe(true);
    expect(applied.canViewDashboard).toBe(true);
    expect(applied.canViewPasswords).toBe(false);
    expect(applied.canViewCommission).toBe(false);
  });

  it("names the closest role for access reviews", () => {
    const finance = ADMIN_ROLE_TEMPLATES.find(template => template.key === "finance")!;
    const exact = closestRoleTemplate(applyRoleTemplate(finance, ALL_KEYS), ALL_KEYS);
    expect(exact?.template.key).toBe("finance");
    expect(exact?.extra).toEqual([]);
    expect(exact?.missing).toEqual([]);

    const plusPasswords = closestRoleTemplate({ ...applyRoleTemplate(finance, ALL_KEYS), canViewPasswords: true }, ALL_KEYS);
    expect(plusPasswords?.template.key).toBe("finance");
    expect(plusPasswords?.extra).toEqual(["canViewPasswords"]);

    const everything = Object.fromEntries(ALL_KEYS.map(key => [key, true]));
    expect(closestRoleTemplate(everything, ALL_KEYS)).toBeNull();
  });
});

describe("who can manage admin access", () => {
  it("keeps today's lists until the Railway variables are set", () => {
    expect(permissionManagerEmails({})).toEqual([
      "tyler@savvy.realty",
      "elana@savvy.realty",
      "dyl@savvy.realty",
      "dhruv@savvy.realty",
    ]);
    expect(adminCreatorEmails({})).toEqual(["tyler@savvy.realty", "elana@savvy.realty", "dyl@savvy.realty"]);
  });

  it("reads the variables, always keeps Tyler, and accepts only @savvy.realty", () => {
    const env = { PERMISSION_MANAGER_EMAILS: "Elana@Savvy.Realty, someone@gmail.com; dyl@savvy.realty.evil.com" };
    expect(permissionManagerEmails(env)).toEqual(["tyler@savvy.realty", "elana@savvy.realty"]);
    expect(isPermissionManagerEmail("ELANA@savvy.realty", env)).toBe(true);
    expect(isPermissionManagerEmail("dhruv@savvy.realty", env)).toBe(false);
    expect(isPermissionManagerEmail("someone@gmail.com", env)).toBe(false);
    expect(isPermissionManagerEmail("", env)).toBe(false);
    expect(isAdminCreatorEmail("tyler@savvy.realty", { ADMIN_CREATOR_EMAILS: "nobody@gmail.com" })).toBe(true);
    expect(isAdminCreatorEmail("elana@savvy.realty", { ADMIN_CREATOR_EMAILS: "nobody@gmail.com" })).toBe(false);
  });

  it("no hardcoded lists are left in the routers", () => {
    expect(permissionsSource).not.toContain("const PERMISSION_MANAGERS");
    expect(permissionsSource).not.toContain("PERMISSION_MANAGERS.includes");
    const users = read("server/routers/users.ts");
    expect(users).not.toContain("PERMISSION_MANAGERS");
    expect(users.match(/isAdminCreatorEmail\(/g)?.length).toBe(2);
  });

  it("Super Permissions offers the templates and shows the closest role", () => {
    const page = read("client/src/pages/SuperPermissionsPage.tsx");
    expect(page).toContain("Start from a role");
    expect(page).toContain("applyRoleTemplate(");
    expect(page).toContain("closestRoleTemplate(");
    expect(page).toContain("enforcePagePermissionDependencies(\n      applyRoleTemplate(");
  });
});
