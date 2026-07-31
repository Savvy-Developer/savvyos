/**
 * Savvy Talent Profile — Scoring Engine v1
 *
 * All formulas are transparent, deterministic, versioned, and documented.
 * No hidden weights. No AI-generated scores. Every result is traceable to item responses.
 *
 * SCORING VERSION: 1
 * Last updated: 2026-07-31
 */

export const SCORING_VERSION = 1;

// ── Dimension definitions ─────────────────────────────────────────────────────
export const DIMENSIONS = [
  "leadership_drive",
  "social_expression",
  "operating_tempo",
  "execution_structure",
  "evidence_orientation",
  "change_experimentation",
  "pressure_stability",
  "interpersonal_approach",
] as const;

export type Dimension = typeof DIMENSIONS[number];

export const DIMENSION_LABELS: Record<Dimension, string> = {
  leadership_drive: "Leadership Drive",
  social_expression: "Social Expression",
  operating_tempo: "Operating Tempo",
  execution_structure: "Execution Structure",
  evidence_orientation: "Evidence Orientation",
  change_experimentation: "Change & Experimentation",
  pressure_stability: "Pressure Stability",
  interpersonal_approach: "Interpersonal Approach",
};

export const DIMENSION_DESCRIPTIONS: Record<Dimension, { low: string; high: string; definition: string }> = {
  leadership_drive: {
    definition: "The degree to which a person naturally takes charge, seeks decision authority, and initiates action.",
    low: "Consultative, consensus-oriented, and comfortable supporting others in the lead role.",
    high: "Directive, independent, and energized by owning decisions and influencing direction.",
  },
  social_expression: {
    definition: "The degree to which a person communicates outwardly, seeks social interaction, and processes through conversation.",
    low: "Reflective, contained, and private — communicates deliberately and recharges through solitude.",
    high: "Expressive, socially energized, and persuasive — processes ideas through interaction.",
  },
  operating_tempo: {
    definition: "The degree to which a person prefers rapid, varied, and urgent work over steady, consistent, and focused work.",
    low: "Steady, consistent, and continuity-oriented — thrives with depth and routine.",
    high: "Rapid, varied, and urgency-oriented — energized by fast-moving, multi-tasking environments.",
  },
  execution_structure: {
    definition: "The degree to which a person plans, follows process, and drives toward completion and closure.",
    low: "Flexible, adaptive, and discretion-oriented — prefers improvising over following fixed procedures.",
    high: "Structured, sequential, and completion-focused — builds plans, follows through, and holds standards.",
  },
  evidence_orientation: {
    definition: "The degree to which a person gathers comprehensive information before acting versus synthesizing quickly from essentials.",
    low: "Rapid synthesis — acts on essential information and trusts instinct when data is incomplete.",
    high: "Comprehensive research — gathers thorough evidence, documents findings, and deliberates before deciding.",
  },
  change_experimentation: {
    definition: "The degree to which a person initiates new approaches, tolerates ambiguity, and seeks novelty over proven methods.",
    low: "Stabilizing and proven-method oriented — prefers predictability and minimizes unnecessary risk.",
    high: "Initiating, experimental, and opportunity-seeking — energized by ambiguity and new approaches.",
  },
  pressure_stability: {
    definition: "The degree to which a person maintains composure, perspective, and output quality under stress and setbacks.",
    low: "Highly responsive and sensitive to changes — attuned to environmental shifts and pressure signals.",
    high: "Steady, composed, and emotionally regulated — maintains perspective and recovers quickly from setbacks.",
  },
  interpersonal_approach: {
    definition: "The degree to which a person prioritizes harmony and diplomacy versus candor and productive challenge.",
    low: "Supportive, accommodating, and harmony-preserving — prioritizes relationships and emotional safety.",
    high: "Candid, questioning, and tension-tolerant — values direct feedback and productive disagreement.",
  },
};

