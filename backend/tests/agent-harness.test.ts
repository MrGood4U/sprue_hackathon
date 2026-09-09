import assert from "node:assert/strict";
import test from "node:test";
import {ConfigError, parseConfig} from "../src/app/config.js";
import {
  AgentHarness,
  AgentModelRequestError,
  createMockStageOutput,
  createAgentModel,
  HarnessCompileError,
  RemoteAgentModel,
  testOpenAICompatibleModel,
} from "../src/modules/agent/harness/index.js";
import type {AgentModelPort, AgentModelRequest, HarnessRequest} from "../src/modules/agent/harness/index.js";
import type {SourceInput} from "../src/modules/dag/runtime.js";
import {jsonSchemaForStage} from "../src/modules/agent/harness/schemas.js";

const baseEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:local-only@127.0.0.1:1/test",
  REDIS_URL: "redis://127.0.0.1:1",
  API_BASE_URL: "http://127.0.0.1:3001",
  CONSOLE_PUBLIC_URL: "http://127.0.0.1:4173",
  DATA_PUBLIC_BASE_URL: "http://127.0.0.1:3001/data/v1",
  CORS_ALLOWED_ORIGINS: "http://127.0.0.1:4173",
} as const;

const mapping = {
  wallet: "account.id",
  tradeId: "id",
  pool: "pool.id",
  timestamp: "timestamp",
  amountInUsd: "amountInUSD",
  amountOutUsd: "amountOutUSD",
  tokenIn: "tokenIn.id",
  tokenOut: "tokenOut.id",
} as const;

const wallet = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const pool = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const tokenIn = "0xcccccccccccccccccccccccccccccccccccccccc";
const tokenOut = "0xdddddddddddddddddddddddddddddddddddddddd";

function source(sourceKey: string, chain: string, id: string, timestamp: string, volume: string): SourceInput {
  return {
    schema: {
      sourceKey,
      chain,
      dataNetwork: chain === "ethereum" ? "eip155:1" : "eip155:42161",
      subgraphId: `${sourceKey}-subgraph`,
      deploymentId: `${sourceKey}-deployment`,
      sourceSnapshotId: chain === "ethereum"
        ? "40000000-0000-4000-8000-000000000020"
        : "40000000-0000-4000-8000-000000000021",
      queryEntity: "swaps",
      schemaHash: `${sourceKey}-schema-v1`,
      fieldTypes: {
        id: "id",
        "account.id": "address",
        "pool.id": "address",
        timestamp: "timestamp",
        amountInUSD: "decimal",
        amountOutUSD: "decimal",
        "tokenIn.id": "address",
        "tokenOut.id": "address",
      },
    },
    mapping: {sourceKey, chain, fields: mapping},
    rows: [{
      id,
      account: {id: wallet},
      pool: {id: pool},
      timestamp,
      amountInUSD: volume,
      amountOutUSD: volume,
      tokenIn: {id: tokenIn},
      tokenOut: {id: tokenOut},
    }],
  };
}

function harnessRequest(): HarnessRequest {
  return {
    intent: "Find wallets that traded on both Ethereum and Arbitrum during the last 30 complete UTC days.",
    sources: [
      source("uniswap-v3-ethereum", "ethereum", "eth-1", "100", "1.25"),
      source("uniswap-v3-arbitrum", "arbitrum", "arb-1", "200", "2.50"),
    ],
    accessSelections: [
      {sourceKey: "uniswap-v3-ethereum", mode: "x402", spendingPolicyId: "policy-eth", gatewayEnvironment: "mainnet"},
      {sourceKey: "uniswap-v3-arbitrum", mode: "x402", spendingPolicyId: "policy-arb", gatewayEnvironment: "mainnet"},
    ],
    executionWindow: {startInclusive: "100", endExclusive: "301"},
  };
}

