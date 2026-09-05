import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { type RowDataPacket } from "mysql2/promise";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { getMcpPool } from "./mcpDatabase";
import {
  MCP_ENDPOINT_PATH,
  mcpProtectedResourceMetadataUrl,
  verifyMcpOAuthAccessToken,
} from "./mcpOAuth";

const MAX_ROWS_PER_QUERY = 500;
const MAX_RESPONSE_BYTES = 700_000;
const SENSITIVE_FIELD_PATTERN =
  /(?:password|secret|token|(?:api|access|private)[_-]?key|credential|authorization|cookie|session|hash)/i;
const SYSTEM_SCHEMA_PATTERN =
  /(?:information_schema|performance_schema|mysql\.|sys\.)/i;
const WRITE_OR_ADMIN_SQL_PATTERN =
  /\b(?:insert|update|delete|replace|alter|drop|create|grant|revoke|truncate|call|set|use|lock|unlock|handler|load|outfile|dumpfile|do|prepare|execute|deallocate|kill|shutdown|begin|commit|rollback|start\s+transaction|sleep|benchmark)\b/i;

type McpAccessKeyRow = RowDataPacket & {
  id: number;
};

type TableMetadataRow = RowDataPacket & {
  tableName: string;
};

type ColumnMetadataRow = RowDataPacket & {
  columnName: string;
  dataType: string;
  columnType: string;
  isNullable: "YES" | "NO";
  columnKey: string;
};

function keyDigest(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function isSensitiveFieldName(value: string): boolean {
  return SENSITIVE_FIELD_PATTERN.test(value);
}

function redactSensitiveValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveValues);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        isSensitiveFieldName(key) ? "[redacted]" : redactSensitiveValues(item),
      ])
    );
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  return value;
}

function serializeResult(value: unknown): string {
  const json = JSON.stringify(redactSensitiveValues(value), null, 2);
  if (Buffer.byteLength(json, "utf8") <= MAX_RESPONSE_BYTES) return json;
  const truncated = {
    truncated: true,
    notice: `Result exceeded ${MAX_RESPONSE_BYTES.toLocaleString()} bytes. Narrow the request and try again.`,
  };
  return JSON.stringify(truncated, null, 2);
}

function toolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: serializeResult(value) }],
  };
}

function readOnlyError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

