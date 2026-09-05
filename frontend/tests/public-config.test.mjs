import test from "node:test";
import assert from "node:assert/strict";
import {
  parseApiBaseUrl,
  getPublicAppConfig,
} from "../src/services/api/public-config.js";

test("public API configuration accepts local or HTTPS origins without leaking URL secrets", () => {
  assert.equal(
    parseApiBaseUrl("http://127.0.0.1:3001/"),
    "http://127.0.0.1:3001",
  );
  assert.equal(
    parseApiBaseUrl("https://api.example.test"),
    "https://api.example.test",
  );
  assert.equal(parseApiBaseUrl(""), null);
  for (const value of [
    "bad",
    "https://user:secret@example.test",
    "https://example.test?key=secret",
    "http://example.test",
    "https://example.test/api",
    "https://example.test/#secret",
  ]) {
    assert.throws(
      () => parseApiBaseUrl(value),
      /^Error: INVALID_PUBLIC_API_URL$/,
    );
  }
});

test("public configuration uses a read-only credential-free request and no fixture fallback", async () => {
  const payload = { data: { apiVersion: "1" }, meta: { dataSource: "live" } };
  const result = await getPublicAppConfig({
    apiBaseUrl: "https://api.example.test",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.example.test/api/v1/app-config");
      assert.equal(options.credentials, "omit");
      assert.equal(options.redirect, "error");
      assert.equal(options.method, "GET");
      return Response.json(payload);
    },
  });
  assert.deepEqual(result, payload);
  await assert.rejects(
    getPublicAppConfig({ apiBaseUrl: "" }),
    /PUBLIC_API_NOT_CONFIGURED/,
  );
  await assert.rejects(
    getPublicAppConfig({
      apiBaseUrl: "https://api.example.test",
      fetchImpl: async () => new Response(null, { status: 503 }),
    }),
    /PUBLIC_API_UNAVAILABLE/,
  );
  await assert.rejects(
    getPublicAppConfig({
      apiBaseUrl: "https://api.example.test",
      fetchImpl: async () =>
        Response.json({
          data: { apiVersion: "1" },
          meta: { dataSource: "demo" },
        }),
    }),
    /INVALID_PUBLIC_API_RESPONSE/,
  );
});