test("agent configuration supports mock and remote credentials without exposing them publicly", () => {
  const mock = parseConfig({...baseEnvironment, AGENT_MODE: "mock", AGENT_MODEL: "test-mock"});
  assert.deepEqual(mock.agent, {
    mode: "mock",
    apiUrl: null,
    apiKey: null,
    model: "test-mock",
    timeoutMs: 600000,
    runTimeoutMs: 3600000,
    debug: false,
  });
  assert.deepEqual(mock.graph, {gatewayEnvironment: "mainnet"});
  assert.throws(() => parseConfig({...baseEnvironment, GRAPH_GATEWAY_ENVIRONMENT: "testnet"}), ConfigError);
  assert.equal(parseConfig({...baseEnvironment, AGENT_DEBUG: "true"}).agent.debug, true);
  assert.throws(() => parseConfig({...baseEnvironment, AGENT_DEBUG: "yes"}), ConfigError);

  const remote = parseConfig({...baseEnvironment, AGENT_MODE: "remote", AGENT_API_URL: "https://agent.example/v1", AGENT_API_KEY: "server-only-key", AGENT_MODEL: "test-model", AGENT_TIMEOUT_MS: "5000"});
  assert.equal(remote.agent.apiUrl, "https://agent.example/v1");
  assert.equal(remote.agent.apiKey, "server-only-key");
  assert.equal(remote.agent.timeoutMs, 5000);
  assert.equal(remote.agent.runTimeoutMs, 3600000);
  assert.throws(() => parseConfig({...baseEnvironment, AGENT_TIMEOUT_MS: "1800001"}), ConfigError);
  assert.throws(() => parseConfig({...baseEnvironment, AGENT_TIMEOUT_MS: "600000", AGENT_RUN_TIMEOUT_MS: "599999"}), ConfigError);
  assert.throws(() => parseConfig({...baseEnvironment, AGENT_MODE: "remote", AGENT_API_URL: "https://agent.example/v1"}), (error: unknown) => error instanceof ConfigError && error.fields.includes("AGENT_API_KEY"));
});

test("mock Agent harness executes the non-model cross-chain flow", async () => {
  const config = parseConfig({...baseEnvironment, AGENT_MODE: "mock", AGENT_MODEL: "sprue-mock-planner"});
  const model = createAgentModel(config.agent);
  const harness = new AgentHarness(model);
  const result = await harness.run(harnessRequest());

  assert.equal(result.model.provider, "mock");
  assert.equal(result.model.calls, 3);
  assert.equal(result.proposal.specification.schemaVersion, 2);
  assert.equal(result.proposal.specification.sources.length, 2);
  assert.equal(result.proposal.builder.nodes.length, 9);
  assert.equal(result.execution.unionRows.length, 2);
  assert.equal(result.execution.crossChain.length, 1);
  assert.equal(result.execution.crossChain[0]!.combinedTradeCount, 2);
  assert.equal(result.execution.crossChain[0]!.combinedVolumeUsd, "3.75");
  assert.deepEqual(result.trace.map((event) => event.stage), [
    "admit",
    "semantic_interpretation", "semantic_interpretation",
    "source_needs",
    "source_selection", "source_selection",
    "query_compilation",
    "dag_composition", "dag_composition",
    "spec_assembly", "spec_assembly",
    "spec_validation",
    "dag_execution", "dag_execution",
    "output",
  ]);
});

test("semantic clarification stops planning after the first model call", async () => {
  const stages: string[] = [];
  const model: AgentModelPort = {
    async complete(request) {
      stages.push(request.stage);
      return {
        provider: "mock",
        model: "clarification-test",
        output: {
          schemaVersion: 1,
          kind: "clarification",
          questions: [{code: "missing_window", question: "Which complete UTC window should be used?"}],
        },
      };
    },
  };

  const result = await new AgentHarness(model).plan(harnessRequest());
  assert.equal(result.kind, "clarification");
  assert.deepEqual(stages, ["semantic_interpretation"]);
  assert.equal(result.model.calls, 1);
});

