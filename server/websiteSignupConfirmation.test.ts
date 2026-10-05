/**
 * Email confirmation for new website accounts, and the sign-up list.
 * Nothing here reaches Resend, a mailbox or a database: the sender, fetch and
 * the db are all stand-ins.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  addSignupToResendAudience: vi.fn(),
  sendSignupConfirmation: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb, logActivity: vi.fn() }));
vi.mock("./websiteActivity", () => ({
  recordWebsiteAccountActivity: vi.fn(async () => undefined),
  isRepeatView: vi.fn(() => false),
}));

import { websiteAccountTokens, websiteAccounts } from "../drizzle/schema";
import { hashToken } from "./_core/websiteAccountAuth";
import { getEmailPreview } from "./_core/resendEmail";
import * as audience from "./websiteSignupAudience";
import * as confirmation from "./websiteSignupConfirmation";
import {
  EMAIL_CONFIRMATION_LIFETIME_MS,
  OLD_SITE_SIGNUP_AUDIENCE_ID,
  confirmSignupEmail,
  confirmedSignupAudienceId,
  emailConfirmationUrl,
  sendSignupConfirmation,
  signupConfirmationEnabled,
} from "./websiteSignupConfirmation";

const ON = { WEBSITE_SIGNUP_CONFIRMATION_ENABLED: "true" };
const OFF = {};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.WEBSITE_SIGNUP_CONFIRMATION_ENABLED;
});

describe("the switch and the list", () => {
  it("is off unless WEBSITE_SIGNUP_CONFIRMATION_ENABLED is set to a yes", () => {
    expect(signupConfirmationEnabled({})).toBe(false);
    expect(signupConfirmationEnabled({ WEBSITE_SIGNUP_CONFIRMATION_ENABLED: "" })).toBe(false);
    expect(signupConfirmationEnabled({ WEBSITE_SIGNUP_CONFIRMATION_ENABLED: "false" })).toBe(false);
    expect(signupConfirmationEnabled({ WEBSITE_SIGNUP_CONFIRMATION_ENABLED: "0" })).toBe(false);
    for (const value of ["true", "TRUE", " 1 ", "yes", "on"]) {
      expect(signupConfirmationEnabled({ WEBSITE_SIGNUP_CONFIRMATION_ENABLED: value })).toBe(true);
    }
  });

  it("defaults to the old site's All Savvy-Agent Users list, overridable by env", () => {
    expect(OLD_SITE_SIGNUP_AUDIENCE_ID).toBe("21d6ce52-d41a-4fcd-823e-f8bf5ea5e26d");
    expect(confirmedSignupAudienceId({})).toBe(OLD_SITE_SIGNUP_AUDIENCE_ID);
    expect(confirmedSignupAudienceId({ WEBSITE_SIGNUP_RESEND_AUDIENCE_ID: "  " })).toBe(OLD_SITE_SIGNUP_AUDIENCE_ID);
    expect(confirmedSignupAudienceId({ WEBSITE_SIGNUP_RESEND_AUDIENCE_ID: " seg_x " })).toBe("seg_x");
  });

  it("links to the confirm page on the public site", () => {
    expect(emailConfirmationUrl("abc123")).toBe(
      "https://home.savvy-agents.com/newsite/confirm-email?token=abc123"
    );
  });
});

describe("the confirmation email", () => {
  function tokenDb() {
    const inserted: any[] = [];
    const updates: any[] = [];
    return {
      inserted,
      updates,
      update: (table: unknown) => ({
        set: (values: unknown) => ({
          where: async () => {
            updates.push({ table, values });
            return [{ affectedRows: 0 }];
          },
        }),
      }),
      insert: (table: unknown) => ({
        values: async (values: any) => {
          inserted.push({ table, values });
          return [{ insertId: 1 }];
        },
      }),
    };
  }

  it("is queued with a single-use, 7-day token whose hash is all that is stored", async () => {
    const db = tokenDb();
    const send = vi.fn(async () => ({ sent: true, skipped: false }));
    const before = Date.now();

    const result = await sendSignupConfirmation(db, { id: 7, email: "new@example.com", firstName: "Nia" }, send as any);

    expect(result).toEqual({ sent: true });
    expect(send).toHaveBeenCalledTimes(1);
    const [type, ctx, options] = send.mock.calls[0] as any[];
    expect(type).toBe("website_account_email_confirmation");
    expect(ctx.recipientEmail).toBe("new@example.com");
    expect(ctx.recipientName).toBe("Nia");
    expect(options).toEqual({ injectMagicLinks: false });

    const url = new URL(ctx.websiteConfirmUrl);
    expect(url.pathname).toBe("/newsite/confirm-email");
    const token = url.searchParams.get("token")!;
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    // An earlier unused link is spent first.
    expect(db.updates[0].table).toBe(websiteAccountTokens);
    expect(db.inserted).toHaveLength(1);
    const row = db.inserted[0].values;
    expect(db.inserted[0].table).toBe(websiteAccountTokens);
    expect(row.accountId).toBe(7);
    expect(row.purpose).toBe("email_verification");
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.tokenHash).not.toContain(token);
    const lifetime = row.expiresAt.getTime() - before;
    expect(lifetime).toBeGreaterThanOrEqual(EMAIL_CONFIRMATION_LIFETIME_MS - 1000);
    expect(lifetime).toBeLessThanOrEqual(EMAIL_CONFIRMATION_LIFETIME_MS + 1000);
  });

  it("never throws when the email cannot be sent or the token cannot be saved", async () => {
    const refused = vi.fn(async () => ({ sent: false, skipped: true, reason: "off" }));
    expect(await sendSignupConfirmation(tokenDb(), { id: 1, email: "a@example.com" }, refused as any)).toEqual({
      sent: false,
      reason: "off",
    });

    const broken = { update: () => { throw new Error("db down"); } };
    const send = vi.fn();
    expect(await sendSignupConfirmation(broken, { id: 1, email: "a@example.com" }, send as any)).toEqual({
      sent: false,
      reason: "db down",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("renders the link and escapes the name", () => {
    const preview = getEmailPreview("website_account_email_confirmation", {
      recipientEmail: "new@example.com",
      recipientName: "Nia <b>",
      websiteConfirmUrl: "https://home.savvy-agents.com/newsite/confirm-email?token=abc",
    });
    expect(preview.subject).toBe("Confirm your email for Savvy STR Agents");
    expect(preview.html).toContain('href="https://home.savvy-agents.com/newsite/confirm-email?token=abc"');
    expect(preview.html).toContain("Nia &lt;b&gt;");
    expect(preview.html).not.toContain("Nia <b>");
  });
});

describe("opening the link", () => {
  const NOW = new Date("2026-10-05T12:00:00Z");
  const TOKEN = "a".repeat(64);

  type State = {
    token: { id: number; accountId: number; tokenHash: string; expiresAt: Date; usedAt: Date | null } | null;
    account: {
      id: number;
      email: string;
      firstName: string | null;
      lastName: string | null;
      emailVerifiedAt: Date | null;
    } | null;
    loseClaimRace?: boolean;
  };

  function stateWith(overrides: Partial<State> = {}): State {
    return {
      token: {
        id: 11,
        accountId: 7,
        tokenHash: hashToken(TOKEN),
        expiresAt: new Date(NOW.getTime() + 60_000),
        usedAt: null,
      },
      account: { id: 7, email: "new@example.com", firstName: "Nia", lastName: "Lee", emailVerifiedAt: null },
      ...overrides,
    };
  }

  /** A db holding one token and one account, enough to follow the confirm path. */
  function dbFor(state: State) {
    return {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () => {
              if (table === websiteAccountTokens) return state.token ? [state.token] : [];
              if (table === websiteAccounts) return state.account ? [state.account] : [];
              return [];
            },
          }),
        }),
      }),
      update: (table: unknown) => ({
        set: (values: any) => ({
          where: async () => {
            if (table === websiteAccountTokens) {
              if (state.loseClaimRace || !state.token || state.token.usedAt) return [{ affectedRows: 0 }];
              state.token.usedAt = values.usedAt;
              return [{ affectedRows: 1 }];
            }
            if (table === websiteAccounts) {
              if (!state.account || state.account.emailVerifiedAt) return [{ affectedRows: 0 }];
              state.account.emailVerifiedAt = values.emailVerifiedAt;
              return [{ affectedRows: 1 }];
            }
            return [{ affectedRows: 0 }];
          },
        }),
      }),
    };
  }

  const flush = () => new Promise(resolve => setTimeout(resolve, 0));

  it("marks the account confirmed and adds them to the list in the background", async () => {
    const state = stateWith();
    const addToAudience = vi.fn(async () => ({ attempted: true, success: true }));

    const outcome = await confirmSignupEmail(dbFor(state), TOKEN, { now: NOW, env: ON, addToAudience });
    await flush();

    expect(outcome).toEqual({ status: "confirmed", accountId: 7 });
    expect(state.account!.emailVerifiedAt).toEqual(NOW);
    expect(state.token!.usedAt).toEqual(NOW);
    expect(addToAudience).toHaveBeenCalledTimes(1);
    expect(addToAudience).toHaveBeenCalledWith(
      expect.anything(),
      { email: "new@example.com", firstName: "Nia", lastName: "Lee" },
      { fallbackSegmentId: OLD_SITE_SIGNUP_AUDIENCE_ID }
    );
  });

  it("uses WEBSITE_SIGNUP_RESEND_AUDIENCE_ID when set", async () => {
    const addToAudience = vi.fn(async () => ({ attempted: true, success: true }));
    await confirmSignupEmail(dbFor(stateWith()), TOKEN, {
      now: NOW,
      env: { ...ON, WEBSITE_SIGNUP_RESEND_AUDIENCE_ID: "seg_env" },
      addToAudience,
    });
    await flush();
    expect((addToAudience.mock.calls[0] as any[])[2]).toEqual({ fallbackSegmentId: "seg_env" });
  });

  it("still confirms, but adds no one, once the switch is off", async () => {
    const state = stateWith();
    const addToAudience = vi.fn();
    const outcome = await confirmSignupEmail(dbFor(state), TOKEN, { now: NOW, env: OFF, addToAudience });
    await flush();
    expect(outcome.status).toBe("confirmed");
    expect(state.account!.emailVerifiedAt).toEqual(NOW);
    expect(addToAudience).not.toHaveBeenCalled();
  });

  it("confirms even when adding to the list fails or throws", async () => {
    for (const addToAudience of [
      vi.fn(async () => ({ attempted: true, success: false, reason: "Resend 500" })),
      vi.fn(async () => {
        throw new Error("Resend exploded");
      }),
      vi.fn(() => {
        throw new Error("synchronous failure");
      }),
    ]) {
      const state = stateWith();
      const outcome = await confirmSignupEmail(dbFor(state), TOKEN, { now: NOW, env: ON, addToAudience: addToAudience as any });
      await flush();
      expect(outcome).toEqual({ status: "confirmed", accountId: 7 });
      expect(state.account!.emailVerifiedAt).toEqual(NOW);
      expect(addToAudience).toHaveBeenCalledTimes(1);
    }
  });

  it("does not wait for the list before answering", async () => {
    let release!: () => void;
    const addToAudience = vi.fn(
      () => new Promise<any>(resolve => { release = () => resolve({ attempted: true, success: true }); })
    );
    const outcome = await confirmSignupEmail(dbFor(stateWith()), TOKEN, { now: NOW, env: ON, addToAudience });
    expect(outcome.status).toBe("confirmed");
    await flush();
    release();
  });

  it("is idempotent: a second click is already_confirmed and adds no one again", async () => {
    const state = stateWith();
    const addToAudience = vi.fn(async () => ({ attempted: true, success: true }));
    const db = dbFor(state);

    expect((await confirmSignupEmail(db, TOKEN, { now: NOW, env: ON, addToAudience })).status).toBe("confirmed");
    const second = await confirmSignupEmail(db, TOKEN, { now: new Date(NOW.getTime() + 5000), env: ON, addToAudience });
    await flush();

    expect(second).toEqual({ status: "already_confirmed", accountId: 7 });
    expect(state.account!.emailVerifiedAt).toEqual(NOW);
    expect(addToAudience).toHaveBeenCalledTimes(1);
  });

  it("treats a lost race on the same link as already confirmed, without a second add", async () => {
    const addToAudience = vi.fn();
    const outcome = await confirmSignupEmail(dbFor(stateWith({ loseClaimRace: true })), TOKEN, {
      now: NOW,
      env: ON,
      addToAudience,
    });
    await flush();
    expect(outcome.status).toBe("already_confirmed");
    expect(addToAudience).not.toHaveBeenCalled();
  });

  it("refuses an expired link and changes nothing", async () => {
    const state = stateWith();
    state.token!.expiresAt = new Date(NOW.getTime() - 1);
    const addToAudience = vi.fn();
    expect(await confirmSignupEmail(dbFor(state), TOKEN, { now: NOW, env: ON, addToAudience })).toEqual({
      status: "expired",
    });
    expect(state.account!.emailVerifiedAt).toBeNull();
    expect(state.token!.usedAt).toBeNull();
    expect(addToAudience).not.toHaveBeenCalled();
  });

  it("refuses a link replaced by a newer one", async () => {
    const state = stateWith();
    state.token!.usedAt = new Date(NOW.getTime() - 1000);
    expect((await confirmSignupEmail(dbFor(state), TOKEN, { now: NOW, env: ON, addToAudience: vi.fn() })).status).toBe(
      "expired"
    );
    expect(state.account!.emailVerifiedAt).toBeNull();
  });

  it("refuses an unknown token, or one whose account is gone", async () => {
    const addToAudience = vi.fn();
    expect(await confirmSignupEmail(dbFor(stateWith({ token: null })), TOKEN, { now: NOW, env: ON, addToAudience })).toEqual({
      status: "invalid",
    });
    expect(await confirmSignupEmail(dbFor(stateWith({ account: null })), TOKEN, { now: NOW, env: ON, addToAudience })).toEqual({
      status: "invalid",
    });
    expect(addToAudience).not.toHaveBeenCalled();
  });
});

