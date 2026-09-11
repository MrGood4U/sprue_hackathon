import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {createServer} from "node:http";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {compileStructuredDag, type StructuredDagCompileInput} from "../src/modules/dag/compiler.js";
import {contentHash, createImmutableLivePlan, LivePlanCompilationError} from "../src/modules/deployments/live-plan.js";
import {executeLivePlan} from "../src/modules/deployments/runtime.js";
import {LiveDeploymentService} from "../src/modules/deployments/service.js";
import {LiveDeploymentError, type LiveDeploymentRepository} from "../src/modules/deployments/contracts.js";
import {GraphMcpError} from "../src/modules/graph/mcp-client.js";
import type {GraphRuntimeQueryPort} from "../src/modules/graph/types.js";

const schemaDocument = `
  enum OrderDirection { asc desc }
  enum Item_orderBy { id }
  input Item_filter { id_gt: ID rawAmount_gt: String }
  type Item { id: ID!, rawAmount: String! }
  type Query {
    items(first: Int, orderBy: Item_orderBy, orderDirection: OrderDirection, where: Item_filter): [Item!]!
  }
`;

const graphDialectSchemaDocument = `
  enum OrderDirection { asc desc }
  enum Item_orderBy { id }
  input Item_filter { id_gt: Bytes }
  type Related @entity {
    id: Bytes!
    items: [Item!]! @derivedFrom(field: "related")
  }
  type Item @entity(immutable: true) {
    id: Bytes!
    rawAmount: BigDecimal!
    createdAt: BigInt!
    related: Related!
  }
  type Query {
    items(first: Int, orderBy: Item_orderBy, orderDirection: OrderDirection, where: Item_filter): [Item!]!
  }
`;

const timedSchemaDocument = `
  scalar BigInt
  enum OrderDirection { asc desc }
  enum TimedItem_orderBy { id }
  input TimedItem_filter { id_gt: ID createdAt_gte: BigInt createdAt_lt: BigInt }
  type TimedItem { id: ID!, rawAmount: String!, createdAt: BigInt! }
  type Query {
    timedItems(first: Int, orderBy: TimedItem_orderBy, orderDirection: OrderDirection, where: TimedItem_filter): [TimedItem!]!
  }
`;

test("deployment retries derive the same one-time API key from one idempotency command", async () => {
  const calls: Parameters<LiveDeploymentRepository["deploy"]>[0][] = [];
  const repository = {
    async deploy(input: Parameters<LiveDeploymentRepository["deploy"]>[0]) {
      calls.push(input);
      return {
        kind: calls.length === 1 ? "deployed" as const : "replayed" as const,
        deployment: {
          id: "deployment-id",
          productId: input.productId,
          ownerUserId: input.actorUserId,
          alias: input.alias,
          endpointUrl: `${input.publicBaseUrl}/${input.actorUserId}/${input.productId}`,
          activeVersionId: "version-id",
          status: "healthy" as const,
        },
        credential: {id: "credential-id", name: input.credential.name, prefix: input.credential.prefix},
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      };
    },
  } as Pick<LiveDeploymentRepository, "deploy"> as LiveDeploymentRepository;
  const service = new LiveDeploymentService(
    repository,
    {} as never,
    () => { throw new Error("Graph is not used while deploying"); },
    Buffer.alloc(32, 7),
    "https://data.example/data/v1",
  );
  const command = {
    workspaceId: "11111111-1111-4111-8111-111111111111",
    productId: "22222222-2222-4222-8222-222222222222",
    actorUserId: "33333333-3333-4333-8333-333333333333",
    alias: "daily-swaps",
    idempotencyKey: "deploy-command-0001",
  };
  const first = await service.deploy(command);
  const replay = await service.deploy(command);

  assert.equal(first.apiKey.apiKey, replay.apiKey.apiKey);
  assert.equal(first.apiKey.id, replay.apiKey.id);
  assert.equal(calls[0]!.requestFingerprint, calls[1]!.requestFingerprint);
  assert.equal(calls[0]!.credential.hash, calls[1]!.credential.hash);
  assert.notEqual(calls[0]!.credential.id, calls[1]!.credential.id);
});

