-- Conversation Intelligence is an ISA operational workspace with its own
-- permission, navigation entry, route gate, and server-side access checks.
ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewConversationIntelligence` boolean NOT NULL DEFAULT true
  AFTER `canViewIsmDashboard`;