// ── Provisional descriptive bands (0–100 scale) ───────────────────────────────
// Labels are dimension-specific, not generic "poor/average/excellent"
export const DIMENSION_BANDS: Record<Dimension, Array<{ min: number; max: number; label: string; description: string }>> = {
  leadership_drive: [
    { min: 0, max: 20, label: "Highly Consultative", description: "Strongly prefers consensus and supporting others in the lead role." },
    { min: 21, max: 40, label: "Collaborative", description: "Comfortable in a support role; leads when needed but prefers shared ownership." },
    { min: 41, max: 60, label: "Balanced", description: "Shifts between leading and supporting based on context." },
    { min: 61, max: 80, label: "Initiative-Taking", description: "Naturally steps up, takes ownership, and influences direction." },
    { min: 81, max: 100, label: "Strongly Directive", description: "Highly assertive; seeks decision authority and drives outcomes independently." },
  ],
  social_expression: [
    { min: 0, max: 20, label: "Highly Reserved", description: "Strongly prefers private reflection; communicates deliberately." },
    { min: 21, max: 40, label: "Thoughtful Communicator", description: "Selective in social engagement; communicates with care." },
    { min: 41, max: 60, label: "Adaptable", description: "Comfortable in both social and independent settings." },
    { min: 61, max: 80, label: "Socially Engaged", description: "Energized by interaction; communicates openly and persuasively." },
    { min: 81, max: 100, label: "Highly Expressive", description: "Strongly energized by social interaction; processes through conversation." },
  ],
  operating_tempo: [
    { min: 0, max: 20, label: "Deeply Focused", description: "Strongly prefers sustained, single-focus work with minimal interruption." },
    { min: 21, max: 40, label: "Steady Paced", description: "Prefers consistency and routine over rapid task-switching." },
    { min: 41, max: 60, label: "Flexible Tempo", description: "Adapts to both fast-paced and steady environments." },
    { min: 61, max: 80, label: "Fast-Paced", description: "Energized by variety and urgency; handles multiple priorities well." },
    { min: 81, max: 100, label: "High Urgency", description: "Thrives in rapid, high-variety environments; may find slow pace frustrating." },
  ],
  execution_structure: [
    { min: 0, max: 20, label: "Highly Flexible", description: "Strongly prefers improvising; finds rigid processes limiting." },
    { min: 21, max: 40, label: "Adaptive", description: "Prefers flexibility; uses structure when required." },
    { min: 41, max: 60, label: "Situational", description: "Balances structure and flexibility based on context." },
    { min: 61, max: 80, label: "Process-Oriented", description: "Plans carefully, follows through, and holds standards." },
    { min: 81, max: 100, label: "Highly Structured", description: "Strongly driven by process, closure, and defined standards." },
  ],
  evidence_orientation: [
    { min: 0, max: 20, label: "Rapid Synthesizer", description: "Acts quickly on essential information; trusts instinct over extensive research." },
    { min: 21, max: 40, label: "Practical Researcher", description: "Gathers key information but moves without exhaustive data." },
    { min: 41, max: 60, label: "Balanced Analyst", description: "Weighs evidence against time constraints." },
    { min: 61, max: 80, label: "Thorough Researcher", description: "Prefers comprehensive information before committing to a decision." },
    { min: 81, max: 100, label: "Deep Analyst", description: "Strongly prefers exhaustive evidence; highly detail-oriented." },
  ],
  change_experimentation: [
    { min: 0, max: 20, label: "Stability-Seeking", description: "Strongly prefers proven methods; finds frequent change unsettling." },
    { min: 21, max: 40, label: "Cautious Adapter", description: "Accepts change when necessary but prefers predictability." },
    { min: 41, max: 60, label: "Situational Experimenter", description: "Balances innovation with stability based on context." },
    { min: 61, max: 80, label: "Change-Ready", description: "Comfortable with ambiguity; regularly proposes new approaches." },
    { min: 81, max: 100, label: "Highly Experimental", description: "Strongly energized by novelty, ambiguity, and untested approaches." },
  ],
  pressure_stability: [
    { min: 0, max: 20, label: "Highly Responsive", description: "Strongly attuned to pressure signals; may escalate urgency visibly." },
    { min: 21, max: 40, label: "Pressure-Sensitive", description: "Notices and responds to environmental shifts; needs recovery time." },
    { min: 41, max: 60, label: "Moderate Stability", description: "Generally manages pressure well with occasional visible impact." },
    { min: 61, max: 80, label: "Composed", description: "Maintains focus and perspective under most stressors." },
    { min: 81, max: 100, label: "Highly Stable", description: "Strongly composed; rarely shows visible stress; recovers quickly." },
  ],
  interpersonal_approach: [
    { min: 0, max: 20, label: "Highly Diplomatic", description: "Strongly prioritizes harmony; avoids direct confrontation." },
    { min: 21, max: 40, label: "Supportive", description: "Prefers accommodation; challenges carefully and selectively." },
    { min: 41, max: 60, label: "Balanced", description: "Adapts between diplomacy and directness based on context." },
    { min: 61, max: 80, label: "Candid", description: "Comfortable with direct feedback and productive disagreement." },
    { min: 81, max: 100, label: "Highly Direct", description: "Strongly values candor and challenge; tension-tolerant." },
  ],
};

