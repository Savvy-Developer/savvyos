import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const clientRoot = join(process.cwd(), "client", "src");
const tablePrimitive = readFileSync(
  join(clientRoot, "components", "ui", "table.tsx"),
  "utf8"
);
const globalStyles = readFileSync(join(clientRoot, "index.css"), "utf8");
const superPermissionsPage = readFileSync(
  join(clientRoot, "pages", "SuperPermissionsPage.tsx"),
  "utf8"
);

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

  it("renders the Super Matrix with independent frozen grid panes, not sticky table cells", () => {
    const matrixSource = superPermissionsPage.slice(
      superPermissionsPage.indexOf("data-super-permissions-matrix"),
      superPermissionsPage.indexOf("</TabsContent>", superPermissionsPage.indexOf("data-super-permissions-matrix"))
    );

    expect(matrixSource).toContain("matrixGridTemplateColumns");
    expect(matrixSource).toContain("isolate max-h-[62vh] overflow-auto bg-card");
    expect(matrixSource).toContain("sticky top-0 left-0 z-[60]");
    expect(matrixSource).toContain("min-w-max -mt-[76px]");
    expect(matrixSource).toContain("sticky top-0 z-50 grid isolate border-b bg-card");
    expect(matrixSource).toContain("before:absolute before:inset-0 before:z-0 before:bg-card");
    expect(matrixSource).toContain("sticky left-0 z-20");
    expect(matrixSource).toContain("relative z-0 divide-y");
    expect(matrixSource).not.toMatch(/<(?:table|TableHead|TableCell|TableRow)\b/);
  });
});