describe("the list a confirmed sign-up joins", () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.RESEND_API_KEY;
  let urls: string[] = [];

  beforeEach(() => {
    urls = [];
    process.env.RESEND_API_KEY = "test-key";
    globalThis.fetch = (async (url: any) => {
      urls.push(String(url));
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "c_1" }) } as any;
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  });

  function db(studioChoice: string | null, contactRows: Array<{ emailStatus: string | null }> = []) {
    return {
      execute: async () => [[{ segmentId: studioChoice }]],
      select: () => ({ from: () => ({ where: () => ({ limit: async () => contactRows }) }) }),
    };
  }

  it("is the fallback when no list is chosen in Website Studio", async () => {
    const result = await audience.addSignupToResendAudience(
      db(null),
      { email: "new@example.com" },
      { fallbackSegmentId: OLD_SITE_SIGNUP_AUDIENCE_ID }
    );
    expect(result).toEqual({ attempted: true, success: true });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain(`/segments/${OLD_SITE_SIGNUP_AUDIENCE_ID}`);
  });

  it("is the Website Studio choice when there is one", async () => {
    await audience.addSignupToResendAudience(db("seg_studio"), { email: "new@example.com" }, { fallbackSegmentId: "seg_fallback" });
    expect(urls[0]).toContain("/segments/seg_studio");
  });

  it("is still nothing on the plain sign-up path when no list is chosen", async () => {
    expect(await audience.addSignupToResendAudience(db(null), { email: "new@example.com" })).toEqual({
      attempted: false,
      success: false,
      reason: "No list chosen",
    });
    expect(urls).toEqual([]);
  });

  it("still skips someone SavvyOS has as unsubscribed", async () => {
    const result = await audience.addSignupToResendAudience(
      db(null, [{ emailStatus: "unsubscribed" }]),
      { email: "gone@example.com" },
      { fallbackSegmentId: OLD_SITE_SIGNUP_AUDIENCE_ID }
    );
    expect(result.attempted).toBe(false);
    expect(urls).toEqual([]);
  });
});

