import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { routeCatalog } from "../src/http/contracts/catalog.js";
import { openApiDocument } from "../src/http/contracts/openapi.js";
test("all documented HTTP operations have one domain-owned route reservation", async () => {
  const expected = new Set<string>();
  for (const file of [
    "api-contract.md",
    "docs/api/identity-wallet.md",
    "docs/api/products-builder.md",
    "docs/api/deployment-publication.md",
    "docs/api/consumer-payments.md",
  ]) {
    const content = await readFile(
      new URL(`../../${file}`, import.meta.url),
      "utf8",
    );
    for (const match of content.matchAll(
      /^\| (GET|POST|PATCH|PUT) \| `([^`]+)`/gm,
    )) {
      const path = match[2]!
        .replace(/^W(?=\/)/, "/api/v1/workspaces/{workspaceId}")
        .replaceAll("{w}", "{workspaceId}");
      if (path.startsWith("/api") || path.startsWith("/data"))
        expected.add(`${match[1]} ${path}`);
    }
  }
  const actual = routeCatalog.map((route) => `${route.method} ${route.path}`);
  assert.equal(actual.length, new Set(actual).size);
  assert.deepEqual(new Set(actual), expected);
  assert.equal(
    new Set(routeCatalog.map((route) => route.operationId)).size,
    actual.length,
  );
  for (const route of routeCatalog)
    assert.equal(
      route.audience === "creator",
      !route.path.startsWith("/api/v1/public") &&
        !route.path.startsWith("/data/") &&
        !route.path.endsWith("/app-config"),
    );
});
test("OpenAPI marks reservations and never advertises their fictional success", () => {
  const spec = openApiDocument();
  for (const route of routeCatalog) {
    const operation = spec.paths[route.path]![route.method.toLowerCase()] as {
      responses: Record<string, unknown>;
      [key: string]: unknown;
    };
    if (route.implementation === "reserved") {
      assert.equal(operation["x-sprue-implementation"], "reserved");
      assert.equal(
        Object.keys(operation.responses).some((status) =>
          status.startsWith("2"),
        ),
        false,
      );
    }
  }
});
