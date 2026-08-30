import { Resend } from "resend";
import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import {
  contacts,
  resendInboxMessages,
  resendInboxThreadReads,
  resendInboxThreads,
} from "../drizzle/schema";

type ReceivedAttachment = {
  id: string;
  filename?: string | null;
  size?: number | null;
  content_type?: string | null;
  content_disposition?: string | null;
  content_id?: string | null;
};

type ReceivedEmailListItem = {
  id?: string;
  created_at?: string;
  from?: string;
  to?: string[];
  subject?: string;
  message_id?: string;
};

export function normaliseReceivedEmailList(payload: unknown): ReceivedEmailListItem[] {
  if (Array.isArray(payload)) return payload as ReceivedEmailListItem[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: ReceivedEmailListItem[] }).data;
  }
  return [];
}

export function normaliseReceivedEmailListPage(payload: unknown): {
  emails: ReceivedEmailListItem[];
  hasMore: boolean;
  nextCursor: string | null;
} {
  const emails = normaliseReceivedEmailList(payload);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { emails, hasMore: false, nextCursor: null };
  }
  const envelope = payload as { has_more?: unknown; data?: unknown };
  const hasMore = envelope.has_more === true;
  const lastId = emails.at(-1)?.id ?? null;
  return { emails, hasMore, nextCursor: hasMore ? lastId : null };
}

type ReceivedEmail = {
  id?: string;
  from?: string | null;
  to?: string[] | null;
  cc?: string[] | null;
  reply_to?: string[] | null;
  subject?: string | null;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string> | null;
  attachments?: ReceivedAttachment[] | null;
  message_id?: string | null;
  created_at?: string | null;
};

export type ResendReceivedEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    message_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    created_at?: string;
  };
};

function getResendClient(): Resend | null {
  return ENV.resendApiKey ? new Resend(ENV.resendApiKey) : null;
}

function cleanEmail(value: string | null | undefined): string {
  if (!value) return "";
  const bracket = value.match(/<([^>]+)>/);
  return (bracket?.[1] ?? value).trim().toLowerCase();
}

