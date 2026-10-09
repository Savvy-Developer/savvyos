/**
 * Cover photos feed the search cards, the map popups, and the detail-page
 * fallback, so a copy needs at most a 1024 px long edge. Some MLSs send
 * multi-megabyte originals (MIBOR covers average about 2 MB, against 165 KB on
 * MARIS), which made a 12-card page pull more than 20 MB of images.
 *
 * The copy is scaled down in proportion only: no crop, no overlay, no edits,
 * so watermarks and branding in the image stay intact. Anything that cannot be
 * decoded, or that would not get smaller, is stored exactly as received.
 */
export const COVER_MAX_EDGE = 1024;
export const COVER_JPEG_QUALITY = 80;
/** Covers at or under this size and edge are stored untouched. */
export const COVER_SHRINK_ABOVE_BYTES = 350 * 1024;

const SHRINKABLE = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif"]);

type SharpFactory = (input: Buffer, options?: Record<string, unknown>) => any;
let sharpLoader: Promise<SharpFactory | null> | null = null;
/** sharp is native; if it ever fails to load, covers are stored as received. */
function loadSharp(): Promise<SharpFactory | null> {
  sharpLoader ??= import("sharp")
    .then(module => ((module as any).default ?? module) as SharpFactory)
    .catch(error => {
      console.error("[mls] sharp unavailable; covers are stored at original size", error);
      return null;
    });
  return sharpLoader;
}

export type CoverImage = { data: Buffer; contentType: string; resized: boolean };

/**
 * Downloads run up to 64 at a time; decoding that many large photos at once
 * would spike worker memory. Four scale at a time (about 40 covers a second).
 */
const MAX_SCALING = 4;
let scaling = 0;
const waiting: Array<() => void> = [];
async function withScaleSlot<T>(run: () => Promise<T>): Promise<T> {
  if (scaling >= MAX_SCALING) await new Promise<void>(resolve => waiting.push(resolve));
  else scaling += 1;
  try {
    return await run();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else scaling -= 1;
  }
}

export async function shrinkCover(data: Buffer, contentType: string): Promise<CoverImage> {
  const type = contentType.split(";")[0].trim().toLowerCase();
  const original: CoverImage = { data, contentType: type, resized: false };
  if (!SHRINKABLE.has(type) || data.length === 0) return original;
  const sharp = await loadSharp();
  if (!sharp) return original;
  return withScaleSlot(() => scale(sharp, data, original));
}

async function scale(sharp: SharpFactory, data: Buffer, original: CoverImage): Promise<CoverImage> {
  try {
    const image = sharp(data, { failOn: "error", limitInputPixels: 100_000_000 });
    const meta = await image.metadata();
    const width = Number(meta.width ?? 0);
    const height = Number(meta.height ?? 0);
    if (!width || !height) return original;
    // Animated images are left alone; a cover is a still photo.
    if (Number(meta.pages ?? 1) > 1) return original;
    const oversized = Math.max(width, height) > COVER_MAX_EDGE;
    if (!oversized && data.length <= COVER_SHRINK_ABOVE_BYTES) return original;
    const output: Buffer = await image
      // Applies the camera's EXIF orientation so the scaled copy is upright.
      .rotate()
      .resize({ width: COVER_MAX_EDGE, height: COVER_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      // A transparent PNG cover gets a white background, not black.
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: COVER_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    if (!output.length || output.length >= data.length) return original;
    return { data: output, contentType: "image/jpeg", resized: true };
  } catch {
    return original;
  }
}
