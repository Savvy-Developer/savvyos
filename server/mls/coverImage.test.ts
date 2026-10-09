import { randomBytes } from "crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { COVER_MAX_EDGE, COVER_SHRINK_ABOVE_BYTES, shrinkCover } from "./coverImage";

/** Random pixels compress poorly, so this stands in for a multi-megabyte MLS original. */
function noise(width: number, height: number, format: "jpeg" | "png" = "jpeg") {
  const image = sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } });
  return (format === "png" ? image.png() : image.jpeg({ quality: 92 })).toBuffer();
}

describe("cover photo scaling", () => {
  it("scales a large original down to a 1024 px long edge in proportion, as JPEG", async () => {
    const original = await noise(2400, 1600);
    expect(original.length).toBeGreaterThan(COVER_SHRINK_ABOVE_BYTES);
    const cover = await shrinkCover(original, "image/jpeg; charset=binary");
    expect(cover.resized).toBe(true);
    expect(cover.contentType).toBe("image/jpeg");
    expect(cover.data.length).toBeLessThan(original.length / 3);
    const meta = await sharp(cover.data).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([COVER_MAX_EDGE, 683, "jpeg"]);
  });

  it("keeps portrait proportions and never crops", async () => {
    const cover = await shrinkCover(await noise(1500, 3000), "image/jpeg");
    const meta = await sharp(cover.data).metadata();
    expect([meta.width, meta.height]).toEqual([512, COVER_MAX_EDGE]);
  });

  it("stores a cover that is already small exactly as received", async () => {
    const original = await sharp({ create: { width: 800, height: 533, channels: 3, background: "#88aacc" } }).jpeg().toBuffer();
    const cover = await shrinkCover(original, "image/jpeg");
    expect(cover.resized).toBe(false);
    expect(cover.data).toBe(original);
  });

  it("re-encodes a heavy cover within the size limit without enlarging it", async () => {
    const original = await noise(1000, 700, "png");
    expect(original.length).toBeGreaterThan(COVER_SHRINK_ABOVE_BYTES);
    const cover = await shrinkCover(original, "image/png");
    expect(cover.resized).toBe(true);
    const meta = await sharp(cover.data).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1000, 700, "jpeg"]);
  });

  it("falls back to the original for bytes it cannot decode or types it does not scale", async () => {
    const junk = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
    expect(await shrinkCover(junk, "image/jpeg")).toEqual({ data: junk, contentType: "image/jpeg", resized: false });
    const gif = Buffer.from("GIF89a");
    expect((await shrinkCover(gif, "image/gif")).data).toBe(gif);
  });

  it("finishes every cover when more arrive at once than scale at a time", async () => {
    const original = await noise(1600, 1200);
    const junk = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => shrinkCover(index % 3 ? original : junk, "image/jpeg")));
    expect(results.filter(result => result.resized)).toHaveLength(8);
    expect(results.filter(result => !result.resized).every(result => result.data === junk)).toBe(true);
  });
});
