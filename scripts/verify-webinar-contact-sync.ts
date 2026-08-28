import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [sources] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT id, name, isActive FROM lead_sources WHERE name = 'Zoom Webinar' LIMIT 1",
    );
    if (!sources.length) throw new Error('Required lead source "Zoom Webinar" was not found.');
    const [columns] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'webinar_attendees' AND COLUMN_NAME IN ('contactId', 'contactRegistrationNotedAt') ORDER BY COLUMN_NAME",
    );
    if (columns.length !== 2) throw new Error("Webinar attendee contact-sync columns are missing.");
    console.log(`Verified lead source ${sources[0].id} (${sources[0].name}) and Webinar attendee contact-sync fields.`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
