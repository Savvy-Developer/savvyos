export type MarketMatchSignals = {
  budget: { min: number | null; max: number | null; label: string } | null;
  financing: string[];
  regions: string[];
  goals: string[];
  locations: string[];
  confidence: "high" | "medium" | "low";
};

export type MarketMatchAgent = {
  id: number;
  name: string | null;
  callBookingLink: string | null;
  isPrimary: boolean;
  isAvailable: boolean;
};

export type MarketMatchCandidate = {
  id: number;
  name: string;
  state: string;
  region: string | null;
  profile: unknown;
  intelligenceStatus: string | null;
  agents: MarketMatchAgent[];
};

export type MarketMatchResult = {
  rank: number;
  market: {
    id: number;
    name: string;
    state: string;
    region: string | null;
    intelligenceStatus: string | null;
  };
  agents: MarketMatchAgent[];
  reasons: string[];
  confidence: "high" | "medium" | "low";
};

export type LiveTranscriptUtterance = {
  text?: string;
  participant_type?: string;
  start_time?: number;
  end_time?: number;
  timestamp?: number;
};

const MAX_TRANSCRIPT_CHARS = 24_000;

const REGION_PATTERNS: Array<{ label: string; terms: string[] }> = [
  { label: "East Coast", terms: ["east coast", "eastern seaboard"] },
  { label: "West Coast", terms: ["west coast", "pacific coast"] },
  { label: "Southeast", terms: ["southeast", "south east", "southeastern"] },
  { label: "Southwest", terms: ["southwest", "south west", "southwestern"] },
  { label: "Northeast", terms: ["northeast", "north east", "new england"] },
  { label: "Midwest", terms: ["midwest", "mid west"] },
  {
    label: "Mountain West",
    terms: ["mountain west", "rocky mountains", "rockies"],
  },
  { label: "Sun Belt", terms: ["sun belt"] },
];

const GOAL_PATTERNS: Array<{ label: string; terms: string[] }> = [
  {
    label: "Cash flow",
    terms: [
      "cash flow",
      "cashflow",
      "rental income",
      "monthly income",
      "income producing",
      "cap rate",
      "roi",
      "returns",
    ],
  },
  {
    label: "Appreciation",
    terms: [
      "appreciation",
      "equity growth",
      "long term growth",
      "value growth",
      "growth market",
    ],
  },
  {
    label: "Lifestyle / personal use",
    terms: [
      "lifestyle",
      "personal use",
      "second home",
      "vacation home",
      "family vacation",
      "use it ourselves",
    ],
  },
  {
    label: "Short-term rental",
    terms: [
      "short term rental",
      "short-term rental",
      "airbnb",
      "vacation rental",
      "str rental",
    ],
  },
];

const FINANCING_PATTERNS: Array<{ label: string; terms: string[] }> = [
  {
    label: "Cash purchase",
    terms: ["all cash", "cash buyer", "pay cash", "cash offer"],
  },
  {
    label: "Financing",
    terms: [
      "financing",
      "finance",
      "mortgage",
      "loan",
      "lender",
      "pre-approved",
      "preapproved",
    ],
  },
  {
    label: "Down payment",
    terms: ["down payment", "put down", "percent down"],
  },
];