// ── Work Strength Themes ──────────────────────────────────────────────────────
export const WORK_STRENGTH_THEMES = [
  {
    id: "initiator",
    name: "Initiator",
    description: "Spots opportunities and gets things moving before others do.",
    formula: "leadership_drive * 0.5 + change_experimentation * 0.3 + operating_tempo * 0.2",
    overuseRisk: "May start too many things without finishing them; can create noise without follow-through.",
    calc: (s: Record<Dimension, number>) =>
      s.leadership_drive * 0.5 + s.change_experimentation * 0.3 + s.operating_tempo * 0.2,
  },
  {
    id: "driver",
    name: "Driver",
    description: "Pushes projects and teams toward results with urgency and ownership.",
    formula: "leadership_drive * 0.4 + operating_tempo * 0.35 + execution_structure * 0.25",
    overuseRisk: "May push too hard, creating pressure on others or skipping important steps.",
    calc: (s: Record<Dimension, number>) =>
      s.leadership_drive * 0.4 + s.operating_tempo * 0.35 + s.execution_structure * 0.25,
  },
  {
    id: "connector",
    name: "Connector",
    description: "Builds relationships and bridges between people, teams, and ideas.",
    formula: "social_expression * 0.5 + interpersonal_approach_inv * 0.3 + leadership_drive_inv * 0.2",
    overuseRisk: "May over-invest in relationships at the expense of task completion.",
    calc: (s: Record<Dimension, number>) =>
      s.social_expression * 0.5 + (100 - s.interpersonal_approach) * 0.3 + (100 - s.leadership_drive) * 0.2,
  },
  {
    id: "researcher",
    name: "Researcher",
    description: "Digs deep into information, surfaces insights others miss, and builds evidence-based cases.",
    formula: "evidence_orientation * 0.6 + execution_structure * 0.25 + operating_tempo_inv * 0.15",
    overuseRisk: "May over-research and delay decisions; can get lost in detail.",
    calc: (s: Record<Dimension, number>) =>
      s.evidence_orientation * 0.6 + s.execution_structure * 0.25 + (100 - s.operating_tempo) * 0.15,
  },
  {
    id: "analyzer",
    name: "Analyzer",
    description: "Evaluates options systematically, identifies risks, and makes well-reasoned recommendations.",
    formula: "evidence_orientation * 0.45 + execution_structure * 0.3 + change_experimentation_inv * 0.25",
    overuseRisk: "May become analysis-paralyzed; can slow teams down when speed is needed.",
    calc: (s: Record<Dimension, number>) =>
      s.evidence_orientation * 0.45 + s.execution_structure * 0.3 + (100 - s.change_experimentation) * 0.25,
  },
  {
    id: "strategist",
    name: "Strategist",
    description: "Sees the big picture, connects dots across domains, and shapes long-term direction.",
    formula: "leadership_drive * 0.35 + evidence_orientation * 0.35 + change_experimentation * 0.3",
    overuseRisk: "May stay at the strategic level and under-invest in execution details.",
    calc: (s: Record<Dimension, number>) =>
      s.leadership_drive * 0.35 + s.evidence_orientation * 0.35 + s.change_experimentation * 0.3,
  },
  {
    id: "experimenter",
    name: "Experimenter",
    description: "Tests new ideas quickly, learns from failure, and brings creative energy to problem-solving.",
    formula: "change_experimentation * 0.6 + social_expression * 0.2 + operating_tempo * 0.2",
    overuseRisk: "May leave unfinished experiments; can create instability if not balanced with follow-through.",
    calc: (s: Record<Dimension, number>) =>
      s.change_experimentation * 0.6 + s.social_expression * 0.2 + s.operating_tempo * 0.2,
  },
  {
    id: "planner",
    name: "Planner",
    description: "Organizes work into clear structures, anticipates obstacles, and builds reliable roadmaps.",
    formula: "execution_structure * 0.5 + evidence_orientation * 0.3 + operating_tempo_inv * 0.2",
    overuseRisk: "May over-plan and resist moving forward without a complete picture.",
    calc: (s: Record<Dimension, number>) =>
      s.execution_structure * 0.5 + s.evidence_orientation * 0.3 + (100 - s.operating_tempo) * 0.2,
  },
  {
    id: "finisher",
    name: "Finisher",
    description: "Drives projects to completion, closes open loops, and delivers on commitments.",
    formula: "execution_structure * 0.55 + pressure_stability * 0.25 + change_experimentation_inv * 0.2",
    overuseRisk: "May resist reprioritizing when circumstances change; can become rigid about closure.",
    calc: (s: Record<Dimension, number>) =>
      s.execution_structure * 0.55 + s.pressure_stability * 0.25 + (100 - s.change_experimentation) * 0.2,
  },
  {
    id: "stabilizer",
    name: "Stabilizer",
    description: "Brings calm, consistency, and reliability to teams under pressure.",
    formula: "pressure_stability * 0.5 + execution_structure * 0.3 + operating_tempo_inv * 0.2",
    overuseRisk: "May underreact to real urgency; can be seen as insufficiently responsive.",
    calc: (s: Record<Dimension, number>) =>
      s.pressure_stability * 0.5 + s.execution_structure * 0.3 + (100 - s.operating_tempo) * 0.2,
  },
  {
    id: "coach",
    name: "Coach",
    description: "Develops others, shares knowledge generously, and creates conditions for people to succeed.",
    formula: "interpersonal_approach_inv * 0.4 + social_expression * 0.35 + leadership_drive * 0.25",
    overuseRisk: "May over-invest in others' development at the expense of their own output.",
    calc: (s: Record<Dimension, number>) =>
      (100 - s.interpersonal_approach) * 0.4 + s.social_expression * 0.35 + s.leadership_drive * 0.25,
  },
  {
    id: "challenger",
    name: "Challenger",
    description: "Asks hard questions, surfaces blind spots, and pushes ideas to be stronger.",
    formula: "interpersonal_approach * 0.5 + leadership_drive * 0.3 + change_experimentation * 0.2",
    overuseRisk: "May challenge too frequently or without sufficient diplomacy, creating friction.",
    calc: (s: Record<Dimension, number>) =>
      s.interpersonal_approach * 0.5 + s.leadership_drive * 0.3 + s.change_experimentation * 0.2,
  },
  {
    id: "independent_owner",
    name: "Independent Owner",
    description: "Takes full ownership of their domain, operates with minimal supervision, and delivers results autonomously.",
    formula: "leadership_drive * 0.4 + pressure_stability * 0.3 + execution_structure * 0.3",
    overuseRisk: "May resist collaboration or feedback; can create silos.",
    calc: (s: Record<Dimension, number>) =>
      s.leadership_drive * 0.4 + s.pressure_stability * 0.3 + s.execution_structure * 0.3,
  },
  {
    id: "service_builder",
    name: "Service Builder",
    description: "Creates systems and experiences that consistently serve others well.",
    formula: "execution_structure * 0.35 + interpersonal_approach_inv * 0.35 + evidence_orientation * 0.3",
    overuseRisk: "May over-engineer service systems or prioritize process over speed.",
    calc: (s: Record<Dimension, number>) =>
      s.execution_structure * 0.35 + (100 - s.interpersonal_approach) * 0.35 + s.evidence_orientation * 0.3,
  },
] as const;

