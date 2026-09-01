import Stripe from "stripe";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  users,
  vendorBillingPayments,
  vendorBillingWebhookEvents,
  vendorFeaturedSubscriptions,
  vendorCategories,
  vendorLists,
  vendors,
} from "../drizzle/schema";
import { getDb } from "./db";
import { sendTransactionalEmail } from "./_core/resendEmail";

const APP_URL = "https://os.savvy-agents.com";
const CURRENCY = "usd";
export const MINIMUM_MONTHLY_AMOUNT_CENTS = 100;
export const MAXIMUM_MONTHLY_AMOUNT_CENTS = 1_000_000;

export const FEATURED_VENDOR_LEADERSHIP_EMAILS = [
  "tyler@savvy.realty",
  "elana@savvy.realty",
  "dyl@savvy.realty",
  "kryzll@savvy.realty",
] as const;

export type VendorBillingStatus =
  | "pending_checkout"
  | "checkout_complete"
  | "active"
  | "past_due"
  | "unpaid"
  | "paused"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "failed";

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Stripe is not configured.");
  return new Stripe(key);
}

function optionalStripeId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export function formatUsdFromCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function calculateAgentEarningsCents(collectedCents: number): number {
  return Math.round(collectedCents * 0.75);
}

/** The public list is only safe to include in external vendor email after publication. */
export function publicVendorListUrl(publicSlug: string, isPublished: boolean): string | undefined {
  return isPublished ? `${APP_URL}/vendors/${encodeURIComponent(publicSlug)}` : undefined;
}

function isRecoverableCheckout(subscription: { billingStatus: string; checkoutExpiresAt: Date | null }): boolean {
  if (subscription.billingStatus !== "pending_checkout") return false;
  return Boolean(subscription.checkoutExpiresAt && subscription.checkoutExpiresAt.getTime() < Date.now());
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ER_DUP_ENTRY";
}

async function findBillingSubscription(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  identifiers: { internalId?: number | null; stripeSubscriptionId?: string | null; stripeCustomerId?: string | null },
) {
  if (identifiers.internalId) {
    const [row] = await db.select().from(vendorFeaturedSubscriptions)
      .where(eq(vendorFeaturedSubscriptions.id, identifiers.internalId)).limit(1);
    if (row) return row;
  }
  if (identifiers.stripeSubscriptionId) {
    const [row] = await db.select().from(vendorFeaturedSubscriptions)
      .where(eq(vendorFeaturedSubscriptions.stripeSubscriptionId, identifiers.stripeSubscriptionId)).limit(1);
    if (row) return row;
  }
  if (identifiers.stripeCustomerId) {
    const [row] = await db.select().from(vendorFeaturedSubscriptions)
      .where(eq(vendorFeaturedSubscriptions.stripeCustomerId, identifiers.stripeCustomerId))
      .orderBy(desc(vendorFeaturedSubscriptions.createdAt)).limit(1);
    if (row) return row;
  }
  return null;
}

async function resolveSubscriptionForInvoice(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  invoice: Stripe.Invoice,
) {
  const stripeSubscriptionId = (invoice as any).subscription
    ?? (invoice as any).parent?.subscription_details?.subscription
    ?? null;
  const stripeCustomerId = optionalStripeId(invoice.customer as string | Stripe.Customer | null | undefined);
  let subscription = await findBillingSubscription(db, { stripeSubscriptionId, stripeCustomerId });
  if (subscription || !stripeSubscriptionId) return subscription;

  try {
    const stripeSubscription = await getStripe().subscriptions.retrieve(stripeSubscriptionId);
    const internalId = Number(stripeSubscription.metadata.vendorFeaturedSubscriptionId);
    if (Number.isInteger(internalId) && internalId > 0) {
      subscription = await findBillingSubscription(db, { internalId });
      if (subscription) {
        await db.update(vendorFeaturedSubscriptions).set({
          stripeSubscriptionId,
          stripeCustomerId: stripeCustomerId ?? subscription.stripeCustomerId,
        }).where(eq(vendorFeaturedSubscriptions.id, subscription.id));
      }
    }
  } catch (error) {
    console.warn("[VendorBilling] Could not resolve Stripe subscription for invoice:", error);
  }
  return subscription;
}