function displayName(value: string | null | undefined): string | null {
  if (!value) return null;
  const bracket = value.match(/^\s*(.*?)\s*<[^>]+>\s*$/);
  const name = (bracket?.[1] ?? "").trim().replace(/^['\"]|['\"]$/g, "");
  return name || null;
}

function cleanRecipients(values: string[] | null | undefined): string[] {
  return (values ?? []).map(cleanEmail).filter(Boolean);
}

/** Identifies automated DMARC aggregate reports without hiding normal emails. */
export function isDmarcAggregateReport(email: Pick<ReceivedEmailListItem, "from" | "subject">): boolean {
  const sender = cleanEmail(email.from);
  const subject = (email.subject ?? "").trim();
  const dmarcSender = /(?:^|[.@_-])dmarc(?:[.@_-]|$)/i.test(sender);
  const standardReportSubject = /^report\s+domain:\s*\S+.*\breport-id\s*:/i.test(subject);
  const explicitDmarcSubject = /\bdmarc\s+(?:aggregate|rua)\s+report\b/i.test(subject);
  return standardReportSubject || (dmarcSender && explicitDmarcSubject);
}

function normaliseSubject(subject: string | null | undefined): string {
  return (subject ?? "(no subject)")
    .replace(/^(?:\s*(?:re|fwd?|fw)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase()
    .slice(0, 1024) || "(no subject)";
}

function replySubject(subject: string): string {
  return /^\s*re\s*:/i.test(subject) ? subject : `Re: ${subject}`;
}

function parseDate(value: string | null | undefined): Date {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normaliseHeaders(headers: Record<string, string> | null | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)]),
  );
}

function referencedMessageIds(headers: Record<string, string>): string[] {
  const values = [headers["in-reply-to"], headers.references]
    .filter(Boolean)
    .join(" ");
  return Array.from(new Set(values.match(/<[^>]+>/g) ?? []));
}

function mapAttachments(attachments: ReceivedAttachment[] | null | undefined) {
  return (attachments ?? []).map((attachment) => ({
    id: attachment.id,
    filename: attachment.filename ?? "attachment",
    size: Number(attachment.size ?? 0),
    contentType: attachment.content_type ?? null,
    contentDisposition: attachment.content_disposition ?? null,
    contentId: attachment.content_id ?? null,
  }));
}

async function markThreadRead(threadId: number, userId: number, markedUnread = false) {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select({ id: resendInboxThreadReads.id })
    .from(resendInboxThreadReads)
    .where(and(eq(resendInboxThreadReads.threadId, threadId), eq(resendInboxThreadReads.userId, userId)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(resendInboxThreadReads)
      .set({ lastReadAt: new Date(), markedUnread })
      .where(eq(resendInboxThreadReads.id, existing[0].id));
  } else {
    await db.insert(resendInboxThreadReads).values({
      threadId,
      userId,
      lastReadAt: new Date(),
      markedUnread,
    });
  }
}

async function findThreadForInbound(
  receivedAddress: string,
  participantEmail: string,
  subject: string,
  references: string[],
): Promise<typeof resendInboxThreads.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  if (references.length > 0) {
    const referenced = await db
      .select({ threadId: resendInboxMessages.threadId })
      .from(resendInboxMessages)
      .where(inArray(resendInboxMessages.internetMessageId, references))
      .orderBy(desc(resendInboxMessages.receivedAt))
      .limit(1);
    if (referenced[0]) {
      const thread = await db
        .select()
        .from(resendInboxThreads)
        .where(eq(resendInboxThreads.id, referenced[0].threadId))
        .limit(1);
      if (thread[0]) return thread[0];
    }
  }

  const fallback = await db
    .select()
    .from(resendInboxThreads)
    .where(and(
      eq(resendInboxThreads.receivedAddress, receivedAddress),
      eq(resendInboxThreads.participantEmail, participantEmail),
      eq(resendInboxThreads.normalizedSubject, normaliseSubject(subject)),
    ))
    .orderBy(desc(resendInboxThreads.lastMessageAt))
    .limit(1);
  return fallback[0] ?? null;
}

/** Store a received email using its canonical content returned by Resend. Safe on webhook replay. */
export async function ingestResendReceivedEmail(event: ResendReceivedEvent): Promise<{ stored: boolean; threadId?: number; reason?: string }> {
  if (event.type !== "email.received" || !event.data?.email_id) {
    return { stored: false, reason: "not_received_event" };
  }
  if (isDmarcAggregateReport({ from: event.data.from, subject: event.data.subject })) {
    return { stored: false, reason: "dmarc_report_filtered" };
  }
  const db = await getDb();
  const resend = getResendClient();
  if (!db) return { stored: false, reason: "db_unavailable" };
  if (!resend) return { stored: false, reason: "resend_not_configured" };

  const providerEmailId = event.data.email_id;
  const prior = await db
    .select({ id: resendInboxMessages.id, threadId: resendInboxMessages.threadId })
    .from(resendInboxMessages)
    .where(eq(resendInboxMessages.providerEmailId, providerEmailId))
    .limit(1);
  if (prior[0]) return { stored: false, threadId: prior[0].threadId, reason: "duplicate" };

  const receivedResult = await (resend.emails as any).receiving.get(providerEmailId) as { data?: ReceivedEmail; error?: { message?: string } };
  if (receivedResult.error || !receivedResult.data) {
    throw new Error(receivedResult.error?.message ?? "Resend did not return received email content");
  }

  const received = receivedResult.data;
  const headers = normaliseHeaders(received.headers);
  const fromRaw = received.from ?? event.data.from ?? "";
  const fromEmail = cleanEmail(fromRaw);
  const fromName = displayName(fromRaw);
  const toRecipients = cleanRecipients(received.to ?? event.data.to);
  const receivedAddress = toRecipients[0] ?? "";
  const subject = (received.subject ?? event.data.subject ?? "(no subject)").slice(0, 1024);
  const messageId = received.message_id ?? event.data.message_id ?? headers["message-id"] ?? null;
  const references = referencedMessageIds(headers);
  const receivedAt = parseDate(received.created_at ?? event.created_at ?? event.data.created_at);

  if (!fromEmail || !receivedAddress) {
    throw new Error("Received email is missing a sender or recipient address");
  }
  if (isDmarcAggregateReport({ from: fromEmail, subject })) {
    return { stored: false, reason: "dmarc_report_filtered" };
  }

  let thread = await findThreadForInbound(receivedAddress, fromEmail, subject, references);
  if (!thread) {
    const inserted = await db.insert(resendInboxThreads).values({
      subject,
      normalizedSubject: normaliseSubject(subject),
      receivedAddress,
      participantEmail: fromEmail,
      lastMessageAt: receivedAt,
      lastIncomingAt: receivedAt,
    });
    const id = Number(inserted[0].insertId);
    const rows = await db.select().from(resendInboxThreads).where(eq(resendInboxThreads.id, id)).limit(1);
    thread = rows[0] ?? null;
  }
  if (!thread) throw new Error("Unable to create an inbox conversation");

  await db.transaction(async (tx) => {
    await tx.insert(resendInboxMessages).values({
      threadId: thread!.id,
      direction: "inbound",
      providerEmailId,
      internetMessageId: messageId,
      inReplyToMessageId: headers["in-reply-to"] ?? null,
      fromEmail,
      fromName,
      toRecipients,
      ccRecipients: cleanRecipients(received.cc),
      replyToRecipients: cleanRecipients(received.reply_to),
      subject,
      bodyHtml: received.html ?? null,
      bodyText: received.text ?? null,
      headers,
      attachments: mapAttachments(received.attachments),
      receivedAt,
    });
    await tx
      .update(resendInboxThreads)
      .set({
        subject,
        normalizedSubject: normaliseSubject(subject),
        receivedAddress,
        participantEmail: fromEmail,
        lastMessageAt: receivedAt,
        lastIncomingAt: receivedAt,
        archivedAt: null,
        archivedById: null,
      })
      .where(eq(resendInboxThreads.id, thread!.id));
  });

  return { stored: true, threadId: thread.id };
}

/** Backfill existing messages visible in Resend Receiving. Existing rows are idempotently skipped. */
export async function backfillResendInbox(input: { limit?: number; after?: string } = {}): Promise<{
  scanned: number;
  stored: number;
  skipped: number;
  hasMore: boolean;
  nextCursor: string | null;
}> {
  const resend = getResendClient();
  if (!resend) throw new Error("Resend API key is not configured");
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 100);
  const result = await (resend.emails as any).receiving.list({
    limit,
    ...(input.after ? { after: input.after } : {}),
  }) as { data?: unknown; error?: { message?: string } };
  if (result.error) throw new Error(result.error.message ?? "Unable to list received emails from Resend");
  const page = normaliseReceivedEmailListPage(result.data);

  let stored = 0;
  let skipped = 0;
  for (const received of page.emails) {
    if (!received.id) {
      skipped += 1;
      continue;
    }
    const outcome = await ingestResendReceivedEmail({
      type: "email.received",
      created_at: received.created_at,
      data: {
        email_id: received.id,
        message_id: received.message_id,
        from: received.from ?? undefined,
        to: received.to,
        subject: received.subject ?? undefined,
      },
    });
    if (outcome.stored) stored += 1;
    else skipped += 1;
  }
  return {
    scanned: page.emails.length,
    stored,
    skipped,
    // A malformed cursor should never create an infinite client loop. The UI can
    // still report the partial import and the operator can retry safely.
    hasMore: page.hasMore && !!page.nextCursor,
    nextCursor: page.nextCursor,
  };
}