// ── Strengths Under Pressure ──────────────────────────────────────────────────
export const STRENGTHS_UNDER_PRESSURE = [
  {
    id: "overcontrol",
    strength: "Leadership Drive",
    pattern: "Overcontrol",
    description: "High leadership drive under pressure may become micromanagement or reluctance to delegate.",
    trigger: "High stakes, unclear outcomes, or perceived loss of control.",
    behaviors: "Checking in too frequently, overriding team decisions, difficulty trusting others to execute.",
    interviewQuestion: "Tell me about a time you had to let go of control over an important outcome. How did you handle it?",
    managementNote: "Give clear ownership boundaries. Acknowledge their drive while reinforcing trust in the team.",
    triggerScore: 75,
    dimension: "leadership_drive" as Dimension,
  },
  {
    id: "overpromising",
    strength: "Social Expression",
    pattern: "Overpromising",
    description: "High social expression under pressure may lead to overpromising or insufficient listening.",
    trigger: "Desire to maintain enthusiasm or avoid disappointing others.",
    behaviors: "Committing to more than is feasible, talking over others, minimizing concerns.",
    interviewQuestion: "Tell me about a time you made a commitment you couldn't fully deliver on. What happened?",
    managementNote: "Create space for realistic expectation-setting. Celebrate follow-through as much as enthusiasm.",
    triggerScore: 75,
    dimension: "social_expression" as Dimension,
  },
  {
    id: "impatience",
    strength: "Operating Tempo",
    pattern: "Impatience",
    description: "High operating tempo under pressure may become impatience with slower processes or people.",
    trigger: "Perceived inefficiency, slow decision-making, or lack of urgency in others.",
    behaviors: "Cutting corners, skipping steps, expressing frustration with team pace.",
    interviewQuestion: "Tell me about a time you had to work with someone who moved much more slowly than you. How did you manage that?",
    managementNote: "Help them distinguish between productive urgency and counterproductive rushing.",
    triggerScore: 75,
    dimension: "operating_tempo" as Dimension,
  },
  {
    id: "rigidity",
    strength: "Execution Structure",
    pattern: "Rigidity",
    description: "High execution structure under pressure may become inflexibility or resistance to changing course.",
    trigger: "Unexpected changes to plans, ambiguous requirements, or incomplete information.",
    behaviors: "Insisting on original plans, difficulty adapting to new information, over-documenting.",
    interviewQuestion: "Tell me about a time you had to abandon a plan you had invested significant effort in. How did you respond?",
    managementNote: "Frame adaptability as a form of execution excellence, not a failure of planning.",
    triggerScore: 75,
    dimension: "execution_structure" as Dimension,
  },
  {
    id: "analysis_paralysis",
    strength: "Evidence Orientation",
    pattern: "Analysis Paralysis",
    description: "High evidence orientation under pressure may become over-research and decision delay.",
    trigger: "High-stakes decisions, incomplete data, or fear of being wrong.",
    behaviors: "Requesting more information repeatedly, delaying decisions, over-qualifying recommendations.",
    interviewQuestion: "Tell me about a time you had to make an important decision with less information than you wanted. How did you handle it?",
    managementNote: "Set clear decision timelines. Validate the quality of their reasoning, not just the completeness of their data.",
    triggerScore: 75,
    dimension: "evidence_orientation" as Dimension,
  },
  {
    id: "impulsivity",
    strength: "Change & Experimentation",
    pattern: "Impulsivity",
    description: "High change orientation under pressure may become impulsive action or unfinished initiatives.",
    trigger: "Boredom, frustration with slow progress, or excitement about a new idea.",
    behaviors: "Starting new projects before finishing existing ones, abandoning approaches prematurely.",
    interviewQuestion: "Tell me about a time you started something new before finishing what you were working on. What was the outcome?",
    managementNote: "Create clear completion milestones before new initiatives are approved.",
    triggerScore: 75,
    dimension: "change_experimentation" as Dimension,
  },
  {
    id: "insufficient_urgency",
    strength: "Pressure Stability",
    pattern: "Insufficient Urgency",
    description: "High pressure stability under pressure may appear as insufficient visible urgency to others.",
    trigger: "Situations where the team needs to see visible concern or energy from a leader.",
    behaviors: "Appearing too calm in a crisis, underreacting to real risk signals.",
    interviewQuestion: "Tell me about a time your team needed to see more urgency from you. How did you recognize that and respond?",
    managementNote: "Help them communicate their internal response more visibly when the situation calls for it.",
    triggerScore: 75,
    dimension: "pressure_stability" as Dimension,
  },
  {
    id: "conflict_avoidance",
    strength: "Interpersonal Approach (Diplomatic)",
    pattern: "Conflict Avoidance",
    description: "High diplomacy under pressure may become avoidance of necessary difficult conversations.",
    trigger: "Fear of damaging relationships or creating discomfort.",
    behaviors: "Withholding critical feedback, agreeing to avoid tension, delaying hard conversations.",
    interviewQuestion: "Tell me about a time you had to deliver feedback or news you knew would be unwelcome. How did you approach it?",
    managementNote: "Frame direct feedback as a form of respect and care, not aggression.",
    triggerScore: 25,
    dimension: "interpersonal_approach" as Dimension,
  },
  {
    id: "abrasiveness",
    strength: "Interpersonal Approach (Candid)",
    pattern: "Abrasiveness",
    description: "High candor under pressure may come across as blunt or dismissive of others' perspectives.",
    trigger: "Frustration, time pressure, or disagreement with a decision.",
    behaviors: "Cutting off discussion, dismissing concerns, delivering feedback without context.",
    interviewQuestion: "Tell me about a time your directness landed harder than you intended. What did you do?",
    managementNote: "Acknowledge their directness as a strength while coaching on delivery and timing.",
    triggerScore: 75,
    dimension: "interpersonal_approach" as Dimension,
  },
];