async function getNotificationContext(subscriptionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable while preparing vendor billing notification.");
  const [row] = await db.select({
    subscription: vendorFeaturedSubscriptions,
    vendorName: vendors.businessName,
    vendorContactName: vendors.contactName,
    vendorEmail: vendors.email,
    agentName: users.name,
    agentEmail: users.email,
  }).from(vendorFeaturedSubscriptions)
    .innerJoin(vendors, eq(vendorFeaturedSubscriptions.vendorId, vendors.id))
    .innerJoin(users, eq(vendorFeaturedSubscriptions.agentId, users.id))
    .where(eq(vendorFeaturedSubscriptions.id, subscriptionId))
    .limit(1);
  return row ?? null;
}

async function leadershipEmailAddresses(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [...FEATURED_VENDOR_LEADERSHIP_EMAILS];
  const rows = await db.select({ email: users.email }).from(users)
    .where(and(inArray(users.email, [...FEATURED_VENDOR_LEADERSHIP_EMAILS]), eq(users.isActive, true)));
  const active = new Set(rows.map((row) => row.email?.toLowerCase()).filter(Boolean));
  return FEATURED_VENDOR_LEADERSHIP_EMAILS.filter((email) => active.has(email));
}

async function notifyBillingAttention(subscriptionId: number, eventId: string, reason: string): Promise<boolean> {
  const context = await getNotificationContext(subscriptionId);
  if (!context?.agentEmail) {
    console.warn(`[VendorBilling] Cannot send attention alert for subscription ${subscriptionId}: agent email unavailable.`);
    return false;
  }
  const leaders = await leadershipEmailAddresses();
  const delivery = await sendTransactionalEmail("vendor_featured_payment_failed", {
    recipientName: context.agentName ?? "Agent",
    recipientEmail: context.agentEmail,
    ccEmails: leaders.filter((email) => email.toLowerCase() !== context.agentEmail!.toLowerCase()),
    vendorBusinessName: context.vendorName,
    vendorContactName: context.vendorContactName ?? undefined,
    agentName: context.agentName ?? undefined,
    vendorMonthlyAmount: formatUsdFromCents(context.subscription.monthlyAmountCents),
    vendorBillingReason: reason,
  }, {
    allowTemplateOverride: false,
    idempotencyKey: `vendor-billing-attention:${eventId}`,
  });
  if (!delivery.sent) {
    console.warn(`[VendorBilling] Attention alert could not be delivered for subscription ${subscriptionId}: ${delivery.reason ?? "unknown error"}`);
  }
  return delivery.sent;
}

async function notifyFeaturedVendorPaymentReceived(subscriptionId: number, invoiceId: string, amountPaidCents: number, paidAt: Date): Promise<boolean> {
  const context = await getNotificationContext(subscriptionId);
  if (!context?.agentEmail) {
    console.warn(`[VendorBilling] Cannot send payment receipt for subscription ${subscriptionId}: agent email unavailable.`);
    return false;
  }
  const delivery = await sendTransactionalEmail("vendor_featured_payment_received", {
    recipientName: context.agentName ?? "Agent",
    recipientEmail: context.agentEmail,
    vendorBusinessName: context.vendorName,
    vendorContactName: context.vendorContactName ?? undefined,
    vendorPaymentReceivedAmount: formatUsdFromCents(amountPaidCents),
    vendorPaymentReceivedDate: new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(paidAt),
    vendorMonthlyAmount: formatUsdFromCents(context.subscription.monthlyAmountCents),
  }, {
    allowTemplateOverride: false,
    idempotencyKey: `vendor-billing-received:${invoiceId}`,
  });
  if (!delivery.sent) {
    console.warn(`[VendorBilling] Payment receipt could not be delivered for subscription ${subscriptionId}: ${delivery.reason ?? "unknown error"}`);
  }
  return delivery.sent;
}

/**
 * Builds a unique Stripe-hosted Checkout link and immediately sends it to the vendor.
 * The agent still receives the same URL so it can be copied into a personal outreach message.
 */
