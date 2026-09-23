/**
 * Rate limits for the investor account screens on the public site.
 *
 * The contact forms already have theirs (enforceLeadThrottle in
 * routers/website.ts, backed by website_lead_attempts). Sign-in, sign-up and
 * password reset had none: a script could guess passwords without limit,
 * create accounts in bulk, or use the reset form to send a stranger's inbox a
 * stream of emails.
 *
 * Kept in memory rather than in a table. The service runs as one process, a
 * restart only forgives a few minutes of attempts, and it needs no migration.
 * If SavvyOS ever runs more than one instance, each would keep its own count,
 * which loosens the limit rather than breaking anything.
 */
import { createHash } from "node:crypto";

export type ThrottleRule = { limit: number; windowMs: number };

const MINUTE = 60_000;

export const ACCOUNT_THROTTLE_RULES = {
  // Per address: stops password guessing against one account.
  signInPerEmail: { limit: 10, windowMs: 15 * MINUTE },
  // Per network: stops one source trying many accounts.
  signInPerIp: { limit: 30, windowMs: 15 * MINUTE },
  signUpPerIp: { limit: 5, windowMs: 60 * MINUTE },
  resetPerEmail: { limit: 3, windowMs: 60 * MINUTE },
  resetPerIp: { limit: 10, windowMs: 60 * MINUTE },
} satisfies Record<string, ThrottleRule>;

export type ThrottleScope = keyof typeof ACCOUNT_THROTTLE_RULES;

export class SlidingWindowThrottle {
  private hits = new Map<string, number[]>();
  private sweepAt = 0;

  constructor(private now: () => number = Date.now) {}

  /**
   * Record an attempt and say whether it is allowed. A refused attempt is not
   * recorded, so waiting out the window always works.
   */
  attempt(key: string, rule: ThrottleRule): boolean {
    const now = this.now();
    this.sweep(now);
    const since = now - rule.windowMs;
    const recent = (this.hits.get(key) ?? []).filter(t => t > since);
    if (recent.length >= rule.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** Drop keys with nothing recent, at most once a minute, so memory stays flat. */
  private sweep(now: number) {
    if (now < this.sweepAt) return;
    this.sweepAt = now + MINUTE;
    const longest = Math.max(...Object.values(ACCOUNT_THROTTLE_RULES).map(r => r.windowMs));
    this.hits.forEach((times, key) => {
      if (!times.some(t => t > now - longest)) this.hits.delete(key);
    });
  }

  size() {
    return this.hits.size;
  }
}

/**
 * The client address as Railway reports it. The last X-Forwarded-For entry is
 * the one Railway's edge appended; anything before it came from the client
 * and can be made up. Same rule as enforceLeadThrottle.
 */
export function clientIp(req: any): string {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "")
    .split(",")
    .map((value: string) => value.trim())
    .filter(Boolean);
  return forwarded[forwarded.length - 1] || req?.ip || req?.socket?.remoteAddress || "unknown";
}

/** Keys are hashed so the map never holds an address or an IP in the clear. */
export function throttleKey(scope: ThrottleScope, value: string): string {
  return `${scope}:${createHash("sha256").update(value.trim().toLowerCase()).digest("hex")}`;
}

const shared = new SlidingWindowThrottle();

/** True when every named limit allows this attempt. */
export function allowAccountAttempt(
  checks: Array<{ scope: ThrottleScope; value: string }>,
  throttle: SlidingWindowThrottle = shared
): boolean {
  // Every check is evaluated, so a refusal on one does not leave the others
  // uncounted and easier to hit next time.
  let allowed = true;
  for (const check of checks) {
    if (!throttle.attempt(throttleKey(check.scope, check.value), ACCOUNT_THROTTLE_RULES[check.scope])) {
      allowed = false;
    }
  }
  return allowed;
}

export const TOO_MANY_ATTEMPTS = "Too many attempts. Please wait a few minutes and try again.";
