import { readFileSync } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({
  user: undefined as Record<string, unknown> | undefined,
  inserted: [] as Array<Record<string, unknown>>,
}));

vi.mock("./_core/env", () => ({ ENV: { cookieSecret: "test-secret-for-staff-site-sessions" } }));

vi.mock("./db", () => ({
  logActivity: vi.fn(),
  getDb: vi.fn(async () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (dbState.user ? [dbState.user] : []) }),
      }),
    }),
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        dbState.inserted.push(row);
      },
    }),
  })),
}));

import {
  STAFF_HANDOFF_PATH,
  STAFF_HANDOFF_ROUTE,
  createStaffSiteSession,
  isFromWebsiteOrigin,
  staffSiteCookieOptions,
  readStaffSiteSession,
  staffMenuFor,
  staffTargetPath,
  STAFF_HANDOFF_TTL_MS,
  createStaffHandoff,
  findStaffForWebsiteSignIn,
  hashHandoffToken,
  isHandoffEligible,
  safeHandoffRedirect,
  staffAppBaseUrl,
} from "./staffWebsiteHandoff";

const readSource = (file: string) =>
  readFileSync(path.join(__dirname, file), "utf8").replace(/\r\n/g, "\n");

const staffUser = async (overrides: Record<string, unknown> = {}) => ({
  id: 504747,
  passwordHash: await bcrypt.hash("correct horse battery", 4),
  isActive: true,
  personType: "full_user",
  role: "agent",
  ...overrides,
});

beforeEach(() => {
  dbState.user = undefined;
  dbState.inserted = [];
  delete process.env.STAFF_APP_URL;
});

describe("isHandoffEligible", () => {
  it("accepts every active staff role", () => {
    for (const role of ["admin", "agent", "isa", "agent_support"]) {
      expect(isHandoffEligible({ passwordHash: "x", isActive: true, personType: "full_user", role })).toBe(true);
    }
  });

  it("refuses deactivated users, directory-only teammates and users with no password", () => {
    const base = { passwordHash: "x", isActive: true, personType: "full_user", role: "agent" };
    expect(isHandoffEligible({ ...base, isActive: false })).toBe(false);
    expect(isHandoffEligible({ ...base, personType: "teammate" })).toBe(false);
    expect(isHandoffEligible({ ...base, passwordHash: null })).toBe(false);
    expect(isHandoffEligible({ ...base, role: "investor" })).toBe(false);
    expect(isHandoffEligible(undefined)).toBe(false);
  });
});

describe("findStaffForWebsiteSignIn", () => {
  it("returns the staff user when the SavvyOS password matches", async () => {
    dbState.user = await staffUser();
    expect(await findStaffForWebsiteSignIn("rachel@savvy.realty", "correct horse battery")).toEqual({ id: 504747 });
  });

  it("returns nothing for a wrong password, so the investor check runs next", async () => {
    dbState.user = await staffUser();
    expect(await findStaffForWebsiteSignIn("rachel@savvy.realty", "wrong password")).toBeNull();
  });

  it("never hands a deactivated account to SavvyOS, even with the right password", async () => {
    dbState.user = await staffUser({ isActive: false });
    expect(await findStaffForWebsiteSignIn("rachel@savvy.realty", "correct horse battery")).toBeNull();
  });

  it("returns nothing when the email is not staff", async () => {
    expect(await findStaffForWebsiteSignIn("investor@example.com", "anything at all")).toBeNull();
  });
});

describe("createStaffHandoff", () => {
  it("stores only a hash of the link, with a short expiry and the Properties page", async () => {
    const before = Date.now();
    const url = await createStaffHandoff(504747);
    const token = new URL(url).searchParams.get("token")!;

    expect(url.startsWith(`https://os.savvy-agents.com${STAFF_HANDOFF_ROUTE}?token=`)).toBe(true);
    expect(token.length).toBeGreaterThanOrEqual(40);

    const [row] = dbState.inserted;
    expect(row.userId).toBe(504747);
    expect(row.token).toBe(hashHandoffToken(token));
    expect(row.token).not.toContain(token);
    expect(row.redirectPath).toBe(STAFF_HANDOFF_PATH);
    const expires = (row.expiresAt as Date).getTime();
    expect(expires).toBeGreaterThanOrEqual(before + STAFF_HANDOFF_TTL_MS - 1000);
    expect(expires).toBeLessThanOrEqual(Date.now() + STAFF_HANDOFF_TTL_MS + 1000);
  });

  it("issues a different link every time", async () => {
    const a = await createStaffHandoff(1);
    const b = await createStaffHandoff(1);
    expect(a).not.toBe(b);
  });
});

describe("small helpers", () => {
  it("uses STAFF_APP_URL when set, without a trailing slash", () => {
    process.env.STAFF_APP_URL = "http://localhost:3000/";
    expect(staffAppBaseUrl()).toBe("http://localhost:3000");
  });

  it("only redirects to same-site paths", () => {
    expect(safeHandoffRedirect("/properties")).toBe("/properties");
    expect(safeHandoffRedirect("//evil.example")).toBe("/");
    expect(safeHandoffRedirect("https://evil.example")).toBe("/");
    expect(safeHandoffRedirect("/\\evil.example")).toBe("/");
    expect(safeHandoffRedirect(null)).toBe("/");
  });
});

