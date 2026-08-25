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

const AUTOMATIC_MARKETING_TYPES = {
  under_contract: {
    template: "V4WN6JDxPNa2D3Gqjk",
    label: "Under Contract",
    fileSlug: "under-contract",
    contractText: "UNDER",
    underText: "CONTRACT",
  },
  just_closed: {
    template: "7wpnPQZz0roEDdOgxo",
    label: "Just Closed",
    fileSlug: "just-closed",
    contractText: "JUST",
    underText: "CLOSED",
  },
  just_listed: {
    template: "N1qMxz5vpKdVbeQ4ko",
    label: "Just Listed",
    fileSlug: "just-listed",
    contractText: "JUST",
    underText: "LISTED",
  },
} as const;

type AutomaticMarketingType = keyof typeof AUTOMATIC_MARKETING_TYPES;

const AUTOMATIC_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_AUTOMATIC_IMAGE_BYTES = 8 * 1024 * 1024;

function imageExtensionForMimeType(mimeType: string): "jpg" | "png" | "webp" {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function outputExtensionForMimeType(mimeType: string | null): "jpg" | "png" | "webp" {
  if (mimeType?.includes("png")) return "png";
  if (mimeType?.includes("webp")) return "webp";
  return "jpg";
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

  // Generate a branded listing-status graphic without exposing the Bannerbear API key to the client.
  automaticGenerate: protectedProcedure
    .input(
      z.object({
        type: z.enum(["under_contract", "just_closed", "just_listed"]),
        location: z.string().trim().min(2).max(160),
        propertyImage: z.object({
          fileName: z.string().trim().min(1).max(255),
          mimeType: z.enum(AUTOMATIC_IMAGE_MIME_TYPES),
          base64Data: z.string().min(1).max(12 * 1024 * 1024),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const bannerbearApiKey = process.env.BANNERBEAR_API_KEY?.trim();
      if (!bannerbearApiKey) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Automatic graphics are not configured yet. Please contact support.",
        });
      }

      const imageBuffer = Buffer.from(input.propertyImage.base64Data, "base64");
      if (!imageBuffer.length || imageBuffer.length > MAX_AUTOMATIC_IMAGE_BYTES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Use a JPG, PNG, or WebP property photo that is 8 MB or smaller.",
        });
      }

      const type = input.type as AutomaticMarketingType;
      const template = AUTOMATIC_MARKETING_TYPES[type];
      const sourceExtension = imageExtensionForMimeType(input.propertyImage.mimeType);
      const sourceKey = `automatic-marketing/${ctx.user.id}/source/${Date.now()}-${randomSuffix()}.${sourceExtension}`;
      const { url: sourceImageUrl } = await storagePut(
        sourceKey,
        imageBuffer,
        input.propertyImage.mimeType
      );

      let bannerbearResponse: Response;
      try {
        bannerbearResponse = await fetch("https://sync.api.bannerbear.com/v2/images", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${bannerbearApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            template: template.template,
            modifications: [
              { name: "Property Image", image_url: sourceImageUrl },
              { name: "location", text: input.location },
              { name: "Contract", text: template.contractText },
              { name: "Under", text: template.underText },
            ],
            transparent: false,
            metadata: JSON.stringify({ source: "savvyos", user_id: ctx.user.id, type }),
          }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new TRPCError({
          code: "TIMEOUT",
          message: "The graphic took too long to generate. Please try again.",
        });
      }

      if (!bannerbearResponse.ok) {
        if (bannerbearResponse.status === 402) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Automatic graphics are temporarily unavailable. Please contact support.",
          });
        }
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "We could not generate that graphic. Please confirm the photo and try again.",
        });
      }

      const rendered = (await bannerbearResponse.json()) as {
        status?: string;
        image_url?: string | null;
      };
      if (rendered.status !== "completed" || !rendered.image_url) {
        throw new TRPCError({
          code: "TIMEOUT",
          message: "The graphic took too long to generate. Please try again.",
        });
      }

      let generatedImageResponse: Response;
      try {
        generatedImageResponse = await fetch(rendered.image_url, {
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "Your graphic was generated but could not be saved. Please try again.",
        });
      }

      if (!generatedImageResponse.ok) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "Your graphic was generated but could not be saved. Please try again.",
        });
      }

      const outputMimeType = generatedImageResponse.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
      const outputExtension = outputExtensionForMimeType(outputMimeType);
      const outputBuffer = Buffer.from(await generatedImageResponse.arrayBuffer());
      const fileName = `savvy-${template.fileSlug}-${Date.now()}.${outputExtension}`;
      const outputKey = `automatic-marketing/${ctx.user.id}/generated/${Date.now()}-${randomSuffix()}.${outputExtension}`;
      const { url: imageUrl } = await storagePut(outputKey, outputBuffer, outputMimeType);

      return {
        imageUrl,
        fileName,
        label: template.label,
      };
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
