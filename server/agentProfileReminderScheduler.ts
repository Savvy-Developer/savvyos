import { and, asc, eq, inArray, lte } from "drizzle-orm";
import {
  agentProfileReminderCampaignRecipients,
  agentProfileReminderCampaigns,
  agentProfiles,
  userProfiles,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { sendTransactionalEmail } from "./_core/resendEmail";

type ProfileCandidate = {
  id: number;
  name: string | null;
  email: string | null;
  userPhone: string | null;
  preferredName: string | null;
  personalEmail: string | null;
  primaryPhone: string | null;
  timeZone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  licenseNumber: string | null;
  licenseState: string | null;
  licenseExpirationDate: Date | null;
  brokerageAffiliation: string | null;
  brokerFullName: string | null;
  brokerEmail: string | null;
  brokerOfficeNumber: string | null;
  bio: string | null;
  directorySpecialties: string | null;
  directoryLanguages: string | null;
  boardAssociation: string | null;
  mlsId: string | null;
  narId: string | null;
};

let isRunning = false;

function hasValue(value: string | Date | null | undefined): boolean {
  return value instanceof Date
    ? !Number.isNaN(value.getTime())
    : Boolean(value?.trim());
}

/**
 * Completion deliberately focuses on meaningful, agent-owned operational
 * details. Optional family information and individual social accounts are not
 * required, so an agent is never reminded solely because a field is inapplicable.
 */
export function isAgentExtendedProfileComplete(
  agent: ProfileCandidate
): boolean {
  return [
    agent.preferredName || agent.name,
    agent.personalEmail || agent.email,
    agent.primaryPhone || agent.userPhone,
    agent.timeZone,
    agent.addressLine1,
    agent.city,
    agent.state,
    agent.zip,
    agent.emergencyContactName,
    agent.emergencyContactPhone,
    agent.emergencyContactRelationship,
    agent.licenseNumber,
    agent.licenseState,
    agent.licenseExpirationDate,
    agent.brokerageAffiliation,
    agent.brokerFullName,
    agent.brokerEmail,
    agent.brokerOfficeNumber,
    agent.bio,
    agent.directorySpecialties,
    agent.directoryLanguages,
    agent.boardAssociation,
    agent.mlsId,
    agent.narId,
  ].every(hasValue);
}

function nextQuarterAtSameEasternTime(date: Date): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  const fromParts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, Number(part.value)])
  );
  const quarterBase = new Date(
    Date.UTC(
      fromParts.year,
      fromParts.month - 1 + 3,
      fromParts.day,
      15,
      fromParts.minute
    )
  );
  // Construct a midday UTC candidate, observe its Eastern wall-clock value,
  // then shift it to the original Eastern hour. This retains 10:00 AM ET
  // through both daylight-saving changes without adding a date-time library.
  const observedParts = Object.fromEntries(
    formatter
      .formatToParts(quarterBase)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, Number(part.value)])
  );
  const desiredWallClock = Date.UTC(
    fromParts.year,
    fromParts.month - 1 + 3,
    fromParts.day,
    fromParts.hour,
    fromParts.minute
  );
  const observedWallClock = Date.UTC(
    observedParts.year,
    observedParts.month - 1,
    observedParts.day,
    observedParts.hour,
    observedParts.minute
  );
  return new Date(quarterBase.getTime() + desiredWallClock - observedWallClock);
}

async function getActiveProfileCandidates() {
  const db = await getDb();
  if (!db) return [] as ProfileCandidate[];
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      userPhone: users.phone,
      preferredName: userProfiles.preferredName,
      personalEmail: userProfiles.personalEmail,
      primaryPhone: userProfiles.primaryPhone,
      timeZone: userProfiles.timeZone,
      addressLine1: userProfiles.addressLine1,
      city: userProfiles.city,
      state: userProfiles.state,
      zip: userProfiles.zip,
      emergencyContactName: userProfiles.emergencyContactName,
      emergencyContactPhone: userProfiles.emergencyContactPhone,
      emergencyContactRelationship: userProfiles.emergencyContactRelationship,
      licenseNumber: agentProfiles.licenseNumber,
      licenseState: agentProfiles.licenseState,
      licenseExpirationDate: agentProfiles.licenseExpirationDate,
      brokerageAffiliation: agentProfiles.brokerageAffiliation,
      brokerFullName: agentProfiles.brokerFullName,
      brokerEmail: agentProfiles.brokerEmail,
      brokerOfficeNumber: agentProfiles.brokerOfficeNumber,
      bio: agentProfiles.bio,
      directorySpecialties: agentProfiles.directorySpecialties,
      directoryLanguages: agentProfiles.directoryLanguages,
      boardAssociation: agentProfiles.boardAssociation,
      mlsId: agentProfiles.mlsId,
      narId: agentProfiles.narId,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .leftJoin(agentProfiles, eq(agentProfiles.userId, users.id))
    .where(and(eq(users.role, "agent"), eq(users.isActive, true)));
}

