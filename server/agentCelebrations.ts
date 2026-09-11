import { and, eq, sql } from "drizzle-orm";
import {
  agentCelebrationEvents,
  agentGoals,
  agentProfiles,
  properties,
  reviews,
  transactions,
  userProfiles,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";

export type CelebrationCategory =
  | "personal"
  | "production"
  | "team"
  | "review"
  | "goal";
export type CelebrationTimeframe = "recent" | "today" | "upcoming";

export type CelebrationEvent = {
  key: string;
  agentId: number;
  agentName: string;
  email: string | null;
  phone: string | null;
  profilePhotoUrl: string | null;
  category: CelebrationCategory;
  type: string;
  timeframe: CelebrationTimeframe;
  occurredAt: string;
  title: string;
  description: string;
  suggestedMessage: string;
  valueLabel: string | null;
  relatedUrl: string;
  priority: number;
  celebratedAt: string | null;
  celebratedById: number | null;
};

type AgentInput = {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  profilePhotoUrl: string | null;
  dateOfBirth: Date | string | null;
  workAnniversaryDate: Date | string | null;
  onboardedDate: Date | string | null;
  startDateWithSavvy: Date | string | null;
  birthdayRecognitionOptIn: boolean | null;
  anniversaryRecognitionOptIn: boolean | null;
};

type TransactionInput = {
  id: number;
  agentId: number;
  status: "under_contract" | "closed" | "terminated";
  purchasePrice: string | number | null;
  grossCommissionIncome: string | number | null;
  contractDate: Date | string | null;
  closingDate: Date | string | null;
  propertyAddress: string | null;
  propertyCity: string | null;
  propertyState: string | null;
};

type ReviewInput = {
  id: number;
  transactionId: number;
  agentId: number;
  rating: number;
  reviewerName: string;
  comment: string | null;
  submittedAt: Date | string;
};

type GoalInput = {
  agentId: number;
  year: number;
  gciTarget: string | number | null;
  closingsTarget: number | null;
  volumeTarget: string | number | null;
};

type AcknowledgementInput = {
  eventKey: string;
  celebratedAt: Date | string;
  celebratedById: number;
};

type BuildCelebrationFeedInput = {
  agents: AgentInput[];
  transactions: TransactionInput[];
  reviews: ReviewInput[];
  goals: GoalInput[];
  acknowledgements: AcknowledgementInput[];
  now?: Date;
  daysBack: number;
  daysForward: number;
};

type PeriodSummary = {
  agentId: number;
  agentName: string;
  units: number;
  volume: number;
  lastDate: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const unitMilestones = [1, 5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250, 500];

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );
}

function endOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );
}

function shiftUtcDays(value: Date, days: number): Date {
  const shifted = new Date(value.getTime());
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

function startOfUtcWeek(value: Date): Date {
  const start = startOfUtcDay(value);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return start;
}

function startOfUtcMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function endOfPreviousUtcMonth(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 0, 23, 59, 59, 999)
  );
}

