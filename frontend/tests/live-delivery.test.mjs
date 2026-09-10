import assert from "node:assert/strict";
import test from "node:test";
import {getProductDelivery} from "../src/services/api/delivery.js";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const productId = "10000000-0000-4000-8000-000000000002";

function liveBody(dataSource = "live") {
  return {
    meta: {apiVersion: "1", dataSource, observedAt: "2026-09-09T00:00:00.000Z"},
    data: {
      productId,
      capabilities: {deploy: false, privateRequest: false, privateExport: false, publishX402: false, publicRequest: false},
      api: {readiness: "no_version", blockers: [], latestVersion: null, activeVersion: null, deployment: null, contract: null},
      monetization: {readiness: "api_not_ready", blockers: [], publication: null, revenue: {grossSales: [], creatorProceeds: [], providerFees: []}, sales: []},
    },
  };
}

test("reads the owner-authorized live delivery projection", async () => {
  let request;
  const result = await getProductDelivery(productId, {
    apiBaseUrl: "http://127.0.0.1:3001",
    workspaceId,
    accessToken: "creator-token",
    fetchImpl: async (url, options) => {
      request = {url, options};
      return new Response(JSON.stringify(liveBody()), {status: 200, headers: {"content-type": "application/json"}});
    },
  });

  assert.equal(request.url, `http://127.0.0.1:3001/api/v1/workspaces/${workspaceId}/products/${productId}/delivery`);
  assert.equal(request.options.headers.Authorization, "Bearer creator-token");
  assert.equal(request.options.cache, "no-store");
  assert.equal(result.delivery.api.readiness, "no_version");
});

test("rejects a demo delivery payload instead of falling back", async () => {
  await assert.rejects(
    getProductDelivery(productId, {
      apiBaseUrl: "http://127.0.0.1:3001",
      workspaceId,
      accessToken: "creator-token",
      fetchImpl: async () => new Response(JSON.stringify(liveBody("demo")), {status: 200}),
    }),
    /INVALID_DELIVERY_API_RESPONSE/,
  );
});
