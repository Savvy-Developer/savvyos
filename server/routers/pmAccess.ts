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

const WEEKLY_UPDATE_HUB_EMAILS = new Set([
  "dyl@savvy.realty",
  "kryzll@savvy.realty",
  "heart@savvy.realty",
  "elana@savvy.realty",
  "tyler@savvy.realty",
]);

/**
 * The Hub exposes multiple Project owners' weekly reports. Keep its named
 * leadership roster and the existing Projects Super Permission both enforced
 * at the router boundary, instead of treating the hidden workspace tab as a
 * security boundary.
 */
export async function canViewPmWeeklyUpdateHub(user: {
  id: number;
  role: string;
  email?: string | null;
}) {
  return Boolean(user.email && WEEKLY_UPDATE_HUB_EMAILS.has(user.email.toLowerCase()))
    && await canAdminUsePermission(user, "canViewProjects");
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