async function getInboxContactMatches(participantEmails: string[]): Promise<Map<string, { id: number; name: string | null; email: string | null }>> {
  const db = await getDb();
  const emails = Array.from(new Set(participantEmails.map(cleanEmail).filter(Boolean)));
  const matches = new Map<string, { id: number; name: string | null; email: string | null }>();
  if (!db || emails.length === 0) return matches;

  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      secondaryEmail: contacts.secondaryEmail,
      spouseEmail: contacts.spouseEmail,
    })
    .from(contacts)
    .where(and(
      isNull(contacts.archivedAt),
      or(
        inArray(contacts.email, emails),
        inArray(contacts.secondaryEmail, emails),
        inArray(contacts.spouseEmail, emails),
      ),
    ))
    .limit(500);

  for (const row of rows) {
    const contact = {
      id: row.id,
      name: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || null,
      email: row.email,
    };
    for (const email of [row.email, row.secondaryEmail, row.spouseEmail].map(cleanEmail)) {
      if (emails.includes(email) && !matches.has(email)) matches.set(email, contact);
    }
  }
  return matches;
}

export async function getResendInboxThreads(userId: number, archived: boolean) {
  const db = await getDb();
  if (!db) return [];
  const threads = await db
    .select()
    .from(resendInboxThreads)
    .where(archived ? gt(resendInboxThreads.archivedAt, new Date(0)) : isNull(resendInboxThreads.archivedAt))
    .orderBy(desc(resendInboxThreads.lastIncomingAt))
    .limit(250);

  if (threads.length === 0) return [];
  const reads = await db
    .select()
    .from(resendInboxThreadReads)
    .where(and(
      eq(resendInboxThreadReads.userId, userId),
      inArray(resendInboxThreadReads.threadId, threads.map((thread) => thread.id)),
  ));
  const readByThread = new Map(reads.map((read) => [read.threadId, read]));
  const contactByEmail = await getInboxContactMatches(threads.map((thread) => thread.participantEmail));

  return threads.map((thread) => {
    const read = readByThread.get(thread.id);
    const isUnread = read?.markedUnread || !read?.lastReadAt || thread.lastIncomingAt > read.lastReadAt;
    return { ...thread, isUnread, contact: contactByEmail.get(thread.participantEmail.toLowerCase()) ?? null };
  });
}

export async function getResendInboxUnreadCount(userId: number): Promise<number> {
  const threads = await getResendInboxThreads(userId, false);
  return threads.filter((thread) => thread.isUnread).length;
}

