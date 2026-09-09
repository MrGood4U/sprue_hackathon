import assert from "node:assert/strict";
import test from "node:test";
import {ConfigError, parseConfig} from "../src/app/config.js";
import {
  AgentHarness,
  AgentModelRequestError,
  createMockStageOutput,
  createAgentModel,
  entityEmbeddingLimits,
  deriveDiscoverySourceNeeds,
  HarnessCompileError,
  RemoteEntityEmbeddingRanker,
  RemoteAgentModel,
  testOpenAICompatibleModel,
  validateFlexibleComposition,
} from "../src/modules/agent/harness/index.js";
import type {
  AgentModelPort,
  AgentModelRequest,
  DiscoverySemanticPlan,
  FlexibleCompositionIntent,
  HarnessRequest,
  SourceFeasibilitySelection,
} from "../src/modules/agent/harness/index.js";
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
  assert.deepEqual(mock.embedding, {
    enabled: false,
    apiUrl: null,
    apiKey: null,
    model: null,
    dimensions: null,
    timeoutMs: 600000,
  });
  const embedding = parseConfig({
    ...baseEnvironment,
    EMBEDDING_ENABLED: "true",
    EMBEDDING_API_URL: "https://dashscope.example/v1/embeddings",
    EMBEDDING_API_KEY: "embedding-key",
    EMBEDDING_MODEL: "text-embedding-v3",
    EMBEDDING_DIMENSIONS: "1024",
    EMBEDDING_TIMEOUT_MS: "5000",
  }).embedding;
  assert.deepEqual(embedding, {
    enabled: true,
    apiUrl: "https://dashscope.example/v1/embeddings",
    apiKey: "embedding-key",
    model: "text-embedding-v3",
    dimensions: 1024,
    timeoutMs: 5000,
  });
  assert.throws(
    () => parseConfig({...baseEnvironment, EMBEDDING_ENABLED: "true"}),
    (error: unknown) => error instanceof ConfigError && error.fields.includes("EMBEDDING_API_URL"),
  );
  assert.equal(parseConfig({
    ...baseEnvironment,
    EMBEDDING_ENABLED: "false",
    EMBEDDING_API_URL: "",
    EMBEDDING_API_KEY: "",
    EMBEDDING_MODEL: "",
  }).embedding.enabled, false);

  const remote = parseConfig({...baseEnvironment, AGENT_MODE: "remote", AGENT_API_URL: "https://agent.example/v1", AGENT_API_KEY: "server-only-key", AGENT_MODEL: "test-model", AGENT_TIMEOUT_MS: "5000"});
  assert.equal(remote.agent.apiUrl, "https://agent.example/v1");
  assert.equal(remote.agent.apiKey, "server-only-key");
  assert.equal(remote.agent.timeoutMs, 5000);
  assert.equal(remote.agent.runTimeoutMs, 3600000);
  assert.throws(() => parseConfig({...baseEnvironment, AGENT_TIMEOUT_MS: "1800001"}), ConfigError);
  assert.throws(() => parseConfig({...baseEnvironment, AGENT_TIMEOUT_MS: "600000", AGENT_RUN_TIMEOUT_MS: "599999"}), ConfigError);
  assert.throws(() => parseConfig({...baseEnvironment, AGENT_MODE: "remote", AGENT_API_URL: "https://agent.example/v1"}), (error: unknown) => error instanceof ConfigError && error.fields.includes("AGENT_API_KEY"));
});

