import assert from "node:assert/strict";
import test from "node:test";
import {AgentHarness, createMockStageOutput, HarnessValidationError} from "../src/modules/agent/harness/index.js";
import type {AgentDebugEvent, AgentModelRequest, HarnessTraceEvent, SourceDiscoveryPlan, SourceFeasibilityPlan} from "../src/modules/agent/harness/index.js";
import {
  GraphMcpError,
  GraphSourceDiscoveryService,
  DisabledGraphSchemaCache,
  MemoryGraphSchemaCache,
  RestrictedGraphMcpClient,
  graphNetworkAliases,
  graphMcpPlanningTools,
  graphNetworksRegistryVersion,
  graphSubgraphNetworkCatalog,
} from "../src/modules/graph/index.js";
import type {
  GraphMcpPlanningTool,
  GraphMcpPlanningWire,
  GraphMcpTool,
  GraphPlanningMcpPort,
  GraphSourceDiscoveryRequest,
} from "../src/modules/graph/index.js";

class FakeWire implements GraphMcpPlanningWire {
  readonly calls: {tool: GraphMcpTool; args: Readonly<Record<string, unknown>>}[] = [];

  constructor(private readonly responses: Readonly<Partial<Record<GraphMcpTool, string>>>) {}

  async listToolNames(): Promise<ReadonlySet<string>> {
    return new Set([...graphMcpPlanningTools, ...forbiddenExecutionTools]);
  }

  async callTool(tool: GraphMcpTool, args: Readonly<Record<string, unknown>>) {
    this.calls.push({tool, args});
    const response = this.responses[tool];
    if (response === undefined) return {isError: true, content: [{type: "text", text: "provider detail"}]};
    return {content: [{type: "text", text: response}]};
  }

  async close(): Promise<void> {}
}

const forbiddenExecutionTools = [
  "execute_query_by_deployment_id",
  "execute_query_by_subgraph_id",
  "execute_query_by_ipfs_hash",
] as const;

const schema = `
  scalar BigInt
  scalar BigDecimal
  type Account { id: ID! }
  type Pool { id: ID! }
  type Swap {
    id: ID!
    account: Account!
    timestamp: BigInt!
    amountUSD: BigDecimal!
    pool: Pool!
  }
  type Query { swaps(first: Int): [Swap!]! }
`;

const swapNeedContract = {
  description: "One indexed swap event.",
  grain: "swap_event",
  fields: [
    {id: "wallet", description: "Wallet that initiated the swap.", expectedType: "address", unit: null, required: true, allowNullable: false, hints: ["account", "sender", "wallet"]},
    {id: "trade_id", description: "Stable swap identifier.", expectedType: "id", unit: null, required: true, allowNullable: false, hints: ["id"]},
    {id: "timestamp", description: "Swap occurrence time.", expectedType: "timestamp", unit: null, required: true, allowNullable: false, hints: ["timestamp"]},
    {id: "volume_usd", description: "USD-denominated swap volume.", expectedType: "decimal", unit: "USD", required: true, allowNullable: false, hints: ["amountUSD", "volumeUSD"]},
  ],
  constraints: [],
} as const;

test("Graph network catalog is the complete pinned Subgraphs-service projection", () => {
  assert.equal(graphNetworksRegistryVersion, "0.7.119");
  assert.equal(graphSubgraphNetworkCatalog.length, 65);
  assert.equal(graphSubgraphNetworkCatalog.filter((network) => network.networkType === "mainnet").length, 34);
  assert.equal(graphSubgraphNetworkCatalog.filter((network) => network.networkType === "testnet").length, 31);
  assert.equal(new Set(graphSubgraphNetworkCatalog.map((network) => network.dataNetwork)).size, 65);
  assert.ok(graphSubgraphNetworkCatalog.some((network) => network.dataNetwork === "near:mainnet"));
  assert.ok(graphSubgraphNetworkCatalog.some((network) => network.dataNetwork === "eip155:421614"));
  assert.ok(!(graphNetworkAliases["eip155:1"] ?? []).includes("mainnet"));
});

test("Agent accepts the full network catalog without raising the source-output limit", async () => {
  const model = {
    async complete(request: AgentModelRequest) {
      if (request.stage !== "source_discovery_planning") throw new Error("not expected");
      return {
        provider: "mock" as const,
        model: "full-network-catalog-test",
        output: createMockStageOutput({...request, availableNetworks: request.availableNetworks.slice(0, 1)}),
      };
    },
  };
  const harness = new AgentHarness(model, undefined, {
    async discover() { throw new Error("full-network-catalog-accepted"); },
  });

  await assert.rejects(
    () => harness.explore({intent: "Inspect one existing source", availableNetworks: graphSubgraphNetworkCatalog}),
    /full-network-catalog-accepted/,
  );
});

test("restricted Graph MCP client exposes bounded metadata methods but no arbitrary execution method", async () => {
  const wire = new FakeWire({
    search_subgraphs_by_keyword: JSON.stringify({
      subgraphs: [{
        id: "logical-subgraph",
        metadata: {displayName: "Uniswap Ethereum"},
        currentVersion: {subgraphDeployment: {ipfsHash: "QmEthereum"}},
      }],
      total: 1,
      returned: 1,
    }),
    get_deployment_30day_query_counts: JSON.stringify({
      deployments: [{ipfs_hash: "QmEthereum", total_query_count: 1234, data_points_count: 30}],
      total_deployments_processed: 1,
    }),
    get_schema_by_ipfs_hash: schema,
    get_top_subgraph_deployments: JSON.stringify({
      subgraphDeployments: [{ipfsHash: "QmEthereum", manifest: {network: "mainnet"}, queryFeesAmount: "4"}],
    }),
  });
  const client = new RestrictedGraphMcpClient(wire);

  const search = await client.searchSubgraphsByKeyword("Uniswap");
  const activity = await client.getDeploymentActivity(["QmEthereum"]);
  const returnedSchema = await client.getSchema({type: "ipfs_hash", id: "QmEthereum"});
  const contract = await client.getTopDeploymentsForContract({
    contractAddress: "0x1111111111111111111111111111111111111111",
    chain: "mainnet",
  });

  assert.equal(search.subgraphs[0]?.manifestIpfsCid, "QmEthereum");
  assert.equal(activity[0]?.totalQueryCount30d, 1234);
  assert.equal(returnedSchema, schema);
  assert.equal(contract[0]?.network, "mainnet");
  assert.deepEqual(wire.calls.map((call) => call.tool), [
    "search_subgraphs_by_keyword",
    "get_deployment_30day_query_counts",
    "get_schema_by_ipfs_hash",
    "get_top_subgraph_deployments",
  ]);
  assert.equal(wire.calls.some((call) => forbiddenExecutionTools.includes(call.tool as never)), false);
  assert.equal("executeGraphQL" in client, false);
  assert.equal("callTool" in client, false);
});

test("runtime schema adapter can execute only Sprue's fixed Query-root introspection document", async () => {
  const wire = new FakeWire({
    execute_query_by_ipfs_hash: JSON.stringify({
      data: {
        __schema: {
          queryType: {
            fields: [
              {name: "swap", type: {kind: "OBJECT", name: "Swap"}},
              {name: "swaps", type: {kind: "NON_NULL", name: null, ofType: {kind: "LIST", name: null, ofType: {kind: "NON_NULL", name: null, ofType: {kind: "OBJECT", name: "Swap"}}}}},
            ],
          },
        },
      },
    }),
  });
  const client = new RestrictedGraphMcpClient(wire);

  assert.deepEqual(await client.getRuntimeQueryFields("QmEntityOnly"), [
    {name: "swap", entityType: "Swap", list: false},
    {name: "swaps", entityType: "Swap", list: true},
  ]);
  assert.equal(wire.calls.length, 1);
  assert.equal(wire.calls[0]?.tool, "execute_query_by_ipfs_hash");
  assert.equal(wire.calls[0]?.args.ipfs_hash, "QmEntityOnly");
  assert.deepEqual(wire.calls[0]?.args.variables, {});
  assert.match(String(wire.calls[0]?.args.query), /query SprueRuntimeQueryRoot/);
  assert.match(String(wire.calls[0]?.args.query), /__schema/);
});

test("restricted Graph MCP client rejects provider errors without reflecting provider content", async () => {
  const client = new RestrictedGraphMcpClient(new FakeWire({}));
  await assert.rejects(
    () => client.searchSubgraphsByKeyword("Uniswap"),
    (error: unknown) => error instanceof GraphMcpError
      && error.code === "GRAPH_MCP_TOOL_REJECTED"
      && !error.message.includes("provider detail"),
  );
});

test("Graph source discovery checks activity before schemas and ranks network-compatible candidates", async () => {
  const calls: string[] = [];
  const graph: GraphPlanningMcpPort = {
    async searchSubgraphsByKeyword(value) {
      calls.push(`search:${value}`);
      return {
        subgraphs: [
          {subgraphId: "sg-eth", displayName: "Uniswap V3 Ethereum", manifestIpfsCid: "QmEth"},
          {subgraphId: "sg-arb", displayName: "Uniswap V3 Arbitrum", manifestIpfsCid: "QmArb"},
        ],
        total: 2,
        returned: 2,
      };
    },
    async getDeploymentActivity(values) {
      calls.push(`activity:${values.join(",")}`);
      return [
        {manifestIpfsCid: "QmEth", totalQueryCount30d: 1200, dataPointsCount: 30},
        {manifestIpfsCid: "QmArb", totalQueryCount30d: 900, dataPointsCount: 30},
      ];
    },
    async getSchema(reference) {
      calls.push(`schema:${reference.id}`);
      return schema;
    },
    async getTopDeploymentsForContract() {
      throw new Error("not expected");
    },
    async close() {},
  };
  const discovery = new GraphSourceDiscoveryService(graph);
  const harness = new AgentHarness({
    async complete() {
      throw new Error("source discovery must not invoke the language model");
    },
  }, undefined, discovery);
  const result = await harness.discoverGraphSources({
    needs: [
      {
        id: "ethereum-swaps",
        dataNetwork: "eip155:1",
        networkLabel: "Ethereum",
        keywords: ["Uniswap"],
        ...swapNeedContract,
      },
      {
        id: "arbitrum-swaps",
        dataNetwork: "eip155:42161",
        networkLabel: "Arbitrum",
        keywords: ["Uniswap"],
        ...swapNeedContract,
      },
    ],
  });

  assert.equal(result.searchCalls, 1);
  assert.equal(result.inspectedSchemas, 2);
  assert.deepEqual(calls, ["search:Uniswap", "activity:QmEth,QmArb", "schema:QmEth", "schema:QmArb"]);
  assert.deepEqual(
    result.candidates.filter((candidate) => candidate.status === "suitable").map((candidate) => [candidate.sourceNeedId, candidate.logicalSubgraphId]),
    [["ethereum-swaps", "sg-eth"], ["arbitrum-swaps", "sg-arb"]],
  );
  assert.equal(result.candidates[0]?.entities[0]?.queryEntity, "swaps");
  assert.deepEqual(result.candidates[0]?.entities[0]?.matchedRequirements, ["wallet", "trade_id", "timestamp", "volume_usd"]);
  assert.match(result.candidates[0]?.limitations.join(" ") ?? "", /IPFS CID is not a Deployment ID/);
});

