import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { createHttpApp } from "../src/http/app.js";
import { parseConfig, ConfigError } from "../src/app/config.js";
import { listen, drain } from "../src/app/server.js";
import { IdentityService } from "../src/modules/identity/service.js";
import { AuthService } from "../src/modules/auth/service.js";
import { AppError } from "../src/shared/errors.js";
import { unavailableIdentity } from "../src/integrations/unavailable-identity.js";
import type { LogEvent } from "../src/shared/logger.js";
import { atomicSchema } from "../src/http/contracts/common.js";

const workspace = "10000000-0000-4000-8000-000000000001";
const user = "10000000-0000-4000-8000-000000000002";
const bootstrap = {
  user: { id: user, displayName: "Test creator", status: "active" as const },
  workspaces: [
    {
      id: workspace,
      slug: "test",
      name: "Test",
      status: "active" as const,
      role: "owner" as const,
      lockVersion: 0,
    },
  ],
  defaultWorkspaceId: workspace,
};
const environment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:local-only@127.0.0.1:1/test",
  REDIS_URL: "redis://127.0.0.1:1",
  API_BASE_URL: "http://127.0.0.1:3001",
  CONSOLE_PUBLIC_URL: "http://127.0.0.1:4173",
  DATA_PUBLIC_BASE_URL: "http://127.0.0.1:3001/data/v1",
  CORS_ALLOWED_ORIGINS: "http://127.0.0.1:4173",
};