const STATE_NAMES: Array<{ name: string; abbreviation: string }> = [
  { name: "alabama", abbreviation: "al" },
  { name: "alaska", abbreviation: "ak" },
  { name: "arizona", abbreviation: "az" },
  { name: "arkansas", abbreviation: "ar" },
  { name: "california", abbreviation: "ca" },
  { name: "colorado", abbreviation: "co" },
  { name: "connecticut", abbreviation: "ct" },
  { name: "delaware", abbreviation: "de" },
  { name: "florida", abbreviation: "fl" },
  { name: "georgia", abbreviation: "ga" },
  { name: "hawaii", abbreviation: "hi" },
  { name: "idaho", abbreviation: "id" },
  { name: "illinois", abbreviation: "il" },
  { name: "indiana", abbreviation: "in" },
  { name: "iowa", abbreviation: "ia" },
  { name: "kansas", abbreviation: "ks" },
  { name: "kentucky", abbreviation: "ky" },
  { name: "louisiana", abbreviation: "la" },
  { name: "maine", abbreviation: "me" },
  { name: "maryland", abbreviation: "md" },
  { name: "massachusetts", abbreviation: "ma" },
  { name: "michigan", abbreviation: "mi" },
  { name: "minnesota", abbreviation: "mn" },
  { name: "mississippi", abbreviation: "ms" },
  { name: "missouri", abbreviation: "mo" },
  { name: "montana", abbreviation: "mt" },
  { name: "nebraska", abbreviation: "ne" },
  { name: "nevada", abbreviation: "nv" },
  { name: "new hampshire", abbreviation: "nh" },
  { name: "new jersey", abbreviation: "nj" },
  { name: "new mexico", abbreviation: "nm" },
  { name: "new york", abbreviation: "ny" },
  { name: "north carolina", abbreviation: "nc" },
  { name: "north dakota", abbreviation: "nd" },
  { name: "ohio", abbreviation: "oh" },
  { name: "oklahoma", abbreviation: "ok" },
  { name: "oregon", abbreviation: "or" },
  { name: "pennsylvania", abbreviation: "pa" },
  { name: "rhode island", abbreviation: "ri" },
  { name: "south carolina", abbreviation: "sc" },
  { name: "south dakota", abbreviation: "sd" },
  { name: "tennessee", abbreviation: "tn" },
  { name: "texas", abbreviation: "tx" },
  { name: "utah", abbreviation: "ut" },
  { name: "vermont", abbreviation: "vt" },
  { name: "virginia", abbreviation: "va" },
  { name: "washington", abbreviation: "wa" },
  { name: "west virginia", abbreviation: "wv" },
  { name: "wisconsin", abbreviation: "wi" },
  { name: "wyoming", abbreviation: "wy" },
  { name: "district of columbia", abbreviation: "dc" },
];

