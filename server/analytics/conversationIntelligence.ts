import { sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";

export type ConversationIntelligenceFilters = {
  dateFrom?: string;
  dateTo?: string;
  agentId?: number;
  leadSourceId?: number;
  direction?: "inbound" | "outbound";
  hasTranscript?: boolean;
  intentTier?: "priority" | "active" | "nurture" | "unknown";
  targetMarket?: string;
};

type Row = Record<string, unknown>;

function rowsFromResult<T extends Row = Row>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

async function runRows<T extends Row = Row>(statement: SQL): Promise<T[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await (db as unknown as { execute: (query: SQL) => Promise<unknown> }).execute(statement);
  return rowsFromResult<T>(result);
}

function asNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function percent(numerator: number, denominator: number): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function day(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : null;
}

function combineWhere(clauses: Array<SQL | undefined>): SQL {
  const usable = clauses.filter((clause): clause is SQL => Boolean(clause));
  return sql`WHERE ${sql.join(usable, sql` AND `)}`;
}

function scopedCallsCte(filters: ConversationIntelligenceFilters): SQL {
  const targetMarket = filters.targetMarket?.trim();
  const where = combineWhere([
    sql`ac.\`contactId\` IS NOT NULL`,
    filters.dateFrom ? sql`ac.\`startedAt\` >= ${filters.dateFrom}` : undefined,
    filters.dateTo ? sql`ac.\`startedAt\` < DATE_ADD(${filters.dateTo}, INTERVAL 1 DAY)` : undefined,
    filters.agentId ? sql`currentConnection.\`agentId\` = ${filters.agentId}` : undefined,
    filters.leadSourceId ? sql`c.\`leadSourceId\` = ${filters.leadSourceId}` : undefined,
    filters.direction ? sql`ac.\`direction\` = ${filters.direction}` : undefined,
    filters.hasTranscript === true ? sql`comm.\`transcription\` IS NOT NULL AND CHAR_LENGTH(TRIM(comm.\`transcription\`)) > 0` : undefined,
    filters.hasTranscript === false ? sql`(comm.\`transcription\` IS NULL OR CHAR_LENGTH(TRIM(comm.\`transcription\`)) = 0)` : undefined,
    filters.intentTier ? sql`COALESCE(ci.\`intentTier\`, 'unknown') = ${filters.intentTier}` : undefined,
    targetMarket ? sql`EXISTS (
      SELECT 1 FROM \`contact_intelligence_signals\` cisFilter
      WHERE cisFilter.\`contactId\` = c.\`id\`
        AND cisFilter.\`signalKey\` = 'target_market'
        AND cisFilter.\`status\` = 'active'
        AND LOWER(cisFilter.\`value\`) LIKE ${`%${targetMarket.toLowerCase()}%`}
    )` : undefined,
  ]);
  return sql`
    WITH scoped_calls AS (
      SELECT
        ac.\`aircallCallId\` AS aircallCallId,
        ac.\`contactId\` AS contactId,
        ac.\`direction\` AS direction,
        ac.\`duration\` AS duration,
        ac.\`startedAt\` AS startedAt,
        ac.\`aircallNumberName\` AS lineName,
        c.\`firstName\` AS firstName,
        c.\`lastName\` AS lastName,
        c.\`createdAt\` AS contactCreatedAt,
        c.\`leadSourceId\` AS leadSourceId,
        ls.\`name\` AS leadSourceName,
        currentConnection.\`agentId\` AS agentId,
        owner.\`name\` AS agentName,
        currentConnection.\`appointmentSet\` AS appointmentSet,
        ci.\`id\` AS profileId,
        ci.\`intentTier\` AS intentTier,
        ci.\`intentScore\` AS intentScore,
        ci.\`confidence\` AS profileConfidence,
        ci.\`profile\` AS profile,
        ci.\`lastAnalyzedAt\` AS lastAnalyzedAt,
        CASE WHEN comm.\`transcription\` IS NOT NULL AND CHAR_LENGTH(TRIM(comm.\`transcription\`)) > 0 THEN 1 ELSE 0 END AS hasTranscript
      FROM \`aircall_calls\` ac
      INNER JOIN \`contacts\` c ON c.\`id\` = ac.\`contactId\`
      LEFT JOIN \`communications\` comm ON comm.\`id\` = ac.\`communicationId\`
      LEFT JOIN \`lead_sources\` ls ON ls.\`id\` = c.\`leadSourceId\`
      LEFT JOIN (
        SELECT connection.\`contactId\`, connection.\`agentId\`, connection.\`appointmentSet\`
        FROM \`agent_connections\` connection
        INNER JOIN (
          SELECT \`contactId\`, MAX(\`id\`) AS latestConnectionId
          FROM \`agent_connections\`
          WHERE \`archivedAt\` IS NULL
          GROUP BY \`contactId\`
        ) latest ON latest.latestConnectionId = connection.\`id\`
      ) currentConnection ON currentConnection.\`contactId\` = c.\`id\`
      LEFT JOIN \`users\` owner ON owner.\`id\` = currentConnection.\`agentId\`
      LEFT JOIN \`contact_intelligence_profiles\` ci ON ci.\`contactId\` = c.\`id\`
      ${where}
    ),
    scoped_contacts AS (
      SELECT
        contactId,
        MAX(firstName) AS firstName,
        MAX(lastName) AS lastName,
        MAX(contactCreatedAt) AS contactCreatedAt,
        MAX(leadSourceId) AS leadSourceId,
        MAX(leadSourceName) AS leadSourceName,
        MAX(agentId) AS agentId,
        MAX(agentName) AS agentName,
        MAX(appointmentSet) AS appointmentSet,
        MAX(profileId) AS profileId,
        MAX(intentTier) AS intentTier,
        MAX(intentScore) AS intentScore,
        MAX(profileConfidence) AS profileConfidence,
        MAX(lastAnalyzedAt) AS lastAnalyzedAt,
        MIN(startedAt) AS firstCallAt,
        MAX(startedAt) AS lastCallAt,
        COUNT(*) AS calls,
        SUM(hasTranscript) AS transcriptCalls
      FROM scoped_calls
      GROUP BY contactId
    ),
    outcomes AS (
      SELECT
        t.\`primaryContactId\` AS contactId,
        MIN(CASE WHEN t.\`status\` IN ('under_contract', 'closed') AND t.\`contractDate\` IS NOT NULL THEN t.\`contractDate\` END) AS firstContractAt,
        MIN(CASE WHEN t.\`status\` = 'closed' AND t.\`closingDate\` IS NOT NULL THEN t.\`closingDate\` END) AS firstCloseAt,
        COALESCE(SUM(CASE WHEN t.\`status\` = 'closed' THEN COALESCE(t.\`grossCommissionIncome\`, 0) ELSE 0 END), 0) AS closedGci,
        COALESCE(SUM(CASE WHEN t.\`status\` = 'closed' THEN COALESCE(payout.\`savvyNet\`, 0) ELSE 0 END), 0) AS recordedSavvyNet
      FROM \`transactions\` t
      LEFT JOIN (
        SELECT \`transactionId\`, COALESCE(SUM(CASE WHEN \`payeeType\` IN ('savvy_str_agents', 'exp') THEN COALESCE(\`amount\`, 0) ELSE 0 END), 0) AS savvyNet
        FROM \`transaction_payout_items\`
        GROUP BY \`transactionId\`
      ) payout ON payout.\`transactionId\` = t.\`id\`
      GROUP BY t.\`primaryContactId\`
    )
  `;
}

type SummaryRow = {
  eligibleCalls: unknown;
  transcriptCalls: unknown;
  eligibleContacts: unknown;
  transcriptContacts: unknown;
  enrichedContacts: unknown;
  priorityContacts: unknown;
  appointments: unknown;
  contractedContacts: unknown;
  closedContacts: unknown;
  closedGci: unknown;
  recordedSavvyNet: unknown;
  averageSpeedToLeadHours: unknown;
  failedJobs: unknown;
  unlinkedCalls: unknown;
};

type QueueRow = {
  contactId: unknown;
  contactName: unknown;
  leadSourceName: unknown;
  agentName: unknown;
  intentTier: unknown;
  intentScore: unknown;
  lastCallAt: unknown;
  nextBestAction: unknown;
  promisedNextStep: unknown;
  openObjections: unknown;
  missingDiscovery: unknown;
  hasOpenTask: unknown;
};

function definitions() {
  return {
    eligibleCalls: "Matched Aircall calls in the selected call-date scope. Unmatched Aircall calls are shown separately as a data-quality limitation.",
    transcriptCoverage: "Completed native Aircall transcripts divided by matched calls in scope. Coverage is displayed with every finding because missing transcripts may make the evidence incomplete.",
    enrichedContacts: "Unique transcript-bearing contacts with a successfully resolved Contact Intelligence profile. Profiles are derived from native Aircall evidence and do not overwrite human-managed CRM fields.",
    revenuePath: "Observed downstream appointment, contract, closing, GCI, and recorded Savvy Net linked to the same contact after the first scoped call. This is an observed CRM path, not a causal or multi-touch attribution model.",
    priorityQueue: "Contacts with a priority Contact Intelligence tier but no current open CRM task. It is a review queue, not an automated client outreach or pipeline-stage change.",
    objectionIntelligence: "Evidence-linked active objection signals from analyzed transcripts. Counts show stated conversation friction, not a rating of agents or customers.",
  };
}

export async function getConversationIntelligenceReport(filters: ConversationIntelligenceFilters) {
  const cte = scopedCallsCte(filters);
  const summaryRows = await runRows<SummaryRow>(sql`
    ${cte}
    SELECT
      (SELECT COUNT(*) FROM scoped_calls) AS eligibleCalls,
      (SELECT COALESCE(SUM(hasTranscript), 0) FROM scoped_calls) AS transcriptCalls,
      (SELECT COUNT(*) FROM scoped_contacts) AS eligibleContacts,
      (SELECT COUNT(*) FROM scoped_contacts WHERE transcriptCalls > 0) AS transcriptContacts,
      (SELECT COUNT(*) FROM scoped_contacts WHERE transcriptCalls > 0 AND profileId IS NOT NULL) AS enrichedContacts,
      (SELECT COUNT(*) FROM scoped_contacts WHERE transcriptCalls > 0 AND intentTier = 'priority') AS priorityContacts,
      (SELECT COUNT(*) FROM scoped_contacts WHERE appointmentSet = 1) AS appointments,
      (SELECT COUNT(*) FROM scoped_contacts sc LEFT JOIN outcomes o ON o.contactId = sc.contactId WHERE (o.firstContractAt IS NOT NULL AND o.firstContractAt >= sc.firstCallAt) OR (o.firstCloseAt IS NOT NULL AND o.firstCloseAt >= sc.firstCallAt)) AS contractedContacts,
      (SELECT COUNT(*) FROM scoped_contacts sc LEFT JOIN outcomes o ON o.contactId = sc.contactId WHERE o.firstCloseAt IS NOT NULL AND o.firstCloseAt >= sc.firstCallAt) AS closedContacts,
      (SELECT COALESCE(SUM(o.closedGci), 0) FROM scoped_contacts sc LEFT JOIN outcomes o ON o.contactId = sc.contactId WHERE o.firstCloseAt IS NOT NULL AND o.firstCloseAt >= sc.firstCallAt) AS closedGci,
      (SELECT COALESCE(SUM(o.recordedSavvyNet), 0) FROM scoped_contacts sc LEFT JOIN outcomes o ON o.contactId = sc.contactId WHERE o.firstCloseAt IS NOT NULL AND o.firstCloseAt >= sc.firstCallAt) AS recordedSavvyNet,
      (SELECT AVG(TIMESTAMPDIFF(MINUTE, sc.contactCreatedAt, sc.firstCallAt)) / 60 FROM scoped_contacts sc WHERE sc.contactCreatedAt IS NOT NULL AND sc.firstCallAt >= sc.contactCreatedAt) AS averageSpeedToLeadHours,
      (SELECT COUNT(*) FROM contact_intelligence_jobs WHERE status = 'failed') AS failedJobs,
      (SELECT COUNT(*) FROM aircall_calls ac WHERE ac.contactId IS NULL ${filters.dateFrom ? sql`AND ac.startedAt >= ${filters.dateFrom}` : sql``} ${filters.dateTo ? sql`AND ac.startedAt < DATE_ADD(${filters.dateTo}, INTERVAL 1 DAY)` : sql``}) AS unlinkedCalls
  `);
  const summaryRow = summaryRows[0] ?? {};
  const summary = {
    eligibleCalls: asNumber(summaryRow.eligibleCalls),
    transcriptCalls: asNumber(summaryRow.transcriptCalls),
    eligibleContacts: asNumber(summaryRow.eligibleContacts),
    transcriptContacts: asNumber(summaryRow.transcriptContacts),
    enrichedContacts: asNumber(summaryRow.enrichedContacts),
    priorityContacts: asNumber(summaryRow.priorityContacts),
    appointments: asNumber(summaryRow.appointments),
    contractedContacts: asNumber(summaryRow.contractedContacts),
    closedContacts: asNumber(summaryRow.closedContacts),
    closedGci: asNumber(summaryRow.closedGci),
    recordedSavvyNet: asNumber(summaryRow.recordedSavvyNet),
    averageSpeedToLeadHours: asNullableNumber(summaryRow.averageSpeedToLeadHours),
    failedJobs: asNumber(summaryRow.failedJobs),
    unlinkedCalls: asNumber(summaryRow.unlinkedCalls),
  };

  const queueRows = await runRows<QueueRow>(sql`
    ${cte}
    SELECT
      sc.\`contactId\` AS contactId,
      CONCAT_WS(' ', sc.\`firstName\`, sc.\`lastName\`) AS contactName,
      COALESCE(sc.\`leadSourceName\`, 'Unattributed') AS leadSourceName,
      COALESCE(sc.\`agentName\`, 'Unassigned') AS agentName,
      COALESCE(sc.\`intentTier\`, 'unknown') AS intentTier,
      COALESCE(sc.\`intentScore\`, 0) AS intentScore,
      sc.\`lastCallAt\` AS lastCallAt,
      JSON_UNQUOTE(JSON_EXTRACT(profile.\`profile\`, '$.nextBestAction')) AS nextBestAction,
      JSON_UNQUOTE(JSON_EXTRACT(profile.\`profile\`, '$.promisedNextStep')) AS promisedNextStep,
      JSON_UNQUOTE(JSON_EXTRACT(profile.\`profile\`, '$.objections')) AS openObjections,
      JSON_UNQUOTE(JSON_EXTRACT(profile.\`profile\`, '$.missingDiscovery')) AS missingDiscovery,
      CASE WHEN EXISTS (
        SELECT 1 FROM \`tasks\` task
        WHERE task.\`relatedContactId\` = sc.\`contactId\`
          AND task.\`status\` IN ('pending', 'in_progress')
      ) THEN 1 ELSE 0 END AS hasOpenTask
    FROM scoped_contacts sc
    LEFT JOIN \`contact_intelligence_profiles\` profile ON profile.\`id\` = sc.\`profileId\`
    WHERE sc.\`transcriptCalls\` > 0
      AND sc.\`intentTier\` = 'priority'
    ORDER BY hasOpenTask ASC, sc.\`intentScore\` DESC, sc.\`lastCallAt\` ASC
    LIMIT 100
  `);

  const objectionRows = await runRows<Row>(sql`
    ${cte}
    SELECT
      cis.\`value\` AS objection,
      COUNT(DISTINCT cis.\`contactId\`) AS contacts,
      COUNT(*) AS mentions,
      SUM(CASE WHEN sc.\`intentTier\` = 'priority' THEN 1 ELSE 0 END) AS priorityContacts
    FROM scoped_calls sc
    INNER JOIN \`contact_intelligence_signals\` cis
      ON cis.\`aircallCallId\` = sc.\`aircallCallId\`
      AND cis.\`signalKey\` = 'objection'
      AND cis.\`status\` = 'active'
    GROUP BY cis.\`value\`
    ORDER BY contacts DESC, mentions DESC, objection ASC
    LIMIT 12
  `);

  const sourceRows = await runRows<Row>(sql`
    ${cte}
    SELECT
      sourceContacts.\`leadSourceId\` AS leadSourceId,
      sourceContacts.\`leadSourceName\` AS leadSourceName,
      SUM(sourceContacts.\`calls\`) AS calls,
      SUM(sourceContacts.\`transcriptCalls\`) AS transcriptCalls,
      COUNT(*) AS contacts,
      SUM(sourceContacts.\`isPriority\`) AS priorityContacts,
      SUM(sourceContacts.\`hasAppointment\`) AS appointments,
      SUM(sourceContacts.\`hasClosed\`) AS closedContacts,
      COALESCE(SUM(sourceContacts.\`observedGci\`), 0) AS observedGci
    FROM (
      SELECT
        COALESCE(sc.\`leadSourceId\`, 0) AS leadSourceId,
        COALESCE(sc.\`leadSourceName\`, 'Unattributed') AS leadSourceName,
        sc.\`contactId\` AS contactId,
        COUNT(*) AS calls,
        COALESCE(SUM(sc.\`hasTranscript\`), 0) AS transcriptCalls,
        MAX(CASE WHEN sc.\`hasTranscript\` = 1 AND sc.\`intentTier\` = 'priority' THEN 1 ELSE 0 END) AS isPriority,
        MAX(CASE WHEN sc.\`appointmentSet\` = 1 THEN 1 ELSE 0 END) AS hasAppointment,
        MAX(CASE WHEN o.\`firstCloseAt\` IS NOT NULL AND o.\`firstCloseAt\` >= sc.\`startedAt\` THEN 1 ELSE 0 END) AS hasClosed,
        MAX(CASE WHEN o.\`firstCloseAt\` IS NOT NULL AND o.\`firstCloseAt\` >= sc.\`startedAt\` THEN o.\`closedGci\` ELSE 0 END) AS observedGci
      FROM scoped_calls sc
      LEFT JOIN outcomes o ON o.\`contactId\` = sc.\`contactId\`
      GROUP BY sc.\`leadSourceId\`, sc.\`leadSourceName\`, sc.\`contactId\`
    ) sourceContacts
    GROUP BY sourceContacts.\`leadSourceId\`, sourceContacts.\`leadSourceName\`
    ORDER BY observedGci DESC, priorityContacts DESC, contacts DESC
    LIMIT 50
  `);

  const marketRows = await runRows<Row>(sql`
    ${cte}
    SELECT
      marketContacts.\`market\` AS market,
      COUNT(*) AS contacts,
      SUM(marketContacts.\`isPriority\`) AS priorityContacts,
      SUM(marketContacts.\`hasClosed\`) AS closedContacts,
      COALESCE(SUM(marketContacts.\`observedGci\`), 0) AS observedGci
    FROM (
      SELECT
        cis.\`value\` AS market,
        sc.\`contactId\` AS contactId,
        MAX(CASE WHEN sc.\`intentTier\` = 'priority' THEN 1 ELSE 0 END) AS isPriority,
        MAX(CASE WHEN o.\`firstCloseAt\` IS NOT NULL AND o.\`firstCloseAt\` >= sc.\`startedAt\` THEN 1 ELSE 0 END) AS hasClosed,
        MAX(CASE WHEN o.\`firstCloseAt\` IS NOT NULL AND o.\`firstCloseAt\` >= sc.\`startedAt\` THEN o.\`closedGci\` ELSE 0 END) AS observedGci
      FROM scoped_calls sc
      INNER JOIN \`contact_intelligence_signals\` cis
        ON cis.\`aircallCallId\` = sc.\`aircallCallId\`
        AND cis.\`signalKey\` = 'target_market'
        AND cis.\`status\` = 'active'
      LEFT JOIN outcomes o ON o.\`contactId\` = sc.\`contactId\`
      GROUP BY cis.\`value\`, sc.\`contactId\`
    ) marketContacts
    GROUP BY marketContacts.\`market\`
    ORDER BY priorityContacts DESC, contacts DESC, market ASC
    LIMIT 18
  `);

  const ownerRows = await runRows<Row>(sql`
    ${cte}
    SELECT
      sc.\`agentId\` AS agentId,
      COALESCE(sc.\`agentName\`, 'Unassigned') AS agentName,
      COUNT(DISTINCT sc.\`contactId\`) AS contacts,
      COUNT(DISTINCT CASE WHEN sc.\`hasTranscript\` = 1 THEN sc.\`contactId\` END) AS transcriptContacts,
      COUNT(DISTINCT CASE WHEN sc.\`intentTier\` = 'priority' THEN sc.\`contactId\` END) AS priorityContacts,
      COUNT(DISTINCT CASE WHEN sc.\`appointmentSet\` = 1 THEN sc.\`contactId\` END) AS appointments,
      COUNT(DISTINCT CASE WHEN o.\`firstCloseAt\` IS NOT NULL AND o.\`firstCloseAt\` >= sc.\`startedAt\` THEN sc.\`contactId\` END) AS closedContacts
    FROM scoped_calls sc
    LEFT JOIN outcomes o ON o.\`contactId\` = sc.\`contactId\`
    GROUP BY sc.\`agentId\`, sc.\`agentName\`
    ORDER BY priorityContacts DESC, transcriptContacts DESC, contacts DESC
    LIMIT 50
  `);

  const evidenceRows = await runRows<Row>(sql`
    ${cte}
    SELECT
      sc.\`contactId\` AS contactId,
      CONCAT_WS(' ', sc.\`firstName\`, sc.\`lastName\`) AS contactName,
      sc.\`aircallCallId\` AS aircallCallId,
      sc.\`startedAt\` AS startedAt,
      sc.\`direction\` AS direction,
      sc.\`duration\` AS duration,
      COALESCE(sc.\`leadSourceName\`, 'Unattributed') AS leadSourceName,
      COALESCE(sc.\`agentName\`, 'Unassigned') AS agentName,
      COALESCE(sc.\`intentTier\`, 'unknown') AS intentTier,
      COALESCE(sc.\`intentScore\`, 0) AS intentScore,
      sc.\`profileConfidence\` AS confidence,
      JSON_UNQUOTE(JSON_EXTRACT(profile.\`profile\`, '$.nextBestAction')) AS nextBestAction,
      JSON_UNQUOTE(JSON_EXTRACT(profile.\`profile\`, '$.timeline')) AS timeline,
      JSON_UNQUOTE(JSON_EXTRACT(profile.\`profile\`, '$.targetMarkets')) AS targetMarkets
    FROM scoped_calls sc
    LEFT JOIN \`contact_intelligence_profiles\` profile ON profile.\`id\` = sc.\`profileId\`
    WHERE sc.\`hasTranscript\` = 1
    ORDER BY sc.\`startedAt\` DESC
    LIMIT 150
  `);

  const filterRows = await runRows<Row>(sql`
    SELECT id, COALESCE(name, CONCAT('User #', id)) AS name
    FROM \`users\`
    WHERE \`role\` IN ('admin', 'agent', 'isa') AND \`isActive\` = 1
    ORDER BY name ASC
  `);
  const sourceFilters = await runRows<Row>(sql`
    SELECT id, name FROM \`lead_sources\` ORDER BY name ASC
  `);

  const actionQueue = queueRows.map(row => ({
    contactId: asNumber(row.contactId),
    contactName: asText(row.contactName) || "Unnamed contact",
    leadSourceName: asText(row.leadSourceName) || "Unattributed",
    agentName: asText(row.agentName) || "Unassigned",
    intentTier: asText(row.intentTier) || "unknown",
    intentScore: asNumber(row.intentScore),
    lastCallAt: day(row.lastCallAt),
    nextBestAction: asText(row.nextBestAction),
    promisedNextStep: asText(row.promisedNextStep),
    openObjections: asText(row.openObjections),
    missingDiscovery: asText(row.missingDiscovery),
    hasOpenTask: asNumber(row.hasOpenTask) > 0,
  }));

  return {
    filters: {
      dateFrom: filters.dateFrom ?? null,
      dateTo: filters.dateTo ?? null,
      agentId: filters.agentId ?? null,
      leadSourceId: filters.leadSourceId ?? null,
      direction: filters.direction ?? null,
      hasTranscript: filters.hasTranscript ?? null,
      intentTier: filters.intentTier ?? null,
      targetMarket: filters.targetMarket?.trim() || null,
    },
    availableFilters: {
      agents: filterRows.map(row => ({ id: asNumber(row.id), name: asText(row.name) })),
      sources: sourceFilters.map(row => ({ id: asNumber(row.id), name: asText(row.name) })),
    },
    summary: {
      ...summary,
      transcriptCoveragePct: percent(summary.transcriptCalls, summary.eligibleCalls),
      enrichmentCoveragePct: percent(summary.enrichedContacts, summary.transcriptContacts),
      priorityRatePct: percent(summary.priorityContacts, summary.transcriptContacts),
      appointmentRatePct: percent(summary.appointments, summary.eligibleContacts),
      contractRatePct: percent(summary.contractedContacts, summary.eligibleContacts),
      closeRatePct: percent(summary.closedContacts, summary.eligibleContacts),
    },
    funnel: [
      { stage: "Matched calls", count: summary.eligibleCalls },
      { stage: "Native transcripts", count: summary.transcriptCalls },
      { stage: "Enriched contacts", count: summary.enrichedContacts },
      { stage: "Priority contacts", count: summary.priorityContacts },
      { stage: "Recorded appointments", count: summary.appointments },
      { stage: "Observed contracts", count: summary.contractedContacts },
      { stage: "Observed closes", count: summary.closedContacts },
    ],
    actionQueue,
    objections: objectionRows.map(row => ({
      objection: asText(row.objection),
      contacts: asNumber(row.contacts),
      mentions: asNumber(row.mentions),
      priorityContacts: asNumber(row.priorityContacts),
    })),
    sources: sourceRows.map(row => ({
      leadSourceId: asNullableNumber(row.leadSourceId),
      leadSourceName: asText(row.leadSourceName) || "Unattributed",
      calls: asNumber(row.calls),
      transcriptCalls: asNumber(row.transcriptCalls),
      contacts: asNumber(row.contacts),
      priorityContacts: asNumber(row.priorityContacts),
      appointments: asNumber(row.appointments),
      closedContacts: asNumber(row.closedContacts),
      observedGci: asNumber(row.observedGci),
    })),
    markets: marketRows.map(row => ({
      market: asText(row.market),
      contacts: asNumber(row.contacts),
      priorityContacts: asNumber(row.priorityContacts),
      closedContacts: asNumber(row.closedContacts),
      observedGci: asNumber(row.observedGci),
    })),
    coaching: ownerRows.map(row => ({
      agentId: asNullableNumber(row.agentId),
      agentName: asText(row.agentName) || "Unassigned",
      contacts: asNumber(row.contacts),
      transcriptContacts: asNumber(row.transcriptContacts),
      priorityContacts: asNumber(row.priorityContacts),
      appointments: asNumber(row.appointments),
      closedContacts: asNumber(row.closedContacts),
    })),
    evidence: evidenceRows.map(row => ({
      contactId: asNumber(row.contactId),
      contactName: asText(row.contactName) || "Unnamed contact",
      aircallCallId: asNumber(row.aircallCallId),
      startedAt: day(row.startedAt),
      direction: asText(row.direction),
      duration: asNumber(row.duration),
      leadSourceName: asText(row.leadSourceName) || "Unattributed",
      agentName: asText(row.agentName) || "Unassigned",
      intentTier: asText(row.intentTier) || "unknown",
      intentScore: asNumber(row.intentScore),
      confidence: asText(row.confidence) || "low",
      nextBestAction: asText(row.nextBestAction),
      timeline: asText(row.timeline),
      targetMarkets: asText(row.targetMarkets),
    })),
    definitions: definitions(),
  };
}
