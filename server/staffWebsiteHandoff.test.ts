import { readFileSync } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({
  user: undefined as Record<string, unknown> | undefined,
  inserted: [] as Array<Record<string, unknown>>,
}));

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
    expect(staffBranch).not.toContain("sessionCookieFor");
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
