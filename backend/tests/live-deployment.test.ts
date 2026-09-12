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
import type {LoadedX402Gate, X402PublicationCandidate} from "../src/modules/deployments/contracts.js";
import type {X402Facilitator} from "../src/modules/payments/blocky402-client.js";

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
    "https://data.example/x402/v1",
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

test("x402 settles before internal live execution and never returns the internal API key", async () => {
  const compiled = compileStructuredDag(compilationInput());
  assert.equal(compiled.status, "passed");
  if (compiled.status !== "passed") return;
  const plan = createImmutableLivePlan({
    compilation: compiled,
    dag: compilationInput().dag,
    sources: [{
      id: "graph-items",
      displayName: "Items",
      logicalSubgraphId: "items",
      manifestIpfsCid: "QmExample",
      dataNetwork: "eip155:1",
      queryEntity: "items",
      fieldBindings: [{fieldPath: "rawAmount", requirementId: "amount"}],
      auxiliaryFieldBindings: [],
      providerCredentialId: "graph-credential",
      sourceSnapshotId: "source-snapshot",
      schemaDocument,
    }],
  });
  const candidate: X402PublicationCandidate = {
    deploymentId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    productId: "33333333-3333-4333-8333-333333333333",
    productName: "Paid live rows",
    ownerUserId: "44444444-4444-4444-8444-444444444444",
    activeVersionId: "55555555-5555-4555-8555-555555555555",
    networkId: "66666666-6666-4666-8666-666666666666",
    assetId: "77777777-7777-4777-8777-777777777777",
    recipientWalletAddressId: "88888888-8888-4888-8888-888888888888",
    recipientAddress: "0.0.8011510",
  };
  const requirements = {
    scheme: "exact" as const,
    network: "hedera:testnet" as const,
    amount: "20000000",
    payTo: candidate.recipientAddress,
    maxTimeoutSeconds: 300,
    asset: "0.0.0" as const,
    extra: {feePayer: "0.0.7162784"},
  };
  const order: string[] = [];
  let publicationId = "";
  let internalKeyHash = "";
  const repository = {
    async loadPublicationCandidate() { return candidate; },
    async publishX402(input: Parameters<LiveDeploymentRepository["publishX402"]>[0]) {
      publicationId = input.publicationId;
      internalKeyHash = input.internalCredential.hash;
      return {
        id: input.publicationId,
        deploymentId: candidate.deploymentId,
        revisionNo: 1,
        status: "active" as const,
        priceAtomic: input.priceAtomic,
        recipientAddress: candidate.recipientAddress,
        network: "hedera:testnet" as const,
        asset: "0.0.0" as const,
        facilitator: "blocky402" as const,
        createdAt: new Date("2026-09-11T00:00:00.000Z"),
      };
    },
    async loadX402Gate(): Promise<LoadedX402Gate> {
      return {...candidate, publicationId, priceAtomic: requirements.amount,
        internalCredentialId: "internal-credential", requirements};
    },
    async beginPaidRequest() {
      return {requestId: "request", paymentIntentId: "intent", paymentAttemptId: "attempt"};
    },
    async failPaidRequest() { order.push("fail"); },
    async confirmPaidSettlement() { order.push("confirm-settlement"); },
    async completePaidRequest() { order.push("complete-request"); },
    async loadAuthorized(input: Parameters<LiveDeploymentRepository["loadAuthorized"]>[0]) {
      order.push("internal-api");
      assert.equal(input.keyHash, internalKeyHash);
      return {
        deploymentId: candidate.deploymentId,
        workspaceId: candidate.workspaceId,
        productId: candidate.productId,
        ownerUserId: candidate.ownerUserId,
        activeVersionId: candidate.activeVersionId,
        specification: plan,
        specHash: contentHash(plan),
        apiCredentialId: "internal-credential",
      };
    },
    async recordProviderRequests(input: Parameters<LiveDeploymentRepository["recordProviderRequests"]>[0]) {
      assert.equal(input.workspaceId, candidate.workspaceId);
      assert.equal(input.productId, candidate.productId);
      assert.equal(input.apiAccessRequestId, "request");
      assert.equal(input.accessMode, "x402");
      assert.equal(input.quantity, 1);
      order.push("meter-provider-requests");
    },
  } as unknown as LiveDeploymentRepository;
  const facilitator: X402Facilitator = {
    publicUrl: "https://api.testnet.blocky402.com",
    async supported() {
      return {capability: {x402Version: 2, scheme: "exact", network: "hedera:testnet",
        extra: {feePayer: requirements.extra.feePayer}}, feePayer: requirements.extra.feePayer};
    },
    async verify() {
      order.push("verify");
      return {valid: true, payer: "0.0.7326075", reason: null, evidence: {isValid: true}};
    },
    async settle() {
      order.push("settle");
      return {success: true, payer: "0.0.7326075", transaction: "0.0.7162784@1789092000.1",
        reason: null, evidence: {success: true}};
    },
  };
  const service = new LiveDeploymentService(
    repository,
    {async resolve() { return "server-side-graph-key"; }} as never,
    () => ({
      async executeStaticQuery() {
        order.push("graph-query");
        return {data: {items: [{id: "row-1", rawAmount: "12.5"}]}, errors: []};
      },
      async close() {},
    }) as never,
    Buffer.alloc(32, 9),
    "https://data.example/data/v1",
    "https://data.example/x402/v1",
    facilitator,
  );

  const publication = await service.publishX402({...candidate, actorUserId: candidate.ownerUserId,
    priceAtomic: requirements.amount});
  assert.equal("apiKey" in publication, false);
  assert.notEqual(internalKeyHash, "");
  await assert.rejects(
    service.execute({ownerUserId: candidate.ownerUserId, productRef: candidate.productId,
      authorization: undefined, limit: 100}),
    (error: unknown) => error instanceof LiveDeploymentError && error.code === "DATA_API_KEY_REQUIRED",
  );
  const challenge = await service.executeX402Request({ownerUserId: candidate.ownerUserId,
    productRef: candidate.productId, paymentSignature: undefined,
    path: "/x402/v1/owner/product?limit=100", limit: 100});
  assert.equal(challenge.kind, "payment_required");
  if (challenge.kind === "payment_required") {
    assert.equal(challenge.body.resource.url, "https://data.example/x402/v1/44444444-4444-4444-8444-444444444444/33333333-3333-4333-8333-333333333333");
  }
  const paymentSignature = Buffer.from(JSON.stringify({
    x402Version: 2,
    accepted: requirements,
    payload: {transaction: "base64-partially-signed-transaction"},
  })).toString("base64");
  const result = await service.executeX402Request({ownerUserId: candidate.ownerUserId,
    productRef: candidate.productId, paymentSignature,
    path: "/x402/v1/owner/product?limit=100", limit: 100});

  assert.equal(result.kind, "success");
  assert.deepEqual(order, ["verify", "settle", "confirm-settlement", "internal-api", "graph-query", "meter-provider-requests", "complete-request"]);
  assert.doesNotMatch(JSON.stringify(result), /sprue_live_/);
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
      "https://data.example/x402/v1",
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
      "https://data.example/x402/v1",
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
          return `${schemaDocument}\ntype Unsupported { missing: MissingProviderType! }`;
        },
        async close() {},
      }) as never,
      Buffer.alloc(32, 7),
      "https://data.example/data/v1",
      "https://data.example/x402/v1",
    );
    await assert.rejects(
      service.buildVersion({workspaceId: "workspace", productId: "product", actorUserId: "user", compilation, dag: input.dag, sources: [source]}),
      (error: unknown) => error instanceof LiveDeploymentError
        && error.code === "LIVE_SOURCE_SCHEMA_INVALID"
        && error.detail?.startsWith("graph-items:") === true,
    );
  });

  await t.test("undeclared provider object annotations are ignored only in the validation copy", async () => {
    const providerSchema = `${schemaDocument}\ntype Snapshot @dailySnapshot @regularPolling { id: ID! }`;
    let persistedSchema: string | null = null;
    const repository = {
      async persistVersion(request: Parameters<LiveDeploymentRepository["persistVersion"]>[0]) {
        persistedSchema = request.sources[0]?.schemaDocument ?? null;
        const plan = request.createPlan(new Map([["graph-items", "snapshot-id"]]));
        return {id: "version-id", versionNo: 1, specHash: contentHash(plan)};
      },
    } as Pick<LiveDeploymentRepository, "persistVersion"> as LiveDeploymentRepository;
    const service = new LiveDeploymentService(
      repository,
      credentials as never,
      () => ({
        async getSchema() { return providerSchema; },
        async close() {},
      }) as never,
      Buffer.alloc(32, 7),
      "https://data.example/data/v1",
      "https://data.example/x402/v1",
    );

    await service.buildVersion({
      workspaceId: "workspace",
      productId: "product",
      actorUserId: "user",
      compilation,
      dag: input.dag,
      sources: [source],
    });

    assert.equal(persistedSchema, providerSchema);
  });

  await t.test("runtime introspection pins the exact entity type when provider SDL omits Query", async () => {
    const persistedPlans: ReturnType<typeof createImmutableLivePlan>[] = [];
    const authoredSource = {
      ...source,
      queryPlan: {
        schemaVersion: 1 as const,
        operationName: "SprueLiveSource" as const,
        document: "query SprueLiveSource($first: Int!, $cursor: Bytes!) { items(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor }) { id rawAmount } }",
        pagination: {kind: "id_cursor" as const, cursorField: "id" as const, pageSize: 1_000, maxRequests: 20, maxRows: 10_000},
        pushedOperations: [],
      },
    };
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
        async executeStaticQuery(_manifest: string, document: string, variables: Readonly<Record<string, unknown>>) {
          assert.match(document, /items\(first: \$first/);
          assert.deepEqual(variables, {first: 1, cursor: "0x"});
          return {data: {items: []}, errors: []};
        },
        async close() {},
      }) as never,
      Buffer.alloc(32, 7),
      "https://data.example/data/v1",
      "https://data.example/x402/v1",
    );

    await service.buildVersion({
      workspaceId: "workspace",
      productId: "product",
      actorUserId: "user",
      compilation,
      dag: input.dag,
      sources: [authoredSource],
    });
    assert.equal(persistedPlans.length, 1);
    const persistedPlan = persistedPlans[0]!;
    assert.equal(persistedPlan.sources[0]!.queryEntityType, "Item");
    assert.match(persistedPlan.sources[0]!.queryDocument, /\$cursor: Bytes!/);
  });

  await t.test("an Agent-authored query must pass a one-row live preflight before persistence", async () => {
    let persisted = false;
    const repository = {
      async persistVersion(request: Parameters<LiveDeploymentRepository["persistVersion"]>[0]) {
        persisted = true;
        const plan = request.createPlan(new Map([["graph-items", "snapshot-id"]]));
        return {id: "version-id", versionNo: 1, specHash: contentHash(plan)};
      },
    } as Pick<LiveDeploymentRepository, "persistVersion"> as LiveDeploymentRepository;
    const authoredSource = {
      ...source,
      queryPlan: {
        schemaVersion: 1 as const,
        operationName: "SprueLiveSource" as const,
        document: "query SprueLiveSource($first: Int!, $cursor: ID!) { items(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor }) { id rawAmount } }",
        pagination: {kind: "id_cursor" as const, cursorField: "id" as const, pageSize: 1_000, maxRequests: 20, maxRows: 10_000},
        pushedOperations: [],
      },
    };
    const service = new LiveDeploymentService(
      repository,
      credentials as never,
      () => ({
        async getSchema() { return schemaDocument; },
        async executeStaticQuery(_manifest: string, _document: string, variables: Readonly<Record<string, unknown>>) {
          assert.deepEqual(variables, {first: 1, cursor: ""});
          return {data: {items: []}, errors: []};
        },
        async close() {},
      }) as never,
      Buffer.alloc(32, 7),
      "https://data.example/data/v1",
      "https://data.example/x402/v1",
    );
    await service.buildVersion({
      workspaceId: "workspace",
      productId: "product",
      actorUserId: "user",
      compilation,
      dag: input.dag,
      sources: [authoredSource],
    });
    assert.equal(persisted, true);
  });

  await t.test("a rejected live preflight cannot create an immutable version", async () => {
    let persisted = false;
    const repository = {
      async persistVersion() { persisted = true; throw new Error("must not persist"); },
    } as Pick<LiveDeploymentRepository, "persistVersion"> as LiveDeploymentRepository;
    const authoredSource = {
      ...source,
      queryPlan: {
        schemaVersion: 1 as const,
        operationName: "SprueLiveSource" as const,
        document: "query SprueLiveSource($first: Int!, $cursor: ID!) { items(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor }) { id rawAmount } }",
        pagination: {kind: "id_cursor" as const, cursorField: "id" as const, pageSize: 1_000, maxRequests: 20, maxRows: 10_000},
        pushedOperations: [],
      },
    };
    const service = new LiveDeploymentService(
      repository,
      credentials as never,
      () => ({
        async getSchema() { return schemaDocument; },
        async executeStaticQuery() {
          return {data: {items: []}, errors: [{message: "Cannot mix column filters with the OR operator"}]};
        },
        async close() {},
      }) as never,
      Buffer.alloc(32, 7),
      "https://data.example/data/v1",
      "https://data.example/x402/v1",
    );
    await assert.rejects(service.buildVersion({
      workspaceId: "workspace",
      productId: "product",
      actorUserId: "user",
      compilation,
      dag: input.dag,
      sources: [authoredSource],
    }), (error: unknown) => error instanceof LiveDeploymentError
      && error.code === "LIVE_SOURCE_QUERY_PROBE_FAILED"
      && error.detail?.includes("Cannot mix column filters") === true);
    assert.equal(persisted, false);
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

test("live reads page to the compiled row ceiling and probe once to prove exact completeness", async () => {
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
      queryPlan: {
        schemaVersion: 1,
        operationName: "SprueLiveSource",
        document: "query SprueLiveSource($first: Int!, $cursor: ID!) { items(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor }) { id rawAmount } }",
        pagination: {kind: "id_cursor", cursorField: "id", pageSize: 2, maxRequests: 3, maxRows: 4},
        pushedOperations: [],
      },
      fieldBindings: [{fieldPath: "rawAmount", requirementId: "amount"}],
      auxiliaryFieldBindings: [],
      providerCredentialId: "credential-id",
      sourceSnapshotId: "snapshot-id",
      schemaDocument,
    }],
  });
  assert.equal(plan.sources[0]!.rowLimit, null);
  const requestSizes: unknown[] = [];
  const result = await executeLivePlan(plan, async () => ({
    async executeStaticQuery(_manifest, _document, variables) {
      requestSizes.push(variables.first);
      const cursor = String(variables.cursor);
      if (cursor === "") return {data: {items: [{id: "1", rawAmount: "1"}, {id: "2", rawAmount: "2"}]}, errors: []};
      if (cursor === "2") return {data: {items: [{id: "3", rawAmount: "3"}, {id: "4", rawAmount: "4"}]}, errors: []};
      return {data: {items: []}, errors: []};
    },
    async close() {},
  }));
  assert.deepEqual(requestSizes, [2, 2, 1]);
  assert.equal(result.sourceRequests, 3);
  assert.deepEqual(result.rows, [{amount: "1"}, {amount: "2"}, {amount: "3"}, {amount: "4"}]);
});

