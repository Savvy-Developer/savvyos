import { describe, expect, it } from "vitest";
import TurndownService from "turndown";
import { marked } from "marked";

import { addMarkdownTableRules } from "@shared/markdownTables";

const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });
addMarkdownTableRules(turndown);

const TABLE = ["| Window | ADR | Occ. |", "| --- | --- | --- |", "| First 90 days | $1,305 | 34% |", "| A year later | $1,427 | 88% |"].join("\n");

describe("markdown tables in the editor", () => {
  it("survives a round trip through HTML and back", () => {
    const html = marked.parse(TABLE, { async: false }) as string;
    expect(html).toContain("<table>");
    const back = turndown.turndown(html);
    expect(back.trim()).toBe(TABLE);
  });

  it("still renders on the public site after the round trip", () => {
    const twice = turndown.turndown(marked.parse(TABLE, { async: false }) as string);
    const html = marked.parse(twice, { async: false }) as string;
    expect((html.match(/<tr>/g) || []).length).toBe(3);
  });

  it("escapes a pipe inside a cell so it does not split the row", () => {
    const html = "<table><tr><th>Name</th><th>Note</th></tr><tr><td>A</td><td>x | y</td></tr></table>";
    expect(turndown.turndown(html)).toContain("| A | x \\| y |");
  });

  it("does not touch text outside a table", () => {
    const md = "# Title\n\nA paragraph.\n\n- one\n- two";
    expect(turndown.turndown(marked.parse(md, { async: false }) as string)).toBe(md);
  });
});
