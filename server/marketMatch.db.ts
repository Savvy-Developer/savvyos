import { eq, desc, sql, gte } from "drizzle-orm";
import { getDb } from "./db";
import {
  marketProfiles,
  marketAgentAssignments,
  marketCaseStudies,
  marketMatchSessions,
  users,
  contacts,
  groups,
  groupMembers,
  type MarketProfile,
  type InsertMarketProfile,
  type MarketMatchSession,
} from "../drizzle/schema";

// ─── Market Profiles ──────────────────────────────────────────────────────────

export async function getAllMarketProfiles() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(marketProfiles).orderBy(marketProfiles.name);
}

export async function getMarketProfileById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [market] = await db
    .select()
    .from(marketProfiles)
    .where(eq(marketProfiles.id, id));
  return market ?? null;
}

export async function getActiveMarketProfiles() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(marketProfiles)
    .where(eq(marketProfiles.status, "active"))
    .orderBy(marketProfiles.name);
}

export async function upsertMarketProfile(
  data: Partial<InsertMarketProfile> & { id?: number }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (data.id) {
    const { id, ...rest } = data;
    // Strip undefined values — Drizzle sends undefined as empty string to MySQL DECIMAL/ENUM columns
    const clean = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined)
    ) as typeof rest;
    await db
      .update(marketProfiles)
      .set({ ...clean, updatedAt: new Date() })
      .where(eq(marketProfiles.id, id));
    return id;
  } else {
    const [result] = await db.insert(marketProfiles).values({
      name: data.name!,
      state: data.state!,
      ...data,
    });
    return (result as any).insertId as number;
  }
}

export async function deleteMarketProfile(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(marketProfiles).where(eq(marketProfiles.id, id));
}

// ─── Market Agent Assignments ─────────────────────────────────────────────────

export async function getMarketAgents(marketProfileId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: marketAgentAssignments.id,
      marketProfileId: marketAgentAssignments.marketProfileId,
      agentId: marketAgentAssignments.agentId,
      agentName: users.name,
      agentEmail: users.email,
      agentPhone: users.phone,
      isPrimary: marketAgentAssignments.isPrimary,
      budgetSpecialization: marketAgentAssignments.budgetSpecialization,
      maxLeadCapacity: marketAgentAssignments.maxLeadCapacity,
      currentLeadCount: marketAgentAssignments.currentLeadCount,
      isAvailable: marketAgentAssignments.isAvailable,
      notes: marketAgentAssignments.notes,
      groupName: groups.name,
    })
    .from(marketAgentAssignments)
    .innerJoin(users, eq(marketAgentAssignments.agentId, users.id))
    .leftJoin(groupMembers, eq(groupMembers.userId, users.id))
    .leftJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(marketAgentAssignments.marketProfileId, marketProfileId));
  // Deduplicate — an agent in multiple groups would appear multiple times; keep first
  const seen = new Set<number>();
  return rows.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
}

