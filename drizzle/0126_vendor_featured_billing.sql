-- Stripe-backed recurring Featured Vendor subscriptions and payment ledger.
-- Stripe remains the payment system of record; SavvyOS stores only IDs, statuses,
-- and revenue attribution required for agent earnings reports and follow-up alerts.
CREATE TABLE `vendor_featured_subscriptions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `vendorId` int NOT NULL,
  `agentId` int NOT NULL,
  `monthlyAmountCents` int NOT NULL,
  `currency` varchar(3) NOT NULL DEFAULT 'usd',
  `billingStatus` enum('pending_checkout','checkout_complete','active','past_due','unpaid','paused','canceled','incomplete','incomplete_expired','failed') NOT NULL DEFAULT 'pending_checkout',
  `stripeCheckoutSessionId` varchar(255) NULL,
  `stripeCustomerId` varchar(255) NULL,
  `stripeSubscriptionId` varchar(255) NULL,
  `checkoutUrl` text NULL,
  `checkoutExpiresAt` timestamp NULL,
  `invitedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `invitationSentAt` timestamp NULL,
  `checkoutCompletedAt` timestamp NULL,
  `activatedAt` timestamp NULL,
  `lastPaymentAt` timestamp NULL,
  `lastFailureAt` timestamp NULL,
  `canceledAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `vendor_featured_subscriptions_id` PRIMARY KEY(`id`),
  CONSTRAINT `vendor_featured_subscriptions_stripeCheckoutSessionId_unique` UNIQUE(`stripeCheckoutSessionId`),
  CONSTRAINT `vendor_featured_subscriptions_stripeSubscriptionId_unique` UNIQUE(`stripeSubscriptionId`),
  CONSTRAINT `vendor_featured_subscriptions_vendorId_vendors_id_fk` FOREIGN KEY (`vendorId`) REFERENCES `vendors`(`id`) ON DELETE cascade,
  CONSTRAINT `vendor_featured_subscriptions_agentId_users_id_fk` FOREIGN KEY (`agentId`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX `vendor_featured_subscriptions_vendor_status_idx` ON `vendor_featured_subscriptions` (`vendorId`, `billingStatus`);
--> statement-breakpoint
CREATE INDEX `vendor_featured_subscriptions_agent_status_idx` ON `vendor_featured_subscriptions` (`agentId`, `billingStatus`);
--> statement-breakpoint
CREATE INDEX `vendor_featured_subscriptions_customer_idx` ON `vendor_featured_subscriptions` (`stripeCustomerId`);
--> statement-breakpoint
CREATE TABLE `vendor_billing_payments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `vendorFeaturedSubscriptionId` int NOT NULL,
  `stripeInvoiceId` varchar(255) NOT NULL,
  `stripePaymentIntentId` varchar(255) NULL,
  `amountPaidCents` int NOT NULL,
  `currency` varchar(3) NOT NULL DEFAULT 'usd',
  `agentEarningsCents` int NOT NULL,
  `paymentStatus` enum('paid','failed') NOT NULL,
  `paidAt` timestamp NULL,
  `failureReason` text NULL,
  `failureNotifiedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `vendor_billing_payments_id` PRIMARY KEY(`id`),
  CONSTRAINT `vendor_billing_payments_stripeInvoiceId_unique` UNIQUE(`stripeInvoiceId`),
  CONSTRAINT `vendor_billing_payment_subscription_fk` FOREIGN KEY (`vendorFeaturedSubscriptionId`) REFERENCES `vendor_featured_subscriptions`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vendor_billing_payments_subscription_paid_idx` ON `vendor_billing_payments` (`vendorFeaturedSubscriptionId`, `paidAt`);
--> statement-breakpoint
CREATE INDEX `vendor_billing_payments_status_paid_idx` ON `vendor_billing_payments` (`paymentStatus`, `paidAt`);
--> statement-breakpoint
CREATE TABLE `vendor_billing_webhook_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `stripeEventId` varchar(255) NOT NULL,
  `eventType` varchar(128) NOT NULL,
  `billingSubscriptionId` int NULL,
  `status` enum('processing','processed','ignored','failed') NOT NULL DEFAULT 'processing',
  `errorMessage` text NULL,
  `processedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `vendor_billing_webhook_events_id` PRIMARY KEY(`id`),
  CONSTRAINT `vendor_billing_webhook_events_stripeEventId_unique` UNIQUE(`stripeEventId`),
  CONSTRAINT `vendor_billing_webhook_subscription_fk` FOREIGN KEY (`billingSubscriptionId`) REFERENCES `vendor_featured_subscriptions`(`id`) ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `vendor_billing_webhook_events_status_idx` ON `vendor_billing_webhook_events` (`status`, `createdAt`);
--> statement-breakpoint
CREATE INDEX `vendor_billing_webhook_events_subscription_idx` ON `vendor_billing_webhook_events` (`billingSubscriptionId`, `createdAt`);
