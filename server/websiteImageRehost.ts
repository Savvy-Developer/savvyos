import { eq } from "drizzle-orm";

import {
  websiteAgentProfiles,
  websiteBlogPosts,
  websiteCaseStudies,
} from "../drizzle/schema";
import { getDb } from "./db";
import { storagePut } from "./storage";
import {
  brokenImageRefs,
  decodeDataImage,
  markdownImageUrls,
  movedImageKey,
  replaceImageUrls,
  shouldMoveImage,
} from "./websiteImageRehostLogic";

/**
 * Copy the website's images off the old site's storage into SavvyOS's own
 * (S3), and point the agent profiles, case studies and blog posts at the
 * copies. Run from Website Studio > CMS: check first, then move.
 *
 * Safe to run more than once: copies are named from the original address,
 * and a record is only rewritten where a copy was actually saved, so a
 * failed download leaves that record exactly as it was.
 */

const MAX_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

type Row = {
  table: "agent" | "caseStudy" | "post";
  id: number;
  label: string;
  photo: string | null;
  body: string | null;
};

async function loadRows(db: any): Promise<Row[]> {
  const [agents, studies, posts] = await Promise.all([
    db
      .select({ id: websiteAgentProfiles.id, name: websiteAgentProfiles.slug, photo: websiteAgentProfiles.imageUrl })
      .from(websiteAgentProfiles),
    db
      .select({
        id: websiteCaseStudies.id,
        name: websiteCaseStudies.title,
        photo: websiteCaseStudies.heroImageUrl,
        body: websiteCaseStudies.body,
      })
      .from(websiteCaseStudies),
    db
      .select({
        id: websiteBlogPosts.id,
        name: websiteBlogPosts.title,
        photo: websiteBlogPosts.coverImageUrl,
        body: websiteBlogPosts.body,
      })
      .from(websiteBlogPosts),
  ]);
  return [
    ...agents.map((row: any) => ({ table: "agent" as const, id: row.id, label: row.name, photo: row.photo, body: null })),
    ...studies.map((row: any) => ({ table: "caseStudy" as const, id: row.id, label: row.name, photo: row.photo, body: row.body })),
    ...posts.map((row: any) => ({ table: "post" as const, id: row.id, label: row.name, photo: row.photo, body: row.body })),
  ];
}

function sourcesIn(row: Row): string[] {
  return [row.photo, ...markdownImageUrls(row.body)].filter(
    (url): url is string => !!url && shouldMoveImage(url)
  );
}

export type ImageMoveReport = {
  dryRun: boolean;
  toMove: { agentPhotos: number; caseStudyImages: number; postImages: number; total: number };
  moved: number;
  recordsUpdated: number;
  failed: Array<{ record: string; source: string; reason: string }>;
  brokenRefs: Array<{ record: string; value: string }>;
};

async function download(source: string): Promise<{ bytes: Buffer; contentType: string }> {
  if (source.startsWith("data:")) {
    const decoded = decodeDataImage(source);
    if (!decoded) throw new Error("not a readable embedded image");
    return { bytes: decoded.bytes, contentType: decoded.contentType };
  }
  const response = await fetch(source, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`download failed (${response.status})`);
  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("image/")) throw new Error(`not an image (${contentType || "unknown type"})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("empty file");
  if (bytes.length > MAX_BYTES) throw new Error("larger than 15 MB");
  return { bytes, contentType };
}

export async function moveWebsiteImages(params: { dryRun: boolean }): Promise<ImageMoveReport> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await loadRows(db);

  const counts = { agentPhotos: 0, caseStudyImages: 0, postImages: 0, total: 0 };
  const unique = new Map<string, string>(); // source -> first record label, for reporting
  const brokenRefs: ImageMoveReport["brokenRefs"] = [];
  for (const row of rows) {
    const sources = sourcesIn(row);
    if (row.table === "agent") counts.agentPhotos += sources.length;
    if (row.table === "caseStudy") counts.caseStudyImages += sources.length;
    if (row.table === "post") counts.postImages += sources.length;
    for (const source of sources) if (!unique.has(source)) unique.set(source, row.label);
    for (const value of brokenImageRefs(row.body)) {
      brokenRefs.push({ record: row.label, value: value.slice(0, 120) });
    }
  }
  counts.total = counts.agentPhotos + counts.caseStudyImages + counts.postImages;

  const report: ImageMoveReport = {
    dryRun: params.dryRun,
    toMove: counts,
    moved: 0,
    recordsUpdated: 0,
    failed: [],
    brokenRefs,
  };
  if (params.dryRun || unique.size === 0) return report;

  // Copy each distinct image once, a few at a time.
  const movedTo = new Map<string, string>();
  const queue = Array.from(unique.entries());
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [source, record] = next;
      try {
        const { bytes, contentType } = await download(source);
        const { url } = await storagePut(movedImageKey(source, contentType), bytes, contentType);
        movedTo.set(source, url);
      } catch (error) {
        report.failed.push({
          record,
          source: source.startsWith("data:") ? "embedded image" : source.slice(0, 160),
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  report.moved = movedTo.size;

  // Point each record at its copies. Only what was actually copied changes.
  for (const row of rows) {
    const photo = row.photo && movedTo.get(row.photo);
    const body = row.body ? replaceImageUrls(row.body, movedTo) : row.body;
    const bodyChanged = row.body !== null && body !== row.body;
    if (!photo && !bodyChanged) continue;
    if (row.table === "agent") {
      await db.update(websiteAgentProfiles).set({ imageUrl: photo }).where(eq(websiteAgentProfiles.id, row.id));
    } else if (row.table === "caseStudy") {
      await db
        .update(websiteCaseStudies)
        .set({ ...(photo ? { heroImageUrl: photo } : {}), ...(bodyChanged ? { body } : {}) })
        .where(eq(websiteCaseStudies.id, row.id));
    } else {
      await db
        .update(websiteBlogPosts)
        .set({ ...(photo ? { coverImageUrl: photo } : {}), ...(bodyChanged ? { body } : {}) })
        .where(eq(websiteBlogPosts.id, row.id));
    }
    report.recordsUpdated += 1;
  }

  console.info(
    `[WebsiteImages] moved ${report.moved}/${unique.size} images, updated ${report.recordsUpdated} records, ${report.failed.length} failed.`
  );
  return report;
}
