import assert from "node:assert/strict";
import test from "node:test";
import {AgentHarness, createMockStageOutput, HarnessValidationError} from "../src/modules/agent/harness/index.js";
import type {AgentDebugEvent, AgentModelRequest} from "../src/modules/agent/harness/index.js";
import {
  GraphMcpError,
  GraphSourceDiscoveryService,
  DisabledGraphSchemaCache,
  MemoryGraphSchemaCache,
  RestrictedGraphMcpClient,
  graphMcpPlanningTools,
} from "../src/modules/graph/index.js";
import type {
  GraphMcpPlanningTool,
  GraphMcpPlanningWire,
  GraphMcpTool,
  GraphPlanningMcpPort,
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
  assert.equal(result.model.calls, 2);
  assert.equal(result.feasibility.selections.length, 2);
  assert.equal(result.feasibility.composition.nodes.filter((node) => node.operator === "union").length, 1);
  assert.deepEqual(sequence, [
    "model:source_discovery_planning",
    "mcp:search:Uniswap V3",
    "mcp:activity",
    "mcp:schema:QmEth",
    "mcp:schema:QmArb",
    "model:source_feasibility",
  ]);
  const serializedRequest = JSON.stringify(feasibilityRequest);
  assert.equal(serializedRequest.includes("displayName"), false);
  assert.equal(serializedRequest.includes("execute_query"), false);
  assert.equal(serializedRequest.includes("type Query"), false);
  assert.match(result.blockers.join(" "), /Deployment ID/);
  assert.deepEqual(debugEvents.map((event) => event.stage), [
    "source_discovery_planning",
    "graph_source_discovery",
    "source_feasibility",
  ]);
  const planningDebug = debugEvents.find((event) => event.stage === "source_discovery_planning");
  assert.ok(planningDebug && "searches" in planningDebug);
  assert.deepEqual(planningDebug.searches, [
    {sourceNeedId: "source_1", keywords: ["Uniswap V3"]},
    {sourceNeedId: "source_2", keywords: ["Uniswap V3"]},
  ]);
  const discoveryDebug = debugEvents.find((event) => event.stage === "graph_source_discovery");
  assert.ok(discoveryDebug && "candidateCount" in discoveryDebug);
  assert.equal(discoveryDebug.candidateCount, 4);
});

test("Agent ranks relevant evidence first without hiding bounded schema fallback", async () => {
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
      if (request.stage !== "source_feasibility") throw new Error("Unexpected legacy planning stage");
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
  assert.deepEqual(feasibilityRequest?.candidates[0]?.entities.map((entity) => entity.queryEntity), [
    "swaps",
    "unrelated0",
    "unrelated1",
    "unrelated2",
    "unrelated3",
    "unrelated4",
  ]);
  assert.equal(feasibilityRequest?.candidates[0]?.entities[0]?.fields[0]?.path, "id");
  assert.equal(feasibilityRequest?.candidates[0]?.entities[0]?.fields.length, 121);
  assert.ok(feasibilityRequest?.candidates[0]?.entities[0]?.fields.some((field) => field.path === "pool.metric119"));
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
      if (request.stage === "source_discovery_planning") {
        return {provider: "mock", model: "repair-test", output: createMockStageOutput(request)};
      }
      if (requests.length === 2) {
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
  assert.equal(result.model.calls, 3);
  const repair = requests[2] && "repair" in requests[2] ? requests[2].repair : undefined;
  assert.equal(repair?.reason, "unsupported_evidence_conflict");
  assert.equal(repair?.counterEvidence?.[0]?.sourceNeedId, "source_1");
  assert.match(repair?.counterEvidence?.[0]?.candidateRef ?? "", /^graph:source_1:[a-f0-9]{20}$/);
  assert.equal(repair?.counterEvidence?.[0]?.queryEntity, "records");
  assert.deepEqual(repair?.counterEvidence?.[0]?.matchedRequiredFields, ["record_id"]);
});

test("Agent can select inspected fields when no lexical grain or field hint matches", async () => {
  let feasibilityRequest: Extract<AgentModelRequest, {stage: "source_feasibility"}> | undefined;
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
        type Payload { zorb: BigDecimal! }
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
            schemaVersion: 2,
            kind: "source_discovery_plan",
            semanticPlan: {
              schemaVersion: 2,
              kind: "semantic_plan",
              summary: "Return the requested observation.",
              sourceRequirements: [{
                id: "unknown_observation",
                dataNetwork: "eip155:1",
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
                constraints: [],
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
      if (request.stage !== "source_feasibility") throw new Error("Unexpected legacy planning stage");
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
            rationale: "The inspected provider field has the required scalar type and requested meaning.",
          }],
          composition: {
            schemaVersion: 2,
            kind: "composition_intent",
            nodes: [{
              role: "output_observations",
              operator: "output",
              operatorVersion: "2",
              config: {fields: ["observation_value"], orderBy: []},
            }],
            connections: [{fromRole: "source__unknown_observation", toRole: "output_observations", inputRole: "rows"}],
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
  assert.deepEqual(obscureEntity?.fields.map((field) => field.path), ["payload.zorb"]);
});

test("Agent performs one bounded repair when source-planning tool arguments fail schema validation", async () => {
  const requests: AgentModelRequest[] = [];
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
  });

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

test("Agent rejects a post-discovery candidate reference invented by the model", async () => {
  const harness = new AgentHarness({
    async complete(request: AgentModelRequest) {
      const output = createMockStageOutput(request);
      if (request.stage !== "source_feasibility") {
        return {provider: "mock", model: "feasibility-boundary-test", output};
      }
      const feasibility = output as {
        schemaVersion: 2;
        kind: "source_feasibility";
        selections: Array<Record<string, unknown>>;
        composition: unknown;
        assumptions: string[];
      };
      return {
        provider: "mock",
        model: "feasibility-boundary-test",
        output: {
          ...feasibility,
          selections: feasibility.selections.map((selection, index) => index === 0
            ? {...selection, candidateRef: "graph:eip155_1_swap_events:cccccccccccccccccccc"}
            : selection),
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
    (error: unknown) => error instanceof HarnessValidationError && error.code === "FEASIBILITY_CANDIDATE_INVALID",
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
            schemaVersion: 2,
            kind: "source_discovery_plan",
            semanticPlan: {
              schemaVersion: 2,
              kind: "semantic_plan",
              summary: "Produce daily value statistics.",
              sourceRequirements: [{
                id: "metric_events",
                dataNetwork: "eip155:1",
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
      if (request.stage !== "source_feasibility") throw new Error("Unexpected legacy planning stage");
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
                config: {mode: "extend", fields: [{name: "day", expression: {op: "utc_date", inputs: [{op: "field", field: "event_time"}]}}]},
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
                role: "output_daily_statistics",
                operator: "output",
                operatorVersion: "2",
                config: {fields: ["day", "total_value", "average_value"], orderBy: [{field: "day", direction: "asc"}]},
              },
            ],
            connections: [
              {fromRole: "source__metric_events", toRole: "derive_day", inputRole: "rows"},
              {fromRole: "derive_day", toRole: "daily_statistics", inputRole: "rows"},
              {fromRole: "daily_statistics", toRole: "output_daily_statistics", inputRole: "rows"},
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
  assert.deepEqual(result.feasibility.composition.nodes.map((node) => node.operator), ["map", "aggregate", "output"]);
});