test("live reads reject a source that contains rows beyond the compiled row ceiling", async () => {
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
      queryPlan: {
        schemaVersion: 1,
        operationName: "SprueLiveSource",
        document: "query SprueLiveSource($first: Int!, $cursor: ID!) { items(first: $first, orderBy: id, orderDirection: asc, where: { id_gt: $cursor }) { id rawAmount } }",
        pagination: {kind: "id_cursor", cursorField: "id", pageSize: 2, maxRequests: 3, maxRows: 4},
        pushedOperations: [],
      },
      fieldBindings: [{fieldPath: "rawAmount", requirementId: "amount"}],
      auxiliaryFieldBindings: [],
      providerCredentialId: "credential-id",
      sourceSnapshotId: "snapshot-id",
      schemaDocument,
    }],
  });
  await assert.rejects(executeLivePlan(plan, async () => ({
    async executeStaticQuery(_manifest, _document, variables) {
      const cursor = String(variables.cursor);
      if (cursor === "") return {data: {items: [{id: "1", rawAmount: "1"}, {id: "2", rawAmount: "2"}]}, errors: []};
      if (cursor === "2") return {data: {items: [{id: "3", rawAmount: "3"}, {id: "4", rawAmount: "4"}]}, errors: []};
      return {data: {items: [{id: "5", rawAmount: "5"}]}, errors: []};
    },
    async close() {},
  })), /exceeded the compiled row limit/);
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

test("immutable live plans accept Graph built-ins and passive provider object annotations without weakening validation", () => {
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
    sources: [{
      ...source,
      queryEntityType: "Item",
      schemaDocument: `${graphDialectSchemaDocument}\ntype Snapshot @dailySnapshot @hourlySnapshot @regularPolling @transaction { id: ID! }`,
    }],
  });
  assert.match(plan.sources[0]!.queryDocument, /\$cursor: Bytes!/);
  assert.equal(plan.sources[0]!.initialCursor, "0x");

  assert.throws(
    () => createImmutableLivePlan({
      compilation,
      dag: input.dag,
      sources: [{...source, schemaDocument: `${schemaDocument}\ntype Unsupported { id: ID! @providerOnly }`}],
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
