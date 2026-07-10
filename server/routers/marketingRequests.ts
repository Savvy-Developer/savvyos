import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  marketingRequests,
  marketingRequestAttachments,
  users,
} from "../../drizzle/schema";
import { eq, desc, and, inArray, ne, or, sql } from "drizzle-orm";
import { storagePut } from "../storage";

function randomSuffix() {
  return Math.random().toString(36).substring(2, 10);
}

export const marketingRequestsRouter = router({
  // Create a new marketing request (agents + admins)
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        requestType: z
          .enum(["graphic", "image", "slideshow", "video", "flyer", "social_post", "other"])
          .default("graphic"),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
        dueDate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(marketingRequests).values({
        agentId: ctx.user.id,
        title: input.title,
        description: input.description,
        requestType: input.requestType,
        priority: input.priority,
        // Parse as noon UTC (12:00:00Z) to prevent midnight-UTC values from rolling
        // back to the previous day when read in negative-offset timezones (EST/EDT).
        dueDate: input.dueDate ? new Date(`${input.dueDate}T12:00:00Z`) : undefined,
        status: "new",
      });
      return { id: (result as any).insertId as number };
    }),

  // List requests — agents see their own; admins/ISAs see all
  list: protectedProcedure
    .input(
      z.object({
        statusFilter: z
          .array(z.enum(["new", "in_progress", "completed", "cancelled"]))
          .optional(),
        includeCompleted: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "isa";

      const conditions = [];
      if (!isAdmin) {
        conditions.push(eq(marketingRequests.agentId, ctx.user.id));
      }

      if (input.statusFilter && input.statusFilter.length > 0) {
        conditions.push(inArray(marketingRequests.status, input.statusFilter));
      } else if (!input.includeCompleted) {
        conditions.push(
          and(
            ne(marketingRequests.status, "completed"),
            ne(marketingRequests.status, "cancelled")
          )!
        );
      }

      const rows = await db
        .select({
          request: marketingRequests,
          agent: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
        })
        .from(marketingRequests)
        .leftJoin(users, eq(marketingRequests.agentId, users.id))
        .where(conditions.length > 0 ? and(...(conditions as [any, ...any[]])) : undefined)
        .orderBy(desc(marketingRequests.createdAt));

      return rows;
    }),

  // Get single request with attachments
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select({
          request: marketingRequests,
          agent: { id: users.id, name: users.name, email: users.email },
        })
        .from(marketingRequests)
        .leftJoin(users, eq(marketingRequests.agentId, users.id))
        .where(eq(marketingRequests.id, input.id))
        .limit(1);

      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role === "agent" && rows[0].request.agentId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const attachments = await db
        .select()
        .from(marketingRequestAttachments)
        .where(eq(marketingRequestAttachments.requestId, input.id))
        .orderBy(marketingRequestAttachments.createdAt);

      return { ...rows[0], attachments };
    }),

  // Upload attachment (agent adds files to their request)
  uploadAttachment: protectedProcedure
    .input(
      z.object({
        requestId: z.number(),
        fileName: z.string(),
        mimeType: z.string(),
        base64Data: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [req] = await db
        .select()
        .from(marketingRequests)
        .where(eq(marketingRequests.id, input.requestId))
        .limit(1);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role === "agent" && req.agentId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const buffer = Buffer.from(input.base64Data, "base64");
      const ext = input.fileName.split(".").pop() ?? "bin";
      const key = `marketing-requests/${input.requestId}/attachments/${randomSuffix()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);

      await db.insert(marketingRequestAttachments).values({
        requestId: input.requestId,
        fileUrl: url,
        fileKey: key,
        fileName: input.fileName,
        mimeType: input.mimeType,
        uploadedById: ctx.user.id,
      });

      return { url, key, fileName: input.fileName };
    }),

  // Admin/marketing: update status only
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["new", "in_progress", "completed", "cancelled"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role === "agent") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(marketingRequests)
        .set({
          status: input.status,
          completedAt: input.status === "completed" ? new Date() : undefined,
        })
        .where(eq(marketingRequests.id, input.id));
      return { success: true };
    }),

  // Admin/marketing: respond with note and optional file
  respond: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        responseNote: z.string().optional(),
        status: z.enum(["new", "in_progress", "completed", "cancelled"]).optional(),
        responseFileName: z.string().optional(),
        responseMimeType: z.string().optional(),
        responseBase64: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role === "agent") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let fileUrl: string | undefined;
      let fileKey: string | undefined;

      if (input.responseBase64 && input.responseFileName) {
        const buffer = Buffer.from(input.responseBase64, "base64");
        const ext = input.responseFileName.split(".").pop() ?? "bin";
        const key = `marketing-requests/${input.id}/response/${randomSuffix()}.${ext}`;
        const result = await storagePut(
          key,
          buffer,
          input.responseMimeType ?? "application/octet-stream"
        );
        fileUrl = result.url;
        fileKey = key;
      }

      const updateValues: Record<string, unknown> = {
        respondedById: ctx.user.id,
      };
      if (input.responseNote !== undefined) updateValues.responseNote = input.responseNote;
      if (fileUrl) updateValues.responseFileUrl = fileUrl;
      if (fileKey) updateValues.responseFileKey = fileKey;
      if (input.responseFileName) updateValues.responseFileName = input.responseFileName;
      if (input.status) {
        updateValues.status = input.status;
        if (input.status === "completed") updateValues.completedAt = new Date();
      }

      await db
        .update(marketingRequests)
        .set(updateValues as any)
        .where(eq(marketingRequests.id, input.id));

      return { success: true, fileUrl };
    }),

  // Admin: count of new + in_progress requests for nav badge
  pendingCount: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") return { count: 0 };
      const db = await getDb();
      if (!db) return { count: 0 };
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(marketingRequests)
        .where(or(
          eq(marketingRequests.status, "new"),
          eq(marketingRequests.status, "in_progress")
        ));
      return { count: Number(row?.count ?? 0) };
    }),

  // Agent: cancel their own request
  cancel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [req] = await db
        .select()
        .from(marketingRequests)
        .where(eq(marketingRequests.id, input.id))
        .limit(1);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role === "agent" && req.agentId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (req.status === "completed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot cancel a completed request" });
      }
      await db
        .update(marketingRequests)
        .set({ status: "cancelled" })
        .where(eq(marketingRequests.id, input.id));
      return { success: true };
    }),
});