function normalized(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hasTerm(text: string, term: string): boolean {
  return text.includes(term.toLowerCase());
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some(term => hasTerm(text, term));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function amountFromMatch(
  numberText: string,
  magnitude?: string
): number | null {
  const numeric = Number(numberText.replace(/,/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const normalizedMagnitude = (magnitude ?? "").toLowerCase();
  if (normalizedMagnitude === "k" || normalizedMagnitude === "thousand")
    return numeric * 1_000;
  if (normalizedMagnitude === "m" || normalizedMagnitude === "million")
    return numeric * 1_000_000;
  if (numeric >= 1_000) return numeric;
  return null;
}

function amountPattern(): string {
  return "\\$?\\s*(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s*(k|m|thousand|million)?";
}

function findAmount(value: string): number | null {
  const match = new RegExp(amountPattern(), "i").exec(value);
  return match ? amountFromMatch(match[1], match[2]) : null;
}

function parseBudget(text: string): MarketMatchSignals["budget"] {
  const amount = amountPattern();
  const range = new RegExp(
    `(?:between|from)\\s+${amount}\\s*(?:and|to|-)\\s*${amount}`,
    "i"
  ).exec(text);
  if (range) {
    const first = amountFromMatch(range[1], range[2]);
    const second = amountFromMatch(range[3], range[4]);
    if (first && second) {
      const min = Math.min(first, second);
      const max = Math.max(first, second);
      return {
        min,
        max,
        label: `${formatMoney(min)}–${formatMoney(max)} budget`,
      };
    }
  }

  const upper = new RegExp(
    `(?:under|below|up to|maximum|max(?:imum)?|less than)\\s+${amount}`,
    "i"
  ).exec(text);
  if (upper) {
    const max = amountFromMatch(upper[1], upper[2]);
    if (max) return { min: null, max, label: `Up to ${formatMoney(max)}` };
  }

  const lower = new RegExp(
    `(?:at least|minimum|min\\.?|over|above|starting at)\\s+${amount}`,
    "i"
  ).exec(text);
  if (lower) {
    const min = amountFromMatch(lower[1], lower[2]);
    if (min) return { min, max: null, label: `At least ${formatMoney(min)}` };
  }

  const budgetContext = new RegExp(
    `(?:budget|price|purchase|spend|invest|afford)[^.!?]{0,60}?${amount}`,
    "i"
  ).exec(text);
  if (budgetContext) {
    const value = amountFromMatch(budgetContext[1], budgetContext[2]);
    if (value)
      return {
        min: Math.round(value * 0.85),
        max: Math.round(value * 1.15),
        label: `About ${formatMoney(value)}`,
      };
  }

  return null;
}

function stateMentioned(
  text: string,
  state: { name: string; abbreviation: string }
): boolean {
  if (new RegExp(`\\b${state.name.replace(/ /g, "\\s+")}\\b`, "i").test(text))
    return true;
  return new RegExp(
    `\\b(?:in|near|around|to|for|market\\s+in|state\\s+of)\\s+${state.abbreviation}\\b`,
    "i"
  ).test(text);
}

function profileObject(profile: unknown): Record<string, any> {
  if (profile && typeof profile === "object" && !Array.isArray(profile))
    return profile as Record<string, any>;
  if (typeof profile === "string") {
    try {
      const parsed = JSON.parse(profile);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function profileText(profile: Record<string, any>): string {
  const buyBox =
    profile.buyBox && typeof profile.buyBox === "object" ? profile.buyBox : {};
  return normalized(
    [
      profile.executiveSummary,
      ...(Array.isArray(profile.bestFitInvestors)
        ? profile.bestFitInvestors
        : []),
      ...(Array.isArray(profile.notIdealFor) ? profile.notIdealFor : []),
      buyBox.purchasePriceGuidance,
      ...(Array.isArray(buyBox.propertyTypes) ? buyBox.propertyTypes : []),
      ...(Array.isArray(buyBox.locations) ? buyBox.locations : []),
      ...(Array.isArray(buyBox.propertyCharacteristics)
        ? buyBox.propertyCharacteristics
        : []),
      ...(Array.isArray(profile.marketDynamics) ? profile.marketDynamics : []),
      ...(Array.isArray(profile.agentGuidance) ? profile.agentGuidance : []),
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function guidanceBudgetRange(
  profile: Record<string, any>
): { min: number; max: number } | null {
  const guidance = String(profile?.buyBox?.purchasePriceGuidance ?? "");
  const matches = Array.from(
    guidance.matchAll(new RegExp(amountPattern(), "gi"))
  )
    .map(match => amountFromMatch(match[1], match[2]))
    .filter((value): value is number => value !== null);
  if (matches.length >= 2)
    return { min: Math.min(...matches), max: Math.max(...matches) };
  if (matches.length === 1)
    return {
      min: Math.round(matches[0] * 0.8),
      max: Math.round(matches[0] * 1.2),
    };
  return null;
}

function rangesOverlap(
  left: { min: number | null; max: number | null },
  right: { min: number; max: number }
): boolean {
  const leftMin = left.min ?? 0;
  const leftMax = left.max ?? Number.POSITIVE_INFINITY;
  return leftMin <= right.max && leftMax >= right.min;
}

function candidateLocationMatch(
  candidate: MarketMatchCandidate,
  transcript: string,
  profile: Record<string, any>
): boolean {
  const marketName = normalized(candidate.name);
  if (
    marketName.length > 3 &&
    new RegExp(
      `\\b${marketName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i"
    ).test(transcript)
  )
    return true;

  const state = STATE_NAMES.find(
    item =>
      item.name === normalized(candidate.state) ||
      item.abbreviation === normalized(candidate.state)
  );
  if (state && stateMentioned(transcript, state)) return true;

  const region = normalized(candidate.region);
  if (region.length > 2 && transcript.includes(region)) return true;

  const locations = Array.isArray(profile?.buyBox?.locations)
    ? profile.buyBox.locations
    : [];
  return locations.some((location: unknown) => {
    const term = normalized(location);
    return term.length > 3 && transcript.includes(term);
  });
}

function candidateRegionMatch(
  candidate: MarketMatchCandidate,
  transcript: string
): boolean {
  const candidateText = normalized(
    `${candidate.region ?? ""} ${candidate.state} ${candidate.name}`
  );
  return REGION_PATTERNS.some(
    region =>
      includesAny(transcript, region.terms) &&
      includesAny(candidateText, region.terms)
  );
}

function looksFinancingCompatible(
  profileTextValue: string,
  financing: string[]
): boolean {
  if (!financing.length) return false;
  if (financing.includes("Cash purchase"))
    return includesAny(profileTextValue, ["cash", "cash buyer", "all cash"]);
  if (financing.includes("Down payment"))
    return includesAny(profileTextValue, [
      "down payment",
      "financing",
      "loan",
      "mortgage",
    ]);
  return includesAny(profileTextValue, [
    "financing",
    "finance",
    "loan",
    "mortgage",
    "lender",
  ]);
}

function conflictingRegions(regions: string[]): boolean {
  const coasts = regions.filter(
    region => region === "East Coast" || region === "West Coast"
  );
  return coasts.length > 1;
}

export function extractMarketMatchSignals(
  transcript: string
): MarketMatchSignals {
  const source = transcript.slice(-MAX_TRANSCRIPT_CHARS);
  const text = normalized(source);
  const regions = REGION_PATTERNS.filter(region =>
    includesAny(text, region.terms)
  ).map(region => region.label);
  const goals = GOAL_PATTERNS.filter(goal => includesAny(text, goal.terms)).map(
    goal => goal.label
  );
  const financing = FINANCING_PATTERNS.filter(item =>
    includesAny(text, item.terms)
  ).map(item => item.label);
  const locations = STATE_NAMES.filter(state =>
    stateMentioned(source, state)
  ).map(state => state.name.replace(/\b\w/g, letter => letter.toUpperCase()));
  const budget = parseBudget(source);
  const categoryCount = [
    budget,
    financing.length > 0,
    regions.length > 0 || locations.length > 0,
    goals.length > 0,
  ].filter(Boolean).length;
  const confidence =
    conflictingRegions(regions) || categoryCount === 0
      ? "low"
      : categoryCount >= 2
        ? "high"
        : "medium";
  return {
    budget,
    financing,
    regions: unique(regions),
    goals: unique(goals),
    locations: unique(locations),
    confidence,
  };
}

export function mergeLiveTranscriptEvents(
  events: Array<{ payload: unknown; receivedAt?: Date | string | null }>
): LiveTranscriptUtterance[] {
  const utterances: Array<LiveTranscriptUtterance & { receivedAt: number }> =
    [];
  for (const event of events) {
    const payload = event.payload as any;
    const content = payload?.data?.content;
    const values = Array.isArray(content?.utterances)
      ? content.utterances
      : Array.isArray(payload?.data?.utterances)
        ? payload.data.utterances
        : [];
    const receivedAt = event.receivedAt
      ? new Date(event.receivedAt).getTime()
      : 0;
    for (const value of values) {
      if (
        !value ||
        typeof value !== "object" ||
        typeof value.text !== "string" ||
        !value.text.trim()
      )
        continue;
      utterances.push({
        text: value.text.trim(),
        participant_type:
          typeof value.participant_type === "string"
            ? value.participant_type
            : undefined,
        start_time: Number.isFinite(value.start_time)
          ? value.start_time
          : undefined,
        end_time: Number.isFinite(value.end_time) ? value.end_time : undefined,
        timestamp: Number.isFinite(value.timestamp)
          ? value.timestamp
          : undefined,
        receivedAt,
      });
    }
  }

  const seen = new Set<string>();
  return utterances
    .sort(
      (left, right) =>
        (left.start_time ?? left.timestamp ?? left.receivedAt) -
        (right.start_time ?? right.timestamp ?? right.receivedAt)
    )
    .filter(utterance => {
      const key = `${utterance.start_time ?? utterance.timestamp ?? ""}|${utterance.participant_type ?? ""}|${utterance.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(-120)
    .map(({ receivedAt: _receivedAt, ...utterance }) => utterance);
}

export function speakerLabel(participantType: string | undefined): string {
  if (participantType === "internal") return "ISA";
  if (participantType === "external") return "Contact";
  if (participantType === "ai_voice_agent") return "AI Voice Agent";
  return "Speaker";
}

/**
 * A deliberately transparent V1 scorer. It only compares live call signals to
 * administrator-maintained Agent Markets profiles and never edits their data.
 */
export function rankMarketMatches(
  candidates: MarketMatchCandidate[],
  signals: MarketMatchSignals,
  transcript: string
): MarketMatchResult[] {
  const normalizedTranscript = normalized(transcript);
  const ranked = candidates.map(candidate => {
    const profile = profileObject(candidate.profile);
    const evidence = profileText(profile);
    const reasons: string[] = [];
    let score = 1;

    const locationMatch = candidateLocationMatch(
      candidate,
      normalizedTranscript,
      profile
    );
    const regionMatch = candidateRegionMatch(candidate, normalizedTranscript);
    if (locationMatch) {
      score += 7;
      reasons.push("Location alignment");
    } else if (regionMatch) {
      score += 4;
      reasons.push("Regional fit");
    }

    const guidance = guidanceBudgetRange(profile);
    if (signals.budget && guidance) {
      if (rangesOverlap(signals.budget, guidance)) {
        score += 5;
        reasons.push("Budget fit");
      } else {
        score -= 4;
      }
    }

    const matchingGoals = signals.goals.filter(goal => {
      const terms =
        GOAL_PATTERNS.find(item => item.label === goal)?.terms ?? [];
      return includesAny(evidence, terms);
    });
    if (matchingGoals.length) {
      score += Math.min(5, matchingGoals.length * 3);
      reasons.push(
        matchingGoals.length === 1 ? matchingGoals[0] : "Investment-goal fit"
      );
    }

    if (looksFinancingCompatible(evidence, signals.financing)) {
      score += 1;
      reasons.push("Financing alignment");
    }

    if (candidate.agents.some(agent => agent.isAvailable)) score += 0.25;
    if (candidate.intelligenceStatus === "ready") score += 0.1;

    return { candidate, score, reasons: unique(reasons) };
  });

  const hasConflict = conflictingRegions(signals.regions);
  const limit = Math.min(5, Math.max(3, candidates.length));
  return ranked
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.candidate.name.localeCompare(right.candidate.name)
    )
    .slice(0, limit)
    .map((item, index) => {
      const signalFitCount = item.reasons.filter(
        reason => reason !== "Financing alignment"
      ).length;
      const confidence: MarketMatchResult["confidence"] =
        hasConflict || signalFitCount === 0
          ? "low"
          : signals.confidence === "high" && signalFitCount >= 2
            ? "high"
            : "medium";
      return {
        rank: index + 1,
        market: {
          id: item.candidate.id,
          name: item.candidate.name,
          state: item.candidate.state,
          region: item.candidate.region,
          intelligenceStatus: item.candidate.intelligenceStatus,
        },
        agents: item.candidate.agents,
        reasons: item.reasons.length
          ? item.reasons
          : ["Best current fit from active Agent Markets"],
        confidence,
      };
    });
}
