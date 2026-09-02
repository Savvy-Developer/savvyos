export type CoachingFallbackCommitment = {
  description: string;
  owner: "agent" | "coach";
  dueDate: null;
  expectedResult: string;
  relatedMetric: "GCI" | "Closings" | "Pipeline" | "Activity" | null;
  confidence: "medium";
};

/**
 * Applies conservative Markdown cleanup when an AI provider is unavailable.
 * It intentionally preserves the source material rather than attempting to
 * infer structure or rewrite facts without an LLM response.
 */
export function formatKnowledgeBaseFallback(content: string): string {
  const normalized = content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/[ \t]+$/g, ""))
    .map(line => line.replace(/^\s*[•*]\s+/, "- "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized;
}

function inferRelatedMetric(
  value: string
): CoachingFallbackCommitment["relatedMetric"] {
  if (/\b(gci|commission|revenue|income)\b/i.test(value)) return "GCI";
  if (/\b(close|closing|contract|offer)\b/i.test(value)) return "Closings";
  if (/\b(leads?|pipeline|prospect|appointment)\b/i.test(value))
    return "Pipeline";
  if (/\b(call|email|text|follow up|reach out|contact|schedule)\b/i.test(value))
    return "Activity";
  return null;
}

/**
 * Finds explicit, reviewable commitments in saved coaching notes when an AI
 * response is unavailable. Every candidate remains an AI Suggested item so a
 * coach must review it before it becomes an active commitment.
 */
export function extractCoachingFallbackCommitments(
  content: string
): CoachingFallbackCommitment[] {
  const normalized = content.replace(/\r/g, "").trim();
  if (!normalized) return [];

  const commitmentPatterns =
    /\b(will|commit(?:s|ted)? to|follow up|call|email|send|schedule|complete|review|reach out|contact|update|prepare|submit|finish)\b/i;
  const candidates = normalized
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)
    .map(line =>
      line
        .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(
      line =>
        line.length >= 12 && line.length <= 300 && commitmentPatterns.test(line)
    );

  const seen = new Set<string>();
  return candidates
    .filter(description => {
      const key = description.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5)
    .map(description => ({
      description,
      owner: /\bcoach\s+(?:will|to|needs? to|should)\b/i.test(description)
        ? "coach"
        : "agent",
      dueDate: null,
      expectedResult: "Coach to verify completion at the next session.",
      relatedMetric: inferRelatedMetric(description),
      confidence: "medium",
    }));
}