// ── Motivator definitions ─────────────────────────────────────────────────────
export const MOTIVATORS = [
  { id: "achievement", label: "Achievement", engagementCondition: "Clear goals, measurable outcomes, visible progress.", drainer: "Vague expectations, no feedback loop, effort without results." },
  { id: "autonomy", label: "Autonomy", engagementCondition: "Freedom to decide how and when work gets done.", drainer: "Micromanagement, excessive approval requirements, rigid procedures." },
  { id: "mastery", label: "Mastery", engagementCondition: "Opportunities to develop deep expertise and improve continuously.", drainer: "Repetitive work with no growth path, being kept away from challenging problems." },
  { id: "recognition", label: "Recognition", engagementCondition: "Acknowledgment of contributions, public or private appreciation.", drainer: "Effort going unnoticed, credit being attributed elsewhere." },
  { id: "influence", label: "Influence", engagementCondition: "Involvement in decisions, ability to shape strategy or direction.", drainer: "Being excluded from key conversations, having decisions made without input." },
  { id: "connection", label: "Connection", engagementCondition: "Strong team relationships, a sense of belonging and shared purpose.", drainer: "Isolation, purely transactional relationships, high turnover in the team." },
  { id: "service", label: "Service", engagementCondition: "Helping others, contributing to a mission larger than individual output.", drainer: "Work that feels purely self-serving or disconnected from impact." },
  { id: "stability", label: "Stability", engagementCondition: "Predictable environment, clear expectations, job security.", drainer: "Frequent reorganization, unclear priorities, unpredictable leadership." },
  { id: "creativity", label: "Creativity", engagementCondition: "License to generate new ideas, solve problems in original ways.", drainer: "Highly constrained work, no room for experimentation or expression." },
  { id: "purpose", label: "Purpose", engagementCondition: "Work that aligns with personal values and feels genuinely meaningful.", drainer: "Work that conflicts with values, feeling like a cog in a machine." },
];

