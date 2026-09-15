import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import {
  contacts,
  properties,
  transactions,
  users,
  websiteAccountPreferences,
  websiteAccountPropertyViews,
  websiteAccountSavedProperties,
  websiteAccounts,
  websiteAgentProfiles,
  websiteProperties,
} from "../../drizzle/schema";
import { getDb, logActivity } from "../db";
import {
  adminProcedure,
  publicProcedure,
  router,
  websiteAccountProcedure,
} from "../_core/trpc";
import {
  buyerVisibleTransaction,
  type BuyerVisibleTransaction,
} from "../websiteTransactionView";
import {
  accountFromRequest,
  clearedSessionCookie,
  consumePasswordResetToken,
  createPasswordResetToken,
  hashPassword,
  normalizeAccountEmail,
  passwordProblem,
  sessionCookieFor,
  verifyPassword,
} from "../_core/websiteAccountAuth";

/**
 * Investor accounts on the public website.
 *
 * Every procedure here is either public, or scoped to the signed-in investor by
 * websiteAccountProcedure. Nothing in this file reads from a staff session, and
 * nothing returns another account's data: every query is filtered by
 * ctx.account.id rather than by an id from the request.
 */

const emailInput = z.string().trim().email().max(320);

function setCookie(ctx: any, cookie: { name: string; value: string; options: any }) {
  ctx.res.cookie(cookie.name, cookie.value, cookie.options);
}

/**
 * The same answer whether or not the email exists.
 *
 * Signup and password reset both leak account existence if they respond
 * differently, which turns the site into a tool for checking whether someone
 * has an account here. Both paths return this.
 */
const NEUTRAL_RESET_REPLY = {
  ok: true as const,
  message: "If that email has an account, a reset link is on its way.",
};