function compilationInput(): StructuredDagCompileInput {
  return {
    schemaVersion: 1,
    dag: {
      nodes: [
        {id: "source", type: "source", operatorVersion: "1", config: {sourceId: "graph-items"}, outputSchema: {fields: [
          {name: "rawAmount", type: "string", nullable: false, unit: null},
        ]}},
        {id: "map", type: "map", operatorVersion: "2", config: {mode: "project", fields: [
          {name: "amount", expression: {op: "field", field: "rawAmount"}},
        ]}},
        {id: "output", type: "output", operatorVersion: "3", config: {fields: ["amount"]}},
      ],
      edges: [
        {fromNode: "source", fromPort: "rows", toNode: "map", toPort: "rows"},
        {fromNode: "map", fromPort: "rows", toNode: "output", toPort: "rows"},
      ],
    },
    outputSchema: {fields: [{name: "amount", type: "string", nullable: false, unit: null}]},
  };
}

test("live source admission preserves safe Graph and persistence failure codes", async (t) => {
  const input = compilationInput();
  const compilation = compileStructuredDag(input);
  assert.equal(compilation.status, "passed");
  if (compilation.status !== "passed") return;
  const source = {
    id: "graph-items",
    displayName: "Items",
    logicalSubgraphId: "items",
    manifestIpfsCid: "QmExample",
    dataNetwork: "eip155:1",
    queryEntity: "items",
    fieldBindings: [{fieldPath: "rawAmount", requirementId: "amount"}],
    auxiliaryFieldBindings: [],
  };
  const credentials = {
    async list() {
      return [{id: "credential-id", isSelected: true, status: "active"}];
    },
    async resolve() {
      return "graph-api-key";
    },
  };

  await t.test("Graph adapter errors retain their bounded provider code", async () => {
    const service = new LiveDeploymentService(
      {} as LiveDeploymentRepository,
      credentials as never,
      () => ({
        async getSchema() { throw new GraphMcpError("GRAPH_MCP_TOOL_UNAVAILABLE", "private provider detail"); },
        async close() {},
      }) as never,
      Buffer.alloc(32, 7),
      "https://data.example/data/v1",
    );
    await assert.rejects(
      service.buildVersion({workspaceId: "workspace", productId: "product", actorUserId: "user", compilation, dag: input.dag, sources: [source]}),
      (error: unknown) => error instanceof LiveDeploymentError && error.code === "GRAPH_MCP_TOOL_UNAVAILABLE",
    );
  });

  await t.test("repository failures are classified without exposing database details", async () => {
    const repository = {
      async persistVersion() { throw new Error("private database detail"); },
    } as Pick<LiveDeploymentRepository, "persistVersion"> as LiveDeploymentRepository;
    const service = new LiveDeploymentService(
      repository,
      credentials as never,
      () => ({async getSchema() { return schemaDocument; }, async close() {}}) as never,
      Buffer.alloc(32, 7),
      "https://data.example/data/v1",
    );
    await assert.rejects(
      service.buildVersion({workspaceId: "workspace", productId: "product", actorUserId: "user", compilation, dag: input.dag, sources: [source]}),
      (error: unknown) => error instanceof LiveDeploymentError && error.code === "LIVE_VERSION_PERSIST_FAILED",
    );
  });

  await t.test("invalid source schemas are distinguished from storage failures", async () => {
    const repository = {
      async persistVersion(request: Parameters<LiveDeploymentRepository["persistVersion"]>[0]) {
        return request.createPlan(new Map([["graph-items", "snapshot-id"]])) as never;
      },
    } as Pick<LiveDeploymentRepository, "persistVersion"> as LiveDeploymentRepository;
    const service = new LiveDeploymentService(
      repository,
      credentials as never,
      () => ({
        async getSchema() {
          return `${schemaDocument}\ntype Unsupported @providerOnly { id: ID! }`;
        },
        async close() {},
      }) as never,
      Buffer.alloc(32, 7),
      "https://data.example/data/v1",
    );
    await assert.rejects(
      service.buildVersion({workspaceId: "workspace", productId: "product", actorUserId: "user", compilation, dag: input.dag, sources: [source]}),
      (error: unknown) => error instanceof LiveDeploymentError && error.code === "LIVE_SOURCE_SCHEMA_INVALID",
    );
  });

  await t.test("runtime introspection pins the exact entity type when provider SDL omits Query", async () => {
    const persistedPlans: ReturnType<typeof createImmutableLivePlan>[] = [];
    const repository = {
      async persistVersion(request: Parameters<LiveDeploymentRepository["persistVersion"]>[0]) {
        const plan = request.createPlan(new Map([["graph-items", "snapshot-id"]]));
        persistedPlans.push(plan);
        return {id: "version-id", versionNo: 1, specHash: contentHash(plan)};
      },
    } as Pick<LiveDeploymentRepository, "persistVersion"> as LiveDeploymentRepository;
    const service = new LiveDeploymentService(
      repository,
      credentials as never,
      () => ({
        async getSchema() {
          return graphDialectSchemaDocument.replace(/\s*type Query \{[\s\S]*?\n  \}\n/, "\n");
        },
        async getRuntimeQueryFields() {
          return [{name: "items", entityType: "Item", list: true}];
        },
        async close() {},
      }) as never,
      Buffer.alloc(32, 7),
      "https://data.example/data/v1",
    );

    await service.buildVersion({
      workspaceId: "workspace",
      productId: "product",
      actorUserId: "user",
      compilation,
      dag: input.dag,
      sources: [source],
    });
    assert.equal(persistedPlans.length, 1);
    const persistedPlan = persistedPlans[0]!;
    assert.equal(persistedPlan.sources[0]!.queryEntityType, "Item");
    assert.match(persistedPlan.sources[0]!.queryDocument, /\$cursor: Bytes!/);
  });
});