test("Graph source discovery keeps uninspected candidates verifiable instead of calling them incompatible", async () => {
  const graph: GraphPlanningMcpPort = {
    async searchSubgraphsByKeyword() {
      return {
        subgraphs: [
          {subgraphId: "sg-eth-primary", displayName: "Uniswap Ethereum", manifestIpfsCid: "QmPrimary"},
          {subgraphId: "sg-eth-secondary", displayName: "Uniswap Ethereum Archive", manifestIpfsCid: "QmSecondary"},
        ],
        total: 2,
        returned: 2,
      };
    },
    async getDeploymentActivity(values) {
      return values.map((manifestIpfsCid) => ({manifestIpfsCid, totalQueryCount30d: 100, dataPointsCount: 30}));
    },
    async getSchema(reference) {
      assert.equal(reference.id, "QmPrimary");
      return schema;
    },
    async getTopDeploymentsForContract() {
      throw new Error("not expected");
    },
    async close() {},
  };
  const result = await new GraphSourceDiscoveryService(graph, {
    maxSearchCallsPerNeed: 3,
    maxSearchResultsPerCall: 5,
    maxSchemaInspectionsPerNeed: 1,
    maxSchemaBytes: 5_242_880,
  }).discover({
    needs: [{
      id: "ethereum-swaps",
      dataNetwork: "eip155:1",
      networkLabel: "Ethereum",
      keywords: ["Uniswap"],
      ...swapNeedContract,
    }],
  });

  const inspected = result.candidates.find((candidate) => candidate.manifestIpfsCid === "QmPrimary");
  const uninspected = result.candidates.find((candidate) => candidate.manifestIpfsCid === "QmSecondary");
  assert.equal(inspected?.status, "suitable");
  assert.equal(uninspected?.status, "needs_verification");
  assert.deepEqual(uninspected?.entities, []);
  assert.match(uninspected?.limitations.join(" ") ?? "", /Schema was not inspected/);
});

test("Graph source discovery orders schema inspection by activity without rejecting zero-query candidates", async () => {
  const schemaCalls: string[] = [];
  const graph: GraphPlanningMcpPort = {
    async searchSubgraphsByKeyword() {
      return {
        subgraphs: [
          {subgraphId: "sg-zero", displayName: "Protocol Ethereum Zero", manifestIpfsCid: "QmZero"},
          {subgraphId: "sg-missing", displayName: "Protocol Ethereum Missing", manifestIpfsCid: "QmMissing"},
          {subgraphId: "sg-popular", displayName: "Protocol Ethereum Popular", manifestIpfsCid: "QmPopular"},
        ],
        total: 3,
        returned: 3,
      };
    },
    async getDeploymentActivity() {
      return [
        {manifestIpfsCid: "QmZero", totalQueryCount30d: 0, dataPointsCount: 0},
        {manifestIpfsCid: "QmPopular", totalQueryCount30d: 500, dataPointsCount: 30},
      ];
    },
    async getSchema(reference) {
      schemaCalls.push(reference.id);
      return schema;
    },
    async getTopDeploymentsForContract() {
      throw new Error("not expected");
    },
    async close() {},
  };

  const result = await new GraphSourceDiscoveryService(graph).discover({
    needs: [{
      id: "ethereum-swaps",
      dataNetwork: "eip155:1",
      networkLabel: "Ethereum Mainnet",
      keywords: ["Protocol"],
      ...swapNeedContract,
    }],
  });

  assert.deepEqual(schemaCalls, ["QmPopular", "QmZero", "QmMissing"]);
  assert.equal(result.inspectedSchemas, 3);
  const zero = result.candidates.find((candidate) => candidate.manifestIpfsCid === "QmZero");
  const missing = result.candidates.find((candidate) => candidate.manifestIpfsCid === "QmMissing");
  assert.equal(zero?.status, "suitable");
  assert.ok((zero?.entities.length ?? 0) > 0);
  assert.match(zero?.limitations.join(" ") ?? "", /zero observed queries/);
  assert.equal(missing?.status, "needs_verification");
  assert.ok((missing?.entities.length ?? 0) > 0);
  assert.match(missing?.limitations.join(" ") ?? "", /activity evidence is missing/);
});

test("Graph source discovery verifies and cross-account caches Query fields when deployment SDL omits Query", async () => {
  const entityOnlySchema = `
    scalar BigInt
    scalar BigDecimal
    type Account @entity { id: Bytes! }
    type Swap @entity(immutable: true) {
      id: ID!
      account: Account!
      timestamp: BigInt!
      amountUSD: BigDecimal!
    }
  `;
  const graph: GraphPlanningMcpPort = {
    async searchSubgraphsByKeyword() {
      return {
        subgraphs: [{subgraphId: "sg-entity-only", displayName: "Uniswap Ethereum", manifestIpfsCid: "QmEntityOnly"}],
        total: 1,
        returned: 1,
      };
    },
    async getDeploymentActivity() {
      return [{manifestIpfsCid: "QmEntityOnly", totalQueryCount30d: 42, dataPointsCount: 30}];
    },
    async getSchema() {
      return entityOnlySchema;
    },
    async getTopDeploymentsForContract() {
      throw new Error("not expected");
    },
    async close() {},
  };
  let runtimeCalls = 0;
  const runtimeSchema = {
    async getRuntimeQueryFields(manifestIpfsCid: string) {
      runtimeCalls += 1;
      assert.equal(manifestIpfsCid, "QmEntityOnly");
      return [
        {name: "swap", entityType: "Swap", list: false},
        {name: "swaps", entityType: "Swap", list: true},
      ];
    },
  };
  const sharedCache = new MemoryGraphSchemaCache();

  const request = {
    needs: [{
      id: "ethereum-swaps",
      dataNetwork: "eip155:1",
      networkLabel: "Ethereum Mainnet",
      keywords: ["Uniswap"],
      ...swapNeedContract,
    }],
  } as const;
  const result = await new GraphSourceDiscoveryService(graph, undefined, sharedCache, runtimeSchema).discover(request);
  const secondAccountResult = await new GraphSourceDiscoveryService(graph, undefined, sharedCache, runtimeSchema).discover({
    needs: [{
      id: "ethereum-swaps",
      dataNetwork: "eip155:1",
      networkLabel: "Ethereum Mainnet",
      keywords: ["Uniswap"],
      ...swapNeedContract,
      fields: [swapNeedContract.fields[1]],
    }],
  });

  assert.equal(result.inspectedSchemas, 1);
  assert.equal(secondAccountResult.inspectedSchemas, 1);
  assert.equal(runtimeCalls, 1);
  assert.deepEqual(secondAccountResult.candidates[0]?.entities[0]?.matchedRequirements, ["trade_id"]);
  const candidate = result.candidates[0];
  assert.equal(candidate?.status, "suitable");
  assert.equal(candidate?.entities[0]?.queryEntity, "swaps");
  assert.equal(candidate?.entities[0]?.entityType, "Swap");
  assert.deepEqual(candidate?.entities[0]?.matchedRequirements, ["wallet", "trade_id", "timestamp", "volume_usd"]);
  assert.match(candidate?.limitations.join(" ") ?? "", /verified against the deployed GraphQL endpoint/);

  const disabledCache = new DisabledGraphSchemaCache();
  await new GraphSourceDiscoveryService(graph, undefined, disabledCache, runtimeSchema).discover(request);
  await new GraphSourceDiscoveryService(graph, undefined, disabledCache, runtimeSchema).discover(request);
  assert.equal(runtimeCalls, 3);
  await disabledCache.close();
});

test("Graph source discovery preserves direct fields before bounded relationship expansion", async () => {
  const nestedFields = Array.from({length: 1_100}, (_, index) => `metric${index}: BigDecimal!`).join("\n");
  const relationshipHeavySchema = `
    scalar BigInt
    scalar BigDecimal
    type Pool { ${nestedFields} }
    type Swap {
      id: ID!
      pool: Pool!
      timestamp: BigInt!
      amountUSD: BigDecimal!
    }
    type Query { swaps(first: Int): [Swap!]! }
  `;
  const graph: GraphPlanningMcpPort = {
    async searchSubgraphsByKeyword() {
      return {
        subgraphs: [{subgraphId: "sg-heavy", displayName: "Uniswap Arbitrum", manifestIpfsCid: "QmHeavy"}],
        total: 1,
        returned: 1,
      };
    },
    async getDeploymentActivity() {
      return [{manifestIpfsCid: "QmHeavy", totalQueryCount30d: 1, dataPointsCount: 1}];
    },
    async getSchema() { return relationshipHeavySchema; },
    async getTopDeploymentsForContract() { throw new Error("not expected"); },
    async close() {},
  };

  const result = await new GraphSourceDiscoveryService(graph).discover({
    needs: [{
      id: "arbitrum-swaps",
      dataNetwork: "eip155:42161",
      networkLabel: "Arbitrum",
      keywords: ["Uniswap"],
      description: "Swap timestamps and USD values.",
      grain: "swap_event",
      fields: [swapNeedContract.fields[2], swapNeedContract.fields[3]],
      constraints: [],
    }],
  });

  const fields = result.candidates[0]?.entities.find((entity) => entity.queryEntity === "swaps")?.fields ?? [];
  assert.equal(fields.length, 1_024);
  assert.ok(fields.some((field) => field.path === "timestamp"));
  assert.ok(fields.some((field) => field.path === "amountUSD"));
  assert.equal(result.candidates[0]?.status, "suitable");
});

test("Graph source discovery respects row grain and rejects nested cumulative metrics as event values", async () => {
  const grainSchema = `
    scalar BigInt
    scalar BigDecimal
    type Pool { volumeUSD: BigDecimal! }
    type Burn { id: ID!, timestamp: BigInt!, amountUSD: BigDecimal! }
    type Swap { id: ID!, timestamp: BigInt!, amountUSD: BigDecimal!, pool: Pool! }
    type LegacySwap { id: ID!, timestamp: BigInt!, pool: Pool! }
    type Query {
      burns(first: Int): [Burn!]!
      swaps(first: Int): [Swap!]!
      legacySwaps(first: Int): [LegacySwap!]!
    }
  `;
  const graph: GraphPlanningMcpPort = {
    async searchSubgraphsByKeyword() {
      return {
        subgraphs: [{subgraphId: "sg-grain", displayName: "Uniswap Arbitrum", manifestIpfsCid: "QmGrain"}],
        total: 1,
        returned: 1,
      };
    },
    async getDeploymentActivity() {
      return [{manifestIpfsCid: "QmGrain", totalQueryCount30d: 1, dataPointsCount: 1}];
    },
    async getSchema() { return grainSchema; },
    async getTopDeploymentsForContract() { throw new Error("not expected"); },
    async close() {},
  };

  const result = await new GraphSourceDiscoveryService(graph).discover({
    needs: [{
      id: "arbitrum-swap-events",
      dataNetwork: "eip155:42161",
      networkLabel: "Arbitrum",
      keywords: ["Uniswap"],
      description: "Individual swap events and their USD amount.",
      grain: "swap_event",
      fields: [swapNeedContract.fields[2], swapNeedContract.fields[3]],
      constraints: [],
    }],
  });

  const entities = result.candidates[0]?.entities ?? [];
  const swaps = entities.find((entity) => entity.queryEntity === "swaps");
  const burns = entities.find((entity) => entity.queryEntity === "burns");
  const legacy = entities.find((entity) => entity.queryEntity === "legacySwaps");
  assert.deepEqual(swaps?.matchedRequirements, ["timestamp", "volume_usd"]);
  assert.equal(swaps?.grainHint, "matched");
  assert.deepEqual(burns?.matchedRequirements, ["timestamp", "volume_usd"]);
  assert.equal(burns?.grainHint, "unknown");
  assert.deepEqual(legacy?.matchedRequirements, ["timestamp"]);
  assert.equal(legacy?.grainHint, "matched");
  assert.deepEqual(legacy?.suggestedBindings.find((binding) => binding.requirementId === "volume_usd")?.fieldPaths, ["pool.volumeUSD"]);
});