// ── Core scoring functions ─────────────────────────────────────────────────────

/**
 * Score a single item response.
 * Likert scale: 1–6. Reversed items: score = 7 - response.
 * Returns a 0–5 normalized score (for averaging).
 */
export function scoreItem(response: number, isReversed: boolean): number {
  if (response < 1 || response > 6) return 0; // treat out-of-range as missing
  const raw = isReversed ? 7 - response : response;
  return raw - 1; // normalize to 0–5
}

/**
 * Calculate dimension score (0–100) from item responses.
 * Missing items are excluded from the average (not treated as 0).
 * Minimum 3 answered items required for a valid score.
 */
export function calcDimensionScore(
  items: Array<{ id: number; isReversed: boolean }>,
  responses: Record<number, number>
): { scaledScore: number | null; rawScore: number | null; answeredCount: number; itemCount: number } {
  const itemCount = items.length;
  let total = 0;
  let answeredCount = 0;

  for (const item of items) {
    const response = responses[item.id];
    if (response !== undefined && response >= 1 && response <= 6) {
      total += scoreItem(response, item.isReversed);
      answeredCount++;
    }
  }

  if (answeredCount < 3) {
    return { scaledScore: null, rawScore: null, answeredCount, itemCount };
  }

  const rawScore = total / answeredCount; // 0–5 average
  const scaledScore = Math.round((rawScore / 5) * 100); // 0–100
  return { scaledScore, rawScore, answeredCount, itemCount };
}