export async function createFeaturedVendorCheckoutInvite(params: {
  vendorId: number;
  agentId: number;
  monthlyAmountCents: number;
}): Promise<{ subscriptionId: number; checkoutUrl: string; emailSent: boolean; emailError?: string }> {
  if (!isStripeConfigured()) throw new Error("Featured Vendor billing is not yet configured. Please contact Savvy support.");
  if (!Number.isInteger(params.monthlyAmountCents)
    || params.monthlyAmountCents < MINIMUM_MONTHLY_AMOUNT_CENTS
    || params.monthlyAmountCents > MAXIMUM_MONTHLY_AMOUNT_CENTS) {
    throw new Error(`Choose a monthly amount between ${formatUsdFromCents(MINIMUM_MONTHLY_AMOUNT_CENTS)} and ${formatUsdFromCents(MAXIMUM_MONTHLY_AMOUNT_CENTS)}.`);
  }

  const db = await getDb();
  if (!db) throw new Error("Database unavailable.");
  const [vendor] = await db.select({
    id: vendors.id,
    businessName: vendors.businessName,
    contactName: vendors.contactName,
    email: vendors.email,
    isFeatured: vendors.isFeatured,
    agentId: vendorLists.agentId,
    publicSlug: vendorLists.publicSlug,
    isPublished: vendorLists.isPublished,
    agentName: users.name,
  }).from(vendors)
    .innerJoin(vendorCategories, eq(vendors.vendorCategoryId, vendorCategories.id))
    .innerJoin(vendorLists, eq(vendorCategories.vendorListId, vendorLists.id))
    .innerJoin(users, eq(vendorLists.agentId, users.id))
    .where(eq(vendors.id, params.vendorId))
    .limit(1);

  if (!vendor || vendor.agentId !== params.agentId) throw new Error("Vendor not found.");
  if (!vendor.email) throw new Error("Add the vendor’s email address before sending a payment invitation.");

  const existing = await db.select().from(vendorFeaturedSubscriptions)
    .where(and(eq(vendorFeaturedSubscriptions.vendorId, params.vendorId), inArray(vendorFeaturedSubscriptions.billingStatus, ["pending_checkout", "checkout_complete", "active", "past_due", "unpaid", "paused", "incomplete"])))
    .orderBy(desc(vendorFeaturedSubscriptions.createdAt)).limit(1);
  const current = existing[0];
  if (current && !isRecoverableCheckout(current)) {
    throw new Error("This vendor already has an open or active Featured payment subscription.");
  }
  if (current && isRecoverableCheckout(current)) {
    await db.update(vendorFeaturedSubscriptions).set({ billingStatus: "incomplete_expired" })
      .where(eq(vendorFeaturedSubscriptions.id, current.id));
  }

  const insert = await db.insert(vendorFeaturedSubscriptions).values({
    vendorId: params.vendorId,
    agentId: params.agentId,
    monthlyAmountCents: params.monthlyAmountCents,
    currency: CURRENCY,
    billingStatus: "pending_checkout",
    invitedAt: new Date(),
  });
  const subscriptionId = Number(insert[0].insertId);

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer_email: vendor.email,
      client_reference_id: String(subscriptionId),
      success_url: `${APP_URL}/vendor-payment-confirmed?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/vendor-payment-canceled`,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: params.monthlyAmountCents,
          recurring: { interval: "month" },
          product_data: {
            name: `Featured vendor placement — ${vendor.businessName}`,
            description: `Monthly featured placement on ${vendor.agentName?.trim() || "your Savvy STR Agent"}'s Vendor List.`,
          },
        },
      }],
      metadata: {
        vendorFeaturedSubscriptionId: String(subscriptionId),
        vendorId: String(params.vendorId),
        agentId: String(params.agentId),
      },
      subscription_data: {
        metadata: {
          vendorFeaturedSubscriptionId: String(subscriptionId),
          vendorId: String(params.vendorId),
          agentId: String(params.agentId),
        },
      },
    });
  } catch (error) {
    await db.update(vendorFeaturedSubscriptions).set({ billingStatus: "failed" })
      .where(eq(vendorFeaturedSubscriptions.id, subscriptionId));
    throw error;
  }

  if (!session.url) {
    await db.update(vendorFeaturedSubscriptions).set({ billingStatus: "failed" })
      .where(eq(vendorFeaturedSubscriptions.id, subscriptionId));
    throw new Error("Stripe did not return a payment link. Please try again.");
  }

  await db.update(vendorFeaturedSubscriptions).set({
    stripeCheckoutSessionId: session.id,
    stripeCustomerId: optionalStripeId(session.customer as string | Stripe.Customer | null | undefined),
    checkoutUrl: session.url,
    checkoutExpiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
  }).where(eq(vendorFeaturedSubscriptions.id, subscriptionId));

  const delivery = await sendTransactionalEmail("vendor_featured_payment_invitation", {
    recipientName: vendor.contactName ?? vendor.businessName,
    recipientEmail: vendor.email,
    vendorBusinessName: vendor.businessName,
    vendorContactName: vendor.contactName ?? undefined,
    agentName: vendor.agentName ?? undefined,
    vendorMonthlyAmount: formatUsdFromCents(params.monthlyAmountCents),
    vendorPaymentUrl: session.url,
    vendorPublicListUrl: publicVendorListUrl(vendor.publicSlug, vendor.isPublished),
  }, {
    allowTemplateOverride: false,
    injectMagicLinks: false,
    idempotencyKey: `vendor-billing-invite:${subscriptionId}`,
  });

  if (delivery.sent) {
    await db.update(vendorFeaturedSubscriptions).set({ invitationSentAt: new Date() })
      .where(eq(vendorFeaturedSubscriptions.id, subscriptionId));
  }
  return { subscriptionId, checkoutUrl: session.url, emailSent: delivery.sent, emailError: delivery.reason };
}

