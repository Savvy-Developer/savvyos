import fs from "node:fs/promises";

const files = [
  "/home/ubuntu/savvyos/client/src/pages/PulseFoundationPage.tsx",
  "/home/ubuntu/savvyos/client/src/pages/PulseWorkItemsPage.tsx",
];
const output = "/home/ubuntu/savvyos/docs/pulse_work_items_readability_report.json";

function syllables(word: string) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return 0;
  const groups = clean.match(/[aeiouy]+/g)?.length ?? 1;
  return Math.max(1, clean.endsWith("e") && groups > 1 ? groups - 1 : groups);
}

function grade(text: string) {
  const sentences = Math.max(1, (text.match(/[.!?]+/g) ?? []).length);
  const words = text.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  const wordCount = Math.max(1, words.length);
  const syllableCount = words.reduce((sum, word) => sum + syllables(word), 0);
  return 0.39 * (wordCount / sentences) + 11.8 * (syllableCount / wordCount) - 15.59;
}

function isUserFacing(value: string) {
  const technicalTokens = ["/", "className", "pulse_", "aria-", "http", "meetingId", "text-", "bg-", "border", "flex", "grid", "h-", "w-", "px-", "py-", "sm:", "focus-", "hover-", "rounded", "truncate", "transition", "items-", "max-", "lucide-", "underline", "decoration-", "space-", "gap-", "${", "label[]", "owner\" |", "member\"", "=>", "{", "}", "??", "item.", "event.", "input.", "mutate", "onClick", "onChange", "defaultValue", "class=", "variant=", "type="];
  const words = value.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  return value.length >= 12
    && words.length >= 4
    && value.includes(" ")
    && /[A-Za-z]/.test(value)
    && !technicalTokens.some((token) => value.includes(token));
}

const findings: Array<{ file: string; text: string; grade: number }> = [];
for (const file of files) {
  const source = await fs.readFile(file, "utf8");
  const strings = [...source.matchAll(/(["'`])([^\n]{8,}?)\1/g)].map((match) => match[2]);
  const jsxText = [...source.matchAll(/>([^<>{}\n]{8,})</g)].map((match) => match[1].trim());
  for (const text of [...strings, ...jsxText]) {
    if (isUserFacing(text)) findings.push({ file: file.split("/").pop() ?? file, text, grade: Number(grade(text).toFixed(1)) });
  }
}

const deduplicated = [...new Map(findings.map((finding) => [`${finding.file}:${finding.text}`, finding])).values()];
const report = {
  checkedAt: new Date().toISOString(),
  checkedStringCount: deduplicated.length,
  stringsAboveGrade8: deduplicated.filter((finding) => finding.grade > 8),
  allStrings: deduplicated,
};
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ checkedStringCount: report.checkedStringCount, stringsAboveGrade8: report.stringsAboveGrade8, output }, null, 2));