/**
 * Get the provisional descriptive band for a dimension score.
 */
export function getDimensionBand(dimension: Dimension, score: number): string {
  const bands = DIMENSION_BANDS[dimension];
  const band = bands.find(b => score >= b.min && score <= b.max);
  return band?.label ?? "Insufficient Data";
}

/**
 * Calculate all 8 dimension scores from a response map.
 * itemBank: array of all items with their dimension and isReversed flag.
 */
export function calcAllDimensionScores(
  itemBank: Array<{ id: number; dimension: string; isReversed: boolean }>,
  responses: Record<number, number>
): Record<Dimension, { scaledScore: number; band: string; answeredCount: number; itemCount: number }> {
  const result = {} as Record<Dimension, { scaledScore: number; band: string; answeredCount: number; itemCount: number }>;

  for (const dim of DIMENSIONS) {
    const dimItems = itemBank.filter(i => i.dimension === dim);
    const { scaledScore, answeredCount, itemCount } = calcDimensionScore(dimItems, responses);
    const score = scaledScore ?? 50; // default to 50 (midpoint) if insufficient data
    result[dim] = {
      scaledScore: score,
      band: getDimensionBand(dim, score),
      answeredCount,
      itemCount,
    };
  }

  return result;
}

/**
 * Calculate Work Strength scores from dimension scores.
 * Returns top 5 themes sorted by score descending.
 */