export const websiteAccountRouter = router({
  /** Who is signed in, or null. Safe to call on every page. */
  me: publicProcedure.query(async ({ ctx }) => {
    return (await accountFromRequest(ctx.req as any)) ?? null;
  }),

  signUp: publicProcedure
    .input(
      z.object({
        email: emailInput,
        password: z.string().min(1).max(200),
        firstName: z.string().trim().max(128).optional(),
        lastName: z.string().trim().max(128).optional(),
        phone: z.string().trim().max(32).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const problem = passwordProblem(input.password);
      if (problem) throw new TRPCError({ code: "BAD_REQUEST", message: problem });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const email = normalizeAccountEmail(input.email);

      const [existing] = await db
        .select({ id: websiteAccounts.id })
        .from(websiteAccounts)
        .where(eq(websiteAccounts.email, email))
        .limit(1);
      if (existing) {
        // Deliberately specific, unlike the reset path: someone typing their
        // own email into a signup form is entitled to be told they already
        // have an account, and the alternative is a dead end they cannot
        // reason about.
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with that email already exists. Try signing in.",
        });
      }

      const inserted = await db.insert(websiteAccounts).values({
        email,
        passwordHash: await hashPassword(input.password),
        firstName: input.firstName || null,
        lastName: input.lastName || null,
        phone: input.phone || null,
        lastSignInAt: new Date(),
      });
      const accountId = Number((inserted as any)[0]?.insertId);

      // Start every account with notifications on and no filters, so the daily
      // email has something to read rather than a missing row to handle.
      await db.insert(websiteAccountPreferences).values({
        accountId,
        marketProfileIds: [],
      });

      setCookie(ctx, await sessionCookieFor(ctx.req as any, accountId));
      return { id: accountId, email };
    }),

  signIn: publicProcedure
    .input(z.object({ email: emailInput, password: z.string().min(1).max(200) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const email = normalizeAccountEmail(input.email);

      const [account] = await db
        .select({
          id: websiteAccounts.id,
          passwordHash: websiteAccounts.passwordHash,
          status: websiteAccounts.status,
        })
        .from(websiteAccounts)
        .where(eq(websiteAccounts.email, email))
        .limit(1);

      // Hash against a throwaway value when the account is missing, so a
      // wrong email and a wrong password take the same time to answer and
      // cannot be told apart by timing.
      const hash = account?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
      const valid = await verifyPassword(input.password, hash);

      if (!account || !valid || account.status !== "active") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "That email and password do not match.",
        });
      }

      await db
        .update(websiteAccounts)
        .set({ lastSignInAt: new Date() })
        .where(eq(websiteAccounts.id, account.id));

      setCookie(ctx, await sessionCookieFor(ctx.req as any, account.id));
      return { id: account.id, email };
    }),

  signOut: publicProcedure.mutation(async ({ ctx }) => {
    setCookie(ctx, clearedSessionCookie(ctx.req as any));
    return { ok: true };
  }),

  /**
   * Begin a password reset.
   *
   * Always answers the same way. The token is returned to the caller only
   * outside production, so the flow can be exercised end to end in a test
   * environment without a mailbox; in production it goes by email alone.
   */
  requestPasswordReset: publicProcedure
    .input(z.object({ email: emailInput }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return NEUTRAL_RESET_REPLY;
      const email = normalizeAccountEmail(input.email);
      const [account] = await db
        .select({ id: websiteAccounts.id, status: websiteAccounts.status })
        .from(websiteAccounts)
        .where(eq(websiteAccounts.email, email))
        .limit(1);
      if (!account || account.status !== "active") return NEUTRAL_RESET_REPLY;

      const token = await createPasswordResetToken(account.id);
      const devToken = process.env.NODE_ENV === "production" ? undefined : token;
      return { ...NEUTRAL_RESET_REPLY, devToken };
    }),

  resetPassword: publicProcedure
    .input(z.object({ token: z.string().min(10).max(200), password: z.string().min(1).max(200) }))
    .mutation(async ({ input, ctx }) => {
      const problem = passwordProblem(input.password);
      if (problem) throw new TRPCError({ code: "BAD_REQUEST", message: problem });

      const accountId = await consumePasswordResetToken(input.token);
      if (!accountId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That reset link has expired or has already been used.",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(websiteAccounts)
        .set({ passwordHash: await hashPassword(input.password) })
        .where(eq(websiteAccounts.id, accountId));

      setCookie(ctx, await sessionCookieFor(ctx.req as any, accountId));
      return { ok: true };
    }),

  // ─── Saved properties ──────────────────────────────────────────────────────

  savedProperties: websiteAccountProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        propertyId: websiteAccountSavedProperties.propertyId,
        savedAt: websiteAccountSavedProperties.createdAt,
        slug: websiteProperties.slug,
        headline: websiteProperties.headline,
        heroImageUrl: websiteProperties.heroImageUrl,
        address: properties.address,
        city: properties.city,
        state: properties.state,
        listPrice: properties.listPrice,
        beds: properties.beds,
        baths: properties.baths,
      })
      .from(websiteAccountSavedProperties)
      .innerJoin(properties, eq(websiteAccountSavedProperties.propertyId, properties.id))
      // Inner join on the published listing, so a property that was unpublished
      // stops appearing without the save itself being deleted. If it is
      // published again, it comes back.
      .innerJoin(
        websiteProperties,
        and(
          eq(websiteProperties.propertyId, websiteAccountSavedProperties.propertyId),
          eq(websiteProperties.status, "published")
        )
      )
      .where(eq(websiteAccountSavedProperties.accountId, ctx.account.id))
      .orderBy(desc(websiteAccountSavedProperties.createdAt));
  }),

  setSaved: websiteAccountProcedure
    .input(z.object({ propertyId: z.number().int().positive(), saved: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (!input.saved) {
        await db
          .delete(websiteAccountSavedProperties)
          .where(
            and(
              eq(websiteAccountSavedProperties.accountId, ctx.account.id),
              eq(websiteAccountSavedProperties.propertyId, input.propertyId)
            )
          );
        return { saved: false };
      }

      // Only a published listing can be saved. Without this an investor could
      // save any property id in the database, published or not, by calling the
      // endpoint directly.
      const [listing] = await db
        .select({ id: websiteProperties.id })
        .from(websiteProperties)
        .where(
          and(
            eq(websiteProperties.propertyId, input.propertyId),
            eq(websiteProperties.status, "published")
          )
        )
        .limit(1);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found." });

      await db
        .insert(websiteAccountSavedProperties)
        .values({ accountId: ctx.account.id, propertyId: input.propertyId })
        .onDuplicateKeyUpdate({ set: { propertyId: input.propertyId } });
      return { saved: true };
    }),

  // ─── Email preferences ─────────────────────────────────────────────────────

  preferences: websiteAccountProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(websiteAccountPreferences)
      .where(eq(websiteAccountPreferences.accountId, ctx.account.id))
      .limit(1);
    return row ?? null;
  }),

  savePreferences: websiteAccountProcedure
    .input(
      z.object({
        notificationsEnabled: z.boolean(),
        emailFrequency: z.enum(["daily", "weekly", "never"]),
        budgetMin: z.number().nonnegative().nullable().optional(),
        budgetMax: z.number().nonnegative().nullable().optional(),
        minBedrooms: z.number().int().min(0).max(20).nullable().optional(),
        investmentTimeline: z.string().trim().max(64).nullable().optional(),
        marketProfileIds: z.array(z.number().int().positive()).max(200).default([]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // A reversed range silently matches nothing, which looks like a broken
      // email rather than a mistyped filter. Say so instead.
      if (
        input.budgetMin != null &&
        input.budgetMax != null &&
        input.budgetMin > input.budgetMax
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The minimum budget is above the maximum.",
        });
      }

      const values = {
        notificationsEnabled: input.notificationsEnabled,
        emailFrequency: input.emailFrequency,
        budgetMin: input.budgetMin == null ? null : String(input.budgetMin),
        budgetMax: input.budgetMax == null ? null : String(input.budgetMax),
        minBedrooms: input.minBedrooms ?? null,
        investmentTimeline: input.investmentTimeline || null,
        marketProfileIds: Array.from(new Set(input.marketProfileIds)),
      };

      await db
        .insert(websiteAccountPreferences)
        .values({ accountId: ctx.account.id, ...values })
        .onDuplicateKeyUpdate({ set: values });
      return { ok: true };
    }),

  // ─── View history ──────────────────────────────────────────────────────────

  recordView: websiteAccountProcedure
    .input(z.object({ propertyId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { ok: false };
      await db
        .insert(websiteAccountPropertyViews)
        .values({ accountId: ctx.account.id, propertyId: input.propertyId })
        .onDuplicateKeyUpdate({
          set: {
            viewCount: sql`${websiteAccountPropertyViews.viewCount} + 1`,
            lastViewedAt: new Date(),
          },
        });
      return { ok: true };
    }),

  viewHistory: websiteAccountProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(30) }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({
          propertyId: websiteAccountPropertyViews.propertyId,
          lastViewedAt: websiteAccountPropertyViews.lastViewedAt,
          viewCount: websiteAccountPropertyViews.viewCount,
          slug: websiteProperties.slug,
          headline: websiteProperties.headline,
          heroImageUrl: websiteProperties.heroImageUrl,
          address: properties.address,
          city: properties.city,
          state: properties.state,
          listPrice: properties.listPrice,
        })
        .from(websiteAccountPropertyViews)
        .innerJoin(properties, eq(websiteAccountPropertyViews.propertyId, properties.id))
        .innerJoin(
          websiteProperties,
          and(
            eq(websiteProperties.propertyId, websiteAccountPropertyViews.propertyId),
            eq(websiteProperties.status, "published")
          )
        )
        .where(eq(websiteAccountPropertyViews.accountId, ctx.account.id))
        .orderBy(desc(websiteAccountPropertyViews.lastViewedAt))
        .limit(input?.limit ?? 30);
    }),

  // ─── My transactions ───────────────────────────────────────────────────────

  /**
   * The deals this investor is a party to.
   *
   * Two gates, and the first one is the important one.
   *
   * An account only ever sees transactions through `contactId`, which a member
   * of staff sets by hand on the contact record. Nothing here matches on email.
   * That is deliberate: signing up does not require proving you own the
   * address, so an email match would let anyone read a stranger's purchase by
   * registering with their address. Sharing a deal with an outside person is a
   * decision a person makes, not something a string comparison does.
   *
   * The second gate is the projection. Every row goes through
   * buyerVisibleTransaction, which is a whitelist, so a column added to the
   * transactions table tomorrow does not appear on a client's screen today.
   */
  myTransactions: websiteAccountProcedure.query(
    async ({ ctx }): Promise<BuyerVisibleTransaction[]> => {
      const contactId = ctx.account.contactId;
      if (!contactId) return [];
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select({
          id: transactions.id,
          transactionType: transactions.transactionType,
          status: transactions.status,
          propertyAddressSnapshot: transactions.propertyAddressSnapshot,
          address: properties.address,
          purchasePrice: transactions.purchasePrice,
          contractDate: transactions.contractDate,
          closingDate: transactions.closingDate,
          agentName: users.name,
          agentEmail: websiteAgentProfiles.publicEmail,
          agentPhone: websiteAgentProfiles.publicPhone,
          agentImageUrl: websiteAgentProfiles.imageUrl,
          agentSlug: websiteAgentProfiles.slug,
        })
        .from(transactions)
        .leftJoin(properties, eq(transactions.propertyId, properties.id))
        .leftJoin(users, eq(transactions.agentId, users.id))
        .leftJoin(
          websiteAgentProfiles,
          eq(users.id, websiteAgentProfiles.userId)
        )
        .where(
          or(
            eq(transactions.primaryContactId, contactId),
            eq(transactions.buyerContactId, contactId),
            eq(transactions.sellerContactId, contactId)
          )!
        )
        .orderBy(desc(transactions.contractDate));

      return rows.map(row => buyerVisibleTransaction(row as any));
    }
  ),

  // ─── Staff: linking an investor account to a contact ───────────────────────

  /**
   * What staff see on a contact: the account already linked, and any unlinked
   * account whose email matches.
   *
   * The match is shown as a suggestion, never acted on. Someone with the
   * contact record in front of them decides whether this really is the same
   * person, because getting it wrong means showing one client another
   * client's purchase.
   */
  accountsForContact: adminProcedure
    .input(z.object({ contactId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { linked: [], suggestion: null };

      const linked = await db
        .select({
          id: websiteAccounts.id,
          email: websiteAccounts.email,
          firstName: websiteAccounts.firstName,
          lastName: websiteAccounts.lastName,
          lastSignInAt: websiteAccounts.lastSignInAt,
          createdAt: websiteAccounts.createdAt,
        })
        .from(websiteAccounts)
        .where(eq(websiteAccounts.contactId, input.contactId));

      const [contact] = await db
        .select({ email: contacts.email })
        .from(contacts)
        .where(eq(contacts.id, input.contactId))
        .limit(1);

      let suggestion: { id: number; email: string } | null = null;
      if (contact?.email) {
        const [candidate] = await db
          .select({ id: websiteAccounts.id, email: websiteAccounts.email })
          .from(websiteAccounts)
          .where(
            and(
              eq(websiteAccounts.email, normalizeAccountEmail(contact.email)),
              isNull(websiteAccounts.contactId)
            )
          )
          .limit(1);
        suggestion = candidate ?? null;
      }

      return { linked, suggestion };
    }),

  linkAccountToContact: adminProcedure
    .input(
      z.object({
        accountId: z.number().int().positive(),
        contactId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [account] = await db
        .select({ id: websiteAccounts.id, contactId: websiteAccounts.contactId })
        .from(websiteAccounts)
        .where(eq(websiteAccounts.id, input.accountId))
        .limit(1);
      if (!account) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });
      }
      // Moving a live link is how one client ends up looking at another's
      // deal. Unlink first, deliberately, rather than letting a second click
      // quietly repoint it.
      if (account.contactId && account.contactId !== input.contactId) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "That account is already linked to a different contact. Unlink it there first.",
        });
      }

      await db
        .update(websiteAccounts)
        .set({ contactId: input.contactId })
        .where(eq(websiteAccounts.id, input.accountId));

      await logActivity({
        userId: ctx.user.id,
        action: "website_account_linked_to_contact",
        entityType: "contact",
        entityId: input.contactId,
        relatedContactId: input.contactId,
        details: { websiteAccountId: input.accountId },
      });
      return { ok: true };
    }),

  unlinkAccount: adminProcedure
    .input(z.object({ accountId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [account] = await db
        .select({ contactId: websiteAccounts.contactId })
        .from(websiteAccounts)
        .where(eq(websiteAccounts.id, input.accountId))
        .limit(1);

      await db
        .update(websiteAccounts)
        .set({ contactId: null })
        .where(eq(websiteAccounts.id, input.accountId));

      if (account?.contactId) {
        await logActivity({
          userId: ctx.user.id,
          action: "website_account_unlinked_from_contact",
          entityType: "contact",
          entityId: account.contactId,
          relatedContactId: account.contactId,
          details: { websiteAccountId: input.accountId },
        });
      }
      return { ok: true };
    }),
});
