import assert from "node:assert/strict";
import test from "node:test";
import {
  getDemoModelProfile,
  getDemoState,
  runDemoAction,
  saveDemoModelProfile,
  testDemoModelProfile,
} from "../src/services/api/demo-runtime.js";
import {
  compileProductDag,
  createProduct,
  deleteProduct,
  getWorkspaceOverview,
  listProducts,
  updateProduct,
} from "../src/services/api/products.js";
import {
  cancelAgentPlanning,
  createAgentSession,
  listAgentMessages,
  listAgentSessions,
  listAgentTraceEvents,
  submitAgentMessage,
} from "../src/services/api/agent.js";
import {searchGraphSources, validateGraphSource} from "../src/services/api/graph-sources.js";

const state = {
  dataSource: "backend_demo",
  product: { draft: {} },
};
const workspaceId = "7ff7ec9e-1bc4-48ae-bac1-e7703d021834";
const creatorScope = {scope: "creator", workspaceId, accessToken: "creator-token"};

function response(data) {
  return Response.json({data, meta: {apiVersion: "1", dataSource: "demo"}});
}

function liveResponse(data) {
  return Response.json({data, meta: {apiVersion: "1", dataSource: "live"}});
}

const product = {
  id: "20000000-0000-4000-8000-000000000001",
  workspaceId,
  accountWalletId: "20000000-0000-4000-8000-000000000002",
  slug: "new-product-20000000",
  name: "New Product",
  description: null,
  originalIntent: "Find active wallets.",
  status: "draft",
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
  lockVersion: 0,
  latestVersion: null,
  activeDeployment: null,
  latestRun: null,
  nextAction: "open_builder",
};

test("frontend requests backend demo state without a fixture fallback", async () => {
  const result = await getDemoState({
    apiBaseUrl: "http://127.0.0.1:3001",
    fetchImpl: async (url, options) => {
      assert.equal(url, "http://127.0.0.1:3001/api/v1/public/demo/state");
      assert.equal(options.method, "GET");
      assert.equal(options.credentials, "omit");
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.headers["X-Sprue-Demo-Session"], undefined);
      return response(state);
    },
  });
  assert.deepEqual(result, state);
});

test("model profile client sends the key once and accepts only a redacted response", async () => {
  const profile = {
    configured: true,
    protocol: "openai_compatible_chat_completions",
    apiUrl: "https://models.example/v1/chat/completions",
    model: "judge-model",
    hasApiKey: true,
    updatedAt: "2026-09-06T00:00:00.000Z",
  };
  const saved = await saveDemoModelProfile({
    apiUrl: profile.apiUrl,
    apiKey: "browser-input-only",
    model: profile.model,
  }, {
    apiBaseUrl: "https://api.example.test",
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/model-profile`);
      assert.equal(options.method, "PUT");
      assert.equal(JSON.parse(options.body).apiKey, "browser-input-only");
      assert.equal(options.headers.Authorization, "Bearer creator-token");
      return liveResponse(profile);
    },
    ...creatorScope,
  });
  assert.deepEqual(saved, profile);
  assert.equal(JSON.stringify(saved).includes("browser-input-only"), false);

  const tested = await testDemoModelProfile({
    apiUrl: profile.apiUrl,
    apiKey: "browser-input-only",
    model: profile.model,
  }, {
    apiBaseUrl: "https://api.example.test",
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/model-profile/test`);
      assert.equal(options.method, "POST");
      assert.equal(JSON.parse(options.body).apiKey, "browser-input-only");
      assert.equal(options.headers.Authorization, "Bearer creator-token");
      return liveResponse({
        available: true,
        protocol: "openai_compatible_chat_completions",
        model: profile.model,
        latencyMs: 18,
      });
    },
    ...creatorScope,
  });
  assert.deepEqual(tested, {
    available: true,
    protocol: "openai_compatible_chat_completions",
    model: profile.model,
    latencyMs: 18,
  });
  assert.equal(JSON.stringify(tested).includes("browser-input-only"), false);

  const loaded = await getDemoModelProfile({
    apiBaseUrl: "https://api.example.test",
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/model-profile`);
      assert.equal(options.method, "GET");
      assert.equal(options.headers.Authorization, "Bearer creator-token");
      return liveResponse(profile);
    },
    ...creatorScope,
  });
  assert.deepEqual(loaded, profile);
});

test("frontend action client sends strict backend actions and returns server state", async () => {
  const result = await runDemoAction("agent_plan", {
    apiBaseUrl: "https://api.example.test",
    intent: "Find wallets across two chains.",
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/demo/actions`);
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer creator-token");
      assert.deepEqual(JSON.parse(options.body), {
        action: "agent_plan",
        intent: "Find wallets across two chains.",
      });
      return response({state, result: {data: []}});
    },
    ...creatorScope,
  });
  assert.deepEqual(result.state, state);
  assert.deepEqual(result.result, {data: []});

  await runDemoAction("api_request", {
    apiBaseUrl: "https://api.example.test",
    parameters: {limit: 100},
    ...creatorScope,
    fetchImpl: async (_url, options) => {
      assert.deepEqual(JSON.parse(options.body), {
        action: "api_request",
        parameters: {limit: 100},
      });
      return response({state, result: {data: [], meta: {returnedRows: "0"}}});
    },
  });

  await runDemoAction("rename_product", {
    apiBaseUrl: "https://api.example.test",
    name: "New Product",
    ...creatorScope,
    fetchImpl: async (_url, options) => {
      assert.deepEqual(JSON.parse(options.body), {
        action: "rename_product",
        name: "New Product",
      });
      return response({state, result: {status: "renamed", name: "New Product"}});
    },
  });

  await runDemoAction("consumer_request", {
    apiBaseUrl: "https://api.example.test",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.example.test/api/v1/public/demo/actions");
      assert.equal(options.headers.Authorization, undefined);
      assert.deepEqual(JSON.parse(options.body), {action: "consumer_request"});
      return response({state, result: {data: []}});
    },
  });
});

