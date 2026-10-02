/**
 * A case study's own meta title and meta description.
 *
 * Properties and blog posts have had these since the start; case studies did
 * not, so Google got the title and the excerpt (Dhruv, 2 Oct: "only 2 of them
 * have the meta title and descriptions"). Both are optional: left blank, the
 * page keeps using the title and the excerpt, exactly as before.
 *
 * Kept in its own small table rather than two new website_case_studies
 * columns. Website Studio, My Website and the public pages all select every
 * column of that table, so a column that failed to appear would take them all
 * down (the September price-drop column did that to listings). Here a missing
 * table only means the two fields read as blank.
 *
 * Created before the new instance takes traffic. Additive and safe to repeat.
 * A failure is logged, not thrown.
 */
import mysql from "mysql2/promise";
import { eq, inArray } from "drizzle-orm";

import { websiteCaseStudySeo } from "../drizzle/schema";

export const WEBSITE_CASE_STUDY_SEO_DDL = `
  CREATE TABLE IF NOT EXISTS \`website_case_study_seo\` (
    \`caseStudyId\` int NOT NULL,
    \`metaTitle\` varchar(255) NULL,
    \`metaDescription\` text NULL,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`caseStudyId\`)
  )
`;

let readiness: Promise<void> | null = null;

async function applyWebsiteCaseStudySeoSchema() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  let connection: Awaited<ReturnType<typeof mysql.createConnection>> | null = null;
  try {
    connection = await mysql.createConnection(databaseUrl);
    await connection.query(WEBSITE_CASE_STUDY_SEO_DDL);
  } catch (error) {
    console.error("[websiteCaseStudySeo] could not create website_case_study_seo", error);
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

export function ensureWebsiteCaseStudySeoSchema() {
  readiness ??= applyWebsiteCaseStudySeoSchema();
  return readiness;
}

export type CaseStudySeo = { metaTitle: string | null; metaDescription: string | null };

/** Trimmed, or null when there is nothing; the title is cut to the column's 255. */
export function cleanCaseStudySeo(input: { metaTitle?: string | null; metaDescription?: string | null }): CaseStudySeo {
  const title = (input.metaTitle ?? "").trim().slice(0, 255);
  const description = (input.metaDescription ?? "").trim().slice(0, 2000);
  return { metaTitle: title || null, metaDescription: description || null };
}

/** The saved meta text for these case studies. Empty when the table is not there. */
export async function loadCaseStudySeo(db: any, ids: number[]): Promise<Map<number, CaseStudySeo>> {
  const found = new Map<number, CaseStudySeo>();
  const wanted = Array.from(new Set(ids.filter(id => Number.isInteger(id) && id > 0)));
  if (!wanted.length) return found;
  try {
    const rows = await db
      .select({
        caseStudyId: websiteCaseStudySeo.caseStudyId,
        metaTitle: websiteCaseStudySeo.metaTitle,
        metaDescription: websiteCaseStudySeo.metaDescription,
      })
      .from(websiteCaseStudySeo)
      .where(inArray(websiteCaseStudySeo.caseStudyId, wanted));
    for (const row of rows) found.set(row.caseStudyId, { metaTitle: row.metaTitle, metaDescription: row.metaDescription });
  } catch (error) {
    console.error("[websiteCaseStudySeo] could not read meta text:", error);
  }
  return found;
}

/** Case study rows with metaTitle and metaDescription added (null when none). */
export async function withCaseStudySeo<T extends { id: number }>(db: any, rows: T[]): Promise<Array<T & CaseStudySeo>> {
  const seo = await loadCaseStudySeo(db, rows.map(row => row.id));
  return rows.map(row => ({ ...row, metaTitle: seo.get(row.id)?.metaTitle ?? null, metaDescription: seo.get(row.id)?.metaDescription ?? null }));
}

/**
 * Save the two fields for one case study. Called only when the form sent
 * them (an older open tab that does not know the fields leaves them alone).
 * Both blank removes the row. Returns false when it could not be saved, so
 * the save can tell the person rather than lose their text silently.
 */
export async function saveCaseStudySeo(
  db: any,
  caseStudyId: number,
  input: { metaTitle?: string | null; metaDescription?: string | null }
): Promise<boolean> {
  if (!Number.isInteger(caseStudyId) || caseStudyId <= 0) return false;
  const clean = cleanCaseStudySeo(input);
  try {
    if (!clean.metaTitle && !clean.metaDescription) {
      await db.delete(websiteCaseStudySeo).where(eq(websiteCaseStudySeo.caseStudyId, caseStudyId));
    } else {
      await db
        .insert(websiteCaseStudySeo)
        .values({ caseStudyId, ...clean })
        .onDuplicateKeyUpdate({ set: clean });
    }
    return true;
  } catch (error) {
    console.error("[websiteCaseStudySeo] could not save meta text:", error);
    return false;
  }
}