function stripeStatus(status: Stripe.Subscription.Status): VendorBillingStatus {
  const supportedStatuses: VendorBillingStatus[] = ["active", "past_due", "unpaid", "paused", "canceled", "incomplete", "incomplete_expired"];
  if (supportedStatuses.includes(status as VendorBillingStatus)) return status as VendorBillingStatus;
  // Trials are not created by this feature, but treating any unexpected payable state as incomplete keeps it visible for follow-up.
  return "incomplete";
}

async function markEvent(
  eventId: string,
  values: { status: "processed" | "ignored" | "failed"; billingSubscriptionId?: number | null; errorMessage?: string | null },
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(vendorBillingWebhookEvents).set({
    status: values.status,
    billingSubscriptionId: values.billingSubscriptionId ?? null,
    errorMessage: values.errorMessage ?? null,
    processedAt: new Date(),
  }).where(eq(vendorBillingWebhookEvents.stripeEventId, eventId));
}

async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable while processing a Stripe webhook.");
  const [prior] = await db.select().from(vendorBillingWebhookEvents)
    .where(eq(vendorBillingWebhookEvents.stripeEventId, event.id)).limit(1);
  if (prior?.status === "processed" || prior?.status === "ignored") return false;
  if (prior) {
    await db.update(vendorBillingWebhookEvents).set({ status: "processing", errorMessage: null, processedAt: null })
      .where(eq(vendorBillingWebhookEvents.id, prior.id));
    return true;
  }
  try {
    await db.insert(vendorBillingWebhookEvents).values({
      stripeEventId: event.id,
      eventType: event.type,
      status: "processing",
    });
    return true;
  } catch (error) {
    if (isDuplicateKeyError(error)) return false;
    throw error;
  }
}

async function processCheckoutCompleted(event: Stripe.Event, session: Stripe.Checkout.Session): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable.");
  const internalId = Number(session.metadata?.vendorFeaturedSubscriptionId ?? session.client_reference_id);
  const subscription = await findBillingSubscription(db, {
    internalId: Number.isInteger(internalId) && internalId > 0 ? internalId : null,
    stripeCustomerId: optionalStripeId(session.customer as string | Stripe.Customer | null | undefined),
  });
  if (!subscription) return null;
  await db.update(vendorFeaturedSubscriptions).set({
    stripeCheckoutSessionId: session.id,
    stripeCustomerId: optionalStripeId(session.customer as string | Stripe.Customer | null | undefined) ?? subscription.stripeCustomerId,
    stripeSubscriptionId: optionalStripeId(session.subscription as string | Stripe.Subscription | null | undefined) ?? subscription.stripeSubscriptionId,
    billingStatus: "checkout_complete",
    checkoutCompletedAt: new Date(),
  }).where(eq(vendorFeaturedSubscriptions.id, subscription.id));
  return subscription.id;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return (invoice as any).subscription ?? (invoice as any).parent?.subscription_details?.subscription ?? null;
}

