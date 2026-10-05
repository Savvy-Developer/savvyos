/**
 * "Write with AI" for the website editors (1 Oct call with Tyler): the meta
 * title and meta description of a property listing or blog post, and a case
 * study's excerpt, written from everything SavvyOS knows about it: the
 * property's facts, the linked pro-forma's base-case numbers, the listing
 * text (often the Zillow description), and the post or story itself.
 *
 * The pure part (building the request, reading the answer) is here so it can
 * be tested; the router gathers the data and calls the model.
 */
import { invokeLLM } from "./_core/llm";

/**
 * "case" writes a case study's excerpt (one field); "caseSeo" writes its meta
 * title and meta description, like a property or a post.
 */
export type SeoKind = "property" | "post" | "case" | "caseSeo";

/** Search engines cut titles near 60 characters and descriptions near 155. */
export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 155;
export const CASE_EXCERPT_MAX = 300;

export type SeoContext = {
  kind: SeoKind;
  /** Whatever is known, as plain label: value pairs. Empty values are dropped. */
  facts: Record<string, unknown>;
  /** Long text (listing summary, post body), already plain text. */
  text?: string | null;
};

export type SeoResult = { metaTitle: string; metaDescription: string };

/** HTML or markdown to plain text, for the model. */
export function plainText(value: unknown, max = 6000): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#*_>`]+/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanFacts(facts: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(facts)) {
    if (value == null) continue;
    const text = Array.isArray(value) ? value.filter(Boolean).join(", ") : String(value).trim();
    if (text && text !== "0" && text.toLowerCase() !== "null") out[key] = text;
  }
  return out;
}

const RULES = [
  "Use only the facts given. Never invent a number, amenity, location or return.",
  "Any revenue or return figure is a projection: call it projected or estimated, never a promise.",
  "Write for short-term rental (STR) investors searching Google.",
  "Plain, specific, no hype words like 'stunning' or 'must-see', no emoji, no em dashes, no quotation marks around the text.",
  "No claims about who the property suits based on family status, religion, race, disability or other protected traits.",
];

/** The chat messages for one request. */
export function buildSeoMessages(context: SeoContext) {
  const facts = cleanFacts(context.facts);
  const subject =
    context.kind === "property"
      ? "a short-term rental property listed for sale on Savvy STR Agents (savvy-agents.com)"
      : context.kind === "post"
        ? "a blog article on Savvy STR Agents (savvy-agents.com), a real estate team for short-term rental investors"
        : "a client case study on Savvy STR Agents (savvy-agents.com), a real estate team for short-term rental investors. Never name the client or give a street address";
  const ask =
    context.kind === "case"
      ? `Return JSON: {"metaTitle": "", "metaDescription": "<a ${CASE_EXCERPT_MAX}-character-or-shorter excerpt: 1 to 2 sentences that make an investor want to read the story, leading with the result when the facts give one>"}.`
      : `Return JSON: {"metaTitle": "<at most ${SEO_TITLE_MAX} characters${
          context.kind === "property" ? ", include the city and state" : ""
        }>", "metaDescription": "<${SEO_DESCRIPTION_MAX - 25} to ${SEO_DESCRIPTION_MAX} characters, one or two sentences${
          context.kind === "property"
            ? ", mention the projected revenue or return when given"
            : context.kind === "caseSeo"
              ? ", lead with the result the client got when the facts give one"
              : ""
        }>"}.`;
  return [
    {
      role: "system" as const,
      content: [`You write search listing text for ${subject}.`, ...RULES, ask, "Return only the JSON object."].join(" "),
    },
    {
      role: "user" as const,
      content: JSON.stringify({ facts, text: context.text ? plainText(context.text) : undefined }),
    },
  ];
}

/** Trim to a limit at a word boundary, without a dangling comma or dash. */
export function fitTo(text: string, max: number): string {
  const clean = text.replace(/—|–/g, ",").replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : clean.slice(0, max)).replace(/[\s,;:-]+$/, "").trim();
}

/** Read the model's answer. Tolerates code fences and stray text around the JSON. */
export function parseSeoAnswer(content: unknown, kind: SeoKind): SeoResult {
  const raw = typeof content === "string" ? content : "";
  const match = raw.match(/\{[\s\S]*\}/);
  let parsed: any = null;
  try {
    parsed = match ? JSON.parse(match[0]) : null;
  } catch {
    parsed = null;
  }
  const title = typeof parsed?.metaTitle === "string" ? parsed.metaTitle : "";
  const description = typeof parsed?.metaDescription === "string" ? parsed.metaDescription : "";
  if (!title.trim() && !description.trim()) throw new Error("The AI answer could not be read. Try again.");
  return {
    metaTitle: fitTo(title, SEO_TITLE_MAX + 10),
    metaDescription: fitTo(description, kind === "case" ? CASE_EXCERPT_MAX : SEO_DESCRIPTION_MAX + 10),
  };
}

export async function writeSeoText(context: SeoContext): Promise<SeoResult> {
  // gpt-5-mini spends max_completion_tokens on reasoning before it writes
  // anything, so a small budget returns a 200 with empty content. Minimal
  // effort plus a larger budget leaves room for the answer itself.
  const response = await invokeLLM({
    messages: buildSeoMessages(context),
    model: "gpt-5-mini",
    reasoning: { effort: "minimal" },
    responseFormat: { type: "json_object" },
    maxTokens: 1200,
    timeoutMs: 30_000,
  });
  return parseSeoAnswer(response.choices[0]?.message?.content, context.kind);
}

/** At most this many AI writes per person per minute. */
const PER_MINUTE = 12;
const recent = new Map<number, number[]>();
export function allowSeoWrite(userId: number, now = Date.now()): boolean {
  const kept = (recent.get(userId) ?? []).filter(at => now - at < 60_000);
  if (kept.length >= PER_MINUTE) {
    recent.set(userId, kept);
    return false;
  }
  kept.push(now);
  recent.set(userId, kept);
  return true;
}
