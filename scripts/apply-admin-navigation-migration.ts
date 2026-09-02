import mysql from "mysql2/promise";

async function indexExists(
  connection: mysql.Connection,
  tableName: string,
  indexName: string
) {
  const [rows] = await connection.execute<mysql.RowDataPacket[]>(
    `SELECT 1
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND index_name = ?
     LIMIT 1`,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const connection = await mysql.createConnection(databaseUrl);
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS admin_navigation_preferences (
        id int NOT NULL AUTO_INCREMENT,
        userId int NOT NULL,
        path varchar(512) NOT NULL,
        isFavorite boolean NOT NULL DEFAULT false,
        viewCount int NOT NULL DEFAULT 0,
        lastViewedAt timestamp NULL,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT admin_navigation_preferences_user_fk
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY admin_navigation_preferences_user_path_unique (userId, path),
        KEY admin_navigation_preferences_user_favorite_idx (userId, isFavorite),
        KEY admin_navigation_preferences_user_usage_idx (userId, viewCount, lastViewedAt)
      )
    `);

    const indexes = [
      {
        tableName: "activity_log",
        indexName: "idx_activity_log_hot_leads_views",
        definition:
          "ADD INDEX idx_activity_log_hot_leads_views (action, entityType, createdAt, entityId)",
      },
      {
        tableName: "communications",
        indexName: "communications_contact_communicated_idx",
        definition:
          "ADD INDEX communications_contact_communicated_idx (relatedContactId, communicatedAt)",
      },
    ];
    for (const index of indexes) {
      if (!(await indexExists(connection, index.tableName, index.indexName))) {
        await connection.query(
          `ALTER TABLE \`${index.tableName}\` ${index.definition}`
        );
      }
    }
    console.log("Applied admin navigation preferences and Hot Leads indexes.");
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
