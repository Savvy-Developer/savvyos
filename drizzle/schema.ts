import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  date,
  varchar,
  decimal,
  boolean,
  json,
  bigint,
  foreignKey,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/// ─── Markets ──────────────────────────────────────────────────────────────────
export const markets = mysqlTable("markets", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  annualGciGoal: decimal("annualGciGoal", { precision: 15, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Market = typeof markets.$inferSelect;

// ─── Users ──────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  phone: varchar("phone", { length: 32 }),
  title: varchar("title", { length: 128 }),
  reportsToId: int("reportsToId"),
  marketProfileId: int("marketProfileId").references(() => marketProfiles.id),
  loginMethod: varchar("loginMethod", { length: 64 }),
  // Full Users may authenticate and participate in operations; Teammates are directory-only.
  personType: mysqlEnum("personType", ["full_user", "teammate"]).default("full_user").notNull(),
  role: mysqlEnum("role", ["admin", "agent", "isa", "agent_support"]).default("agent").notNull(),
  // Agent commission split with Savvy (50, 60, 70, 80)
  commissionSplit: int("commissionSplit"),
  // Call booking calendar link (e.g. Calendly)
  callBookingLink: varchar("callBookingLink", { length: 512 }),
  isActive: boolean("isActive").default(true).notNull(),
  allowHiddenNav: boolean("allowHiddenNav").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  passwordHash: text("passwordHash"),
  passwordResetToken: varchar("passwordResetToken", { length: 128 }),
  passwordResetExpiry: timestamp("passwordResetExpiry"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;;

// ─── Groups ───────────────────────────────────────────────────────────────────
export const groups = mysqlTable("groups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  leaderId: int("leaderId").references(() => users.id),
  // Default group leader commission split (10, 20, 30)
  leaderCommissionSplit: int("leaderCommissionSplit"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Group = typeof groups.$inferSelect;

export const groupMembers = mysqlTable("group_members", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull().references(() => groups.id),
  userId: int("userId").notNull().references(() => users.id),
  // Per-agent group leader split override (null = use group default)
  leaderSplitOverride: int("leaderSplitOverride"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GroupMember = typeof groupMembers.$inferSelect;

// ─── Lead Sources ───────────────────────────────────────────────────────────
// Two-level hierarchy: parent categories (parentId=null) and child sub-sources
export const leadSources = mysqlTable("lead_sources", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  // null = top-level category; set to parent.id for sub-sources
  parentId: int("parentId"),
  // For paid lead sub-sources: buyer or seller campaign
  campaignType: mysqlEnum("campaignType", ["buyer", "seller", "both"]),
  // Referral percentage for Referral Partner sub-sources (5, 10, 15, 20, 25, 30)
  referralPercent: int("referralPercent"),
  // Whether this source is system-protected (cannot be deleted)
  isProtected: boolean("isProtected").default(false).notNull(),
  description: text("description"),
  // Agreement document for sub-sources
  agreementUrl: text("agreementUrl"),
  agreementKey: varchar("agreementKey", { length: 500 }),
  // Whether new sub-sources in this top-level category must include an agreement document
  requireAgreementForSubSources: boolean("requireAgreementForSubSources").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  clickCount: int("clickCount").default(0).notNull(),
  submissionCount: int("submissionCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LeadSource = typeof leadSources.$inferSelect;
export type InsertLeadSource = typeof leadSources.$inferInsert;

// ─── Contacts ─────────────────────────────────────────────────────────────────
export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  firstName: varchar("firstName", { length: 128 }).notNull(),
  lastName: varchar("lastName", { length: 128 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  secondaryEmail: varchar("secondaryEmail", { length: 320 }),
  secondaryPhone: varchar("secondaryPhone", { length: 32 }),
  address: text("address"),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  zip: varchar("zip", { length: 16 }),
  // Secondary contact (spouse/partner)
  spouseFirstName: varchar("spouseFirstName", { length: 128 }),
  spouseLastName: varchar("spouseLastName", { length: 128 }),
  spouseEmail: varchar("spouseEmail", { length: 320 }),
  spousePhone: varchar("spousePhone", { length: 32 }),
  // Lead source — FK to lead_sources hierarchy
  leadSourceId: int("leadSourceId"),
  // Keep legacy fields for backward compat during migration
  leadSourceType: mysqlEnum("leadSourceType", ["referral", "paid_lead", "paid_partnership", "organic", "sphere"]),
  campaignSource: varchar("campaignSource", { length: 255 }),
  partnershipName: varchar("partnershipName", { length: 255 }),
  // Assignment
  assignedIsaId: int("assignedIsaId").references(() => users.id),
  notes: text("notes"),
  tags: json("tags").$type<string[]>(),
  // ISA pipeline status
  isaStatus: mysqlEnum("isa_status", [
    "new_lead",
    "attempted_contact",
    "nurture",
    "active_client",
    "under_contract",
    "closed",
    "dead",
    "do_not_contact",
  ]),
  // A contact-level compliance flag inherited by every agent connection.
  doNotContact: boolean("doNotContact").default(false).notNull(),
  doNotContactReason: text("doNotContactReason"),
  doNotContactAt: timestamp("doNotContactAt"),
  doNotContactByUserId: int("doNotContactByUserId").references(() => users.id),
  // Dead Connections list exclusions. A null expiry means the removal is permanent.
  deadConnectionsExclusionMode: mysqlEnum("deadConnectionsExclusionMode", ["permanent", "temporary"]),
  deadConnectionsExcludedAt: timestamp("deadConnectionsExcludedAt"),
  deadConnectionsExcludedUntil: timestamp("deadConnectionsExcludedUntil"),
  deadConnectionsExcludedByUserId: int("deadConnectionsExcludedByUserId").references(() => users.id),
  // Email deliverability tracking
  emailStatus: mysqlEnum("emailStatus", ["valid", "bounced", "unsubscribed"]).default("valid").notNull(),
  emailBouncedAt: timestamp("emailBouncedAt"),
  emailUnsubscribedAt: timestamp("emailUnsubscribedAt"),
  archivedAt: timestamp("archived_at"),
  // Time zone
  timezone: varchar("timezone", { length: 64 }),
  // AI summary cache (refreshed weekly)
  aiSummary: text("aiSummary"),
  aiSummaryUpdatedAt: timestamp("aiSummaryUpdatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // Supports the analytics cohort’s archived-contact exclusion plus lead-created
  // date range without scanning the full contacts table.
  cohortActiveCreatedAtIdx: index("contacts_archived_createdAt_idx").on(table.archivedAt, table.createdAt),
  deadConnectionsExclusionIdx: index("contacts_dead_connections_exclusion_idx").on(table.deadConnectionsExcludedAt, table.deadConnectionsExcludedUntil),
}));
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

// ─── Agent Connections ────────────────────────────────────────────────────────
export const agentConnections = mysqlTable("agent_connections", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull().references(() => users.id),
  contactId: int("contactId").notNull().references(() => contacts.id),
  pipelineStatus: mysqlEnum("pipelineStatus", [
    "new_lead",
    "attempted_contact",
    "nurture",
    "active_client",
    "under_contract",
    "closed",
    "dead",
    // Agent-specific terminal stage. This does not modify the shared contact compliance flag.
    "do_not_contact",
  ]).default("new_lead").notNull(),
  followUpDate: timestamp("followUpDate"),
  agentNotes: text("agentNotes"),
  // Buy box
  propertyType: varchar("propertyType", { length: 128 }),
  minPrice: decimal("minPrice", { precision: 12, scale: 2 }),
  maxPrice: decimal("maxPrice", { precision: 12, scale: 2 }),
  minBeds: int("minBeds"),
  maxBeds: int("maxBeds"),
  minBaths: decimal("minBaths", { precision: 4, scale: 1 }),
  minSqft: int("minSqft"),
  maxSqft: int("maxSqft"),
  targetCities: json("targetCities").$type<string[]>(),
  targetZips: json("targetZips").$type<string[]>(),
  strRequirements: text("strRequirements"),
  investmentNotes: text("investmentNotes"),
  // This clock is reset only by qualifying agent lead activity. `updatedAt`
  // remains the generic audit timestamp for all connection writes.
  agingUpdatedAt: timestamp("agingUpdatedAt"),
  // Tracks whether the ISA set an appointment when making this connection
  appointmentSet: boolean("appointmentSet").default(false).notNull(),
  appointmentSetAt: timestamp("appointmentSetAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AgentConnection = typeof agentConnections.$inferSelect;
export type InsertAgentConnection = typeof agentConnections.$inferInsert;

// ─── Properties ───────────────────────────────────────────────────────────────
export const properties = mysqlTable("properties", {
  id: int("id").autoincrement().primaryKey(),
  address: varchar("address", { length: 512 }).notNull(),
  normalizedAddress: varchar("normalizedAddress", { length: 512 }),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  zip: varchar("zip", { length: 16 }),
  beds: decimal("beds", { precision: 4, scale: 1 }),
  baths: decimal("baths", { precision: 4, scale: 1 }),
  sqft: int("sqft"),
  propertyType: mysqlEnum("propertyType", [
    "single_family",
    "multi_family",
    "condo",
    "townhouse",
    "cabin",
    "vacation_rental",
    "commercial",
    "land",
    "other",
  ]),
  yearBuilt: int("yearBuilt"),
  listPrice: decimal("listPrice", { precision: 12, scale: 2 }),
  strZoning: varchar("strZoning", { length: 255 }),
  strNotes: text("strNotes"),
  notes: text("notes"),
  addedByUserId: int("addedByUserId").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  createdAtIdx: index("properties_createdAt_idx").on(table.createdAt),
  addedByUserIdx: index("idx_properties_addedByUserId").on(table.addedByUserId),
  normalizedAddressIdx: index("idx_properties_normalizedAddress").on(table.normalizedAddress),
}));

export type Property = typeof properties.$inferSelect;
export type InsertProperty = typeof properties.$inferInsert;

// ─── Property Ownership ───────────────────────────────────────────────────────
export const propertyOwnership = mysqlTable("property_ownership", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull().references(() => properties.id),
  ownerContactId: int("ownerContactId").notNull().references(() => contacts.id),
  ownershipStartDate: timestamp("ownershipStartDate"),
  ownershipEndDate: timestamp("ownershipEndDate"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PropertyOwnership = typeof propertyOwnership.$inferSelect;

// ─── Transactions ─────────────────────────────────────────────────────────────
export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  transactionNumber: varchar("transactionNumber", { length: 64 }),
  agentId: int("agentId").notNull().references(() => users.id),
  primaryContactId: int("primaryContactId").notNull().references(() => contacts.id),
  propertyId: int("propertyId").references(() => properties.id),
  transactionType: mysqlEnum("transactionType", ["buyer", "seller", "dual"]).notNull(),
  status: mysqlEnum("status", [
    "under_contract",
    "closed",
    "terminated",
  ]).default("under_contract").notNull(),
  purchasePrice: decimal("purchasePrice", { precision: 12, scale: 2 }),
  contractDate: timestamp("contractDate"),
  closingDate: timestamp("closingDate"),
  grossCommissionIncome: decimal("grossCommissionIncome", { precision: 12, scale: 2 }),
  commissionRate: decimal("commissionRate", { precision: 5, scale: 4 }),
  commissionType: mysqlEnum("commissionType", ["percentage", "flat"]).default("percentage").notNull(),
  // Financial integrity flag
  payoutIntegrityFlag: boolean("payoutIntegrityFlag").default(false).notNull(),
  payoutIntegrityNote: text("payoutIntegrityNote"),
  terminationReason: text("terminationReason"),
  listingId: int("listing_id").references(() => listings.id),
  sellerContactId: int("seller_contact_id").references(() => contacts.id),
  // Dual-agency buyer side
  buyerContactId: int("buyer_contact_id").references(() => contacts.id),
  buyerCommissionRate: decimal("buyerCommissionRate", { precision: 5, scale: 4 }),
  buyerCommissionType: mysqlEnum("buyerCommissionType", ["percentage", "flat"]).default("percentage"),
  buyerNotes: text("buyerNotes"),
  notes: text("notes"),
  // Referral payout fields (set manually or auto-populated from contact lead source)
  referralSourceName: varchar("referralSourceName", { length: 255 }),
  referralPayoutPct: decimal("referralPayoutPct", { precision: 5, scale: 2 }),
  // Outbound referral attribution. This remains separate from the legacy inbound referral-payout fields above.
  referralId: int("referralId").references(() => referrals.id, { onDelete: "set null" }),
  referralAgentId: int("referralAgentId").references(() => referralAgents.id, { onDelete: "set null" }),
  isOutsideReferral: boolean("isOutsideReferral").default(false).notNull(),
  savvyReferralPct: decimal("savvyReferralPct", { precision: 5, scale: 2 }),
  referralMarket: varchar("referralMarket", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

// ─── Transaction Export History ───────────────────────────────────────────────
export const transactionExports = mysqlTable("transaction_exports", {
  id: int("id").autoincrement().primaryKey(),
  exportedById: int("exportedById").notNull().references(() => users.id),
  format: varchar("format", { length: 16 }).default("csv").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  rowCount: int("rowCount").notNull(),
  filters: json("filters").$type<Record<string, unknown>>().notNull(),
  filterSummary: text("filterSummary").notNull(),
  columns: json("columns").$type<string[]>().notNull(),
  transactionIds: json("transactionIds").$type<number[]>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  exportedByIdx: index("transaction_exports_exportedBy_idx").on(table.exportedById),
  createdAtIdx: index("transaction_exports_createdAt_idx").on(table.createdAt),
}));

export type TransactionExport = typeof transactionExports.$inferSelect;
export type InsertTransactionExport = typeof transactionExports.$inferInsert;

// ─── Transaction Payout Items ─────────────────────────────────────────────────
export const transactionPayoutItems = mysqlTable("transaction_payout_items", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: int("transactionId").notNull().references(() => transactions.id),
  payeeType: mysqlEnum("payeeType", [
    "agent",
    "savvy_str_agents",
    "exp",
    "group_leader",
    "referral_partner",
    "isa_bonus",
    "other",
  ]).notNull(),
  payeeUserId: int("payeeUserId").references(() => users.id),
  payeeName: varchar("payeeName", { length: 255 }),
  percentage: decimal("percentage", { precision: 5, scale: 2 }).notNull(),
  commissionType: mysqlEnum("commissionType", ["percentage", "flat"]).default("percentage").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }),
  isPaid: boolean("isPaid").default(false).notNull(),
  paidDate: timestamp("paidDate"),
  // For referral fees: who pays (savvy, agent, split, group_leader)
  referralFeePaidBy: mysqlEnum("referralFeePaidBy", ["savvy", "agent", "split", "group_leader"]),
  notes: text("notes"),
  isOverride: boolean("isOverride").default(false).notNull(),
  overrideNote: text("overrideNote"),
  isAutoGenerated: boolean("isAutoGenerated").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TransactionPayoutItem = typeof transactionPayoutItems.$inferSelect;
export type InsertTransactionPayoutItem = typeof transactionPayoutItems.$inferInsert;

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  assignedToId: int("assignedToId").references(() => users.id),
  createdById: int("createdById").references(() => users.id),
  // Polymorphic associations
  relatedContactId: int("relatedContactId").references(() => contacts.id),
  relatedTransactionId: int("relatedTransactionId").references(() => transactions.id),
  relatedPropertyId: int("relatedPropertyId").references(() => properties.id),
  relatedAgentConnectionId: int("relatedAgentConnectionId").references(() => agentConnections.id),
  // Links a standard task to its source onboarding checklist item when applicable.
  onboardingInstanceTaskId: int("onboardingInstanceTaskId"),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "cancelled"]).default("pending").notNull(),
  dueDate: timestamp("dueDate"),
  completedAt: timestamp("completedAt"),
  taskType: mysqlEnum("taskType", [
    "follow_up",
    "outreach",
    "document",
    "call",
    "email",
    "meeting",
    "review",
    "payout",
    "other",
  ]).default("other").notNull(),
  isAutomated: boolean("isAutomated").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

// ─── Documents ────────────────────────────────────────────────────────────────
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 512 }).notNull(),
  fileKey: varchar("fileKey", { length: 1024 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  fileSize: bigint("fileSize", { mode: "number" }),
  uploadedById: int("uploadedById").references(() => users.id),
  // Polymorphic associations
  relatedContactId: int("relatedContactId").references(() => contacts.id),
  relatedTransactionId: int("relatedTransactionId").references(() => transactions.id),
  relatedPropertyId: int("relatedPropertyId").references(() => properties.id),
  relatedAgentId: int("relatedAgentId").references(() => users.id),
  documentType: mysqlEnum("documentType", [
    "contract",
    "disclosure",
    "addendum",
    "inspection",
    "title",
    "closing",
    "voice_note",
    "other",
  ]).default("other").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

// ─── Communications ───────────────────────────────────────────────────────────
export const communications = mysqlTable("communications", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["note", "call", "email", "sms", "meeting", "voice_note"]).notNull(),
  subject: varchar("subject", { length: 512 }),
  body: text("body"),
  direction: mysqlEnum("direction", ["inbound", "outbound", "internal"]).default("internal"),
  authorId: int("authorId").references(() => users.id),
  // Polymorphic associations
  relatedContactId: int("relatedContactId").references(() => contacts.id),
  relatedTransactionId: int("relatedTransactionId").references(() => transactions.id),
  relatedPropertyId: int("relatedPropertyId").references(() => properties.id),
  relatedAgentConnectionId: int("relatedAgentConnectionId").references(() => agentConnections.id),
  // Voice note
  audioFileUrl: text("audioFileUrl"),
  transcription: text("transcription"),
  communicatedAt: timestamp("communicatedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Note edit audit fields
  editedAt: timestamp("editedAt"),
  editedById: int("editedById").references(() => users.id),
  originalBody: text("originalBody"),
  // A contact can surface one shared note at the top of its activity timeline.
  isPinned: boolean("isPinned").default(false).notNull(),
}, (table) => [
  index("communications_contact_pinned_idx").on(table.relatedContactId, table.isPinned),
]);

export type Communication = typeof communications.$inferSelect;
export type InsertCommunication = typeof communications.$inferInsert;

// ─── Activity Log ─────────────────────────────────────────────────────────────
export const activityLog = mysqlTable("activity_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id),
  action: varchar("action", { length: 255 }).notNull(),
  entityType: varchar("entityType", { length: 64 }),
  entityId: int("entityId"),
  relatedContactId: int("relatedContactId"),
  details: json("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_activity_log_entity").on(table.entityType, table.entityId),
  index("idx_activity_log_contact").on(table.relatedContactId, table.createdAt),
  index("idx_activity_log_user_created").on(table.userId, table.createdAt),
]);
export type ActivityLog = typeof activityLog.$inferSelect;


// ─── Automationss ──────────────────────────────────────────────────────────────
export const automations = mysqlTable("automations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  triggerType: mysqlEnum("triggerType", [
    "record_created",
    "field_updated",
    "scheduled",
    "transaction_closed",
    "transaction_status_changed",
    "follow_up_date",
    "payout_integrity_fail",
    "agent_connection_created",
    "isa_assigned_agent",
  ]).notNull(),
  triggerConfig: json("triggerConfig"),
  actionType: mysqlEnum("actionType", [
    "create_task",
    "send_notification",
    "send_email",
    "update_record",
    "flag_record",
    "notify_owner",
  ]).notNull(),
  actionConfig: json("actionConfig"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Automation = typeof automations.$inferSelect;
// ─── Admin Approval Requests ──────────────────────────────────────────────────
export const approvalRequests = mysqlTable("approval_requests", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["delete_agent_connection"]).notNull(),
  requestedById: int("requestedById").notNull().references(() => users.id),
  targetId: int("targetId").notNull(), // polymorphic: agentConnectionId, etc.
  reason: text("reason").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).notNull().default("pending"),
  reviewedById: int("reviewedById").references(() => users.id),
  reviewNote: text("reviewNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type InsertApprovalRequest = typeof approvalRequests.$inferInsert;
// ─── Contact Properties ───────────────────────────────────────────────────────
export const contactProperties = mysqlTable("contact_properties", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull().references(() => contacts.id),
  propertyId: int("propertyId").notNull().references(() => properties.id),
  label: varchar("label", { length: 128 }).default("Primary home"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ContactProperty = typeof contactProperties.$inferSelect;
export type InsertContactProperty = typeof contactProperties.$inferInsert;

// ─── Listings ────────────────────────────────────────────────────────────────
export const listings = mysqlTable("listings", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").references(() => contacts.id),
  propertyId: int("propertyId").references(() => properties.id),
  agentId: int("agentId").references(() => users.id),
  listingStatus: mysqlEnum("listingStatus", ["active", "terminated", "expired", "under_contract", "closed"]).default("active").notNull(),
  listPrice: decimal("listPrice", { precision: 12, scale: 2 }),
  listDate: date("listDate", { mode: "string" }),
  expirationDate: date("expirationDate", { mode: "string" }),
  terminationDate: date("terminationDate", { mode: "string" }),
  convertedTransactionId: int("convertedTransactionId"),
  // Outbound referral attribution persists through the seller listing lifecycle.
  referralId: int("referralId").references(() => referrals.id, { onDelete: "set null" }),
  referralAgentId: int("referralAgentId").references(() => referralAgents.id, { onDelete: "set null" }),
  isOutsideReferral: boolean("isOutsideReferral").default(false).notNull(),
  savvyReferralPct: decimal("savvyReferralPct", { precision: 5, scale: 2 }),
  referralMarket: varchar("referralMarket", { length: 255 }),
  mlsNumber: varchar("mlsNumber", { length: 64 }),
  notes: text("notes"),
  lastExpirationReminderSent: timestamp("lastExpirationReminderSent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Listing = typeof listings.$inferSelect;
export type InsertListing = typeof listings.$inferInsert;

// ─── Smart Plans ─────────────────────────────────────────────────────────────
export const smartPlans = mysqlTable("smart_plans", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // Legacy single source (kept for backward compat)
  triggerLeadSourceId: int("triggerLeadSourceId").references(() => leadSources.id),
    // Multi-source: JSON array of lead source IDs
  triggerLeadSourceIds: json("triggerLeadSourceIds").$type<number[]>(),
  // Event that starts this plan. Lead source plans use triggerLeadSourceIds; the remaining values are record-status events.
  triggerType: mysqlEnum("triggerType", [
    "lead_source",
    "all_lead_sources",
    "buyer_under_contract",
    "seller_under_contract",
    "new_listing",
    "buyer_closed",
    "seller_closed",
  ]).default("lead_source").notNull(),
  // Scope: new_only = only future matching contacts; existing_and_new = immediately enroll matching current contacts as well; manual = no auto-trigger
  triggerScope: mysqlEnum("triggerScope", ["new_only", "existing_and_new", "manual"]).default("new_only").notNull(),
  status: mysqlEnum("status", ["active", "paused", "draft"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SmartPlan = typeof smartPlans.$inferSelect;
export type InsertSmartPlan = typeof smartPlans.$inferInsert;

// ─── One Time Smart Plan Sends ───────────────────────────────────────────────
// A queued, auditable broadcast that reuses Smart Plan audience triggers without
// creating an ongoing drip workflow. Recipient rows make delivery restart-safe.
export const oneTimeSends = mysqlTable("one_time_sends", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  channel: mysqlEnum("channel", ["email", "sms"]).notNull(),
  subject: varchar("subject", { length: 255 }),
  body: text("body").notNull(),
  triggerType: mysqlEnum("triggerType", [
    "lead_source",
    "all_lead_sources",
    "buyer_under_contract",
    "seller_under_contract",
    "new_listing",
    "buyer_closed",
    "seller_closed",
  ]).notNull(),
  triggerLeadSourceIds: json("triggerLeadSourceIds").$type<number[]>(),
  status: mysqlEnum("status", ["queued", "processing", "completed", "failed", "cancelled"]).default("queued").notNull(),
  totalRecipients: int("totalRecipients").default(0).notNull(),
  sentCount: int("sentCount").default(0).notNull(),
  skippedCount: int("skippedCount").default(0).notNull(),
  failedCount: int("failedCount").default(0).notNull(),
  deliveredCount: int("deliveredCount").default(0).notNull(),
  openedCount: int("openedCount").default(0).notNull(),
  clickedCount: int("clickedCount").default(0).notNull(),
  bouncedCount: int("bouncedCount").default(0).notNull(),
  complainedCount: int("complainedCount").default(0).notNull(),
  suppressedCount: int("suppressedCount").default(0).notNull(),
  repliedCount: int("repliedCount").default(0).notNull(),
  createdById: int("createdById").references(() => users.id),
  confirmedAt: timestamp("confirmedAt").defaultNow().notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("one_time_sends_status_created_idx").on(table.status, table.createdAt),
  index("one_time_sends_createdBy_idx").on(table.createdById),
]);
export type OneTimeSend = typeof oneTimeSends.$inferSelect;
export type InsertOneTimeSend = typeof oneTimeSends.$inferInsert;

export const oneTimeSendRecipients = mysqlTable("one_time_send_recipients", {
  id: int("id").autoincrement().primaryKey(),
  sendId: int("sendId").notNull().references(() => oneTimeSends.id),
  contactId: int("contactId").notNull().references(() => contacts.id),
  // The concrete email address or phone number chosen from the contact record.
  recipientAddress: varchar("recipientAddress", { length: 320 }).notNull(),
  status: mysqlEnum("status", ["queued", "sent", "skipped", "failed"]).default("queued").notNull(),
  provider: varchar("provider", { length: 64 }),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
  // Used as the local part of an optional Resend inbound reply address.
  replyToken: varchar("replyToken", { length: 64 }),
  errorMessage: text("errorMessage"),
  sentAt: timestamp("sentAt"),
  deliveredAt: timestamp("deliveredAt"),
  openedAt: timestamp("openedAt"),
  clickedAt: timestamp("clickedAt"),
  bouncedAt: timestamp("bouncedAt"),
  complainedAt: timestamp("complainedAt"),
  suppressedAt: timestamp("suppressedAt"),
  repliedAt: timestamp("repliedAt"),
  providerStatusCheckedAt: timestamp("providerStatusCheckedAt"),
  providerLastEvent: varchar("providerLastEvent", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("one_time_send_recipient_unique").on(table.sendId, table.contactId, table.recipientAddress),
  uniqueIndex("one_time_send_recipients_reply_token_unique").on(table.replyToken),
  index("one_time_send_recipients_send_status_idx").on(table.sendId, table.status),
  index("one_time_send_recipients_provider_message_idx").on(table.providerMessageId),
]);
export type OneTimeSendRecipient = typeof oneTimeSendRecipients.$inferSelect;
export type InsertOneTimeSendRecipient = typeof oneTimeSendRecipients.$inferInsert;

// Immutable Resend lifecycle events for one-time Smart Plan sends. Webhooks are
// at-least-once and may arrive out of order, so provider event IDs are unique.
export const oneTimeSendMessageEvents = mysqlTable("one_time_send_message_events", {
  id: int("id").autoincrement().primaryKey(),
  recipientId: int("recipientId").notNull().references(() => oneTimeSendRecipients.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 64 }).notNull(),
  providerEventId: varchar("providerEventId", { length: 255 }),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("one_time_send_message_events_provider_event_unique").on(table.providerEventId),
  index("one_time_send_message_events_recipient_type_idx").on(table.recipientId, table.eventType),
]);
export type OneTimeSendMessageEvent = typeof oneTimeSendMessageEvents.$inferSelect;
export type InsertOneTimeSendMessageEvent = typeof oneTimeSendMessageEvents.$inferInsert;

export const smartPlanSteps = mysqlTable("smart_plan_steps", {
  id: int("id").autoincrement().primaryKey(),
  planId: int("planId").notNull().references(() => smartPlans.id),
  stepOrder: int("stepOrder").notNull(),
  channel: mysqlEnum("channel", ["email", "sms"]).notNull(),
  // Delay from enrollment (or previous step) before sending
  delayDays: int("delayDays").default(0).notNull(),
  delayHours: int("delayHours").default(0).notNull(),
  // Email-specific
  subject: varchar("subject", { length: 255 }),
  // Body supports merge tags: {{first_name}}, {{last_name}}, {{lead_source}}
  body: text("body").notNull(),
  // Business-hours scheduling: if true, defer send to next Mon-Fri 9am-6pm window
  businessHoursOnly: boolean("businessHoursOnly").default(false).notNull(),
  timezone: varchar("timezone", { length: 64 }).default("America/New_York").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SmartPlanStep = typeof smartPlanSteps.$inferSelect;
export type InsertSmartPlanStep = typeof smartPlanSteps.$inferInsert;

export const smartPlanEnrollments = mysqlTable("smart_plan_enrollments", {
  id: int("id").autoincrement().primaryKey(),
  planId: int("planId").notNull().references(() => smartPlans.id),
  contactId: int("contactId").notNull().references(() => contacts.id),
  // Index of the next step to execute (0-based)
  currentStepIndex: int("currentStepIndex").default(0).notNull(),
  enrolledAt: timestamp("enrolledAt").defaultNow().notNull(),
  // When the next step should fire (UTC)
  nextStepAt: timestamp("nextStepAt"),
  status: mysqlEnum("status", ["active", "paused", "completed", "cancelled"]).default("active").notNull(),
  completedAt: timestamp("completedAt"),
});
export type SmartPlanEnrollment = typeof smartPlanEnrollments.$inferSelect;
export type InsertSmartPlanEnrollment = typeof smartPlanEnrollments.$inferInsert;

export const smartPlanExecutions = mysqlTable("smart_plan_executions", {
  id: int("id").autoincrement().primaryKey(),
  enrollmentId: int("enrollmentId").notNull().references(() => smartPlanEnrollments.id),
  stepId: int("stepId").notNull().references(() => smartPlanSteps.id),
  channel: mysqlEnum("channel", ["email", "sms"]).notNull(),
  // Provider fields make each send traceable to Resend today and to an SMS provider later.
  provider: varchar("provider", { length: 64 }),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
  // Used as the local part of an optional Resend inbound reply address.
  replyToken: varchar("replyToken", { length: 64 }),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  status: mysqlEnum("status", ["queued", "sent", "failed", "skipped"]).default("queued").notNull(),
  errorMessage: text("errorMessage"),
  deliveredAt: timestamp("deliveredAt"),
  openedAt: timestamp("openedAt"),
  clickedAt: timestamp("clickedAt"),
  bouncedAt: timestamp("bouncedAt"),
  complainedAt: timestamp("complainedAt"),
  suppressedAt: timestamp("suppressedAt"),
  repliedAt: timestamp("repliedAt"),
}, (table) => [
  index("smart_plan_executions_step_sent_idx").on(table.stepId, table.sentAt),
  index("smart_plan_executions_provider_message_idx").on(table.providerMessageId),
  uniqueIndex("smart_plan_executions_reply_token_unique").on(table.replyToken),
]);
export type SmartPlanExecution = typeof smartPlanExecutions.$inferSelect;
export type InsertSmartPlanExecution = typeof smartPlanExecutions.$inferInsert;

// Immutable provider event ledger. Resend webhooks are at-least-once and can arrive out
// of order, so providerEventId is unique whenever a webhook supplies an Svix event id.
export const smartPlanMessageEvents = mysqlTable("smart_plan_message_events", {
  id: int("id").autoincrement().primaryKey(),
  executionId: int("executionId").notNull().references(() => smartPlanExecutions.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 64 }).notNull(),
  providerEventId: varchar("providerEventId", { length: 255 }),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("smart_plan_message_events_provider_event_unique").on(table.providerEventId),
  index("smart_plan_message_events_execution_type_idx").on(table.executionId, table.eventType),
]);
export type SmartPlanMessageEvent = typeof smartPlanMessageEvents.$inferSelect;
export type InsertSmartPlanMessageEvent = typeof smartPlanMessageEvents.$inferInsert;

// ─── Listing Notes ─────────────────────────────────────────────────────────────
export const listingNotes = mysqlTable("listing_notes", {
  id: int("id").autoincrement().primaryKey(),
  listingId: int("listingId").notNull().references(() => listings.id),
  authorId: int("authorId").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ListingNote = typeof listingNotes.$inferSelect;
export type InsertListingNote = typeof listingNotes.$inferInsert;

// ─── Transaction Documents ─────────────────────────────────────────────────────
export const transactionDocuments = mysqlTable("transaction_documents", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: int("transactionId").notNull().references(() => transactions.id),
  uploadedBy: int("uploadedBy").notNull().references(() => users.id),
  label: mysqlEnum("label", ["appraisal", "closing_disclosure", "home_inspection", "other"]).default("other").notNull(),
  customLabel: varchar("custom_label", { length: 255 }),
  fileUrl: text("file_url").notNull(),
  fileKey: varchar("file_key", { length: 500 }).notNull(),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  fileSize: int("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TransactionDocument = typeof transactionDocuments.$inferSelect;
export type InsertTransactionDocument = typeof transactionDocuments.$inferInsert;

// ─── Transaction Notes ─────────────────────────────────────────────────────────
export const transactionNotes = mysqlTable("transaction_notes", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: int("transactionId").notNull().references(() => transactions.id),
  authorId: int("authorId").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TransactionNote = typeof transactionNotes.$inferSelect;
export type InsertTransactionNote = typeof transactionNotes.$inferInsert;


// ─── Feedback (Bug Reports / Feature Requests) ──────────────────────────────
export const feedback = mysqlTable("feedback", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["bug", "feature"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  userId: int("userId").notNull().references(() => users.id),
  status: mysqlEnum("status", ["pending", "approved", "denied", "in_progress", "completed"]).default("pending").notNull(),
  adminNotes: text("adminNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Feedback = typeof feedback.$inferSelect;

// ─── Task Notes ──────────────────────────────────────────────────────────────
export const taskNotes = mysqlTable("task_notes", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull().references(() => tasks.id),
  authorId: int("authorId").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TaskNote = typeof taskNotes.$inferSelect;

// ─── Onboarding Templates ────────────────────────────────────────────────────
export const onboardingTemplates = mysqlTable("onboarding_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: mysqlEnum("type", ["onboarding", "offboarding"]).default("onboarding").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type OnboardingTemplate = typeof onboardingTemplates.$inferSelect;

export const onboardingTemplateTasks = mysqlTable("onboarding_template_tasks", {
  id: int("id").autoincrement().primaryKey(),
  templateId: int("templateId").notNull().references(() => onboardingTemplates.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  assignee: mysqlEnum("assignee", ["admin", "agent"]).default("admin").notNull(),
  // Required for newly configured admin tasks; null is retained for legacy templates.
  adminUserId: int("adminUserId").references(() => users.id),
  sortOrder: int("sortOrder").default(0).notNull(),
  // Relative due date: number of days from onboarding start date (null = no deadline)
  dueDaysOffset: int("dueDaysOffset"),
});
export type OnboardingTemplateTask = typeof onboardingTemplateTasks.$inferSelect;

// ─── Onboarding Instances (per agent) ────────────────────────────────────────
export const onboardingInstances = mysqlTable("onboarding_instances", {
  id: int("id").autoincrement().primaryKey(),
  agentUserId: int("agentUserId").notNull().references(() => users.id),
  templateId: int("templateId").notNull().references(() => onboardingTemplates.id),
  status: mysqlEnum("status", ["in_progress", "completed"]).default("in_progress").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});
export type OnboardingInstance = typeof onboardingInstances.$inferSelect;

export const onboardingInstanceTasks = mysqlTable("onboarding_instance_tasks", {
  id: int("id").autoincrement().primaryKey(),
  instanceId: int("instanceId").notNull(),
  templateTaskId: int("templateTaskId"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  assignee: mysqlEnum("assignee", ["admin", "agent"]).default("admin").notNull(),
  // The specific admin selected by the template, when this is an admin task.
  adminUserId: int("adminUserId").references(() => users.id),
  // The corresponding standard task that appears in the selected admin's task list.
  linkedTaskId: int("linkedTaskId").references(() => tasks.id),
  sortOrder: int("sortOrder").default(0).notNull(),
  completed: boolean("completed").default(false).notNull(),
  completedAt: timestamp("completedAt"),
  completedByUserId: int("completedByUserId").references(() => users.id),
  // Absolute due date computed from instance startedAt + template task dueDaysOffset
  dueDate: timestamp("dueDate"),
}, (table) => ({
  oitInstanceFk: foreignKey({
    name: "oit_instance_fk",
    columns: [table.instanceId],
    foreignColumns: [onboardingInstances.id],
  }).onDelete("cascade"),
  oitTemplateTaskFk: foreignKey({
    name: "oit_template_task_fk",
    columns: [table.templateTaskId],
    foreignColumns: [onboardingTemplateTasks.id],
  }),
}));
export type OnboardingInstanceTask = typeof onboardingInstanceTasks.$inferSelect;

// ─── Leadership 1-on-1 Feedback ──────────────────────────────────────────────
export const leadershipFeedback = mysqlTable("leadership_feedback", {
  id: int("id").autoincrement().primaryKey(),
  agentUserId: int("agentUserId").notNull().references(() => users.id),
  conductedByUserId: int("conductedByUserId").notNull().references(() => users.id),
  meetingDate: timestamp("meetingDate").notNull(),
  summary: text("summary").notNull(),
  strengths: text("strengths"),
  areasForImprovement: text("areasForImprovement"),
  goals: text("goals"),
  followUpDate: timestamp("followUpDate"),
  rating: int("rating"), // 1-5 scale
  isPrivate: boolean("isPrivate").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LeadershipFeedback = typeof leadershipFeedback.$inferSelect;
export type InsertLeadershipFeedback = typeof leadershipFeedback.$inferInsert;

// ─── Commission Exceptions ────────────────────────────────────────────────────
export const commissionExceptions = mysqlTable("commission_exceptions", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: int("transactionId").notNull().references(() => transactions.id),
  requestedByUserId: int("requestedByUserId").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  // Requested split percentages (must sum to ≤100)
  agentSplitPct: decimal("agentSplitPct", { precision: 5, scale: 2 }).notNull(),
  brokerageSplitPct: decimal("brokerageSplitPct", { precision: 5, scale: 2 }).notNull(),
  teamLeaderSplitPct: decimal("teamLeaderSplitPct", { precision: 5, scale: 2 }).default("0").notNull(),
  referralSplitPct: decimal("referralSplitPct", { precision: 5, scale: 2 }).default("0").notNull(),
  // Status
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending | approved | denied
  adminNote: text("adminNote"),
  reviewedByUserId: int("reviewedByUserId").references(() => users.id),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CommissionException = typeof commissionExceptions.$inferSelect;
export type InsertCommissionException = typeof commissionExceptions.$inferInsert;

// ─── User Documents ────────────────────────────────────────────────────────────
export const userDocuments = mysqlTable("user_documents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  uploadedBy: int("uploadedBy").notNull().references(() => users.id),
  label: varchar("label", { length: 255 }).notNull().default("Document"),
  fileUrl: text("file_url").notNull(),
  fileKey: varchar("file_key", { length: 500 }).notNull(),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  fileSize: int("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  category: varchar("category", { length: 100 }).default("Other"),
  // AI-generated, administrator-visible synopsis. The original document remains authoritative.
  aiSummary: text("aiSummary"),
  aiSummaryGeneratedAt: timestamp("aiSummaryGeneratedAt"),
  aiSummaryStatus: varchar("aiSummaryStatus", { length: 32 }).default("not_requested").notNull(),
  aiSummaryError: text("aiSummaryError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type UserDocument = typeof userDocuments.$inferSelect;
export type InsertUserDocument = typeof userDocuments.$inferInsert;

// ─── Roles & Responsibilities ─────────────────────────────────────────────────
// Responsibilities belong directly to an existing administrator. Child records use
// foreign keys so that an individual responsibility can be transferred atomically
// without duplicating its SOPs, resources, scorecard configuration, or values.
export const rolesResponsibilities = mysqlTable("roles_responsibilities", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "restrict" }),
  description: text("description"),
  cadence: mysqlEnum("cadence", ["ongoing", "daily", "weekly", "biweekly", "monthly", "quarterly", "annually", "as_needed", "custom"]).default("ongoing").notNull(),
  cadenceDetails: text("cadenceDetails"),
  status: mysqlEnum("status", ["active", "archived"]).default("active").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdById: int("createdById").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("rr_owner_status_idx").on(table.ownerId, table.status, table.sortOrder),
  index("rr_title_idx").on(table.title),
]);
export type RoleResponsibility = typeof rolesResponsibilities.$inferSelect;
export type InsertRoleResponsibility = typeof rolesResponsibilities.$inferInsert;

export const rrSops = mysqlTable("rr_sops", {
  id: int("id").autoincrement().primaryKey(),
  responsibilityId: int("responsibilityId").notNull().references(() => rolesResponsibilities.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  overview: text("overview"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdById: int("createdById").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("rr_sops_responsibility_idx").on(table.responsibilityId, table.sortOrder)]);
export type RrSop = typeof rrSops.$inferSelect;
export type InsertRrSop = typeof rrSops.$inferInsert;

export const rrSopSteps = mysqlTable("rr_sop_steps", {
  id: int("id").autoincrement().primaryKey(),
  sopId: int("sopId").notNull().references(() => rrSops.id, { onDelete: "cascade" }),
  instruction: text("instruction").notNull(),
  details: text("details"),
  showCheckbox: boolean("showCheckbox").default(true).notNull(),
  resourceLabel: varchar("resourceLabel", { length: 255 }),
  resourceUrl: text("resourceUrl"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("rr_sop_steps_sop_idx").on(table.sopId, table.sortOrder)]);
export type RrSopStep = typeof rrSopSteps.$inferSelect;
export type InsertRrSopStep = typeof rrSopSteps.$inferInsert;

export const rrResources = mysqlTable("rr_resources", {
  id: int("id").autoincrement().primaryKey(),
  responsibilityId: int("responsibilityId").references(() => rolesResponsibilities.id, { onDelete: "cascade" }),
  sopId: int("sopId").references(() => rrSops.id, { onDelete: "cascade" }),
  resourceType: mysqlEnum("resourceType", ["link", "document", "file", "savvy_page", "template", "form", "video"]).default("link").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  url: text("url"),
  userDocumentId: int("userDocumentId").references(() => userDocuments.id, { onDelete: "set null" }),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdById: int("createdById").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("rr_resources_responsibility_idx").on(table.responsibilityId, table.sortOrder),
  index("rr_resources_sop_idx").on(table.sopId, table.sortOrder),
]);
export type RrResource = typeof rrResources.$inferSelect;
export type InsertRrResource = typeof rrResources.$inferInsert;

// Explicit task links preserve the existing Tasks system while allowing only the
// linked open tasks to follow a responsibility during an ownership transfer.
export const rrTaskLinks = mysqlTable("rr_task_links", {
  id: int("id").autoincrement().primaryKey(),
  responsibilityId: int("responsibilityId").notNull().references(() => rolesResponsibilities.id, { onDelete: "cascade" }),
  taskId: int("taskId").notNull().unique().references(() => tasks.id, { onDelete: "cascade" }),
  createdById: int("createdById").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("rr_task_links_responsibility_idx").on(table.responsibilityId)]);
export type RrTaskLink = typeof rrTaskLinks.$inferSelect;
export type InsertRrTaskLink = typeof rrTaskLinks.$inferInsert;

export const rrScorecardMetrics = mysqlTable("rr_scorecard_metrics", {
  id: int("id").autoincrement().primaryKey(),
  responsibilityId: int("responsibilityId").notNull().references(() => rolesResponsibilities.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  metricType: mysqlEnum("metricType", ["manual", "automatic"]).default("manual").notNull(),
  frequency: mysqlEnum("frequency", ["weekly", "monthly", "quarterly", "annually"]).default("monthly").notNull(),
  targetValue: decimal("targetValue", { precision: 16, scale: 4 }),
  performanceDirection: mysqlEnum("performanceDirection", ["higher", "lower"]).default("higher").notNull(),
  displayFormat: mysqlEnum("displayFormat", ["number", "percentage", "currency", "duration"]).default("number").notNull(),
  rollupMethod: mysqlEnum("rollupMethod", ["sum", "average", "count", "percentage", "latest"]).default("sum").notNull(),
  isCumulative: boolean("isCumulative").default(false).notNull(),
  cumulativeReset: mysqlEnum("cumulativeReset", ["monthly", "quarterly", "annually", "never"]),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdById: int("createdById").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("rr_metrics_responsibility_idx").on(table.responsibilityId, table.status),
  index("rr_metrics_name_idx").on(table.name),
]);
export type RrScorecardMetric = typeof rrScorecardMetrics.$inferSelect;
export type InsertRrScorecardMetric = typeof rrScorecardMetrics.$inferInsert;

export const rrMetricValues = mysqlTable("rr_metric_values", {
  id: int("id").autoincrement().primaryKey(),
  metricId: int("metricId").notNull().references(() => rrScorecardMetrics.id, { onDelete: "cascade" }),
  periodStart: date("periodStart", { mode: "string" }).notNull(),
  periodEnd: date("periodEnd", { mode: "string" }).notNull(),
  actualValue: decimal("actualValue", { precision: 18, scale: 4 }).notNull(),
  note: text("note"),
  valueSource: mysqlEnum("valueSource", ["manual", "automatic"]).default("manual").notNull(),
  calculationMetadata: json("calculationMetadata"),
  enteredById: int("enteredById").references(() => users.id, { onDelete: "set null" }),
  enteredAt: timestamp("enteredAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("rr_metric_period_unique").on(table.metricId, table.periodStart, table.periodEnd),
  index("rr_metric_values_period_idx").on(table.metricId, table.periodEnd),
]);
export type RrMetricValue = typeof rrMetricValues.$inferSelect;
export type InsertRrMetricValue = typeof rrMetricValues.$inferInsert;

// The automatic builder only exposes enum-backed SavvyOS sources and validates
// fields in the API; it never stores or executes arbitrary SQL.
export const rrMetricAutoConfigs = mysqlTable("rr_metric_auto_configs", {
  id: int("id").autoincrement().primaryKey(),
  metricId: int("metricId").notNull().unique().references(() => rrScorecardMetrics.id, { onDelete: "cascade" }),
  dataSource: mysqlEnum("dataSource", ["tasks", "transactions", "agent_connections"]).notNull(),
  dateField: varchar("dateField", { length: 64 }).notNull(),
  calculation: mysqlEnum("calculation", ["count", "sum", "average", "percentage", "latest"]).notNull(),
  valueField: varchar("valueField", { length: 64 }),
  filters: json("filters"),
  numeratorFilters: json("numeratorFilters"),
  denominatorFilters: json("denominatorFilters"),
  lastRefreshedAt: timestamp("lastRefreshedAt"),
  lastRecordCount: int("lastRecordCount"),
  lastError: text("lastError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type RrMetricAutoConfig = typeof rrMetricAutoConfigs.$inferSelect;
export type InsertRrMetricAutoConfig = typeof rrMetricAutoConfigs.$inferInsert;

// ─── User Core Profile (all roles) ───────────────────────────────────────────"
export const userProfiles = mysqlTable("user_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  // Identity
  preferredName: varchar("preferredName", { length: 128 }),
  profilePhotoUrl: text("profilePhotoUrl"),
  dateOfBirth: timestamp("dateOfBirth"),
  personalEmail: varchar("personalEmail", { length: 320 }),
  // Rich HTML signature appended to outbound Pipeline email after the sender's message.
  emailSignatureHtml: text("emailSignatureHtml"),
  // An administrator-generated summary of the user’s recent SavvyOS performance and activity.
  coachingSummary: text("coachingSummary"),
  coachingSummaryGeneratedAt: timestamp("coachingSummaryGeneratedAt"),
  primaryPhone: varchar("primaryPhone", { length: 32 }),
  secondaryPhone: varchar("secondaryPhone", { length: 32 }),
  timeZone: varchar("timeZone", { length: 64 }),
  // Address
  addressLine1: varchar("addressLine1", { length: 255 }),
  addressLine2: varchar("addressLine2", { length: 255 }),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  zip: varchar("zip", { length: 16 }),
  country: varchar("country", { length: 64 }).default("US"),
  // Personal / HR
  spouseName: varchar("spouseName", { length: 255 }),
  childrenNotes: text("childrenNotes"),
  emergencyContactName: varchar("emergencyContactName", { length: 255 }),
  emergencyContactPhone: varchar("emergencyContactPhone", { length: 32 }),
  emergencyContactRelationship: varchar("emergencyContactRelationship", { length: 128 }),
  hobbies: text("hobbies"),
  giftNotes: text("giftNotes"),
  shirtSize: varchar("shirtSize", { length: 16 }),
  personalNotes: text("personalNotes"),
  // Company Lifecycle
  employmentStatus: mysqlEnum("employmentStatus", ["active", "inactive", "on_leave", "offboarded"]).default("active"),
  onboardedDate: timestamp("onboardedDate"),
  offboardedDate: timestamp("offboardedDate"),
  referredBy: varchar("referredBy", { length: 255 }),
  workAnniversaryDate: timestamp("workAnniversaryDate"),
  internalNotes: text("internalNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

// ─── Agent Extended Profile ───────────────────────────────────────────────────
export const agentProfiles = mysqlTable("agent_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  // Licensing / Brokerage
  licenseNumber: varchar("licenseNumber", { length: 64 }),
  licenseState: varchar("licenseState", { length: 32 }),
  additionalLicenseStates: text("additionalLicenseStates"), // comma-separated
  licenseExpirationDate: timestamp("licenseExpirationDate"),
  brokerageAffiliation: varchar("brokerageAffiliation", { length: 255 }),
  brokerFullName: varchar("brokerFullName", { length: 255 }),
  brokerEmail: varchar("brokerEmail", { length: 255 }),
  brokerOfficeNumber: varchar("brokerOfficeNumber", { length: 64 }),
  // Marketing / Public Presence
  bio: text("bio"),
  instagramUrl: varchar("instagramUrl", { length: 512 }),
  facebookUrl: varchar("facebookUrl", { length: 512 }),
  linkedinUrl: varchar("linkedinUrl", { length: 512 }),
  youtubeUrl: varchar("youtubeUrl", { length: 512 }),
  tiktokUrl: varchar("tiktokUrl", { length: 512 }),
  personalWebsiteUrl: varchar("personalWebsiteUrl", { length: 512 }),
  googleBusinessUrl: varchar("googleBusinessUrl", { length: 512 }),
  // Agent-Specific Operations
  agentStatus: mysqlEnum("agentStatus", ["active", "paused", "recruiting", "offboarded"]).default("active"),
  startDateWithSavvy: timestamp("startDateWithSavvy"),
  endDateWithSavvy: timestamp("endDateWithSavvy"),
  boardAssociation: varchar("boardAssociation", { length: 255 }),
  mlsId: varchar("mlsId", { length: 64 }),
  narId: varchar("narId", { length: 64 }),
  showingServiceLoginNotes: text("showingServiceLoginNotes"),
  transactionCoordinatorAssigned: varchar("transactionCoordinatorAssigned", { length: 255 }),
  assistantAssigned: varchar("assistantAssigned", { length: 255 }),
  personalBrandNotes: text("personalBrandNotes"),
  specialInternalNotes: text("specialInternalNotes"),
  birthdayRecognitionOptIn: boolean("birthdayRecognitionOptIn").default(true),
  anniversaryRecognitionOptIn: boolean("anniversaryRecognitionOptIn").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AgentProfile = typeof agentProfiles.$inferSelect;
export type InsertAgentProfile = typeof agentProfiles.$inferInsert;

// ─── ISA Extended Profile ─────────────────────────────────────────────────────
export const isaProfiles = mysqlTable("isa_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  isaStatus: mysqlEnum("isaStatus", ["active", "inactive", "on_leave", "offboarded"]).default("active"),
  startDateWithSavvy: timestamp("startDateWithSavvy"),
  endDateWithSavvy: timestamp("endDateWithSavvy"),
  managerId: int("managerId").references(() => users.id),
  dialerUserId: varchar("dialerUserId", { length: 128 }),
  crmUserId: varchar("crmUserId", { length: 128 }),
  slackHandle: varchar("slackHandle", { length: 128 }),
  callRecordingLink: text("callRecordingLink"),
  trainingStartDate: timestamp("trainingStartDate"),
  trainingCompletionDate: timestamp("trainingCompletionDate"),
  currentTrainingStatus: varchar("currentTrainingStatus", { length: 128 }),
  scriptVersionAssigned: varchar("scriptVersionAssigned", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type IsaProfile = typeof isaProfiles.$inferSelect;
export type InsertIsaProfile = typeof isaProfiles.$inferInsert;

// ─── Admin Extended Profile ───────────────────────────────────────────────────
export const adminProfiles = mysqlTable("admin_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  adminStatus: mysqlEnum("adminStatus", ["active", "inactive", "on_leave", "offboarded"]).default("active"),
  startDateWithSavvy: timestamp("startDateWithSavvy"),
  endDateWithSavvy: timestamp("endDateWithSavvy"),
  managerId: int("managerId").references(() => users.id),
  slackHandle: varchar("slackHandle", { length: 128 }),
  adminType: mysqlEnum("adminType", ["executive", "operations", "marketing", "expansion", "finance", "other"]),
  primaryResponsibilityNotes: text("primaryResponsibilityNotes"),
  backupResponsibilityNotes: text("backupResponsibilityNotes"),
  sopOwnerNotes: text("sopOwnerNotes"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AdminProfile = typeof adminProfiles.$inferSelect;
export type InsertAdminProfile = typeof adminProfiles.$inferInsert;

// ─── Agent Goals ──────────────────────────────────────────────────────────────
export const agentGoals = mysqlTable("agent_goals", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull().references(() => users.id),
  year: int("year").notNull(),
  month: int("month").notNull(), // 1-12; 0 = annual goal
  gciTarget: decimal("gciTarget", { precision: 15, scale: 2 }),
  closingsTarget: int("closingsTarget"),
  volumeTarget: decimal("volumeTarget", { precision: 15, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // One goal row per agent/year/month. This unique key is what makes
  // upsertAgentGoal's onDuplicateKeyUpdate actually update instead of
  // inserting a duplicate (the missing key is why saved goals didn't stick).
  agentYearMonthUnq: uniqueIndex("agent_goals_agent_year_month_unq").on(table.agentId, table.year, table.month),
}));
export type AgentGoal = typeof agentGoals.$inferSelect;
export type InsertAgentGoal = typeof agentGoals.$inferInsert;

// ─── Market Match Call ────────────────────────────────────────────────────────

export const marketProfiles = mysqlTable("market_profiles", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  state: varchar("state", { length: 50 }).notNull(),
  region: varchar("region", { length: 50 }),
  status: mysqlEnum("status", ["active", "recruiting", "paused", "future"]).default("active").notNull(),
  idealInvestorProfile: text("idealInvestorProfile"),
  notGoodFor: text("notGoodFor"),
  budgetMin: decimal("budgetMin", { precision: 15, scale: 2 }),
  budgetMax: decimal("budgetMax", { precision: 15, scale: 2 }),
  commonPropertyTypes: varchar("commonPropertyTypes", { length: 255 }),
  commonBedroomRanges: varchar("commonBedroomRanges", { length: 100 }),
  commonAmenities: text("commonAmenities"),
  cashFlowProfile: mysqlEnum("cashFlowProfile", ["low", "medium", "high", "very_high"]).default("medium"),
  appreciationProfile: mysqlEnum("appreciationProfile", ["low", "medium", "high", "very_high"]).default("medium"),
  regulationRisk: mysqlEnum("regulationRisk", ["low", "medium", "high"]).default("medium"),
  managementDifficulty: mysqlEnum("managementDifficulty", ["low", "medium", "high"]).default("medium"),
  seasonalityProfile: mysqlEnum("seasonalityProfile", ["year_round", "seasonal", "highly_seasonal"]).default("year_round"),
  personalUseAttractiveness: mysqlEnum("personalUseAttractiveness", ["low", "medium", "high"]).default("medium"),
  remoteOwnershipFriendly: boolean("remoteOwnershipFriendly").default(true),
  vibeTag: varchar("vibeTag", { length: 100 }),
  talkingPoints: text("talkingPoints"),
  commonObjections: text("commonObjections"),
  sampleBuyerScenarios: text("sampleBuyerScenarios"),
  regulationNotes: text("regulationNotes"),
  internalNotes: text("internalNotes"),
  scoringWeightCashFlow: int("scoringWeightCashFlow").default(20),
  scoringWeightAppreciation: int("scoringWeightAppreciation").default(15),
  scoringWeightRegulation: int("scoringWeightRegulation").default(15),
  scoringWeightManagement: int("scoringWeightManagement").default(10),
  scoringWeightPersonalUse: int("scoringWeightPersonalUse").default(10),
  scoringWeightBudget: int("scoringWeightBudget").default(20),
  scoringWeightVibe: int("scoringWeightVibe").default(10),
  annualGciGoal: decimal("annualGciGoal", { precision: 15, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MarketProfile = typeof marketProfiles.$inferSelect;
export type InsertMarketProfile = typeof marketProfiles.$inferInsert;

export const marketAgentAssignments = mysqlTable("market_agent_assignments", {
  id: int("id").autoincrement().primaryKey(),
  marketProfileId: int("marketProfileId").notNull().references(() => marketProfiles.id),
  agentId: int("agentId").notNull().references(() => users.id),
  isPrimary: boolean("isPrimary").default(false),
  budgetSpecialization: varchar("budgetSpecialization", { length: 100 }),
  maxLeadCapacity: int("maxLeadCapacity").default(20),
  currentLeadCount: int("currentLeadCount").default(0),
  isAvailable: boolean("isAvailable").default(true),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MarketAgentAssignment = typeof marketAgentAssignments.$inferSelect;

export const marketCaseStudies = mysqlTable("market_case_studies", {
  id: int("id").autoincrement().primaryKey(),
  marketProfileId: int("marketProfileId").notNull().references(() => marketProfiles.id),
  title: varchar("title", { length: 255 }).notNull(),
  propertyType: varchar("propertyType", { length: 100 }),
  bedrooms: int("bedrooms"),
  purchasePrice: decimal("purchasePrice", { precision: 15, scale: 2 }),
  annualRevenue: decimal("annualRevenue", { precision: 15, scale: 2 }),
  cashOnCashReturn: decimal("cashOnCashReturn", { precision: 5, scale: 2 }),
  description: text("description"),
  keyAmenities: text("keyAmenities"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MarketCaseStudy = typeof marketCaseStudies.$inferSelect;

export const marketMatchSessions = mysqlTable("market_match_sessions", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull().references(() => contacts.id),
  isaId: int("isaId").notNull().references(() => users.id),
  status: mysqlEnum("status", ["active", "completed", "abandoned"]).default("active").notNull(),
  callNotes: text("callNotes"),
  investorProfile: json("investorProfile"),
  aiInferences: json("aiInferences"),
  topMarketRecommendations: json("topMarketRecommendations"),
  recommendedAgentId: int("recommendedAgentId").references(() => users.id),
  overallConfidenceScore: int("overallConfidenceScore"),
  callSummary: text("callSummary"),
  followUpEmailDraft: text("followUpEmailDraft"),
  handoffNotes: text("handoffNotes"),
  nextActionRecommendation: text("nextActionRecommendation"),
  crmWritebackCompleted: boolean("crmWritebackCompleted").default(false),
  contactStatusSuggestion: varchar("contactStatusSuggestion", { length: 50 }),
  tagsApplied: varchar("tagsApplied", { length: 500 }),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  durationSeconds: int("durationSeconds"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MarketMatchSession = typeof marketMatchSessions.$inferSelect;
export type InsertMarketMatchSession = typeof marketMatchSessions.$inferInsert;


// ─── Marketing Requests ───────────────────────────────────────────────────────
export const marketingRequests = mysqlTable("marketing_requests", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").references(() => users.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  requestType: mysqlEnum("requestType", [
    "graphic",
    "image",
    "slideshow",
    "video",
    "flyer",
    "social_post",
    "other",
  ])
    .default("graphic")
    .notNull(),
  status: mysqlEnum("status", ["new", "in_progress", "completed", "cancelled"])
    .default("new")
    .notNull(),
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"])
    .default("normal")
    .notNull(),
  dueDate: timestamp("dueDate"),
  // Marketing team response
  responseNote: text("responseNote"),
  responseFileUrl: text("responseFileUrl"),
  responseFileKey: varchar("responseFileKey", { length: 512 }),
  responseFileName: varchar("responseFileName", { length: 255 }),
  respondedById: int("respondedById").references(() => users.id, { onDelete: "set null" }),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MarketingRequest = typeof marketingRequests.$inferSelect;
export type InsertMarketingRequest = typeof marketingRequests.$inferInsert;

// Agent-uploaded attachments on a request
export const marketingRequestAttachments = mysqlTable(
  "marketing_request_attachments",
  {
    id: int("id").autoincrement().primaryKey(),
    requestId: int("requestId")
      .notNull()
      .references(() => marketingRequests.id, { onDelete: "cascade" }),
    fileUrl: text("fileUrl").notNull(),
    fileKey: varchar("fileKey", { length: 512 }).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 128 }),
    uploadedById: int("uploadedById").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  }
);
export type MarketingRequestAttachment =
  typeof marketingRequestAttachments.$inferSelect;
export type InsertMarketingRequestAttachment =
  typeof marketingRequestAttachments.$inferInsert;

// ─── Tech Requests ────────────────────────────────────────────────────────────
// Internal requests submitted by SavvyOS users and tracked by the technology team.
export const techRequests = mysqlTable(
  "tech_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    requesterId: int("requesterId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assigneeId: int("assigneeId").references(() => users.id, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"])
      .default("medium")
      .notNull(),
    status: mysqlEnum("status", ["new", "in_progress", "completed", "cancelled"])
      .default("new")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("tech_requests_status_idx").on(table.status),
    index("tech_requests_requester_idx").on(table.requesterId),
    index("tech_requests_assignee_idx").on(table.assigneeId),
  ]
);
export type TechRequest = typeof techRequests.$inferSelect;
export type InsertTechRequest = typeof techRequests.$inferInsert;

// ─── Email Templates ──────────────────────────────────────────────────────────
// Stores admin-editable overrides for transactional email subjects and body text.
// When a row exists for a given emailType, it overrides the hardcoded template.
export const emailTemplates = mysqlTable("email_templates", {
  id: int("id").autoincrement().primaryKey(),
  emailType: varchar("emailType", { length: 64 }).notNull().unique(),
  subject: varchar("subject", { length: 512 }).notNull(),
  // Plain-text body that replaces the bodyText paragraph in the HTML template.
  // Supports simple markdown-style **bold** which is rendered to <strong>.
  bodyText: text("bodyText").notNull(),
  updatedById: int("updatedById").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = typeof emailTemplates.$inferInsert;

// ─── Custom Email Notifications ───────────────────────────────────────────────
// Stores the admin-defined notification metadata and email copy created through
// the Email Notifications builder. Delivery wiring can reference notificationKey.
export const customEmailNotifications = mysqlTable("custom_email_notifications", {
  id: int("id").autoincrement().primaryKey(),
  notificationKey: varchar("notificationKey", { length: 128 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  trigger: varchar("trigger", { length: 255 }).notNull(),
  triggerType: varchar("triggerType", { length: 20 }).notNull(),
  recipient: varchar("recipient", { length: 64 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  subject: varchar("subject", { length: 512 }).notNull(),
  bodyText: text("bodyText").notNull(),
  isEnabled: boolean("isEnabled").notNull().default(true),
  createdById: int("createdById").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CustomEmailNotification = typeof customEmailNotifications.$inferSelect;
export type InsertCustomEmailNotification = typeof customEmailNotifications.$inferInsert;

// ─── Pipeline Outreach Email ──────────────────────────────────────────────────

// These templates are separate from the transactional email template overrides
// above. Pipeline templates contain complete WYSIWYG HTML and are owned by the
// user who created them. Admins may share a template with any combination of
// admin, agent, and ISA roles; agents and ISAs can only retain personal templates.
export const pipelineEmailTemplates = mysqlTable(
  "pipeline_email_templates",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    subject: varchar("subject", { length: 512 }).notNull(),
    htmlBody: text("htmlBody").notNull(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    // Comma-separated audience roles. Empty means personal to owner; non-empty
    // rows are only allowed when the owner is an admin.
    visibleToRoles: varchar("visibleToRoles", { length: 64 }).notNull().default(""),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("pipeline_email_templates_owner_idx").on(table.ownerId),
    index("pipeline_email_templates_roles_idx").on(table.visibleToRoles),
  ],
);
export type PipelineEmailTemplate = typeof pipelineEmailTemplates.$inferSelect;
export type InsertPipelineEmailTemplate = typeof pipelineEmailTemplates.$inferInsert;

// One row per logged-in user and Eastern-calendar day. attemptedCount is reserved
// before calling Resend, so concurrent requests cannot exceed the 250-per-day
// sender cap even if an individual provider request later fails.
export const pipelineEmailDailyQuotas = mysqlTable(
  "pipeline_email_daily_quotas",
  {
    id: int("id").autoincrement().primaryKey(),
    senderUserId: int("senderUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
    sendDate: varchar("sendDate", { length: 10 }).notNull(), // YYYY-MM-DD, America/New_York
    attemptedCount: int("attemptedCount").notNull().default(0),
    deliveredCount: int("deliveredCount").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("pipeline_email_daily_quota_user_day_unique").on(table.senderUserId, table.sendDate),
  ],
);
export type PipelineEmailDailyQuota = typeof pipelineEmailDailyQuotas.$inferSelect;

// A batch represents either a single Pipeline email or a mass-email action.
// It makes the operation traceable without storing provider credentials or raw
// request metadata in the activity log.
export const pipelineEmailBatches = mysqlTable(
  "pipeline_email_batches",
  {
    id: int("id").autoincrement().primaryKey(),
    senderUserId: int("senderUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    templateId: int("templateId").references(() => pipelineEmailTemplates.id, { onDelete: "set null" }),
    subject: varchar("subject", { length: 512 }).notNull(),
    recipientCount: int("recipientCount").notNull(),
    deliveredCount: int("deliveredCount").notNull().default(0),
    failedCount: int("failedCount").notNull().default(0),
    status: mysqlEnum("status", ["sending", "completed", "partial", "failed"]).notNull().default("sending"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  (table) => [
    index("pipeline_email_batches_sender_created_idx").on(table.senderUserId, table.createdAt),
  ],
);
export type PipelineEmailBatch = typeof pipelineEmailBatches.$inferSelect;

// Per-recipient delivery outcomes provide a contact-level audit trail and link
// to the pre-existing communications record created for every successful send.
export const pipelineEmailSends = mysqlTable(
  "pipeline_email_sends",
  {
    id: int("id").autoincrement().primaryKey(),
    batchId: int("batchId").notNull().references(() => pipelineEmailBatches.id, { onDelete: "cascade" }),
    senderUserId: int("senderUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    contactId: int("contactId").notNull().references(() => contacts.id, { onDelete: "restrict" }),
    agentConnectionId: int("agentConnectionId").notNull().references(() => agentConnections.id, { onDelete: "restrict" }),
    recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),
    status: mysqlEnum("status", ["sending", "sent", "failed"]).notNull().default("sending"),
    resendMessageId: varchar("resendMessageId", { length: 255 }),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    sentAt: timestamp("sentAt"),
  },
  (table) => [
    index("pipeline_email_sends_batch_idx").on(table.batchId),
    index("pipeline_email_sends_contact_idx").on(table.contactId, table.createdAt),
  ],
);
export type PipelineEmailSend = typeof pipelineEmailSends.$inferSelect;

// ─── Connection Requests ──────────────────────────────────────────────────────
// When an agent tries to add a contact that already exists, they submit a
// connection request instead. ISAs/admins can approve or deny it.
export const connectionRequests = mysqlTable("connection_requests", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: int("contactId").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  requestedPipelineStatus: varchar("requestedPipelineStatus", { length: 64 }).notNull().default("new_lead"),
  status: varchar("status", { length: 32 }).notNull().default("pending"), // pending | approved | denied
  reviewedById: int("reviewedById").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ConnectionRequest = typeof connectionRequests.$inferSelect;
export type InsertConnectionRequest = typeof connectionRequests.$inferInsert;

// ─── Project Management (Tyler's Projects) ────────────────────────────────────
export const pmProjects = mysqlTable("pm_projects", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description").notNull(),
  department: varchar("department", { length: 128 }).notNull(),
  ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "restrict" }),
  dueDate: timestamp("dueDate"),
  isOngoing: boolean("isOngoing").notNull().default(false),
  priority: varchar("priority", { length: 16 }).notNull().default("medium"), // high | medium | low
  status: varchar("status", { length: 32 }).notNull().default("not_started"), // not_started | in_progress | at_risk | completed
  sortOrder: int("sortOrder").notNull().default(0),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PmProject = typeof pmProjects.$inferSelect;
export type InsertPmProject = typeof pmProjects.$inferInsert;

export const pmProjectCollaborators = mysqlTable("pm_project_collaborators", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => pmProjects.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("pm_project_collaborators_project_user_unique").on(table.projectId, table.userId),
]);

export const pmTasks = mysqlTable("pm_tasks", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => pmProjects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "restrict" }),
  dueDate: timestamp("dueDate").notNull(),
  priority: varchar("priority", { length: 16 }).notNull().default("medium"), // high | medium | low
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completedAt"),
  notes: text("notes"),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PmTask = typeof pmTasks.$inferSelect;
export type InsertPmTask = typeof pmTasks.$inferInsert;

export const pmTaskComments = mysqlTable("pm_task_comments", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull().references(() => pmTasks.id, { onDelete: "cascade" }),
  authorId: int("authorId").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PmTaskComment = typeof pmTaskComments.$inferSelect;

export const pmWeeklyUpdates = mysqlTable("pm_weekly_updates", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => pmProjects.id, { onDelete: "cascade" }),
  authorId: int("authorId").notNull().references(() => users.id, { onDelete: "restrict" }),
  updateStatus: varchar("updateStatus", { length: 32 }).notNull(), // on_track | at_risk | off_track
  progressPct: int("progressPct").notNull().default(0),
  keyUpdates: text("keyUpdates").notNull(),
  blockers: text("blockers"),
  nextSteps: text("nextSteps"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PmWeeklyUpdate = typeof pmWeeklyUpdates.$inferSelect;
export type InsertPmWeeklyUpdate = typeof pmWeeklyUpdates.$inferInsert;

// ─── PM Departments ──────────────────────────────────────────────────────────
export const pmDepartments = mysqlTable("pm_departments", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PmDepartment = typeof pmDepartments.$inferSelect;

// ─── PM Project Notes (project-level, with @mentions) ─────────────────────────
export const pmProjectNotes = mysqlTable("pm_project_notes", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => pmProjects.id, { onDelete: "cascade" }),
  authorId: int("authorId").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PmProjectNote = typeof pmProjectNotes.$inferSelect;

// ─── PM Note Mentions ─────────────────────────────────────────────────────────
export const pmNoteMentions = mysqlTable("pm_note_mentions", {
  id: int("id").autoincrement().primaryKey(),
  noteId: int("noteId").notNull().references(() => pmProjectNotes.id, { onDelete: "cascade" }),
  mentionedUserId: int("mentionedUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
});

// ─── PM Note Reads (unread tracking for project notes) ────────────────────────
export const pmNoteReads = mysqlTable("pm_note_reads", {
  id: int("id").autoincrement().primaryKey(),
  noteId: int("noteId").notNull().references(() => pmProjectNotes.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  readAt: timestamp("readAt").defaultNow().notNull(),
  markedUnread: boolean("markedUnread").notNull().default(false),
});

// ─── PM Task Comment Reads (unread tracking for task comments) ────────────────
export const pmTaskCommentReads = mysqlTable("pm_task_comment_reads", {
  id: int("id").autoincrement().primaryKey(),
  commentId: int("commentId").notNull().references(() => pmTaskComments.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  readAt: timestamp("readAt").defaultNow().notNull(),
  markedUnread: boolean("markedUnread").notNull().default(false),
});

export const pmProjectActivity = mysqlTable("pm_project_activity", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => pmProjects.id, { onDelete: "cascade" }),
  taskId: int("taskId").references(() => pmTasks.id, { onDelete: "set null" }),
  actorId: int("actorId").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 128 }).notNull(),
  detail: text("detail"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PmProjectActivity = typeof pmProjectActivity.$inferSelect;

// ─── Agent Support Assignments ───────────────────────────────────────────────
// Maps an agent_support user to one or more agents they can work on behalf of
export const agentSupportAssignments = mysqlTable("agent_support_assignments", {
  id: int("id").autoincrement().primaryKey(),
  agentSupportUserId: int("agentSupportUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  agentId: int("agentId").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AgentSupportAssignment = typeof agentSupportAssignments.$inferSelect;
export type InsertAgentSupportAssignment = typeof agentSupportAssignments.$inferInsert;

// ─── Knowledge Base ───────────────────────────────────────────────────────────
export const kbCategories = mysqlTable("kb_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["sop", "reference", "training"]).notNull().default("reference"),
  description: text("description"),
  sortOrder: int("sortOrder").notNull().default(0),
  visibleToRoles: varchar("visibleToRoles", { length: 64 }).notNull().default("admin,agent,isa"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type KbCategory = typeof kbCategories.$inferSelect;

export const kbArticles = mysqlTable("kb_articles", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("categoryId").notNull().references(() => kbCategories.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 512 }).notNull(),
  content: text("content").notNull().default(""),
  // comma-separated roles that can view: "admin", "agent", "isa" — "admin" always can view
  visibleToRoles: varchar("visibleToRoles", { length: 64 }).notNull().default("admin"),
  status: mysqlEnum("status", ["draft", "published"]).notNull().default("draft"),
  createdById: int("createdById").references(() => users.id, { onDelete: "set null" }),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type KbArticle = typeof kbArticles.$inferSelect;

// ─── Duplicate Contact Pairs ──────────────────────────────────────────────────
// Stores identified duplicate pairs for admin review and merge
export const duplicateContactPairs = mysqlTable("duplicate_contact_pairs", {
  id: int("id").autoincrement().primaryKey(),
  contactAId: int("contactAId").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  contactBId: int("contactBId").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  // How the duplicate was detected
  matchType: mysqlEnum("matchType", ["email", "phone", "name_address", "fuzzy_name", "manual"]).notNull(),
  // Confidence 0-100
  confidence: int("confidence").notNull().default(100),
  // Admin review status
  status: mysqlEnum("status", ["pending", "merged", "dismissed"]).notNull().default("pending"),
  // Which contact was kept after merge (null until merged)
  keptContactId: int("keptContactId").references(() => contacts.id, { onDelete: "set null" }),
  reviewedById: int("reviewedById").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DuplicateContactPair = typeof duplicateContactPairs.$inferSelect;
export type InsertDuplicateContactPair = typeof duplicateContactPairs.$inferInsert;

// ─── Webhook Endpoints ────────────────────────────────────────────────────────
// Admin-managed inbound webhook endpoints. Each endpoint has a unique slug,
// an optional HMAC secret for signature verification, and a handler type that
// determines how the payload is processed.
export const webhookEndpoints = mysqlTable("webhook_endpoints", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  // URL-safe slug used in the endpoint path: /api/inbound/:slug
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  // Handler type — determines which processor handles the payload
  handlerType: mysqlEnum("handlerType", [
    "contact_create",   // Create/update a contact from payload
    "contact_update",   // Update an existing contact
    "lead_ingest",      // Create contact + assign lead source
    "property_view",    // Log a property.viewed activity on an existing contact
    "custom",           // No-op handler — just logs the payload
  ]).notNull().default("lead_ingest"),
  // Secret for HMAC-SHA256 signature verification (optional; if null, any request is accepted)
  secret: varchar("secret", { length: 512 }),
  // Header name that carries the signature (e.g. "x-hub-signature-256")
  signatureHeader: varchar("signatureHeader", { length: 128 }).default("x-savvy-signature"),
  // Default lead source to assign when not specified in payload
  defaultLeadSourceId: int("defaultLeadSourceId").references(() => leadSources.id, { onDelete: "set null" }),
  // Default agent to assign when not specified in payload
  defaultAgentId: int("defaultAgentId").references(() => users.id, { onDelete: "set null" }),
  isActive: boolean("isActive").default(true).notNull(),
  createdById: int("createdById").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type InsertWebhookEndpoint = typeof webhookEndpoints.$inferInsert;

// ─── Webhook Logs ─────────────────────────────────────────────────────────────
// Immutable log of every inbound webhook attempt. Retained for 90 days.
export const webhookLogs = mysqlTable("webhook_logs", {
  id: int("id").autoincrement().primaryKey(),
  endpointId: int("endpointId").references(() => webhookEndpoints.id, { onDelete: "set null" }),
  // Slug at time of request (preserved even if endpoint is deleted)
  slug: varchar("slug", { length: 128 }).notNull(),
  // HTTP status code returned to the caller
  statusCode: int("statusCode").notNull(),
  // success | auth_failed | validation_error | handler_error | not_found
  outcome: mysqlEnum("outcome", [
    "success",
    "auth_failed",
    "validation_error",
    "handler_error",
    "not_found",
  ]).notNull(),
  // Sanitised request payload (PII may be present — access restricted to admin)
  requestPayload: json("requestPayload"),
  // Response body sent back to caller
  responseBody: json("responseBody"),
  // Human-readable error message (null on success)
  errorMessage: text("errorMessage"),
  // ID of the contact created/updated by this request (null if not applicable)
  contactId: int("contactId").references(() => contacts.id, { onDelete: "set null" }),
  // Source IP
  sourceIp: varchar("sourceIp", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WebhookLog = typeof webhookLogs.$inferSelect;
export type InsertWebhookLog = typeof webhookLogs.$inferInsert;

// ─── Email Notification Settings ────────────────────────────────────────────
// One row per notification type; admins can toggle each on/off.
export const emailNotificationSettings = mysqlTable("email_notification_settings", {
  id: int("id").autoincrement().primaryKey(),
  notificationKey: varchar("notificationKey", { length: 128 }).notNull().unique(),
  isEnabled: boolean("isEnabled").notNull().default(true),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  updatedBy: int("updatedBy").references(() => users.id, { onDelete: "set null" }),
});
export type EmailNotificationSetting = typeof emailNotificationSettings.$inferSelect;

// ─── Scheduled Report Runs ────────────────────────────────────────────────────
// A unique report/date record prevents duplicate delivery across process restarts
// and provides an auditable delivery outcome for scheduled reports.
export const scheduledReportRuns = mysqlTable(
  "scheduled_report_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    reportKey: varchar("reportKey", { length: 64 }).notNull(),
    reportDate: varchar("reportDate", { length: 10 }).notNull(), // YYYY-MM-DD in the report timezone
    status: mysqlEnum("status", ["running", "sent", "partial", "failed", "skipped"]).notNull().default("running"),
    recipientCount: int("recipientCount").notNull().default(0),
    successfulRecipientCount: int("successfulRecipientCount").notNull().default(0),
    errorMessage: text("errorMessage"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  (table) => [
    uniqueIndex("scheduled_report_runs_key_date_unique").on(table.reportKey, table.reportDate),
    index("scheduled_report_runs_status_idx").on(table.status),
  ],
);
export type ScheduledReportRun = typeof scheduledReportRuns.$inferSelect;
export type InsertScheduledReportRun = typeof scheduledReportRuns.$inferInsert;

// ─── Daily Agent Reports ─────────────────────────────────────────────────────
// A personalized daily snapshot is retained for the in-app report view after the
// scheduled email has been delivered. One report per agent per Eastern calendar day.
export const dailyAgentReports = mysqlTable(
  "daily_agent_reports",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull().references(() => users.id, { onDelete: "cascade" }),
    reportDate: varchar("reportDate", { length: 10 }).notNull(), // YYYY-MM-DD in America/New_York
    snapshot: json("snapshot").$type<Record<string, unknown>>().notNull(),
    aiSuggestions: json("aiSuggestions").$type<Array<Record<string, unknown>>>().notNull(),
    aiModel: varchar("aiModel", { length: 128 }),
    generatedAt: timestamp("generatedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("daily_agent_reports_agent_date_unique").on(table.agentId, table.reportDate),
    index("daily_agent_reports_date_idx").on(table.reportDate),
  ],
);
export type DailyAgentReport = typeof dailyAgentReports.$inferSelect;
export type InsertDailyAgentReport = typeof dailyAgentReports.$inferInsert;

// ─── SavvyOS Feature Updates ─────────────────────────────────────────────────
// Admin-managed, agent-facing release notes. The daily report only includes
// published updates, keeping operational emails free from draft work.
export const savvyosFeatureUpdates = mysqlTable("savvyos_feature_updates", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  summary: text("summary").notNull(),
  details: text("details"),
  actionUrl: varchar("actionUrl", { length: 512 }),
  isAgentFacing: boolean("isAgentFacing").notNull().default(true),
  isPublished: boolean("isPublished").notNull().default(false),
  publishedAt: timestamp("publishedAt"),
  createdById: int("createdById").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("savvyos_feature_updates_published_idx").on(table.isPublished, table.isAgentFacing, table.publishedAt),
]);
export type SavvyosFeatureUpdate = typeof savvyosFeatureUpdates.$inferSelect;
export type InsertSavvyosFeatureUpdate = typeof savvyosFeatureUpdates.$inferInsert;

// ─── Admin Command Center Settings & Alert State ──────────────────────────────
// Calendar-year company targets and configurable operational thresholds. These
// are separate from agent goals so company pacing is never inferred from partial
// agent-level configuration.
export const dashboardSettings = mysqlTable("dashboard_settings", {
  id: int("id").autoincrement().primaryKey(),
  goalYear: int("goalYear").notNull(),
  companyGciGoal: decimal("companyGciGoal", { precision: 15, scale: 2 }),
  companyVolumeGoal: decimal("companyVolumeGoal", { precision: 15, scale: 2 }),
  companyUnitsGoal: int("companyUnitsGoal"),
  newLeadSlaHours: int("newLeadSlaHours").notNull().default(24),
  pipelineStaleDays: int("pipelineStaleDays").notNull().default(14),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  goalYearUnq: uniqueIndex("dashboard_settings_goal_year_unq").on(table.goalYear),
}));
export type DashboardSettings = typeof dashboardSettings.$inferSelect;
export type InsertDashboardSettings = typeof dashboardSettings.$inferInsert;

// Each alert is a deterministic query result. Review state is per administrator,
// so acknowledging a queue item never conceals the underlying exception from
// other authorized admins.
export const dashboardAlertReviews = mysqlTable("dashboard_alert_reviews", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  alertKey: varchar("alertKey", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["reviewed", "snoozed"]).notNull(),
  snoozedUntil: timestamp("snoozedUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userAlertUnq: uniqueIndex("dashboard_alert_reviews_user_alert_unq").on(table.userId, table.alertKey),
  userStatusIdx: index("dashboard_alert_reviews_user_status_idx").on(table.userId, table.status, table.snoozedUntil),
}));
export type DashboardAlertReview = typeof dashboardAlertReviews.$inferSelect;
export type InsertDashboardAlertReview = typeof dashboardAlertReviews.$inferInsert;

// ─── Analytics Insight Cache ─────────────────────────────────────────────────

// Durable cache for evidence-grounded Analytics & Reporting explanations. The
// cache is scoped to the viewer and filters so agents never receive an admin's
// company-wide insight payload, and expires after a weekly refresh window.
export const analyticsInsightCaches = mysqlTable("analytics_insight_caches", {
  id: int("id").autoincrement().primaryKey(),
  // The deterministic v1 scope key is under 255 characters; keeping the indexed
  // column at 255 avoids utf8mb4 unique-index length limits on MySQL.
  scopeKey: varchar("scopeKey", { length: 255 }).notNull().unique(),
  ownerUserId: int("ownerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  viewerRole: mysqlEnum("viewerRole", ["admin", "agent", "isa", "agent_support"]).notNull(),
  filters: json("filters").$type<Record<string, unknown>>().notNull(),
  insightPayload: json("insightPayload").$type<Record<string, unknown>>().notNull(),
  facts: json("facts").$type<Record<string, unknown>>().notNull(),
  status: mysqlEnum("status", ["refreshing", "ready", "failed"]).notNull().default("refreshing"),
  refreshReason: mysqlEnum("refreshReason", ["automatic", "manual", "scheduled"]).notNull().default("automatic"),
  model: varchar("model", { length: 128 }),
  errorMessage: text("errorMessage"),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  expiresAtIdx: index("analytics_insight_caches_expiresAt_idx").on(table.expiresAt),
  ownerIdx: index("analytics_insight_caches_owner_idx").on(table.ownerUserId),
  statusIdx: index("analytics_insight_caches_status_idx").on(table.status),
}));
export type AnalyticsInsightCache = typeof analyticsInsightCaches.$inferSelect;
export type InsertAnalyticsInsightCache = typeof analyticsInsightCaches.$inferInsert;

// ─── US Location Reference Tables ─────────────────────────────────────────────
export const usStates = mysqlTable("us_states", {
  code: varchar("code", { length: 2 }).primaryKey(), // e.g. "FL"
  name: varchar("name", { length: 100 }).notNull(),  // e.g. "Florida"
});
export type UsState = typeof usStates.$inferSelect;

export const usCounties = mysqlTable("us_counties", {
  id: int("id").autoincrement().primaryKey(),
  stateCode: varchar("stateCode", { length: 2 }).notNull().references(() => usStates.code, { onDelete: "cascade" }),
  name: varchar("name", { length: 150 }).notNull(), // e.g. "St. Johns County"
});
export type UsCounty = typeof usCounties.$inferSelect;

// Join table: one market can span multiple counties
export const marketCounties = mysqlTable("market_counties", {
  id: int("id").autoincrement().primaryKey(),
  marketProfileId: int("marketProfileId").notNull().references(() => marketProfiles.id, { onDelete: "cascade" }),
  countyId: int("countyId").notNull().references(() => usCounties.id, { onDelete: "cascade" }),
});
export type MarketCounty = typeof marketCounties.$inferSelect;


// ─── Duplicate Scan Jobs ───────────────────────────────────────────────────────
export const duplicateScanJobs = mysqlTable("duplicate_scan_jobs", {
  id: int("id").autoincrement().primaryKey(),
  status: mysqlEnum("status", ["running", "completed", "failed"]).notNull().default("running"),
  phase: varchar("phase", { length: 64 }).notNull().default("starting"),
  processed: int("processed").notNull().default(0),
  total: int("total").notNull().default(0),
  detected: int("detected").notNull().default(0),
  inserted: int("inserted").notNull().default(0),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});
export type DuplicateScanJob = typeof duplicateScanJobs.$inferSelect;

// ─── Custom Reports ──────────────────────────────────────────────────────────
// Saved, allowlisted AI report definitions. The definition is validated before every run.
export const customReports = mysqlTable("custom_reports", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  prompt: text("prompt").notNull(),
  definition: json("definition").$type<Record<string, unknown>>().notNull(),
  createdById: int("createdById").notNull().references(() => users.id, { onDelete: "cascade" }),
  lastRunAt: timestamp("lastRunAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("custom_reports_created_by_idx").on(table.createdById),
]);
export type CustomReport = typeof customReports.$inferSelect;
export type InsertCustomReport = typeof customReports.$inferInsert;

// ─── Admin Permissions ────────────────────────────────────────────────────────
// Stores per-admin page-level permissions. One row per admin user.
// Each boolean column corresponds to a nav link in the admin sidebar.
// Tyler's permissions are never stored here — she always has full access.
// Default for new admins: most pages ON, the 3 formerly-hidden pages OFF.
export const adminPermissions = mysqlTable("admin_permissions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  // Overview
  canViewDashboard: boolean("canViewDashboard").default(true).notNull(),
  canViewIsmDashboard: boolean("canViewIsmDashboard").default(false).notNull(),
  canViewReporting: boolean("canViewReporting").default(true).notNull(),
  canViewCustomReports: boolean("canViewCustomReports").default(true).notNull(),
  canViewLeaderboard: boolean("canViewLeaderboard").default(true).notNull(),
  // CRM
  canViewContacts: boolean("canViewContacts").default(true).notNull(),
  canViewPipeline: boolean("canViewPipeline").default(true).notNull(),
  canViewConnectionRequests: boolean("canViewConnectionRequests").default(true).notNull(),
  canViewLeadSources: boolean("canViewLeadSources").default(true).notNull(),
  canViewHotLeads: boolean("canViewHotLeads").default(true).notNull(),
  // Transactions
  canViewTransactions: boolean("canViewTransactions").default(true).notNull(),
  canViewTransactionExports: boolean("canViewTransactionExports").default(true).notNull(),
  canViewListings: boolean("canViewListings").default(true).notNull(),
  canViewProperties: boolean("canViewProperties").default(true).notNull(),
  canViewCommission: boolean("canViewCommission").default(true).notNull(),
  // Outbound Referrals
  canViewReferrals: boolean("canViewReferrals").default(true).notNull(),
  canCreateReferrals: boolean("canCreateReferrals").default(true).notNull(),
  canEditReferrals: boolean("canEditReferrals").default(true).notNull(),
  canManageReferralAgents: boolean("canManageReferralAgents").default(true).notNull(),
  canEditReferralSplits: boolean("canEditReferralSplits").default(true).notNull(),
  canViewReferralFinancials: boolean("canViewReferralFinancials").default(true).notNull(),
  canUpdateReferralPayments: boolean("canUpdateReferralPayments").default(true).notNull(),
  canManageReferralAgreements: boolean("canManageReferralAgreements").default(true).notNull(),
  canEditHistoricalReferrals: boolean("canEditHistoricalReferrals").default(true).notNull(),
  // Pulse
  canViewPulse: boolean("canViewPulse").default(true).notNull(),
  // Operations
  canViewTasks: boolean("canViewTasks").default(true).notNull(),
  canViewOnboarding: boolean("canViewOnboarding").default(true).notNull(),
  canViewCoachingHub: boolean("canViewCoachingHub").default(true).notNull(),
  canViewLeadershipDashboard: boolean("canViewLeadershipDashboard").default(true).notNull(),
  canViewActivityLog: boolean("canViewActivityLog").default(true).notNull(),
  // Admin
  canViewUsers: boolean("canViewUsers").default(true).notNull(),
  canViewAdminApprovals: boolean("canViewAdminApprovals").default(true).notNull(),
  canViewMarketMatch: boolean("canViewMarketMatch").default(true).notNull(),
  canViewOrgChart: boolean("canViewOrgChart").default(true).notNull(),
  canViewRolesResponsibilities: boolean("canViewRolesResponsibilities").default(true).notNull(),
  canViewFeedback: boolean("canViewFeedback").default(true).notNull(),
  canViewMarketingAdmin: boolean("canViewMarketingAdmin").default(true).notNull(),
  canViewTechRequests: boolean("canViewTechRequests").default(true).notNull(),
  canViewGoals: boolean("canViewGoals").default(true).notNull(),
  canViewJobBoard: boolean("canViewJobBoard").default(true).notNull(),
  canViewTalentProfile: boolean("canViewTalentProfile").default(true).notNull(),
  // Dev Tools
  canViewWebhooks: boolean("canViewWebhooks").default(true).notNull(),
  canViewDuplicates: boolean("canViewDuplicates").default(true).notNull(),
  // Resources
  canViewKnowledgeBase: boolean("canViewKnowledgeBase").default(true).notNull(),
  // Formerly hidden — default OFF for new admins
  canViewProjects: boolean("canViewProjects").default(false).notNull(),
  canViewSmartPlans: boolean("canViewSmartPlans").default(false).notNull(),
  canViewEmailNotifications: boolean("canViewEmailNotifications").default(false).notNull(),
  canViewFeatureUpdates: boolean("canViewFeatureUpdates").default(true).notNull(),
  // Passwords
  canViewPasswords: boolean("canViewPasswords").default(true).notNull(),
  // Super admin tools — default OFF (page has its own access check anyway)
  canViewSuperPermissions: boolean("canViewSuperPermissions").default(false).notNull(),
  // JSON map of { permissionKey: ISO-timestamp } for temporarily-granted permissions
  tempGrantExpiry: json("tempGrantExpiry").$type<Record<string, string>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AdminPermissions = typeof adminPermissions.$inferSelect;
export type InsertAdminPermissions = typeof adminPermissions.$inferInsert;

// ─── Email Behaviors ──────────────────────────────────────────────────────────
// Stores email activity imported from Resend and GoHighLevel, matched to a
// contact by email address. One row per email send event.
export const emailBehaviors = mysqlTable(
  "email_behaviors",
  {
    id: int("id").autoincrement().primaryKey(),
    // Matched contact (null until matched)
    contactId: int("contactId").references(() => contacts.id, { onDelete: "cascade" }),
    // Source system
    source: mysqlEnum("source", ["resend", "ghl"]).notNull(),
    // External IDs for dedup
    externalId: varchar("externalId", { length: 512 }).notNull(), // Resend email ID or GHL message ID
    // Email fields
    toEmail: varchar("toEmail", { length: 320 }).notNull(),
    fromEmail: varchar("fromEmail", { length: 512 }),
    subject: varchar("subject", { length: 1024 }),
    direction: mysqlEnum("direction", ["outbound", "inbound"]).default("outbound").notNull(),
    // Status / engagement
    status: varchar("status", { length: 64 }), // delivered, bounced, opened, clicked, failed, sent, etc.
    openedAt: timestamp("openedAt"),
    clickedAt: timestamp("clickedAt"),
    // Source-specific metadata
    ghlConversationId: varchar("ghlConversationId", { length: 255 }),
    ghlMessageSource: varchar("ghlMessageSource", { length: 128 }), // workflow, manual, etc.
    // Timestamps
    sentAt: timestamp("sentAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("email_behaviors_contact_idx").on(table.contactId, table.sentAt),
    index("email_behaviors_to_email_idx").on(table.toEmail),
    uniqueIndex("email_behaviors_source_external_unique").on(table.source, table.externalId),
  ],
);
export type EmailBehavior = typeof emailBehaviors.$inferSelect;
export type InsertEmailBehavior = typeof emailBehaviors.$inferInsert;

// ─── Email Behaviors Unmatched Queue ─────────────────────────────────────────
// Hidden staging table for emails whose recipient address does not yet match
// any contact in SavvyOS. When a new contact is created with a matching email,
// the deferred-match trigger promotes rows from here into email_behaviors.
export const emailBehaviorsUnmatched = mysqlTable(
  "email_behaviors_unmatched",
  {
    id: int("id").autoincrement().primaryKey(),
    source: mysqlEnum("source", ["resend", "ghl"]).notNull(),
    externalId: varchar("externalId", { length: 512 }).notNull(),
    toEmail: varchar("toEmail", { length: 320 }).notNull(),
    fromEmail: varchar("fromEmail", { length: 512 }),
    subject: varchar("subject", { length: 1024 }),
    direction: mysqlEnum("direction", ["outbound", "inbound"]).default("outbound").notNull(),
    status: varchar("status", { length: 64 }),
    openedAt: timestamp("openedAt"),
    clickedAt: timestamp("clickedAt"),
    ghlConversationId: varchar("ghlConversationId", { length: 255 }),
    ghlMessageSource: varchar("ghlMessageSource", { length: 128 }),
    sentAt: timestamp("sentAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("email_behaviors_unmatched_email_idx").on(table.toEmail),
    uniqueIndex("email_behaviors_unmatched_source_external_unique").on(table.source, table.externalId),
  ],
);
export type EmailBehaviorUnmatched = typeof emailBehaviorsUnmatched.$inferSelect;
export type InsertEmailBehaviorUnmatched = typeof emailBehaviorsUnmatched.$inferInsert;

// ─── Email Behaviors Sync State ───────────────────────────────────────────────
// Tracks the last successful sync cursor for each source so incremental syncs
// only fetch new data rather than re-importing everything.
export const emailBehaviorsSyncState = mysqlTable("email_behaviors_sync_state", {
  id: int("id").autoincrement().primaryKey(),
  source: mysqlEnum("source", ["resend", "ghl"]).notNull().unique(),
  lastSyncedAt: timestamp("lastSyncedAt"),
  lastCursor: varchar("lastCursor", { length: 1024 }), // pagination cursor / last ID
  gapFillCursor: varchar("gapFillCursor", { length: 1024 }), // cursor for gap-fill progress
  totalImported: int("totalImported").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EmailBehaviorsSyncState = typeof emailBehaviorsSyncState.$inferSelect;

// ─── Listing Documents ─────────────────────────────────────────────────────────
export const listingDocuments = mysqlTable("listing_documents", {
  id: int("id").autoincrement().primaryKey(),
  listingId: int("listingId").notNull().references(() => listings.id),
  uploadedBy: int("uploadedBy").notNull().references(() => users.id),
  label: mysqlEnum("label_listing_doc", ["appraisal", "listing_agreement", "inspection", "disclosure", "other"]).default("other").notNull(),
  customLabel: varchar("custom_label", { length: 255 }),
  fileUrl: text("file_url").notNull(),
  fileKey: varchar("file_key", { length: 500 }).notNull(),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  fileSize: int("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ListingDocument = typeof listingDocuments.$inferSelect;
export type InsertListingDocument = typeof listingDocuments.$inferInsert;

// ─── Aircall Calls ─────────────────────────────────────────────────────────────
// Stores every Aircall call record. Each matched call also has a corresponding
// `communications` row (type = "call") linked via communicationId.
// aircallCallId is the Aircall call ID and acts as the deduplication key.
export const aircallCalls = mysqlTable(
  "aircall_calls",
  {
    id: int("id").autoincrement().primaryKey(),
    // Aircall identifiers
    aircallCallId: bigint("aircallCallId", { mode: "number" }).notNull(),
    // Matched contact (null = unmatched, stored in aircall_unmatched_calls)
    contactId: int("contactId").references(() => contacts.id),
    // The communications row created for this call in the Activity tab
    communicationId: int("communicationId").references(() => communications.id),
    // Call metadata
    direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
    status: varchar("status", { length: 64 }).notNull(), // done, missed, voicemail, etc.
    duration: int("duration"), // seconds
    startedAt: timestamp("startedAt"),
    answeredAt: timestamp("answeredAt"),
    endedAt: timestamp("endedAt"),
    // Phone numbers involved
    callerNumber: varchar("callerNumber", { length: 32 }),
    calleeNumber: varchar("calleeNumber", { length: 32 }),
    // Recording — permanent S3 URL (downloaded from Aircall's expiring URL)
    recordingUrl: text("recordingUrl"),
    recordingKey: varchar("recordingKey", { length: 512 }),
    // Voicemail — permanent S3 URL
    voicemailUrl: text("voicemailUrl"),
    voicemailKey: varchar("voicemailKey", { length: 512 }),
    // Aircall number/line info
    aircallNumberId: int("aircallNumberId"),
    aircallNumberName: varchar("aircallNumberName", { length: 255 }),
    // Full Aircall payload for future use
    rawPayload: json("rawPayload"),
    // Late-recording reconciliation state. Bounded attempts keep a nightly
    // recovery sweep from permanently retrying expired or unavailable media.
    recordingRecoveryAttempts: int("recordingRecoveryAttempts").notNull().default(0),
    recordingRecoveryLastAttemptAt: timestamp("recordingRecoveryLastAttemptAt"),
    recordingRecoveryLastError: varchar("recordingRecoveryLastError", { length: 512 }),
    // Durable transcription and summary recovery state. This keeps AI work out
    // of ephemeral webhook handlers and permits rate-governed retry after 429s.
    transcriptionRecoveryAttempts: int("transcriptionRecoveryAttempts").notNull().default(0),
    transcriptionRecoveryLastAttemptAt: timestamp("transcriptionRecoveryLastAttemptAt"),
    transcriptionRecoveryNextAttemptAt: timestamp("transcriptionRecoveryNextAttemptAt"),
    transcriptionRecoveryLastError: varchar("transcriptionRecoveryLastError", { length: 512 }),
    // Timestamps
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("aircall_calls_aircall_id_unique").on(table.aircallCallId),
    index("aircall_calls_contact_idx").on(table.contactId, table.startedAt),
    index("aircall_calls_started_at_idx").on(table.startedAt),
    index("aircall_calls_recording_recovery_idx").on(table.recordingRecoveryAttempts, table.recordingRecoveryLastAttemptAt),
    index("aircall_calls_transcription_recovery_idx").on(table.transcriptionRecoveryNextAttemptAt, table.startedAt),
  ],
);
export type AircallCall = typeof aircallCalls.$inferSelect;
export type InsertAircallCall = typeof aircallCalls.$inferInsert;

// ─── Aircall Unmatched Calls ───────────────────────────────────────────────────
// Staging table for Aircall calls that could not be matched to a SavvyOS contact
// by phone number. Logged here for admin review instead of being discarded.
export const aircallUnmatchedCalls = mysqlTable(
  "aircall_unmatched_calls",
  {
    id: int("id").autoincrement().primaryKey(),
    aircallCallId: bigint("aircallCallId", { mode: "number" }).notNull(),
    direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
    status: varchar("status", { length: 64 }).notNull(),
    duration: int("duration"),
    startedAt: timestamp("startedAt"),
    endedAt: timestamp("endedAt"),
    callerNumber: varchar("callerNumber", { length: 32 }),
    calleeNumber: varchar("calleeNumber", { length: 32 }),
    // The phone number we tried to match (normalized)
    attemptedPhone: varchar("attemptedPhone", { length: 32 }),
    rawPayload: json("rawPayload"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("aircall_unmatched_aircall_id_unique").on(table.aircallCallId),
    index("aircall_unmatched_phone_idx").on(table.attemptedPhone),
  ],
);
export type AircallUnmatchedCall = typeof aircallUnmatchedCalls.$inferSelect;
export type InsertAircallUnmatchedCall = typeof aircallUnmatchedCalls.$inferInsert;

// ─── Aircall Reliability ───────────────────────────────────────────────────────
// Every relevant webhook is durably written before a 2xx response is returned to
// Aircall. This outbox-style ledger survives deploys and process restarts.
export const aircallWebhookEvents = mysqlTable(
  "aircall_webhook_events",
  {
    id: int("id").autoincrement().primaryKey(),
    eventKey: varchar("eventKey", { length: 160 }).notNull(),
    aircallCallId: bigint("aircallCallId", { mode: "number" }).notNull(),
    eventType: varchar("eventType", { length: 96 }).notNull(),
    payload: json("payload").notNull(),
    status: mysqlEnum("status", ["pending", "processing", "retrying", "completed"]).notNull().default("pending"),
    attempts: int("attempts").notNull().default(0),
    nextAttemptAt: timestamp("nextAttemptAt"),
    leaseExpiresAt: timestamp("leaseExpiresAt"),
    lastAttemptAt: timestamp("lastAttemptAt"),
    processedAt: timestamp("processedAt"),
    lastError: varchar("lastError", { length: 512 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("aircall_webhook_events_event_key_unique").on(table.eventKey),
    index("aircall_webhook_events_status_next_attempt_idx").on(table.status, table.nextAttemptAt),
    index("aircall_webhook_events_call_event_idx").on(table.aircallCallId, table.eventType),
  ],
);
export type AircallWebhookEvent = typeof aircallWebhookEvents.$inferSelect;
export type InsertAircallWebhookEvent = typeof aircallWebhookEvents.$inferInsert;

// Singleton state retained for webhook self-healing, verification and alerting.
export const aircallIntegrationState = mysqlTable("aircall_integration_state", {
  id: int("id").primaryKey(),
  webhookId: varchar("webhookId", { length: 128 }),
  webhookToken: varchar("webhookToken", { length: 255 }),
  lastVerifiedAt: timestamp("lastVerifiedAt"),
  lastWebhookRepairAt: timestamp("lastWebhookRepairAt"),
  historicalBackfillCursorAt: timestamp("historicalBackfillCursorAt"),
  historicalBackfillCompletedAt: timestamp("historicalBackfillCompletedAt"),
  lastUnmatchedReconcileAt: timestamp("lastUnmatchedReconcileAt"),
  unmatchedRematchCursorId: int("unmatchedRematchCursorId"),
  lastAlertAt: timestamp("lastAlertAt"),
  lastError: varchar("lastError", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AircallIntegrationState = typeof aircallIntegrationState.$inferSelect;
export type InsertAircallIntegrationState = typeof aircallIntegrationState.$inferInsert;

// ─── Job Board ─────────────────────────────────────────────────────────────────
// Admin-managed job postings visible on the public /careers page.
export const jobPostings = mysqlTable("job_postings", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  department: varchar("department", { length: 128 }),
  location: varchar("location", { length: 255 }),
  employmentType: mysqlEnum("employmentType", ["full_time", "part_time", "contract", "internship"]).default("full_time"),
  description: text("description").notNull(),
  requirements: text("requirements"),
  salaryRange: varchar("salaryRange", { length: 128 }),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0),
  createdById: int("createdById"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type JobPosting = typeof jobPostings.$inferSelect;
export type InsertJobPosting = typeof jobPostings.$inferInsert;

// Applications submitted via the public /careers page.
export const jobApplications = mysqlTable("job_applications", {
  id: int("id").autoincrement().primaryKey(),
  jobPostingId: int("jobPostingId").notNull(),
  applicantName: varchar("applicantName", { length: 255 }).notNull(),
  applicantEmail: varchar("applicantEmail", { length: 255 }).notNull(),
  applicantPhone: varchar("applicantPhone", { length: 64 }),
  linkedinUrl: varchar("linkedinUrl", { length: 512 }),
  coverLetter: text("coverLetter"),
  resumeUrl: varchar("resumeUrl", { length: 1024 }),
  status: mysqlEnum("status", ["new", "reviewing", "interviewing", "offered", "rejected", "withdrawn"]).default("new").notNull(),
  notes: text("notes"),
  submittedAt: timestamp("submittedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type JobApplication = typeof jobApplications.$inferSelect;
export type InsertJobApplication = typeof jobApplications.$inferInsert;

// ─── Job Board v2: Multi-step application system ─────────────────────────────

// Custom questions admins can attach to a job posting
export const jobCustomQuestions = mysqlTable("job_custom_questions", {
  id: int("id").autoincrement().primaryKey(),
  jobPostingId: int("jobPostingId").notNull(),
  questionText: text("questionText").notNull(),
  questionType: mysqlEnum("questionType", ["text", "textarea", "yes_no", "multiple_choice", "rating"]).default("textarea").notNull(),
  options: text("options"),
  isRequired: boolean("isRequired").default(false).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type JobCustomQuestion = typeof jobCustomQuestions.$inferSelect;
export type InsertJobCustomQuestion = typeof jobCustomQuestions.$inferInsert;

// Extended multi-step application
export const jobApplicationsV2 = mysqlTable("job_applications_v2", {
  id: int("id").autoincrement().primaryKey(),
  jobPostingId: int("jobPostingId").notNull(),
  firstName: varchar("firstName", { length: 128 }),
  lastName: varchar("lastName", { length: 128 }),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 64 }),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  country: varchar("country", { length: 64 }).default("US"),
  linkedinUrl: varchar("linkedinUrl", { length: 512 }),
  portfolioUrl: varchar("portfolioUrl", { length: 512 }),
  resumeUrl: varchar("resumeUrl", { length: 1024 }),
  resumeFileName: varchar("resumeFileName", { length: 255 }),
  resumeLinkUrl: varchar("resumeLinkUrl", { length: 1024 }),
  coverLetter: text("coverLetter"),
  coverLetterUrl: varchar("coverLetterUrl", { length: 1024 }),
  coverLetterFileName: varchar("coverLetterFileName", { length: 255 }),
  whyInterested: text("whyInterested"),
  salaryExpectation: varchar("salaryExpectation", { length: 128 }),
  availableStartDate: varchar("availableStartDate", { length: 64 }),
  customAnswers: text("customAnswers"),
  currentStep: int("currentStep").default(1).notNull(),
  completionPct: int("completionPct").default(0).notNull(),
  isDraft: boolean("isDraft").default(true).notNull(),
  status: mysqlEnum("status", ["draft", "submitted", "reviewing", "interviewing", "offered", "rejected", "withdrawn"]).default("draft").notNull(),
  adminNotes: text("adminNotes"),
  aiInsight: text("aiInsight"),
  aiInsightGeneratedAt: timestamp("aiInsightGeneratedAt"),
  rating: int("rating"),
  submittedAt: timestamp("submittedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type JobApplicationV2 = typeof jobApplicationsV2.$inferSelect;
export type InsertJobApplicationV2 = typeof jobApplicationsV2.$inferInsert;

// Work history entries
export const jobAppWorkHistory = mysqlTable("job_app_work_history", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("applicationId").notNull(),
  company: varchar("company", { length: 255 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  startDate: varchar("startDate", { length: 32 }),
  endDate: varchar("endDate", { length: 32 }),
  isCurrent: boolean("isCurrent").default(false),
  description: text("description"),
  sortOrder: int("sortOrder").default(0),
});
export type JobAppWorkHistory = typeof jobAppWorkHistory.$inferSelect;

// Education entries
export const jobAppEducation = mysqlTable("job_app_education", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("applicationId").notNull(),
  institution: varchar("institution", { length: 255 }).notNull(),
  degree: varchar("degree", { length: 255 }),
  fieldOfStudy: varchar("fieldOfStudy", { length: 255 }),
  startYear: varchar("startYear", { length: 8 }),
  endYear: varchar("endYear", { length: 8 }),
  gpa: varchar("gpa", { length: 16 }),
  sortOrder: int("sortOrder").default(0),
});
export type JobAppEducation = typeof jobAppEducation.$inferSelect;

// Passwordless email sessions for applicants to return to their draft
export const jobApplicantSessions = mysqlTable("job_applicant_sessions", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  token: varchar("token", { length: 128 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type JobApplicantSession = typeof jobApplicantSessions.$inferSelect;


// ─── Coaching Hub ─────────────────────────────────────────────────────────────

// One-to-one with users (agents). Central coaching state for each agent.
export const coachingProfiles = mysqlTable("coaching_profiles", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  coachOfRecordId: int("coachOfRecordId").references(() => users.id),
  performanceStatus: mysqlEnum("performanceStatus", ["Launch", "Red", "Yellow", "Green", "Elite"]).default("Launch").notNull(),
  marketProtectionStatus: mysqlEnum("marketProtectionStatus", [
    "Protected", "Conditional", "Open for Additional Coverage",
    "Recruiting Active", "Exit Pending", "Unassigned", "Leadership Review",
  ]).default("Protected"),
  retentionRiskStatus: mysqlEnum("retentionRiskStatus", ["Low", "Watch", "Elevated", "Critical"]).default("Low"),
  currentPrimaryDiagnosis: mysqlEnum("currentPrimaryDiagnosis", ["Commitment", "Capability", "Cadence", "Capacity"]),
  secondaryDiagnosis: mysqlEnum("secondaryDiagnosis", ["Commitment", "Capability", "Cadence", "Capacity"]),
  currentDevelopmentPriority: text("currentDevelopmentPriority"),
  aiInsightsJson: json("aiInsightsJson"),
  aiInsightsGeneratedAt: timestamp("aiInsightsGeneratedAt"),
  nextSessionCoachId: int("nextSessionCoachId").references(() => users.id),
  nextSessionDate: timestamp("nextSessionDate"),
  coachingSetupRequired: boolean("coachingSetupRequired").default(true).notNull(),
  launchStartDate: timestamp("launchStartDate"),
  launchHealthStatus: mysqlEnum("launchHealthStatus", ["On Track", "At Risk", "Critical"]).default("On Track"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CoachingProfile = typeof coachingProfiles.$inferSelect;
export type InsertCoachingProfile = typeof coachingProfiles.$inferInsert;

// All coaching sessions — scheduled, in-progress, and completed.
export const coachingSessions = mysqlTable("coaching_sessions", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull().references(() => users.id),
  coachOfRecordId: int("coachOfRecordId").references(() => users.id),
  scheduledCoachId: int("scheduledCoachId").references(() => users.id),
  actualCoachId: int("actualCoachId").references(() => users.id),
  sessionDate: timestamp("sessionDate"),
  sessionType: varchar("sessionType", { length: 128 }).default("Standard COACH").notNull(),
  status: mysqlEnum("status", ["Scheduled", "In Progress", "Completed", "Canceled", "No Show"]).default("Scheduled").notNull(),
  durationMinutes: int("durationMinutes"),
  meetingLink: varchar("meetingLink", { length: 512 }),
  reasonForSession: text("reasonForSession"),
  preparationStatus: mysqlEnum("preparationStatus", ["Not Started", "In Progress", "Ready"]).default("Not Started"),
  // Notes and media
  sourceNotes: text("sourceNotes"),
  recordingFileUrl: text("recordingFileUrl"),
  recordingFileKey: varchar("recordingFileKey", { length: 512 }),
  recordingDurationSeconds: int("recordingDurationSeconds"),
  transcript: text("transcript"),
  transcriptionStatus: mysqlEnum("transcriptionStatus", ["None", "Pending", "Processing", "Completed", "Failed"]).default("None"),
  // AI processing
  aiSummary: text("aiSummary"),
  aiProcessingStatus: mysqlEnum("aiProcessingStatus", ["None", "Pending", "Processing", "Completed", "Failed"]).default("None"),
  isSummaryApproved: boolean("isSummaryApproved").default(false).notNull(),
  aiRecommendedAgenda: text("aiRecommendedAgenda"),
  aiRecommendedQuestions: text("aiRecommendedQuestions"),
  aiRecommendedCommitments: text("aiRecommendedCommitments"),
  aiNextCoachSuggestion: int("aiNextCoachSuggestion").references(() => users.id),
  // Diagnosis
  primaryDiagnosis: mysqlEnum("primaryDiagnosis", ["Commitment", "Capability", "Cadence", "Capacity"]),
  secondaryDiagnosis: mysqlEnum("secondaryDiagnosis", ["Commitment", "Capability", "Cadence", "Capacity"]),
  diagnosisEvidence: text("diagnosisEvidence"),
  // Next session scheduling (captured at end of session)
  nextSessionCoachId: int("nextSessionCoachId").references(() => users.id),
  nextSessionDate: timestamp("nextSessionDate"),
  nextSessionType: varchar("nextSessionType", { length: 128 }),
  noNextSessionReason: text("noNextSessionReason"),
  // Session start/end tracking
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("coaching_sessions_agent_idx").on(table.agentId, table.sessionDate),
  index("coaching_sessions_coach_idx").on(table.scheduledCoachId, table.sessionDate),
]);
export type CoachingSession = typeof coachingSessions.$inferSelect;
export type InsertCoachingSession = typeof coachingSessions.$inferInsert;

// Coaching commitments — action items from sessions.
export const coachingCommitments = mysqlTable("coaching_commitments", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull().references(() => users.id),
  sessionId: int("sessionId").references(() => coachingSessions.id),
  description: text("description").notNull(),
  ownerId: int("ownerId").references(() => users.id),
  createdById: int("createdById").references(() => users.id),
  coachAssignedId: int("coachAssignedId").references(() => users.id),
  dueDate: timestamp("dueDate"),
  expectedResult: text("expectedResult"),
  relatedGoalId: int("relatedGoalId").references(() => agentGoals.id),
  relatedMetric: varchar("relatedMetric", { length: 255 }),
  completionEvidence: text("completionEvidence"),
  status: mysqlEnum("status", [
    "AI Suggested", "Not Started", "In Progress", "Submitted for Verification",
    "Completed", "Partially Completed", "Missed", "Waived", "No Longer Relevant",
  ]).default("Not Started").notNull(),
  completedDate: timestamp("completedDate"),
  coachVerificationStatus: mysqlEnum("coachVerificationStatus", ["Pending", "Verified", "Rejected"]).default("Pending"),
  visibilityLabel: mysqlEnum("visibilityLabel", ["Agent Visible", "Internal", "Leadership"]).default("Agent Visible"),
  consequence: text("consequence"),
  isAiExtracted: boolean("isAiExtracted").default(false).notNull(),
  aiConfidence: varchar("aiConfidence", { length: 32 }),
  isRepeated: boolean("isRepeated").default(false).notNull(),
  repeatCount: int("repeatCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("coaching_commitments_agent_idx").on(table.agentId, table.status),
  index("coaching_commitments_session_idx").on(table.sessionId),
]);
export type CoachingCommitment = typeof coachingCommitments.$inferSelect;
export type InsertCoachingCommitment = typeof coachingCommitments.$inferInsert;

// Formal 30-day Performance Reset plans.
export const performanceResets = mysqlTable("performance_resets", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull().references(() => users.id),
  coachOfRecordId: int("coachOfRecordId").references(() => users.id),
  status: mysqlEnum("status", [
    "Draft", "Pending Review", "Active", "Improving", "Recovered",
    "Extension Requested", "Extended", "Coach-Out Recommended", "Exited", "Canceled",
  ]).default("Draft").notNull(),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  requiredStandard: text("requiredStandard"),
  currentResult: text("currentResult"),
  goalGap: text("goalGap"),
  evidenceSummary: text("evidenceSummary"),
  consequence: text("consequence"),
  extensionReason: text("extensionReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("performance_resets_agent_idx").on(table.agentId, table.status),
]);
export type PerformanceReset = typeof performanceResets.$inferSelect;
export type InsertPerformanceReset = typeof performanceResets.$inferInsert;

// Measurable requirements for a reset plan.
export const performanceResetRequirements = mysqlTable("performance_reset_requirements", {
  id: int("id").autoincrement().primaryKey(),
  resetId: int("resetId").notNull().references(() => performanceResets.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  status: mysqlEnum("status", ["Pending", "Met", "Missed"]).default("Pending").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PerformanceResetRequirement = typeof performanceResetRequirements.$inferSelect;
export type InsertPerformanceResetRequirement = typeof performanceResetRequirements.$inferInsert;

// Scheduled check-in milestones for a reset plan.
export const performanceResetCheckpoints = mysqlTable("performance_reset_checkpoints", {
  id: int("id").autoincrement().primaryKey(),
  resetId: int("resetId").notNull().references(() => performanceResets.id, { onDelete: "cascade" }),
  checkpointDate: timestamp("checkpointDate").notNull(),
  checkpointType: varchar("checkpointType", { length: 64 }).notNull(), // 'Weekly', 'Day 14', 'Day 30'
  status: mysqlEnum("status", ["Pending", "Completed", "Missed"]).default("Pending").notNull(),
  notes: text("notes"),
  conductedById: int("conductedById").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PerformanceResetCheckpoint = typeof performanceResetCheckpoints.$inferSelect;
export type InsertPerformanceResetCheckpoint = typeof performanceResetCheckpoints.$inferInsert;

// Capacity escalations — operational issues blocking production.
export const capacityEscalations = mysqlTable("capacity_escalations", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull().references(() => users.id),
  submittedById: int("submittedById").notNull().references(() => users.id),
  assignedOwnerId: int("assignedOwnerId").references(() => users.id),
  relatedSessionId: int("relatedSessionId").references(() => coachingSessions.id),
  issueCategory: varchar("issueCategory", { length: 128 }),
  description: text("description").notNull(),
  evidence: text("evidence"),
  estimatedProductionImpact: text("estimatedProductionImpact"),
  urgency: mysqlEnum("urgency", ["Low", "Medium", "High", "Critical"]).default("Medium").notNull(),
  status: mysqlEnum("status", [
    "Draft", "Submitted", "Assigned", "In Progress",
    "Waiting for Information", "Resolved", "Closed", "Declined",
  ]).default("Draft").notNull(),
  dueDate: timestamp("dueDate"),
  resolution: text("resolution"),
  resolutionDate: timestamp("resolutionDate"),
  coachConfirmation: boolean("coachConfirmation").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("capacity_escalations_agent_idx").on(table.agentId, table.status),
]);
export type CapacityEscalation = typeof capacityEscalations.$inferSelect;
export type InsertCapacityEscalation = typeof capacityEscalations.$inferInsert;

// Coach-out recommendations.
export const coachOutRecommendations = mysqlTable("coach_out_recommendations", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull().references(() => users.id),
  coachOfRecordId: int("coachOfRecordId").references(() => users.id),
  status: mysqlEnum("status", [
    "Draft", "Submitted", "Under Review", "Approved",
    "Declined", "More Information Required", "Agent Recovered", "Completed",
  ]).default("Draft").notNull(),
  performanceHistory: text("performanceHistory"),
  supportProvided: text("supportProvided"),
  culturalConcerns: text("culturalConcerns"),
  engagementConcerns: text("engagementConcerns"),
  marketImpact: text("marketImpact"),
  recommendation: text("recommendation"),
  proposedEffectiveDate: timestamp("proposedEffectiveDate"),
  marketOpeningRecommendation: text("marketOpeningRecommendation"),
  reviewedById: int("reviewedById").references(() => users.id),
  reviewedAt: timestamp("reviewedAt"),
  reviewNotes: text("reviewNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CoachOutRecommendation = typeof coachOutRecommendations.$inferSelect;
export type InsertCoachOutRecommendation = typeof coachOutRecommendations.$inferInsert;

// Personality and work-style assessments (DISC, Predictive Index, etc.).
export const coachingAssessments = mysqlTable("coaching_assessments", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull().references(() => users.id),
  assessmentType: varchar("assessmentType", { length: 128 }).notNull(), // 'DISC', 'Predictive Index', etc.
  assessmentProvider: varchar("assessmentProvider", { length: 255 }),
  assessmentDate: timestamp("assessmentDate"),
  fileUrl: text("fileUrl"),
  fileKey: varchar("fileKey", { length: 512 }),
  rawText: text("rawText"),
  aiSummary: text("aiSummary"),
  isSummaryApproved: boolean("isSummaryApproved").default(false).notNull(),
  communicationStyle: text("communicationStyle"),
  decisionMakingStyle: text("decisionMakingStyle"),
  motivators: text("motivators"),
  stressBehaviors: text("stressBehaviors"),
  accountabilityPreferences: text("accountabilityPreferences"),
  likelyStrengths: text("likelyStrengths"),
  likelyBlindSpots: text("likelyBlindSpots"),
  preferredCoachingStyle: text("preferredCoachingStyle"),
  potentialCoachingRisks: text("potentialCoachingRisks"),
  uploadedById: int("uploadedById").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("coaching_assessments_agent_idx").on(table.agentId),
]);
export type CoachingAssessment = typeof coachingAssessments.$inferSelect;
export type InsertCoachingAssessment = typeof coachingAssessments.$inferInsert;

// Historical snapshots of agent performance metrics for trend analysis.
export const coachingHistorySnapshots = mysqlTable("coaching_history_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull().references(() => users.id),
  snapshotDate: timestamp("snapshotDate").notNull(),
  performanceStatus: varchar("performanceStatus", { length: 32 }),
  trailing90DayUnits: int("trailing90DayUnits"),
  trailing90DayVolume: decimal("trailing90DayVolume", { precision: 15, scale: 2 }),
  underContractUnits: int("underContractUnits"),
  underContractVolume: decimal("underContractVolume", { precision: 15, scale: 2 }),
  leadVolume: int("leadVolume"),
  averageLeadAgeDays: int("averageLeadAgeDays"),
  overdueTaskCount: int("overdueTaskCount"),
  terminationRate: decimal("terminationRate", { precision: 5, scale: 4 }),
  coachOfRecordId: int("coachOfRecordId").references(() => users.id),
  fourCDiagnosis: varchar("fourCDiagnosis", { length: 32 }),
  performanceResetActive: boolean("performanceResetActive").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("coaching_history_snapshots_agent_date_idx").on(table.agentId, table.snapshotDate),
]);
export type CoachingHistorySnapshot = typeof coachingHistorySnapshots.$inferSelect;
export type InsertCoachingHistorySnapshot = typeof coachingHistorySnapshots.$inferInsert;

// Coaching Hub settings — configurable thresholds and defaults.
export const coachingSettings = mysqlTable("coaching_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 128 }).notNull().unique(),
  settingValue: text("settingValue").notNull(),
  settingLabel: varchar("settingLabel", { length: 255 }),
  settingGroup: varchar("settingGroup", { length: 128 }),
  updatedById: int("updatedById").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CoachingSetting = typeof coachingSettings.$inferSelect;
export type InsertCoachingSetting = typeof coachingSettings.$inferInsert;

// ─── Magic Link Tokens ────────────────────────────────────────────────────────
export const magicLinkTokens = mysqlTable("magic_link_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  token: varchar("token", { length: 128 }).notNull().unique(),
  redirectPath: varchar("redirectPath", { length: 512 }).default("/"),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_magic_token").on(table.token),
  index("idx_magic_userId").on(table.userId),
]);
export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;
export type InsertMagicLinkToken = typeof magicLinkTokens.$inferInsert;


// ─── Pro-formas ──────────────────────────────────────────────────────────────
export const proformas = mysqlTable("proformas", {
  id: int("id").autoincrement().primaryKey(),
  propertyId: int("propertyId").notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  title: varchar("title", { length: 255 }),
  version: int("version").default(1),
  status: mysqlEnum("status", ["draft", "final", "archived"]).default("draft"),

  // Key indexed fields for quick queries
  purchasePrice: decimal("purchasePrice", { precision: 12, scale: 2 }),
  grossRevenue: decimal("grossRevenue", { precision: 12, scale: 2 }),
  noiAnnual: decimal("noiAnnual", { precision: 12, scale: 2 }),
  cashFlowAnnual: decimal("cashFlowAnnual", { precision: 12, scale: 2 }),
  cashOnCash: decimal("cashOnCash", { precision: 8, scale: 4 }),
  capRate: decimal("capRate", { precision: 8, scale: 4 }),

  // Full form data as JSON (flexible schema)
  formData: json("formData").notNull(),

  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  propertyIdx: index("idx_proformas_property").on(table.propertyId),
  userIdx: index("idx_proformas_user").on(table.createdByUserId),
}));
export type Proforma = typeof proformas.$inferSelect;
export type InsertProforma = typeof proformas.$inferInsert;


// ─── Contact Relationships ──────────────────────────────────────────────────
// Links two contacts with a named relationship (e.g., spouse, partner, business partner).
// Created during the merge flow when the user opts to link rather than archive.
export const contactRelationships = mysqlTable("contact_relationships", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  relatedContactId: int("relatedContactId").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  relationshipType: mysqlEnum("relationshipType", [
    "spouse",
    "partner",
    "business_partner",
    "unknown_relationship",
  ]).notNull(),
  // Optional: which duplicate pair triggered this link
  sourcePairId: int("sourcePairId").references(() => duplicateContactPairs.id, { onDelete: "set null" }),
  createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  contactIdx: index("idx_contact_relationships_contact").on(table.contactId),
  relatedIdx: index("idx_contact_relationships_related").on(table.relatedContactId),
}));
export type ContactRelationship = typeof contactRelationships.$inferSelect;
export type InsertContactRelationship = typeof contactRelationships.$inferInsert;

// ─── Password Lists & Entries ───────────────────────────────────────────────
// Stores organized lists of passwords/credentials for the team.
export const passwordLists = mysqlTable("password_lists", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PasswordList = typeof passwordLists.$inferSelect;
export type InsertPasswordList = typeof passwordLists.$inferInsert;

// Explicit recipients for a password list. The owner always has access and is not duplicated here.
export const passwordListShares = mysqlTable("password_list_shares", {
  id: int("id").autoincrement().primaryKey(),
  listId: int("listId").notNull().references(() => passwordLists.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  sharedByUserId: int("sharedByUserId").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  listIdx: index("password_list_shares_list_idx").on(table.listId),
  userIdx: index("password_list_shares_user_idx").on(table.userId),
  listUserUnique: uniqueIndex("password_list_shares_list_user_unique").on(table.listId, table.userId),
}));
export type PasswordListShare = typeof passwordListShares.$inferSelect;
export type InsertPasswordListShare = typeof passwordListShares.$inferInsert;

export const passwordEntries = mysqlTable("password_entries", {
  id: int("id").autoincrement().primaryKey(),
  listId: int("listId").notNull().references(() => passwordLists.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  username: varchar("username", { length: 255 }),
  password: varchar("password", { length: 500 }),
  loginUrl: varchar("loginUrl", { length: 1000 }),
  notes: text("notes"),
  createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  listIdx: index("idx_password_entries_list").on(table.listId),
}));
export type PasswordEntry = typeof passwordEntries.$inferSelect;
export type InsertPasswordEntry = typeof passwordEntries.$inferInsert;


// ─── Outbound Referrals ───────────────────────────────────────────────────────
// This model is intentionally distinct from the legacy inbound referral-payout
// fields on lead sources and transactions. It tracks Savvy-owned clients sent to
// outside agents and the fee Savvy is due when those clients close.

export const referralStatusOptions = mysqlTable("referral_status_options", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 96 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  category: mysqlEnum("category", ["active", "closed", "lost", "on_hold"]).default("active").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  isSystem: boolean("isSystem").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ReferralStatusOption = typeof referralStatusOptions.$inferSelect;

export const referralAgents = mysqlTable("referral_agents", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  brokerage: varchar("brokerage", { length: 255 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 64 }),
  primaryMarket: varchar("primaryMarket", { length: 255 }),
  defaultSavvyReferralPct: decimal("defaultSavvyReferralPct", { precision: 5, scale: 2 }).default("25.00"),
  licenseNumber: varchar("licenseNumber", { length: 128 }),
  licenseState: varchar("licenseState", { length: 64 }),
  relationshipOwnerId: int("relationshipOwnerId").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  addedById: int("addedById").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("referral_agents_active_idx").on(table.isActive, table.name),
  index("referral_agents_brokerage_idx").on(table.brokerage),
  index("referral_agents_owner_idx").on(table.relationshipOwnerId),
]);
export type ReferralAgent = typeof referralAgents.$inferSelect;

export const referralAgentCoverage = mysqlTable("referral_agent_coverage", {
  id: int("id").autoincrement().primaryKey(),
  referralAgentId: int("referralAgentId").notNull().references(() => referralAgents.id, { onDelete: "cascade" }),
  state: varchar("state", { length: 64 }),
  market: varchar("market", { length: 255 }),
  metro: varchar("metro", { length: 255 }),
  areasServed: text("areasServed"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("referral_agent_coverage_agent_idx").on(table.referralAgentId),
  index("referral_agent_coverage_market_idx").on(table.state, table.market),
]);
export type ReferralAgentCoverage = typeof referralAgentCoverage.$inferSelect;

export const referralAgreements = mysqlTable("referral_agreements", {
  id: int("id").autoincrement().primaryKey(),
  referralAgentId: int("referralAgentId").notNull().references(() => referralAgents.id, { onDelete: "cascade" }),
  // The associated referral is intentionally an application-level link to avoid a circular foreign-key declaration with referrals.agreementId.
  referralId: int("referralId"),
  title: varchar("title", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["not_created", "sent", "awaiting_signature", "executed", "expired", "superseded"]).default("not_created").notNull(),
  savvyReferralPct: decimal("savvyReferralPct", { precision: 5, scale: 2 }),
  appliesTo: mysqlEnum("appliesTo", ["single_transaction", "multiple_transactions", "all_future"]).default("single_transaction").notNull(),
  sentAt: timestamp("sentAt"),
  executedAt: timestamp("executedAt"),
  effectiveAt: timestamp("effectiveAt"),
  expiresAt: timestamp("expiresAt"),
  signedBy: varchar("signedBy", { length: 255 }),
  notes: text("notes"),
  createdById: int("createdById").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("referral_agreements_agent_idx").on(table.referralAgentId, table.status),
  index("referral_agreements_referral_idx").on(table.referralId),
]);
export type ReferralAgreement = typeof referralAgreements.$inferSelect;

export const referrals = mysqlTable("referrals", {
  id: int("id").autoincrement().primaryKey(),
  contactId: int("contactId").notNull().references(() => contacts.id),
  referralAgentId: int("referralAgentId").notNull().references(() => referralAgents.id),
  // Internal Savvy coordinator. This is assigned from the selected outside agent profile
  // (or the creator as a fallback), rather than collected again for each referral.
  relationshipOwnerId: int("relationshipOwnerId").references(() => users.id, { onDelete: "set null" }),
  propertyId: int("propertyId").references(() => properties.id, { onDelete: "set null" }),
  agreementId: int("agreementId").references(() => referralAgreements.id, { onDelete: "set null" }),
  // Historical chain-of-custody pointer for reassignments; kept application-level for self-reference safety.
  parentReferralId: int("parentReferralId"),
  referralType: mysqlEnum("referralType", ["buyer", "seller", "buyer_seller", "other"]).notNull(),
  statusKey: varchar("statusKey", { length: 96 }).notNull().default("referral_sent"),
  statusCategory: mysqlEnum("statusCategory", ["active", "closed", "lost", "on_hold"]).default("active").notNull(),
  market: varchar("market", { length: 255 }),
  metro: varchar("metro", { length: 255 }),
  state: varchar("state", { length: 64 }),
  // Legacy per-referral coverage fields are retained for historical records. New coverage
  // is maintained on the outside referral-agent profile, not entered on each referral.
  areasServed: text("areasServed"),
  // Free-form description of the client's desired or relevant location for this referral.
  locationNotes: text("locationNotes"),
  savvyReferralPct: decimal("savvyReferralPct", { precision: 5, scale: 2 }).notNull(),
  referralSentAt: timestamp("referralSentAt").defaultNow().notNull(),
  agentAcceptedAt: timestamp("agentAcceptedAt"),
  clientContactedAt: timestamp("clientContactedAt"),
  consultationAt: timestamp("consultationAt"),
  underContractAt: timestamp("underContractAt"),
  closedAt: timestamp("closedAt"),
  lostAt: timestamp("lostAt"),
  lostReason: text("lostReason"),
  reassignmentReason: text("reassignmentReason"),
  lastUpdateReceivedAt: timestamp("lastUpdateReceivedAt"),
  lastReferralAgentContactAt: timestamp("lastReferralAgentContactAt"),
  nextFollowUpAt: timestamp("nextFollowUpAt"),
  notes: text("notes"),
  createdById: int("createdById").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("referrals_contact_idx").on(table.contactId, table.createdAt),
  index("referrals_agent_idx").on(table.referralAgentId, table.statusCategory),
  index("referrals_status_idx").on(table.statusKey, table.statusCategory),
  index("referrals_payment_followup_idx").on(table.nextFollowUpAt),
  index("referrals_market_idx").on(table.state, table.market),
]);
export type Referral = typeof referrals.$inferSelect;

export const referralEvents = mysqlTable("referral_events", {
  id: int("id").autoincrement().primaryKey(),
  referralId: int("referralId").notNull().references(() => referrals.id, { onDelete: "cascade" }),
  eventType: mysqlEnum("eventType", ["created", "status_change", "note", "referral_agent_update", "call", "email", "follow_up", "important_date", "document", "reassignment", "payment"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body"),
  previousStatusKey: varchar("previousStatusKey", { length: 96 }),
  newStatusKey: varchar("newStatusKey", { length: 96 }),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  enteredById: int("enteredById").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("referral_events_referral_date_idx").on(table.referralId, table.occurredAt),
]);
export type ReferralEvent = typeof referralEvents.$inferSelect;

export const referralTransactionLinks = mysqlTable("referral_transaction_links", {
  id: int("id").autoincrement().primaryKey(),
  referralId: int("referralId").notNull().references(() => referrals.id, { onDelete: "cascade" }),
  transactionId: int("transactionId").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("referral_transaction_link_unique").on(table.referralId, table.transactionId),
  index("referral_transaction_tx_idx").on(table.transactionId),
]);
export type ReferralTransactionLink = typeof referralTransactionLinks.$inferSelect;

export const referralListingLinks = mysqlTable("referral_listing_links", {
  id: int("id").autoincrement().primaryKey(),
  referralId: int("referralId").notNull().references(() => referrals.id, { onDelete: "cascade" }),
  listingId: int("listingId").notNull().references(() => listings.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("referral_listing_link_unique").on(table.referralId, table.listingId),
  index("referral_listing_listing_idx").on(table.listingId),
]);
export type ReferralListingLink = typeof referralListingLinks.$inferSelect;

export const referralPayments = mysqlTable("referral_payments", {
  id: int("id").autoincrement().primaryKey(),
  referralId: int("referralId").notNull().references(() => referrals.id, { onDelete: "cascade" }),
  transactionId: int("transactionId").references(() => transactions.id, { onDelete: "set null" }),
  salesPrice: decimal("salesPrice", { precision: 12, scale: 2 }),
  grossCommissionIncome: decimal("grossCommissionIncome", { precision: 12, scale: 2 }),
  savvyReferralPct: decimal("savvyReferralPct", { precision: 5, scale: 2 }).notNull(),
  referralFeeOwed: decimal("referralFeeOwed", { precision: 12, scale: 2 }).notNull().default("0.00"),
  outsideAgentPortion: decimal("outsideAgentPortion", { precision: 12, scale: 2 }),
  paymentStatus: mysqlEnum("paymentStatus", ["not_yet_due", "due", "invoiced", "processing", "paid", "disputed", "written_off"]).default("not_yet_due").notNull(),
  dueAt: timestamp("dueAt"),
  invoicedAt: timestamp("invoicedAt"),
  paidAt: timestamp("paidAt"),
  paymentMethod: varchar("paymentMethod", { length: 128 }),
  paymentReference: varchar("paymentReference", { length: 255 }),
  notes: text("notes"),
  markedPaidById: int("markedPaidById").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("referral_payments_referral_idx").on(table.referralId, table.paymentStatus),
  index("referral_payments_transaction_idx").on(table.transactionId),
  index("referral_payments_status_due_idx").on(table.paymentStatus, table.dueAt),
]);
export type ReferralPayment = typeof referralPayments.$inferSelect;

export const referralDocuments = mysqlTable("referral_documents", {
  id: int("id").autoincrement().primaryKey(),
  referralAgentId: int("referralAgentId").references(() => referralAgents.id, { onDelete: "cascade" }),
  referralId: int("referralId").references(() => referrals.id, { onDelete: "cascade" }),
  agreementId: int("agreementId").references(() => referralAgreements.id, { onDelete: "cascade" }),
  transactionId: int("transactionId").references(() => transactions.id, { onDelete: "cascade" }),
  listingId: int("listingId").references(() => listings.id, { onDelete: "cascade" }),
  paymentId: int("paymentId").references(() => referralPayments.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 512 }).notNull(),
  fileKey: varchar("fileKey", { length: 1024 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  fileSize: bigint("fileSize", { mode: "number" }),
  documentType: mysqlEnum("documentType", ["agreement", "payment_proof", "closing_statement", "communication", "other"]).default("other").notNull(),
  notes: text("notes"),
  uploadedById: int("uploadedById").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("referral_documents_referral_idx").on(table.referralId),
  index("referral_documents_agent_idx").on(table.referralAgentId),
  index("referral_documents_agreement_idx").on(table.agreementId),
  index("referral_documents_payment_idx").on(table.paymentId),
]);
export type ReferralDocument = typeof referralDocuments.$inferSelect;

export const referralReassignments = mysqlTable("referral_reassignments", {
  id: int("id").autoincrement().primaryKey(),
  priorReferralId: int("priorReferralId").notNull().references(() => referrals.id, { onDelete: "cascade" }),
  newReferralId: int("newReferralId").notNull().references(() => referrals.id, { onDelete: "cascade" }),
  previousReferralAgentId: int("previousReferralAgentId").notNull().references(() => referralAgents.id),
  newReferralAgentId: int("newReferralAgentId").notNull().references(() => referralAgents.id),
  reason: text("reason").notNull(),
  reassignedById: int("reassignedById").references(() => users.id, { onDelete: "set null" }),
  reassignedAt: timestamp("reassignedAt").defaultNow().notNull(),
}, (table) => [
  index("referral_reassignments_prior_idx").on(table.priorReferralId),
  index("referral_reassignments_new_idx").on(table.newReferralId),
]);
export type ReferralReassignment = typeof referralReassignments.$inferSelect;


// ─── Pulse V2: Meeting operating system foundation ───────────────────────────
// Pulse deliberately has no team or group entities. Meeting membership is the
// exclusive visibility boundary for every Pulse meeting-scoped record.
export const pulseProfiles = mysqlTable("pulse_profiles", {
  userId: int("userId").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  platformRole: mysqlEnum("platformRole", ["super_admin", "admin", "member"]).default("member").notNull(),
  timezone: varchar("timezone", { length: 64 }).default("America/New_York").notNull(),
  notificationPrefs: json("notificationPrefs").$type<Record<string, boolean>>(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt"),
});
export type PulseProfile = typeof pulseProfiles.$inferSelect;

export const pulseMeetings = mysqlTable("pulse_meetings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  // This is presentation-only. It may only guide list grouping and defaults at creation.
  label: mysqlEnum("label", ["level_10", "one_on_one", "other"]).notNull(),
  ownerId: int("ownerId").notNull().references(() => users.id),
  administratorId: int("administratorId").notNull().references(() => users.id),
  dayOfWeek: mysqlEnum("dayOfWeek", ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
  startTime: varchar("startTime", { length: 8 }),
  durationMinutes: int("durationMinutes").default(90).notNull(),
  cadence: mysqlEnum("cadence", ["weekly", "biweekly", "monthly", "daily", "ad_hoc"]).default("weekly").notNull(),
  timezone: varchar("timezone", { length: 64 }).default("America/New_York").notNull(),
  reminderDay: mysqlEnum("reminderDay", ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
  reminderTime: varchar("reminderTime", { length: 8 }),
  sectionsEnabled: json("sectionsEnabled").$type<Record<string, boolean>>().notNull(),
  sectionOrder: json("sectionOrder").$type<string[]>().notNull(),
  sectionDurations: json("sectionDurations").$type<Record<string, number>>().notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt"),
}, (table) => [
  index("pulse_meetings_active_idx").on(table.isActive, table.deletedAt),
  index("pulse_meetings_owner_idx").on(table.ownerId, table.deletedAt),
]);
export type PulseMeeting = typeof pulseMeetings.$inferSelect;

export const pulseMeetingMembers = mysqlTable("pulse_meeting_members", {
  id: varchar("id", { length: 36 }).primaryKey(),
  meetingId: varchar("meetingId", { length: 36 }).notNull().references(() => pulseMeetings.id, { onDelete: "cascade" }),
  personId: int("personId").notNull().references(() => users.id, { onDelete: "cascade" }),
  meetingRole: mysqlEnum("meetingRole", ["owner", "administrator", "member"]).default("member").notNull(),
  addedAt: timestamp("addedAt").defaultNow().notNull(),
  addedById: int("addedById").notNull().references(() => users.id),
  removedAt: timestamp("removedAt"),
  deletedAt: timestamp("deletedAt"),
}, (table) => [
  uniqueIndex("pulse_meeting_member_unique").on(table.meetingId, table.personId),
  index("pulse_membership_person_visible_idx").on(table.personId, table.removedAt, table.deletedAt),
  index("pulse_membership_meeting_visible_idx").on(table.meetingId, table.removedAt, table.deletedAt),
]);
export type PulseMeetingMember = typeof pulseMeetingMembers.$inferSelect;

export const pulseWorkItems = mysqlTable("pulse_work_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  type: mysqlEnum("type", ["todo", "issue", "rock"]).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  meetingId: varchar("meetingId", { length: 36 }).references(() => pulseMeetings.id),
  ownerPersonId: int("ownerPersonId").references(() => users.id),
  isPersonal: boolean("isPersonal").generatedAlwaysAs(sql`case when ${sql.identifier("meetingId")} is null then true else false end`),
  assigneeId: int("assigneeId").notNull().references(() => users.id),
  createdById: int("createdById").notNull().references(() => users.id),
  status: varchar("status", { length: 64 }).notNull(),
  // To-dos default to seven days out in the creation API. Overdue is computed at read time
  // from dueDate and status so it is always current without a mutable flag.
  dueDate: date("dueDate"),
  completedAt: timestamp("completedAt"),
  completedById: int("completedById").references(() => users.id, { onDelete: "set null" }),
  carriedOverCount: int("carriedOverCount").default(0).notNull(),
  // Issues are ordered by drag position. solvedNote is required by the API before an
  // issue can transition to solved; resulting to-dos are held in a FK-backed join table.
  priority: int("priority"),
  solvedNote: text("solvedNote"),
  // Rocks use quarter and progress. Milestones, when present, own the percentage.
  quarter: varchar("quarter", { length: 16 }),
  percentComplete: int("percentComplete").default(0).notNull(),
  percentSource: mysqlEnum("percentSource", ["manual", "from_milestones"]).default("manual").notNull(),
  origin: mysqlEnum("origin", ["manual", "cascaded", "ai_proposed", "carried_over"]).default("manual").notNull(),
  isProposed: boolean("isProposed").default(false).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt"),
}, (table) => [
  // The schema—not application code—enforces one and only one ownership path.
  check("pulse_work_items_exactly_one_owner", sql`(${table.meetingId} is null) <> (${table.ownerPersonId} is null)`),
  check("pulse_work_items_percent_complete_range", sql`${table.percentComplete} >= 0 and ${table.percentComplete} <= 100`),
  check("pulse_work_items_status_matches_type", sql`(
    (${table.type} = 'todo' and ${table.status} in ('open', 'done', 'dropped')) or
    (${table.type} = 'issue' and ${table.status} in ('open', 'discussing', 'solved', 'dropped')) or
    (${table.type} = 'rock' and ${table.status} in ('on_track', 'at_risk', 'off_track', 'done', 'dropped'))
  )`),
  index("pulse_work_items_meeting_idx").on(table.meetingId, table.deletedAt, table.sortOrder),
  index("pulse_work_items_owner_idx").on(table.ownerPersonId, table.deletedAt, table.sortOrder),
  index("pulse_work_items_assignee_idx").on(table.assigneeId, table.status, table.deletedAt),
]);
export type PulseWorkItem = typeof pulseWorkItems.$inferSelect;

export const pulseWorkItemMoves = mysqlTable("pulse_work_item_moves", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workItemId: varchar("workItemId", { length: 36 }).notNull().references(() => pulseWorkItems.id, { onDelete: "cascade" }),
  fromMeetingId: varchar("fromMeetingId", { length: 36 }).references(() => pulseMeetings.id),
  toMeetingId: varchar("toMeetingId", { length: 36 }).references(() => pulseMeetings.id),
  movedById: int("movedById").notNull().references(() => users.id),
  reason: text("reason"),
  movedAt: timestamp("movedAt").defaultNow().notNull(),
  deletedAt: timestamp("deletedAt"),
}, (table) => [
  index("pulse_work_item_moves_item_idx").on(table.workItemId, table.movedAt),
]);
export type PulseWorkItemMove = typeof pulseWorkItemMoves.$inferSelect;

// Work items stay unified. The following supporting tables add milestone,
// decision, comment, and notification history without splitting todos, issues, and rocks.
export const pulseRockMilestones = mysqlTable("pulse_rock_milestones", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workItemId: varchar("workItemId", { length: 36 }).notNull().references(() => pulseWorkItems.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 500 }).notNull(),
  dueDate: date("dueDate").notNull(),
  isComplete: boolean("isComplete").default(false).notNull(),
  completedById: int("completedById").references(() => users.id, { onDelete: "set null" }),
  completedAt: timestamp("completedAt"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt"),
}, (table) => [
  index("pulse_rock_milestones_item_idx").on(table.workItemId, table.deletedAt, table.sortOrder),
]);
export type PulseRockMilestone = typeof pulseRockMilestones.$inferSelect;

// A solved issue can create one or more new to-dos. The join preserves an FK to
// each resulting item instead of relying on an unenforceable JSON array.
export const pulseIssueResultingTodos = mysqlTable("pulse_issue_resulting_todos", {
  id: varchar("id", { length: 36 }).primaryKey(),
  issueWorkItemId: varchar("issueWorkItemId", { length: 36 }).notNull().references(() => pulseWorkItems.id, { onDelete: "cascade" }),
  todoWorkItemId: varchar("todoWorkItemId", { length: 36 }).notNull().references(() => pulseWorkItems.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("pulse_issue_resulting_todos_unique").on(table.issueWorkItemId, table.todoWorkItemId),
  index("pulse_issue_resulting_todos_issue_idx").on(table.issueWorkItemId),
]);
export type PulseIssueResultingTodo = typeof pulseIssueResultingTodos.$inferSelect;

export const pulseWorkItemComments = mysqlTable("pulse_work_item_comments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workItemId: varchar("workItemId", { length: 36 }).notNull().references(() => pulseWorkItems.id, { onDelete: "cascade" }),
  authorId: int("authorId").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt"),
}, (table) => [
  index("pulse_work_item_comments_item_idx").on(table.workItemId, table.deletedAt, table.createdAt),
]);
export type PulseWorkItemComment = typeof pulseWorkItemComments.$inferSelect;

export const pulseWorkItemCommentMentions = mysqlTable("pulse_work_item_comment_mentions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  commentId: varchar("commentId", { length: 36 }).notNull().references(() => pulseWorkItemComments.id, { onDelete: "cascade" }),
  mentionedPersonId: int("mentionedPersonId").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("pulse_comment_mention_unique").on(table.commentId, table.mentionedPersonId),
  index("pulse_comment_mention_person_idx").on(table.mentionedPersonId, table.createdAt),
]);
export type PulseWorkItemCommentMention = typeof pulseWorkItemCommentMentions.$inferSelect;

// Prompt 5 will surface these on Mission Control. They remain pending until an
// action is recorded; creating an event never changes meeting membership.
export const pulseWorkItemNotifications = mysqlTable("pulse_work_item_notifications", {
  id: varchar("id", { length: 36 }).primaryKey(),
  recipientId: int("recipientId").notNull().references(() => users.id, { onDelete: "cascade" }),
  workItemId: varchar("workItemId", { length: 36 }).notNull().references(() => pulseWorkItems.id, { onDelete: "cascade" }),
  commentId: varchar("commentId", { length: 36 }).references(() => pulseWorkItemComments.id, { onDelete: "cascade" }),
  notificationType: mysqlEnum("notificationType", ["mention", "rock_done", "quarter_rollover"]).notNull(),
  actionedAt: timestamp("actionedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  deletedAt: timestamp("deletedAt"),
}, (table) => [
  index("pulse_notification_recipient_action_idx").on(table.recipientId, table.actionedAt, table.createdAt),
  index("pulse_notification_item_idx").on(table.workItemId, table.notificationType),
]);
export type PulseWorkItemNotification = typeof pulseWorkItemNotifications.$inferSelect;

export const pulseWorkItemStatusNotes = mysqlTable("pulse_work_item_status_notes", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workItemId: varchar("workItemId", { length: 36 }).notNull().references(() => pulseWorkItems.id, { onDelete: "cascade" }),
  fromStatus: varchar("fromStatus", { length: 64 }),
  toStatus: varchar("toStatus", { length: 64 }).notNull(),
  note: text("note"),
  personId: int("personId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  deletedAt: timestamp("deletedAt"),
}, (table) => [
  index("pulse_work_item_status_notes_item_idx").on(table.workItemId, table.createdAt),
]);
export type PulseWorkItemStatusNote = typeof pulseWorkItemStatusNotes.$inferSelect;

// The pre-existing SavvyOS activity_log is shared by CRM operations. Pulse keeps
// detailed append-only field history separately so no other module's audit schema changes.
export const pulseActivityLog = mysqlTable("pulse_activity_log", {
  id: varchar("id", { length: 36 }).primaryKey(),
  entityType: varchar("entityType", { length: 64 }).notNull(),
  entityId: varchar("entityId", { length: 36 }).notNull(),
  personId: int("personId").notNull().references(() => users.id),
  action: varchar("action", { length: 128 }).notNull(),
  fieldChanged: varchar("fieldChanged", { length: 128 }),
  oldValue: json("oldValue"),
  newValue: json("newValue"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("pulse_activity_entity_idx").on(table.entityType, table.entityId, table.createdAt),
  index("pulse_activity_person_idx").on(table.personId, table.createdAt),
]);
export type PulseActivityLog = typeof pulseActivityLog.$inferSelect;

export const pulseGlossary = mysqlTable("pulse_glossary", {
  id: varchar("id", { length: 36 }).primaryKey(),
  term: varchar("term", { length: 128 }).notNull(),
  plainGloss: varchar("plainGloss", { length: 255 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt"),
}, (table) => [
  uniqueIndex("pulse_glossary_term_unique").on(table.term),
]);
export type PulseGlossary = typeof pulseGlossary.$inferSelect;

// Prompt 3 stores only the small records needed by the meeting dashboard. The
// meeting remains the sole access boundary for every one of these records.
export const pulseScorecardMetrics = mysqlTable("pulse_scorecard_metrics", {
  id: varchar("id", { length: 36 }).primaryKey(),
  meetingId: varchar("meetingId", { length: 36 }).notNull().references(() => pulseMeetings.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  targetValue: int("targetValue"),
  ownerId: int("ownerId").references(() => users.id, { onDelete: "set null" }),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt"),
}, (table) => [index("pulse_scorecard_metric_meeting_idx").on(table.meetingId, table.deletedAt, table.sortOrder)]);
export type PulseScorecardMetric = typeof pulseScorecardMetrics.$inferSelect;

export const pulseScorecardEntries = mysqlTable("pulse_scorecard_entries", {
  id: varchar("id", { length: 36 }).primaryKey(),
  metricId: varchar("metricId", { length: 36 }).notNull().references(() => pulseScorecardMetrics.id, { onDelete: "cascade" }),
  personId: int("personId").notNull().references(() => users.id, { onDelete: "cascade" }),
  periodStart: date("periodStart").notNull(),
  value: int("value").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt"),
}, (table) => [uniqueIndex("pulse_scorecard_entry_period_unique").on(table.metricId, table.personId, table.periodStart), index("pulse_scorecard_entry_metric_idx").on(table.metricId, table.periodStart, table.deletedAt)]);
export type PulseScorecardEntry = typeof pulseScorecardEntries.$inferSelect;

export const pulseMeetingUpdates = mysqlTable("pulse_meeting_updates", {
  id: varchar("id", { length: 36 }).primaryKey(),
  meetingId: varchar("meetingId", { length: 36 }).notNull().references(() => pulseMeetings.id, { onDelete: "cascade" }),
  authorId: int("authorId").notNull().references(() => users.id, { onDelete: "cascade" }),
  updateType: mysqlEnum("updateType", ["segue", "headline"]).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt"),
}, (table) => [index("pulse_meeting_updates_meeting_idx").on(table.meetingId, table.updateType, table.deletedAt, table.createdAt)]);
export type PulseMeetingUpdate = typeof pulseMeetingUpdates.$inferSelect;

export const pulsePersonalInputs = mysqlTable("pulse_personal_inputs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  personId: int("personId").notNull().references(() => users.id, { onDelete: "cascade" }),
  meetingId: varchar("meetingId", { length: 36 }).references(() => pulseMeetings.id, { onDelete: "cascade" }),
  inputKey: varchar("inputKey", { length: 64 }).notNull(),
  weekOf: date("weekOf").notNull(),
  numericValue: int("numericValue"),
  textValue: text("textValue"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt"),
}, (table) => [uniqueIndex("pulse_personal_input_week_unique").on(table.personId, table.meetingId, table.inputKey, table.weekOf), index("pulse_personal_input_person_idx").on(table.personId, table.weekOf, table.deletedAt)]);
export type PulsePersonalInput = typeof pulsePersonalInputs.$inferSelect;

export const pulseCascadingMessages = mysqlTable("pulse_cascading_messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  fromMeetingId: varchar("fromMeetingId", { length: 36 }).notNull().references(() => pulseMeetings.id),
  toMeetingId: varchar("toMeetingId", { length: 36 }).notNull().references(() => pulseMeetings.id),
  body: text("body").notNull(),
  createdById: int("createdById").notNull().references(() => users.id),
  acknowledgedAt: timestamp("acknowledgedAt"),
  acknowledgedById: int("acknowledgedById").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt"),
}, (table) => [index("pulse_cascading_destination_idx").on(table.toMeetingId, table.deletedAt, table.createdAt)]);
export type PulseCascadingMessage = typeof pulseCascadingMessages.$inferSelect;

export const pulseMeetingsArchive = mysqlTable("pulse_meetings_archive", {
  id: varchar("id", { length: 36 }).primaryKey(),
  meetingId: varchar("meetingId", { length: 36 }).notNull().references(() => pulseMeetings.id),
  occurredAt: timestamp("occurredAt").notNull(),
  durationActualMinutes: int("durationActualMinutes"),
  attendeeIds: json("attendeeIds").$type<number[]>().notNull(),
  todosCreated: int("todosCreated").default(0).notNull(),
  todosCompleted: int("todosCompleted").default(0).notNull(),
  issuesCreated: int("issuesCreated").default(0).notNull(),
  issuesResolved: int("issuesResolved").default(0).notNull(),
  rating: int("rating"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt"),
}, (table) => [
  index("pulse_archive_meeting_idx").on(table.meetingId, table.occurredAt),
]);
export type PulseMeetingArchive = typeof pulseMeetingsArchive.$inferSelect;

export const PULSE_SECTION_KEYS = [
  "segue",
  "headlines",
  "scorecard",
  "goals",
  "rocks",
  "todos",
  "issues",
  "cascading",
  "conclude",
] as const;
export type PulseSectionKey = typeof PULSE_SECTION_KEYS[number];

export const PULSE_GLOSSARY_SEEDS = [
  { term: "Rocks", plainGloss: "your big goals this quarter" },
  { term: "Level 10", plainGloss: "your weekly team meeting" },
  { term: "Segue", plainGloss: "a personal or professional win to share" },
] as const;

export const PULSE_MEETING_PRESETS: Record<"level_10" | "one_on_one" | "other", PulseSectionKey[]> = {
  level_10: ["segue", "headlines", "scorecard", "rocks", "todos", "issues", "cascading", "conclude"],
  one_on_one: ["segue", "todos", "issues"],
  other: ["todos", "issues"],
};
