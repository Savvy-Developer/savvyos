import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?:
      | "audio/mpeg"
      | "audio/wav"
      | "application/pdf"
      | "audio/mp4"
      | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  /** Optional explicit model. Existing call sites retain the legacy default. */
  model?: string;
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  /** OpenAI GPT-5-series reasoning control, forwarded unchanged to the proxy. */
  reasoning?: { effort: "minimal" | "low" | "medium" | "high" };
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveApiUrl = () => {
  // Never silently fall back to api.openai.com. SavvyOS is configured to use
  // the Manus OpenAI-compatible proxy, which keeps application AI usage on
  // the intended provider and avoids a separate OpenAI billing dependency.
  const configuredBase =
    ENV.forgeApiUrl ||
    process.env.OPENAI_API_BASE ||
    "https://api.manus.im/api/llm-proxy/v1";
  // Forge deployments conventionally provide the service root, whereas standard
  // OpenAI-compatible environment variables commonly already end in `/v1`.
  // Support both forms without generating a `/v1/v1/...` request URL.
  const base = configuredBase.replace(/\/$/, "");
  return base.endsWith("/v1")
    ? `${base}/chat/completions`
    : `${base}/v1/chat/completions`;
};

const getApiKey = () => ENV.forgeApiKey || ENV.openaiApiKey;

const assertApiKey = () => {
  if (!getApiKey()) {
    throw new Error("AI proxy credentials are not configured");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

export const DEFAULT_LLM_MODEL = "gpt-5-mini";

const LEGACY_MODEL_ALIASES: Record<string, string> = {
  "gpt-4o": DEFAULT_LLM_MODEL,
  "gpt-4o-mini": DEFAULT_LLM_MODEL,
};

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 45_000;

const isBillingOrQuotaError = (message: string | null) =>
  Boolean(
    message &&
      /\b(no credits remaining|add credits|billing|quota|insufficient[_ ](?:quota|funds)|exceeded your current quota)\b/i.test(
        message
      )
  );

export function resolveLlmModel(model?: string): string {
  const requestedModel = model?.trim();
  if (!requestedModel) return DEFAULT_LLM_MODEL;
  return LEGACY_MODEL_ALIASES[requestedModel] ?? requestedModel;
}

const sleep = (durationMs: number) =>
  new Promise<void>(resolve => setTimeout(resolve, durationMs));

const readProviderError = (body: unknown): string | null => {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  if (typeof value.error === "string") return value.error;
  if (value.error && typeof value.error === "object") {
    const nested = value.error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
  }
  if (typeof value.message === "string") return value.message;
  return null;
};

const isInvokeResult = (value: unknown): value is InvokeResult => {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return Array.isArray(result.choices);
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    model,
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    reasoning,
  } = params;
  const resolvedModel = resolveLlmModel(model);

  const payload: Record<string, unknown> = {
    model: resolvedModel,
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  const maxTokens = params.maxTokens ?? params.max_tokens ?? 4096;
  payload[
    resolvedModel.startsWith("gpt-") || resolvedModel.startsWith("o")
      ? "max_completion_tokens"
      : "max_tokens"
  ] = maxTokens;

  // GPT-5 models use the OpenAI-compatible `reasoning` object. Preserve the
  // legacy `reasoning_effort` shape for o-series callers until they migrate.
  if (reasoning?.effort && resolvedModel.startsWith("gpt-5")) {
    payload.reasoning = reasoning;
  } else if (
    reasoning?.effort &&
    (resolvedModel.startsWith("o1") ||
      resolvedModel.startsWith("o3") ||
      resolvedModel.startsWith("o-"))
  ) {
    payload.reasoning_effort = reasoning.effort;
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(resolveApiUrl(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const responseText = await response.text();
      let body: unknown = null;
      try {
        body = responseText ? JSON.parse(responseText) : null;
      } catch {
        body = responseText;
      }

      if (!response.ok) {
        const providerError = readProviderError(body) ?? responseText;
        const error = new Error(
          `LLM invoke failed: ${response.status} ${response.statusText} – ${providerError}`
        );
        // A 429 can mean transient rate limiting or a terminal billing/quota
        // failure. Retrying the latter only delays fallbacks and user actions.
        if (
          attempt < MAX_ATTEMPTS &&
          RETRYABLE_STATUSES.has(response.status) &&
          !isBillingOrQuotaError(providerError)
        ) {
          await sleep(250 * 2 ** (attempt - 1));
          continue;
        }
        throw error;
      }

      if (!isInvokeResult(body)) {
        throw new Error(
          `LLM provider returned an invalid completion – ${readProviderError(body) ?? "missing choices array"}`
        );
      }

      return body;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isKnownProviderError =
        lastError.message.startsWith("LLM invoke failed:") ||
        lastError.message.startsWith(
          "LLM provider returned an invalid completion"
        );
      if (attempt < MAX_ATTEMPTS && !isKnownProviderError) {
        await sleep(250 * 2 ** (attempt - 1));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("LLM invoke failed after retries");
}