function parseBearerToken(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function isActiveMcpKey(token: string): Promise<boolean> {
  if (token.length < 32 || token.length > 512) return false;
  const [rows] = await getMcpPool().query<McpAccessKeyRow[]>(
    "SELECT id FROM mcp_access_keys WHERE secretHash = ? AND revokedAt IS NULL LIMIT 1",
    [keyDigest(token)]
  );
  return rows.length === 1;
}

/**
 * OAuth is the connection method for web clients such as ChatGPT and Claude.
 * Existing manager-created bearer keys remain supported for desktop and CLI MCP
 * clients that can securely send custom authorization headers.
 */
async function isValidMcpAccessToken(token: string): Promise<boolean> {
  if (await verifyMcpOAuthAccessToken(token)) return true;
  return isActiveMcpKey(token);
}

async function availableTables(): Promise<string[]> {
  const [rows] = await getMcpPool().query<TableMetadataRow[]>(
    `SELECT table_name AS tableName
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC`
  );
  return rows.map(row => row.tableName);
}

function assertSafeTableName(value: string, available: string[]): string {
  if (!/^[a-zA-Z0-9_]+$/.test(value) || !available.includes(value)) {
    throw new Error("Choose a table returned by list_savvyos_tables.");
  }
  return value;
}

async function tableColumns(tableName: string): Promise<ColumnMetadataRow[]> {
  const [rows] = await getMcpPool().query<ColumnMetadataRow[]>(
    `SELECT column_name AS columnName,
            data_type AS dataType,
            column_type AS columnType,
            is_nullable AS isNullable,
            column_key AS columnKey
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
      ORDER BY ordinal_position ASC`,
    [tableName]
  );
  return rows.filter(column => !isSensitiveFieldName(column.columnName));
}

/**
 * Validates free-form queries before they reach MySQL. The MCP endpoint never
 * exposes a mutation tool, and this gate accepts only a single SELECT or CTE
 * with a required bounded LIMIT. Result values are redacted defensively too.
 */
export function validateReadOnlySql(input: string): string {
  const sql = input.trim();
  if (!sql) throw new Error("Provide a SQL SELECT query.");
  if (!/^(?:select|with)\b/i.test(sql)) {
    throw new Error(
      "Only SELECT queries and read-only WITH queries are allowed."
    );
  }
  if (sql.includes(";") || /(?:--|\/\*|\*\/|#)/.test(sql)) {
    throw new Error("Use one SQL statement without comments or semicolons.");
  }
  if (SYSTEM_SCHEMA_PATTERN.test(sql) || WRITE_OR_ADMIN_SQL_PATTERN.test(sql)) {
    throw new Error(
      "The query includes a blocked write, administration, or system-schema operation."
    );
  }
  if (SENSITIVE_FIELD_PATTERN.test(sql)) {
    throw new Error(
      "Credential-like fields and tables are not available through the SavvyOS MCP connection."
    );
  }
  const limitMatches = sql.match(/\blimit\s+(\d+)\b/gi) ?? [];
  if (limitMatches.length !== 1) {
    throw new Error(
      `Include exactly one LIMIT of ${MAX_ROWS_PER_QUERY} rows or fewer.`
    );
  }
  const limit = Number(/\blimit\s+(\d+)\b/i.exec(limitMatches[0])?.[1]);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ROWS_PER_QUERY) {
    throw new Error(`LIMIT must be between 1 and ${MAX_ROWS_PER_QUERY}.`);
  }
  return sql;
}

async function buildReadOnlyMcpServer(): Promise<McpServer> {
  const server = new McpServer(
    { name: "savvyos-read-only", version: "1.0.0" },
    {
      instructions:
        "SavvyOS data is read-only. Use the schema tools before querying unfamiliar tables. Never infer missing data.",
    }
  );

  server.registerTool(
    "savvyos_overview",
    {
      title: "SavvyOS data overview",
      description:
        "Explains the SavvyOS read-only connection, available data, and safe query workflow.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      toolResult({
        service: "SavvyOS read-only MCP",
        endpoint: MCP_ENDPOINT_PATH,
        capabilities: [
          "Discover all current SavvyOS tables and non-sensitive columns.",
          "Inspect a table's schema before querying.",
          `Run bounded read-only SELECT queries with LIMIT ${MAX_ROWS_PER_QUERY} or lower.`,
        ],
        safety: [
          "No create, update, delete, send, or other mutation operations are available.",
          "Credential-like fields are redacted from all results.",
          "New SavvyOS feature tables are discovered automatically unless a field is credential-like.",
        ],
        recommendedWorkflow: [
          "Call list_savvyos_tables.",
          "Call describe_savvyos_table for relevant tables.",
          "Call read_savvyos_data with a single bounded SELECT query.",
        ],
      })
  );

  server.registerTool(
    "list_savvyos_tables",
    {
      title: "List SavvyOS data tables",
      description:
        "Returns all current SavvyOS data tables with their non-sensitive column names. This dynamically includes future feature tables.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const tables = await availableTables();
      const columns = await Promise.all(
        tables.map(async tableName => ({
          tableName,
          columns: (await tableColumns(tableName)).map(
            column => column.columnName
          ),
        }))
      );
      return toolResult({ tableCount: columns.length, tables: columns });
    }
  );

  server.registerTool(
    "describe_savvyos_table",
    {
      title: "Describe a SavvyOS table",
      description:
        "Returns non-sensitive columns and their types for one table discovered through list_savvyos_tables.",
      inputSchema: {
        table: z
          .string()
          .min(1)
          .max(128)
          .describe("A table name returned by list_savvyos_tables."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ table }) => {
      try {
        const tableName = assertSafeTableName(table, await availableTables());
        return toolResult({
          tableName,
          columns: await tableColumns(tableName),
        });
      } catch (error) {
        return readOnlyError(
          error instanceof Error
            ? error.message
            : "Unable to describe the requested table."
        );
      }
    }
  );

  server.registerTool(
    "read_savvyos_data",
    {
      title: "Read SavvyOS data",
      description: `Runs one read-only SELECT or WITH query against SavvyOS. A single LIMIT between 1 and ${MAX_ROWS_PER_QUERY} is required. Credentials and authentication fields are redacted.`,
      inputSchema: {
        sql: z
          .string()
          .min(8)
          .max(20_000)
          .describe(
            `One SELECT or WITH query with exactly one LIMIT from 1 through ${MAX_ROWS_PER_QUERY}.`
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ sql }) => {
      try {
        const safeSql = validateReadOnlySql(sql);
        const [rows] = await getMcpPool().query<RowDataPacket[]>(safeSql);
        return toolResult({ rowsReturned: rows.length, rows });
      } catch (error) {
        return readOnlyError(
          error instanceof Error
            ? error.message
            : "Unable to run the requested read-only query."
        );
      }
    }
  );

  server.registerPrompt(
    "analyze_savvyos_data",
    {
      title: "Analyze SavvyOS data",
      description:
        "A reusable prompt that directs an AI to investigate SavvyOS data carefully and report findings without changing anything.",
      argsSchema: {
        question: z
          .string()
          .min(1)
          .max(2_000)
          .describe("The business question to investigate."),
      },
    },
    async ({ question }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Investigate this SavvyOS question using only the read-only SavvyOS MCP tools: ${question}\n\nFirst inspect the relevant schema. Then run only bounded SELECT queries. Clearly distinguish data-backed findings from assumptions, report the date range and row counts used, and do not attempt any modification.`,
          },
        },
      ],
    })
  );

  return server;
}

function sendMethodNotAllowed(res: Response) {
  return res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
}

/** Registers a stateless OAuth 2.1 and bearer-key protected read-only MCP endpoint. */
export function registerReadOnlyMcpRoute(app: Express): void {
  app.options(MCP_ENDPOINT_PATH, (_req, res) => {
    res.set({
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, Mcp-Protocol-Version",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      Vary: "Origin, Authorization",
    });
    return res.sendStatus(204);
  });

  app.all(MCP_ENDPOINT_PATH, async (req: Request, res: Response) => {
    res.set("Vary", "Authorization");
    const token = parseBearerToken(req.header("authorization"));
    try {
      if (!token || !(await isValidMcpAccessToken(token))) {
        res.set(
          "WWW-Authenticate",
          `Bearer resource_metadata="${mcpProtectedResourceMetadataUrl()}"`
        );
        return res.status(401).json({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message: "SavvyOS MCP authorization is required.",
          },
          id: null,
        });
      }
      if (req.method !== "POST") return sendMethodNotAllowed(res);

      const server = await buildReadOnlyMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.once("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      console.error("[ReadOnlyMcp] Request failed:", error);
      if (!res.headersSent) {
        return res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "SavvyOS MCP could not complete the request.",
          },
          id: null,
        });
      }
    }
  });
}

export const __testables__ = {
  isSensitiveFieldName,
  validateReadOnlySql,
  parseBearerToken,
};