test("immutable live plans compile a schema-correct bounded Graph query", () => {
  const input = compilationInput();
  const compilation = compileStructuredDag(input);
  assert.equal(compilation.status, "passed");
  if (compilation.status !== "passed") return;
  const plan = createImmutableLivePlan({
    compilation,
    dag: input.dag,
    sources: [{
      id: "graph-items",
      displayName: "Items",
      logicalSubgraphId: "items",
      manifestIpfsCid: "QmExample",
      dataNetwork: "ethereum-mainnet",
      queryEntity: "items",
      fieldBindings: [{fieldPath: "rawAmount", requirementId: "amount"}],
      auxiliaryFieldBindings: [],
      providerCredentialId: "credential-id",
      sourceSnapshotId: "snapshot-id",
      schemaDocument,
    }],
  });

  assert.match(plan.sources[0]!.queryDocument, /\$cursor: ID!/);
  assert.match(plan.sources[0]!.queryDocument, /where: \{ id_gt: \$cursor \}/);
  assert.equal(plan.sources[0]!.initialCursor, "");
  assert.equal(plan.sources[0]!.pageSize, 1_000);
  assert.equal(plan.sources[0]!.access.mode, "customer_api_key");
  assert.deepEqual(plan.sources[0]!.projections, [{fieldPath: "rawAmount", outputPath: "rawAmount"}]);
  assert.equal("schemaDocument" in plan.sources[0]!, false);
});

test("immutable live plans preserve an Agent-authored GraphQL pushdown verbatim", () => {
  const input = compilationInput();
  const compilation = compileStructuredDag(input);
  assert.equal(compilation.status, "passed");
  if (compilation.status !== "passed") return;
  const document = "query SprueLiveSource($first: Int!, $cursor: ID!) { items(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor, rawAmount_gt: \"10\" }) { id rawAmount } }";
  const plan = createImmutableLivePlan({
    compilation,
    dag: input.dag,
    sources: [{
      id: "graph-items",
      displayName: "Items",
      logicalSubgraphId: "items",
      manifestIpfsCid: "QmExample",
      dataNetwork: "ethereum-mainnet",
      queryEntity: "items",
      queryPlan: {
        schemaVersion: 1,
        operationName: "SprueLiveSource",
        document,
        pagination: {kind: "id_cursor", cursorField: "id", pageSize: 250, maxRequests: 8, maxRows: 2_000},
        pushedOperations: [{nodeRole: "map", operator: "map", description: "Project the required provider field."}],
      },
      fieldBindings: [{fieldPath: "rawAmount", requirementId: "amount"}],
      auxiliaryFieldBindings: [],
      providerCredentialId: "credential-id",
      sourceSnapshotId: "snapshot-id",
      schemaDocument,
    }],
  });

  assert.equal(plan.sources[0]!.queryDocument, document);
  assert.equal(plan.sources[0]!.pageSize, 250);
  assert.equal(plan.sources[0]!.maxRequests, 8);
  assert.equal(plan.sources[0]!.maxRows, 2_000);
  assert.deepEqual(plan.sources[0]!.pushedOperations, [{
    nodeRole: "map",
    operator: "map",
    description: "Project the required provider field.",
  }]);
});