describe("wiring", () => {
  const signIn = (() => {
    const source = readSource("routers/websiteAccount.ts");
    const start = source.indexOf("signIn: publicProcedure");
    const end = source.indexOf("signOut: publicProcedure");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  })();

  it("checks the throttle before the staff password, and staff before investors", () => {
    const throttle = signIn.indexOf("allowAccountAttempt");
    const staff = signIn.indexOf("findStaffForWebsiteSignIn");
    const investor = signIn.indexOf(".from(websiteAccounts)");
    expect(throttle).toBeGreaterThan(-1);
    expect(staff).toBeGreaterThan(throttle);
    expect(investor).toBeGreaterThan(staff);
  });

  it("never sets an investor session for a staff login", () => {
    const staffBranch = signIn.slice(
      signIn.indexOf("if (staff) {"),
      signIn.indexOf(".from(websiteAccounts)")
    );
    expect(staffBranch).toContain('kind: "staff"');
    expect(staffBranch).toContain("staffSiteCookieFor");
    expect(staffBranch).not.toContain("sessionCookieFor(ctx.req as any, staff");
  });

  it("registers the redemption route, and the public host still refuses non-tRPC /api paths", () => {
    const index = readSource("_core/index.ts");
    expect(index).toContain("registerStaffWebsiteHandoffRoute(app)");
    expect(index).toContain('if (!req.path.startsWith("/api/trpc/"))');
  });

  it("consumes the link only if it is unused and in date", () => {
    const source = readSource("staffWebsiteHandoff.ts");
    expect(source).toContain("isNull(magicLinkTokens.usedAt)");
    expect(source).toContain("gt(magicLinkTokens.expiresAt, new Date())");
    expect(source).toContain("consumed !== 1");
  });
});

describe("staff session on the website", () => {
  it("round-trips the user id", async () => {
    const token = await createStaffSiteSession(504228);
    expect(await readStaffSiteSession(token)).toBe(504228);
  });

  it("rejects an expired token and junk", async () => {
    expect(await readStaffSiteSession(await createStaffSiteSession(1, -1000))).toBeNull();
    expect(await readStaffSiteSession("not-a-token")).toBeNull();
    expect(await readStaffSiteSession(null)).toBeNull();
  });

  it("is not interchangeable with an investor session", async () => {
    const { createAccountSession, readAccountSession } = await import("./_core/websiteAccountAuth");
    const investor = await createAccountSession(7);
    const staff = await createStaffSiteSession(7);
    expect(await readStaffSiteSession(investor)).toBeNull();
    expect(await readAccountSession(staff)).toBeNull();
  });
});

describe("staff menu", () => {
  it("gives Website Studio to admins only", () => {
    expect(staffMenuFor("admin").map(item => item.key)).toContain("websiteStudio");
    for (const role of ["agent", "isa", "agent_support"]) {
      const keys = staffMenuFor(role).map(item => item.key);
      expect(keys).not.toContain("websiteStudio");
      expect(keys).toEqual(expect.arrayContaining(["properties", "caseStudies", "blog", "profile", "dashboard"]));
    }
  });

  it("sends every item to a same-site SavvyOS path", () => {
    for (const { key } of staffMenuFor("admin")) {
      expect(safeHandoffRedirect(staffTargetPath(key, 504228))).toBe(staffTargetPath(key, 504228));
    }
    expect(staffTargetPath("properties", 1)).toBe("/properties");
    expect(staffTargetPath("profile", 504228)).toBe("/agents/504228?tab=website-profile");
  });

  it("stores the requested landing page on the one-time link", async () => {
    await createStaffHandoff(504228, "/my-website/blog");
    expect(dbState.inserted.at(-1)?.redirectPath).toBe("/my-website/blog");
  });

  it("checks the staff session, and the role, before issuing a link", () => {
    const source = readSource("routers/websiteAccount.ts");
    const open = source.slice(source.indexOf("staffOpen: publicProcedure"));
    expect(open.indexOf("staffFromRequest")).toBeGreaterThan(-1);
    expect(open.indexOf("staffMenuFor(staff.role)")).toBeGreaterThan(open.indexOf("staffFromRequest"));
    expect(open.indexOf("createStaffHandoff")).toBeGreaterThan(open.indexOf("staffMenuFor(staff.role)"));
  });
});

describe("staffOpen cannot be used from another site", () => {
  const req = (headers: Record<string, string>) => ({ headers }) as any;

  it("keeps the staff cookie off cross-site requests (SameSite=Lax)", () => {
    const options = staffSiteCookieOptions({ protocol: "https", headers: {} } as any);
    expect(options.sameSite).toBe("lax");
    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(true);
  });

  it("accepts the website's own origin", () => {
    expect(isFromWebsiteOrigin(req({ origin: "https://home.savvy-agents.com" }))).toBe(true);
    expect(isFromWebsiteOrigin(req({ origin: "https://www.home.savvy-agents.com" }))).toBe(true);
  });

  it("refuses any other origin, including look-alikes", () => {
    for (const origin of [
      "https://evil.example",
      "https://home.savvy-agents.com.evil.example",
      "https://os.savvy-agents.com",
      "null",
    ]) {
      expect(isFromWebsiteOrigin(req({ origin }))).toBe(false);
    }
  });

  it("without an Origin, accepts only what the browser marks same-origin", () => {
    expect(isFromWebsiteOrigin(req({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isFromWebsiteOrigin(req({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isFromWebsiteOrigin(req({}))).toBe(false);
  });

  it("checks the origin before anything else in staffOpen", () => {
    const source = readSource("routers/websiteAccount.ts");
    const open = source.slice(source.indexOf("staffOpen: publicProcedure"));
    expect(open.indexOf("isFromWebsiteOrigin")).toBeGreaterThan(-1);
    expect(open.indexOf("isFromWebsiteOrigin")).toBeLessThan(open.indexOf("staffFromRequest"));
  });
});
