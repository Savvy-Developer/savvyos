import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  sql,
  aliasedTable,
} from "drizzle-orm";
import { Resend } from "resend";
import { router, protectedProcedure } from "../_core/trpc";
import {
  aircallApiRequest,
  isAircallApiConfigured,
  sendAircallGroupSMS,
  sendAircallSMS,
} from "../_core/aircall";
import { getDb, logActivity } from "../db";
import {
  agentConnections,
  agentIntroductionFollowUps,
  aircallIntegrationState,
  aircallIsaAssignments,
  aircallMessages,
  communications,
  contacts,
  marketingTextInboxThreads,
  smartPlanExecutions,
  smartPlanSteps,
  smartPlans,
  users,
} from "../../drizzle/schema";
import {
  persistAircallMessage,
  type AircallMessageData,
} from "../aircallMessaging";
import { normalizePhone } from "../aircall";
import { canAdminUsePermission } from "./permissions";
import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";

const positiveId = z.number().int().positive();
const SPEED_TO_LEAD_WINDOWS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "90d", label: "90D", days: 90 },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All Time" },
] as const;

type SpeedToLeadWindow = {
  key: string;
  label: string;
  averageMinutes: number | null;
  respondedCount: number;
  incomingCount: number;
};

interface AircallNumber {
  id: number;
  name?: string | null;
  digits?: string | null;
}

interface AircallNumbersResponse {
  numbers?: AircallNumber[];
  meta?: { next_page_link?: string | null };
}

function startForWindow(
  window: (typeof SPEED_TO_LEAD_WINDOWS)[number]
): Date | null {
  const now = new Date();
  if (window.key === "all") return null;
  if (window.key === "today") {
    now.setHours(0, 0, 0, 0);
    return now;
  }
  if (window.key === "ytd") return new Date(now.getFullYear(), 0, 1);
  const start = new Date(now);
  start.setDate(start.getDate() - (window.days ?? 0));
  return start;
}

async function requireMarketingTextInboxAccess(user: {
  id: number;
  role: string;
  email?: string | null;
}) {
  if (user.role === "isa") return;
  const permitted = await canAdminUsePermission(
    user,
    "canViewMarketingTextInbox"
  );
  if (!permitted) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to the Marketing Text Inbox",
    });
  }
}

function requireAircallApi() {
  if (!isAircallApiConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Add the Aircall API credentials before selecting a marketing text number.",
    });
  }
}

function toE164(value: string): string {
  const digits = normalizePhone(value);
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "This contact does not have a valid mobile number.",
  });
}

function plainText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function emailHtml(value: string): string {
  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family:Arial,sans-serif;color:#1f2937;font-size:16px;line-height:1.6"><p>${escaped.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")}</p></div>`;
}

function firstName(name: string | null | undefined, fallback: string) {
  return name?.trim().split(/\s+/)[0] || fallback;
}

async function marketingLine(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
) {
  const [state] = await db
    .select()
    .from(aircallIntegrationState)
    .where(eq(aircallIntegrationState.id, 1))
    .limit(1);
  return state ?? null;
}

async function listAircallNumbers(): Promise<AircallNumber[]> {
  requireAircallApi();
  const numbers: AircallNumber[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const response = await aircallApiRequest(
      `/v1/numbers?page=${page}&per_page=50`
    );
    if (!response.ok) {
      const detail = (await response.text()).trim();
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: detail
          ? `Aircall could not list phone numbers: ${detail.slice(0, 300)}`
          : "Aircall could not list phone numbers.",
      });
    }
    const data = (await response.json()) as AircallNumbersResponse;
    numbers.push(...(data.numbers ?? []));
    if (!data.meta?.next_page_link) break;
  }
  return numbers;
}

function nativeMessagePayload(
  responseMessage: Record<string, unknown> | undefined,
  fallback: {
    messageId: string;
    body: string;
    destination: string;
    numberId: number;
    numberName: string | null;
    numberDigits: string | null;
  }
): AircallMessageData {
  const nestedNumber = responseMessage?.number as
    | Partial<AircallMessageData["number"]>
    | undefined;
  return {
    ...(responseMessage ?? {}),
    id: String(responseMessage?.id ?? fallback.messageId),
    direction: "outbound",
    status:
      typeof responseMessage?.status === "string"
        ? responseMessage.status
        : "pending",
    body:
      typeof responseMessage?.body === "string"
        ? responseMessage.body
        : fallback.body,
    raw_digits:
      typeof responseMessage?.raw_digits === "string"
        ? responseMessage.raw_digits
        : fallback.destination,
    number: {
      id:
        typeof nestedNumber?.id === "number"
          ? nestedNumber.id
          : fallback.numberId,
      name:
        typeof nestedNumber?.name === "string"
          ? nestedNumber.name
          : fallback.numberName,
      digits:
        typeof nestedNumber?.digits === "string"
          ? nestedNumber.digits
          : fallback.numberDigits,
    },
  };
}

async function getMarketingTextSpeedToLead(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  marketingNumberId: number | null
): Promise<SpeedToLeadWindow[]> {
  if (!marketingNumberId) {
    return SPEED_TO_LEAD_WINDOWS.map(window => ({
      ...window,
      averageMinutes: null,
      respondedCount: 0,
      incomingCount: 0,
    }));
  }

  const inbound = aliasedTable(aircallMessages, "speed_to_lead_inbound_sms");
  const outbound = aliasedTable(aircallMessages, "speed_to_lead_outbound_sms");
  const outboundAlias = sql.raw("`speed_to_lead_outbound_sms`");
  const inboundAt = sql<Date>`COALESCE(${inbound.receivedAt}, ${inbound.sentAt}, ${inbound.createdAt})`;
  const responseAt = sql<Date | null>`(
    SELECT MIN(COALESCE(${outbound.sentAt}, ${outbound.createdAt}))
    FROM ${aircallMessages} AS ${outboundAlias}
    WHERE ${outbound.contactId} = ${inbound.contactId}
      AND ${outbound.aircallNumberId} = ${marketingNumberId}
      AND ${outbound.direction} = 'outbound'
      AND COALESCE(${outbound.sentAt}, ${outbound.createdAt}) > ${inboundAt}
  )`;
  // Every inbound message remains in the denominator. Its elapsed time ends at
  // the first reply, an explicit archive/finish timestamp, or now when it is
  // still awaiting attention. This preserves the time it spent unarchived
  // rather than retroactively dropping the entire conversation from the metric.
  const stoppedAt = sql<Date>`COALESCE(${inbound.speedToLeadStoppedAt}, NOW())`;
  const elapsedUntil = sql<Date>`CASE
    WHEN ${responseAt} IS NOT NULL AND ${responseAt} < ${stoppedAt} THEN ${responseAt}
    ELSE ${stoppedAt}
  END`;

  return Promise.all(
    SPEED_TO_LEAD_WINDOWS.map(async window => {
      const start = startForWindow(window);
      const [metrics] = await db
        .select({
          incomingCount: sql<number>`COUNT(*)`,
          respondedCount: sql<number>`SUM(CASE WHEN ${responseAt} IS NOT NULL AND ${responseAt} <= ${stoppedAt} THEN 1 ELSE 0 END)`,
          averageMinutes: sql<
            number | null
          >`AVG(TIMESTAMPDIFF(SECOND, ${inboundAt}, ${elapsedUntil}) / 60.0)`,
        })
        .from(inbound)
        .where(
          and(
            eq(inbound.aircallNumberId, marketingNumberId),
            eq(inbound.direction, "inbound"),
            isNotNull(inbound.contactId),
            ...(start ? [gte(inboundAt, start)] : [])
          )
        );
      return {
        key: window.key,
        label: window.label,
        averageMinutes:
          metrics?.averageMinutes == null
            ? null
            : Number(metrics.averageMinutes),
        respondedCount: Number(metrics?.respondedCount ?? 0),
        incomingCount: Number(metrics?.incomingCount ?? 0),
      };
    })
  );
}

