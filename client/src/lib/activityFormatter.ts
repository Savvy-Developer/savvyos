/**
 * Converts raw activity log entries into clean, human-readable descriptions.
 * Each action type has its own formatter that interprets the `details` object.
 *
 * Rich details fields (added in the Activity Log enrichment pass):
 *   actorName   — display name of the user who performed the action
 *   actorRole   — role of the actor ("admin" | "agent" | "isa")
 *   agentName   — display name of the agent involved
 *   contactName — display name of the contact involved
 *   propertyAddress — formatted address of the property involved
 *   txNumber    — transaction number (for transaction events)
 *   oldStatus / newStatus — for status-change events
 */

const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Phone",
  secondaryEmail: "Secondary email",
  secondaryPhone: "Secondary phone",
  spouseFirstName: "Spouse first name",
  spouseLastName: "Spouse last name",
  spouseEmail: "Spouse email",
  spousePhone: "Spouse phone",
  notes: "Notes",
  assignedIsaId: "Assigned ISA",
  leadSourceId: "Lead source",
  pipelineStatus: "Pipeline status",
  status: "Status",
  title: "Title",
  description: "Description",
  priority: "Priority",
  dueDate: "Due date",
  assignedToId: "Assigned to",
  purchasePrice: "Purchase price",
  commissionPercentage: "Commission %",
  commissionAmount: "Commission amount",
  commissionType: "Commission type",
  transactionType: "Transaction type",
  closingDate: "Closing date",
  propertyId: "Property",
  agentId: "Agent",
  payeeType: "Payee",
  percentage: "Percentage",
};

const PIPELINE_STATUS_LABELS: Record<string, string> = {
  new_lead: "New Lead",
  attempted_contact: "Attempted Contact",
  nurture: "Nurture",
  active_client: "Active Client",
  under_contract: "Under Contract",
  closed: "Closed",
  dead: "Dead",
};