export function calcWorkStrengths(
  dimensionScores: Record<Dimension, { scaledScore: number }>
): Array<{ id: string; name: string; score: number; formula: string; rank: number; overuseRisk: string }> {
  const scores = Object.fromEntries(
    DIMENSIONS.map(d => [d, dimensionScores[d].scaledScore])
  ) as Record<Dimension, number>;

  const results = WORK_STRENGTH_THEMES.map(theme => ({
    id: theme.id,
    name: theme.name,
    score: Math.round(theme.calc(scores)),
    formula: theme.formula,
    overuseRisk: theme.overuseRisk,
    description: theme.description,
  }));

  results.sort((a, b) => b.score - a.score);
  return results.map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * Calculate motivator rankings from ipsative ranking responses.
 * Input: array of {motivatorId, rank} where rank 1 = highest priority.
 */
export function calcMotivatorResults(
  rankings: Array<{ motivatorId: string; rank: number }>
): Array<{ motivator: string; label: string; rank: number; engagementCondition: string; drainer: string }> {
  const sorted = [...rankings].sort((a, b) => a.rank - b.rank);
  return sorted.map(r => {
    const def = MOTIVATORS.find(m => m.id === r.motivatorId);
    return {
      motivator: r.motivatorId,
      label: def?.label ?? r.motivatorId,
      rank: r.rank,
      engagementCondition: def?.engagementCondition ?? "",
      drainer: def?.drainer ?? "",
    };
  });
}

/**
 * Calculate response confidence indicator.
 */
export function calcResponseConfidence(params: {
  totalItems: number;
  answeredItems: number;
  consistencyPairs: Array<{ itemA: number; itemB: number; expectOpposite: boolean }>;
  responses: Record<number, number>;
}): { label: "Sufficient Evidence" | "Interpret with Context" | "Limited Evidence"; completionRate: number; consistencyScore: number; repetitionFlag: boolean } {
  const completionRate = params.answeredItems / params.totalItems;

  // Check for excessive repetition (all same answer)
  const values = Object.values(params.responses).filter(v => v >= 1 && v <= 6);
  const uniqueValues = new Set(values).size;
  const repetitionFlag = values.length > 10 && uniqueValues <= 2;

  // Consistency check: pairs that should be contradictory
  let consistentPairs = 0;
  let checkedPairs = 0;
  for (const pair of params.consistencyPairs) {
    const a = params.responses[pair.itemA];
    const b = params.responses[pair.itemB];
    if (a !== undefined && b !== undefined) {
      checkedPairs++;
      if (pair.expectOpposite) {
        // One should be high (5-6) and one low (1-2) for a consistent response
        const aHigh = a >= 5;
        const bHigh = b >= 5;
        const aLow = a <= 2;
        const bLow = b <= 2;
        if ((aHigh && bLow) || (aLow && bHigh)) consistentPairs++;
      }
    }
  }
  const consistencyScore = checkedPairs > 0 ? consistentPairs / checkedPairs : 1;

  let label: "Sufficient Evidence" | "Interpret with Context" | "Limited Evidence";
  if (completionRate >= 0.85 && !repetitionFlag && consistencyScore >= 0.5) {
    label = "Sufficient Evidence";
  } else if (completionRate >= 0.6 && !repetitionFlag) {
    label = "Interpret with Context";
  } else {
    label = "Limited Evidence";
  }

  return { label, completionRate, consistencyScore, repetitionFlag };
}

/**
 * Generate Strengths Under Pressure hypotheses based on dimension scores.
 * Only surfaces patterns where the relevant dimension score exceeds the trigger threshold.
 */
export function getStrengthsUnderPressure(
  dimensionScores: Record<Dimension, { scaledScore: number }>
): typeof STRENGTHS_UNDER_PRESSURE {
  return STRENGTHS_UNDER_PRESSURE.filter(pattern => {
    const score = dimensionScores[pattern.dimension]?.scaledScore ?? 50;
    if (pattern.id === "conflict_avoidance") return score <= pattern.triggerScore;
    return score >= pattern.triggerScore;
  });
}

/**
 * Generate role alignment status for a single dimension.
 */
export function getRoleAlignment(
  score: number,
  preferredMin: number | null,
  preferredMax: number | null,
  acceptableMin: number | null,
  acceptableMax: number | null,
  importance: string
): "within_preferred" | "within_acceptable" | "adjacent" | "meaningful_tradeoff" | "not_material" | "insufficient_evidence" {
  if (importance === "irrelevant") return "not_material";
  if (score === null) return "insufficient_evidence";

  if (preferredMin !== null && preferredMax !== null) {
    if (score >= preferredMin && score <= preferredMax) return "within_preferred";
  }
  if (acceptableMin !== null && acceptableMax !== null) {
    if (score >= acceptableMin && score <= acceptableMax) return "within_acceptable";
  }
  if (preferredMin !== null && preferredMax !== null) {
    const buffer = 15;
    if (score >= (preferredMin - buffer) && score <= (preferredMax + buffer)) return "adjacent";
  }
  return "meaningful_tradeoff";
}
