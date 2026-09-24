import mysql from "mysql2/promise";

export const CONTACT_LEAD_SOURCE_TRIGGER = "contacts_preserve_lead_source";
export const CONTACT_LEAD_SOURCE_UPDATE_SESSION_VARIABLE =
  "savvyos_allow_contact_lead_source_update";

export const dropContactLeadSourceTriggerSql = `DROP TRIGGER IF EXISTS \`${CONTACT_LEAD_SOURCE_TRIGGER}\``;
export const createContactLeadSourceTriggerSql = `
  CREATE TRIGGER \`${CONTACT_LEAD_SOURCE_TRIGGER}\`
  BEFORE UPDATE ON \`contacts\`
  FOR EACH ROW
    SET NEW.\`leadSourceId\` = IF(
      COALESCE(@${CONTACT_LEAD_SOURCE_UPDATE_SESSION_VARIABLE}, 0) = 1,
      NEW.\`leadSourceId\`,
      OLD.\`leadSourceId\`
    )
`;

let readiness: Promise<void> | null = null;

/**
 * Keeps first-touch attribution immutable for every raw contact update while
 * allowing the permission-checked correction path to opt in for one database
 * transaction. The migration is the permanent record; this guard repairs the
 * trigger before a Railway instance receives traffic.
 */
async function applyContactLeadSourceTrigger() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const connection = await mysql.createConnection(databaseUrl);
  const lockName = "savvyos_contact_lead_source_trigger";
  try {
    const [lockRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT GET_LOCK(?, 30) AS acquired",
      [lockName]
    );
    if (Number(lockRows[0]?.acquired) !== 1) {
      throw new Error(
        "Could not acquire the contact lead-source trigger migration lock."
      );
    }

    try {
      await connection.query(dropContactLeadSourceTriggerSql);
      await connection.query(createContactLeadSourceTriggerSql);
    } finally {
      await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
    }
  } finally {
    await connection.end();
  }
}

export function ensureContactLeadSourceTrigger() {
  readiness ??= applyContactLeadSourceTrigger();
  return readiness;
}
