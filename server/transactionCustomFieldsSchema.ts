import mysql from "mysql2/promise";

// An idempotent startup guard matches the project's existing Railway migration
// convention. Fail deployment if a required table cannot be created.
const statements = [
  `CREATE TABLE IF NOT EXISTS transaction_custom_fields (
    id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
    agentId int NOT NULL,
    name varchar(100) NOT NULL,
    type enum('date','money','number','percent','checkbox','select') NOT NULL,
    options json NULL,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY transaction_custom_fields_agent_idx (agentId),
    CONSTRAINT transaction_custom_fields_agent_fk FOREIGN KEY (agentId) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS transaction_custom_field_values (
    id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
    fieldId int NOT NULL,
    transactionId int NOT NULL,
    value varchar(255) NOT NULL,
    UNIQUE KEY transaction_custom_values_unique (fieldId, transactionId),
    KEY transaction_custom_values_tx_idx (transactionId),
    CONSTRAINT transaction_custom_values_field_fk FOREIGN KEY (fieldId) REFERENCES transaction_custom_fields(id) ON DELETE CASCADE,
    CONSTRAINT transaction_custom_values_tx_fk FOREIGN KEY (transactionId) REFERENCES transactions(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS transaction_agent_views (
    agentId int NOT NULL PRIMARY KEY,
    settings json NOT NULL,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT transaction_agent_views_agent_fk FOREIGN KEY (agentId) REFERENCES users(id) ON DELETE CASCADE
  )`,
];
let readiness: Promise<void> | undefined;
export function ensureTransactionCustomFieldsSchema() {
  return readiness ??= (async () => {
    if (!process.env.DATABASE_URL) return;
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    try {
      for (const statement of statements) await connection.query(statement);
    } finally {
      await connection.end();
    }
  })();
}
