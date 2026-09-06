import assert from "node:assert/strict";
import test from "node:test";
import { parseConfig } from "../src/app/config.js";
import { createHttpApp } from "../src/http/app.js";
import { listen, drain } from "../src/app/server.js";
import { DemoRuntime } from "../src/modules/demo/runtime.js";
import { createMockMvpProposal } from "../src/modules/agent/harness/mock-model.js";
import type { AgentModelConfig, AgentModelPort } from "../src/modules/agent/harness/types.js";
import { IdentityService } from "../src/modules/identity/service.js";
import { unavailableIdentity } from "../src/integrations/unavailable-identity.js";
import type { LogEvent } from "../src/shared/logger.js";

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
const sessionId = "7ff7ec9e-1bc4-48ae-bac1-e7703d021834";

test("backend demo runtime returns the harness proposal and cross-chain output", async () => {
  const config = parseConfig(environment);
  const state = await new DemoRuntime(config).getState();
  assert.equal(state.dataSource, "backend_demo");
  assert.equal(state.product.slug, "cross-chain-dex-trader-footprint");
  assert.equal(state.agent.status, "ready_for_review");
  assert.equal(state.agent.trace.length, 9);
  assert.equal(state.product.draft.specification.dag.nodes.length, 11);
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

  const request = await new DemoRuntime(config).run({action: "api_request", parameters: {limit: 1}});
  assert.equal((request.result.data as readonly unknown[]).length, 1);
  assert.equal((request.result.meta as Record<string, unknown>).returnedRows, "1");
});

test("session model profiles never echo keys and drive the next Agent plan", async () => {
  const config = parseConfig(environment);
  const observedConfigs: AgentModelConfig[] = [];
  const testedConfigs: AgentModelConfig[] = [];
  const modelFactory = (modelConfig: AgentModelConfig): AgentModelPort => {
    observedConfigs.push(modelConfig);
    return {
      async complete(request) {
        return {
          provider: modelConfig.mode,
          model: modelConfig.model,
          output: createMockMvpProposal(request.intent),
        };
      },
    };
  };
  const runtime = new DemoRuntime(config, modelFactory, async (modelConfig) => {
    testedConfigs.push(modelConfig);
    return {
      available: true,
      protocol: "openai_compatible_chat_completions",
      model: modelConfig.model,
      latencyMs: 12,
    };
  });
  const saved = runtime.saveModelProfile(sessionId, {
    apiUrl: "https://models.example/v1/chat/completions",
    apiKey: "session-secret-key",
    model: "judge-model",
  });
  assert.equal(saved.hasApiKey, true);
  assert.equal(JSON.stringify(saved).includes("session-secret-key"), false);

  const tested = await runtime.testModelProfile(sessionId, {
    apiUrl: "https://probe.example/v1/chat/completions",
    model: "probe-model",
  });
  assert.equal(tested.model, "probe-model");
  assert.equal(testedConfigs.at(-1)?.apiKey, "session-secret-key");
  assert.equal(runtime.getModelProfile(sessionId).model, "judge-model");

  const result = await runtime.run({action: "agent_plan", intent: "Find cross-chain traders."}, sessionId);
  assert.equal(result.state.agent.provider, "remote");
  assert.equal(result.state.agent.model, "judge-model");
  assert.equal(observedConfigs.at(-1)?.apiUrl, "https://models.example/v1/chat/completions");
  assert.equal(observedConfigs.at(-1)?.apiKey, "session-secret-key");
});

test("enabled demo HTTP routes are the only frontend business-data boundary in this slice", async () => {
  const config = parseConfig(environment);
  const logs: LogEvent[] = [];
  const app = createHttpApp({
    config,
    logger: {write(event) { logs.push(event); }},
    verifier: unavailableIdentity,
    identity: new IdentityService({
      async findBootstrap() { return null; },
      async findOwnedWorkspace() { return null; },
    }),
    demo: new DemoRuntime(config, undefined, async (modelConfig) => ({
      available: true,
      protocol: "openai_compatible_chat_completions",
      model: modelConfig.model,
      latencyMs: 9,
    })),
    ready: async () => true,
    stopping: () => false,
  });
  const server = await listen(app, "127.0.0.1", 0);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const stateResponse = await fetch(`${baseUrl}/api/v1/public/demo/state`);
    assert.equal(stateResponse.status, 200);
    const stateBody = await stateResponse.json();
    assert.equal(stateBody.meta.dataSource, "demo");
    assert.equal(stateBody.data.dataSource, "backend_demo");

    const unconfiguredProfile = await fetch(`${baseUrl}/api/v1/public/demo/model-profile`, {
      headers: {"X-Sprue-Demo-Session": sessionId},
    });
    assert.equal(unconfiguredProfile.status, 200);
    assert.equal((await unconfiguredProfile.json()).data.configured, false);

    const savedProfile = await fetch(`${baseUrl}/api/v1/public/demo/model-profile`, {
      method: "PUT",
      headers: {"Content-Type": "application/json", "X-Sprue-Demo-Session": sessionId},
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

    const testedProfile = await fetch(`${baseUrl}/api/v1/public/demo/model-profile/test`, {
      method: "POST",
      headers: {"Content-Type": "application/json", "X-Sprue-Demo-Session": sessionId},
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
      body: JSON.stringify({action: "api_request", parameters: {limit: 1}}),
    });
    assert.equal(actionResponse.status, 200);
    const actionBody = await actionResponse.json();
    assert.equal(actionBody.data.result.data.length, 1);
    assert.equal(actionBody.data.result.meta.returnedRows, "1");
    assert.equal(actionBody.data.state.dataSource, "backend_demo");

    const invalidLimitResponse = await fetch(`${baseUrl}/api/v1/public/demo/actions`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({action: "api_request", parameters: {limit: 1001}}),
    });
    assert.equal(invalidLimitResponse.status, 400);

    const planResponse = await fetch(`${baseUrl}/api/v1/public/demo/actions`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({action: "agent_plan", intent: "Find cross-chain traders."}),
    });
    assert.equal(planResponse.status, 200);
    const planBody = await planResponse.json();
    assert.equal(planBody.data.result.status, "ready_for_review");
    assert.equal(planBody.data.state.product.intent, "Find cross-chain traders.");

    const invalidResponse = await fetch(`${baseUrl}/api/v1/public/demo/actions`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({action: "build", parameters: {windowDays: 7}}),
    });
    assert.equal(invalidResponse.status, 400);
    assert.equal(logs.some((log) => log.event === "request_failed"), true);
  } finally {
    await drain(server);
  }
});
