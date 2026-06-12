/**
 * Converts raw activity log entries into clean, human-readable descriptions.
 * Each action type has its own formatter that interprets the `details` object.
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
  const skipFields = new Set(["id", "createdAt", "updatedAt", "note"]);
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
  const actor = user?.name ?? "System";
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
      title = "Contact updated";
      lines = formatContactUpdated(details);
      icon = "edit";
      break;
    }

    // ── Agent Connections ─────────────────────────────────────────────────────
    case "agent_connection_created":
      title = "Assigned to agent";
      lines = details.agentName ? [`Agent: ${details.agentName}`] : [];
      icon = "link";
      break;

    case "agent_connection_updated": {
      title = "Agent connection updated";
      if (details.status) {
        const label = PIPELINE_STATUS_LABELS[String(details.status)] ?? String(details.status);
        lines = [`Pipeline status changed to ${label}`];
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
    case "transaction_created":
      title = "Transaction created";
      lines = details.transactionNumber ? [`Transaction #${details.transactionNumber}`] : [];
      icon = "plus";
      break;

    case "transaction_updated": {
      title = "Transaction updated";
      // New diff-based format: { changes: [{ field, from, to }] }
      if (Array.isArray(details.changes)) {
        const txLines: string[] = [];
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
    case "listing_created":
      title = "Listing created";
      lines = details.address ? [String(details.address)] : [];
      icon = "plus";
      break;

    case "listing_updated":
      title = "Listing updated";
      icon = "edit";
      break;

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

    // ── Fallback ──────────────────────────────────────────────────────────────
    default:
      title = action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      icon = "info";
      break;
  }

  return { id: log.id, title, lines, timestamp, actor, icon };
}
