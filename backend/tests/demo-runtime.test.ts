import assert from "node:assert/strict";
import test from "node:test";
import { parseConfig } from "../src/app/config.js";
import { createHttpApp } from "../src/http/app.js";
import { listen, drain } from "../src/app/server.js";
import { DemoRuntime } from "../src/modules/demo/runtime.js";
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
    demo: new DemoRuntime(config),
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

    const actionResponse = await fetch(`${baseUrl}/api/v1/public/demo/actions`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({action: "api_request"}),
    });
    assert.equal(actionResponse.status, 200);
    const actionBody = await actionResponse.json();
    assert.equal(actionBody.data.result.data.length, 1);
    assert.equal(actionBody.data.state.dataSource, "backend_demo");

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