test("live plans resolve complete UTC-day Graph variables from each invocation anchor", async () => {
  const input: StructuredDagCompileInput = {
    schemaVersion: 1,
    dag: {
      nodes: [
        {id: "source", type: "source", operatorVersion: "1", config: {sourceId: "timed-items"}, outputSchema: {fields: [
          {name: "rawAmount", type: "string", nullable: false, unit: null},
          {name: "createdAt", type: "timestamp", nullable: false, unit: null},
        ]}},
        {id: "map", type: "map", operatorVersion: "2", config: {mode: "project", fields: [
          {name: "amount", expression: {op: "field", field: "rawAmount"}},
          {name: "trade_timestamp", expression: {op: "field", field: "createdAt"}},
        ]}},
        {id: "output", type: "output", operatorVersion: "3", config: {fields: ["amount"]}},
      ],
      edges: [
        {fromNode: "source", fromPort: "rows", toNode: "map", toPort: "rows"},
        {fromNode: "map", fromPort: "rows", toNode: "output", toPort: "rows"},
      ],
    },
    outputSchema: {fields: [{name: "amount", type: "string", nullable: false, unit: null}]},
  };
  const compilation = compileStructuredDag(input);
  assert.equal(compilation.status, "passed");
  if (compilation.status !== "passed") return;
  const document = "query SprueLiveSource($first: Int!, $cursor: ID!, $windowStart: BigInt!, $windowEnd: BigInt!) { timedItems(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor, createdAt_gte: $windowStart, createdAt_lt: $windowEnd }) { id createdAt rawAmount } }";
  const plan = createImmutableLivePlan({
    compilation,
    dag: input.dag,
    sources: [{
      id: "timed-items",
      displayName: "Timed items",
      logicalSubgraphId: "timed-items",
      manifestIpfsCid: "QmTimed",
      dataNetwork: "eip155:1",
      queryEntity: "timedItems",
      queryPlan: {
        schemaVersion: 1,
        operationName: "SprueLiveSource",
        document,
        pagination: {kind: "id_cursor", cursorField: "id", pageSize: 1_000, maxRequests: 20, maxRows: 10_000},
        runtimeWindow: {
          kind: "complete_utc_days",
          days: 7,
          timezone: "UTC",
          field: "createdAt",
          startVariable: "windowStart",
          endVariable: "windowEnd",
          valueEncoding: "unix_seconds",
        },
        pushedOperations: [{nodeRole: "recent_rows", operator: "filter", description: "Keep the last seven complete UTC days."}],
      },
      fieldBindings: [{fieldPath: "rawAmount", requirementId: "amount"}],
      auxiliaryFieldBindings: [{fieldPath: "createdAt", name: "trade_timestamp", purpose: "filter"}],
      providerCredentialId: "credential-id",
      sourceSnapshotId: "snapshot-id",
      schemaDocument: timedSchemaDocument,
    }],
  });
  const anchor = new Date("2026-09-11T10:09:20.336Z");
  const expectedStart = String(Date.parse("2026-09-04T00:00:00.000Z") / 1_000);
  const expectedEnd = String(Date.parse("2026-09-11T00:00:00.000Z") / 1_000);

  const result = await executeLivePlan(plan, async () => ({
    async executeStaticQuery(_manifest, actualDocument, variables) {
      assert.equal(actualDocument, document);
      assert.equal(variables.windowStart, expectedStart);
      assert.equal(variables.windowEnd, expectedEnd);
      return {data: {timedItems: [{id: "row-1", rawAmount: "1", createdAt: expectedStart}]}, errors: []};
    },
    async close() {},
  }), undefined, () => anchor);

  assert.equal(result.queriedAt, anchor.toISOString());
  assert.deepEqual(result.rows, [{amount: "1"}]);
});

