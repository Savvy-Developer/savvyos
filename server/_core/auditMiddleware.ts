/**
 * Global Audit Trail Middleware
 *
 * Automatically logs EVERY tRPC mutation to the activity_log table.
 * This provides a complete audit trail of all user actions in SavvyOS.
 *
 * Audit writes occur after successful mutations. Any audit persistence failure
 * is contained so it can never fail the user action.
 */
import { getDb } from "../db";
import { activityLog } from "../../drizzle/schema";

// ─── Paths that are already manually logged (avoid duplicates) ─────────────────
// These procedures already call logActivity() with rich details inside their
// resolver bodies. The global middleware will skip them to avoid double-logging.
const MANUALLY_LOGGED_PATHS = new Set([
  // contacts
  "contacts.create",
  "contacts.update",
  "contacts.archive",
  "contacts.bulkAssignIsa",
  "contacts.bulkUpload",
  // agent connections
  "agentConnections.create",
  "agentConnections.update",
  // listings
  "listings.create",
  "listings.update",
  "listings.terminate",
  "listings.markExpired",
  "listings.backToActive",
  "listings.convertToTransaction",
  "listings.delete",
  "listings.bulkUpload",
  "listings.addNote",
  "listings.updateNote",
  "listings.deleteNote",
  // transactions
  "transactions.create",
  "transactions.update",
  "transactions.addPayout",
  "transactions.updatePayout",
  "transactions.uploadDocument",
  "transactions.bulkUploadDocuments",
  "transactions.addNote",
  "transactions.recalculateSplits",
  "transactions.updatePayoutOverride",
  "transactions.bulkUpload",
  // tasks
  "tasks.create",
  "tasks.update",
  "tasks.complete",
  "tasks.addNote",
  // properties
  "properties.create",
  "properties.update",
  "properties.bulkUpload",
  "properties.createProforma",
  "properties.updateProforma",
  "properties.deleteProforma",
  // smart plans
  "smartPlans.create",
  "smartPlans.createDraft",
  "smartPlans.publish",
  "smartPlans.update",
  "smartPlans.delete",
  // coaching
  "coaching.sessions.create",
  "coaching.sessions.update",
  "coaching.sessions.complete",
  "coaching.sessions.cancel",
  "coaching.goals.create",
  "coaching.goals.update",
  // market match
  "marketMatch.startSession",
  "marketMatch.completeSession",
  // users (already logged)
  "users.uploadDocument",
  "users.updateEmailSignatureForUser",
  "users.generateCoachingSummary",
  // voice
  "voice.transcribe",
  // auth login
  "auth.login",
  // pipeline email
  "pipelineEmail.send",
]);

// ─── Paths to completely ignore (read-only side effects, health checks, etc.) ──
const IGNORED_PATHS = new Set([
  "auth.me",
  "auth.devLogin",
  "system.health",
  "emailTest.sendAll",
  "emailTest.sendOne",
]);

// ─── Entity type inference from path ────────────────────────────────────────────
function inferEntityType(path: string): string {
  const root = path.split(".")[0];
  const ENTITY_MAP: Record<string, string> = {
    contacts: "contact",
    agentConnections: "agent_connection",
    connectionRequests: "connection_request",
    properties: "property",
    transactions: "transaction",
    tasks: "task",
    documents: "document",
    communications: "communication",
    users: "user",
    groups: "group",
    payouts: "payout",
    leadSources: "lead_source",
    contactProperties: "contact_property",
    approvalRequests: "approval_request",
    listings: "listing",
    smartPlans: "smart_plan",
    markets: "market",
    feedback: "feedback",
    onboarding: "onboarding",
    leadership: "leadership",
    commissionExceptions: "commission_exception",
    marketMatch: "market_match",
    marketingRequests: "marketing_request",
    pm: "project",
    kb: "knowledge_base",
    agentSupport: "agent_support",
    duplicates: "duplicate",
    webhooks: "webhook",
    ghlSync: "ghl_sync",
    pipelineEmail: "pipeline_email",
    permissions: "permissions",
    emailBehaviors: "email_behavior",
    aircall: "aircall",
    jobBoard: "job_board",
    talentProfile: "talent_profile",
    coaching: "coaching",
    emailNotifications: "email_notification",
    emailTemplates: "email_template",
    auth: "auth",
  };
  return ENTITY_MAP[root] ?? root;
}

// ─── Extract entity ID from input ──────────────────────────────────────────────
function extractEntityId(input: unknown): number | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  // Common patterns for entity ID in input
  if (typeof obj.id === "number") return obj.id;
  if (typeof obj.contactId === "number") return obj.contactId;
  if (typeof obj.transactionId === "number") return obj.transactionId;
  if (typeof obj.propertyId === "number") return obj.propertyId;
  if (typeof obj.listingId === "number") return obj.listingId;
  if (typeof obj.taskId === "number") return obj.taskId;
  if (typeof obj.userId === "number") return obj.userId;
  if (typeof obj.agentConnectionId === "number") return obj.agentConnectionId;
  if (typeof obj.pairId === "number") return obj.pairId;
  if (typeof obj.projectId === "number") return obj.projectId;
  return null;
}

