import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const projectsPage = readFileSync(
  path.join(root, "client/src/pages/ProjectsPage.tsx"),
  "utf8"
);
const projectDetailPage = readFileSync(
  path.join(root, "client/src/pages/ProjectDetailPage.tsx"),
  "utf8"
);
const pageHeader = readFileSync(
  path.join(root, "client/src/components/PageHeader.tsx"),
  "utf8"
);

describe("Projects responsive layout", () => {
  it("keeps the Projects workspace controls usable at narrow widths", () => {
    expect(pageHeader).toContain("flex w-full min-w-0 items-center");
    expect(projectsPage).toContain("grid w-full grid-cols-2 gap-1");
    expect(projectsPage).toContain("min-w-0 whitespace-normal");
    expect(projectsPage).toContain("flex flex-col gap-2 sm:flex-row sm:gap-3");
    expect(projectsPage).toContain(
      "grid grid-cols-1 gap-2 min-[420px]:grid-cols-2"
    );
    expect(projectsPage).toContain("h-8 w-full text-xs sm:w-36");
  });

  it("wraps project rows instead of allowing their metadata to crowd titles", () => {
    expect(projectsPage).toContain("flex min-w-0 flex-wrap items-center");
    expect(projectsPage).toContain("basis-full text-sm font-medium");
    expect(projectsPage).toContain("sm:ml-auto sm:flex-nowrap sm:gap-3");
    expect(projectsPage).toContain("hidden max-w-36 shrink-0 truncate");
    expect(projectsPage).not.toContain("MoreHorizontal");
    expect(projectsPage).not.toContain("ChevronRight");
  });

  it("uses an adaptive project detail tab layout before horizontal scrolling", () => {
    expect(projectDetailPage).toContain(
      "grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-3 lg:flex lg:gap-0 lg:overflow-x-auto"
    );
    expect(projectDetailPage).toContain(
      "h-auto min-h-9 min-w-0 whitespace-normal px-2 text-center text-xs leading-tight"
    );
    expect(projectDetailPage).toContain("flex flex-col gap-3 sm:flex-row");
  });
});
