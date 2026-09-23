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
    // Compared against a Turndown with no table rules rather than against the
    // source markdown: stock Turndown pads a list marker to four columns, so
    // asserting equality with the source would be testing Turndown's own
    // formatting rather than whether these rules leave non-table text alone.
    const plain = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });
    const html = marked.parse("# Title\n\nA paragraph.\n\n- one\n- two", { async: false }) as string;
    expect(turndown.turndown(html)).toBe(plain.turndown(html));
  });
});