test("frontend action client rejects unsupported actions and invalid backend metadata", async () => {
  await assert.rejects(runDemoAction("unsupported", {apiBaseUrl: "https://api.example.test"}), /INVALID_DEMO_ACTION/);
  await assert.rejects(runDemoAction("agent_plan", {apiBaseUrl: "https://api.example.test"}), /INVALID_DEMO_ACTION/);
  await assert.rejects(getDemoModelProfile({apiBaseUrl: "https://api.example.test"}), /AUTH_REQUIRED/);
  await assert.rejects(getDemoState({
    apiBaseUrl: "https://api.example.test",
    fetchImpl: async () => Response.json({data: state, meta: {apiVersion: "1", dataSource: "live"}}),
  }), /INVALID_DEMO_API_RESPONSE/);
});

test("product dashboard client uses only authenticated live workspace records", async () => {
  const listed = await listProducts({
    apiBaseUrl: "https://api.example.test",
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/products?limit=100`);
      assert.equal(options.headers.Authorization, "Bearer creator-token");
      return Response.json({
        data: [{...product, workspaceId: undefined, accountWalletId: undefined, originalIntent: undefined, createdAt: undefined, lockVersion: undefined}],
        page: {nextCursor: null, hasMore: false},
        meta: {apiVersion: "1", dataSource: "live", observedAt: "2026-09-08T00:00:00.000Z"},
      });
    },
    ...creatorScope,
  });
  assert.equal(listed.products[0].name, "New Product");

  const overview = await getWorkspaceOverview({
    apiBaseUrl: "https://api.example.test",
    fetchImpl: async (url) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/overview?period=24h`);
      return liveResponse({
        period: {startsAt: "2026-09-07T00:00:00.000Z", endsAt: "2026-09-08T00:00:00.000Z"},
        activeProductCount: "0",
        draftVersionCount: "0",
        apiRequestCount: "0",
        graphQueryCount: "0",
        graphExpenses: [],
        grossSales: [],
        readiness: [],
        recentActivity: [],
      });
    },
    ...creatorScope,
  });
  assert.equal(overview.overview.apiRequestCount, "0");
  assert.equal(overview.overview.graphQueryCount, "0");

  const created = await createProduct({
    name: "New Product",
    originalIntent: product.originalIntent,
    accountWalletId: product.accountWalletId,
  }, {
    apiBaseUrl: "https://api.example.test",
    idempotencyKey: "dashboard-create-0001",
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, "POST");
      assert.equal(options.headers["Idempotency-Key"], "dashboard-create-0001");
      return liveResponse(product);
    },
    ...creatorScope,
  });
  assert.equal(created.workspaceId, workspaceId);

  const renamed = await updateProduct(product.id, {name: "Live product"}, {
    apiBaseUrl: "https://api.example.test",
    lockVersion: 0,
    idempotencyKey: "dashboard-update-0001",
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, "PATCH");
      assert.equal(options.headers["If-Match"], '"0"');
      return liveResponse({...product, name: "Live product", lockVersion: 1});
    },
    ...creatorScope,
  });
  assert.equal(renamed.name, "Live product");

  const deleted = await deleteProduct(product.id, {
    apiBaseUrl: "https://api.example.test",
    lockVersion: 1,
    idempotencyKey: "dashboard-delete-0001",
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/products/${product.id}`);
      assert.equal(options.method, "DELETE");
      assert.equal(options.headers.Authorization, "Bearer creator-token");
      assert.equal(options.headers["Idempotency-Key"], "dashboard-delete-0001");
      assert.equal(options.headers["If-Match"], '"1"');
      assert.equal(options.body, undefined);
      return liveResponse({productId: product.id, deletedAt: "2026-09-08T00:05:00.000Z"});
    },
    ...creatorScope,
  });
  assert.equal(deleted.productId, product.id);
});

test("Builder compilation client submits the structured DAG to the authenticated live endpoint", async () => {
  const input = {
    schemaVersion: 1,
    dag: {nodes: [], edges: []},
    outputSchema: {fields: []},
  };
  const result = await compileProductDag(product.id, input, {
    apiBaseUrl: "https://api.example.test",
    ...creatorScope,
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/products/${product.id}/build-preflight`);
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer creator-token");
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), input);
      return liveResponse({
        schemaVersion: 1,
        status: "failed",
        compiledAt: "2026-09-11T00:00:00.000Z",
        nodeCount: 0,
        edgeCount: 0,
        issues: [{code: "DAG_NODE_COUNT_INVALID", message: "DAG is empty.", nodeId: null, path: null}],
      });
    },
  });
  assert.equal(result.status, "failed");
  assert.equal(result.issues[0].code, "DAG_NODE_COUNT_INVALID");
});