async function processInvoicePaid(event: Stripe.Event, invoice: Stripe.Invoice): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable.");
  const subscription = await resolveSubscriptionForInvoice(db, invoice);
  if (!subscription) return null;
  if (!invoice.id) throw new Error("Stripe invoice event did not include an invoice ID.");
  const amountPaidCents = invoice.amount_paid ?? 0;
  const paidAt = invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : new Date();
  const stripeInvoiceId = invoice.id;
  const payment = {
    vendorFeaturedSubscriptionId: subscription.id,
    stripeInvoiceId,
    stripePaymentIntentId: null,
    amountPaidCents,
    currency: (invoice.currency ?? CURRENCY).toLowerCase(),
    agentEarningsCents: calculateAgentEarningsCents(amountPaidCents),
    paymentStatus: "paid" as const,
    paidAt,
    failureReason: null,
    failureNotifiedAt: null,
  };
  const [priorPayment] = await db.select().from(vendorBillingPayments)
    .where(eq(vendorBillingPayments.stripeInvoiceId, stripeInvoiceId)).limit(1);
  if (priorPayment) {
    await db.update(vendorBillingPayments).set(payment).where(eq(vendorBillingPayments.id, priorPayment.id));
  } else {
    await db.insert(vendorBillingPayments).values(payment);
  }
  await db.update(vendorFeaturedSubscriptions).set({
    stripeSubscriptionId: invoiceSubscriptionId(invoice) ?? subscription.stripeSubscriptionId,
    stripeCustomerId: optionalStripeId(invoice.customer as string | Stripe.Customer | null | undefined) ?? subscription.stripeCustomerId,
    billingStatus: "active",
    activatedAt: subscription.activatedAt ?? paidAt,
    lastPaymentAt: paidAt,
  }).where(eq(vendorFeaturedSubscriptions.id, subscription.id));
  // A successful invoice is the durable payment confirmation. Mark the vendor
  // Featured only here, rather than at invite time, so client-facing placement
  // is tied to an actual payment.
  await db.update(vendors).set({ isFeatured: true }).where(eq(vendors.id, subscription.vendorId));
  const receiptSent = await notifyFeaturedVendorPaymentReceived(subscription.id, stripeInvoiceId, amountPaidCents, paidAt);
  if (!receiptSent) throw new Error("Featured vendor payment receipt could not be delivered; Stripe will retry this webhook.");
  return subscription.id;
}

async function processInvoiceFailure(event: Stripe.Event, invoice: Stripe.Invoice, requiresAction = false): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable.");
  const subscription = await resolveSubscriptionForInvoice(db, invoice);
  if (!subscription) return null;
  if (!invoice.id) throw new Error("Stripe invoice event did not include an invoice ID.");
  const reason = requiresAction
    ? "Stripe needs the vendor to authenticate or update the payment method."
    : "Stripe could not collect the scheduled payment.";
  const stripeInvoiceId = invoice.id;
  const [priorPayment] = await db.select().from(vendorBillingPayments)
    .where(eq(vendorBillingPayments.stripeInvoiceId, stripeInvoiceId)).limit(1);
  if (priorPayment) {
    await db.update(vendorBillingPayments).set({
      paymentStatus: "failed",
      failureReason: reason,
    }).where(eq(vendorBillingPayments.id, priorPayment.id));
  } else {
    await db.insert(vendorBillingPayments).values({
      vendorFeaturedSubscriptionId: subscription.id,
      stripeInvoiceId,
      stripePaymentIntentId: null,
      amountPaidCents: 0,
      currency: (invoice.currency ?? CURRENCY).toLowerCase(),
      agentEarningsCents: 0,
      paymentStatus: "failed",
      failureReason: reason,
    });
  }
  const [paymentAfter] = await db.select().from(vendorBillingPayments)
    .where(eq(vendorBillingPayments.stripeInvoiceId, stripeInvoiceId)).limit(1);
  await db.update(vendorFeaturedSubscriptions).set({
    stripeSubscriptionId: invoiceSubscriptionId(invoice) ?? subscription.stripeSubscriptionId,
    stripeCustomerId: optionalStripeId(invoice.customer as string | Stripe.Customer | null | undefined) ?? subscription.stripeCustomerId,
    billingStatus: "past_due",
    lastFailureAt: new Date(),
  }).where(eq(vendorFeaturedSubscriptions.id, subscription.id));
  if (!paymentAfter?.failureNotifiedAt) {
    const delivered = await notifyBillingAttention(subscription.id, event.id, reason);
    if (!delivered) throw new Error("Featured vendor payment alert could not be delivered; Stripe will retry this webhook.");
    await db.update(vendorBillingPayments).set({ failureNotifiedAt: new Date() })
      .where(eq(vendorBillingPayments.id, paymentAfter!.id));
  }
  return subscription.id;
}