test("a Source node limit bounds live reads without treating the bound as an execution failure", async () => {
  const input = compilationInput();
  (input.dag.nodes.find((node) => node.type === "source")!.config as Record<string, unknown>).limit = 2;
  const compilation = compileStructuredDag(input);
  assert.equal(compilation.status, "passed");
  if (compilation.status !== "passed") return;
  const plan = createImmutableLivePlan({
    compilation,
    dag: input.dag,
    sources: [{
      id: "graph-items",
      displayName: "Items",
      logicalSubgraphId: "items",
      manifestIpfsCid: "QmExample",
      dataNetwork: "ethereum-mainnet",
      queryEntity: "items",
      fieldBindings: [{fieldPath: "rawAmount", requirementId: "amount"}],
      auxiliaryFieldBindings: [],
      providerCredentialId: "credential-id",
      sourceSnapshotId: "snapshot-id",
      schemaDocument,
    }],
  });
  assert.equal(plan.sources[0]!.maxRows, 10_000);
  assert.equal(plan.sources[0]!.rowLimit, 2);

  const result = await executeLivePlan(plan, async () => ({
    async executeStaticQuery(_manifest, _document, variables) {
      assert.equal(variables.first, 2);
      return {data: {items: [
        {id: "row-1", rawAmount: "1"},
        {id: "row-2", rawAmount: "2"},
      ]}, errors: []};
    },
    async close() {},
  }));
  assert.equal(result.sourceRequests, 1);
  assert.deepEqual(result.rows, [{amount: "1"}, {amount: "2"}]);
});

test("live plans preserve provider paths until the explicit Map executes", async () => {
  const input: StructuredDagCompileInput = {
    schemaVersion: 1,
    dag: {
      nodes: [
        {id: "source", type: "source", operatorVersion: "1", config: {sourceId: "graph-items"}, outputSchema: {fields: [
          {name: "rawAmount", type: "string", nullable: false, unit: null},
        ]}},
        {id: "map", type: "map", operatorVersion: "2", config: {mode: "project", fields: [
          {name: "amount", expression: {op: "field", field: "rawAmount"}},
        ]}},
        {id: "output", type: "output", operatorVersion: "3", config: {fields: ["amount"]}},
      ],
      edges: [
        {fromNode: "source", fromPort: "rows", toNode: "map", toPort: "rows"},
        {fromNode: "map", fromPort: "rows", toNode: "output", toPort: "rows"},
      ],
    },
    outputSchema: {fields: [{name: "amount", type: "string", nullable: false, unit: null}]},
  };
  const compilation = compileStructuredDag(input);
  assert.equal(compilation.status, "passed");
  if (compilation.status !== "passed") return;
  const plan = createImmutableLivePlan({
    compilation,
    dag: input.dag,
    sources: [{
      id: "graph-items",
      displayName: "Items",
      logicalSubgraphId: "items",
      manifestIpfsCid: "QmExample",
      dataNetwork: "ethereum-mainnet",
      queryEntity: "items",
      fieldBindings: [{fieldPath: "rawAmount", requirementId: "amount"}],
      auxiliaryFieldBindings: [],
      providerCredentialId: "credential-id",
      sourceSnapshotId: "snapshot-id",
      schemaDocument,
    }],
  });

  assert.deepEqual(plan.sources[0]!.projections, [{fieldPath: "rawAmount", outputPath: "rawAmount"}]);
  const result = await executeLivePlan(plan, async () => ({
    async executeStaticQuery() {
      return {data: {items: [{id: "row-1", rawAmount: "12.5"}]}, errors: []};
    },
    async close() {},
  }));
  assert.deepEqual(result.rows, [{amount: "12.5"}]);
});

test("immutable live plans reject Agent-authored GraphQL outside selected provider fields", () => {
  const input = compilationInput();
  const compilation = compileStructuredDag(input);
  assert.equal(compilation.status, "passed");
  if (compilation.status !== "passed") return;
  assert.throws(() => createImmutableLivePlan({
    compilation,
    dag: input.dag,
    sources: [{
      id: "graph-items",
      displayName: "Items",
      logicalSubgraphId: "items",
      manifestIpfsCid: "QmExample",
      dataNetwork: "ethereum-mainnet",
      queryEntity: "items",
      queryPlan: {
        schemaVersion: 1,
        operationName: "SprueLiveSource",
        document: "query SprueLiveSource($first: Int!, $cursor: ID!) { items(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor }) { id rawAmount undeclared } }",
        pagination: {kind: "id_cursor", cursorField: "id", pageSize: 500, maxRequests: 20, maxRows: 10_000},
        pushedOperations: [{nodeRole: "map", operator: "map", description: "Project fields."}],
      },
      fieldBindings: [{fieldPath: "rawAmount", requirementId: "amount"}],
      auxiliaryFieldBindings: [],
      providerCredentialId: "credential-id",
      sourceSnapshotId: "snapshot-id",
      schemaDocument,
    }],
  }), (error: unknown) => error instanceof LivePlanCompilationError);
});