test("Graph source discovery recognizes directional per-event fields without preferring cumulative aggregates", async () => {
  const directionalSchema = `
    scalar BigInt
    scalar BigDecimal
    type Pool { cumulativeVolumeUSD: BigDecimal! }
    type Token { symbol: String! }
    type Swap {
      id: ID!
      timestamp: BigInt!
      amountInUSD: BigDecimal!
      amountOutUSD: BigDecimal!
      tokenIn: Token!
      tokenOut: Token!
      pool: Pool!
    }
    type Query { swaps(first: Int): [Swap!]! }
  `;
  const graph: GraphPlanningMcpPort = {
    async searchSubgraphsByKeyword() {
      return {
        subgraphs: [{subgraphId: "sg-directional", displayName: "Uniswap V3 Ethereum", manifestIpfsCid: "QmDirectional"}],
        total: 1,
        returned: 1,
      };
    },
    async getDeploymentActivity() {
      return [{manifestIpfsCid: "QmDirectional", totalQueryCount30d: 1, dataPointsCount: 1}];
    },
    async getSchema() { return directionalSchema; },
    async getTopDeploymentsForContract() { throw new Error("not expected"); },
    async close() {},
  };

  const result = await new GraphSourceDiscoveryService(graph).discover({
    needs: [{
      id: "ethereum-swap-events",
      dataNetwork: "eip155:1",
      networkLabel: "Ethereum Mainnet",
      keywords: ["Uniswap V3"],
      description: "Individual swap events and their USD amount.",
      grain: "swap_event",
      fields: [swapNeedContract.fields[2], swapNeedContract.fields[3]],
      constraints: [],
    }],
  });

  const swaps = result.candidates[0]?.entities.find((entity) => entity.queryEntity === "swaps");
  assert.deepEqual(swaps?.matchedRequirements, ["timestamp", "volume_usd"]);
  assert.deepEqual(
    swaps?.suggestedBindings.find((binding) => binding.requirementId === "volume_usd")?.fieldPaths.slice(0, 2),
    ["amountInUSD", "amountOutUSD"],
  );
  assert.ok((swaps?.suggestedBindings.find((binding) => binding.requirementId === "volume_usd")?.fieldPaths.indexOf("pool.cumulativeVolumeUSD") ?? -1) >= 2);
});

test("Graph source discovery ranks protocol and grain fit ahead of unrelated high-activity schemas", async () => {
  const schemas = new Map([
    ["QmLending", `scalar BigInt scalar BigDecimal type Market { id: ID!, timestamp: BigInt!, amountUSD: BigDecimal! } type Query { markets(first: Int): [Market!]! }`],
    ["QmUniswap", `scalar BigInt scalar BigDecimal type Swap { id: ID!, timestamp: BigInt!, amountInUSD: BigDecimal! } type Query { swaps(first: Int): [Swap!]! }`],
  ]);
  const graph: GraphPlanningMcpPort = {
    async searchSubgraphsByKeyword() {
      return {
        subgraphs: [
          {subgraphId: "sg-lending", displayName: "Lending Protocol Ethereum", manifestIpfsCid: "QmLending"},
          {subgraphId: "sg-uniswap", displayName: "Uniswap V3 Ethereum", manifestIpfsCid: "QmUniswap"},
        ],
        total: 2,
        returned: 2,
      };
    },
    async getDeploymentActivity() {
      return [
        {manifestIpfsCid: "QmLending", totalQueryCount30d: 1_000_000, dataPointsCount: 30},
        {manifestIpfsCid: "QmUniswap", totalQueryCount30d: 0, dataPointsCount: 30},
      ];
    },
    async getSchema(input) { return schemas.get(input.id) ?? ""; },
    async getTopDeploymentsForContract() { throw new Error("not expected"); },
    async close() {},
  };

  const result = await new GraphSourceDiscoveryService(graph).discover({
    needs: [{
      id: "ethereum-swap-events",
      dataNetwork: "eip155:1",
      networkLabel: "Ethereum Mainnet",
      keywords: ["Uniswap V3"],
      description: "Individual Uniswap swap events.",
      grain: "swap_event",
      fields: [swapNeedContract.fields[2], swapNeedContract.fields[3]],
      constraints: [],
    }],
  });

  assert.equal(result.candidates[0]?.manifestIpfsCid, "QmUniswap");
  assert.ok((result.candidates[0]?.score ?? 0) > (result.candidates[1]?.score ?? 0));
});

test("Graph source discovery fails closed before runtime introspection when the shared cache is unavailable", async () => {
  const entityOnlySchema = `type Swap @entity { id: ID! }`;
  let runtimeCalls = 0;
  const graph: GraphPlanningMcpPort = {
    async searchSubgraphsByKeyword() {
      return {
        subgraphs: [{subgraphId: "sg", displayName: "Protocol Ethereum", manifestIpfsCid: "QmCacheFail"}],
        total: 1,
        returned: 1,
      };
    },
    async getDeploymentActivity() {
      return [{manifestIpfsCid: "QmCacheFail", totalQueryCount30d: 1, dataPointsCount: 1}];
    },
    async getSchema() { return entityOnlySchema; },
    async getTopDeploymentsForContract() { throw new Error("not expected"); },
    async close() {},
  };
  const cache = {
    async get() { throw Object.assign(new Error("unavailable"), {code: "GRAPH_SCHEMA_CACHE_UNAVAILABLE"}); },
    async set() { throw new Error("not expected"); },
  };
  const runtimeSchema = {
    async getRuntimeQueryFields() {
      runtimeCalls += 1;
      return [{name: "swaps", entityType: "Swap", list: true}];
    },
  };

  const result = await new GraphSourceDiscoveryService(graph, undefined, cache, runtimeSchema).discover({
    needs: [{
      id: "ethereum-swaps",
      dataNetwork: "eip155:1",
      networkLabel: "Ethereum Mainnet",
      keywords: ["Protocol"],
      description: "Swap IDs",
      grain: "swap_event",
      fields: [swapNeedContract.fields[1]],
      constraints: [],
    }],
  });

  assert.equal(runtimeCalls, 0);
  assert.deepEqual(result.candidates[0]?.entities, []);
  assert.match(result.candidates[0]?.limitations.join(" ") ?? "", /cache is unavailable/);
});

test("Graph source discovery does not treat another chain's mainnet label as Ethereum evidence", async () => {
  const graph: GraphPlanningMcpPort = {
    async searchSubgraphsByKeyword() {
      return {
        subgraphs: [{subgraphId: "sg-base", displayName: "Uniswap V3 Base Mainnet", manifestIpfsCid: "QmBase"}],
        total: 1,
        returned: 1,
      };
    },
    async getDeploymentActivity() {
      return [{manifestIpfsCid: "QmBase", totalQueryCount30d: 100, dataPointsCount: 30}];
    },
    async getSchema() {
      throw new Error("network-conflicting candidates must not consume a schema inspection");
    },
    async getTopDeploymentsForContract() {
      throw new Error("not expected");
    },
    async close() {},
  };
  const result = await new GraphSourceDiscoveryService(graph).discover({
    needs: [{
      id: "ethereum-swaps",
      dataNetwork: "eip155:1",
      networkLabel: "Ethereum Mainnet",
      keywords: ["Uniswap"],
      ...swapNeedContract,
    }],
  });

  assert.equal(result.inspectedSchemas, 0);
  assert.equal(result.candidates[0]?.networkEvidence, "conflict");
  assert.equal(result.candidates[0]?.status, "incompatible");
});

test("Graph source discovery prefers a specific testnet label over its mainnet family alias", async () => {
  const graph: GraphPlanningMcpPort = {
    async searchSubgraphsByKeyword() {
      return {
        subgraphs: [{
          subgraphId: "sg-arbitrum-sepolia",
          displayName: "Uniswap V3 Arbitrum Sepolia Testnet",
          manifestIpfsCid: "QmArbitrumSepolia",
        }],
        total: 1,
        returned: 1,
      };
    },
    async getDeploymentActivity() {
      return [{manifestIpfsCid: "QmArbitrumSepolia", totalQueryCount30d: 1, dataPointsCount: 1}];
    },
    async getSchema() { return schema; },
    async getTopDeploymentsForContract() { throw new Error("not expected"); },
    async close() {},
  };
  const result = await new GraphSourceDiscoveryService(graph).discover({
    needs: [{
      id: "arbitrum-sepolia-swaps",
      dataNetwork: "eip155:421614",
      networkLabel: "Arbitrum Sepolia Testnet",
      keywords: ["Uniswap"],
      ...swapNeedContract,
    }],
  });

  assert.equal(result.inspectedSchemas, 1);
  assert.equal(result.candidates[0]?.networkEvidence, "display_name");
  assert.notEqual(result.candidates[0]?.status, "incompatible");
});

test("Graph source discovery continues to a need's later search hint after a full generic result page", async () => {
  const searches: string[] = [];
  const irrelevant = Array.from({length: 10}, (_, index) => ({
    subgraphId: `sg-base-${index}`,
    displayName: `Protocol Base ${index}`,
    manifestIpfsCid: `QmBase${index}`,
  }));
  const graph: GraphPlanningMcpPort = {
    async searchSubgraphsByKeyword(value) {
      searches.push(value);
      const subgraphs = value === "Protocol"
        ? irrelevant
        : [{subgraphId: "sg-ethereum", displayName: "Protocol Ethereum", manifestIpfsCid: "QmEthereum"}];
      return {subgraphs, total: subgraphs.length, returned: subgraphs.length};
    },
    async getDeploymentActivity(values) {
      return values.map((manifestIpfsCid) => ({manifestIpfsCid, totalQueryCount30d: 100, dataPointsCount: 30}));
    },
    async getSchema(reference) {
      assert.equal(reference.id, "QmEthereum");
      return schema;
    },
    async getTopDeploymentsForContract() {
      throw new Error("not expected");
    },
    async close() {},
  };
  const result = await new GraphSourceDiscoveryService(graph).discover({
    needs: [{
      id: "ethereum-swaps",
      dataNetwork: "eip155:1",
      networkLabel: "Ethereum Mainnet",
      keywords: ["Protocol", "Protocol Ethereum"],
      ...swapNeedContract,
    }],
  });

  assert.deepEqual(searches, ["Protocol", "Protocol Ethereum"]);
  assert.equal(result.searchCalls, 2);
  assert.equal(result.candidates.find((candidate) => candidate.logicalSubgraphId === "sg-ethereum")?.status, "suitable");
});

