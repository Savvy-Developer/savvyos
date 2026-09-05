import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { aliasedTable, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { mcpAccessKeys, users } from "../../drizzle/schema";
import { getDb, logActivity } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const MCP_ACCESS_MANAGER_EMAILS = new Set([
  "tyler@savvy.realty",
  "elana@savvy.realty",
  "dyl@savvy.realty",
]);

const MCP_ENDPOINT = "https://os.savvy-agents.com/api/mcp";

export function isMcpAccessManager(email: string | null | undefined): boolean {
  return !!email && MCP_ACCESS_MANAGER_EMAILS.has(email.trim().toLowerCase());
}

function requireMcpAccessManager(email: string | null | undefined): void {
  if (!isMcpAccessManager(email)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "SavvyOS MCP access is managed only by Tyler, Elana, and Dyl.",
    });
  }
}

function createPlaintextKey(): string {
  return `svy_mcp_${crypto.randomBytes(32).toString("base64url")}`;
}

function keyHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function keyPrefix(value: string): string {
  return value.slice(0, 20);
}

const creator = aliasedTable(users, "mcp_access_key_creator");
const revoker = aliasedTable(users, "mcp_access_key_revoker");

export const mcpAccessRouter = router({
  connectionInfo: protectedProcedure.query(({ ctx }) => {
    requireMcpAccessManager(ctx.user.email);
    return {
      endpoint: MCP_ENDPOINT,
      authentication: "Bearer token",
      note: "This connection exposes SavvyOS data through read-only MCP tools. It cannot create, edit, delete, send, or otherwise modify SavvyOS data.",
    };
  }),

  listKeys: protectedProcedure.query(async ({ ctx }) => {
    requireMcpAccessManager(ctx.user.email);
    const db = await getDb();
    if (!db)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database unavailable.",
      });
    return db
      .select({
        id: mcpAccessKeys.id,
        name: mcpAccessKeys.name,
        keyPrefix: mcpAccessKeys.keyPrefix,
        createdAt: mcpAccessKeys.createdAt,
        revokedAt: mcpAccessKeys.revokedAt,
        createdBy: { id: creator.id, name: creator.name, email: creator.email },
        revokedBy: { id: revoker.id, name: revoker.name, email: revoker.email },
      })
      .from(mcpAccessKeys)
      .leftJoin(creator, eq(mcpAccessKeys.createdById, creator.id))
      .leftJoin(revoker, eq(mcpAccessKeys.revokedById, revoker.id))
      .orderBy(desc(mcpAccessKeys.createdAt));
  }),

  createKey: protectedProcedure
    .input(z.object({ name: z.string().trim().min(3).max(255) }))
    .mutation(async ({ ctx, input }) => {
      requireMcpAccessManager(ctx.user.email);
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable.",
        });
      const secret = createPlaintextKey();
      const [result] = await db.insert(mcpAccessKeys).values({
        name: input.name,
        keyPrefix: keyPrefix(secret),
        secretHash: keyHash(secret),
        createdById: ctx.user.id,
      });
      const id = Number((result as any).insertId);
      await logActivity({
        userId: ctx.user.id,
        action: "mcp_access_key_created",
        entityType: "mcp_access_key",
        entityId: id,
        details: { name: input.name, keyPrefix: keyPrefix(secret) },
      });
      // The plaintext is intentionally returned only by this mutation. The DB stores only a digest.
      return {
        id,
        secret,
        endpoint: MCP_ENDPOINT,
        keyPrefix: keyPrefix(secret),
      };
    }),

  revokeKey: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requireMcpAccessManager(ctx.user.email);
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable.",
        });
      const result = await db
        .update(mcpAccessKeys)
        .set({ revokedAt: new Date(), revokedById: ctx.user.id })
        .where(eq(mcpAccessKeys.id, input.id));
      if (!Number((result as any)[0]?.affectedRows ?? 0)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "MCP key not found.",
        });
      }
      await logActivity({
        userId: ctx.user.id,
        action: "mcp_access_key_revoked",
        entityType: "mcp_access_key",
        entityId: input.id,
      });
      return { success: true };
    }),

  activeKeyCount: protectedProcedure.query(async ({ ctx }) => {
    requireMcpAccessManager(ctx.user.email);
    const db = await getDb();
    if (!db) return { count: 0 };
    const keys = await db
      .select({ id: mcpAccessKeys.id })
      .from(mcpAccessKeys)
      .where(isNull(mcpAccessKeys.revokedAt));
    return { count: keys.length };
  }),
});
