import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const connection = await mysql.createConnection(databaseUrl);

type Row = { value: string };

async function tableExists(tableName: string) {
  const [rows] = await connection.query<Row[]>(
    `SELECT table_name AS value
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName]
  );
  return rows.length > 0;
}

async function columnExists(tableName: string, columnName: string) {
  const [rows] = await connection.query<Row[]>(
    `SELECT column_name AS value
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function indexExists(tableName: string, indexName: string) {
  const [rows] = await connection.query<Row[]>(
    `SELECT index_name AS value
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [tableName, indexName]
  );
  return rows.length > 0;
}

const tableStatements: Array<[string, string]> = [
  [
    "chat_message_attachments",
    `CREATE TABLE \`chat_message_attachments\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`channelId\` int NOT NULL,
      \`messageId\` int NULL,
      \`uploadedById\` int NOT NULL,
      \`fileName\` varchar(255) NOT NULL,
      \`fileUrl\` text NOT NULL,
      \`fileKey\` varchar(500) NOT NULL,
      \`mimeType\` varchar(255) NOT NULL,
      \`fileSize\` int NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`chat_attachments_message_idx\` (\`messageId\`, \`id\`),
      KEY \`chat_attachments_channel_user_idx\` (\`channelId\`, \`uploadedById\`, \`messageId\`),
      CONSTRAINT \`chat_attachments_channel_fk\` FOREIGN KEY (\`channelId\`) REFERENCES \`chat_channels\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`chat_attachments_message_fk\` FOREIGN KEY (\`messageId\`) REFERENCES \`chat_messages\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`chat_attachments_uploaded_by_fk\` FOREIGN KEY (\`uploadedById\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT
    )`,
  ],
  [
    "chat_message_mentions",
    `CREATE TABLE \`chat_message_mentions\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`messageId\` int NOT NULL,
      \`mentionedUserId\` int NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`chat_mentions_message_user_unique\` (\`messageId\`, \`mentionedUserId\`),
      KEY \`chat_mentions_user_idx\` (\`mentionedUserId\`, \`messageId\`),
      CONSTRAINT \`chat_mentions_message_fk\` FOREIGN KEY (\`messageId\`) REFERENCES \`chat_messages\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`chat_mentions_user_fk\` FOREIGN KEY (\`mentionedUserId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
    )`,
  ],
  [
    "chat_message_reactions",
    `CREATE TABLE \`chat_message_reactions\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`messageId\` int NOT NULL,
      \`userId\` int NOT NULL,
      \`emoji\` varchar(32) NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`chat_reactions_message_user_emoji_unique\` (\`messageId\`, \`userId\`, \`emoji\`),
      KEY \`chat_reactions_message_idx\` (\`messageId\`, \`emoji\`),
      CONSTRAINT \`chat_reactions_message_fk\` FOREIGN KEY (\`messageId\`) REFERENCES \`chat_messages\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`chat_reactions_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
    )`,
  ],
  [
    "chat_channel_reads",
    `CREATE TABLE \`chat_channel_reads\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`channelId\` int NOT NULL,
      \`userId\` int NOT NULL,
      \`lastReadMessageId\` int NULL,
      \`lastReadAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`chat_reads_channel_user_unique\` (\`channelId\`, \`userId\`),
      KEY \`chat_reads_user_channel_idx\` (\`userId\`, \`channelId\`),
      CONSTRAINT \`chat_reads_channel_fk\` FOREIGN KEY (\`channelId\`) REFERENCES \`chat_channels\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`chat_reads_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`chat_reads_message_fk\` FOREIGN KEY (\`lastReadMessageId\`) REFERENCES \`chat_messages\` (\`id\`) ON DELETE SET NULL
    )`,
  ],
];

try {
  const applied: string[] = [];

  if (!(await columnExists("chat_channels", "type"))) {
    await connection.query(
      "ALTER TABLE `chat_channels` ADD COLUMN `type` ENUM('group', 'direct') NOT NULL DEFAULT 'group' AFTER `sectionId`"
    );
    applied.push("added chat_channels.type");
  }
  if (!(await columnExists("chat_channels", "directKey"))) {
    await connection.query(
      "ALTER TABLE `chat_channels` ADD COLUMN `directKey` varchar(64) NULL AFTER `type`"
    );
    applied.push("added chat_channels.directKey");
  }
  if (!(await indexExists("chat_channels", "chat_channels_direct_key_unique"))) {
    await connection.query(
      "ALTER TABLE `chat_channels` ADD UNIQUE INDEX `chat_channels_direct_key_unique` (`directKey`)"
    );
    applied.push("added chat_channels direct key index");
  }
  if (!(await columnExists("chat_messages", "parentMessageId"))) {
    await connection.query(
      "ALTER TABLE `chat_messages` ADD COLUMN `parentMessageId` int NULL AFTER `senderId`, ADD KEY `chat_messages_parent_created_idx` (`parentMessageId`, `createdAt`, `id`), ADD CONSTRAINT `chat_messages_parent_fk` FOREIGN KEY (`parentMessageId`) REFERENCES `chat_messages` (`id`) ON DELETE SET NULL"
    );
    applied.push("added chat_messages.parentMessageId");
  }

  for (const [name, statement] of tableStatements) {
    if (await tableExists(name)) continue;
    await connection.query(statement);
    applied.push(`created ${name}`);
  }

  console.log(applied.length ? `Chat V2 migration applied: ${applied.join("; ")}` : "Chat V2 migration already current.");
} finally {
  await connection.end();
}
