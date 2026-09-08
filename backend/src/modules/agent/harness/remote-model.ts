import type {
  AgentModelConfig,
  AgentModelPort,
  AgentModelRequest,
  AgentModelResponse,
} from "./types.js";
import {promptForStage, promptForStructuredStage} from "./prompts.js";
import {jsonSchemaForStage} from "./schemas.js";

const responseLimitBytes = 1_048_576;

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

export interface AgentModelConnectionTestResult {
  available: true;
  protocol: "openai_compatible_chat_completions";
  model: string;
  latencyMs: number;
}

export type AgentModelFailureReason =
  | "configuration"
  | "timeout"
  | "cancelled"
  | "connection"
  | "http_error"
  | "response_too_large"
  | "invalid_envelope"
  | "incomplete_response"
  | "missing_content"
  | "missing_tool_call"
  | "invalid_json"
  | "unexpected";

export class AgentModelRequestError extends Error {
  readonly code = "AGENT_MODEL_REQUEST_FAILED";

  constructor(
    message = "The configured Agent model request failed",
    readonly reason: AgentModelFailureReason = "unexpected",
    readonly status: number | null = null,
    readonly providerCode: string | null = null,
    readonly providerParam: string | null = null,
  ) {
    super(message);
    this.name = "AgentModelRequestError";
  }
}

function safeProviderError(body: string): {code: string | null; param: string | null} {
  try {
    const error = (JSON.parse(body) as {error?: {code?: unknown; type?: unknown; param?: unknown}})?.error;
    const token = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_.\[\]-]{1,160}$/.test(value)
      ? value
      : null;
    return {code: token(error?.code) ?? token(error?.type), param: token(error?.param)};
  } catch {
    return {code: null, param: null};
  }
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > responseLimitBytes) {
    throw new AgentModelRequestError("The Agent model response exceeded the size limit", "response_too_large");
  }
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > responseLimitBytes) {
    throw new AgentModelRequestError("The Agent model response exceeded the size limit", "response_too_large");
  }
  return body;
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  try {
    return JSON.parse(withoutFence);
  } catch {
    throw new AgentModelRequestError("The Agent model did not return valid JSON", "invalid_json");
  }
}

async function requestChatCompletion(
  config: AgentModelConfig,
  messages: readonly ChatMessage[],
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
  tool?: {name: string; parameters: Readonly<Record<string, unknown>>},
  toolChoice?: {type: "function"; function: {name: string}},
): Promise<unknown> {
  if (config.mode !== "remote" || !config.apiUrl || !config.apiKey) {
    throw new AgentModelRequestError("The configured Agent model request failed", "configuration");
  }
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)])
    : AbortSignal.timeout(config.timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(config.apiUrl, {
      method: "POST",
      redirect: "error",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        ...(tool ? {
          max_tokens: 4096,
          tools: [{
            type: "function",
            function: {
              name: tool.name,
              description: "Submit the complete bounded Sprue planning-stage result.",
              parameters: tool.parameters,
            },
          }],
          ...(toolChoice ? {tool_choice: toolChoice} : {}),
        } : {}),
      }),
      signal: requestSignal,
    });
  } catch {
    const cancelledByCaller = Boolean(signal?.aborted);
    const timedOut = requestSignal.aborted && !cancelledByCaller;
    if (timedOut) {
      throw new AgentModelRequestError(
        `The Agent model request timed out after ${config.timeoutMs} ms`,
        "timeout",
      );
    }
    throw new AgentModelRequestError(
      "The configured Agent model request failed",
      cancelledByCaller ? "cancelled" : "connection",
    );
  }
  if (!response.ok) {
    let detail = {code: null as string | null, param: null as string | null};
    try { detail = safeProviderError(await readBoundedBody(response)); } catch {}
    throw new AgentModelRequestError(
      `The Agent model returned HTTP ${response.status}`,
      "http_error",
      response.status,
      detail.code,
      detail.param,
    );
  }
  try {
    return JSON.parse(await readBoundedBody(response));
  } catch (error) {
    if (error instanceof AgentModelRequestError) throw error;
    throw new AgentModelRequestError("The Agent model returned an invalid response envelope", "invalid_envelope");
  }
}

function deepSeekResponsesEndpoint(apiUrl: string): string | null {
  try {
    const url = new URL(apiUrl);
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "api.deepseek.com" && !hostname.endsWith(".api.deepseek.com")) return null;
    // The Model Service stores the provider's configured Chat Completions URL.
    // DeepSeek's Responses API is a sibling endpoint, so derive it without
    // accepting a caller-provided host or arbitrary path.
    url.pathname = "/responses";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

async function requestDeepSeekResponses(
  config: AgentModelConfig,
  request: AgentModelRequest,
  url: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<unknown> {
  if (config.mode !== "remote" || !config.apiUrl || !config.apiKey) {
    throw new AgentModelRequestError("The configured Agent model request failed", "configuration");
  }
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)])
    : AbortSignal.timeout(config.timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      redirect: "error",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        instructions: promptForStructuredStage(request.stage),
        input: JSON.stringify(request),
        // Keep real reasoning enabled while leaving enough bounded output
        // budget for the schema-constrained result. DeepSeek counts reasoning
        // tokens against max_output_tokens.
        reasoning: {effort: "low"},
        max_output_tokens: 8192,
        text: {
          format: {
            type: "json_schema",
            name: "sprue_plan",
            schema: jsonSchemaForStage(request.stage),
          },
        },
      }),
      signal: requestSignal,
    });
  } catch {
    const cancelledByCaller = Boolean(signal?.aborted);
    const timedOut = requestSignal.aborted && !cancelledByCaller;
    if (timedOut) {
      throw new AgentModelRequestError(
        `The Agent model request timed out after ${config.timeoutMs} ms`,
        "timeout",
      );
    }
    throw new AgentModelRequestError(
      "The configured Agent model request failed",
      cancelledByCaller ? "cancelled" : "connection",
    );
  }
  if (!response.ok) {
    let detail = {code: null as string | null, param: null as string | null};
    try { detail = safeProviderError(await readBoundedBody(response)); } catch {}
    throw new AgentModelRequestError(
      `The Agent model returned HTTP ${response.status}`,
      "http_error",
      response.status,
      detail.code,
      detail.param,
    );
  }
  try {
    return JSON.parse(await readBoundedBody(response));
  } catch (error) {
    if (error instanceof AgentModelRequestError) throw error;
    throw new AgentModelRequestError("The Agent model returned an invalid response envelope", "invalid_envelope");
  }
}

