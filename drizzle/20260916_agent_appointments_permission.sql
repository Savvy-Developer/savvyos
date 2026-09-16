ALTER TABLE `admin_permissions`
  ADD COLUMN `canViewAgentAppointments` boolean NOT NULL DEFAULT true AFTER `canViewConnectionRequests`;
