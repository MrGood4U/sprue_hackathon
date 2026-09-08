import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import { parseConfig } from "../src/app/config.js";
import { createHttpApp } from "../src/http/app.js";
import { listen, drain } from "../src/app/server.js";
import { DemoRuntime } from "../src/modules/demo/runtime.js";
import { createMockStageOutput } from "../src/modules/agent/harness/mock-model.js";
import type { AgentModelConfig, AgentModelPort } from "../src/modules/agent/harness/types.js";
import { IdentityService } from "../src/modules/identity/service.js";
import { AuthService } from "../src/modules/auth/service.js";
import type { LogEvent } from "../src/shared/logger.js";
import { AppError } from "../src/shared/errors.js";
import {ModelCredentialCipher} from "../src/modules/model-profile/cipher.js";
import type {ModelProfileRecord, ModelProfileRepository} from "../src/modules/model-profile/contracts.js";
import {ModelProfileService} from "../src/modules/model-profile/service.js";
import type {AgentModelConnectionTestResult} from "../src/modules/agent/harness/remote-model.js";

const environment = {
  NODE_ENV: "test",
  DEPLOYMENT_ENVIRONMENT: "local",
  DATABASE_URL: "postgresql://test:local-only@127.0.0.1:1/test",
  API_BASE_URL: "http://127.0.0.1:3001",
  CONSOLE_PUBLIC_URL: "http://127.0.0.1:4173",
  DATA_PUBLIC_BASE_URL: "http://127.0.0.1:3001/data/v1",
  CORS_ALLOWED_ORIGINS: "http://127.0.0.1:4173",
  DEMO_RUNTIME_ENABLED: "true",
};
const workspaceA = "7ff7ec9e-1bc4-48ae-bac1-e7703d021834";
const workspaceB = "506003f7-0d70-4891-b8b8-bd3b487b475a";
const userA = "c254d47b-f33c-4ba2-99aa-c77f9d7c1051";
const userB = "adf42820-78b2-43bb-9beb-40e939630263";

function memoryModelProfiles(
  tester?: (config: AgentModelConfig) => Promise<AgentModelConnectionTestResult>,
) {
  const records = new Map<string, ModelProfileRecord>();
  const repository: ModelProfileRepository = {
    async findByWorkspace(workspaceId) {
      return records.get(workspaceId) ?? null;
    },
    async compareAndSwap(input) {
      const existing = records.get(input.workspaceId);
      if (
        (input.expectedLockVersion === null && existing) ||
        (input.expectedLockVersion !== null && existing?.lockVersion !== input.expectedLockVersion)
      ) return null;
      const now = new Date();
      const next: ModelProfileRecord = {
        id: existing?.id ?? randomUUID(),
        workspaceId: input.workspaceId,
        createdByUserId: existing?.createdByUserId ?? input.actorUserId,
        updatedByUserId: input.actorUserId,
        protocol: input.protocol,
        apiUrl: input.apiUrl,
        model: input.model,
        apiKeyCiphertext: input.sealed.ciphertext,
        encryptionKeyId: input.sealed.keyId,
        encryptionIv: input.sealed.iv,
        encryptionAuthTag: input.sealed.authTag,
        secretVersion: input.secretVersion,
        credentialFingerprint: input.sealed.fingerprint,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        lockVersion: (existing?.lockVersion ?? -1) + 1,
      };
      records.set(input.workspaceId, next);
      return next;
    },
  };
  return new ModelProfileService(
    repository,
    new ModelCredentialCipher({
      activeKeyId: "test-v1",
      keys: new Map([["test-v1", Buffer.alloc(32, 7)]]),
    }),
    5000,
    tester,
  );
}