test("Graph source discovery progressively inspects candidates independently for every source need", async () => {
  const calls: string[] = [];
  const incompleteSchema = `
    scalar BigInt
    scalar BigDecimal
    type Swap { id: ID!, timestamp: BigInt!, amountUSD: BigDecimal! }
    type Query { swaps(first: Int): [Swap!]! }
  `;
  const graph: GraphPlanningMcpPort = {
    async searchSubgraphsByKeyword(value) {
      calls.push(`search:${value}`);
      return {
        subgraphs: [
          {subgraphId: "sg-eth-bad", displayName: "Uniswap Ethereum Primary", manifestIpfsCid: "QmEthBad"},
          {subgraphId: "sg-eth-good", displayName: "Uniswap Ethereum Archive", manifestIpfsCid: "QmEthGood"},
          {subgraphId: "sg-arb-bad", displayName: "Uniswap Arbitrum Primary", manifestIpfsCid: "QmArbBad"},
          {subgraphId: "sg-arb-good", displayName: "Uniswap Arbitrum Archive", manifestIpfsCid: "QmArbGood"},
        ],
        total: 4,
        returned: 4,
      };
    },
    async getDeploymentActivity(values) {
      calls.push(`activity:${values.join(",")}`);
      const counts = new Map([
        ["QmEthBad", 1_000],
        ["QmEthGood", 900],
        ["QmArbBad", 800],
        ["QmArbGood", 700],
      ]);
      return values.map((manifestIpfsCid) => ({
        manifestIpfsCid,
        totalQueryCount30d: counts.get(manifestIpfsCid) ?? 0,
        dataPointsCount: 30,
      }));
    },
    async getSchema(reference) {
      calls.push(`schema:${reference.id}`);
      return reference.id.endsWith("Good") ? schema : incompleteSchema;
    },
    async getTopDeploymentsForContract() {
      throw new Error("not expected");
    },
    async close() {},
  };

  const result = await new GraphSourceDiscoveryService(graph, {
    maxSearchCallsPerNeed: 3,
    maxSearchResultsPerCall: 10,
    maxSchemaInspectionsPerNeed: 2,
    maxSchemaBytes: 5_242_880,
  }).discover({
    needs: [
      {
        id: "ethereum-swaps",
        dataNetwork: "eip155:1",
        networkLabel: "Ethereum Mainnet",
        keywords: ["Uniswap"],
        ...swapNeedContract,
      },
      {
        id: "arbitrum-swaps",
        dataNetwork: "eip155:42161",
        networkLabel: "Arbitrum One",
        keywords: ["Uniswap"],
        ...swapNeedContract,
      },
    ],
  });

  assert.equal(result.gatewayEnvironment, "mainnet");
  assert.equal(result.searchCalls, 1);
  assert.equal(result.inspectedSchemas, 4);
  assert.deepEqual(
    result.candidates.filter((candidate) => candidate.status === "suitable").map((candidate) => candidate.logicalSubgraphId),
    ["sg-eth-good", "sg-arb-good", "sg-eth-bad", "sg-arb-bad"],
  );
  assert.deepEqual(
    result.candidates.find((candidate) => candidate.logicalSubgraphId === "sg-eth-bad")?.entities[0]?.matchedRequirements,
    ["trade_id", "timestamp", "volume_usd"],
  );
  assert.deepEqual(
    result.candidates.find((candidate) => candidate.logicalSubgraphId === "sg-eth-good")?.entities[0]?.matchedRequirements,
    ["wallet", "trade_id", "timestamp", "volume_usd"],
  );
  assert.deepEqual(calls.filter((call) => call.startsWith("schema:")), [
    "schema:QmEthBad",
    "schema:QmEthGood",
    "schema:QmArbBad",
    "schema:QmArbGood",
  ]);
});

test("Agent derives search keywords before Graph MCP discovery and assesses composition afterward", async () => {
  const sequence: string[] = [];
  const debugEvents: AgentDebugEvent[] = [];
  let feasibilityRequest: AgentModelRequest | undefined;
  const graph: GraphPlanningMcpPort = {
    async searchSubgraphsByKeyword(value) {
      sequence.push(`mcp:search:${value}`);
      return {
        subgraphs: [
          {subgraphId: "sg-eth", displayName: "Uniswap V3 Ethereum", manifestIpfsCid: "QmEth"},
          {subgraphId: "sg-arb", displayName: "Uniswap V3 Arbitrum", manifestIpfsCid: "QmArb"},
        ],
        total: 2,
        returned: 2,
      };
    },
    async getDeploymentActivity(values) {
      sequence.push("mcp:activity");
      return values.map((manifestIpfsCid, index) => ({
        manifestIpfsCid,
        totalQueryCount30d: 1000 - index,
        dataPointsCount: 30,
      }));
    },
    async getSchema(reference) {
      sequence.push(`mcp:schema:${reference.id}`);
      return schema;
    },
    async getTopDeploymentsForContract() {
      throw new Error("not expected");
    },
    async close() {},
  };
  const model = {
    async complete(request: AgentModelRequest) {
      sequence.push(`model:${request.stage}`);
      if (request.stage === "source_feasibility") feasibilityRequest = request;
      return {provider: "mock" as const, model: "ordered-planner", output: createMockStageOutput(request)};
    },
  };

  const result = await new AgentHarness(model, undefined, new GraphSourceDiscoveryService(graph), (event) => {
    debugEvents.push(event);
  }).explore({
    intent: "Find wallets trading through Uniswap V3 on both Ethereum and Arbitrum.",
    availableNetworks: [
      {dataNetwork: "eip155:1", label: "Ethereum"},
      {dataNetwork: "eip155:42161", label: "Arbitrum"},
    ],
  });

  assert.equal(result.kind, "feasibility");
  if (result.kind !== "feasibility") return;
  assert.equal(result.readyForCompilation, false);
  assert.equal(result.model.calls, 3);
  assert.equal(result.feasibility.selections.length, 2);
  assert.equal(result.feasibility.composition.nodes.filter((node) => node.operator === "union").length, 1);
  assert.deepEqual(sequence, [
    "model:source_discovery_planning",
    "mcp:search:Uniswap V3",
    "mcp:search:Uniswap V3 Ethereum",
    "mcp:search:Uniswap V3 eth",
    "mcp:search:Uniswap V3 Arbitrum",
    "mcp:search:Uniswap V3 arbitrum one",
    "mcp:activity",
    "mcp:schema:QmEth",
    "mcp:schema:QmArb",
    "model:source_entity_selection",
    "model:source_feasibility",
  ]);
  const serializedRequest = JSON.stringify(feasibilityRequest);
  assert.equal(serializedRequest.includes("displayName"), false);
  assert.equal(serializedRequest.includes("execute_query"), false);
  assert.equal(serializedRequest.includes("type Query"), false);
  assert.match(result.blockers.join(" "), /Deployment ID/);
  assert.deepEqual(debugEvents.filter((event) => !("phase" in event)).map((event) => event.stage), [
    "source_discovery_planning",
    "graph_source_discovery",
    "source_entity_selection",
    "source_feasibility",
  ]);
  const planningDebug = debugEvents.find((event) => event.stage === "source_discovery_planning" && "searches" in event);
  assert.ok(planningDebug && "searches" in planningDebug);
  assert.deepEqual(planningDebug.searches, [
    {sourceNeedId: "source_1", keywords: ["Uniswap V3"]},
    {sourceNeedId: "source_2", keywords: ["Uniswap V3"]},
  ]);
  const discoveryDebug = debugEvents.find((event) => event.stage === "graph_source_discovery" && "candidateCount" in event);
  assert.ok(discoveryDebug && "candidateCount" in discoveryDebug);
  assert.equal(discoveryDebug.candidateCount, 4);
});

test("Agent uses broad protocol recall plus catalog network aliases without asset-pair overconstraint", async () => {
  let observedRequest: GraphSourceDiscoveryRequest | undefined;
  const harness = new AgentHarness({
    async complete(request: AgentModelRequest) {
      const output = createMockStageOutput(request);
      if (request.stage !== "source_discovery_planning") {
        return {provider: "mock", model: "network-asset-search-test", output};
      }
      const plan = output as SourceDiscoveryPlan;
      return {
        provider: "mock",
        model: "network-asset-search-test",
        output: {
          ...plan,
          semanticPlan: {
            ...plan.semanticPlan,
            sourceRequirements: plan.semanticPlan.sourceRequirements.map((need) => ({
              ...need,
              protocol: {name: "Uniswap", version: "V3"},
              assets: [
                {symbol: "WETH", networkAssetId: null},
                {symbol: "USDC", networkAssetId: null},
              ],
            })),
          },
          searches: plan.searches.map((search) => ({...search, keywords: ["Uniswap V3"]})),
        },
      };
    },
  }, undefined, {
    async discover(request) {
      observedRequest = request;
      throw new Error("stop-after-network-scoped-search-derivation");
    },
  });

  await assert.rejects(
    () => harness.explore({
      intent: "Compare WETH/USDC activity on Uniswap V3 across Ethereum and Arbitrum.",
      availableNetworks: [
        {dataNetwork: "eip155:1", label: "Ethereum Mainnet"},
        {dataNetwork: "eip155:42161", label: "Arbitrum One"},
      ],
    }),
    /stop-after-network-scoped-search-derivation/,
  );

  assert.ok(observedRequest);
  assert.deepEqual(observedRequest.needs.map((need) => [need.dataNetwork, need.keywords]), [
    ["eip155:1", [
      "Uniswap V3",
      "Uniswap V3 Ethereum",
      "Uniswap V3 eth",
    ]],
    ["eip155:42161", [
      "Uniswap V3",
      "Uniswap V3 Arbitrum One",
      "Uniswap V3 arbitrum",
    ]],
  ]);
});

