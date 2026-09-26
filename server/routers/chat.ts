import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, inArray, like, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  chatChannelMembers,
  chatChannelHides,
  chatChannelReads,
  chatChannels,
  chatUserAccess,
  chatMessageAttachments,
  chatMessageMentions,
  chatMessageReactions,
  chatMessages,
  chatSections,
  userProfiles,
  users,
} from "../../drizzle/schema";
import {
  canOpenChatWorkspace,
  canManageChatMessage,
  canPostInChatGroup,
  canReadChatConversation,
  type ChatRole,
} from "../chatAccess";
import { getDb } from "../db";
import { notifyMobileUsers } from "../mobileNotifications";
import { canAdminUsePermission } from "./permissions";
import { protectedProcedure, router } from "../_core/trpc";

const MAX_MESSAGE_LENGTH = 8_000;
const MAX_ATTACHMENTS_PER_MESSAGE = 10;
const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "✅"] as const;
const channelIdSchema = z.object({ channelId: z.number().int().positive() });
const messageIdSchema = z.object({ messageId: z.number().int().positive() });

const messageInputSchema = z
  .object({
    channelId: z.number().int().positive(),
    body: z.string().trim().max(MAX_MESSAGE_LENGTH).default(""),
    attachmentIds: z
      .array(z.number().int().positive())
      .max(MAX_ATTACHMENTS_PER_MESSAGE)
      .default([]),
    mentionUserIds: z.array(z.number().int().positive()).max(30).default([]),
    parentMessageId: z.number().int().positive().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.body && value.attachmentIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Write a message or attach a file.",
        path: ["body"],
      });
    }
  });

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function channelType(value: string): "group" | "direct" {
  return value === "direct" ? "direct" : "group";
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values));
}

function directKey(leftUserId: number, rightUserId: number) {
  return [leftUserId, rightUserId].sort((a, b) => a - b).join(":");
}

async function requireDatabase() {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Chat is temporarily unavailable.",
    });
  }
  return db;
}

/**
 * Creates the company channel shells without changing the existing role-based
 * Chat rollout. Membership and non-admin access remain deliberately unchanged.
 */
async function ensureCompanyChannels(
  db: Awaited<ReturnType<typeof requireDatabase>>,
  createdById: number
) {
  const [existingSection] = await db
    .select({ id: chatSections.id })
    .from(chatSections)
    .where(eq(chatSections.name, "Company"))
    .limit(1);
  const sectionId = existingSection?.id ?? Number((await db.insert(chatSections).values({
    name: "Company",
    description: "Company-wide communication",
    sortOrder: 0,
    createdById,
  }))[0].insertId);

  for (const channel of [
    { name: "announcements", description: "Company announcements from Chat Admins." },
    { name: "general", description: "Company-wide conversation." },
  ]) {
    const [existingChannel] = await db
      .select({ id: chatChannels.id })
      .from(chatChannels)
      .where(and(eq(chatChannels.name, channel.name), eq(chatChannels.isPermanent, true)))
      .limit(1);
    if (!existingChannel) {
      await db.insert(chatChannels).values({
        sectionId,
        type: "group",
        isPermanent: true,
        name: channel.name,
        description: channel.description,
        createdById,
      });
    }
  }
}

async function getChatState(user: {
  id: number;
  role: string;
  email?: string | null;
}) {
  const role = user.role as ChatRole;
  const isAdmin = role === "admin";
  const db = await requireDatabase();
  // Resolve sequentially because a new administrator may need its permission row
  // initialized before the second capability is checked.
  const isChatAdmin = isAdmin
    ? await canAdminUsePermission(user, "canManageChat")
    : false;
  const hasChatViewPermission = isAdmin
    ? await canAdminUsePermission(user, "canViewChat")
    : false;

  const membershipRows = await db
    .select({ channelId: chatChannelMembers.channelId })
    .from(chatChannelMembers)
    .where(eq(chatChannelMembers.userId, user.id));
  const explicitAccessRows = await db
    .select({ isEnabled: chatUserAccess.isEnabled })
    .from(chatUserAccess)
    .where(eq(chatUserAccess.userId, user.id))
    .limit(1);
  const memberChannelIds = new Set(membershipRows.map(row => row.channelId));
  const hasExplicitAccess = explicitAccessRows[0]?.isEnabled === true;
  const canAccess = canOpenChatWorkspace({
    role,
    hasChatViewPermission,
    isChatAdmin,
    hasExplicitAccess,
    hasConversationMembership: memberChannelIds.size > 0,
  });

  return {
    db,
    isChatAdmin,
    hasChatViewPermission: isChatAdmin || hasChatViewPermission,
    hasExplicitAccess,
    memberChannelIds,
    canAccess,
  };
}

async function requireChatAccess(user: {
  id: number;
  role: string;
  email?: string | null;
}) {
  const state = await getChatState(user);
  if (!state.canAccess) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Chat access has not been enabled for this account.",
    });
  }
  return state;
}

async function requireChatAdmin(user: {
  id: number;
  role: string;
  email?: string | null;
}) {
  const state = await getChatState(user);
  if (!state.isChatAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Chat Admin access is required.",
    });
  }
  return state;
}

async function getChannelOrThrow(
  db: Awaited<ReturnType<typeof requireDatabase>>,
  channelId: number
) {
  const rows = await db
    .select()
    .from(chatChannels)
    .where(eq(chatChannels.id, channelId))
    .limit(1);
  const channel = rows[0];
  if (!channel) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
  }
  return channel;
}

async function requireReadableChannel(
  user: { id: number; role: string; email?: string | null },
  channelId: number
) {
  const state = await requireChatAccess(user);
  const channel = await getChannelOrThrow(state.db, channelId);
  if (channel.isArchived) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This conversation has been archived.",
    });
  }
  if (
    !canReadChatConversation({
      isChatAdmin: state.isChatAdmin,
      memberGroupIds: state.memberChannelIds,
      channelId,
      channelType: channelType(channel.type),
      isPermanent: channel.isPermanent,
    })
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a participant in this conversation.",
    });
  }
  return { ...state, channel };
}

