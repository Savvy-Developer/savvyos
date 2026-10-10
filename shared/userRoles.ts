export const USER_ROLES = [
  "admin",
  "agent",
  "isa",
  "agent_support",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  agent: "Agent",
  isa: "ISA",
  agent_support: "Agent Support",
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}