test("Agent ranks relevant evidence first without hiding bounded schema fallback", async () => {
  let entitySelectionRequest: Extract<AgentModelRequest, {stage: "source_entity_selection"}> | undefined;
  let feasibilityRequest: Extract<AgentModelRequest, {stage: "source_feasibility"}> | undefined;
  const unrelatedEntities = Array.from({length: 5}, (_, index) => ({
    queryEntity: `unrelated${index}`,
    entityType: `Unrelated${index}`,
    fields: [{path: `metric${index}`, graphType: "BigDecimal", valueType: "decimal" as const, nullable: false, list: false}],
    suggestedBindings: [{requirementId: "record_id", fieldPaths: []}],
    matchedRequirements: [],
  }));
  const relevantEntity = {
    queryEntity: "swaps",
    entityType: "Swap",
    fields: [
      {path: "id", graphType: "ID", valueType: "id" as const, nullable: false, list: false},
      ...Array.from({length: 120}, (_, index) => ({
        path: `pool.metric${index}`,
        graphType: "BigDecimal",
        valueType: "decimal" as const,
        nullable: false,
        list: false,
      })),
    ],
    suggestedBindings: [{requirementId: "record_id", fieldPaths: ["id"]}],
    matchedRequirements: ["record_id"],
  };
  const harness = new AgentHarness({
    async complete(request: AgentModelRequest) {
      if (request.stage === "source_discovery_planning") {
        return {provider: "mock", model: "evidence-test", output: createMockStageOutput(request)};
      }
      if (request.stage === "source_entity_selection") {
        entitySelectionRequest = request;
        return {provider: "mock", model: "evidence-test", output: createMockStageOutput(request)};
      }
      if (request.stage !== "source_feasibility") throw new Error("Unexpected planning stage");
      feasibilityRequest = request;
      return {
        provider: "mock",
        model: "evidence-test",
        output: {schemaVersion: 1, kind: "clarification", questions: [{code: "confirm", question: "Confirm the source."}]},
      };
    },
  }, undefined, {
    async discover() {
      return {
        schemaVersion: 1 as const,
        provider: "the_graph" as const,
        gatewayEnvironment: "mainnet" as const,
        searchedNeeds: 1,
        searchCalls: 1,
        inspectedSchemas: 1,
        candidates: [{
          candidateRef: "graph:source_1:aaaaaaaaaaaaaaaaaaaa",
          sourceNeedId: "source_1",
          discoveryMethod: "keyword" as const,
          logicalSubgraphId: "sg",
          manifestIpfsCid: "QmEvidence",
          displayName: "Provider metadata",
          reportedNetwork: null,
          networkEvidence: "display_name" as const,
          totalQueryCount30d: 1,
          queryActivityEvidence: "observed" as const,
          schemaHash: "sha256:evidence",
          schemaBytes: 1,
          entities: [...unrelatedEntities, relevantEntity],
          status: "suitable" as const,
          score: 1,
          limitations: [],
        }],
        limits: {maxSearchCallsPerNeed: 3, maxSearchResultsPerCall: 10, maxSchemaInspectionsPerNeed: 10},
      };
    },
  });

  const result = await harness.explore({
    intent: "Read records from Ethereum.",
    availableNetworks: [{dataNetwork: "eip155:1", label: "Ethereum"}],
  });

  assert.equal(result.kind, "clarification");
  assert.deepEqual(entitySelectionRequest?.candidates[0]?.entities.map((entity) => entity.queryEntity), [
    "swaps",
    "unrelated0",
    "unrelated1",
    "unrelated2",
    "unrelated3",
    "unrelated4",
  ]);
  assert.equal(entitySelectionRequest?.candidates[0]?.entities[0]?.fieldCount, 121);
  assert.equal(JSON.stringify(entitySelectionRequest).includes("pool.metric119"), false);
  assert.deepEqual(feasibilityRequest?.candidates[0]?.entities.map((entity) => entity.queryEntity), ["swaps"]);
  const feasibilityEntity = feasibilityRequest?.candidates[0]?.entities[0];
  assert.equal(feasibilityEntity?.fields[0]?.path, "id");
  assert.equal(feasibilityEntity?.fieldCount, 121);
  assert.ok((feasibilityEntity?.fields.length ?? 121) < 121);
  assert.equal(
    feasibilityEntity?.omittedFieldCount,
    (feasibilityEntity?.fieldCount ?? 0) - (feasibilityEntity?.fields.length ?? 0),
  );
  assert.ok(new TextEncoder().encode(JSON.stringify(feasibilityEntity?.fields)).byteLength <= 12_002);
  assert.ok(feasibilityEntity?.suggestedBindings[0]?.fieldPaths.includes("id"));
});

test("Agent gives compact entity selection evidence a fair share across candidates", async () => {
  let entitySelectionRequest: Extract<AgentModelRequest, {stage: "source_entity_selection"}> | undefined;
  const candidate = (index: number) => ({
    candidateRef: `graph:source_1:${String(index).padStart(20, "a")}`,
    sourceNeedId: "source_1",
    discoveryMethod: "keyword" as const,
    logicalSubgraphId: `sg-${index}`,
    manifestIpfsCid: `QmFair${index}`,
    displayName: `Candidate ${index} Ethereum`,
    reportedNetwork: null,
    networkEvidence: "display_name" as const,
    totalQueryCount30d: 1,
    queryActivityEvidence: "observed" as const,
    schemaHash: `sha256:fair-${index}`,
    schemaBytes: 1,
    entities: Array.from({length: 8}, (_, entityIndex) => ({
      queryEntity: `records${index}_${entityIndex}`,
      entityType: `Record${index}_${entityIndex}`,
      fields: [{path: "id", graphType: "ID", valueType: "id" as const, nullable: false, list: false}],
      suggestedBindings: [{requirementId: "record_id", fieldPaths: ["id"]}],
      matchedRequirements: ["record_id"],
      grainHint: "matched" as const,
    })),
    status: "suitable" as const,
    score: 100 - index,
    limitations: [],
  });
  const harness = new AgentHarness({
    async complete(request: AgentModelRequest) {
      if (request.stage === "source_entity_selection") entitySelectionRequest = request;
      if (request.stage === "source_feasibility") {
        return {
          provider: "mock",
          model: "fair-evidence-test",
          output: {schemaVersion: 1, kind: "clarification", questions: [{code: "confirm", question: "Confirm the source."}]},
        };
      }
      return {provider: "mock", model: "fair-evidence-test", output: createMockStageOutput(request)};
    },
  }, undefined, {
    async discover() {
      return {
        schemaVersion: 1 as const,
        provider: "the_graph" as const,
        gatewayEnvironment: "mainnet" as const,
        searchedNeeds: 1,
        searchCalls: 1,
        inspectedSchemas: 3,
        candidates: [candidate(0), candidate(1), candidate(2)],
        limits: {maxSearchCallsPerNeed: 3, maxSearchResultsPerCall: 10, maxSchemaInspectionsPerNeed: 10},
      };
    },
  });

  await harness.explore({
    intent: "Read records from Ethereum.",
    availableNetworks: [{dataNetwork: "eip155:1", label: "Ethereum"}],
  });

  assert.deepEqual(entitySelectionRequest?.candidates.map((item) => item.entities.length), [6, 5, 5]);
});

test("Agent rejects a feasibility field path omitted from the bounded model view", async () => {
  let feasibilityRequest: Extract<AgentModelRequest, {stage: "source_feasibility"}> | undefined;
  const fields = [
    {path: "id", graphType: "ID", valueType: "id" as const, nullable: false, list: false},
    ...Array.from({length: 140}, (_, index) => ({
      path: `nested.reference${String(index).padStart(3, "0")}`,
      graphType: "ID",
      valueType: "id" as const,
      nullable: false,
      list: false,
    })),
    {path: "nested.zzz", graphType: "ID", valueType: "id" as const, nullable: false, list: false},
  ];
  const harness = new AgentHarness({
    async complete(request: AgentModelRequest) {
      const output = createMockStageOutput(request);
      if (request.stage !== "source_feasibility") {
        return {provider: "mock", model: "bounded-field-view-test", output};
      }
      feasibilityRequest = request;
      const plan = output as SourceFeasibilityPlan;
      return {
        provider: "mock",
        model: "bounded-field-view-test",
        output: {
          ...plan,
          selections: plan.selections.map((selection) => ({
            ...selection,
            fieldBindings: [{requirementId: "record_id", fieldPath: "nested.zzz"}],
          })),
        },
      };
    },
  }, undefined, {
    async discover() {
      return {
        schemaVersion: 1 as const,
        provider: "the_graph" as const,
        gatewayEnvironment: "mainnet" as const,
        searchedNeeds: 1,
        searchCalls: 1,
        inspectedSchemas: 1,
        candidates: [{
          candidateRef: "graph:source_1:aaaaaaaaaaaaaaaaaaaa",
          sourceNeedId: "source_1",
          discoveryMethod: "keyword" as const,
          logicalSubgraphId: "sg-bounded-fields",
          manifestIpfsCid: "QmBoundedFields",
          displayName: "Bounded Fields Ethereum",
          reportedNetwork: null,
          networkEvidence: "display_name" as const,
          totalQueryCount30d: 1,
          queryActivityEvidence: "observed" as const,
          schemaHash: "sha256:bounded-fields",
          schemaBytes: 1,
          entities: [{
            queryEntity: "records",
            entityType: "Record",
            fields,
            suggestedBindings: [{requirementId: "record_id", fieldPaths: ["id"]}],
            matchedRequirements: ["record_id"],
            grainHint: "matched" as const,
          }],
          status: "suitable" as const,
          score: 1,
          limitations: [],
        }],
        limits: {maxSearchCallsPerNeed: 3, maxSearchResultsPerCall: 10, maxSchemaInspectionsPerNeed: 10},
      };
    },
  });

  await assert.rejects(
    () => harness.explore({
      intent: "Read records from Ethereum.",
      availableNetworks: [{dataNetwork: "eip155:1", label: "Ethereum"}],
    }),
    (error: unknown) => error instanceof HarnessValidationError
      && error.code === "FEASIBILITY_FIELD_BINDING_INVALID",
  );
  const presentedEntity = feasibilityRequest?.candidates[0]?.entities[0];
  assert.equal(presentedEntity?.fieldCount, fields.length);
  assert.ok((presentedEntity?.omittedFieldCount ?? 0) > 0);
  assert.equal(presentedEntity?.fields.some((field) => field.path === "nested.zzz"), false);
});

