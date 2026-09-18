import type { User } from "../../drizzle/schema";

/**
 * Authentication material must never be serialized to a browser, including as
 * a nested relation in an otherwise legitimate API response.
 */
export const SENSITIVE_USER_FIELDS = [
  "passwordHash",
  "passwordResetToken",
  "passwordResetExpiry",
] as const;

const sensitiveUserFieldSet = new Set<string>(SENSITIVE_USER_FIELDS);

export type UserListItem = Pick<
  User,
  | "id"
  | "name"
  | "email"
  | "phone"
  | "title"
  | "reportsToId"
  | "marketProfileId"
  | "role"
  | "callBookingLink"
  | "isActive"
>;

/** Operational identity used for selectors, ownership labels, and joins. */
export function toUserListItem(user: User): UserListItem {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    title: user.title,
    reportsToId: user.reportsToId,
    marketProfileId: user.marketProfileId,
    role: user.role,
    callBookingLink: user.callBookingLink,
    isActive: user.isActive,
  };
}

/** Current-session identity. Deliberately excludes internal auth and OAuth identifiers. */
export function toSessionUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    title: user.title,
    role: user.role,
    employmentType: user.employmentType,
    commissionSplit: user.commissionSplit,
    isActive: user.isActive,
  };
}

/** Profile identity used by the agent profile and pro-forma views. */
export function toProfileUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    title: user.title,
    role: user.role,
    employmentType: user.employmentType,
    commissionSplit: user.commissionSplit,
    callBookingLink: user.callBookingLink,
    isActive: user.isActive,
  };
}

/** Administrator-facing user-management record. */
export function toAdminUser(user: User) {
  return {
    ...toProfileUser(user),
    reportsToId: user.reportsToId,
    marketProfileId: user.marketProfileId,
    loginMethod: user.loginMethod,
    personType: user.personType,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastSignedIn: user.lastSignedIn,
  };
}

/**
 * Defense in depth for tRPC output serialization. Explicit DTOs remain the
 * primary API contract; this ensures a newly-added nested join cannot expose
 * authentication material before a review catches it.
 */
export function stripSensitiveUserFields<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) {
    return value.map(stripSensitiveUserFields) as T;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveUserFieldSet.has(key)) continue;
    sanitized[key] = stripSensitiveUserFields(child);
  }
  return sanitized as T;
}

export function hasSensitiveUserFields(value: unknown): boolean {
  if (value === null || value === undefined || typeof value !== "object") {
    return false;
  }
  if (value instanceof Date || Buffer.isBuffer(value)) return false;
  if (Array.isArray(value)) return value.some(hasSensitiveUserFields);
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => sensitiveUserFieldSet.has(key) || hasSensitiveUserFields(child)
  );
}