test("immutable live plans accept The Graph schema built-ins without weakening SDL validation", () => {
  const input = compilationInput();
  const compilation = compileStructuredDag(input);
  assert.equal(compilation.status, "passed");
  if (compilation.status !== "passed") return;
  const source = {
    id: "graph-items",
    displayName: "Items",
    logicalSubgraphId: "items",
    manifestIpfsCid: "QmExample",
    dataNetwork: "ethereum-mainnet",
    queryEntity: "items",
    fieldBindings: [{fieldPath: "rawAmount", requirementId: "amount"}],
    auxiliaryFieldBindings: [],
    providerCredentialId: "credential-id",
    sourceSnapshotId: "snapshot-id",
  };

  const plan = createImmutableLivePlan({
    compilation,
    dag: input.dag,
    sources: [{...source, queryEntityType: "Item", schemaDocument: graphDialectSchemaDocument}],
  });
  assert.match(plan.sources[0]!.queryDocument, /\$cursor: Bytes!/);
  assert.equal(plan.sources[0]!.initialCursor, "0x");

  assert.throws(
    () => createImmutableLivePlan({
      compilation,
      dag: input.dag,
      sources: [{...source, schemaDocument: `${schemaDocument}\ntype Unsupported @providerOnly { id: ID! }`}],
    }),
    (error: unknown) => error instanceof LivePlanCompilationError,
  );
});

test("live plans preserve exact nested Graph paths while accepting sources added without semantic bindings", async () => {
  const input: StructuredDagCompileInput = {
    schemaVersion: 1,
    dag: {
      nodes: [
        {id: "source", type: "source", operatorVersion: "1", config: {sourceId: "nested-items"}, outputSchema: {fields: [
          {name: "pair.token.symbol", type: "string", nullable: false, unit: null},
        ]}},
        {id: "map", type: "map", operatorVersion: "2", config: {mode: "project", fields: [
          {name: "symbol", expression: {op: "field", field: "pair.token.symbol"}},
        ]}},
        {id: "output", type: "output", operatorVersion: "3", config: {fields: ["symbol"]}},
      ],
      edges: [
        {fromNode: "source", fromPort: "rows", toNode: "map", toPort: "rows"},
        {fromNode: "map", fromPort: "rows", toNode: "output", toPort: "rows"},
      ],
    },
    outputSchema: {fields: [{name: "symbol", type: "string", nullable: false, unit: null}]},
  };
  const compilation = compileStructuredDag(input);
  assert.equal(compilation.status, "passed");
  if (compilation.status !== "passed") return;
  const plan = createImmutableLivePlan({
    compilation,
    dag: input.dag,
    sources: [{
      id: "nested-items",
      displayName: "Nested items",
      logicalSubgraphId: "nested-items",
      manifestIpfsCid: "QmNested",
      dataNetwork: "ethereum-mainnet",
      queryEntity: "items",
      fieldBindings: [],
      auxiliaryFieldBindings: [],
      providerCredentialId: "credential-id",
      sourceSnapshotId: "snapshot-id",
      schemaDocument: `
        scalar Bytes
        type Token { symbol: String! }
        type Pair { token: Token! }
        type Item { id: Bytes!, pair: Pair! }
      `,
    }],
  });
  assert.deepEqual(plan.sources[0]!.projections, [{fieldPath: "pair.token.symbol", outputPath: "pair.token.symbol"}]);
  assert.match(plan.sources[0]!.queryDocument, /pair \{ token \{ symbol \} \}/);
  assert.match(plan.sources[0]!.queryDocument, /\$cursor: Bytes!/);

  const result = await executeLivePlan(plan, async () => ({
    async executeStaticQuery() {
      return {data: {items: [{id: "0x01", pair: {token: {symbol: "WETH"}}}]}, errors: []};
    },
    async close() {},
  }));
  assert.deepEqual(result.rows, [{symbol: "WETH"}]);
});

