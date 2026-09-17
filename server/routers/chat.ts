import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  chatChannelMembers,
  chatChannels,
  chatMessages,
  chatSections,
  userProfiles,
  users,
} from "../../drizzle/schema";
import {
  canOpenChatWorkspace,
  canPostInChatGroup,
  canReadChatGroup,
  type ChatRole,
} from "../chatAccess";
import { getDb } from "../db";
import { canAdminUsePermission } from "./permissions";
import { protectedProcedure, router } from "../_core/trpc";

const MAX_MESSAGE_LENGTH = 8_000;
const groupIdSchema = z.object({ groupId: z.number().int().positive() });

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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

async function getChatState(user: {
  id: number;
  role: string;
  email?: string | null;
}) {
  const role = user.role as ChatRole;
  const isAdmin = role === "admin";
  const db = await requireDatabase();
  // Resolve these sequentially. A newly provisioned administrator may not have
  // an admin_permissions row yet, and the helper initializes that row.
  const isChatAdmin = isAdmin
    ? await canAdminUsePermission(user, "canManageChat")
    : false;
  const hasChatViewPermission = isAdmin
    ? await canAdminUsePermission(user, "canViewChat")
    : false;

  const membershipRows = await db
    .select({ groupId: chatChannelMembers.channelId })
    .from(chatChannelMembers)
    .where(eq(chatChannelMembers.userId, user.id));
  const memberGroupIds = new Set(membershipRows.map(row => row.groupId));
  const isGroupMember = memberGroupIds.size > 0;
  const canAccess = canOpenChatWorkspace({
    role,
    hasChatViewPermission,
    isChatAdmin,
    isGroupMember,
  });

  return {
    db,
    isChatAdmin,
    hasChatViewPermission: isChatAdmin || hasChatViewPermission,
    memberGroupIds,
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

async function getGroupOrThrow(
  db: Awaited<ReturnType<typeof requireDatabase>>,
  groupId: number
) {
  const rows = await db
    .select()
    .from(chatChannels)
    .where(eq(chatChannels.id, groupId))
    .limit(1);
  const group = rows[0];
  if (!group) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Chat group not found.",
    });
  }
  return group;
}

async function requireReadableGroup(
  user: { id: number; role: string; email?: string | null },
  groupId: number
) {
  const state = await requireChatAccess(user);
  const group = await getGroupOrThrow(state.db, groupId);
  if (group.isArchived) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This chat group has been archived.",
    });
  }
  if (
    !canReadChatGroup({
      isChatAdmin: state.isChatAdmin,
      memberGroupIds: state.memberGroupIds,
      groupId,
    })
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this chat group.",
    });
  }
  return { ...state, group };
}