function dayDifference(left: Date, right: Date): number {
  return Math.round(
    (startOfUtcDay(left).getTime() - startOfUtcDay(right).getTime()) / DAY_MS
  );
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function weekKey(value: Date): string {
  return dateKey(startOfUtcWeek(value));
}

function monthKey(value: Date): string {
  return dateKey(startOfUtcMonth(value)).slice(0, 7);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function formatMonth(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function plural(
  value: number,
  singular: string,
  pluralForm = `${singular}s`
): string {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

function annualOccurrence(source: Date, year: number): Date {
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay), 12));
}

function timeframeFor(eventDate: Date, today: Date): CelebrationTimeframe {
  const difference = dayDifference(eventDate, today);
  if (difference === 0) return "today";
  return difference > 0 ? "upcoming" : "recent";
}

function propertyLabel(transaction: TransactionInput): string {
  return (
    [
      transaction.propertyAddress,
      transaction.propertyCity,
      transaction.propertyState,
    ]
      .filter(Boolean)
      .join(", ") || "their client’s property"
  );
}

function addToPeriod(
  groups: Map<string, PeriodSummary>,
  agent: AgentInput,
  date: Date,
  volume: number,
  period: "week" | "month"
): void {
  const periodStart = period === "week" ? weekKey(date) : monthKey(date);
  const key = `${agent.id}:${periodStart}`;
  const existing = groups.get(key) ?? {
    agentId: agent.id,
    agentName: agent.name ?? "Agent",
    units: 0,
    volume: 0,
    lastDate: date,
  };
  existing.units += 1;
  existing.volume += volume;
  if (date > existing.lastDate) existing.lastDate = date;
  groups.set(key, existing);
}

function recordPeriodEvents(
  groups: Map<string, PeriodSummary>,
  agentsById: Map<number, AgentInput>,
  period: "week" | "month",
  inWindow: (date: Date) => boolean,
  create: (
    event: Omit<
      CelebrationEvent,
      "timeframe" | "celebratedAt" | "celebratedById"
    >
  ) => void
): void {
  const byAgent = new Map<
    number,
    Array<{ key: string; summary: PeriodSummary }>
  >();
  for (const [key, summary] of Array.from(groups.entries())) {
    const rows = byAgent.get(summary.agentId) ?? [];
    rows.push({ key: key.split(":").slice(1).join(":"), summary });
    byAgent.set(summary.agentId, rows);
  }

  for (const [agentId, periods] of Array.from(byAgent.entries())) {
    const agent = agentsById.get(agentId);
    if (!agent) continue;
    periods.sort((a, b) => a.key.localeCompare(b.key));
    let priorMaxUnits = 0;
    let priorMaxVolume = 0;
    let latestUnitsRecord: (typeof periods)[number] | null = null;
    let latestVolumeRecord: (typeof periods)[number] | null = null;
    for (let index = 0; index < periods.length; index += 1) {
      const entry = periods[index];
      const isNewUnitsRecord = index > 0 && entry.summary.units > priorMaxUnits;
      const isNewVolumeRecord =
        index > 0 && entry.summary.volume > priorMaxVolume;
      priorMaxUnits = Math.max(priorMaxUnits, entry.summary.units);
      priorMaxVolume = Math.max(priorMaxVolume, entry.summary.volume);
      if (!inWindow(entry.summary.lastDate)) continue;
      if (isNewUnitsRecord) latestUnitsRecord = entry;
      if (isNewVolumeRecord) latestVolumeRecord = entry;
    }

    const currentRecords = new Map<
      string,
      { entry: (typeof periods)[number]; units: boolean; volume: boolean }
    >();
    if (latestUnitsRecord) {
      currentRecords.set(latestUnitsRecord.key, {
        entry: latestUnitsRecord,
        units: true,
        volume: false,
      });
    }
    if (latestVolumeRecord) {
      const existing = currentRecords.get(latestVolumeRecord.key);
      currentRecords.set(latestVolumeRecord.key, {
        entry: latestVolumeRecord,
        units: existing?.units ?? false,
        volume: true,
      });
    }

    for (const { entry, units, volume } of Array.from(
      currentRecords.values()
    )) {
      const recordParts = [
        units
          ? `${plural(entry.summary.units, "closing")} — a new unit record`
          : null,
        volume
          ? `${formatCurrency(entry.summary.volume)} in volume — a new volume record`
          : null,
      ].filter(Boolean);
      const periodLabel =
        period === "week"
          ? `the week of ${formatDate(new Date(`${entry.key}T12:00:00.000Z`))}`
          : formatMonth(new Date(`${entry.key}-01T12:00:00.000Z`));

      create({
        key: `personal_best_${period}:${agentId}:${entry.key}`,
        agentId,
        agentName: agent.name ?? "Agent",
        email: agent.email,
        phone: agent.phone,
        profilePhotoUrl: agent.profilePhotoUrl,
        category: "production",
        type: `personal_best_${period}`,
        occurredAt: entry.summary.lastDate.toISOString(),
        title: `New personal-best ${period}`,
        description: `${agent.name ?? "This agent"} posted ${recordParts.join(" and ")} in ${periodLabel}.`,
        suggestedMessage: `Congratulations on a new personal-best ${period}! ${recordParts.join(" and ")} is an incredible milestone. Your momentum is showing—way to go!`,
        valueLabel: `${entry.summary.units} closed · ${formatCurrency(entry.summary.volume)}`,
        relatedUrl: `/agents/${agentId}`,
        priority: period === "month" ? 91 : 89,
      });
    }
  }
}

function addTeamLeaderEvents(params: {
  transactions: TransactionInput[];
  agentsById: Map<number, AgentInput>;
  kind: "under_contract" | "closed";
  period: "week" | "month";
  from: Date;
  to: Date;
  create: (
    event: Omit<
      CelebrationEvent,
      "timeframe" | "celebratedAt" | "celebratedById"
    >
  ) => void;
}): void {
  const summaries = new Map<number, PeriodSummary>();
  for (const transaction of params.transactions) {
    if (transaction.status === "terminated") continue;
    if (params.kind === "closed" && transaction.status !== "closed") continue;
    const rawDate =
      params.kind === "closed"
        ? transaction.closingDate
        : transaction.contractDate;
    const date = asDate(rawDate);
    const agent = params.agentsById.get(transaction.agentId);
    if (!date || !agent || date < params.from || date > params.to) continue;
    const existing = summaries.get(agent.id) ?? {
      agentId: agent.id,
      agentName: agent.name ?? "Agent",
      units: 0,
      volume: 0,
      lastDate: date,
    };
    existing.units += 1;
    existing.volume += Number(transaction.purchasePrice ?? 0);
    if (date > existing.lastDate) existing.lastDate = date;
    summaries.set(agent.id, existing);
  }

  const rows = Array.from(summaries.values());
  if (rows.length === 0) return;
  const topUnits = Math.max(...rows.map(row => row.units));
  const topVolume = Math.max(...rows.map(row => row.volume));
  const periodKey =
    params.period === "week" ? weekKey(params.from) : monthKey(params.from);
  const periodLabel =
    params.period === "week"
      ? `the week of ${formatDate(params.from)}`
      : formatMonth(params.from);

  for (const summary of rows) {
    const ledUnits = topUnits > 0 && summary.units === topUnits;
    const ledVolume = topVolume > 0 && summary.volume === topVolume;
    if (!ledUnits && !ledVolume) continue;
    const agent = params.agentsById.get(summary.agentId)!;
    const achievement = [
      ledUnits
        ? `most ${params.kind === "closed" ? "closings" : "deals put under contract"} (${summary.units})`
        : null,
      ledVolume ? `highest volume (${formatCurrency(summary.volume)})` : null,
    ]
      .filter(Boolean)
      .join(" and ");
    const action =
      params.kind === "closed" ? "closed production" : "new contracts";

    params.create({
      key: `team_leader:${params.kind}:${params.period}:${periodKey}:${summary.agentId}`,
      agentId: summary.agentId,
      agentName: summary.agentName,
      email: agent.email,
      phone: agent.phone,
      profilePhotoUrl: agent.profilePhotoUrl,
      category: "team",
      type: `team_${params.period}_${params.kind}_leader`,
      occurredAt: params.to.toISOString(),
      title: `${params.period === "week" ? "Weekly" : "Monthly"} team leader`,
      description: `${summary.agentName} led the team’s ${action} for ${periodLabel} with the ${achievement}.`,
      suggestedMessage: `Congratulations on leading the team in ${action} for ${periodLabel}! You finished with the ${achievement}. Outstanding work!`,
      valueLabel: `${summary.units} ${params.kind === "closed" ? "closed" : "contracted"} · ${formatCurrency(summary.volume)}`,
      relatedUrl: "/leaderboard",
      priority: params.period === "month" ? 94 : 92,
    });
  }
}

export function buildCelebrationFeed(
  input: BuildCelebrationFeedInput
): CelebrationEvent[] {
  const now = input.now ? new Date(input.now) : new Date();
  const today = startOfUtcDay(now);
  const windowStart = shiftUtcDays(today, -input.daysBack);
  const windowEnd = endOfUtcDay(shiftUtcDays(today, input.daysForward));
  const agentsById = new Map(input.agents.map(agent => [agent.id, agent]));
  const acknowledgements = new Map(
    input.acknowledgements.map(row => [row.eventKey, row])
  );
  const events = new Map<string, CelebrationEvent>();

  const inWindow = (date: Date) => date >= windowStart && date <= windowEnd;
  const create = (
    event: Omit<
      CelebrationEvent,
      "timeframe" | "celebratedAt" | "celebratedById"
    >
  ) => {
    const eventDate = asDate(event.occurredAt);
    if (!eventDate || !inWindow(eventDate) || events.has(event.key)) return;
    const acknowledged = acknowledgements.get(event.key);
    events.set(event.key, {
      ...event,
      timeframe: timeframeFor(eventDate, today),
      celebratedAt: acknowledged
        ? (asDate(acknowledged.celebratedAt)?.toISOString() ?? null)
        : null,
      celebratedById: acknowledged?.celebratedById ?? null,
    });
  };

  for (const agent of input.agents) {
    const name = agent.name ?? "Agent";
    const personalBase = {
      agentId: agent.id,
      agentName: name,
      email: agent.email,
      phone: agent.phone,
      profilePhotoUrl: agent.profilePhotoUrl,
      category: "personal" as const,
      relatedUrl: `/agents/${agent.id}`,
    };

    const birthday = asDate(agent.dateOfBirth);
    if (birthday && agent.birthdayRecognitionOptIn !== false) {
      for (const year of [
        today.getUTCFullYear() - 1,
        today.getUTCFullYear(),
        today.getUTCFullYear() + 1,
      ]) {
        const occurrence = annualOccurrence(birthday, year);
        if (!inWindow(occurrence)) continue;
        create({
          ...personalBase,
          key: `birthday:${agent.id}:${year}`,
          type: "birthday",
          occurredAt: occurrence.toISOString(),
          title:
            timeframeFor(occurrence, today) === "today"
              ? "Birthday today"
              : "Agent birthday",
          description: `${name}’s birthday is ${formatDate(occurrence)}. Their profile allows birthday recognition.`,
          suggestedMessage: `Happy birthday, ${name.split(" ")[0]}! We hope this next year brings you plenty to celebrate, both personally and professionally. We’re grateful to have you at Savvy!`,
          valueLabel: formatDate(occurrence),
          priority: timeframeFor(occurrence, today) === "today" ? 100 : 88,
        });
      }
    }

    const anniversarySource =
      asDate(agent.startDateWithSavvy) ??
      asDate(agent.workAnniversaryDate) ??
      asDate(agent.onboardedDate);
    if (anniversarySource && agent.anniversaryRecognitionOptIn !== false) {
      for (const year of [
        today.getUTCFullYear() - 1,
        today.getUTCFullYear(),
        today.getUTCFullYear() + 1,
      ]) {
        const occurrence = annualOccurrence(anniversarySource, year);
        const years = year - anniversarySource.getUTCFullYear();
        if (years < 1 || !inWindow(occurrence)) continue;
        create({
          ...personalBase,
          key: `anniversary:${agent.id}:${year}`,
          type: "anniversary",
          occurredAt: occurrence.toISOString(),
          title:
            timeframeFor(occurrence, today) === "today"
              ? "Savvy anniversary today"
              : "Savvy anniversary",
          description: `${name} reaches ${plural(years, "year")} with Savvy on ${formatDate(occurrence)}.`,
          suggestedMessage: `Happy ${years === 1 ? "first" : `${years}-year`} Savvy anniversary, ${name.split(" ")[0]}! Thank you for everything you’ve contributed to the team. We’re excited for what you’ll accomplish next!`,
          valueLabel: plural(years, "year"),
          priority: timeframeFor(occurrence, today) === "today" ? 100 : 90,
        });
      }
    }
  }

  const closedByAgent = new Map<
    number,
    Array<TransactionInput & { eventDate: Date }>
  >();
  const contractsByAgent = new Map<
    number,
    Array<TransactionInput & { eventDate: Date }>
  >();
  for (const transaction of input.transactions) {
    const agent = agentsById.get(transaction.agentId);
    if (!agent || transaction.status === "terminated") continue;
    const contractDate = asDate(transaction.contractDate);
    if (contractDate && contractDate <= now) {
      const rows = contractsByAgent.get(transaction.agentId) ?? [];
      rows.push({ ...transaction, eventDate: contractDate });
      contractsByAgent.set(transaction.agentId, rows);
    }
    const closingDate = asDate(transaction.closingDate);
    if (transaction.status === "closed" && closingDate && closingDate <= now) {
      const rows = closedByAgent.get(transaction.agentId) ?? [];
      rows.push({ ...transaction, eventDate: closingDate });
      closedByAgent.set(transaction.agentId, rows);
    }
  }

  for (const [agentId, transactionsForAgent] of Array.from(
    contractsByAgent.entries()
  )) {
    const agent = agentsById.get(agentId)!;
    transactionsForAgent.sort(
      (a, b) => a.eventDate.getTime() - b.eventDate.getTime() || a.id - b.id
    );
    const firstContract = transactionsForAgent[0];
    if (firstContract && inWindow(firstContract.eventDate)) {
      const value = Number(firstContract.purchasePrice ?? 0);
      create({
        key: `first_contract:${agentId}:${firstContract.id}`,
        agentId,
        agentName: agent.name ?? "Agent",
        email: agent.email,
        phone: agent.phone,
        profilePhotoUrl: agent.profilePhotoUrl,
        category: "production",
        type: "first_contract",
        occurredAt: firstContract.eventDate.toISOString(),
        title: "First deal under contract",
        description: `${agent.name ?? "This agent"} put their first recorded SavvyOS deal under contract at ${propertyLabel(firstContract)}.`,
        suggestedMessage: `Congratulations on putting your first Savvy deal under contract! This is a huge milestone and the start of something special. Great work getting it across this important line!`,
        valueLabel: value > 0 ? formatCurrency(value) : "First contract",
        relatedUrl: `/transactions/${firstContract.id}`,
        priority: 96,
      });
    }

    let largestContract: (typeof transactionsForAgent)[number] | null = null;
    let largestValue = Number(firstContract?.purchasePrice ?? 0);
    for (const transaction of transactionsForAgent.slice(1)) {
      const value = Number(transaction.purchasePrice ?? 0);
      if (value > largestValue) {
        largestValue = value;
        largestContract = transaction;
      }
    }
    if (
      largestContract &&
      largestValue > 0 &&
      inWindow(largestContract.eventDate)
    ) {
      create({
        key: `largest_contract:${agentId}:${largestContract.id}`,
        agentId,
        agentName: agent.name ?? "Agent",
        email: agent.email,
        phone: agent.phone,
        profilePhotoUrl: agent.profilePhotoUrl,
        category: "production",
        type: "largest_contract",
        occurredAt: largestContract.eventDate.toISOString(),
        title: "Biggest deal under contract",
        description: `${agent.name ?? "This agent"} set a new personal record with a ${formatCurrency(largestValue)} deal under contract at ${propertyLabel(largestContract)}.`,
        suggestedMessage: `Congratulations on your biggest deal under contract yet—${formatCurrency(largestValue)}! That is an incredible personal record. Way to keep raising the bar!`,
        valueLabel: formatCurrency(largestValue),
        relatedUrl: `/transactions/${largestContract.id}`,
        priority: 93,
      });
    }
  }

  const weeklyGroups = new Map<string, PeriodSummary>();
  const monthlyGroups = new Map<string, PeriodSummary>();
  for (const [agentId, transactionsForAgent] of Array.from(
    closedByAgent.entries()
  )) {
    const agent = agentsById.get(agentId)!;
    transactionsForAgent.sort(
      (a, b) => a.eventDate.getTime() - b.eventDate.getTime() || a.id - b.id
    );
    const firstClosing = transactionsForAgent[0];
    if (firstClosing && inWindow(firstClosing.eventDate)) {
      const value = Number(firstClosing.purchasePrice ?? 0);
      create({
        key: `first_closing:${agentId}:${firstClosing.id}`,
        agentId,
        agentName: agent.name ?? "Agent",
        email: agent.email,
        phone: agent.phone,
        profilePhotoUrl: agent.profilePhotoUrl,
        category: "production",
        type: "first_closing",
        occurredAt: firstClosing.eventDate.toISOString(),
        title: "First closing",
        description: `${agent.name ?? "This agent"} recorded their first SavvyOS closing at ${propertyLabel(firstClosing)}.`,
        suggestedMessage: `Congratulations on your first Savvy closing! That is a milestone worth celebrating. Your persistence and care for your client made this happen—well done!`,
        valueLabel: value > 0 ? formatCurrency(value) : "First closing",
        relatedUrl: `/transactions/${firstClosing.id}`,
        priority: 99,
      });
    }

    transactionsForAgent.forEach((transaction, index) => {
      const value = Number(transaction.purchasePrice ?? 0);
      addToPeriod(weeklyGroups, agent, transaction.eventDate, value, "week");
      addToPeriod(monthlyGroups, agent, transaction.eventDate, value, "month");
      if (!inWindow(transaction.eventDate)) return;
      const closingNumber = index + 1;
      if (unitMilestones.includes(closingNumber) && closingNumber > 1) {
        create({
          key: `closing_milestone:${agentId}:${closingNumber}`,
          agentId,
          agentName: agent.name ?? "Agent",
          email: agent.email,
          phone: agent.phone,
          profilePhotoUrl: agent.profilePhotoUrl,
          category: "production",
          type: "closing_milestone",
          occurredAt: transaction.eventDate.toISOString(),
          title: `${closingNumber} career closings in SavvyOS`,
          description: `${agent.name ?? "This agent"} reached ${plural(closingNumber, "closing")} recorded in SavvyOS.`,
          suggestedMessage: `Congratulations on reaching ${closingNumber} closings with SavvyOS! Every one represents a client served and a goal achieved. What an outstanding milestone!`,
          valueLabel: plural(closingNumber, "closing"),
          relatedUrl: `/agents/${agentId}`,
          priority: closingNumber >= 25 ? 98 : 94,
        });
      }
    });

    let largestClosing: (typeof transactionsForAgent)[number] | null = null;
    let largestValue = Number(firstClosing?.purchasePrice ?? 0);
    for (const transaction of transactionsForAgent.slice(1)) {
      const value = Number(transaction.purchasePrice ?? 0);
      if (value > largestValue) {
        largestValue = value;
        largestClosing = transaction;
      }
    }
    if (
      largestClosing &&
      largestValue > 0 &&
      inWindow(largestClosing.eventDate)
    ) {
      create({
        key: `largest_closing:${agentId}:${largestClosing.id}`,
        agentId,
        agentName: agent.name ?? "Agent",
        email: agent.email,
        phone: agent.phone,
        profilePhotoUrl: agent.profilePhotoUrl,
        category: "production",
        type: "largest_closing",
        occurredAt: largestClosing.eventDate.toISOString(),
        title: "Biggest closing yet",
        description: `${agent.name ?? "This agent"} closed a personal-record ${formatCurrency(largestValue)} transaction at ${propertyLabel(largestClosing)}.`,
        suggestedMessage: `Congratulations on your biggest closing yet—${formatCurrency(largestValue)}! This is a tremendous achievement and a reflection of the work you put in for your clients.`,
        valueLabel: formatCurrency(largestValue),
        relatedUrl: `/transactions/${largestClosing.id}`,
        priority: 97,
      });
    }
  }

  recordPeriodEvents(weeklyGroups, agentsById, "week", inWindow, create);
  recordPeriodEvents(monthlyGroups, agentsById, "month", inWindow, create);

  for (const review of input.reviews) {
    const agent = agentsById.get(review.agentId);
    const submittedAt = asDate(review.submittedAt);
    if (!agent || !submittedAt || review.rating < 5 || !inWindow(submittedAt))
      continue;
    const quote = review.comment?.trim()
      ? ` “${review.comment.trim().slice(0, 220)}${review.comment.trim().length > 220 ? "…" : ""}”`
      : "";
    create({
      key: `five_star_review:${review.id}`,
      agentId: review.agentId,
      agentName: agent.name ?? "Agent",
      email: agent.email,
      phone: agent.phone,
      profilePhotoUrl: agent.profilePhotoUrl,
      category: "review",
      type: "five_star_review",
      occurredAt: submittedAt.toISOString(),
      title: "New five-star review",
      description: `${agent.name ?? "This agent"} earned a five-star review from ${review.reviewerName}.${quote}`,
      suggestedMessage: `Congratulations on the five-star review, ${agent.name?.split(" ")[0] ?? "there"}! Your client’s feedback is a wonderful reflection of the experience you create. Keep up the exceptional work!`,
      valueLabel: "5 stars",
      relatedUrl: "/reviews",
      priority: 95,
    });
  }

  const currentYear = today.getUTCFullYear();
  for (const goal of input.goals.filter(row => row.year === currentYear)) {
    const agent = agentsById.get(goal.agentId);
    const annualClosings = (closedByAgent.get(goal.agentId) ?? [])
      .filter(row => row.eventDate.getUTCFullYear() === currentYear)
      .sort(
        (a, b) => a.eventDate.getTime() - b.eventDate.getTime() || a.id - b.id
      );
    if (!agent || annualClosings.length === 0) continue;

    const goalMetrics = [
      {
        key: "closings",
        label: "annual closing goal",
        target: Number(goal.closingsTarget ?? 0),
        value: (_total: number, _volume: number, count: number) => count,
        display: (value: number) => plural(value, "closing"),
      },
      {
        key: "volume",
        label: "annual volume goal",
        target: Number(goal.volumeTarget ?? 0),
        value: (_total: number, volume: number) => volume,
        display: formatCurrency,
      },
      {
        key: "gci",
        label: "annual GCI goal",
        target: Number(goal.gciTarget ?? 0),
        value: (total: number) => total,
        display: formatCurrency,
      },
    ];

    for (const metric of goalMetrics) {
      if (!(metric.target > 0)) continue;
      let gci = 0;
      let volume = 0;
      let count = 0;
      let crossed: (TransactionInput & { eventDate: Date }) | null = null;
      for (const transaction of annualClosings) {
        gci += Number(transaction.grossCommissionIncome ?? 0);
        volume += Number(transaction.purchasePrice ?? 0);
        count += 1;
        if (metric.value(gci, volume, count) >= metric.target) {
          crossed = transaction;
          break;
        }
      }
      if (!crossed || !inWindow(crossed.eventDate)) continue;
      create({
        key: `annual_goal:${goal.agentId}:${currentYear}:${metric.key}`,
        agentId: goal.agentId,
        agentName: agent.name ?? "Agent",
        email: agent.email,
        phone: agent.phone,
        profilePhotoUrl: agent.profilePhotoUrl,
        category: "goal",
        type: `annual_${metric.key}_goal`,
        occurredAt: crossed.eventDate.toISOString(),
        title: `Hit ${metric.label}`,
        description: `${agent.name ?? "This agent"} reached their ${currentYear} ${metric.label} of ${metric.display(metric.target)}.`,
        suggestedMessage: `Congratulations on reaching your ${currentYear} ${metric.label}! Hitting ${metric.display(metric.target)} is a major accomplishment. Your consistency and hard work are paying off!`,
        valueLabel: metric.display(metric.target),
        relatedUrl: `/agents/${goal.agentId}`,
        priority: 98,
      });
    }
  }

  const currentWeekStart = startOfUtcWeek(today);
  const previousWeekStart = shiftUtcDays(currentWeekStart, -7);
  const previousWeekEnd = endOfUtcDay(shiftUtcDays(currentWeekStart, -1));
  addTeamLeaderEvents({
    transactions: input.transactions,
    agentsById,
    kind: "under_contract",
    period: "week",
    from: previousWeekStart,
    to: previousWeekEnd,
    create,
  });
  addTeamLeaderEvents({
    transactions: input.transactions,
    agentsById,
    kind: "closed",
    period: "week",
    from: previousWeekStart,
    to: previousWeekEnd,
    create,
  });

  const previousMonthEnd = endOfPreviousUtcMonth(today);
  const previousMonthStart = startOfUtcMonth(previousMonthEnd);
  addTeamLeaderEvents({
    transactions: input.transactions,
    agentsById,
    kind: "under_contract",
    period: "month",
    from: previousMonthStart,
    to: previousMonthEnd,
    create,
  });
  addTeamLeaderEvents({
    transactions: input.transactions,
    agentsById,
    kind: "closed",
    period: "month",
    from: previousMonthStart,
    to: previousMonthEnd,
    create,
  });

  return Array.from(events.values()).sort((a, b) => {
    if (Boolean(a.celebratedAt) !== Boolean(b.celebratedAt))
      return a.celebratedAt ? 1 : -1;
    if (a.timeframe === "today" && b.timeframe !== "today") return -1;
    if (b.timeframe === "today" && a.timeframe !== "today") return 1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    const aDate = asDate(a.occurredAt)?.getTime() ?? 0;
    const bDate = asDate(b.occurredAt)?.getTime() ?? 0;
    if (a.timeframe === "upcoming" && b.timeframe === "upcoming")
      return aDate - bDate;
    return bDate - aDate;
  });
}

export async function getAgentCelebrationFeed(options: {
  daysBack: number;
  daysForward: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date();
  const reviewFrom = shiftUtcDays(startOfUtcDay(now), -options.daysBack);

  const [agents, transactionRows, reviewRows, goalRows, acknowledgementRows] =
    await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: sql<
            string | null
          >`COALESCE(NULLIF(${users.phone}, ''), NULLIF(${userProfiles.primaryPhone}, ''))`,
          profilePhotoUrl: userProfiles.profilePhotoUrl,
          dateOfBirth: userProfiles.dateOfBirth,
          workAnniversaryDate: userProfiles.workAnniversaryDate,
          onboardedDate: userProfiles.onboardedDate,
          startDateWithSavvy: agentProfiles.startDateWithSavvy,
          birthdayRecognitionOptIn: agentProfiles.birthdayRecognitionOptIn,
          anniversaryRecognitionOptIn:
            agentProfiles.anniversaryRecognitionOptIn,
        })
        .from(users)
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .leftJoin(agentProfiles, eq(agentProfiles.userId, users.id))
        .where(
          and(
            eq(users.role, "agent"),
            eq(users.isActive, true),
            sql`COALESCE(${agentProfiles.agentStatus}, 'active') = 'active'`,
            sql`LOWER(TRIM(COALESCE(${users.name}, ''))) <> 'savvy agent'`
          )
        ),
      db
        .select({
          id: transactions.id,
          agentId: transactions.agentId,
          status: transactions.status,
          purchasePrice: transactions.purchasePrice,
          grossCommissionIncome: transactions.grossCommissionIncome,
          contractDate: transactions.contractDate,
          closingDate: transactions.closingDate,
          propertyAddress: properties.address,
          propertyCity: properties.city,
          propertyState: properties.state,
        })
        .from(transactions)
        .innerJoin(users, eq(users.id, transactions.agentId))
        .leftJoin(properties, eq(properties.id, transactions.propertyId))
        .where(
          and(
            eq(users.role, "agent"),
            eq(users.isActive, true),
            sql`${transactions.referralId} IS NULL AND NOT EXISTS (
          SELECT 1 FROM \`referral_transaction_links\` rtl
          WHERE rtl.\`transactionId\` = ${transactions.id}
        )`
          )
        ),
      db
        .select({
          id: reviews.id,
          transactionId: reviews.transactionId,
          agentId: reviews.agentId,
          rating: reviews.rating,
          reviewerName: reviews.reviewerName,
          comment: reviews.comment,
          submittedAt: reviews.submittedAt,
        })
        .from(reviews)
        .innerJoin(users, eq(users.id, reviews.agentId))
        .where(
          and(
            eq(reviews.isTest, false),
            eq(users.isActive, true),
            sql`${reviews.submittedAt} >= ${reviewFrom}`
          )
        ),
      db
        .select()
        .from(agentGoals)
        .where(
          and(
            eq(agentGoals.year, now.getUTCFullYear()),
            eq(agentGoals.month, 0)
          )
        ),
      db
        .select({
          eventKey: agentCelebrationEvents.eventKey,
          celebratedAt: agentCelebrationEvents.celebratedAt,
          celebratedById: agentCelebrationEvents.celebratedById,
        })
        .from(agentCelebrationEvents),
    ]);

  const events = buildCelebrationFeed({
    agents,
    transactions: transactionRows,
    reviews: reviewRows,
    goals: goalRows,
    acknowledgements: acknowledgementRows,
    now,
    ...options,
  });

  return {
    generatedAt: now.toISOString(),
    events,
    summary: {
      readyNow: events.filter(
        event => !event.celebratedAt && event.timeframe !== "upcoming"
      ).length,
      today: events.filter(
        event => !event.celebratedAt && event.timeframe === "today"
      ).length,
      comingUp: events.filter(
        event => !event.celebratedAt && event.timeframe === "upcoming"
      ).length,
      celebrated: events.filter(event => Boolean(event.celebratedAt)).length,
    },
  };
}

export async function markAgentCelebration(params: {
  event: CelebrationEvent;
  celebratedById: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .insert(agentCelebrationEvents)
    .values({
      eventKey: params.event.key,
      agentId: params.event.agentId,
      celebrationType: params.event.type,
      eventOccurredAt: asDate(params.event.occurredAt) ?? new Date(),
      celebratedById: params.celebratedById,
      celebratedAt: new Date(),
      eventSnapshot: {
        title: params.event.title,
        description: params.event.description,
        suggestedMessage: params.event.suggestedMessage,
        valueLabel: params.event.valueLabel,
        relatedUrl: params.event.relatedUrl,
      },
    })
    .onDuplicateKeyUpdate({
      set: {
        celebratedById: params.celebratedById,
        celebratedAt: new Date(),
        eventSnapshot: {
          title: params.event.title,
          description: params.event.description,
          suggestedMessage: params.event.suggestedMessage,
          valueLabel: params.event.valueLabel,
          relatedUrl: params.event.relatedUrl,
        },
      },
    });
}

export async function reopenAgentCelebration(eventKey: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .delete(agentCelebrationEvents)
    .where(eq(agentCelebrationEvents.eventKey, eventKey));
}
