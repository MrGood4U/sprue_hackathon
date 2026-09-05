import assert from "node:assert/strict";
import test from "node:test";
import { demoServices } from "../src/services/demo/demoServices.js";

test("canceling a build rejects instead of reporting a completed run", async () => {
  const controller = new AbortController();
  const run = demoServices.buildVersion({ signal: controller.signal });
  controller.abort();
  await assert.rejects(run, { name: "AbortError" });
});

test("a canceled consumer request emits no further progress", async () => {
  const controller = new AbortController();
  const stages = [];
  const run = demoServices.requestPaidData({
    signal: controller.signal,
    onProgress: (stage) => {
      stages.push(stage);
      controller.abort();
    },
  });
  await assert.rejects(run, { name: "AbortError" });
  assert.deepEqual(stages, [1]);
});

test("request results cannot mutate the fixtures used by another request", async () => {
  const first = await demoServices.testRequest();
  first.data[0].protocol = "Changed by caller";
  const second = await demoServices.testRequest();
  assert.equal(second.data[0].protocol, "Aerodrome");
});

test("consumer progress completes in order and returns a sample response", async () => {
  const stages = [];
  const response = await demoServices.requestPaidData({ onProgress: (stage) => stages.push(stage) });
  assert.deepEqual(stages, [1, 2, 3, 4]);
  assert.equal(response.payment.network, "hedera:testnet");
  assert.equal(response.data.length, 2);
});