test("source selection rejects a model-invented Subgraph candidate", async () => {
  const model: AgentModelPort = {
    async complete(request: AgentModelRequest) {
      const output = createMockStageOutput(request);
      if (request.stage !== "source_selection") {
        return {provider: "mock", model: "candidate-boundary-test", output};
      }
      const selection = output as {
        schemaVersion: 1;
        kind: "source_selection";
        selections: Array<Record<string, unknown>>;
        assumptions: string[];
      };
      return {
        provider: "mock",
        model: "candidate-boundary-test",
        output: {
          ...selection,
          selections: selection.selections.map((item, index) => index === 0
            ? {...item, candidateRef: "candidate:model-invented-subgraph"}
            : item),
        },
      };
    },
  };

  await assert.rejects(
    () => new AgentHarness(model).plan(harnessRequest()),
    (error: unknown) => error instanceof HarnessCompileError && error.code === "SOURCE_CANDIDATE_REFERENCE_INVALID",
  );
});

test("remote Agent model sends an OpenAI-compatible request and parses the bounded proposal", async () => {
  const config = parseConfig({...baseEnvironment, AGENT_MODE: "remote", AGENT_API_URL: "https://agent.example/v1", AGENT_API_KEY: "server-only-key"});
  let observedBody: Record<string, unknown> | undefined;
  const request = {
    stage: "semantic_interpretation" as const,
    promptVersion: "1" as const,
    intent: "Find cross-chain traders.",
    availableNetworks: [
      {dataNetwork: "eip155:1", label: "ethereum"},
      {dataNetwork: "eip155:42161", label: "arbitrum"},
    ],
  };
  const model = new RemoteAgentModel(config.agent, async (_url, options) => {
    assert.equal(options?.method, "POST");
    assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer server-only-key");
    observedBody = JSON.parse(String(options?.body));
    return Response.json({
      choices: [{message: {content: null, tool_calls: [{
        type: "function",
        function: {
          name: "submit_sprue_plan",
          arguments: JSON.stringify({result: createMockStageOutput(request)}),
        },
      }]}}],
    });
  });
  const result = await model.complete(request);
  assert.equal(observedBody?.model, config.agent.model);
  assert.equal(observedBody?.max_tokens, 16384);
  const observedTool = (observedBody?.tools as Array<{function: {name: string; parameters: Record<string, unknown>}}>)[0];
  assert.equal(observedTool?.function.name, "submit_sprue_plan");
  assert.equal(observedTool?.function.parameters.type, "object");
  assert.equal("oneOf" in observedTool!.function.parameters, false);
  const observedParameters = JSON.stringify(observedTool?.function.parameters);
  for (const unsupportedKeyword of ['"const"', '"minLength"', '"maxLength"', '"minItems"', '"maxItems"', '"additionalItems"']) {
    assert.equal(observedParameters.includes(unsupportedKeyword), false);
  }
  assert.equal(observedParameters.includes('"additionalProperties":{}'), false);
  assert.equal(JSON.stringify(observedTool?.function.parameters).includes('"anyOf"'), true);
  assert.deepEqual(observedBody?.tool_choice, {type: "function", function: {name: "submit_sprue_plan"}});
  assert.equal(JSON.stringify((observedBody?.tools as unknown[])[0]).includes("semantic_plan"), true);
  assert.equal(JSON.stringify(observedBody).includes("server-only-key"), false);
  assert.equal(result.provider, "remote");
  assert.equal((result.output as {kind: string}).kind, "semantic_plan");
});