test("Agent uses embedding similarity to order compact entity evidence before model selection", async () => {
  let entitySelectionRequest: Extract<AgentModelRequest, {stage: "source_entity_selection"}> | undefined;
  const trace: HarnessTraceEvent[] = [];
  const entity = (queryEntity: string) => ({
    queryEntity,
    entityType: queryEntity === "opaqueRows" ? "OpaqueRow" : "GenericRow",
    fields: [{path: "id", graphType: "ID", valueType: "id" as const, nullable: false, list: false}],
    suggestedBindings: [],
    matchedRequirements: [],
    grainHint: "unknown" as const,
  });
  const harness = new AgentHarness({
    async complete(request: AgentModelRequest) {
      if (request.stage === "source_entity_selection") {
        entitySelectionRequest = request;
        return {
          provider: "mock",
          model: "embedding-order-test",
          output: {schemaVersion: 1, kind: "clarification", questions: [{code: "confirm", question: "Confirm."}]},
        };
      }
      return {provider: "mock", model: "embedding-order-test", output: createMockStageOutput(request)};
    },
  }, undefined, {
    async discover() {
      return {
        schemaVersion: 1 as const,
        provider: "the_graph" as const,
        gatewayEnvironment: "mainnet" as const,
        searchedNeeds: 1,
        searchCalls: 1,
        inspectedSchemas: 1,
        candidates: [{
          candidateRef: "graph:source_1:aaaaaaaaaaaaaaaaaaaa",
          sourceNeedId: "source_1",
          discoveryMethod: "keyword" as const,
          logicalSubgraphId: "sg-embedding",
          manifestIpfsCid: "QmEmbedding",
          displayName: "Opaque Protocol Ethereum",
          reportedNetwork: null,
          networkEvidence: "display_name" as const,
          totalQueryCount30d: 0,
          queryActivityEvidence: "observed" as const,
          schemaHash: "sha256:embedding",
          schemaBytes: 1,
          entities: [entity("genericRows"), entity("opaqueRows")],
          status: "suitable" as const,
          score: 1,
          limitations: [],
        }],
        limits: {maxSearchCallsPerNeed: 3, maxSearchResultsPerCall: 10, maxSchemaInspectionsPerNeed: 10},
      };
    },
  }, undefined, {
    async rank(_need, inputs, _signal, onProgress) {
      onProgress?.({phase: "batch_started", entityCount: inputs.length, batchNumber: 1, batchCount: 1});
      onProgress?.({phase: "batch_completed", entityCount: inputs.length, batchNumber: 1, batchCount: 1});
      onProgress?.({phase: "similarity_started", entityCount: inputs.length, batchCount: 1});
      const scores = inputs.map((input) => ({
        candidateRef: input.candidateRef,
        queryEntity: input.entity.queryEntity,
        similarity: input.entity.queryEntity === "opaqueRows" ? 0.91 : 0.12,
      }));
      onProgress?.({phase: "completed", entityCount: inputs.length, batchCount: 1});
      return scores;
    },
  });

  await harness.explore({
    intent: "Read records from Ethereum.",
    availableNetworks: [{dataNetwork: "eip155:1", label: "Ethereum"}],
  }, undefined, (event) => trace.push(event));

  assert.equal(entitySelectionRequest?.candidates[0]?.displayName, "Opaque Protocol Ethereum");
  assert.equal(entitySelectionRequest?.candidates[0]?.entities[0]?.queryEntity, "opaqueRows");
  assert.equal(entitySelectionRequest?.candidates[0]?.entities[0]?.rankingEvidence, "embedding");
  assert.equal(entitySelectionRequest?.candidates[0]?.entities[0]?.semanticSimilarity, 0.91);
  const retrievalTrace = trace.filter((event) => event.stage === "semantic_entity_retrieval");
  assert.deepEqual(retrievalTrace.map((event) => event.status), ["started", "started", "started", "passed"]);
  assert.match(retrievalTrace[1]?.summary ?? "", /embedding batch 1\/1/);
  assert.match(retrievalTrace[2]?.summary ?? "", /Computing cosine similarity for 2 entities/);
  assert.match(retrievalTrace[3]?.summary ?? "", /Embedded 2 inspected entities in 1 batch and retained 2 compact candidates/);
  assert.ok(trace.findIndex((event) => event.stage === "semantic_entity_retrieval" && event.status === "passed")
    < trace.findIndex((event) => event.stage === "source_entity_selection" && event.status === "started"));
});

test("Agent embeds all fields only after the model selects an entity", async () => {
  let suppliedFieldCount = 0;
  let feasibilityRequest: Extract<AgentModelRequest, {stage: "source_feasibility"}> | undefined;
  const trace: HarnessTraceEvent[] = [];
  const fields = [
    {path: "id", graphType: "ID", valueType: "id" as const, nullable: false, list: false},
    ...Array.from({length: 128}, (_, index) => ({
      path: `provider.metric${index}`,
      graphType: "String",
      valueType: "string" as const,
      nullable: false,
      list: false,
    })),
  ];
  const harness = new AgentHarness({
    async complete(request: AgentModelRequest) {
      if (request.stage === "source_feasibility") {
        feasibilityRequest = request;
        return {
          provider: "mock",
          model: "hierarchical-field-retrieval-test",
          output: {schemaVersion: 1, kind: "clarification", questions: [{code: "confirm", question: "Confirm."}]},
        };
      }
      return {provider: "mock", model: "hierarchical-field-retrieval-test", output: createMockStageOutput(request)};
    },
  }, undefined, {
    async discover() {
      return {
        schemaVersion: 1 as const,
        provider: "the_graph" as const,
        gatewayEnvironment: "mainnet" as const,
        searchedNeeds: 1,
        searchCalls: 1,
        inspectedSchemas: 1,
        candidates: [{
          candidateRef: "graph:source_1:bbbbbbbbbbbbbbbbbbbb",
          sourceNeedId: "source_1",
          discoveryMethod: "keyword" as const,
          logicalSubgraphId: "sg-fields",
          manifestIpfsCid: "QmFields",
          displayName: "Selected schema Ethereum",
          reportedNetwork: null,
          networkEvidence: "display_name" as const,
          totalQueryCount30d: 1,
          queryActivityEvidence: "observed" as const,
          schemaHash: "sha256:fields",
          schemaBytes: 1,
          entities: [{
            queryEntity: "records",
            entityType: "Record",
            fields,
            suggestedBindings: [{requirementId: "record_id", fieldPaths: ["id"]}],
            matchedRequirements: ["record_id"],
            grainHint: "matched" as const,
          }],
          status: "suitable" as const,
          score: 1,
          limitations: [],
        }],
        limits: {maxSearchCallsPerNeed: 3, maxSearchResultsPerCall: 10, maxSchemaInspectionsPerNeed: 10},
      };
    },
  }, undefined, {
    async rank(_need, inputs) {
      return inputs.map((input) => ({
        candidateRef: input.candidateRef,
        queryEntity: input.entity.queryEntity,
        similarity: 1,
      }));
    },
    async rankFields(need, input, _signal, onProgress) {
      suppliedFieldCount = input.entity.fields.length;
      const batchCount = Math.ceil((input.entity.fields.length + need.fields.length) / 10);
      onProgress?.({
        phase: "batch_started",
        fieldCount: input.entity.fields.length,
        requirementCount: need.fields.length,
        batchNumber: 1,
        batchCount,
      });
      const scores = need.fields.flatMap((requirement) => input.entity.fields.map((field, index) => ({
        requirementId: requirement.id,
        fieldPath: field.path,
        similarity: field.path === "provider.metric127" ? 1 : 0.5 - index / 1000,
      })));
      onProgress?.({
        phase: "similarity_started",
        fieldCount: input.entity.fields.length,
        requirementCount: need.fields.length,
        batchCount,
      });
      onProgress?.({
        phase: "completed",
        fieldCount: input.entity.fields.length,
        requirementCount: need.fields.length,
        batchCount,
      });
      return scores;
    },
  });

  const result = await harness.explore({
    intent: "Read records from Ethereum.",
    availableNetworks: [{dataNetwork: "eip155:1", label: "Ethereum"}],
  }, undefined, (event) => trace.push(event));

  assert.equal(result.kind, "clarification");
  assert.equal(suppliedFieldCount, fields.length);
  assert.ok(feasibilityRequest?.candidates[0]?.entities[0]?.fields.some((field) => field.path === "provider.metric127"));
  assert.ok((feasibilityRequest?.candidates[0]?.entities[0]?.fields.length ?? fields.length) < fields.length);
  assert.ok(trace.some((event) => event.stage === "semantic_field_retrieval" && event.status === "passed"));
  assert.ok(trace.findIndex((event) => event.stage === "source_entity_selection" && event.status === "passed")
    < trace.findIndex((event) => event.stage === "semantic_field_retrieval" && event.status === "started"));
});

test("Agent repairs an unsupported source claim contradicted by inspected field evidence", async () => {
  const requests: AgentModelRequest[] = [];
  const graph: GraphPlanningMcpPort = {
    async searchSubgraphsByKeyword() {
      return {
        subgraphs: [{subgraphId: "sg", displayName: "Protocol Ethereum", manifestIpfsCid: "QmRepair"}],
        total: 1,
        returned: 1,
      };
    },
    async getDeploymentActivity() {
      return [{manifestIpfsCid: "QmRepair", totalQueryCount30d: 1, dataPointsCount: 1}];
    },
    async getSchema() { return `type Record { id: ID! } type Query { records(first: Int): [Record!]! }`; },
    async getTopDeploymentsForContract() { throw new Error("not expected"); },
    async close() {},
  };
  const harness = new AgentHarness({
    async complete(request: AgentModelRequest) {
      requests.push(request);
      if (request.stage === "source_discovery_planning" || request.stage === "source_entity_selection") {
        return {provider: "mock", model: "repair-test", output: createMockStageOutput(request)};
      }
      if (request.stage === "source_feasibility" && !("repair" in request && request.repair)) {
        return {
          provider: "mock",
          model: "repair-test",
          output: {
            schemaVersion: 1,
            kind: "unsupported",
            code: "source_facts_unavailable",
            reason: "No inspected candidate entities or fields were supplied.",
            missingFacts: ["eip155:1:record_id"],
          },
        };
      }
      return {provider: "mock", model: "repair-test", output: createMockStageOutput(request)};
    },
  }, undefined, new GraphSourceDiscoveryService(graph));

  const result = await harness.explore({
    intent: "Read protocol records on Ethereum.",
    availableNetworks: [{dataNetwork: "eip155:1", label: "Ethereum"}],
  });

  assert.equal(result.kind, "feasibility");
  if (result.kind !== "feasibility") return;
  assert.equal(result.model.calls, 4);
  const repair = requests[3] && "repair" in requests[3] ? requests[3].repair : undefined;
  assert.equal(repair?.reason, "unsupported_evidence_conflict");
  assert.equal(repair?.counterEvidence?.[0]?.sourceNeedId, "source_1");
  assert.match(repair?.counterEvidence?.[0]?.candidateRef ?? "", /^graph:source_1:[a-f0-9]{20}$/);
  assert.equal(repair?.counterEvidence?.[0]?.queryEntity, "records");
  assert.deepEqual(repair?.counterEvidence?.[0]?.matchedRequiredFields, ["record_id"]);
});