const TRANSACTION_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  under_contract: "Under Contract",
  closed: "Closed",
  terminated: "Terminated",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "(cleared)";
  if (field === "pipelineStatus") return PIPELINE_STATUS_LABELS[String(value)] ?? String(value);
  if (field === "status" && TRANSACTION_STATUS_LABELS[String(value)]) return TRANSACTION_STATUS_LABELS[String(value)];
  if (field === "status" && PIPELINE_STATUS_LABELS[String(value)]) return PIPELINE_STATUS_LABELS[String(value)];
  if (field === "priority") return PRIORITY_LABELS[String(value)] ?? String(value);
  if (field === "purchasePrice" || field === "commissionAmount") {
    const n = Number(value);
    return isNaN(n) ? String(value) : `$${n.toLocaleString()}`;
  }
  if (field === "commissionPercentage") return `${value}%`;
  if (field === "dueDate" || field === "closingDate") {
    try { return new Date(String(value)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return String(value); }
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/**
 * Formats a contact_updated details object into a list of readable change lines.
 * Supports both the new diff format ({ changes: [{field, from, to}] })
 * and the legacy flat format ({ fieldName: newValue }).
 */
function formatContactUpdated(details: Record<string, unknown>): string[] {
  const lines: string[] = [];

  // New diff-based format: { changes: [{ field, from, to }] }
  if (Array.isArray(details.changes)) {
    for (const change of details.changes as Array<{ field: string; from: unknown; to: unknown }>) {
      const { field, from, to } = change;
      const isEmpty = (v: unknown) => v === null || v === undefined || v === "";
      if (field === "Assigned ISA") {
        if (isEmpty(to)) lines.push("ISA unassigned");
        else if (isEmpty(from)) lines.push(`ISA assigned`);
        else lines.push(`ISA reassigned`);
        continue;
      }
      if (field === "Lead source") {
        if (isEmpty(from) && !isEmpty(to)) {
          lines.push(`Lead source set to ${to}`);
        } else if (!isEmpty(from) && isEmpty(to)) {
          lines.push(`Lead source cleared (was ${from})`);
        } else {
          lines.push(`Lead source changed from ${from} to ${to}`);
        }
        continue;
      }
      if (isEmpty(from) && !isEmpty(to)) {
        lines.push(`${field} set to ${formatValue(field, to)}`);
      } else if (!isEmpty(from) && isEmpty(to)) {
        lines.push(`${field} cleared (was ${formatValue(field, from)})`);
      } else {
        lines.push(`${field} changed from ${formatValue(field, from)} to ${formatValue(field, to)}`);
      }
    }
    if (details.changes.length === 0) lines.push("No fields changed");
    return lines;
  }

  // Legacy flat format fallback: { fieldName: newValue }
  const skipFields = new Set(["id", "createdAt", "updatedAt", "note", "actorName", "actorRole", "agentName", "contactName", "propertyAddress", "txNumber"]);
  for (const [field, newValue] of Object.entries(details)) {
    if (skipFields.has(field)) continue;
    const label = FIELD_LABELS[field] ?? field.replace(/([A-Z])/g, " $1").toLowerCase();
    if (field === "assignedIsaId") {
      lines.push(newValue ? `ISA assigned` : "ISA unassigned");
      continue;
    }
    if (field === "leadSourceId") {
      lines.push(newValue ? `Lead source set` : "Lead source cleared");
      continue;
    }
    lines.push(`${label} updated to ${formatValue(field, newValue)}`);
  }
  return lines;
}

/** Build a context suffix like " for contact [Name]" or " — Agent [Name]" */
function agentContactSuffix(details: Record<string, unknown>): string {
  const parts: string[] = [];
  if (details.agentName) parts.push(`Agent: ${details.agentName}`);
  if (details.contactName) parts.push(`Contact: ${details.contactName}`);
  return parts.join(" · ");
}

export interface ActivityEntry {
  log: {
    id: number;
    action: string;
    details?: unknown;
    createdAt?: string | Date | null;
    entityType?: string;
    entityId?: number;
  };
  user?: { name?: string | null } | null;
}

export interface FormattedActivity {
  id: number;
  title: string;
  lines: string[];
  timestamp: string;
  actor: string;
  icon: "edit" | "plus" | "check" | "link" | "dollar" | "alert" | "info";
}

export function formatActivityEntry(entry: ActivityEntry): FormattedActivity {
  const { log, user } = entry;
  const action = log.action ?? "";
  const details = (log.details ?? {}) as Record<string, unknown>;

  // Prefer the enriched actorName stored in details; fall back to the joined user row
  const actor = (details.actorName as string | undefined) ?? user?.name ?? "System";

  const timestamp = log.createdAt
    ? new Date(log.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "";

  let title = "";
  let lines: string[] = [];
  let icon: FormattedActivity["icon"] = "info";

  switch (action) {
    // ── Contacts ──────────────────────────────────────────────────────────────
    case "contact_created":
      title = "Contact created";
      lines = details.name ? [`Name: ${details.name}`] : [];
      icon = "plus";
      break;

    case "contact_updated": {
      // Rich title: "[Actor] updated contact [ContactName]"
      if (details.contactName) {
        title = `${actor} updated contact ${details.contactName}`;
      } else {
        title = "Contact updated";
      }
      lines = formatContactUpdated(details);
      icon = "edit";
      break;
    }

    case "contact_archived":
      title = details.contactName ? `${actor} archived contact ${details.contactName}` : "Contact archived";
      icon = "alert";
      break;

    case "contacts_bulk_assign_isa": {
      title = "Bulk ISA assignment";
      const isaName = details.isaName as string | undefined;
      const count = details.count as number | undefined;
      const parts: string[] = [];
      if (isaName) parts.push(`ISA: ${isaName}`);
      if (count !== undefined) parts.push(`${count} contact${count === 1 ? "" : "s"} assigned`);
      lines = parts.length > 0 ? parts : ["Contacts reassigned"];
      icon = "edit";
      break;
    }

    // ── Agent Connections ─────────────────────────────────────────────────────
    case "agent_connection_created": {
      // Rich title: "[Actor] connected Agent [AgentName] to Contact [ContactName]"
      if (details.agentName && details.contactName) {
        title = `${actor} connected Agent ${details.agentName} to Contact ${details.contactName}`;
      } else if (details.agentName) {
        title = `${actor} assigned Agent ${details.agentName}`;
      } else {
        title = "Assigned to agent";
      }
      lines = [];
      icon = "link";
      break;
    }

    case "agent_connection_updated": {
      // Rich title: "[Actor] updated [AgentName]'s pipeline status from [old] to [new] for [ContactName]"
      const oldStatus = details.oldStatus as string | undefined;
      const newStatus = details.newStatus as string | undefined;
      const oldLabel = oldStatus ? (PIPELINE_STATUS_LABELS[oldStatus] ?? oldStatus) : null;
      const newLabel = newStatus ? (PIPELINE_STATUS_LABELS[newStatus] ?? newStatus) : null;

      if (details.agentName && details.contactName && oldLabel && newLabel) {
        title = `${actor} updated ${details.agentName}'s pipeline status`;
        lines = [
          `Contact: ${details.contactName}`,
          `Status: ${oldLabel} → ${newLabel}`,
        ];
      } else if (details.agentName && oldLabel && newLabel) {
        title = `${actor} updated ${details.agentName}'s pipeline status`;
        lines = [`${oldLabel} → ${newLabel}`];
      } else if (newLabel) {
        title = "Agent connection updated";
        lines = [`Pipeline status changed to ${newLabel}`];
      } else {
        title = "Agent connection updated";
        if (details.status) {
          const label = PIPELINE_STATUS_LABELS[String(details.status)] ?? String(details.status);
          lines = [`Pipeline status changed to ${label}`];
        }
      }
      icon = "edit";
      break;
    }

    // ── Tasks ─────────────────────────────────────────────────────────────────
    case "task_created":
      title = "Task created";
      lines = details.title ? [`"${details.title}"`] : [];
      icon = "plus";
      break;

    case "task_updated": {
      title = "Task updated";
      const taskLines: string[] = [];
      if (details.status) {
        const statusLabel = String(details.status).replace(/_/g, " ");
        taskLines.push(`Status changed to ${statusLabel}`);
      }
      if (details.priority) taskLines.push(`Priority set to ${PRIORITY_LABELS[String(details.priority)] ?? details.priority}`);
      if (details.dueDate) taskLines.push(`Due date set to ${formatValue("dueDate", details.dueDate)}`);
      if (details.title) taskLines.push(`Title changed to "${details.title}"`);
      lines = taskLines.length > 0 ? taskLines : ["Task details updated"];
      icon = "edit";
      break;
    }

    case "task_completed":
      title = "Task completed";
      lines = details.title ? [`"${details.title}"`] : [];
      icon = "check";
      break;

    // ── Transactions ──────────────────────────────────────────────────────────
    case "transaction_created": {
      // Rich title: "[Actor] created transaction [#TxNum] for Agent [AgentName] / Contact [ContactName]"
      const txNum = details.txNumber ?? details.transactionNumber;
      if (details.agentName && details.contactName) {
        title = `${actor} created transaction${txNum ? ` #${txNum}` : ""}`;
        const txCreateLines: string[] = [];
        txCreateLines.push(`Agent: ${details.agentName}`);
        txCreateLines.push(`Contact: ${details.contactName}`);
        if (details.propertyAddress && details.propertyAddress !== "Unknown Property") {
          txCreateLines.push(`Property: ${details.propertyAddress}`);
        }
        lines = txCreateLines;
      } else {
        title = "Transaction created";
        lines = txNum ? [`Transaction #${txNum}`] : [];
      }
      icon = "plus";
      break;
    }

    case "transaction_updated": {
      // Rich title: "[Actor] updated transaction [#TxNum]"
      const txNumUpd = details.txNumber ?? details.transactionNumber;
      if (details.agentName || details.contactName) {
        title = `${actor} updated transaction${txNumUpd ? ` #${txNumUpd}` : ""}`;
      } else {
        title = "Transaction updated";
      }

      // New diff-based format: { changes: [{ field, from, to }] }
      if (Array.isArray(details.changes)) {
        const txLines: string[] = [];
        // Add context lines first if available
        if (details.agentName) txLines.push(`Agent: ${details.agentName}`);
        if (details.contactName) txLines.push(`Contact: ${details.contactName}`);
        for (const change of details.changes as Array<{ field: string; from: unknown; to: unknown }>) {
          const { field, from, to } = change;
          const isEmpty = (v: unknown) => v === null || v === undefined || v === "";
          if (isEmpty(from) && !isEmpty(to)) {
            txLines.push(`${field} set to ${to}`);
          } else if (!isEmpty(from) && isEmpty(to)) {
            txLines.push(`${field} cleared (was ${from})`);
          } else {
            txLines.push(`${field} changed from ${from} to ${to}`);
          }
        }
        lines = txLines.length > 0 ? txLines : ["No fields changed"];
      } else {
        // Legacy format fallback
        const txLines: string[] = [];
        if (details.agentName) txLines.push(`Agent: ${details.agentName}`);
        if (details.contactName) txLines.push(`Contact: ${details.contactName}`);
        if (details.status) {
          const label = TRANSACTION_STATUS_LABELS[String(details.status)] ?? String(details.status);
          txLines.push(`Status changed to ${label}`);
        }
        if (details.purchasePrice) txLines.push(`Purchase price set to ${formatValue("purchasePrice", details.purchasePrice)}`);
        if (details.closingDate) txLines.push(`Closing date set to ${formatValue("closingDate", details.closingDate)}`);
        lines = txLines.length > 0 ? txLines : ["Transaction details updated"];
      }
      icon = "edit";
      break;
    }

    case "payout_item_added": {
      title = "Payout item added";
      const payeeLabel = String(details.payeeType ?? "").replace(/_/g, " ");
      if (details.percentage) {
        lines = [`${payeeLabel}: ${details.percentage}%`];
      } else if (details.amount) {
        lines = [`${payeeLabel}: $${Number(details.amount).toLocaleString()}`];
      } else {
        lines = payeeLabel ? [payeeLabel] : [];
      }
      icon = "dollar";
      break;
    }

    case "payouts_auto_generated": {
      title = "Commission payouts auto-calculated";
      const autoPayoutLines: string[] = [];
      if (details.gci) autoPayoutLines.push(`GCI: $${Number(details.gci).toLocaleString()}`);
      if (Array.isArray(details.payouts)) {
        for (const p of details.payouts as Array<{ payee: string; percentage: number; amount: string }>) {
          autoPayoutLines.push(`${p.payee}: ${p.percentage}% ($${Number(p.amount).toLocaleString()})`);
        }
      }
      lines = autoPayoutLines.length > 0 ? autoPayoutLines : ["Payouts generated"];
      icon = "dollar";
      break;
    }

    case "payout_edited": {
      title = `Payout edited${details.payee ? ` — ${details.payee}` : ""}`;
      const payoutEditLines: string[] = [];
      if (Array.isArray(details.changes)) {
        for (const change of details.changes as Array<{ field: string; from: unknown; to: unknown }>) {
          payoutEditLines.push(`${change.field}: ${change.from} → ${change.to}`);
        }
      }
      lines = payoutEditLines.length > 0 ? payoutEditLines : ["Payout details updated"];
      icon = "dollar";
      break;
    }

    // ── Listings ──────────────────────────────────────────────────────────────
    case "listing_created": {
      // Rich title: "[Actor] created listing for Agent [AgentName] / Contact [ContactName]"
      if (details.agentName && details.contactName) {
        title = `${actor} created listing`;
        const lstLines: string[] = [];
        lstLines.push(`Agent: ${details.agentName}`);
        lstLines.push(`Contact: ${details.contactName}`);
        if (details.propertyAddress && details.propertyAddress !== "Unknown Property") {
          lstLines.push(`Property: ${details.propertyAddress}`);
        }
        if (details.mlsNumber) lstLines.push(`MLS #${details.mlsNumber}`);
        lines = lstLines;
      } else {
        title = "Listing created";
        const lstLines: string[] = [];
        if (details.propertyAddress && details.propertyAddress !== "Unknown Property") lstLines.push(String(details.propertyAddress));
        else if (details.address) lstLines.push(String(details.address));
        if (details.mlsNumber) lstLines.push(`MLS #${details.mlsNumber}`);
        lines = lstLines;
      }
      icon = "plus";
      break;
    }

    case "listing_updated": {
      // Rich title: "[Actor] updated listing"
      if (details.agentName || details.contactName) {
        title = `${actor} updated listing`;
      } else {
        title = "Listing updated";
      }
      const lstUpdLines: string[] = [];
      if (details.agentName) lstUpdLines.push(`Agent: ${details.agentName}`);
      if (details.contactName) lstUpdLines.push(`Contact: ${details.contactName}`);
      if (details.propertyAddress && details.propertyAddress !== "Unknown Property") {
        lstUpdLines.push(`Property: ${details.propertyAddress}`);
      }
      // Show field changes if present
      if (details.changes && typeof details.changes === "object" && !Array.isArray(details.changes)) {
        const changesObj = details.changes as Record<string, { from: unknown; to: unknown }>;
        for (const [field, { from, to }] of Object.entries(changesObj)) {
          const fieldLabel = FIELD_LABELS[field] ?? field.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
          const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || v === "—";
          if (isEmpty(from) && !isEmpty(to)) {
            lstUpdLines.push(`${fieldLabel} set to ${to}`);
          } else if (!isEmpty(from) && isEmpty(to)) {
            lstUpdLines.push(`${fieldLabel} cleared (was ${from})`);
          } else if (!isEmpty(from) || !isEmpty(to)) {
            lstUpdLines.push(`${fieldLabel}: ${from} → ${to}`);
          }
        }
      }
      lines = lstUpdLines.length > 0 ? lstUpdLines : ["Listing details updated"];
      icon = "edit";
      break;
    }

    case "listing_terminated": {
      if (details.agentName || details.contactName) {
        title = `${actor} terminated listing`;
      } else {
        title = "Listing terminated";
      }
      const termLines: string[] = [];
      if (details.agentName) termLines.push(`Agent: ${details.agentName}`);
      if (details.contactName) termLines.push(`Contact: ${details.contactName}`);
      if (details.propertyAddress && details.propertyAddress !== "Unknown Property") {
        termLines.push(`Property: ${details.propertyAddress}`);
      }
      if (details.terminationDate) termLines.push(`Termination date: ${details.terminationDate}`);
      lines = termLines;
      icon = "alert";
      break;
    }

    case "listing_expired": {
      title = details.agentName ? `${actor} marked listing expired` : "Listing marked expired";
      const expLines: string[] = [];
      if (details.agentName) expLines.push(`Agent: ${details.agentName}`);
      if (details.contactName) expLines.push(`Contact: ${details.contactName}`);
      lines = expLines;
      icon = "alert";
      break;
    }

    case "listing_converted_to_transaction":
      title = "Listing converted to transaction";
      lines = details.transactionId ? [`Transaction #${details.transactionId}`] : [];
      icon = "link";
      break;

    case "listing_deleted":
      title = "Listing deleted";
      icon = "alert";
      break;

    // ── Properties ────────────────────────────────────────────────────────────
    case "property_created":
      title = "Property added";
      icon = "plus";
      break;

    case "property_updated":
      title = "Property updated";
      icon = "edit";
      break;

    // ── Smart Plans ──────────────────────────────────────────────────────────
    case "smart_plan_created":
      title = "Smart Plan created";
      lines = details.name ? [`Plan: "${details.name}"`] : [];
      icon = "plus";
      break;
    case "smart_plan_published":
      title = "Smart Plan published";
      lines = details.name ? [`Plan: "${details.name}"`] : [];
      icon = "check";
      break;
    case "smart_plan_updated":
      title = "Smart Plan updated";
      icon = "edit";
      break;
    case "smart_plan_deleted":
      title = "Smart Plan deleted";
      icon = "alert";
      break;

    // ── Market Match ──────────────────────────────────────────────────────────
    case "market_match_session_started":
      title = "Market Match call started";
      lines = details.contactName ? [`Contact: ${details.contactName}`] : [];
      icon = "plus";
      break;
    case "market_match_session_completed":
      title = "Market Match call completed";
      icon = "check";
      break;

    // ── User Login ────────────────────────────────────────────────────────────
    case "user_login":
      title = "Logged in";
      lines = [];
      icon = "info";
      break;

    // ── Fallback ─────────────────────────────────────────────────────────────
    default:
      title = action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      icon = "info";
      break;
  }

  return { id: log.id, title, lines, timestamp, actor, icon };
}