export async function upsertMarketAgentAssignment(data: {
  id?: number;
  marketProfileId: number;
  agentId: number;
  isPrimary?: boolean;
  budgetSpecialization?: string;
  maxLeadCapacity?: number;
  isAvailable?: boolean;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (data.id) {
    const { id, ...rest } = data;
    await db
      .update(marketAgentAssignments)
      .set(rest)
      .where(eq(marketAgentAssignments.id, id));
    return id;
  } else {
    const [result] = await db.insert(marketAgentAssignments).values(data);
    return (result as any).insertId as number;
  }
}

export async function removeMarketAgentAssignment(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(marketAgentAssignments).where(eq(marketAgentAssignments.id, id));
}

// ─── Case Studies ─────────────────────────────────────────────────────────────

export async function getMarketCaseStudies(marketProfileId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(marketCaseStudies)
    .where(eq(marketCaseStudies.marketProfileId, marketProfileId))
    .orderBy(desc(marketCaseStudies.createdAt));
}

export async function upsertMarketCaseStudy(data: {
  id?: number;
  marketProfileId: number;
  title: string;
  propertyType?: string;
  bedrooms?: number;
  purchasePrice?: number;
  annualRevenue?: number;
  cashOnCashReturn?: number;
  description?: string;
  keyAmenities?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (data.id) {
    const { id, ...rest } = data;
    await db.update(marketCaseStudies).set({
      ...rest,
      purchasePrice: rest.purchasePrice?.toString(),
      annualRevenue: rest.annualRevenue?.toString(),
      cashOnCashReturn: rest.cashOnCashReturn?.toString(),
    }).where(eq(marketCaseStudies.id, id));
    return id;
  } else {
    const { id: _id, ...insertData } = data;
    const [result] = await db.insert(marketCaseStudies).values({
      ...insertData,
      purchasePrice: insertData.purchasePrice?.toString(),
      annualRevenue: insertData.annualRevenue?.toString(),
      cashOnCashReturn: insertData.cashOnCashReturn?.toString(),
    });
    return (result as any).insertId as number;
  }
}

export async function deleteMarketCaseStudy(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(marketCaseStudies).where(eq(marketCaseStudies.id, id));
}

// ─── Market Match Sessions ────────────────────────────────────────────────────

export async function createMarketMatchSession(data: {
  contactId: number;
  isaId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(marketMatchSessions).values({
    contactId: data.contactId,
    isaId: data.isaId,
    status: "active",
    startedAt: new Date(),
  });
  return (result as any).insertId as number;
}

export async function getMarketMatchSession(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [session] = await db
    .select()
    .from(marketMatchSessions)
    .where(eq(marketMatchSessions.id, id));
  return session ?? null;
}

export async function getSessionsForContact(contactId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: marketMatchSessions.id,
      status: marketMatchSessions.status,
      overallConfidenceScore: marketMatchSessions.overallConfidenceScore,
      startedAt: marketMatchSessions.startedAt,
      completedAt: marketMatchSessions.completedAt,
      isaName: users.name,
    })
    .from(marketMatchSessions)
    .innerJoin(users, eq(marketMatchSessions.isaId, users.id))
    .where(eq(marketMatchSessions.contactId, contactId))
    .orderBy(desc(marketMatchSessions.startedAt));
}

export async function updateMarketMatchSession(
  id: number,
  data: Partial<MarketMatchSession>
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(marketMatchSessions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(marketMatchSessions.id, id));
}

export async function completeMarketMatchSession(
  id: number,
  data: {
    callSummary: string;
    followUpEmailDraft: string;
    handoffNotes: string;
    nextActionRecommendation: string;
    contactStatusSuggestion: string;
    tagsApplied: string;
    recommendedAgentId?: number;
    topMarketRecommendations: unknown;
    overallConfidenceScore: number;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const session = await getMarketMatchSession(id);
  if (!session) throw new Error("Session not found");
  const startedAt = session.startedAt ? new Date(session.startedAt) : new Date();
  const durationSeconds = Math.round((Date.now() - startedAt.getTime()) / 1000);
  await db
    .update(marketMatchSessions)
    .set({
      ...data,
      status: "completed",
      completedAt: new Date(),
      durationSeconds,
      crmWritebackCompleted: true,
      updatedAt: new Date(),
    })
    .where(eq(marketMatchSessions.id, id));
}

// ─── Contact context for call ─────────────────────────────────────────────────

export async function getContactCallContext(contactId: number) {
  const db = await getDb();
  if (!db) return null;
  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId));
  return contact ?? null;
}

// ─── Recent sessions for ISA call history ────────────────────────────────────

export async function getRecentCallSessions(isaId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: marketMatchSessions.id,
      status: marketMatchSessions.status,
      overallConfidenceScore: marketMatchSessions.overallConfidenceScore,
      callSummary: marketMatchSessions.callSummary,
      handoffNotes: marketMatchSessions.handoffNotes,
      nextActionRecommendation: marketMatchSessions.nextActionRecommendation,
      topMarketRecommendations: marketMatchSessions.topMarketRecommendations,
      investorProfile: marketMatchSessions.investorProfile,
      startedAt: marketMatchSessions.startedAt,
      completedAt: marketMatchSessions.completedAt,
      durationSeconds: marketMatchSessions.durationSeconds,
      contactId: marketMatchSessions.contactId,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactEmail: contacts.email,
      contactPhone: contacts.phone,
    })
    .from(marketMatchSessions)
    .innerJoin(contacts, eq(marketMatchSessions.contactId, contacts.id))
    .where(eq(marketMatchSessions.isaId, isaId))
    .orderBy(desc(marketMatchSessions.startedAt))
    .limit(limit);
}

// ─── Get agent info for intro email ──────────────────────────────────────────

export async function getAgentById(agentId: number) {
  const db = await getDb();
  if (!db) return null;
  const [agent] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, agentId));
  return agent ?? null;
}

