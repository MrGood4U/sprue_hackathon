import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { createHttpApp } from "../src/http/app.js";
import { parseConfig, ConfigError } from "../src/app/config.js";
import { listen, drain } from "../src/app/server.js";
import { IdentityService } from "../src/modules/identity/service.js";
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
      return { subject: "test-provider-subject" };
    },
  };
  const identity = new IdentityService({
    async findBootstrap() {
      return bootstrap;
    },
    async findOwnedWorkspace(_subject, id) {
      ownerCalls++;
      return id === workspace
        ? { userStatus: "active", workspaceStatus: "active" }
        : null;
    },
  });
  const dependencies = {
    config: parseConfig(environment),
    logger: {
      write(event: LogEvent) {
        logs.push(event);
      },
    },
    identity,
    verifier,
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
      "reserved routes reject without fake acceptance and require command headers",
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
              name: "No operation accepted",
              ownerUserId: "not-accepted",
            }),
          },
        );
        assert.equal(response.status, 503);
        assert.equal(
          (await response.json()).error.code,
          "CAPABILITY_NOT_IMPLEMENTED",
        );
        const patch = await call(
          `/api/v1/workspaces/${workspace}/products/${user}`,
          { method: "PATCH", headers: jsonHeaders, body: "{}" },
        );
        assert.equal(patch.status, 428);
        assert.equal(
          (
            await call(
              `/api/v1/workspaces/${workspace}/products/${user}/build-preflight`,
              {
                method: "POST",
                headers: { ...auth, "Content-Type": "application/json" },
                body: "{}",
              },
            )
          ).status,
          503,
        );
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
  for (const changes of [
    { PORT: "0" },
    { DATABASE_URL: "" },
    { CORS_ALLOWED_ORIGINS: "*" },
    { API_BASE_URL: "https://user:password@example.test" },
    { DEPLOYMENT_ENVIRONMENT: "demo" },
    { API_BASE_URL: "https://example.test/?secret=value" },
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
