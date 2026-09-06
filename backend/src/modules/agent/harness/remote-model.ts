import type {
  AgentModelConfig,
  AgentModelPort,
  AgentModelRequest,
  AgentModelResponse,
} from "./types.js";

const responseLimitBytes = 1_048_576;

const systemPrompt = `You are the Sprue data-product planner. Return one JSON object and no markdown.

Build a bounded proposal with this exact top-level shape:
{
  "schemaVersion": 1,
  "kind": "proposal",
  "intentSummary": "string",
  "window": {"kind": "complete_utc_days", "days": 30},
  "sources": [{"sourceKey": "string", "chain": "string", "mapping": {"wallet": "field.path", "tradeId": "field.path", "pool": "field.path", "timestamp": "field.path", "amountInUsd": "field.path", "amountOutUsd": "field.path", "tokenIn": "field.path", "tokenOut": "field.path"}}],
  "dag": {"nodes": [{"id": "string", "type": "source|filter|map|aggregate|union|join|output", "operatorVersion": "1", "config": {}}], "edges": [{"fromNode": "string", "fromPort": "string", "toNode": "string", "toPort": "string"}]},
  "outputSchema": {"fields": [{"name": "string", "type": "string"}]},
  "assumptions": ["string"],
  "blockers": ["string"]
}

Use exactly the supplied sources and only their supplied field paths. For this bounded cross-chain demo, map each source to the eight canonical fields, aggregate each chain by wallet, union normalized activity, inner-join the per-chain aggregates on wallet, and expose one output with crossChain and allActivity views. Use no executable code and no operator outside the allowlist.`;

export class AgentModelRequestError extends Error {
  readonly code = "AGENT_MODEL_REQUEST_FAILED";

  constructor(message = "The configured Agent model request failed") {
    super(message);
    this.name = "AgentModelRequestError";
  }
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > responseLimitBytes) {
    throw new AgentModelRequestError("The Agent model response exceeded the size limit");
  }
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > responseLimitBytes) {
    throw new AgentModelRequestError("The Agent model response exceeded the size limit");
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
    throw new AgentModelRequestError("The Agent model did not return valid JSON");
  }
}

export class RemoteAgentModel implements AgentModelPort {
  constructor(
    private readonly config: AgentModelConfig,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  async complete(request: AgentModelRequest, signal?: AbortSignal): Promise<AgentModelResponse> {
    if (!this.config.apiUrl || !this.config.apiKey) throw new AgentModelRequestError();
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(this.config.timeoutMs)])
      : AbortSignal.timeout(this.config.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.config.apiUrl, {
        method: "POST",
        redirect: "error",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {role: "system", content: systemPrompt},
            {role: "user", content: JSON.stringify(request)},
          ],
        }),
        signal: requestSignal,
      });
    } catch {
      throw new AgentModelRequestError();
    }
    if (!response.ok) throw new AgentModelRequestError(`The Agent model returned HTTP ${response.status}`);
    let envelope: unknown;
    try {
      envelope = JSON.parse(await readBoundedBody(response));
    } catch (error) {
      if (error instanceof AgentModelRequestError) throw error;
      throw new AgentModelRequestError("The Agent model returned an invalid response envelope");
    }
    const content = (envelope as {choices?: {message?: {content?: unknown}}[]})?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new AgentModelRequestError("The Agent model response did not include message content");
    return {
      provider: "remote",
      model: this.config.model,
      output: parseJsonContent(content),
    };
  }
}
