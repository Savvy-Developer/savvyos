import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const connection = await mysql.createConnection(databaseUrl);

async function tableExists(tableName: string): Promise<boolean> {
  const [rows] = await connection.query<Array<{ tableName: string }>>(
    `SELECT table_name AS tableName
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName]
  );
  return rows.length > 0;
}

async function columnExists(
  tableName: string,
  columnName: string
): Promise<boolean> {
  const [rows] = await connection.query<Array<{ columnName: string }>>(
    `SELECT column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

const tableStatements: Array<[string, string]> = [
  [
    "chat_sections",
    `CREATE TABLE \`chat_sections\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`name\` varchar(100) NOT NULL,
      \`description\` varchar(500) NULL,
      \`sortOrder\` int NOT NULL DEFAULT 0,
      \`isArchived\` boolean NOT NULL DEFAULT false,
      \`createdById\` int NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`chat_sections_active_sort_idx\` (\`isArchived\`, \`sortOrder\`, \`name\`),
      CONSTRAINT \`chat_sections_created_by_fk\`
        FOREIGN KEY (\`createdById\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
    )`,
  ],
  [
    "chat_channels",
    `CREATE TABLE \`chat_channels\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`sectionId\` int NULL,
      \`name\` varchar(100) NOT NULL,
      \`description\` varchar(500) NULL,
      \`isArchived\` boolean NOT NULL DEFAULT false,
      \`createdById\` int NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`chat_channels_active_section_idx\` (\`isArchived\`, \`sectionId\`, \`name\`),
      CONSTRAINT \`chat_channels_section_fk\`
        FOREIGN KEY (\`sectionId\`) REFERENCES \`chat_sections\` (\`id\`) ON DELETE SET NULL,
      CONSTRAINT \`chat_channels_created_by_fk\`
        FOREIGN KEY (\`createdById\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
    )`,
  ],
  [
    "chat_channel_members",
    `CREATE TABLE \`chat_channel_members\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`channelId\` int NOT NULL,
      \`userId\` int NOT NULL,
      \`addedById\` int NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`chat_channel_members_unique\` (\`channelId\`, \`userId\`),
      KEY \`chat_channel_members_user_idx\` (\`userId\`, \`channelId\`),
      CONSTRAINT \`chat_channel_members_channel_fk\`
        FOREIGN KEY (\`channelId\`) REFERENCES \`chat_channels\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`chat_channel_members_user_fk\`
        FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`chat_channel_members_added_by_fk\`
        FOREIGN KEY (\`addedById\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
    )`,
  ],
  [
    "chat_messages",
    `CREATE TABLE \`chat_messages\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`channelId\` int NOT NULL,
      \`senderId\` int NOT NULL,
      \`body\` mediumtext NOT NULL,
      \`editedAt\` timestamp NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`chat_messages_channel_created_idx\` (\`channelId\`, \`createdAt\`, \`id\`),
      KEY \`chat_messages_sender_created_idx\` (\`senderId\`, \`createdAt\`),
      CONSTRAINT \`chat_messages_channel_fk\`
        FOREIGN KEY (\`channelId\`) REFERENCES \`chat_channels\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`chat_messages_sender_fk\`
        FOREIGN KEY (\`senderId\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
    )`,
  ],
];

try {
  const applied: string[] = [];
  for (const [name, statement] of tableStatements) {
    if (await tableExists(name)) continue;
    await connection.query(statement);
    applied.push(`created ${name}`);
  }

  if (!(await columnExists("admin_permissions", "canViewChat"))) {
    await connection.query(
      "ALTER TABLE `admin_permissions` ADD COLUMN `canViewChat` boolean NOT NULL DEFAULT false AFTER `canViewDashboard`"
    );
    applied.push("added admin_permissions.canViewChat");
  }
  if (!(await columnExists("admin_permissions", "canManageChat"))) {
    await connection.query(
      "ALTER TABLE `admin_permissions` ADD COLUMN `canManageChat` boolean NOT NULL DEFAULT false AFTER `canViewChat`"
    );
    applied.push("added admin_permissions.canManageChat");
  }

  console.log(
    applied.length
      ? `Chat migration applied: ${applied.join("; ")}`
      : "Chat migration already current."
  );
} finally {
  await connection.end();
}
