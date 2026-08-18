import { inArray } from "drizzle-orm";
import {
  agentConnections,
  contacts,
  listings,
  pmProjects,
  pmTasks,
  properties,
  proformas,
  smartPlans,
  tasks,
  transactions,
  users,
} from "../drizzle/schema";

export type ActivityRecordLink = {
  entityType: string;
  entityId: number;
  label: string;
  href: string;
};

type ActivityRow = {
  log: {
    id: number;
    action: string;
    entityType: string | null;
    entityId: number | null;
    relatedContactId: number | null;
    details: unknown;
  };
  [key: string]: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asId(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function displayAddress(row: { address: string; city?: string | null; state?: string | null; zip?: string | null }) {
  const locality = [row.city, row.state].filter(Boolean).join(", ");
  return [row.address, locality, row.zip].filter(Boolean).join(" ").replace(/,\s+(\S+)/, ", $1");
}

function contactName(row: { firstName: string; lastName: string }) {
  return `${row.firstName} ${row.lastName}`.trim() || "Unnamed contact";
}

function isProformaActivity(log: ActivityRow["log"], details: Record<string, unknown>) {
  const action = log.action.toLowerCase();
  const path = typeof details.path === "string" ? details.path : "";
  return action.includes("proforma") || path.includes("Proforma");
}

function addLink(links: ActivityRecordLink[], seen: Set<string>, link: ActivityRecordLink | null) {
  if (!link || seen.has(link.href)) return;
  links.push(link);
  seen.add(link.href);
}

/**
 * Resolves entity IDs in a page of activity rows in batches. This allows activity
 * history to remain useful for legacy audit records whose original details only
 * stored an ID, while new records can still provide richer labels immediately.
 */
export async function resolveActivityRecordLinks(db: any, rows: ActivityRow[]): Promise<Array<ActivityRow & { recordLinks: ActivityRecordLink[] }>> {
  if (rows.length === 0) return [];

  const propertyIds = new Set<number>();
  const contactIds = new Set<number>();
  const transactionIds = new Set<number>();
  const listingIds = new Set<number>();
  const taskIds = new Set<number>();
  const connectionIds = new Set<number>();
  const smartPlanIds = new Set<number>();
  const projectIds = new Set<number>();
  const pmTaskIds = new Set<number>();
  const proformaIds = new Set<number>();
  const userIds = new Set<number>();

  for (const { log } of rows) {
    const details = asRecord(log.details);
    const entityId = asId(log.entityId);
    const entityType = log.entityType ?? "";
    const path = typeof details.path === "string" ? details.path : "";

    const propertyId = asId(details.propertyId);
    const contactId = asId(details.contactId) ?? asId(log.relatedContactId);
    const transactionId = asId(details.transactionId);
    const listingId = asId(details.listingId);
    const taskId = asId(details.taskId);
    const connectionId = asId(details.agentConnectionId);
    const smartPlanId = asId(details.smartPlanId);
    const projectId = asId(details.projectId);
    const userId = asId(details.userId);

    if (isProformaActivity(log, details)) {
      const explicitProformaId = asId(details.proformaId);
      const legacyProformaId = path.includes("updateProforma") || path.includes("deleteProforma") ? entityId : null;
      if (explicitProformaId) proformaIds.add(explicitProformaId);
      if (legacyProformaId) proformaIds.add(legacyProformaId);
      if (propertyId) propertyIds.add(propertyId);
      // Legacy create events stored the property ID directly as entityId.
      if (!explicitProformaId && !legacyProformaId && entityId) propertyIds.add(entityId);
    } else if (entityType === "property" && entityId) propertyIds.add(entityId);
    if (propertyId) propertyIds.add(propertyId);

    if (entityType === "contact" && entityId) contactIds.add(entityId);
    if (contactId) contactIds.add(contactId);
    if (entityType === "transaction" && entityId) transactionIds.add(entityId);
    if (transactionId) transactionIds.add(transactionId);
    if (entityType === "listing" && entityId) listingIds.add(entityId);
    if (listingId) listingIds.add(listingId);
    if (entityType === "task" && entityId) taskIds.add(entityId);
    if (taskId) taskIds.add(taskId);
    if (entityType === "agent_connection" && entityId) connectionIds.add(entityId);
    if (connectionId) connectionIds.add(connectionId);
    if (entityType === "smart_plan" && entityId) smartPlanIds.add(entityId);
    if (smartPlanId) smartPlanIds.add(smartPlanId);
    if (entityType === "user" && entityId) userIds.add(entityId);
    if (userId) userIds.add(userId);

    if (path.startsWith("pm.tasks.")) {
      if (entityId) pmTaskIds.add(entityId);
      if (taskId) pmTaskIds.add(taskId);
    } else if (entityType === "project" || path.startsWith("pm.projects.")) {
      if (entityId) projectIds.add(entityId);
      if (projectId) projectIds.add(projectId);
    }
  }

  const proformaRows = proformaIds.size
    ? await db.select({ id: proformas.id, propertyId: proformas.propertyId, title: proformas.title }).from(proformas).where(inArray(proformas.id, Array.from(proformaIds)))
    : [];
  for (const row of proformaRows) propertyIds.add(row.propertyId);

  const [transactionRows, listingRows, taskRows, connectionRows, smartPlanRows, projectRows, pmTaskRows, userRows] = await Promise.all([
    transactionIds.size ? db.select({ id: transactions.id, number: transactions.transactionNumber, propertyId: transactions.propertyId, contactId: transactions.primaryContactId }).from(transactions).where(inArray(transactions.id, Array.from(transactionIds))) : [],
    listingIds.size ? db.select({ id: listings.id, mlsNumber: listings.mlsNumber, propertyId: listings.propertyId, contactId: listings.contactId }).from(listings).where(inArray(listings.id, Array.from(listingIds))) : [],
    taskIds.size ? db.select({ id: tasks.id, title: tasks.title, contactId: tasks.relatedContactId, propertyId: tasks.relatedPropertyId, transactionId: tasks.relatedTransactionId }).from(tasks).where(inArray(tasks.id, Array.from(taskIds))) : [],
    connectionIds.size ? db.select({ id: agentConnections.id, agentId: agentConnections.agentId, contactId: agentConnections.contactId }).from(agentConnections).where(inArray(agentConnections.id, Array.from(connectionIds))) : [],
    smartPlanIds.size ? db.select({ id: smartPlans.id, name: smartPlans.name }).from(smartPlans).where(inArray(smartPlans.id, Array.from(smartPlanIds))) : [],
    projectIds.size ? db.select({ id: pmProjects.id, title: pmProjects.title }).from(pmProjects).where(inArray(pmProjects.id, Array.from(projectIds))) : [],
    pmTaskIds.size ? db.select({ id: pmTasks.id, title: pmTasks.title, projectId: pmTasks.projectId }).from(pmTasks).where(inArray(pmTasks.id, Array.from(pmTaskIds))) : [],
    userIds.size ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, Array.from(userIds))) : [],
  ]);

  for (const row of transactionRows) {
    if (row.propertyId) propertyIds.add(row.propertyId);
    if (row.contactId) contactIds.add(row.contactId);
  }
  for (const row of listingRows) {
    if (row.propertyId) propertyIds.add(row.propertyId);
    if (row.contactId) contactIds.add(row.contactId);
  }
  for (const row of taskRows) {
    if (row.propertyId) propertyIds.add(row.propertyId);
    if (row.contactId) contactIds.add(row.contactId);
    if (row.transactionId) transactionIds.add(row.transactionId);
  }
  for (const row of connectionRows) {
    if (row.contactId) contactIds.add(row.contactId);
    if (row.agentId) userIds.add(row.agentId);
  }

  const [propertyRows, contactRows, secondaryTransactionRows, secondaryUserRows] = await Promise.all([
    propertyIds.size ? db.select({ id: properties.id, address: properties.address, city: properties.city, state: properties.state, zip: properties.zip }).from(properties).where(inArray(properties.id, Array.from(propertyIds))) : [],
    contactIds.size ? db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(inArray(contacts.id, Array.from(contactIds))) : [],
    transactionIds.size ? db.select({ id: transactions.id, number: transactions.transactionNumber }).from(transactions).where(inArray(transactions.id, Array.from(transactionIds))) : [],
    userIds.size ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, Array.from(userIds))) : [],
  ]);

  const propertyById: Map<number, any> = new Map(propertyRows.map((row: any) => [row.id, row]));
  const proformaById: Map<number, any> = new Map(proformaRows.map((row: any) => [row.id, row]));
  const contactById: Map<number, any> = new Map(contactRows.map((row: any) => [row.id, row]));
  const transactionById: Map<number, any> = new Map([...transactionRows, ...secondaryTransactionRows].map((row: any) => [row.id, row]));
  const listingById: Map<number, any> = new Map(listingRows.map((row: any) => [row.id, row]));
  const taskById: Map<number, any> = new Map(taskRows.map((row: any) => [row.id, row]));
  const connectionById: Map<number, any> = new Map(connectionRows.map((row: any) => [row.id, row]));
  const smartPlanById: Map<number, any> = new Map(smartPlanRows.map((row: any) => [row.id, row]));
  const projectById: Map<number, any> = new Map(projectRows.map((row: any) => [row.id, row]));
  const pmTaskById: Map<number, any> = new Map(pmTaskRows.map((row: any) => [row.id, row]));
  const userById: Map<number, any> = new Map([...userRows, ...secondaryUserRows].map((row: any) => [row.id, row]));

  return rows.map((row) => {
    const { log } = row;
    const details = asRecord(log.details);
    const entityId = asId(log.entityId);
    const entityType = log.entityType ?? "";
    const path = typeof details.path === "string" ? details.path : "";
    const links: ActivityRecordLink[] = [];
    const seen = new Set<string>();

    const propertyId = asId(details.propertyId) ?? (entityType === "property" && !isProformaActivity(log, details) ? entityId : null);
    const contactId = asId(details.contactId) ?? asId(log.relatedContactId) ?? (entityType === "contact" ? entityId : null);
    const transactionId = asId(details.transactionId) ?? (entityType === "transaction" ? entityId : null);
    const listingId = asId(details.listingId) ?? (entityType === "listing" ? entityId : null);
    const taskId = asId(details.taskId) ?? (entityType === "task" ? entityId : null);
    const connectionId = asId(details.agentConnectionId) ?? (entityType === "agent_connection" ? entityId : null);
    const smartPlanId = asId(details.smartPlanId) ?? (entityType === "smart_plan" ? entityId : null);

    if (isProformaActivity(log, details)) {
      const explicitProformaId = asId(details.proformaId);
      const legacyProformaId = path.includes("updateProforma") || path.includes("deleteProforma") ? entityId : null;
      const proformaId = explicitProformaId ?? legacyProformaId;
      const proforma = proformaId ? proformaById.get(proformaId) : null;
      const resolvedPropertyId = propertyId ?? proforma?.propertyId ?? (!proformaId ? entityId : null);
      const property = resolvedPropertyId ? propertyById.get(resolvedPropertyId) : null;
      const propertyLabel = property ? displayAddress(property) : typeof details.propertyAddress === "string" ? details.propertyAddress : resolvedPropertyId ? `Property #${resolvedPropertyId}` : "Property";
      const title = typeof details.proformaTitle === "string" && details.proformaTitle.trim()
        ? details.proformaTitle.trim()
        : proforma?.title || "Pro forma";
      const loadableProformaId = proformaId && !log.action.endsWith("_deleted") && proforma ? proformaId : null;
      if (resolvedPropertyId) addLink(links, seen, {
        entityType: "proforma",
        entityId: proformaId ?? resolvedPropertyId,
        label: `${title} — ${propertyLabel}`,
        href: `/properties/${resolvedPropertyId}/proforma${loadableProformaId ? `?load=${loadableProformaId}` : ""}`,
      });
    }

    if (entityType === "property" && !isProformaActivity(log, details) && propertyId) {
      const property = propertyById.get(propertyId);
      addLink(links, seen, {
        entityType: "property",
        entityId: propertyId,
        label: property ? displayAddress(property) : typeof details.propertyAddress === "string" ? details.propertyAddress : `Property #${propertyId}`,
        href: `/properties/${propertyId}`,
      });
    }

    if (entityType === "transaction" && transactionId) {
      const transaction = transactionById.get(transactionId);
      addLink(links, seen, {
        entityType: "transaction",
        entityId: transactionId,
        label: transaction?.number ? `Transaction #${transaction.number}` : `Transaction #${transactionId}`,
        href: `/transactions/${transactionId}`,
      });
    }

    if (entityType === "listing" && listingId) {
      const listing = listingById.get(listingId);
      const listingProperty = listing?.propertyId ? propertyById.get(listing.propertyId) : null;
      addLink(links, seen, {
        entityType: "listing",
        entityId: listingId,
        label: [listing?.mlsNumber ? `Listing MLS #${listing.mlsNumber}` : `Listing #${listingId}`, listingProperty ? displayAddress(listingProperty) : null].filter(Boolean).join(" — "),
        href: `/listings/${listingId}`,
      });
    }

    if (entityType === "task" && taskId) {
      const task = taskById.get(taskId);
      addLink(links, seen, {
        entityType: "task",
        entityId: taskId,
        label: task?.title ? `Task: ${task.title}` : `Task #${taskId}`,
        href: `/tasks/${taskId}`,
      });
    }

    if (entityType === "agent_connection" && connectionId) {
      const connection = connectionById.get(connectionId);
      const connectionContact = connection?.contactId ? contactById.get(connection.contactId) : null;
      const connectionAgent = connection?.agentId ? userById.get(connection.agentId) : null;
      addLink(links, seen, {
        entityType: "agent_connection",
        entityId: connectionId,
        label: [connectionContact ? `Pipeline: ${contactName(connectionContact)}` : `Pipeline connection #${connectionId}`, connectionAgent?.name ?? null].filter(Boolean).join(" — "),
        href: `/pipeline/${connectionId}`,
      });
    }

    if (entityType === "smart_plan" && smartPlanId) {
      const plan = smartPlanById.get(smartPlanId);
      addLink(links, seen, {
        entityType: "smart_plan",
        entityId: smartPlanId,
        label: plan?.name ? `Smart Plan: ${plan.name}` : `Smart Plan #${smartPlanId}`,
        href: `/smart-plans/${smartPlanId}`,
      });
    }

    if (path.startsWith("pm.tasks.")) {
      const pmTaskId = asId(details.taskId) ?? entityId;
      const task = pmTaskId ? pmTaskById.get(pmTaskId) : null;
      const projectId = task?.projectId ?? asId(details.projectId);
      if (pmTaskId) addLink(links, seen, {
        entityType: "project_task",
        entityId: pmTaskId,
        label: task?.title ? `Project task: ${task.title}` : `Project task #${pmTaskId}`,
        href: projectId ? `/projects/${projectId}` : "/projects",
      });
    } else if (entityType === "project" || path.startsWith("pm.projects.")) {
      const projectId = asId(details.projectId) ?? entityId;
      const project = projectId ? projectById.get(projectId) : null;
      if (projectId) addLink(links, seen, {
        entityType: "project",
        entityId: projectId,
        label: project?.title ? `Project: ${project.title}` : `Project #${projectId}`,
        href: `/projects/${projectId}`,
      });
    }

    if (entityType === "contact" && contactId) {
      const contact = contactById.get(contactId);
      addLink(links, seen, {
        entityType: "contact",
        entityId: contactId,
        label: contact ? `Contact: ${contactName(contact)}` : typeof details.contactName === "string" ? `Contact: ${details.contactName}` : `Contact #${contactId}`,
        href: `/contacts/${contactId}`,
      });
    } else if (["communication", "connection_request", "contact_property"].includes(entityType) && contactId) {
      const contact = contactById.get(contactId);
      addLink(links, seen, {
        entityType: "contact",
        entityId: contactId,
        label: contact ? `Contact: ${contactName(contact)}` : typeof details.contactName === "string" ? `Contact: ${details.contactName}` : `Contact #${contactId}`,
        href: `/contacts/${contactId}`,
      });
    }

    if (["contact_property", "communication", "document"].includes(entityType)) {
      const relatedPropertyId = asId(details.propertyId);
      const property = relatedPropertyId ? propertyById.get(relatedPropertyId) : null;
      if (relatedPropertyId) addLink(links, seen, {
        entityType: "property",
        entityId: relatedPropertyId,
        label: property ? `Property: ${displayAddress(property)}` : `Property #${relatedPropertyId}`,
        href: `/properties/${relatedPropertyId}`,
      });
    }

    if (entityType === "user" && entityId) {
      const targetUser = userById.get(entityId);
      addLink(links, seen, {
        entityType: "user",
        entityId,
        label: targetUser?.name ? `Team member: ${targetUser.name}` : `Team member #${entityId}`,
        href: `/agents/${entityId}`,
      });
    }

    return { ...row, recordLinks: links };
  });
}