async function requireMessageContext(
  user: { id: number; role: string; email?: string | null },
  messageId: number
) {
  const state = await requireChatAccess(user);
  const rows = await state.db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.id, messageId))
    .limit(1);
  const message = rows[0];
  if (!message) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Message not found." });
  }
  const channel = await getChannelOrThrow(state.db, message.channelId);
  if (
    channel.isArchived ||
        !canReadChatConversation({
          isChatAdmin: state.isChatAdmin,
      memberGroupIds: state.memberChannelIds,
      channelId: channel.id,
      channelType: channelType(channel.type),
      isPermanent: channel.isPermanent,
    })
  ) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return { ...state, message, channel };
}

async function validateConversationMemberIds(
  db: Awaited<ReturnType<typeof requireDatabase>>,
  channelId: number,
  userIds: number[]
) {
  const ids = uniqueNumbers(userIds);
  if (ids.length === 0) return [];
  const members = await db
    .select({ userId: chatChannelMembers.userId })
    .from(chatChannelMembers)
    .where(
      and(
        eq(chatChannelMembers.channelId, channelId),
        inArray(chatChannelMembers.userId, ids)
      )
    );
  if (members.length !== ids.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "People mentioned must be participants in this conversation.",
    });
  }
  return ids;
}

async function unreadSummary(
  db: Awaited<ReturnType<typeof requireDatabase>>,
  userId: number,
  channelIds: number[]
) {
  if (!channelIds.length) return new Map<number, { unreadCount: number; unreadMentionCount: number }>();
  const reads = await db
    .select({ channelId: chatChannelReads.channelId, lastReadMessageId: chatChannelReads.lastReadMessageId })
    .from(chatChannelReads)
    .where(
      and(
        eq(chatChannelReads.userId, userId),
        inArray(chatChannelReads.channelId, channelIds)
      )
    );
  const readsByChannel = new Map(reads.map(row => [row.channelId, row.lastReadMessageId ?? 0]));

  const results = await Promise.all(
    channelIds.map(async channelId => {
      const lastReadId = readsByChannel.get(channelId) ?? 0;
      const [messageCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.channelId, channelId),
            ne(chatMessages.senderId, userId),
            gt(chatMessages.id, lastReadId)
          )
        );
      const [mentionCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(chatMessageMentions)
        .innerJoin(chatMessages, eq(chatMessages.id, chatMessageMentions.messageId))
        .where(
          and(
            eq(chatMessages.channelId, channelId),
            eq(chatMessageMentions.mentionedUserId, userId),
            gt(chatMessages.id, lastReadId)
          )
        );
      return [
        channelId,
        {
          unreadCount: Number(messageCount?.count ?? 0),
          unreadMentionCount: Number(mentionCount?.count ?? 0),
        },
      ] as const;
    })
  );
  return new Map(results);
}

async function hydrateMessages(
  db: Awaited<ReturnType<typeof requireDatabase>>,
  rows: any[],
  currentUserId: number
) {
  const messageIds = rows.map(row => row.message.id);
  if (!messageIds.length) return [];
  const parentIds = uniqueNumbers(
    rows.map(row => row.message.parentMessageId).filter((id): id is number => !!id)
  );
  const [attachments, mentions, reactions, parents] = await Promise.all([
    db
      .select()
      .from(chatMessageAttachments)
      .where(inArray(chatMessageAttachments.messageId, messageIds))
      .orderBy(asc(chatMessageAttachments.id)),
    db
      .select({
        messageId: chatMessageMentions.messageId,
        user: { id: users.id, name: users.name, email: users.email },
      })
      .from(chatMessageMentions)
      .innerJoin(users, eq(users.id, chatMessageMentions.mentionedUserId))
      .where(inArray(chatMessageMentions.messageId, messageIds)),
    db
      .select({
        messageId: chatMessageReactions.messageId,
        userId: chatMessageReactions.userId,
        emoji: chatMessageReactions.emoji,
      })
      .from(chatMessageReactions)
      .where(inArray(chatMessageReactions.messageId, messageIds)),
    parentIds.length
      ? db
          .select({
            message: chatMessages,
            sender: { id: users.id, name: users.name, email: users.email },
          })
          .from(chatMessages)
          .innerJoin(users, eq(users.id, chatMessages.senderId))
          .where(inArray(chatMessages.id, parentIds))
      : Promise.resolve([]),
  ]);

  const attachmentsByMessage = new Map<number, any[]>();
  for (const attachment of attachments) {
    if (!attachment.messageId) continue;
    const values = attachmentsByMessage.get(attachment.messageId) ?? [];
    values.push(attachment);
    attachmentsByMessage.set(attachment.messageId, values);
  }
  const mentionsByMessage = new Map<number, any[]>();
  for (const mention of mentions) {
    const values = mentionsByMessage.get(mention.messageId) ?? [];
    values.push(mention.user);
    mentionsByMessage.set(mention.messageId, values);
  }
  const reactionsByMessage = new Map<number, Map<string, { count: number; reactedByMe: boolean }>>();
  for (const reaction of reactions) {
    const aggregate = reactionsByMessage.get(reaction.messageId) ?? new Map();
    const current = aggregate.get(reaction.emoji) ?? { count: 0, reactedByMe: false };
    current.count += 1;
    current.reactedByMe = current.reactedByMe || reaction.userId === currentUserId;
    aggregate.set(reaction.emoji, current);
    reactionsByMessage.set(reaction.messageId, aggregate);
  }
  const parentsById = new Map(parents.map(parent => [parent.message.id, parent]));

  return rows.map(row => ({
    ...row,
    attachments: attachmentsByMessage.get(row.message.id) ?? [],
    mentions: mentionsByMessage.get(row.message.id) ?? [],
    reactions: Array.from(
      (reactionsByMessage.get(row.message.id) ?? new Map()).entries()
    ).map(
      ([emoji, value]) => ({ emoji, ...value })
    ),
    parent: row.message.parentMessageId
      ? parentsById.get(row.message.parentMessageId) ?? null
      : null,
  }));
}

