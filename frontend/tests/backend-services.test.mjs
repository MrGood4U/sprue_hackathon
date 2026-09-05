import assert from "node:assert/strict";
import test from "node:test";
import { getDemoState, runDemoAction } from "../src/services/api/demo-runtime.js";

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
      return response(state);
    },
  });
  assert.deepEqual(result, state);
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
});

test("frontend action client rejects unsupported actions and invalid backend metadata", async () => {
  await assert.rejects(runDemoAction("unsupported", {apiBaseUrl: "https://api.example.test"}), /INVALID_DEMO_ACTION/);
  await assert.rejects(getDemoState({
    apiBaseUrl: "https://api.example.test",
    fetchImpl: async () => Response.json({data: state, meta: {apiVersion: "1", dataSource: "live"}}),
  }), /INVALID_DEMO_API_RESPONSE/);
});
