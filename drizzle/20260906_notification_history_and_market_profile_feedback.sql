-- Editable operating-recipient lists and persistent Resend delivery history.
ALTER TABLE email_notification_settings
  ADD COLUMN recipientEmails JSON NULL AFTER recipientUserIds;

CREATE TABLE IF NOT EXISTS email_notification_deliveries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  notificationKey VARCHAR(128) NOT NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'resend',
  providerMessageId VARCHAR(255) NULL,
  recipientEmail VARCHAR(320) NOT NULL,
  recipientName VARCHAR(255) NULL,
  subject TEXT NOT NULL,
  htmlBody MEDIUMTEXT NOT NULL,
  status ENUM('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'suppressed', 'failed') NOT NULL DEFAULT 'sent',
  errorMessage TEXT NULL,
  sentAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deliveredAt TIMESTAMP NULL,
  openedAt TIMESTAMP NULL,
  clickedAt TIMESTAMP NULL,
  bouncedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX email_notification_delivery_key_sent_idx (notificationKey, sentAt),
  INDEX email_notification_delivery_provider_message_idx (providerMessageId),
  UNIQUE KEY email_notification_delivery_message_recipient_unique (providerMessageId, recipientEmail)
);

-- One private agent feedback request per market profile version. The submitted
-- feedback is then inserted as a market source and re-synthesized by SavvyOS.
CREATE TABLE IF NOT EXISTS market_profile_feedback_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  marketProfileId INT NOT NULL,
  agentId INT NOT NULL,
  profileFingerprint VARCHAR(64) NOT NULL,
  previousProfileJson JSON NULL,
  profileJson JSON NOT NULL,
  changeSummary JSON NOT NULL,
  feedbackText MEDIUMTEXT NULL,
  emailSentAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  feedbackSubmittedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT market_profile_feedback_market_fk FOREIGN KEY (marketProfileId) REFERENCES market_profiles(id) ON DELETE CASCADE,
  CONSTRAINT market_profile_feedback_agent_fk FOREIGN KEY (agentId) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY market_profile_feedback_request_unique (marketProfileId, agentId, profileFingerprint),
  INDEX market_profile_feedback_agent_created_idx (agentId, createdAt),
  INDEX market_profile_feedback_market_created_idx (marketProfileId, createdAt)
);
