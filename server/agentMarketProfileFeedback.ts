import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import {
  marketAgentAssignments,
  marketIntelligenceProfiles,
  marketProfileFeedbackRequests,
  marketProfiles,
  users,
} from "../drizzle/schema";
import { generateMagicLinkUrl, sendTransactionalEmail } from "./_core/resendEmail";
import { getDb } from "./db";

type MarketProfile = Record<string, any>;

const TEST_MARKET_PROFILE: MarketProfile = {
  executiveSummary: "This is a SavvyOS workflow test that demonstrates the complete evidence-backed Agent Market profile format and the private local-feedback loop.",
  bestFitInvestors: ["Investors who value property-specific STR diligence", "Buyers seeking evidence-led market context"],
  notIdealFor: ["Buyers seeking guaranteed revenue, financing, or regulatory outcomes"],
  buyBox: {
    purchasePriceGuidance: "Validate current purchase-price guidance against live market evidence.",
    propertyTypes: ["STR-suitable homes"],
    bedroomGuidance: "Confirm guest demand and operating assumptions before purchase.",
    locations: ["Market-specific locations subject to current due diligence"],
    propertyCharacteristics: ["Verify property-level STR feasibility"],
  },
  marketDynamics: ["Demand, supply, and regulation require current local validation.", "Operating economics should be assessed property by property."],
  agentGuidance: ["Use the profile as decision support rather than a guarantee.", "Submit local intelligence through this feedback workflow."],
  watchouts: ["Verify regulations, revenue, insurance, operating costs, and property-level feasibility."],
  evidenceNotes: ["This is a complete test snapshot for delivery validation.", "Live profiles use approved current market evidence."],
  researchGaps: ["Add current local research before using a test snapshot for client guidance."],
  confidence: "limited",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function asList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function listHtml(items: string[]): string {
  if (!items.length) return `<p style="margin:5px 0 14px;font-size:13px;line-height:1.55;color:#6B7280;">No current evidence was returned for this section.</p>`;
  return `<ul style="margin:6px 0 16px;padding-left:20px;color:#374151;font-size:13px;line-height:1.6;">${items.map(item => `<li style="margin-bottom:4px;">${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function section(title: string, body: string): string {
  return `<div style="margin:22px 0 0;border-top:1px solid #E5E7EB;padding-top:16px;"><div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:6px;">${escapeHtml(title)}</div>${body}</div>`;
}

/** Renders all structured market-profile fields for the agent's email and feedback page. */
export function renderMarketProfileSnapshot(profile: MarketProfile): string {
  const buyBox = profile?.buyBox ?? {};
  const buyBoxRows = [
    ["Purchase-price guidance", buyBox.purchasePriceGuidance],
    ["Bedroom guidance", buyBox.bedroomGuidance],
    ["Property types", asList(buyBox.propertyTypes).join(" · ")],
    ["Locations", asList(buyBox.locations).join(" · ")],
    ["Property characteristics", asList(buyBox.propertyCharacteristics).join(" · ")],
  ].filter(([, value]) => Boolean(String(value ?? "").trim()));
  return `<div style="margin:20px 0;border:1px solid #D1D5DB;border-radius:9px;padding:20px;background:#FFFFFF;">
    ${section("Market read", `<p style="margin:0;font-size:14px;line-height:1.65;color:#374151;">${escapeHtml(profile?.executiveSummary || "No market read is available yet.")}</p>`)}
    ${section("Best-fit investors", listHtml(asList(profile?.bestFitInvestors)))}
    ${section("Not ideal for", listHtml(asList(profile?.notIdealFor)))}
    ${section("What to buy", buyBoxRows.length ? `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;font-size:13px;color:#374151;">${buyBoxRows.map(([label, value]) => `<tr><td style="width:38%;padding:8px 10px 8px 0;border-bottom:1px solid #E5E7EB;font-weight:700;color:#111827;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:8px 0;border-bottom:1px solid #E5E7EB;line-height:1.55;">${escapeHtml(value)}</td></tr>`).join("")}</table>` : `<p style="margin:0;font-size:13px;color:#6B7280;">No buy-box guidance is available yet.</p>`)}
    ${section("Market dynamics", listHtml(asList(profile?.marketDynamics)))}
    ${section("Agent guidance", listHtml(asList(profile?.agentGuidance)))}
    ${section("Watchouts and diligence", listHtml(asList(profile?.watchouts)))}
    ${section("Evidence notes", listHtml(asList(profile?.evidenceNotes)))}
    ${section("Research gaps", listHtml(asList(profile?.researchGaps)))}
    ${section("Confidence", `<p style="margin:0;font-size:13px;line-height:1.55;color:#374151;text-transform:capitalize;">${escapeHtml(profile?.confidence || "Limited")}</p>`)}
  </div>`;
}

function canonical(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** Creates a concise deterministic change log without asking the model to invent a summary. */
export function summarizeMarketProfileChanges(previous: MarketProfile | null | undefined, next: MarketProfile): string[] {
  if (!previous) return ["A new living profile was generated with the current market read, investor fit, buy-box guidance, market dynamics, agent guidance, watchouts, evidence notes, research gaps, and confidence."];
  const fields: Array<[string, unknown, unknown]> = [
    ["Market read", previous.executiveSummary, next.executiveSummary],
    ["Best-fit investors", previous.bestFitInvestors, next.bestFitInvestors],
    ["Investor exclusions", previous.notIdealFor, next.notIdealFor],
    ["Buy-box guidance", previous.buyBox, next.buyBox],
    ["Market dynamics", previous.marketDynamics, next.marketDynamics],
    ["Agent guidance", previous.agentGuidance, next.agentGuidance],
    ["Watchouts and diligence", previous.watchouts, next.watchouts],
    ["Evidence notes", previous.evidenceNotes, next.evidenceNotes],
    ["Research gaps", previous.researchGaps, next.researchGaps],
    ["Confidence", previous.confidence, next.confidence],
  ];
  const changed = fields.filter(([, oldValue, newValue]) => canonical(oldValue) !== canonical(newValue)).map(([label]) => `${label} was updated.`);
  return changed.length ? changed : ["The profile was regenerated from updated evidence; its structured guidance did not materially change."];
}

function profileFingerprint(profile: MarketProfile): string {
  return crypto.createHash("sha256").update(canonical(profile)).digest("hex");
}

/**
 * Sends one agent-specific review request for every assigned active agent when
 * the generated structured profile changes. Existing same-version requests are
 * retained and never re-sent, even when a source refresh is retried.
 */
export async function notifyAssignedAgentsOfMarketProfileUpdate(params: {
  marketProfileId: number;
  previousProfile: MarketProfile | null | undefined;
  profile: MarketProfile;
}): Promise<{ notified: number; skipped: number }> {
  const db = await getDb();
  if (!db) return { notified: 0, skipped: 0 };
  const [market] = await db
    .select({ name: marketProfiles.name, state: marketProfiles.state })
    .from(marketProfiles)
    .where(eq(marketProfiles.id, params.marketProfileId))
    .limit(1);
  if (!market) return { notified: 0, skipped: 0 };

  const agents = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(marketAgentAssignments)
    .innerJoin(users, eq(marketAgentAssignments.agentId, users.id))
    .where(and(
      eq(marketAgentAssignments.marketProfileId, params.marketProfileId),
      eq(users.isActive, true),
      eq(users.role, "agent"),
    ));

  const fingerprint = profileFingerprint(params.profile);
  const changes = summarizeMarketProfileChanges(params.previousProfile, params.profile);
  const marketName = `${market.name}, ${market.state}`;
  let notified = 0;
  let skipped = 0;

  for (const agent of agents) {
    if (!agent.email) { skipped += 1; continue; }
    const [existing] = await db
      .select({ id: marketProfileFeedbackRequests.id })
      .from(marketProfileFeedbackRequests)
      .where(and(
        eq(marketProfileFeedbackRequests.marketProfileId, params.marketProfileId),
        eq(marketProfileFeedbackRequests.agentId, agent.id),
        eq(marketProfileFeedbackRequests.profileFingerprint, fingerprint),
      ))
      .limit(1);
    if (existing) { skipped += 1; continue; }

    const [insert] = await db.insert(marketProfileFeedbackRequests).values({
      marketProfileId: params.marketProfileId,
      agentId: agent.id,
      profileFingerprint: fingerprint,
      previousProfileJson: params.previousProfile ?? null,
      profileJson: params.profile,
      changeSummary: changes,
    });
    const requestId = Number((insert as any).insertId);
    const feedbackUrl = await generateMagicLinkUrl(agent.email, `/agent-market-feedback/${requestId}`);
    const delivery = await sendTransactionalEmail("market_profile_updated", {
      recipientName: agent.name ?? undefined,
      recipientEmail: agent.email,
      marketName,
      marketProfileChangeSummary: changes.join(" "),
      marketProfileSnapshotHtml: renderMarketProfileSnapshot(params.profile),
      marketProfileUpdateUrl: feedbackUrl,
    }, { injectMagicLinks: false, idempotencyKey: `market-profile-update:${requestId}` });
    if (delivery.sent) {
      notified += 1;
    } else {
      console.warn(`[AgentMarkets] Could not deliver profile update email to ${agent.email}: ${delivery.reason ?? "unknown error"}`);
    }
  }
  return { notified, skipped };
}

/** Sends an authenticated administrator a real, clickable workflow test. */
export async function sendMarketProfileUpdateTestEmail(params: {
  marketProfileId: number;
  recipient: { id: number; name?: string | null; email: string };
}): Promise<{ requestId: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable.");
  const [market] = await db
    .select({
      name: marketProfiles.name,
      state: marketProfiles.state,
    })
    .from(marketProfiles)
    .where(eq(marketProfiles.id, params.marketProfileId))
    .limit(1);
  if (!market) throw new Error("Market not found.");
  const [intelligence] = await db
    .select({ profileJson: marketIntelligenceProfiles.profileJson })
    .from(marketIntelligenceProfiles)
    .where(eq(marketIntelligenceProfiles.marketProfileId, params.marketProfileId))
    .limit(1);
  const profile = intelligence?.profileJson as MarketProfile | null ?? TEST_MARKET_PROFILE;

  const changes = summarizeMarketProfileChanges(null, profile);
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${canonical(profile)}:test:${Date.now()}`)
    .digest("hex");
  const [insert] = await db.insert(marketProfileFeedbackRequests).values({
    marketProfileId: params.marketProfileId,
    agentId: params.recipient.id,
    profileFingerprint: fingerprint,
    previousProfileJson: null,
    profileJson: profile,
    changeSummary: changes,
  });
  const requestId = Number((insert as any).insertId);
  try {
    const feedbackUrl = await generateMagicLinkUrl(params.recipient.email, `/agent-market-feedback/${requestId}`);
    const delivery = await sendTransactionalEmail("market_profile_updated", {
      recipientName: params.recipient.name ?? undefined,
      recipientEmail: params.recipient.email,
      marketName: `${market.name}, ${market.state}`,
      marketProfileChangeSummary: changes.join(" "),
      marketProfileSnapshotHtml: renderMarketProfileSnapshot(profile),
      marketProfileUpdateUrl: feedbackUrl,
    }, { injectMagicLinks: false, idempotencyKey: `market-profile-update-test:${requestId}` });
    if (!delivery.sent) throw new Error(delivery.reason ?? "Provider did not accept the test email.");
    return { requestId };
  } catch (error) {
    await db.delete(marketProfileFeedbackRequests).where(eq(marketProfileFeedbackRequests.id, requestId));
    throw error;
  }
}
