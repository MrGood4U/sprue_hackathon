import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);
const expectedPages = [
  "AgentPage.jsx",
  "ApiDeploymentPage.jsx",
  "DashboardPage.jsx",
  "EntryPage.jsx",
  "ModelServicePage.jsx",
  "MonetizationRevenuePage.jsx",
  "ProductBuilderPage.jsx",
  "PublicProductPage.jsx",
  "WalletAccessPage.jsx",
];

test("keeps one route-level page implementation per page file", async () => {
  const pagesUrl = new URL("pages/", sourceRoot);
  const pageFiles = (await readdir(pagesUrl)).filter((file) => file.endsWith("Page.jsx")).sort();
  assert.deepEqual(pageFiles, expectedPages);

  for (const file of pageFiles) {
    const source = await readFile(new URL(file, pagesUrl), "utf8");
    const exports = source.match(/export function \w+Page\b/g) ?? [];
    assert.equal(exports.length, 1, `${file} must own exactly one exported route-level page.`);
  }
});

test("keeps page implementations out of application composition", async () => {
  const appSource = await readFile(new URL("app/App.jsx", sourceRoot), "utf8");
  const shellSource = await readFile(new URL("app/AppShell.jsx", sourceRoot), "utf8");

  assert.doesNotMatch(appSource, /export function \w+Page\b/);
  assert.doesNotMatch(shellSource, /export function \w+Page\b/);
  await assert.rejects(access(new URL("App.jsx", sourceRoot)));
});