test("Agent can select inspected fields when no lexical grain or field hint matches", async () => {
  let feasibilityRequest: Extract<AgentModelRequest, {stage: "source_feasibility"}> | undefined;
  let auxiliaryPurpose: "filter" | "join" = "filter";
  const graph: GraphPlanningMcpPort = {
    async searchSubgraphsByKeyword() {
      return {
        subgraphs: [{subgraphId: "sg-obscura", displayName: "Obscura Ethereum", manifestIpfsCid: "QmObscura"}],
        total: 1,
        returned: 1,
      };
    },
    async getDeploymentActivity() {
      return [{manifestIpfsCid: "QmObscura", totalQueryCount30d: 1, dataPointsCount: 1}];
    },
    async getSchema() {
      return `
        scalar BigDecimal
        type Payload { zorb: BigDecimal!, flarn: String! }
        type Obscura { payload: Payload! }
        type QuuxFrobnitz { mysteryMetric: BigDecimal! }
        type Query {
          obscuras(first: Int): [Obscura!]!
          quuxFrobnitzes(first: Int): [QuuxFrobnitz!]!
        }
      `;
    },
    async getTopDeploymentsForContract() { throw new Error("not expected"); },
    async close() {},
  };
  const harness = new AgentHarness({
    async complete(request: AgentModelRequest) {
      if (request.stage === "source_discovery_planning") {
        return {
          provider: "mock",
          model: "unknown-vocabulary-test",
          output: {
            schemaVersion: 3,
            kind: "source_discovery_plan",
            semanticPlan: {
              schemaVersion: 3,
              kind: "semantic_plan",
              summary: "Return the requested observation.",
              sourceRequirements: [{
                id: "unknown_observation",
                dataNetwork: "eip155:1",
                protocol: null,
                assets: [],
                description: "Read the requested provider-specific observation.",
                grain: "quux_frobnitz",
                fields: [{
                  id: "observation_value",
                  description: "The requested provider-specific measurement.",
                  expectedType: "decimal",
                  unit: null,
                  required: true,
                  allowNullable: false,
                  hints: ["mysteryMetric"],
                }],
                constraints: ["Include only observations whose provider kind is eligible."],
              }],
              result: {
                description: "Provider-specific observations.",
                grain: "quux_frobnitz",
                fields: [{name: "observation_value", description: "Measurement.", type: "decimal", unit: null, nullable: false}],
                orderBy: [],
              },
              refresh: {mode: "manual", timezone: "UTC"},
              assumptions: [],
              unresolved: [],
            },
            searches: [{sourceNeedId: "unknown_observation", keywords: ["Obscura"]}],
          },
        };
      }
      if (request.stage === "source_entity_selection") {
        return {
          provider: "mock",
          model: "unknown-vocabulary-test",
          output: {
            schemaVersion: 1,
            kind: "source_entity_selection",
            selections: [{
              sourceNeedId: "unknown_observation",
              candidateRef: request.candidates[0]!.candidateRef,
              queryEntity: "obscuras",
              rationale: "The entity exposes the requested provider-specific observation grain.",
            }],
            assumptions: [],
          },
        };
      }
      if (request.stage !== "source_feasibility") throw new Error("Unexpected planning stage");
      feasibilityRequest = request;
      return {
        provider: "mock",
        model: "unknown-vocabulary-test",
        output: {
          schemaVersion: 2,
          kind: "source_feasibility",
          selections: [{
            sourceNeedId: "unknown_observation",
            candidateRef: request.candidates[0]!.candidateRef,
            queryEntity: "obscuras",
            fieldBindings: [{requirementId: "observation_value", fieldPath: "payload.zorb"}],
            auxiliaryFieldBindings: [{name: "observation_kind", fieldPath: "payload.flarn", purpose: auxiliaryPurpose}],
            queryPlan: {
              schemaVersion: 1,
              operationName: "SprueLiveSource",
              document: "query SprueLiveSource($first: Int!, $cursor: ID!) { obscuras(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor }) { id payload { flarn zorb } } }",
              pagination: {kind: "id_cursor", cursorField: "id", pageSize: 500, maxRequests: 20, maxRows: 10_000},
              pushedOperations: [{nodeRole: "normalize_observations", operator: "map", description: "Project inspected observation fields."}],
            },
            rationale: "The inspected provider field has the required scalar type and requested meaning.",
          }],
          composition: {
            schemaVersion: 2,
            kind: "composition_intent",
            nodes: [
              {
                role: "normalize_observations",
                operator: "map",
                operatorVersion: "2",
                config: {
                  mode: "project",
                  fields: [
                    {name: "observation_value", expression: {op: "field", field: "payload.zorb"}, unit: null},
                    {name: "observation_kind", expression: {op: "field", field: "payload.flarn"}, unit: null},
                    {name: "data_network", expression: {op: "field", field: "data_network"}, unit: null},
                  ],
                },
              },
              {
                role: "filter_observations",
                operator: "filter",
                operatorVersion: "2",
                config: {
                  expression: {
                    op: "eq",
                    inputs: [
                      {op: "field", field: "observation_kind"},
                      {op: "literal", valueType: "string", value: "eligible"},
                    ],
                  },
                },
              },
              {
                role: "output_observations",
                operator: "output",
                operatorVersion: "3",
                config: {fields: ["observation_value"]},
              },
            ],
            connections: [
              {fromRole: "source__unknown_observation", toRole: "normalize_observations", inputRole: "rows"},
              {fromRole: "normalize_observations", toRole: "filter_observations", inputRole: "rows"},
              {fromRole: "filter_observations", toRole: "output_observations", inputRole: "rows"},
            ],
            templateInstances: [],
          },
          assumptions: [],
        },
      };
    },
  }, undefined, new GraphSourceDiscoveryService(graph));

  const result = await harness.explore({
    intent: "Return the Obscura observation.",
    availableNetworks: [{dataNetwork: "eip155:1", label: "Ethereum"}],
  });

  assert.equal(result.kind, "feasibility");
  const obscureEntity = feasibilityRequest?.candidates[0]?.entities.find((entity) => entity.queryEntity === "obscuras");
  assert.deepEqual(obscureEntity?.matchedRequirements, []);
  assert.equal(obscureEntity?.grainHint, "unknown");
  assert.deepEqual(obscureEntity?.fields.map((field) => field.path), ["payload.zorb", "payload.flarn"]);
  if (result.kind === "feasibility") {
    assert.deepEqual(result.feasibility.selections[0]?.auxiliaryFieldBindings, [
      {name: "observation_kind", fieldPath: "payload.flarn", purpose: "filter"},
    ]);
  }

  auxiliaryPurpose = "join";
  await assert.rejects(
    () => harness.explore({
      intent: "Return the eligible Obscura observation.",
      availableNetworks: [{dataNetwork: "eip155:1", label: "Ethereum"}],
    }),
    (error: unknown) => error instanceof HarnessValidationError
      && error.code === "FEASIBILITY_AUXILIARY_FIELD_UNUSED",
  );
});

test("Agent performs one bounded repair when source-planning tool arguments fail schema validation", async () => {
  const requests: AgentModelRequest[] = [];
  const debugEvents: AgentDebugEvent[] = [];
  let discoveryCalled = false;
  const harness = new AgentHarness({
    async complete(request: AgentModelRequest) {
      requests.push(request);
      return requests.length === 1
        ? {provider: "mock" as const, model: "repair-test", output: {schemaVersion: 1, kind: "source_discovery_plan"}}
        : {
            provider: "mock" as const,
            model: "repair-test",
            output: {
              schemaVersion: 1,
              kind: "clarification",
              questions: [{code: "scope_confirmation", question: "Confirm the requested network scope."}],
            },
          };
    },
  }, undefined, {
    async discover() {
      discoveryCalled = true;
      throw new Error("must not run after clarification");
    },
  }, (event) => debugEvents.push(event));

  const result = await harness.explore({
    intent: "Find cross-chain swap wallets on Ethereum and Arbitrum.",
    availableNetworks: [
      {dataNetwork: "eip155:1", label: "Ethereum"},
      {dataNetwork: "eip155:42161", label: "Arbitrum"},
    ],
  });

  assert.equal(result.kind, "clarification");
  assert.equal(result.model.calls, 2);
  assert.equal(discoveryCalled, false);
  assert.equal(requests[1]?.stage, "source_discovery_planning");
  assert.deepEqual(requests[1] && "repair" in requests[1] ? requests[1].repair : undefined, {
    attempt: 1,
    reason: "schema_validation_failed",
    path: "schemaVersion",
    issueCode: "invalid_value",
  });
  const schemaFailure = debugEvents.find((event) => "phase" in event && event.phase === "schema_validation_failed");
  assert.ok(schemaFailure && "schemaIssueMessage" in schemaFailure);
  assert.match(schemaFailure.validationMessage ?? "", /schemaVersion/);
  assert.match(schemaFailure.schemaIssueMessage ?? "", /Invalid input/);
});

test("Agent defers non-blocking discovery notes instead of rejecting a complete source plan", async () => {
  const debugEvents: AgentDebugEvent[] = [];
  const requests: AgentModelRequest[] = [];
  let discoveryCalled = false;
  const sourceDiscoverableNote = "The exact provider deployment and query entity must be selected from inspected metadata.";
  const harness = new AgentHarness({
    async complete(request: AgentModelRequest) {
      requests.push(request);
      const output = createMockStageOutput(request);
      if (request.stage === "source_discovery_planning") {
        (output as {semanticPlan: {unresolved: string[]}}).semanticPlan.unresolved = [sourceDiscoverableNote];
      }
      return {provider: "mock" as const, model: "debug-test", output};
    },
  }, undefined, {
    async discover() {
      discoveryCalled = true;
      return {
        schemaVersion: 1,
        provider: "the_graph",
        gatewayEnvironment: "mainnet",
        searchedNeeds: 2,
        searchCalls: 2,
        inspectedSchemas: 0,
        candidates: [],
        limits: {maxSearchCallsPerNeed: 3, maxSearchResultsPerCall: 10, maxSchemaInspectionsPerNeed: 10},
      };
    },
  }, (event) => debugEvents.push(event));

  const result = await harness.explore({
    intent: "Compare protocol activity on Ethereum and Arbitrum.",
    availableNetworks: [
      {dataNetwork: "eip155:1", label: "Ethereum"},
      {dataNetwork: "eip155:42161", label: "Arbitrum"},
    ],
  });

  assert.equal(result.kind, "unsupported");
  assert.equal(discoveryCalled, true);
  const received = debugEvents.find((event) => "phase" in event && event.phase === "model_response_received");
  assert.ok(received && "outputBytes" in received);
  assert.equal(received.callNumber, 1);
  assert.equal(received.outputKind, "source_discovery_plan");
  assert.equal(received.unresolvedCount, 1);
  assert.equal(received.sourceRequirementCount, 2);
  assert.equal(received.searchCount, 2);
  assert.equal((received.modelOutput as {semanticPlan: {unresolved: string[]}}).semanticPlan.unresolved[0], sourceDiscoverableNote);

  const entitySelectionRequest = requests.find((request) => request.stage === "source_entity_selection");
  assert.ok(entitySelectionRequest && entitySelectionRequest.stage === "source_entity_selection");
  assert.deepEqual(entitySelectionRequest.semanticPlan.unresolved, []);
  assert.ok(entitySelectionRequest.semanticPlan.assumptions.includes(sourceDiscoverableNote));
  const planningSummary = debugEvents.find((event) => event.stage === "source_discovery_planning" && "searches" in event);
  assert.equal(planningSummary?.deferredDiscoveryNoteCount, 1);
});

test("Agent accepts independent per-network search hints beyond the former global keyword limit", async () => {
  let discoveryCalled = false;
  const harness = new AgentHarness({
    async complete(request: AgentModelRequest) {
      const output = createMockStageOutput(request);
      if (request.stage !== "source_discovery_planning") {
        return {provider: "mock", model: "search-limit-test", output};
      }
      const plan = output as ReturnType<typeof createMockStageOutput> & {
        searches: {sourceNeedId: string; keywords: string[]}[];
      };
      return {
        provider: "mock",
        model: "search-limit-test",
        output: {
          ...plan,
          searches: [
            {sourceNeedId: "source_1", keywords: ["Uniswap V3", "DEX swaps"]},
            {sourceNeedId: "source_2", keywords: ["AMM trades", "Swap events"]},
          ],
        },
      };
    },
  }, undefined, {
    async discover() {
      discoveryCalled = true;
      return {
        schemaVersion: 1,
        provider: "the_graph",
        gatewayEnvironment: "mainnet",
        searchedNeeds: 2,
        searchCalls: 4,
        inspectedSchemas: 0,
        candidates: [],
        limits: {maxSearchCallsPerNeed: 3, maxSearchResultsPerCall: 10, maxSchemaInspectionsPerNeed: 10},
      };
    },
  });

  const result = await harness.explore({
    intent: "Find cross-chain swap wallets on Ethereum and Arbitrum.",
    availableNetworks: [
      {dataNetwork: "eip155:1", label: "Ethereum"},
      {dataNetwork: "eip155:42161", label: "Arbitrum"},
    ],
  });
  assert.equal(discoveryCalled, true);
  assert.equal(result.kind, "unsupported");
});

