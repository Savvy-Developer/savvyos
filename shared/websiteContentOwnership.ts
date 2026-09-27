/**
 * Which case studies and blog posts an agent may edit from their own side of
 * SavvyOS (My Website > Case Studies / Blog Posts).
 *
 * Dhruv's decision, 27 Sep: agents add their own case studies and blog posts
 * and publish them straight to the site, the same way they publish their own
 * properties, and they can edit only their own. "Their own" is anything they
 * created, or anything the Studio credits to them (the case study's agent or
 * the post's author), so a case study an admin wrote about an agent's deal is
 * editable by that agent too. Admins keep full access in Website Studio.
 */

export type OwnedCaseStudy = { createdById?: number | null; agentUserId?: number | null };
export type OwnedPost = { createdById?: number | null; authorUserId?: number | null };

export function ownsCaseStudy(row: OwnedCaseStudy | null | undefined, userId: number): boolean {
  if (!row || !userId) return false;
  return row.createdById === userId || row.agentUserId === userId;
}

export function ownsPost(row: OwnedPost | null | undefined, userId: number): boolean {
  if (!row || !userId) return false;
  return row.createdById === userId || row.authorUserId === userId;
}

/**
 * The publish date: stamped the first time something goes live, then left
 * alone, so fixing a typo in March's post does not make it look new.
 */
export function nextPublishedAt(
  status: "draft" | "published" | "archived",
  existing: Date | string | null | undefined,
  now: Date = new Date()
): Date | null {
  const prior = existing ? new Date(existing) : null;
  if (status === "published") return prior ?? now;
  return prior;
}