async function materializeQuarterlyAudience(campaignId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const incompleteAgents = (await getActiveProfileCandidates()).filter(
    agent => !isAgentExtendedProfileComplete(agent)
  );
  if (!incompleteAgents.length) return;
  await db
    .insert(agentProfileReminderCampaignRecipients)
    .values(
      incompleteAgents.map(agent => ({
        campaignId,
        agentUserId: agent.id,
        agentName: agent.name,
        agentEmail: agent.email,
      }))
    )
    .onDuplicateKeyUpdate({ set: { campaignId } });
}

/**
 * The first company-wide reminder begins with a planned recipient snapshot,
 * then is refreshed immediately before delivery. That includes agents added
 * after the campaign was scheduled without re-opening completed deliveries.
 */
async function refreshInitialActiveAgentAudience(
  campaignId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const activeAgents = await getActiveProfileCandidates();
  if (!activeAgents.length) return;
  const existingRecipients = await db
    .select({ agentUserId: agentProfileReminderCampaignRecipients.agentUserId })
    .from(agentProfileReminderCampaignRecipients)
    .where(eq(agentProfileReminderCampaignRecipients.campaignId, campaignId));
  const existingAgentIds = new Set(
    existingRecipients.map(recipient => recipient.agentUserId)
  );
  const newlyAddedAgents = activeAgents.filter(
    agent => !existingAgentIds.has(agent.id)
  );
  if (!newlyAddedAgents.length) return;
  await db.insert(agentProfileReminderCampaignRecipients).values(
    newlyAddedAgents.map(agent => ({
      campaignId,
      agentUserId: agent.id,
      agentName: agent.name,
      agentEmail: agent.email,
    }))
  );
}

