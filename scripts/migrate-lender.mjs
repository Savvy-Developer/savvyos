import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(url);

const sqls = [
  // 1. Add 'lender' to the users.role enum
  `ALTER TABLE users MODIFY COLUMN role ENUM('admin','agent','isa','agent_support','lender') NOT NULL DEFAULT 'agent'`,

  // 2. Create contact_lender_access join table
  `CREATE TABLE IF NOT EXISTS contact_lender_access (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contactId INT NOT NULL,
    lenderUserId INT NOT NULL,
    grantedByUserId INT NULL,
    transactionId INT NULL,
    notes TEXT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cla_contact FOREIGN KEY (contactId) REFERENCES contacts(id) ON DELETE CASCADE,
    CONSTRAINT fk_cla_lender FOREIGN KEY (lenderUserId) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_cla_granted_by FOREIGN KEY (grantedByUserId) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_cla_transaction FOREIGN KEY (transactionId) REFERENCES transactions(id) ON DELETE SET NULL,
    UNIQUE KEY uq_contact_lender (contactId, lenderUserId)
  )`,
];

for (const sql of sqls) {
  try {
    await conn.execute(sql);
    console.log("OK:", sql.slice(0, 60));
  } catch (e) {
    console.error("FAIL:", e.message, "\nSQL:", sql.slice(0, 80));
  }
}

await conn.end();
console.log("Migration complete.");