type IntroductionMessage = {
  direction: "inbound" | "outbound";
  body: string | null;
  sentAt: Date | null;
  receivedAt: Date | null;
  createdAt: Date;
};

type IntroductionContext = {
  topic: string | null;
  clientResponse: string | null;
  sourceMessage: string | null;
};

function cleanIntroductionSentence(value: string, maxLength = 260): string {
  return plainText(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .replace(/[.\s]+$/, "");
}

/**
 * Produces a factual handoff brief even if the AI provider is unavailable. It
 * intentionally reads the outbound message immediately before a client's reply
 * and then scans back through the thread for the explicit inquiry or property
 * that prompted the requested connection.
 */
function deriveIntroductionContext(
  messages: IntroductionMessage[]
): IntroductionContext {
  const chronological = [...messages]
    .filter(message => Boolean(cleanIntroductionSentence(message.body ?? "")))
    .sort((left, right) => {
      const leftAt = left.sentAt ?? left.receivedAt ?? left.createdAt;
      const rightAt = right.sentAt ?? right.receivedAt ?? right.createdAt;
      return leftAt.getTime() - rightAt.getTime();
    });
  const latestInboundIndex = chronological
    .map(message => message.direction)
    .lastIndexOf("inbound");
  const inbound =
    latestInboundIndex >= 0 ? chronological[latestInboundIndex] : null;
  const precedingOutbound =
    latestInboundIndex >= 0
      ? chronological
          .slice(0, latestInboundIndex)
          .filter(message => message.direction === "outbound")
      : chronological.filter(message => message.direction === "outbound");
  const reversedOutbound = [...precedingOutbound].reverse();
  // Prefer the actual inquiry/property request over a later logistical nudge
  // such as "Should I connect you?". That distinction is what makes a handoff
  // useful to the receiving agent.
  const source =
    reversedOutbound.find(message =>
      /\b(?:inquiry|request|property|listing|showing|analysis|offer sheet)\b/i.test(
        message.body ?? ""
      )
    ) ??
    reversedOutbound.at(0) ??
    null;
  const sourceMessage = cleanIntroductionSentence(source?.body ?? "") || null;

  const topicMatch = sourceMessage?.match(
    /\b(?:got|received|saw)?\s*(?:your\s+)?(?:inquiry|request)\s+(?:about|for|regarding)\s+(.+?)(?:\s*[,;—-]\s*(?:should|would|can|do|is)\b|[?.!]|$)/i
  );
  const propertyMatch = sourceMessage?.match(
    /\b(?:about|for|regarding)\s+(.+?)(?:\s*[,;—-]\s*(?:should|would|can|do|is)\b|[?.!]|$)/i
  );
  const topicValue = cleanIntroductionSentence(
    topicMatch?.[1] ?? propertyMatch?.[1] ?? "",
    180
  );
  const topic = topicValue ? topicValue.replace(/^the\s+/i, "") : null;

  const inboundMessage = cleanIntroductionSentence(inbound?.body ?? "", 280);
  let clientResponse: string | null = null;
  if (inboundMessage) {
    if (
      /\b(?:text works|accept a text intro|text introduction)\b/i.test(
        inboundMessage
      )
    ) {
      const traveling = /\btravel(?:ing|ling)\b.*?\b(?:work|week)\b/i.test(
        inboundMessage
      );
      clientResponse = traveling
        ? "confirmed that a text introduction works while he is traveling for work this week"
        : "confirmed that a text introduction works";
    } else if (
      /\byes\b|\bsure\b|\bplease\b|\bsounds good\b/i.test(inboundMessage)
    ) {
      clientResponse = "confirmed that he would like the introduction";
    } else {
      clientResponse = `replied, “${inboundMessage}”`;
    }
  }
  return { topic, clientResponse, sourceMessage };
}

function fallbackIntroductionDraft(input: {
  contactFirstName: string;
  contactName: string;
  agentName: string;
  userName: string;
  context: IntroductionContext;
}) {
  const agentFirstName = firstName(input.agentName, "your Savvy agent");
  const reason = input.context.topic
    ? `about ${input.context.topic}`
    : input.context.sourceMessage
      ? `after we texted about “${input.context.sourceMessage}”`
      : "after connecting with Savvy STR Agents";
  const clientResponse = input.context.clientResponse
    ? ` ${input.contactFirstName} ${input.context.clientResponse}.`
    : "";
  return {
    groupText: `Hi ${input.contactFirstName} and ${agentFirstName} — ${input.contactFirstName} reached out ${reason}.${clientResponse} ${agentFirstName}, I wanted to introduce you so you can connect directly with ${input.contactFirstName} about this. I’ll let you take it from here! — ${input.userName}`,
    emailSubject: `Introduction: ${input.contactName} + ${input.agentName}`,
    emailBody: `Hi ${input.contactFirstName} and ${agentFirstName},\n\nI wanted to personally connect you both after ${input.contactFirstName} reached out ${reason}.${clientResponse}\n\n${agentFirstName}, ${input.contactFirstName} is copied here so you can connect directly. ${input.contactFirstName}, ${agentFirstName} can continue the conversation with you from here.\n\nBest,\n${input.userName}`,
    contextSummary: input.context.topic
      ? `${input.contactFirstName} reached out about ${input.context.topic}${input.context.clientResponse ? ` and ${input.context.clientResponse}` : ""}.`
      : input.context.clientResponse
        ? `${input.contactFirstName} ${input.context.clientResponse}.`
        : "Recent Savvy STR Agents handoff conversation.",
  };
}

function parsedIntroductionDraft(
  raw: string | null | undefined,
  fallback: ReturnType<typeof fallbackIntroductionDraft>
) {
  try {
    const parsed = JSON.parse(raw ?? "") as Record<string, unknown>;
    const get = (key: string, max: number) =>
      typeof parsed[key] === "string" && parsed[key].trim().length > 0
        ? parsed[key].trim().slice(0, max)
        : fallback[key as keyof typeof fallback];
    const draft = {
      groupText: get("groupText", 1600) as string,
      emailSubject: get("emailSubject", 255) as string,
      emailBody: get("emailBody", 20_000) as string,
      contextSummary: get("contextSummary", 700) as string,
    };
    // Do not silently accept a superficially valid but context-free model draft
    // when the thread supplied enough evidence for the deterministic brief.
    const fallbackHasSpecificContext =
      !/Recent Savvy STR Agents handoff conversation\.?$/i.test(
        fallback.contextSummary
      );
    const genericReply =
      /\b(?:recently\s+)?replied to (?:a |our )?(?:Savvy STR Agents )?(?:text|message)\b/i.test(
        draft.groupText
      );
    if (fallbackHasSpecificContext && genericReply) return fallback;
    return draft;
  } catch {
    return fallback;
  }
}

export const marketingTextInboxRouter = router({
  /** Configuration status for the dedicated Smart Plan marketing line. */
  configuration: protectedProcedure.query(async ({ ctx }) => {
    await requireMarketingTextInboxAccess(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const line = await marketingLine(db);
    return {
      apiConfigured: isAircallApiConfigured(),
      marketingNumber: line?.marketingNumberId
        ? {
            id: line.marketingNumberId,
            name: line.marketingNumberName,
            digits: line.marketingNumberDigits,
            configuredAt: line.marketingNumberConfiguredAt,
          }
        : null,
      sendReady: isAircallApiConfigured() && !!line?.marketingNumberId,
    };
  }),

  /** The sidebar badge count for unread replies on the dedicated marketing line. */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    await requireMarketingTextInboxAccess(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const line = await marketingLine(db);
    if (!line?.marketingNumberId) return { count: 0 };
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(aircallMessages)
      .leftJoin(
        marketingTextInboxThreads,
        eq(marketingTextInboxThreads.contactId, aircallMessages.contactId)
      )
      .where(
        and(
          eq(aircallMessages.aircallNumberId, line.marketingNumberId),
          eq(aircallMessages.direction, "inbound"),
          isNull(aircallMessages.readAt),
          isNull(marketingTextInboxThreads.archivedAt)
        )
      );
    return { count: Number(result?.count ?? 0) };
  }),

  /** Mean elapsed time from each inbound marketing SMS to the first SavvyOS reply. */
  speedToLead: protectedProcedure.query(async ({ ctx }) => {
    await requireMarketingTextInboxAccess(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const line = await marketingLine(db);
    return {
      windows: await getMarketingTextSpeedToLead(
        db,
        line?.marketingNumberId ?? null
      ),
    };
  }),

  /** Lists Aircall numbers that are not reserved for an ISA's personal line. */
  listAvailableNumbers: protectedProcedure.query(async ({ ctx }) => {
    await requireMarketingTextInboxAccess(ctx.user);
    if (ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only administrators can change the marketing text line.",
      });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [numbers, assigned] = await Promise.all([
      listAircallNumbers(),
      db
        .select({ aircallNumberId: aircallIsaAssignments.aircallNumberId })
        .from(aircallIsaAssignments),
    ]);
    const reservedIds = new Set(assigned.map(row => row.aircallNumberId));
    return numbers
      .filter(number => !reservedIds.has(number.id))
      .map(number => ({
        id: number.id,
        name: number.name ?? null,
        digits: number.digits ?? null,
      }));
  }),

  /** Saves the shared line that Smart Plans and the marketing inbox use. */
  selectMarketingNumber: protectedProcedure
    .input(z.object({ numberId: positiveId }))
    .mutation(async ({ ctx, input }) => {
      await requireMarketingTextInboxAccess(ctx.user);
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only administrators can change the marketing text line.",
        });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [assigned] = await db
        .select({ id: aircallIsaAssignments.id })
        .from(aircallIsaAssignments)
        .where(eq(aircallIsaAssignments.aircallNumberId, input.numberId))
        .limit(1);
      if (assigned) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Choose a dedicated number that is not assigned to an ISA.",
        });
      }

      const number = (await listAircallNumbers()).find(
        item => item.id === input.numberId
      );
      if (!number)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That Aircall number is no longer available.",
        });

      const now = new Date();
      await db
        .insert(aircallIntegrationState)
        .values({
          id: 1,
          marketingNumberId: number.id,
          marketingNumberName: number.name ?? null,
          marketingNumberDigits: number.digits ?? null,
          marketingNumberConfiguredAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            marketingNumberId: number.id,
            marketingNumberName: number.name ?? null,
            marketingNumberDigits: number.digits ?? null,
            marketingNumberConfiguredAt: now,
          },
        });
      await logActivity({
        userId: ctx.user.id,
        action: "marketing_text_number_selected",
        entityType: "aircall_number",
        entityId: number.id,
        details: { name: number.name ?? null, digits: number.digits ?? null },
      });
      return {
        id: number.id,
        name: number.name ?? null,
        digits: number.digits ?? null,
      };
    }),

  /** Lists only CRM contacts who have replied to the dedicated marketing line. */
  listThreads: protectedProcedure
    .input(
      z
        .object({
          search: z.string().trim().max(160).optional(),
          archived: z.boolean().optional().default(false),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      await requireMarketingTextInboxAccess(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const line = await marketingLine(db);
      if (!line?.marketingNumberId) return [];

      const rows = await db
        .select({
          id: aircallMessages.id,
          aircallMessageId: aircallMessages.aircallMessageId,
          contactId: aircallMessages.contactId,
          direction: aircallMessages.direction,
          status: aircallMessages.status,
          body: aircallMessages.body,
          fromNumber: aircallMessages.fromNumber,
          toNumber: aircallMessages.toNumber,
          sentAt: aircallMessages.sentAt,
          receivedAt: aircallMessages.receivedAt,
          createdAt: aircallMessages.createdAt,
          contactFirstName: contacts.firstName,
          contactLastName: contacts.lastName,
          contactPhone: contacts.phone,
          doNotContact: contacts.doNotContact,
          smsMarketingOptedOutAt: contacts.smsMarketingOptedOutAt,
          readAt: aircallMessages.readAt,
          archivedAt: marketingTextInboxThreads.archivedAt,
          resolvedAt: marketingTextInboxThreads.resolvedAt,
        })
        .from(aircallMessages)
        .leftJoin(contacts, eq(contacts.id, aircallMessages.contactId))
        .leftJoin(
          marketingTextInboxThreads,
          eq(marketingTextInboxThreads.contactId, aircallMessages.contactId)
        )
        .where(eq(aircallMessages.aircallNumberId, line.marketingNumberId))
        .orderBy(desc(aircallMessages.sentAt), desc(aircallMessages.createdAt))
        .limit(750);

      const query = input?.search?.toLowerCase();
      const threads = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        if (row.direction !== "inbound" || !row.contactId || !row.body?.trim())
          continue;
        if (input?.archived ? !row.archivedAt : !!row.archivedAt) continue;
        const inboundAt = row.receivedAt ?? row.sentAt ?? row.createdAt;
        if (!input?.archived && row.resolvedAt && inboundAt <= row.resolvedAt)
          continue;
        const key = `contact:${row.contactId}`;
        const label =
          `${row.contactFirstName ?? ""} ${row.contactLastName ?? ""} ${row.contactPhone ?? ""} ${row.fromNumber ?? ""} ${row.toNumber ?? ""} ${row.body ?? ""}`.toLowerCase();
        if (query && !label.includes(query)) continue;
        if (!threads.has(key)) threads.set(key, row);
      }
      return Array.from(threads.values()).map(thread => {
        const inboundAt =
          thread.receivedAt ?? thread.sentAt ?? thread.createdAt;
        const hasReply = rows.some(
          row =>
            row.contactId === thread.contactId &&
            row.direction === "outbound" &&
            new Date(row.sentAt ?? row.receivedAt ?? row.createdAt) >
              new Date(inboundAt)
        );
        const isUnread = !thread.readAt;
        return {
          ...thread,
          isUnread,
          awaitingReply: !isUnread && !hasReply,
          awaitingReplySince: !isUnread && !hasReply ? inboundAt : null,
          isResolved: Boolean(
            thread.resolvedAt && inboundAt <= thread.resolvedAt
          ),
        };
      });
    }),

  /** Returns the complete thread with Smart Plan attribution for automation-originated texts. */
  getThread: protectedProcedure
    .input(z.object({ contactId: positiveId }))
    .query(async ({ ctx, input }) => {
      await requireMarketingTextInboxAccess(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const line = await marketingLine(db);
      if (!line?.marketingNumberId) return [];
      const sender = aliasedTable(users, "marketing_text_message_sender");
      const rows = await db
        .select({ message: aircallMessages, sentByName: sender.name })
        .from(aircallMessages)
        .leftJoin(sender, eq(sender.id, aircallMessages.savvyUserId))
        .where(
          and(
            eq(aircallMessages.contactId, input.contactId),
            eq(aircallMessages.aircallNumberId, line.marketingNumberId)
          )
        )
        .orderBy(
          asc(
            sql`COALESCE(${aircallMessages.sentAt}, ${aircallMessages.receivedAt}, ${aircallMessages.createdAt})`
          ),
          asc(aircallMessages.id)
        )
        .limit(300);
      // `smartPlanExecutions.enrollmentId` is not a plan ID. Resolve the plan with a
      // small secondary lookup only for executions that have a provider ID match.
      const executionIds = rows
        .map(row => row.message.aircallMessageId)
        .filter((id): id is string => Boolean(id));
      const planByProviderId = new Map<
        string,
        { name: string; stepOrder: number }
      >();
      if (executionIds.length > 0) {
        const executionRows = await db
          .select({
            providerMessageId: smartPlanExecutions.providerMessageId,
            planName: smartPlans.name,
            stepOrder: smartPlanSteps.stepOrder,
          })
          .from(smartPlanExecutions)
          .innerJoin(
            smartPlanSteps,
            eq(smartPlanSteps.id, smartPlanExecutions.stepId)
          )
          .innerJoin(smartPlans, eq(smartPlans.id, smartPlanSteps.planId))
          .where(
            and(
              eq(smartPlanExecutions.channel, "sms"),
              inArray(smartPlanExecutions.providerMessageId, executionIds)
            )
          );
        for (const execution of executionRows) {
          if (
            execution.providerMessageId &&
            execution.planName &&
            execution.stepOrder !== null
          ) {
            planByProviderId.set(execution.providerMessageId, {
              name: execution.planName,
              stepOrder: execution.stepOrder,
            });
          }
        }
      }
      const providerMessageIds = rows
        .map(row => row.message.aircallMessageId)
        .filter((id): id is string => Boolean(id));
      const followUpByMessageId = new Map<
        string,
        { id: number; dueAt: Date; sentAt: Date | null }
      >();
      if (providerMessageIds.length) {
        const sentFollowUps = await db
          .select({
            id: agentIntroductionFollowUps.id,
            aircallMessageId: agentIntroductionFollowUps.aircallMessageId,
            dueAt: agentIntroductionFollowUps.dueAt,
            sentAt: agentIntroductionFollowUps.sentAt,
          })
          .from(agentIntroductionFollowUps)
          .where(
            inArray(
              agentIntroductionFollowUps.aircallMessageId,
              providerMessageIds
            )
          );
        for (const followUp of sentFollowUps) {
          if (followUp.aircallMessageId)
            followUpByMessageId.set(followUp.aircallMessageId, followUp);
        }
      }

      const participantPhones = Array.from(
        new Set(
          rows
            .flatMap(row => row.message.groupParticipants ?? [])
            .map(number => normalizePhone(number))
            .filter(Boolean)
        )
      );
      const participantsByConversation = new Map<string, string[]>();
      for (const row of rows) {
        if (
          row.message.groupConversationId &&
          row.message.groupParticipants?.length
        ) {
          participantsByConversation.set(
            row.message.groupConversationId,
            row.message.groupParticipants
          );
        }
      }
      const groupUsers = participantPhones.length
        ? await db
            .select({ name: users.name, phone: users.phone })
            .from(users)
            .where(isNotNull(users.phone))
        : [];
      const userNameByPhone = new Map(
        groupUsers
          .map(user => [normalizePhone(user.phone), user.name] as const)
          .filter(([phone, name]) => Boolean(phone && name))
      );

      return rows.map(row => {
        const attribution = planByProviderId.get(row.message.aircallMessageId);
        const groupParticipants =
          row.message.groupParticipants ??
          (row.message.groupConversationId
            ? (participantsByConversation.get(
                row.message.groupConversationId
              ) ?? [])
            : []);
        const groupAgentName =
          groupParticipants
            .map(number => userNameByPhone.get(normalizePhone(number)))
            .find((name): name is string => Boolean(name)) ?? null;
        const followUp = row.message.aircallMessageId
          ? followUpByMessageId.get(row.message.aircallMessageId)
          : null;
        return {
          ...row.message,
          sentByName: row.sentByName ?? null,
          isGroupMessage: Boolean(row.message.groupConversationId),
          groupAgentName,
          autoFollowUpId: followUp?.id ?? null,
          autoFollowUpDueAt: followUp?.dueAt ?? null,
          smartPlanName: attribution?.name ?? null,
          smartPlanStepOrder: attribution ? attribution.stepOrder + 1 : null,
        };
      });
    }),

  /** Returns active agents who can be selected for a personal client introduction. */
  listEligibleAgents: protectedProcedure.query(async ({ ctx }) => {
    await requireMarketingTextInboxAccess(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(and(eq(users.role, "agent"), eq(users.isActive, true)))
      .orderBy(users.name);
  }),

  /** Generates an editable, grounded group-text and group-email introduction draft. */
  draftIntroduction: protectedProcedure
    .input(z.object({ contactId: positiveId, agentId: positiveId }))
    .mutation(async ({ ctx, input }) => {
      await requireMarketingTextInboxAccess(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [contactRows, agentRows, textHistory, communicationHistory] =
        await Promise.all([
          db
            .select()
            .from(contacts)
            .where(eq(contacts.id, input.contactId))
            .limit(1),
          db
            .select({
              id: users.id,
              name: users.name,
              email: users.email,
              phone: users.phone,
            })
            .from(users)
            .where(
              and(
                eq(users.id, input.agentId),
                eq(users.role, "agent"),
                eq(users.isActive, true)
              )
            )
            .limit(1),
          db
            .select({
              direction: aircallMessages.direction,
              body: aircallMessages.body,
              sentAt: aircallMessages.sentAt,
              receivedAt: aircallMessages.receivedAt,
              createdAt: aircallMessages.createdAt,
            })
            .from(aircallMessages)
            .where(eq(aircallMessages.contactId, input.contactId))
            .orderBy(
              desc(
                sql`COALESCE(${aircallMessages.sentAt}, ${aircallMessages.receivedAt}, ${aircallMessages.createdAt})`
              )
            )
            .limit(12),
          db
            .select({
              type: communications.type,
              direction: communications.direction,
              subject: communications.subject,
              body: communications.body,
              communicatedAt: communications.communicatedAt,
            })
            .from(communications)
            .where(eq(communications.relatedContactId, input.contactId))
            .orderBy(desc(communications.communicatedAt))
            .limit(12),
        ]);
      const contact = contactRows[0];
      const agent = agentRows[0];
      if (!contact)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found.",
        });
      if (!agent)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Active agent not found.",
        });

      const contactName = `${contact.firstName} ${contact.lastName}`.trim();
      const context = deriveIntroductionContext(textHistory);
      const recentItems = [
        ...textHistory.map(message => ({
          at: message.sentAt ?? message.receivedAt ?? message.createdAt,
          item: `${message.direction === "inbound" ? "Client" : "Savvy"} text: ${plainText(message.body).slice(0, 360)}`,
        })),
        ...communicationHistory.map(message => ({
          at: message.communicatedAt,
          item: `${message.direction} ${message.type}${message.subject ? ` (${message.subject})` : ""}: ${plainText(message.body).slice(0, 360)}`,
        })),
      ]
        .filter(({ item }) => !/:\s*$/.test(item))
        .sort(
          (left, right) =>
            new Date(left.at).getTime() - new Date(right.at).getTime()
        )
        .slice(-18)
        .map(({ item }) => item);
      const fallback = fallbackIntroductionDraft({
        contactFirstName: contact.firstName || "there",
        contactName,
        agentName: agent.name ?? "your Savvy agent",
        userName: ctx.user.name ?? "The Savvy team",
        context,
      });

      try {
        const result = await invokeLLM({
          model: "gpt-5",
          maxTokens: 1200,
          reasoning: { effort: "low" },
          outputSchema: {
            name: "grounded_client_introduction",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                groupText: { type: "string" },
                emailSubject: { type: "string" },
                emailBody: { type: "string" },
                contextSummary: { type: "string" },
              },
              required: [
                "groupText",
                "emailSubject",
                "emailBody",
                "contextSummary",
              ],
            },
          },
          messages: [
            {
              role: "system",
              content:
                "Write a warm, concise real-estate introduction. The supplied handoffFacts are the required factual foundation: preserve the property, inquiry, question, stated preference, and/or client response when present. Return the required schema. groupText is ONE shared group SMS received by both the client and agent, so greet both people by first name and write a natural handoff. State both (1) why the client reached out, including the actual subject from the earlier Savvy message, and (2) the client's response or agreed next step when present. A short reply must never be used without its preceding Savvy context. Never use vague phrases such as 'recently replied to a text/message,' 'based on our recent conversation,' 'our recent conversation about,' 'resource to help,' or a bare response such as 'Yes please.' Never invent facts, promises, appointments, or financial details. Mention the named SavvyOS user as the personal introducer. Group texts must be under 700 characters. The email addresses both people, uses the same grounded context, and is plain text with paragraphs. contextSummary is a factual one-sentence explanation of why this introduction is being made.",
            },
            {
              role: "user",
              content: JSON.stringify({
                client: {
                  firstName: contact.firstName,
                  fullName: contactName,
                  notes: plainText(contact.notes).slice(0, 1200),
                },
                agent: { name: agent.name },
                introducedBy: ctx.user.name ?? "The Savvy team",
                handoffFacts: context,
                recentConversation: recentItems,
              }),
            },
          ],
        });
        return parsedIntroductionDraft(
          typeof result.choices[0]?.message.content === "string"
            ? result.choices[0].message.content
            : null,
          fallback
        );
      } catch (error) {
        console.warn(
          "[MarketingTextInbox] AI introduction draft fallback:",
          error
        );
        return fallback;
      }
    }),

  /** Creates or reuses the agent pipeline connection and sends the approved group introduction. */
  sendIntroduction: protectedProcedure
    .input(
      z
        .object({
          contactId: positiveId,
          agentId: positiveId,
          groupText: z.string().trim().min(1).max(1600),
          emailSubject: z.string().trim().min(1).max(255),
          emailBody: z.string().trim().min(1).max(20_000),
          appointmentSet: z.boolean().default(false),
          autoFollowUp: z.boolean().default(false),
          followUpDelayHours: z.coerce.number().min(0.25).max(720).optional(),
          followUpBody: z.string().trim().max(1600).optional(),
        })
        .superRefine((value, issue) => {
          if (value.autoFollowUp && !value.followUpDelayHours) {
            issue.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Enter when the follow-up text should send.",
              path: ["followUpDelayHours"],
            });
          }
          if (value.autoFollowUp && !value.followUpBody?.trim()) {
            issue.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Enter the scheduled follow-up text.",
              path: ["followUpBody"],
            });
          }
        })
    )
    .mutation(async ({ ctx, input }) => {
      await requireMarketingTextInboxAccess(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const line = await marketingLine(db);
      const resend = ENV.resendApiKey ? new Resend(ENV.resendApiKey) : null;
      const [contactRows, agentRows] = await Promise.all([
        db
          .select()
          .from(contacts)
          .where(eq(contacts.id, input.contactId))
          .limit(1),
        db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            phone: users.phone,
          })
          .from(users)
          .where(
            and(
              eq(users.id, input.agentId),
              eq(users.role, "agent"),
              eq(users.isActive, true)
            )
          )
          .limit(1),
      ]);
      const contact = contactRows[0];
      const agent = agentRows[0];
      if (!contact)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found.",
        });
      if (!agent)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Active agent not found.",
        });
      if (!line?.marketingNumberId)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Select a dedicated Aircall marketing number before sending an introduction.",
        });
      if (!resend)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Resend must be configured before sending an introduction email.",
        });
      if (contact.doNotContact || contact.smsMarketingOptedOutAt)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "This contact is opted out of SMS outreach and cannot receive an introduction text.",
        });
      if (!contact.phone || !agent.phone)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Both the client and selected agent need a valid mobile number for the group introduction text.",
        });
      if (!contact.email || !agent.email)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Both the client and selected agent need an email address for the group introduction email.",
        });

      const clientDestination = toE164(contact.phone);
      const agentDestination = toE164(agent.phone);
      const now = new Date();
      const [existingConnection] = await db
        .select({ id: agentConnections.id })
        .from(agentConnections)
        .where(
          and(
            eq(agentConnections.agentId, agent.id),
            eq(agentConnections.contactId, contact.id)
          )
        )
        .limit(1);
      let connectionId = existingConnection?.id;
      let connectionCreated = false;
      if (!connectionId) {
        const result = await db.insert(agentConnections).values({
          agentId: agent.id,
          contactId: contact.id,
          pipelineStatus: "new_lead",
          appointmentSet: input.appointmentSet,
          appointmentSetAt: input.appointmentSet ? now : null,
          appointmentSetByUserId: input.appointmentSet ? ctx.user.id : null,
        });
        connectionId = Number((result as any)[0]?.insertId);
        connectionCreated = true;
      } else if (input.appointmentSet) {
        await db
          .update(agentConnections)
          .set({
            appointmentSet: true,
            appointmentSetAt: now,
            appointmentSetByUserId: ctx.user.id,
          })
          .where(eq(agentConnections.id, connectionId));
      }
      if (!connectionId)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to create the agent connection.",
        });

      const [groupTextResult, emailResult] = await Promise.all([
        sendAircallGroupSMS(
          [clientDestination, agentDestination],
          input.groupText,
          line.marketingNumberId
        ),
        resend.emails.send({
          from: "Savvy STR Agents <notifications@savvy-agents.com>",
          to: [contact.email],
          cc: [agent.email],
          replyTo: ctx.user.email ?? undefined,
          subject: input.emailSubject,
          html: emailHtml(input.emailBody),
        }),
      ]);
      if (!groupTextResult.success || !groupTextResult.groupMessageId) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message:
            groupTextResult.error ??
            "Aircall could not send the group introduction text.",
        });
      }
      if (emailResult.error) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message:
            emailResult.error.message ??
            "Resend could not send the group introduction email.",
        });
      }

      const groupPayload = nativeMessagePayload(groupTextResult.message, {
        messageId: groupTextResult.groupMessageId,
        body: input.groupText,
        destination: clientDestination,
        numberId: line.marketingNumberId,
        numberName: line.marketingNumberName,
        numberDigits: line.marketingNumberDigits,
      });
      // The group-send response sometimes contains only the group message ID.
      // Store the known participants ourselves so the inbox can immediately show
      // "Connected with [agent] in a group" and later inbound events can resolve
      // to this client even before Aircall repeats the participant list.
      groupPayload.group_conversation_id =
        groupTextResult.groupConversationId ??
        groupPayload.group_conversation_id ??
        undefined;
      groupPayload.participants = [
        line.marketingNumberDigits ?? "",
        clientDestination,
        agentDestination,
      ].filter(Boolean);
      const textPersistence = await persistAircallMessage(groupPayload, {
        contactId: contact.id,
        savvyUserId: ctx.user.id,
      });
      if (textPersistence.communicationId) {
        await db
          .update(communications)
          .set({ relatedAgentConnectionId: connectionId })
          .where(eq(communications.id, textPersistence.communicationId));
      }
      const emailCommunication = await db.insert(communications).values({
        type: "email",
        subject: input.emailSubject,
        body: input.emailBody,
        direction: "outbound",
        authorId: ctx.user.id,
        relatedContactId: contact.id,
        relatedAgentConnectionId: connectionId,
        communicatedAt: now,
      });
      const emailCommunicationId =
        Number((emailCommunication as any)[0]?.insertId ?? 0) || null;

      let followUpId: number | null = null;
      let followUpDueAt: Date | null = null;
      if (
        input.autoFollowUp &&
        input.followUpDelayHours &&
        input.followUpBody?.trim()
      ) {
        followUpDueAt = new Date(
          now.getTime() + input.followUpDelayHours * 60 * 60 * 1000
        );
        const followUp = await db.insert(agentIntroductionFollowUps).values({
          contactId: contact.id,
          agentId: agent.id,
          connectionId,
          createdById: ctx.user.id,
          body: input.followUpBody.trim(),
          dueAt: followUpDueAt,
          status: "queued",
        });
        followUpId = Number((followUp as any)[0]?.insertId ?? 0) || null;
      }

      const details = {
        contactName: `${contact.firstName} ${contact.lastName}`.trim(),
        agentName: agent.name ?? "Agent",
        sentByName: ctx.user.name ?? "Savvy team member",
        appointmentSet: input.appointmentSet,
        connectionCreated,
        groupTextMessageId: groupTextResult.groupMessageId,
        groupConversationId: groupTextResult.groupConversationId ?? null,
        emailMessageId: emailResult.data?.id ?? null,
        emailCommunicationId,
        autoFollowUp: Boolean(followUpId),
        followUpId,
        followUpDueAt: followUpDueAt?.toISOString() ?? null,
      };
      await Promise.all([
        logActivity({
          userId: ctx.user.id,
          action: "agent_introduction_sent",
          entityType: "contact",
          entityId: contact.id,
          relatedContactId: contact.id,
          details,
        }),
        logActivity({
          userId: ctx.user.id,
          action: "agent_introduction_sent",
          entityType: "agent_connection",
          entityId: connectionId,
          relatedContactId: contact.id,
          details,
        }),
      ]);
      return {
        success: true,
        connectionId,
        connectionCreated,
        followUpId,
        followUpDueAt,
      };
    }),

  /** Lists post-introduction follow-ups pinned to the contact's text conversation. */
  listIntroductionFollowUps: protectedProcedure
    .input(z.object({ contactId: positiveId }))
    .query(async ({ ctx, input }) => {
      await requireMarketingTextInboxAccess(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const creator = aliasedTable(users, "introduction_follow_up_creator");
      const agent = aliasedTable(users, "introduction_follow_up_agent");
      return db
        .select({
          id: agentIntroductionFollowUps.id,
          body: agentIntroductionFollowUps.body,
          dueAt: agentIntroductionFollowUps.dueAt,
          status: agentIntroductionFollowUps.status,
          sentAt: agentIntroductionFollowUps.sentAt,
          aircallMessageId: agentIntroductionFollowUps.aircallMessageId,
          errorMessage: agentIntroductionFollowUps.errorMessage,
          agentName: agent.name,
          createdByName: creator.name,
        })
        .from(agentIntroductionFollowUps)
        .leftJoin(agent, eq(agent.id, agentIntroductionFollowUps.agentId))
        .leftJoin(
          creator,
          eq(creator.id, agentIntroductionFollowUps.createdById)
        )
        .where(eq(agentIntroductionFollowUps.contactId, input.contactId))
        .orderBy(desc(agentIntroductionFollowUps.createdAt));
    }),

  /** Updates a queued introduction follow-up before the durable worker claims it. */
  updateIntroductionFollowUp: protectedProcedure
    .input(
      z.object({
        id: positiveId,
        body: z.string().trim().min(1).max(1600),
        dueAt: z.coerce
          .date()
          .refine(
            date => date.getTime() > Date.now(),
            "Choose a future send time."
          ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireMarketingTextInboxAccess(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [followUp] = await db
        .select()
        .from(agentIntroductionFollowUps)
        .where(eq(agentIntroductionFollowUps.id, input.id))
        .limit(1);
      if (!followUp)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Scheduled follow-up not found.",
        });
      if (followUp.status !== "queued") {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Only follow-ups that have not started sending can be changed.",
        });
      }
      await db
        .update(agentIntroductionFollowUps)
        .set({ body: input.body, dueAt: input.dueAt })
        .where(
          and(
            eq(agentIntroductionFollowUps.id, input.id),
            eq(agentIntroductionFollowUps.status, "queued")
          )
        );
      await logActivity({
        userId: ctx.user.id,
        action: "agent_introduction_follow_up_updated",
        entityType: "agent_connection",
        entityId: followUp.connectionId,
        relatedContactId: followUp.contactId,
        details: {
          followUpId: followUp.id,
          dueAt: input.dueAt.toISOString(),
          body: input.body,
        },
      });
      return { success: true, contactId: followUp.contactId };
    }),

  /** Deletes a queued follow-up before it is delivered. Sent history is never deleted. */
  deleteIntroductionFollowUp: protectedProcedure
    .input(z.object({ id: positiveId }))
    .mutation(async ({ ctx, input }) => {
      await requireMarketingTextInboxAccess(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [followUp] = await db
        .select()
        .from(agentIntroductionFollowUps)
        .where(eq(agentIntroductionFollowUps.id, input.id))
        .limit(1);
      if (!followUp)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Scheduled follow-up not found.",
        });
      if (followUp.status !== "queued") {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Only follow-ups that have not started sending can be deleted.",
        });
      }
      const deleted = await db
        .delete(agentIntroductionFollowUps)
        .where(
          and(
            eq(agentIntroductionFollowUps.id, input.id),
            eq(agentIntroductionFollowUps.status, "queued")
          )
        );
      if (Number((deleted as any)[0]?.affectedRows ?? 0) === 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This follow-up began sending and was not deleted.",
        });
      }
      await logActivity({
        userId: ctx.user.id,
        action: "agent_introduction_follow_up_deleted",
        entityType: "agent_connection",
        entityId: followUp.connectionId,
        relatedContactId: followUp.contactId,
        details: {
          followUpId: followUp.id,
          dueAt: followUp.dueAt.toISOString(),
          body: followUp.body,
        },
      });
      return { success: true, contactId: followUp.contactId };
    }),

  /** Marks every visible inbound reply in one conversation as read. */
  markThreadRead: protectedProcedure
    .input(z.object({ contactId: positiveId }))
    .mutation(async ({ ctx, input }) => {
      await requireMarketingTextInboxAccess(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const line = await marketingLine(db);
      if (!line?.marketingNumberId) return { success: true, count: 0 };
      const result = await db
        .update(aircallMessages)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(aircallMessages.aircallNumberId, line.marketingNumberId),
            eq(aircallMessages.contactId, input.contactId),
            eq(aircallMessages.direction, "inbound"),
            isNull(aircallMessages.readAt)
          )
        );
      return {
        success: true,
        count: Number((result as any)[0]?.affectedRows ?? 0),
      };
    }),

  /** Restores the unread indicator for every inbound reply in a conversation. */
  markThreadUnread: protectedProcedure
    .input(z.object({ contactId: positiveId }))
    .mutation(async ({ ctx, input }) => {
      await requireMarketingTextInboxAccess(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const line = await marketingLine(db);
      if (!line?.marketingNumberId) return { success: true, count: 0 };
      const result = await db
        .update(aircallMessages)
        .set({ readAt: null })
        .where(
          and(
            eq(aircallMessages.aircallNumberId, line.marketingNumberId),
            eq(aircallMessages.contactId, input.contactId),
            eq(aircallMessages.direction, "inbound")
          )
        );
      return {
        success: true,
        count: Number((result as any)[0]?.affectedRows ?? 0),
      };
    }),

  /** Archives or restores a conversation without deleting its CRM history. */
  archiveThread: protectedProcedure
    .input(z.object({ contactId: positiveId, archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await requireMarketingTextInboxAccess(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const line = await marketingLine(db);
      if (!line?.marketingNumberId)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Select a dedicated Aircall marketing number first.",
        });

      const [reply] = await db
        .select({ id: aircallMessages.id })
        .from(aircallMessages)
        .where(
          and(
            eq(aircallMessages.aircallNumberId, line.marketingNumberId),
            eq(aircallMessages.contactId, input.contactId),
            eq(aircallMessages.direction, "inbound")
          )
        )
        .limit(1);
      if (!reply)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Marketing text conversation not found.",
        });

      const now = new Date();
      if (input.archived) {
        await db
          .update(aircallMessages)
          .set({ speedToLeadStoppedAt: now })
          .where(
            and(
              eq(aircallMessages.aircallNumberId, line.marketingNumberId),
              eq(aircallMessages.contactId, input.contactId),
              eq(aircallMessages.direction, "inbound"),
              isNull(aircallMessages.speedToLeadStoppedAt)
            )
          );
      }
      await db
        .insert(marketingTextInboxThreads)
        .values({
          contactId: input.contactId,
          archivedAt: input.archived ? now : null,
          archivedById: input.archived ? ctx.user.id : null,
          resolvedAt: input.archived ? now : null,
          resolvedById: input.archived ? ctx.user.id : null,
          speedToLeadExcludedAt: input.archived ? now : null,
        })
        .onDuplicateKeyUpdate({
          set: {
            archivedAt: input.archived ? now : null,
            archivedById: input.archived ? ctx.user.id : null,
            resolvedAt: input.archived ? now : null,
            resolvedById: input.archived ? ctx.user.id : null,
            speedToLeadExcludedAt: input.archived ? now : null,
          },
        });
      await logActivity({
        userId: ctx.user.id,
        action: input.archived
          ? "marketing_text_thread_archived"
          : "marketing_text_thread_restored",
        entityType: "contact",
        entityId: input.contactId,
        relatedContactId: input.contactId,
        details: { aircallNumberId: line.marketingNumberId },
      });
      return { success: true };
    }),

  /** Finishes a text thread and freezes any open reply time without removing history from Speed to Lead. */
  finishThread: protectedProcedure
    .input(
      z.object({
        contactId: positiveId,
        archive: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireMarketingTextInboxAccess(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const line = await marketingLine(db);
      if (!line?.marketingNumberId)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Select a dedicated Aircall marketing number first.",
        });
      const [reply] = await db
        .select({ id: aircallMessages.id })
        .from(aircallMessages)
        .where(
          and(
            eq(aircallMessages.aircallNumberId, line.marketingNumberId),
            eq(aircallMessages.contactId, input.contactId),
            eq(aircallMessages.direction, "inbound")
          )
        )
        .limit(1);
      if (!reply)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Marketing text conversation not found.",
        });
      const now = new Date();
      await db
        .update(aircallMessages)
        .set({ speedToLeadStoppedAt: now })
        .where(
          and(
            eq(aircallMessages.aircallNumberId, line.marketingNumberId),
            eq(aircallMessages.contactId, input.contactId),
            eq(aircallMessages.direction, "inbound"),
            isNull(aircallMessages.speedToLeadStoppedAt)
          )
        );
      await db
        .insert(marketingTextInboxThreads)
        .values({
          contactId: input.contactId,
          resolvedAt: now,
          resolvedById: ctx.user.id,
          speedToLeadExcludedAt: now,
          ...(input.archive
            ? { archivedAt: now, archivedById: ctx.user.id }
            : {}),
        })
        .onDuplicateKeyUpdate({
          set: {
            resolvedAt: now,
            resolvedById: ctx.user.id,
            speedToLeadExcludedAt: now,
            ...(input.archive
              ? { archivedAt: now, archivedById: ctx.user.id }
              : {}),
          },
        });
      await db
        .update(aircallMessages)
        .set({ readAt: now })
        .where(
          and(
            eq(aircallMessages.aircallNumberId, line.marketingNumberId),
            eq(aircallMessages.contactId, input.contactId),
            eq(aircallMessages.direction, "inbound"),
            isNull(aircallMessages.readAt)
          )
        );
      await logActivity({
        userId: ctx.user.id,
        action: "marketing_text_thread_finished",
        entityType: "contact",
        entityId: input.contactId,
        relatedContactId: input.contactId,
        details: {
          aircallNumberId: line.marketingNumberId,
          archived: input.archive,
        },
      });
      return { success: true, archived: input.archive };
    }),

  /** Sends a manual reply from the shared marketing line and writes it to the CRM immediately. */
  sendReply: protectedProcedure
    .input(
      z.object({
        contactId: positiveId,
        body: z.string().trim().min(1).max(1600),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireMarketingTextInboxAccess(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [line, contact] = await Promise.all([
        marketingLine(db),
        db
          .select()
          .from(contacts)
          .where(eq(contacts.id, input.contactId))
          .limit(1)
          .then(rows => rows[0] ?? null),
      ]);
      if (!line?.marketingNumberId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Select a dedicated Aircall marketing number before sending texts.",
        });
      }
      if (!contact)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found.",
        });
      if (contact.doNotContact || contact.smsMarketingOptedOutAt) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "This contact is opted out of marketing outreach and cannot be texted.",
        });
      }
      const [latestInbound] = await db
        .select({ fromNumber: aircallMessages.fromNumber })
        .from(aircallMessages)
        .where(
          and(
            eq(aircallMessages.aircallNumberId, line.marketingNumberId),
            eq(aircallMessages.contactId, input.contactId),
            eq(aircallMessages.direction, "inbound")
          )
        )
        .orderBy(
          desc(
            sql`COALESCE(${aircallMessages.receivedAt}, ${aircallMessages.sentAt}, ${aircallMessages.createdAt})`
          )
        )
        .limit(1);
      const replyNumber = latestInbound?.fromNumber ?? contact.phone;
      if (!replyNumber)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This conversation does not have a valid reply number.",
        });

      const destination = toE164(replyNumber);
      const result = await sendAircallSMS(
        destination,
        input.body,
        line.marketingNumberId
      );
      if (!result.success || !result.messageId) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message:
            result.error || "Aircall did not return a message identifier.",
        });
      }
      const payload = nativeMessagePayload(result.message, {
        messageId: result.messageId,
        body: input.body,
        destination,
        numberId: line.marketingNumberId,
        numberName: line.marketingNumberName,
        numberDigits: line.marketingNumberDigits,
      });
      await persistAircallMessage(payload, {
        contactId: contact.id,
        savvyUserId: ctx.user.id,
      });
      await logActivity({
        userId: ctx.user.id,
        action: "marketing_text_reply_sent",
        entityType: "contact",
        entityId: contact.id,
        relatedContactId: contact.id,
        details: {
          aircallMessageId: result.messageId,
          aircallNumberId: line.marketingNumberId,
        },
      });
      return { success: true, messageId: result.messageId };
    }),

  /** Records a contact's marketing-text opt-out immediately without overwriting a broader Do Not Contact preference. */
  optOutContact: protectedProcedure
    .input(
      z.object({
        contactId: positiveId,
        reason: z.string().trim().min(1).max(255),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireMarketingTextInboxAccess(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(contacts)
        .set({
          smsMarketingOptedOutAt: new Date(),
          smsMarketingOptOutReason: input.reason,
        })
        .where(eq(contacts.id, input.contactId));
      await logActivity({
        userId: ctx.user.id,
        action: "contact_marked_sms_marketing_opt_out",
        entityType: "contact",
        entityId: input.contactId,
        relatedContactId: input.contactId,
        details: { reason: input.reason },
      });
      return { success: true };
    }),
});
