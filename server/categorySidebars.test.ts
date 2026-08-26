import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const pagesDirectory = path.resolve(process.cwd(), "client/src/pages");
const knowledgeBaseSource = readFileSync(path.join(pagesDirectory, "KnowledgeBasePage.tsx"), "utf8");
const passwordsSource = readFileSync(path.join(pagesDirectory, "PasswordsPage.tsx"), "utf8");

describe("resource category sidebars", () => {
  it("keeps Knowledge Base category labels readable while preserving type badges", () => {
    expect(knowledgeBaseSource).toContain("flex-col sm:flex-row");
    expect(knowledgeBaseSource).toContain("sm:w-fit sm:min-w-64 sm:max-w-[28rem]");
    expect(knowledgeBaseSource).toContain("break-words text-sm leading-5");
    expect(knowledgeBaseSource).toContain("TYPE_LABELS[cat.type]");
    expect(knowledgeBaseSource).not.toContain("<span className=\"text-sm truncate\">{cat.name}</span>");
  });

  it("uses a bounded content-sized Passwords category column that wraps long future labels", () => {
    expect(passwordsSource).toContain("lg:grid-cols-[fit-content(28rem)_minmax(0,1fr)]");
    expect(passwordsSource).toContain("block break-words leading-5");
    expect(passwordsSource).toContain("<div className=\"min-w-0\">");
    expect(passwordsSource).not.toContain("<span className=\"block truncate\">{list.name}</span>");
  });
});