test("remote Agent model uses DeepSeek Responses Structured Outputs", async () => {
  const config = parseConfig({...baseEnvironment, AGENT_MODE: "remote", AGENT_API_URL: "https://api.deepseek.com/chat/completions", AGENT_API_KEY: "server-only-key", AGENT_MODEL: "deepseek-v4-pro"});
  let observedUrl = "";
  let observedBody: Record<string, unknown> | undefined;
  const request = {
    stage: "semantic_interpretation" as const,
    promptVersion: "1" as const,
    intent: "Find cross-chain traders.",
    availableNetworks: [{dataNetwork: "eip155:1", label: "ethereum"}],
  };
  const model = new RemoteAgentModel(config.agent, async (url, options) => {
    observedUrl = String(url);
    observedBody = JSON.parse(String(options?.body));
    const text = JSON.stringify({result: createMockStageOutput(request)});
    return Response.json({
      status: "completed",
      output: [
        {type: "reasoning", id: "reasoning-1", summary: []},
        {type: "message", id: "message-1", role: "assistant", content: [{type: "output_text", text}]},
      ],
    });
  });
  const result = await model.complete(request);
  assert.equal(observedUrl, "https://api.deepseek.com/responses");
  assert.equal(observedBody?.model, "deepseek-v4-pro");
  assert.equal(typeof observedBody?.instructions, "string");
  assert.equal(String(observedBody?.instructions).includes("submit_sprue_plan function"), false);
  assert.equal(typeof observedBody?.input, "string");
  assert.deepEqual(observedBody?.reasoning, {effort: "low"});
  assert.equal(observedBody?.max_output_tokens, 16384);
  assert.equal("tools" in (observedBody ?? {}), false);
  assert.equal("tool_choice" in (observedBody ?? {}), false);
  const textFormat = (observedBody?.text as {format: {type: string; name: string; schema: Record<string, unknown>}}).format;
  assert.equal(textFormat.type, "json_schema");
  assert.equal(textFormat.name, "sprue_plan");
  assert.equal(textFormat.schema.type, "object");
  assert.equal(JSON.stringify(observedBody).includes("server-only-key"), false);
  assert.equal(result.provider, "remote");
  assert.equal((result.output as {kind: string}).kind, "semantic_plan");
});

test("DeepSeek incomplete structured responses are classified without retaining provider content", async () => {
  const config = parseConfig({...baseEnvironment, AGENT_MODE: "remote", AGENT_API_URL: "https://api.deepseek.com/chat/completions", AGENT_API_KEY: "server-only-key", AGENT_MODEL: "deepseek-v4-pro"});
  const model = new RemoteAgentModel(config.agent, async () => Response.json({
    status: "incomplete",
    incomplete_details: {reason: "max_output_tokens"},
    output: [{type: "reasoning", summary: [{text: "private reasoning"}]}],
  }));

  await assert.rejects(
    () => model.complete({
      stage: "semantic_interpretation",
      promptVersion: "1",
      intent: "Find cross-chain traders.",
      availableNetworks: [{dataNetwork: "eip155:1", label: "ethereum"}],
    }),
    (error: unknown) => error instanceof AgentModelRequestError
      && error.reason === "incomplete_response"
      && error.providerCode === "max_output_tokens"
      && error.message.includes("max_output_tokens")
      && !error.message.includes("private reasoning"),
  );
});

test("remote Agent model rejects ordinary content when the forced planning tool call is absent", async () => {
  const config = parseConfig({...baseEnvironment, AGENT_MODE: "remote", AGENT_API_URL: "https://agent.example/v1", AGENT_API_KEY: "server-only-key"});
  const model = new RemoteAgentModel(config.agent, async () => Response.json({
    choices: [{message: {content: "{\"schemaVersion\":1}"}}],
  }));

  await assert.rejects(
    () => model.complete({
      stage: "semantic_interpretation",
      promptVersion: "1",
      intent: "Find cross-chain traders.",
      availableNetworks: [{dataNetwork: "eip155:1", label: "ethereum"}],
    }),
    (error: unknown) => error instanceof AgentModelRequestError && error.reason === "missing_tool_call",
  );
});

test("every planning tool schema stays inside the DeepSeek-compatible JSON Schema subset", () => {
  for (const stage of [
    "source_discovery_planning",
    "source_entity_selection",
    "source_feasibility",
    "semantic_interpretation",
    "source_selection",
    "dag_composition",
  ] as const) {
    const schema = jsonSchemaForStage(stage);
    const serialized = JSON.stringify(schema);
    assert.equal(schema.type, "object");
    assert.equal(Array.isArray(schema.required) && schema.required.includes("result"), true);
    for (const unsupportedKeyword of ['"oneOf"', '"const"', '"minLength"', '"maxLength"', '"minItems"', '"maxItems"', '"additionalItems"']) {
      assert.equal(serialized.includes(unsupportedKeyword), false, `${stage} includes ${unsupportedKeyword}`);
    }
    assert.equal(serialized.includes('"additionalProperties":{}'), false);
  }
  const feasibilitySchema = JSON.stringify(jsonSchemaForStage("source_feasibility"));
  assert.equal(feasibilitySchema.includes('"propertyNames"'), false);
  assert.equal(feasibilitySchema.includes('"auxiliaryFieldBindings"'), true);
  assert.equal(feasibilitySchema.includes('"purpose"'), true);
  for (const operator of ["filter", "map", "aggregate", "union", "join", "output"]) {
    assert.equal(feasibilitySchema.includes(`\"${operator}\"`), true, `source feasibility omits ${operator}`);
  }
  assert.equal(feasibilitySchema.includes('"$ref"'), true, "typed recursive expressions must remain schema-constrained");
});

