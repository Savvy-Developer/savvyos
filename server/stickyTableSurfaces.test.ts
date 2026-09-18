import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const clientRoot = join(process.cwd(), "client", "src");
const tablePrimitive = readFileSync(
  join(clientRoot, "components", "ui", "table.tsx"),
  "utf8"
);
const globalStyles = readFileSync(join(clientRoot, "index.css"), "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}

function stickyTableElements(source: string): string[] {
  return (
    source.match(
      /<(?:thead|TableHead|TableCell|td)\b[^>]*className=["'][^"']*\bsticky\b[^"']*["'][^>]*>/g
    ) ?? []
  );
}

function stickyElements(source: string): string[] {
  return (
    source.match(
      /<\w+\b[^>]*className=["'][^"']*\bsticky\b[^"']*["'][^>]*>/g
    ) ?? []
  );
}

describe("sticky table surfaces", () => {
  it("uses separated borders in the shared table primitive", () => {
    expect(tablePrimitive).toContain("border-separate border-spacing-0");
  });

  it("defines opaque sticky surface utilities", () => {
    expect(globalStyles).toContain(".sticky-surface {");
    expect(globalStyles).toContain(".sticky-surface-muted {");
    expect(globalStyles).toContain(".sticky-surface-background {");
    expect(globalStyles).toContain(".sticky-table {");
    expect(globalStyles).toMatch(
      /\.sticky-surface\s*\{[^}]*background-color:\s*var\(--card\)/
    );
  });

  it("requires every sticky table header or cell to use an opaque surface", () => {
    const violations = sourceFiles(clientRoot).flatMap(path => {
      const source = readFileSync(path, "utf8");
      return stickyTableElements(source)
        .filter(element => !element.includes("sticky-surface"))
        .map(element => `${path.replace(`${process.cwd()}/`, "")}: ${element}`);
    });

    expect(violations).toEqual([]);
  });

  it("does not allow translucent background or blur classes on sticky surfaces", () => {
    const violations = sourceFiles(clientRoot).flatMap(path => {
      const source = readFileSync(path, "utf8");
      return stickyElements(source)
        .filter(element => /\bbg-[^\s"']+\/|\bbackdrop-blur/.test(element))
        .map(element => `${path.replace(`${process.cwd()}/`, "")}: ${element}`);
    });

    expect(violations).toEqual([]);
  });
});
