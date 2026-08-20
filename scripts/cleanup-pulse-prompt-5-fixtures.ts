import mysql from "mysql2/promise";

export async function cleanupPulsePrompt5Fixtures(connection: mysql.Connection) {
  const [messageRows] = await connection.query<any[]>(`
    SELECT cm.id
    FROM pulse_cascading_messages cm
    LEFT JOIN pulse_meetings from_meeting ON from_meeting.id = cm.fromMeetingId
    LEFT JOIN pulse_meetings to_meeting ON to_meeting.id = cm.toMeetingId
    WHERE from_meeting.name LIKE 'Pulse Slice — %' OR to_meeting.name LIKE 'Pulse Slice — %'
  `);
  const messageIds = messageRows.map((row) => row.id);
  if (messageIds.length) {
    const placeholders = messageIds.map(() => "?").join(",");
    await connection.query(`DELETE FROM pulse_cascade_destinations WHERE cascadingMessageId IN (${placeholders})`, messageIds);
    await connection.query(`DELETE FROM pulse_cascade_recipients WHERE cascadingMessageId IN (${placeholders})`, messageIds);
    await connection.query(`DELETE FROM pulse_notifications WHERE sourceType = 'cascade' AND sourceId IN (${placeholders})`, messageIds);
    await connection.query(`DELETE FROM pulse_cascading_messages WHERE id IN (${placeholders})`, messageIds);
  }
  await connection.query(`
    DELETE preference
    FROM pulse_notification_preferences preference
    INNER JOIN users fixture_user ON fixture_user.id = preference.personId
    WHERE fixture_user.openId LIKE 'pulse_slice_fixture_%'
  `);
  return { removedMessages: messageIds.length };
}

const url = process.env.DATABASE_URL;
if (url && process.argv[1]?.endsWith("cleanup-pulse-prompt-5-fixtures.ts")) {
  const connection = await mysql.createConnection({ uri: url });
  try {
    const result = await cleanupPulsePrompt5Fixtures(connection);
    console.log(`Removed ${result.removedMessages} Prompt 5 fixture cascade message${result.removedMessages === 1 ? "" : "s"}.`);
  } finally {
    await connection.end();
  }
}
