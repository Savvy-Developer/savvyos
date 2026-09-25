import { describe, expect, it } from "vitest";

import {
  brokenImageRefs,
  decodeDataImage,
  extensionFor,
  markdownImageUrls,
  movedImageKey,
  replaceImageUrls,
  shouldMoveImage,
} from "./websiteImageRehostLogic";

const OLD = "https://wvgbegmtbvkcfdzvvfnk.supabase.co/storage/v1/object/public/blog-images/a.jpg";

describe("shouldMoveImage", () => {
  it("moves old-site, Google-hosted and embedded images", () => {
    expect(shouldMoveImage(OLD)).toBe(true);
    expect(shouldMoveImage("https://lh3.googleusercontent.com/a/photo")).toBe(true);
    expect(shouldMoveImage("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
  });

  it("leaves our own storage, Unsplash and anything odd alone", () => {
    expect(shouldMoveImage("https://savvyos.s3.us-east-2.amazonaws.com/website/1/a.png")).toBe(false);
    expect(shouldMoveImage("https://images.unsplash.com/photo-1")).toBe(false);
    expect(shouldMoveImage("PASTE_IMAGE_URL_HERE")).toBe(false);
    expect(shouldMoveImage(null)).toBe(false);
    expect(shouldMoveImage("https://evil.supabase.co.example.com/x.jpg")).toBe(false);
  });
});

describe("markdownImageUrls and brokenImageRefs", () => {
  const body = `Intro\n\n![Chart](${OLD})\n\n![x](data:image/png;base64,iVBORw0KGgo=)\n\n![y](PASTE_HONEST_MATH_IMAGE_URL_HERE "t")\n\n[a link](https://x.com)`;

  it("finds every image, not links", () => {
    expect(markdownImageUrls(body)).toEqual([
      OLD,
      "data:image/png;base64,iVBORw0KGgo=",
      "PASTE_HONEST_MATH_IMAGE_URL_HERE",
    ]);
  });

  it("reports only references that can never load", () => {
    expect(brokenImageRefs(body)).toEqual(["PASTE_HONEST_MATH_IMAGE_URL_HERE"]);
  });
});

describe("replaceImageUrls", () => {
  it("swaps every copy of a moved address and keeps the rest", () => {
    const body = `![a](${OLD}) and again ![b](${OLD}) and ![c](https://images.unsplash.com/p)`;
    const out = replaceImageUrls(body, new Map([[OLD, "https://savvyos.s3/new.jpg"]]));
    expect(out).toBe(
      "![a](https://savvyos.s3/new.jpg) and again ![b](https://savvyos.s3/new.jpg) and ![c](https://images.unsplash.com/p)"
    );
  });
});

describe("movedImageKey", () => {
  it("is stable for the same source, so a rerun writes the same file", () => {
    expect(movedImageKey(OLD, "image/jpeg")).toBe(movedImageKey(OLD, "image/jpeg"));
    expect(movedImageKey(OLD, "image/jpeg")).toMatch(/^website\/migrated\/[0-9a-f]{24}\.jpg$/);
    expect(movedImageKey(OLD + "?v=2", "image/png")).not.toBe(movedImageKey(OLD, "image/png"));
  });

  it("picks the extension from the type", () => {
    expect(extensionFor("image/webp")).toBe("webp");
    expect(extensionFor("image/png; charset=binary")).toBe("png");
    expect(extensionFor(null)).toBe("jpg");
  });
});

describe("decodeDataImage", () => {
  it("reads an embedded image", () => {
    const decoded = decodeDataImage("data:image/png;base64,iVBORw0KGgo=")!;
    expect(decoded.contentType).toBe("image/png");
    expect(decoded.bytes.length).toBe(8);
  });

  it("rejects anything else", () => {
    expect(decodeDataImage("data:text/html;base64,PGI+")).toBe(null);
    expect(decodeDataImage("not a data uri")).toBe(null);
  });
});