test("embedding retrieval ranks inspected entity schemas without returning field arrays to the selector", async () => {
  const bodies: unknown[] = [];
  const progress: string[] = [];
  const ranker = new RemoteEntityEmbeddingRanker({
    enabled: true,
    apiUrl: "https://dashscope.example/v1/embeddings",
    apiKey: "server-only-embedding-key",
    model: "text-embedding-v3",
    dimensions: 1024,
    timeoutMs: 5000,
  }, async (_url, options) => {
    const body = JSON.parse(String(options?.body)) as {input: string[]};
    bodies.push(body);
    return Response.json({
      data: body.input.map((text, index) => ({
        index,
        embedding: text.includes("Swap") || text.includes("amountUSD") || text.startsWith("Find the existing")
          ? [1, 0]
          : [0, 1],
      })),
    });
  });
  const need = {
    id: "ethereum_swaps",
    dataNetwork: "eip155:1",
    protocol: {name: "Uniswap", version: "V3"},
    assets: [{symbol: "WETH", networkAssetId: null}, {symbol: "USDC", networkAssetId: null}],
    description: "One row per WETH/USDC swap",
    grain: "swap event",
    fields: [{
      id: "volume_usd",
      description: "USD value of this swap",
      expectedType: "decimal" as const,
      unit: "USD",
      required: true,
      allowNullable: false,
      hints: ["amountUSD"],
    }],
    constraints: ["Uniswap swaps only"],
  };
  const entity = (queryEntity: string, entityType: string, path: string) => ({
    queryEntity,
    entityType,
    fields: [{path, graphType: "BigDecimal", valueType: "decimal" as const, nullable: false, list: false}],
    suggestedBindings: [],
    matchedRequirements: [],
    grainHint: "unknown" as const,
  });
  const scores = await ranker.rank(need, [
    {candidateRef: "graph:one", displayName: "Uniswap", entity: entity("swaps", "Swap", "amountUSD")},
    {candidateRef: "graph:two", displayName: "Unrelated", entity: entity("positions", "Position", "liquidity")},
  ], undefined, (event) => progress.push(event.phase));
  assert.equal(bodies.length, 1);
  assert.equal((bodies[0] as {input: string[]}).input.length, 3);
  assert.match((bodies[0] as {input: string[]}).input[1]!, /amountUSD:BigDecimal/);
  assert.equal(scores[0]?.similarity, 1);
  assert.equal(scores[1]?.similarity, 0);
  assert.deepEqual(progress, ["batch_started", "batch_completed", "similarity_started", "completed"]);
});

test("embedding retrieval truncates every source and entity document to a safe UTF-8 byte budget", async () => {
  let suppliedInputs: string[] = [];
  const ranker = new RemoteEntityEmbeddingRanker({
    enabled: true,
    apiUrl: "https://dashscope.example/v1/embeddings",
    apiKey: "server-only-embedding-key",
    model: "text-embedding-v3",
    dimensions: 1024,
    timeoutMs: 5000,
  }, async (_url, options) => {
    const body = JSON.parse(String(options?.body)) as {input: string[]};
    suppliedInputs = body.input;
    return Response.json({
      data: body.input.map((_text, index) => ({index, embedding: [1, 0]})),
    });
  });
  const longText = "schema requirement ".repeat(55);
  const requirementFields = Array.from({length: 32}, (_, index) => ({
    id: `field_${index}`,
    description: longText,
    expectedType: "string" as const,
    unit: null,
    required: index < 4,
    allowNullable: false,
    hints: [`field_${index}`],
  }));
  const entityFields = [
    {path: "amountUSD", graphType: "BigDecimal", valueType: "decimal" as const, nullable: false, list: false},
    ...Array.from({length: 700}, (_, index) => ({
      path: `relationship_${index}.verboseProviderField_${index}`,
      graphType: "BigDecimal",
      valueType: "decimal" as const,
      nullable: false,
      list: false,
    })),
  ];
  await ranker.rank({
    id: "oversized_schema",
    dataNetwork: "eip155:1",
    protocol: {name: "Example", version: null},
    assets: [],
    description: longText,
    grain: "one provider record",
    fields: requirementFields,
    constraints: Array.from({length: 16}, () => longText),
  }, [{
    candidateRef: "graph:oversized",
    displayName: "Oversized schema",
    entity: {
      queryEntity: "records",
      entityType: "Record",
      fields: entityFields,
      suggestedBindings: [{requirementId: "field_0", fieldPaths: ["amountUSD"]}],
      matchedRequirements: ["field_0"],
      grainHint: "unknown",
    },
  }]);

  assert.equal(suppliedInputs.length, 2);
  for (const input of suppliedInputs) {
    assert.ok(new TextEncoder().encode(input).byteLength <= entityEmbeddingLimits.maxEmbeddingDocumentBytes);
  }
  assert.match(suppliedInputs[0]!, /omitted_requirement_detail_count:/);
  assert.match(suppliedInputs[1]!, /amountUSD:BigDecimal/);
  assert.match(suppliedInputs[1]!, /omitted_field_count:/);
});

