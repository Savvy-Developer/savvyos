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

/**
 * Workload is an organization-wide planning view, but its roster is limited to
 * administrators and people with an active Project record-access relationship:
 * project owner, collaborator, or assigned Project To-Do owner.
 */
export function isPmWorkloadRosterMember(
  user: { role: string },
  hasProjectAccess: boolean
) {
  return user.role === "admin" || hasProjectAccess;
}