test("Builder source client performs authenticated live Graph search and schema verification", async () => {
  const candidate = {
    displayName: "Uniswap Arbitrum One",
    logicalSubgraphId: "logical-arbitrum",
    manifestIpfsCid: "QmArbitrum",
    reportedNetwork: null,
    networkEvidence: "matched",
    totalQueryCount30d: 42,
    reference: {type: "ipfs_hash", id: "QmArbitrum"},
  };
  const searched = await searchGraphSources({query: "Uniswap", network: "arbitrum-one"}, {
    apiBaseUrl: "https://api.example.test",
    ...creatorScope,
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/graph-sources/search`);
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer creator-token");
      assert.deepEqual(JSON.parse(options.body), {query: "Uniswap", network: "arbitrum-one"});
      return liveResponse({
        query: "Uniswap",
        network: {dataNetwork: "eip155:42161", graphNetworkId: "arbitrum-one", label: "Arbitrum One"},
        total: 1,
        candidates: [candidate],
      });
    },
  });
  assert.equal(searched.candidates[0].manifestIpfsCid, "QmArbitrum");

  const verified = await validateGraphSource({reference: candidate.reference, network: "arbitrum-one"}, {
    apiBaseUrl: "https://api.example.test",
    ...creatorScope,
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/graph-sources/validate`);
      assert.deepEqual(JSON.parse(options.body), {reference: candidate.reference, network: "arbitrum-one"});
      return liveResponse({
        sourceId: "graph:manual:01234567890123456789",
        provider: "the_graph",
        displayName: candidate.displayName,
        reference: candidate.reference,
        dataNetwork: "eip155:42161",
        networkLabel: "Arbitrum One",
        schemaHash: `sha256:${"a".repeat(64)}`,
        schemaBytes: 300,
        queryEntitySource: "source_sdl",
        entities: [{
          queryEntity: "swaps",
          entityType: "Swap",
          fields: [{path: "amountUSD", graphType: "BigDecimal", valueType: "decimal", nullable: false, list: false}],
        }],
        activity: {totalQueryCount30d: 42, dataPointsCount: 30},
        access: {mode: "api_key", credentialId: "10000000-0000-4000-8000-000000000006", verified: true},
        observedAt: "2026-09-11T00:00:00.000Z",
        admissionStatus: "planning_verified",
      });
    },
  });
  assert.equal(verified.entities[0].fields[0].path, "amountUSD");
  assert.equal(verified.admissionStatus, "planning_verified");
});