export const chatRouter = router({
  /** Safe for app navigation. It does not expose a group's content. */
  access: protectedProcedure.query(async ({ ctx }) => {
    const state = await getChatState(ctx.user);
    return {
      canAccess: state.canAccess,
      isChatAdmin: state.isChatAdmin,
      agentChatRolloutEnabled: false,
    };
  }),

  /** Grouped sidebar data. Chat Admins receive every active group. */
  workspace: protectedProcedure.query(async ({ ctx }) => {
    const state = await requireChatAccess(ctx.user);
    const [sections, groups] = await Promise.all([
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
    ]);

    const visibleGroups = state.isChatAdmin
      ? groups
      : groups.filter(group => state.memberGroupIds.has(group.id));
    const groupsBySection = new Map<number | null, typeof visibleGroups>();
    for (const group of visibleGroups) {
      const collection = groupsBySection.get(group.sectionId) ?? [];
      collection.push(group);
      groupsBySection.set(group.sectionId, collection);
    }

    const visibleSections = sections
      .map(section => ({
        section,
        groups: groupsBySection.get(section.id) ?? [],
      }))
      .filter(item => state.isChatAdmin || item.groups.length > 0);
    const unsectioned = groupsBySection.get(null) ?? [];

    return {
      isChatAdmin: state.isChatAdmin,
      sections: visibleSections,
      unsectioned,
    };
  }),

  messages: router({
    list: protectedProcedure
      .input(
        groupIdSchema.extend({
          limit: z.number().int().min(1).max(200).default(100),
        })
      )
      .query(async ({ input, ctx }) => {
        const state = await requireReadableGroup(ctx.user, input.groupId);
        const rows = await state.db
          .select({
            message: chatMessages,
            sender: {
              id: users.id,
              name: users.name,
              email: users.email,
              role: users.role,
            },
            profilePhotoUrl: userProfiles.profilePhotoUrl,
          })
          .from(chatMessages)
          .innerJoin(users, eq(users.id, chatMessages.senderId))
          .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
          .where(eq(chatMessages.channelId, input.groupId))
          .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
          .limit(input.limit);
        return rows.reverse();
      }),

    send: protectedProcedure
      .input(
        groupIdSchema.extend({
          body: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const state = await requireReadableGroup(ctx.user, input.groupId);
        if (
          !canPostInChatGroup({
            isChatAdmin: state.isChatAdmin,
            memberGroupIds: state.memberGroupIds,
            groupId: input.groupId,
          })
        ) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const result = await state.db.insert(chatMessages).values({
          channelId: input.groupId,
          senderId: ctx.user.id,
          body: input.body,
        });
        return { id: Number(result[0].insertId) };
      }),

    update: protectedProcedure
      .input(
        z.object({
          messageId: z.number().int().positive(),
          body: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const state = await requireChatAccess(ctx.user);
        const rows = await state.db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.id, input.messageId))
          .limit(1);
        const message = rows[0];
        if (!message) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Message not found.",
          });
        }
        const group = await getGroupOrThrow(state.db, message.channelId);
        if (group.isArchived) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "This chat group has been archived.",
          });
        }
        if (
          !canReadChatGroup({
            isChatAdmin: state.isChatAdmin,
            memberGroupIds: state.memberGroupIds,
            groupId: group.id,
          })
        ) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        if (message.senderId !== ctx.user.id && !state.isChatAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the sender or a Chat Admin can edit this message.",
          });
        }
        await state.db
          .update(chatMessages)
          .set({ body: input.body, editedAt: new Date() })
          .where(eq(chatMessages.id, input.messageId));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ messageId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const state = await requireChatAccess(ctx.user);
        const rows = await state.db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.id, input.messageId))
          .limit(1);
        const message = rows[0];
        if (!message) return { success: true };
        const group = await getGroupOrThrow(state.db, message.channelId);
        if (group.isArchived) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "This chat group has been archived.",
          });
        }
        if (
          !canReadChatGroup({
            isChatAdmin: state.isChatAdmin,
            memberGroupIds: state.memberGroupIds,
            groupId: group.id,
          })
        ) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        if (message.senderId !== ctx.user.id && !state.isChatAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the sender or a Chat Admin can delete this message.",
          });
        }
        await state.db
          .delete(chatMessages)
          .where(eq(chatMessages.id, input.messageId));
        return { success: true };
      }),
  }),

  sections: router({
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(100),
          description: z.string().trim().max(500).optional().nullable(),
          sortOrder: z.number().int().min(0).max(10_000).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const state = await requireChatAdmin(ctx.user);
        const result = await state.db.insert(chatSections).values({
          name: input.name,
          description: textOrNull(input.description),
          sortOrder: input.sortOrder ?? 0,
          createdById: ctx.user.id,
        });
        return { id: Number(result[0].insertId) };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          name: z.string().trim().min(1).max(100).optional(),
          description: z.string().trim().max(500).optional().nullable(),
          sortOrder: z.number().int().min(0).max(10_000).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const state = await requireChatAdmin(ctx.user);
        const existing = await state.db
          .select({ id: chatSections.id })
          .from(chatSections)
          .where(eq(chatSections.id, input.id))
          .limit(1);
        if (!existing[0]) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Chat section not found.",
          });
        }
        const update: Record<string, unknown> = {};
        if (input.name !== undefined) update.name = input.name;
        if (input.description !== undefined) {
          update.description = textOrNull(input.description);
        }
        if (input.sortOrder !== undefined) update.sortOrder = input.sortOrder;
        if (Object.keys(update).length > 0) {
          await state.db
            .update(chatSections)
            .set(update as any)
            .where(eq(chatSections.id, input.id));
        }
        return { success: true };
      }),

    archive: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const state = await requireChatAdmin(ctx.user);
        await state.db.transaction(async tx => {
          await tx
            .update(chatSections)
            .set({ isArchived: true })
            .where(eq(chatSections.id, input.id));
          await tx
            .update(chatChannels)
            .set({ isArchived: true })
            .where(eq(chatChannels.sectionId, input.id));
        });
        return { success: true };
      }),
  }),

  groups: router({
    create: protectedProcedure
      .input(
        z.object({
          sectionId: z.number().int().positive().nullable().optional(),
          name: z.string().trim().min(1).max(100),
          description: z.string().trim().max(500).optional().nullable(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const state = await requireChatAdmin(ctx.user);
        if (input.sectionId) {
          const sectionRows = await state.db
            .select({
              id: chatSections.id,
              isArchived: chatSections.isArchived,
            })
            .from(chatSections)
            .where(eq(chatSections.id, input.sectionId))
            .limit(1);
          if (!sectionRows[0] || sectionRows[0].isArchived) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Choose an active Chat section.",
            });
          }
        }
        const result = await state.db.insert(chatChannels).values({
          sectionId: input.sectionId ?? null,
          name: input.name,
          description: textOrNull(input.description),
          createdById: ctx.user.id,
        });
        return { id: Number(result[0].insertId) };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          sectionId: z.number().int().positive().nullable().optional(),
          name: z.string().trim().min(1).max(100).optional(),
          description: z.string().trim().max(500).optional().nullable(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const state = await requireChatAdmin(ctx.user);
        await getGroupOrThrow(state.db, input.id);
        if (input.sectionId) {
          const sectionRows = await state.db
            .select({
              id: chatSections.id,
              isArchived: chatSections.isArchived,
            })
            .from(chatSections)
            .where(eq(chatSections.id, input.sectionId))
            .limit(1);
          if (!sectionRows[0] || sectionRows[0].isArchived) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Choose an active Chat section.",
            });
          }
        }
        const update: Record<string, unknown> = {};
        if (input.sectionId !== undefined) update.sectionId = input.sectionId;
        if (input.name !== undefined) update.name = input.name;
        if (input.description !== undefined) {
          update.description = textOrNull(input.description);
        }
        if (Object.keys(update).length > 0) {
          await state.db
            .update(chatChannels)
            .set(update as any)
            .where(eq(chatChannels.id, input.id));
        }
        return { success: true };
      }),

    archive: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const state = await requireChatAdmin(ctx.user);
        await state.db
          .update(chatChannels)
          .set({ isArchived: true })
          .where(eq(chatChannels.id, input.id));
        return { success: true };
      }),
  }),

  members: router({
    list: protectedProcedure
      .input(groupIdSchema)
      .query(async ({ input, ctx }) => {
        const state = await requireChatAdmin(ctx.user);
        await getGroupOrThrow(state.db, input.groupId);
        return state.db
          .select({
            membership: chatChannelMembers,
            user: {
              id: users.id,
              name: users.name,
              email: users.email,
              role: users.role,
            },
            profilePhotoUrl: userProfiles.profilePhotoUrl,
          })
          .from(chatChannelMembers)
          .innerJoin(users, eq(users.id, chatChannelMembers.userId))
          .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
          .where(eq(chatChannelMembers.channelId, input.groupId))
          .orderBy(asc(users.name), asc(users.email));
      }),

    add: protectedProcedure
      .input(groupIdSchema.extend({ userId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const state = await requireChatAdmin(ctx.user);
        await getGroupOrThrow(state.db, input.groupId);
        const targetRows = await state.db
          .select({
            id: users.id,
            isActive: users.isActive,
            personType: users.personType,
          })
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1);
        const target = targetRows[0];
        if (!target || !target.isActive || target.personType !== "full_user") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose an active SavvyOS user.",
          });
        }
        await state.db
          .insert(chatChannelMembers)
          .values({
            channelId: input.groupId,
            userId: input.userId,
            addedById: ctx.user.id,
          })
          .onDuplicateKeyUpdate({ set: { userId: input.userId } });
        return { success: true };
      }),

    remove: protectedProcedure
      .input(groupIdSchema.extend({ userId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const state = await requireChatAdmin(ctx.user);
        await state.db
          .delete(chatChannelMembers)
          .where(
            and(
              eq(chatChannelMembers.channelId, input.groupId),
              eq(chatChannelMembers.userId, input.userId)
            )
          );
        return { success: true };
      }),
  }),

  people: router({
    /** Chat Admin user picker. Agents are intentionally included for future rollout. */
    list: protectedProcedure.query(async ({ ctx }) => {
      const state = await requireChatAdmin(ctx.user);
      return state.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          profilePhotoUrl: userProfiles.profilePhotoUrl,
        })
        .from(users)
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(and(eq(users.isActive, true), eq(users.personType, "full_user")))
        .orderBy(asc(users.name), asc(users.email));
    }),
  }),
});