async function processSubscriptionChange(event: Stripe.Event, stripeSubscription: Stripe.Subscription): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable.");
  const internalId = Number(stripeSubscription.metadata.vendorFeaturedSubscriptionId);
  const subscription = await findBillingSubscription(db, {
    internalId: Number.isInteger(internalId) && internalId > 0 ? internalId : null,
    stripeSubscriptionId: stripeSubscription.id,
    stripeCustomerId: optionalStripeId(stripeSubscription.customer),
  });
  if (!subscription) return null;
  const nextStatus = stripeStatus(stripeSubscription.status);
  const needsAttention = ["past_due", "unpaid", "paused", "canceled", "incomplete", "incomplete_expired"].includes(nextStatus);
  const shouldAlert = needsAttention && subscription.billingStatus !== nextStatus;
  await db.update(vendorFeaturedSubscriptions).set({
    stripeSubscriptionId: stripeSubscription.id,
    stripeCustomerId: optionalStripeId(stripeSubscription.customer) ?? subscription.stripeCustomerId,
    billingStatus: nextStatus,
    canceledAt: nextStatus === "canceled" ? new Date() : subscription.canceledAt,
    lastFailureAt: needsAttention ? new Date() : subscription.lastFailureAt,
  }).where(eq(vendorFeaturedSubscriptions.id, subscription.id));
  if (shouldAlert) {
    const reasonByStatus: Record<string, string> = {
      past_due: "The subscription is past due after a payment collection issue.",
      unpaid: "The subscription is unpaid and needs the vendor’s attention.",
      paused: "The subscription is paused and no further invoices will be collected until it resumes.",
      canceled: "The subscription was canceled and featured-vendor payments have stopped.",
      incomplete: "The first subscription payment was not completed.",
      incomplete_expired: "The subscription checkout expired before the first payment was completed.",
    };
    const delivered = await notifyBillingAttention(subscription.id, event.id, reasonByStatus[nextStatus] ?? "The subscription needs attention.");
    if (!delivered) throw new Error("Featured vendor status alert could not be delivered; Stripe will retry this webhook.");
  }
  return subscription.id;
}

/** Processes Stripe events idempotently. Unknown events are recorded as ignored for auditability. */
export async function handleStripeWebhookEvent(event: Stripe.Event): Promise<{ duplicate: boolean; handled: boolean }> {
  if (!(await claimEvent(event))) return { duplicate: true, handled: false };
  let billingSubscriptionId: number | null = null;
  try {
    switch (event.type) {
      case "checkout.session.completed":
        billingSubscriptionId = await processCheckoutCompleted(event, event.data.object as Stripe.Checkout.Session);
        break;
      case "invoice.paid":
        billingSubscriptionId = await processInvoicePaid(event, event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        billingSubscriptionId = await processInvoiceFailure(event, event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_action_required":
        billingSubscriptionId = await processInvoiceFailure(event, event.data.object as Stripe.Invoice, true);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        billingSubscriptionId = await processSubscriptionChange(event, event.data.object as Stripe.Subscription);
        break;
      default:
        await markEvent(event.id, { status: "ignored" });
        return { duplicate: false, handled: false };
    }
    await markEvent(event.id, { status: billingSubscriptionId ? "processed" : "ignored", billingSubscriptionId });
    return { duplicate: false, handled: Boolean(billingSubscriptionId) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markEvent(event.id, { status: "failed", billingSubscriptionId, errorMessage: reason });
    throw error;
  }
}

export function constructStripeWebhookEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("Stripe webhook signing secret is not configured.");
  if (!signature) throw new Error("Missing Stripe-Signature header.");
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}
