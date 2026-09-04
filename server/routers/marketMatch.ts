import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  aircallIsaAssignments,
  aircallLiveTranscriptEvents,
  contacts,
  marketAgentAssignments,
  marketIntelligenceProfiles,
  marketProfiles,
  users,
} from "../../drizzle/schema";
import { normalizePhone, type AircallCallData } from "../aircall";
import { isAircallApiConfigured, aircallApiRequest } from "../_core/aircall";
import { getDb, logActivity } from "../db";
import {
  extractMarketMatchSignals,
  mergeLiveTranscriptEvents,
  rankMarketMatches,
  speakerLabel,
  type MarketMatchCandidate,
} from "../marketMatch";
import { protectedProcedure, router } from "../_core/trpc";

const SESSION_TTL_MS = 30 * 60_000;
const ACTIVE_CALL_LOOKBACK_SECONDS = 2 * 60 * 60;
const LIVE_TRANSCRIPT_EVENT_LIMIT = 120;

const activeCallInput = z.object({ contactId: z.number().int().positive() });
const sessionInput = z.object({ sessionToken: z.string().min(32).max(1_500) });

type MarketMatchSession = {
  contactId: number;
  aircallCallId: number;
  viewerId: number;
  issuedAt: number;
  expiresAt: number;
};

type AircallCallListResponse = { calls?: AircallCallData[] };

function requireMarketMatchAccess(role: string): void {
  if (role !== "admin" && role !== "isa") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Market Match calls are available to ISA and admin users only.",
    });
  }
}

function sessionSecret(): string {
  const secret =
    process.env.MARKET_MATCH_SESSION_SECRET || process.env.JWT_SECRET;
  if (!secret)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Market Match session signing is not configured.",
    });
  return secret;
}

function encodeSession(session: MarketMatchSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function decodeSession(token: string, viewerId: number): MarketMatchSession {
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length)
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "This Market Match call session is invalid. Start again from the Contact profile.",
    });
  const expected = crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url");
  const supplied = Buffer.from(signature);
  const valid =
    supplied.length === Buffer.from(expected).length &&
    crypto.timingSafeEqual(supplied, Buffer.from(expected));
  if (!valid)
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "This Market Match call session is invalid. Start again from the Contact profile.",
    });

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as MarketMatchSession;
    if (
      !Number.isInteger(parsed.contactId) ||
      !Number.isInteger(parsed.aircallCallId) ||
      parsed.viewerId !== viewerId ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt <= Date.now()
    ) {
      throw new Error("expired or malformed");
    }
    return parsed;
  } catch {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "This Market Match call session has expired. Return to the Contact profile and start it again.",
    });
  }
}

function isActiveAircallCall(call: AircallCallData): boolean {
  return (
    (call.status === "initial" || call.status === "answered") && !call.ended_at
  );
}

async function findActiveCallForContact(input: {
  contactPhone: string;
  viewerRole: string;
  viewerId: number;
}): Promise<AircallCallData> {
  if (!isAircallApiConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Aircall API credentials are not configured. Ask an administrator to complete Aircall setup.",
    });
  }

  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable.",
    });

  let isaAircallUserIds: number[] | null = null;
  if (input.viewerRole === "isa") {
    const [assignment] = await db
      .select({ aircallUserId: aircallIsaAssignments.aircallUserId })
      .from(aircallIsaAssignments)
      .where(eq(aircallIsaAssignments.savvyUserId, input.viewerId))
      .limit(1);
    if (!assignment) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Your Aircall user is not assigned in SavvyOS. Ask an administrator to complete your Aircall setup.",
      });
    }
    isaAircallUserIds = [assignment.aircallUserId];
  } else {
    const assignments = await db
      .select({ aircallUserId: aircallIsaAssignments.aircallUserId })
      .from(aircallIsaAssignments);
    isaAircallUserIds = assignments.map(row => row.aircallUserId);
  }

  const since = Math.floor(Date.now() / 1_000) - ACTIVE_CALL_LOOKBACK_SECONDS;
  let response: Response;
  try {
    response = await aircallApiRequest(
      `/v1/calls?per_page=100&order=desc&from=${since}`
    );
  } catch (error) {
    console.error("[MarketMatch] Active call lookup failed:", error);
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message:
        "SavvyOS could not confirm the current Aircall call. Try again in a moment.",
    });
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).trim();
    console.error(
      `[MarketMatch] Active call lookup returned HTTP ${response.status}: ${detail.slice(0, 300)}`
    );
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message:
        "SavvyOS could not confirm the current Aircall call. Try again in a moment.",
    });
  }

  const payload = (await response.json()) as AircallCallListResponse;
  const contactDigits = normalizePhone(input.contactPhone);
  const activeCall = (payload.calls ?? []).find(
    call =>
      isActiveAircallCall(call) &&
      normalizePhone(call.raw_digits) === contactDigits &&
      Boolean(call.user?.id && isaAircallUserIds?.includes(call.user.id))
  );
  if (!activeCall) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "No active Aircall call is in progress with this contact’s primary phone number. Start or answer the call in Aircall first.",
    });
  }
  return activeCall;
}

async function contactForSession(contactId: number) {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable.",
    });
  const [contact] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      city: contacts.city,
      state: contacts.state,
      archivedAt: contacts.archivedAt,
    })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!contact || contact.archivedAt)
    throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found." });
  if (!contact.phone)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Add a primary phone number to this contact before starting Market Match.",
    });
  return contact;
}

