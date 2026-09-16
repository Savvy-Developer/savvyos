import { describe, expect, it } from "vitest";

import {
  clientIpFrom,
  fillMissingDays,
  summarize,
  viewDateKey,
  visitorHash,
} from "./websiteContentViews";

const base = {
  ip: "203.0.113.9",
  userAgent: "Mozilla/5.0",
  kind: "post" as const,
  contentId: 42,
  dateKey: "2026-09-16",
  secret: "test-secret",
};

describe("viewDateKey", () => {
  it("uses the business timezone rather than UTC", () => {
    // 01:30 UTC is still the previous evening in New York. Counting it as the
    // next day would split an American evening across two days on the chart.
    const lateEvening = new Date("2026-09-17T01:30:00Z");
    expect(viewDateKey(lateEvening)).toBe("2026-09-16");
  });

  it("rolls over at local midnight", () => {
    expect(viewDateKey(new Date("2026-09-17T04:30:00Z"))).toBe("2026-09-17");
  });
});

describe("visitorHash", () => {
  it("gives the same reader the same hash within a day and article", () => {
    expect(visitorHash(base)).toBe(visitorHash({ ...base }));
  });

  /**
   * The property that makes this safe to store. The date is part of the input,
   * so the same person is a different hash tomorrow and no reading history can
   * be assembled from the table.
   */
  it("cannot be followed across days", () => {
    expect(visitorHash(base)).not.toBe(
      visitorHash({ ...base, dateKey: "2026-09-17" })
    );
  });

  it("cannot be followed across articles", () => {
    expect(visitorHash(base)).not.toBe(
      visitorHash({ ...base, contentId: 43 })
    );
    expect(visitorHash(base)).not.toBe(
      visitorHash({ ...base, kind: "case_study" })
    );
  });

  it("separates different readers", () => {
    expect(visitorHash(base)).not.toBe(
      visitorHash({ ...base, ip: "203.0.113.10" })
    );
    expect(visitorHash(base)).not.toBe(
      visitorHash({ ...base, userAgent: "Safari" })
    );
  });

  it("never contains the address it was built from", () => {
    const hash = visitorHash(base)!;
    expect(hash).not.toContain("203.0.113.9");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("counts the view but not the reader when there is no address", () => {
    expect(visitorHash({ ...base, ip: null })).toBeNull();
    expect(visitorHash({ ...base, ip: "" })).toBeNull();
    expect(visitorHash({ ...base, ip: "   " })).toBeNull();
  });

  it("refuses to hash without a secret rather than using a predictable one", () => {
    expect(visitorHash({ ...base, secret: "" })).toBeNull();
  });
});

describe("clientIpFrom", () => {
  /**
   * The end of the chain matters. X-Forwarded-For is appended to on each hop,
   * so the last entry is the nearest proxy. Reading that end would give every
   * reader the same hash and report one reader forever.
   */
  it("takes the original caller, not the nearest proxy", () => {
    expect(clientIpFrom("203.0.113.9, 70.41.3.18, 150.172.238.178", "10.0.0.1")).toBe(
      "203.0.113.9"
    );
  });

  it("handles a single entry and stray whitespace", () => {
    expect(clientIpFrom("  203.0.113.9  ", "10.0.0.1")).toBe("203.0.113.9");
  });

  it("takes the first header when express gives an array", () => {
    expect(clientIpFrom(["203.0.113.9", "198.51.100.2"], "10.0.0.1")).toBe(
      "203.0.113.9"
    );
  });

  it("falls back to the socket address with no header", () => {
    expect(clientIpFrom(undefined, "10.0.0.1")).toBe("10.0.0.1");
  });

  it("returns nothing when there is nothing", () => {
    expect(clientIpFrom(undefined, undefined)).toBeNull();
    expect(clientIpFrom("", "")).toBeNull();
  });
});

describe("summarize", () => {
  const rows = [
    { dateKey: "2026-09-16", views: 12, readers: 7 },
    { dateKey: "2026-09-14", views: 3, readers: 3 },
    { dateKey: "2026-09-15", views: 0, readers: 0 },
  ];

  it("totals views and orders the days", () => {
    const result = summarize(rows);
    expect(result.views).toBe(15);
    expect(result.days.map(day => day.dateKey)).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
    ]);
  });

  it("adds readers per day rather than claiming a distinct count", () => {
    // Someone reading on two days counts twice, which is what the storage can
    // honestly support. The field is named readers for that reason.
    expect(summarize(rows).readers).toBe(10);
  });

  it("copes with nothing at all", () => {
    expect(summarize([])).toEqual({ views: 0, readers: 0, days: [] });
  });

  it("does not mutate the rows it was handed", () => {
    const input = [...rows];
    summarize(input);
    expect(input[0].dateKey).toBe("2026-09-16");
  });
});

describe("fillMissingDays", () => {
  it("puts zeroes in the gaps so quiet days are visible", () => {
    const result = fillMissingDays(
      [{ dateKey: "2026-09-14", views: 5, readers: 4 }],
      "2026-09-13",
      "2026-09-16"
    );
    expect(result.map(day => day.dateKey)).toEqual([
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
    ]);
    expect(result[0].views).toBe(0);
    expect(result[1].views).toBe(5);
  });

  it("returns a single day range unchanged", () => {
    const result = fillMissingDays([], "2026-09-16", "2026-09-16");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ dateKey: "2026-09-16", views: 0, readers: 0 });
  });

  it("hands back what it was given when the range is nonsense", () => {
    const rows = [{ dateKey: "2026-09-14", views: 5, readers: 4 }];
    expect(fillMissingDays(rows, "not-a-date", "2026-09-16")).toEqual(rows);
  });
});
