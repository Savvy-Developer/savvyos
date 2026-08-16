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
} from "drizzle-orm/mysql-core";

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
});

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
  // Scope: new_only = only contacts created after publish; existing_and_new = also backfill existing; manual = no auto-trigger
  triggerScope: mysqlEnum("triggerScope", ["new_only", "existing_and_new", "manual"]).default("new_only").notNull(),
  status: mysqlEnum("status", ["active", "paused", "draft"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SmartPlan = typeof smartPlans.$inferSelect;
export type InsertSmartPlan = typeof smartPlans.$inferInsert;

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
  templateId: int("templateId").notNull().references(() => onboardingTemplates.id, { onDelete: "cascade", name: "ott_template_fk" }),
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
  dueDate: timestamp("dueDate").notNull(),
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
});

export const pmTasks = mysqlTable("pm_tasks", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => pmProjects.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 256 }).notNull(),
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
  matchType: mysqlEnum("matchType", ["email", "phone", "name_address", "fuzzy_name"]).notNull(),
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

// ─── Pulse Scope Foundation ───────────────────────────────────────────────────
// Blueprint authority: Pulse business relationships use people; SavvyOS users are only
// authenticated accounts explicitly linked to people. Pulse never infers this from missing fields.
export const pulsePeople = mysqlTable("pulse_people", {
  id: int("id").autoincrement().primaryKey(),
  displayName: varchar("displayName", { length: 255 }).notNull(),
  primaryEmail: varchar("primaryEmail", { length: 320 }),
  timezone: varchar("timezone", { length: 64 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("pulse_people_active_name_idx").on(table.isActive, table.displayName)]);
export type PulsePerson = typeof pulsePeople.$inferSelect;

// An account is a linked SavvyOS authenticated user, not a person-type boolean.
export const pulsePersonAccounts = mysqlTable("pulse_person_accounts", {
  id: int("id").autoincrement().primaryKey(),
  personId: int("personId").notNull().references(() => pulsePeople.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  isPrimary: boolean("isPrimary").default(true).notNull(),
  linkedAt: timestamp("linkedAt").defaultNow().notNull(),
  unlinkedAt: timestamp("unlinkedAt"),
}, (table) => [index("pulse_person_accounts_person_active_idx").on(table.personId, table.unlinkedAt)]);
export type PulsePersonAccount = typeof pulsePersonAccounts.$inferSelect;

// Scope is Pulse's sole current-visibility and provenance container. Archive is a state transition
// here and every policy/query evaluates `isActive` before any role or membership decision.
export const pulseScopes = mysqlTable("pulse_scopes", {
  id: int("id").autoincrement().primaryKey(),
  scopeType: mysqlEnum("scopeType", ["company", "l10", "team", "one_on_one", "private"]).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  membershipPolicy: mysqlEnum("membershipPolicy", ["explicit", "active_accounts", "owner_only"]).default("explicit").notNull(),
  accessPolicy: mysqlEnum("accessPolicy", ["members", "explicit_members", "owner_only"]).default("members").notNull(),
  ownerPersonId: int("ownerPersonId").references(() => pulsePeople.id, { onDelete: "set null" }),
  isActive: boolean("isActive").default(true).notNull(),
  archivedAt: timestamp("archivedAt"),
  archivedByPersonId: int("archivedByPersonId").references(() => pulsePeople.id, { onDelete: "set null" }),
  archiveReason: text("archiveReason"),
  createdByPersonId: int("createdByPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("pulse_scopes_active_type_name_idx").on(table.isActive, table.scopeType, table.name),
  index("pulse_scopes_owner_active_idx").on(table.ownerPersonId, table.isActive),
]);
export type PulseScope = typeof pulseScopes.$inferSelect;

// Membership is normalized once for every scope type. There are no meeting/team/1:1 access tables.
export const pulseScopeMemberships = mysqlTable("pulse_scope_memberships", {
  id: int("id").autoincrement().primaryKey(),
  scopeId: int("scopeId").notNull().references(() => pulseScopes.id, { onDelete: "cascade" }),
  personId: int("personId").notNull().references(() => pulsePeople.id, { onDelete: "cascade" }),
  membershipRole: mysqlEnum("membershipRole", ["owner", "manager", "member", "viewer"]).default("member").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  grantedByPersonId: int("grantedByPersonId").references(() => pulsePeople.id, { onDelete: "set null" }),
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
  revokedByPersonId: int("revokedByPersonId").references(() => pulsePeople.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pulse_scope_memberships_scope_person_unique").on(table.scopeId, table.personId),
  index("pulse_scope_memberships_person_active_idx").on(table.personId, table.isActive, table.scopeId),
  index("pulse_scope_memberships_scope_active_idx").on(table.scopeId, table.isActive),
]);
export type PulseScopeMembership = typeof pulseScopeMemberships.$inferSelect;

// L10 configuration belongs to an L10 scope; it does not create another access model.
export const pulseL10Settings = mysqlTable("pulse_l10_settings", {
  id: int("id").autoincrement().primaryKey(),
  scopeId: int("scopeId").notNull().unique().references(() => pulseScopes.id, { onDelete: "cascade" }),
  scheduleDay: mysqlEnum("scheduleDay", ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]).notNull(),
  scheduleTime: varchar("scheduleTime", { length: 5 }).notNull(),
  timezone: varchar("timezone", { length: 64 }).default("America/New_York").notNull(),
  durationMinutes: int("durationMinutes").default(90).notNull(),
  sectionVisibility: json("sectionVisibility").$type<Record<string, boolean>>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PulseL10Settings = typeof pulseL10Settings.$inferSelect;

// ─── Pulse Meeting Registry, Sessions, and Reports ───────────────────────────
// Registry entries are durable configuration. Sessions and reports never become a second
// source of truth for Scope membership, work ownership, or present-day access.
export const pulseMeetingRegistry = mysqlTable("pulse_meeting_registry", {
  id: int("id").autoincrement().primaryKey(),
  scopeId: int("scopeId").notNull().unique().references(() => pulseScopes.id, { onDelete: "restrict" }),
  meetingKind: mysqlEnum("meetingKind", ["l10", "one_on_one"]).notNull(),
  displayName: varchar("displayName", { length: 255 }).notNull(),
  scheduleDay: mysqlEnum("scheduleDay", ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
  scheduleTime: varchar("scheduleTime", { length: 5 }),
  timezone: varchar("timezone", { length: 64 }).default("America/New_York").notNull(),
  expectedDurationMinutes: int("expectedDurationMinutes").default(90).notNull(),
  minimumValidDurationMinutes: int("minimumValidDurationMinutes").default(15).notNull(),
  sectionVisibility: json("sectionVisibility").$type<Record<string, boolean>>().notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  deactivatedAt: timestamp("deactivatedAt"),
  deactivatedByPersonId: int("deactivatedByPersonId").references(() => pulsePeople.id, { onDelete: "set null" }),
  deactivationReason: text("deactivationReason"),
  createdByPersonId: int("createdByPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("pulse_meeting_registry_active_kind_idx").on(table.isActive, table.meetingKind, table.displayName),
]);
export type PulseMeetingRegistry = typeof pulseMeetingRegistry.$inferSelect;

// A session is one execution record. Configuration and attendance are copied as snapshots so
// later edits cannot rewrite historical execution, but current authorization remains Scope-based.
export const pulseMeetingSessions = mysqlTable("pulse_meeting_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  registryId: int("registryId").notNull().references(() => pulseMeetingRegistry.id, { onDelete: "restrict" }),
  scopeId: int("scopeId").notNull().references(() => pulseScopes.id, { onDelete: "restrict" }),
  status: mysqlEnum("status", ["in_progress", "completed", "auto_closed"]).default("in_progress").notNull(),
  classification: mysqlEnum("classification", ["in_progress", "valid", "auto_closed", "too_short", "stuck"]).default("in_progress").notNull(),
  activeStepKey: varchar("activeStepKey", { length: 64 }),
  agendaState: json("agendaState").$type<Record<string, unknown>>().notNull(),
  registrySnapshot: json("registrySnapshot").$type<Record<string, unknown>>().notNull(),
  attendeeSnapshot: json("attendeeSnapshot").$type<Array<Record<string, unknown>>>().notNull(),
  idsIssueCountSnapshot: int("idsIssueCountSnapshot"),
  ratings: json("ratings").$type<Record<string, unknown>>(),
  completionData: json("completionData").$type<Record<string, unknown>>(),
  startedByPersonId: int("startedByPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  completedByPersonId: int("completedByPersonId").references(() => pulsePeople.id, { onDelete: "set null" }),
  startedAt: timestamp("startedAt").notNull(),
  endedAt: timestamp("endedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("pulse_meeting_sessions_registry_status_idx").on(table.registryId, table.status, table.startedAt),
  index("pulse_meeting_sessions_scope_started_idx").on(table.scopeId, table.startedAt),
]);
export type PulseMeetingSession = typeof pulseMeetingSessions.$inferSelect;

export const pulseSessionStepSnapshots = mysqlTable("pulse_session_step_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull().references(() => pulseMeetingSessions.id, { onDelete: "cascade" }),
  stepKey: varchar("stepKey", { length: 64 }).notNull(),
  ordinal: int("ordinal").notNull(),
  isVisible: boolean("isVisible").notNull(),
  state: mysqlEnum("state", ["pending", "active", "completed", "skipped"]).default("pending").notNull(),
  startedAt: timestamp("startedAt"),
  endedAt: timestamp("endedAt"),
  durationSeconds: int("durationSeconds").default(0).notNull(),
  snapshot: json("snapshot").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pulse_session_step_snapshots_session_step_unique").on(table.sessionId, table.stepKey),
  index("pulse_session_step_snapshots_session_ordinal_idx").on(table.sessionId, table.ordinal),
]);
export type PulseSessionStepSnapshot = typeof pulseSessionStepSnapshots.$inferSelect;

// Session votes are historical vote snapshots. canVote still uses current work-item Scope policy.
export const pulseSessionVotes = mysqlTable("pulse_session_votes", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull().references(() => pulseMeetingSessions.id, { onDelete: "cascade" }),
  issueItemId: int("issueItemId").notNull().references(() => pulseIssues.itemId, { onDelete: "cascade" }),
  voterPersonId: int("voterPersonId").notNull().references(() => pulsePeople.id, { onDelete: "cascade" }),
  voteKind: mysqlEnum("voteKind", ["priority", "rocket"]).default("priority").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("pulse_session_votes_session_issue_voter_kind_unique").on(table.sessionId, table.issueItemId, table.voterPersonId, table.voteKind),
]);
export type PulseSessionVote = typeof pulseSessionVotes.$inferSelect;

// A capture is a session-local confirmation of a canonical item created in the runner. It never
// changes the item's Scope, assignment, or access; destination Scope is recorded for history only.
export const pulseSessionItemCaptures = mysqlTable("pulse_session_item_captures", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull().references(() => pulseMeetingSessions.id, { onDelete: "cascade" }),
  itemId: int("itemId").notNull().references(() => pulseWorkItems.id, { onDelete: "restrict" }),
  destinationScopeId: int("destinationScopeId").notNull().references(() => pulseScopes.id, { onDelete: "restrict" }),
  captureKind: mysqlEnum("captureKind", ["todo", "issue"]).notNull(),
  capturedByPersonId: int("capturedByPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("pulse_session_item_captures_session_time_idx").on(table.sessionId, table.createdAt),
]);
export type PulseSessionItemCapture = typeof pulseSessionItemCaptures.$inferSelect;

// One conclusion report per session. The report payload and row are immutable at the database level.
export const pulseSessionReports = mysqlTable("pulse_session_reports", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull().unique().references(() => pulseMeetingSessions.id, { onDelete: "restrict" }),
  registryId: int("registryId").notNull().references(() => pulseMeetingRegistry.id, { onDelete: "restrict" }),
  scopeId: int("scopeId").notNull().references(() => pulseScopes.id, { onDelete: "restrict" }),
  classification: mysqlEnum("classification", ["valid", "auto_closed", "too_short", "stuck"]).notNull(),
  reportPayload: json("reportPayload").$type<Record<string, unknown>>().notNull(),
  concludedAt: timestamp("concludedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("pulse_session_reports_scope_concluded_idx").on(table.scopeId, table.concludedAt)]);
export type PulseSessionReport = typeof pulseSessionReports.$inferSelect;

// Calendar is the single owner of fiscal, operating-week, holiday, and due-window rules.
export const pulseCalendarConfig = mysqlTable("pulse_calendar_config", {
  id: int("id").autoincrement().primaryKey(),
  timezone: varchar("timezone", { length: 64 }).default("America/New_York").notNull(),
  fiscalYearStartMonth: int("fiscalYearStartMonth").default(1).notNull(),
  operatingWeekStartsOn: int("operatingWeekStartsOn").default(1).notNull(),
  dueWindowDays: int("dueWindowDays").default(7).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  updatedByPersonId: int("updatedByPersonId").references(() => pulsePeople.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PulseCalendarConfig = typeof pulseCalendarConfig.$inferSelect;

export const pulseReportingPeriods = mysqlTable("pulse_reporting_periods", {
  id: int("id").autoincrement().primaryKey(),
  calendarConfigId: int("calendarConfigId").notNull().references(() => pulseCalendarConfig.id, { onDelete: "cascade" }),
  periodType: mysqlEnum("periodType", ["month", "quarter", "year", "custom"]).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  startsOn: date("startsOn").notNull(),
  endsOn: date("endsOn").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("pulse_reporting_periods_calendar_dates_idx").on(table.calendarConfigId, table.startsOn, table.endsOn)]);
export type PulseReportingPeriod = typeof pulseReportingPeriods.$inferSelect;

export const pulseHolidays = mysqlTable("pulse_holidays", {
  id: int("id").autoincrement().primaryKey(),
  calendarConfigId: int("calendarConfigId").notNull().references(() => pulseCalendarConfig.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  holidayDate: date("holidayDate").notNull(),
  isBusinessDay: boolean("isBusinessDay").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("pulse_holidays_calendar_date_unique").on(table.calendarConfigId, table.holidayDate)]);
export type PulseHoliday = typeof pulseHolidays.$inferSelect;

// The append-only event stream is the canonical Pulse activity history. SQL migration constraints
// restrict payload classes by event type; triggers reject UPDATE and DELETE.
export const pulseDomainEvents = mysqlTable("pulse_domain_events", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  eventType: mysqlEnum("eventType", ["scope_created", "scope_archived", "scope_reactivated", "membership_granted", "membership_revoked", "calendar_configured", "reporting_period_created", "holiday_created", "meeting_created", "meeting_deactivated", "meeting_reactivated", "session_started", "session_step_entered", "session_ids_snapshot", "session_item_captured", "session_vote_cast", "session_completed", "session_auto_closed", "session_report_created", "measurable_created", "measurable_placed", "measurable_entry_recorded", "measurable_alert_raised", "strategy_node_created", "strategy_node_status_changed", "strategy_scope_placed", "strategy_raci_updated", "communication_created", "communication_published", "notification_intent_created", "notification_delivered", "notification_suppressed", "communication_acknowledged", "work_item_created", "work_item_moved", "work_item_status_changed", "work_item_assigned", "work_item_comment_added", "work_item_mention_added"]).notNull(),
  scopeId: int("scopeId").references(() => pulseScopes.id, { onDelete: "set null" }),
  actorPersonId: int("actorPersonId").references(() => pulsePeople.id, { onDelete: "set null" }),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
}, (table) => [
  index("pulse_domain_events_scope_time_idx").on(table.scopeId, table.occurredAt),
  index("pulse_domain_events_type_time_idx").on(table.eventType, table.occurredAt),
]);
export type PulseDomainEvent = typeof pulseDomainEvents.$inferSelect;

// ─── Pulse Canonical Work Items ────────────────────────────────────────────────
// The type registry lets an additional subtype be introduced with its own extension table
// without altering the shared work-item base or its scope/access/provenance contract.
export const pulseWorkItemTypes = mysqlTable("pulse_work_item_types", {
  key: varchar("key", { length: 64 }).primaryKey(),
  displayName: varchar("displayName", { length: 128 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PulseWorkItemType = typeof pulseWorkItemTypes.$inferSelect;

export const pulseWorkItems = mysqlTable("pulse_work_items", {
  id: int("id").autoincrement().primaryKey(),
  itemType: varchar("itemType", { length: 64 }).notNull().references(() => pulseWorkItemTypes.key, { onDelete: "restrict" }),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  // Present-day ownership/access context. A move changes this field and writes activity/event history.
  primaryScopeId: int("primaryScopeId").notNull().references(() => pulseScopes.id, { onDelete: "restrict" }),
  assigneePersonId: int("assigneePersonId").references(() => pulsePeople.id, { onDelete: "set null" }),
  status: mysqlEnum("status", ["not_started", "in_progress", "blocked", "complete", "skipped"]).default("not_started").notNull(),
  lastTransitionNote: text("lastTransitionNote"),
  lastTransitionMode: mysqlEnum("lastTransitionMode", ["standard", "runner_bulk_completion"]).default("standard").notNull(),
  blockerType: mysqlEnum("blockerType", ["person", "dependency", "waiting", "external", "decision", "other"]),
  blockerPersonId: int("blockerPersonId").references(() => pulsePeople.id, { onDelete: "set null" }),
  // Immutable creation provenance. It is never rewritten when current scope or assignee changes.
  createdByPersonId: int("createdByPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  createdInSessionId: varchar("createdInSessionId", { length: 128 }),
  createdInScopeId: int("createdInScopeId").references(() => pulseScopes.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("pulse_work_items_scope_status_idx").on(table.primaryScopeId, table.status, table.updatedAt),
  index("pulse_work_items_assignee_status_idx").on(table.assigneePersonId, table.status, table.updatedAt),
  index("pulse_work_items_created_scope_idx").on(table.createdInScopeId, table.createdAt),
]);
export type PulseWorkItem = typeof pulseWorkItems.$inferSelect;

// Normalized optional secondary placement. There are no routing strings or comma-separated scopes.
export const pulseWorkItemPlacements = mysqlTable("pulse_work_item_placements", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull().references(() => pulseWorkItems.id, { onDelete: "cascade" }),
  scopeId: int("scopeId").notNull().references(() => pulseScopes.id, { onDelete: "cascade" }),
  placementKind: mysqlEnum("placementKind", ["secondary", "reference", "notification_context"]).default("secondary").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  addedByPersonId: int("addedByPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pulse_work_item_placements_item_scope_unique").on(table.itemId, table.scopeId),
  index("pulse_work_item_placements_scope_active_idx").on(table.scopeId, table.isActive, table.itemId),
]);
export type PulseWorkItemPlacement = typeof pulseWorkItemPlacements.$inferSelect;

export const pulseWorkItemRecurrences = mysqlTable("pulse_work_item_recurrences", {
  id: int("id").autoincrement().primaryKey(),
  frequency: mysqlEnum("frequency", ["weekly", "monthly", "quarterly", "custom"]).notNull(),
  intervalCount: int("intervalCount").default(1).notNull(),
  rule: json("rule").$type<Record<string, unknown>>().notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdByPersonId: int("createdByPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PulseWorkItemRecurrence = typeof pulseWorkItemRecurrences.$inferSelect;

// Todo-specific state is isolated from the base.
export const pulseTodos = mysqlTable("pulse_todos", {
  itemId: int("itemId").primaryKey().references(() => pulseWorkItems.id, { onDelete: "cascade" }),
  dueDate: date("dueDate"),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  isFlagged: boolean("isFlagged").default(false).notNull(),
  recurrenceId: int("recurrenceId").references(() => pulseWorkItemRecurrences.id, { onDelete: "set null" }),
  completionNote: text("completionNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("pulse_todos_due_priority_idx").on(table.dueDate, table.priority)]);
export type PulseTodo = typeof pulseTodos.$inferSelect;

// Issue-specific state is isolated from the base.
export const pulseIssues = mysqlTable("pulse_issues", {
  itemId: int("itemId").primaryKey().references(() => pulseWorkItems.id, { onDelete: "cascade" }),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  timeframe: mysqlEnum("timeframe", ["this_week", "this_quarter", "this_year", "someday", "unscheduled"]).default("unscheduled").notNull(),
  resolution: text("resolution"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PulseIssue = typeof pulseIssues.$inferSelect;

export const pulseIssueVotes = mysqlTable("pulse_issue_votes", {
  id: int("id").autoincrement().primaryKey(),
  issueItemId: int("issueItemId").notNull().references(() => pulseIssues.itemId, { onDelete: "cascade" }),
  voterPersonId: int("voterPersonId").notNull().references(() => pulsePeople.id, { onDelete: "cascade" }),
  sessionId: varchar("sessionId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("pulse_issue_votes_issue_voter_session_unique").on(table.issueItemId, table.voterPersonId, table.sessionId)]);
export type PulseIssueVote = typeof pulseIssueVotes.$inferSelect;

// Shared inspectable history across todos and issues.
export const pulseWorkItemActivity = mysqlTable("pulse_work_item_activity", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  itemId: int("itemId").notNull().references(() => pulseWorkItems.id, { onDelete: "cascade" }),
  activityType: mysqlEnum("activityType", ["created", "moved", "status_changed", "assigned", "comment_added", "mention_added", "placement_added", "placement_removed"]).notNull(),
  actorPersonId: int("actorPersonId").references(() => pulsePeople.id, { onDelete: "set null" }),
  note: text("note"),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
}, (table) => [
  index("pulse_work_item_activity_item_time_idx").on(table.itemId, table.occurredAt),
  index("pulse_work_item_activity_type_time_idx").on(table.activityType, table.occurredAt),
]);
export type PulseWorkItemActivity = typeof pulseWorkItemActivity.$inferSelect;

export const pulseWorkItemComments = mysqlTable("pulse_work_item_comments", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull().references(() => pulseWorkItems.id, { onDelete: "cascade" }),
  authorPersonId: int("authorPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("pulse_work_item_comments_item_time_idx").on(table.itemId, table.createdAt)]);
export type PulseWorkItemComment = typeof pulseWorkItemComments.$inferSelect;

export const pulseWorkItemMentions = mysqlTable("pulse_work_item_mentions", {
  id: int("id").autoincrement().primaryKey(),
  commentId: int("commentId").references(() => pulseWorkItemComments.id, { onDelete: "cascade" }),
  itemId: int("itemId").notNull().references(() => pulseWorkItems.id, { onDelete: "cascade" }),
  mentionedPersonId: int("mentionedPersonId").notNull().references(() => pulsePeople.id, { onDelete: "cascade" }),
  createdByPersonId: int("createdByPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("pulse_work_item_mentions_person_time_idx").on(table.mentionedPersonId, table.createdAt)]);
export type PulseWorkItemMention = typeof pulseWorkItemMentions.$inferSelect;

// Feature mutations create notification intents; delivery must call the canonical canDeliver policy.
export const pulseWorkItemNotificationIntents = mysqlTable("pulse_work_item_notification_intents", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull().references(() => pulseWorkItems.id, { onDelete: "cascade" }),
  recipientPersonId: int("recipientPersonId").notNull().references(() => pulsePeople.id, { onDelete: "cascade" }),
  intentType: mysqlEnum("intentType", ["assignment", "mention", "status_change", "comment"]).notNull(),
  status: mysqlEnum("status", ["pending", "suppressed", "delivered", "cancelled"]).default("pending").notNull(),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  deliveredAt: timestamp("deliveredAt"),
}, (table) => [index("pulse_work_item_notification_intents_recipient_status_idx").on(table.recipientPersonId, table.status, table.createdAt)]);
export type PulseWorkItemNotificationIntent = typeof pulseWorkItemNotificationIntents.$inferSelect;

// ─── Pulse Measurables, Scorecards, Alerts, and Strategy ──────────────────────
// A measurable is one durable definition. Multiple Scope placements are normalized; current
// visibility always comes from the placement Scope and never from a routing string.
export const pulseMeasurables = mysqlTable("pulse_measurables", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  definition: text("definition"),
  unit: varchar("unit", { length: 64 }).notNull().default("count"),
  cadence: mysqlEnum("cadence", ["weekly", "monthly", "quarterly"]).default("weekly").notNull(),
  aggregation: mysqlEnum("aggregation", ["last", "sum", "average"]).default("last").notNull(),
  direction: mysqlEnum("direction", ["higher_is_better", "lower_is_better"]).default("higher_is_better").notNull(),
  targetValue: decimal("targetValue", { precision: 18, scale: 4 }),
  warningValue: decimal("warningValue", { precision: 18, scale: 4 }),
  criticalValue: decimal("criticalValue", { precision: 18, scale: 4 }),
  ownerPersonId: int("ownerPersonId").references(() => pulsePeople.id, { onDelete: "set null" }),
  alertEnabled: boolean("alertEnabled").default(true).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdByPersonId: int("createdByPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("pulse_measurables_active_owner_idx").on(table.isActive, table.ownerPersonId, table.name),
]);
export type PulseMeasurable = typeof pulseMeasurables.$inferSelect;

export const pulseMeasurablePlacements = mysqlTable("pulse_measurable_placements", {
  id: int("id").autoincrement().primaryKey(),
  measurableId: int("measurableId").notNull().references(() => pulseMeasurables.id, { onDelete: "cascade" }),
  scopeId: int("scopeId").notNull().references(() => pulseScopes.id, { onDelete: "cascade" }),
  displayOrder: int("displayOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  addedByPersonId: int("addedByPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pulse_measurable_placements_measurable_scope_unique").on(table.measurableId, table.scopeId),
  index("pulse_measurable_placements_scope_active_order_idx").on(table.scopeId, table.isActive, table.displayOrder),
]);
export type PulseMeasurablePlacement = typeof pulseMeasurablePlacements.$inferSelect;

// One value cell per measurable/calendar period. Upsert is intentional last-write-wins and keeps
// the latest submitter separate from the durable measurable owner.
export const pulseMeasurableEntries = mysqlTable("pulse_measurable_entries", {
  id: int("id").autoincrement().primaryKey(),
  measurableId: int("measurableId").notNull().references(() => pulseMeasurables.id, { onDelete: "cascade" }),
  periodKey: varchar("periodKey", { length: 96 }).notNull(),
  periodStart: date("periodStart").notNull(),
  periodEnd: date("periodEnd").notNull(),
  value: decimal("value", { precision: 18, scale: 4 }).notNull(),
  note: text("note"),
  submittedByPersonId: int("submittedByPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  submittedAt: timestamp("submittedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pulse_measurable_entries_measurable_period_unique").on(table.measurableId, table.periodKey),
  index("pulse_measurable_entries_period_idx").on(table.periodStart, table.periodEnd),
]);
export type PulseMeasurableEntry = typeof pulseMeasurableEntries.$inferSelect;

// Alerts are a centrally-derived record of threshold evaluation, not another editable KPI state.
export const pulseMeasurableAlerts = mysqlTable("pulse_measurable_alerts", {
  id: int("id").autoincrement().primaryKey(),
  measurableId: int("measurableId").notNull().references(() => pulseMeasurables.id, { onDelete: "cascade" }),
  entryId: int("entryId").notNull().references(() => pulseMeasurableEntries.id, { onDelete: "cascade" }),
  scopeId: int("scopeId").notNull().references(() => pulseScopes.id, { onDelete: "cascade" }),
  alertState: mysqlEnum("alertState", ["warning", "critical"]).notNull(),
  observedValue: decimal("observedValue", { precision: 18, scale: 4 }).notNull(),
  periodKey: varchar("periodKey", { length: 96 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("pulse_measurable_alerts_entry_scope_unique").on(table.entryId, table.scopeId),
  index("pulse_measurable_alerts_scope_state_time_idx").on(table.scopeId, table.alertState, table.createdAt),
]);
export type PulseMeasurableAlert = typeof pulseMeasurableAlerts.$inferSelect;

// One strategy hierarchy powers Vision, Annual Goals, Quarterly Rocks, Milestones, and VTO.
export const pulseStrategyNodes = mysqlTable("pulse_strategy_nodes", {
  id: int("id").autoincrement().primaryKey(),
  nodeType: mysqlEnum("nodeType", ["vision", "annual_goal", "quarterly_rock", "milestone"]).notNull(),
  parentId: int("parentId"),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["not_started", "on_track", "at_risk", "complete", "skipped"]).default("not_started").notNull(),
  startsOn: date("startsOn"),
  dueOn: date("dueOn"),
  sortOrder: int("sortOrder").default(0).notNull(),
  // Exactly one Accountable is mandatory. Responsible is intentionally optional and is the displayed owner when present.
  accountablePersonId: int("accountablePersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  responsiblePersonId: int("responsiblePersonId").references(() => pulsePeople.id, { onDelete: "set null" }),
  createdByPersonId: int("createdByPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  foreignKey({ columns: [table.parentId], foreignColumns: [table.id], name: "pulse_strategy_nodes_parent_fk" }).onDelete("cascade"),
  index("pulse_strategy_nodes_parent_order_idx").on(table.parentId, table.sortOrder),
  index("pulse_strategy_nodes_type_status_idx").on(table.nodeType, table.status, table.dueOn),
]);
export type PulseStrategyNode = typeof pulseStrategyNodes.$inferSelect;

export const pulseStrategyRaci = mysqlTable("pulse_strategy_raci", {
  id: int("id").autoincrement().primaryKey(),
  nodeId: int("nodeId").notNull().references(() => pulseStrategyNodes.id, { onDelete: "cascade" }),
  personId: int("personId").notNull().references(() => pulsePeople.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["responsible", "accountable", "consulted", "informed"]).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  assignedByPersonId: int("assignedByPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pulse_strategy_raci_node_person_role_unique").on(table.nodeId, table.personId, table.role),
  index("pulse_strategy_raci_node_role_active_idx").on(table.nodeId, table.role, table.isActive),
]);
export type PulseStrategyRaci = typeof pulseStrategyRaci.$inferSelect;

// Scope-specific visibility and presentation status never overwrite the canonical node status.
export const pulseStrategyScopePlacements = mysqlTable("pulse_strategy_scope_placements", {
  id: int("id").autoincrement().primaryKey(),
  nodeId: int("nodeId").notNull().references(() => pulseStrategyNodes.id, { onDelete: "cascade" }),
  scopeId: int("scopeId").notNull().references(() => pulseScopes.id, { onDelete: "cascade" }),
  isVisible: boolean("isVisible").default(true).notNull(),
  presentationStatus: mysqlEnum("presentationStatus", ["not_started", "on_track", "at_risk", "complete", "skipped"]),
  addedByPersonId: int("addedByPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pulse_strategy_scope_placements_node_scope_unique").on(table.nodeId, table.scopeId),
  index("pulse_strategy_scope_placements_scope_visible_idx").on(table.scopeId, table.isVisible, table.nodeId),
]);
export type PulseStrategyScopePlacement = typeof pulseStrategyScopePlacements.$inferSelect;

// ─── Pulse Communication Domain ───────────────────────────────────────────────
// Features create these durable communication/intent records; only the delivery worker invokes a transport.
export const pulseCommunications = mysqlTable("pulse_communications", {
  id: int("id").autoincrement().primaryKey(),
  communicationType: mysqlEnum("communicationType", ["cascade", "announcement"]).notNull(),
  sourceScopeId: int("sourceScopeId").notNull().references(() => pulseScopes.id, { onDelete: "restrict" }),
  title: varchar("title", { length: 512 }).notNull(),
  body: text("body").notNull(),
  status: mysqlEnum("status", ["draft", "published", "cancelled"]).default("draft").notNull(),
  createdByPersonId: int("createdByPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  publishedAt: timestamp("publishedAt"),
  cancelledAt: timestamp("cancelledAt"),
}, (table) => [
  index("pulse_communications_source_status_time_idx").on(table.sourceScopeId, table.status, table.publishedAt),
]);
export type PulseCommunication = typeof pulseCommunications.$inferSelect;

export const pulseCommunicationTargets = mysqlTable("pulse_communication_targets", {
  id: int("id").autoincrement().primaryKey(),
  communicationId: int("communicationId").notNull().references(() => pulseCommunications.id, { onDelete: "cascade" }),
  targetScopeId: int("targetScopeId").notNull().references(() => pulseScopes.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("pulse_communication_targets_communication_scope_unique").on(table.communicationId, table.targetScopeId),
  index("pulse_communication_targets_scope_idx").on(table.targetScopeId, table.communicationId),
]);
export type PulseCommunicationTarget = typeof pulseCommunicationTargets.$inferSelect;

// This is frozen at publish time. Audience and delivery APIs read it directly, never expand current Scope membership.
export const pulseCommunicationRecipientLedger = mysqlTable("pulse_communication_recipient_ledger", {
  id: int("id").autoincrement().primaryKey(),
  communicationId: int("communicationId").notNull().references(() => pulseCommunications.id, { onDelete: "cascade" }),
  recipientPersonId: int("recipientPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  targetScopeIds: json("targetScopeIds").$type<number[]>().notNull(),
  frozenAt: timestamp("frozenAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("pulse_comm_recipient_ledger_comm_person_uq").on(table.communicationId, table.recipientPersonId),
  index("pulse_communication_recipient_ledger_recipient_idx").on(table.recipientPersonId, table.communicationId),
]);
export type PulseCommunicationRecipientLedger = typeof pulseCommunicationRecipientLedger.$inferSelect;

export const pulseNotificationIntents = mysqlTable("pulse_notification_intents", {
  id: int("id").autoincrement().primaryKey(),
  communicationId: int("communicationId").notNull().references(() => pulseCommunications.id, { onDelete: "cascade" }),
  recipientLedgerId: int("recipientLedgerId").notNull().references(() => pulseCommunicationRecipientLedger.id, { onDelete: "cascade" }),
  recipientPersonId: int("recipientPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  requestedChannels: json("requestedChannels").$type<Array<"in_app" | "email" | "slack">>().notNull(),
  scheduledFor: timestamp("scheduledFor").defaultNow().notNull(),
  status: mysqlEnum("status", ["pending", "evaluated", "delivered", "suppressed", "cancelled"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  evaluatedAt: timestamp("evaluatedAt"),
}, (table) => [
  uniqueIndex("pulse_notification_intents_communication_recipient_unique").on(table.communicationId, table.recipientPersonId),
  index("pulse_notification_intents_status_schedule_idx").on(table.status, table.scheduledFor),
]);
export type PulseNotificationIntent = typeof pulseNotificationIntents.$inferSelect;

// One delivery ledger, deduplicated across worker retries and across every transport channel.
export const pulseNotificationDeliveries = mysqlTable("pulse_notification_deliveries", {
  id: int("id").autoincrement().primaryKey(),
  intentId: int("intentId").notNull().references(() => pulseNotificationIntents.id, { onDelete: "cascade" }),
  communicationId: int("communicationId").notNull().references(() => pulseCommunications.id, { onDelete: "cascade" }),
  recipientPersonId: int("recipientPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  channel: mysqlEnum("channel", ["in_app", "email", "slack"]).notNull(),
  outcome: mysqlEnum("outcome", ["queued", "delivered", "suppressed", "skipped", "failed"]).notNull(),
  deduplicationKey: varchar("deduplicationKey", { length: 255 }).notNull(),
  reason: text("reason"),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
  attemptedAt: timestamp("attemptedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (table) => [
  uniqueIndex("pulse_notification_deliveries_dedup_unique").on(table.deduplicationKey),
  index("pulse_notification_deliveries_communication_recipient_idx").on(table.communicationId, table.recipientPersonId),
]);
export type PulseNotificationDelivery = typeof pulseNotificationDeliveries.$inferSelect;

// Acknowledgment is explicit, once per person, and unrelated to any future reaction model.
export const pulseCommunicationAcknowledgments = mysqlTable("pulse_communication_acknowledgments", {
  id: int("id").autoincrement().primaryKey(),
  communicationId: int("communicationId").notNull().references(() => pulseCommunications.id, { onDelete: "cascade" }),
  recipientPersonId: int("recipientPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  acknowledgedAt: timestamp("acknowledgedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("pulse_comm_ack_comm_person_uq").on(table.communicationId, table.recipientPersonId),
]);
export type PulseCommunicationAcknowledgment = typeof pulseCommunicationAcknowledgments.$inferSelect;

// ─── Pulse Team-to-L10 Relationships ─────────────────────────────────────────
// A Team is already a Scope. These explicit directional links define only their named behavior;
// they never grant membership, content access, or a cascade audience by themselves.
export const pulseTeamScopeLinks = mysqlTable("pulse_team_scope_links", {
  id: int("id").autoincrement().primaryKey(),
  teamScopeId: int("teamScopeId").notNull().references(() => pulseScopes.id, { onDelete: "cascade" }),
  l10ScopeId: int("l10ScopeId").notNull().references(() => pulseScopes.id, { onDelete: "cascade" }),
  relationshipType: mysqlEnum("relationshipType", ["reports_to", "receives_cascades_from", "work_rollup_from"]).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdByPersonId: int("createdByPersonId").notNull().references(() => pulsePeople.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("pulse_team_scope_links_team_l10_relation_uq").on(table.teamScopeId, table.l10ScopeId, table.relationshipType),
  index("pulse_team_scope_links_team_relation_idx").on(table.teamScopeId, table.relationshipType, table.isActive),
  index("pulse_team_scope_links_l10_relation_idx").on(table.l10ScopeId, table.relationshipType, table.isActive),
]);
export type PulseTeamScopeLink = typeof pulseTeamScopeLinks.$inferSelect;

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
  canViewGoals: boolean("canViewGoals").default(true).notNull(),
  canViewJobBoard: boolean("canViewJobBoard").default(true).notNull(),
  // Dev Tools
  canViewWebhooks: boolean("canViewWebhooks").default(true).notNull(),
  canViewDuplicates: boolean("canViewDuplicates").default(true).notNull(),
  // Resources
  canViewKnowledgeBase: boolean("canViewKnowledgeBase").default(true).notNull(),
  // Formerly hidden — default OFF for new admins
  canViewProjects: boolean("canViewProjects").default(false).notNull(),
  canViewSmartPlans: boolean("canViewSmartPlans").default(false).notNull(),
  canViewEmailNotifications: boolean("canViewEmailNotifications").default(false).notNull(),
  // Passwords
  canViewPasswords: boolean("canViewPasswords").default(true).notNull(),
  // Pulse configuration — default OFF; meeting-level access remains separately normalized.
  canViewPulse: boolean("canViewPulse").default(false).notNull(),
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
    // Timestamps
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("aircall_calls_aircall_id_unique").on(table.aircallCallId),
    index("aircall_calls_contact_idx").on(table.contactId, table.startedAt),
    index("aircall_calls_started_at_idx").on(table.startedAt),
    index("aircall_calls_recording_recovery_idx").on(table.recordingRecoveryAttempts, table.recordingRecoveryLastAttemptAt),
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


// ─── Work Management (Projects & Plans) ──────────────────────────────────────
// This model is intentionally separate from the legacy pm_* tracker so existing
// project records remain available while the richer workspace is introduced.

export const workTeams = mysqlTable("work_teams", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  privacy: mysqlEnum("privacy", ["public_to_workspace", "request_to_join", "private"]).notNull().default("public_to_workspace"),
  createdById: int("createdById").notNull().references(() => users.id, { onDelete: "restrict" }),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_teams_privacy_idx").on(table.privacy, table.deletedAt),
]);
export type WorkTeam = typeof workTeams.$inferSelect;

export const workTeamMembers = mysqlTable("work_team_members", {
  id: int("id").autoincrement().primaryKey(),
  teamId: int("teamId").notNull().references(() => workTeams.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessLevel: mysqlEnum("accessLevel", ["admin", "editor", "commenter", "viewer"]).notNull().default("viewer"),
  requestedAt: timestamp("requestedAt"),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("work_team_members_team_user_unique").on(table.teamId, table.userId),
  index("work_team_members_user_idx").on(table.userId, table.deletedAt),
]);

export const workProjects = mysqlTable("work_projects", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  descriptionJson: json("descriptionJson").$type<Record<string, unknown>>(),
  descriptionPlainText: text("descriptionPlainText"),
  teamId: int("teamId").references(() => workTeams.id, { onDelete: "set null" }),
  ownerId: int("ownerId").references(() => users.id, { onDelete: "set null" }),
  privacy: mysqlEnum("privacy", ["public_to_team", "private_to_members", "public_to_workspace"]).notNull().default("public_to_team"),
  defaultAccessLevel: mysqlEnum("defaultAccessLevel", ["admin", "editor", "commenter", "viewer"]).notNull().default("editor"),
  defaultView: mysqlEnum("defaultView", ["list", "board", "timeline", "calendar", "overview", "files"]).notNull().default("list"),
  color: varchar("color", { length: 32 }),
  icon: varchar("icon", { length: 64 }),
  externalGoalRef: text("externalGoalRef"),
  startOn: date("startOn"),
  startAt: timestamp("startAt"),
  dueOn: date("dueOn"),
  dueAt: timestamp("dueAt"),
  archivedAt: timestamp("archivedAt"),
  deletedAt: timestamp("deletedAt"),
  createdById: int("createdById").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_projects_team_idx").on(table.teamId, table.deletedAt),
  index("work_projects_owner_idx").on(table.ownerId, table.deletedAt),
  index("work_projects_name_idx").on(table.name),
]);
export type WorkProject = typeof workProjects.$inferSelect;

export const workProjectMembers = mysqlTable("work_project_members", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => workProjects.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessLevel: mysqlEnum("accessLevel", ["admin", "editor", "commenter", "viewer"]).notNull().default("viewer"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("work_project_members_project_user_unique").on(table.projectId, table.userId),
  index("work_project_members_user_idx").on(table.userId, table.deletedAt),
]);

export const workProjectSections = mysqlTable("work_project_sections", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => workProjects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  position: varchar("position", { length: 64 }).notNull().default("a0"),
  isCollapsed: boolean("isCollapsed").notNull().default(false),
  deletedAt: timestamp("deletedAt"),
  createdById: int("createdById").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_project_sections_order_idx").on(table.projectId, table.position, table.deletedAt),
]);

export const workCustomFields = mysqlTable("work_custom_fields", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  fieldType: mysqlEnum("fieldType", ["text", "number", "date", "enum", "multi_enum", "person", "people", "boolean", "url", "formula", "custom_id", "reference"]).notNull(),
  enumOptions: json("enumOptions").$type<Array<{ id: string; label: string; color?: string }>>(),
  config: json("config").$type<Record<string, unknown>>(),
  createdById: int("createdById").notNull().references(() => users.id, { onDelete: "restrict" }),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_custom_fields_name_idx").on(table.name, table.deletedAt),
]);

export const workCustomFieldEnumOptions = mysqlTable("work_custom_field_enum_options", {
  id: int("id").autoincrement().primaryKey(),
  customFieldId: int("customFieldId").notNull().references(() => workCustomFields.id, { onDelete: "cascade" }),
  optionKey: varchar("optionKey", { length: 120 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 32 }),
  enabled: boolean("enabled").notNull().default(true),
  position: varchar("position", { length: 64 }).notNull().default("a0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("work_custom_field_enum_option_unique").on(table.customFieldId, table.optionKey),
  index("work_custom_field_enum_option_order_idx").on(table.customFieldId, table.position),
]);

export const workProjectCustomFields = mysqlTable("work_project_custom_fields", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => workProjects.id, { onDelete: "cascade" }),
  customFieldId: int("customFieldId").notNull().references(() => workCustomFields.id, { onDelete: "cascade" }),
  position: varchar("position", { length: 64 }).notNull().default("a0"),
  isRequired: boolean("isRequired").notNull().default(false),
  isImportant: boolean("isImportant").notNull().default(false),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("work_project_custom_fields_project_field_unique").on(table.projectId, table.customFieldId),
]);

export const workTasks = mysqlTable("work_tasks", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  name: varchar("name", { length: 512 }).notNull(),
  descriptionJson: json("descriptionJson").$type<Record<string, unknown>>(),
  descriptionPlainText: text("descriptionPlainText"),
  parentTaskId: int("parentTaskId"),
  taskType: mysqlEnum("taskType", ["default_task", "milestone", "approval"]).notNull().default("default_task"),
  completionStatus: mysqlEnum("completionStatus", ["incomplete", "complete", "cancelled"]).notNull().default("incomplete"),
  completedAt: timestamp("completedAt"),
  completedById: int("completedById").references(() => users.id, { onDelete: "set null" }),
  startOn: date("startOn"),
  startAt: timestamp("startAt"),
  dueOn: date("dueOn"),
  dueAt: timestamp("dueAt"),
  actualTimeMinutes: int("actualTimeMinutes"),
  position: varchar("position", { length: 64 }).notNull().default("a0"),
  createdById: int("createdById").notNull().references(() => users.id, { onDelete: "restrict" }),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_tasks_parent_position_idx").on(table.parentTaskId, table.position, table.deletedAt),
  index("work_tasks_due_idx").on(table.dueOn, table.dueAt, table.deletedAt),
  index("work_tasks_status_idx").on(table.completionStatus, table.deletedAt),
  index("work_tasks_name_idx").on(table.name),
]);
export type WorkTask = typeof workTasks.$inferSelect;

export const workTaskProjectMemberships = mysqlTable("work_task_project_memberships", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull().references(() => workTasks.id, { onDelete: "cascade" }),
  projectId: int("projectId").notNull().references(() => workProjects.id, { onDelete: "cascade" }),
  sectionId: int("sectionId").references(() => workProjectSections.id, { onDelete: "set null" }),
  position: varchar("position", { length: 64 }).notNull().default("a0"),
  deletedAt: timestamp("deletedAt"),
  addedById: int("addedById").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("work_task_project_memberships_task_project_unique").on(table.taskId, table.projectId),
  index("work_task_project_memberships_project_section_order_idx").on(table.projectId, table.sectionId, table.position, table.deletedAt),
]);

export const workTaskAssignees = mysqlTable("work_task_assignees", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull().references(() => workTasks.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("work_task_assignees_task_user_unique").on(table.taskId, table.userId),
  index("work_task_assignees_user_idx").on(table.userId, table.deletedAt),
]);

export const workTaskFollowers = mysqlTable("work_task_followers", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull().references(() => workTasks.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("work_task_followers_task_user_unique").on(table.taskId, table.userId),
]);

export const workTaskDependencies = mysqlTable("work_task_dependencies", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull().references(() => workTasks.id, { onDelete: "cascade" }),
  dependsOnTaskId: int("dependsOnTaskId").notNull().references(() => workTasks.id, { onDelete: "cascade" }),
  dependencyType: mysqlEnum("dependencyType", ["blocked_by", "blocking"]).notNull().default("blocked_by"),
  createdById: int("createdById").notNull().references(() => users.id, { onDelete: "restrict" }),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("work_task_dependencies_unique").on(table.taskId, table.dependsOnTaskId),
]);

export const workTaskCustomFieldValues = mysqlTable("work_task_custom_field_values", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull().references(() => workTasks.id, { onDelete: "cascade" }),
  customFieldId: int("customFieldId").notNull().references(() => workCustomFields.id, { onDelete: "cascade" }),
  // Legacy generic payload retained during the non-destructive typed-field migration.
  value: json("value").$type<unknown>(),
  plainTextValue: text("plainTextValue"),
  valueText: text("valueText"),
  valueNumber: decimal("valueNumber", { precision: 20, scale: 6 }),
  valueDate: date("valueDate"),
  valueDateTime: timestamp("valueDateTime"),
  valueEnumOptionId: varchar("valueEnumOptionId", { length: 120 }),
  valueEnumOptionIds: json("valueEnumOptionIds").$type<string[]>(),
  valuePeople: json("valuePeople").$type<number[]>(),
  valueRefType: varchar("valueRefType", { length: 32 }),
  valueRefId: int("valueRefId"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("work_task_custom_field_values_task_field_unique").on(table.taskId, table.customFieldId),
]);

export const workTags = mysqlTable("work_tags", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  color: varchar("color", { length: 32 }),
  createdById: int("createdById").notNull().references(() => users.id, { onDelete: "restrict" }),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_tags_name_idx").on(table.name, table.deletedAt),
]);

export const workTaskTags = mysqlTable("work_task_tags", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull().references(() => workTasks.id, { onDelete: "cascade" }),
  tagId: int("tagId").notNull().references(() => workTags.id, { onDelete: "cascade" }),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("work_task_tags_task_tag_unique").on(table.taskId, table.tagId),
]);

export const workStories = mysqlTable("work_stories", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").references(() => workTasks.id, { onDelete: "cascade" }),
  projectId: int("projectId").references(() => workProjects.id, { onDelete: "cascade" }),
  portfolioId: int("portfolioId"),
  actorId: int("actorId").references(() => users.id, { onDelete: "set null" }),
  storyType: mysqlEnum("storyType", ["comment", "assigned", "due_date_changed", "section_changed", "completed", "attachment_added", "custom_field_changed", "created", "updated", "dependency_added", "member_added", "status_update"]).notNull(),
  contentJson: json("contentJson").$type<Record<string, unknown>>(),
  contentPlainText: text("contentPlainText"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  editedAt: timestamp("editedAt"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("work_stories_task_created_idx").on(table.taskId, table.createdAt),
  index("work_stories_project_created_idx").on(table.projectId, table.createdAt),
]);

export const workStoryReactions = mysqlTable("work_story_reactions", {
  id: int("id").autoincrement().primaryKey(),
  storyId: int("storyId").notNull().references(() => workStories.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  emoji: varchar("emoji", { length: 32 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("work_story_reactions_story_user_emoji_unique").on(table.storyId, table.userId, table.emoji),
  index("work_story_reactions_story_idx").on(table.storyId, table.createdAt),
]);

export const workAttachments = mysqlTable("work_attachments", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").references(() => workTasks.id, { onDelete: "cascade" }),
  projectId: int("projectId").references(() => workProjects.id, { onDelete: "cascade" }),
  storyId: int("storyId").references(() => workStories.id, { onDelete: "set null" }),
  fileName: varchar("fileName", { length: 512 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 1024 }),
  mimeType: varchar("mimeType", { length: 128 }),
  byteSize: bigint("byteSize", { mode: "number" }),
  uploadedById: int("uploadedById").notNull().references(() => users.id, { onDelete: "restrict" }),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_attachments_task_idx").on(table.taskId, table.deletedAt),
  index("work_attachments_project_idx").on(table.projectId, table.deletedAt),
]);

export const workPortfolios = mysqlTable("work_portfolios", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  descriptionJson: json("descriptionJson").$type<Record<string, unknown>>(),
  descriptionPlainText: text("descriptionPlainText"),
  ownerId: int("ownerId").references(() => users.id, { onDelete: "set null" }),
  privacy: mysqlEnum("privacy", ["private_to_members", "public_to_workspace"]).notNull().default("private_to_members"),
  deletedAt: timestamp("deletedAt"),
  createdById: int("createdById").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_portfolios_owner_idx").on(table.ownerId, table.deletedAt),
]);

export const workPortfolioMembers = mysqlTable("work_portfolio_members", {
  id: int("id").autoincrement().primaryKey(),
  portfolioId: int("portfolioId").notNull().references(() => workPortfolios.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessLevel: mysqlEnum("accessLevel", ["admin", "editor", "commenter", "viewer"]).notNull().default("viewer"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("work_portfolio_members_portfolio_user_unique").on(table.portfolioId, table.userId),
]);

export const workPortfolioItems = mysqlTable("work_portfolio_items", {
  id: int("id").autoincrement().primaryKey(),
  portfolioId: int("portfolioId").notNull().references(() => workPortfolios.id, { onDelete: "cascade" }),
  projectId: int("projectId").references(() => workProjects.id, { onDelete: "cascade" }),
  childPortfolioId: int("childPortfolioId"),
  position: varchar("position", { length: 64 }).notNull().default("a0"),
  deletedAt: timestamp("deletedAt"),
  createdById: int("createdById").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_portfolio_items_order_idx").on(table.portfolioId, table.position, table.deletedAt),
]);

export const workStatusUpdates = mysqlTable("work_status_updates", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").references(() => workProjects.id, { onDelete: "cascade" }),
  portfolioId: int("portfolioId").references(() => workPortfolios.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["on_track", "at_risk", "off_track", "complete"]).notNull().default("on_track"),
  title: varchar("title", { length: 255 }),
  bodyJson: json("bodyJson").$type<Record<string, unknown>>(),
  bodyPlainText: text("bodyPlainText"),
  authorId: int("authorId").notNull().references(() => users.id, { onDelete: "restrict" }),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_status_updates_project_idx").on(table.projectId, table.createdAt),
  index("work_status_updates_portfolio_idx").on(table.portfolioId, table.createdAt),
]);

export const workTemplates = mysqlTable("work_templates", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  templateType: mysqlEnum("templateType", ["project", "task"]).notNull(),
  description: text("description"),
  definition: json("definition").$type<Record<string, unknown>>().notNull(),
  teamId: int("teamId").references(() => workTeams.id, { onDelete: "set null" }),
  createdById: int("createdById").notNull().references(() => users.id, { onDelete: "restrict" }),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_templates_type_team_idx").on(table.templateType, table.teamId, table.deletedAt),
]);

export const workForms = mysqlTable("work_forms", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  projectId: int("projectId").notNull().references(() => workProjects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isPublic: boolean("isPublic").notNull().default(false),
  isActive: boolean("isActive").notNull().default(true),
  targetSectionId: int("targetSectionId").references(() => workProjectSections.id, { onDelete: "set null" }),
  createdById: int("createdById").notNull().references(() => users.id, { onDelete: "restrict" }),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_forms_project_idx").on(table.projectId, table.isActive, table.deletedAt),
]);

export const workFormFields = mysqlTable("work_form_fields", {
  id: int("id").autoincrement().primaryKey(),
  formId: int("formId").notNull().references(() => workForms.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 255 }).notNull(),
  fieldType: mysqlEnum("fieldType", ["short_text", "long_text", "date", "number", "single_select", "multi_select", "person", "attachment"]).notNull(),
  options: json("options").$type<string[]>(),
  taskField: varchar("taskField", { length: 64 }),
  customFieldId: int("customFieldId").references(() => workCustomFields.id, { onDelete: "set null" }),
  isRequired: boolean("isRequired").notNull().default(false),
  position: varchar("position", { length: 64 }).notNull().default("a0"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_form_fields_order_idx").on(table.formId, table.position, table.deletedAt),
]);

export const workRules = mysqlTable("work_rules", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  projectId: int("projectId").notNull().references(() => workProjects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  trigger: mysqlEnum("trigger", ["task_added", "task_completed", "task_moved", "due_date_changed", "custom_field_changed", "form_submitted"]).notNull(),
  conditions: json("conditions").$type<Array<Record<string, unknown>>>().notNull(),
  isActive: boolean("isActive").notNull().default(true),
  createdById: int("createdById").notNull().references(() => users.id, { onDelete: "restrict" }),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_rules_project_trigger_idx").on(table.projectId, table.trigger, table.isActive, table.deletedAt),
]);

export const workRuleActions = mysqlTable("work_rule_actions", {
  id: int("id").autoincrement().primaryKey(),
  ruleId: int("ruleId").notNull().references(() => workRules.id, { onDelete: "cascade" }),
  actionType: mysqlEnum("actionType", ["move_to_section", "assign_user", "set_due_date", "set_custom_field", "add_follower", "create_task", "mark_complete"]).notNull(),
  config: json("config").$type<Record<string, unknown>>().notNull(),
  position: varchar("position", { length: 64 }).notNull().default("a0"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_rule_actions_order_idx").on(table.ruleId, table.position, table.deletedAt),
]);

export const workRuleRuns = mysqlTable("work_rule_runs", {
  id: int("id").autoincrement().primaryKey(),
  ruleId: int("ruleId").notNull().references(() => workRules.id, { onDelete: "cascade" }),
  projectId: int("projectId").notNull().references(() => workProjects.id, { onDelete: "cascade" }),
  taskId: int("taskId").references(() => workTasks.id, { onDelete: "set null" }),
  triggeredById: int("triggeredById").references(() => users.id, { onDelete: "set null" }),
  trigger: mysqlEnum("trigger", ["task_added", "task_completed", "task_moved", "due_date_changed", "custom_field_changed", "form_submitted"]).notNull(),
  status: mysqlEnum("status", ["succeeded", "failed"]).notNull(),
  event: json("event").$type<Record<string, unknown>>(),
  actionResults: json("actionResults").$type<Array<Record<string, unknown>>>(),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (table) => [
  index("work_rule_runs_project_started_idx").on(table.projectId, table.startedAt),
  index("work_rule_runs_rule_started_idx").on(table.ruleId, table.startedAt),
  index("work_rule_runs_task_started_idx").on(table.taskId, table.startedAt),
]);

export const workTaskRecurrences = mysqlTable("work_task_recurrences", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull().references(() => workTasks.id, { onDelete: "cascade" }),
  frequency: mysqlEnum("frequency", ["daily", "weekly", "monthly", "custom"]).notNull(),
  intervalValue: int("intervalValue").notNull().default(1),
  weekDays: json("weekDays").$type<number[]>(),
  endsOn: date("endsOn"),
  nextOccurrenceOn: date("nextOccurrenceOn"),
  isActive: boolean("isActive").notNull().default(true),
  createdById: int("createdById").notNull().references(() => users.id, { onDelete: "restrict" }),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_task_recurrences_next_idx").on(table.isActive, table.nextOccurrenceOn, table.deletedAt),
]);

export const workMyTaskSections = mysqlTable("work_my_task_sections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  position: varchar("position", { length: 64 }).notNull().default("a0"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_my_task_sections_user_order_idx").on(table.userId, table.position, table.deletedAt),
]);

export const workMyTaskMemberships = mysqlTable("work_my_task_memberships", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  taskId: int("taskId").notNull().references(() => workTasks.id, { onDelete: "cascade" }),
  sectionId: int("sectionId").references(() => workMyTaskSections.id, { onDelete: "set null" }),
  position: varchar("position", { length: 64 }).notNull().default("a0"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("work_my_task_memberships_user_task_unique").on(table.userId, table.taskId),
  index("work_my_task_memberships_user_order_idx").on(table.userId, table.sectionId, table.position, table.deletedAt),
]);

export const workNotifications = mysqlTable("work_notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  taskId: int("taskId").references(() => workTasks.id, { onDelete: "cascade" }),
  projectId: int("projectId").references(() => workProjects.id, { onDelete: "cascade" }),
  storyId: int("storyId").references(() => workStories.id, { onDelete: "cascade" }),
  notificationType: mysqlEnum("notificationType", ["mention", "assignment", "comment", "follower", "due", "status_update"]).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  body: text("body"),
  readAt: timestamp("readAt"),
  deletedAt: timestamp("deletedAt"),
  snoozedUntil: timestamp("snoozedUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_notifications_user_read_idx").on(table.userId, table.readAt, table.createdAt, table.deletedAt),
  index("work_notifications_user_snoozed_idx").on(table.userId, table.snoozedUntil, table.deletedAt),
]);

export const workSavedViews = mysqlTable("work_saved_views", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  projectId: int("projectId").references(() => workProjects.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  viewType: mysqlEnum("viewType", ["list", "board", "timeline", "calendar", "overview", "files", "my_tasks", "search"]).notNull(),
  filters: json("filters").$type<Record<string, unknown>>().notNull(),
  config: json("config").$type<Record<string, unknown>>(),
  isShared: boolean("isShared").notNull().default(false),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("work_saved_views_user_project_idx").on(table.userId, table.projectId, table.deletedAt),
]);

export type WorkProjectSection = typeof workProjectSections.$inferSelect;
export type WorkTaskProjectMembership = typeof workTaskProjectMemberships.$inferSelect;
export type WorkStory = typeof workStories.$inferSelect;
export type WorkPortfolio = typeof workPortfolios.$inferSelect;
export type WorkTemplate = typeof workTemplates.$inferSelect;
export type WorkForm = typeof workForms.$inferSelect;
export type WorkRule = typeof workRules.$inferSelect;