test("Agent rejects a candidate reference invented during compact entity selection", async () => {
  const harness = new AgentHarness({
    async complete(request: AgentModelRequest) {
      const output = createMockStageOutput(request);
      if (request.stage !== "source_entity_selection") {
        return {provider: "mock", model: "entity-selection-boundary-test", output};
      }
      const selection = output as {
        schemaVersion: 1;
        kind: "source_entity_selection";
        selections: Array<Record<string, unknown>>;
        assumptions: string[];
      };
      return {
        provider: "mock",
        model: "entity-selection-boundary-test",
        output: {
          ...selection,
          selections: selection.selections.map((value, index) => index === 0
            ? {...value, candidateRef: "graph:eip155_1_swap_events:cccccccccccccccccccc"}
            : value),
        },
      };
    },
  }, undefined, {
    async discover() {
      return {
        schemaVersion: 1,
        provider: "the_graph",
        gatewayEnvironment: "mainnet",
        searchedNeeds: 2,
        searchCalls: 1,
        inspectedSchemas: 2,
        candidates: [
          {
            candidateRef: "graph:source_1:aaaaaaaaaaaaaaaaaaaa",
            sourceNeedId: "source_1",
            discoveryMethod: "keyword",
            logicalSubgraphId: "sg-eth",
            manifestIpfsCid: "QmEth",
            displayName: "Untrusted Ethereum label",
            reportedNetwork: null,
            networkEvidence: "display_name",
            totalQueryCount30d: 100,
            queryActivityEvidence: "observed",
            schemaHash: "sha256:eth",
            schemaBytes: 100,
            entities: [{
              queryEntity: "swaps",
              entityType: "Swap",
              fields: [{path: "id", graphType: "ID!", valueType: "id", nullable: false, list: false}],
              suggestedBindings: [{requirementId: "record_id", fieldPaths: ["id"]}],
              matchedRequirements: ["record_id"],
            }],
            status: "suitable",
            score: 100,
            limitations: ["Deployment ID remains unresolved."],
          },
          {
            candidateRef: "graph:source_2:bbbbbbbbbbbbbbbbbbbb",
            sourceNeedId: "source_2",
            discoveryMethod: "keyword",
            logicalSubgraphId: "sg-arb",
            manifestIpfsCid: "QmArb",
            displayName: "Untrusted Arbitrum label",
            reportedNetwork: null,
            networkEvidence: "display_name",
            totalQueryCount30d: 100,
            queryActivityEvidence: "observed",
            schemaHash: "sha256:arb",
            schemaBytes: 100,
            entities: [{
              queryEntity: "swaps",
              entityType: "Swap",
              fields: [{path: "id", graphType: "ID!", valueType: "id", nullable: false, list: false}],
              suggestedBindings: [{requirementId: "record_id", fieldPaths: ["id"]}],
              matchedRequirements: ["record_id"],
            }],
            status: "suitable",
            score: 100,
            limitations: ["Deployment ID remains unresolved."],
          },
        ],
        limits: {maxSearchCallsPerNeed: 3, maxSearchResultsPerCall: 10, maxSchemaInspectionsPerNeed: 10},
      };
    },
  });

  await assert.rejects(
    () => harness.explore({
      intent: "Find cross-chain swap wallets on Ethereum and Arbitrum.",
      availableNetworks: [
        {dataNetwork: "eip155:1", label: "Ethereum"},
        {dataNetwork: "eip155:42161", label: "Arbitrum"},
      ],
    }),
    (error: unknown) => error instanceof HarnessValidationError && error.code === "ENTITY_SELECTION_CANDIDATE_INVALID",
  );
});

test("Agent validates schema-driven time-series fields without a wallet-shaped special case", async () => {
  const model = {
    async complete(request: AgentModelRequest) {
      if (request.stage === "source_discovery_planning") {
        return {
          provider: "mock" as const,
          model: "generic-planner",
          output: {
            schemaVersion: 3,
            kind: "source_discovery_plan",
            semanticPlan: {
              schemaVersion: 3,
              kind: "semantic_plan",
              summary: "Produce daily value statistics.",
              sourceRequirements: [{
                id: "metric_events",
                dataNetwork: "eip155:1",
                protocol: {name: "Protocol", version: null},
                assets: [],
                description: "Raw metric events.",
                grain: "event",
                fields: [
                  {id: "event_time", description: "Event timestamp.", expectedType: "timestamp", unit: null, required: true, allowNullable: false, hints: ["blockTimestamp"]},
                  {id: "raw_value", description: "Numeric event value.", expectedType: "decimal", unit: "USD", required: true, allowNullable: false, hints: ["amountUSD"]},
                ],
                constraints: ["Use complete UTC dates."],
              }],
              result: {
                description: "Daily aggregate statistics.",
                grain: "utc_day",
                fields: [
                  {name: "day", description: "UTC date.", type: "date", unit: null, nullable: false},
                  {name: "total_value", description: "Daily total.", type: "decimal", unit: "USD", nullable: false},
                  {name: "average_value", description: "Daily average.", type: "decimal", unit: "USD", nullable: false},
                ],
                orderBy: [{field: "day", direction: "asc"}],
              },
              refresh: {mode: "scheduled", timezone: "UTC"},
              assumptions: [],
              unresolved: [],
            },
            searches: [{sourceNeedId: "metric_events", keywords: ["protocol metrics"]}],
          },
        };
      }
      if (request.stage === "source_entity_selection") {
        return {
          provider: "mock" as const,
          model: "generic-planner",
          output: {
            schemaVersion: 1,
            kind: "source_entity_selection",
            selections: [{
              sourceNeedId: "metric_events",
              candidateRef: "graph:metric_events:aaaaaaaaaaaaaaaaaaaa",
              queryEntity: "metricEvents",
              rationale: "The entity represents the requested event grain.",
            }],
            assumptions: [],
          },
        };
      }
      if (request.stage !== "source_feasibility") throw new Error("Unexpected planning stage");
      return {
        provider: "mock" as const,
        model: "generic-planner",
        output: {
          schemaVersion: 2,
          kind: "source_feasibility",
          selections: [{
            sourceNeedId: "metric_events",
            candidateRef: "graph:metric_events:aaaaaaaaaaaaaaaaaaaa",
            queryEntity: "metricEvents",
            fieldBindings: [
              {requirementId: "event_time", fieldPath: "blockTimestamp"},
              {requirementId: "raw_value", fieldPath: "amountUSD"},
            ],
            auxiliaryFieldBindings: [],
            queryPlan: {
              schemaVersion: 1,
              operationName: "SprueLiveSource",
              document: "query SprueLiveSource($first: Int!, $cursor: ID!) { metricEvents(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor }) { id amountUSD blockTimestamp } }",
              pagination: {kind: "id_cursor", cursorField: "id", pageSize: 500, maxRequests: 20, maxRows: 10_000},
              pushedOperations: [{nodeRole: "derive_day", operator: "map", description: "Project inspected metric fields."}],
            },
            rationale: "Both semantic fields are present on the inspected entity.",
          }],
          composition: {
            schemaVersion: 2,
            kind: "composition_intent",
            nodes: [
              {
                role: "derive_day",
                operator: "map",
                operatorVersion: "2",
                config: {
                  mode: "project",
                  fields: [
                    {name: "day", expression: {op: "utc_date", inputs: [{op: "field", field: "blockTimestamp"}]}, unit: null},
                    {name: "raw_value", expression: {op: "field", field: "amountUSD"}, unit: "USD"},
                    {name: "data_network", expression: {op: "field", field: "data_network"}, unit: null},
                  ],
                },
              },
              {
                role: "daily_statistics",
                operator: "aggregate",
                operatorVersion: "2",
                config: {
                  groupBy: ["day"],
                  measures: [
                    {name: "total_value", op: "sum", field: "raw_value"},
                    {name: "average_value", op: "average", field: "raw_value"},
                  ],
                },
              },
              {
                role: "sort_daily_statistics",
                operator: "sort",
                operatorVersion: "1",
                config: {orderBy: [{field: "day", direction: "asc", nulls: "last"}], limit: null},
              },
              {
                role: "output_daily_statistics",
                operator: "output",
                operatorVersion: "3",
                config: {fields: ["day", "total_value", "average_value"]},
              },
            ],
            connections: [
              {fromRole: "source__metric_events", toRole: "derive_day", inputRole: "rows"},
              {fromRole: "derive_day", toRole: "daily_statistics", inputRole: "rows"},
              {fromRole: "daily_statistics", toRole: "sort_daily_statistics", inputRole: "rows"},
              {fromRole: "sort_daily_statistics", toRole: "output_daily_statistics", inputRole: "rows"},
            ],
            templateInstances: [],
          },
          assumptions: [],
        },
      };
    },
  };
  const result = await new AgentHarness(model, undefined, {
    async discover() {
      return {
        schemaVersion: 1,
        provider: "the_graph",
        gatewayEnvironment: "mainnet",
        searchedNeeds: 1,
        searchCalls: 1,
        inspectedSchemas: 1,
        candidates: [{
          candidateRef: "graph:metric_events:aaaaaaaaaaaaaaaaaaaa",
          sourceNeedId: "metric_events",
          discoveryMethod: "keyword",
          logicalSubgraphId: "metrics-subgraph",
          manifestIpfsCid: "QmMetrics",
          displayName: "Provider metadata",
          reportedNetwork: null,
          networkEvidence: "display_name",
          totalQueryCount30d: 500,
          queryActivityEvidence: "observed",
          schemaHash: "sha256:metrics",
          schemaBytes: 200,
          entities: [{
            queryEntity: "metricEvents",
            entityType: "MetricEvent",
            fields: [
              {path: "id", graphType: "ID!", valueType: "id", nullable: false, list: false},
              {path: "blockTimestamp", graphType: "BigInt!", valueType: "integer", nullable: false, list: false},
              {path: "amountUSD", graphType: "BigDecimal!", valueType: "decimal", nullable: false, list: false},
            ],
            suggestedBindings: [
              {requirementId: "event_time", fieldPaths: ["blockTimestamp"]},
              {requirementId: "raw_value", fieldPaths: ["amountUSD"]},
            ],
            matchedRequirements: ["event_time", "raw_value"],
          }],
          status: "suitable",
          score: 100,
          limitations: ["Deployment ID remains unresolved."],
        }],
        limits: {maxSearchCallsPerNeed: 3, maxSearchResultsPerCall: 10, maxSchemaInspectionsPerNeed: 10},
      };
    },
  }).explore({
    intent: "Produce daily totals and averages from protocol metric events.",
    availableNetworks: [{dataNetwork: "eip155:1", label: "Ethereum Mainnet"}],
  });

  assert.equal(result.kind, "feasibility");
  if (result.kind !== "feasibility") return;
  assert.deepEqual(result.discoveryPlan.semanticPlan.result.fields.map((field) => field.name), ["day", "total_value", "average_value"]);
  assert.deepEqual(result.feasibility.composition.nodes.map((node) => node.operator), ["map", "aggregate", "sort", "output"]);
});