test("backend demo runtime returns the harness proposal and cross-chain output", async () => {
  const config = parseConfig(environment);
  const state = await new DemoRuntime(config).getState();
  assert.equal(state.dataSource, "backend_demo");
  assert.equal(state.product.slug, "cross-chain-dex-trader-footprint");
  assert.equal(state.agent.status, "ready_for_review");
  assert.equal(state.agent.trace.length, 15);
  assert.equal(state.product.draft.specification.schemaVersion, 2);
  assert.equal(state.product.draft.specification.dag.nodes.length, 9);
  assert.equal(state.product.draft.referenceResult.length, 1);
  assert.equal(state.product.draft.referenceResult[0]?.combinedVolumeUsd, "456.50");
  assert.equal(state.api.endpoint, "http://127.0.0.1:3001/data/v1/cross-chain-dex-trader-footprint");
  const api = state.api as Record<string, any>;
  assert.deepEqual(api.requestParameters, [{
    name: "limit",
    location: "query",
    type: "integer",
    required: false,
    default: 100,
    minimum: 1,
    maximum: 1000,
    example: 100,
  }]);
  assert.equal(api.responseSchema.fields[1].path, "data[].wallet");
  assert.equal(api.responseExample.meta.dataSource, "backend_demo");
  assert.equal("deployment" in api, false);
  const dashboard = state.dashboard as Record<string, any>;
  assert.equal("version" in dashboard.products[0], false);
  assert.equal(dashboard.products[0].x402Status, "ready");
  assert.equal(dashboard.products[0].x402Network, "Hedera testnet");

  const request = await new DemoRuntime(config).run({action: "api_request", parameters: {limit: 1}});
  assert.equal((request.result.data as readonly unknown[]).length, 1);
  assert.equal((request.result.meta as Record<string, unknown>).returnedRows, "1");
});

test("product names are trimmed and retained only within one demo workspace", async () => {
  const config = parseConfig(environment);
  const runtime = new DemoRuntime(config);
  const renamed = await runtime.run(
    {action: "rename_product", name: "  New Product  "},
    workspaceA,
  );
  const renamedDashboard = renamed.state.dashboard as Record<string, any>;
  assert.equal(renamed.result.name, "New Product");
  assert.equal(renamed.state.product.name, "New Product");
  assert.equal(renamedDashboard.products[0].name, "New Product");

  const restored = await runtime.getState(workspaceA);
  assert.equal(restored.product.name, "New Product");

  const isolated = await runtime.getState(workspaceB);
  assert.equal(isolated.product.name, "Cross-chain DEX Trader Footprint");
});

test("workspace model profiles never echo keys and drive the next Agent plan", async () => {
  const config = parseConfig(environment);
  const observedConfigs: AgentModelConfig[] = [];
  const observedStages: string[] = [];
  const testedConfigs: AgentModelConfig[] = [];
  const modelFactory = (modelConfig: AgentModelConfig): AgentModelPort => {
    observedConfigs.push(modelConfig);
    return {
      async complete(request) {
        observedStages.push(request.stage);
        return {
          provider: modelConfig.mode,
          model: modelConfig.model,
          output: createMockStageOutput(request),
        };
      },
    };
  };
  const profiles = memoryModelProfiles(async (modelConfig) => {
    testedConfigs.push(modelConfig);
    return {
      available: true,
      protocol: "openai_compatible_chat_completions",
      model: modelConfig.model,
      latencyMs: 12,
    };
  });
  const runtime = new DemoRuntime(config, modelFactory, profiles);
  const saved = await profiles.save(workspaceA, userA, {
    apiUrl: "https://models.example/v1/chat/completions",
    apiKey: "session-secret-key",
    model: "judge-model",
  });
  assert.equal(saved.hasApiKey, true);
  assert.equal(JSON.stringify(saved).includes("session-secret-key"), false);

  const tested = await profiles.test(workspaceA, {
    apiUrl: "https://probe.example/v1/chat/completions",
    model: "probe-model",
  });
  assert.equal(tested.model, "probe-model");
  assert.equal(testedConfigs.at(-1)?.apiKey, "session-secret-key");
  assert.equal((await profiles.read(workspaceA)).model, "judge-model");

  const result = await runtime.run({action: "agent_plan", intent: "Find cross-chain traders."}, workspaceA);
  assert.equal(result.state.agent.provider, "remote");
  assert.equal(result.state.agent.model, "judge-model");
  assert.equal(observedConfigs.at(-1)?.apiUrl, "https://models.example/v1/chat/completions");
  assert.equal(observedConfigs.at(-1)?.apiKey, "session-secret-key");
  assert.deepEqual(observedStages, ["semantic_interpretation", "source_selection", "dag_composition"]);
});

