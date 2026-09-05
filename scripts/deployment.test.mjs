import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (name) =>
  readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("complete Compose topology isolates secrets, worker and durable database", () => {
  // Configuration parsing only. Never start or migrate a real database in this test.
  const config = JSON.parse(
    execFileSync(
      "docker",
      [
        "compose",
        "-p",
        "sprue-local",
        "--env-file",
        ".env.local.example",
        "-f",
        "compose.yaml",
        "--profile",
        "tools",
        "config",
        "--format",
        "json",
      ],
      {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        env: {
          ...process.env,
          POSTGRES_PASSWORD: "a".repeat(64),
          POSTGRES_PORT: "15432",
          API_PORT: "3001",
          FRONTEND_PORT: "4173",
        },
      },
    ),
  );
  const { api, worker, postgres, frontend, migrate } = config.services;
  assert.equal(config.name, "sprue-local");
  assert.equal(api.image, worker.image);
  assert.equal(migrate.image, api.image);
  assert.equal(worker.ports, undefined);
  for (const service of [api, postgres, frontend])
    assert.equal(service.ports[0].host_ip, "127.0.0.1");
  assert.equal(postgres.volumes[0].type, "volume");
  assert.equal(
    frontend.build.args.VITE_API_BASE_URL,
    api.environment.API_BASE_URL,
  );
  assert.equal(
    api.environment.CORS_ALLOWED_ORIGINS,
    api.environment.CONSOLE_PUBLIC_URL,
  );
  assert.equal(new URL(api.environment.DATABASE_URL).hostname, "postgres");
  assert.equal(frontend.environment, undefined);
  assert.deepEqual(migrate.command, ["node", "dist/scripts/migrate.js"]);
  assert.deepEqual(migrate.profiles, ["tools"]);
  assert.equal(api.command ?? null, null);
  assert.deepEqual(worker.command, ["node", "dist/src/app/worker.js"]);
});

test("cloud manifests share source builds and separate migration from worker startup", () => {
  const api = JSON.parse(read("backend/railway.api.json"));
  const worker = JSON.parse(read("backend/railway.worker.json"));
  const frontend = JSON.parse(read("frontend/vercel.json"));
  assert.deepEqual(api.build, worker.build);
  assert.deepEqual(api.deploy.preDeployCommand, [
    "node dist/scripts/migrate.js",
  ]);
  assert.equal(worker.deploy.preDeployCommand, undefined);
  assert.equal(api.deploy.healthcheckPath, "/readyz");
  assert.equal(worker.deploy.healthcheckPath, "/readyz");
  assert.equal(frontend.outputDirectory, "dist/client");
  assert.equal(frontend.buildCommand, "npm run build:app");
  assert.deepEqual(
    frontend.rewrites.map((entry) => entry.source),
    ["/app/:path*", "/p/:path*"],
  );
  assert.equal(frontend.env, undefined);
});

test("packaging preserves Sites outputs and excludes local environment files", () => {
  const frontend = JSON.parse(read("frontend/package.json"));
  assert.match(frontend.scripts.build, /test:builder/);
  assert.match(frontend.scripts["build:app"], /prepare-sites-build/);
  assert.match(read("frontend/.dockerignore"), /^\*/);
  assert.doesNotMatch(read("frontend/.dockerignore"), /!\.env/);
  assert.match(
    read("frontend/Dockerfile"),
    /COPY --from=build \/app\/dist\/client/,
  );
  assert.match(read(".gitignore"), /^\.env.local$/m);
  assert.match(read("scripts/local.ps1"), /FileMode\]::CreateNew/);
  assert.doesNotMatch(
    read("scripts/local.ps1"),
    /down.*--volumes|volume\s+rm|docker\s+system\s+prune|Set-ExecutionPolicy/,
  );
});
