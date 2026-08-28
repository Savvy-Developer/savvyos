import mysql from "mysql2/promise";

async function columnExists(connection: mysql.Connection, column: string): Promise<boolean> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'webinar_attendees' AND COLUMN_NAME = ?",
    [column],
  );
  return rows.length > 0;
}

async function indexExists(connection: mysql.Connection, index: string): Promise<boolean> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'webinar_attendees' AND INDEX_NAME = ?",
    [index],
  );
  return rows.length > 0;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    if (!await columnExists(connection, "contactId")) {
      await connection.query("ALTER TABLE `webinar_attendees` ADD COLUMN `contactId` int NULL AFTER `webinarId`");
      console.log("Created webinar_attendees.contactId.");
    }
    if (!await columnExists(connection, "contactRegistrationNotedAt")) {
      await connection.query("ALTER TABLE `webinar_attendees` ADD COLUMN `contactRegistrationNotedAt` timestamp NULL AFTER `contactId`");
      console.log("Created webinar_attendees.contactRegistrationNotedAt.");
    }
    const [foreignKeys] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'webinar_attendees' AND COLUMN_NAME = 'contactId' AND REFERENCED_TABLE_NAME = 'contacts'",
    );
    if (foreignKeys.length === 0) {
      await connection.query("ALTER TABLE `webinar_attendees` ADD CONSTRAINT `webinar_attendees_contactId_contacts_id_fk` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE SET NULL");
      console.log("Created webinar attendee contact foreign key.");
    }
    if (!await indexExists(connection, "webinar_attendees_contact_idx")) {
      await connection.query("ALTER TABLE `webinar_attendees` ADD INDEX `webinar_attendees_contact_idx` (`contactId`)");
      console.log("Created webinar attendee contact index.");
    }
    console.log("Webinar attendee contact sync schema is available.");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