test("enabled demo HTTP routes are the only frontend business-data boundary in this slice", async () => {
  const config = parseConfig(environment);
  const logs: LogEvent[] = [];
  const verifier = {
    async verify(token: string) {
      if (token === "creator-a") return {provider: "privy", subject: "creator-a"};
      if (token === "creator-b") return {provider: "privy", subject: "creator-b"};
      throw new AppError("AUTH_REQUIRED");
    },
  };
  const modelProfiles = memoryModelProfiles(async (modelConfig) => ({
    available: true,
    protocol: "openai_compatible_chat_completions",
    model: modelConfig.model,
    latencyMs: 9,
  }));
  const demo = new DemoRuntime(config, (modelConfig) => ({
    async complete(request) {
      return {
        provider: modelConfig.mode,
        model: modelConfig.model,
        output: createMockStageOutput(request),
      };
    },
  }), modelProfiles);
  const app = createHttpApp({
    config,
    logger: {write(event) { logs.push(event); }},
    verifier,
    identity: new IdentityService({
      async findBootstrap() { return null; },
      async findOwnedWorkspace(identity, workspaceId) {
        const ownsWorkspace =
          (identity.subject === "creator-a" && workspaceId === workspaceA) ||
          (identity.subject === "creator-b" && workspaceId === workspaceB);
        return ownsWorkspace
          ? {userId: identity.subject === "creator-a" ? userA : userB, userStatus: "active" as const, workspaceStatus: "active" as const}
          : null;
      },
    }),
    auth: new AuthService({
      async bootstrap() {
        return { kind: "blocked", userStatus: "suspended" };
      },
    }),
    modelProfiles,
    demo,
    ready: async () => true,
    stopping: () => false,
  });
  const server = await listen(app, "127.0.0.1", 0);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const authA = {Authorization: "Bearer creator-a"};
  const authB = {Authorization: "Bearer creator-b"};
  const workspaceBase = `${baseUrl}/api/v1/workspaces/${workspaceA}/demo`;
  const modelProfileBase = `${baseUrl}/api/v1/workspaces/${workspaceA}/model-profile`;
  try {
    const stateResponse = await fetch(`${baseUrl}/api/v1/public/demo/state`);
    assert.equal(stateResponse.status, 200);
    const stateBody = await stateResponse.json();
    assert.equal(stateBody.meta.dataSource, "demo");
    assert.equal(stateBody.data.dataSource, "backend_demo");

    assert.equal(
      (await fetch(`${baseUrl}/api/v1/public/demo/model-profile`)).status,
      404,
    );
    assert.equal((await fetch(`${workspaceBase}/state`)).status, 401);

    const unconfiguredProfile = await fetch(modelProfileBase, {
      headers: authA,
    });
    assert.equal(unconfiguredProfile.status, 200);
    assert.equal((await unconfiguredProfile.json()).data.configured, false);

    const savedProfile = await fetch(modelProfileBase, {
      method: "PUT",
      headers: {"Content-Type": "application/json", ...authA},
      body: JSON.stringify({
        apiUrl: "https://models.example/v1/chat/completions",
        apiKey: "http-secret-key",
        model: "judge-model",
      }),
    });
    assert.equal(savedProfile.status, 200);
    const savedProfileBody = await savedProfile.json();
    assert.equal(savedProfileBody.data.configured, true);
    assert.equal(savedProfileBody.data.hasApiKey, true);
    assert.equal(JSON.stringify(savedProfileBody).includes("http-secret-key"), false);

    const testedProfile = await fetch(`${modelProfileBase}/test`, {
      method: "POST",
      headers: {"Content-Type": "application/json", ...authA},
      body: JSON.stringify({
        apiUrl: "https://models.example/v1/chat/completions",
        model: "judge-model",
      }),
    });
    assert.equal(testedProfile.status, 200);
    const testedProfileBody = await testedProfile.json();
    assert.deepEqual(testedProfileBody.data, {
      available: true,
      protocol: "openai_compatible_chat_completions",
      model: "judge-model",
      latencyMs: 9,
    });
    assert.equal(JSON.stringify(testedProfileBody).includes("http-secret-key"), false);

    const actionResponse = await fetch(`${baseUrl}/api/v1/public/demo/actions`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({action: "consumer_request"}),
    });
    assert.equal(actionResponse.status, 200);
    const actionBody = await actionResponse.json();
    assert.equal(actionBody.data.result.data.length, 1);
    assert.equal(actionBody.data.result.payment.network, "hedera:testnet");
    assert.equal(actionBody.data.state.dataSource, "backend_demo");

    const privatePublicAction = await fetch(`${baseUrl}/api/v1/public/demo/actions`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({action: "agent_plan", intent: "Find cross-chain traders."}),
    });
    assert.equal(privatePublicAction.status, 400);

    const renameResponse = await fetch(`${workspaceBase}/actions`, {
      method: "POST",
      headers: {"Content-Type": "application/json", ...authA},
      body: JSON.stringify({action: "rename_product", name: "  New Product  "}),
    });
    assert.equal(renameResponse.status, 200);
    const renameBody = await renameResponse.json();
    assert.equal(renameBody.data.result.name, "New Product");
    assert.equal(renameBody.data.state.product.name, "New Product");
    assert.equal(renameBody.data.state.dashboard.products[0].name, "New Product");

    const renamedStateResponse = await fetch(`${workspaceBase}/state`, {
      headers: authA,
    });
    assert.equal(renamedStateResponse.status, 200);
    assert.equal((await renamedStateResponse.json()).data.product.name, "New Product");

    assert.equal(
      (await fetch(`${workspaceBase}/state`, {headers: authB})).status,
      404,
    );
    const isolatedState = await fetch(
      `${baseUrl}/api/v1/workspaces/${workspaceB}/demo/state`,
      {headers: authB},
    );
    assert.equal(isolatedState.status, 200);
    assert.equal(
      (await isolatedState.json()).data.product.name,
      "Cross-chain DEX Trader Footprint",
    );

    const apiRequest = await fetch(`${workspaceBase}/actions`, {
      method: "POST",
      headers: {"Content-Type": "application/json", ...authA},
      body: JSON.stringify({action: "api_request", parameters: {limit: 1}}),
    });
    assert.equal(apiRequest.status, 200);
    const apiRequestBody = await apiRequest.json();
    assert.equal(apiRequestBody.data.result.data.length, 1);
    assert.equal(apiRequestBody.data.result.meta.returnedRows, "1");

    const emptyRenameResponse = await fetch(`${workspaceBase}/actions`, {
      method: "POST",
      headers: {"Content-Type": "application/json", ...authA},
      body: JSON.stringify({action: "rename_product", name: "   "}),
    });
    assert.equal(emptyRenameResponse.status, 400);

    const invalidLimitResponse = await fetch(`${workspaceBase}/actions`, {
      method: "POST",
      headers: {"Content-Type": "application/json", ...authA},
      body: JSON.stringify({action: "api_request", parameters: {limit: 1001}}),
    });
    assert.equal(invalidLimitResponse.status, 400);

    const planResponse = await fetch(`${workspaceBase}/actions`, {
      method: "POST",
      headers: {"Content-Type": "application/json", ...authA},
      body: JSON.stringify({action: "agent_plan", intent: "Find cross-chain traders."}),
    });
    assert.equal(planResponse.status, 200);
    const planBody = await planResponse.json();
    assert.equal(planBody.data.result.status, "ready_for_review");
    assert.equal(planBody.data.state.product.intent, "Find cross-chain traders.");

    const invalidResponse = await fetch(`${workspaceBase}/actions`, {
      method: "POST",
      headers: {"Content-Type": "application/json", ...authA},
      body: JSON.stringify({action: "build", parameters: {windowDays: 7}}),
    });
    assert.equal(invalidResponse.status, 400);
    assert.equal(logs.some((log) => log.event === "request_failed"), true);
    assert.equal(JSON.stringify(logs).includes("http-secret-key"), false);
  } finally {
    await drain(server);
  }
});