describe("the router", () => {
  /** A db good enough for sign-up: no existing account, inserts succeed. */
  function signUpDb() {
    return {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      insert: () => ({ values: async () => [{ insertId: 42 }] }),
      update: () => ({ set: () => ({ where: async () => [{ affectedRows: 0 }] }) }),
      execute: async () => [[]],
    };
  }

  async function caller(ip: string) {
    const auth = await import("./_core/websiteAccountAuth");
    vi.spyOn(auth, "hashPassword").mockResolvedValue("hashed");
    vi.spyOn(auth, "sessionCookieFor").mockResolvedValue({ name: "s", value: "v", options: {} } as any);
    const { websiteAccountRouter } = await import("./routers/websiteAccount");
    return websiteAccountRouter.createCaller({
      req: { headers: { "x-forwarded-for": ip }, socket: {} },
      res: { cookie: vi.fn() },
      user: null,
    } as any);
  }

  const input = {
    email: "New@Example.com",
    password: "a long enough password",
    firstName: "Nia",
    lastName: "Lee",
  };

  it("signs up with the switch off exactly as before: no email, the Studio list path", async () => {
    mocks.getDb.mockResolvedValue(signUpDb());
    const add = vi.spyOn(audience, "addSignupToResendAudience").mockResolvedValue({ attempted: false, success: false });
    const send = vi.spyOn(confirmation, "sendSignupConfirmation").mockResolvedValue({ sent: true });

    const result = await (await caller("10.0.0.1")).signUp(input);

    expect(result).toEqual({ id: 42, email: "new@example.com" });
    expect(send).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(expect.anything(), {
      email: "new@example.com",
      firstName: "Nia",
      lastName: "Lee",
    });
  });

  it("signs up with the switch on: account created and signed in, confirmation queued, no list yet", async () => {
    process.env.WEBSITE_SIGNUP_CONFIRMATION_ENABLED = "true";
    mocks.getDb.mockResolvedValue(signUpDb());
    const add = vi.spyOn(audience, "addSignupToResendAudience").mockResolvedValue({ attempted: false, success: false });
    const send = vi.spyOn(confirmation, "sendSignupConfirmation").mockResolvedValue({ sent: true });

    const result = await (await caller("10.0.0.2")).signUp(input);

    expect(result).toEqual({ id: 42, email: "new@example.com" });
    expect(send).toHaveBeenCalledWith(expect.anything(), { id: 42, email: "new@example.com", firstName: "Nia" });
    expect(add).not.toHaveBeenCalled();
  });

  it("does not fail sign-up when the confirmation email fails", async () => {
    process.env.WEBSITE_SIGNUP_CONFIRMATION_ENABLED = "true";
    mocks.getDb.mockResolvedValue(signUpDb());
    vi.spyOn(confirmation, "sendSignupConfirmation").mockResolvedValue({ sent: false, reason: "Resend down" });
    const result = await (await caller("10.0.0.3")).signUp(input);
    expect(result.id).toBe(42);
  });

  it("answers invalid and expired links with a clear error, and a good one with ok", async () => {
    mocks.getDb.mockResolvedValue(signUpDb());
    const confirm = vi.spyOn(confirmation, "confirmSignupEmail");
    const api = await caller("10.0.0.4");

    confirm.mockResolvedValueOnce({ status: "invalid" });
    await expect(api.confirmEmail({ token: "b".repeat(64) })).rejects.toThrow(/not valid/);

    confirm.mockResolvedValueOnce({ status: "expired" });
    await expect(api.confirmEmail({ token: "b".repeat(64) })).rejects.toThrow(/expired/);

    confirm.mockResolvedValueOnce({ status: "confirmed", accountId: 1 });
    expect(await api.confirmEmail({ token: "b".repeat(64) })).toEqual({ ok: true, alreadyConfirmed: false });

    confirm.mockResolvedValueOnce({ status: "already_confirmed", accountId: 1 });
    expect(await api.confirmEmail({ token: "b".repeat(64) })).toEqual({ ok: true, alreadyConfirmed: true });
  });
});