test("Agent client uses live durable sessions and messages", async () => {
  const session = {
    id: "30000000-0000-4000-8000-000000000001",
    productId: product.id,
    title: product.name,
    status: "active",
    createdAt: "2026-09-08T01:00:00.000Z",
    closedAt: null,
    activeCommandId: null,
    traceStreamId: null,
  };
  const created = await createAgentSession({productId: product.id, title: product.name}, {
    apiBaseUrl: "https://api.example.test",
    idempotencyKey: "agent-session-create-0001",
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/agent-sessions`);
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer creator-token");
      assert.equal(options.headers["Idempotency-Key"], "agent-session-create-0001");
      return liveResponse(session);
    },
    ...creatorScope,
  });
  assert.equal(created.productId, product.id);

  const sessions = await listAgentSessions({
    apiBaseUrl: "https://api.example.test",
    productId: product.id,
    fetchImpl: async (url) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/agent-sessions?productId=${product.id}`);
      return liveResponse([session]);
    },
    ...creatorScope,
  });
  assert.equal(sessions[0].id, session.id);

  const message = {
    id: "30000000-0000-4000-8000-000000000002",
    sequenceNo: "1",
    role: "user",
    contentText: product.originalIntent,
    contentJson: null,
    redactionStatus: "none",
    modelProvider: null,
    modelName: null,
    createdAt: "2026-09-08T01:01:00.000Z",
  };
  const listed = await listAgentMessages(session.id, {
    apiBaseUrl: "https://api.example.test",
    fetchImpl: async (url) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/agent-sessions/${session.id}/messages?afterSequence=0&limit=100`);
      return liveResponse({items: [message], nextAfterSequence: "1", hasMore: false});
    },
    ...creatorScope,
  });
  assert.equal(listed.messages[0].contentText, product.originalIntent);

  const activeTrace = await listAgentTraceEvents(session.id, {
    apiBaseUrl: "https://api.example.test",
    afterSequence: 0,
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/agent-sessions/${session.id}/trace-events?afterSequence=0&limit=100`);
      assert.equal(options.method, "GET");
      assert.equal(options.headers.Authorization, "Bearer creator-token");
      return liveResponse({
        commandId: "30000000-0000-4000-8000-000000000003",
        traceStreamId: "30000000-0000-4000-8000-000000000004",
        streamStatus: "open",
        items: [{
          sequenceNo: 1,
          stage: "source_discovery_planning",
          status: "started",
          summary: "Model is deriving bounded search requirements",
          createdAt: "2026-09-08T01:01:01.000Z",
        }],
        nextAfterSequence: "1",
        hasMore: false,
      });
    },
    ...creatorScope,
  });
  assert.equal(activeTrace.events[0].status, "started");

  const command = {
    commandId: "30000000-0000-4000-8000-000000000003",
    status: "succeeded",
    subject: {type: "agent_session", id: session.id},
    traceStreamId: "30000000-0000-4000-8000-000000000004",
    pollAfterMs: 0,
  };
  const submitted = await submitAgentMessage(session.id, {
    contentText: product.originalIntent,
    responseLocale: "zh-CN",
  }, {
    apiBaseUrl: "https://api.example.test",
    idempotencyKey: "agent-message-create-0001",
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/agent-sessions/${session.id}/messages`);
      assert.equal(options.headers["Idempotency-Key"], "agent-message-create-0001");
      assert.deepEqual(JSON.parse(options.body), {contentText: product.originalIntent, responseLocale: "zh-CN"});
      return liveResponse(command);
    },
    ...creatorScope,
  });
  assert.equal(submitted.status, "succeeded");

  const cancellation = await cancelAgentPlanning(session.id, command.commandId, {
    apiBaseUrl: "https://api.example.test",
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/agent-sessions/${session.id}/planning/${command.commandId}/cancel`);
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer creator-token");
      assert.equal(options.headers["Idempotency-Key"], `sprue-agent-cancel-${command.commandId}`);
      assert.equal(options.body, "{}");
      return liveResponse({...command, status: "running"});
    },
    ...creatorScope,
  });
  assert.equal(cancellation.status, "running");
});