test("field retrieval embeds every field in the selected entity before requirement ranking", async () => {
  const suppliedInputs: string[] = [];
  const progress: {phase: string; batchCount: number}[] = [];
  const ranker = new RemoteEntityEmbeddingRanker({
    enabled: true,
    apiUrl: "https://dashscope.example/v1/embeddings",
    apiKey: "server-only-embedding-key",
    model: "text-embedding-v3",
    dimensions: 1024,
    timeoutMs: 5000,
  }, async (_url, options) => {
    const body = JSON.parse(String(options?.body)) as {input: string[]};
    suppliedInputs.push(...body.input);
    return Response.json({
      data: body.input.map((text, index) => ({
        index,
        embedding: text.includes("volume") || text.includes("amountUSD") ? [1, 0] : [0, 1],
      })),
    });
  });
  const fields = [
    {path: "amountUSD", graphType: "BigDecimal", valueType: "decimal" as const, nullable: false, list: false},
    ...Array.from({length: 104}, (_, index) => ({
      path: `providerField${index}`,
      graphType: "String",
      valueType: "string" as const,
      nullable: false,
      list: false,
    })),
  ];
  const need = {
    id: "ethereum_swaps",
    dataNetwork: "eip155:1",
    protocol: {name: "Uniswap", version: "V3"},
    assets: [{symbol: "WETH", networkAssetId: null}, {symbol: "USDC", networkAssetId: null}],
    description: "One row per WETH/USDC swap",
    grain: "swap event",
    fields: [{
      id: "volume_usd",
      description: "USD volume",
      expectedType: "decimal" as const,
      unit: "USD",
      required: true,
      allowNullable: false,
      hints: ["amountUSD"],
    }],
    constraints: ["Uniswap swaps only"],
  };
  const scores = await ranker.rankFields(need, {
    candidateRef: "graph:selected",
    displayName: "Selected Subgraph",
    entity: {
      queryEntity: "swaps",
      entityType: "Swap",
      fields,
      suggestedBindings: [],
      matchedRequirements: [],
      grainHint: "unknown",
    },
  }, undefined, (event) => progress.push(event));

  assert.equal(suppliedInputs.length, fields.length + need.fields.length);
  assert.equal(suppliedInputs.filter((input) => input.includes("One actual inspected GraphQL field")).length, fields.length);
  assert.ok(suppliedInputs.some((input) => input.includes("providerField103")));
  assert.equal(scores.length, fields.length * need.fields.length);
  assert.equal(scores.find((score) => score.fieldPath === "amountUSD")?.similarity, 1);
  assert.equal(progress.at(-1)?.phase, "completed");
  assert.equal(progress.at(-1)?.batchCount, 11);
});

