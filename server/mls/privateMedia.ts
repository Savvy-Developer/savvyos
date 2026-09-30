import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Express } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { mlsFeeds, mlsListings, mlsMedia } from "../../drizzle/mlsSchema";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { canAdminUsePermission } from "../routers/permissions";
import { licenseError } from "./license";

const client = new S3Client({ region: process.env.AWS_REGION || "us-east-2" });
/** Null when private MLS media storage is usable; otherwise the reason it is not. */
export function privateMlsStorageError(): string | null {
  const value = process.env.MLS_MEDIA_BUCKET;
  if (!value || value === (process.env.AWS_BUCKET_NAME || "savvyos")) {
    return "MLS_MEDIA_BUCKET must name a dedicated private bucket with S3 Block Public Access enabled; public SavvyOS storage is not allowed.";
  }
  return null;
}
function bucket() {
  const problem = privateMlsStorageError();
  if (problem) throw new Error(problem);
  return process.env.MLS_MEDIA_BUCKET!;
}
export const privateMlsStorage = {
  async put(key: string, data: Buffer, contentType: string) {
    await client.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: data, ContentType: contentType, CacheControl: "private, no-store" }));
    return { url: `/api/mls/media?key=${encodeURIComponent(key)}` };
  },
  async remove(key: string) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  },
};

export function registerMlsMediaRoute(app: Express) {
  app.get("/api/mls/media", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user || user.isActive === false || user.role !== "admin" || !(await canAdminUsePermission(user, "canViewMlsProperties"))) {
        res.status(403).end(); return;
      }
      const key = typeof req.query.key === "string" ? req.query.key : "";
      if (!key.startsWith("mls/") || key.length > 1024) { res.status(404).end(); return; }
      const db = await getDb();
      if (!db) { res.status(503).end(); return; }
      const [row] = await db.select({ feed: mlsFeeds }).from(mlsMedia)
        .innerJoin(mlsListings, eq(mlsListings.id, mlsMedia.listingId))
        .innerJoin(mlsFeeds, eq(mlsFeeds.id, mlsMedia.feedId))
        .where(and(eq(mlsMedia.s3Key, key), eq(mlsMedia.status, "stored"), isNull(mlsListings.removedFromFeedAt))).limit(1);
      if (!row || licenseError(row.feed)) { res.status(404).end(); return; }
      // URL expires in one minute. Never persist signed object URLs in the DB.
      const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: 60 });
      res.redirect(302, url);
    } catch {
      res.status(401).end();
    }
  });
}
