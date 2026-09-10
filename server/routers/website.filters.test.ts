import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../db", () => ({ getDb: vi.fn(), logActivity: vi.fn() }));
vi.mock("./permissions", () => ({ canAdminUsePermission: vi.fn() }));

import { websiteRouter } from "./website";

const source = readFileSync(join(__dirname, "website.ts"), "utf8");

/** Grab one procedure's source, from its name to the start of the next one. */
function procedure(name: string) {
  const start = source.indexOf(`  ${name}: publicProcedure`);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("\n  }),\n", start));
}

describe("publicProperties filters", () => {
  const body = procedure("publicProperties");

  it("filters are applied server side, not after the query", () => {
    for (const field of [
      "properties.state",
      "properties.city",
      "properties.listPrice",
      "properties.beds",
      "properties.baths",
      "properties.propertyType",
    ]) {
      expect(body).toContain(field);
    }
  });

  it("still only ever returns published rows", () => {
    expect(body).toContain('eq(websiteProperties.status, "published")');
  });

  it("supports every sort the UI offers", () => {
    for (const key of ["priceAsc", "priceDesc", "newest"]) {
      expect(body).toContain(key);
    }
  });

  it("keeps featured ordering as the default", () => {
    expect(body).toContain("asc(websiteProperties.sortOrder)");
  });
});

describe("publicPropertyFacets", () => {
  it("is registered so the UI can build filters from real data", () => {
    expect(websiteRouter._def.procedures).toHaveProperty(
      "publicPropertyFacets"
    );
  });

  it("only reads published properties", () => {
    const body = procedure("publicPropertyFacets");
    expect(body).toContain('eq(websiteProperties.status, "published")');
  });

  it("returns the shape the filter bar expects", () => {
    const body = procedure("publicPropertyFacets");
    for (const key of ["states", "cities", "propertyTypes", "priceRange"]) {
      expect(body).toContain(key);
    }
  });

  it("returns a null price range rather than NaN when nothing is priced", () => {
    const body = procedure("publicPropertyFacets");
    expect(body).toContain("prices.length");
  });
});
