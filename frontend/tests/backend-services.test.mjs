import assert from "node:assert/strict";
import test from "node:test";
import {
  getDemoModelProfile,
  getDemoState,
  runDemoAction,
  saveDemoModelProfile,
  testDemoModelProfile,
} from "../src/services/api/demo-runtime.js";

const state = {
  dataSource: "backend_demo",
  product: { draft: {} },
};

function response(data) {
  return Response.json({data, meta: {apiVersion: "1", dataSource: "demo"}});
}

test("frontend requests backend demo state without a fixture fallback", async () => {
  const result = await getDemoState({
    apiBaseUrl: "http://127.0.0.1:3001",
    fetchImpl: async (url, options) => {
      assert.equal(url, "http://127.0.0.1:3001/api/v1/public/demo/state");
      assert.equal(options.method, "GET");
      assert.equal(options.credentials, "omit");
      assert.match(options.headers["X-Sprue-Demo-Session"], /^[0-9a-f-]{36}$/i);
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
      assert.equal(url, "https://api.example.test/api/v1/public/demo/model-profile");
      assert.equal(options.method, "PUT");
      assert.equal(JSON.parse(options.body).apiKey, "browser-input-only");
      assert.match(options.headers["X-Sprue-Demo-Session"], /^[0-9a-f-]{36}$/i);
      return response(profile);
    },
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
      assert.equal(url, "https://api.example.test/api/v1/public/demo/model-profile/test");
      assert.equal(options.method, "POST");
      assert.equal(JSON.parse(options.body).apiKey, "browser-input-only");
      return response({
        available: true,
        protocol: "openai_compatible_chat_completions",
        model: profile.model,
        latencyMs: 18,
      });
    },
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
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, "GET");
      return response(profile);
    },
  });
  assert.deepEqual(loaded, profile);
});

test("frontend action client sends strict backend actions and returns server state", async () => {
  const result = await runDemoAction("agent_plan", {
    apiBaseUrl: "https://api.example.test",
    intent: "Find wallets across two chains.",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.example.test/api/v1/public/demo/actions");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), {
        action: "agent_plan",
        intent: "Find wallets across two chains.",
      });
      return response({state, result: {data: []}});
    },
  });
  assert.deepEqual(result.state, state);
  assert.deepEqual(result.result, {data: []});

  await runDemoAction("api_request", {
    apiBaseUrl: "https://api.example.test",
    parameters: {limit: 100},
    fetchImpl: async (_url, options) => {
      assert.deepEqual(JSON.parse(options.body), {
        action: "api_request",
        parameters: {limit: 100},
      });
      return response({state, result: {data: [], meta: {returnedRows: "0"}}});
    },
  });
});

test("frontend action client rejects unsupported actions and invalid backend metadata", async () => {
  await assert.rejects(runDemoAction("unsupported", {apiBaseUrl: "https://api.example.test"}), /INVALID_DEMO_ACTION/);
  await assert.rejects(getDemoState({
    apiBaseUrl: "https://api.example.test",
    fetchImpl: async () => Response.json({data: state, meta: {apiVersion: "1", dataSource: "live"}}),
  }), /INVALID_DEMO_API_RESPONSE/);
});