// ─── Extract related contact ID from input ──────────────────────────────────────
function extractRelatedContactId(input: unknown, entityType: string): number | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  // Direct contact references
  if (typeof obj.contactId === "number") return obj.contactId;
  if (typeof obj.relatedContactId === "number") return obj.relatedContactId;
  // For contact entity type, the entity itself IS the contact
  if (entityType === "contact" && typeof obj.id === "number") return obj.id;
  return null;
}

// ─── Sanitize input for storage (remove large/sensitive fields) ─────────────────
function sanitizeInput(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  const SKIP_FIELDS = new Set([
    "password", "passwordHash", "newPassword", "confirmPassword", "currentPassword",
    "token", "accessToken", "refreshToken", "apiKey", "secret", "authorization",
    "body", "content", "formData", "rows", "html", "bodyText", "fileBase64",
    "transcription", "audioFileUrl",
  ]);
  const MAX_FIELDS = 15;
  let count = 0;
  for (const [key, value] of Object.entries(obj)) {
    if (count >= MAX_FIELDS) break;
    if (SKIP_FIELDS.has(key) || /password|token|secret|api[_-]?key|authorization/i.test(key)) continue;
    if (typeof value === "string" && value.length > 200) {
      sanitized[key] = value.slice(0, 200) + "…";
    } else if (Array.isArray(value) && value.length > 10) {
      sanitized[key] = `[${value.length} items]`;
    } else {
      sanitized[key] = value;
    }
    count++;
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

// ─── Human-readable action name from path ───────────────────────────────────────
function pathToAction(path: string): string {
  // "contacts.delete" → "contact_deleted"
  // "agentConnections.create" → "agent_connection_created"
  // "connectionRequests.approve" → "connection_request_approved"
  const parts = path.split(".");
  const entityPart = inferEntityType(path);
  const verb = parts[parts.length - 1];

  // Map common verbs to past tense
  const VERB_MAP: Record<string, string> = {
    create: "created",
    update: "updated",
    delete: "deleted",
    remove: "removed",
    add: "added",
    approve: "approved",
    deny: "denied",
    reject: "rejected",
    archive: "archived",
    link: "linked",
    unlink: "unlinked",
    merge: "merged",
    dismiss: "dismissed",
    mark: "marked",
    markPaid: "marked_paid",
    toggle: "toggled",
    review: "reviewed",
    cancel: "cancelled",
    publish: "published",
    send: "sent",
    upsert: "updated",
    save: "saved",
    upload: "uploaded",
    respond: "responded",
    start: "started",
    stop: "stopped",
    complete: "completed",
    reset: "reset",
    bulkEnrollExisting: "bulk_enrolled",
    updateLabel: "label_updated",
    updateStatus: "status_updated",
    updateSplit: "split_updated",
    simulateAs: "simulated_as",
    stopSimulation: "simulation_stopped",
    adminSetPassword: "admin_set_password",
    forgotPassword: "forgot_password",
    resetPassword: "password_reset",
    workAsAgent: "work_as_agent_started",
    stopWorkingAsAgent: "work_as_agent_stopped",
    addAssignment: "assignment_added",
    removeAssignment: "assignment_removed",
    bulkUpdatePermissions: "permissions_updated",
    triggerSync: "sync_triggered",
    generateReport: "report_generated",
    generateAiInsight: "ai_insight_generated",
    addOwnership: "ownership_added",
    updateProforma: "proforma_updated",
    deleteProforma: "proforma_deleted",
    setVisibility: "visibility_set",
    setStatus: "status_set",
    createSession: "session_created",
    addOutcomeRecord: "outcome_recorded",
    upsertRoleProfile: "role_profile_updated",
    aiDraftRoleProfile: "ai_role_profile_drafted",
    compareToRoleProfile: "role_profile_compared",
  };

  const pastVerb = VERB_MAP[verb] ?? verb;
  return `${entityPart}_${pastVerb}`;
}

/**
 * Fire-and-forget audit log insertion.
 * Never throws — errors are silently logged to console.
 */
export async function auditLogMutation(opts: {
  userId: number | null;
  userName?: string | null;
  userRole?: string | null;
  path: string;
  input: unknown;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const action = pathToAction(opts.path);
    const entityType = inferEntityType(opts.path);
    const entityId = extractEntityId(opts.input);
    const relatedContactId = extractRelatedContactId(opts.input, entityType);
    const sanitizedInput = sanitizeInput(opts.input);

    await db.insert(activityLog).values({
      userId: opts.userId,
      action,
      entityType,
      entityId,
      relatedContactId,
      details: {
        path: opts.path,
        actorName: opts.userName ?? undefined,
        actorRole: opts.userRole ?? undefined,
        ...(sanitizedInput ?? {}),
      },
      createdAt: new Date(),
    });
  } catch (err) {
    // Never let audit logging break the app
    console.error("[AuditMiddleware] Failed to log:", err);
  }
}

/**
 * Determines if a given tRPC path + type should be audit-logged by the global middleware.
 */
export function shouldAuditLog(type: string, path: string): boolean {
  if (type !== "mutation") return false;
  if (IGNORED_PATHS.has(path)) return false;
  if (MANUALLY_LOGGED_PATHS.has(path)) return false;
  return true;
}
