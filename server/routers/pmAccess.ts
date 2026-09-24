import { canAdminUsePermission } from "./permissions";

/**
 * Workload exposes organization-wide assignment data. It is therefore available
 * exactly to active administrators who have been granted Projects in the Super
 * Permissions matrix. The same centralized permission powers the Projects nav.
 */
export async function canViewPmWorkload(user: {
  id: number;
  role: string;
  email?: string | null;
}) {
  return canAdminUsePermission(user, "canViewProjects");
}
