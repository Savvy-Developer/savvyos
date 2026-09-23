/**
 * Turndown rules that turn an HTML table into a markdown pipe table.
 *
 * Turndown on its own has no idea what a table is and flattens it to one run
 * of text. The public site renders pipe tables (marked, GFM), and the
 * articles imported from the old site carry them, so the editor has to
 * write them back the same way or an opened-and-saved post loses its tables.
 *
 * Kept free of any editor import so a plain node test can exercise it.
 */

// Turndown types a rule's filter as keyof HTMLElementTagNameMap, so a plain
// `string` here is wider than what it accepts and a real TurndownService is
// then not assignable to TurndownLike. Narrowed to the tags these rules use.
type TableTag = "table" | "thead" | "tbody" | "tfoot" | "tr" | "th" | "td";

type Rule = {
  filter: TableTag | TableTag[];
  replacement: (content: string, node: unknown) => string;
};

type TurndownLike = { addRule: (name: string, rule: Rule) => unknown };

const cell = (content: string) =>
  content.replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();

export function addMarkdownTableRules(turndown: TurndownLike): void {
  turndown.addRule("tableCell", {
    filter: ["th", "td"],
    replacement: content => ` ${cell(content)} |`,
  });
  turndown.addRule("tableRow", {
    filter: "tr",
    replacement: (content, node) => {
      const row = node as { children: { length: number }; closest?: (s: string) => any; parentNode?: any };
      const line = `|${content}\n`;
      // The first row of the table is the header, whether or not the source
      // wrapped it in <thead>. Markdown needs the --- line under it.
      const table = row.closest ? row.closest("table") : null;
      const firstRow = table ? table.querySelector("tr") : null;
      if (firstRow && firstRow !== node) return line;
      const columns = row.children.length;
      return `${line}|${Array.from({ length: columns }, () => " --- |").join("")}\n`;
    },
  });
  turndown.addRule("table", {
    filter: "table",
    replacement: content => `\n\n${content.trim()}\n\n`,
  });
  turndown.addRule("tableSection", {
    filter: ["thead", "tbody", "tfoot"],
    replacement: content => content,
  });
}