export async function getResendInboxThread(threadId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const thread = await db.select().from(resendInboxThreads).where(eq(resendInboxThreads.id, threadId)).limit(1);
  if (!thread[0]) return null;
  const messages = await db
    .select()
    .from(resendInboxMessages)
    .where(eq(resendInboxMessages.threadId, threadId))
    .orderBy(resendInboxMessages.receivedAt);
  await markThreadRead(threadId, userId, false);
  const contactByEmail = await getInboxContactMatches([thread[0].participantEmail]);
  return {
    thread: {
      ...thread[0],
      contact: contactByEmail.get(thread[0].participantEmail.toLowerCase()) ?? null,
    },
    messages,
  };
}

export async function setResendInboxThreadUnread(threadId: number, userId: number, markedUnread: boolean) {
  await markThreadRead(threadId, userId, markedUnread);
  return { success: true };
}

export async function archiveResendInboxThread(threadId: number, userId: number, archived: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(resendInboxThreads)
    .set({ archivedAt: archived ? new Date() : null, archivedById: archived ? userId : null })
    .where(eq(resendInboxThreads.id, threadId));
  return { success: true };
}

export async function sendResendInboxReply(input: { threadId: number; bodyHtml: string; userId: number }) {
  const db = await getDb();
  const resend = getResendClient();
  if (!db) throw new Error("Database unavailable");
  if (!resend) throw new Error("Resend API key is not configured");

  const threadRows = await db.select().from(resendInboxThreads).where(eq(resendInboxThreads.id, input.threadId)).limit(1);
  const thread = threadRows[0];
  if (!thread) throw new Error("Conversation not found");

  const messages = await db
    .select()
    .from(resendInboxMessages)
    .where(eq(resendInboxMessages.threadId, thread.id))
    .orderBy(desc(resendInboxMessages.receivedAt));
  const latestInbound = messages.find((message) => message.direction === "inbound");
  if (!latestInbound) throw new Error("This conversation has no inbound message to reply to");

  const replyRecipients = (latestInbound.replyToRecipients?.length
    ? latestInbound.replyToRecipients
    : [latestInbound.fromEmail]).filter(Boolean);
  if (replyRecipients.length === 0) throw new Error("No reply address is available for this message");

  const references = Array.from(new Set([
    ...messages.map((message) => message.internetMessageId).filter((id): id is string => Boolean(id)),
    latestInbound.internetMessageId,
  ].filter((id): id is string => Boolean(id))));
  const subject = replySubject(thread.subject);
  const headers: Record<string, string> = {};
  if (latestInbound.internetMessageId) headers["In-Reply-To"] = latestInbound.internetMessageId;
  if (references.length > 0) headers.References = references.join(" ");

  const sendResult = await resend.emails.send({
    from: thread.receivedAddress,
    to: replyRecipients,
    subject,
    html: input.bodyHtml,
    headers,
  });
  if (sendResult.error) throw new Error(sendResult.error.message ?? "Resend rejected the reply");

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(resendInboxMessages).values({
      threadId: thread.id,
      direction: "outbound",
      providerEmailId: sendResult.data?.id ?? null,
      internetMessageId: null,
      inReplyToMessageId: latestInbound.internetMessageId ?? null,
      fromEmail: thread.receivedAddress,
      fromName: "Savvy STR Agents",
      toRecipients: replyRecipients,
      subject,
      bodyHtml: input.bodyHtml,
      bodyText: null,
      headers,
      sentById: input.userId,
      receivedAt: now,
    });
    await tx
      .update(resendInboxThreads)
      .set({ lastMessageAt: now })
      .where(eq(resendInboxThreads.id, thread.id));
  });
  await markThreadRead(thread.id, input.userId, false);
  return { success: true, messageId: sendResult.data?.id ?? null };
}

export async function getResendInboxAttachmentUrl(messageId: number, attachmentId: string): Promise<string> {
  const db = await getDb();
  const resend = getResendClient();
  if (!db) throw new Error("Database unavailable");
  if (!resend) throw new Error("Resend API key is not configured");
  const messages = await db.select().from(resendInboxMessages).where(eq(resendInboxMessages.id, messageId)).limit(1);
  const message = messages[0];
  if (!message?.providerEmailId || message.direction !== "inbound") throw new Error("Attachment source is unavailable");
  const attachment = (message.attachments ?? []).find((item) => item.id === attachmentId);
  if (!attachment) throw new Error("Attachment not found");

  const result = await (resend.emails as any).receiving.attachments.get({
    emailId: message.providerEmailId,
    id: attachmentId,
  }) as { data?: { download_url?: string }; error?: { message?: string } };
  if (result.error || !result.data?.download_url) {
    throw new Error(result.error?.message ?? "Unable to create attachment download link");
  }
  return result.data.download_url;
}