function messageContent(envelope: unknown): string {
  const content = (envelope as {choices?: {message?: {content?: unknown}}[]})?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new AgentModelRequestError("The Agent model response did not include message content", "missing_content");
  }
  return content;
}

function toolArguments(envelope: unknown, expectedName: string): string {
  const calls = (envelope as {
    choices?: {message?: {tool_calls?: {type?: unknown; function?: {name?: unknown; arguments?: unknown}}[]}}[];
  })?.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(calls) || calls.length !== 1) {
    throw new AgentModelRequestError("The Agent model response did not include the required tool call", "missing_tool_call");
  }
  const call = calls[0];
  if (
    call?.type !== "function" ||
    call.function?.name !== expectedName ||
    typeof call.function.arguments !== "string" ||
    call.function.arguments.trim().length === 0
  ) {
    throw new AgentModelRequestError("The Agent model response included an invalid tool call", "missing_tool_call");
  }
  return call.function.arguments;
}

function toolResult(envelope: unknown, expectedName: string): unknown {
  const parsed = parseJsonContent(toolArguments(envelope, expectedName));
  if (!parsed || typeof parsed !== "object" || !("result" in parsed)) {
    throw new AgentModelRequestError("The Agent model tool call did not include its result", "invalid_json");
  }
  return (parsed as {result: unknown}).result;
}

function structuredResult(envelope: unknown): unknown {
  const response = envelope as {
    status?: unknown;
    incomplete_details?: {reason?: unknown} | null;
    output?: unknown;
  };
  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason;
    const safeReason = typeof reason === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(reason)
      ? reason
      : null;
    const suffix = safeReason ? ` (${safeReason})` : "";
    throw new AgentModelRequestError(
      `The Agent model returned an incomplete structured response${suffix}`,
      "incomplete_response",
      null,
      safeReason,
    );
  }
  if (response.status !== "completed" || !Array.isArray(response.output)) {
    throw new AgentModelRequestError(
      "The Agent model returned an invalid structured response envelope",
      "invalid_envelope",
    );
  }
  const text = response.output
    .filter((item): item is {type?: unknown; content?: unknown} => Boolean(item && typeof item === "object"))
    .filter((item) => item.type === "message" && Array.isArray(item.content))
    .flatMap((item) => (item.content as unknown[])
      .filter((part): part is {type?: unknown; text?: unknown} => Boolean(part && typeof part === "object"))
      .filter((part) => part.type === "output_text" && typeof part.text === "string")
      .map((part) => part.text as string))
    .join("");
  if (!text.trim()) {
    throw new AgentModelRequestError(
      "The Agent model structured response did not include output text",
      "missing_content",
    );
  }
  const parsed = parseJsonContent(text);
  if (!parsed || typeof parsed !== "object" || !("result" in parsed)) {
    throw new AgentModelRequestError(
      "The Agent model structured response did not include its result",
      "invalid_json",
    );
  }
  return (parsed as {result: unknown}).result;
}

export async function testOpenAICompatibleModel(
  config: AgentModelConfig,
  fetchImpl: typeof fetch = globalThis.fetch,
  signal?: AbortSignal,
): Promise<AgentModelConnectionTestResult> {
  const startedAt = Date.now();
  const envelope = await requestChatCompletion(config, [
    {role: "system", content: "This is a connectivity check. Reply with exactly OK and nothing else."},
    {role: "user", content: "OK"},
  ], fetchImpl, signal);
  messageContent(envelope);
  return {
    available: true,
    protocol: "openai_compatible_chat_completions",
    model: config.model,
    latencyMs: Math.max(0, Date.now() - startedAt),
  };
}

export class RemoteAgentModel implements AgentModelPort {
  constructor(
    private readonly config: AgentModelConfig,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  async complete(request: AgentModelRequest, signal?: AbortSignal): Promise<AgentModelResponse> {
    const tool = {name: "submit_sprue_plan", parameters: jsonSchemaForStage(request.stage)};
    const responsesUrl = deepSeekResponsesEndpoint(this.config.apiUrl ?? "");
    if (responsesUrl) {
      const envelope = await requestDeepSeekResponses(
        this.config,
        request,
        responsesUrl,
        this.fetchImpl,
        signal,
      );
      return {
        provider: "remote",
        model: this.config.model,
        output: structuredResult(envelope),
      };
    }
    const toolChoice = {type: "function" as const, function: {name: tool.name}};
    const envelope = await requestChatCompletion(this.config, [
      {role: "system", content: promptForStage(request.stage)},
      {role: "user", content: JSON.stringify(request)},
    ], this.fetchImpl, signal, tool, toolChoice);
    return {
      provider: "remote",
      model: this.config.model,
      output: toolResult(envelope, tool.name),
    };
  }
}
