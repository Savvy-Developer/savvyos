import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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
 * Returns the file key and public S3 URL for a given relative key.
 */
export async function storageGet(relKey: string): Promise<{ key: string; url: string; }> {
  const key = normalizeKey(relKey);
  const bucketName = process.env.AWS_BUCKET_NAME || "savvyos";
  const region = process.env.AWS_REGION || "us-east-2";
  const url = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
  return { key, url };
}