async function queueNextQuarterlyCampaign(campaign: {
  scheduledFor: Date;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const scheduledFor = nextQuarterAtSameEasternTime(campaign.scheduledFor);
  await db
    .insert(agentProfileReminderCampaigns)
    .values({
      kind: "quarterly_incomplete",
      audience: "incomplete_at_send",
      scheduledFor,
      status: "scheduled",
    })
    .onDuplicateKeyUpdate({ set: { scheduledFor } });
}

/**
 * Captures the active-agent audience for a one-time onboarding outreach. The
 * recipient snapshot stays fixed even if team membership changes before send.
 */
export async function scheduleInitialAgentProfileReminderCampaign(
  scheduledFor: Date
): Promise<{ campaignId: number; recipientCount: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const activeAgents = await getActiveProfileCandidates();
  await db
    .insert(agentProfileReminderCampaigns)
    .values({
      kind: "initial_active_agents",
      audience: "active_snapshot",
      scheduledFor,
      status: "scheduled",
    })
    .onDuplicateKeyUpdate({ set: { scheduledFor } });
  const [campaign] = await db
    .select({ id: agentProfileReminderCampaigns.id })
    .from(agentProfileReminderCampaigns)
    .where(
      and(
        eq(agentProfileReminderCampaigns.kind, "initial_active_agents"),
        eq(agentProfileReminderCampaigns.scheduledFor, scheduledFor)
      )
    )
    .limit(1);
  if (!campaign) throw new Error("Could not create profile reminder campaign");

  if (activeAgents.length) {
    await db
      .insert(agentProfileReminderCampaignRecipients)
      .values(
        activeAgents.map(agent => ({
          campaignId: campaign.id,
          agentUserId: agent.id,
          agentName: agent.name,
          agentEmail: agent.email,
        }))
      )
      .onDuplicateKeyUpdate({ set: { campaignId: campaign.id } });
  }
  return { campaignId: campaign.id, recipientCount: activeAgents.length };
}

async function processCampaign(campaign: {
  id: number;
  kind: "initial_active_agents" | "quarterly_incomplete";
  audience: "active_snapshot" | "incomplete_at_send";
  scheduledFor: Date;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(agentProfileReminderCampaigns)
    .set({ status: "processing", startedAt: new Date() })
    .where(eq(agentProfileReminderCampaigns.id, campaign.id));

  if (campaign.kind === "initial_active_agents") {
    await refreshInitialActiveAgentAudience(campaign.id);
  } else if (campaign.audience === "incomplete_at_send") {
    await materializeQuarterlyAudience(campaign.id);
  }

  const recipients = await db
    .select()
    .from(agentProfileReminderCampaignRecipients)
    .where(
      and(
        eq(agentProfileReminderCampaignRecipients.campaignId, campaign.id),
        eq(agentProfileReminderCampaignRecipients.status, "queued")
      )
    )
    .orderBy(asc(agentProfileReminderCampaignRecipients.id));
  const liveAgents = await getActiveProfileCandidates();
  const liveAgentsById = new Map(liveAgents.map(agent => [agent.id, agent]));
  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    const liveAgent = liveAgentsById.get(recipient.agentUserId);
    const shouldSkip =
      !liveAgent ||
      (campaign.audience === "incomplete_at_send" &&
        isAgentExtendedProfileComplete(liveAgent));
    if (shouldSkip || !liveAgent?.email) {
      await db
        .update(agentProfileReminderCampaignRecipients)
        .set({
          status: "skipped",
          attemptedAt: new Date(),
          failureReason: !liveAgent
            ? "Agent is no longer active"
            : !liveAgent?.email
              ? "No email address is available"
              : "Profile is now complete",
        })
        .where(eq(agentProfileReminderCampaignRecipients.id, recipient.id));
      skippedCount += 1;
      continue;
    }

    try {
      const delivery = await sendTransactionalEmail(
        "agent_profile_completion_reminder",
        {
          recipientName: liveAgent.name ?? recipient.agentName ?? undefined,
          recipientEmail: liveAgent.email,
          profileReminderKind:
            campaign.kind === "initial_active_agents" ? "initial" : "quarterly",
          onboardingProfileUrl: "https://os.savvy-agents.com/profile",
        },
        {
          idempotencyKey: `agent-profile-reminder:${campaign.id}:${recipient.agentUserId}`,
          allowTemplateOverride: false,
        }
      );
      await db
        .update(agentProfileReminderCampaignRecipients)
        .set({
          status: delivery.sent ? "sent" : "skipped",
          attemptedAt: new Date(),
          sentAt: delivery.sent ? new Date() : null,
          failureReason: delivery.sent
            ? null
            : (delivery.reason ?? "Email delivery was skipped"),
        })
        .where(eq(agentProfileReminderCampaignRecipients.id, recipient.id));
      if (delivery.sent) sentCount += 1;
      else skippedCount += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected delivery error";
      await db
        .update(agentProfileReminderCampaignRecipients)
        .set({
          status: "failed",
          attemptedAt: new Date(),
          failureReason: message.slice(0, 1_000),
        })
        .where(eq(agentProfileReminderCampaignRecipients.id, recipient.id));
      failedCount += 1;
      console.error(
        `[AgentProfileReminder] Failed to email ${liveAgent?.email ?? recipient.agentEmail}:`,
        error
      );
    }
  }

  await db
    .update(agentProfileReminderCampaigns)
    .set({
      status: "completed",
      completedAt: new Date(),
      sentCount,
      skippedCount,
      failedCount,
    })
    .where(eq(agentProfileReminderCampaigns.id, campaign.id));
  // The initial active-agent outreach establishes the first quarterly check-in;
  // every later quarterly run schedules its own successor.
  await queueNextQuarterlyCampaign(campaign);
  console.log(
    `[AgentProfileReminder] Campaign ${campaign.id} completed: ${sentCount} sent, ${skippedCount} skipped, ${failedCount} failed.`
  );
}

/** Processes due initial and quarterly profile-completion email campaigns. */
export async function processAgentProfileReminderCampaigns(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const db = await getDb();
    if (!db) return;
    const campaigns = await db
      .select({
        id: agentProfileReminderCampaigns.id,
        kind: agentProfileReminderCampaigns.kind,
        audience: agentProfileReminderCampaigns.audience,
        scheduledFor: agentProfileReminderCampaigns.scheduledFor,
      })
      .from(agentProfileReminderCampaigns)
      .where(
        and(
          inArray(agentProfileReminderCampaigns.status, [
            "scheduled",
            "processing",
          ]),
          lte(agentProfileReminderCampaigns.scheduledFor, new Date())
        )
      )
      .orderBy(asc(agentProfileReminderCampaigns.scheduledFor));
    for (const campaign of campaigns) {
      await processCampaign(campaign);
    }
  } catch (error) {
    console.error("[AgentProfileReminder] Campaign processing failed:", error);
  } finally {
    isRunning = false;
  }
}

/** Performs a durable DB-backed check on startup and then every 15 minutes. */
export function scheduleAgentProfileReminderCampaigns(): void {
  setTimeout(() => {
    processAgentProfileReminderCampaigns().catch(error =>
      console.error("[AgentProfileReminder] Startup check failed:", error)
    );
  }, 30_000);
  setInterval(
    () => {
      processAgentProfileReminderCampaigns().catch(error =>
        console.error("[AgentProfileReminder] Scheduled check failed:", error)
      );
    },
    15 * 60 * 1000
  );
}
