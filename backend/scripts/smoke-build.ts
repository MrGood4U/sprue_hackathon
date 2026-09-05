import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
// Import build output dynamically without allowing TypeScript to re-emit it as input.
const output = new URL("../dist/", import.meta.url);
const { startRuntime } = await import(
  new URL("src/app/runtime.js", output).href
);
const { parseConfig } = await import(new URL("src/app/config.js", output).href);
const config = parseConfig({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:1/unavailable",
  API_BASE_URL: "http://127.0.0.1:3001",
  CONSOLE_PUBLIC_URL: "http://127.0.0.1:4173",
  DATA_PUBLIC_BASE_URL: "http://127.0.0.1:3001/data/v1",
  CORS_ALLOWED_ORIGINS: "http://127.0.0.1:4173",
});
for (const role of ["api", "worker"] as const) {
  const events: unknown[] = [];
  const runtime = await startRuntime(
    { ...config, port: 0, workerPort: 0 },
    role,
    {
      write(event: unknown) {
        events.push(event);
      },
    },
  );
  try {
    const address = runtime.server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(url + "/healthz")).status, 200);
    assert.equal((await fetch(url + "/readyz")).status, 503);
    assert.equal(
      (await fetch(url + "/api/v1/app-config")).status,
      role === "api" ? 200 : 404,
    );
    if (role === "api")
      assert.equal(
        (
          await fetch(url + "/api/v1/me", {
            headers: { Authorization: "Bearer not-a-real-token" },
          })
        ).status,
        503,
      );
  } finally {
    await Promise.all([runtime.stop(), runtime.stop()]);
  }
  assert.equal(runtime.server.listening, false);
  console.log(
    `Compiled ${role} startup, unavailable-DB readiness and idempotent shutdown passed.`,
  );
}
const source = new URL("../migrations/", import.meta.url);
for (const name of await readdir(source)) {
  const digest = (buffer: Buffer) =>
    createHash("sha256").update(buffer).digest("hex");
  assert.equal(
    digest(await readFile(new URL(name, source))),
    digest(await readFile(new URL(`migrations/${name}`, output))),
  );
}
assert.equal((await readdir(output)).includes("tests"), false);
console.log("Build contains unchanged migration assets and no test output.");