test("HTTP framework boundaries through real local sockets", async (t) => {
  const logs: LogEvent[] = [];
  let ready = false;
  let stopping = false;
  let authenticationCalls = 0;
  let ownerCalls = 0;
  const verifier = {
    async verify(token: string) {
      authenticationCalls++;
      if (token === "expired") throw new AppError("AUTH_EXPIRED");
      if (token === "leak")
        throw new Error("private-key-and-database-url-must-not-leak");
      return { provider: "privy", subject: "test-provider-subject" };
    },
  };
  const identity = new IdentityService({
    async findBootstrap() {
      return bootstrap;
    },
    async findOwnedWorkspace(_subject, id) {
      ownerCalls++;
      return id === workspace
        ? { userId: user, userStatus: "active", workspaceStatus: "active" }
        : null;
    },
  });
  let bootstrapCalls = 0;
  const authService = new AuthService({
    async bootstrap() {
      bootstrapCalls++;
      return { kind: "ready", bootstrap };
    },
  });
  const credential = {
    id: "10000000-0000-4000-8000-000000000006",
    label: "production",
    provider: "the_graph" as const,
    credentialType: "graph_api_key" as const,
    ownershipModel: "customer_supplied" as const,
    billingModel: "customer_subscription" as const,
    publicPrefix: "grap...",
    fingerprint: "credential-fingerprint",
    secretVersion: "1",
    status: "pending_validation" as const,
    isSelected: false,
    validatedAt: null,
    lastUsedAt: null,
    revokedAt: null,
    observedConstraints: null,
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
    lockVersion: 0,
  };
  let graphCredentialInput: unknown;
  const graphCredentialMutations: unknown[] = [];
  const builderSourceInputs: unknown[] = [];
  let hederaActivationInput: unknown;
  let productCreateInput: unknown;
  let productDeleteInput: unknown;
  const product = {
    id: "10000000-0000-4000-8000-000000000007",
    workspaceId: workspace,
    accountWalletId: "10000000-0000-4000-8000-000000000008",
    slug: "new-product-10000000",
    name: "New Product",
    description: null,
    originalIntent: "Find active wallets.",
    status: "draft" as const,
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    lockVersion: 0,
    latestVersion: null,
    activeDeployment: null,
    latestRun: null,
    nextAction: "open_builder" as const,
  };
  const productDelivery = {
    productId: product.id,
    capabilities: {
      deploy: false,
      privateRequest: false,
      publishX402: false,
      publicRequest: false,
    },
    api: {
      readiness: "no_version" as const,
      blockers: [{code: "VERSION_MISSING", message: "No durable product version exists yet."}],
      latestVersion: null,
      activeVersion: null,
      deployment: null,
      contract: null,
    },
    monetization: {
      readiness: "api_not_ready" as const,
      blockers: [{code: "API_NOT_READY", message: "A healthy API deployment with ready materialized data is required."}],
      publication: null,
      revenue: {grossSales: [], creatorProceeds: [], providerFees: []},
      sales: [],
    },
  };
  const walletAccessProjection = () => ({
    wallets: [],
    credentials: [credential],
    balances: [],
    signerGrants: [],
    spendingPolicies: [],
    recipientCapabilities: [],
    readiness: [{
      kind: "account_wallet" as const,
      status: "blocked" as const,
      observedAt: null,
      blockers: [{
        code: "WALLET_NOT_PROVISIONED",
        message: "No Privy account wallet is bound to this workspace.",
      }],
    }],
  });
  const dependencies = {
    config: parseConfig(environment),
    logger: {
      write(event: LogEvent) {
        logs.push(event);
      },
    },
    identity,
    auth: authService,
    verifier,
    wallets: {
      async readAccess(readWorkspaceId: string) {
        assert.equal(readWorkspaceId, workspace);
        return walletAccessProjection();
      },
      async activateHedera(input: unknown) {
        hederaActivationInput = input;
        return walletAccessProjection();
      },
    } as never,
    graphCredentials: {
      async list(readWorkspaceId: string) {
        assert.equal(readWorkspaceId, workspace);
        return [credential];
      },
      async create(
        writeWorkspaceId: string,
        actorUserId: string,
        input: unknown,
      ) {
        assert.equal(writeWorkspaceId, workspace);
        assert.equal(actorUserId, user);
        graphCredentialInput = input;
        return credential;
      },
      async validate(writeWorkspaceId: string, credentialId: string, lockVersion: number) {
        graphCredentialMutations.push({operation: "validate", writeWorkspaceId, credentialId, lockVersion});
        return {...credential, status: "active", validatedAt: "2026-09-08T00:00:00.000Z", lockVersion: 1};
      },
      async select(writeWorkspaceId: string, credentialId: string, lockVersion: number) {
        graphCredentialMutations.push({operation: "select", writeWorkspaceId, credentialId, lockVersion});
        return {...credential, status: "active", isSelected: true, lockVersion: 2};
      },
      async revoke(writeWorkspaceId: string, credentialId: string, lockVersion: number) {
        graphCredentialMutations.push({operation: "revoke", writeWorkspaceId, credentialId, lockVersion});
        return {...credential, status: "revoked", revokedAt: "2026-09-08T00:00:00.000Z", lockVersion: 3};
      },
    } as never,
    builderSources: {
      async search(input: unknown) {
        builderSourceInputs.push({operation: "search", input});
        return {
          query: "Uniswap",
          network: {dataNetwork: "eip155:42161", graphNetworkId: "arbitrum-one", label: "Arbitrum One"},
          total: 1,
          candidates: [{
            displayName: "Uniswap Arbitrum One",
            logicalSubgraphId: "logical-arbitrum",
            manifestIpfsCid: "QmArbitrum",
            reportedNetwork: null,
            networkEvidence: "matched",
            totalQueryCount30d: 42,
            reference: {type: "ipfs_hash", id: "QmArbitrum"},
          }],
        };
      },
      async validate(input: unknown) {
        builderSourceInputs.push({operation: "validate", input});
        return {
          sourceId: "graph:manual:01234567890123456789",
          provider: "the_graph",
          displayName: "IPFS deployment QmArbitrum",
          reference: {type: "ipfs_hash", id: "QmArbitrum"},
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
          access: {mode: "api_key", credentialId: credential.id, verified: true},
          observedAt: "2026-09-11T00:00:00.000Z",
          admissionStatus: "planning_verified",
        };
      },
    } as never,
    products: {
      async list() {
        return {items: [product], nextCursor: null, hasMore: false};
      },
      async overview() {
        return {
          period: {startsAt: "2026-09-07T00:00:00.000Z", endsAt: "2026-09-08T00:00:00.000Z"},
          activeProductCount: "0",
          draftVersionCount: "0",
          apiRequestCount: "0",
          graphExpenses: [],
          grossSales: [],
          readiness: [],
          recentActivity: [],
        };
      },
      async create(input: unknown) {
        productCreateInput = input;
        return product;
      },
      async read() {
        return product;
      },
      async delivery() {
        return productDelivery;
      },
      async update() {
        return {...product, name: "Renamed", lockVersion: 1};
      },
      async delete(input: unknown) {
        productDeleteInput = input;
        return {productId: product.id, deletedAt: "2026-09-08T00:05:00.000Z"};
      },
    } as never,
    ready: async () => ready,
    stopping: () => stopping,
  };
  const server = await listen(createHttpApp(dependencies), "127.0.0.1", 0);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const call = (path: string, init: RequestInit = {}) =>
    fetch(url + path, { ...init, signal: AbortSignal.timeout(5000) });
  const auth = { Authorization: "Bearer test-token" };
  const jsonHeaders = {
    ...auth,
    "Content-Type": "application/json",
    "Idempotency-Key": "test-idempotency-key",
  };
  try {
    await t.test("process health and DB readiness are different", async () => {
      assert.deepEqual(await (await call("/healthz")).json(), { status: "ok" });
      const unavailable = await call("/readyz");
      assert.equal(unavailable.status, 503);
      assert.deepEqual(await unavailable.json(), { status: "not_ready" });
      ready = true;
      assert.equal((await call("/readyz")).status, 200);
    });
    await t.test(
      "public config is allowlisted, no-store and truthfully disabled",
      async () => {
        const response = await call("/api/v1/app-config", {
          headers: {
            "X-Request-ID": "attacker-picked-id",
            Host: "attacker.invalid",
          },
        });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.data.privyAppId, null);
        assert.equal(body.data.demoProductUrl, null);
        assert.ok(
          Object.values(body.data.features).every((value) => value === false),
        );
        assert.equal(
          body.data.dataPublicBaseUrl,
          environment.DATA_PUBLIC_BASE_URL,
        );
        assert.match(body.meta.requestId, /^req_/);
        assert.notEqual(body.meta.requestId, "attacker-picked-id");
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(response.headers.get("x-powered-by"), null);
        assert.equal(JSON.stringify(body).includes("local-only"), false);
        assert.equal(
          (await call("/api/v1/app-config?ownerUserId=override")).status,
          400,
        );
      },
    );
    await t.test(
      "exact CORS preflight performs no authentication or owner read",
      async () => {
        const before = [authenticationCalls, ownerCalls];
        const response = await call(
          `/api/v1/workspaces/${workspace}/products`,
          {
            method: "OPTIONS",
            headers: {
              Origin: environment.CONSOLE_PUBLIC_URL,
              "Access-Control-Request-Method": "POST",
              "Access-Control-Request-Headers":
                "Authorization, Content-Type, Idempotency-Key",
            },
          },
        );
        assert.equal(response.status, 204);
        assert.equal(
          response.headers.get("access-control-allow-origin"),
          environment.CONSOLE_PUBLIC_URL,
        );
        assert.equal(
          response.headers.get("access-control-allow-credentials"),
          null,
        );
        assert.deepEqual([authenticationCalls, ownerCalls], before);
        const deleteResponse = await call(
          `/api/v1/workspaces/${workspace}/products/22222222-2222-4222-8222-222222222222`,
          {
            method: "OPTIONS",
            headers: {
              Origin: environment.CONSOLE_PUBLIC_URL,
              "Access-Control-Request-Method": "DELETE",
              "Access-Control-Request-Headers":
                "Authorization, Idempotency-Key, If-Match",
            },
          },
        );
        assert.equal(deleteResponse.status, 204);
        assert.match(
          deleteResponse.headers.get("access-control-allow-methods") ?? "",
          /(?:^|, )DELETE(?:,|$)/,
        );
        assert.deepEqual([authenticationCalls, ownerCalls], before);
        assert.equal(
          (
            await call("/api/v1/app-config", {
              headers: { Origin: "https://evil.invalid" },
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await call("/api/v1/app-config", {
              method: "OPTIONS",
              headers: {
                Origin: environment.CONSOLE_PUBLIC_URL,
                "Access-Control-Request-Headers": "X-Unreviewed-Secret",
              },
            })
          ).status,
          403,
        );
      },
    );
    await t.test(
      "creator authentication precedes private reads and owner checks",
      async () => {
        assert.equal((await call("/api/v1/me")).status, 401);
        assert.equal(
          (
            await call("/api/v1/me", {
              headers: { Authorization: "Bearer expired" },
            })
          ).status,
          401,
        );
        const result = await call("/api/v1/me", { headers: auth });
        assert.equal(result.status, 200);
        assert.deepEqual((await result.json()).data, bootstrap);
        const initialized = await call("/api/v1/bootstrap", {
          method: "POST",
          headers: jsonHeaders,
          body: "{}",
        });
        assert.equal(initialized.status, 200);
        assert.deepEqual((await initialized.json()).data, bootstrap);
        assert.equal(bootstrapCalls, 1);
        assert.equal(
          (
            await call("/api/v1/bootstrap", {
              method: "POST",
              headers: jsonHeaders,
              body: '{"userId":"browser-value"}',
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await call(
              "/api/v1/workspaces/10000000-0000-4000-8000-000000000099/products",
              { headers: auth },
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await call("/api/v1/workspaces/not-a-uuid/products", {
              headers: auth,
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "product metadata and structured DAG compilation routes are live",
      async () => {
        assert.equal(
          (
            await call(`/api/v1/workspaces/${workspace}/products`, {
              method: "POST",
              headers: auth,
            })
          ).status,
          415,
        );
        assert.equal(
          (
            await call(`/api/v1/workspaces/${workspace}/products`, {
              method: "POST",
              headers: { ...auth, "Content-Type": "application/json" },
              body: "{}",
            })
          ).status,
          400,
        );
        const response = await call(
          `/api/v1/workspaces/${workspace}/products`,
          {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({
              name: "New Product",
              originalIntent: "Find active wallets.",
              accountWalletId: product.accountWalletId,
            }),
          },
        );
        assert.equal(response.status, 201);
        assert.equal((await response.json()).data.name, "New Product");
        assert.deepEqual(productCreateInput, {
          workspaceId: workspace,
          actorUserId: user,
          name: "New Product",
          originalIntent: "Find active wallets.",
          accountWalletId: product.accountWalletId,
          idempotencyKey: "test-idempotency-key",
        });
        const missingDeletePrecondition = await call(
          `/api/v1/workspaces/${workspace}/products/${product.id}`,
          {
            method: "DELETE",
            headers: {...auth, "Idempotency-Key": "delete-product-key-0001"},
          },
        );
        assert.equal(missingDeletePrecondition.status, 428);
        const deleted = await call(
          `/api/v1/workspaces/${workspace}/products/${product.id}`,
          {
            method: "DELETE",
            headers: {
              ...auth,
              "Idempotency-Key": "delete-product-key-0001",
              "If-Match": '"0"',
            },
          },
        );
        assert.equal(deleted.status, 200);
        assert.equal((await deleted.json()).data.productId, product.id);
        assert.deepEqual(productDeleteInput, {
          workspaceId: workspace,
          productId: product.id,
          actorUserId: user,
          expectedLockVersion: 0,
          idempotencyKey: "delete-product-key-0001",
        });
        const delivery = await call(
          `/api/v1/workspaces/${workspace}/products/${product.id}/delivery`,
          {headers: auth},
        );
        assert.equal(delivery.status, 200);
        const deliveryBody = await delivery.json();
        assert.equal(deliveryBody.meta.dataSource, "live");
        assert.deepEqual(deliveryBody.data, productDelivery);
        const patch = await call(
          `/api/v1/workspaces/${workspace}/products/${user}`,
          { method: "PATCH", headers: jsonHeaders, body: "{}" },
        );
        assert.equal(patch.status, 428);
        const compiled = await call(
          `/api/v1/workspaces/${workspace}/products/${product.id}/build-preflight`,
          {
            method: "POST",
            headers: { ...auth, "Content-Type": "application/json" },
            body: JSON.stringify({
              schemaVersion: 1,
              dag: {
                nodes: [
                  {id: "source_rows", type: "source", operatorVersion: "1", config: {sourceId: "graph:source"}, outputSchema: {fields: [
                    {name: "amount_usd", type: "decimal", nullable: false, unit: "USD"},
                  ]}},
                  {id: "normalize_rows", type: "map", operatorVersion: "2", config: {mode: "project", fields: [
                    {name: "amount_usd", expression: {op: "field", field: "amount_usd"}},
                  ]}},
                  {id: "final_output", type: "output", operatorVersion: "3", config: {fields: ["amount_usd"]}},
                ],
                edges: [
                  {fromNode: "source_rows", fromPort: "rows", toNode: "normalize_rows", toPort: "rows"},
                  {fromNode: "normalize_rows", fromPort: "rows", toNode: "final_output", toPort: "rows"},
                ],
              },
              outputSchema: {fields: [{name: "amount_usd", type: "decimal", nullable: false, unit: "USD"}]},
            }),
          },
        );
        assert.equal(compiled.status, 200);
        const compiledBody = await compiled.json();
        assert.equal(compiledBody.meta.dataSource, "live");
        assert.equal(compiledBody.data.status, "passed");
        assert.match(compiledBody.data.compilationHash, /^[0-9a-f]{64}$/);
      },
    );
    await t.test("Builder Graph source lookup is authenticated and workspace scoped", async () => {
      const searched = await call(`/api/v1/workspaces/${workspace}/graph-sources/search`, {
        method: "POST",
        headers: {...auth, "Content-Type": "application/json"},
        body: JSON.stringify({query: "Uniswap", network: "arbitrum-one"}),
      });
      assert.equal(searched.status, 200);
      assert.equal((await searched.json()).data.candidates[0].manifestIpfsCid, "QmArbitrum");

      const verified = await call(`/api/v1/workspaces/${workspace}/graph-sources/validate`, {
        method: "POST",
        headers: {...auth, "Content-Type": "application/json"},
        body: JSON.stringify({reference: {type: "ipfs_hash", id: "QmArbitrum"}, network: "arbitrum-one"}),
      });
      assert.equal(verified.status, 200);
      assert.equal((await verified.json()).data.entities[0].fields[0].path, "amountUSD");
      assert.deepEqual(builderSourceInputs, [
        {operation: "search", input: {workspaceId: workspace, query: "Uniswap", network: "arbitrum-one"}},
        {operation: "validate", input: {workspaceId: workspace, reference: {type: "ipfs_hash", id: "QmArbitrum"}, network: "arbitrum-one"}},
      ]);
    });
    await t.test(
      "wallet and Graph credential routes use the authorized workspace without returning secrets",
      async () => {
        const walletResponse = await call(
          `/api/v1/workspaces/${workspace}/wallet-access`,
          {headers: auth},
        );
        assert.equal(walletResponse.status, 200);
        assert.deepEqual((await walletResponse.json()).data.credentials, [credential]);

        const hederaResponse = await call(
          `/api/v1/workspaces/${workspace}/wallets/${user}/resolve-hedera`,
          {method: "POST", headers: jsonHeaders, body: "{}"},
        );
        assert.equal(hederaResponse.status, 200);
        assert.deepEqual(hederaActivationInput, {
          workspaceId: workspace,
          userId: user,
          walletId: user,
          idempotencyKey: jsonHeaders["Idempotency-Key"],
        });

        const listResponse = await call(
          `/api/v1/workspaces/${workspace}/graph-credentials`,
          {headers: auth},
        );
        assert.equal(listResponse.status, 200);
        assert.deepEqual((await listResponse.json()).data, [credential]);

        const secret = "graph-api-key-write-only";
        const createResponse = await call(
          `/api/v1/workspaces/${workspace}/graph-credentials`,
          {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({label: "production", apiKey: secret}),
          },
        );
        assert.equal(createResponse.status, 201);
        const body = await createResponse.json();
        assert.deepEqual(graphCredentialInput, {
          label: "production",
          apiKey: secret,
        });
        assert.deepEqual(body.data, credential);
        assert.equal(JSON.stringify(body).includes(secret), false);
        assert.equal(JSON.stringify(logs).includes(secret), false);

        const mutationHeaders = {...jsonHeaders, "If-Match": '"0"'};
        for (const operation of ["validate", "select", "revoke"]) {
          const response = await call(
            `/api/v1/workspaces/${workspace}/graph-credentials/${credential.id}/${operation}`,
            {method: "POST", headers: mutationHeaders, body: "{}"},
          );
          assert.equal(response.status, 200, operation);
        }
        assert.deepEqual(graphCredentialMutations, [
          {operation: "validate", writeWorkspaceId: workspace, credentialId: credential.id, lockVersion: 0},
          {operation: "select", writeWorkspaceId: workspace, credentialId: credential.id, lockVersion: 0},
          {operation: "revoke", writeWorkspaceId: workspace, credentialId: credential.id, lockVersion: 0},
        ]);

        const missingPrecondition = await call(
          `/api/v1/workspaces/${workspace}/graph-credentials/${credential.id}/validate`,
          {method: "POST", headers: jsonHeaders, body: "{}"},
        );
        assert.equal(missingPrecondition.status, 428);
      },
    );
    await t.test(
      "body limits, malformed JSON and raw exceptions are sanitized",
      async () => {
        const path = `/api/v1/workspaces/${workspace}/graph-credentials`;
        const invalid = await call(path, {
          method: "POST",
          headers: jsonHeaders,
          body: '{"apiKey":"secret-sentinel",',
        });
        assert.equal(invalid.status, 400);
        assert.equal((await invalid.text()).includes("secret-sentinel"), false);
        const huge = await call(path, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ apiKey: "x".repeat(262144) }),
        });
        assert.equal(huge.status, 413);
        const messages = await call(
          `/api/v1/workspaces/${workspace}/agent-sessions/${user}/messages`,
          {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({ contentText: "x".repeat(65536) }),
          },
        );
        assert.equal(messages.status, 413);
        const failure = await call("/api/v1/me?apiKey=secret-sentinel", {
          headers: { Authorization: "Bearer leak" },
        });
        assert.equal(failure.status, 500);
        assert.equal((await failure.text()).includes("private-key"), false);
        await call("/unknown/secret-sentinel?token=secret-sentinel");
        assert.equal(JSON.stringify(logs).includes("secret-sentinel"), false);
        assert.equal(JSON.stringify(logs).includes("test-token"), false);
        assert.equal(JSON.stringify(logs).includes("private-key"), false);
      },
    );
    await t.test(
      "data HEAD cannot execute GET and recovery syntax proves no ownership",
      async () => {
        const head = await call("/data/v1/test", { method: "HEAD" });
        assert.equal(head.status, 405);
        assert.equal(await head.text(), "");
        assert.equal(
          (
            await call("/data/v1/test", {
              method: "POST",
              headers: jsonHeaders,
              body: "{}",
            })
          ).status,
          405,
        );
        assert.equal((await call("/data/v1/test")).status, 503);
        assert.equal(
          (
            await call(
              "/api/v1/public/requests/req_example/receipt?endpointSlug=test",
            )
          ).status,
          401,
        );
        const recovery = await call(
          "/api/v1/public/requests/req_example/receipt?endpointSlug=test",
          {
            headers: {
              "X-Sprue-Request-Access": randomBytes(32).toString("base64url"),
            },
          },
        );
        assert.equal(recovery.status, 503);
        assert.equal(recovery.headers.get("payment-response"), null);
      },
    );
    await t.test(
      "stopping denies admission without changing liveness",
      async () => {
        stopping = true;
        assert.equal((await call("/healthz")).status, 200);
        assert.equal((await call("/readyz")).status, 503);
        assert.equal((await call("/api/v1/app-config")).status, 503);
      },
    );
  } finally {
    await drain(server);
  }
  const worker = await listen(
    createHttpApp({ ...dependencies, stopping: () => false }, "worker"),
    "127.0.0.1",
    0,
  );
  const workerAddress = worker.address();
  assert.ok(workerAddress && typeof workerAddress !== "string");
  try {
    await t.test("worker exposes probes only", async () => {
      assert.equal(
        (await fetch(`http://127.0.0.1:${workerAddress.port}/healthz`)).status,
        200,
      );
      assert.equal(
        (
          await fetch(
            `http://127.0.0.1:${workerAddress.port}/api/v1/app-config`,
          )
        ).status,
        404,
      );
    });
  } finally {
    await drain(worker);
  }
  const unavailable = await listen(
    createHttpApp({
      ...dependencies,
      verifier: unavailableIdentity,
      stopping: () => false,
    }),
    "127.0.0.1",
    0,
  );
  const unavailableAddress = unavailable.address();
  assert.ok(unavailableAddress && typeof unavailableAddress !== "string");
  try {
    await t.test(
      "production composition has no fake-token bypass",
      async () => {
        const response = await fetch(
          `http://127.0.0.1:${unavailableAddress.port}/api/v1/me`,
          { headers: auth },
        );
        assert.equal(response.status, 503);
      },
    );
  } finally {
    await drain(unavailable);
  }
});

test("configuration rejects unsafe public URLs and money rejects lossy encodings", () => {
  const config = parseConfig(environment);
  assert.equal(config.port, 3001);
  assert.equal(config.privyAppId, null);
  assert.equal(config.privyAppSecret, null);
  assert.equal(config.redis.enabled, true);
  assert.equal(config.redis.url, "redis://127.0.0.1:1");
  const cacheDisabled = parseConfig({
    ...environment,
    GRAPH_SCHEMA_CACHE_ENABLED: "false",
    REDIS_URL: undefined,
  });
  assert.deepEqual(cacheDisabled.redis, {enabled: false, url: null});
  assert.deepEqual(config.hedera, {
    network: "hedera:testnet",
    evmChainId: 296,
    mirrorNodeUrl: "https://testnet.mirrornode.hedera.com",
    portalPat: null,
    faucetUrl: "https://portal.hedera.com/api/disbursement/cli",
    faucetAmountHbar: 1,
    hbarAssetId: "0.0.0",
    hbarDecimals: 8,
    facilitatorUrl: "https://api.testnet.blocky402.com",
  });
  const privy = parseConfig({
    ...environment,
    PRIVY_APP_ID: "test-app-id",
    PRIVY_APP_SECRET: "server-only-secret",
  });
  assert.equal(privy.privyAppId, "test-app-id");
  assert.equal(privy.privyAppSecret, "server-only-secret");
  for (const changes of [
    { PORT: "0" },
    { DATABASE_URL: "" },
    { REDIS_URL: undefined },
    { REDIS_URL: "https://example.test/cache" },
    { GRAPH_SCHEMA_CACHE_ENABLED: "yes" },
    { CORS_ALLOWED_ORIGINS: "*" },
    { API_BASE_URL: "https://user:password@example.test" },
    { DEPLOYMENT_ENVIRONMENT: "demo" },
    { API_BASE_URL: "https://example.test/?secret=value" },
    { PRIVY_APP_ID: "test-app-id" },
    { PRIVY_APP_SECRET: "server-only-secret" },
    { HEDERA_NETWORK: "hedera:mainnet" },
    { HEDERA_FAUCET_URL: "https://example.test/faucet" },
    { HEDERA_FAUCET_AMOUNT_HBAR: "0" },
    { HEDERA_FAUCET_AMOUNT_HBAR: "101" },
  ])
    assert.throws(
      () => parseConfig({ ...environment, ...changes }),
      ConfigError,
    );
  for (const value of ["1.0", "-1", "1e3", "01", "NaN", 1, "1".repeat(79)])
    assert.equal(atomicSchema.safeParse(value).success, false);
  assert.equal(
    atomicSchema.parse("123456789012345678901234567890"),
    "123456789012345678901234567890",
  );
});
