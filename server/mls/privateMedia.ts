import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Express } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { mlsFeeds, mlsListings, mlsMedia } from "../../drizzle/mlsSchema";
import { getMlsDb as getDb } from "./db";
import { sdk } from "../_core/sdk";
import { canAdminUsePermission } from "../routers/permissions";
import { licenseError } from "./license";

/**
 * MLS photos live in their own private bucket, never the public SavvyOS bucket.
 * Production uses a Railway Storage Bucket (private by default) through
 * MLS_MEDIA_ENDPOINT / MLS_MEDIA_REGION / MLS_MEDIA_ACCESS_KEY_ID /
 * MLS_MEDIA_SECRET_ACCESS_KEY, set as Railway variable references to the
 * bucket. Without an endpoint it falls back to AWS S3 with the default
 * credential chain, for a private AWS bucket with Block Public Access on.
 */
export function mediaClientConfig(env: NodeJS.ProcessEnv = process.env) {
  const endpoint = env.MLS_MEDIA_ENDPOINT?.trim() || undefined;
  const accessKeyId = env.MLS_MEDIA_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.MLS_MEDIA_SECRET_ACCESS_KEY?.trim();
  return {
    region: env.MLS_MEDIA_REGION?.trim() || (endpoint ? "auto" : env.AWS_REGION || "us-east-2"),
    endpoint,
    forcePathStyle: env.MLS_MEDIA_FORCE_PATH_STYLE === "true",
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  };
}

let cachedClient: S3Client | null = null;
function client() {
  cachedClient ??= new S3Client(mediaClientConfig());
  return cachedClient;
}

/** Null when private MLS media storage is usable; otherwise the reason it is not. */
export function privateMlsStorageError(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.MLS_MEDIA_BUCKET?.trim();
  if (!value || value === (env.AWS_BUCKET_NAME || "savvyos")) {
    return "MLS_MEDIA_BUCKET must name a dedicated private bucket; public SavvyOS storage is not allowed.";
  }
  const config = mediaClientConfig(env);
  if (config.endpoint && !config.credentials) {
    return "MLS_MEDIA_ENDPOINT is set, so MLS_MEDIA_ACCESS_KEY_ID and MLS_MEDIA_SECRET_ACCESS_KEY are required.";
  }
  return null;
}
function bucket() {
  const problem = privateMlsStorageError();
  if (problem) throw new Error(problem);
  return process.env.MLS_MEDIA_BUCKET!.trim();
}
export const privateMlsStorage = {
  async put(key: string, data: Buffer, contentType: string) {
    await client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: data, ContentType: contentType, CacheControl: "private, no-store" }));
    return { url: `/api/mls/media?key=${encodeURIComponent(key)}` };
  },
  async remove(key: string) {
    await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  },
  async get(key: string) {
    const response = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    if (!response.Body) throw new Error("Empty media object");
    return Buffer.from(await response.Body.transformToByteArray());
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
      const listingIdInput = typeof req.query.listingId === "string" ? req.query.listingId : "";
      const listingId = Number(listingIdInput);
      if (!/^[1-9]\d*$/.test(listingIdInput) || !Number.isSafeInteger(listingId)) { res.status(404).end(); return; }
      const db = await getDb();
      if (!db) { res.status(503).end(); return; }
      const [row] = await db.select({ feed: mlsFeeds }).from(mlsMedia, { forceIndex: ["mls_media_listing_idx"] })
        .innerJoin(mlsListings, eq(mlsListings.id, mlsMedia.listingId))
        .innerJoin(mlsFeeds, eq(mlsFeeds.id, mlsMedia.feedId))
        .where(and(eq(mlsMedia.listingId, listingId), eq(mlsMedia.s3Key, key), eq(mlsMedia.status, "stored"), isNull(mlsListings.removedFromFeedAt))).limit(1);
      if (!row || licenseError(row.feed)) { res.status(404).end(); return; }
      // URL expires in one minute. Never persist signed object URLs in the DB.
      const url = await getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: 60 });
      res.redirect(302, url);
    } catch {
      res.status(401).end();
    }
  });
}
