/**
 * Who may manage admin access (security audit, finding 05).
 *
 * These lists used to be hardcoded in three places (permissions.ts and twice
 * in users.ts), so changing who can hand out admin access meant a code change
 * and a deploy, and the copies had already drifted apart. Now they are read
 * from Railway variables, with today's lists as the default so nothing
 * changes until the variables are set:
 *
 *   PERMISSION_MANAGER_EMAILS  who can use Super Permissions
 *                              (default: tyler, elana, dyl, dhruv @savvy.realty)
 *   ADMIN_CREATOR_EMAILS       who can create an admin or promote a user to admin
 *                              (default: tyler, elana, dyl @savvy.realty)
 *
 * Comma-separated. Tyler is always on both lists. Only @savvy.realty
 * addresses are accepted, so a typo or a personal address cannot become a
 * permission manager.
 */

export const OWNER_EMAIL = "tyler@savvy.realty";

export const DEFAULT_PERMISSION_MANAGERS = [
  "tyler@savvy.realty",
  "elana@savvy.realty",
  "dyl@savvy.realty",
  "dhruv@savvy.realty",
] as const;

export const DEFAULT_ADMIN_CREATORS = ["tyler@savvy.realty", "elana@savvy.realty", "dyl@savvy.realty"] as const;

const COMPANY_DOMAIN = "@savvy.realty";

function readList(raw: string | undefined, fallback: readonly string[]): string[] {
  const configured = (raw || "")
    .split(/[,;\s]+/)
    .map(email => email.trim().toLowerCase())
    .filter(email => email.endsWith(COMPANY_DOMAIN) && /^[^@\s]+@savvy\.realty$/.test(email));
  const list = raw && raw.trim() ? configured : [...fallback];
  return Array.from(new Set([OWNER_EMAIL, ...list]));
}

export function permissionManagerEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  return readList(env.PERMISSION_MANAGER_EMAILS, DEFAULT_PERMISSION_MANAGERS);
}

export function adminCreatorEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  return readList(env.ADMIN_CREATOR_EMAILS, DEFAULT_ADMIN_CREATORS);
}

function normalize(email: string | null | undefined): string {
  return String(email || "").trim().toLowerCase();
}

export function isPermissionManagerEmail(email: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const clean = normalize(email);
  return !!clean && permissionManagerEmails(env).includes(clean);
}

export function isAdminCreatorEmail(email: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const clean = normalize(email);
  return !!clean && adminCreatorEmails(env).includes(clean);
}