test("each live plan execution requests The Graph again and never reuses result rows", async () => {
  const input = compilationInput();
  const compilation = compileStructuredDag(input);
  assert.equal(compilation.status, "passed");
  if (compilation.status !== "passed") return;
  const plan = createImmutableLivePlan({
    compilation,
    dag: input.dag,
    sources: [{
      id: "graph-items",
      displayName: "Items",
      logicalSubgraphId: "items",
      manifestIpfsCid: "QmExample",
      dataNetwork: "ethereum-mainnet",
      queryEntity: "items",
      fieldBindings: [{fieldPath: "rawAmount", requirementId: "amount"}],
      auxiliaryFieldBindings: [],
      providerCredentialId: "credential-id",
      sourceSnapshotId: "snapshot-id",
      schemaDocument,
    }],
  });
  let requestCount = 0;
  let closeCount = 0;
  const factory = async (): Promise<GraphRuntimeQueryPort> => ({
    async executeStaticQuery() {
      requestCount += 1;
      return {data: {items: [{id: String(requestCount), rawAmount: String(requestCount)}]}, errors: []};
    },
    async close() { closeCount += 1; },
  });

  const first = await executeLivePlan(plan, factory);
  const second = await executeLivePlan(plan, factory);

  assert.deepEqual(first.rows, [{amount: "1"}]);
  assert.deepEqual(second.rows, [{amount: "2"}]);
  assert.equal(requestCount, 2);
  assert.equal(closeCount, 2);
});

test("the exported dependency-free runner verifies its plan and queries Graph on every request", async () => {
  const input = compilationInput();
  const compilation = compileStructuredDag(input);
  assert.equal(compilation.status, "passed");
  if (compilation.status !== "passed") return;
  const plan = createImmutableLivePlan({
    compilation,
    dag: input.dag,
    sources: [{
      id: "graph-items",
      displayName: "Items",
      logicalSubgraphId: "items",
      manifestIpfsCid: "QmExample",
      dataNetwork: "ethereum-mainnet",
      queryEntity: "items",
      fieldBindings: [{fieldPath: "rawAmount", requirementId: "amount"}],
      auxiliaryFieldBindings: [],
      providerCredentialId: "credential-id",
      sourceSnapshotId: "snapshot-id",
      schemaDocument,
    }],
  });
  let graphRequests = 0;
  const graph = createServer((_request, response) => {
    graphRequests += 1;
    response.writeHead(200, {"content-type": "application/json"});
    response.end(JSON.stringify({data: {items: [{id: String(graphRequests), rawAmount: String(graphRequests)}]}}));
  });
  await new Promise<void>((resolve) => graph.listen(0, "127.0.0.1", resolve));
  const graphAddress = graph.address();
  assert.ok(graphAddress && typeof graphAddress !== "string");

  const directory = await mkdtemp(join(tmpdir(), "sprue-private-runner-"));
  const template = await readFile(new URL("../src/modules/deployments/portable-runner.mjs", import.meta.url), "utf8");
  await Promise.all([
    writeFile(join(directory, "dag.json"), JSON.stringify(plan)),
    writeFile(join(directory, "runner.mjs"), template.replace("__SPRUE_EXPECTED_SPEC_HASH__", contentHash(plan))),
  ]);
  const privateKey = "portable-test-key-with-at-least-24-characters";
  const child = spawn(process.execPath, ["runner.mjs"], {
    cwd: directory,
    env: {
      ...process.env,
      PORT: "0",
      SPRUE_PRIVATE_API_KEY: privateKey,
      SPRUE_GRAPH_ENDPOINTS_JSON: JSON.stringify({"graph-items": `http://127.0.0.1:${graphAddress.port}/graphql`}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const runnerPort = await new Promise<number>((resolve, reject) => {
      let output = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = /listening on :(\d+)/.exec(output);
        if (match) resolve(Number(match[1]));
      });
      child.once("error", reject);
      child.once("exit", (code) => reject(new Error(`Portable runner exited before listening (${code})`)));
    });
    const request = () => fetch(`http://127.0.0.1:${runnerPort}/?limit=10`, {headers: {Authorization: `Bearer ${privateKey}`}}).then((response) => response.json());
    const first = await request();
    const second = await request();
    assert.deepEqual(first.data, [{amount: "1"}]);
    assert.deepEqual(second.data, [{amount: "2"}]);
    assert.equal(first.meta.serveMode, "live");
    assert.equal(graphRequests, 2);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await once(child, "exit");
    }
    await new Promise<void>((resolve) => graph.close(() => resolve()));
    await rm(directory, {recursive: true, force: true});
  }
});
