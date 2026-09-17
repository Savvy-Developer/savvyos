import { describe, expect, it } from "vitest";

import {
  attributionLine,
  moveTestimonial,
  normalizeTestimonial,
  normalizeTestimonials,
  publishedTestimonials,
} from "@shared/websiteTestimonials";

describe("normalizeTestimonial", () => {
  /**
   * The reason this module exists. The old editor stored rows as
   * "quote | name | role" and parsed with split("|"), so this quote arrived
   * truncated at "pipe" with the rest of the sentence gone and the name
   * wrong. Rows are rows now, and punctuation is just punctuation.
   */
  it("keeps a quote that contains the old delimiter", () => {
    const quote =
      "The spreadsheet had a pipe | character in it and Savvy still made the numbers make sense.";
    expect(normalizeTestimonial({ quote, name: "Dawn R." })?.quote).toBe(quote);
  });

  it("keeps a quote that spans several lines", () => {
    const quote = "First it was overwhelming.\n\nThen it was not.";
    expect(normalizeTestimonial({ quote, name: "Worley G." })?.quote).toBe(quote);
  });

  it("reads rows written before the field was renamed", () => {
    // Existing rows use `role`. Dropping them to rename a field would lose a
    // customer's words, which is not a trade worth making.
    const row = normalizeTestimonial({
      quote: "Worth it.",
      name: "Allie V.",
      role: "STR Investor",
    });
    expect(row?.title).toBe("STR Investor");
  });

  it("prefers the current field when a row carries both", () => {
    const row = normalizeTestimonial({
      quote: "Worth it.",
      name: "Allie V.",
      role: "old",
      title: "STR Investor",
    });
    expect(row?.title).toBe("STR Investor");
  });

  /**
   * An unattributed quote reads to a visitor as a real customer while being
   * impossible to check, so it is dropped rather than shown with a filler
   * name.
   */
  it("drops a quote with nobody attached", () => {
    expect(normalizeTestimonial({ quote: "Great service." })).toBeNull();
    expect(normalizeTestimonial({ quote: "Great service.", name: "   " })).toBeNull();
  });

  it("drops a name with no quote", () => {
    expect(normalizeTestimonial({ name: "Davis E." })).toBeNull();
  });

  it("never invents a title, a location or a rating", () => {
    const row = normalizeTestimonial({ quote: "Good.", name: "Sowmya G." })!;
    expect(row.title).toBeUndefined();
    expect(row.location).toBeUndefined();
    expect(row).not.toHaveProperty("rating");
  });

  it("ignores rubbish instead of throwing", () => {
    expect(normalizeTestimonial(null)).toBeNull();
    expect(normalizeTestimonial("a string")).toBeNull();
    expect(normalizeTestimonial({ quote: 5, name: 7 })).toBeNull();
    expect(normalizeTestimonials("not an array")).toEqual([]);
    expect(normalizeTestimonials(undefined)).toEqual([]);
  });
});

describe("publishedTestimonials", () => {
  const rows = [
    { quote: "One.", name: "A" },
    { quote: "Two.", name: "B", published: false },
    { quote: "Three.", name: "C", published: true },
  ];

  it("hides drafts and keeps the studio's order", () => {
    expect(publishedTestimonials(rows).map(row => row.name)).toEqual(["A", "C"]);
  });

  /**
   * Absent means published, so the rows already in the database stay on the
   * site rather than all disappearing the moment this ships.
   */
  it("treats a row with no flag as published", () => {
    expect(publishedTestimonials([{ quote: "One.", name: "A" }])).toHaveLength(1);
  });
});

describe("attributionLine", () => {
  it("joins what is there", () => {
    expect(
      attributionLine({ quote: "q", name: "n", title: "STR Investor", location: "Asheville, NC" })
    ).toBe("STR Investor · Asheville, NC");
  });

  it("uses whichever one exists", () => {
    expect(attributionLine({ quote: "q", name: "n", title: "STR Investor" })).toBe(
      "STR Investor"
    );
    expect(attributionLine({ quote: "q", name: "n", location: "Asheville, NC" })).toBe(
      "Asheville, NC"
    );
  });

  /**
   * Null rather than an empty string, so the caller omits the line instead of
   * rendering a stray separator or a made-up label.
   */
  it("returns nothing when there is nothing", () => {
    expect(attributionLine({ quote: "q", name: "n" })).toBeNull();
    expect(attributionLine({ quote: "q", name: "n", title: "", location: "" })).toBeNull();
  });
});

describe("moveTestimonial", () => {
  const rows = ["a", "b", "c"];

  it("moves a row up and down", () => {
    expect(moveTestimonial(rows, 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveTestimonial(rows, 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("leaves the list alone for a move that goes nowhere", () => {
    expect(moveTestimonial(rows, 1, 1)).toEqual(rows);
    expect(moveTestimonial(rows, -1, 0)).toEqual(rows);
    expect(moveTestimonial(rows, 0, 3)).toEqual(rows);
    expect(moveTestimonial([], 0, 1)).toEqual([]);
  });

  it("does not mutate the list it was given", () => {
    const input = [...rows];
    moveTestimonial(input, 0, 2);
    expect(input).toEqual(rows);
  });
});