/** Used by the authenticated multipart upload route, not exposed as a public API. */
export async function authorizeChatAttachmentUpload(
  user: { id: number; role: string; email?: string | null },
  channelId: number
) {
  const state = await requireReadableChannel(user, channelId);
  if (
    !canPostInChatGroup({
      isChatAdmin: state.isChatAdmin,
      memberGroupIds: state.memberChannelIds,
      groupId: channelId,
      isPermanent: state.channel.isPermanent,
      channelName: state.channel.name,
    })
  ) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return state;
}

export const chatRouter = router({
  /** Safe for app navigation. It does not disclose any conversation content. */
  access: protectedProcedure.query(async ({ ctx }) => {
    const state = await getChatState(ctx.user);
    return {
      canAccess: state.canAccess,
      isChatAdmin: state.isChatAdmin,
      hasExplicitAccess: state.hasExplicitAccess,
      agentChatRolloutEnabled: false,
    };
  }),

  accessManagement: router({
    /** Chat Admins enable entry to Chat without altering a person's channel roster. */
    list: protectedProcedure.query(async ({ ctx }) => {
      const state = await requireChatAdmin(ctx.user);
      return state.db
        .select({
          userId: chatUserAccess.userId,
          isEnabled: chatUserAccess.isEnabled,
          updatedAt: chatUserAccess.updatedAt,
        })
        .from(chatUserAccess)
        .orderBy(asc(chatUserAccess.userId));
    }),
    set: protectedProcedure.input(z.object({ userId: z.number().int().positive(), isEnabled: z.boolean() })).mutation(async ({ input, ctx }) => {
      const state = await requireChatAdmin(ctx.user);
      const targetRows = await state.db.select({ id: users.id, isActive: users.isActive, personType: users.personType }).from(users).where(eq(users.id, input.userId)).limit(1);
      const target = targetRows[0];
      if (!target || !target.isActive || target.personType !== "full_user") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active SavvyOS user." });
      }
      await state.db.insert(chatUserAccess).values({ userId: input.userId, isEnabled: input.isEnabled, updatedById: ctx.user.id }).onDuplicateKeyUpdate({ set: { isEnabled: input.isEnabled, updatedById: ctx.user.id } });
      return { success: true, isEnabled: input.isEnabled };
    }),
  }),

  /** Sidebar data: permanent company groups plus each user's private My Chats. */
  workspace: protectedProcedure.query(async ({ ctx }) => {
    const state = await requireChatAccess(ctx.user);
    if (state.isChatAdmin) await ensureCompanyChannels(state.db, ctx.user.id);
    const [sections, channels, hiddenRows] = await Promise.all([
      state.db
        .select()
        .from(chatSections)
        .where(eq(chatSections.isArchived, false))
        .orderBy(asc(chatSections.sortOrder), asc(chatSections.name)),
      state.db
        .select()
        .from(chatChannels)
        .where(eq(chatChannels.isArchived, false))
        .orderBy(asc(chatChannels.name)),
      state.db
        .select({ channelId: chatChannelHides.channelId })
        .from(chatChannelHides)
        .where(eq(chatChannelHides.userId, ctx.user.id)),
    ]);
    const hiddenChannelIds = new Set(hiddenRows.map(row => row.channelId));
    const permanentGroups = channels.filter(channel => channel.isPermanent);
    const visiblePermanentGroups = permanentGroups.filter(channel =>
      canReadChatConversation({
        isChatAdmin: state.isChatAdmin,
        memberGroupIds: state.memberChannelIds,
        channelId: channel.id,
        channelType: channelType(channel.type),
        isPermanent: true,
      })
    );
    const personalChannels = channels.filter(
      channel => !channel.isPermanent && state.memberChannelIds.has(channel.id) && !hiddenChannelIds.has(channel.id)
    );
    const allVisibleChannels = [...visiblePermanentGroups, ...personalChannels];
    const summaries = await unreadSummary(
      state.db,
      ctx.user.id,
      allVisibleChannels.map(channel => channel.id)
    );

    const groupsBySection = new Map<number | null, any[]>();
    const activeSectionIds = new Set(sections.map(section => section.id));
    for (const group of visiblePermanentGroups) {
      const sectionKey =
        group.sectionId != null && activeSectionIds.has(group.sectionId) ? group.sectionId : null;
      const collection = groupsBySection.get(sectionKey) ?? [];
      collection.push({ ...group, ...(summaries.get(group.id) ?? { unreadCount: 0, unreadMentionCount: 0 }) });
      groupsBySection.set(sectionKey, collection);
    }
    const visibleSections = sections
      .map(section => ({ section, groups: groupsBySection.get(section.id) ?? [] }))
      .filter(item => state.isChatAdmin || item.groups.length > 0);

    const personalIds = personalChannels.map(channel => channel.id);
    const personalParticipants = personalIds.length
      ? await state.db
          .select({
            channelId: chatChannelMembers.channelId,
            user: { id: users.id, name: users.name, email: users.email, role: users.role },
            profilePhotoUrl: userProfiles.profilePhotoUrl,
          })
          .from(chatChannelMembers)
          .innerJoin(users, eq(users.id, chatChannelMembers.userId))
          .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
          .where(inArray(chatChannelMembers.channelId, personalIds))
      : [];
    const peopleByChannel = new Map<number, any[]>();
    for (const participant of personalParticipants) {
      const values = peopleByChannel.get(participant.channelId) ?? [];
      values.push({ ...participant.user, profilePhotoUrl: participant.profilePhotoUrl });
      peopleByChannel.set(participant.channelId, values);
    }
    const latestMessages = personalIds.length
      ? await state.db
          .select({ channelId: chatMessages.channelId, createdAt: chatMessages.createdAt, id: chatMessages.id })
          .from(chatMessages)
          .where(inArray(chatMessages.channelId, personalIds))
          .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
      : [];
    const latestByChannel = new Map<number, { createdAt: Date; id: number }>();
    for (const message of latestMessages) {
      if (!latestByChannel.has(message.channelId)) latestByChannel.set(message.channelId, message);
    }
    const personalChats = personalChannels
      .map(channel => {
        const participants = peopleByChannel.get(channel.id) ?? [];
        const person = channelType(channel.type) === "direct"
          ? participants.find(participant => participant.id !== ctx.user.id) ?? null
          : null;
        const others = participants.filter(participant => participant.id !== ctx.user.id);
        return {
          channel,
          person,
          participants: others,
          title: person ? person.name ?? person.email ?? "Direct message" : channel.name,
          lastMessageAt: latestByChannel.get(channel.id)?.createdAt ?? channel.updatedAt,
          ...(summaries.get(channel.id) ?? { unreadCount: 0, unreadMentionCount: 0 }),
        };
      })
      .sort((left, right) => Number(new Date(right.lastMessageAt)) - Number(new Date(left.lastMessageAt)));

    return {
      isChatAdmin: state.isChatAdmin,
      sections: visibleSections,
      unsectioned: groupsBySection.get(null) ?? [],
      personalChats,
      totalUnreadCount: Array.from(summaries.values()).reduce(
        (total, item) => total + item.unreadCount,
        0
      ),
    };
  }),

  /**
   * Chat-only search. Candidate conversations are privacy-filtered before any
   * message or attachment query runs. Direct messages remain invisible to Chat
   * Admins unless that admin is a direct-message participant.
   */
  search: protectedProcedure
    .input(z.object({ query: z.string().trim().min(2).max(100) }))
    .query(async ({ input, ctx }) => {
      const state = await requireChatAccess(ctx.user);
      const pattern = `%${input.query.replace(/[\\%_]/g, "\\$&")}%`;
      const activeChannels = await state.db
        .select()
        .from(chatChannels)
        .where(eq(chatChannels.isArchived, false));
      const visibleChannels = activeChannels.filter(channel =>
        canReadChatConversation({
          isChatAdmin: state.isChatAdmin,
          memberGroupIds: state.memberChannelIds,
          channelId: channel.id,
          channelType: channelType(channel.type),
          isPermanent: channel.isPermanent,
        })
      );
      const visibleChannelIds = visibleChannels.map(channel => channel.id);
      if (!visibleChannelIds.length) {
        return { conversations: [], messages: [], attachments: [] };
      }

      const visibleDirectIds = visibleChannels
        .filter(channel => channelType(channel.type) === "direct")
        .map(channel => channel.id);
      const directParticipants = visibleDirectIds.length
        ? await state.db
            .select({
              channelId: chatChannelMembers.channelId,
              person: { id: users.id, name: users.name, email: users.email, role: users.role },
              profilePhotoUrl: userProfiles.profilePhotoUrl,
            })
            .from(chatChannelMembers)
            .innerJoin(users, eq(users.id, chatChannelMembers.userId))
            .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
            .where(inArray(chatChannelMembers.channelId, visibleDirectIds))
        : [];
      const directPersonByChannel = new Map(
        visibleDirectIds.map(channelId => [
          channelId,
          directParticipants.find(item => item.channelId === channelId && item.person.id !== ctx.user.id) ?? null,
        ])
      );

      const conversations = visibleChannels
        .map(channel => {
          const directPerson = directPersonByChannel.get(channel.id);
          const title = directPerson
            ? directPerson.person.name ?? directPerson.person.email ?? "Direct message"
            : channel.name;
          const haystack = `${title} ${channel.description ?? ""}`.toLowerCase();
          return haystack.includes(input.query.toLowerCase())
            ? { channel, person: directPerson?.person ?? null, profilePhotoUrl: directPerson?.profilePhotoUrl ?? null }
            : null;
        })
        .filter((item): item is NonNullable<typeof item> => !!item)
        .slice(0, 12);

      const [messageRows, attachmentRows] = await Promise.all([
        state.db
          .select({
            message: chatMessages,
            sender: { id: users.id, name: users.name, email: users.email },
          })
          .from(chatMessages)
          .innerJoin(users, eq(users.id, chatMessages.senderId))
          .where(and(inArray(chatMessages.channelId, visibleChannelIds), like(chatMessages.body, pattern)))
          .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
          .limit(30),
        state.db
          .select({
            attachment: chatMessageAttachments,
            message: { id: chatMessages.id, channelId: chatMessages.channelId, body: chatMessages.body, createdAt: chatMessages.createdAt },
            sender: { id: users.id, name: users.name, email: users.email },
          })
          .from(chatMessageAttachments)
          .innerJoin(chatMessages, eq(chatMessages.id, chatMessageAttachments.messageId))
          .innerJoin(users, eq(users.id, chatMessages.senderId))
          .where(and(inArray(chatMessages.channelId, visibleChannelIds), like(chatMessageAttachments.fileName, pattern)))
          .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
          .limit(20),
      ]);
      const channelsById = new Map(visibleChannels.map(channel => [channel.id, channel]));
      const titleFor = (channelId: number) => {
        const channel = channelsById.get(channelId)!;
        const person = directPersonByChannel.get(channelId);
        return person?.person.name ?? person?.person.email ?? channel.name;
      };
      return {
        conversations,
        messages: messageRows.map(row => ({ ...row, channelTitle: titleFor(row.message.channelId), channelType: channelsById.get(row.message.channelId)?.type ?? "group" })),
        attachments: attachmentRows.map(row => ({ ...row, channelTitle: titleFor(row.message.channelId), channelType: channelsById.get(row.message.channelId)?.type ?? "group" })),
      };
    }),

  messages: router({
    list: protectedProcedure
      .input(channelIdSchema.extend({ limit: z.number().int().min(1).max(200).default(100) }))
      .query(async ({ input, ctx }) => {
        const state = await requireReadableChannel(ctx.user, input.channelId);
        const rows = await state.db
          .select({
            message: chatMessages,
            sender: { id: users.id, name: users.name, email: users.email, role: users.role },
            profilePhotoUrl: userProfiles.profilePhotoUrl,
          })
          .from(chatMessages)
          .innerJoin(users, eq(users.id, chatMessages.senderId))
          .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
          .where(eq(chatMessages.channelId, input.channelId))
          .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
          .limit(input.limit);
        return hydrateMessages(state.db, rows.reverse(), ctx.user.id);
      }),

    send: protectedProcedure.input(messageInputSchema).mutation(async ({ input, ctx }) => {
      const state = await requireReadableChannel(ctx.user, input.channelId);
      if (
        !canPostInChatGroup({
          isChatAdmin: state.isChatAdmin,
          memberGroupIds: state.memberChannelIds,
          groupId: input.channelId,
          isPermanent: state.channel.isPermanent,
          channelName: state.channel.name,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const attachmentIds = uniqueNumbers(input.attachmentIds);
      const mentionUserIds = await validateConversationMemberIds(
        state.db,
        input.channelId,
        input.mentionUserIds
      );
      if (input.parentMessageId) {
        const parentRows = await state.db
          .select({ id: chatMessages.id, channelId: chatMessages.channelId })
          .from(chatMessages)
          .where(eq(chatMessages.id, input.parentMessageId))
          .limit(1);
        if (!parentRows[0] || parentRows[0].channelId !== input.channelId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a message from this conversation to reply to." });
        }
      }

      const messageId = await state.db.transaction(async tx => {
        if (attachmentIds.length) {
          const attachments = await tx
            .select({ id: chatMessageAttachments.id })
            .from(chatMessageAttachments)
            .where(
              and(
                inArray(chatMessageAttachments.id, attachmentIds),
                eq(chatMessageAttachments.channelId, input.channelId),
                eq(chatMessageAttachments.uploadedById, ctx.user.id),
                sql`${chatMessageAttachments.messageId} IS NULL`
              )
            );
          if (attachments.length !== attachmentIds.length) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "One or more attachments are no longer available." });
          }
        }
        const result = await tx.insert(chatMessages).values({
          channelId: input.channelId,
          senderId: ctx.user.id,
          parentMessageId: input.parentMessageId ?? null,
          body: input.body,
        });
        const id = Number(result[0].insertId);
        if (!state.channel.isPermanent) {
          await tx.delete(chatChannelHides).where(and(eq(chatChannelHides.channelId, input.channelId), ne(chatChannelHides.userId, ctx.user.id)));
        }
        if (attachmentIds.length) {
          await tx
            .update(chatMessageAttachments)
            .set({ messageId: id })
            .where(inArray(chatMessageAttachments.id, attachmentIds));
        }
        if (mentionUserIds.length) {
          await tx.insert(chatMessageMentions).values(
            mentionUserIds.map(mentionedUserId => ({ messageId: id, mentionedUserId }))
          );
        }
        return id;
      });
      const recipients = await state.db
        .select({ userId: chatChannelMembers.userId })
        .from(chatChannelMembers)
        .where(eq(chatChannelMembers.channelId, input.channelId));
      void notifyMobileUsers(
        recipients.map((recipient) => recipient.userId).filter((userId) => userId !== ctx.user.id),
        {
          title: state.channel.name || "Savvy Chat",
          body: `${ctx.user.name ?? "Teammate"}: ${input.body || "Shared an attachment"}`,
          data: { path: "/chat", channelId: input.channelId },
        }
      );
      return { id: messageId };
    }),

    update: protectedProcedure
      .input(messageIdSchema.extend({ body: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH) }))
      .mutation(async ({ input, ctx }) => {
        const state = await requireMessageContext(ctx.user, input.messageId);
        if (!canManageChatMessage({ messageSenderId: state.message.senderId, requestingUserId: ctx.user.id })) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the sender can edit this message." });
        }
        await state.db
          .update(chatMessages)
          .set({ body: input.body, editedAt: new Date() })
          .where(eq(chatMessages.id, input.messageId));
        return { success: true };
      }),

    delete: protectedProcedure.input(messageIdSchema).mutation(async ({ input, ctx }) => {
      const state = await requireMessageContext(ctx.user, input.messageId);
      if (!canManageChatMessage({ messageSenderId: state.message.senderId, requestingUserId: ctx.user.id })) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the sender can delete this message." });
      }
      await state.db.delete(chatMessages).where(eq(chatMessages.id, input.messageId));
      return { success: true };
    }),

    markRead: protectedProcedure
      .input(channelIdSchema.extend({ messageId: z.number().int().positive().nullable().optional() }))
      .mutation(async ({ input, ctx }) => {
        const state = await requireReadableChannel(ctx.user, input.channelId);
        let messageId = input.messageId ?? null;
        if (messageId) {
          const rows = await state.db.select({ id: chatMessages.id, channelId: chatMessages.channelId }).from(chatMessages).where(eq(chatMessages.id, messageId)).limit(1);
          if (!rows[0] || rows[0].channelId !== input.channelId) throw new TRPCError({ code: "BAD_REQUEST", message: "That message is not in this conversation." });
        } else {
          const rows = await state.db.select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.channelId, input.channelId)).orderBy(desc(chatMessages.id)).limit(1);
          messageId = rows[0]?.id ?? null;
        }
        const [existingRead] = await state.db.select({ lastReadMessageId: chatChannelReads.lastReadMessageId }).from(chatChannelReads).where(and(eq(chatChannelReads.channelId, input.channelId), eq(chatChannelReads.userId, ctx.user.id))).limit(1);
        const currentLastReadMessageId = existingRead?.lastReadMessageId ?? null;
        if (currentLastReadMessageId && (!messageId || currentLastReadMessageId >= messageId)) return { success: true, messageId: currentLastReadMessageId };
        await state.db.insert(chatChannelReads).values({ channelId: input.channelId, userId: ctx.user.id, lastReadMessageId: messageId, lastReadAt: new Date() }).onDuplicateKeyUpdate({ set: { lastReadMessageId: messageId, lastReadAt: new Date() } });
        return { success: true, messageId };
      }),

    readState: protectedProcedure.input(channelIdSchema).query(async ({ input, ctx }) => {
      const state = await requireReadableChannel(ctx.user, input.channelId);
      const [row] = await state.db.select({ lastReadMessageId: chatChannelReads.lastReadMessageId }).from(chatChannelReads).where(and(eq(chatChannelReads.channelId, state.channel.id), eq(chatChannelReads.userId, ctx.user.id))).limit(1);
      return { lastReadMessageId: row?.lastReadMessageId ?? null };
    }),

    markUnread: protectedProcedure.input(messageIdSchema).mutation(async ({ input, ctx }) => {
      const state = await requireMessageContext(ctx.user, input.messageId);
      const [previous] = await state.db.select({ id: chatMessages.id }).from(chatMessages).where(and(eq(chatMessages.channelId, state.channel.id), lt(chatMessages.id, state.message.id))).orderBy(desc(chatMessages.id)).limit(1);
      const lastReadMessageId = previous?.id ?? null;
      await state.db.insert(chatChannelReads).values({ channelId: state.channel.id, userId: ctx.user.id, lastReadMessageId, lastReadAt: new Date() }).onDuplicateKeyUpdate({ set: { lastReadMessageId, lastReadAt: new Date() } });
      return { success: true, lastReadMessageId };
    }),
  }),

  reactions: router({
    toggle: protectedProcedure
      .input(messageIdSchema.extend({ emoji: z.enum(REACTION_EMOJIS) }))
      .mutation(async ({ input, ctx }) => {
        const state = await requireMessageContext(ctx.user, input.messageId);
        const existing = await state.db
          .select({ id: chatMessageReactions.id })
          .from(chatMessageReactions)
          .where(
            and(
              eq(chatMessageReactions.messageId, input.messageId),
              eq(chatMessageReactions.userId, ctx.user.id),
              eq(chatMessageReactions.emoji, input.emoji)
            )
          )
          .limit(1);
        if (existing[0]) {
          await state.db.delete(chatMessageReactions).where(eq(chatMessageReactions.id, existing[0].id));
          return { active: false };
        }
        await state.db.insert(chatMessageReactions).values({ messageId: input.messageId, userId: ctx.user.id, emoji: input.emoji });
        return { active: true };
      }),
  }),

  directs: router({
    open: protectedProcedure
      .input(z.object({ userId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const state = await requireChatAccess(ctx.user);
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose another person to start a direct message." });
        }
        const targetRows = await state.db
          .select()
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1);
        const target = targetRows[0];
        if (!target || !target.isActive || target.personType !== "full_user") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active SavvyOS user." });
        }
        const key = directKey(ctx.user.id, input.userId);
        const existing = await state.db
          .select({ id: chatChannels.id })
          .from(chatChannels)
          .where(eq(chatChannels.directKey, key))
          .limit(1);
        if (existing[0]) {
          await state.db
            .delete(chatChannelHides)
            .where(and(eq(chatChannelHides.channelId, existing[0].id), eq(chatChannelHides.userId, ctx.user.id)));
          return { channelId: existing[0].id, created: false };
        }
        const channelId = await state.db.transaction(async tx => {
          const again = await tx
            .select({ id: chatChannels.id })
            .from(chatChannels)
            .where(eq(chatChannels.directKey, key))
            .limit(1);
          if (again[0]) return again[0].id;
          const result = await tx.insert(chatChannels).values({
            type: "direct",
            isPermanent: false,
            directKey: key,
            name: "Direct message",
            createdById: ctx.user.id,
          });
          const id = Number(result[0].insertId);
          await tx.insert(chatChannelMembers).values([
            { channelId: id, userId: ctx.user.id, addedById: ctx.user.id },
            { channelId: id, userId: input.userId, addedById: ctx.user.id },
          ]);
          return id;
        });
        return { channelId, created: true };
      }),
  }),

  conversations: router({
    /** Creates a participant-owned personal chat. One invitee makes a DM; two or more make a private group. */
    create: protectedProcedure
      .input(z.object({ userIds: z.array(z.number().int().positive()).min(1).max(29), name: z.string().trim().min(1).max(100).optional() }))
      .mutation(async ({ input, ctx }) => {
        const state = await requireChatAccess(ctx.user);
        const inviteeIds = uniqueNumbers(input.userIds).filter(id => id !== ctx.user.id);
        if (!inviteeIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose at least one other person." });
        const targets = await state.db.select().from(users).where(inArray(users.id, inviteeIds));
        if (targets.length !== inviteeIds.length || targets.some(target => !target.isActive || target.personType !== "full_user")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose active SavvyOS users." });
        }
        // The personal conversation grants the invitee access to that specific
        // chat. An explicit entitlement is not required for a recipient to
        // receive and reply to an invitation.
        if (inviteeIds.length === 1) {
          const key = directKey(ctx.user.id, inviteeIds[0]);
          const existing = await state.db.select({ id: chatChannels.id }).from(chatChannels).where(eq(chatChannels.directKey, key)).limit(1);
          if (existing[0]) {
            await state.db.delete(chatChannelHides).where(and(eq(chatChannelHides.channelId, existing[0].id), eq(chatChannelHides.userId, ctx.user.id)));
            return { channelId: existing[0].id, created: false, type: "direct" as const };
          }
          const channelId = await state.db.transaction(async tx => {
            const result = await tx.insert(chatChannels).values({ type: "direct", isPermanent: false, directKey: key, name: "Direct message", createdById: ctx.user.id });
            const id = Number(result[0].insertId);
            await tx.insert(chatChannelMembers).values([{ channelId: id, userId: ctx.user.id, addedById: ctx.user.id }, { channelId: id, userId: inviteeIds[0], addedById: ctx.user.id }]);
            return id;
          });
          return { channelId, created: true, type: "direct" as const };
        }
        const generatedName = targets.map(target => target.name ?? target.email ?? "Teammate").join(", ").slice(0, 100);
        const channelId = await state.db.transaction(async tx => {
          const result = await tx.insert(chatChannels).values({ type: "group", isPermanent: false, name: input.name?.trim() || generatedName || "Group chat", createdById: ctx.user.id });
          const id = Number(result[0].insertId);
          await tx.insert(chatChannelMembers).values([ctx.user.id, ...inviteeIds].map(userId => ({ channelId: id, userId, addedById: ctx.user.id })));
          return id;
        });
        return { channelId, created: true, type: "group" as const };
      }),
    archive: protectedProcedure.input(channelIdSchema).mutation(async ({ input, ctx }) => {
      const state = await requireReadableChannel(ctx.user, input.channelId);
      if (state.channel.isPermanent) throw new TRPCError({ code: "BAD_REQUEST", message: "Permanent company groups cannot be archived." });
      await state.db.insert(chatChannelHides).values({ channelId: input.channelId, userId: ctx.user.id }).onDuplicateKeyUpdate({ set: { hiddenAt: new Date() } });
      return { success: true };
    }),
  }),

  participants: router({
    list: protectedProcedure.input(channelIdSchema).query(async ({ input, ctx }) => {
      const state = await requireReadableChannel(ctx.user, input.channelId);
      return state.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          profilePhotoUrl: userProfiles.profilePhotoUrl,
        })
        .from(chatChannelMembers)
        .innerJoin(users, eq(users.id, chatChannelMembers.userId))
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(eq(chatChannelMembers.channelId, input.channelId))
        .orderBy(asc(users.name), asc(users.email));
    }),
  }),

  sections: router({
    create: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(500).optional().nullable(), sortOrder: z.number().int().min(0).max(10_000).optional() }))
      .mutation(async ({ input, ctx }) => {
        const state = await requireChatAdmin(ctx.user);
        const result = await state.db.insert(chatSections).values({ name: input.name, description: textOrNull(input.description), sortOrder: input.sortOrder ?? 0, createdById: ctx.user.id });
        return { id: Number(result[0].insertId) };
      }),
    update: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(100).optional(), description: z.string().trim().max(500).optional().nullable(), sortOrder: z.number().int().min(0).max(10_000).optional() }))
      .mutation(async ({ input, ctx }) => {
        const state = await requireChatAdmin(ctx.user);
        const existing = await state.db.select({ id: chatSections.id }).from(chatSections).where(eq(chatSections.id, input.id)).limit(1);
        if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Chat section not found." });
        const update: Record<string, unknown> = {};
        if (input.name !== undefined) update.name = input.name;
        if (input.description !== undefined) update.description = textOrNull(input.description);
        if (input.sortOrder !== undefined) update.sortOrder = input.sortOrder;
        if (Object.keys(update).length) await state.db.update(chatSections).set(update as any).where(eq(chatSections.id, input.id));
        return { success: true };
      }),
    archive: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const state = await requireChatAdmin(ctx.user);
      const existing = await state.db.select({ id: chatSections.id }).from(chatSections).where(eq(chatSections.id, input.id)).limit(1);
      if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Chat section not found." });
      // Archive the heading only. Groups stay in Chat, unsectioned until restored or moved.
      await state.db.update(chatSections).set({ isArchived: true }).where(eq(chatSections.id, input.id));
      return { success: true };
    }),
    restore: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const state = await requireChatAdmin(ctx.user);
      const existing = await state.db.select({ id: chatSections.id }).from(chatSections).where(eq(chatSections.id, input.id)).limit(1);
      if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Chat section not found." });
      await state.db.update(chatSections).set({ isArchived: false }).where(eq(chatSections.id, input.id));
      return { success: true };
    }),
  }),

  groups: router({
    create: protectedProcedure
      .input(z.object({ sectionId: z.number().int().positive(), name: z.string().trim().min(1).max(100), description: z.string().trim().max(500).optional().nullable() }))
      .mutation(async ({ input, ctx }) => {
        const state = await requireChatAdmin(ctx.user);
        const sections = await state.db.select({ id: chatSections.id, isArchived: chatSections.isArchived }).from(chatSections).where(eq(chatSections.id, input.sectionId)).limit(1);
        if (!sections[0] || sections[0].isArchived) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active Chat section." });
        const result = await state.db.insert(chatChannels).values({ sectionId: input.sectionId, type: "group", isPermanent: true, name: input.name, description: textOrNull(input.description), createdById: ctx.user.id });
        return { id: Number(result[0].insertId) };
      }),
    update: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), sectionId: z.number().int().positive().optional(), name: z.string().trim().min(1).max(100).optional(), description: z.string().trim().max(500).optional().nullable() }))
      .mutation(async ({ input, ctx }) => {
        const state = await requireChatAdmin(ctx.user);
        const group = await getChannelOrThrow(state.db, input.id);
        if (!group.isPermanent) throw new TRPCError({ code: "BAD_REQUEST", message: "Personal chats cannot be managed as permanent groups." });
        if (input.sectionId) {
          const sections = await state.db.select({ id: chatSections.id, isArchived: chatSections.isArchived }).from(chatSections).where(eq(chatSections.id, input.sectionId)).limit(1);
          if (!sections[0] || sections[0].isArchived) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active Chat section." });
        }
        const update: Record<string, unknown> = {};
        if (input.sectionId !== undefined) update.sectionId = input.sectionId;
        if (input.name !== undefined) update.name = input.name;
        if (input.description !== undefined) update.description = textOrNull(input.description);
        if (Object.keys(update).length) await state.db.update(chatChannels).set(update as any).where(eq(chatChannels.id, input.id));
        return { success: true };
      }),
    archive: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const state = await requireChatAdmin(ctx.user);
      const group = await getChannelOrThrow(state.db, input.id);
      if (!group.isPermanent) throw new TRPCError({ code: "BAD_REQUEST", message: "Personal chats cannot be archived here." });
      await state.db.update(chatChannels).set({ isArchived: true }).where(eq(chatChannels.id, input.id));
      return { success: true };
    }),
    restore: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const state = await requireChatAdmin(ctx.user);
      const group = await getChannelOrThrow(state.db, input.id);
      if (!group.isPermanent) throw new TRPCError({ code: "BAD_REQUEST", message: "Personal chats cannot be restored here." });
      await state.db.update(chatChannels).set({ isArchived: false }).where(eq(chatChannels.id, input.id));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const state = await requireChatAdmin(ctx.user);
      const group = await getChannelOrThrow(state.db, input.id);
      if (!group.isPermanent) throw new TRPCError({ code: "BAD_REQUEST", message: "Only permanent company groups can be deleted here." });
      await state.db.delete(chatChannels).where(eq(chatChannels.id, input.id));
      return { success: true };
    }),
  }),

  members: router({
    list: protectedProcedure.input(channelIdSchema).query(async ({ input, ctx }) => {
      const state = await requireChatAdmin(ctx.user);
      const group = await getChannelOrThrow(state.db, input.channelId);
      if (!group.isPermanent) throw new TRPCError({ code: "BAD_REQUEST", message: "Personal chat participants are private." });
      return state.db
        .select({ membership: chatChannelMembers, user: { id: users.id, name: users.name, email: users.email, role: users.role }, profilePhotoUrl: userProfiles.profilePhotoUrl })
        .from(chatChannelMembers)
        .innerJoin(users, eq(users.id, chatChannelMembers.userId))
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(eq(chatChannelMembers.channelId, input.channelId))
        .orderBy(asc(users.name), asc(users.email));
    }),
    add: protectedProcedure.input(channelIdSchema.extend({ userId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const state = await requireChatAdmin(ctx.user);
      const group = await getChannelOrThrow(state.db, input.channelId);
      if (!group.isPermanent) throw new TRPCError({ code: "BAD_REQUEST", message: "Personal chat participants cannot be managed here." });
      const targetRows = await state.db.select({ id: users.id, isActive: users.isActive, personType: users.personType }).from(users).where(eq(users.id, input.userId)).limit(1);
      const target = targetRows[0];
      if (!target || !target.isActive || target.personType !== "full_user") throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active SavvyOS user." });
      const latest = await state.db.select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.channelId, input.channelId)).orderBy(desc(chatMessages.id)).limit(1);
      await state.db.transaction(async tx => {
        await tx.insert(chatChannelMembers).values({ channelId: input.channelId, userId: input.userId, addedById: ctx.user.id }).onDuplicateKeyUpdate({ set: { userId: input.userId } });
        await tx.insert(chatChannelReads).values({ channelId: input.channelId, userId: input.userId, lastReadMessageId: latest[0]?.id ?? null, lastReadAt: new Date() }).onDuplicateKeyUpdate({ set: { lastReadMessageId: latest[0]?.id ?? null, lastReadAt: new Date() } });
      });
      return { success: true };
    }),
    remove: protectedProcedure.input(channelIdSchema.extend({ userId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const state = await requireChatAdmin(ctx.user);
      const group = await getChannelOrThrow(state.db, input.channelId);
      if (!group.isPermanent) throw new TRPCError({ code: "BAD_REQUEST", message: "Personal chat participants cannot be removed." });
      await state.db.delete(chatChannelMembers).where(and(eq(chatChannelMembers.channelId, input.channelId), eq(chatChannelMembers.userId, input.userId)));
      return { success: true };
    }),
  }),

  archived: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const state = await requireChatAdmin(ctx.user);
      const [sections, channels] = await Promise.all([
        state.db
          .select()
          .from(chatSections)
          .where(eq(chatSections.isArchived, true))
          .orderBy(asc(chatSections.name)),
        state.db
          .select()
          .from(chatChannels)
          .where(and(eq(chatChannels.isArchived, true), eq(chatChannels.isPermanent, true)))
          .orderBy(asc(chatChannels.name)),
      ]);
      return { sections, channels };
    }),
  }),

  people: router({
    /** Active users for Chat Admin group controls and direct-message selection. */
    list: protectedProcedure.query(async ({ ctx }) => {
      const state = await requireChatAccess(ctx.user);
      return state.db
        .select({ id: users.id, name: users.name, email: users.email, role: users.role, profilePhotoUrl: userProfiles.profilePhotoUrl })
        .from(users)
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(and(eq(users.isActive, true), eq(users.personType, "full_user")))
        .orderBy(asc(users.name), asc(users.email));
    }),
  }),
});