test("remote Agent model classifies its bounded request timeout", async () => {
  const config = parseConfig({...baseEnvironment, AGENT_MODE: "remote", AGENT_API_URL: "https://agent.example/v1", AGENT_API_KEY: "server-only-key"});
  const model = new RemoteAgentModel({...config.agent, timeoutMs: 15}, async (_url, options) => {
    await new Promise<never>((_resolve, reject) => {
      const keepAlive = setTimeout(() => reject(new Error("timeout signal was not delivered")), 1000);
      options?.signal?.addEventListener("abort", () => {
        clearTimeout(keepAlive);
        reject(options.signal?.reason);
      }, {once: true});
    });
    throw new Error("unreachable");
  });

  await assert.rejects(
    () => model.complete({
      stage: "semantic_interpretation",
      promptVersion: "1",
      intent: "Find cross-chain traders.",
      availableNetworks: [{dataNetwork: "eip155:1", label: "ethereum"}],
    }),
    (error: unknown) => error instanceof AgentModelRequestError
      && error.reason === "timeout"
      && error.status === null
      && error.message.includes("15 ms"),
  );
});

test("remote Agent model records only safe provider error identifiers", async () => {
  const config = parseConfig({...baseEnvironment, AGENT_MODE: "remote", AGENT_API_URL: "https://agent.example.com/v1", AGENT_API_KEY: "server-only-key"});
  const model = new RemoteAgentModel(config.agent, async () => Response.json({
    error: {
      type: "invalid_request_error",
      code: "invalid_tool_schema",
      param: "tools[0].function.parameters",
      message: "untrusted provider detail must not be retained",
    },
  }, {status: 400}));

  await assert.rejects(
    () => model.complete({
      stage: "semantic_interpretation",
      promptVersion: "1",
      intent: "Find cross-chain traders.",
      availableNetworks: [{dataNetwork: "eip155:1", label: "ethereum"}],
    }),
    (error: unknown) => error instanceof AgentModelRequestError
      && error.reason === "http_error"
      && error.status === 400
      && error.providerCode === "invalid_tool_schema"
      && error.providerParam === "tools[0].function.parameters"
      && !error.message.includes("untrusted provider detail"),
  );
});

test("model connection testing sends one minimal request and returns no provider content", async () => {
  const config = parseConfig({...baseEnvironment, AGENT_MODE: "remote", AGENT_API_URL: "https://api.openai.com/v1/chat/completions", AGENT_API_KEY: "server-only-key", AGENT_MODEL: "gpt-5.6-sol"});
  let observedBody: Record<string, unknown> | undefined;
  const result = await testOpenAICompatibleModel(config.agent, async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/chat/completions");
    assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer server-only-key");
    observedBody = JSON.parse(String(options?.body));
    return Response.json({choices: [{message: {content: "OK"}}]});
  });
  assert.equal(observedBody?.model, "gpt-5.6-sol");
  assert.deepEqual(observedBody?.messages, [
    {role: "system", content: "This is a connectivity check. Reply with exactly OK and nothing else."},
    {role: "user", content: "OK"},
  ]);
  assert.equal("tools" in (observedBody ?? {}), false);
  assert.equal("tool_choice" in (observedBody ?? {}), false);
  assert.equal(result.available, true);
  assert.equal(result.model, "gpt-5.6-sol");
  assert.equal(result.latencyMs >= 0, true);
  assert.equal(JSON.stringify(result).includes("server-only-key"), false);
  assert.equal(JSON.stringify(result).includes("OK"), false);
});