test("flexible validation preserves nominal count units and numerator units for grouped averages", () => {
  const plan: DiscoverySemanticPlan = {
    schemaVersion: 3,
    kind: "semantic_plan",
    summary: "Report daily trade count, volume, and average trade size.",
    sourceRequirements: [{
      id: "daily_swaps",
      dataNetwork: "eip155:1",
      protocol: null,
      assets: [],
      description: "Raw swap events.",
      grain: "one row per swap event",
      fields: [
        {
          id: "block_timestamp",
          description: "Timestamp of the swap.",
          expectedType: "timestamp",
          unit: null,
          required: true,
          allowNullable: false,
          hints: ["timestamp"],
        },
        {
          id: "swap_amount_usd",
          description: "USD value of the swap.",
          expectedType: "decimal",
          unit: "USD",
          required: true,
          allowNullable: false,
          hints: ["amountUSD"],
        },
      ],
      constraints: [],
    }],
    result: {
      description: "One result row per UTC day.",
      grain: "one row per UTC day",
      fields: [
        {name: "day", description: "UTC day.", type: "date", unit: null, nullable: false},
        {name: "trade_count", description: "Number of trades.", type: "integer", unit: "trades", nullable: false},
        {name: "volume_usd", description: "Total volume.", type: "decimal", unit: "USD", nullable: false},
        {name: "average_trade_size_usd", description: "Average trade size.", type: "decimal", unit: "USD", nullable: false},
      ],
      orderBy: [{field: "day", direction: "asc"}],
    },
    refresh: {mode: "manual", timezone: "UTC"},
    assumptions: [],
    unresolved: [],
  };
  const selection: SourceFeasibilitySelection = {
    sourceNeedId: "daily_swaps",
    candidateRef: "graph:daily-swaps:00000000000000000000",
    queryEntity: "swaps",
    fieldBindings: [
      {requirementId: "block_timestamp", fieldPath: "timestamp"},
      {requirementId: "swap_amount_usd", fieldPath: "amountUSD"},
    ],
    auxiliaryFieldBindings: [],
    rationale: "The inspected entity exposes one row per swap.",
  };
  const composition: FlexibleCompositionIntent = {
    schemaVersion: 2,
    kind: "composition_intent",
    nodes: [
      {
        role: "derive_day",
        operator: "map",
        operatorVersion: "2",
        config: {
          mode: "extend",
          fields: [{
            name: "day",
            expression: {op: "utc_date", inputs: [{op: "field", field: "block_timestamp"}]},
          }],
        },
      },
      {
        role: "daily_totals",
        operator: "aggregate",
        operatorVersion: "2",
        config: {
          groupBy: ["day"],
          measures: [
            {name: "trade_count", op: "count_rows", field: null},
            {name: "volume_usd", op: "sum", field: "swap_amount_usd"},
          ],
        },
      },
      {
        role: "daily_average",
        operator: "map",
        operatorVersion: "2",
        config: {
          mode: "project",
          fields: [
            {name: "day", expression: {op: "field", field: "day"}},
            {name: "trade_count", expression: {op: "field", field: "trade_count"}},
            {name: "volume_usd", expression: {op: "field", field: "volume_usd"}},
            {
              name: "average_trade_size_usd",
              expression: {
                op: "safe_divide",
                inputs: [
                  {op: "field", field: "volume_usd"},
                  {op: "field", field: "trade_count"},
                ],
              },
            },
          ],
        },
      },
      {
        role: "daily_output",
        operator: "output",
        operatorVersion: "2",
        config: {
          fields: ["day", "trade_count", "volume_usd", "average_trade_size_usd"],
          orderBy: [{field: "day", direction: "asc"}],
        },
      },
    ],
    connections: [
      {fromRole: "source__daily_swaps", toRole: "derive_day", inputRole: "rows"},
      {fromRole: "derive_day", toRole: "daily_totals", inputRole: "rows"},
      {fromRole: "daily_totals", toRole: "daily_average", inputRole: "rows"},
      {fromRole: "daily_average", toRole: "daily_output", inputRole: "rows"},
    ],
    templateInstances: [],
  };

  assert.doesNotThrow(() => validateFlexibleComposition(
    plan,
    composition,
    deriveDiscoverySourceNeeds(plan),
    [selection],
    {maxNodes: 12, maxEdges: 24},
  ));

  const invalidCountUnitPlan: DiscoverySemanticPlan = {
    ...plan,
    result: {
      ...plan.result,
      fields: plan.result.fields.map((field) => field.name === "trade_count"
        ? {...field, unit: "USD"}
        : field),
    },
  };
  assert.throws(
    () => validateFlexibleComposition(
      invalidCountUnitPlan,
      composition,
      deriveDiscoverySourceNeeds(invalidCountUnitPlan),
      [selection],
      {maxNodes: 12, maxEdges: 24},
    ),
    (error: unknown) => error instanceof HarnessCompileError
      && error.code === "OUTPUT_SCHEMA_INVALID"
      && error.message.includes("trade_count"),
  );
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
