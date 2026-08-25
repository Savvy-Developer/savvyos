import mysql, { type RowDataPacket } from "mysql2/promise";

type ColumnRow = RowDataPacket & { COLUMN_NAME: string };
type IndexRow = RowDataPacket & { Key_name: string; Non_unique: number };
type DuplicateRow = RowDataPacket & { trackingNumber: string; count: number };

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const connection = await mysql.createConnection(databaseUrl);

try {
  const [columnRows] = await connection.query<ColumnRow[]>(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tech_requests'`
  );
  const columns = new Set(columnRows.map((column) => column.COLUMN_NAME));

  if (!columns.has("trackingNumber")) {
    await connection.query(
      "ALTER TABLE `tech_requests` ADD COLUMN `trackingNumber` varchar(32) NULL AFTER `id`"
    );
  }
  if (!columns.has("dueDate")) {
    await connection.query(
      "ALTER TABLE `tech_requests` ADD COLUMN `dueDate` date NULL AFTER `status`"
    );
  }

  await connection.query(
    "UPDATE `tech_requests` SET `trackingNumber` = CONCAT('TR', LPAD(`id`, 3, '0')) WHERE `trackingNumber` IS NULL OR `trackingNumber` = ''"
  );

  const [duplicateRows] = await connection.query<DuplicateRow[]>(
    "SELECT `trackingNumber`, COUNT(*) AS `count` FROM `tech_requests` GROUP BY `trackingNumber` HAVING COUNT(*) > 1"
  );
  if (duplicateRows.length > 0) {
    throw new Error(`Duplicate Tech Request tracking numbers found: ${duplicateRows.map((row) => row.trackingNumber).join(", ")}`);
  }

  await connection.query(
    "ALTER TABLE `tech_requests` MODIFY COLUMN `trackingNumber` varchar(32) NOT NULL"
  );

  const [indexRows] = await connection.query<IndexRow[]>("SHOW INDEX FROM `tech_requests`");
  const indexes = new Map(indexRows.map((index) => [index.Key_name, index]));
  if (!indexes.has("tech_requests_tracking_number_unique")) {
    await connection.query(
      "ALTER TABLE `tech_requests` ADD CONSTRAINT `tech_requests_tracking_number_unique` UNIQUE (`trackingNumber`)"
    );
  }
  if (!indexes.has("tech_requests_due_date_idx")) {
    await connection.query(
      "ALTER TABLE `tech_requests` ADD INDEX `tech_requests_due_date_idx` (`dueDate`)"
    );
  }

  console.log("Tech Requests tracking-number and due-date migration applied successfully.");
} finally {
  connection.destroy();
}
