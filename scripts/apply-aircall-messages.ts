import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const connection = await mysql.createConnection(databaseUrl);
try {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS aircall_messages (
      id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
      aircallMessageId VARCHAR(128) NOT NULL,
      contactId INT NULL,
      communicationId INT NULL,
      savvyUserId INT NULL,
      aircallNumberId INT NOT NULL,
      direction ENUM('inbound', 'outbound') NOT NULL,
      status VARCHAR(64) NOT NULL DEFAULT 'pending',
      fromNumber VARCHAR(32) NULL,
      toNumber VARCHAR(32) NULL,
      body TEXT NULL,
      sentAt TIMESTAMP NULL,
      receivedAt TIMESTAMP NULL,
      rawPayload JSON NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT aircall_messages_aircall_message_unique UNIQUE (aircallMessageId),
      CONSTRAINT aircall_messages_contact_fk FOREIGN KEY (contactId) REFERENCES contacts(id) ON DELETE SET NULL,
      CONSTRAINT aircall_messages_communication_fk FOREIGN KEY (communicationId) REFERENCES communications(id) ON DELETE SET NULL,
      CONSTRAINT aircall_messages_savvy_user_fk FOREIGN KEY (savvyUserId) REFERENCES users(id) ON DELETE SET NULL,
      INDEX aircall_messages_contact_sent_idx (contactId, sentAt),
      INDEX aircall_messages_isa_sent_idx (savvyUserId, sentAt),
      INDEX aircall_messages_number_sent_idx (aircallNumberId, sentAt)
    )
  `);
  console.log("Aircall message table is ready");
} finally {
  await connection.end();
}
