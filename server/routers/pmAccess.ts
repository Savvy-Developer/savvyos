export const PM_WORKLOAD_VIEWER_EMAILS = new Set([
  "dyl@savvy.realty",
  "elana@savvy.realty",
  "tyler@savvy.realty",
  "kryzll@savvy.realty",
]);

/**
 * Workload aggregates expose assignments across the organization. This allow-list
 * is intentionally server-owned; client-side visibility is only a presentation aid.
 */
export function canViewPmWorkload(user: { email?: string | null }) {
  return (
    !!user.email &&
    PM_WORKLOAD_VIEWER_EMAILS.has(user.email.trim().toLowerCase())
  );
}