async function marketCandidates(): Promise<MarketMatchCandidate[]> {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable.",
    });
  const rows = await db
    .select({
      id: marketProfiles.id,
      name: marketProfiles.name,
      state: marketProfiles.state,
      region: marketProfiles.region,
      profile: marketIntelligenceProfiles.profileJson,
      intelligenceStatus: marketIntelligenceProfiles.status,
      assignmentId: marketAgentAssignments.id,
      agentId: users.id,
      agentName: users.name,
      callBookingLink: users.callBookingLink,
      isPrimary: marketAgentAssignments.isPrimary,
      isAvailable: marketAgentAssignments.isAvailable,
    })
    .from(marketProfiles)
    .leftJoin(
      marketIntelligenceProfiles,
      eq(marketIntelligenceProfiles.marketProfileId, marketProfiles.id)
    )
    .leftJoin(
      marketAgentAssignments,
      eq(marketAgentAssignments.marketProfileId, marketProfiles.id)
    )
    .leftJoin(
      users,
      and(
        eq(users.id, marketAgentAssignments.agentId),
        eq(users.role, "agent"),
        eq(users.isActive, true)
      )
    )
    .where(eq(marketProfiles.status, "active"))
    .orderBy(asc(marketProfiles.name), asc(users.name));

  const byMarket = new Map<number, MarketMatchCandidate>();
  for (const row of rows) {
    let candidate = byMarket.get(row.id);
    if (!candidate) {
      candidate = {
        id: row.id,
        name: row.name,
        state: row.state,
        region: row.region,
        profile: row.profile,
        intelligenceStatus: row.intelligenceStatus,
        agents: [],
      };
      byMarket.set(row.id, candidate);
    }
    if (row.assignmentId && row.agentId) {
      candidate.agents.push({
        id: row.agentId,
        name: row.agentName,
        callBookingLink: row.callBookingLink,
        isPrimary: Boolean(row.isPrimary),
        isAvailable: Boolean(row.isAvailable),
      });
    }
  }
  return Array.from(byMarket.values());
}

export const marketMatchRouter = router({
  /** Confirms an active ISA call, then issues a viewer-bound short-lived call session. */
  start: protectedProcedure
    .input(activeCallInput)
    .mutation(async ({ ctx, input }) => {
      requireMarketMatchAccess(ctx.user.role);
      const contact = await contactForSession(input.contactId);
      // contactForSession establishes that this required primary number exists.
      const contactPhone = contact.phone!;
      const call = await findActiveCallForContact({
        contactPhone,
        viewerRole: ctx.user.role,
        viewerId: ctx.user.id,
      });
      const issuedAt = Date.now();
      const session = encodeSession({
        contactId: contact.id,
        aircallCallId: call.id,
        viewerId: ctx.user.id,
        issuedAt,
        expiresAt: issuedAt + SESSION_TTL_MS,
      });
      await logActivity({
        userId: ctx.user.id,
        action: "market_match_call_started",
        entityType: "contact",
        entityId: contact.id,
        relatedContactId: contact.id,
        details: {
          aircallCallId: call.id,
          aircallUserId: call.user?.id ?? null,
        },
      });
      return {
        sessionToken: session,
        contactId: contact.id,
        aircallCallId: call.id,
        expiresAt: new Date(issuedAt + SESSION_TTL_MS),
      };
    }),

  /** Returns the newest stored Aircall utterances and an updated V1 recommendation set. */
  snapshot: protectedProcedure
    .input(sessionInput)
    .query(async ({ ctx, input }) => {
      requireMarketMatchAccess(ctx.user.role);
      const session = decodeSession(input.sessionToken, ctx.user.id);
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable.",
        });

      const [contact, candidates, eventRows] = await Promise.all([
        contactForSession(session.contactId),
        marketCandidates(),
        db
          .select({
            payload: aircallLiveTranscriptEvents.payload,
            receivedAt: aircallLiveTranscriptEvents.receivedAt,
          })
          .from(aircallLiveTranscriptEvents)
          .where(
            eq(aircallLiveTranscriptEvents.aircallCallId, session.aircallCallId)
          )
          .orderBy(desc(aircallLiveTranscriptEvents.receivedAt))
          .limit(LIVE_TRANSCRIPT_EVENT_LIMIT),
      ]);

      const utterances = mergeLiveTranscriptEvents(eventRows);
      const transcript = utterances.map(utterance => utterance.text).join("\n");
      const signals = extractMarketMatchSignals(transcript);
      const matches = rankMarketMatches(candidates, signals, transcript);
      const lastEvent = eventRows[0]?.receivedAt ?? null;
      return {
        call: {
          aircallCallId: session.aircallCallId,
          expiresAt: new Date(session.expiresAt),
          lastTranscriptAt: lastEvent,
        },
        contact: {
          id: contact.id,
          name: `${contact.firstName} ${contact.lastName}`.trim(),
          phone: contact.phone,
          email: contact.email,
          // Contacts do not currently have a dedicated primary-market field. Avoid
          // inferring one from address data or Agent Markets assignments.
          primaryMarket: null as string | null,
        },
        transcript: utterances.slice(-12).map(utterance => ({
          speaker: speakerLabel(utterance.participant_type),
          text: utterance.text ?? "",
        })),
        signals,
        matches,
        activeMarketCount: candidates.length,
      };
    }),
});
