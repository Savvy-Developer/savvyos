import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Configure AWS S3 Client using credentials from process.env
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

/**
 * Uploads a file buffer directly to AWS S3 and returns the key and public URL.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const bucketName = process.env.AWS_BUCKET_NAME || "savvyos";
  const region = process.env.AWS_REGION || "us-east-2";

  let body: Buffer;
  if (typeof data === "string") {
    body = Buffer.from(data);
  } else if (data instanceof Uint8Array) {
    body = Buffer.from(data);
  } else {
    body = data;
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await s3Client.send(command);

  // Construct standard AWS S3 public access URL
  const url = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
  return { key, url };
}

/**
 * Stores a private application document. Callers must return it only through
 * an authorized signed URL or an authenticated download endpoint.
 */
export async function storagePutPrivate(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string }> {
  const key = normalizeKey(relKey);
  const bucketName = process.env.AWS_BUCKET_NAME || "savvyos";
  const body =
    typeof data === "string"
      ? Buffer.from(data)
      : data instanceof Uint8Array
        ? Buffer.from(data)
        : data;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: "private",
    })
  );
  return { key };
}

/** Returns the file key and public S3 URL for a given relative key. */
export async function storageGet(relKey: string): Promise<{ key: string; url: string; }> {
  const key = normalizeKey(relKey);
  const bucketName = process.env.AWS_BUCKET_NAME || "savvyos";
  const region = process.env.AWS_REGION || "us-east-2";
  const url = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
  return { key, url };
}

/**
 * Creates a short-lived private read URL after the caller has performed its
 * own record-level authorization. Do not use this for public site media.
 */
export async function storageGetSignedUrl(
  relKey: string,
  expiresIn = 300
): Promise<string> {
  const key = normalizeKey(relKey);
  const bucketName = process.env.AWS_BUCKET_NAME || "savvyos";
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: bucketName, Key: key }),
    { expiresIn }
  );
}

/** Deletes one application-owned object from S3. */
export async function storageDelete(relKey: string): Promise<void> {
  const bucketName = process.env.AWS_BUCKET_NAME || "savvyos";
  await s3Client.send(new DeleteObjectCommand({
    Bucket: bucketName,
    Key: normalizeKey(relKey),
  }));
}
