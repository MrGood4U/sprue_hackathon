import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  bootstrapIdentity,
  getIdentity,
} from "../src/services/api/identity.js";

const bootstrap = {
  user: { id: "10000000-0000-4000-8000-000000000001" },
  workspaces: [{ id: "10000000-0000-4000-8000-000000000002" }],
  defaultWorkspaceId: "10000000-0000-4000-8000-000000000002",
};
const envelope = {
  data: bootstrap,
  meta: { apiVersion: "1", dataSource: "live" },
};

test("identity bootstrap sends only a Privy Bearer token and an idempotent empty command", async () => {
  const data = await bootstrapIdentity({
    accessToken: "signed-provider-token",
    idempotencyKey: "test-bootstrap-key",
    apiBaseUrl: "https://api.example.test",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.example.test/api/v1/bootstrap");
      assert.equal(options.method, "POST");
      assert.equal(options.credentials, "omit");
      assert.equal(options.headers.Authorization, "Bearer signed-provider-token");
      assert.equal(options.headers["Idempotency-Key"], "test-bootstrap-key");
      assert.equal(options.body, "{}");
      assert.equal(JSON.stringify(options).includes("userId"), false);
      assert.equal(JSON.stringify(options).includes("walletAddress"), false);
      return Response.json(envelope);
    },
  });
  assert.deepEqual(data, bootstrap);
});

test("identity reads remain authenticated and reject malformed live projections", async () => {
  const data = await getIdentity({
    accessToken: "signed-provider-token",
    apiBaseUrl: "https://api.example.test",
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers.Authorization, "Bearer signed-provider-token");
      return Response.json(envelope);
    },
  });
  assert.deepEqual(data, bootstrap);
  await assert.rejects(
    getIdentity({
      accessToken: "signed-provider-token",
      apiBaseUrl: "https://api.example.test",
      fetchImpl: async () =>
        Response.json({ ...envelope, meta: { ...envelope.meta, dataSource: "demo" } }),
    }),
    /INVALID_IDENTITY_RESPONSE/,
  );
});

test("creator authentication exposes only the approved OAuth providers and redirects after bootstrap", async () => {
  const provider = await readFile(
    new URL("../src/features/auth/AuthProvider.jsx", import.meta.url),
    "utf8",
  );
  const entry = await readFile(
    new URL("../src/pages/EntryPage.jsx", import.meta.url),
    "utf8",
  );
  const login = await readFile(
    new URL("../src/pages/LoginPage.jsx", import.meta.url),
    "utf8",
  );
  const brandMarks = await readFile(
    new URL("../src/features/auth/BrandMarks.jsx", import.meta.url),
    "utf8",
  );
  const app = await readFile(
    new URL("../src/app/App.jsx", import.meta.url),
    "utf8",
  );
  assert.match(provider, /loginMethods: \["google", "github"\]/);
  assert.doesNotMatch(provider, /walletList:/);
  assert.match(provider, /createOnLogin: "off"/);
  assert.match(provider, /bootstrapIdentity\(\{ accessToken, signal \}\)/);
  assert.doesNotMatch(entry, /loginWith\(/);
  assert.match(entry, /authenticated \? "\/app" : "\/login"/);
  assert.match(entry, /t\("auth\.login"\)/);
  assert.match(entry, /t\("entry\.enterConsole"\)/);
  assert.match(login, /loginWith\("google"\)/);
  assert.match(login, /loginWith\("github"\)/);
  assert.match(login, /icon=\{GoogleBrandMark\}/);
  assert.match(login, /icon=\{GitHubBrandMark\}/);
  assert.doesNotMatch(login, /GoogleLogo|GithubLogo/);
  assert.match(brandMarks, /data:image\/png;base64/);
  assert.match(brandMarks, /fill="#ffffff"/);
  assert.doesNotMatch(login, /loginWith\("wallet"\)/);
  assert.match(login, /if \(authenticated\) navigate\("\/app"\)/);
  assert.match(login, /if \(authenticated\) return null/);
  assert.doesNotMatch(login, /auth\.signedInTitle/);
  assert.match(app, /path === "\/login"/);
  assert.match(app, /path\.startsWith\("\/app"\)/);
  assert.match(app, /<CreatorRoute/);
});
